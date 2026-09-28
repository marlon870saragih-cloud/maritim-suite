# PRD-005 — Controlled Validator Remediation (pasca-Eval-5)

Remediasi terkendali validator intake TEXT atas false-negative yang ditemukan dry-run jawaban sempurna Eval-5
(audit akar masalah Z05/Z07/Z08/Z17/Z40). Luring saja: 0 panggilan LIVE, tanpa deploy, produksi tidak diubah.

## 1. Status dataset Eval-5 (PERMANEN)

**Eval-5 Z01–Z40 = EXPOSED — REGRESSION ONLY** untuk setiap kandidat yang dihasilkan sesudah remediasi ini.
Alasan: seluruh teks & GT dibaca sesi implementasi; dry-run mengungkap hasil validator per kasus untuk ke-40 kasus; remediasi
dirancang dari kasus-kasus itu. Paket ini TIDAK PERNAH lagi dihitung sebagai bukti held-out. Artefak Eval-5 beku (commit
`97348e0`, manifes `prisma/spike-eval5-beku.json`, kandidat `5e863242…`) tetap bukti historis dan tidak ditulis ulang.

## 2. Keputusan owner (terkunci)

| # | Keputusan | Implementasi |
|---|---|---|
| 1 | Z17 — "discharge/loading call" di luar baris muatan TIDAK menetapkan operasi | tidak diubah; diuji (Z17, Z17b) |
| 2 | Z40 — pengikatan lintas baris sempit & deterministik | R4 |
| R1 | WMT grup satuan SENDIRI (tak dinormalkan ke MT) | leksikon v2 |
| R2 | KL grup satuan SENDIRI (tak dinormalkan ke CBM) | leksikon v2 |
| R3 | hanya frasa `TO BE LOADED` / `TO BE DISCHARGED` (bukan LOADED/DISCHARGED) | leksikon v2 + validator |
| R4 | sambungan angka(N) → satuan(N+1) → nama muatan; pengecualian telepon | validator + leksikon v2 |
| R5 | leksikon validator `maritim-lexicon/2`; v1 tetap milik makna historis | berkas baru, v1 tak diubah |

## 3. Perubahan

- `src/lib/maritim-lexicon-v2.ts` (BARU, `maritim-lexicon/2`, sha256 `b459c81a…24a5`): v1 + WMT, KL, frasa operasi terikat,
  label bukan-jumlah kontak/rekening (`TEL/TELP/TELEPON/PHONE/HP/WA/WHATSAPP/FAX/REKENING/REK/ACCOUNT/ACC/NPWP`) dan tambatan
  (`BERTH/JETTY/DERMAGA/PIER/WHARF`), dokumentasi aturan lintas baris. Setiap entri baru berprovenans `OWNER:EVAL5-REMEDIASI-R*`.
- `src/lib/maritim-lexicon.ts` (v1): **tidak diubah** (`864e4e3b…`); tetap dipakai scorer-3 & pemeriksa GT gt-sumber-2.
- `src/services/intake/intake-policy.ts` (`4f5b1273…` → `36da168e…`): impor leksikon v2; grup satuan `MT|CBM|WMT|KL`;
  `operasiToken` (kata tunggal v1 + frasa terikat); `fragmenTelepon` (rangkaian diawali `+`/`0`/`(0` dengan ≥ 8 digit bukan
  kandidat jumlah; rentang "5000-6000 MT" tidak terpengaruh); `sambunganBarisMuatan` (baris N diakhiri angka, N+1 langsung
  diawali satuan, tanpa baris kosong; kandidat HANYA angka di titik sambung sesudah semua pengecualian); `barisMuatan` memakai
  sambungan hanya bila nama muatan baris itu tepat sesudah satuan (harfiah, tanpa OCR).
- Pin change-control `prisma/check-tah-ledger.mjs` diperbarui eksplisit (catatan persetujuan owner), sesuai konvensi berkas itu.
- `prisma/check-intake-policy.mjs`: uji kemurnian impor menunjuk v2 (syarat sama: modul data tanpa impor & tanpa lookbehind;
  v1 tetap diperiksa tanpa impor).

Makna yang dipertahankan: angka tanpa satuan leksikon/label jumlah bukan jumlah; operasi hanya dari baris muatan;
`FRASA_BUKAN_OPERASI` utuh; uang/tarif/partikular/pengenal dikecualikan; OCR tetap wajib bersatuan.

## 4. Kandidat baru (BUKAN kandidat Eval-5)

`prisma/spike-kandidat-pasca-eval5.mjs` — `prd005-intake-text/kandidat-pasca-eval5-1`, sidik `59b6b5375da8443c…`.
Model/prompt/rute/perekat jalur produksi identik dengan kandidat Eval-5; berbeda pada `intake-policy.ts` + berkas leksikon v2.
Evaluasi blind berikutnya = **Eval-6** (dataset BARU, penulis independen yang tidak menerima audit/remediasi ini). Belum dibuat.

## 5. Hasil uji (luring)

| Uji | Hasil |
|---|---|
| `check-validator-remediasi` (positif, adversarial, R5, Eval-5 regresi validator, perbandingan vs validator dasar) | 70/70 |
| Perbandingan validator baru vs dasar `97348e0` (19.003 varian Eval-1..5 + RG) | berubah HANYA Z05/Z07/Z08/Z40; 0 nilai hilang; nilai baru = tepat nilai tertulis |
| Regresi Eval-5 jalur produksi nyata (`check-regresi-eval5-produksi`, DB loopback, stub jawaban sempurna) | 78/80 = 97,5%; satu-satunya tak lulus Z17 (keputusan owner 1); 82/82 bukti jalur produksi; 0 FATAL; sisa DB 0 |
| Injeksi angka terlarang GT Eval-5 sebagai jumlah × {MT, WMT, KL, CBM} | 0 lolos dari 148 |

### Status pembekuan historis

| Suite | Status | Klasifikasi |
|---|---|---|
| `test:eval4-runner` | gagal (pin `SHA_BEKU_EVAL4` memuat SHA `intake-policy.ts`) → runner menolak → berantai | EXPECTED HISTORICAL FREEZE FAILURE — di salinan sementara dengan hanya pin itu diganti: 183/183 |
| `test:eval5-runner` | gagal (sidik kandidat Eval-5 memuat SHA `intake-policy.ts`) → runner menolak → berantai | EXPECTED HISTORICAL FREEZE FAILURE — di salinan dengan pin diganti: 71/73; 2 gagal = asersi plafon historis pra-remediasi (E1b/E1c: 70/80, lima kasus) yang kini 78/80 |

Pin historis TIDAK diubah.
