# PRD-002 Step 3 — Infrastructure Closure

Status: **disiapkan, BELUM dipasang di produksi.** Tidak ada perubahan produksi di Step 3.
Rujukan: `TAH-PRD-002-step1-design` §G–§I, `TAH-PRD-001-step0b-closure`.

## 1. Apa yang berubah di repo

| Area | Perubahan | Migrasi |
|---|---|---|
| Waktu bisnis | `src/lib/business-time.ts` — tanggal/bulan/teks **Asia/Makassar** lewat `Intl`, kebal zona mesin | Tidak |
| Job pengingat | kunci `TASK_OVERDUE` (harian) & `VENDOR_DOC_EXPIRING`/`KUOTA` (bulanan) memakai kalender WITA; teks waktu berlabel WITA; `TASK_DUE` tetap instan UTC | Tidak |
| Idempotensi & hitungan | `notify()` mengembalikan `DIBUAT`/`DUPLIKAT`/`GAGAL`; job menghitung dari situ (eksak di bawah jalan tumpang-tindih) dan melaporkan `gagal` | Tidak |
| Endpoint job | `POST /api/jobs/run` menambah `ok` + satu baris log JSON `[jobs/run]` per jalan (tanpa token/nama/isi) | Tidak |
| Tombol Settings | `run-reminders` memakai `JOB_RUNNER_BASE_URL` (loopback) lebih dulu | Tidak |
| Penjadwal | `deploy/scripts/maritime-job-run.sh` + `deploy/systemd/maritime-reminders.{service,timer}` | Tidak |
| Laporan backup | `deploy/scripts/pg-backup-report.sh` + `pg-backup-report@.service` + drop-in `pg-backup.service.d/10-lapor-status.conf` | Tidak |
| nginx | **NGINX CHANGE: NOT REQUIRED** | — |

Tanggal voyage (ETA…ATD, D4) **tidak** disentuh: tetap tanggal kalender ber-komponen UTC.

## 2. Kontrak

### Job pengingat
- **Tenant-safe:** satu `systemContext(tenantId)` per tenant; semua query lewat `forTenant()`.
- **Idempoten & aman konkuren:** `Notification @@unique([tenantId, dedupeKey])`. Dua jalan bersamaan → satu baris; yang kalah mendapat `DUPLIKAT` (dihitung `dilewati`).
- **Retry-safe:** jalan gagal/terputus tak meninggalkan kunci setengah jadi; jalan berikutnya melahirkan yang belum ada.
- **Terlihat:** respons `{job, ok, total:{dibuat,dilewati,dibatasi,gagal}, hasil[]}`; log `[jobs/run] {"job":…,"ok":…,"tenantGagal":[…],"total":{…}}`; unit systemd gagal bila `ok≠true`.
- **Transisi kunci UTC→WITA:** produksi belum pernah menjalankan job (0 baris ber-`dedupeKey`, Step 0B), jadi tidak ada notifikasi ganda saat transisi.

### `maritime-job-run.sh <job>`
`0` ok · `1` HTTP≠200 atau `ok≠true` · `64` argumen · `75` app tak terjangkau · `78` token tak terbaca.

### `pg-backup-report.sh ok|gagal`
`0` artefak valid & dilaporkan / status gagal dilaporkan / hook belum dikonfigurasi (peringatan) ·
`1` artefak tak valid (tak ada, > `MAX_AGE_HOURS`, < `MIN_BYTES`, `gzip -t`/`pg_restore --list` gagal) ·
`2` laporan tak terkirim (backup **tidak** dianggap gagal) · `64` argumen.
Tidak pernah menghapus berkas; `RETENTION_DAYS` hanya memberi peringatan. Pelaporan berjalan di unit terpisah, sehingga hasil `pg-backup.service` tidak pernah berubah karena pelaporan.

### Kenapa bukan menyunting `pg-backup.sh`
Skrip hanya ada di VM dan tidak bisa dibaca dari sesi Step 3 (akses baca produksi ditolak). Drop-in `OnSuccess=/OnFailure=` menambah pelaporan tanpa menyentuh skrip yang sudah terbukti berjalan.

## 3. Butir yang WAJIB diverifikasi di VM sebelum pemasangan (Step 4)

1. `systemctl --version` ≥ 249 (`OnSuccess=`). Bila lebih rendah: pakai `ExecStopPost=` dengan `$SERVICE_RESULT` (desain alternatif, perlu ditinjau).
2. Isi `/usr/local/sbin/pg-backup.sh`: direktori artefak `maritime_suite`, pola nama, format (`.sql.gz`/`.dump`), retensi → isi `/etc/tribuana/pg-backup-report.env`.
3. Apakah `pg-backup.service` sudah punya `OnFailure=` sendiri (drop-in aditif, tetap dicatat).
4. Versi `curl` ≥ 7.55 (`-H @-`).
5. `postgres` bisa membaca direktori artefak (unit pelapor berjalan sebagai `postgres`).
6. Apakah skrip backup memang "fail fast bila hook pelaporan tak dikonfigurasi" (klaim brief Step 3) — Step 1 mencatat skrip **tidak memanggil aplikasi sama sekali**. Klaim ini belum terbukti dan harus dibaca langsung.

## 4. Rencana deploy produksi (DISIAPKAN — JANGAN dijalankan tanpa persetujuan owner)

Target: `tribuana-vm` (asia-southeast2-a), app PM2 `maritime-suite` di `127.0.0.1:3001`, Postgres 16 lokal, DB `maritime_suite`.

1. **Verifikasi Git sebelum deploy** — lokal: branch memuat `41694f1` (Step 2) + commit Step 3; `git status` bersih (kecuali 6 skrip scratch yang tak ikut); `npx tsc --noEmit` & `npm run build` lulus. Paket rilis **mengecualikan** `.env`, `.env.local`, `.env.example`, `node_modules`, `.next`, `backup/`, skrip scratch.
2. **Backup DB produksi (manual, WAJIB)** — sebagai postgres:
   `pg_dump -Fc -d maritime_suite -f /var/backups/manual/maritime_suite-pre-prd002-<UTC>.dump`
3. **Verifikasi artefak backup** — `ls -l` (ukuran > 0), `sha256sum`, `pg_restore --list <dump> | wc -l` > 0. Disarankan: pulihkan ke DB sementara `maritime_suite_verify`, hitung `Voyage`/`Vessel`/`Tenant`, lalu drop. **Tanpa langkah 2–3 lulus, STOP.**
4. **Status migrasi sebelum** — `npx prisma migrate status`: tepat dua tertunda
   `20260914120000_prd002_vessel_identity_voyage_vessels`, `20260914130000_prd002_voyage_vessel_fk_cascade`; tak ada migrasi gagal. Jawaban "reset" = STOP (pelajaran K7).
5. **Urutan deploy aplikasi** — unggah rilis ke direktori baru (rilis lama tetap ada) → `npm ci` → `npx prisma generate` → `npm run build`. Tambahkan `JOB_RUNNER_BASE_URL=http://127.0.0.1:3001` ke `~/maritime-suite/.env`.
6. **`npx prisma migrate deploy`** — lalu cek: `_prisma_migrations` memuat kedua nama; `SELECT count(*) FROM "Voyage"` = `SELECT count(DISTINCT "voyageId") FROM "VoyageVessel"`; nol voyage tanpa baris; nol pasangan kembar.
7. **Restart/reload proses** — `pm2 reload maritime-suite --update-env`; `pm2 status` online, penghitung restart dicatat sebelum/sesudah.
8. **Aktivasi penjadwal (tiap unit dengan persetujuan owner)**
   - Token: `/etc/tribuana/job-runner-token` root:root 0600, nilai = `JOB_RUNNER_TOKEN` di `.env` (jangan di-echo ke terminal/riwayat).
   - `install -m 0755 deploy/scripts/maritime-job-run.sh /usr/local/sbin/maritime-job-run`
   - `install -m 0755 deploy/scripts/pg-backup-report.sh /usr/local/sbin/pg-backup-report`
   - Salin unit + drop-in ke `/etc/systemd/system/`, env file ke `/etc/tribuana/pg-backup-report.env` (setelah butir §3.2).
   - `systemd-analyze verify` pada tiap unit → `systemctl daemon-reload`.
   - `maritime-reminders.timer`: **pasang, JANGAN enable** sampai keputusan D3.
9. **Smoke test umum** — halaman login 200; `/api/auth/csrf` 200; `POST /api/jobs/run` tanpa token → 401.
10. **Smoke vessel identity** — sebagai ADMIN: `GET /api/vessels` 200, field `mmsi`/`mmsiSource`/`mmsiVerifiedAt` ada (null); pengguna VIEWER `POST /api/vessels` → 403. **Tanpa data kapal pilot.**
11. **Smoke kompatibilitas multi-vessel** — `GET /api/voyages/<id>` untuk voyage lama: `vesselId` & `vessel` tetap ada, `vessels[0].vesselId` = `vesselId`; PDF EPDA/invoice voyage lama tetap 200.
12. **Smoke pengingat/penjadwal** — HANYA bila D3 = ya: `systemctl start maritime-reminders.service` → `systemctl status` sukses; journal `[maritime-job-run] … OK`; log PM2 `[jobs/run] {"job":"reminders","ok":true…}`. Bila D3 belum: cukup `systemd-analyze verify`.
13. **Verifikasi backup/pelaporan** — `systemctl start pg-backup.service` (atau tunggu jadwal) → `pg-backup-report@ok.service` sukses → Settings › Kepatuhan hijau; `SELECT "backupTerakhirPada","backupBerhasil","backupUkuranBytes" FROM "SystemConfig"`.
14. **Inspeksi log** — `pm2 logs maritime-suite --lines 200 --nostream`; `journalctl -u maritime-reminders -u 'pg-backup-report@*' -u pg-backup --since -1h`; `/var/log/nginx/error.log`.
15. **Kriteria rollback** — `migrate deploy` gagal; login/voyage/EPDA 5xx; jumlah `VoyageVessel` ≠ `Voyage`; `pg-backup.service` berubah gagal setelah drop-in; `ok:false` berulang tanpa sebab data.
16. **Prosedur rollback**
    - Unit: `systemctl disable --now maritime-reminders.timer`; hapus drop-in `pg-backup.service.d/10-lapor-status.conf`; `daemon-reload`.
    - Aplikasi: kembali ke direktori rilis lama → `pm2 reload maritime-suite`. Kode lama kompatibel dengan skema baru (kedua migrasi aditif).
    - Database (hanya bila data rusak): hentikan app → `pg_restore --clean --if-exists -d maritime_suite <dump langkah 2>` → start app rilis lama.

## 5. Di luar lingkup Step 3 (sengaja)
Tabel automation/`JobHeartbeat`, `tah-tick`, pengaktifan pengingat (D3), perubahan nginx, penyedia eksternal (AIS/WhatsApp/email), data kapal pilot.
