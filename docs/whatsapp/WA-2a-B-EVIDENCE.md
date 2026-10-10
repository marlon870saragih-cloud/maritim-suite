# WA-2a Step 2B — Bukti Schema & Fondasi Database Lokal

| Item | Nilai |
|---|---|
| Status | **SELESAI DI LOKAL — menunggu keputusan owner** (belum commit/push/PR) |
| Persetujuan | Owner: DB-1, DB-2 (dengan validasi), DB-3, B-5 **LOCAL ONLY** |
| Basis | `main` @ `7dc4c9294c0c9525a6df6298db2805875eac2d6b`, working tree bersih sebelum mulai |
| Cakupan | Schema + migrasi aditif + `TENANT_MODELS` + konstanta + uji + skrip rollback. **Tanpa** service/API/UI, tanpa WhatsApp nyata, tanpa Meta/LLM |
| Lingkungan uji | PostgreSQL 16 loopback sekali pakai `127.0.0.1:55432` (prosedur `docs/CHECKPOINT-LANJUTAN.md` §6). Data sintetis saja |
| Produksi | **Tidak disentuh.** Tidak ada deploy, tidak ada `migrate deploy` ke GCP, `gcloud` tanpa akun ter-autentikasi |

## 1. Berkas

| Berkas | Jenis | Isi |
|---|---|---|
| `prisma/schema.prisma` | Ubah (+285, −0) | 7 model baru + rujukan balik **virtual** di `Tenant`, `Customer`, `Principal`, `Voyage` (tanpa kolom baru). Model WA-1/TAH **identik** dengan `main` |
| `prisma/migrations/20261010180000_wa2a_contact_consent_access/migration.sql` | Baru | 7 `CREATE TABLE`, indeks, FK, 5 `CHECK`, 8 fungsi + 11 trigger, semuanya pada tabel baru |
| `prisma/rollback/20261010180000_wa2a_contact_consent_access.down.sql` | Baru | Rollback khusus DB lokal/uji (konvensi folder baru) |
| `src/services/tenant-guard.ts` | Ubah (+9) | 7 nama model di `TENANT_MODELS` |
| `src/services/whatsapp/wa2-policy.ts` | Baru | Kosakata sah + daftar kode galat trigger (data saja) |
| `prisma/check-wa2a-schema.mjs` | Baru | Uji statis + DB (127 pemeriksaan) |
| `docs/whatsapp/WA-2a-B-EVIDENCE.md` | Baru | Dokumen ini |

Tidak berubah: `src/services/communication/*`, `src/services/tah/*` (termasuk `tah-policy.ts`), `src/services/intake/*` (Validator V3), migrasi lama, `docs/whatsapp/PRD-WA-1.md`, seluruh skrip uji WA-1/TAH/V3.

## 2. Model data

| Tabel | Fungsi |
|---|---|
| `WaContact` | PIC WhatsApp milik tepat satu pihak (Customer **atau** Principal) |
| `WaConsentState` | Status consent terkini per (kontak, tujuan) |
| `WaConsentEvent` | Bukti consent, append-only |
| `WaPrincipalAccessGrant` | Pemberian akses principal eksplisit |
| `WaPrincipalAccessGrantVoyage` | Cakupan voyage per grant |
| `WaClientMessage` | Revisi pesan proaktif ke kontak nyata. **Belum bisa terkirim** di WA-2a |
| `VoyageScheduleConfirmation` | Konfirmasi staf "jadwal masih berlaku" (B-3), append-only kecuali satu invalidasi |

## 3. Penegakan: DATABASE vs SERVICE (DB-2 — tanpa klaim berlebih)

### 3.1 Ditegakkan DATABASE

| Aturan | Mekanisme |
|---|---|
| Kontak punya tepat satu pihak | CHECK `WaContact_party_xor` |
| `activeE164Key` = `e164` saat ACTIVE, NULL selain itu | CHECK `WaContact_active_key` |
| Satu nomor **aktif** = satu kontak per tenant (DB-3) | UNIQUE (`tenantId`, `activeE164Key`) |
| Pemutus grant ≠ pengaju (K-05b) | CHECK `WaGrant_maker_checker` |
| Kategori data grant ⊆ {STATUS, SCHEDULE_ESTIMATE, SCHEDULE_ACTUAL, MILESTONE}, tidak kosong | CHECK `WaGrant_categories_allowed` |
| Konfirmasi hanya untuk eta/etb/etd | CHECK `VoyageScheduleConfirmation_field` |
| Consent/pesan tidak bisa menunjuk kontak tenant lain | FK komposit (`tenantId`, `contactId`) |
| Grant hanya untuk kontak PRINCIPAL dengan principal yang **sama** | FK komposit (`tenantId`, `contactId`, `principalId`) |
| Cakupan tidak bisa menunjuk grant tenant lain | FK komposit (`tenantId`, `grantId`) |
| Pihak kontak = tenant kontak | Trigger `wa2a_contact_guard` |
| Identitas kontak (tenant, pihak, nomor) tidak bisa diubah; INACTIVE terminal | Trigger `wa2a_contact_guard` |
| Grant lahir PENDING; transisi hanya PENDING→ACTIVE/REJECTED dan ACTIVE→REVOKED/EXPIRED | Trigger `wa2a_grant_guard` |
| Keputusan grant wajib mencatat pemutus & waktu; revoke wajib alasan | Trigger `wa2a_grant_guard` |
| Kategori, bukti, pengaju, dan pemutus grant tidak bisa diubah | Trigger `wa2a_grant_guard` |
| Status terminal grant tidak bisa dibuka kembali | Trigger `wa2a_grant_guard` |
| Voyage cakupan = tenant grant, tidak terhapus, `Voyage.principalId` = principal grant | Trigger `wa2a_grant_voyage_guard` |
| Cakupan hanya bisa ditambah selama grant PENDING (perluasan = grant baru) | Trigger `wa2a_grant_voyage_guard` |
| Baris cakupan tidak bisa diubah | Trigger `wa2a_grant_voyage_guard` |
| Kandidat pesan ada & milik tenant yang sama, terkunci `FOR SHARE` hingga commit | Trigger `wa2a_client_message_guard` (tanpa FK — §4.4 #2) |
| Snapshot pihak pesan = pihak kontak | Trigger `wa2a_client_message_guard` |
| Snapshot pesan tidak bisa diubah | Trigger `wa2a_client_message_guard` |
| Event consent append-only | Trigger `wa2a_consent_event_append_only` |
| Identitas state consent tidak bisa diubah | Trigger `wa2a_consent_state_guard` |
| Konfirmasi jadwal: voyage = tenant; append-only kecuali **satu** invalidasi lengkap | Trigger `wa2a_schedule_confirmation_guard` |
| Kontak, state/event consent, dan grant tidak bisa dihapus langsung — hanya ikut terhapus bersama tenant | Trigger `*_no_delete` |
| Hapus Customer/Principal yang masih punya kontak/grant ditolak (DB-1) | FK NO ACTION |

### 3.2 TETAP tugas service (langkah 2a-C…2a-F) — **tidak** diklaim ditegakkan DB

- Format E.164.
- Peran pemutus grant (ADMIN/MANAJER_OPERASI).
- Kedaluwarsa verifikasi kontak dan `validUntil` grant.
- **`Voyage.principalId` yang berubah SETELAH grant dibuat.** `Voyage` adalah tabel lama tanpa trigger; uji membuktikan DB **tidak** mencegahnya, sehingga resolver wajib memeriksa ulang setiap pemakaian.
- Consent & freshness saat kirim.
- Transisi state pesan.
- Pencabutan berantai: kontak dinonaktifkan → grant REVOKED, pesan NEEDS_REVIEW.

## 4. Hasil uji

### 4.1 `check-wa2a-schema.mjs` — 127/127 lulus (118 awal + 9 pemeriksaan tambahan atas dua penyesuaian)

Bagian uji:
- **S1 Schema.** Model, FK, unik, `TENANT_MODELS`; model WA-1/TAH identik dengan `main`.
- **S2 Migrasi.** Hanya tabel baru; ALTER/trigger hanya pada tabel baru; tanpa DROP/DATA/ROLE/PASSWORD/nomor.
- **S3 Lingkup.** Belum ada kode aplikasi yang memakai tabel baru; tidak ada berkas beku yang berubah.
- **D1 Objek DB.** 5 CHECK, 11 trigger, aksi FK; tidak ada trigger di tabel lama.
- **D2 Kontak.** Isolasi tenant pihak, XOR, kunci aktif, DB-3 (nomor sama ditolak untuk pihak lain maupun sebagai principal; boleh di tenant lain; boleh lagi setelah kontak lama INACTIVE), identitas & INACTIVE terminal.
- **D3 Consent.** FK komposit tenant, unik, append-only, identitas state.
- **D4 Grant.**
  - Kontak customer ditolak; principal lain ditolak; tenant lain ditolak.
  - Tidak bisa lahir ACTIVE; kategori dibatasi.
  - Voyage di **kapal yang sama** milik pelanggan/principal lain ditolak; voyage terhapus ditolak; voyage tenant lain ditolak.
  - Maker-checker berjalan; transisi dibatasi; cakupan terkunci setelah ACTIVE; revoke wajib alasan; status terminal.
  - Batas DB terhadap perubahan `Voyage.principalId` didokumentasikan.
- **D5 Pesan & konfirmasi.** Tenant kandidat; kandidat tidak ada ditolak; kontak tenant lain ditolak; snapshot pihak; satu revisi aktif; snapshot immutable; konfirmasi: tenant, field, append-only, invalidasi tunggal.
- **D6 Guard aplikasi.** `forTenant` memisahkan baca/tulis; `findUnique` dilarang; `tenantId` sodoran dipaksa ke tenant konteks.
- **D7 Penghapusan.**
  - Principal/Customer yang masih punya kontak ditolak; route principal lama menerima galat FK, yang ia petakan ke 409.
  - Hapus langsung kontak, consent, dan grant ditolak.
  - Principal **tanpa** kontak tetap bisa dihapus.
  - Hapus permanen voyage menyusutkan cakupan.
  - **Hapus tenant penuh berhasil** dan menyisakan 0 baris WA-2a; tenant lain utuh.

### 4.2 Jalur migrasi & rollback (DB sekali pakai, data sintetis)

| Jalur | Hasil |
|---|---|
| P1 — DB kosong → seluruh 24 migrasi | ✅ berhasil; uji 118/118 |
| P2 — DB struktur lama (23 migrasi) + data sintetis (seed demo WA-1 + customer/principal/kandidat) → migrasi baru | ✅ hanya migrasi baru yang diterapkan. Snapshot sebelum/sesudah: **isi semua tabel lama (md5 per tabel), kolom, constraint, dan indeks IDENTIK**; tambahan hanya 11 trigger + 8 fungsi baru. Uji 118/118 |
| P3 — rollback pada DB P2 yang berisi data WA-2a sintetis | ✅ hasil **identik penuh** (data + skema) dengan kondisi sebelum migrasi; `_prisma_migrations` bersih; `migrate status` menandai migrasi sebagai pending |
| P4 — terapkan ulang setelah rollback | ✅ berhasil; uji 118/118 |
| Drift Prisma (`migrate diff --exit-code`) | ✅ 0 (schema = riwayat migrasi) |

### 4.3 Regresi

| Suite (angka = baris ✅/❌ di log, termasuk baris ringkasan) | Sebelum (`main`) | Sesudah |
|---|---|---|
| `check-validator-v3` (Validator V3) | 227/0 | 227/0 |
| `check-intake-policy` | 418/0 | 418/0 |
| `check-tah-policy` | 323/0 | 323/0 |
| `check-tah-ledger` (sidik beku) | 99/0 | 99/0 |
| `check-comm-policy` | 326/0 | 326/0 |
| `check-comm-schema` (DB) | 85/0 | 85/0 |
| `check-comm-prepare-db` | 98/0 | 98/0 |
| `check-comm-approval-db` | 95/0 | 95/0 |
| `check-comm-send-db` | 119/0 | 118–121/0 ¹ |
| `check-comm-cancel-db` | 73/0 | 73/0 |
| `check-comm-read-db` | 42/0 | 42/0 |
| `check-eval3-ledger-db` | 15/0 | 15/0 |
| `check-tenant-guard` (DB) | — | 3/0 |
| 52 skrip `check-*` lain (tanpa DB/server) | kode keluar & jumlah ✅/❌ | **identik dengan `main`** ² |
| `tsc --noEmit` | — | 0 galat |
| `npm run lint` | — | lulus (hanya peringatan lama di berkas lain) |

¹ Jumlah berubah karena pemeriksaan 52b hanya berjalan bila hasil balapan Send-vs-hapus-sumber jatuh ke cabang BLOCKED (nondeterministik). Hasilnya selalu 0 gagal, termasuk di `main`.

² Banyak di antaranya gagal di `main` juga karena butuh server/DB/kunci yang tidak disediakan. Pembandingan dilakukan pada worktree `main` yang sama.

Tidak dijalankan:
- `check-comm-api`, `check-comm-e2e`, `check-comm-ui`, `check-tah-ledger-api`: butuh server Next.js berjalan.
- `next build`.

Perubahan Step 2B tidak menyentuh kode yang dijalankan rute/UI.

### 4.4 Temuan selama implementasi

1. **Penyesuaian #1 (disetujui owner) — FK pihak = NO ACTION, bukan RESTRICT.**
   - Penolakan hapus Customer/Principal yang masih direferensikan **sama persis** dengan RESTRICT (diuji D7).
   - Perbedaannya: RESTRICT diperiksa seketika per baris, sedangkan NO ACTION diperiksa di akhir statement. Akibatnya hapus tenant (cascade ke pihak dan kontak dalam statement yang sama) tidak bergantung pada urutan cascade.
   - **Catatan jujur:** eksperimen terkontrol di `check-wa2a-schema.mjs` (FK diganti sementara ke RESTRICT di transaksi yang dibatalkan) menunjukkan RESTRICT **juga** berhasil menghapus tenant di PG16 untuk data uji. Jadi NO ACTION dipilih karena lebih tahan urutan cascade, **bukan** karena RESTRICT terbukti gagal.
   - Isolasi tenant tidak berubah: FK komposit, trigger, dan guard tetap berlaku.
2. **Penyesuaian #2 (disetujui owner) — `WaClientMessage.candidateId` tanpa FK/relasi Prisma.** Relasi Prisma mewajibkan medan balik di `CommunicationCandidate` (model WA-1), dan uji beku `check-comm-schema` menolaknya. Uji beku **tidak** diubah; mengikuti pola `approvalRequestId` WA-1. Integritas yang diuji:
   - **INSERT:** kandidat wajib ada dan bertenant sama (trigger). Baris kandidat dikunci `FOR SHARE` sampai transaksi selesai.
   - **UPDATE:** `candidateId` dan `tenantId` pesan tidak dapat diubah (snapshot immutable / FK komposit).
   - **Balapan (dua koneksi):**
     - Hapus kandidat atau pindah tenant kandidat **selama** INSERT pesan berjalan → menunggu kunci.
     - INSERT pesan **selama** kandidat sedang dihapus → menunggu kunci; setelah hapus commit, INSERT ditolak.
     - Tidak ada celah antara cek dan commit.
   - **Kandidat dihapus setelah pesan ada:** pesan tetap (riwayat utuh), tenant pesan tidak berubah, dan `forTenant` tidak menemukan kandidat. Service 2a-F **wajib** memuat kandidat lewat `forTenant` dan gagal tertutup (BLOCKED/SOURCE_NOT_FOUND) bila hilang.
   - `candidateId` **tidak pernah** menjadi dasar otorisasi. Otorisasi berasal dari kontak + resolver akses.
   - FK langsung pun **tidak** akan menjamin kesamaan tenant (pola WA-1 D-2B-06). Jadi tanpa FK tidak lebih lemah untuk isolasi tenant; yang hilang hanya cascade-hapus, yang memang tidak diinginkan untuk riwayat.
   - **Sisa risiko:** perubahan `CommunicationCandidate.tenantId` **setelah** pesan dibuat tidak dicegah DB, karena itu tabel WA-1 yang tidak boleh diberi trigger. Tidak ada jalur aplikasi yang mengubah `tenantId` kandidat; mitigasinya pemuatan ulang lewat `forTenant` di service.
3. Cluster PostgreSQL lokal sekali pakai memiliki role `maritime_portal` LOGIN. Role itu dibuat oleh migrasi portal **lama** di DB lokal ini, bukan oleh migrasi baru, dan **tidak terkait produksi**. Migrasi baru tidak membuat atau mengubah role apa pun (diuji S2). Status produksi K-15 tetap **NOLOGIN — MITIGATED TEMPORARILY** sesuai laporan owner, dan tidak disentuh.

## 5. Risiko tersisa

| ID | Risiko | Mitigasi / pemilik |
|---|---|---|
| R1 | `candidateId` tanpa FK → kandidat bisa terhapus/berubah tenant SETELAH pesan dibuat (bukan saat INSERT — dikunci FOR SHARE) | Trigger + kunci saat INSERT; service 2a-F wajib memuat kandidat lewat `forTenant` & gagal tertutup |
| R2 | `Voyage.principalId` berubah setelah grant tidak dicegah DB | Resolver 2a-E wajib memeriksa ulang setiap pemakaian (sudah di desain); uji 2a-E TS-2a-22 |
| R3 | Trigger & CHECK tidak dikenal Prisma; perubahan schema berikutnya bisa lupa | Uji S2/D1 memeriksa keberadaannya di berkas & DB; `migrate diff` tidak menghapus objek yang tidak ia kelola |
| R4 | Trigger anti-hapus mengandalkan visibilitas baris Tenant saat cascade | Diuji: hapus tenant berhasil, hapus langsung ditolak. Perilaku PostgreSQL 16; diuji ulang bila versi PG berubah |
| R5 | Folder `prisma/rollback/` adalah konvensi baru | Skrip menyatakan lokal/uji saja; data nyata → matikan flag, bukan DROP |
| R6 | Pola baru di repo (CHECK, trigger, FK komposit) menambah beban pemeliharaan | Terdokumentasi di migrasi, schema, `wa2-policy.ts`, dan dokumen ini |
| R7 | Kategori/role/nomor masih bisa salah format di level service | Ditangani 2a-C/2a-E (validasi E.164, peran pemutus) |
| R8 | Migrasi belum diuji pada salinan data produksi | Di luar lingkup (B-5 LOCAL ONLY). Penerapan produksi butuh izin deploy terpisah + backup |

## 6. Bukti tidak ada perubahan produksi

- Tidak ada perintah terhadap VM/GCP. `gcloud auth list` → "No credentialed accounts".
- Semua `DATABASE_URL` yang dipakai = `127.0.0.1:55432` (cluster sekali pakai `/var/lib/postgresql/wa2a-2b`). Skrip uji menolak host non-loopback dan `NODE_ENV=production`.
- Tidak ada commit, push, PR, merge, maupun deploy.
- `origin/main` tetap `7dc4c929…`.
- Role `maritime_portal` produksi tidak disentuh.
