import { Client, Config, models } from "agntcy-dir";
import {
  CapabilityAd,
  OasfRecord,
  canonicalize,
  capabilityToOasfData,
  oasfRecordToCapability,
  productAnnotationQuery,
} from "@meridian/protocol";

/**
 * Thin wrapper over the official AGNTCY Directory SDK (agntcy-dir). Suppliers publish OASF records;
 * the buyer discovers them by capability. The buyer never sees a supplier endpoint except through a
 * record it found here.
 */
export interface DiscoveredCandidate {
  /** Content-addressed id the directory assigned the record. */
  cid: string;
  ad: CapabilityAd;
}

export function directoryAddress(): string {
  return process.env.DIR_ADDRESS ?? "localhost:8888";
}

/** Connect to the Directory over gRPC in insecure dev mode. */
export async function makeDirectoryClient(): Promise<Client> {
  // The SDK's Config.loadFromEnv reads DIRECTORY_CLIENT_SERVER_ADDRESS.
  process.env.DIRECTORY_CLIENT_SERVER_ADDRESS ??= directoryAddress();
  const config = Config.loadFromEnv();
  const transport = await Client.createGRPCTransport(config);
  return new Client(config, transport);
}

/** Publish a capability advertisement as an OASF record; returns the content-addressed CID. */
export async function publishCapability(client: Client, ad: CapabilityAd): Promise<string> {
  try {
    const refs = await client.push([{ data: capabilityToOasfData(ad) }]);
    const cid = refs[0]?.cid;
    if (!cid) throw new Error("Directory push returned no record ref");
    return cid;
  } catch (err) {
    // The store is content-addressed, so re-publishing the SAME record is a no-op — the directory
    // reports "already exists". Treat that as success (idempotent publish) so a second `pnpm demo`
    // against a still-running directory does not crash the supplier. Recover the CID from the message.
    const msg = String(err);
    if (/already exists/i.test(msg)) {
      // Recover the REAL record CID. Never fabricate a placeholder id: the return value is a promised
      // content-addressed record id, and a synthetic "already-exists" would silently poison anything
      // that later resolves the record by that cid.
      //
      // The `sha256:…` in the error text is NOT that id — it is the OCI layer digest, a different
      // namespace from the Directory CID `push` returns and `pull`/`searchCIDs` accept. Returning it
      // was the same poisoning in subtler form: a plausible-looking id that resolves to nothing. So ask
      // the directory what CID it actually holds for this record, by the same search the buyer uses.
      const cid = await findPublishedCid(client, ad);
      if (cid) return cid;
    }
    throw err;
  }
}

/** Look up the CID the directory already holds for `ad`, matching the WHOLE advertisement.
 *  Returns undefined if the record cannot be found, so the caller re-throws the original error. */
async function findPublishedCid(client: Client, ad: CapabilityAd): Promise<string | undefined> {
  try {
    const hits = await client.searchCIDs({
      queries: [
        { type: models.search_v1.RecordQueryType.ANNOTATION, value: productAnnotationQuery(ad.product) },
      ],
      limit: 100,
    });
    const refs = hits.map((h) => ({ cid: h.recordCid }));
    if (refs.length === 0) return undefined;
    const records = await client.pull(refs);
    // The record a push of THIS ad would produce. The store is content-addressed, so the CID we want is
    // the one whose record equals what `publishCapability` just tried to push — the same identity test
    // the directory itself applied when it answered "already exists".
    //
    // Matching on `did` alone was too loose: one supplier re-publishing the SAME product after any
    // capability change (a new maxUnits, a moved a2aEndpoint, a re-quoted on-time rate) leaves the old
    // record in the directory, and both carry that did + product. The first hit won, so the recovered
    // CID could name the STALE record — a plausible id that resolves to superseded terms, which is the
    // same poisoning the `sha256:` shortcut above was rejected for, just sourced from a real record.
    //
    // Compared as WHOLE records, not just their annotations. Annotations carry every capability fact and
    // do determine the derived top-level fields for anything WE publish, so the two agree in practice —
    // but a record built by other means could pair identical annotations with a different `version` or
    // `description`, and that is a different record with a different CID. Returning its cid would be the
    // same class of lie in a narrower case. `canonicalize` sorts keys, so this is order-independent.
    //
    // Both sides go through `OasfRecord.parse`, which normalises to the fields we model — so equality
    // here means "identical as far as this schema sees", the same boundary every other consumer reads
    // the record through.
    const wanted = OasfRecord.parse(capabilityToOasfData(ad));
    const wantedCanonical = canonicalize(wanted);
    for (const [i, rec] of records.entries()) {
      try {
        const record = OasfRecord.parse(rec.data);
        // Parse to a CapabilityAd first so a neighbour that is not a capability record at all is
        // skipped by the catch rather than silently compared as a bag of strings.
        oasfRecordToCapability(record);
        if (canonicalize(record) === wantedCanonical) return refs[i]!.cid;
      } catch {
        // A malformed neighbour is not our record and must not abort the lookup.
      }
    }
    return undefined;
  } catch {
    // The recovery lookup is best-effort: if it fails, the caller re-throws the original push error,
    // which is the more informative one.
    return undefined;
  }
}

/** Publish with retry — the directory container may still be coming up when a supplier boots. */
export async function publishCapabilityWithRetry(
  client: Client,
  ad: CapabilityAd,
  attempts = 30,
  gapMs = 1000,
): Promise<string> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await publishCapability(client, ad);
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  throw new Error(`Could not publish to directory after ${attempts} attempts: ${String(lastErr)}`);
}

/**
 * A stable IDENTITY for a discovered set — sorted `did:cid` pairs — for deciding when suppliers have
 * finished announcing themselves and discovery can be treated as settled.
 *
 * Compare this, never `candidates.length`. A set that swaps one supplier for another between polls
 * keeps the same length, so a count-based check calls it stable and the buyer starts negotiating
 * against a directory view that is still changing. Sorted because announcement order is not stable
 * across polls and an order-sensitive signature would never converge at all.
 *
 * It lives here, next to `discoverByProduct`, because two entrypoints poll for the same condition — the
 * web server and the batch CLI — and they had drifted: one compared identity with a comment explaining
 * why counting is not enough, the other still compared the count. One implementation is what stops the
 * fix being present in one copy and absent in the other.
 */
export function discoverySignature(candidates: readonly DiscoveredCandidate[]): string {
  return candidates
    .map((c) => `${c.ad.did}:${c.cid}`)
    .sort()
    .join("|");
}

/**
 * Discover candidates advertising `product`. Searches the directory by annotation, pulls the full
 * records, and validates each against the OASF schema we depend on before handing it back — so the
 * buyer never trusts the directory's shape blindly.
 */
export async function discoverByProduct(
  client: Client,
  product: string,
): Promise<DiscoveredCandidate[]> {
  const hits = await client.searchCIDs({
    queries: [
      { type: models.search_v1.RecordQueryType.ANNOTATION, value: productAnnotationQuery(product) },
    ],
    limit: 100,
  });
  const refs = hits.map((h) => ({ cid: h.recordCid }));
  if (refs.length === 0) return [];

  const records = await client.pull(refs);
  // Validate each pulled record INDEPENDENTLY: one malformed record from the directory must not sink
  // the whole discovery. Invalid entries are skipped (and reported) while every valid candidate — and
  // its matching cid — is preserved. Indexing stays correct because we skip rather than shift.
  const candidates: DiscoveredCandidate[] = [];
  records.forEach((rec, i) => {
    const cid = refs[i]!.cid;
    try {
      candidates.push({ cid, ad: oasfRecordToCapability(OasfRecord.parse(rec.data)) });
    } catch (err) {
      console.warn(`[directory] skipping malformed record ${cid}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  return candidates;
}
