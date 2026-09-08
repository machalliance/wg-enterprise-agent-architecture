/**
 * Shared shapes for the repair desk.
 *
 * The vocabulary is deliberately ISO 20022's, not ours: an operator reading a
 * trace should recognise every field name and every code without a glossary.
 */

export type Scheme = "SEPA" | "CBPR+" | "FEDWIRE";

export type ChargeBearer = "DEBT" | "CRED" | "SHAR" | "SLEV";

export interface PostalAddress {
  streetName?: string;
  buildingNumber?: string;
  postCode?: string;
  townName?: string;
  country?: string;
  addressLines?: string[];
}

export interface Party {
  name: string;
  postalAddress: PostalAddress;
  countryOfResidence?: string | null;
  lei?: string;
}

export interface Account {
  iban?: string;
  otherId?: string;
  domicile?: string;
  accountCurrency?: string;
  currency?: string;
}

export interface Agent {
  bicfi?: string;
  clearingSystemMemberId?: string;
  name?: string;
}

export interface Instruction {
  txId: string;
  endToEndId: string;
  uetr: string;
  scheme: Scheme;
  amount: { value: string; currency: string };
  chargeBearer: ChargeBearer;
  purposeCode: string | null;
  creditor: Party;
  creditorAccount: Account;
  creditorAgent: Agent;
  remittanceInformation: { unstructured: string[] };
}

export interface Batch {
  batchId: string;
  valueDate: string;
  debtor: Party;
  debtorAccount: Account;
  debtorAgent: Agent;
  instructions: Instruction[];
}

/** One validation failure, in the shape a pacs.002 would carry it back. */
export interface Finding {
  /** ExternalStatusReason1Code, 4 characters. */
  code: string;
  /** The registry definition, verbatim. */
  meaning: string;
  /** Dotted path into the instruction. */
  field: string;
  /** What the engine saw. Never a suggestion — the engine does not repair. */
  observed: string;
  /** Free text, Max105Text in a real pacs.002 StsRsnInf/AddtlInf. */
  additionalInformation: string;
}

export type TxStatus = "ACTC" | "RJCT";

export interface ValidationResult {
  txId: string;
  /** ExternalPaymentTransactionStatus1Code. ACTC = accepted technical validation. */
  txSts: TxStatus;
  findings: Finding[];
}

export type ScreeningState =
  | "CLEAR"
  | "POTENTIAL_MATCH"
  | "TRAVEL_RULE_REVIEW"
  | "BLOCKED";

export interface Screening {
  state: ScreeningState;
  screenedAt: string;
  alertId?: string;
  matchedField?: string;
  queue?: string;
  disclosureToCounterparty?: string;
}

export type Tier = "A" | "B" | "C";

export interface Disposition {
  txId: string;
  tier: Tier;
  /** Why this tier, in one line, for the trace. */
  rationale: string;
  /** Where a human picks it up, if a human must. */
  owner: string | null;
  /** Codes this disposition was reached from. */
  codes: string[];
  /** True only for tier C: no field of this instruction may be written. */
  frozen: boolean;
}

export interface RepairProposal {
  txId: string;
  field: string;
  from: string;
  to: string;
  /** The reference-data entry that justifies the change. Tier A repairs are void without one. */
  citation: string;
}

export interface RepairRecord extends RepairProposal {
  tier: Tier;
  appliedAt: string;
  approvedBy: string | null;
  mode: "commit" | "dry-run";
  revalidation: TxStatus;
}

export interface EscalationRecord {
  txId: string;
  queue: string;
  reasonCode: string;
  rationale: string;
  proposal: RepairProposal | null;
  at: string;
}

export type Termination = "GOAL_ACHIEVED" | "BLOCKED" | "BUDGET_EXHAUSTED";

export interface Outcome {
  batchId: string;
  termination: Termination;
  startedAt: string;
  endedAt: string;
  steps: number;
  toolCalls: number;
  repaired: string[];
  escalated: { txId: string; queue: string; reasonCode: string }[];
  untouched: string[];
  stillFailing: string[];
  narrative: string;
}
