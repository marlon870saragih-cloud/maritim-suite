# WA-2a Step 2C — Bukti Service Kontak & Consent

| Item | Nilai |
|---|---|
| Status | **SELESAI DI LOKAL — menunggu review owner** (belum commit/push/PR) |
| Persetujuan | C-1 (gabung kontak + consent), C-2 (verifikasi ≤ 12 bulan, pencabutan dini), C-3 (satu staf berwenang; grant principal tetap butuh orang kedua), C-4 **LOCAL ONLY** |
| Basis | `main` @ `5eec4f4da9153bd8876009cfce3335cd8a8004f4` (WA-2a-B MERGED — DATABASE SCHEMA ONLY), working tree bersih sebelum mulai |
| Cakupan | **Service layer saja.** Tidak ada API route, UI, migrasi baru, perubahan schema, WhatsApp nyata, provider, maupun LLM |
| Produksi | Tidak disentuh. Migrasi 2B belum diterapkan di produksi/staging. `maritime_portal` tetap NOLOGIN |

## 1. Keterlacakan ke desain historis (C-1)

Logika dan uji tetap terpisah per bagian supaya mudah diaudit.

| Desain rev2 | Berkas | Uji |
|---|---|---|
| 2a-C "kontak" (registrasi, E.164, verifikasi, nonaktifkan, DB-3) | `wa-contact.service.ts`, `wa-phone.ts` | P1, P2 (statis); K2, K3, K4, R1, R3, R5 (DB) |
| 2a-D "consent" (opt-in, STOP/opt-out, re-opt-in, audit) | `wa-consent.service.ts` | C1, R2, R4 (DB) |
| Bersama (gerbang, kunci, galat) | `wa2-gate.ts`, `wa-lock.ts`, `wa-db-error.ts` | K1, S1, I1, A1 |

## 2. Berkas

| Berkas | Jenis | Isi |
|---|---|---|
| `src/services/whatsapp/wa2-gate.ts` | Baru | Gerbang: allowlist Automation + peran ADMIN/MANAJER_OPERASI + flag `WA2_CLIENT_FOUNDATION_ENABLED`. Produksi **selalu** ditolak di WA-2a; konteks sistem ditolak. Satu-satunya pembaca `process.env` |
| `src/services/whatsapp/wa-phone.ts` | Baru | Normalisasi E.164 (murni, konservatif) + penyamaran nomor |
| `src/services/whatsapp/wa-db-error.ts` | Baru | Pemetaan galat DB ke kode alasan **tanpa** meneruskan teks mentah, karena teks unik PostgreSQL memuat nilai nomor. Termasuk pengulangan transaksi untuk konflik konkurensi |
| `src/services/whatsapp/wa-lock.ts` | Baru | Kunci baris dengan urutan tetap `WaContact → WaConsentState → WaPrincipalAccessGrant → WaClientMessage`; pencabutan grant; penahanan pesan |
| `src/services/whatsapp/wa-contact.service.ts` | Baru | `buatKontak`, `verifikasiKontak`, `cabutVerifikasi`, `nonaktifkanKontak`, `daftarKontakPihak`, `bacaKontak` |
| `src/services/whatsapp/wa-consent.service.ts` | Baru | `catatOptIn`, `catatOptOut`, `bacaStatusConsent`, `riwayatConsent` |
| `src/services/whatsapp/wa2-policy.ts` | Ubah (+46, aditif) | Flag, batas 12 bulan, alasan pencabutan dini, kanal re-opt-in sah, status pesan yang bisa ditahan, kode alasan |
| `.env.example` | Ubah (+5) | `WA2_CLIENT_FOUNDATION_ENABLED="false"` |
| `prisma/check-wa2a-contact.mjs` | Baru | Uji statis + murni (28) |
| `prisma/check-wa2a-contact-db.mjs` | Baru | Uji DB loopback + 5 race (67) |
| `docs/whatsapp/WA-2a-C-EVIDENCE.md` | Baru | Dokumen ini |

**Tidak berubah:**
- `prisma/schema.prisma` dan semua migrasi (tanpa migrasi baru).
- `src/services/communication/*` (WA-1) dan `src/services/tah/*` (termasuk `tah-policy.ts`).
- `src/services/intake/*` (Validator V3), `PRD-WA-1.md`, dan semua skrip uji WA-1/TAH/V3.

Ini diuji oleh S2.

## 3. Perilaku utama

- **Registrasi.** Pihak harus milik tenant pemanggil: Customer harus aktif dan tidak terhapus; Principal harus ada. Kontak dibuat `UNVERIFIED`.
- **Idempotensi registrasi.** Nomor yang sama untuk pihak yang sama menghasilkan `SUDAH_ADA` dengan id yang sama, termasuk saat dipanggil bersamaan.
- **DB-3.** Nomor aktif yang sama untuk pihak lain (customer maupun principal) ditolak dengan `CONTACT_NUMBER_IN_USE`.
  - Pesan galat hanya menyebut **jenis** pihak lain dan tidak memuat nomor.
  - **Tidak ada** penautan maupun grant otomatis.
  - PIC yang pindah perusahaan: kontak lama dinonaktifkan, lalu dibuat kontak baru. Kontak baru tidak mewarisi akses.
- **Verifikasi (C-2, C-3).** Dilakukan satu staf berwenang dengan metode + bukti (10–2000 karakter) + masa berlaku di masa depan dan ≤ 12 bulan kalender.
  - Kedaluwarsa dibaca sebagai `EXPIRED`/tidak terverifikasi (gagal tertutup), tanpa job terjadwal.
  - Verifikasi **tidak** membuat grant maupun akses data.
- **Pencabutan dini (C-2).** Alasan yang sah: PIC pindah perusahaan, hubungan bisnis berakhir, kewenangan berubah, dicabut pihak berwenang, atau bukti tidak valid.
  - Dalam satu transaksi: status menjadi UNVERIFIED, semua grant ACTIVE → REVOKED (`VERIFICATION_REVOKED:<alasan>`), dan pesan tertunda → NEEDS_REVIEW.
- **Nonaktifkan.** Dalam satu transaksi:
  - Kontak → INACTIVE dan verifikasi ikut gugur.
  - Kunci nomor dilepas.
  - Grant ACTIVE → REVOKED (`CONTACT_DEACTIVATED`).
  - Pesan DRAFT/PREVIEWED/PENDING_APPROVAL/APPROVED → NEEDS_REVIEW.
- **Consent (K-07).**
  - Opt-in wajib kanal + bukti.
  - Opt-out **selalu diterima**, termasuk untuk kontak INACTIVE, dan **langsung** menahan pesan proaktif yang masih bisa dibatalkan dalam transaksi yang sama.
  - Re-opt-in setelah STOP wajib bukti eksplisit dari pelanggan. Kanal `STAFF_RECORDED` saja ditolak.
  - Operasi yang sudah berlaku (opt-in ganda, opt-out ganda) idempoten: tidak membuat event baru.
- **Consent ≠ otorisasi.** Tidak ada fungsi 2a-C yang membaca atau mengembalikan data voyage, kapal, ETA/ETD, atau pihak lain (diuji S1). Akses data kapal/voyage tetap menunggu resolver Step 2a-E.

## 4. Hasil uji (PostgreSQL 16 loopback sekali pakai, data sintetis, egress dilarang)

### 4.1 Uji kontak & consent

| Suite | Hasil |
|---|---|
| `check-wa2a-contact` (statis + murni) | **28/28** |
| `check-wa2a-contact-db` | **67/67**, stabil di 4 run berturut-turut |

`check-wa2a-contact-db` mencakup bagian berikut:
- K1 gerbang.
- K2 registrasi & DB-3.
- K3 verifikasi & pencabutan.
- K4 nonaktifkan.
- C1 consent.
- I1 isolasi tenant.
- R1–R5 race condition.
- A1 audit & log.

### 4.2 Lima uji race condition

| Race | Skenario | Hasil |
|---|---|---|
| R1 | 10× `buatKontak` nomor sama bersamaan untuk dua pihak | ✅ tepat 1 kontak. Pihak pemenang mendapat `DIBUAT`/`SUDAH_ADA`, pihak lain `CONTACT_NUMBER_IN_USE`. Tanpa galat tak dikenal |
| R2 | Opt-in vs opt-out bersamaan ×20 | ✅ 0 galat. Versi = 1 + jumlah event (tanpa celah). Status = aksi event terakhir. Tidak ada event ganda berurutan |
| R3 | Nonaktifkan vs verifikasi bersamaan ×10 | ✅ tidak pernah INACTIVE + VERIFIED. Pihak yang kalah ditolak `CONTACT_INACTIVE` |
| R4 | Opt-out vs persetujuan pesan ×20 | ✅ tidak pernah APPROVED setelah opt-out commit. Persetujuan disimulasikan dengan protokol 2a-F: kunci kontak SHARE → kunci consent UPDATE → cek OPT_IN |
| R5 | Nonaktifkan vs aktivasi grant ×20 | ✅ tidak pernah ada grant ACTIVE pada kontak INACTIVE. Aktivasi disimulasikan dengan protokol 2a-E: kunci kontak SHARE → cek ACTIVE/VERIFIED |

R4 dan R5 memakai **simulasi** protokol, karena service 2a-E/2a-F belum ada. Protokol itu **wajib** diikuti saat 2a-E/2a-F diimplementasikan; bila tidak, jaminan ini tidak berlaku.

### 4.3 Isolasi tenant & tanpa akses otomatis

- Dari konteks tenant B, semua operasi terhadap kontak tenant A (baca, verifikasi, cabut, nonaktifkan, opt-in, opt-out, riwayat) → `NOT_FOUND` dengan **0 mutasi dan 0 audit**. Tidak ada state consent B yang tercipta untuk kontak A.
- Pihak tenant lain → `PARTY_NOT_ELIGIBLE`. Nomor yang sama di tenant lain diperbolehkan.
- 0 grant tercipta dari registrasi, verifikasi, maupun opt-in.
- Daftar kontak hanya memuat nomor tersamar dan tidak punya medan voyage/kapal/ETA.

### 4.4 Kebocoran nomor & bukti

- **AuditLog** (≥ 30 baris pada uji): tidak memuat nomor utuh maupun teks bukti. Isinya hanya samaran `+62••••1234`, sidik SHA-256 16 karakter, dan kode.
- **Galat service:** tidak memuat nomor. Galat unik PostgreSQL yang berisi nilai kunci dipetakan ke kode alasan.
- **Log proses:** seluruh keluaran (stdout+stderr) dari 4 run dipindai dari luar dengan pola nomor sintetis `999\d{8}` dan teks bukti. Hasilnya **0 kemunculan**.
  - Baris `prisma:error` yang muncul (1–6 per run, dari balapan R1) hanya menyebut **nama kolom** (`tenantId`,`activeE164Key`), bukan nilainya.
  - **Batas uji:** penangkap log *di dalam* proses tidak menangkap tulisan `prisma:error` (Prisma menulis di luar `console`/`stderr` JS yang dibungkus). Pemeriksaan di dalam uji diberi label sesuai batas itu; buktinya adalah pemindaian eksternal tersebut.
- **Data bukti:** consent dan verifikasi disimpan di tabel WA-2a (bukti hukum, append-only) dan bisa dibaca staf berwenang lewat `riwayatConsent`/`bacaKontak`.

### 4.5 Regresi (DB yang sama)

| Suite | Hasil |
|---|---|
| `check-wa2a-schema` (WA-2a-B) | 127/0 |
| `check-validator-v3` | 226/0 |
| `check-intake-policy` | 417/0 |
| `check-tah-policy` | 322/0 |
| `check-tah-ledger` | 98/0 |
| `check-comm-policy` | 326/0 |
| `check-comm-schema` | 85/0 |
| `check-comm-prepare-db` | 98/0 |
| `check-comm-approval-db` | 95/0 |
| `check-comm-send-db` | 121/0 |
| `check-comm-cancel-db` | 73/0 |
| `check-comm-read-db` | 42/0 |
| `check-eval3-ledger-db` | 14/0 |
| `check-tenant-guard` | lulus |
| `tsc --noEmit` | 0 galat |
| `npm run lint` | lulus |

Tidak dijalankan: uji API/E2E/UI WA-1 (butuh server Next.js) dan `next build`. Step 2C tidak menambah route maupun UI.

## 5. Penahanan pesan tertunda — tanpa perubahan WA-1

State `NEEDS_REVIEW` sudah ada di schema 2B (`WaClientMessage.state` berupa String; daftar sah di `wa2-policy.ts`). Penahanan cukup berupa UPDATE pada tabel baru, jadi **tidak** membutuhkan perubahan WA-1 maupun state baru. Tidak perlu HARD STOP.

Satu catatan: `TahApprovalRequest` yang kelak tertaut ke pesan (Step 2a-F) belum ada. Pembatalan approval tertaut menjadi tugas 2a-F.

## 6. Risiko tersisa

| Risiko | Mitigasi / pemilik |
|---|---|
| Normalisasi nomor menolak format tak lazim, atau salah mengasumsikan "0…" = Indonesia | Konservatif (ragu → tolak); UI 2a-G menampilkan hasil normalisasi sebelum simpan |
| Kualitas bukti verifikasi/consent bergantung pada staf | Bukti wajib dan terstruktur; verifikasi bukan izin akses; kedaluwarsa paksa ≤ 12 bulan |
| Jendela antara PIC pindah perusahaan dan pemberitahuan ke PT TSM | Kedaluwarsa verifikasi, pencabutan dini, dan proses bisnis (klausul pemberitahuan) |
| Grant PENDING milik kontak yang dinonaktifkan tetap PENDING | Trigger maker-checker mencegah penolakan oleh pengaju. **2a-E wajib** menolak memutus grant untuk kontak non-ACTIVE/unverified |
| Jaminan R4/R5 bergantung pada protokol kunci yang diikuti 2a-E/2a-F | Protokol didokumentasikan di `wa-lock.ts` dan uji ini; 2a-E/2a-F wajib memakai `kunciKontak` dengan urutan yang sama |
| STOP otomatis dari pesan masuk belum ada (WA-2c) | Opt-out oleh staf tersedia; belum ada pengiriman nyata |
| Penangkap log dalam-proses tidak melihat `prisma:error` | Pemindaian keluaran penuh dari luar (§4.4); keluaran Prisma terbukti hanya memuat nama kolom |
| Flag menyala di produksi | Produksi selalu ditolak oleh gerbang WA-2a; tabel 2B belum ada di produksi |
| Pemeriksaan bentuk kode (S1) berbasis regex | Melengkapi, bukan mengganti, uji perilaku DB |

## 7. Catatan wajib untuk langkah berikutnya (diminta owner)

1. **R4 dan R5 masih memakai simulasi** protokol penguncian. Service 2a-F (persetujuan pesan) dan 2a-E (aktivasi grant) belum ada.
2. **Step 2a-E dan 2a-F wajib mengikuti protokol yang sama dan menguji ulang R4/R5 dengan service sungguhan:**
   - urutan kunci `WaContact → WaConsentState → WaPrincipalAccessGrant → WaClientMessage`;
   - kontak dikunci `FOR SHARE` sebelum consent/grant diperiksa.
3. **Grant PENDING milik kontak INACTIVE (atau belum terverifikasi/kedaluwarsa) TIDAK BOLEH dapat disetujui.** 2a-E wajib menolaknya, karena DB tidak memaksa grant PENDING menjadi REJECTED saat kontak dinonaktifkan.
4. **Verifikasi kontak BUKAN pemberian hak akses voyage/kapal/ETA/data pelanggan.** Akses hanya lewat resolver 2a-E. Grant principal tetap butuh orang kedua (K-05b).
5. **STOP otomatis dari pesan WhatsApp masuk belum tersedia** sampai WA-2c. Sampai saat itu opt-out dicatat staf.
6. **Uji API/E2E/UI dan `next build` belum dilaksanakan** untuk Step 2C. Step ini tidak menambah route maupun UI.
7. Flag `WA2_CLIENT_FOUNDATION_ENABLED` **default OFF** (`.env.example` = `"false"`), dan produksi selalu ditolak gerbang WA-2a.

## 8. Bukti tidak ada perubahan produksi

- Semua koneksi DB ke `127.0.0.1:55432` (cluster sekali pakai). Skrip uji menolak host non-loopback dan `NODE_ENV=production`.
- Jaring egress aktif: 0 egress.
- Tidak ada akses VM/GCP. Tidak ada commit, push, PR, maupun deploy.
- Role `maritime_portal` produksi tidak disentuh.
