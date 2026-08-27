import { isPeerRefusal, sendSignedEnvelope, type Signer, type Trail, type Transport } from "@meridian/agent-runtime";
import { makeEnvelope, type CapabilityAd } from "@meridian/protocol";

/**
 * Adversarial self-probes the buyer runs against its own counterparties DURING the demo.
 *
 * These used to live in the batch `index.ts`, which nothing in the demo path ever ran — so the two
 * properties this project exists to demonstrate were only ever proven to whoever went looking for
 * `pnpm discover`. They are now driven from server.ts, where an audience actually sees them.
 *
 * Both probes deliberately put INVALID traffic on the wire and expect it to be refused. That is safe
 * for the accountability artifacts because they call `sendSignedEnvelope` directly rather than going
 * through a NegotiationSession: nothing here reaches the half-trail, and the A2CN §9 transaction
 * record and §10 audit log are both derived from `halfTrail.entries()`. A probe can therefore never
 * surface as a genuine protocol violation in a record the buyer is bound by. Keep it that way — route
 * a probe through a session and it will start forging its own evidence.
 *
 * A probe records exactly three outcomes, and the third one is the point: `rejected-as-expected` only
 * for a refusal the COUNTERPARTY computed (`isPeerRefusal`), `UNEXPECTED-ACCEPT` when invalid traffic was
 * taken, and `INCONCLUSIVE` for everything else. Both probes used to treat every throw as a rejection, so
 * a supplier that was merely unreachable — refused connection, wrong port, request deadline — wrote a
 * proof into the trail that its gate had held, against a process that never received a byte. An
 * accountability trail that manufactures evidence when the network fails is worse than one with a gap in
 * it, and this is a demo whose whole claim is that the trail can be believed.
 */

/**
 * Prove the signature gate covers the BYTES, not just the sender: sign a message, mutate its body
 * after signing, and send it to a supplier that already cleared the three-part identity check. The
 * receiver must reject it — clearing verification is not a standing pass for every later message.
 * A refusal by the supplier is the expected outcome; a failure to REACH it proves nothing.
 */
export async function tamperDemo(
  opts: { transport: Transport; signer: Signer; buyerDid: string; ad: CapabilityAd; trail: Trail },
): Promise<void> {
  const { transport, signer, buyerDid, ad, trail } = opts;
  const signed = signer.sign(
    makeEnvelope({ type: "PING", from: buyerDid, to: ad.did, body: { probe: "integrity" } }),
  );
  const tampered = { ...signed, body: { probe: "integrity", injected: "mutated-after-signing" } };
  trail.append({ event: "tamper-test", target: ad.did, note: "body mutated after signing" });
  try {
    // `connect` is INSIDE the try: a supplier that is down fails here, and this probe's job is to record
    // that as "no proof obtained" rather than to abort the run that is about to negotiate with the others.
    const { client } = await transport.connect(ad.a2aEndpoint);
    await sendSignedEnvelope(client, tampered);
    console.log(`[buyer] TAMPER TEST FAILED: ${ad.agentName} accepted a tampered message`);
    trail.append({ event: "tamper-test-result", target: ad.did, outcome: "UNEXPECTED-ACCEPT" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (isPeerRefusal(err)) {
      console.log(`[buyer] tamper test OK: ${ad.agentName} rejected the tampered message`);
      trail.append({ event: "tamper-test-result", target: ad.did, outcome: "rejected-as-expected", detail });
    } else {
      console.log(`[buyer] tamper test INCONCLUSIVE: no answer from ${ad.agentName}: ${detail}`);
      trail.append({ event: "tamper-test-result", target: ad.did, outcome: "INCONCLUSIVE", detail });
    }
  }
}
