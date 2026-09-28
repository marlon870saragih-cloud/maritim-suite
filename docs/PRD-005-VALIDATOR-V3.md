# PRD-005 — Generalized Cargo Validator V3 (frozen specification)

Status: FROZEN before any production validator code was edited. The sha256 of this file is recorded in
`prisma/spike-kandidat-v3.mjs` (`SHA_SPEK_V3`) and checked by `prisma/check-validator-v3.mjs`. Every V3 rule in
`src/services/intake/intake-policy.ts` and `src/lib/maritim-lexicon-v3.ts` cites a section of this document (`SPEC:V3 §n`).

Principle: the validator VERIFIES whether a model-proposed cargo fact is supported by source evidence. It does NOT
rediscover cargo facts from an inclusion whitelist. No model/network call inside the validator. Deterministic.

## 1. Owner decisions (locked)

| ID | Decision |
|---|---|
| D1 | Source fidelity. "10,000 ton" → quantity 10000, unit `ton`. Never normalize TON→MT / TON→METRIC TONNE. Finance conversion out of scope. |
| D2 | Document-level operation only as VALUE + REVIEW_REQUIRED, never trusted, only under the bounded conditions of §5.4. Ambiguous → null + review. Supersedes the absolute Z17 rejection. |
| D3 | Past/previous operation evidence never becomes trusted current operation. |
| D4 | Non-mass units (zak, bags, units, pcs, BBLS, barrels, TEU, and other literal source units) retained literally; never tonne-equivalent here. Unknown-but-source-supported unit is not automatically invalid. |
| D5 | Stopping rule: max TWO fresh blind datasets for V3; perfect-answer ceiling before LIVE; no vocabulary patching from evaluation cases; rule-class changes only; if V3 misses the ceiling after two fresh datasets while safe → stop, conservative review routing + owner re-baseline. |
| D6 | Quality gate: overall correctness ≥ 90%; correct trusted AND correct review-required values both count as correct; an incorrect value is WRONG regardless of flag. Safety gate: trusted unsupported/misattributed critical facts = 0. Report trusted-correct %, review-correct %, null/manual %, overall-correct %, review rate %. |
| D7 | Past-only operation evidence → NULL + `CARGO_OPERATION_PAST_REFERENCE`. Never VALUE + REVIEW. |
| APX | Approximation markers (§4.6) retain the literal quantity but always flag `APPROXIMATE_QUANTITY` (never trusted). |

## 2. Architecture

```
RAW row {name N, quantity Q, unit U, operation O}
  [0] span tokenizer (§3)            tokens {text, start, end, kind W|N|S}; joined = zero gap
  [1] zone map (§6)                  TOP | QUOTED | SIG per physical line
  [2] structure (§5.1)               logical lines → cargo blocks → label groups → segments → sentences
  [3] name (§4.1)                    literal token sequence in TOP/QUOTED (OCR fold path unchanged)
  [4] quantity + unit (§4)           proposed-pair verification + exclusion engine + approximation
  [5] operation (§5)                 closed morphology families → evidence items → tier resolver T1/T2/T3
  [6] correction (§6.3)              explicit replacement patterns; otherwise null + review
  → POST row {value | null, flags[], jejak (rule ids, tier, zone; NO source text)}
```

## 3. Tokenization

3.1 Tokens are scanned left to right over a logical line: `N` = `\d+([.,]\d+)*`; `W` = run of letters (A–Z, a–z,
Latin-1/Extended letters, `³`, `²`); `S` = any other single non-space character. Each token has a character span.
`joined(a,b)` ⇔ zero characters between a and b.

3.2 Compound: tokens joined through `-` or `/` to an alphanumeric token on either side form a compound
(`H-BEAM`, `I-BEAM`, `PO-4518`, `LOAD/DISCHARGE`). A compound member is never a standalone label (§4.4) and never
standalone operation evidence (§5.2).

3.3 Numbers: value by the unchanged single-reading rule (`nilaiAngkaSumber`). A number joined on its LEFT to a letter,
or joined on its left through `-` `/` `.` `#` to an alphanumeric token, is a reference fragment (excluded), except a
range (§4.6). A number joined on its RIGHT directly to letters (`5000MT`, `3200m³`) is a quantity with a glued unit.

3.4 Name matching keeps the existing whole-word token form (`tokenLeksikon`): uppercase A–Z0–9 runs.

## 4. Quantity and unit

4.1 Name: token sequence of N present in a TOP or QUOTED logical line (OCR fold path with `OCR_CORRECTED` unchanged).
SIG-only names are not evidence. Generic words (`CARGO`, `MUATAN`, …) still drop the row.

4.2 Unit shape (model U): 1–3 space-separated parts, each starting with a letter, containing only letters, digits,
`³`, `²`, `.`; ≤ 20 characters; no `/`, `-`, `%`. Otherwise unit → null (`CARGO_UNIT_NOT_IN_SOURCE`).

4.3 Unit deny classes (safety lexicon, closed): length (M, MTR, METER(S), METRE(S), CM, MM, KM, FT, FEET, FOOT, INCH,
NM, NMI, MILE(S)); speed (KN, KNOT(S), KTS); time (SEC, DETIK, MIN, MENIT, HR(S), HOUR(S), JAM, DAY(S), HARI, WEEK(S),
MINGGU, MONTH(S), BULAN, YEAR(S), TAHUN); percent (PCT, PERCENT, PERSEN); temperature/power (DEG, DEGREE(S),
CELSIUS, KW, KVA, RPM); currency (lexicon currencies + RUPIAH, DOLLAR(S)); rate words (lexicon money/rate words);
vessel particulars (DWT, GRT, NRT, GT, LOA, BEAM, DRAFT, DRAUGHT, DEADWEIGHT); identifier/contact/account/berth
labels (§4.4 list); vessel prefixes except MT (MV, TB, TK, OB, SPOB, LCT, KM, KMP); vessel/crew words (VESSEL(S),
SHIP(S), KAPAL, TUG(S), BARGE(S), TONGKANG, CREW, ORANG, PERSONS, PAX, GANG(S), SHIFT(S), HATCH(ES), PALKA);
company forms (PT, CV, TBK, LTD, PTE, INC, CO, CORP, LLC); months and days (EN/ID names and abbreviations);
dimension (X); ~45 ID/EN function words (TO, FOR, AND, OR, OF, IN, AT, ON, BY, FROM, WITH, THE, A, AN, IS, ARE, BE,
WILL, AS, PER, EACH, DAN, ATAU, DI, KE, DARI, UNTUK, UTK, DENGAN, DGN, YANG, YG, PADA, OLEH, SEBAGAI, AKAN, SUDAH,
TELAH, ITU, INI, DALAM, BAGI, SETIAP, TIAP, SEKITAR, APPROX, ABT, ABOUT); every operation-family form (§5.2).
A unit part in any deny class → the unit is not a cargo unit.

4.4 Exclusion engine for a number occurrence (any one → excluded):
- inside a date/time span (unchanged date patterns);
- label immediately before (skipping only `:` `=` `#` `.` `(` `)` `-`): IMO, MMSI, NO, NR, NOMOR, REF, VOY, VOYAGE,
  HULL, YARD, PO, CALL SIGN, INV, INVOICE, CONTRACT, KONTRAK, BL, GRT, NRT, GT, DWT, LOA, BEAM, DRAFT, DRAUGHT,
  DEADWEIGHT, TEL, TELP, TELEPON, PHONE, HP, WA, WHATSAPP, FAX, MOBILE, REKENING, REK, ACCOUNT, ACC, NPWP, BERTH,
  JETTY, DERMAGA, PIER, WHARF — only if the label is STANDALONE (not a compound member, §3.2) and NOT inside the
  matched span of the proposed cargo name on that line;
- phone chain (unchanged `fragmenTelepon`);
- money: currency or rate word in the same clause before the number (clause = since the last `;` `(` `)` `|` tab or
  `, `), `$` right before, or a currency/rate word right after;
- rate: after the unit, `/` or PER/EACH/SETIAP/TIAP; before the number, `@` or PER/EACH/SETIAP/TIAP;
- percent: `%` right after the number;
- dimension: `x`/`X`/`×` directly adjacent before or after;
- reference fragment (§3.3);
- the occurrence lies in a SIG line.

4.5 Pair verification (occurrence of Q that survives §4.4):
1. Adjacency point = right after Q (only spaces, one `|` with spaces, or nothing between).
2. Model U given and shape-valid:
   - LITERAL: the source text at the adjacency point starts with U (compare uppercase, `³`→3, `²`→2, whitespace
     collapsed) followed by a non-alphanumeric boundary → unit kept with the SOURCE spelling (D1). Rule `U_LITERAL`.
   - LEGACY: U and the source unit phrase belong to the same frozen v2 alias group (MT: MT, METRIC TON(S), METRIC
     TONNE(S), TONNE(S); CBM: CBM, M3; WMT; KL) → unit kept as the model wrote it (v2 behaviour, closed, never grows;
     TON/TONS deliberately NOT in any group, D1). Rule `U_LEGACY`.
3. The quantity is verified if at the adjacency point there is: the model's unit (above), OR a unit-shaped source
   token (a `W` token not in any §4.3 deny class), OR a quantity label (QTY, QUANTITY, KUANTITAS, JUMLAH) immediately
   before Q, OR the labelled-unit form `QTY/QUANTITY/JUMLAH (U) : Q`. If the model's unit does not match but the
   quantity is verified → quantity kept, unit null + `CARGO_UNIT_NOT_IN_SOURCE`.
4. Glued unit (`5000MT`) is the same as step 2/3 with an empty gap.
5. OCR digits (O/o→0, I/l→1) only with ≥ 2 real digits and a verified unit → `OCR_CORRECTED` (unchanged D8).
6. Q null → U null (`CARGO_UNIT_WITHOUT_QUANTITY`, unchanged).
7. Unit outside the informational standard set {MT, METRIC TON(S), METRIC TONNE(S), TONNE(S), CBM, M3, WMT, KL} →
   `CARGO_UNIT_NONSTANDARD` (informational; not a gate, not in the confirmation list).

4.6 Approximation (closed family; literal value kept; flag `APPROXIMATE_QUANTITY`):
- prefix, within the 3 tokens before Q in the same segment: `±`, `+/-`, `+-`, `+ / -`, `~`, `≈`, APPROX, APPROXIMATELY,
  APPRX, ABT, ABOUT, AROUND, CIRCA, ROUGHLY, NEARLY, EST, ESTIMATED, ESTIMATE, SEKITAR, KURANG LEBIH, LEBIH KURANG,
  KIRA KIRA / KIRA-KIRA, ESTIMASI; `CA` / `CA.` only directly before Q;
- suffix, in the same segment after the unit: `+/- n%`, `± n%`, MOLOO, MOLCO, TOLERANCE, TOLERANSI;
- range: `Q1 - Q2 U`, `Q1 – Q2 U`, `Q1 TO Q2 U`, `Q1 S/D Q2 U`, `Q1 SAMPAI Q2 U`, `Q1 HINGGA Q2 U`: Q equal to either
  end is verified with the unit after Q2 and is approximate.

4.7 Binding windows (misattribution guard). A verified occurrence binds to cargo row N only if it lies in:
- a segment (§5.1) of a logical line that overlaps a mention of N; or
- a segment with NO cargo name, on a logical line that mentions N and no other RAW cargo name; or
- N's cargo block (§5.1) when that block mentions no other RAW cargo name; or
- a cargo-label logical line (first token CARGO, CARGOES, MUATAN, KARGO, COMMODITY, KOMODITAS, OPERATION, KEGIATAN,
  QTY, QUANTITY, KUANTITAS, JUMLAH) when N is the ONLY name-verified cargo row of the proposal.
Found only in windows of another cargo → null + `CARGO_RELATION_AMBIGUOUS`. Not found → `CARGO_QUANTITY_NOT_IN_SOURCE`.
Preference among bound occurrences: TOP over QUOTED, then exact over OCR, then non-approximate over approximate.

## 5. Operation

5.1 Structure.
- Logical line: physical line L[i] is joined with L[i+1] (at most one join per pair; no chains) iff both are
  non-empty, same zone, L[i] does not end with `.` `:` `;` `!` `?`, L[i+1] does not start with a bullet/list marker
  (`•` `-` `*` `·` `a.` `1.` `(a)`), `>` or a `Label:` pattern, and (L[i+1] starts with a lowercase letter OR L[i] ends
  with a digit OR L[i] ends with `-`).
- Cargo block: header = logical line whose first word is a cargo label (§4.7 list without OPERATION/KEGIATAN) followed
  by `:` (or ending with `:`); items = following consecutive non-empty logical lines that are list items or indented
  (≥ 2 leading spaces); ends at a blank line, a non-list `Label:` line or a zone change.
- Label group: consecutive non-empty lines of the form `Label: value` (label ≤ 30 chars). Operation label lines:
  label OPERATION(S), OPERASI, KEGIATAN, ACTIVITY, CARGO OPERATION.
- Segment: part of a logical line between `;` `,`+space `+` `&` AND DAN SERTA (numbers keep internal separators).
- Clause: part of a logical line between `.` `;` `?` `!` (a `.` inside a number token is not a separator).
- Sentence (T2): clause-like split of the paragraph (consecutive non-empty logical lines, same zone) at `.` `?` `!`;
  if longer than 40 tokens, the ±20 tokens around the mention of N.

5.2 Closed morphology families (whole standalone tokens only; compounds excluded):

| Family | STRONG | WEAK | PAST-ONLY form |
|---|---|---|---|
| LOAD | LOAD, LOADS, LOADING, MUAT, MEMUAT, MEMUATKAN, PEMUATAN | LOADED, DIMUAT | TERMUAT |
| DISCHARGE | DISCHARGE, DISCHARGES, DISCHARGING, DISCH, DISCHG, UNLOAD, UNLOADS, UNLOADING, BONGKAR, MEMBONGKAR, PEMBONGKARAN, BONGKARAN | DISCHARGED, UNLOADED, DIBONGKAR | TERBONGKAR |

- WEAK → STRONG when one of AKAN, WILL, BE, SHALL, UNTUK, UTK, RENCANA, PLANNED occurs within the 2 word tokens before it
  (`to be loaded`, `will be discharged`, `akan dimuat`, `untuk dimuat`).
- Never operation evidence: MUATAN, BERMUATAN, KARGO (nouns), and every non-operation phrase, removed before matching:
  LOAD PORT, LOADING PORT, PORT OF LOADING, PORT OF DISCHARGE, DISCHARGE PORT, DISCHARGING PORT, POL, POD, PELABUHAN
  MUAT, PELABUHAN BONGKAR, LOADED DRAFT, LOADED DRAUGHT, LOAD LINE, LOADLINE, COMPLETION OF LOADING, COMPLETION OF
  DISCHARGE, LOADING COMPLETED, DISCHARGE COMPLETED, DISCHARGING COMPLETED, LOADING RATE, DISCHARGE RATE, DISCHARGING
  RATE, LOAD RATE, LOADING MASTER, BONGKAR MUAT, MUAT BONGKAR, TKBM, L/D, LOAD/DISCHARGE.
- Tense: an item is PAST if its clause contains a past marker: WAS, WERE, HAS BEEN, HAD BEEN, PREVIOUS, PREVIOUSLY,
  LAST VOYAGE, LAST PORT, LAST CARGO, LAST CALL, LAST TRIP, EX, FORMER, FORMERLY, PRIOR, EARLIER, ALREADY, COMPLETED,
  TELAH, SUDAH, SEBELUMNYA, LALU, TERAKHIR, SELESAI, EKS; PAST-ONLY forms are always PAST.

5.3 Evidence items {family, strength, past, zone}. Zone selection: TOP first; QUOTED only if TOP has no operation item
(current or past) at any tier for this row and QUOTED is not suppressed (§6.2); QUOTED-derived values always get
`CARGO_EVIDENCE_QUOTED` (never trusted). SIG never.

5.4 Tier resolver for model O (opposite = the other family; "current" = not PAST):
- T1 window: logical lines mentioning N; N's cargo block (header + items) when it mentions no other RAW cargo;
  operation label lines of a label group containing a mention of N; cargo-label lines when N is the only
  name-verified cargo row; the line of the bound quantity.
  - current O STRONG and current opposite present → keep + `CARGO_OPERATION_AMBIGUOUS`;
  - current opposite only (any strength) → null + `CARGO_OPERATION_CONTRADICTS_SOURCE` (resolution stops);
  - current O STRONG only → TRUSTED (no flag) — unless zone QUOTED (then `CARGO_EVIDENCE_QUOTED`);
  - current O WEAK only → keep + `CARGO_OPERATION_CONTEXTUAL`.
- T2 window: the sentence (§5.1) containing a mention of N.
  - current O and current opposite → keep + `CARGO_OPERATION_AMBIGUOUS` + `CARGO_OPERATION_CONTEXTUAL`;
  - current opposite only → null + `CARGO_OPERATION_CONTRADICTS_SOURCE`;
  - current O only → keep + `CARGO_OPERATION_CONTEXTUAL`.
- T3 (D2), keep + `CARGO_OPERATION_DOCUMENT_LEVEL` only if ALL:
  1. exactly one name-verified cargo row in the proposal;
  2. the set of families of current items in the selected zone (excluding SIG) is exactly {O} with ≥ 1 item;
  3. no correction marker (§6.3) in TOP;
  4. not multi-port, or the item's sentence contains the POST port name tokens or POST UN/LOCODE. Multi-port ⇔ both a
     load-port and a discharge-port phrase present (POL/POD, LOAD(ING) PORT/DISCHARGE PORT, PORT OF LOADING/PORT OF
     DISCHARGE, PELABUHAN MUAT/PELABUHAN BONGKAR), OR any of LAST PORT, NEXT PORT, PREVIOUS PORT, PELABUHAN SEBELUMNYA,
     PELABUHAN BERIKUTNYA, TRANSIT, OR ≥ 2 distinct UN/LOCODE-shaped tokens (`[A-Z]{2}[A-Z2-9]{3}` directly after `(`,
     ` - ` or a LOCODE/UNLOCODE label).
- Otherwise: past O items exist → null + `CARGO_OPERATION_PAST_REFERENCE` (D7); else null + `CARGO_OPERATION_NOT_IN_SOURCE`.

## 6. Zones, forwards, corrections

6.1 Zone map per physical line: QUOTED boundary (all following lines QUOTED until the end): `-----Original Message`,
`---------- Forwarded message`, `Pesan asli`/`Pesan terusan` separators, `On … wrote:` / `Pada … menulis:` lines, a
`From:`/`Dari:` line followed within 4 lines by `Sent:`/`Date:`/`Tanggal:`/`Dikirim:`/`To:`/`Kepada:`. A line starting
with `>` is QUOTED. SIG starts at a `--` line or a salutation-only line (best/kind/warm regards, regards, rgds, brgds,
best, thanks, thank you, many thanks, thanks and/& regards, cheers, salam, salam hormat, hormat kami, hormat saya,
terima kasih, terimakasih, trims, wassalam, tks, thx) and lasts until the next QUOTED boundary. Other lines: TOP (or
QUOTED after a boundary).

6.2 Rules: SIG evidence never binds any cargo fact. QUOTED evidence is used only when TOP has no evidence for that field
and row, and is never trusted (`CARGO_EVIDENCE_QUOTED`). A disregard marker in TOP (`disregard`/`ignore` … previous/
earlier/above/below/prior/last; `abaikan`; `cancel(led)` … previous) suppresses ALL QUOTED evidence.

6.3 Corrections (cargo quantity only). Correction markers in TOP: CORRECTION, CORRECTED, KOREKSI, REVISI, REVISED,
REVISION, AMENDED, AMENDMENT, UPDATED, DIGANTI, DIUBAH, CHANGED TO, MENJADI, INSTEAD OF, BUKAN. If a marker is present
AND ≥ 2 distinct verified bound quantities exist for row N: explicit replacement patterns in one clause —
`from X to Y`, `dari X (men)jadi Y`, `X -> Y` / `X → Y` / `X => Y`, `Y (bukan X`, `Y instead of X`,
`(revised|changed|diubah|diganti) (to|menjadi|jadi) Y`, `menjadi Y` — give sets X (replaced) and Y (targets).
Model Q ∈ Y and ∉ X → keep + `CARGO_CORRECTION_APPLIED`; otherwise → null + `CARGO_CORRECTION_UNRESOLVED`.
ETA/date correction is OUT OF SCOPE.

## 7. Flags

Kept: UNVERIFIED_SOURCE, OCR_CORRECTED, CARGO_QUANTITY_NOT_IN_SOURCE, CARGO_UNIT_NOT_IN_SOURCE,
CARGO_UNIT_WITHOUT_QUANTITY, CARGO_OPERATION_NOT_IN_SOURCE, CARGO_OPERATION_CONTRADICTS_SOURCE,
CARGO_OPERATION_AMBIGUOUS, APPROXIMATE_QUANTITY.
New: CARGO_OPERATION_CONTEXTUAL (review), CARGO_OPERATION_DOCUMENT_LEVEL (review), CARGO_EVIDENCE_QUOTED (review),
CARGO_CORRECTION_APPLIED (review), CARGO_OPERATION_PAST_REFERENCE (trace, value null), CARGO_RELATION_AMBIGUOUS
(trace, value null), CARGO_CORRECTION_UNRESOLVED (trace, value null), CARGO_UNIT_NONSTANDARD (informational).
`PERLU_KONFIRMASI_CARGO` += the four review flags. `cargoTepercaya` semantics unchanged. Row trace `jejak`: rule ids
per field, operation tier, zone; never source text. A flag never excuses a wrong value (scoring rule, D6).

## 8. Safety invariants (tested)

I1 retained name/quantity/unit are literal source tokens (unit: literal or frozen legacy alias of the adjacent literal);
I2 retained quantity lies in a binding window of its own row, adjacent-verified, no exclusion; I3 trusted operation ⇒
T1 + STRONG + no current opposite + not PAST + TOP; tier ≥ 2 ⇒ review flag; I4 no value dropped by v2 for an exclusion
reason is retained by V3; I5 SIG never binds, QUOTED never trusted; I6 past-only never yields an operation; I7 money/
rates, particulars, phone/reference/account/IMO/MMSI never become quantity; I8 deterministic, no network/model;
I9 the frozen scorer (v1 oracle) is not changed.

## 9. Versioning, tests, evaluation

- `src/lib/maritim-lexicon-v3.ts` (`maritim-lexicon/3`): families, non-operation phrases, past/future markers,
  approximation markers, label classes, unit deny classes, zone/correction markers, informational standard units,
  frozen v2 legacy alias groups. Data only, no imports. Every entry provenance `SPEC:V3`; no `E5:`/`E6:` provenance.
  v1 and v2 stay byte-identical.
- Tests by rule class (not by evaluation fixtures) + metamorphic/property tests + differential V2→V3 (19,003-variant
  corpus generator over Eval-1..5 + RG, plus the same generator over Eval-6). Every difference must be classified:
  A = newly retained by a named V3 rule while satisfying §8; B = newly dropped by zone / past reference /
  misattribution / exclusion / correction ambiguity; C = flag-only change by a named V3 rule. Unclassified → FAIL.
- Eval-5 and Eval-6 = REGRESSION ONLY; reported (overall / trusted / review / null), never optimized.
- Evaluation plan (D5): regression → Eval-5/6 regression → fresh dataset A → perfect-answer ceiling ≥ 90% + safety
  → LIVE authorization; material change after A → A regression-only; at most one more fresh dataset B; no third.
