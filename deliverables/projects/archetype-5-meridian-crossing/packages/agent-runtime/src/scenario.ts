import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CapabilityAd } from "@meridian/protocol";

/** Shape of seed/scenario.json — the shared scenario facts (NOT private policy; that is the mandate). */
export interface Scenario {
  shortfall: {
    sku: string;
    name: string;
    product: string;
    unitsNeeded: number;
    deadlineDays: number;
    buyer: string;
  };
  suppliers: Array<{ id: string; did: string; behaviour: string }>;
}

export type SupplierId = "summit" | "cascade" | "alpine" | "ridge";

/** Default local ports for each supplier's A2A server. Override per-process with <ID>_PORT. */
export const SUPPLIER_PORTS: Record<SupplierId, number> = {
  summit: 41001,
  alpine: 41002,
  ridge: 41003,
  cascade: 41004,
};

export function loadScenario(): Scenario {
  const path = fileURLToPath(new URL("../../../seed/scenario.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Scenario;
}

/** Load and validate a supplier's capability advertisement from seed/catalogs. */
export function loadCatalog(id: SupplierId): CapabilityAd {
  const path = fileURLToPath(new URL(`../../../seed/catalogs/${id}.capability.json`, import.meta.url));
  return CapabilityAd.parse(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * A supplier's PRIVATE selling policy from seed/supplier-policy.json — opening price, floor, concession
 * rate. Loaded only by that supplier's own process (and by the in-process sampling harness, which plays
 * both sides). It is never advertised and never goes on the wire; see the notes in the JSON for why it
 * lives there rather than in the public capability ad.
 */
export interface SupplierPolicy {
  behaviour: string;
  openingPriceUsd: number;
  floorPriceUsd: number;
  concessionRate: number;
  jitterUsd?: number;
}

export function loadSupplierPolicy(id: SupplierId): SupplierPolicy {
  const path = fileURLToPath(new URL("../../../seed/supplier-policy.json", import.meta.url));
  const file = JSON.parse(readFileSync(path, "utf8")) as { suppliers: Record<string, SupplierPolicy> };
  const policy = file.suppliers[id];
  if (!policy) throw new Error(`No selling policy for supplier '${id}' in seed/supplier-policy.json`);
  return policy;
}

export function supplierDid(scenario: Scenario, id: SupplierId): string {
  const supplier = scenario.suppliers.find((s) => s.id === id);
  if (!supplier) throw new Error(`Supplier '${id}' not found in seed/scenario.json`);
  return supplier.did;
}

export function supplierPort(id: SupplierId): number {
  const fromEnv = process.env[`${id.toUpperCase()}_PORT`];
  if (fromEnv === undefined || fromEnv === "") return SUPPLIER_PORTS[id];
  const port = Number(fromEnv);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${id.toUpperCase()}_PORT must be an integer in 1-65535, got '${fromEnv}'`);
  }
  return port;
}

export function supplierUrl(id: SupplierId): string {
  // Empty means unset, matching `supplierPort` directly above. `??` alone kept an empty string, and
  // `SUMMIT_URL=` in an env file is how a variable gets "cleared" — that produced an agent advertising
  // "" as its A2A endpoint, which is unreachable and, being a published address, wrong everywhere.
  const fromEnv = process.env[`${id.toUpperCase()}_URL`];
  if (fromEnv === undefined || fromEnv === "") return `http://localhost:${supplierPort(id)}`;
  return fromEnv;
}
