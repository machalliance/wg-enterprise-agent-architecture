# Milestone 1: Identity & scoped permissions

**Goal:** the agent authenticates to AgentGateway with a dedicated identity, and its tool access is
**scoped**: it can read all market data but write prices only to specific categories. A tool call
outside its scope is rejected before reaching the commerce system.

**Why it matters:** an agent that runs continuously needs a durable machine identity with its own
lifecycle, provisioned, rotated, scoped, and revocable independently of any human session.
Permissions are granular and auditable: the agent may read pricing data from all channels but write
price changes only to specific SKU categories.

---

## In scope
- Agent authenticates to AgentGateway with a **JWT** or **API key** representing its machine identity.
- AgentGateway **MCP Gateway** federates the two MCP servers behind auth, applying tool-level
  permissions.
- Read tools (`get_*`, `list_*`) allowed for all SKUs.
- Write tools (`set_price`) allowed only for SKUs in the agent's assigned categories.
- A call to `set_price` on an out-of-scope SKU is **rejected by AgentGateway**; the MCP server
  never sees it.

## Out of scope
- Full credential rotation and lifecycle (documented as the production extension).
- Revocation (the kill switch in M5 is the demo-friendly equivalent).

---

## Build tasks

1. **Agent credential.** Issue a JWT (or API key) representing the agent's identity:
   ```jsonc
   // seed/identity/agent-credential.json
   {
     "sub": "agent:meridian-pulse:revenue-optimizer",
     "scope": ["market-data:read", "commerce:read", "commerce:write:outdoor-tents", "commerce:write:hydration"],
     "iat": "...",
     "exp": "..."   // short-lived; rotated by the harness
   }
   ```

2. **AgentGateway MCP Gateway config.** Federate both MCP servers behind the gateway with
   auth required:
   ```yaml
   # infra/agentgateway/mcp-gateway.yaml
   mcpServers:
     - name: market-data
       transport: stdio
       command: ["node", "packages/mcp-market-data/dist/index.js"]
       tools:
         allowAll: true   # read-only, all allowed
     - name: commerce
       transport: stdio
       command: ["node", "packages/mcp-commerce/dist/index.js"]
       tools:
         allow:
           - get_current_price
           - get_margin
           - get_promo_status
           - set_price   # further scoped by policy in M3
   auth:
     type: jwt
     jwksUri: "file://seed/identity/jwks.json"
   ```

3. **Category-scoped write permission.** AgentGateway CEL policy (illustrative pseudo-CEL;
   lightweight, ahead of the full tiers in M3):
   ```
   // Allow set_price only if the SKU belongs to an allowed category
   request.tool == "set_price" &&
     request.args.sku in identity.scope_skus("commerce:write")
   ```
   A helper resolves `commerce:write:outdoor-tents` to the SKU list for that category from the catalog.

4. **Rejected call demo.** Seed one SKU outside the agent's scope (for example, `MER-BOOT-GTX` in
   "premium footwear"). When the agent reasons it should reprice that SKU, the call is rejected
   at the gateway with a structured error the agent can observe.

5. **Agent handles rejection gracefully.** The system prompt includes guidance: "If a price change
   is rejected due to permissions, note the SKU is outside your scope and move on." The agent
   should not loop on a denied action.

---

## Acceptance criteria (demo checkpoint)
- [ ] Agent authenticates to AgentGateway; unauthenticated calls are rejected (401).
- [ ] `set_price("MER-TENT-3S", ...)` succeeds (SKU in allowed category).
- [ ] `set_price("MER-BOOT-GTX", ...)` is **rejected by AgentGateway** (403); the MCP commerce
      server's logs show it never received the call.
- [ ] Gateway logs show the identity, the tool, the scope check, and the result for every call.
- [ ] The agent's reasoning shows it observed and accepted the rejection without retrying
      indefinitely.

## Stretch
- Implement a short-lived token that expires mid-session; show the agent seamlessly re-authenticates
  (simulating credential rotation).
