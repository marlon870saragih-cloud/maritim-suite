# WA-2a Step 2E — Bukti Akses Principal & Resolver Otorisasi

| Item | Nilai |
|---|---|
| Status | **SELESAI DI LOKAL — menunggu review owner** (belum commit/push/PR) |
| Persetujuan | E-1 (pembaca terbatas terpisah dari resolver), E-2 (hanya NYATA), E-3 (≤ 12 bulan sejak persetujuan), E-4 (kontak tak layak tak pernah ACTIVE), E-5 (CANCELLED tertutup; CLOSED terlihat customer, mengakhiri grant principal), E-6 **LOCAL ONLY** |
| Basis | `main` @ `39cdcecb4ba06d57faedca030ee29c8efecfc41f` (2a-B + 2a-C merged), working tree bersih sebelum mulai |
| Cakupan | Service layer saja. Tidak ada API/UI, migrasi/schema, WhatsApp nyata, webhook, maupun LLM. Step 2a-F/2a-F′/2a-I belum dimulai |
| Produksi | Tidak disentuh. Flag WA-2 default OFF; produksi selalu ditolak gerbang. `maritime_portal` tetap NOLOGIN |

## 1. Berkas

| Berkas | Jenis | Isi |
|---|---|---|
| `src/services/whatsapp/wa-access-resolver.ts` | Baru | `resolusiAkses(tx, tenantId, contactId, sekarang)` — **satu-satunya pintu**. Mengembalikan **ID voyage + kategori saja** |
| `src/services/whatsapp/wa-grant.service.ts` | Baru | `ajukanGrant`, `putuskanGrant`, `cabutGrant`, `daftarGrantKontak` (status efektif) |
| `src/services/whatsapp/wa-voyage-view.ts` | Baru | E-1: `bacaFaktaDalamTx` (primitif dalam transaksi untuk 2a-F/WA-2c), `bacaVoyageTerotorisasi` (staf/uji), `cekAksesKontak` |
| `src/services/whatsapp/wa-lock.ts` | Ubah (+32, aditif) | `kunciGrant` (FOR UPDATE), `tahanPesanGrant` |
| `src/services/whatsapp/wa2-policy.ts` | Ubah (+43, aditif) | Batas 12 bulan, NYATA, status tertutup, allowlist kolom per kategori, kode alasan 2E |
| `prisma/check-wa2a-access.mjs` | Baru | Uji statis + murni (27) |
| `prisma/check-wa2a-access-db.mjs` | Baru | Uji DB + R5′–R10 (68) |
| `prisma/check-wa2a-schema.mjs` | Ubah (koreksi + pengetatan) | Lihat §7 — asersi lingkup 2B yang usang |
| `docs/whatsapp/WA-2a-E-EVIDENCE.md` | Baru | Dokumen ini |

**Tidak berubah:**
- Schema, migrasi, dan rollback.
- WA-1 (`src/services/communication/*`).
- `src/services/tah/*`, termasuk `tah-policy.ts`.
- Validator V3.
- Service kontak/consent 2a-C (`wa-contact.service.ts`, `wa-consent.service.ts`, `wa2-gate.ts`).

Ini diuji oleh S4.

## 2. Aturan yang ditegakkan

### Resolver

Semua pemeriksaan di bawah dijalankan **di dalam transaksi pemakai**, dengan kunci `FOR SHARE`, dan **tanpa cache**.

1. **Kontak:** tenant konteks, ACTIVE, VERIFIED dengan kedaluwarsa di masa depan. Selain itu → `TOLAK`.
2. **Customer:** Customer harus aktif dan tidak terhapus. Voyage yang terlihat: `customerId` = pihak, NYATA, tidak terhapus, bukan CANCELLED. Voyage CLOSED **terlihat** (aturan portal).
3. **Principal:**
   - **Default deny.** Akses hanya lewat grant ACTIVE milik kontak **ini** dan principal **ini**, dengan `validUntil` di masa depan.
   - Per voyage: `Voyage.principalId` **saat ini** = principal, NYATA, tidak terhapus, bukan CLOSED/CANCELLED.
   - Kategori dihitung per voyage.
4. **Tidak ada akses** berdasarkan kapal, nomor telepon, consent, atau isi pesan.

### Grant

- **Pengajuan:** kontak PRINCIPAL yang ACTIVE dan terverifikasi; tiga bukti wajib; cakupan berupa daftar voyage eksplisit (1–50) yang masing-masing sah untuk principal itu. Grant berstatus PENDING.
- **Keputusan:**
  - Pemutus ≠ pengaju, ditegakkan service **dan** CHECK DB. Pemutus berperan ADMIN/MANAJER_OPERASI.
  - **SETUJU** dievaluasi ulang di bawah kunci: kontak harus layak dan setiap voyage cakupan masih sah. Bila tidak → hasil `TIDAK_LAYAK` (`CONTACT_INELIGIBLE` / `GRANT_SCOPE_STALE`) **tanpa perubahan state, diaudit** (E-4).
  - **TOLAK** selalu bisa dan diaudit.
- **E-3:** `validUntil` = min(tanggal diminta, waktu **persetujuan** + 12 bulan). Tanpa tanggal diminta = tepat +12 bulan.
- **Pencabutan:** ACTIVE → REVOKED dengan alasan wajib. Pesan dengan `grantIdSnapshot` → NEEDS_REVIEW (`ACCESS_REVOKED`).
- **Urutan kunci:** `WaContact` (SHARE) → `WaPrincipalAccessGrant` (UPDATE) → `Voyage` (SHARE) → `WaClientMessage`.

### Pembaca (E-1)

- Memanggil ulang resolver di transaksi yang sama.
- Kolom allowlist:
  - Identitas: nomor voyage, kapal, pelabuhan, zona waktu.
  - STATUS → `status`.
  - SCHEDULE_ESTIMATE → `eta/etb/etd`.
  - SCHEDULE_ACTUAL → `ata/atb/atd`.
  - MILESTONE → milestone pilot terakhir.
- Tanpa catatan, pihak, biaya, maupun AIS.
- Ditolak → `NOT_FOUND`, sehingga tidak membedakan "tidak ada" dari "tidak berhak".

## 3. Hasil uji (PostgreSQL 16 loopback sekali pakai, data sintetis, egress dilarang)

| Suite | Hasil |
|---|---|
| `check-wa2a-access` (statis + murni) | **27/27** |
| `check-wa2a-access-db` | **68/68**, stabil di 3 run berturut-turut + 1 run awal |

Cakupan `check-wa2a-access-db` per bagian:

| Bagian | Isi |
|---|---|
| G1 | Pengajuan: default deny. Ditolak bila voyage milik principal lain di kapal yang sama, CLOSED, CANCELLED, UJI, NULL, atau tenant lain; bila cakupan/kategori/bukti tidak sah; atau bila > 12 bulan |
| G2 | Keputusan: self-decision ditolak (service & CHECK DB), peran OPERATOR ditolak. E-3 terbukti dari waktu persetujuan. Keputusan kedua ditolak |
| RS | Resolver: customer (CLOSED terlihat; CANCELLED/SEED tidak); principal hanya cakupan; grant per kontak. Perpindahan principal / CLOSED / CANCELLED / UJI / `validUntil` lewat / verifikasi kedaluwarsa / customer nonaktif → akses berhenti |
| G3 | E-4: SETUJU untuk kontak EXPIRED/INACTIVE → `TIDAK_LAYAK`, tetap PENDING, diaudit; TOLAK eksplisit → REJECTED. Cakupan basi → `GRANT_SCOPE_STALE` |
| V | Pembaca: kategori dihormati (principal STATUS+SCHEDULE_ESTIMATE tanpa `ata`/milestone). Tidak ada `notes`/`customerId`/`principalId`/biaya. Voyage lain/CANCELLED/SEED → NOT_FOUND |
| G4 | Pencabutan: pesan tertaut ditahan. **Revoke yang sudah commit langsung menolak pembacaan berikutnya**. Idempoten. PENDING tidak bisa dicabut |
| I | Isolasi tenant (lihat §4). Verifikasi kontak saja → akses kosong |
| A | Audit lengkap tanpa teks bukti. 0 egress |

## 4. Isolasi tenant & pembatasan data

- **Lintas tenant.** Dari tenant B, semua operasi terhadap grant/kontak tenant A → NOT_FOUND (atau resolver TOLAK), dengan **0 mutasi dan 0 audit** di tenant A.
- **Satu kapal, dua pelanggan, dua principal.** Principal P1 tidak pernah melihat voyage P2/C2. Customer C1 tidak melihat voyage principal-only milik P1. Akses berbasis kapal tidak ada.
- **E-2.** Voyage `SEED`/`UJI`/`NULL` tidak pernah lolos resolver maupun pembaca.
- **Pemindaian keluaran penuh** (stdout+stderr) dari 3 run 2E + run 2C: **0 nomor utuh, 0 teks bukti, 0 kemunculan teks `notes` internal** (`CATATAN-INTERNAL`) yang sengaja ditanam di data uji.

## 5. Race condition — dua koneksi sungguhan

Pool service aplikasi dan klien `adm` adalah dua koneksi terpisah.

| Race | Skenario | Hasil |
|---|---|---|
| **R5′** | `nonaktifkanKontak` vs `putuskanGrant(SETUJU)` ×20 — **service sungguhan, menggantikan simulasi R5 di 2a-C** | ✅ tidak pernah ada grant ACTIVE pada kontak INACTIVE; 0 galat |
| R6 | `cabutVerifikasi` vs `SETUJU` ×20 | ✅ tidak pernah ada grant ACTIVE pada kontak UNVERIFIED; 0 galat |
| R7 | Dua pemutus: SETUJU vs TOLAK ×20 | ✅ tepat satu keputusan; yang kalah `GRANT_NOT_PENDING`; status konsisten |
| R8 (a) | **Deterministik:** pembaca menahan kunci → `cabutGrant` **menunggu** (belum selesai setelah 800 ms), selesai setelah pembaca commit | ✅ tidak ada perubahan otorisasi yang menyusup di tengah pemeriksaan |
| R8 (b) | `cabutGrant` vs pembacaan acak ×20 | ✅ hasil baca selalu utuh-sebelum atau ditolak-sesudah; selalu ditolak setelah revoke |
| R9 (a) | **Deterministik:** pemindahan `Voyage.principalId` belum commit → `SETUJU` **menunggu**, lalu `GRANT_SCOPE_STALE` | ✅ |
| R9 (b) | SETUJU vs pemindahan acak ×20 | ✅ voyage yang pindah tidak pernah dikembalikan resolver untuk principal lama |
| R10 | `ajukanGrant` vs hapus permanen voyage ×10 | ✅ tidak ada cakupan yatim; grant dengan cakupan terhapus tidak pernah bisa ACTIVE |

**Uji mutasi (validasi bahwa uji balapan bermakna).** Kunci `FOR SHARE` sengaja dihapus sementara dari resolver dan dari pemeriksaan voyage di grant service, lalu uji dijalankan. Hasilnya **R8(a), R9(a), dan R10 GAGAL** (65/68). Setelah kode dipulihkan: 68/68.

**R4** (opt-out vs persetujuan pesan) **tetap simulasi** sampai Step 2a-F, karena service persetujuan pesan belum ada.

## 6. Regresi (DB yang sama)

| Suite | Hasil |
|---|---|
| `check-wa2a-contact` / `-db` (2a-C) | 28/0 · 67/0 |
| `check-wa2a-schema` (2a-B) | 128/0 *(setelah koreksi & pengetatan §7; `main` lama: 126/127)* |
| `check-validator-v3` | 226/0 |
| `check-intake-policy` | 417/0 |
| `check-tah-policy` | 322/0 |
| `check-tah-ledger` | 98/0 |
| `check-comm-policy` | 326/0 |
| `check-comm-schema` | 85/0 |
| `check-comm-prepare-db` | 98/0 |
| `check-comm-approval-db` | 95/0 |
| `check-comm-send-db` | 119/0 |
| `check-comm-cancel-db` | 73/0 |
| `check-comm-read-db` | 42/0 |
| `check-eval3-ledger-db` | 14/0 |
| `check-tenant-guard` | lulus |
| `tsc --noEmit` | 0 galat |
| `npm run lint` | lulus |

Tidak dijalankan: uji API/E2E/UI dan `next build` (Step 2E tidak menambah route/UI).

## 7. Temuan regresi historis: asersi lingkup 2B gagal di `main` sejak PR #20

### 7.1 Temuan & reproduksi

`check-wa2a-schema.mjs` S3 menegaskan "belum ada kode aplikasi yang memakai tabel baru". Asersi itu hanya benar untuk lingkup Step 2B.

- Sejak service 2a-C di-merge (PR #20), asersi itu gagal di `main`.
- **Direproduksi** pada worktree bersih `main` @ `39cdcec` terhadap DB uji yang sama: `❌ belum ada kode aplikasi yang memakai tabel baru — wa-consent.service.ts, wa-contact.service.ts` → **126/127**.
- Penyebab tidak terdeteksi saat regresi 2a-C: uji membaca `git ls-files` (hanya berkas ter-track), sedangkan berkas service 2a-C saat itu belum di-commit. Ini kekeliruan pada laporan 2a-C.

### 7.2 Koreksi (bukan penghapusan pemeriksaan)

1. Asersi lama diganti batas yang tetap protektif: tabel WA-2a **hanya** boleh dipakai dari `src/services/whatsapp/**`, tanpa route API, UI, service lain, maupun WA-1.
2. **Diperketat**, menutup dua celah pemindai lama:
   - Memindai berkas ter-track **dan** belum di-commit (`--cached --others`). Celah inilah yang membuat kegagalan 2a-C lolos.
   - Mendeteksi akses model Prisma (`.waContact.` dst.) **dan** nama tabel di SQL mentah (`"WaContact"` dst.).
3. Ditambah pengaman "bukan pemeriksaan kosong": pemindai wajib menemukan pemakai sah di `src/services/whatsapp/`, sehingga pemeriksaan tidak bisa lulus karena tidak menemukan apa-apa.

Isolasi tenant dan perlindungan schema (FK, CHECK, trigger, `TENANT_MODELS`) **tidak** disentuh. Pemeriksaan schema lainnya (S1/S2/D1–D7) tetap sama.

### 7.3 Uji negatif (mutasi) aturan baru

| Mutasi (berkas sementara, belum di-commit) | Hasil |
|---|---|
| M1 — route API `src/app/api/tmp-wa2a-leak/route.ts` memakai `prisma.waContact.findMany()` | ❌ terdeteksi |
| M2 — service lain `src/services/ops/tmp-wa2a-leak.ts` memakai SQL mentah `"WaConsentEvent"` | ❌ terdeteksi |
| M3 — folder WA-1 `src/services/communication/tmp-wa2a-leak.ts` memakai `waPrincipalAccessGrant` | ❌ terdeteksi |
| Setelah berkas mutasi dihapus | ✅ 128/128 |

Berkas mutasi dihapus; tidak ada sisa di working tree.

## 8. Risiko & keterbatasan

| Risiko | Mitigasi / pemilik |
|---|---|
| **R4 masih simulasi** sampai Step 2a-F | 2a-F wajib memakai protokol kunci yang sama dan menguji ulang R4 dengan service persetujuan sungguhan |
| Jalur customer: **semua PIC terverifikasi satu customer melihat semua voyage customer itu** (aturan portal) | Sesuai keputusan owner. Pembatasan per-PIC butuh keputusan baru |
| Grant ACTIVE yang lewat `validUntil` tetap berstatus `ACTIVE` di DB (diterima owner) | Resolver **selalu** menolaknya, dan semua jalur baca/otorisasi wajib lewat resolver; `daftarGrantKontak` menampilkan `EXPIRED_EFEKTIF` |
| Kunci `FOR SHARE` pada voyage selama transaksi pembaca menahan sebentar edit voyage bersamaan | Transaksi pembaca singkat; dipantau saat 2a-F/WA-2c |
| **Kewajiban:** Step 2a-F dan WA-2c (serta WA-2d) **wajib** mengikuti protokol kunci (`WaContact` → `WaConsentState` → `WaPrincipalAccessGrant` → `Voyage` → `WaClientMessage`) dan memanggil resolver/pembaca **di dalam transaksinya** untuk memvalidasi ulang otorisasi setiap pemakaian | `bacaFaktaDalamTx` / `resolusiAkses` hanya menerima `tx`; uji 2a-F/WA-2c wajib mengulang R4/R8/R9 dengan service sungguhan |
| Penangkap log dalam-proses tidak melihat `prisma:error` | Pemindaian keluaran penuh dari luar (§4) |
| Uji API/E2E/UI & `next build` belum dijalankan | Belum ada route/UI; wajib saat 2a-G |
| STOP otomatis dari pesan masuk belum ada | WA-2c |

## 9. Bukti tidak ada perubahan produksi

- Semua koneksi DB ke `127.0.0.1:55432` (cluster sekali pakai), dengan jaring egress aktif dan 0 egress.
- Tidak ada akses VM/GCP. Tidak ada commit, push, PR, merge, maupun deploy.
