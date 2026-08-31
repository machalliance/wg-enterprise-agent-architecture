# A Pricing Agent that Never Sleeps, and Always Follows Policy

**What one agent over fifty SKUs taught us about giving software standing authority.**

Automated pricing is not new and nobody finds it surprising. A repricer will move a few thousand prices before lunch with no one reviewing a single one, and that is fine, because the decision was made by a person months earlier and written down: match the lowest competitor, hold the margin floor, never go under cost. The software is doing arithmetic on somebody else's judgement.

An agent does the judgement itself. It reads a competitor's move, works out whether the demand behind it is real, and picks a response nobody wrote down, because if the response had been written down there would be no reason to use an agent. What it gets instead of instructions is a mandate: how far it may go, not where to land.

That makes its worst failure a quiet one. A runaway agent is the easy case. It is loud, somebody sees it, somebody stops it. The expensive case stays inside every limit you set: hundreds of small concessions over a quarter, each one permitted, each one logged with a reasonable explanation attached, not one of them worth an alert. Margin drifts down, and the drift gets written up as competitive pressure, because that is what it looks like.

The MACH Alliance [Enterprise Agent Architecture working group](https://github.com/machalliance/wg-enterprise-agent-architecture) built a prototype to find out what has to hold before an agent like that is worth running.

## The scenario

Meridian Outfitters sells a spring outdoor line of tents, hydration and packs, about fifty SKUs. One agent, [Meridian Pulse](https://github.com/machalliance/wg-enterprise-agent-architecture/tree/main/deliverables/projects/archetype-4-meridian-pulse), watches competitor prices, demand signals and inventory and reprices whatever needs repricing. Nobody approves its decisions. It has no task to finish, so it does not stop: it wakes, looks, acts or doesn't, writes down what it decided, and goes round again.

What it has instead of instructions is a mandate, kept in a file outside the agent so it can be tightened without touching code. Moves under 5% are its own call. Under 15% it acts and tells the merchandising team afterwards. Past that, or on either of the two SKUs someone has flagged, or anywhere near premium footwear, it has to ask. Selling below cost is not available to it at any tier.

The commerce catalogue is a local database and the market data is a scripted timeline, replayed identically on every run, so the same five events reach the agent each time: a competitor undercuts the hero tent, a heatwave lifts hydration demand past what the agent may act on alone, an operator hits the kill switch, a competitor's feed reports its whole catalogue at 75% off, and a merchandiser approves the change the agent was not allowed to make. Everything between the agent and that catalogue is real: the identity check, the policy gate, the automatic limits, the decision record.

What follows is what the agent does with each of those, and what we had wrong the first time we watched it.

## 1. How does anything downstream know it is the agent?

AlpineDirect drops the hero tent to $188.60, around 8% under Meridian's price. The agent sees the move, works out that demand will follow it, and matches. Nobody approves the change; a move that size sits inside the band the mandate already granted, so the merchandising team is told after the fact rather than asked first.

An 8% cut written by software with nobody in the loop is only tolerable if the system underneath can answer a narrow question first: is this the agent, and may this agent write prices at all? Every cycle opens with that answer. The agent signs a short-lived [token](https://datatracker.ietf.org/doc/html/rfc7519) with a private key only it holds, and presents that token on every call it makes for the next few minutes. [AgentGateway](https://agentgateway.dev/) checks the signature, then checks what that identity may reach: prices and demand data to anyone who can prove they are the agent, changing a price only for a credential carrying the write scope. Nothing trusts a caller for being on the same machine. The change still has to clear the policy gate on its way to the catalogue, which is the next section, but nothing reaches the gate at all without a credential.

The verification half is real and worth copying. The lifecycle around it is deliberately absent. The key came from a command someone ran once, rotating it means running that command again, and there is no way to revoke it, so a leaked token would be good until it expired. Production needs an issuer that can hand a credential out and take it back: [SPIFFE](https://spiffe.io/) inside your own infrastructure, [DIDs](https://www.w3.org/TR/did-core/) and [verifiable credentials](https://www.w3.org/TR/vc-data-model/) when the thing you are trusting belongs to somebody else. The prototype can verify an identity and cannot withdraw one.

## 2. Where does "within policy" actually get enforced?

A heatwave forecast lands and hydration demand jumps 40%. The agent works out that the 2L pack is underpriced by more than its mandate lets it correct, and it tries to move it anyway.

Nothing bad happens. The write leaves the agent, reaches the policy server, is classified as past the band, and stops there, parked in a queue with the agent's reasoning attached, waiting for the merchandising team. The agent is told what happened and moves on to the next SKU.

That stop is the whole architecture. The agent has no route to the commerce database that avoids it and no [tool](https://modelcontextprotocol.io/) call that skips the gateway. The rule holds because of the wiring, not because the agent behaves.

Getting the rule into the right layer took one correction. The mandate lets the agent price tents, hydration and packs and forbids premium footwear, and a rule about what an identity may touch belongs with the rest of the access control, in the gateway. But the gateway decides by tool. It can say this identity may call the price-setting tool; it cannot say this identity may call it for tents and not for boots, because the category is an argument and the gateway does not read arguments. The category rule ended up one layer in, in the policy server, which does. Nothing got weaker, since that server is still the only door. The split between access control and business policy ended up following what each layer can read.

## 3. What is still true after a restart?

An operator hits the kill switch. The agent stops inside a second. Resumed, it carries on at the next cycle number rather than at one, with the hour's totals intact, because it saves its position every cycle and reads it back on the way up.

Restoring the agent was the straightforward part. We found the other half by restarting the control process instead of the agent. Whether the agent was currently stopped lived in that process's memory and was written down nowhere, so it came back up believing nothing had happened, and an agent somebody had deliberately halted was running again. The recent-activity counts the automatic limits are measured against went the same way, and the resume path cleared them too, handing the agent a clean slate immediately after an incident.

The counts are fixed: resuming no longer clears them, and clearing them now has to be asked for. The stop is not. The fact that somebody pressed the kill switch still lives only in the memory of one program, so restarting that program still loses it.

## 4. What does it do with a feed that lies?

One of the competitor feeds reports its entire catalogue at 75% off. This is the event written to trip the automatic limits: a burst of deep cuts, or a single change that moves more than $50k of revenue, and the agent halts.

The limits never fire. The agent reads a whole catalogue at a quarter of its usual price, concludes that no competitor has just given away its inventory, moves nothing, and records the feed as implausible. There is no cascade to stop. The limits themselves are covered by tests and trip when they are given something to trip on; this scenario never gives them one.

We left the scenario alone rather than making the glitch cruder until the agent fell for it, and gave the agent a way to record standing down instead, so "I saw this and chose not to act" lands in the same log as "I moved this price" and shows up beside it on the operator's screen. The mechanical limits stay in the build as the backstop for a weaker model that swallows the feed.

## 5. What does the record actually cover?

The hydration pack is still in the queue. Someone approves it, the price changes, the escalation clears, and the decision record has no idea any of it happened.

Everything the agent decides goes into an append-only record, chained so that altering an earlier entry breaks every entry after it, and a verify command walks the chain to show none of them have been. The approval was made by a person, through a different code path, and that path wrote nothing at all. The half of an escalation where a human exercises authority was the half outside the audit trail, and since the operator's dashboard reads that trail, it could not show that an approved change had gone through. Approval writes its own entry now, linked to the escalation it releases.

The record also keeps what the agent said about its own decision, and that part can be wrong even when the decision is right. The agent proposed $228 for one product and wrote, next to the number, that this stayed below AlpineDirect's $219. It plainly does not. The price came out of arithmetic that worked; the sentence explaining it was simply false, and the sentence is what a merchandiser reads before clicking approve.

It was also measuring against the wrong rival, treating the most expensive competitor it tracked as the ceiling instead of the cheapest, so a price could sit under one rival and over another while the agent called it below both. Both problems are fixed. Nothing in the system compares what an agent says it did with what it actually did, so the only thing that caught this was a person reading it.

## Where this goes next

Identity, mandate, durable state, audit, containment. All five are properties of the system around the agent, not capabilities of the model inside it. A better model raises the floor and makes the mechanical controls look idle, which is not a reason to take them out.

Three things are queued from what the run exposed: oversight state that survives a restart, so a halted agent stays halted and the controls stop sharing a fate with the process they guard; a credential issuer that can revoke as well as mint; and a second agent, because everything here is built per-agent and none of it has yet met a peer.

The stack is public: [Goose](https://github.com/block/goose) runs the agent, [AgentGateway](https://agentgateway.dev/) holds identity and policy, [MCP](https://modelcontextprotocol.io/) connects the tools, [OpenTelemetry](https://opentelemetry.io/) carries the traces. A control plane that only works inside one vendor's runtime governs nothing outside it. Every shortcut taken here is written down in the repository next to the code.

The companion prototype in this series asks the same questions across a company boundary, where the counterparty [is somebody else's agent](https://machalliance.org/insights-hub/when-your-agent-negotiates-against-someone-elses).

[Meridian Pulse](https://github.com/machalliance/wg-enterprise-agent-architecture/tree/main/deliverables/projects/archetype-4-meridian-pulse) is open source as the working group's Archetype 4 deliverable, covering autonomous, policy-guided agents. The code will be discussed at the Agent Build Lab during [MACH X in Amsterdam](https://mach-x.machalliance.org/amsterdam/), September 29 to 30.
