# WA-2a Step 2F — F4: Bukti Approval Service Pesan Klien

| Item | Nilai |
|---|---|
| Status | **Perbaikan pra-merge #1 & #2 selesai — menunggu review akhir owner** (PR #27 OPEN, belum di-merge) |
| Persetujuan | K1–K11 (preflight F4), pengecualian uji E1–E7 per baris persis, perubahan terbatas `wa-contact/wa-consent/wa-grant/wa-message.service.ts` + `ops/voyage-event.service.ts` |
| Basis | `main` @ `0ad92516959e8b89e4f0945baccc03e8145a32d6` (PR #26 perbaikan uji 2B merged), working tree bersih sebelum mulai |
| Cakupan | Service layer saja. Berhenti di **APPROVED** — tanpa Send, provider, route API, UI, LLM, migrasi |
| Produksi | Tidak disentuh. Flag `WA2_CLIENT_FOUNDATION_ENABLED` default OFF (`.env.example` = `"false"`); `NODE_ENV=production` ditolak gerbang WA-2 **dan** definisi approval (`hanyaNonProduksi`) |

## 1. Berkas

| Berkas | Jenis | Isi |
|---|---|---|
| `src/services/whatsapp/wa-message-approval.service.ts` | Baru | `mintaApprovalPesanKlien`, `setujuiPesanKlien`, `tolakPesanKlien`, `batalkanPesanKlien` |
| `src/services/whatsapp/wa-approval-stop.ts` | Baru | Kunci approval FOR UPDATE + `hentikanApprovalTertaut` WA-1 apa adanya + audit `WA2_APPROVAL_DIHENTIKAN`; dipakai hold, batal, revisi |
| `src/services/whatsapp/wa-message-check.ts` | Baru (dipindah) | Pemeriksaan in-tx F3 (`periksaKontak`, `periksaAkses`, `nilaiFreshnessDb`, `asalDataVoyage`, `denganUlangPesan`) **dipindah apa adanya** dari `wa-message.service.ts` (diff = hanya kata `export` + kunci K1). Alasan: asersi F3 "setiap fungsi publik service diawali `gerbangWa2(ctx)`" tetap utuh tanpa pengecualian |
| `src/services/whatsapp/wa-message.service.ts` | Ubah | Impor helper dari modul di atas; revisi menghentikan approval lama (`SUPERSEDED`) alih-alih menolak; `PILIH_PESAN` + `previewedByUserId`; ekspor `verdictStabil`/`PILIH_PESAN` |
| `src/services/whatsapp/wa-approval-def.ts` | Tambahan murni | `pencatatBuktiFreshness`, `otorisasiCheckerBuktiWaKlien` (K5). Fungsi F1 tidak diubah |
| `src/services/whatsapp/wa2-policy.ts` | Tambahan data | Peran peminta (K4), awalan idempotensi `WA2:`, `ALASAN_FRESHNESS_BLOCKED` (K2), `KODE_ALASAN_WA2F4` |
| `src/services/whatsapp/wa1-bridge.ts` | Ubah | + re-export `hentikanApprovalTertaut` dari modul WA-1 yang sudah disetujui (`communication.service`) — tetap 3 modul |
| `src/services/whatsapp/wa-contact.service.ts`, `wa-consent.service.ts`, `wa-grant.service.ts` | Ubah (K3, beku 2C) | +1 baris impor dan +1 baris `hentikanApprovalPesanDitahan` tepat sebelum setiap `tahanPesan*` (kontak 2, consent 2, grant 1) |
| `src/services/ops/voyage-event.service.ts` | Ubah (K1, di luar WA-2) | `createVoyageEvent` & `removeVoyageEvent` di dalam `$transaction` yang lebih dulu mengunci `Voyage` **FOR NO KEY UPDATE** |
| `prisma/check-wa2a-approval-f4.mjs` | Baru | 59 pemeriksaan statis + murni |
| `prisma/check-wa2a-approval-f4-db.mjs` | Baru | 109 pemeriksaan DB |
| Uji beku/lingkup | Pengecualian E1–E7 | Lihat §4 |
| `docs/whatsapp/WA-2a-F4-EVIDENCE.md` | Baru | Dokumen ini |

**Tidak berubah:** `src/services/communication/**` (WA-1), `src/services/tah/**` (TAH beku), intake, Validator V3, schema, migrasi, rollback, template v1, `wa2-gate.ts`, `wa-lock.ts`, `wa-access-resolver.ts`, `wa-freshness.ts`, route/UI. `prisma migrate diff` (migrasi → schema) = **No difference detected**.

## 2. Perilaku

**Permintaan (PREVIEWED → PENDING_APPROVAL).**
1. ADMIN/MANAJER_OPERASI saja (K4); konteks sistem, tenant di luar allowlist, flag OFF, produksi → ditolak sebelum menulis.
2. Peminta menyodorkan `snapshotFingerprint` yang ia lihat.
3. Revalidasi penuh di transaksi (sama dengan keputusan, di bawah).
4. Definisi beku → `kind`, `actionRisk`, `requiredRoles`, `subjectType`, `expiresAt` = jam server + **tepat 2 jam**; tak ada medan dari input.
5. `proposalHash` = sidik snapshot, `basisFingerprint` = sidik sumber, `originatorUserId` = peminta, `idempotencyKey` = `WA2:<messageId>`; usulan memuat nomor **samaran** saja.
6. Idempoten: permintaan ulang → `SUDAH_ADA`; tiga permintaan bersamaan → tepat satu baris.

**Keputusan (setujui/tolak).** Urutan tanpa mutasi dulu: kebijakan baris (kind/kelas/peran/subjek) → maker-checker K5 atas bukti snapshot → status → `proposalHash` sodoran. Lalu kedaluwarsa (K11), tautan subjek, keutuhan baris, revalidasi, maker-checker ulang atas bukti evaluasi ulang, kunci kandidat → kunci approval → baca ulang → tulis.

**Revalidasi sebelum APPROVED:** kontak ACTIVE + VERIFIED (nomor/pihak/bahasa = snapshot), consent OPT_IN **dengan versi snapshot**, tenant (forTenant + SQL ber-tenant), resolver akses voyage + kategori, grant snapshot masih termasuk grant sah, kandidat ACTIVE, sumber (`sourceFingerprint`), freshness D6 (konfirmasi ≤ 12 jam / milestone MANUAL ≤ 24 jam, tanpa ganda), asal data NYATA, dan **K7**: verdict bukti evaluasi ulang = verdict snapshot (selain jam evaluasi).

| Kegagalan | Pesan | Approval |
|---|---|---|
| Kontak/consent/versi consent/akses/grant/kategori | NEEDS_REVIEW | CANCELLED |
| Bukti hilang/invalid/kedaluwarsa (konfirmasi, umur milestone) | NEEDS_REVIEW | CANCELLED |
| **Bukti berubah sejak snapshot (K7)** | NEEDS_REVIEW (`EVIDENCE_CHANGED`) | CANCELLED |
| Sumber berubah/terhapus/tidak sah, milestone ganda, sidik tak cocok | BLOCKED (activeKey dilepas) | CANCELLED |
| Kedaluwarsa (`expiresAt ≤ sekarang`) | EXPIRED (terminal) | EXPIRED |
| Tolak checker (catatan wajib) | REJECTED (terminal) | REJECTED |
| Lolos semua | APPROVED | APPROVED + eksekusi NOT_STARTED |

Pesan APPROVED **tidak dikirim**: `successKey` tetap kosong, tak ada state kirim, tak ada eksekusi RUNNING/SUCCEEDED.

**Pembatalan, revisi, hold (K3/K6).** Batal: pesan non-terminal → CANCELED; approval PENDING → CANCELLED, APPROVED/NOT_STARTED → eksekusi CANCELLED. Revisi baru → revisi lama CANCELED (`REVISION_SUPERSEDED`) + approval SUPERSEDED (atau eksekusi CANCELLED bila sudah APPROVED). Hold opt-out, cabut verifikasi, nonaktifkan kontak, cabut grant → approval tertaut dihentikan **sebelum** pesan ditahan, di transaksi yang sama. Penghenti = `hentikanApprovalTertaut` WA-1 tanpa perubahan (label audit WA-1 tetap) + audit `WA2_APPROVAL_DIHENTIKAN`.

**Urutan kunci (semua jalur):** WaContact → WaConsentState → grant/Voyage (FOR SHARE) → bukti → CommunicationCandidate → TahApprovalRequest (FOR UPDATE) → WaClientMessage. Hold tidak mengunci kandidat (sub-urutan yang sama). Isolasi READ COMMITTED + kunci baris; tanpa SERIALIZABLE.

**K1.** Penulis VoyageEvent (satu-satunya: `ops/voyage-event.service.ts`, diverifikasi pemindai) mengunci `Voyage` FOR NO KEY UPDATE; pembaca WA-2 memegang `Voyage` FOR SHARE sebelum membaca peristiwa. Akibatnya sisipan/hapus bersamaan **menunggu** atau **sudah commit dan terlihat** saat keputusan. FOR NO KEY UPDATE tidak bentrok dengan FOR KEY SHARE milik FK tabel anak, sehingga sisipan tabel lain tak tertahan. Validasi, galat, dan bentuk hasil API tidak berubah.

## 3. Hasil uji (PostgreSQL 16 loopback sekali pakai, data sintetis, egress dijebak)

| Suite | Hasil |
|---|---|
| `check-wa2a-approval-f4` (F4 statis + murni) | **60/0** (perbaikan pra-merge; sebelumnya 59) |
| `check-wa2a-approval-f4-db` (F4 DB) | **117/0** (perbaikan pra-merge; sebelumnya 109) |
| `check-voyage-event-api` (HTTP route POST/DELETE, baru) | cabang **27/0**, `main` **25/0**; transkrip ternormalisasi **identik** (lihat §6) |
| `check-automation-api` / `check-owner-guard` (HTTP, seed sah) | cabang 104/0 & 26/0; `main` 104/0 & 26/0 |
| `check-wa2a-message-f3` / `-db` | 54/0, 72/0 |
| `check-wa2a-message-policy` (F1) / `check-wa2a-template` (F2) | 90/0, 51/0 |
| `check-wa2a-schema` (2B, statis + DB) | 130/0 (sebelum **dan** sesudah commit) |
| `check-wa2a-contact` / `-db` (2C) | 29/0, 67/0 |
| `check-wa2a-access` / `-db` (2E) | 28/0, 68/0 |
| `check-comm-policy` / `check-comm-schema` | 326/0, 85/0 |
| `check-comm-prepare-db` / `read-db` / `approval-db` / `cancel-db` / `send-db` | 98/0, 42/0, 95/0, 73/0, 119/0 |
| `check-comm-api` / `comm-e2e` / `comm-ui` (HTTP WA-1, `next dev` loopback) | 43/0, 108/0, 55/0 (comm-ui: lihat §3.3) |
| `check-tah-policy` / `check-tah-ledger` | 322/0, 98/0 |
| `check-validator-v3` | 226/0 |
| `check-automation-policy` / `check-intake-policy` / `check-tenant-guard` | 124/0, 417/0, 2/0 |
| `tsc --noEmit`, eslint (berkas berubah) | bersih |
| `prisma migrate diff` | No difference detected |

**Kegagalan baseline yang dicatat terpisah (bukan regresi F4):**
- `check-validator-remediasi` **61/9** — identik di `main` sebelum F4 (dicatat sejak PR #26). Tidak diperbaiki (di luar lingkup).
- ~~`check-owner-guard` / `check-automation-api` tidak dapat dijalankan~~ — **diselesaikan pada perbaikan pra-merge #2** (§6): dijalankan dengan seed sah di klaster sekali pakai, di server kode cabang dan kode `main`.

### 3.1 Konkurensi nyata (service ∥ service, 10× tiap skenario, jeda bertingkat 0–600 ms)

Pada jalan pertama dengan start serentak, aksi lawan **selalu** menang (setujui melakukan lebih banyak kueri sebelum mengunci) — artinya hanya satu urutan teruji. Uji diperbaiki dengan jeda bertingkat dan **asersi bahwa kedua urutan benar-benar terjadi**.

| Skenario | Sebaran hasil akhir (contoh jalan) | Invarian |
|---|---|---|
| setujui ∥ opt-out | 2× hold dulu (CANCELLED), 8× setujui dulu → eksekusi CANCELLED | tak pernah APPROVED aktif dengan OPT_OUT |
| setujui ∥ cabut grant | 2 / 8 (sama) | tak pernah APPROVED aktif dengan grant REVOKED |
| setujui ∥ batal | 2× CANCELLED, 8× APPROVED→eksekusi CANCELLED | pesan CANCELED, approval tak aktif |
| setujui ∥ revisi baru | 2× SUPERSEDED, 8× EVIDENCE_CHANGED lalu digantikan | revisi baru hanya ada bila bukti berubah → APPROVED mustahil |
| setujui ∥ sisipan milestone ganda (service) | 2× BLOCKED `EVENT_DUPLICATE`, 8× APPROVED (sisipan sesudah commit) | — |
| setujui ∥ hapus milestone (service) | 2× BLOCKED, 8× APPROVED | — |
| dua checker | selalu tepat satu DISETUJUI; **kedua** checker pernah menang | pemutus tunggal |
| setujui ∥ tolak | 2× REJECTED, 8× APPROVED | tepat satu keputusan final |
| setujui ∥ principal dipindah (DB) | 2× NEEDS_REVIEW, 8× APPROVED | tanpa deadlock |

**K1 deterministik (kedua urutan):** (a) pembaca memegang Voyage FOR SHARE → `createVoyageEvent` dan `removeVoyageEvent` **menunggu** ≥ 800 ms lalu berhasil setelah commit; (b) penulis memegang Voyage FOR NO KEY UPDATE + menyisipkan duplikat tanpa commit → keputusan **menunggu**, lalu melihat sisipan → `DIBLOKIR EVENT_DUPLICATE`.

### 3.2 Uji mutasi (18; harus membuat uji gagal)

| # | Mutasi | Hasil |
|---|---|---|
| M1 | checker = pencatat bukti diizinkan | tertangkap (statis 2, DB 8) |
| M2 | peminta tidak diperiksa | tertangkap (DB 5) |
| M3 | kedaluwarsa dilewati | tertangkap (DB) |
| M4 | versi consent tidak dicek | tertangkap (DB) |
| M5 | milestone ganda tidak dicek | tertangkap (DB 3 + lingkup) |
| M6 | K1: penulis VoyageEvent tanpa kunci Voyage | tertangkap (statis + DB 2) |
| M7 | revisi tidak menghentikan approval lama | tertangkap (statis + DB 5) |
| M8 | opt-out tidak menghentikan approval | tertangkap (statis + DB 6) |
| M9 | cabut grant tidak menghentikan approval | tertangkap (statis + DB 4) |
| M10 | proposalHash sodoran tidak dibandingkan | tertangkap (statis + DB 3) |
| M11 | K7 bukti berubah tidak dicek | tertangkap (statis + DB) |
| M12 | revalidasi gagal tanpa menghentikan approval | tertangkap (statis + DB 19) |
| M13 | batal tanpa menghentikan approval | tertangkap (DB 4) |
| M14 | kind dari literal | tertangkap (statis) |
| M15 | TTL +3 jam | tertangkap (statis + DB) |
| **M16** | **penjaga `version` dihapus pada updateMany setujui** | **LOLOS** — mutan ekuivalen: baris approval sudah dikunci FOR UPDATE dan `kunciUlang` memverifikasi versi & status sebelum menulis. Penjaga tetap dipertahankan sebagai lapis kedua |
| M17 | nonaktifkan kontak tidak menghentikan approval | tertangkap (statis + DB 2) |
| M18 | pembaca milestone tanpa kunci Voyage sendiri | tertangkap **hanya oleh statis** — resolver akses juga mengunci Voyage FOR SHARE, jadi kunci eksplisit ini lapis kedua |

### 3.3 WA-1 tidak berubah perilaku

- `git diff main -- src/services/communication` kosong.
- WA-1 `setujuiPesan`/`tolakPesan` atas approval `CLIENT_WA_UPDATE` → FORBIDDEN tanpa mutasi; WA-2 atas approval WA-1 → FORBIDDEN `APPROVAL_POLICY_MISMATCH` tanpa mutasi; jalur WA-1 atas approval WA-1 tetap DISETUJUI.
- Suite DB WA-1 (prepare/read/approval/cancel/send) lulus. Suite HTTP WA-1: comm-api 43/0, comm-e2e 108/0 (jebakan egress aktif), comm-ui 55/0.
- **Catatan jujur comm-ui:** jalan pertama gagal 0/1 pada **login formulir** sebelum pemeriksaan apa pun berjalan (diagnosis halaman `/login` kosong — server `next dev` baru dikompilasi ulang setelah `rm -rf .next`). F4 tidak menyentuh UI/route/auth. Satu jalan ulang tanpa perubahan kode: **55/0**.

## 4. Pengecualian uji (E1–E7, path & baris persis)

| # | Berkas | Perubahan |
|---|---|---|
| E1 | `prisma/check-comm-policy.mjs` (asersi pembuat TahApprovalRequest) | 1 baris diganti: pembuat = **persis** `communication-approval.service.ts` + `whatsapp/wa-message-approval.service.ts` (+1 baris komentar) |
| E1 (sisi WA-2) | `prisma/check-wa2a-message-f3.mjs` (asersi "tak ada pembuat TahApprovalRequest di WA-2") | Asersi F3 yang sengaja menunggu F4: kini pembuat di WA-2 = **persis** `wa-message-approval.service.ts`. *Tidak tercantum di daftar preflight — dilaporkan di sini* |
| E3 | `prisma/check-wa2a-message-f3.mjs` (regex adapter) | Hanya token `\|hentikanApproval` dihapus; `tahApproval`, `blokirCandidate`, `Send` tetap dilarang |
| E4 | `check-wa2a-message-policy.mjs`, `check-wa2a-template.mjs`, `check-wa2a-message-f3.mjs` (daftar BOLEH) | + path F4 persis |
| E4b | `check-wa2a-message-f3.mjs` (larangan service 2a-C) | `wa-contact/wa-consent.service.ts` hanya lolos bila diff = baris K3 persis (`BARIS_F4`) |
| E5 | `check-wa2a-contact.mjs`, `check-wa2a-access.mjs` | `BARIS_F4` (hapus/tambah persis, tanpa trim): `check-comm-policy.mjs` (E1); di 2E juga `wa-contact`/`wa-consent.service.ts` (K3) |
| E6 | — | Tidak ada uji yang menjaga `voyage-event.service.ts`; cukup daftar BOLEH |
| E7 | `check-wa2a-schema.mjs` (`BARIS_2B`) | Entri persis untuk baris E1 di `check-comm-policy.mjs` |

Uji negatif: menambah satu baris tak disetujui di `wa-contact.service.ts` → `check-wa2a-access` dan `check-wa2a-message-f3` GAGAL; mengubah `src/services/tah/tah-policy.ts` sesudah commit → `check-wa2a-schema` GAGAL.

## 5. Sisa risiko & batas (jujur)

1. **APPROVED/NOT_STARTED dapat menjadi basi** karena perubahan dari luar WA-2 (edit ETA, principal pindah, event dihapus/ditambah sesudah commit keputusan, konfirmasi diinvalidasi, `validUntil` grant lewat). Approval APPROVED tidak punya TTL. Sesuai keputusan owner, **WA-2b wajib revalidasi final sebelum Send**.
2. Hold yang dipicu jalur WA-2 menghentikan approval; perubahan Voyage di service operasional **tidak** memicu hold (tidak diperluas di F4).
3. Batas kedaluwarsa ±1 ms dibuktikan pada fungsi murni (jam disuntikkan); di DB diuji −1 ms (kedaluwarsa) dan +60 s (belum), karena jam server tidak dapat dibekukan tanpa mengubah service.
4. `process.env.NODE_ENV` dibaca sekali di service approval (untuk definisi beku `hanyaNonProduksi`) — lapis kedua setelah gerbang WA-2.
5. `createVoyageEvent`/`removeVoyageEvent` kini menunggu sebentar bila ada transaksi WA-2 pada voyage yang sama (milidetik). Dibuktikan lewat HTTP pada perbaikan #2 (§6).
6. Transaksi interaktif service memakai timeout bawaan Prisma **5000 ms**: penantian kunci > 5 s membatalkan `setujui` (rollback, approval tetap PENDING — gagal tertutup, diuji). Akibatnya di bawah antrean kunci panjang checker bisa mendapat galat dan perlu mengulang; tidak mengubah keamanan.

## 6. Perbaikan pra-merge (review owner atas PR #27 @ `309ea16`)

### 6.1 Perbaikan #1 — freshness pada jam keputusan

**Masalah (dikonfirmasi):** `setujuiPesanKlien` mengambil `sekarang` sebelum penantian kunci (kontak/consent/grant/bukti/kandidat/approval); jam baru menjelang APPROVED hanya dipakai untuk TTL approval. Transaksi yang tertahan kunci dapat menyetujui bukti yang sudah melewati batas.

**Bukti sebelum perbaikan (kode `309ea16`, uji adversarial baru):** 4 dari 5 kasus mencapai **APPROVED** dengan bukti yang sudah kedaluwarsa saat keputusan ditulis — konfirmasi ETA > 12 jam, milestone > 24 jam, verifikasi kontak lewat, grant snapshot lewat. Hanya TTL approval yang sudah tertangani (→ KEDALUWARSA).

**Perbaikan (satu blok di `setujuiPesanKlien`):** sesudah `kunciCandidate` + `kunciUlang` (semua baris terkunci), `akhir = new Date()` lalu:
1. TTL approval dengan `akhir` (sudah ada);
2. **revalidasi penuh `revalidasiPesan(ctx, tx, s.m, akhir)`** — kontak ACTIVE/VERIFIED, consent+versi, akses/kategori, grant snapshot (`validUntil > akhir`), kandidat, sumber, freshness D6 (≤ 12 jam / ≤ 24 jam), K7;
3. gagal → `tahanPesan` (approval dihentikan, NEEDS_REVIEW/BLOCKED) di transaksi yang sama;
4. maker-checker K5 atas pencatat bukti snapshot ∪ evaluasi pertama ∪ evaluasi akhir;
5. baru APPROVED dengan `decidedAt = approvedAt = akhir`; audit mencatat `dinilaiPada`.

Urutan kunci tetap (semua baris sudah terkunci sebelum `akhir`; evaluasi ulang tidak menunggu kunci baru), snapshot tetap immutable, audit tetap atomik.

**Uji adversarial ([T] di `check-wa2a-approval-f4-db`):** transaksi lain memegang `WaContact` FOR UPDATE → `setujui` menunggu di kunci pertamanya ~3 s; bukti dijadwalkan habis ~1,2 s sesudah `setujui` mulai. Uji memvalidasi dirinya: bukti **wajib segar saat mulai** dan **wajib lewat batas saat kunci dilepas**, dan `setujui` **wajib benar-benar menunggu**.

| Kasus | Sebelum | Sesudah |
|---|---|---|
| konfirmasi ETA melewati 12 jam selama menunggu | APPROVED ❌ | DITAHAN `CONFIRMATION_EXPIRED`, approval CANCELLED ✅ |
| milestone melewati 24 jam selama menunggu | APPROVED ❌ | DITAHAN `EVENT_TOO_OLD` ✅ |
| verifikasi kontak kedaluwarsa selama menunggu | APPROVED ❌ | DITAHAN `CONTACT_INELIGIBLE` ✅ |
| grant snapshot kedaluwarsa selama menunggu | APPROVED ❌ | DITAHAN `ACCESS_DENIED` ✅ |
| TTL approval lewat selama menunggu | KEDALUWARSA ✅ | KEDALUWARSA ✅ |
| batas BELUM terlewati (jadwal; milestone) walau menunggu | APPROVED | APPROVED ✅ (tidak terlalu ketat) |
| tahanan > 5 s (timeout transaksi service) | — | setujui gagal & rollback, approval PENDING ✅ |

**Mutasi:** M19 (revalidasi akhir memakai jam lama) dan M20 (revalidasi akhir dihapus, hanya TTL) → keduanya **tertangkap** (statis 2 + DB 4 masing-masing). Total mutasi F4: **19/20 tertangkap** (M16 tetap mutan ekuivalen).

*Catatan:* `mintaApprovalPesanKlien` juga menilai freshness dengan jam awal transaksi; tidak diubah karena permintaan tidak menghasilkan APPROVED dan keputusan selalu menilai ulang dengan jam akhir.

### 6.2 Perbaikan #2 — kompatibilitas route VoyageEvent (K1)

**Temuan:** `check-automation-api` hanya mencakup **POST** `/events` (detektor pemantauan), tidak DELETE. Maka dibuat uji ekuivalen pada route sebenarnya: `prisma/check-voyage-event-api.mjs` (sesi login NextAuth → route → `withTenant` → service → DB; hanya loopback; data `VEAPI-` dihapus di akhir).

**Lingkungan:** PostgreSQL 16 loopback sekali pakai (`migrate deploy`), `next dev` localhost. Seed sah untuk suite bernama: 3 tenant sintetis (`Tribuana Seed Uji A` di allowlist Automation, `Verifikasi Seed Uji B`, `Tribuana Seed Uji Kembar C`), dihapus sesudah uji. Produksi tidak disentuh.

**Diferensial:** suite yang sama dijalankan terhadap server **kode `main` (`0ad9251`, git worktree)** dan **kode cabang**; transkrip (status + body, id/waktu dinormalisasi ke label) ditulis lalu dibandingkan byte-per-byte.

| Suite | `main` | cabang |
|---|---|---|
| `check-voyage-event-api` (25 langkah: POST 401/403/201×3/400×4/404×4/403 langganan; GET urutan; 6 POST bersamaan; DELETE 401/403/404×5/200; GET sesudah hapus) | 25/0 | 25/0 + 2 K1 = **27/0** |
| transkrip ternormalisasi | — | **IDENTIK** dengan `main` |
| K1 lewat HTTP: POST & DELETE **menunggu** selama Voyage dipegang FOR SHARE, lalu 201/200 | (tidak berlaku) | ✅ |
| `check-automation-api` (termasuk POST `/events` dari detektor) | 104/0 | 104/0 |
| `check-owner-guard` | 26/0 | 26/0 |

Penambahan path persis `prisma/check-voyage-event-api.mjs` ke daftar lingkup F1/F2/F3/F4 (mekanisme E4 yang sama).

### 6.3 Gate ulang sesudah kedua perbaikan

F4 statis 60/0 · F4 DB 117/0 · F3 54/0 & 72/0 · F1 90/0 · F2 51/0 · 2B 130/0 · 2C 29/0 & 67/0 · 2E 28/0 & 68/0 · comm-policy 326/0 · comm-schema 85/0 · comm prepare/read/approval/cancel/send 98/0, 42/0, 95/0, 73/0, 118/0 (jumlah send bervariasi 117–121, juga di `main`) · TAH 322/0 & 98/0 · V3 226/0 · tsc & eslint bersih · `migrate diff` tanpa perbedaan · `git diff main` atas WA-1/TAH/schema/migrasi/route = kosong. Baseline `check-validator-remediasi` 61/9 tetap (identik `main`). Suite HTTP WA-1 (comm-api/e2e/ui) tidak dijalankan ulang: perbaikan tidak menyentuh WA-1, route, auth, atau UI (hasil sebelumnya 43/0, 108/0, 55/0).
