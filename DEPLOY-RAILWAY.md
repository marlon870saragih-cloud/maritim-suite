# 🚂 Panduan Deploy Maritime Suite ke Railway

Panduan langkah-demi-langkah. Bagian **[ANDA]** butuh akun/kredensial Anda.
Kode sudah disiapkan: `postinstall: prisma generate`, `.env.example`, dan `railway.json`
(build Nixpacks + `prisma db push` otomatis tiap deploy + healthcheck).

---

## 0. Prasyarat [ANDA]
- Akun **GitHub** (gratis) — https://github.com
- Akun **Railway** — https://railway.app (login pakai GitHub)
- **OpenRouter API key** untuk fitur AI — https://openrouter.ai/keys (ada biaya per pemakaian; boleh diisi belakangan)

---

## 1. Push kode ke GitHub [ANDA]
Di folder proyek (`aplikasi maritim/maritime-suite`):

```bash
# 1) Buat repo baru KOSONG di github.com (mis. "maritime-suite") — JANGAN centang "add README".
# 2) Hubungkan & push (ganti URL dgn repo Anda):
git remote add origin https://github.com/USERNAME/maritime-suite.git
git push -u origin master
```
> `.env` (berisi rahasia) TIDAK ikut ter-push — sudah di-.gitignore. Aman.

---

## 2. Buat project Railway dari repo [ANDA]
1. Buka https://railway.app → **New Project** → **Deploy from GitHub repo**.
2. Pilih repo `maritime-suite`. Railway mulai build otomatis (pakai `railway.json`).
   Deploy pertama **akan gagal/menunggu** karena database & secret belum ada — normal, lanjut ke langkah 3.

---

## 3. Tambah Database Postgres [ANDA]
1. Di dashboard project → **+ New** → **Database** → **Add PostgreSQL**.
2. Railway membuat service **Postgres** dengan `DATABASE_URL` internal.

---

## 4. Isi Environment Variables [ANDA]
Klik service **aplikasi** (bukan Postgres) → tab **Variables** → tambah:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `DIRECT_URL` | `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_SECRET` | (hasil generate, lihat bawah) |
| `NEXTAUTH_URL` | (domain Railway, lihat langkah 5) |
| `NEXT_PUBLIC_APP_URL` | (sama dgn NEXTAUTH_URL) |
| `NEXT_PUBLIC_APP_NAME` | `Maritime Suite` |
| `OPENROUTER_API_KEY` | `sk-or-...` (untuk fitur AI) |

**Generate NEXTAUTH_SECRET** (jalankan salah satu di komputer Anda, salin hasilnya):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# atau:  openssl rand -base64 32
```
> `${{Postgres.DATABASE_URL}}` adalah referensi Railway — biarkan persis begitu, Railway mengisinya otomatis.

---

## 5. Dapatkan domain & set NEXTAUTH_URL [ANDA]
1. Service aplikasi → **Settings** → **Networking** → **Generate Domain**.
   Muncul URL mis. `https://maritime-suite-production.up.railway.app`.
2. Isi `NEXTAUTH_URL` **dan** `NEXT_PUBLIC_APP_URL` dengan URL itu (dengan `https://`, tanpa `/` di akhir).
3. Railway akan **redeploy** otomatis.

---

## 6. Verifikasi [ANDA]
Saat deploy sukses (healthcheck `/login` hijau):
1. Buka domain Railway → halaman landing muncul.
2. **Daftar** perusahaan pertama Anda di `/register` (isi nama perusahaan, email, password, logo).
   > Nama perusahaan ini akan **terkunci** (anti-manipulasi) — pastikan benar.
3. Masuk, coba: buat dokumen → **Simpan** → unduh PDF (cek kop/logo), buka **Ringkasan PDF/Excel**.
4. NPWP untuk e-Faktur: isi di **Pengaturan → Profil Perusahaan** bila perlu ekspor Coretax.

Skema database (tabel) dibuat otomatis oleh `prisma db push` (via `railway.json`) tiap deploy.

---

## 7. (Opsional) Domain sendiri
Settings → Networking → **Custom Domain** → masukkan domain Anda → ikuti instruksi DNS (CNAME).
Lalu update `NEXTAUTH_URL` & `NEXT_PUBLIC_APP_URL` ke domain baru.

---

## 🔧 Kalau bermasalah
- **Build gagal "prisma"** → pastikan `postinstall: prisma generate` ada di `package.json` (sudah).
- **App crash / "Can't reach database"** → cek `DATABASE_URL`/`DIRECT_URL` sudah `${{Postgres.DATABASE_URL}}` dan service Postgres jalan.
- **Login error / "NO_SECRET"** → `NEXTAUTH_SECRET` belum diisi.
- **Redirect aneh saat login** → `NEXTAUTH_URL` harus PERSIS domain (https, tanpa trailing slash).
- **Fitur AI diam** → `OPENROUTER_API_KEY` belum diisi / saldo habis.
- **Update aplikasi** → cukup `git push` ke GitHub; Railway deploy ulang otomatis.

---

## 💾 Backup database (penting untuk produksi)
Railway Postgres → tab **Data**/Backups (aktifkan), atau jadwalkan `pg_dump` berkala.
Data perusahaan/dokumen ada di sini — jangan sampai tak ter-backup.
