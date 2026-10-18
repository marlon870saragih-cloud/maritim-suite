# SG-05 — batas fixture WA-1 dan usulan penyelarasan persyaratan

**Status SG-05: OPEN.** Dokumen ini tidak menutup SG-05 dan tidak mengubah tenggat yang berlaku.

- **Dasar:** keputusan owner **D-3** (OD-32): izin implementasi A1 berdasarkan rancangan opsi A v2. A1 terdiri dari tepat tiga path: dokumen ini, `prisma/check-sg05-batas-fixture.mjs`, dan `docs/TAH-CURRENT-CHECKPOINT.md`.
- **Baseline:** `main` `23ec4e8f59904af9e9827c3a57953abe18874d4a` (merge PR #39) saat dokumen dibuat; A1 merged di `ab4dac7628683755d301c7620613f1b125fd7987` (PR #40).
- **Keputusan owner:** D-1 (OD-33), D-2 (OD-34), D-2b (OD-35), dan D-4 (OD-36) **DISETUJUI** — dilaporkan owner dari sesi ChatGPT Work sesudah merge PR #40 (2026-10-18 14:21 UTC); tanggal persis keputusan tidak tercatat di repository; disinkronkan ke repository melalui pembaruan ini. Persyaratan di bawah berlaku; isinya tidak berubah dari versi usulan. Keputusan ini **bukan** izin implementasi A2, F-II, atau WA-3.
- **Status bukti (per `ab4dac7`):** P-1 tersedia (keputusan + uji statis §5, Linux 55/0; Windows sungguhan belum diuji); P-2 belum (A2 belum diimplementasikan/diuji); P-3 belum (jalur Send F-II belum ada). **SG-05 tetap OPEN.**
- **Penerimaan demo WA-2a 2a-G (OD-30) tetap berlaku.** Dokumen ini tidak membatalkan atau memperluas syarat penerimaan itu.
- **Istilah:** "tanpa pengiriman WhatsApp nyata" berarti tidak ada panggilan ke provider WhatsApp dan tidak ada pesan ke nomor nyata. Istilah ini **bukan** klaim bahwa aplikasi tidak menghasilkan lalu lintas jaringan.
  - F-6: `next dev` mengunduh Google Fonts.
  - Pengukuran egress di container Linux terbatas karena proxy loopback.
  - Keduanya dicatat terpisah di checkpoint.

---

## 1. Definisi asli dan tenggat (fakta, `23ec4e8`)

| Sumber | Isi |
|---|---|
| `docs/whatsapp/PRD-WA-1.md:382` (beku) | SG-05: penerima fixture aktif, bertanda `TEST_FIXTURE`, bukti izin uji berlaku, **terkait tenant uji**; dicek di **Approve, Send**; `CONTACT_INELIGIBLE` / `CONSENT_NOT_GRANTED` |
| `docs/whatsapp/WA-1-STEP2J-EVIDENCE.md:105` | "wajib ditutup **sebelum WA-3**" |
| `docs/TAH-CURRENT-CHECKPOINT.md` §H | "Integrasi WhatsApp nyata tidak boleh dimulai sebelum SG-05 ditutup" |
| `docs/TAH-CURRENT-CHECKPOINT.md` §F | Wajib diselesaikan sebelum integrasi pengiriman WhatsApp nyata (keputusan owner 2026-10-09) |
| `docs/TAH-CURRENT-CHECKPOINT.md` §L | Peta fase owner: **WA-3** = provider resmi dan pesan nyata internal |

**Tenggat yang berlaku tetap seperti di atas** sampai owner menyetujui perubahan secara eksplisit.

## 2. Kekurangan implementasi WA-1 (fakta)

- Fixture tidak punya tenant (`src/services/communication/comm-fixture.ts:38–69`), dan pemilihnya tidak memeriksa tenant (`:76–83`).
- Approve WA-1 tidak memeriksa SG-05. Yang diperiksa hanya integritas snapshot (`communication-approval.service.ts:198–215`).
- Halaman WA-1 menampilkan semua fixture ke semua tenant (`src/app/(app)/automation/communications/[id]/page.tsx`).
- Uji `prisma/check-comm-send-db.mjs:314–318` memperlihatkan tenant A dan B memakai fixture yang sama. Tujuan uji itu adalah idempotensi; pemakaian bersama hanya terlihat sebagai efek samping.

## 3. Perlindungan penerima WA-2 yang sudah ada (fakta dari kode; uji DB tidak dijalankan ulang untuk dokumen ini)

- **Lapisan DB:**
  - FK komposit `WaClientMessage.[tenantId, contactId]`;
  - `@@unique([tenantId, successKey])`;
  - trigger kontak, grant-voyage, dan pesan (migrasi `20261010180000_wa2a_contact_consent_access`).
- **Lapisan service:**
  - kunci kontak memfilter tenant (`wa-lock.ts`);
  - pemeriksaan kontak dan akses (`wa-message-check.ts`);
  - snapshot e164, party, grant, dan versi consent di draft (`wa-message.service.ts`);
  - pemeriksaan ulang di approve (`wa-message-approval.service.ts`).
- **Invalidasi berbasis peristiwa:** perubahan kontak, consent, atau grant menghentikan approval yang tertaut. Hasilnya `CONTACT_INELIGIBLE`, `CONSENT_NOT_GRANTED`, atau `ACCESS_REVOKED`.
- **Celah:** kondisi berbasis **waktu** tidak memicu peristiwa apa pun bagi pesan yang sudah APPROVED, yaitu verifikasi kontak kedaluwarsa dan grant lewat `validUntil`. Jalur Send belum ada, sehingga belum ada pemeriksaan ulang di saat kirim.
- **Jangkauan modul:**
  - 22 berkas di luar zona WA-1 menjangkau `comm-fixture.ts` secara modul, dan semuanya lewat `wa1-bridge.ts → communication.service.ts`.
  - Simbol fixture tidak diteruskan bridge. Hal ini dijaga uji statis §5.

## 4. Syarat penutupan SG-05 (DISETUJUI — D-1/OD-33, D-2/OD-34)

SG-05 hanya boleh berubah menjadi CLOSED bila **ketiga** bagian berikut terpenuhi **dan** owner menyetujui penutupannya. Persetujuan atas suatu kewajiban bukan bukti bahwa kewajiban itu terpenuhi.

### P-1 — penyimpangan fixture WA-1, diterima sementara (DISETUJUI — D-1/OD-33; bukti tersedia, lihat status di bawah)

| Item | Isi |
|---|---|
| Penyimpangan | (a) fixture tidak terkait tenant uji; (b) Approve WA-1 tidak memeriksa SG-05 |
| Batas berlaku | Hanya simulasi FAKE: non-produksi, flag WA-1, allowlist Automation, provider FAKE, fixture hanya di zona WA-1 |
| Berakhir otomatis bila | Fixture dipakai di luar zona WA-1, provider bukan FAKE, atau WA-1 diaktifkan di produksi |
| Bukti pendukung | Uji statis §5 lulus di `main` dengan semua kontrol mutasi terdeteksi |
| Status bukti | Tersedia: OD-33 + uji statis §5 di `main` `ab4dac7` (Linux 55/0). Batas: Windows sungguhan belum diuji; cakupan hanya batas fixture di `src/` |
| Status SG-05 | Tetap OPEN |

### P-2 — kesiapan fungsi revalidasi pra-kirim A2 dan uji mandirinya (pekerjaan pra-integrasi baru; penyusunan rancangan disetujui D-4/OD-36; implementasi belum disetujui; bukti belum ada)

A2 adalah pekerjaan baru. A2 **bukan** perluasan syarat penerimaan WA-2.

Usulan isinya: fungsi baca/kunci tanpa provider, tanpa Send, dan tanpa menulis `successKey`. Fungsi ini memeriksa ulang:
- R1: tenant;
- R2: status pesan, approval, dan versi;
- R3: kontak aktif dan verifikasi belum kedaluwarsa (dihitung saat itu);
- R4: consent OPT_IN dengan versi sama dengan snapshot;
- R5: e164 dan party sama dengan snapshot;
- R6: grant berlaku dan principal tidak berpindah;
- R7: akses voyage lewat resolver;
- R8: sumber/kandidat.

**Bukti:** uji runtime di DB sekali pakai. Uji ini menulis data uji, jadi perlu izin terpisah. **Status SG-05 setelah P-2: tetap OPEN.**

### P-3 — bukti integrasi di jalur Send (hanya dapat dipenuhi setelah jalur Send ada; F-II diizinkan secara prinsip D-2b/OD-35, implementasi belum disetujui; bukti belum ada)

Semua butir harus **teramati**, bukan dijanjikan:

1. Send memanggil revalidasi A2 di transaksi yang sama dengan klaim kirim. Dibuktikan dengan uji statis atas kode Send yang nyata, ditambah uji runtime dengan kontrol mutasi "panggilan dihapus".
2. Perubahan setelah approval tertangkap di klaim, dengan 0 panggilan provider. Perubahannya:
   - kontak dinonaktifkan atau verifikasinya kedaluwarsa;
   - consent dicabut atau versinya berubah;
   - nomor/snapshot tidak cocok;
   - grant dicabut atau kedaluwarsa;
   - principal berpindah;
   - konteks tenant lain.
3. Perubahan bersamaan menghasilkan hasil yang deterministik, tanpa pernah mengirim dengan fakta basi.
4. Kunci idempotensi tidak saling replay antar-tenant. Ini diuji pada logika penulis, bukan hanya pada indeks.
5. Semua bukti dihasilkan tanpa pengiriman nyata: provider FAKE/loopback, non-produksi.

## 5. Uji statis batas fixture (`prisma/check-sg05-batas-fixture.mjs`)

**Jalankan:** `node prisma/check-sg05-batas-fixture.mjs`. Uji ini tanpa DB dan tanpa jaringan. Kontrol mutasinya berjalan pada clone sementara di direktori tmp, dan folder itu dihapus hanya setelah identitasnya diverifikasi.

**Cakupan klaim:** fixture WA-1 tidak dipakai jalur WA-2/provider di `src/`. Uji ini **bukan** bukti kebenaran penerima saat Send, **tidak** membuktikan R1–R8, dan **tidak menggantikan uji runtime**.

### 5.1 Prasyarat gagal-tertutup

| ID | Gagal bila |
|---|---|
| P0-a | `tsconfig.json` `paths` ≠ `{"@/*": ["./src/*"]}` |
| P0-b | Ada `import()`/`require()` non-literal di `src/` |
| P0-c | Zona WA-2 memuat `eval(`, `new Function`, `createRequire`, `require(`, atau ada berkas yang tidak dapat diurai |
| P0-d | `next.config.*` memuat alias/resolve/webpack/turbopack |
| P0-e | `comm-fixture.ts`, `wa1-bridge.ts`, atau `communication.service.ts` tidak ada |

### 5.2 Aturan

| ID | Pemeriksaan | Bentuk yang didukung | Batas |
|---|---|---|---|
| S-1 | Perujuk **langsung** `comm-fixture` = persis 4 berkas zona WA-1 | `import … from`, `import type`, `export {…} from`, `export * from`, `import()`/`require()` literal, alias `@/`, relatif, dengan/tanpa ekstensi, `index.*` | `fs`, berkas di luar `src/`, alias selain `@/` (→ gagal P0) |
| S-2 | Tepi langsung dari luar zona WA-1 ke modul WA-1 = persis daftar literal (bridge → 3 modul; 3 halaman → `comm-access`); modul tujuan selain `communication.service` tidak menjangkau fixture | Sama dengan S-1 | Impor baru ke modul WA-1 dari luar zona selalu gagal dan perlu review (disengaja) |
| S-3 | `wa1-bridge.ts` hanya `export {…} from` ke 3 modul; 15 nama **asli** (sebelum `as`) persis; tanpa `buatRevisiPesan`/`revisiDalamTx`/`pilihPenerimaFixture`/`FIXTURE_PENERIMA` | Alias `as`, `type` inline | `export *`, `export default`, impor, atau kode lokal → gagal |
| S-4 | **Heuristik teks** atas satu berkas `communication.service.ts`. Mulai dari 6 fungsi yang diteruskan bridge, ditelusuri deklarasi tingkat-atas (function, class, const/let/var, type, interface, enum) yang **disebut**. Gagal bila menyebut `buatRevisiPesan`/`revisiDalamTx`, atau identifier impor dari modul yang menjangkau fixture | Helper lokal berantai, kelas (potongan kelas utuh ikut), sebutan di string/komentar (over-approximation) | Lihat 5.3 |
| S-5 | Token `TEST_FIXTURE`, `WA1_TEST_FIXTURE`, `recipientFixtureId`, `FIXTURE_PENERIMA`, `pilihPenerimaFixture`, `comm-fixture` tidak ada di kode zona WA-2 (komentar dibuang; string, template, dan regex dipertahankan) | Identifier, string, template literal (termasuk `${}` bersarang) | String rakitan/terenkode, data dari DB/env |
| S-6 | Setiap berkas di luar zona WA-1 yang menjangkau fixture secara modul: (a) juga merujuk bridge, dan (b) rantai terpendeknya ke fixture lewat tepi `wa1-bridge → communication.service` | BFS helper gate `perujukTransitif` (algoritma berbeda dari S-2, sebagai pemeriksa silang) | Hanya di `src/` |

### 5.3 Batas klaim S-4 (heuristik, bukan analisis seluruh pemanggilan)

- S-4 **bukan** call graph. S-4 tidak memodelkan `this`, dispatch properti (`obj[k]()`), binding yang di-reassign, callback yang dioper pemanggil, atau perilaku di dalam modul impor selain lewat himpunan modul yang menjangkau fixture.
- S-4 **gagal-tertutup** bila:
  - salah satu akar tidak ditemukan;
  - fungsi yang diteruskan bridge berbeda dari akar;
  - berkas memuat `eval`/`new Function`/`import * as`/`import()`/`require()`;
  - ada bentuk impor yang tidak dikenal.
- `communication.service.ts` beku (`pGlobal`), sehingga perubahan apa pun sudah ditolak gate lingkup. S-4 menjaga bila suatu saat ada pengecualian beku. Dalam kontrol mutasi M4, pelanggaran ditangkap oleh S-4 sendiri.

### 5.4 Penguraian sumber (batas)

- Komentar dibuang oleh pengurai kecil.
- **Regex literal** dikenali secara sempit dari token sebelumnya. JSX `</…` dan `/>` tidak dianggap regex.
- Pengurai bisa keliru pada bentuk yang tidak lazim. String/template/regex/komentar yang tak tertutup → gagal-tertutup (P0-c).
- Teks JSX yang memuat `//` dapat terbaca sebagai komentar, sehingga sisa barisnya tidak diperiksa S-5.

### 5.5 Kontrol mutasi (semua harus ditangkap oleh aturan sasaran di uji ini; kontrol positif harus lulus)

| ID | Mutasi | Sasaran |
|---|---|---|
| P-01, P-02 | Clone bersih; tambah dokumen saja | Lulus |
| M1-1..M1-4 | Impor alias, relatif, `export * from`, `import()` literal ke `comm-fixture` dari WA-2/provider baru | S-1 |
| M1-5 | `import()` non-literal | P0-b |
| M1-6 | Perujuk WA-1 yang tercatat hilang (daftar harus persis) | S-1 |
| M2-1..M2-4 | WA-2 mengimpor `communication-send.service`; layout mengimpor `communication.service`; bridge menambah modul; `comm-access` menjangkau fixture | S-2 |
| M3-1..M3-4 | Bridge meneruskan `buatRevisiPesan` (dengan/tanpa alias), `export *`, kode lokal | S-3 |
| M4-1..M4-4 | Sebutan fixture di akar; di helper berantai; impor dari `communication-send.service`; akar diganti nama | S-4 **saja** |
| M4-5 | Sebutan fixture di fungsi yang tidak terjangkau | Lulus |
| P-03 | Seluruh berkas sumber `src/` diubah ke CRLF | Lulus |
| M4-1c..M4-3c | M4-1..M4-3 pada `communication.service.ts` ber-CRLF | S-4 **saja** |
| M5-1, M5-2 | String dan template literal fixture di zona WA-2 | S-5 |
| M5-3 | Token fixture hanya di komentar | Lulus |
| M6-1..M6-3 | Layanan luar zona ke `communication-read.service`; WA-2 ke `comm-fake-provider`; WA-2 ke bridge **dan** fixture | S-6 |

### 5.6 Keabsahan mutasi dan helper (revisi 1, temuan review PR #40)

- **Mutasi sisip M4.** Sebuah mutasi baru dihitung sebagai deteksi bila semua syarat berikut terpenuhi:
  - isi berkas = isi sebelum + **tepat satu** baris, disisipkan sesudah `{` + EOL di dalam potongan fungsi sasaran;
  - EOL berkas tidak tercampur;
  - berkas tetap **bebas galat sintaks** menurut `typescript` (devDependency repo yang sudah ada, bukan dependency baru; bila tidak dapat dimuat → gagal-tertutup);
  - aturan yang gagal **persis** `S-4`.
- Kerusakan sintaks **tidak** dihitung sebagai deteksi.
- **Helper `sisipBadan`.** Mendukung LF dan CRLF. Helper gagal dengan pesan jelas **sebelum menulis** bila salah satu kondisi berikut terjadi:
  - kepala tidak ditemukan, tidak unik, atau tidak di awal baris;
  - awal badan tidak ada sebelum deklarasi tingkat-atas berikutnya;
  - kurung parameter belum seimbang (mis. tipe objek multi-baris di parameter — bentuk tidak didukung).
  Helper ini bukan parser generik.
- **Helper berkas.** Pembuatan direktori memakai `mkdirSync(..., { recursive: true })` dengan path native, tanpa shell atau executable `mkdir`. Semua operasi mutasi ditolak bila path keluar dari clone.
- **Uji helper U-1..U-11:**
  - direktori bertingkat;
  - penolakan path di luar clone;
  - penyisipan LF dan CRLF;
  - kepala tidak ada atau tidak unik, badan tidak ditemukan, kurung tidak seimbang (berkas tidak berubah);
  - tanda tangan multi-baris;
  - validasi menolak perubahan di luar titik sisip;
  - pemeriksa sintaks mendeteksi kerusakan.
- **Cakupan lingkungan.** Bukti dijalankan di **Linux**. CRLF diuji dengan input CRLF dan dengan emulasi checkout `core.autocrlf=true`. Ketiadaan executable `mkdir` diemulasikan dengan `PATH` minimal. Keduanya **bukan bukti bahwa suite lulus di Windows**.

## 6. Batas fase (DISETUJUI — D-2b/OD-35)

D-2b (OD-35): jalur FAKE/loopback non-produksi **boleh dikembangkan** untuk bukti integrasi sebelum SG-05 ditutup, tanpa provider resmi, nomor nyata, kredensial nyata, atau pengiriman WhatsApp. Setiap implementasi (A2, F-II) tetap memerlukan persetujuan scope terpisah. Kesepadanan dengan Y-4 (§7): rumusan D-2b tidak menyebut "aktivasi flag nyata"; syarat Y-4 itu tetap berlaku sebagai batas teknis sampai owner menyatakan lain.

| Batas | Isi | Status |
|---|---|---|
| F-I Persiapan integrasi | Desain, A1, A2 (fungsi + uji mandiri); tanpa kode Send/provider/kredensial | Boleh dengan SG-05 OPEN (A1 merged, OD-32; rancangan A2 disetujui, OD-36); implementasi A2 memerlukan persetujuan scope |
| F-II Implementasi tanpa pengiriman nyata | Kode jalur Send + klaim + revalidasi; provider FAKE/loopback; non-produksi; tanpa kredensial/nomor nyata; menghasilkan bukti P-3 | Disetujui secara prinsip (Y-4, OD-35); implementasi memerlukan persetujuan scope terpisah |
| F-III Izin kirim pesan nyata | Provider resmi, kredensial, nomor nyata | Wajib SG-05 CLOSED (P-1 + P-2 + P-3 + persetujuan owner) |

WA-3 = provider WhatsApp resmi, template resmi, pesan nyata ke nomor internal, dan webhook status nyata; memerlukan scope dan persetujuan terpisah. A2 dan F-II bukan WA-3.

## 7. Penyelarasan persyaratan (DISETUJUI — D-2/OD-34, D-2b/OD-35; PRD-WA-1 tidak diedit karena beku)

| # | Teks yang berlaku | Penyelarasan yang disetujui | Alasan | Bukti yang tetap wajib |
|---|---|---|---|---|
| Y-1 | PRD-WA-1:382 — "terkait tenant uji" untuk fixture | Tidak diganti; dicatat sebagai penyimpangan P-1(a) | Fixture hanya simulasi FAKE; mengubahnya berarti mengubah kode beku | Uji §5 lulus terus; batas berlaku P-1 |
| Y-2 | PRD-WA-1:382 — kolom "Approve, Send" untuk fixture | Tidak diganti; dicatat sebagai penyimpangan P-1(b) | Kode beku; fixture imutabel; sidik snapshot mencakup penerima | Sama dengan Y-1 |
| Y-3 | SG-05 tidak mengatur penerima nyata | Tambahan **SG-05R**: penerima nyata (WaContact) terikat tenant pesan; direvalidasi R1–R8 di transaksi klaim kirim; perubahan setelah approval menolak kirim tanpa memanggil provider | Penerima nyata baru ada di WA-2 | P-2 dan P-3 seluruhnya |
| Y-4 (keputusan terpisah D-2b) | STEP2J:105 "sebelum WA-3"; checkpoint §H "tidak boleh dimulai" | Penjelas: larangan berlaku bagi F-III; F-II boleh dengan SG-05 OPEN hanya dengan provider FAKE/loopback, non-produksi, tanpa kredensial provider/nomor nyata/aktivasi flag nyata | Tanpa F-II, bukti P-3 tidak dapat dihasilkan | P-3 tetap wajib sebelum F-III; SG-05 tetap OPEN selama F-II |

## 8. Keputusan owner

| ID | Keputusan | Status |
|---|---|---|
| D-1 | Penyimpangan P-1(a)/(b) dengan batas berlaku §4 | **Disetujui — OD-33** (dilaporkan owner sesudah merge PR #40) |
| D-2 | Penyelarasan Y-1–Y-3 (SG-05R) | **Disetujui — OD-34** (dilaporkan owner sesudah merge PR #40) |
| D-2b | Batas fase / Y-4 | **Disetujui — OD-35** (dilaporkan owner sesudah merge PR #40; syarat Y-4 "tanpa aktivasi flag nyata" tetap berlaku; implementasi F-II belum diizinkan) |
| D-3 | Izin implementasi A1 (tepat tiga path) | **Disetujui — OD-32** (implementasi, uji statis + mutasi terisolasi, commit, push biasa, draft PR; merge memerlukan persetujuan terpisah) |
| D-4 | Penyusunan rancangan A2 | **Disetujui — OD-36** (dilaporkan owner sesudah merge PR #40; rancangan saja, implementasi belum diizinkan) |
