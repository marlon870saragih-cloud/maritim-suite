# PRD-005 Validator V3 — CHECKPOINT (WIP, BUKAN kandidat siap)

Status: implementasi V3 selesai kecuali SATU cacat keselamatan terbuka. Komit ini = simpanan kerja (owner meminta
simpan sebelum restart). Verdict terakhir: `V3 IMPLEMENTATION INCOMPLETE — BLOCKERS REMAIN`.

## Menunggu keputusan owner
1. Ratifikasi AM4 (angka di klausa voyage/muatan lain dikecualikan) dan AM5 (rentang wajib Q1 < Q2 ≤ 2·Q1) di
   `docs/PRD-005-VALIDATOR-V3-ADDENDUM-1.md` — ditambahkan sesudah checkpoint owner.
2. Persetujuan AM6: aturan ikat (c) (blok muatan) juga wajib "tepat SATU okurensi jumlah terverifikasi di baris logis"
   bila jumlah berada di baris kepala blok. Cacat N20 (`prisma/check-validator-remediasi.mjs`): "Cargo: bongkar 1450 MT
   semen dan 380\nMT, cnee PT Uji, besi beton" → 380 terikat ke "besi beton" lewat aturan (c). Invarian: I2/I7.

## Langkah terakhir sesudah owner bilang lanjut
1. Tulis AM6 di Addendum-1; implementasikan di `terikat` (intake-policy.ts, aturan `blok.includes(o.l)`).
2. Tambah uji kelas-aturan AM6 di `prisma/check-validator-v3.mjs`.
3. `node /…/gen-kandidat` → regenerasi `prisma/spike-kandidat-v3.mjs` (sha semua berkas final).
4. Jalankan ulang: check-validator-v3 (169 + AM6), intake-policy, tah-policy, tah-ledger (pin intake-policy & UI jika
   berubah), intake-prompt, eval2/3 gt+runner, eval4-prep, gt-source-consistency, business-time, automation-policy,
   tsc, eslint, dry-run jalur produksi Eval-6 (DB loopback, residu 0).
5. Satu komit V3 terkendali, push, verifikasi SHA lokal = remote, working tree bersih.

## Bukti saat checkpoint
check-validator-v3 169/169 · intake-policy 417/417 · tah-ledger 97/97 · eval4-prep 109/109 · TAH lain lulus · tsc/eslint
bersih · diferensial 30.923 varian, 0 tak terklasifikasi · Eval-5 78/80 · Eval-6 66/80 · 0 FATAL · 0 LIVE · 0 deploy.
Sidik kandidat saat ini `e67d6803…` (akan berubah setelah AM6).
