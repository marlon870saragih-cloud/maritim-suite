# WA-1 Step 2J — Panduan Demo Internal (laptop owner, LOKAL, FAKE-only)

> Demo ini **hanya simulasi**. Tidak ada pesan WhatsApp yang dikirim, tidak ada provider WhatsApp, dan
> tidak ada koneksi ke server/DB produksi. Semua data sintetis; penerima = fixture `TEST_FIXTURE` bawaan kode.

## 0. Cara paling sederhana — lihat alurnya tanpa menjalankan apa pun
Buka 12 tangkapan layar dari run uji Playwright (data sintetis, mode FAKE) di
[`docs/whatsapp/evidence/step2j/`](evidence/step2j/), berurutan:

| # | Berkas | Yang terlihat |
|---|---|---|
| 1 | `01-alerts-tombol-siapkan-update.png` | Tombol **Siapkan Update Klien** hanya pada event pilot |
| 2 | `02-ruang-kerja-label-simulasi.png` | Ruang kerja dengan label **SIMULASI — TIDAK DIKIRIM KE WHATSAPP** |
| 3 | `03-pratinjau-snapshot-tersamar.png` | Pratinjau: fakta snapshot, isi pesan, penerima tersamar |
| 4 | `04-menunggu-approval.png` | Approval diminta (PENDING) |
| 5 | `05-disetujui-manajer-operasi.png` | Disetujui Manajer Operasi |
| 6 | `06-fake-sent-attempt.png` | **FAKE terkirim (simulasi)**, `externalDelivery=false` |
| 7 | `07-riwayat-audit.png` | Riwayat audit lengkap |
| 8 | `08-penerima-utuh-eksplisit.png` | Pengenal uji utuh hanya setelah diklik |
| 9 | `09-daftar-komunikasi.png` | Daftar komunikasi (penerima tersamar) |
| 10 | `10-dibatalkan-dengan-alasan.png` | Cancel dengan alasan wajib |
| 11 | `11-fake-failed-tombol-retry.png` | FAKE gagal → tombol **Ulangi FAKE Send** |
| 12 | `12-operator-404.png` | Peran OPERATOR tidak bisa membuka halaman (404) |

Untuk demo penerimaan secara langsung (owner mengklik sendiri), ikuti langkah 1–6 di bawah.

## 1. Prasyarat
- Node.js 22 dan dependensi repo (`npm ci`).
- PostgreSQL **lokal** (mis. `127.0.0.1:5432`) dengan database kosong khusus demo, misalnya `wa1_demo`.
- Checkout `main` yang sudah memuat WA-1 Step 2A–2I (dan Step 2J setelah di-merge).

## 2. Siapkan database demo (sekali)
```bash
export U="postgresql://<user>@127.0.0.1:5432/wa1_demo"
DATABASE_URL=$U DIRECT_URL=$U npx prisma migrate deploy
DEMO_DB_URL=$U node prisma/demo-wa1-seed.mjs
```
Seed mencetak dua akun demo (ADMIN dan MANAJER_OPERASI) dengan **kata sandi acak** — simpan untuk sesi itu.
Skrip menolak DB non-loopback dan `NODE_ENV=production`.

## 3. Jalankan aplikasi LOKAL (dengan perangkap egress)
```bash
NODE_OPTIONS="--import $PWD/prisma/wa1-egress-trap.mjs" \
DATABASE_URL=$U DIRECT_URL=$U PORTAL_DATABASE_URL=$U \
NEXTAUTH_URL=http://localhost:3100 NEXTAUTH_SECRET=$(openssl rand -hex 24) \
AUTOMATION_MONITORING_ENABLED=true WA1_INTERNAL_FAKE_TEST_ENABLED=true NEXT_TELEMETRY_DISABLED=1 \
AUTOMATION_TENANT_IDS=wa1demotenant0000000001 \
npx next dev -p 3100 2> demo-server.log
```
- Buka **http://localhost:3100** (harus sama persis dengan `NEXTAUTH_URL` — pagar CSRF Step 2H).
- Perangkap egress memblokir setiap koneksi keluar non-loopback dan mencatatnya di `demo-server.log`
  sebagai `[WA1-EGRESS] BLOCKED …`. Yang wajar terlihat hanya `fonts.googleapis.com` (unduhan font
  `next/font` oleh `next dev`; aplikasi memakai font cadangan). Host WhatsApp/Meta **tidak boleh** muncul.
- Bahasa UI mengikuti tombol ID/EN di header / locale peramban.

## 4. Alur demo (± 10 menit)
1. Login **demo-admin@wa1.local** → menu **Komunikasi (Simulasi)** terlihat di sidebar.
2. **Automation → Alerts**: tombol **Siapkan Update Klien** hanya ada pada 4 sinyal DEMO pilot (ETA, EOSP,
   ALL_FAST, SAILED); sinyal COMMENCED dan perubahan status **tanpa** tombol.
3. Klik **Siapkan Update Klien** pada EOSP → halaman ruang kerja. Perhatikan label
   **SIMULASI — TIDAK DIKIRIM KE WHATSAPP**.
4. Pilih penerima uji (fixture, tersamar) + bahasa → **Buat revisi** → periksa fakta snapshot dan isi pesan.
5. **Tandai sudah dipratinjau** → **Minta approval**.
6. Login di jendela lain (incognito) sebagai **demo-manajer@wa1.local**, buka URL yang sama → **Setujui**.
   (Setuju-sendiri oleh ADMIN juga diizinkan untuk jenis uji internal ini — AC-14; tidak berlaku untuk WA-2.)
7. Kembali ke ADMIN → **FAKE Send** → status **FAKE terkirim (simulasi)**; percobaan menampilkan
   `simulation=true · externalDelivery=false` dan receipt `fake_…`.
8. **Riwayat (audit)** di bawah halaman: rantai candidate → revisi → pratinjau → approval → klaim → attempt → hasil.
9. Opsional: siapkan update dari sinyal lain lalu **Batalkan pesan** (alasan wajib) → status Dibatalkan
   + alasan tercatat di riwayat.
10. **Tampilkan penerima utuh** hanya bila diklik (pengenal uji `TEST_FIXTURE_WA_…`, bukan nomor nyata).

Banner "Masa uji coba telah berakhir" dapat muncul karena tenant demo sintetis tak punya langganan; itu
modul billing, bukan WA-1, dan tidak menghalangi alur.

## 5. Bukti tidak ada WhatsApp nyata (cek sendiri)
```bash
grep -c "TRAP-AKTIF" demo-server.log                    # > 0 : perangkap termuat
grep "BLOCKED" demo-server.log | grep -v fonts.g        # harus kosong
grep -ciE "graph\.facebook|whatsapp\.(com|net)|wa\.me/" demo-server.log   # harus 0
```

## 6. Bersihkan
```bash
DEMO_DB_URL=$U node prisma/demo-wa1-seed.mjs --hapus
```
Atau hapus database `wa1_demo`.

## 7. Uji otomatis yang dapat diulang (opsional)
Dengan server di atas (tambahkan tenant uji ke `AUTOMATION_TENANT_IDS`, lihat kepala tiap berkas):
`prisma/check-comm-e2e.mjs` (HTTP, 108 cek; mode `COMM_E2E_MODE=produksi` untuk `next start` lokal),
`prisma/check-comm-ui.mjs` (Playwright, 55 cek; `COMM_UI_SCREENSHOT_DIR=<folder>` untuk tangkapan layar),
`prisma/check-comm-api.mjs` (HTTP, 43 cek).
