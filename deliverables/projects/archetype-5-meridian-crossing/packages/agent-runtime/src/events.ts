import type { Request, Response } from "express";

/**
 * The per-organization event stream that makes the invisible visible, WITHOUT a god view. Each
 * process owns exactly one `EventHub`, fed by its own append-only trail (see `openTrail`), and serves
 * it over SSE at `GET /events`. The dashboard opens one connection per org and reconstructs the story
 * by `correlationId` — it never reads a shared feed, because there isn't
 * one. The hub is an in-process fan-out of THIS org's trail records; it is not a bus between orgs.
 */

export interface HubRecord {
  /** Monotonic per-hub sequence — doubles as the SSE event id for reconnection. */
  seq: number;
  /** Which org emitted it (buyer/summit/alpine/ridge) — stamped once, at hub creation. */
  org: string;
  /** The trail record itself (already carries `at` + its own fields). */
  rec: Record<string, unknown>;
}

export interface EventHub {
  readonly org: string;
  /** Append a trail record to history and notify every live subscriber. */
  publish(rec: Record<string, unknown>): void;
  /** Every record so far — replayed to a late-joining dashboard on connect. */
  history(sinceSeq?: number): HubRecord[];
  /** Subscribe to new records; returns an unsubscribe function. */
  subscribe(fn: (r: HubRecord) => void): () => void;
}

export function makeEventHub(org: string): EventHub {
  const records: HubRecord[] = [];
  const subs = new Set<(r: HubRecord) => void>();
  return {
    org,
    publish(rec): void {
      const entry: HubRecord = { seq: records.length, org, rec };
      records.push(entry);
      for (const fn of subs) {
        try {
          fn(entry);
        } catch {
          /* a slow/broken subscriber must not break the publisher */
        }
      }
    },
    history(sinceSeq = -1): HubRecord[] {
      return sinceSeq < 0 ? [...records] : records.filter((r) => r.seq > sinceSeq);
    },
    subscribe(fn): () => void {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/**
 * An Express handler that streams a hub over Server-Sent Events. On connect it replays history (so a
 * dashboard opened mid-run catches up), honouring `Last-Event-ID` for reconnection, then forwards
 * every new record live. A periodic comment keeps the connection warm through proxies.
 */
export function sseHandler(hub: EventHub) {
  return (req: Request, res: Response): void => {
    // No `access-control-allow-origin: *` here. The dashboard reaches every stream through its own
    // same-origin reverse proxy, so the wildcard bought nothing — but it let ANY page the operator
    // happened to visit read this org's whole trail cross-origin, including the buyer's
    // `commit-selection` record, which names every competing supplier's best-and-final terms.
    // Same-origin is the default; we add nothing. (Matches the buyer control server's stance.)
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    res.write(`retry: 1000\n\n`);

    // An EMPTY or whitespace-only `last-event-id` means "no resume point", not sequence 0. `Number("")`
    // and `Number(" ")` are both 0 and pass `isFinite`, so a client sending the header blank — which a
    // proxy or a reconnect before the first event can do — resumed from seq 0 and silently skipped the
    // very first record instead of replaying the whole trail.
    const raw = req.headers["last-event-id"];
    const header = Array.isArray(raw) ? raw[0] : raw;
    const lastId = header !== undefined && header.trim() !== "" ? Number(header) : Number.NaN;
    const since = Number.isFinite(lastId) ? lastId : -1;

    // `org` LAST, so the hub's own label always wins. Spread first, the trail record could carry its
    // own `org` key and overwrite it — and every consumer treats this field as the authoritative
    // statement of which organization published the record. The dashboard keys attribution off it, so
    // a record naming a different org would put that org's name on another's message: precisely the
    // cross-org confusion the one-stream-per-org design exists to make impossible. The hub knows who it
    // is; a record it is merely carrying does not get a vote.
    const payload = (r: HubRecord): string => JSON.stringify({ ...r.rec, org: r.org });

    // Backpressure. `res.write` returning false means the socket's send buffer is full, and for a
    // consumer that has stopped reading, ignoring that grows an unbounded queue inside Node.
    //
    // The response is ENDED rather than throttled. Skipping records while backed up looked cheaper but
    // is wrong twice: the client is left connected and silently missing events with no signal that it
    // fell behind, and a stream that never recovers is held open forever. Ending is the honest move
    // BECAUSE the trail is replayable — `last-event-id` resumes from any seq, so a dropped client
    // reconnects and `hub.history(since)` hands back exactly what it missed. Losing the connection
    // costs a reconnect; losing events silently corrupts the story the dashboard is telling.
    let closed = false;
    const drop = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    };

    /** Write one frame; drop the client if the socket cannot take it. */
    const writeFrame = (frame: string): void => {
      if (closed) return;
      if (!res.write(frame)) drop();
    };

    const send = (r: HubRecord): void => {
      // One write, not two: an id line written separately could land while the data line is refused,
      // leaving a truncated frame on the wire and desynchronising the client's last-event-id.
      writeFrame(`id: ${r.seq}\ndata: ${payload(r)}\n\n`);
    };

    // `unsubscribe`/`keepAlive` are initialised BEFORE any record is written, because `drop` closes over
    // both and history replay can trigger it — a slow client can back the socket up during replay, and
    // `drop` would otherwise run against uninitialised bindings.
    const unsubscribe = hub.subscribe(send);
    const keepAlive = setInterval(() => {
      // A ping doubles as the liveness probe: if even this cannot be written, the peer is gone or
      // wedged, and holding the subscription open leaks a listener per dead connection.
      writeFrame(`: ping\n\n`);
    }, 15000);

    for (const r of hub.history(since)) send(r);

    // "close" is not the only way a stream ends. A socket that ERRORS — reset by the peer, killed by an
    // intermediary, failed mid-write — may emit "error" without a "close" that reaches this handler, and
    // then nothing ever ran `drop`: the keep-alive interval kept firing and the hub kept a subscriber for
    // a connection that no longer exists, leaking a listener and a timer per dead client for the lifetime
    // of the process. `writeFrame` only notices a refusal it observes SYNCHRONOUSLY; an asynchronous write
    // failure surfaces here instead.
    //
    // Both ends are wired because either can be the one to report it, and `drop` is idempotent (the
    // `closed` guard), so overlapping close/error events collapse into a single cleanup.
    req.on("close", drop);
    req.on("error", drop);
    res.on("error", drop);
  };
}
