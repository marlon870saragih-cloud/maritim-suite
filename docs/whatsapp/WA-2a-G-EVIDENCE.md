# WA-2a 2a-G (T1–T2) — Bukti API Lokal Pesan Klien

| Item | Nilai |
|---|---|
| Status | **PR API siap direview — BELUM di-merge.** Merge memerlukan persetujuan owner terpisah |
| Persetujuan | Owner 16 Oktober 2026: implementasi tahap API 2a-G (T1–T2) dalam **19 path persis**, pengecualian gate X-1, adaptasi uji helper gate. UI, Send, provider, webhook, LLM, dependency, deploy, flag di lingkungan nyata, DB nyata: **tidak diizinkan** dan tidak disentuh |
| Basis | `main` @ `6a064ea585321440d0cf71812465419495f230a8` (merge PR #30), branch `feat/wa2a-g-api` |
| **HEAD kode yang diuji** | `4d6f99528a1ef3a7f1f98808333df8f3a3f9288f` |
| Commit sesudah HEAD uji | Hanya dokumentasi: berkas ini dan `docs/TAH-CURRENT-CHECKPOINT.md` (diverifikasi `git diff --name-only 4d6f995 HEAD`, dicatat di PR) |
| Cakupan | Read service + 10 berkas route (11 metode-path) di `/api/automation/client-messages` di atas service F3/F4. Berhenti di **APPROVED**; tidak ada Send |
| Produksi | Tidak disentuh. Mode produksi hanya diuji **lokal** (`next start` loopback, DB sekali pakai) |

## 1. Berkas (17 berkas kode/uji + 2 dokumen = 19 path disetujui)

| Berkas | Jenis | Isi |
|---|---|---|
| `src/services/whatsapp/wa-message-read.service.ts` | Baru | `daftarPesanKlien`, `detailPesanKlien`, `riwayatPesanKlien`, `kandidatSinyalPesanKlien`, `kandidatKontakPesanKlien` |
| `src/services/whatsapp/wa2-access.ts` | Baru | `bolehAksesWa2(ctx)` — boolean di atas `gerbangWa2`; belum dipakai halaman (UI belum dibuka) |
| `src/app/api/automation/client-messages/route.ts` | Baru | GET daftar, POST draft/revisi |
| `…/candidates/signals/route.ts`, `…/candidates/contacts/route.ts` | Baru | GET kandidat sinyal & kontak |
| `…/[id]/route.ts`, `…/[id]/history/route.ts` | Baru | GET detail, GET riwayat |
| `…/[id]/preview`, `…/[id]/request-approval`, `…/[id]/cancel` (`route.ts`) | Baru | POST pratinjau, minta approval, batal |
| `…/approvals/[id]/approve`, `…/approvals/[id]/reject` (`route.ts`) | Baru | POST setujui, tolak |
| `prisma/check-wa2a-g-static.mjs` | Baru | Uji statis + murni |
| `prisma/check-wa2a-g-api.mjs` | Baru | Uji HTTP `next dev` + PostgreSQL sekali pakai; mode `flag-mati` |
| `prisma/check-wa2a-g-prod.mjs` | Baru | Uji HTTP `next start` produksi lokal, flag sengaja `true` |
| `prisma/wa2a-lingkup-manifest.json` | Ubah | X-1: `i1.diizinkan` = 10 route; `faseAktif.G` = 19 path + jangkar; tuple `check-wa2a-lingkup.mjs` |
| `prisma/check-wa2a-lingkup.mjs` | Ubah | Adaptasi uji helper (§5) |
| `docs/whatsapp/WA-2a-G-EVIDENCE.md`, `docs/TAH-CURRENT-CHECKPOINT.md` | Baru / ubah | Dokumentasi |

**Tidak berubah** (diperiksa P-global + I-2 pada HEAD uji): helper `prisma/wa2a-lingkup.mjs`, enam skrip fase lama, 15 berkas beku I-2, service F3/F4, `wa1-bridge.ts`, `wa2-gate.ts`, WA-1 (`src/services/communication/**`), TAH, V3, schema, migrasi, `package.json`/lockfile, halaman/komponen/Sidebar.

## 2. Kontrak yang diterapkan (preflight §6)

- **Sesi → konteks.** `withTenant` mengambil tenant/user/peran dari sesi server. `tenantId`/`userId`/`role` di body diabaikan (diuji: pesan tetap milik tenant sesi, pembuat = pengguna sesi).
- **Gerbang sebelum body.** Setiap POST: `gerbangWa2(ctx)` adalah pernyataan pertama, lalu `jsonBodyKetat` (CSRF Origin/Sec-Fetch-Site, `application/json`, ≤ 16 KiB, objek). GET tanpa pembacaan body; layanan baca memanggil `gerbangWa2` sebagai pernyataan pertama tiap ekspor.
- **Urutan pagar:** tanpa sesi 401 → tenant di luar allowlist Automation 404 → peran selain ADMIN/MANAJER_OPERASI 403 → konteks sistem 403 → produksi 403 `WA2_ENV_NOT_ALLOWED` → flag ≠ `"true"` 403 `WA2_DISABLED`.
- **Hasil service apa adanya.** Respons POST = `{ ok: true, ...hasil }` dengan field `hasil` dari service F3/F4 (`DRAFT_DIBUAT`, `SUDAH_ADA`, `DIPRATINJAU`, `DITOLAK`, `DITAHAN`, `DIBLOKIR`, `APPROVAL_DIMINTA`, `DISETUJUI`, `DITOLAK_PEMUTUS`, `SUDAH_DIPUTUSKAN`, `KEDALUWARSA`, `DIBATALKAN`, `SUDAH_DIBATALKAN`). Penolakan bisnis = 200 + `hasil`; galat = `toResponse` (400/401/403/404/409 + `details.code`).
- **Maker-checker ditegakkan server** (service F4); `aksiTersedia` di detail hanya petunjuk.
- **Field allowlist (§6.7).** Kunci tingkat atas daftar, detail, approval, dan riwayat dikunci uji. Nomor selalu `samarkanNomor`. Tidak ada `logicalMessageKey`, `activeKey`, `successKey`, `sourceFingerprint`, `consentStateVersion`, grant, ID pencatat bukti, `oldValue`/`newValue` mentah.
- **Route tidak menyentuh model WA-2a** (hanya service). Tidak ada impor Prisma/`forTenant`/`process.env`/TAH/WA-1 di route.
- **APPROVED tetap dapat dibatalkan** (staf: `cancel`; sistem: hold consent/kontak/grant F4).

**Penyimpangan yang diperbaiki sebelum bukti:** versi awal detail mengembalikan `contactId`, yang tidak ada di allowlist §6.7. Dihapus (commit `4d6f995`). Akibatnya UI kelak tidak bisa membuat revisi langsung dari detail tanpa memilih kontak lagi lewat endpoint kandidat kontak — keputusan owner untuk tahap UI (§8).

## 3. Lingkungan uji

| Item | Nilai |
|---|---|
| Clone | `git clone --shared` sekali pakai; ref `origin/main` di-fetch dari repo kerja lalu `origin/main` dan `main` di-set ke `6a064ea` **di clone saja**; checkout detached `4d6f995`; HEAD diverifikasi sebelum suite; `node_modules` symlink ter-ignore. Ref repo kerja tidak dipindahkan |
| Tree | Bersih sebelum dan sesudah suite statis/DB dan sesudah suite HTTP (`git status --porcelain --untracked-files=all` = 0) |
| DB | PostgreSQL 16 loopback `127.0.0.1:55432`, klaster sekali pakai baru (`initdb`), `prisma migrate deploy` atas migrasi yang sudah ada. Tidak ada berkas schema/migrasi dibuat/diubah. Data sintetis bertanda (`WA2G-`, `WA2GP-`, nomor pola `+62996…`), dibersihkan di akhir tiap uji |
| Server | `next dev` (3200/3100) dan `next build` + `next start` (3300), semua `-H 127.0.0.1`, `NODE_OPTIONS=--import prisma/wa1-egress-trap.mjs`, `NEXT_TELEMETRY_DISABLED=1`, `NEXTAUTH_SECRET` acak sekali pakai |
| Mode bukti | Suite gate dijalankan dengan `WA2A_FASE=G WA2A_BUKTI=1` |

Baris bukti yang dicetak helper: `HEAD=4d6f99528a1ef3a7f1f98808333df8f3a3f9288f basis=6a064ea585321440d0cf71812465419495f230a8 origin/main=6a064ea585321440d0cf71812465419495f230a8 helper=0b12116a… manifest=a7adf0d2…`.

## 4. Hasil pada HEAD `4d6f995`

### 4.1 Uji baru 2a-G

| Uji | Hasil | Exit |
|---|---|---|
| `check-wa2a-g-static.mjs` (statis + murni, `WA2A_FASE=G WA2A_BUKTI=1`) | **128/0** | 0 |
| `check-wa2a-g-api.mjs` — `next dev`, flag aktif | **92/0** | 0 |
| `check-wa2a-g-api.mjs` — `next dev`, `WA2_CLIENT_FOUNDATION_ENABLED=false` (`WA2G_API_MODE=flag-mati`) | **22/0** | 0 |
| `check-wa2a-g-prod.mjs` — `next start` produksi lokal, flag `true` | **20/0** | 0 |
| Helper gate `check-wa2a-lingkup.mjs` (adaptasi) | **66/0** | 0 |

### 4.2 Regresi

| Uji | Hasil | Exit |
|---|---|---|
| F1 `check-wa2a-message-policy` / F2 `check-wa2a-template` | 102/0 · 63/0 | 0 · 0 |
| F3 `check-wa2a-message-f3` / `-db` | 68/0 · 72/0 | 0 · 0 |
| F4 `check-wa2a-approval-f4` / `-db` | 72/0 · 121/0 | 0 · 0 |
| 2B `check-wa2a-schema` statis / dengan DB | 32/0 (DB dilewati) · **130/0** | 3 (DILEWATI, sesuai rancangan) · 0 |
| 2C `check-wa2a-contact` / `-db` | 39/0 · 67/0 | 0 · 0 |
| 2E `check-wa2a-access` / `-db` | 38/0 · 68/0 | 0 · 0 |
| WA-1 `check-comm-policy` / `check-comm-schema` | 326/0 · 85/0 | 0 · 0 |
| WA-1 DB prepare / read / approval / cancel / send | 98/0 · 42/0 · 95/0 · 73/0 · 119/0 | 0 |
| WA-1 HTTP `check-comm-api` / `check-comm-e2e` (server `next dev` terpisah, konfigurasi WA-1) | 43/0 · 108/0 | 0 · 0 |
| TAH `check-tah-policy` / `check-tah-ledger` | 322/0 · 98/0 | 0 · 0 |
| Validator V3 `check-validator-v3` | 226/0 | 0 |
| Automation `check-automation-policy` / intake `check-intake-policy` | 124/0 · 417/0 | 0 · 0 |
| `check-tenant-guard` | 17/0 (dengan dua tenant sintetis sementara; tanpa DB runner pertama gagal karena `DATABASE_URL` tidak diset — kesalahan runner, bukan kode) | 0 |
| `check-validator-remediasi` | **61/9** — baseline historis; daftar 9 kegagalan **identik** dengan `6a064ea` (dijalankan di clone yang sama) | 1 |
| `tsc --noEmit` / `next lint` | bersih / bersih (1 warning lama `ReceiptForm.tsx`, di luar scope) | 0 · 0 |
| `next build` (dengan perangkap egress) | sukses; 10 route muncul sebagai `ƒ` dinamis; `BLOCKED` = 0 | 0 |

Pesan `ConnectorError … P0001` di keluaran WA-1 DB berasal dari trigger gagal-audit yang sengaja dipasang uji tersebut (uji rollback); suite tetap lulus.

### 4.3 Egress

`TRAP-AKTIF` tercatat di log tiap server (dev aktif, dev flag-mati, dev WA-1, prod). Baris `[WA1-EGRESS] BLOCKED`: **0** di keempat log dan di `next build`. Proses uji sendiri membatasi `fetch` ke origin server loopback: 0 percobaan keluar. Tidak ada host provider WhatsApp/LLM maupun nomor utuh di log server.

## 5. Adaptasi uji helper gate (`check-wa2a-lingkup.mjs`)

- Asersi lama "perujuk = daftar manifest (kosong)" diganti dua asersi independen: (a) hasil pemindai nyata = **PERSIS** 10 route literal di skrip; (b) manifest `i1.diizinkan`/`faseAktif` = literal 10 route / 19 path / 2 jangkar.
- Skenario yang berasumsi pemindai hanya menemukan route fixture (P-07, P-10, N-24, N-25a, N-25b, P-11, P-13) kini membandingkan dengan **10 route literal + perubahan fixture skenario**. Harapan tidak diturunkan dari keluaran pemindai.
- Skenario route liar, siklus, urutan impor, path literal `[id]`, dan tuple tetap ada.
- Perubahan skrip ini dilindungi tuple `{basis 6a064ea…, path prisma/check-wa2a-lingkup.mjs, blob 6bd86699…}`; helper `wa2a-lingkup.mjs` tidak diubah (blob `0b12116a…`).
- **Catatan jujur:** putaran bukti pertama (HEAD `55c793e`) gagal 3 skenario (N-25a, P-11, P-13) yang terlewat pada adaptasi awal. Hasil HEAD itu dibuang; perbaikan di `e29761b`.

## 6. Demo HTTP sintetis (cuplikan keluaran `check-wa2a-g-api.mjs`, HEAD `4d6f995`)

Peran: pembuat draft = ADMIN; pencatat konfirmasi ETA = MANAJER_OPERASI; pemberi pratinjau & peminta approval = ADMIN kedua; checker = MANAJER_OPERASI lain.

```
POST draft tanpa Origin / Origin asing / Sec-Fetch-Site cross-site → 403
POST draft text/plain / array / JSON rusak / > 16 KiB / signalId bukan string → 400   (0 baris baru)
POST draft → 200 DRAFT_DIBUAT (revision 1)      · ulang → SUDAH_ADA (pesan sama)
GET detail DRAFT → aksi PRATINJAU,BATALKAN,BUAT_REVISI · label "BELUM DIKIRIM …" · freshness LOLOS (D6A_KONFIRMASI_STAF)
POST preview sidik salah → 200 DITOLAK/SNAPSHOT_MISMATCH · request atas DRAFT → 200 DITOLAK/MESSAGE_STATE_INVALID
POST preview → 200 DIPRATINJAU · ulang → 200 DITOLAK/MESSAGE_STATE_INVALID (tanpa mutasi)
POST request-approval → 200 APPROVAL_DIMINTA (expiresAt ≈ 2 jam) · ulang → SUDAH_ADA
POST approve/reject oleh pembuat → 403 CHECKER_IS_MAKER · peminta → 403 SELF_APPROVAL_FORBIDDEN
                     pencatat ETA → 403 CHECKER_IS_EVIDENCE_RECORDER · OPERATOR → 403 · tenant B/C → 404
POST approve hash tak dilihat → 200 DITOLAK/PROPOSAL_HASH_MISMATCH   (semua penolakan: versi approval tetap)
POST approve (checker) → 200 DISETUJUI · approval APPROVED/NOT_STARTED · successKey kosong · ulang → SUDAH_DIPUTUSKAN
GET detail APPROVED → aksi BATALKAN,BUAT_REVISI (tanpa aksi kirim)
GET history → WA2_DRAFT_DIBUAT … WA2_APPROVAL_DIMINTA, WA2_APPROVAL_DISETUJUI, WA2_PESAN_DISETUJUI · paginasi take=1
POST cancel APPROVED → 200 DIBATALKAN (approvalDihentikan) · ulang → SUDAH_DIBATALKAN
```

Cabang lain yang diuji lewat HTTP: tolak (catatan wajib 3–1000 → 400 `DECISION_NOTE_INVALID`; `DITOLAK_PEMUTUS`; batal atas REJECTED → `DITOLAK`); revisi setelah bukti berubah (`DRAFT_DIBUAT` revision 2, `revisiDigantikan` = pesan lama, lama CANCELED + approval SUPERSEDED); kedaluwarsa (`expiresAt` dimundurkan di DB uji → aksi SETUJUI hilang, `KEDALUWARSA`, EXPIRED); konfirmasi diinvalidasi → `DITAHAN`, NEEDS_REVIEW; opt-out atas PENDING → NEEDS_REVIEW + approval CANCELLED, keputusan berikutnya `SUDAH_DIPUTUSKAN`, lalu batal; opt-out atas APPROVED → NEEDS_REVIEW + eksekusi CANCELLED; kandidat sinyal/kontak (kontak tanpa opt-in `CONSENT_NOT_GRANTED`, draft ke kontak itu ditolak 400); validasi query (`state`, `take` 0/51/−1/1,5/teks, kursor asing 404, id > 64 400); 154 respons mode aktif (dan 60 respons produksi) dipindai tanpa nomor utuh dan tanpa kunci internal; tidak ada endpoint Send (`POST :id/send` → 404/405).

**Konkurensi:** 4 putaran approve ∥ reject → tepat satu keputusan final, sisanya `SUDAH_DIPUTUSKAN`/409, tanpa 500. Pada keempat putaran pemenangnya **tolak** (approve melakukan revalidasi lebih panjang); urutan sebaliknya tidak teramati lewat HTTP — dicakup uji DB F4. 3 putaran tiga POST draft bersamaan → tepat 1 baris dan 1 `DRAFT_DIBUAT`.

**Flag mati** (server `WA2_CLIENT_FOUNDATION_ENABLED=false`): 11 endpoint → 403 `WA2_DISABLED`, termasuk dengan text/plain, tanpa Origin, Origin asing, > 16 KiB, JSON rusak; tanpa sesi 401; tenant di luar allowlist 404; potret DB (pesan, approval, audit, kontak, consent, konfirmasi) identik.

**Produksi lokal** (`next start`, NODE_ENV=production, flag `true`): 11 endpoint dengan body sah → 403 `WA2_ENV_NOT_ALLOWED`; 6 POST × 8 variasi CSRF/body rusak = 48 permintaan → semuanya 403 `WA2_ENV_NOT_ALLOWED` (bukan galat CSRF/body); potret DB (+ sinyal) identik; pesan fixture tetap PENDING_APPROVAL.

## 7. Uji mutasi (clone terpisah, dikembalikan sesudahnya)

| Mutasi | Tertangkap oleh |
|---|---|
| `preview`: `jsonBodyKetat` dipindah sebelum `gerbangWa2` | statis (2 asersi); **HTTP produksi**: build termutasi → `check-wa2a-g-prod` 19/1 (preview tanpa Origin → "Asal permintaan tidak sah" alih-alih `WA2_ENV_NOT_ALLOWED`) |
| Route ke-11 `client-messages/export` yang merujuk layanan baca | statis (3), helper "I-1 repo nyata" (1), F4 (P-fase G + I-1) |
| Halaman `src/app/automation/pesan-klien/page.tsx` merujuk `wa2-access` | statis (P-fase G + I-1), helper (1) |
| Detail tanpa `samarkanNomor` + `activeKey` dipilih (iterasi lokal) | statis (2) |

## 8. Keterbatasan dan keputusan owner yang tersisa

- **Merge PR API** — keputusan owner terpisah.
- **UI 2a-G** belum dimulai. `contactId` tidak ada di detail (allowlist §6.7); revisi dari layar detail perlu kontak dipilih ulang lewat `candidates/contacts`, atau owner menambah `contactId` ke allowlist.
- **Uji HTTP berjalan di `next dev`** untuk alur bisnis; produksi lokal hanya membuktikan penolakan. Tidak ada CI/check-run di repo ini; tidak ada klaim "CI hijau".
- **Kandidat sinyal** memindai ≤ 250 sinyal terbaru (take × 5) lalu menyaring; sinyal layak yang lebih tua dari jendela itu tidak tampil (hanya petunjuk; draft tetap menilai). Tanpa indeks/migrasi baru.
- **Kandidat kontak** menilai ≤ 200 kontak ACTIVE per permintaan.
- **Entri manifest H untuk PR #29/#30/2a-G** belum ditambahkan (tidak ada di 19 path); dicatat untuk PR kode berikutnya bila diperlukan.
- `check-validator-remediasi` 61/9 tetap baseline historis; tidak diperbaiki.
- `wa2-access.ts` belum punya pemakai (disiapkan untuk halaman server di tahap UI).
- Tidak ada deploy, aktivasi flag di lingkungan nyata, akses DB nyata, Send, provider, webhook, LLM, atau auto-reply.
