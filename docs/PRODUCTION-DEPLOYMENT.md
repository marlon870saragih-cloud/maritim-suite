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

## Yang BELUM terverifikasi (jangan dianggap fakta)

Detail VM produksi — nama instance, zona, proyek GCP, pengelola proses, direktori rilis, versi yang
berjalan, dan status migrasi database — **belum** diverifikasi dari VM oleh sesi mana pun yang
menulis dokumen ini. `docs/PRD-002-STEP3-INFRA.md` memuat **rencana** deploy VM (mis. `tribuana-vm`,
PM2 `maritime-suite` di `127.0.0.1:3001`, Postgres 16 lokal) yang ditandai "BELUM dipasang"; rinciannya
wajib dicocokkan dengan VM sebelum dipakai.

## Catatan dokumen historis

Beberapa dokumen desain lama menyebut Railway sebagai rencana penempatan atau contoh penjadwal
(`docs/FASE-0-SKEMA-v2.md`, `docs/FASE-7-OPERATIONS.md`, `docs/FASE-8-SAAS-COMMERCIAL.md`,
`docs/POLA-SERVICE-LAYER.md`, dan Blueprint 2.0 Volume 1 — tabel "Penempatan: Railway"). Itu catatan
historis pada saat ditulis dan **digantikan** oleh dokumen ini; bukan petunjuk operasional.
