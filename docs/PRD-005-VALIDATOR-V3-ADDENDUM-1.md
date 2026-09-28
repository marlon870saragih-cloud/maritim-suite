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

## AM4 — quantities in a past-marked clause are excluded (extends §4.4)

Blocker: base §4.4 applied the past rule (§5.2 tense) to operations only. Found by the injection test on Eval-6 W16
("last voyage kapal ini discharge 4.100 MT CPO di Sekupang"): a model proposing 4100 for the current CPO row was retained
— a previous-voyage quantity attributed to the current call. Amended: a number occurrence whose clause (§5.1) contains an
OTHER-VOYAGE/PREVIOUS-CARGO marker is excluded (`EXCL_PAST_CLAUSE`): LAST VOYAGE, LAST CARGO, LAST CALL, LAST TRIP, LAST
PORT, PREVIOUS, PREVIOUSLY, FORMER, FORMERLY, PRIOR, EX, SEBELUMNYA, EKS, LALU, TERAKHIR (subset of §5.2). Plain past
tense (WAS, TELAH, SUDAH, …) is NOT included: "7,500 MT coal was loaded" describes the cargo now on board. Known recall
cost: noisy markers (EX meaning "from", LALU meaning "then") also exclude legitimate quantities — conservative direction.

## AM5 — numeric range requires plausible bounds (tightens §4.6)

Blocker: base §4.6 accepted `Q1 - Q2 U` with a spaced hyphen. Found by the differential on Eval-6 W07 ("Gasoline 90 -
18.000 KL"): the product grade 90 was retained as an approximate quantity (unsupported). Amended: a range is recognized
only if Q1 < Q2 ≤ 2·Q1; otherwise the separator is not a range and Q1 is not verified by the unit after Q2.
Known limitation (inherited unchanged date mask): "5.000-6.000 MT" — the second end is date-shaped and is dropped.
