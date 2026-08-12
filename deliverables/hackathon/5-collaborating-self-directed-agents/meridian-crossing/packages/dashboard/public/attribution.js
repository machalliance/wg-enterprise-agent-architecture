// Resolve which supplier a streamed reconcile record belongs to.
//
// SECURITY: `rec.did` is counterparty-controlled — a supplier picks its own DID when it advertises,
// and supplierOrgFromDid() matches it by substring, so a crafted DID can resolve to ANOTHER supplier's
// id. The negotiation mapping (`negs`) is what THIS dashboard recorded from its own negotiation, so it
// is authoritative and must win. The DID is only a fallback for a reconcile record that arrives with no
// matching negotiation.
export function resolveSupplierOrg(rec, negs, supplierOrgFromDid) {
  return negs.get(rec.negotiationId)?.supplierOrg || supplierOrgFromDid(rec.did) || null;
}
