# PRD-005 Eval-7 — Protokol Fresh Blind Text Evaluation untuk Validator V3 (pra-registrasi)

Dokumen ini dibekukan (sha256 di `prisma/spike-eval7-beku.json`) SEBELUM run LIVE apa pun. Mengubahnya setelah
pembekuan membatalkan pembekuan → runner menolak dengan 0 panggilan. Gerbang di bawah TIDAK boleh dilonggarkan setelah
keluaran model terlihat.

## 1. Pertanyaan

Apakah **Sonnet 5 + intake TEXT + Validator V3 beku** (`prd005-intake-text/kandidat-validator-v3-1`) aman dan akurat pada
40 kasus yang benar-benar baru — ditulis konteks independen yang tidak pernah melihat repo, Eval-1..6, spesifikasi/adendum/
uji V3, prompt, validator, atau leksikon? Eval-7 = "fresh dataset A" menurut SPEC:V3 D5.

## 2. Kandidat beku

`prisma/spike-kandidat-v3.mjs` — commit `e04b4acca9a2bf948552ffa50d6ba914f49575f2` (owner: FROZEN CANDIDATE).

| Item | Nilai |
|---|---|
| ID kandidat | `prd005-intake-text/kandidat-validator-v3-1` |
| Sidik (20 berkas: jalur produksi TEXT + validator/leksikon v3 + SPEC:V3 + ADDENDUM-1) | `71b9fa5ad7ac6366a088ee3c8bbc8307edf2d7b8543e0a0c23cbd98211caa34e` |
| Model | `anthropic/claude-sonnet-5` (rute TEXT `EXPLICIT`, Prompt v4 `6ed1edba…`, tool paksa, tanpa temperature, tanpa fallback) |
| Validator | `intake-policy.ts` `fc2639e0…`, leksikon `maritim-lexicon/3` `682dc5de…` |

Berkas kandidat berubah sebelum run → **REJECTED** (0 panggilan). Berubah selama run → berhenti sebelum panggilan berikut.
V3 TIDAK diubah sebelum atau selama Eval-7 (keputusan owner). §5.2 tidak ditinjau; keterbatasan yang diketahui (mis. Eval-5 Z23:
penanda EX/LALU/TERAKHIR/PRIOR/PREVIOUS membuat operasi null) dicatat, tidak diperbaiki.

**Registri model (keputusan owner, pilihan A):** `anthropic/claude-sonnet-5` tetap `VERIFIED` di `model-capabilities.ts`
(asal: commit `b89ca36`, tidak konsisten dengan proses validasi sekarang) karena berkas itu bagian dari sidik kandidat dan jalur
produksi yang diuji membutuhkannya. Status ini **menunggu validasi ulang oleh Eval-7**: bila Eval-7 tidak PASS, owner
mengembalikannya ke `PENDING_SPIKE` lewat perubahan terpisah. Produksi dapat dipaksa ke rute LEGACY tanpa perubahan kode
dengan mengosongkan `TAH_INTAKE_MODEL` di lingkungan produksi. Tidak ada deploy/promosi dalam Eval-7.

## 3. Jalur yang diuji

Setiap slot = `submitIntake` produksi pada PostgreSQL loopback sekali pakai, tenant+pengguna sintetis per slot (awalan
`e7eval7`): `submitIntake → jalankanEkstraksi → ruteModelIntakeUntukInput → ekstrakIntakeProduksi → transport OpenRouter →
validasiEkstraksi (V3) → simpan + buku besar TAH (AgentRun/AgentModelCall)`. Bukti jalur per slot = gerbang keras
`G_JALUR_PRODUKSI`.

## 4. Dataset blind

- 40 kasus `V01–V40`, versi `prd005-eval7/blind-1`, spesifikasi `docs/PRD-005-EVAL7-DATASET-SPEC.md`.
- Distribusi A 7 · B 5 · C 6 · D 4 · E 3 · F 3 · G 3 · H 4 · I 5; bahasa ID 15 · EN 13 · MIX 12. Kelas yang diwajibkan owner:
  nominasi/penunjukan, identitas kapal, konteks pelabuhan/voyage, muatan+jumlah+satuan, load/discharge, rujukan voyage/muatan
  historis (D), grade produk vs jumlah (E), relasi muatan↔jumlah ambigu (F), ID/EN/campuran, format WhatsApp/email/OCR bising (H),
  konten adversarial/tak relevan (I), informasi hilang → null/review (B dan field `absent`).
- Pool pengenal BARU (IMO/MMSI/call sign/pelabuhan) yang tidak ada di repo mana pun saat penulisan; sentinel `XJW7xx`,
  domain `uji7.invalid`, telepon `+62-557-`.
- Penulis = konteks independen yang HANYA menerima spesifikasi; dilarang membaca repo. Keterbatasan jujur: isolasi lewat
  instruksi + laporan alat penulis, bukan sandbox teknis; penulis dari keluarga model yang sama dengan kandidat.
- Tidak memakai: kasus W/Z Eval-5/Eval-6, N20, A4/P4, fixture/uji V3, atau variasi kosmetik kasus lama — ditegakkan pemeriksa
  tumpang-tindih (§5).
- GT independen, dibekukan sebelum dry-run/LIVE. Koreksi GT pra-LIVE hanya oleh penulis yang sama, hanya untuk cacat
  integritas/tumpang-tindih, dicatat di `docs/PRD-005-EVAL7-DATASET-LOG.md`. **Setelah LIVE, GT beku.**

## 5. Pemeriksa & prasyarat (preflight; gagal → REJECTED, 0 panggilan)

- `prisma/spike-eval7-dataset.mjs` (`prd005-eval7/pemeriksa-paket-1`): integritas GT (0 temuan) dan tumpang-tindih (0) terhadap
  seluruh berkas terlacak repo + korpus Eval-1..6, RG, contoh prompt, literal pengembangan validator V3 (spesifikasi, adendum,
  leksikon v3, `check-validator-v3`, remediasi). Ambang kemiripan beku: trigram kata ≥ 0,30, 5-gram karakter ≥ 0,40.
- Regresi (EXPOSED — REGRESSION ONLY, jawaban sempurna, validator V3): Eval-5 = 39/40 (hanya Z23), Eval-6 = 33/40 (W04 W07 W13
  W14 W15 W16 W24), 0 FATAL, + RG-H20/RG-H18/E09. Penyimpangan = kandidat bukan V3 beku → REJECTED.

## 6. Dry-run jawaban sempurna (pra-LIVE, 0 panggilan penyedia)

Runner mode `offline` (stub = jawaban sempurna dari GT) lewat jalur produksi di DB loopback. Ini mengukur PLAFON kandidat.
**Aturan kritis owner:** bila dry-run gagal karena perilaku V3 → STOP dan lapor. V3 TIDAK diperbaiki memakai Eval-7 lalu
dijalankan pada dataset yang sama sambil tetap disebut blind; Eval-7 yang telah membuka cacat V3 menjadi REGRESSION ONLY bila V3
kemudian diubah.

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

PASS / FAIL / INCONCLUSIVE / REJECTED sama dengan Eval-6 (§8 protokol Eval-6). Setelah run apa pun V01–V40 berstatus
EXPOSED. FAIL → analisis akar masalah LEBIH DULU; tidak ada rerun paket ini sebagai held-out. Menurut D5, paling banyak satu
dataset segar lagi (B) untuk V3.

## 10. Otorisasi LIVE

LIVE hanya bila owner menyetujui secara terpisah: `OTORISASI_LIVE_EVAL7_OWNER = true` (perubahan eksplisit → hash runner
berubah → pembekuan ulang tercatat) DAN `SPIKE_AUTHORIZED=PRD-005-EVAL7-LIVE`, `SPIKE_OPENROUTER_API_KEY` (kunci uji khusus,
limit penyedia US$5 sebagai pagar luar), DB loopback, checkpoint di luar repo. Bawaan: tertutup.
