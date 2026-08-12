export {
  makeAgentCard,
  sendEnvelope,
  sendSignedEnvelope,
  sendSignedEnvelopeVerbose,
  startAgent,
  checkAddressedTo,
  isPeerRefusal,
  PeerRefused,
  type AgentDefinition,
  type OnMessage,
  type VerboseReply,
} from "./agent.js";
export { makeTransport, type AgentConnection, type Transport, type TransportKind } from "./transport.js";
export { signedEnvelopeFromMessage, signedEnvelopeToMessage } from "./message.js";
export {
  MERIDIAN_PROFILE,
  A2CN_PROFILE,
  makeWireProfile,
  wireProfileFromEnv,
  detectWireProfile,
  profileForInbound,
  selectWireProfile,
  cardSupportsA2cn,
  type WireProfile,
  type WireProfileName,
  type A2cnSigner,
} from "./wire-profile.js";
export {
  A2CN_VERSION,
  A2CN_DEAL_TYPE,
  A2CN_EXTENSION_URI,
  resetA2cnActHashes,
  A2CN_CUSTOM_TERMS_KEYS,
  A2cnMessage,
  A2cnWirePayload,
  A2cnTerms,
  A2cnLineItem,
  A2cnMessageType,
  A2cnTerminalState,
  parseA2cnMessage,
  parseA2cnWire,
  encodeA2cn,
  decodeA2cn,
  decodeA2cnUnverified,
  verifyA2cn,
  verifyDealArithmetic,
  isNegotiationVerb,
  looksLikeA2cn,
  reasonToA2cnTerminal,
  a2cnTerminalToReason,
} from "./a2cn.js";
export { openTrail, trailPath, type Trail } from "./trail.js";
export { makeEventHub, sseHandler, type EventHub, type HubRecord } from "./events.js";
export {
  askForTool,
  llmConfigFromEnv,
  DEFAULT_LLM_MODEL,
  type LlmConfig,
  type ToolSpec,
  type AskOptions,
} from "./llm.js";
export {
  openHalfTrail,
  readHalfTrail,
  verifyChain,
  projectHalfTrail,
  type HalfTrail,
  type HalfTrailEntry,
  type HalfTrailView,
  type ChainVerdict,
} from "./half-trail.js";
export { sellerDisposition, describeDisposition, type SellerDisposition } from "./disposition.js";
export {
  sanitiseRationale,
  safeOutboundRationale,
  looksLikeInjection,
  spokenNumericValues,
  numericValueOf,
  MAX_RATIONALE_CHARS,
} from "./rationale.js";
export {
  issueApprovalReceipt,
  verifyApprovalReceipt,
  MERIDIAN_MANDATE_ID,
  APPROVAL_AUTHORITY_CREDENTIAL,
  type ApprovalReceipt,
  type ReceiptVerdict,
} from "./approval-receipt.js";
export {
  AUDIT_LOG_TYPE,
  AUDIT_LOG_VERSION,
  COMPLIANCE_EXPORT_TYPE,
  COMPLIANCE_EXPORT_VERSION,
  auditLogFromTrail,
  buildComplianceExport,
  type AuditLog,
  type AuditMessage,
  type AuditParty,
  type AuditViolation,
  type AuditMetadata,
  type AuditLogInput,
  type ComplianceExport,
} from "./audit-log.js";
export {
  A2CN_RECORD_NAMESPACE,
  uuidV5,
  buildTransactionRecord,
  transactionRecordFromTrail,
  transactionRecordHash,
  verifyTransactionRecord,
  actHashOf,
  RECORD_TYPE,
  RECORD_VERSION,
  type TransactionRecord,
  type RecordMessage,
} from "./transaction-record.js";
export { initTelemetry, shutdownTelemetry, withNegotiationSpan, WIRE_PROFILE_ATTR } from "./otel.js";
export type { Span, Tracer } from "@opentelemetry/api";
export {
  loadScenario,
  loadCatalog,
  loadSupplierPolicy,
  supplierDid,
  supplierPort,
  supplierUrl,
  SUPPLIER_PORTS,
  type Scenario,
  type SupplierId,
  type SupplierPolicy,
} from "./scenario.js";
export {
  makeDirectoryClient,
  publishCapability,
  publishCapabilityWithRetry,
  discoverByProduct,
  discoverySignature,
  directoryAddress,
  type DiscoveredCandidate,
} from "./directory.js";
export {
  IllegalTransition,
  NegotiationTracker,
  TERMINAL_STATES,
  walkawayTerminal,
  type MoveView,
  type NegotiationRecord,
  type NegotiationState,
} from "./negotiation.js";
export {
  createSeller,
  type Seller,
  type SellerContext,
  type SellerParams,
  type SellerReasoner,
  type SellerTurn,
} from "./seller.js";
export { makeSellerReasoner } from "./seller-llm.js";
export {
  TRUST_ANCHOR_DID,
  OPERATOR_DID,
  resolveDid,
  resolveAndVerifyDid,
  verifyCredentialProof,
  verifyCredentials,
  verifyCommitAuthority,
  verifyCounterparty,
  loadSigner,
  verifySignedEnvelope,
  type CheckResult,
  type TrustAssessment,
  type Signer,
  type VerifyResult,
} from "./identity.js";
