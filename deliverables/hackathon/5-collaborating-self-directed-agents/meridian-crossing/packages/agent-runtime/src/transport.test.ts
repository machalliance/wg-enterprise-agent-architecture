import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import { afterEach, describe, it } from "node:test";
import { makeAgentCard } from "./agent.js";
import { makeTransport } from "./transport.js";

/**
 * Transport SSRF guard (CodeRabbit finding): a discovery-provided agent base URL is untrusted, so
 * unapproved origins must be rejected BEFORE any card fetch. Only the reject paths are asserted here —
 * they throw before touching the network, so no server is needed.
 */

describe("transport origin allowlist", () => {
  const savedAllowed = process.env.A2A_ALLOWED_ORIGINS;

  afterEach(() => {
    if (savedAllowed === undefined) delete process.env.A2A_ALLOWED_ORIGINS;
    else process.env.A2A_ALLOWED_ORIGINS = savedAllowed;
  });

  it("rejects a non-loopback origin by default (blocks SSRF to internal/metadata hosts)", async () => {
    delete process.env.A2A_ALLOWED_ORIGINS; // exercise the default policy explicitly
    const t = makeTransport();
    await assert.rejects(async () => t.connect("http://169.254.169.254/latest/meta-data"), /not approved/i);
  });

  it("rejects a non-http(s) scheme", async () => {
    delete process.env.A2A_ALLOWED_ORIGINS;
    const t = makeTransport();
    await assert.rejects(async () => t.connect("file:///etc/passwd"), /scheme not allowed/i);
  });

  it("honours A2A_ALLOWED_ORIGINS and rejects origins not on the list", async () => {
    process.env.A2A_ALLOWED_ORIGINS = "http://approved.example";
    const t = makeTransport(); // construct AFTER the env is configured
    await assert.rejects(async () => t.connect("http://evil.example"), /not approved/i);
  });
});

/**
 * The second half of the same guard, and the one that needs a real server: the checks above vet the URL
 * we CONSTRUCT, while these vet the endpoints the returned CARD declares. An approved origin that serves
 * a card pointing elsewhere is the bypass — the allowlist is satisfied by the card fetch while every
 * negotiation request goes to the card's address instead.
 */
describe("transport agent-card endpoint allowlist", () => {
  const savedAllowed = process.env.A2A_ALLOWED_ORIGINS;
  let server: Server | undefined;

  /** Serve `card` from loopback (an always-approved origin) and return its base URL. */
  async function serveCard(card: unknown): Promise<string> {
    server = createServer((req, res) => {
      if (!req.url?.endsWith(AGENT_CARD_PATH)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(card));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server!.address() as { port: number };
    return `http://127.0.0.1:${port}`;
  }

  afterEach(async () => {
    if (savedAllowed === undefined) delete process.env.A2A_ALLOWED_ORIGINS;
    else process.env.A2A_ALLOWED_ORIGINS = savedAllowed;
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it("rejects a card whose first interface points at an unapproved host", async () => {
    delete process.env.A2A_ALLOWED_ORIGINS;
    const base = await serveCard(
      makeAgentCard({ name: "Evil Co.", description: "approved origin, redirected traffic", url: "http://169.254.169.254/" }),
    );
    const t = makeTransport();
    await assert.rejects(async () => t.connect(base), /unapproved endpoint in supportedInterfaces\[0\]/i);
  });

  it("rejects a card whose SECOND interface points at an unapproved host", async () => {
    delete process.env.A2A_ALLOWED_ORIGINS;
    // The FIRST interface is clean. Only the alternate is hostile — the case a guard that checked one
    // endpoint would wave straight through, since the SDK will happily select a later interface when
    // its binding ranks higher. A2A v1.0 folded `url` and `additionalInterfaces` into one ordered
    // `supportedInterfaces`, so "the primary" is no longer a distinct field to check on its own.
    const base = await serveCard(
      makeAgentCard({
        name: "Evil Co.",
        description: "clean primary, dirty alternate",
        url: "http://127.0.0.1:1/",
        supportedInterfaces: [
          { url: "http://169.254.169.254/", protocolBinding: "GRPC", protocolVersion: "1.0", tenant: "" },
        ],
      }),
    );
    const t = makeTransport();
    await assert.rejects(async () => t.connect(base), /unapproved endpoint in supportedInterfaces\[1\]/i);
  });

  it("rejects an interface whose endpoint is not a URL at all", async () => {
    delete process.env.A2A_ALLOWED_ORIGINS;
    // `protocolBinding` is an OPEN string in A2A v1.0, so a card may declare a binding this agent has
    // never heard of, carrying an address in a form the origin allowlist cannot parse. That must fail
    // closed rather than slip through as "no origin to check" — the guard's decision has to be about
    // whether an endpoint is approved, never about whether it was recognisable.
    const base = await serveCard(
      makeAgentCard({
        name: "Evil Co.",
        description: "unparseable endpoint under an unknown binding",
        url: "http://127.0.0.1:1/",
        supportedInterfaces: [
          { url: "../../etc/passwd", protocolBinding: "SOMETHING-ELSE", protocolVersion: "1.0", tenant: "" },
        ],
      }),
    );
    const t = makeTransport();
    await assert.rejects(async () => t.connect(base), /unapproved endpoint in supportedInterfaces\[1\]/i);
  });

  it("accepts a card that declares only approved endpoints (the guard is not vacuous)", async () => {
    delete process.env.A2A_ALLOWED_ORIGINS;
    // Two-phase: the card must name the port it is actually served on, which is only known after listen.
    server = createServer((req, res) => {
      const { port } = server!.address() as { port: number };
      if (!req.url?.endsWith(AGENT_CARD_PATH)) {
        res.writeHead(404).end();
        return;
      }
      const card = makeAgentCard({ name: "Honest Co.", description: "same origin", url: `http://127.0.0.1:${port}` });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(card));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server!.address() as { port: number };
    const t = makeTransport();
    // Resolves to a Client — proving the two rejections above are the guard firing, not the whole path
    // being broken for every card.
    const conn = await t.connect(`http://127.0.0.1:${port}`);
    assert.ok(conn.client, "a usable client");
    // The CARD comes back too, and it is not decoration: `selectWireProfile` reads its
    // `capabilities.extensions` to decide whether the pair speaks A2CN. `connect` used to resolve the
    // card, check it and throw it away, which is why the documented profile downgrade was implemented in
    // a function nothing called. Asserting it here pins the contract that fix depends on.
    assert.equal(conn.card.name, "Honest Co.", "the resolved card is handed back for profile negotiation");
    assert.ok(Array.isArray(conn.card.capabilities?.extensions), "with the field selectWireProfile reads");
  });
});
