# PRD-005 Eval-5 — Protokol Fresh Blind Evaluation (pra-registrasi)

Dokumen ini dibekukan (sha256 di `prisma/spike-eval5-beku.json`) SEBELUM run LIVE apa pun. Mengubahnya
setelah pembekuan membatalkan pembekuan → runner menolak dengan 0 panggilan.

## 1. Pertanyaan

Apakah kandidat produksi **Sonnet 5 + intake TEXT** (pasca-promosi `b89ca36`) tetap aman dan akurat pada
kasus yang benar-benar belum pernah dipakai untuk memperbaiki sistem — **dan** apakah perekat rute produksi
pasca-promosi (yang belum pernah dijalankan LIVE) benar-benar dipakai?

## 2. Kandidat beku (Step A)

`prisma/spike-eval5-kandidat.mjs` — sha256 16 berkas jalur produksi TEXT, identitas Prompt v4, rute registri,
bentuk transport. Commit dasar `a67baf4be908b3aec2b9469d5f0b402ff531f72e`.

| Item | Nilai |
|---|---|
| Model | `anthropic/claude-sonnet-5` (VERIFIED, dasar SPIKE, `cakupanInput: ['TEXT']`) |
| Rute (`ruteModelIntakeUntukInput`, TEXT) | `EXPLICIT`, kemampuan `{acceptsTemperature:false, supportsForcedToolChoice:true, supportsPdfNative:false}`, prompt v4 |
| Prompt | `vessel-call-extract` v4 / skema v4, hash `6ed1edba…65959`; legacy v3 `8e326ac4…7eea` tetap untuk di luar cakupan |
| Validator `intake-policy.ts` | `4f5b1273…059c` (= SHA beku Eval-4) |
| Leksikon | `maritim-lexicon/1`, `864e4e3b…fb83` |
| Perekat rute (baru sejak Eval-4) | `vessel-call-extract.ts 44134958…`, `intake-ledger.ts 9e679307…`, `intake.service.ts cdfed782…`, `model-capabilities.ts 99da39fb…`, `perekam-panggilan.ts 76718f4c…`, `openrouter.ts fbef6e84…` |

Kandidat tidak diubah oleh Eval-5. Berkas kandidat berubah sebelum run → DITOLAK (0 panggilan); berubah selama run →
BERHENTI sebelum panggilan berikut (putusan DITOLAK_INTEGRITAS, kecuali bukti FAIL sah sudah ada).

## 3. Jalur yang diuji (syarat kritis owner)

Setiap slot = `submitIntake` produksi pada PostgreSQL loopback sekali pakai, tenant+pengguna sintetis per slot,
`TAH_INTAKE_MODEL=anthropic/claude-sonnet-5`, `TAH_CORE_ENABLED=true`. Jalur: `submitIntake → jalankanEkstraksi →
ruteModelIntakeUntukInput → ekstrakIntakeProduksi → buatEkstraktorOpenRouter(Prompt v4) → validasiEkstraksi → simpan`.
Seam `pengekstrakUji` tidak pernah dipakai; jalan pintas Eval-4 (ekstraktor dipanggil langsung) tidak dipakai.

Bukti per slot (gerbang keras `G_JALUR_PRODUKSI`): badan permintaan = system prompt & skema tool v4 persis, tool paksa,
tanpa temperature, tanpa fallback; tepat 1 panggilan; requested = served = Sonnet 5; tepat 1 `VesselCallIntake` TEXT;
`AgentRun` SUCCEEDED tertaut ke intake dengan tepat 1 `AgentModelCall` ber-identitas prompt v4; `outputHash` =
sha256(jsonKanonik(RAW tertangkap)); POST yang dinilai = baris produksi, identik dengan `validasiEkstraksi`
independen atas klon RAW.

## 4. Dataset blind (Step B)

- 40 kasus `Z01–Z40`, ditulis konteks penulis **independen** yang hanya menerima
  `docs/PRD-005-EVAL5-DATASET-SPEC.md` (tanpa akses ke validator, leksikon, prompt, kasus Eval-1..4, atau keluaran model).
  Keterbatasan jujur: isolasi penulis ditegakkan lewat instruksi & laporan pemakaian alat, bukan sandbox teknis; penulis
  adalah model dari keluarga yang sama dengan kandidat.
- Distribusi: A 8 · B 5 · C 7 · D 4 · E 4 · F 6 · G 3 · H 3; bahasa ID 15 · EN 15 · MIX 10.
- Berkas data `eval5-blind-cases.json` dibekukan apa adanya; `eval5-blind-cases.mjs` hanya menerjemahkan anotasi secara mekanis.
- Masalah GT/sumber yang ditemukan SEBELUM LIVE: hanya dataset yang diperbaiki (oleh penulis independen), koreksi dicatat
  di §9, validasi diulang, hash dibekukan ulang. Kandidat tetap.

## 5. Anti-tumpang-tindih (Step C) & integritas GT (Step D)

`prisma/spike-eval5-dataset.mjs` (`prd005-eval5/pemeriksa-paket-1`), dijalankan ulang oleh preflight runner.

- Tumpang-tindih (wajib 0): ID, teks persis, nama kapal, IMO/MMSI, call sign, principal/perusahaan, UN/LOCODE, sentinel lama,
  terhadap seluruh berkas terlacak repo (kecuali artefak Eval-5) dan korpus kasus Eval-1/2/3/4 + RG-H20/RG-H18 + Phase 0 +
  E11 + literal pengembangan validator/leksikon/prompt/E2E; kemiripan dengan ambang beku Eval-4 (trigram kata ≥ 0,30,
  5-gram karakter ≥ 0,40).
- Integritas GT (wajib 0): distribusi & bahasa; sentinel/kontak uji; identitas dari pool; UN/LOCODE dari pool terverifikasi
  (UNECE 2024.2, sha256 `014d5139…`); nilai GT kritis tertulis literal; IMO/MMSI/call sign berlabel; jumlah muatan tertulis
  pada pernyataan muatan (bukan DWT/GRT/LOA/draft/uang/kontak/pengenal) dan tak sama dengan nilai terlarang; tanggal GT hanya
  bila bertahun di sumber; klasifikasi ↔ aturan minimum; larangNew konsisten; aturan gt-sumber-2 K1–K3.

## 6. Rencana, anggaran, gerbang

- 82 panggilan = RG-H20 + RG-H18 (kanari, tidak dihitung held-out) + 40 × 2 ulangan. Satu percobaan per slot, 0 ulang.
- Batas keras total **US$3,00** (lunak = keras). Proyeksi biaya sebelum SETIAP panggilan; plafon proyeksi US$0,035/panggilan
  (82 × 0,035 = US$2,87). Estimasi dari Eval-4 heldout-3 (rata-rata US$0,0146/panggilan, maks US$0,0167; +30% untuk teks
  lebih panjang): **±US$1,20–1,55**.
- Gerbang = `AMBANG_KUALITAS_EVAL4` apa adanya: 0 FATAL POST, 0 muatan tak berbukti POST (termasuk H20), 0 identitas/fallback,
  0 kegagalan output tool, held-out lulus ≥ 90%, konsistensi antar-ulangan POST ≥ 90%. Ditambah (Eval-5, keras):
  `G_JALUR_PRODUKSI`, `G_PRIVASI_BUKU_BESAR`. Non-keras: `G_PEMBERSIHAN` (sisa DB 0), `G_CACAT_GT`.
- Kebijakan berhenti Eval-4: pelanggaran toleransi-nol → berhenti sebelum panggilan berikut.

## 7. Putusan (urutan tetap, `putusanEval5`)

1. **FAIL** — ada FATAL POST sah / muatan tak berbukti / pelanggaran identitas, output tool, regresi, jalur produksi, privasi
   buku besar, atau (run lengkap) rasio minimum tak tercapai. FAIL tetap FAIL walau run kemudian berhenti karena
   infrastruktur (402, jaringan, kredit) atau runner galat.
2. **GAGAL_RUNNER** — runner galat tanpa bukti FAIL.
3. **DITOLAK_INTEGRITAS** — kandidat/pembekuan berubah selama run tanpa bukti FAIL.
4. **DITAHAN_SISA_DB** — pembersihan menyisakan baris.
5. **INCONCLUSIVE** — run tak lengkap karena infrastruktur/anggaran/kredit tanpa bukti FATAL, atau > 2 cacat GT sah.
6. **MENUNGGU_ADJUDIKASI_GT** — 1–2 cacat GT sah; tidak pernah PASS otomatis.
7. **PASS** — 82/82 slot lengkap, semua gerbang lulus, 0 cacat GT, sisa DB 0, privasi lulus.

## 8. Aturan paparan & pasca-run

- Setelah run apa pun (PASS sekalipun) paket Z01–Z40 berstatus **TERPAPAR** → hanya boleh menjadi regresi.
- GT tidak boleh diperbaiki diam-diam setelah keluaran model terlihat. Setiap cacat GT pasca-run didokumentasikan eksplisit
  sebagai kontaminasi/paparan. Aturan cacat GT tidak boleh dipakai menyembunyikan FATAL model yang sah.
- FAIL → perbaikan kandidat → evaluasi berikut wajib memakai paket baru (bukan rerun paket ini sebagai held-out).

## 9. Otorisasi LIVE & catatan koreksi dataset

- LIVE hanya bila owner menyetujui secara terpisah: `OTORISASI_LIVE_EVAL5_OWNER = true` (perubahan eksplisit) DAN
  `SPIKE_AUTHORIZED=PRD-005-EVAL5-LIVE`, kunci uji khusus, DB loopback, checkpoint di luar repo. Bawaan: tertutup.
- Saldo/limit OpenRouter wajib diverifikasi owner ≥ US$5 sebelum LIVE (penyebab 402 historis tidak terbukti).

Koreksi dataset pra-LIVE: lihat `docs/PRD-005-EVAL5-DATASET-LOG.md`.

**Temuan pra-LIVE yang wajib diketahui owner sebelum otorisasi** (log §2.3): dry-run jalur produksi dengan jawaban model
SEMPURNA menghasilkan 70/80 slot held-out lulus (87,5% < 90%) — validator produksi mengosongkan nilai muatan yang tertulis
pada Z05, Z07, Z08, Z17, Z40. Dengan gerbang yang disetujui, run LIVE hampir pasti berakhir FAIL `G_LULUS_HELDOUT` apa pun
kualitas model; nilai LIVE yang tersisa = bukti keselamatan (FATAL/muatan karangan/identitas) pada data segar + bukti jalur
produksi pasca-promosi. Gerbang TIDAK dilonggarkan dan kasus TIDAK diubah.
