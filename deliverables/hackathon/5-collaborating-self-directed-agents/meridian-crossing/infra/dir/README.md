# Agent Directory (real service)

The **AGNTCY Agent Directory** (`dir`) — federated, content-addressed, signed — indexing **OASF**
capability records. This is the **discovery** layer.

## Run

```bash
pnpm dir:up      # docker compose up -d  (from repo root)
pnpm dir:down    # stop + remove
```

- gRPC API: `localhost:8888` (what the `agntcy-dir` JS SDK talks to).
- Metrics: `localhost:9090`.

## What each supplier publishes

Each supplier process, on boot, pushes an **OASF record** describing its capability advertisement
(see `seed/catalogs/*.capability.json`). Domain facts — product line, available units, lead time,
region, and *claimed* certifications — are carried as OASF **annotations** (`key:value`), because
that is the field the real OASF schema validates and the directory indexes for search. `push`
returns a content-addressed **CID** for the record.

## How the buyer discovers

The buyer queries the Directory's Search API by annotation (`product:three-season-tent`) — **no
supplier endpoint is hardcoded in the buyer**. It then applies its own private policy filter
(region allowlist, DID denylist) before considering any candidate. *Findable ≠ cleared to buy.*

## Fidelity notes

- Claimed certifications in the records are **asserted, not verified** here. Verifying them happens
  later, at the trust gate.
- This single-container setup uses sqlite + an on-disk OCI layout (see `docker-compose.yml`). The
  Helm chart's full deployment (PostgreSQL, zot registry, SPIRE-backed x509) is the production shape;
  this prototype runs the SDK's **insecure** mode instead — no TLS and no SPIFFE workload identity on
  the gRPC channel. What makes that acceptable here and nowhere else: the container binds gRPC to
  `127.0.0.1:8888` (`docker-compose.yml`), so the only clients that can reach it are the local Node
  agents, and nothing on the channel is trusted anyway — a directory record is counterparty-authored
  input that the buyer re-validates against its loopback endpoint policy and the trust gate before it
  acts on a single field. Production wants the Helm shape: mTLS plus SPIRE-issued x509 so the
  directory can attest *which* workload is publishing, which is the one property loopback cannot
  supply.
