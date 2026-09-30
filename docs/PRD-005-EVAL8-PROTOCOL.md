# PRD-005 Eval-8 (Blind-B) — Protokol Fresh Blind Text Evaluation untuk Validator V3 FINAL (pra-registrasi)

Dokumen ini dibekukan (sha256 di `prisma/spike-eval8-beku.json`) SEBELUM run LIVE apa pun. Mengubahnya setelah
pembekuan membatalkan pembekuan → runner menolak dengan 0 panggilan. Gerbang di bawah TIDAK boleh dilonggarkan setelah
keluaran model terlihat.

## 1. Pertanyaan

Apakah **Sonnet 5 (spike eval-only) + intake TEXT + Validator V3 FINAL** (`prd005-intake-text/kandidat-validator-v3-2`) aman dan
akurat pada 40 kasus yang benar-benar baru, ditulis konteks independen BARU yang tidak pernah melihat repo, Eval-1..7 (termasuk
Blind-A dan kegagalannya), spesifikasi/adendum/uji V3, prompt, validator, atau leksikon? Eval-8 = Blind-B = **dataset segar
TERAKHIR** untuk V3 (SPEC:V3 D5).

## 2. Kandidat beku (V3 FINAL)

`prisma/spike-kandidat-v3.mjs` — commit `ac6460c193b1b301b47375a322bc5559c2f46cce` (owner: FINAL FREEZE; V3 TIDAK diubah
berdasarkan hasil Blind-B).

| Item | Nilai |
|---|---|
| ID kandidat | `prd005-intake-text/kandidat-validator-v3-2` |
| Sidik (21 berkas: jalur produksi TEXT + validator/leksikon v3 + SPEC:V3 + Addendum-1 + Addendum-2) | `775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c` |
| Model | `anthropic/claude-sonnet-5` (rute TEXT `EXPLICIT` selama spike, Prompt v4 `6ed1edba…`, tool paksa, tanpa temperature, tanpa fallback) |

**Registri & spike (keputusan owner):** berkas registri `model-capabilities.ts` = `PENDING_SPIKE` (4cd338d); jalur produksi normal
gagal tertutup. Runner Eval-8 — dan hanya runner ini — mengaktifkan spike **di memori proses evaluasi** (entri → `VERIFIED`)
selama run dan memulihkannya di `finally`; gagal tertutup bila berkas registri bukan `PENDING_SPIKE` bercakupan TEXT + Prompt v4.
Kode produksi tidak mengimpor runner. Tidak ada promosi sampai Blind-B lulus DAN owner memutuskan.

## 3. Jalur yang diuji

Setiap slot = `submitIntake` produksi pada PostgreSQL loopback sekali pakai, tenant+pengguna sintetis per slot (awalan
`e8eval8`): `submitIntake → jalankanEkstraksi → ruteModelIntakeUntukInput → ekstrakIntakeProduksi → transport OpenRouter →
validasiEkstraksi (V3) → simpan + buku besar TAH (AgentRun/AgentModelCall)`. Bukti jalur per slot = gerbang keras
`G_JALUR_PRODUKSI`.

## 4. Dataset blind

- 40 kasus `B01–B40`, versi `prd005-eval8/blind-1`, spesifikasi `docs/PRD-005-EVAL8-DATASET-SPEC.md` (kontrak & distribusi A–I sama
  dengan Blind-A: A7 B5 C6 D4 E3 F3 G3 H4 I5; ID 15 · EN 13 · MIX 12).
- Pool pengenal BARU (tidak ada di repo mana pun saat penulisan, termasuk pool Blind-A); sentinel `XJW8xx`, domain `uji8.invalid`,
  telepon `+62-558-`.
- Penulis = konteks independen BARU yang HANYA menerima spesifikasi; tidak melihat fixture/ID/teks/kegagalan Blind-A atau
  implementasi remediasi. Keterbatasan: isolasi lewat instruksi + laporan alat; keluarga model sama.
- GT dibekukan sebelum dry-run/LIVE; koreksi pra-LIVE hanya oleh penulis yang sama untuk cacat integritas/tumpang-tindih.

## 5. Pemeriksa & prasyarat (preflight; gagal → REJECTED, 0 panggilan)

- `prisma/spike-eval8-dataset.mjs` (`prd005-eval8/pemeriksa-paket-1`): integritas GT (0) dan tumpang-tindih (0) terhadap seluruh
  berkas terlacak repo + korpus Eval-1..7 (termasuk Blind-A), RG, prompt, dan seluruh artefak V3. Ambang kemiripan 0,30 / 0,40.
- Regresi V3 FINAL (jawaban sempurna, REGRESSION ONLY): Eval-5 39/40 (Z23), Eval-6 35/40 (W04 W13 W15 W16 W24), Eval-7 40/40,
  0 FATAL, + RG-H20/RG-H18/E09.

## 6. Dry-run jawaban sempurna (pra-LIVE, 0 panggilan penyedia)

Runner mode `offline` (stub = jawaban sempurna dari GT) lewat jalur produksi di DB loopback. Ini mengukur PLAFON kandidat.
**Aturan kritis owner:** bila dry-run gagal karena perilaku V3 → STOP dan lapor. V3 TIDAK diperbaiki memakai Blind-B lalu
dijalankan pada dataset yang sama sambil tetap disebut blind; Blind-B adalah dataset segar TERAKHIR: bila dry-run < 90% → STOP, tidak ada
perubahan V3, tidak ada dataset C, tidak ada LIVE; keputusan strategis owner.

## 7. Rencana & anggaran

- **82 panggilan** = RG-H20 + RG-H18 (kanari) + 40 × 2 ulangan. Satu percobaan per slot, 0 ulang.
- Batas keras total **US$3,00**. Proyeksi biaya sebelum SETIAP panggilan; plafon US$0,035/panggilan (82 × 0,035 = US$2,87).
- Estimasi: rata-rata Eval-4 heldout-3 US$0,0146/panggilan (maks US$0,0167) → ±US$1,20–1,55.

## 8. Gerbang (dibekukan sebelum LIVE)

| Gerbang | Syarat | Sifat |
|---|---|---|
| FATAL POST (F1–F9) — termasuk nilai kritis tepercaya salah/tak didukung | 0 | keras |
| Muatan tak berbukti POST (nama/jumlah/satuan/operasi, termasuk H20) | 0 | keras |
| Identitas kapal & pelabuhan & ETA tak didukung sumber | 0 | keras |
| `G_TOLERANSI_NOL_TAMBAHAN`: ETD/ETB/ETC, call sign, satuan muatan WRONG/HALLUCINATED di POST | 0 | keras |
| Model disajikan ≠ diminta; fallback; output tool rusak | 0 | keras |
| `G_JALUR_PRODUKSI` | 82/82 bukti | keras |
| `G_PEMBERSIHAN`, `G_PRIVASI_BUKU_BESAR`, privasi laporan | 0 | keras |
| Lulus held-out (POST) | ≥ 90% | minimum |
| Konsistensi antar-ulangan (POST) | ≥ 90% | minimum |

Kebijakan berhenti: pelanggaran toleransi-nol apa pun → berhenti sebelum panggilan berikut.

## 9. Putusan & aturan paparan

PASS / FAIL / INCONCLUSIVE / REJECTED sama dengan Eval-6 (§8 protokol Eval-6). Setelah run apa pun B01–B40 berstatus
EXPOSED. FAIL → analisis akar masalah LEBIH DULU; tidak ada rerun paket ini sebagai held-out. Tidak ada dataset segar berikutnya untuk V3 (D5).

## 10. Otorisasi LIVE

LIVE hanya bila owner menyetujui secara terpisah: `OTORISASI_LIVE_EVAL8_OWNER = true` (perubahan eksplisit → hash runner
berubah → pembekuan ulang tercatat) DAN `SPIKE_AUTHORIZED=PRD-005-EVAL8-LIVE`, `SPIKE_OPENROUTER_API_KEY` (kunci uji khusus,
limit penyedia US$5 sebagai pagar luar), DB loopback, checkpoint di luar repo. Bawaan: tertutup.
