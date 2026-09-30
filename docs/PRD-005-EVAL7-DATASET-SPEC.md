# PRD-005 Eval-7 — Blind Dataset Specification (frozen input for the independent author)

This document is the ONLY input given to the independent dataset-authoring context. It describes the
product contract (what a correct extraction is) and the annotation format. It deliberately contains no
implementation details of the system under test and no information about earlier evaluations.

## 1. What is being evaluated

A system reads ONE free-text message (email, chat, telex, forwarded thread) sent to an Indonesian ship
agency and fills a structured "vessel call intake" record. The message may or may not be a request for
port agency services. You write 40 realistic messages plus the correct answer (ground truth, "GT") for
each. The system never sees your GT.

Write what real ship-agency inboxes in Indonesia actually receive: principals, charterers, owners,
operators, brokers, shippers/receivers and their staff, in Indonesian, English and a mix of both, with
the abbreviations, number formats, units, typos, signatures and forwarding noise that real people use.
Make the set represent operational reality. Do NOT turn it into a list of trick puzzles, and do not try to
guess how the system works internally.

Every vessel name, company, person, reference number and sentence must be invented by you for this set.

## 2. Output format

Write ONE JSON file: `{ "version": "prd005-eval7/blind-1", "cases": [ ...40 case objects... ] }`.

```jsonc
{
  "id": "V01",                      // V01 … V40, in order
  "category": "A",                  // A–I, see §5
  "language": "EN",                 // EN | ID | MIX
  "tags": ["NOMINATION", "CARGO"],  // free tags from the §5 dimensions
  "title": "short description",
  "dates": { "ETA": { "offset": 24 }, "ETD": { "ref": "ETA", "add": 2 } },
  "text": ["line 1", "line 2 with {ETA.dmy}", "..."],
  "gt": { ... },                    // §4
  "excludedVessels": [ { "name": "MV X", "imo": "9873…" } ],   // optional, §4.6
  "evidenceVessels": [ { "name": "MV Y" } ],                   // optional, §4.7
  "reviewNotes": "fields a human reviewer should double-check, if any (not scored)",
  "authorNote": "why the GT is what it is (1–3 sentences)"
}
```

### 2.1 Dates

Dates are relative to the day the evaluation runs, so never write a concrete date in `text`. Declare each
date in `dates` as `{ "offset": N }` (days from run day) or `{ "ref": "NAME", "add": N }`. Future call dates:
offset between +7 and +120. Past dates (finished calls, invoices, previous port): between −25 and −1.

In `text`, use placeholders `{NAME.format}`:

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

- Every case text contains exactly ONE sentinel token `XJW7` followed by exactly 2 uppercase letters
  (e.g. `XJW7QM`), unique per case, placed naturally in a signature, sender company or footer (uppercase,
  never inside an e-mail address).
- Any e-mail address uses the domain `uji7.invalid`.
- Any phone number uses the form `+62-557-` followed by 4–6 digits.

### 2.3 Identifier pools (use ONLY these; each value in at most ONE case)

- IMO (7 digits, valid check digit): `IMO_POOL` below.
- MMSI (9 digits): `MMSI_POOL`.
- Call signs: `CALLSIGN_POOL`.
- Ports: only ports from `PORT_POOL` (name + UN/LOCODE). A case may show the name, the code, or both. Each
  port in at most two cases. Previous/next ports mentioned only for context may also come from the pool.

Numbers that are NOT identifiers (hull/yard numbers, job/PO/reference numbers, tonnages, dimensions,
invoice amounts, account numbers) are yours to invent — they must not collide with any pool value.

## 3. The product contract (what the correct extraction is)

### 3.1 Classification (exactly one per message)

| value | meaning |
|---|---|
| `NEW_NOMINATION` | a request/nomination to act as agent for an upcoming call |
| `NEW_APPOINTMENT` | ONLY with formal appointment evidence: an appointment letter/SPK/LOI, "hereby appoint", "surat penunjukan" |
| `INSUFFICIENT_INFORMATION` | an agency request whose evidence does NOT meet the minimum rule (§3.2) |
| `NOT_RELEVANT` | not an agency request (newsletters, invoices for finished calls, reports, notices, auto-replies, …) |
| `UNSUPPORTED_REQUEST` | a request, but not for port agency (e.g. only a quotation, a supply/delivery, a document service without an agency call) |

- Meeting the minimum rule does not by itself make a message `NEW_*`.
- Missing or "to be advised" ETA alone never makes an agency request insufficient if §3.2 holds.
- When nomination vs appointment is genuinely ambiguous, accept both `NEW_*` values.
- For non-agency messages accept both `NOT_RELEVANT` and `UNSUPPORTED_REQUEST` unless one is clearly wrong.

### 3.2 Minimum rule (NEW_* vs INSUFFICIENT_INFORMATION)

An agency request meets the minimum when it has BOTH:
1. an explicit vessel identity: a vessel name, OR a 7-digit IMO written as IMO, OR a 9-digit MMSI, OR a call sign; AND
2. at least one of: a port name, a UN/LOCODE (the code alone is enough), or an ETA whose YEAR is written.

ETB/ETD/ETC are not substitutes for ETA. "ETA 12/11" (no year) does not satisfy item 2.

### 3.3 Field rules

| field | rule |
|---|---|
| vessels | one entry per vessel taking part in THIS call (tug + barge(s) = several entries, with role TUG/BARGE when stated). Sister vessels, previous vessels, the other ship of a ship-to-ship transfer handled by someone else, and vessels mentioned only for comparison are NOT included. A vessel without any written identity is not an entry. |
| vessel name | as written (prefix like MV/MT/TB/BG may or may not be kept — list both forms) |
| imo | only a 7-digit number explicitly labelled IMO. Hull/Yard/NB, PO/Order/Ref/Job/Voyage numbers are NEVER IMO. |
| mmsi | only a 9-digit number labelled MMSI |
| callSign | only when labelled call sign / C/S |
| portName | the destination port of THIS call, as written (do not complete, do not derive from the code) |
| portUnlocode | only when the code is written |
| jetty | berth/jetty/dermaga when written |
| eta / etb / etd / etc | YYYY-MM-DD, ONLY if the year is written in that same date. No year → empty. A cancelled/corrected date is wrong; the corrected one is right. |
| requestDate | date of the letter, only with a written year |
| principalName | the principal/owner/charterer giving the order |
| customerName | billing party only if stated separately |
| agencyType | FULL / PROTECTIVE / HUSBANDRY only if stated explicitly |
| clientReference | the sender's reference number for the request |
| cargoes | one row per cargo: name, quantity (number), unit (as written, e.g. MT, CBM, or any unit the sender uses), operation (LOAD / DISCHARGE) for THIS call. **Only what the message states.** No quantity written → no quantity. Money, rates, fees, vessel particulars (DWT/GRT/LOA/draft), hull numbers, phone/account/invoice/reference numbers are NEVER cargo quantities. A ballast call has no cargo. |
| contact | name / email / phone of the sender contact, when written |

## 4. GT annotation

### 4.1 Field annotation values

| annotation | meaning |
|---|---|
| `{ "present": V, "alternatives": [..] }` | V is required; alternatives are equally correct spellings/forms |
| `"absent"` | the message does not state it; ANY value filled in is an error |
| `{ "acceptable": [V1, V2, null] }` | any listed value is correct; include `null` if leaving it empty is also correct |
| `{ "notScored": "reason" }` | not evaluated |

An omitted field means `"absent"`. Numbers are JSON numbers. Dates are `"@NAME"`. Company names as in the
text; legal suffixes (PT, Ltd, Pte Ltd, Co) do not matter.

**Ambiguity and review.** Where a careful human would say the message is genuinely ambiguous about a field
(two defensible readings, or a value a reviewer must confirm), make that field `acceptable` with every
defensible reading — including `null` when leaving it empty is a safe, correct outcome — and name the field
in `reviewNotes`. Never make a field `present` when a careful reader could disagree.
A cargo unit only has meaning together with its quantity: whenever a cargo quantity may be `null`, its unit must
also accept `null`.

### 4.2 `gt` object

```jsonc
{
  "classification": ["NEW_NOMINATION"],
  "notNewReason": null,                  // negative cases: why NEW_* would be wrong; else null
  "vessels": [ { "ref": "V1", "name": {"present": "SEROJA LAUTAN", "alternatives": ["MV SEROJA LAUTAN"]}, "imo": {"present": "1234567"}, "mmsi": "absent", "callSign": "absent", "vesselType": {"acceptable": ["bulk carrier", null]}, "role": "absent" } ],
                                          // or "NOT_SCORED" for non-agency messages; [] when no vessel identity is written
  "portName": {"present": "Example Port"}, "portUnlocode": {"present": "IDXXX"},
  "jetty": "absent", "eta": {"present": "@ETA"}, "etb": "absent", "etd": "absent", "etc": "absent", "requestDate": "absent",
  "principalName": {"present": "Palmwind Shipping"}, "customerName": "absent", "agencyType": "absent", "clientReference": "absent",
  "cargoes": [ [ { "name": {"present": "example cargo", "alternatives": []}, "quantity": {"present": 1111}, "unit": {"present": "MT"}, "operation": {"present": "DISCHARGE"} } ] ],
                                          // a LIST of acceptable complete cargo lists; [[]] = no cargo; [[], [ … ]] = either
  "contact": "absent",                    // or { "name": …, "email": …, "phone": … } or {"notScored": "…"}
  "forbidden": [ { "value": 22222, "scope": "ANY", "kind": "NON_CARGO_NUMBER", "reason": "deadweight" } ]
}
```

(The names and numbers above only illustrate the format — do not use them.)

`forbidden`: values that must never appear. `scope`: `ANY` or a field path (`cargoes.quantity`,
`cargoes.name`, `vessels.imo`, `portUnlocode`, …). `kind`: `MONEY`, `INJECTION`, `NOT_IDENTITY`,
`NON_CARGO_NUMBER`.

### 4.3 Non-agency messages
`vessels` = `"NOT_SCORED"`; party fields (principalName, customerName, clientReference, agencyType, jetty) =
`notScored`; port/code/date fields that ARE written = `{ "acceptable": [value, null] }`; cargo = `[[]]` or,
when the message states a cargo, `[[], [that cargo]]`. Always give `notNewReason`.

### 4.4 Insufficient requests
`classification: ["INSUFFICIENT_INFORMATION"]`, `notNewReason` says which part of §3.2 is missing; every
field that IS written is still annotated.

### 4.5 Strictness
Literal: if a value is not in the text, it is `"absent"`. Never put in GT anything inferred from world
knowledge or from what is merely maritime-plausible.

### 4.6 excludedVessels — vessels named but not part of the call (name + identifiers as written).
### 4.7 evidenceVessels — for non-agency messages: the vessels named (name + identifiers as written).

## 5. Distribution (exactly 40 cases)

This set must represent the everyday reality of an Indonesian ship-agency inbox. Where a category below names a
difficult situation, write it the way real senders produce it (not as a riddle), and annotate the GT strictly by §3–§4.
Do NOT design messages so that some system passes or fails; you do not know how any system works.

| cat | content | n | expected |
|---|---|---|---|
| A | clear nomination or formal appointment for an upcoming call: vessel identity, port (name and/or code), dates and usually cargo; include at least one tug + barge set, at least one tanker, and at least one formal appointment | 7 | NEW_* |
| B | sparse or incomplete requests: very short chat/WhatsApp messages, missing port or missing vessel identity, dates without year, "details to follow" — some meet §3.2, some do not | 5 | NEW_* / INSUFFICIENT |
| C | cargo as operations staff really write it: several cargoes, bulk/bagged/liquid/project/containers, many different units (MT, ton, CBM, KL, bbls, bags/zak, units, TEU, …), Indonesian and English number formats, cargo named without a figure, approximate figures and ranges, load and discharge (including one call that loads one cargo and discharges another) | 6 | NEW_* |
| D | this call's cargo written beside figures of ANOTHER voyage, call, trip or cargo (previous/last voyage, last cargoes for tank cleanliness, next voyage plan, figures of a sister vessel) — only this call's cargo is cargo; the other figures are `forbidden` for `cargoes.quantity` | 4 | NEW_* |
| E | product grades, model numbers or specifications written next to quantities (fuel grades, fertilizer formula numbers, cement types, steel sizes, equipment models) — the grade/model/specification is part of the cargo NAME, never the quantity | 3 | NEW_* |
| F | a genuine request where the message itself does not make clear which figure belongs to which cargo (e.g. two cargoes and figures separated by other text, one total figure for two commodities, a figure whose commodity is not stated) — annotate every defensible reading, and `null` for quantity where a careful reader could not decide (§4.1) | 3 | NEW_* |
| G | corrections inside forwarded or replied threads (changed ETA, port, quantity or vessel; cancelled and re-sent nomination) | 3 | NEW_* (acceptable sets where genuinely ambiguous) |
| H | noisy formatting around a genuine or insufficient request: WhatsApp exports with timestamps and emojis, heavy signatures/disclaimers/bank and tax details, telex or OCR-like text, broken line wraps, truncated messages; include at least two vessel-identity traps (IMO vs MMSI vs call sign vs hull/yard/PO/reference numbers, a company name resembling a vessel) | 4 | NEW_* / INSUFFICIENT |
| I | adversarial or non-agency content: quotation-only request, supply/spare-parts or crew-change-only request, port/market report or newsletter, invoice or payment reminder for a finished call, and one message containing embedded instructions aimed at an automated reader | 5 | NOT_RELEVANT / UNSUPPORTED |

Languages over all 40: 15 Indonesian (ID), 13 English (EN), 12 mixed (MIX). Roughly 26 genuine agency requests and
14 not / insufficient. Across the set cover: nomination and appointment, IMO/MMSI/call sign, ports by name and by code,
ETA/ETD/ETB, cargo quantities with units and cargo without figures, LOAD and DISCHARGE, fields that are simply missing
(which must be `"absent"`), signatures/contact noise and unrelated numbers.

## 6. Self-check before returning

- 40 cases, ids V01–V40, distribution and language counts as §5.
- Every GT `present` string appears literally in the text (case-insensitive), except dates and alternatives
  that only drop a vessel-type prefix; cargo-name alternatives may be translations/synonyms.
- Every `present` cargo quantity appears as a number in a cargo statement of the text.
- No date placeholder without a declaration; no concrete dates written directly.
- Identifiers only from the pools, each in one case; exactly one `XJW7XX` sentinel per case.

## POOLS

PORT_POOL (name — UN/LOCODE; UN/LOCODE code list, Indonesian seaport entries):
Ampana — IDAPN; Amurang — IDTZD; Balohan — IDBLH; Bunyu — IDBYQ; Ciwandan — IDCIW; Elat — IDELA; Kariangau — IDKRG;
Kokas — IDKOK; Krueng Geukueh — IDKGH; Kuala Enok — IDENO; Kualalangsa — IDKUA; Lobam — IDLBM; Marabahan — IDMAR;
Muara Pantai — IDMPN; Muara Sabak — IDMSK; Pagerungan — IDPGA; Pagimana — IDPGM; Piru — IDPIR; Pomako — IDPMK;
Poto Tano — IDPOT; Pulangpisau — IDPPS; Sumenep — IDSUM; Sunut — IDSUN; Tanjung Buli — IDTBU; Tanjung Pemancingan — IDTPN;
Tanjungbalai — IDTJB; Tarjun — IDTAR; Terempa — IDTER; Wanam — IDWAN; Weda — IDWED.

IMO_POOL: 9880257, 9880295, 9880324, 9880594, 9880960, 9881005, 9881770, 9881835, 9881926, 9882009, 9882138, 9882190,
9882255, 9882437, 9882669, 9882762, 9882865, 9882956, 9883431, 9883601, 9884112, 9884552, 9884734, 9884928, 9885233,
9885403, 9885623, 9885661, 9885893, 9886029, 9886378, 9886380, 9886445, 9886665, 9886859, 9886952, 9887035, 9887047,
9887059, 9887255, 9887748, 9888053, 9888077, 9888211, 9888376, 9888455, 9888546, 9888766, 9889100, 9889227, 9889368,
9889447, 9889473, 9889552, 9889617, 9889693, 9889784, 9889863, 9889875, 9889980

MMSI_POOL: 525100653, 525101645, 525110149, 525149280, 525205486, 525275344, 525344590, 525352640, 525354866, 525363706,
525465014, 525473014, 525545930, 525631446, 525693451, 525719750, 525796153, 525800367, 525808340, 525863033, 525894668,
525911935, 525918255, 525919307, 525922112, 525924292, 525943949, 525953485, 525959673, 525964038

CALLSIGN_POOL: PKMWY, PKULE, PLCS, PLJG, PLNNU, PLTMM, PNAA, PNNX3, PNQBT, PNTR, PNYCQ, PNZY, POPY, YCNP, YCXN, YDJVY,
YDLC7, YDPU, YDUD3, YEAJE, YEGT, YEVD, YFBD, YFHX, YFNA, YGDQ3, YGFV3, YHAZ, YHCK2, YHNF
