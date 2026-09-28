# PRD-005 — Validator V3 — Addendum 2 (FINAL remediation before fresh Blind-B)

Base: `docs/PRD-005-VALIDATOR-V3.md` (sha256 `ec19d3ac…`, unchanged) + `docs/PRD-005-VALIDATOR-V3-ADDENDUM-1.md` (unchanged).
Owner decision 2026-09-28: Eval-7 Blind-A (V01–V40) is a valid result (perfect-answer 66/80) and is now REGRESSION ONLY
forever. This is the FINAL remediation round for V3; exactly three rule classes found by Blind-A are corrected, by
general rules only (no case ids, no Blind-A text, no case-specific values). The sha256 of this file is recorded in
`prisma/spike-kandidat-v3.mjs` (`SHA_ADENDUM2_V3`).

## AM7 — shared operation for a multi-cargo section (class A: document/list operation binding)

Gap: T3 (§5.4, D2) applies only to proposals with exactly one name-verified cargo row. An operation written once in the
introduction/header of a multi-cargo list ("… untuk bongkar muatan berikut:", "Discharge cargo:", "…, loading at <port>." +
"Cargo plan: A + B") left every row without T1/T2 evidence null.

Rule (evaluated after T2, before T3, only when ≥ 2 name-verified cargo rows):
1. SECTION = the paragraph (maximal run of consecutive non-empty logical lines of the selected zone, §5.1) containing the
   first mention of any row. Every name-verified row must have ≥ 1 mention in the selected zone and ALL those mentions must
   lie inside the SECTION; otherwise (a cargo also named in another section) → not applied (relation ambiguous, fail safe).
2. The operation evidence items (§5.2) of all SECTION lines contain NO past item and exactly ONE family, equal to the model
   operation O. Two families (conflict), past evidence, or the opposite family → not applied.
3. No correction marker in TOP (§6.3); multi-port condition identical to T3 item 4 (restricted to SECTION items).
Result: value O + `CARGO_OPERATION_CONTEXTUAL` (review, never trusted), rule id `O_T2_SECTION`, tier 2. Nothing crosses a
blank line or a zone boundary (SIG/QUOTED).

## AM8 — line-wrapped operation token (class B)

Gap: a hyphenated line wrap ("bong-" + newline + "kar") produced the tokens BONG, -, KAR; no operation evidence.

Rule: when two physical lines are joined into one logical line (§5.1, unchanged join conditions), a word token that ends
the FIRST physical line directly followed by `-`, and the first word token of the SECOND physical line, are:
- read as ONE token iff their concatenation is a form of the closed operation families (§5.2 STRONG/WEAK/PAST-ONLY forms,
  EN and ID). The joined token is never STRONG (a STRONG form counts as WEAK and a future marker never upgrades it), so
  any operation it supports is review (`CARGO_OPERATION_CONTEXTUAL` or ambiguity flags), never trusted.
- otherwise NOT operation evidence at all (neither fragment), e.g. "muat-" + "an" (MUATAN) no longer counts as MUAT.
No other text is changed: logical-line text, spans, quantities and names are untouched; no arbitrary concatenation.

## AM9 — binding window respects clause boundaries (class C: approximate quantity binding)

Gap: the §4.7 binding segment (and AM3 name-free test) ran across a sentence end. "…<cargo> loading, approx 250,000 bbls. Nama
kapal …" put the quantity's segment together with the next sentence's words → not name-free → quantity null. The
approximation marker was not the cause; any quantity in its own segment at a sentence end followed by more text failed.

Rule: the binding segment of an occurrence is its §5.1 SEGMENT intersected with its §5.1 CLAUSE (split at `.` `;` `?` `!`,
a `.` inside a number token is not a boundary), for rule (a) and for the AM3/AM6 name-free test. All other conditions are
unchanged: explicit unit/label support (AM1), exclusion engine, AM3/AM6 exactly-one-candidate counts, no binding when
another proposed cargo is mentioned on the line. Approximation markers keep flagging `APPROXIMATE_QUANTITY` (§4.6).
This only narrows the window checked for foreign words; a foreign commodity inside the quantity's own clause segment still
blocks binding.

## Verification (offline, 0 model calls)

- Blind-A classes: V09 (AM9), V13 V16 V23 V25 V28 (AM7), V35 (AM8) — all closed with the perfect answer; GT unchanged.
- Rule-class tests use neutral vocabulary (`prisma/check-validator-v3.mjs` section S), including fail-safe cases: conflicting
  families, other paragraph, cargo also named elsewhere, past-only evidence, opposite model operation, non-operation
  fragments, two competing cargoes for one quantity, foreign commodity in the next clause, missing unit.
