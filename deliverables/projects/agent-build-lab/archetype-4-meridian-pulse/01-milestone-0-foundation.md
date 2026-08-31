# Milestone 0: Foundation & agent loop

**Goal:** a Goose agent perceives market data through MCP tools, reasons via an LLM routed through
AgentGateway, and proposes a pricing action, completing one full perceive→reason→act cycle. Nothing
is gated by policy yet; this milestone proves the **continuous loop** works.

**Why it matters:** the archetype's operational loop is perceive signals, load context, reason,
propose action, pass the policy gate, execute, observe outcome, and loop. M0 builds the loop itself.
M1 through M5 add the gates, the state, and the accountability.

---

## In scope
- Goose agent configured via a **recipe** (system prompt, extensions, model settings).
- Two MCP servers: `mcp-market-data` (read-only perception) and `mcp-commerce` (read/write actions).
- AgentGateway routing LLM calls (no policy yet, pass-through mode).
- A **scenario driver** feeding market signals into `mcp-market-data` on a timer.
- The agent running in a **continuous loop**: perceive → reason → act → observe → loop.
- Seed data for ~50 SKUs with current prices, inventory, and competitor prices.

## Out of scope
- Policy evaluation, permission tiers, rate limiting (M3/M5).
- Durable state and checkpointing (M2).
- Decision trail and observability (M4).
- Dashboard (M6).

---

## Build tasks

1. **Goose recipe.** Configure the agent's personality, domain knowledge, and available tools:
   ```yaml
   # packages/agent/recipe.yaml
   title: Meridian Revenue Optimization Agent
   instructions: |
     You are a revenue optimization agent for Meridian Outfitters' spring outdoor line.
     You monitor pricing signals, inventory, competitor prices, and demand forecasts.
     On each cycle you:
     1. Perceive current market state via your data tools.
     2. Identify SKUs where action may improve revenue or protect margin.
     3. Propose a pricing adjustment with your reasoning.
     4. Observe the outcome after the change takes effect.
     You operate continuously. Do not wait to be asked.
   extensions:
     - type: stdio
       name: market-data
       cmd: ["node", "packages/mcp-market-data/dist/index.js"]
     - type: stdio
       name: commerce
       cmd: ["node", "packages/mcp-commerce/dist/index.js"]
   settings:
     goose_provider: openai-compatible
     goose_model: ${LLM_MODEL}
   ```

2. **MCP server: `mcp-market-data`** (read-only). Tools:
   ```
   get_competitor_prices(sku) -> { competitors: [{ name, price, timestamp }] }
   get_demand_signal(sku)     -> { trend: "rising"|"falling"|"stable", magnitude: float, reason: string }
   get_inventory_level(sku)   -> { onHand: int, weeksOfCover: float, reorderPoint: int }
   list_category_skus()       -> [{ sku, name, category, currentPrice }]
   ```
   Backed by an in-memory store that the scenario driver mutates.

3. **MCP server: `mcp-commerce`** (read/write). Tools:
   ```
   get_current_price(sku)           -> { sku, price, lastChanged, channel }
   set_price(sku, newPrice, reason) -> { success, previousPrice, newPrice }
   get_margin(sku)                  -> { cost, price, marginPct }
   get_promo_status(sku)            -> { active: bool, type, discount, endsAt }
   ```
   Backed by a SQLite store (`packages/mcp-commerce/catalog.db`).

4. **AgentGateway config (pass-through).** Route LLM calls through AgentGateway but with no
   policies applied yet, just the LLM routing and basic telemetry:
   ```yaml
   # infra/agentgateway/config.yaml
   listeners:
     - name: llm
       port: 8080
       protocol: openai
   backends:
     - name: llm-provider
       type: openai
       endpoint: ${LLM_ENDPOINT}
       auth:
         type: api-key
         key: ${LLM_API_KEY}
   ```

5. **Scenario driver.** A script that mutates `mcp-market-data`'s in-memory store on a timer:
   ```ts
   // packages/scenario-driver/src/index.ts
   // Every 5 seconds, emit one market event from the seeded scenario timeline
   // Events: competitor price changes, demand signals, inventory updates
   ```

6. **Continuous loop.** The agent invokes itself in a loop. After each reasoning cycle completes,
   it re-perceives and reasons again. Use Goose's session continuation or a wrapper script that
   re-invokes the agent with the last observation as input.

7. **Seed data** (`seed/`):
   ```jsonc
   // seed/catalog.json      -> 50 SKUs with category, cost, current price, inventory
   // seed/competitors.json  -> baseline competitor prices
   // seed/scenario-timeline.json -> ordered list of market events for the demo
   ```

---

## Acceptance criteria (demo checkpoint)
- [ ] `pnpm dev` starts the agent, both MCP servers, AgentGateway, and the scenario driver.
- [ ] The agent completes at least 3 perceive→reason→act cycles autonomously without being prompted.
- [ ] At least one `set_price` call succeeds, changing a price in `catalog.db`.
- [ ] The agent's reasoning references specific market signals ("competitor dropped to $X").
- [ ] LLM traffic routes through AgentGateway (visible in gateway logs).
- [ ] Killing and restarting the agent resumes the loop (state persistence comes in M2; here it
      just starts fresh but keeps looping).

## Stretch
- The agent batches multiple SKU evaluations per cycle rather than one at a time.
- Structured logging with a cycle number so the continuous operation is easy to follow.
