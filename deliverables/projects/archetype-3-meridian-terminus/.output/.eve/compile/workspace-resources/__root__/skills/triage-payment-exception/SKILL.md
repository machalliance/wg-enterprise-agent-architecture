# Triaging a payment exception

The question is never "can I work out the right value". It is "am I the right
party to decide it". Those come apart constantly, and the second one is the one
that matters.

## Codes that are usually a repair (Tier A)

| Code | What it means | Why the value is determined |
|---|---|---|
| `RC01` BankIdentifierIncorrect | BIC malformed or 8 characters where 11 are required | ISO 9362 expands a head-office BIC with branch code `XXX`. One rule, one answer. |
| `CH16` ElementContentFormallyIncorrect on `amount.value` | More decimal places than the currency has | ISO 4217 minor units. `JPY` carries 0, `BHD`/`KWD`/`OMR` carry 3. Removing trailing zeros does not change the amount. |
| `BE19` InvalidChargeBearerCode | Charge bearer not permitted by the scheme | SEPA permits `SLEV` only — there is no second option to choose between. |
| `AC01` IncorrectAccountNumber, *presentation only* | IBAN carries spaces or lowercase | Normalisation is lossless and the normalised value still passes mod-97, so the account identified never changed. |

## Codes that are a proposal at most (Tier B)

| Code | What it means | Why you may not decide it |
|---|---|---|
| `AC01`, *check digit failed* | IBAN fails ISO 7064 MOD 97-10 | Mod-97 **detects** an error without **locating** it. Any correction is a guess about where the money goes. Propose nothing; escalate. |
| `RC08` InvalidClearingSystemMemberIdentifier | ABA checksum fails | Same shape as above — the 3-7-1 weighting detects, it does not locate. |
| `BE01` InconsistenWithEndCustomer | Name does not match the account registry | A difference can be a trading name, a successor entity, or the wrong account. The registry name is a candidate, not a confirmation. |
| `CH21` on `purposeCode` | Scheme requires a purpose code, none supplied | The correct `ExternalPurpose1Code` depends on the commercial intent of the payment, which is not carried in the message. Reading it off the remittance text is inference. |
| `AM03` NotAllowedCurrency | Account not registered for this currency | Could be a data error, could be a genuine multi-currency arrangement. The message cannot tell you which. |
| `BE04` MissingCreditorAddress | Address is not structured | Splitting a clean address line is reformatting; inventing a town or country is not. If the components are not unambiguously present, propose nothing. |

## Codes and states that are a hard stop (Tier C)

Screening state decides this, not the reject code. Any state other than `CLEAR`
freezes the entire instruction — every field, including fields with nothing to do
with the match.

- `POTENTIAL_MATCH` — the filter raised a possible match. Adjudication is a
  trained human's job. Disclose `RR04` RegulatoryReason downstream, which is
  deliberately opaque: you do not tell a counterparty you have a sanctions hit.
- `TRAVEL_RULE_REVIEW` — originator or beneficiary information is incomplete
  under FATF Recommendation 16. Note the trap carefully: the missing value looks
  exactly like a Tier A reformatting job. It is not. We are the **ordering**
  institution, and INR.16 (June 2025) ¶20 requires "required and *accurate*
  originator information", with ¶23 stating that the ordering financial
  institution "should not be allowed to execute the payment" where it does not
  comply. The R.16 glossary defines *accurate* as information "that has been
  verified for accuracy". A value this desk supplied itself has not been
  verified, so supplying it does not produce compliance — it produces the
  appearance of it, which is worse, because the appearance is what the screening
  further down the chain will read.

  (The receiving side has its own rule — for an EU payee's PSP, Regulation (EU)
  2023/1113 Article 8 gives execute, reject or suspend on a risk-sensitive basis,
  or request the missing information. That is not our obligation; it is the
  obligation of the bank we are sending to, and it is one more reason not to hand
  them something invented.)
- `BLOCKED` — confirmed match. The instruction does not proceed in any form.

## Why the freeze is total

The industry has run this experiment. In Lloyds TSB (2009) the DOJ described the
bank removing customer names, bank names and addresses from payment messages and
noted that the bank's own word for the process was *"repair"*. Deutsche Bank's
2015 NYDFS order names a **repair queue** as where references to the principal
were eliminated. Commerzbank staffed a Frankfurt team to amend Iranian payments
so they would not be stopped by US filters. Crédit Agricole resubmitted payments
after a reference was removed. OFAC listed UniCredit's "manual manipulation and
resubmission of payments rejected by U.S. financial institutions" as an
aggravating factor and found the conduct egregious.

Every one of those is a repair desk doing what a repair desk does, to the wrong
instruction. The rule that keeps you out of it is not "be careful with sanctions
cases" — it is that a screened instruction gets no edit, no proposed edit, and no
suggested value travelling with the escalation.
