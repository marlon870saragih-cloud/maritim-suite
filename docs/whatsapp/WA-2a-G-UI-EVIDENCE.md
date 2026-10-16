# WA-2a 2a-G (T3–T4) — Bukti UI Lokal Pesan Klien

| Item | Nilai |
|---|---|
| Status | **PR UI siap direview — BELUM di-merge.** Merge memerlukan izin owner terpisah |
| Persetujuan | OD-20 (16 Oktober 2026): implementasi UI T3–T4 opsi B (`contactId` di detail) dalam **14 path persis**, komponen di `src/components/automation/`, manifest `fase.G` + `faseAktif.GUI`. Tidak termasuk merge PR UI, deploy, atau pengiriman WhatsApp nyata |
| Basis | `main` @ `c1003d5fe01bac21acce30a8dffebc5061cbe468` (merge PR #32), branch `feat/wa2a-g-ui` |
| **HEAD kode yang diuji** | `5fda8d495f0e22277d3763d4d05d5ba28e7e4a9a` |
| Commit sesudah HEAD uji | Hanya dokumentasi: berkas ini dan `docs/TAH-CURRENT-CHECKPOINT.md` (diverifikasi `git diff --name-only 5fda8d4 HEAD`, dicatat di PR) |
| Cakupan | 2 halaman + 3 komponen client di atas API 2a-G (PR #31). Berhenti di **APPROVED**; tidak ada Send, provider, webhook, worker, LLM |
| Produksi | Tidak disentuh. Mode produksi hanya diuji **lokal** (`next start` loopback, DB sekali pakai, flag sengaja `true`) |

## 1. Berkas (14 path = `faseAktif.GUI.izin`)

| # | Path | Jenis | Isi |
|---|---|---|---|
| 1 | `src/app/(app)/automation/client-messages/page.tsx` | baru | Halaman server daftar: `requireTenant` + `bolehAksesWa2` → `notFound()` |
| 2 | `src/app/(app)/automation/client-messages/[id]/page.tsx` | baru | Halaman server detail, pagar sama; `?hasil=` hanya diteruskan, divalidasi komponen terhadap daftar kode yang dikenal |
| 3 | `src/components/automation/ClientMessageList.tsx` | baru | Daftar, filter status, paginasi, panel kandidat sinyal/kontak, buat draft |
| 4 | `src/components/automation/ClientMessageWorkspace.tsx` | baru | Detail, aksi dari `aksiTersedia`, dialog catatan tolak/batal, revisi, riwayat |
| 5 | `src/components/automation/client-message-shared.tsx` | baru | Tipe DTO lokal, label ID/EN, `panggilApi` (batas tunggu 15 s → "status tidak pasti"), teks galat |
| 6 | `prisma/check-wa2a-g-ui.mjs` | baru | Uji peramban (playwright-core dari luar repo); mode `dev`, `flag-mati`, `produksi` |
| 7 | `prisma/seed-wa2a-g-demo.mjs` | baru | Data demo sintetis; menolak DB nonlokal; `--bersihkan` hanya menghapus tenant demo ber-id tetap |
| 8 | `docs/whatsapp/WA-2a-G-UI-EVIDENCE.md` | baru | Dokumen ini |
| 9 | `prisma/check-wa2a-g-static.mjs` | ubah | Lapis U (UI) baru; asersi X-1 lama diganti literal `fase.G` + `faseAktif.GUI` |
| 10 | `prisma/check-wa2a-lingkup.mjs` | ubah (beku, tuple) | Literal I-1 = 10 route + 2 halaman; 6 fase (68 berkas); `faseAktif` hanya GUI; `WA2A_FASE=G` kini ditolak; fixture sintetis memakai id `SINTETIS` |
| 11 | `prisma/wa2a-lingkup-manifest.json` | ubah | §4 |
| 12 | `docs/TAH-CURRENT-CHECKPOINT.md` | ubah | Status |
| 13 | `src/services/whatsapp/wa-message-read.service.ts` | ubah | Opsi B: `contactId` di `DetailPesanKlien` (tipe, select, pemetaan) — **hanya detail** |
| 14 | `prisma/check-wa2a-g-api.mjs` | ubah | Kunci `contactId` di detail, daftar tanpa `contactId`, revisi dari detail & dari status terminal |

**Tidak berubah** (diperiksa P-global + I-2 + lapis U pada HEAD uji):
- service F3/F4, `wa1-bridge.ts`, `wa2-gate.ts`, `wa2-access.ts`;
- 15 berkas beku I-2 dan helper `wa2a-lingkup.mjs`;
- skrip fase lama, kecuali helper test dengan tuple;
- route API, schema, migrasi, `package.json`/lockfile;
- `Sidebar.tsx`, `(app)/layout.tsx`, halaman Automation Hub.

## 2. Perilaku UI

- **Akses.**
  - Tanpa sesi → layout `(app)` mengalihkan ke `/login`.
  - Sesi tidak berhak → 404 (`notFound()`): tenant di luar allowlist, peran selain ADMIN/MANAJER_OPERASI, flag mati, produksi.
  - Tanpa link Sidebar; halaman dibuka lewat URL langsung.
- **Daftar.**
  - Status, keluarga, revisi, penerima tersamar, pihak, bahasa, approval/`expiresAt`, `reasonCode`.
  - Filter status; "Muat lebih banyak" lewat `nextCursor`; kondisi kosong/memuat/galat.
- **Draft.**
  - Panel kandidat: sinyal dari endpoint kandidat (OPEN/ACKNOWLEDGED), opsional filter voyage.
  - Kontak: tidak layak = nonaktif + alasan.
  - Hasil `DRAFT_DIBUAT`/`SUDAH_ADA` → membuka detail dengan hasil aktual service.
- **Detail.**
  - Isi read-only, data pesan, kesegaran data, approval, riwayat dengan paginasi.
  - Label "BELUM DIKIRIM — tidak ada pengiriman pada fase ini" (UI dan `labelPengiriman` server).
- **Aksi.**
  - Tombol hanya untuk aksi di `aksiTersedia` (dikunci uji statis: tepat 6 tombol, masing-masing dijaga `ada(X)`).
  - Status terminal hanya menampilkan "Buat revisi".
  - Tolak/batal memakai dialog catatan; validasi 3–1000 karakter tetap di server.
- **Revisi (opsi B).** `POST {signalId: konteks.signalIds[0], contactId}` dari detail — kontak sama persis. UI menampilkan hasil aktual (`DRAFT_DIBUAT`, `SUDAH_ADA`, atau penolakan), tanpa janji revisi baru selalu terbentuk.
- **Keandalan.**
  - Kunci klik ganda sinkron.
  - Satu permintaan per aksi; hasil bisnis ditampilkan, lalu detail & riwayat dimuat ulang.
  - Timeout/putus koneksi → "Status tidak pasti", data dimuat ulang. Aksi dikunci sampai muat ulang berhasil; tanpa pengulangan mutasi otomatis.
  - 401 → `/login`; 409 → "Data berubah, tinjau ulang".
- **Bahasa & aksesibilitas.**
  - Teks ID/EN mengikuti `ms-lang`.
  - Tombol berlabel teks; aksi utama dapat dipicu dengan fokus keyboard + Enter (diuji).

## 3. Opsi B — kontrak `contactId`

- **Detail:** `contactId` = `WaClientMessage.contactId` dari pesan yang dibaca melalui `forTenant(ctx)`. Pesan tenant lain → 404, jadi ID kontak tenant lain tidak pernah keluar.
- **Daftar dan riwayat:** tidak berubah. Daftar dikunci kunci persis tanpa `contactId`; riwayat juga dikunci kunci persis.
- **Nomor:** tetap hanya `penerimaTersamar`.
- **Draft/revisi:** tetap menilai ulang kontak, consent, akses, dan sumber di service F3 (tidak diubah).

## 4. Manifest dan gate

Nilai berikut dihitung dan diverifikasi dari git (bukan ditebak):

| Perubahan | Nilai |
|---|---|
| `fase.G` (baru) | `pr 31`, `merge fa0ad5992bba45967271cf943f12e146a95ed142`, `basis 6a064ea585321440d0cf71812465419495f230a8`, `kepala ec7fc9a72d535c20d1e5a527459c0cda29af0574`, `berkas` = 19 path `git diff --no-renames basis kepala`. Diverifikasi: `merge^1 = basis`, `merge^2 = kepala`, tree merge = tree kepala, daftar = bekas `faseAktif.G.izin`; `periksaRekaman` lulus |
| `faseAktif.G` | dihapus |
| `faseAktif.GUI` (baru) | `izin` = 14 path §1; `jangkar` = `prisma/check-wa2a-g-ui.mjs`, `src/app/(app)/automation/client-messages/page.tsx` |
| `i1.diizinkan` | 10 route API + 2 halaman (komponen tidak merujuk service) |
| Tuple baru | `{basis c1003d5fe01bac21acce30a8dffebc5061cbe468, path prisma/check-wa2a-lingkup.mjs, blob d6cdbd04e69e4aa19d0714e3c5d19c1e2453ae41}`; tuple lama tetap (inert) |

Asersi lama yang diganti (tidak dilemahkan):
- "X-1: tanpa halaman/komponen UI di allowlist G" diganti asersi literal 12 path I-1 (tanpa komponen) + `fase.G` + `faseAktif.GUI`.
- "faseAktif hanya G (19 path)" diganti "faseAktif hanya GUI (14 path)" + "`WA2A_FASE=G` kini ditolak karena fase sudah merged".
- Skenario negatif (route liar, siklus, urutan impor, `[id]` literal, tuple, mode bukti) dipertahankan.

## 5. Lingkungan uji

| Item | Nilai |
|---|---|
| Clone | `git clone --shared` sekali pakai; `origin/main` dan `main` di-set ke `c1003d5` **di clone saja**; checkout detached `5fda8d4`; HEAD diverifikasi; `node_modules` symlink ter-ignore |
| Tree | Bersih sebelum suite statis, sebelum suite HTTP, dan sesudah semua suite (0 entri) |
| DB | PostgreSQL 16 loopback `127.0.0.1:55432`, klaster sekali pakai, migrasi yang sudah ada (`migrate deploy`); data sintetis bertanda (`WA2G-`, `WA2GP-`, `WA2GUI-`), dihapus tiap uji |
| Server | `next dev` (3200 API, 3400 UI) dan `next build` + `next start` (3300 API, 3500 UI), semua `-H 127.0.0.1`, perangkap egress `prisma/wa1-egress-trap.mjs` |
| Peramban | Chromium `/opt/pw-browsers`, `playwright-core` dari `/opt/node-tools` (di luar repo; `package.json`/lockfile tidak berubah) |

Baris bukti helper: `HEAD=5fda8d495f0e22277d3763d4d05d5ba28e7e4a9a basis=c1003d5fe01bac21acce30a8dffebc5061cbe468 origin/main=c1003d5… helper=0b12116a… manifest=cb5cc98c…`. P-fase GUI: 12 berkas di dalam allowlist, kedua jangkar ada.

## 6. Hasil baru pada HEAD `5fda8d4`

| Uji | Hasil | Exit |
|---|---|---|
| `check-wa2a-g-static` (`WA2A_FASE=GUI WA2A_BUKTI=1`) | **153/0** | 0 |
| `check-wa2a-lingkup` (helper) | **69/0** | 0 |
| F1 `check-wa2a-message-policy` · F2 `check-wa2a-template` | 102/0 · 63/0 | 0 · 0 |
| F3 `check-wa2a-message-f3` · F4 `check-wa2a-approval-f4` | 68/0 · 72/0 | 0 · 0 |
| 2C `check-wa2a-contact` · 2E `check-wa2a-access` | 39/0 · 38/0 | 0 · 0 |
| 2B `check-wa2a-schema` statis / dengan DB | 32/0 (DB dilewati) / **130/0** | 3 (DILEWATI, sesuai rancangan) / 0 |
| `check-comm-policy` · `check-tah-policy` | 326/0 · 322/0 | 0 · 0 |
| `check-wa2a-g-api` `next dev` aktif (kontrak `contactId`, isolasi tenant) | **109/0** | 0 |
| `check-wa2a-g-api` flag mati | 22/0 | 0 |
| `check-wa2a-g-ui` `next dev` (alur peramban penuh) | **44/0** | 0 |
| `check-wa2a-g-ui` flag mati | 10/0 | 0 |
| `next build` (perangkap egress) | sukses; 10 route + 2 halaman `ƒ` dinamis; `BLOCKED` 0 | 0 |
| `check-wa2a-g-prod` (`next start`, flag `true`, regresi API) | 20/0 | 0 |
| `check-wa2a-g-ui` produksi lokal (`next start`, flag `true`) | **10/0** — tanpa sesi → `/login`; ADMIN & MANAJER_OPERASI → 404 di kedua halaman | 0 |
| `tsc --noEmit` · `next lint` | bersih · bersih (1 warning lama `ReceiptForm.tsx`, di luar scope) | 0 · 0 |
| Egress | `BLOCKED` = 0 di keenam log server dan build; peramban 0 permintaan ke origin lain | — |

**Rincian `check-wa2a-g-ui` dev (44 asersi):**

- **Akses.** Tanpa sesi → `/login`; OPERATOR dan tenant C di luar allowlist → 404 di kedua halaman, tanpa konten pesan.
- **Daftar & draft.**
  - Login lewat formulir, kondisi kosong, label BELUM DIKIRIM, tanpa link Sidebar.
  - Kandidat: sinyal OPEN tampil dan DISMISSED tidak; kontak tanpa opt-in nonaktif dengan alasan.
  - Buat draft → detail `?hasil=DRAFT_DIBUAT`, status DRAFT, tombol = `PRATINJAU,BATALKAN,BUAT_REVISI`; draft ulang → `SUDAH_ADA` pesan yang sama.
- **Pratinjau & approval.**
  - Klik ganda pratinjau → tepat **1** POST.
  - Fokus + Enter "Minta approval" → PENDING_APPROVAL.
- **Maker-checker.**
  - Tombol SETUJUI/TOLAK **tidak tampil** untuk peminta, pembuat draft, dan pencatat konfirmasi ETA.
  - Permintaan **langsung** dari ketiganya → 403 `SELF_APPROVAL_FORBIDDEN` / `CHECKER_IS_MAKER` / `CHECKER_IS_EVIDENCE_RECORDER`; status PENDING dan versi approval tidak berubah.
  - Checker sah melihat SETUJUI & TOLAK.
- **Setujui sampai revisi.**
  - Setujui → "Disetujui — BELUM DIKIRIM", `successKey` kosong, tombol `BATALKAN,BUAT_REVISI`, tanpa Kirim/Send.
  - Riwayat memuat draft, pratinjau, approval diminta, disetujui.
  - Batal tanpa alasan → galat server tampil; dengan alasan → CANCELED, info status akhir, tombol hanya `BUAT_REVISI`.
  - **Revisi dari status terminal** → `DRAFT_DIBUAT`, pesan baru DRAFT, kontak sama persis.
- **Tolak & kondisi khusus.**
  - Tolak dengan catatan 2 huruf → galat, status tetap; dengan catatan sah → REJECTED, tombol hanya `BUAT_REVISI`.
  - Approval kedaluwarsa saat diklik → "Approval kedaluwarsa", EXPIRED.
  - Approval sudah diputuskan checker lain → "sudah diputuskan", data dimuat ulang (APPROVED).
  - Koneksi diputus saat minta approval → "Status tidak pasti", detail dimuat ulang, **tepat 1** percobaan (tanpa kirim ulang), status tetap PREVIEWED.
- **Daftar lanjutan.** Paginasi 20 → lebih tanpa duplikat; filter REJECTED; tenant B: daftar kosong dan detail pesan A → galat 404 tanpa isi; EN "NOT SENT — no sending in this phase".
- **Kebocoran & jaringan.**
  - DOM dan 86 respons API pesan klien tanpa nomor utuh.
  - Peramban tanpa origin lain. `/api/*` hanya ke API pesan klien, `/api/auth/*`, dan GET shell layout yang sudah ada (`/api/notifications`, NotificationBell).
  - Permintaan dihitung terpisah per jenis: navigasi halaman 28, aset Next.js 310, API pesan klien 90, auth 43, shell 28.

**Rincian `check-wa2a-g-api` (+5 asersi dibanding `ba617ba`):**
- detail = allowlist + `contactId`;
- `detail.contactId` = kontak tersimpan di tenant sesi;
- daftar tanpa `contactId`;
- REJECTED → `aksiTersedia` hanya `BUAT_REVISI`;
- revisi dari REJECTED → `DRAFT_DIBUAT` (revision 2, kontak sama) lalu ulang → `SUDAH_ADA`;
- revisi [V] memakai `contactId` + `signalIds[0]` dari detail.

## 7. Uji mutasi (clone terpisah, dikembalikan)

| Mutasi | Tertangkap oleh |
|---|---|
| Komponen daftar mengimpor `@/services/whatsapp/wa-phone` | g-static: impor komponen, I-1 (3 asersi) |
| Halaman daftar tanpa `bolehAksesWa2` | g-static: pagar halaman |
| Tombol SETUJUI tanpa penjaga `aksiTersedia` | g-static: penjaga tombol aksi |
| Revisi memakai kontak selain `contactId` detail | g-static: revisi opsi B |
| `Sidebar.tsx` berubah | g-static: shell tidak berubah + P-fase GUI |
| Halaman ketiga merujuk `wa2-access` | g-static (P-fase GUI + I-1), helper ("I-1 repo nyata") |

## 8. Bukti historis (tidak diklaim ulang)

- API 2a-G pada HEAD `ba617ba`: static 131/0, API 104/0, flag-mati 22/0. Pada `4d6f995`: regresi penuh, prod lokal 20/0. Rinciannya di [WA-2a-G-EVIDENCE.md](WA-2a-G-EVIDENCE.md).
- **Tidak dijalankan ulang pada HEAD ini**, karena service F3/F4/WA-1/TAH tidak diubah (perubahan service hanya satu field baca di detail):
  - uji DB F3/F4/2C/2E;
  - WA-1 DB/HTTP;
  - TAH ledger, V3, automation, intake, tenant-guard, validator-remediasi.

## 9. Keterbatasan

- Jendela kandidat sinyal tetap `min(take × 5, 250)` baris terbaru. Sinyal berstatus layak dengan jenis kejadian tidak didukung masih dapat menutupi kandidat yang lebih lama. Panel kandidat tidak punya paginasi (perilaku API).
- Kandidat kontak ≤ 200 kontak ACTIVE per permintaan.
- Batas tunggu UI 15 s. Sebenarnya transaksi service dibatasi 5 s, sehingga "tidak pasti" terutama berarti koneksi putus. Uji mensimulasikannya dengan memutus permintaan di peramban, bukan server lambat.
- Revisi memakai `signalIds[0]`. Bila grup kandidat punya beberapa sinyal, semuanya menghasilkan kunci kandidat yang sama (service menilai ulang).
- Uji aksesibilitas hanya dasar (label tombol, fokus + Enter); belum audit WCAG.
- Shell aplikasi (`/api/notifications`) ikut dipanggil layout yang sudah ada; tidak dibuat atau diubah UI ini.
- Tidak ada CI/check-run di repo ini.
- Tidak ada pengiriman, provider, webhook, worker, LLM, deploy, atau aktivasi flag di lingkungan nyata.

## 10. Demo lokal singkat

1. Siapkan PostgreSQL loopback sekali pakai, lalu jalankan `DATABASE_URL=$U DIRECT_URL=$U npx prisma migrate deploy`.
2. `WA2G_DEMO_DB_URL=$U node prisma/seed-wa2a-g-demo.mjs` — mencetak 5 akun sintetis (sandi sama).
3. Jalankan server:
   ```
   DATABASE_URL=$U DIRECT_URL=$U PORTAL_DATABASE_URL=$U NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=<acak> \
   AUTOMATION_MONITORING_ENABLED=true AUTOMATION_TENANT_IDS=wa2gdemotenantaaaaaa01 WA2_CLIENT_FOUNDATION_ENABLED=true \
   npx next dev -p 3000
   ```
4. Jalankan alur di `http://localhost:3000/automation/client-messages`:
   1. login `wa2g-demo-maker@…` → Buat draft (pilih sinyal + kontak opt-in).
   2. login `wa2g-demo-peminta@…` → Tandai sudah dipratinjau → Minta approval.
   3. login `wa2g-demo-checker@…` → Setujui. Hasilnya "Disetujui — BELUM DIKIRIM".
   4. Batalkan atau Buat revisi.
5. Akun `wa2g-demo-operator@…` → 404.
6. Bersihkan: `WA2G_DEMO_DB_URL=$U node prisma/seed-wa2a-g-demo.mjs --bersihkan`.
