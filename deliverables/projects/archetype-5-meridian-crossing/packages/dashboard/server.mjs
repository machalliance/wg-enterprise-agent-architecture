import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { basename, dirname, extname, join, normalize, sep } from "node:path";

// The stage-prop dashboard server. No framework, no build step: it serves one HTML file AND
// REVERSE-PROXIES every per-org event stream and buyer control call, so the browser only ever talks to
// THIS origin. That is what makes the demo work on a remote host or in a container/micro-VM: expose ONE
// port (this one) and the agents stay internal — the browser never needs to reach 41001-41003/41100
// directly, and there is no cross-origin problem. The "no god view" property is unchanged: each stream
// is still that org's OWN trail; the dashboard just forwards four independent connections.
//
// Because this is the ONE published port, it is also the trust boundary: it is protected with HTTP
// Basic Auth (DASHBOARD_USER / DASHBOARD_PASS). The buyer's control token is a SEPARATE, internal
// secret the proxy injects ONLY on the buyer's state-changing routes — never on a supplier stream.

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "public");
/**
 * Read a port from the environment, failing loudly on anything that is not a real port.
 *
 * `Number(...)` alone turned `PORT=""` into 0 and `PORT=abc` into NaN, and both are accepted by
 * `listen()`: 0 binds an ARBITRARY free port, so the dashboard silently came up somewhere other than
 * where the operator published, and a NaN agent port produced connection failures reported as "agent not
 * reachable" — sending you to debug the agent instead of the typo. Matches `supplierPort`'s contract in
 * agent-runtime, including treating empty as unset.
 */
function port(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${name} must be an integer in 1-65535, got '${raw}'`);
  }
  return n;
}

const PORT = port("DASHBOARD_PORT", 41200);

// Where each agent actually listens (inside the VM). Overridable, but the browser never sees these.
const AGENTS = {
  buyer: port("BUYER_HTTP_PORT", 41100),
  summit: port("SUMMIT_PORT", 41001),
  cascade: port("CASCADE_PORT", 41004),
  alpine: port("ALPINE_PORT", 41002),
  ridge: port("RIDGE_PORT", 41003),
};
// Use the IPv4 loopback literal, NOT "localhost": Node's http client may resolve "localhost" to the
// IPv6 ::1 first, but the agents listen on IPv4 — so "localhost" here can fail to connect even though
// curl (which tries both families) reaches them fine.
const AGENT_HOST = process.env.AGENT_HOST ?? "127.0.0.1";
// Shared secret for the buyer's state-changing control endpoints. The browser never holds it; the proxy
// injects it so a direct, un-proxied caller to the buyer port cannot trip the kill switch. Must match
// the buyer's CONTROL_TOKEN. Empty = the buyer runs unauthenticated (dev default).
const CONTROL_TOKEN = process.env.CONTROL_TOKEN ?? "";
// HTTP Basic Auth for the dashboard itself (this is the published port). Empty password = open, with a
// startup warning — the zero-config demo default; set DASHBOARD_PASS to require a login.
const DASH_USER = process.env.DASHBOARD_USER ?? "operator";
const DASH_PASS = process.env.DASHBOARD_PASS ?? "";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
};

/** The buyer control token is injected ONLY on the buyer's STATE-CHANGING routes. Read routes and — the
 *  point of the fix — the supplier event streams must never receive it, or the buyer's control secret
 *  would leak to the supplier processes it is meant to be protected from. */
// The same-origin marker the dashboard's own fetches attach to state-changing requests. Any fixed,
// non-CORS-safelisted header works — its presence forces a preflight for cross-origin callers (which
// this server never allows), so only same-origin requests get through. Value itself is not a secret.
export const REQUEST_MARKER = "meridian-dashboard";

/** The STATE-CHANGING route set — the only routes that need the CSRF marker (a GET cannot change state). */
export function requiresRequestMarker(path) {
  return (
    path === "/start" ||
    path === "/kill" ||
    /^\/approvals\/[^/]+\/(approve|reject)$/.test(path) ||
    /^\/settlement\/[^/]+\/(approve-funding|reject-funding|refresh)$/.test(path)
  );
}

/**
 * Routes that need the buyer's control token.
 *
 * THE BUYER'S FULL ROUTE TABLE, so this stops being rediscovered one endpoint at a time:
 *
 *   state-changing (token, + CSRF marker)  /start, /kill, /approvals/:id/approve|reject
 *   money-moving   (token, FAILS CLOSED)   /settlement/:id/approve-funding|reject-funding|refresh
 *   control reads  (token)                 /audit, /record, /settlement, /state, /approvals
 *   buyer stream   (token)                 /events/buyer — the buyer's trail carries commit-selection,
 *                                                     which names every rival's best-and-final
 *   supplier streams (OPEN)                /events/{summit,cascade,alpine,ridge} — each org's OWN
 *                                                     trail. NOT gated with this token: it is the
 *                                                     buyer's secret, and giving it to a counterparty
 *                                                     process would hand over the kill switch. Closing
 *                                                     these needs a per-agent credential.
 *
 * Every READ in that third group returns something about a counterparty: agreed commercial terms,
 * message history, payment amounts and deposit addresses, per-deal outcomes, or the pending-approval
 * queue. Served open, any process that can reach the buyer over loopback — a rival SUPPLIER agent, in
 * this very demo — reads the buyer's record of someone else's deal. That is the boundary `reconcile()`
 * was deleted for; an open read endpoint reopened it. They were found one per review round precisely
 * because "it's only a GET" reads as harmless, so the rule is now stated positively: on this server a
 * read is gated unless it is an org's own event stream.
 *
 * Deliberately NOT coupled to `requiresRequestMarker`: the reads are idempotent GETs, so CSRF is not the
 * threat and demanding a same-origin header would only break `curl`-ing the documented audit export.
 * Authentication is the control here; the dashboard's own gate is Basic Auth.
 */
const TOKENED_READS = new Set(["/audit", "/record", "/settlement", "/state", "/approvals", "/events/buyer"]);

export function shouldInjectControlToken(path) {
  return requiresRequestMarker(path) || TOKENED_READS.has(path);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Validate an Authorization header against the configured Basic credentials. Open (true) when no
 *  password is configured — the demo default. Constant-time compare so it is not a timing oracle. */
export function checkBasicAuth(authHeader, user, pass) {
  if (!pass) return true;
  if (typeof authHeader !== "string" || !authHeader.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  // BOTH compares always run — `&&` would short-circuit on a wrong username and skip the password
  // compare entirely, so the response time would reveal whether the username was right. That is the
  // exact oracle `safeEqual` exists to remove, reintroduced one level up by the boolean operator.
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass);
  return userOk && passOk;
}

/**
 * How long a NON-STREAMING upstream call may take before the proxy gives up. SSE is exempt — an event
 * stream is idle by design and must never be timed out. Without this a hung agent held the browser
 * request open forever, and each one pinned a socket on both sides.
 */
const UPSTREAM_TIMEOUT_MS = 30_000;

/** Pipe a request through to an agent port and stream the response back (works for SSE and JSON alike). */
function proxy(clientReq, clientRes, port, path, injectToken = false, { stream = false } = {}) {
  const headers = { ...clientReq.headers, host: `${AGENT_HOST}:${port}` };
  // The dashboard's own Basic-Auth credential must NEVER be forwarded to an agent — strip it before
  // proxying, or the agents receive the operator's dashboard password on every request.
  delete headers.authorization;
  // Never forward a client-supplied control token (a browser must not be able to smuggle one), and only
  // add ours on the buyer's state-changing routes — so it never reaches a supplier stream or a read route.
  delete headers["x-control-token"];
  if (injectToken && CONTROL_TOKEN) headers["x-control-token"] = CONTROL_TOKEN;
  const upstream = httpRequest(
    { host: AGENT_HOST, port, path, method: clientReq.method, headers },
    (up) => {
      // Strip the security headers from the UPSTREAM response before merging it. `writeHead(status,
      // headers)` lets the passed object win over anything already set with `setHeader`, so an agent
      // response carrying its own `content-security-policy` or `x-frame-options` silently replaced the
      // ones `setSecurityHeaders` put on this response — on the page that holds the kill switch. The
      // agents do not send these today; the point is that the proxy must not let them decide. The
      // dashboard owns its own framing policy for every response it emits, proxied or not.
      const forwarded = { ...up.headers };
      for (const name of Object.keys(SECURITY_HEADERS)) delete forwarded[name];
      clientRes.writeHead(up.statusCode ?? 502, forwarded);
      up.pipe(clientRes);
    },
  );
  // A non-streaming upstream that goes quiet is a failure; an SSE one is just waiting for an event.
  if (!stream) {
    upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => upstream.destroy(new Error("upstream timeout")));
  }
  upstream.on("error", () => {
    // Once the response has begun streaming, the status line is already on the wire and there is no
    // way to turn it into a 502 — the only honest signal left is to break the connection so the client
    // sees a truncated response rather than a body that looks complete. The old code wrote the error
    // JSON regardless, APPENDING it to whatever had already been sent: a client reading a half-streamed
    // payload got valid-looking data with an error object glued onto the end.
    if (clientRes.headersSent) {
      clientRes.destroy();
      return;
    }
    clientRes.writeHead(502, { "content-type": "application/json" });
    clientRes.end(JSON.stringify({ ok: false, error: "agent not reachable" }));
  });
  // SSE connections are long-lived: tear the upstream down when the BROWSER's response closes. (Keying
  // this off the request stream would fire the instant a bodyless GET is read — killing it mid-flight.)
  clientRes.on("close", () => upstream.destroy());
  clientReq.pipe(upstream);
}

/**
 * Anti-framing headers, set on EVERY response before anything else can write one — including the 401,
 * the 403 and the 404, since a page that cannot be framed only when it succeeds can still be framed.
 *
 * This page holds the kill switch and the approve/reject buttons. Framed invisibly by a hostile page,
 * a clickjack lands real clicks on them, and the CSRF marker does not help: those are genuine
 * same-origin clicks from the real page, carrying the real header. Framing is the gap the marker
 * cannot close, so it has to be refused outright.
 *
 * `frame-ancestors 'none'` is the modern control and `X-Frame-Options: DENY` the legacy one; both are
 * sent because they are read by different browsers and neither is redundant in practice.
 */
const SECURITY_HEADERS = Object.freeze({
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
  // No MIME sniffing: the static handler serves attacker-influenceable filenames from ./public.
  "x-content-type-options": "nosniff",
  // A DID or agent name is not a secret, but there is no reason to hand them to another origin.
  "referrer-policy": "no-referrer",
});

function setSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
}

const server = createServer(async (req, res) => {
  // EVERYTHING below is inside one try. `createServer`'s handler is async, so a rejection here becomes
  // an unhandled promise rejection — which under Node's default --unhandled-rejections=throw takes the
  // whole dashboard down, and with it the kill switch, over something as ordinary as a malformed URL.
  // The handler must not be able to kill the process it is the trust boundary for.
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error("[dashboard] request handler failed:", err);
    // Once the response has started there is no status left to set — breaking the connection is the only
    // honest signal. Before that, a 500 says what happened.
    if (res.headersSent) res.destroy();
    else res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "internal error" }));
  }
});

async function handleRequest(req, res) {
  setSecurityHeaders(res);
  // The dashboard is the published trust boundary — authenticate before doing anything else.
  if (!checkBasicAuth(req.headers["authorization"], DASH_USER, DASH_PASS)) {
    res
      .writeHead(401, {
        "www-authenticate": 'Basic realm="Meridian dashboard", charset="UTF-8"',
        "content-type": "text/plain",
      })
      .end("authentication required");
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const p = url.pathname;

  // CSRF defense for state-changing routes (kill switch, approvals, and the money-moving settlement actions):
  // require a custom header the browser can only attach to a SAME-ORIGIN request. A cross-origin page can
  // send a simple POST without preflight, but adding a non-safelisted header forces a CORS preflight this
  // server never answers permissively — so the real request is blocked. The proxy injects the control
  // token server-side, so the token alone is NOT a CSRF barrier; this header is. Scoped to the
  // state-changing set only: the token-carrying READS (/audit, /record) are idempotent, so CSRF does not
  // apply to them and requiring the header would just break the documented audit export.
  if (requiresRequestMarker(p) && req.headers["x-requested-by"] !== REQUEST_MARKER) {
    res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "missing same-origin request marker" }));
    return;
  }

  // 1. Per-org event streams: /events/<org>  ->  <org>/events. Never carries the control token.
  // `stream: true` exempts it from the upstream timeout — an idle event stream is normal, not stuck.
  //
  // The token is injected for the BUYER's stream only. That stream is now gated (its trail names every
  // rival's best-and-final in `commit-selection`), and the token is the buyer's own secret, so sending
  // it there discloses nothing. It must NEVER go to a supplier stream: those are counterparty processes,
  // and handing them the buyer's control token would give them authority over the kill switch and the
  // approval queue. Supplier streams therefore stay unauthenticated pending a per-agent credential.
  const evMatch = p.match(/^\/events\/(buyer|summit|cascade|alpine|ridge)$/);
  if (evMatch) {
    return proxy(req, res, AGENTS[evMatch[1]], "/events", shouldInjectControlToken(p), { stream: true });
  }

  // 2. Buyer control endpoints proxied 1:1 under the same paths the browser calls. The control token is
  //    injected ONLY on the state-changing ones (see shouldInjectControlToken).
  if (
    p === "/state" ||
    p === "/approvals" ||
    p === "/record" ||
    p === "/audit" ||
    p === "/start" ||
    p === "/kill" ||
    p === "/settlement" ||
    /^\/approvals\/[^/]+\/(approve|reject)$/.test(p) ||
    /^\/settlement\/[^/]+\/(approve-funding|reject-funding|refresh)$/.test(p)
  ) {
    return proxy(req, res, AGENTS.buyer, p + url.search, shouldInjectControlToken(p));
  }

  // 3. Everything else: static files from ./public.
  const rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  const file = normalize(join(PUBLIC, rel));
  // Path-boundary check, not a string prefix: `startsWith(PUBLIC)` alone would also accept a sibling
  // like `<PUBLIC>-evil/...`. Require the file to be PUBLIC itself or live strictly under `PUBLIC + sep`.
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    // `extname(basename(...))`, not a manual `lastIndexOf(".")` on the whole path. That hand-rolled
    // version had two failure modes: a dotless filename made `lastIndexOf` return -1, so `slice(-1)`
    // handed the TYPES lookup the file's last character; and a dot anywhere in an ANCESTOR directory
    // (`/srv/app.v2/public/LICENSE`) made it slice from that dot, producing an "extension" containing
    // path separators. Both then fell through to application/octet-stream, which the browser downloads
    // instead of rendering. `basename` first is what confines the search to the filename.
    const ext = extname(basename(file));
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

// Only bind a socket when run as a program — importing this module (e.g. from a test) must have no side
// effect.
//
// The bind address follows the gate, because "publish only this port" and "this port is unauthenticated"
// must never be true at the same time. With DASHBOARD_PASS set, Basic Auth is the gate and binding every
// interface is the intended deployment. Without it there is no gate at all — and this port holds the kill
// switch — so the listener drops to loopback rather than serving an open control plane to the network.
//
// This is the RUNBOOK's existing advice ("on any shared host reach it via an SSH tunnel, or set
// DASHBOARD_USER/DASHBOARD_PASS before publishing the port") turned into behaviour instead of a sentence
// someone has to read. The documented single-host demo, `http://localhost:41200`, is unchanged. Publishing
// the port from a container still works — published ports arrive on eth0, so that case needs 0.0.0.0, and
// setting DASHBOARD_PASS both unlocks the bind and is the thing that made publishing safe in the first
// place. No separate override: a knob that re-opens an unauthenticated kill switch is the knob that
// eventually gets set "just for now" and left there.
const DASH_BIND = DASH_PASS ? "0.0.0.0" : "127.0.0.1";
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  server.listen(PORT, DASH_BIND, () => {
    console.log(`[dashboard] http://localhost:${PORT} (proxies agents internally — publish only this port)`);
    if (!DASH_PASS) {
      // Said plainly and with the remedy attached: the symptom of this branch is a refused connection
      // from another host, which is otherwise indistinguishable from the process having failed to start.
      console.warn(
        "[dashboard] DASHBOARD_PASS is unset, so the dashboard is bound to 127.0.0.1 only — an " +
          "unauthenticated kill switch is never exposed to the network. Reach it locally, tunnel to it, " +
          "or set DASHBOARD_USER/DASHBOARD_PASS to bind all interfaces and publish the port.",
      );
    }
  });
}

export { server };
