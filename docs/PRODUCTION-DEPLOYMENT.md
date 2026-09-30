# Maritim Suite + TAH — Target Produksi (dokumen kanonik)

Dokumen ini adalah **satu-satunya pernyataan resmi** tentang tempat produksi berjalan.
Keputusan owner (2026-09-27). Bila dokumen lain bertentangan, dokumen inilah yang berlaku.

| Item | Keputusan |
|---|---|
| Aplikasi | Maritim Suite + Tribuana Automation Hub (TAH) |
| **Platform produksi** | **GCP Compute Engine** — satu-satunya target produksi resmi |
| Railway | **PENSIUN / DITINGGALKAN** — deployment lama, bukan produksi |
| Vercel / platform lain | Bukan target produksi |

## Railway — pensiun

- **Jangan** deploy ke Railway, jangan mengaktifkan ulang, dan jangan memperlakukannya sebagai produksi.
- `railway.json` (yang menjalankan `npx prisma db push` sebagai `preDeployCommand`) dan panduan
  `DEPLOY-RAILWAY.md` **dihapus** dari repo. Keduanya hanya tersisa di riwayat git (terakhir ada di
  commit `b89ca369a06cf39afcdda41da4ac746963225e74`) — jangan dipulihkan untuk dipakai.
- **Jangan** memakai alur Railway `prisma db push` untuk database produksi.

## Aturan untuk setiap deployment

1. **Keadaan produksi ditentukan dari VM GCP itu sendiri** (proses yang berjalan, direktori rilis,
   env, dan status migrasi database) — bukan dari repo, dokumen, atau ingatan.
2. **`main` di GitHub TIDAK boleh diasumsikan sama dengan produksi.** Rilis yang berjalan harus
   dibaca langsung di VM sebelum menilai selisih rilis.
3. **Perubahan skema database produksi hanya lewat migrasi Prisma yang sudah direview**
   (`prisma/migrations/`, `npx prisma migrate status` → `npx prisma migrate deploy`), dengan backup
   `pg_dump` yang terverifikasi lebih dulu. Bukan `prisma db push` (skrip `npm run db:push` hanya untuk
   database pengembangan lokal). Bila `migrate status` melaporkan drift atau database "not managed",
   berhenti dan ikuti prosedur baseline K7 (`docs/FASE-0-SKEMA-v2.md` §6a) — jangan pernah menerima
   tawaran reset.
4. Deployment, perubahan env produksi, dan aktivasi fitur (mis. `TAH_INTAKE_MODEL`) masing-masing
   butuh persetujuan owner tersendiri.

## Terverifikasi dari VM (audit read-only 2026-09-30)

Rincian dan bukti: `docs/PRODUCTION-STATE-2026-09-30.md`. Ringkasnya, per 2026-09-30:

- Instance GCE di zona `asia-southeast2-a`; aplikasi mendengarkan port `3001` di SEMUA antarmuka (bukan hanya loopback);
  nginx mendengarkan 80/443; PostgreSQL 16 lokal hanya di `127.0.0.1:5432`, DB `maritime_suite`.
- Versi yang berjalan = commit **`ac922f6`** (direktori rilis hasil ekstrak arsip, bukan git checkout; build 2026-09-27).
- Status migrasi: 21 diterapkan, 0 gagal — termasuk ketujuh migrasi PRD-002..005.
- Railway diputus dari repo GitHub oleh owner (2026-09-30); deploy produksi dilakukan manual.

## Yang MASIH belum terverifikasi

- Siapa yang melakukan deploy 2026-09-14/18/27, dan prosedur yang dipakai (tidak ada catatan deploy di repo).
- Rantai pengelola proses aplikasi (user & instans PM2 yang menjalankannya).
- Konfigurasi upstream nginx, dan apakah firewall GCP memblokir akses langsung dari luar ke port `3001`.
- Keadaan sesudah 2026-09-30 — selalu baca ulang dari VM (aturan 1).

## Catatan dokumen historis

Beberapa dokumen desain lama menyebut Railway sebagai rencana penempatan atau contoh penjadwal
(`docs/FASE-0-SKEMA-v2.md`, `docs/FASE-7-OPERATIONS.md`, `docs/FASE-8-SAAS-COMMERCIAL.md`,
`docs/POLA-SERVICE-LAYER.md`, dan Blueprint 2.0 Volume 1 — tabel "Penempatan: Railway"). Itu catatan
historis pada saat ditulis dan **digantikan** oleh dokumen ini; bukan petunjuk operasional.
