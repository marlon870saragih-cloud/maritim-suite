# PRD-005 Eval-6 — Blind Dataset Specification (frozen input for the independent author)

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

Write ONE JSON file: `{ "version": "prd005-eval6/blind-1", "cases": [ ...40 case objects... ] }`.

```jsonc
{
  "id": "W01",                      // W01 … W40, in order
  "category": "A",                  // A–H, see §5
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

- Every case text contains exactly ONE sentinel token `XJW6` followed by exactly 2 uppercase letters
  (e.g. `XJW6KD`), unique per case, placed naturally in a signature, sender company or footer (uppercase,
  never inside an e-mail address).
- Any e-mail address uses the domain `uji6.invalid`.
- Any phone number uses the form `+62-556-` followed by 4–6 digits.

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

### 4.2 `gt` object

```jsonc
{
  "classification": ["NEW_NOMINATION"],
  "notNewReason": null,                  // negative cases: why NEW_* would be wrong; else null
  "vessels": [ { "ref": "V1", "name": {"present": "KARANG DELIMA", "alternatives": ["MV KARANG DELIMA"]}, "imo": {"present": "9873010"}, "mmsi": "absent", "callSign": "absent", "vesselType": {"acceptable": ["bulk carrier", null]}, "role": "absent" } ],
                                          // or "NOT_SCORED" for non-agency messages; [] when no vessel identity is written
  "portName": {"present": "Tobelo"}, "portUnlocode": {"present": "IDTBO"},
  "jetty": "absent", "eta": {"present": "@ETA"}, "etb": "absent", "etd": "absent", "etc": "absent", "requestDate": "absent",
  "principalName": {"present": "Northgate Chartering"}, "customerName": "absent", "agencyType": "absent", "clientReference": "absent",
  "cargoes": [ [ { "name": {"present": "gypsum", "alternatives": []}, "quantity": {"present": 6300}, "unit": {"present": "MT"}, "operation": {"present": "DISCHARGE"} } ] ],
                                          // a LIST of acceptable complete cargo lists; [[]] = no cargo; [[], [ … ]] = either
  "contact": "absent",                    // or { "name": …, "email": …, "phone": … } or {"notScored": "…"}
  "forbidden": [ { "value": 42500, "scope": "ANY", "kind": "NON_CARGO_NUMBER", "reason": "deadweight" } ]
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

| cat | content | n | expected |
|---|---|---|---|
| A | clear agency nomination or formal appointment for an upcoming call, with identity, port, dates and (usually) cargo; include at least one tug + barge set and at least one tanker | 8 | NEW_* |
| B | sparse or ambiguous requests (very short chat messages, missing pieces, only partial dates) | 5 | NEW_* / INSUFFICIENT |
| C | cargo as operations staff really write it: several cargoes, bulk/bagged/liquid/project cargo, different units and number formats, cargo named without a figure, approximate figures, cargo for another port/previous voyage mentioned beside this call's cargo | 6 | mostly NEW_* |
| D | corrections inside forwarded threads (changed ETA, changed port, changed vessel/nominated substitute, cancelled and re-sent nomination) | 5 | NEW_* (acceptable sets where genuinely ambiguous) |
| E | heavy signatures, disclaimers, contact blocks, bank details, tax numbers and unrelated reference numbers around a genuine request | 4 | NEW_* |
| F | adversarial or non-agency content: quotation request, supply/spare-parts or crew-only request, port/market report, invoice or payment reminder, notice/NOR-type message, and one message containing embedded instructions aimed at an automated reader | 6 | NOT_RELEVANT / UNSUPPORTED |
| G | vessel-identity traps: IMO vs MMSI vs call sign vs hull/yard/reference numbers, similar vessel names, company name resembling a vessel | 3 | NEW_* / INSUFFICIENT |
| H | malformed messages: truncated mid-sentence, OCR-like or telex-like text pasted into e-mail, broken line wraps | 3 | NEW_* / INSUFFICIENT |

Languages over all 40: 15 Indonesian (ID), 15 English (EN), 10 mixed (MIX). Roughly 24 genuine agency
requests and 16 not / insufficient. Across the set cover: nomination and appointment, IMO/MMSI/call sign,
ports by name and by code, ETA/ETD/ETB, cargo quantities with units and cargo without figures, LOAD and
DISCHARGE operations, signatures/contact noise and unrelated numbers.

## 6. Self-check before returning

- 40 cases, ids W01–W40, distribution and language counts as §5.
- Every GT `present` string appears literally in the text (case-insensitive), except dates and alternatives
  that only drop a vessel-type prefix; cargo-name alternatives may be translations/synonyms.
- Every `present` cargo quantity appears as a number in a cargo statement of the text.
- No date placeholder without a declaration; no concrete dates written directly.
- Identifiers only from the pools, each in one case; exactly one `XJW6XX` sentinel per case.

## POOLS

PORT_POOL (name — UN/LOCODE; UNECE UN/LOCODE 2024.2 seaport entries):
Bima — IDBMU; Benoa — IDBOA; Bula — IDBUA; Celukan Bawang — IDCEB; Dobo — IDDOB; Fak Fak — IDFKQ;
Gunung Sitoli — IDGNS; Jepara — IDJEP; Kalabahi — IDKBH; Kendawangan — IDKDW; Kuala Kapuas — IDKKA;
Kolonodale — IDKNL; Labuha — IDLAH; Labuan Bajo — IDLBO; Mangole — IDMAL; Meulaboh — IDMEQ;
Manggis — IDMGB; Muara Teweh — IDMUW; Pantoloan — IDPTL; Ranai — IDRNI; Sape — IDSAP;
Sungai Pakning — IDSEQ; Sidangoli — IDSID; Sekupang — IDSKP; Sinabang — IDSNG; Tanjunguban — IDTAN;
Toboali — IDTBL; Tobelo — IDTBO; Telukbayur — IDTBR; Tual — IDTUA.

IMO_POOL: 9873010, 9873022, 9873058, 9873072, 9873084, 9873096, 9873113, 9873151, 9873163, 9873175,
9873187, 9873204, 9873216, 9873230, 9873242, 9873254, 9873292, 9873307, 9873319, 9873321, 9873371,
9873383, 9873395, 9873400, 9873424, 9873436, 9873462, 9873474, 9873486, 9873527, 9873539, 9873541,
9873553, 9873565, 9873577, 9873589, 9873591, 9873618, 9873620, 9873632, 9873644, 9873668, 9873682,
9873694, 9873723, 9873735, 9873747, 9873759, 9873761, 9873797, 9873802, 9873814, 9873852, 9873864,
9873888, 9873890, 9873905, 9873943, 9873979, 9873993

MMSI_POOL: 525318715, 525853150, 525847033, 525638115, 525787421, 525647684, 525158499, 525640816,
525018975, 525100364, 525726203, 525590287, 525843631, 525448470, 525948842, 525150136, 525938890,
525664476, 525797990, 525982830, 525849512, 525943181, 525315836, 525942101, 525580527, 525511768,
525795968, 525575527, 525545740, 525110374

CALLSIGN_POOL: YHBE1, YGHD8, PKPX, PMER2, YCCB, YGLC9, YCWM5, YDPK, YEKE, YHAA7, YDGT3, YEFM, YCEH,
YBCH1, YCEX, YCDR, YDDR, PMMU6, YBBD, YCJF, YGPB, YDHR9, YHGR, PNFX3, YDCB, PKQZ5, YHUP, PNAN2, YHUL6, YENX
