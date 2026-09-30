# PRD-005 — FINAL CLOSURE CHECKPOINT (TAH Core + evaluasi intake TEXT)

Status: **CLOSED** (keputusan owner, 2026-09-29). Siklus evaluasi Validator V3 DIHENTIKAN. Dokumen ini hanya mencatat; tidak ada
perubahan kode produksi, validator, prompt, spesifikasi, GT, dataset, atau penilai.

## 1. Yang selesai

| Bagian | Status | Rujukan |
|---|---|---|
| TAH Core — buku besar `AgentRun`/`AgentModelCall` + fondasi persetujuan (skema, kebijakan, registri) | selesai | 5bc6e0b (Step 3A) |
| Ekstraksi Vessel Call Intake tercatat di buku besar | selesai | 6810b3a (Step 3B) |
| Harness kompatibilitas model terisolasi | selesai | 28b0ef9 (Step 3C) |
| Evaluasi bertahap Eval-1..6 (Sonnet 5 + validator v1/v2) | selesai; Eval-5/6 = REGRESSION ONLY | `docs/PRD-005-EVAL*` |
| Validator V3 (SPEC:V3 + Addendum-1 AM1–AM6 + Addendum-2 AM7–AM9 & AM4b) | **FINAL FREEZE** | ac6460c |
| Eval-7 Blind-A (V01–V40) | selesai; **REGRESSION ONLY** | 8e2f63f, `docs/PRD-005-EVAL7-*` |
| Eval-8 Blind-B (B01–B40) — dataset segar TERAKHIR (D5) | beku; dry-run jawaban sempurna selesai | 54fbb78, `docs/PRD-005-EVAL8-*` |

Kandidat V3 FINAL: `prd005-intake-text/kandidat-validator-v3-2`, sidik
`775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c` (`prisma/spike-kandidat-v3.mjs`).

## 2. Yang PASS (bukti luring, 0 panggilan model)

- Keselamatan toleransi-nol pada Blind-B (jawaban sempurna, jalur produksi, DB loopback): FATAL POST 0, muatan tepercaya tak
  berbukti 0, identitas salah 0, misatribusi kritis tepercaya 0, pelanggaran toleransi-nol tambahan 0, bukti jalur 82/82.
- `check-validator-v3` 226/226: diferensial 42.519 varian 0 tak terklasifikasi; orakel tanpa-dukungan 0 / misatribusi 0;
  injeksi angka terlarang Eval-5/6/7: **0/696**. V21 (angka kapal saudara) CLOSED; N20 CLOSED.
- Blind-A regresi 80/80; Eval-5 78/80; Eval-6 70/80 (semua REGRESSION ONLY).
- Ledger E2E (DB loopback) 14/14; sisa DB 0; privasi buku besar & laporan lulus.

## 3. Yang BELUM memenuhi target

- Blind-B jawaban sempurna: **64/80 = 80% < 90%** (`G_LULUS_HELDOUT`). Target TIDAK tercapai.
- Penyebab (atribusi luring): V3 mengosongkan nilai TERTULIS (gagal-tertutup, bukan nilai salah) pada 8 kasus — terutama §5.2
  (frasa "Pelabuhan muat/bongkar" = bukan-operasi; penanda lampau EX/SUDAH/SEBELUMNYA terlalu lebar), plus pola koreksi
  "Qty revised: Y (sebelumnya X)" dan total gabungan dua komoditas. Rincian: `docs/PRD-005-EVAL8-DATASET-LOG.md` §4.

**Interpretasi final (owner):** V3 = **SAFE / FAIL-CLOSED tetapi CONSERVATIVE**; plafon mutu pada Blind-B = 80%, terutama karena
§5.2. Ini **bukan** kegagalan Sonnet 5.

## 4. Mengapa LIVE tidak dilakukan

Sonnet 5 tidak diuji LIVE pada tahap final karena validator V3 sendiri membatasi skor jawaban SEMPURNA di bawah ambang penerimaan
(80% < 90%); run LIVE tidak akan punya nilai keputusan. Tidak ada panggilan model LIVE, `SPIKE_OPENROUTER_API_KEY` tidak dipakai,
kunci `OTORISASI_LIVE_EVAL7_OWNER` / `OTORISASI_LIVE_EVAL8_OWNER` tetap `false`.

## 5. Status Sonnet 5

`anthropic/claude-sonnet-5` = **`PENDING_SPIKE`** di `src/lib/ai/model-capabilities.ts` (4cd338d; promosi D-P1 b89ca36 dicabut).
Jalur produksi dengan `TAH_INTAKE_MODEL=anthropic/claude-sonnet-5` gagal tertutup (MODEL_TIDAK_TERVERIFIKASI, 0 panggilan).
Spike eval-only (`aktifkanSpikeEval`) hanya ada di runner Eval-8 dan tidak diimpor kode produksi. **Tidak ada promosi.**

## 6. Aturan paparan dataset

- Eval-5 Z01–Z40, Eval-6 W01–W40, **Eval-7 Blind-A V01–V40 = REGRESSION ONLY** (selamanya).
- **Eval-8 Blind-B B01–B40 = bukti blind FINAL** untuk V3; kini EXPOSED.
- **Tidak ada Blind-C / Eval-9** untuk V3 (batas D5).

## 7. Yang TIDAK dilakukan

Tidak ada deploy produksi, tidak ada promosi model, tidak ada LIVE, tidak ada remediasi tambahan, tidak ada dataset tambahan.
Cabang `feat/prd002-step2-domain-foundation` (PRD-002..PRD-005) belum di-merge ke `main`.

**KOREKSI 2026-09-30 (audit VM read-only):** "tidak ada deploy produksi" di atas hanya benar untuk langkah closure ini.
Produksi SUDAH menjalankan rilis cabang `ac922f6` (build 2026-09-27; skema PRD-002..005 diterapkan). Rilis itu mendahului
`4cd338d`, sehingga registrinya masih memuat Sonnet 5 `VERIFIED` — namun DORMAN: `TAH_INTAKE_MODEL` tak diset, intake & TAH Core
mati, 0 panggilan model; model global = Sonnet 4.5. Validator V3 belum ter-deploy. Bukti: `docs/PRODUCTION-STATE-2026-09-30.md`.

## 8. FUTURE DESIGN ITEM — §5.2 (bukan blocker pekerjaan TAH lain)

- FDI-005-01 — Penanda lampau operasi (§5.2) terlalu lebar: EX, LALU, TERAKHIR, PRIOR, SUDAH, SEBELUMNYA, LAST PORT, PREVIOUS
  membuat operasi kini null (contoh kelas: Eval-5 Z23, Blind-B B06/B31/B35, N14).
- FDI-005-02 — Frasa peran pelabuhan ("Pelabuhan muat/bongkar", "load/discharge port") selalu bukan-operasi (§5.2), padahal
  sering satu-satunya pernyataan operasi kunjungan ini (kelas Blind-B B02/B12/B16/B23).
- FDI-005-03 — Pola koreksi §6.3 tidak mengenali "revised: Y (sebelumnya X)"; total gabungan satu baris dua komoditas → null.
Setiap perubahan atas butir ini = spesifikasi baru + evaluasi baru di luar V3 (V3 beku); keputusan owner.

## 9. Hutang teknis TAH yang tetap OPEN (tidak berubah)

TD-005-01 (kuota AI intake), TD-005-02 (setuju-sendiri intake terlihat portal), TD-005-03 (alur pembaruan operasional voyage) —
`docs/TAH-TECH-DEBT.md`, dijaga `check-tah-policy` / `check-eval4-prep`.
