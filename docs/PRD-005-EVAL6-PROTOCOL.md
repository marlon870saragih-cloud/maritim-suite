# PRD-005 Eval-6 — Protokol Final Fresh Blind Text Evaluation (pra-registrasi)

Dokumen ini dibekukan (sha256 di `prisma/spike-eval6-beku.json`) SEBELUM run LIVE apa pun. Mengubahnya setelah
pembekuan membatalkan pembekuan → runner menolak dengan 0 panggilan. Gerbang di bawah TIDAK boleh dilonggarkan setelah
keluaran model terlihat.

## 1. Pertanyaan

Apakah kandidat pasca-remediasi **Sonnet 5 + intake TEXT** (`prd005-intake-text/kandidat-pasca-eval5-1`) aman dan akurat
pada 40 kasus yang benar-benar baru — ditulis konteks independen yang tidak pernah melihat audit/remediasi validator,
kasus Eval-1..5, prompt, validator, atau leksikon?

## 2. Kandidat beku (A)

`prisma/spike-kandidat-pasca-eval5.mjs` — commit dasar `d097fe5b0ee3e40a9ba31b85d391ddce1d0c69f8`.

| Item | Nilai |
|---|---|
| ID kandidat | `prd005-intake-text/kandidat-pasca-eval5-1` |
| Sidik gabungan (17 berkas jalur produksi + identitas prompt/rute) | `59b6b5375da8443c4b544b7911f0501469512cc97d8ab393fb3e96be47f602fd` |
| Model | `anthropic/claude-sonnet-5` (rute TEXT `EXPLICIT`, prompt v4, tool paksa, tanpa temperature, tanpa fallback) |
| Validator | `intake-policy.ts` `36da168e…`, leksikon `maritim-lexicon/2` `b459c81a…` |
| Leksikon v1 (penilai historis) | `864e4e3b…` (byte-identik) |

Berkas kandidat berubah sebelum run → **REJECTED** (`DITOLAK_KANDIDAT`/`DITOLAK_INTEGRITAS`), 0 panggilan LIVE. Berubah
selama run → berhenti sebelum panggilan berikut (REJECTED, kecuali bukti FAIL sah sudah ada → FAIL).

## 3. Jalur yang diuji (H)

Setiap slot = `submitIntake` produksi pada PostgreSQL loopback sekali pakai, tenant+pengguna sintetis per slot (awalan
`e6eval6`). Jalur: `submitIntake → jalankanEkstraksi → ruteModelIntakeUntukInput → ekstrakIntakeProduksi →
transport OpenRouter → validasiEkstraksi → simpan + buku besar TAH (AgentRun/AgentModelCall)`. Seam ekstraktor uji tidak
dipakai; jalan pintas Eval-4 tidak dipakai. Bukti jalur per slot = gerbang keras `G_JALUR_PRODUKSI` (sama dengan Eval-5).

## 4. Dataset blind (B–F)

- 40 kasus `W01–W40`, versi `prd005-eval6/blind-1`, spesifikasi `docs/PRD-005-EVAL6-DATASET-SPEC.md`.
- Penulis = konteks independen yang HANYA menerima spesifikasi (skema anotasi, definisi klasifikasi, distribusi, pool
  pengenal). TIDAK menerima: kasus Eval-5, audit remediasi, Z05/Z07/Z08/Z17/Z40, `intake-policy.ts`,
  `maritim-lexicon-v2.ts`, Prompt v4, keluaran model sebelumnya, detail kegagalan historis.
  Keterbatasan jujur: isolasi ditegakkan lewat instruksi + laporan pemakaian alat, bukan sandbox teknis; penulis adalah
  model dari keluarga yang sama dengan kandidat.
- Distribusi A 8 · B 5 · C 6 · D 5 · E 4 · F 6 · G 3 · H 3; bahasa ID 15 · EN 15 · MIX 10.
- GT independen, dibuat sebelum eksekusi; sumber = otoritas; tanpa inferensi "masuk akal secara maritim".
- Berkas `eval6-blind-cases.json` dibekukan apa adanya; `eval6-blind-cases.mjs` hanya menerjemahkan anotasi secara mekanis.
- Koreksi GT pra-LIVE hanya oleh penulis independen yang sama, dicatat di `docs/PRD-005-EVAL6-DATASET-LOG.md`, di-hash
  ulang, diperiksa ulang. **Setelah LIVE, GT beku.**

Pemeriksa `prisma/spike-eval6-dataset.mjs` (`prd005-eval6/pemeriksa-paket-1`), dijalankan ulang oleh preflight runner:
integritas GT (wajib 0 temuan, 40/40 sumber↔GT) dan anti-tumpang-tindih (wajib 0) terhadap seluruh berkas terlacak repo
(kecuali artefak Eval-6 sendiri; artefak Eval-5 IKUT dipindai) serta korpus Phase 0, Eval-1..5, RG-H20/H18, E2E, contoh
prompt, uji validator/leksikon/remediasi. Ambang kemiripan (beku sejak Eval-4): trigram kata ≥ 0,30, 5-gram karakter ≥ 0,40.

## 5. Prasyarat regresi (G) — dijalankan preflight, gagal → REJECTED (`DITOLAK_REGRESI_EVAL5`, 0 panggilan)

- Eval-5 Z01–Z40 = **EXPOSED — REGRESSION ONLY**; tidak pernah dihitung sebagai bukti held-out Eval-6.
- Validator kandidat + jawaban sempurna Eval-5: tepat 39/40 kasus (78/80 slot = 97,5%), satu-satunya tak lulus **Z17**
  (keputusan owner 1).
- RG-H20 (5000 MT tanpa bukti dikosongkan), RG-H18 (baris coal tanpa bukti dibuang), E1:E09 (operasi LOAD = null).
- Suite adversarial remediasi `check-validator-remediasi` dan regresi jalur produksi `check-regresi-eval5-produksi`
  wajib lulus sebelum pembekuan.

## 6. Rencana & anggaran (H, K)

- **82 panggilan** = RG-H20 + RG-H18 (kanari, tidak dihitung held-out) + 40 × 2 ulangan (80 slot segar, maksimum).
  Satu percobaan per slot, 0 ulang.
- Batas keras total **US$3,00**. Proyeksi biaya sebelum SETIAP panggilan; plafon proyeksi US$0,035/panggilan
  (82 × 0,035 = US$2,87 ≤ 3,00).
- Estimasi: rata-rata Eval-4 heldout-3 US$0,0146/panggilan (maks US$0,0167) + 30% → **±US$1,20–1,55**.

## 7. Gerbang toleransi-nol (I) — dibekukan sebelum LIVE

| Gerbang | Syarat | Sifat |
|---|---|---|
| FATAL POST (F1–F9) | 0 | keras |
| Muatan tak berbukti POST (nama/jumlah/satuan/operasi, termasuk H20) | 0 | keras |
| Identitas kapal (nama/IMO/MMSI) & pelabuhan & ETA tak didukung sumber | 0 (FATAL F1–F5) | keras |
| `G_TOLERANSI_NOL_TAMBAHAN`: ETD/ETB/ETC, call sign, satuan muatan WRONG/HALLUCINATED di POST | 0 | keras |
| Model disajikan ≠ diminta; fallback | 0 | keras |
| Output tool rusak | 0 | keras |
| `G_JALUR_PRODUKSI` | 82/82 bukti | keras |
| `G_PEMBERSIHAN` (sisa tenant/DB) | 0 | keras |
| `G_PRIVASI_BUKU_BESAR`, privasi laporan | 0 temuan | keras |
| Lulus held-out (POST) | ≥ 90% | minimum |
| Konsistensi antar-ulangan (POST) | ≥ 90% | minimum |

Kebijakan berhenti: pelanggaran toleransi-nol apa pun → berhenti sebelum panggilan berikut.

## 8. Putusan (J)

- **PASS** — 82/82 slot lengkap, semua gerbang lulus, 0 cacat GT, sisa DB 0, privasi lulus.
- **FAIL** — ada pelanggaran gerbang keras yang sah atau (run lengkap) rasio minimum tak tercapai. FATAL sah yang disusul
  kegagalan infrastruktur (402, jaringan, kredit) atau galat runner = **FAIL**. Sisa DB atau kegagalan privasi = FAIL.
- **INCONCLUSIVE** — run tak lengkap karena infrastruktur/anggaran/kredit tanpa bukti pelanggaran, atau > 2 cacat GT sah.
  1–2 cacat GT sah → `MENUNGGU_ADJUDIKASI_GT` (tidak pernah PASS otomatis). Aturan cacat GT tidak boleh menyembunyikan
  FATAL model yang sah.
- **REJECTED** — preflight gagal (kandidat/pembekuan/dataset/tumpang-tindih/regresi/anggaran/otorisasi) → 0 panggilan;
  atau kandidat/pembekuan berubah selama run tanpa bukti FAIL (`DITOLAK_INTEGRITAS`).

## 9. STOP RULE (L)

- **PASS** → nyatakan `SONNET 5 TEXT VALIDATION COMPLETE`. Tidak mengusulkan Eval-7.
- **FAIL** → analisis akar masalah LEBIH DULU (model / validator / prompt / GT / infrastruktur / penilai) sebelum usulan
  perbaikan apa pun. Tidak ada rerun paket ini sebagai held-out.

## 10. Aturan paparan & otorisasi LIVE

- Setelah run apa pun (PASS sekalipun) W01–W40 berstatus **EXPOSED** → hanya regresi.
- LIVE hanya bila owner menyetujui secara terpisah: `OTORISASI_LIVE_EVAL6_OWNER = true` (perubahan eksplisit, yang
  mengubah hash runner → pembekuan ulang yang tercatat) DAN `SPIKE_AUTHORIZED=PRD-005-EVAL6-LIVE`, kunci uji khusus,
  DB loopback, checkpoint di luar repo. Bawaan: tertutup. Saldo OpenRouter diverifikasi owner ≥ US$5 sebelum LIVE.

## 11. Temuan pra-LIVE yang wajib diketahui owner sebelum otorisasi

Lihat `docs/PRD-005-EVAL6-DATASET-LOG.md` §3. Dry-run jalur produksi dengan jawaban model SEMPURNA menghasilkan **60/80 slot
held-out lulus (75% < 90%)**: validator kandidat mengosongkan jumlah/operasi muatan yang tertulis pada W13, W15, W16, W21, W27,
W28, W36, W38, W39, W40 (satuan `ton`/`zak`/`units`/`BBLS`, bentuk kata `bongkaran`/`dimuat`/`pemuatan`, operasi di prosa,
`H-beam`). 0 FATAL/muatan karangan/identitas. Dengan gerbang beku, LIVE hampir pasti FAIL `G_LULUS_HELDOUT`. Gerbang TIDAK
dilonggarkan, GT & kandidat TIDAK diubah.
