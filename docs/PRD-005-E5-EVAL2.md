# PRD-005 E5 Step 4 — Eval-2 Targeted: desain, GT beku, gerbang pra-registrasi

Status: **DRAF untuk review owner** — belum di-commit, belum ada run model apa pun.

| Item | Nilai |
|---|---|
| Versi GT | `prd005-e5-eval2/gt-1` |
| Hash kanonik GT | `59365c755fb8e42d0413ce832bcf509ce9106b7223b8dc0a7840de409af93dd6` |
| SHA berkas fixture | `d925e920f85ff02ba9d43d7336e96bbbd3c029b422a47c853a32eeae50d828fa` |
| Fixture | `prisma/fixtures/spike-intake/eval2-cases.mjs` |
| Pembekuan | `prisma/spike-eval2-beku.mjs` (`verifikasiBekuEval2()`) |
| Uji luring | `prisma/check-eval2-gt.mjs` (`npm run test:eval2-gt`) |

Eval-1 (`prd005-step3c-eval1/gt-2`) **tidak disentuh** dan tetap menjadi uji regresi. Koreksi GT Eval-2 apa pun = versi GT baru + persetujuan owner + nilai beku baru.

## 1. Kasus (26, semua TEXT)

| ID | Kategori | Polaritas | Skenario |
|---|---|---|---|
| T01 | OCR | + | Faks OCR: nama kapal rusak O/0 & I/1 (`L1NTANG B0REAL`), IMO bersih |
| T02 | OCR | + | Salinan OCR: IMO `99983l5` & MMSI `99021I00l` (l/I ↔ 1), nama bersih |
| T03 | OCR | + | IMO `9 998 224`, MMSI `990 203 003`, call sign `Y Z G S 3` berspasi; ETA & ETD sebaris |
| T04 | OCR | + | Label rusak (`Vsl Nm`, `1M0`, `MMS1`, `P0rt 0f Ca11`, `Princ1pal`), nilai bersih |
| T05 | OCR | − (adv) | Faks buram: nama & IMO benar-benar tak terbaca → wajib kosong → INSUFFICIENT |
| T06 | TANGGAL | + | Surat penunjukan: ETA `DD/MM` tanpa tahun |
| T07 | TANGGAL | + | Email: arrival `13 December` tanpa tahun, departure relatif; tanggal surat bertahun |
| T08 | TANGGAL | + | Chat: `tgl 5` / `tgl 6`; pelabuhan tanpa UN/LOCODE |
| T09 | TANGGAL | + | LOA: ETA `D Mon` tanpa tahun; ETD & tanggal surat bertahun (tanggal berbeda) |
| T10 | TANGGAL | + (adv) | Tiba `DD/MM` tanpa tahun; berangkat bertahun di tanggal SAMA + "hari yang sama" |
| T11 | MULTI | + | 1 tug + 2 tongkang (tabel pipa), sentinel DI nama kapal (hipotesis E03) |
| T12 | MULTI | + | 1 tug + 3 tongkang, nama alami, daftar berpoin |
| T13 | MULTI | + | 2 tug (utama + assist) + 2 tongkang dalam satu baris; label `ETA/ETB` |
| T14 | MULTI | + (adv) | Kapal riwayat tahun lalu (nama + IMO) harus dikecualikan |
| T15 | LINTAS BAGIAN | + | Nama hanya di subject; badan "the above vessel" + IMO/call sign |
| T16 | LINTAS BAGIAN | + | Badan "kapal kami", identitas di tabel item/keterangan |
| T17 | LINTAS BAGIAN | + | Formulir berseksi A–D (partikular, panggilan, muatan, kontak) |
| T18 | LINTAS BAGIAN | + (adv) | Sister vessel (nama + IMO) disebut sebagai rujukan → dikecualikan |
| T19 | PARSIAL | + | Kapal + pelabuhan, ETA belum ada |
| T20 | PARSIAL | + | IMO saja + ETA, pelabuhan belum dikonfirmasi |
| T21 | PARSIAL | + | MMSI + call sign + UN/LOCODE saja |
| T22 | PARSIAL | + | Call sign saja + pelabuhan + ETA |
| T23 | PARSIAL | − | Nama kapal saja; pelabuhan & jadwal belum ditentukan |
| T24 | PARSIAL | − | Pelabuhan + ETA + muatan, kapal `TBN` |
| T25 | PARSIAL | − (adv) | Nama kapal + ETA tanpa tahun, tanpa pelabuhan |
| T26 | PARSIAL | − (adv) | Kapal bangunan baru: Hull No. saja + pelabuhan + ETA |

Distribusi: OCR 5 (4+/1−) · TANGGAL 5 (5+) · MULTI 4 (4+) · LINTAS BAGIAN 4 (4+) · PARSIAL 8 (4+/4−) → **21 positif / 5 negatif**, 6 adversarial (T05, T10, T14, T18, T25, T26).

## 2. Keputusan yang mengikat (ikut di-hash)

E2K1 warisan K1–K8 Eval-1 · **E2K2** kasus positif hanya NEW_* (INSUFFICIENT = salah; lebih ketat dari Eval-1 E06) · **E2K3** tanggal tak berbukti di SEMUA field tanggal = setara F4 · **E2K4** UN/LOCODE hanya bila tertulis (tanpa tabel inferensi) · **E2K5** kapal dikecualikan di vessels = F2/F1 · **E2K6** kapal hilang wajib tercermin di `vesselsDropped` · **E2K7** 100% TEXT (recall PDF tak terdefinisi, bukan nol).

## 3. Batas validator yang DIKETAHUI (didokumentasikan di GT, bukan disembunyikan)

- T24: bila model menulis kapal `"TBN"` (tertulis harfiah), validator meloloskannya → F2 di POST. Hanya model yang bisa menghindarinya.
- T26: Hull No. `2211047` sebagai IMO tertulis harfiah → lolos + `IMO_CHECK_DIGIT` (desain K2: ditandai, tidak dibuang) → F1 di POST.
- T14/T18: kapal riwayat/sister yang ditambahkan model tertulis di dokumen → lolos uji sumber → ditangkap G11 / penilai, tidak oleh validator.

## 4. Gerbang pra-registrasi (tidak boleh dilonggarkan sesudah run)

Run: kontrol Sonnet 4.5 ×1, Sonnet 5 ×2, LEDGER_E2E ×2 → 80 panggilan (maks 90), biaya lunak US$2,70 / keras US$3,00 (= Eval-1).

| Gerbang | Ambang | Sifat |
|---|---|---|
| G1 | 0 FATAL di POST (S5, kedua run) | keras |
| G2 | akurasi klasifikasi ≥ 0,90 (≥ 24/26) & 0 NEW_* palsu | kondisional |
| G3 | recall kritis TEKS ≥ 0,95 (recall PDF tak dievaluasi: 0 kasus PDF) | kondisional |
| G4 | halusinasi kritis RAW teks ≤ 1 per run (mutlak) | kondisional |
| G5 | FATAL(S5) ≤ FATAL(kontrol), MAJOR(S5) ≤ MAJOR(kontrol) + 2 | keras |
| G6 | tanda tangan kritis run1 = run2 ≥ 0,90 (≥ 24/26) | kondisional |
| G7 | 0 gagal tool, p95 ≤ 30 s, 0 pelanggaran pagar, served = requested | kondisional |
| G8 | LEDGER_E2E + probe gagal-tertutup + sentinel bersih | keras |
| G9 | 0 tanggal tak berbukti di POST (5 field) — **kontrol & S5** | keras |
| G9R | 0 node tanpaTahun terisi di RAW (S5) | kondisional |
| G10 | 0 kapal peserta hilang diam-diam (RAW→POST tanpa `vesselsDropped`) | keras |
| G11 | kasus negatif/adversarial: 0 FATAL POST & 0 kapal dikecualikan — **semua run** | keras |
| G12 | `check-eval2-gt.mjs` (konsistensi validator) lulus pada commit run | keras (prasyarat) |

Verdict: FAIL bila G1/G5/G8/G9/G10/G11/G12 gagal atau pelanggaran pagar; INCONCLUSIVE bila run tak lengkap; CONDITIONAL bila hanya G2/G3/G4/G6/G7/G9R gagal; PASS ≠ aktivasi.

Adaptasi yang dibenarkan secara matematis: (a) recall PDF tak terdefinisi (0/0) karena 0 kasus PDF — diperlakukan "tidak berlaku", bukan 0, sementara recall TEKS tetap ≥ 0,95 atas 26 kasus; (b) ambang mutlak G4 (≤ 1) dan G5 (+2) dipertahankan walau kasus 26 > 15 → per kasus justru lebih ketat.

## 5. Privasi & sentinel

- Sentinel per kasus `SNT2A`…`SNT2Z` (T01…T26), pola `/SNT2[A-Z]/i`, tak bertabrakan dengan Eval-1 `/SNTLQ[A-P]/`.
- Lokasi divariasikan: NAMA_KAPAL 5 kasus (7 nama), PIHAK 6, KONTAK 6 (huruf kecil di email), REFERENSI 6, CATATAN/footer 3. 21 nama kapal alami tanpa sentinel.
- Deteksi kebocoran tetap efektif karena: (1) setiap dokumen memuat sentinel-nya sendiri dan tidak memuat sentinel kasus lain; (2) setiap dokumen punya baris ≥ 30 karakter yang memuat sentinel → pemindai `BADAN_DOKUMEN` (dipakai ulang dari Eval-1) menangkap kutipan dokumen; (3) kontak hanya `@contoh.invalid` / `+62-000` → pemindai `KONTAK`; (4) diagnostik RAW (§6) tidak pernah menyimpan nilai mentah, jadi nama alami tanpa sentinel pun tidak bisa bocor lewat laporan.
- Data fiktif: IMO 99982xx–99983xx (check digit sah), MMSI 9902xxxxx, UN/LOCODE sebagaimana tertulis (K8).

## 6. Desain diagnostik RAW tersanitasi (DESAIN saja — belum diimplementasikan)

Masalah E4: perbedaan tanda tangan E12/E14 tak bisa dijelaskan karena RAW tidak disimpan. Runner Eval-2 kelak menambahkan `diagnostik` per slot:

1. **Garam per laporan**: 16 byte acak dibuat saat run, dipakai untuk HMAC-SHA256, **tidak pernah ditulis** ke laporan/log. Sidik (12 hex) hanya bisa dibandingkan DI DALAM satu laporan (run1 vs run2 vs kontrol), tidak bisa dibalik ke nilai.
2. **Kerangka struktural RAW** (tanpa nilai): klasifikasi (enum, aman); jumlah entri kapal & muatan; per kapal: `role` (enum), field identitas mana yang terisi, **sidik** nilai ternormalisasi, panjang, **bentuk karakter** (A=huruf, 9=angka, mis. `AAAAA AAAAA 999`), jumlah token + sidik per token (menunjukkan token mana yang hilang — hipotesis E03), hasil penyelarasan ke ref GT & hasil penilai per field; tanggal: hanya bentuk (`YYYY-MM-DD`/null), cocok GT ya/tidak, flag validator; muatan: kuantitas & operasi (angka sintetis, bukan PII) + sidik nama.
3. **Diff lintas run** dihitung di memori: per kasus, daftar jalur field yang berbeda + pasangan sidik/bentuk — cukup untuk membedakan "token dibuang", "entri kapal hilang", "klasifikasi berubah", "tanggal diisi/dikosongkan".
4. **Tidak pernah disimpan**: kunci API, frasa otorisasi, teks dokumen, nilai kontak, JSON RAW utuh, nilai string identitas/nama/pihak.
5. **Pemindaian sebelum persistensi**: pemindai Eval-1 (kunci, pola kunci, frasa, kontak, prompt/dokumen, rahasia env, badan dokumen) + pola sentinel Eval-2 + larangan nilai GT string apa pun muncul utuh. Satu temuan → laporan DITAHAN (hanya pemberitahuan minimal), sama seperti Eval-1.
6. Perubahan runner yang dibutuhkan (Step berikutnya, bukan Step 4): runner Eval-2 terpisah (`spike-eval2-runner.mjs`) yang memakai ulang pagar Eval-1 (mode eksplisit, DB lokal, kunci uji khusus, pencegat biaya/allowlist) + fungsi `diagnostikRaw()` murni yang diuji luring dengan stub.
