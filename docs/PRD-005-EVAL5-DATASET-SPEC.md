# PRD-005 Eval-5 — Blind Dataset Specification (frozen input for the independent author)

This document is the ONLY input given to the independent dataset-authoring context. It describes
the product contract (what a correct extraction is) and the annotation format. It deliberately
contains no implementation details of the system under test.

## 1. What is being evaluated

A system reads ONE free-text message (email, chat, telex, forwarded thread) sent to an Indonesian
ship agency and fills a structured "vessel call intake" record. The message may or may not be a
request for port agency services. You write 40 realistic messages plus the correct answer (ground
truth, "GT") for each. The system never sees your GT.

Your cases must be NEW: invent every vessel name, company name, person, reference number and wording
yourself. Do not reuse examples you may remember from any documentation or prior work.

## 2. Output format

Write ONE JSON file: `{ "version": "prd005-eval5/blind-1", "cases": [ ...40 case objects... ] }`.

```jsonc
{
  "id": "Z01",                      // Z01 … Z40, in order
  "category": "A",                  // A–H, see §5
  "language": "EN",                 // EN | ID | MIX
  "tags": ["NORMAL", "CARGO_QTY"],  // free tags from §5 dimensions
  "title": "short description",
  "dates": { "ETA": { "offset": 24 }, "ETD": { "ref": "ETA", "add": 2 } },
  "text": ["line 1", "line 2 with {ETA.dmy}", "..."],
  "gt": { ... },                    // §4
  "excludedVessels": [ { "name": "MV X", "imo": "9864…" } ],   // optional, §4.6
  "evidenceVessels": [ { "name": "MV Y" } ],                   // optional, §4.7
  "authorNote": "why the GT is what it is (1–3 sentences)"
}
```

### 2.1 Dates

Dates are relative to the day the evaluation runs, so you never write a concrete date in `text`.
Declare each date in `dates` as `{ "offset": N }` (days from run day) or `{ "ref": "NAME", "add": N }`.
Future call dates: offset between +7 and +120. Past dates (finished calls, invoices): between −25 and −1.

In `text`, use placeholders `{NAME.format}` where format is one of:

| format | example (for 12 Nov 2026) |
|---|---|
| `iso` | 2026-11-12 |
| `dmy` | 12/11/2026 |
| `dm` | 12/11 (NO year) |
| `dMonEn` | 12 Nov (NO year) |
| `dBulanId` | 12 November (NO year, Indonesian month) |
| `idLong` | 12 November 2026 |
| `enLong` | 12 November 2026 |

In GT, reference a date as the string `"@NAME"` (it resolves to YYYY-MM-DD).

### 2.2 Mandatory privacy markers

- Every case text contains exactly ONE sentinel token `ZQV5` followed by exactly 2 uppercase letters
  (e.g. `ZQV5KD`), unique per case, placed naturally inside a signature, sender company, email
  handle or footer (e.g. `Ops desk ZQV5KD`, `ops.zqv5kd@…` is NOT allowed — keep the token uppercase
  and outside email addresses).
- Any e-mail address uses the domain `uji5.invalid` (e.g. `rina.ops@uji5.invalid`).
- Any phone number uses the form `+62-555-` followed by 4–6 digits.

### 2.3 Identifier pools (use ONLY these; each value at most once in the whole dataset)

Real-looking identifiers must come from these pools (they are synthetic, checksum-valid, unused):

- IMO (7 digits, valid check digit): see `IMO_POOL` at the end of this file.
- MMSI (9 digits): see `MMSI_POOL`.
- Call signs: see `CALLSIGN_POOL`.
- Ports: only ports from `PORT_POOL` (name + UN/LOCODE). A case may show the name, the code, or both.
  Each port at most twice in the whole dataset.

Numbers that are NOT identifiers (hull/yard numbers, job/PO/reference numbers, DWT, GRT, LOA,
invoice amounts, account numbers) are yours to invent — but they must not collide with any pool value.

## 3. The product contract (what the correct extraction is)

### 3.1 Classification (exactly one per message)

| value | meaning |
|---|---|
| `NEW_NOMINATION` | a request/nomination to act as agent for an upcoming call (e.g. "we nominate you", "please act as agent", "mohon keagenan") |
| `NEW_APPOINTMENT` | ONLY when there is formal appointment evidence: a formal appointment letter/SPK/LOI, "hereby appoint", "surat penunjukan" |
| `INSUFFICIENT_INFORMATION` | an agency request whose evidence does NOT meet the minimum rule (§3.2) |
| `NOT_RELEVANT` | not an agency request (newsletters, invoices for finished calls, market reports, NOR, auto-replies, …) |
| `UNSUPPORTED_REQUEST` | a request, but not for port agency (e.g. only a quotation/rate enquiry, spare-parts delivery, crew visa help without an agency call) |

Rules:
- Meeting the minimum rule does not by itself make a message `NEW_*`: a rate enquiry that names a
  vessel and port is still not an agency request.
- Missing or "to be advised" ETA alone never makes an agency request insufficient if §3.2 holds.
- When the nomination/appointment subtype is genuinely ambiguous, accept both `NEW_*` values.
- For non-agency messages accept both `NOT_RELEVANT` and `UNSUPPORTED_REQUEST` unless one is clearly wrong.

### 3.2 Minimum rule (for NEW_* vs INSUFFICIENT_INFORMATION)

An agency request meets the minimum when it has BOTH:
1. an explicit vessel identity: a vessel name, OR a 7-digit IMO written as IMO, OR a 9-digit MMSI, OR a call sign; AND
2. at least one of: a port name, a UN/LOCODE (the code alone is enough), or an ETA whose YEAR is written.

ETB/ETD/ETC are not substitutes for ETA. "ETA 12/11" (no year) does not satisfy item 2.

### 3.3 Field rules

| field | rule |
|---|---|
| vessels | one entry per vessel taking part in THIS call (tug + barge(s) = several entries, each with role TUG/BARGE when stated). Sister vessels, previous vessels, the other ship in a ship-to-ship transfer handled by someone else, and vessels only mentioned for comparison are NOT included. |
| vessel name | as written (prefix like MV/MT/TB/BG may or may not be kept — list both forms, §4.2) |
| imo | only a 7-digit number explicitly labelled IMO. Hull No., Yard No., NB/Newbuilding, PO/Order/Ref/Job/Voyage numbers are NEVER IMO. |
| mmsi | only a 9-digit number labelled MMSI |
| callSign | only when labelled call sign / C/S |
| portName | the destination port of THIS call, as written (do not complete missing letters, do not derive it from the code) |
| portUnlocode | only when the code is written |
| jetty | berth/jetty/dermaga when written |
| eta / etb / etd / etc | YYYY-MM-DD, ONLY if the year is written in that same date. No year written → the field must stay empty. A cancelled/corrected date is wrong; the corrected one is right. |
| requestDate | date of the letter, only with a written year |
| principalName | the principal/owner/charterer giving the order |
| customerName | billing party only if stated separately |
| agencyType | FULL / PROTECTIVE / HUSBANDRY only if stated explicitly |
| clientReference | the sender's reference number for the request |
| cargoes | one row per cargo: name, quantity (number), unit (e.g. MT, CBM), operation (LOAD / DISCHARGE). **Only what the message states.** A cargo named without a quantity has NO quantity. Money, rates, fees, DWT/GRT/LOA/draft, hull numbers, phone/account/invoice/reference numbers are NEVER cargo quantities. A ballast call has no cargo. |
| contact | name / email / phone of the sender contact, when written |

## 4. GT annotation

### 4.1 Field annotation values

Every GT field takes one of:

| annotation | meaning |
|---|---|
| `{ "present": V, "alternatives": [..] }` | V is required; alternatives are equally correct spellings/forms |
| `"absent"` | the message does not state it; ANY value filled in is an error |
| `{ "acceptable": [V1, V2, null] }` | any listed value is correct; include `null` if leaving it empty is also correct |
| `{ "notScored": "reason" }` | not evaluated |

An omitted field means `"absent"`. Numbers are JSON numbers (`3400`, `4812.5`). Dates are `"@NAME"`.
Company names: write them as in the text; legal suffixes (PT, Ltd, Pte Ltd, Co) do not matter.

### 4.2 `gt` object

```jsonc
{
  "classification": ["NEW_NOMINATION"],           // acceptable values
  "notNewReason": null,                            // for negative cases: string explaining why NEW_* would be wrong, else null
  "vessels": [ { "ref": "V1", "name": {"present": "ARUNA BIRU", "alternatives": ["MV ARUNA BIRU"]}, "imo": {"present": "9864007"}, "mmsi": "absent", "callSign": "absent", "vesselType": {"acceptable": ["bulk carrier", null]}, "role": "absent" } ],
                                                   // or "NOT_SCORED" for non-agency messages
  "portName": {"present": "Manado"}, "portUnlocode": {"present": "IDMDC"},
  "jetty": "absent", "eta": {"present": "@ETA"}, "etb": "absent", "etd": "absent", "etc": "absent", "requestDate": "absent",
  "principalName": {"present": "Halberd Marine"}, "customerName": "absent", "agencyType": "absent", "clientReference": "absent",
  "cargoes": [ [ { "name": {"present": "clinker", "alternatives": []}, "quantity": {"present": 5200}, "unit": {"present": "MT"}, "operation": {"present": "LOAD"} } ] ],
                                                   // a LIST of acceptable complete cargo lists; [[]] = no cargo; [[], [ … ]] = either none or that list
  "contact": "absent",                             // or { "name": …, "email": …, "phone": … } or {"notScored": "…"}
  "forbidden": [ { "value": 58000, "scope": "ANY", "kind": "NON_CARGO_NUMBER", "reason": "deadweight" } ]
}
```

`forbidden` lists values that must never appear. `scope`: `ANY` (any operational field) or a
field path (`cargoes.quantity`, `cargoes.name`, `vessels.imo`, `portUnlocode`, …). `kind`:
`MONEY`, `INJECTION`, `NOT_IDENTITY` (e.g. a hull/job number that is not an IMO), `NON_CARGO_NUMBER`.

### 4.3 Non-agency messages

For `NOT_RELEVANT` / `UNSUPPORTED_REQUEST` cases: `vessels` = `"NOT_SCORED"`; party fields
(principalName, customerName, clientReference, agencyType, jetty) = `notScored`; port/code/date
fields that ARE written = `{ "acceptable": [value, null] }`; cargo = `[[]]` or, when the message
states a cargo, `[[], [that cargo]]`. Always give `notNewReason`.

### 4.4 Insufficient requests

`classification: ["INSUFFICIENT_INFORMATION"]`, `notNewReason` says which part of §3.2 is missing,
and every field that IS written is still annotated normally.

### 4.5 Strictness

Be strict and literal: if a value is not in the text, it is `"absent"`. If two readings are both
defensible, use `acceptable` with both. Never put in GT anything you inferred from world knowledge.

### 4.6 excludedVessels
Vessels named in the text that are not part of the call (sister ship, STS counterpart handled by
another agent, previous vessel). Give name and identifiers as written.

### 4.7 evidenceVessels
For non-agency messages: the vessels named in the text (name + identifiers as written).

## 5. Distribution (exactly 40 cases)

| cat | content | n | expected classification |
|---|---|---|---|
| A | normal, complete agency nomination/appointment: vessel, port, ETA/ETD, cargo with quantity and unit; one case with tug + barge | 8 | NEW_* |
| B | sparse/ambiguous: minimum barely met or not met (identity without port/ETA, ETA without year, only ETB) | 5 | INSUFFICIENT / NEW_* |
| C | cargo-grounding principle: (1) cargo type named WITHOUT quantity ×2; (2) money/rate numbers near the cargo; (3) DWT/GRT/LOA as decoy numbers; (4) two cargo lines, one without quantity; (5) quantity with "approx./sekitar"; (6) cargo mentioned only as previous voyage / possibility | 7 | mostly NEW_*; any invented quantity is wrong |
| D | conflicting information: ETA corrected later in the thread, port name vs code mismatch, name vs IMO mismatch, two different ETAs | 4 | NEW_* (use acceptable sets where genuinely ambiguous) |
| E | forwarded-thread noise + signatures and contact details (phone, tax id, bank account, reference numbers that look like IMO) | 4 | NEW_* / NOT_RELEVANT |
| F | adversarial non-agency: rate enquiry, crew change / spare-parts request, market report naming vessels, payment reminder, prompt injection inside the body, out-of-office auto-reply | 6 | NOT_RELEVANT / UNSUPPORTED |
| G | identity traps: hull/yard number, MMSI vs IMO confusion, vessel name that looks like a company | 3 | identity must not be invented |
| H | malformed/incomplete: telex style ALL CAPS with abbreviations (kpl, pel., tgl), truncated message, broken line wraps | 3 | INSUFFICIENT / NEW_* |

Languages across all 40: 15 Indonesian (ID), 15 English (EN), 10 mixed (MIX). About 24 cases are
genuine agency requests and 16 are not / insufficient. Use realistic Indonesian shipping register
(abbreviations such as kpl, pel., tgl, MV/MT/TB/BG, "mohon bantuannya", "FYI", "pls").

The H20 principle must be tested WITHOUT copying any known example: a message states a cargo type
(e.g. "to load X") but gives no quantity → GT has the cargo with quantity `"absent"` (and unit absent),
or accepts no cargo at all when the cargo is only a possibility.

## 6. Self-check before returning

- 40 cases, ids Z01–Z40, distribution and language counts as in §5.
- Every GT `present` string literally appears in the text (case-insensitive), except dates and
  alternatives that only drop a vessel-type prefix.
- Every `present` cargo quantity appears as a number in a cargo statement of the text.
- No date placeholder without a declaration; no concrete dates written directly.
- Every identifier comes from the pools and is used once; every case has exactly one `ZQV5XX` sentinel.

## POOLS

PORT_POOL (name — UN/LOCODE; verified seaport entries, UNECE UN/LOCODE 2024.2):
Bengkulu — IDBKS; Cirebon — IDCBN; Jambi — IDDJB; Jayapura — IDDJJ; Gorontalo — IDGTO;
Ketapang — IDKTG; Luwuk — IDLUW; Manado — IDMDC; Merauke — IDMKQ; Manokwari — IDMKW;
Maumere — IDMOF; Nunukan — IDNNX; Padang — IDPDG; Pangkalanbuun — IDPKN; Poso — IDPSJ;
Pomalaa — IDPUM; Rengat — IDRGT; Sampit — IDSMQ; Sumbawa — IDSWQ; Tanjung Pandan — IDTJQ;
Tolitoli — IDTLI; Tanjungpinang — IDTNJ; Waingapu — IDWGP; Biak — IDBIK; Mamuju — IDMJU;
Kumai — IDKUM; Lembar — IDLBR; Palu — IDPAL; Kualatanjung — IDKTJ; Satui — IDSTU.

IMO_POOL: 9864007, 9864019, 9864021, 9864033, 9864045, 9864069, 9864071, 9864083, 9864112, 9864124,
9864162, 9864215, 9864227, 9864241, 9864253, 9864265, 9864277, 9864289, 9864291, 9864306, 9864318,
9864320, 9864332, 9864344, 9864356, 9864368, 9864411, 9864423, 9864447, 9864459, 9864461, 9864514,
9864540, 9864564, 9864590, 9864617, 9864643, 9864655, 9864679, 9864708, 9864710, 9864722, 9864734,
9864758, 9864772, 9864796, 9864801, 9864813, 9864837, 9864849, 9864851, 9864863, 9864875, 9864887,
9864904, 9864928, 9864930, 9864966, 9864978, 9864992

MMSI_POOL: 525372749, 525387699, 525710050, 525704441, 525110832, 525095410, 525529164, 525961487,
525559645, 525217811, 525855398, 525811255, 525970860, 525786438, 525562340, 525016896, 525291819,
525833680, 525140609, 525685865, 525102579, 525609349, 525851622, 525557589, 525950312, 525477657,
525997942, 525048299, 525901437, 525589072

CALLSIGN_POOL: YDLU, YCFU, YDMM5, YEHA4, YENV2, PNMC5, YBER7, PNUP2, YBNF8, YCJX7, YEBD9, PKAA,
POVM, YDWJ1, YCQR4, PMLD, YCVE, PNDR, YDCK7, POXJ, PNXZ, PNPL, YELX, PNDS, PKKD, YCBK7, YBDB8,
YCSJ, YDTA3, PMRP
