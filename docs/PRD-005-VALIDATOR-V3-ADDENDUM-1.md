# PRD-005 — Validator V3 — Safety Addendum 1 (frozen)

Base specification: `docs/PRD-005-VALIDATOR-V3.md` (sha256 `ec19d3ac183924f479755098b12b2afb61807f9acc5fe905baebf39b0a97fb6c`,
unchanged). This addendum records GENUINE SAFETY BLOCKERS found while implementing the base specification, before any
commit. Each amendment only REMOVES acceptance paths or ADDS deny entries (safe direction). No recall-increasing change.
The sha256 of this file is recorded in `prisma/spike-kandidat-v3.mjs` (`SHA_ADENDUM_V3`).

## AM1 — quantity verification must be the model's proposed pair (replaces §4.5 step 3)

Blocker: the base §4.5.3 verified a quantity by ANY unit-shaped source word adjacent to it even when the model's own unit
did not match. Found by the existing injection test: Eval-5 Z28 "arrived … at 0915 LT" + model "915 MT" → 915 retained
(adjacent word "LT"). The model's proposed fact (915 MT) is not in the source; retaining 915 is an unsupported quantity.

Amended rule — the quantity is verified only if at the adjacency point there is:
1. the model's unit, LITERAL or frozen v2 LEGACY alias (unit kept as in §4.5.2); or
2. a quantity label immediately before Q (`Qty: Q`, `Quantity (U): Q`); or
3. a source unit phrase belonging to a frozen v2 legacy alias group (MT/CBM/WMT/KL groups) — v2 parity: quantity kept,
   unit kept only under 1, otherwise unit null + `CARGO_UNIT_NOT_IN_SOURCE`.
An open (non-legacy) source unit that the model did NOT propose never verifies a quantity (`EXCL_UNIT_NOT_PROPOSED`).
D1/D4 are unaffected: a model proposing `ton` / `zak` / `BBLS` / `units` is verified literally by rule 1.

## AM2 — time designators in the time deny class (extends §4.3)

Added to the time deny class: LT, UTC, GMT, WIB, WITA, WIT, H. A model unit consisting of a time designator is never a
cargo unit (prevents "0915 LT" being accepted as a literal pair when the model proposes unit LT).

## AM3 — binding windows require a name-free segment (tightens §4.7)

Blocker: base §4.7 binding rules (b)/(c)/(d) consider only cargo names PROPOSED by the model. When the model omits a
commodity, its quantity binds to another row. Found by the existing test N21: "bongkar 1450 MT semen zak dan 380 MT besi
beton" with only "semen zak" proposed → 380 bound to "semen zak" (misattribution).

Amended: rules (b), (c), (d) of §4.7 additionally require the quantity's segment to be NAME-FREE — every word token in it
is part of a mention of the row's own name, part of the verified unit phrase, or a member of a closed structural class
(cargo/quantity/operation labels, operation-family forms, cargo nouns MUATAN/BERMUATAN/KARGO, function words, approximation
and tolerance markers, future/past markers, range words, TOTAL). Rules (b) and (d) additionally require that the logical
line carries exactly ONE verified quantity occurrence (found by existing test N20: "bongkar 1450 MT semen dan 380 MT,
…, besi beton" bound 380 through the single-cargo label-line rule while the line also carried 1450 MT). Otherwise → null + `CARGO_RELATION_AMBIGUOUS`. Rule (a) (segment
overlapping a mention of the row's own name) is unchanged.

## AM4 — quantities in another voyage/cargo context are excluded (FINAL, owner decision 2026-09-28; replaces the rejected draft)

Blocker: base §4.4 applied the past rule (§5.2 tense) to operations only, so a previous-voyage quantity written next to the
current cargo name could be retained for the current call. The first AM4 draft (clause containing any of LAST VOYAGE … EX,
LALU, TERAKHIR, PRIOR, PREVIOUS, LAST PORT) was REJECTED by the owner: single tokens deleted legitimate quantities
("ex <port>", "lalu muat", "prior to departure", "(previous port)", existing test N14).

Final rule — a HISTORICAL-CONTEXT PHRASE is a modifier + visit/cargo noun, never a single token:
- English: `LAST | PREVIOUS | PREV | PRIOR | FORMER` [one number]? `VOYAGE(S) | VOY | CARGO(ES) | CALL(S) | TRIP(S) | SHIPMENT(S)`;
- Indonesian: `VOYAGE | VOY | MUATAN | KARGO | PELAYARAN | KUNJUNGAN | TRIP | CALL | SHIPMENT | PENGIRIMAN` +
  `SEBELUMNYA | LALU | TERAKHIR`;
- compound members (§3.2) are not phrases. `LAST PORT` / `PREVIOUS PORT` are not historical cargo context.
For a number occurrence:
1. phrase in the SAME SEGMENT (§5.1) → excluded (`EXCL_PAST_CLAUSE`);
2. phrase only in the same CLAUSE (§5.1), different segment → relation ambiguous: not verified (`EXCL_PAST_AMBIGUOUS`);
   if no other bound occurrence remains the row gets quantity null + `CARGO_RELATION_AMBIGUOUS` (fail safe, review);
3. list item under a heading line ending with `:` that carries the phrase ("Previous cargoes:\n- …") → excluded.
Out of scope (unchanged): the operation tense rule of base §5.2 (its marker list still includes EX, LALU, TERAKHIR, PRIOR,
LAST PORT, PREVIOUS for OPERATIONS; result is null + `CARGO_OPERATION_PAST_REFERENCE`, never a wrong value).

## AM5 — numbers inside a proposed cargo name are never quantities; ranges have no ratio bound (FINAL; replaces the rejected draft)

Blocker: base §4.6 read a product grade followed by a spaced hyphen as a range end ("<product> 90 - 18.000 KL" → 90
retained as approximate quantity). The first AM5 draft (range only if Q1 < Q2 ≤ 2·Q1) was REJECTED by the owner: a ratio
constant is not a structural rule, it drops wide ranges and still accepts close grades ("<product> 48 - 60 KL").

Final rule:
1. A number occurrence lying inside a mention (§4.1) of ANY name-verified proposed cargo name is part of that name
   (product grade / label), never a quantity (`EXCL_IN_NAME`), and never a range end.
2. A range (§4.6) is recognized when Q1 < Q2 (any width), Q1/Q2 not inside a proposed name, Q1 not a reference fragment.
3. §4.6 "either end is approximate" is applied to the SECOND end of a spaced range too ("Q1 - Q2 U", "Q1 TO Q2 U",
   "Q1 S/D Q2 U") → `APPROXIMATE_QUANTITY`; except the replacement form `FROM|DARI Q1 TO Q2` (§6.3).
Known limitation: if the model omits the grade from the name ("<product>" instead of "<product> 90") the grade can still be
read as a range end; such a value is always `APPROXIMATE_QUANTITY` (never trusted). The date-shaped second end
("5.000-6.000") remains dropped (inherited date mask).

## AM6 — binding rule (c) requires exactly one quantity candidate in the cargo block (owner-approved 2026-09-28)

Blocker (existing test N20): "Cargo: bongkar 1450 MT semen dan 380\nMT, cnee PT Uji, besi beton" with only "besi beton"
proposed → 380 bound through §4.7 rule (c) (block) as a TRUSTED quantity, although the header line carries two quantities
and an unproposed commodity.

Rule: a QUANTITY CANDIDATE on a logical line is a number occurrence that survives the §4.4 exclusion engine (incl. AM4/AM5)
and is verified by a frozen v2 legacy alias, a quantity label, or ANY shape-valid (§4.2/§4.3) unit word written directly
after it (not only the model's unit), plus verified OCR occurrences. Rule (c) binds only when the block containing the
occurrence carries exactly ONE quantity candidate over all its lines; AM3 rules (b) and (d) use the same candidate count
(exactly one on the logical line). Otherwise → not bound → quantity null + `CARGO_RELATION_AMBIGUOUS`. A block/line with
exactly one candidate keeps binding. Rule (a) is unchanged.
