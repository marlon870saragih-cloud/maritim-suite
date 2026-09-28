# PRD-005 Validator V3 — FREEZE CANDIDATE (menggantikan checkpoint WIP)

Status: `V3_FREEZE_READY = YES` — kandidat `prd005-intake-text/kandidat-validator-v3-1`, sidik `71b9fa5ad7ac6366…`
(`prisma/spike-kandidat-v3.mjs`). Bukan persetujuan produksi; tidak ada LIVE, deploy, atau promosi.

## Keputusan owner (2026-09-28) yang diimplementasikan
- AM4 draf DITOLAK → AM4 final: frasa konteks historis (pengubah + kata benda kunjungan/muatan); penanda tunggal (EX, LALU,
  TERAKHIR, PRIOR, …) tidak pernah cukup; segmen sama → dikecualikan, klausa sama → null + `CARGO_RELATION_AMBIGUOUS`.
- AM5 draf (Q2 ≤ 2·Q1) DITOLAK → AM5 final: angka di dalam sebutan nama muatan usulan bukan jumlah/ujung rentang; rentang
  tanpa batas rasio; ujung kedua rentang berspasi juga perkiraan.
- AM6 DISETUJUI: aturan ikat (c) hanya dengan tepat satu kandidat jumlah di blok; (b)(d) memakai penghitung kandidat yang sama.
- N20 DITUTUP (null + `CARGO_RELATION_AMBIGUOUS`).
Rincian normatif: `docs/PRD-005-VALIDATOR-V3-ADDENDUM-1.md`.

## Bukti saat freeze (luring, 0 panggilan model, 0 jaringan)
check-validator-v3 197/197 (uji A4/P4 turunan W07/W16 ditulis ulang menjadi uji kelas-aturan netral) · diferensial 30.923
varian, 0 tak terklasifikasi, orakel tanpa-dukungan 0 / misatribusi 0 · intake-policy 417/417 · tah-policy 311/311 ·
tah-ledger 97/97 · intake-prompt 75/75 · eval2/3 gt + runner lulus · eval4-prep 109/109 · gt-source-consistency lulus ·
business-time 46/46 · automation-policy 124/124 · tsc bersih · `npm run lint` 0 error.
Eval-5 78/80 dan Eval-6 66/80 = REGRESSION ONLY (bukan bukti held-out; Eval-6 terekspos ke V3).

## Kegagalan yang tersisa (terklasifikasi; semua identik atau lebih baik daripada HEAD 1799a39)
- check-validator-remediasi 61/70 (HEAD 60/70; N20 kini lulus): R5c, N3b, N14 (operasi), Z17, Z17b, E5c, X1, X2, X3 =
  EXPECTED_SUPERSEDED_BEHAVIOR (ekspektasi v2 yang diganti SPEC:V3 §5.2/§5.4/§9, D2, D7). N14: jumlah 5000 kini
  dipertahankan; operasi null + `CARGO_OPERATION_PAST_REFERENCE` karena §5.2 (PREVIOUS di klausa = penanda lampau).
- check-eval4/5/6-runner & regresi-eval5-produksi: runner beku ke kandidat lama → `KANDIDAT_BERUBAH` (identik HEAD).
- check-eval3-ledger-db (DB loopback): 11/14, identik HEAD — ekspektasi Eval-3 "produksi menolak Sonnet 5" basi sejak
  b89ca36 (registri Sonnet 5 = VERIFIED). Privasi, pembersihan, dan sisa independen = 0 lulus.

## Keterbatasan diketahui (arah aman)
- §5.2 (spesifikasi dasar, tidak diubah): EX/LALU/TERAKHIR/PRIOR/LAST PORT/PREVIOUS tetap penanda lampau untuk OPERASI →
  operasi null (bukan salah). Contoh: Eval-5 Z23 ("… ex Bulog contract"), N14.
- AM5: bila model menghilangkan grade dari nama, grade bisa terbaca sebagai ujung rentang → selalu APPROXIMATE (review).
- Dry-run jalur produksi Eval-6 untuk kandidat V3 tidak dijalankan: runner Eval-6 beku ke kandidat pasca-Eval-5.

Langkah berikutnya (keputusan owner): Eval-7 blind baru (dataset segar A, D5) terhadap kandidat beku ini.
