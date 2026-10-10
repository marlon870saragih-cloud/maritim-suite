# TAH / Maritim Suite — Current Checkpoint (CANONICAL)

> **SESSION START RULE**
> Every new TAH / Maritim Automation / WhatsApp Automation session MUST first read this file
> (`docs/TAH-CURRENT-CHECKPOINT.md`) and continue from **NEXT EXACT STEP** (§L).
> DO NOT perform a recovery audit from zero unless:
> - this checkpoint explicitly says UNVERIFIED for the state you depend on,
> - repository state materially changed without a checkpoint update,
> - production state materially changed,
> - or the owner explicitly requests a new audit.

> **SESSION END RULE**
> Before ending every development session, update this checkpoint with:
> - date/time
> - branch
> - HEAD SHA
> - working tree state
> - completed step
> - tests/results
> - production state if changed
> - known blockers
> - NEXT EXACT STEP
>
> This checkpoint is the canonical handoff between the owner, ChatGPT, Claude Code, and future sessions.

**Checkpoint resmi:** 2026-10-05 — TAH / Maritim Suite → WhatsApp Automation handoff.
**Pembaruan terakhir:** 2026-10-10 — **WA-1 ACCEPTED** — Step 2J (E2E Validation & Demo) MERGED (PR #17; checkpoint 2F–2I PR #16; `main` @ `be912290c9e8ce5b5445312190ac771a4a56cb87`) dan **OWNER ACCEPTANCE: APPROVED — 10 Oktober 2026** (demo langsung di Chrome laptop owner). WA-1 memenuhi gate PRD §18 sebagai proof-of-flow **FAKE-only, non-produksi**. Tidak dideploy. SG-05 masih **TERBUKA**. NEXT EXACT STEP = keputusan owner tentang fase berikutnya (§L); WA-2 **belum dimulai**.
**Status pekerjaan:** TAH / PRD-005 **CLOSED**. Pekerjaan produk berikutnya: **Client Communication / WhatsApp Automation**.
**Dokumen pendamping:** `docs/whatsapp/PRD-WA-1.md` (**baseline WA-1 v0.2 — source of truth WhatsApp Automation**), `docs/PRD-005-CLOSURE.md`, `docs/PRODUCTION-STATE-2026-09-30.md`, `docs/TAH-TECH-DEBT.md`,
`docs/TAH-GAP-ANALYSIS-2026-09-30.md` (saat ini hanya di branch `docs/tah-gap-analysis-20260930`, belum di `main`).

**Label bukti:**
- **VERIFIED (tanggal)** — dibaca langsung oleh sesi yang menulis entri.
- **OWNER-VERIFIED (tanggal)** — dijalankan/diamati owner di produksi dan dilaporkan; output mentah tidak ditinjau sesi penulis.
- **HISTORICAL (tanggal)** — benar pada tanggal itu; belum diperiksa ulang.
- **UNVERIFIED** — belum ada bukti.

Repo ini PUBLIK: jangan mencatat credential, nilai env rahasia, ID proyek GCP, IP, atau data klien.

---

## A. OWNER DECISIONS (berlaku sampai diubah owner)

| ID | Keputusan | Tanggal |
|---|---|---|
| OD-1 | Produksi resmi = GCP Compute Engine. Railway ditinggalkan (diputus & di-uninstall dari GitHub). Vercel App di-uninstall dari GitHub. | 2026-09-27 / 2026-09-30 |
| OD-2 | **TAH / PRD-005 CLOSED.** Jangan membuka kembali PRD-005 atau menjalankan siklus evaluasi baru kecuali owner memerintahkan secara eksplisit. Validator V3 FINAL (`ac6460c`) tidak diubah; tidak ada Blind-C/Eval-9. | 2026-09-29 / 2026-10-05 |
| OD-3 | **Pekerjaan produk berikutnya = Client Communication / WhatsApp Automation.** | 2026-10-05 |
| OD-4 | **Arah model TAH ke depan = `anthropic/claude-sonnet-5`.** Ini arah, BUKAN promosi teknis (lihat §I). | 2026-10-05 |
| OD-5 | Reminders produksi tetap ENABLED (D-2). | 2026-09-30 |
| OD-6 | Tenant uji/duplikat di produksi = HOLD, tidak diubah (D-1). | 2026-09-30 |
| OD-7 | Penyelarasan GitHub terpisah dari deploy produksi (D-3). Merge, deploy, aktivasi fitur, dan promosi model = langkah terpisah, masing-masing dengan persetujuan owner. | 2026-09-30 |
| OD-8 | `origin/main` di GitHub = source of truth kode. Jangan melanjutkan dari folder/arsip/checkout lama. Jangan menyimpulkan `main` == produksi. | 2026-10-05 |
| OD-9 | File ini = canonical checkpoint. | 2026-10-05 |
| OD-10 | **PRD WA-1 v0.2 OWNER APPROVED + FROZEN** sebagai baseline (`docs/whatsapp/PRD-WA-1.md`). Persetujuan baseline tidak mengotorisasi implementasi. | 2026-10-05 |
| OD-11 | **P-04 / D-12:** proof-of-flow `INTERNAL_FAKE_TEST` hanya non-production/local-dev; tidak ada pengecualian untuk VM produksi; staging penuh tidak dibangun di WA-1. | 2026-10-05 |
| OD-12 | **P-08 / D-13:** `OPEN` → boleh Prepare; `ACKNOWLEDGED` → boleh Prepare; `DISMISSED` → tidak boleh; `EXPIRED` → tidak boleh. ACK bukan approval; komunikasi eksternal tetap butuh human approval terpisah. | 2026-10-05 |
| OD-14 | **OWNER ACCEPTANCE WA-1: APPROVED.** Owner menjalankan demo langsung (Google Chrome, laptop owner, DB lokal sintetis) dan menerima: menu Komunikasi (Simulasi), Siapkan Update Klien dari event kapal, preview ID, preview EN, approval, FAKE Send, riwayat audit. Penerimaan berlaku untuk proof-of-flow **FAKE-only non-produksi**; bukan izin deploy, WA-2, atau pengiriman WhatsApp nyata. | 2026-10-10 |
| OD-13 | **D-14:** `VoyageEvent.occurredAt` di masa depan diblokir; timezone pelabuhan wajib valid; revalidasi sumber sebelum Prepare dan Send; sumber deleted/superseded tidak dikirim; `dataOrigin` bukan penanda data uji yang andal. | 2026-10-05 |

## B. DEVELOPMENT / GITHUB REALITY — VERIFIED 2026-10-05

| Item | Nilai |
|---|---|
| Repository | `marlon870saragih-cloud/maritim-suite` (public) |
| `origin/main` | `be912290c9e8ce5b5445312190ac771a4a56cb87` — merge commit PR #17 (WA-1 Step 2J; parent `543be91` + `807ec82`), 2026-10-10 — VERIFIED 2026-10-10 |
| PR #16–#17 | MERGED 2026-10-10 (merge commit biasa): #16 checkpoint Step 2F–2I (`543be91`); #17 Step 2J E2E Validation & Demo — pengujian, perangkap egress, seed demo, bukti & 12 tangkapan layar (`be91229`). Tanpa perubahan `src/`, schema, migrasi, PRD, V3 — VERIFIED 2026-10-10 |
| PR #11–#15 | MERGED (merge commit biasa): #11 checkpoint Step 2E (`5e70451`, 2026-10-09); #12 Step 2F Cancel (`30a686c`, 2026-10-09); #13 Step 2G Read service & Communication History (`f3a372a`, 2026-10-09); #14 Step 2H API `/api/automation/communications` + pengerasan CSRF `48b9be1` (`f97c94e`, 2026-10-10); #15 Step 2I UI Komunikasi (Simulasi) `0553db7` + pemisahan guard sidik jari Intake `a4045a0` (`d4a3e71`, 2026-10-10). Tanpa schema/migrasi baru sejak 2B/Q8 — VERIFIED 2026-10-10 |
| PR #5–#9 | MERGED 2026-10-05: #5 checkpoint (`ebe86eb`), #6 Step 2A (`5a0673f`), #7 Step 2B (`334052f`), #8 Step 2C (`a1692e0`), #9 Step 2D R1 (`03a1dc9`) — VERIFIED 2026-10-09 (merge commit ada di `main`) |
| PR #10 | MERGED 2026-10-09 (`8ebd546`, merge commit biasa): WA-1 Step 2E — `efb4e78` implementasi + `60d9dca` perbaikan review (balapan Send vs Prepare → `kunciCandidate`; batas ≤ 5 attempt lewat `bolehUlangiEksekusi` beku). 9 berkas; tanpa schema/migrasi; berkas beku V3 utuh — VERIFIED 2026-10-09 |
| PR #3 | MERGED 2026-10-05 (`dd1b330`) — canonical checkpoint ini |
| PR #4 | MERGED 2026-10-05 (`1e81bd8`; parent `dd1b330` + `c041350`) — `docs/whatsapp/PRD-WA-1.md` baseline v0.2; documentation only |
| PR #2 | CLOSED tanpa merge (branch `docs/tah-gap-analysis-20260930` dipertahankan sebagai referensi historis) |
| PR #1 | MERGED (merge commit; parent `958c15a` + `7127d99`); PRD-002..005 ada di `main` |
| `feat/prd002-step2-domain-foundation` | `7127d991f8487bfc9f096d22182f4c1c578a9e87`, sepenuhnya termasuk di `main`; belum dihapus |
| `docs/tah-gap-analysis-20260930` | `139006d` — hanya dokumen, belum di-merge. File ini menggantikan versi checkpoint di branch tersebut; gap analysis-nya tetap rujukan perencanaan |
| CI | Tidak ada (0 workflow). Tidak ada integrasi deploy otomatis di GitHub (webhook & deploy key kosong; GitHub App terpasang hanya Claude) |
| Test WA-1 terakhir yang benar-benar dijalankan | 2026-10-10 (Step 2J) pada `807ec82` (= tree `be91229` minus berkas checkpoint), PostgreSQL 16 loopback sekali pakai + server lokal dengan perangkap egress `prisma/wa1-egress-trap.mjs`: **comm-e2e 108/108** (12 alur pilot × ID/EN, body byte-per-byte vs PRD §11), **comm-e2e mode produksi 5/5** (`next start` lokal → `ENV_NOT_ALLOWED`, 0 baris), comm-ui Playwright 55/55, comm-api 43/43, comm-policy 326, comm-schema 85, comm-prepare-db 98, comm-approval-db 95, comm-send-db 118–121 (cek 52b dinamis; selalu 0 gagal), comm-cancel-db 73, comm-read-db 42, tah-policy 322, tah-ledger 98, validator-v3 226, eval8-runner 62, eval4-prep 109, ais-contract 129, automation-policy 124, intake-policy 417; tsc & eslint bersih; next lint hanya warning lama `ReceiptForm.tsx`. Matriks TS-01..18 & AC-01..18 PASS (`docs/whatsapp/WA-1-STEP2J-EVIDENCE.md`). Uji mutasi E2E (template, panggilan Graph API) tertangkap. **Kegagalan historis:** `check-validator-remediasi` 61/70 — identik di baseline (skrip pra-V3), bukan regresi; tidak diubah (isu terpisah, keputusan owner tertunda) |
| Test penuh terakhir (seluruh repo) | 2026-09-30 pada `f7635a2` (kode identik dengan `main`): tsc/lint/build hijau; 21/21 migrasi dari nol (PostgreSQL 16); suite offline & DB hijau. Merah yang diharapkan: `check-eval8-runner` E1c, `check-validator-remediasi` 61/70 |
| Checkout lain milik owner | Checkout laptop lama (HEAD `28b0ef9`, enam file untracked termasuk `_wipe.mjs`) — HISTORICAL 2026-09-30. Jangan dijadikan basis kerja; jangan jalankan script untracked tanpa dibaca |

## C. PRODUCTION / GCP REALITY — OWNER-VERIFIED 2026-10-05

### GCP
| Item | Nilai |
|---|---|
| VM | `tribuana-vm`, zone `asia-southeast2-a`, **RUNNING**, `e2-medium` |
| Disk | 30 GB |
| Billing | `billingEnabled=true`. Status trial vs paid: **UNVERIFIED** (`billingEnabled` hanya membuktikan akun billing tertaut) |

### Maritim Suite
| Item | Nilai |
|---|---|
| Proses | PM2 `maritime-suite` **online**; Node 22.23.2; port 3001 aktif |
| Path aplikasi | `/home/LENOVO/maritime-suite` |
| Reverse proxy | nginx **active**; `https://maritim.tribuanagency.com/login` → **HTTP 200** |
| Jenis deploy | Build hasil deploy (arsip), **bukan git checkout** |

### Kode produksi
| Item | Nilai |
|---|---|
| Build | 27 Sep 2026 |
| Fingerprint | **Cocok dengan rilis historis `ac922f6`** pada file pembeda (`intake-policy.ts`, `model-capabilities.ts`, `package.json`); `maritim-lexicon-v2.ts` & `-v3.ts` **tidak ada** → **Validator V3 tidak ada di produksi** |
| Terhadap GitHub | Produksi **tidak identik** dengan `main`: 16 commit di belakang `main` (selisih berisi 0 migrasi — VERIFIED via git). **Jangan menyimpulkan GitHub `main` == produksi.** |

### Konfigurasi produksi (nilai rahasia hanya PRESENT/ABSENT)
| Kunci | Nilai |
|---|---|
| `AUTOMATION_MONITORING_ENABLED` | `true` |
| `AUTOMATION_TENANT_IDS` | PRESENT (1 tenant) |
| `OPENROUTER_SPK_MODEL` | `anthropic/claude-sonnet-4.5` |
| `TAH_INTAKE_MODEL` | ABSENT |
| `TAH_CORE_ENABLED` | ABSENT |
| `VESSEL_CALL_INTAKE_ENABLED` | ABSENT |
| `OPENROUTER_API_KEY` | PRESENT |
| `DATABASE_URL` | PRESENT |

**TAH Intake tidak terbukti aktif di produksi.** Jangan membuka kembali TAH hanya karena hal ini; pekerjaan pengembangan TAH/PRD-005 sudah CLOSED.

### Scheduler (systemd)
- `maritime-monitoring.timer` → `maritime-monitoring.service` → `/usr/local/sbin/maritime-job-run voyage-monitoring`; terobservasi berjalan kira-kira tiap jam.
- Service bertipe `Type=oneshot`: status `inactive (dead)` sesudah eksekusi sukses adalah **NORMAL**.
- Juga terpasang (HISTORICAL 2026-09-30): `maritime-reminders.timer` (enabled, tiap jam), `pg-backup.timer` (harian). `maritime-ais-poll.timer` tidak terpasang. Tidak ada mekanisme deploy otomatis di VM (tanpa cron/timer deploy/repo git).

### Belum diverifikasi pada 2026-10-05
- Log aplikasi produksi — **UNVERIFIED**.
- Layanan lain di VM yang sama — **UNVERIFIED** (HISTORICAL 2026-09-30: `galangan-app`, `nouvo-api`, `ankor-app` di PM2, MariaDB, uvicorn, next-server lain). Tindakan pada VM berpotensi memengaruhi layanan tersebut.
- Eksposur jaringan (app mendengarkan di semua antarmuka; aturan firewall GCP & upstream nginx) — **UNVERIFIED**.

## D. VOYAGE MONITORING — PRODUCTION E2E VERIFIED (OWNER-VERIFIED 2026-10-05)

**Data uji:** voyage `VYG-2026-000003`, kapal MT DS Grace, pelabuhan Balikpapan, agency type full, tujuan: uji otomasi produksi.

**Hasil:**
1. Voyage uji berhasil dibuat.
2. Voyage langsung muncul di Automation Hub.
3. Monitoring berhasil diaktifkan; Monitored Voyages berubah 0 → 1.
4. Pemanggilan manual `sudo systemctl start maritime-monitoring.service` selesai SUCCESS; `voyage-monitoring` mengembalikan HTTP 200 / gagal 0.
5. Baseline awal: status voyage PLANNED, Health = Healthy, last successful check tercatat.
6. Status voyage dinaikkan manual PLANNED → CONFIRMED.
7. Run monitoring berikutnya mendeteksi perubahan dan membuat satu sinyal **INFO — Status changed**:
   "Status voyage VYG-2026-000003 berubah dari PLANNED menjadi CONFIRMED." Sumber sinyal: `AUDIT_LOG`.
8. Sinyal muncul di Automation Hub → Alerts.
9. Alur Human Review terverifikasi: admin meng-acknowledge sinyal dengan catatan
   "Test automation - status change verified by admin".
10. Sinyal tersimpan pada State=All sebagai **Acknowledged**; reviewer dan timestamp review tersimpan.

**VERDICT: VOYAGE MONITORING PRODUCTION E2E = VERIFIED.**

Alur yang terverifikasi:

Voyage operational change → Audit Log → scheduled Voyage Monitoring → Signal / Alert → Human Review → Acknowledge → persistent Audit Trail

Jangan membangun ulang atau mengaudit ulang alur ini dari nol pada sesi berikutnya kecuali ada bukti regresi.

Catatan: voyage uji `VYG-2026-000003` beserta sinyalnya **masih ada di database produksi** (data uji, bukan data operasional). Pembersihan = keputusan owner terpisah.

## E. DATABASE REALITY

| Item | Nilai | Label |
|---|---|---|
| Engine | PostgreSQL 16 lokal di VM, DB `maritime_suite` | HISTORICAL 2026-09-30 |
| Migrasi | 21 diterapkan, 0 gagal (termasuk 7 migrasi PRD-002..005) | HISTORICAL 2026-09-30; 2026-10-05 **UNVERIFIED** |
| Tabel TAH/PRD | 11/11 ada | HISTORICAL 2026-09-30 |
| `AgentRun` / `AgentModelCall` / `TahApprovalRequest` | 0 / 0 / 0 | HISTORICAL 2026-09-30; 2026-10-05 **UNVERIFIED** |
| `MonitoredVoyage` | ≥ 1 (voyage uji) | OWNER-VERIFIED 2026-10-05 (via UI) |
| `MonitoringSignal` | ≥ 1 (sinyal uji, Acknowledged) | OWNER-VERIFIED 2026-10-05 (via UI) |
| `VesselCallIntake` | 1 (REJECTED, 2026-09-19, extractor v1) | HISTORICAL 2026-09-30 |
| Lampiran | 0 dipurge; 7 kandidat (soft-deleted > 30 hari); tidak ada penjadwal purge | HISTORICAL 2026-09-30 |

## F. COMPLETED

- PRD-002: identitas kapal/MMSI, voyage multi-kapal, waktu bisnis WITA, job pengingat, pelaporan backup, unit systemd, monitoring voyage internal.
- PRD-003: framework polling AIS (adapter NONE/FAKE).
- PRD-004: Vessel Call Intake (fitur mati di produksi), retensi lampiran.
- PRD-005 (**CLOSED**): ledger `AgentRun`/`AgentModelCall`, skema & kebijakan `TahApprovalRequest`, registri model gagal-tertutup, Validator V3 FINAL, harness Eval-1..8.
  Blind-B offline jawaban sempurna 64/80 (80% < target 90%); safety gates toleransi-nol PASS. Angka tersebut bukan akurasi model live.
- Penyelarasan GitHub: PR #1 merged; koreksi dokumen keadaan produksi (`7127d99`).
- Audit merge-safety 2c/2d/2e PASS (2026-09-30); Railway & Vercel di-uninstall dari GitHub.
- Gap analysis operasional (2026-09-30; gap kode diverifikasi ulang terhadap `main` pada 2026-10-05: masih ada).
- **Voyage Monitoring production E2E VERIFIED (2026-10-05)** — lihat §D.
- **WA-0 architecture / read-only audit: COMPLETE (2026-10-05).**
- **PRD WA-1 v0.2: OWNER APPROVED + FROZEN (2026-10-05)** — `docs/whatsapp/PRD-WA-1.md`, PR #4 merged.
- **WA-1 Step 2A–2D MERGED (2026-10-05)** — 2A kebijakan murni + 8 template + fixture TEST_FIXTURE (PR #6); 2B schema `CommunicationCandidate/Message/Attempt` (PR #7); 2C Prepare/candidate/preview (PR #8); 2D approval `WA_INTERNAL_FAKE_TEST` via definisi terpisah, `tah-policy.ts` beku utuh (keputusan R1, PR #9). Migrasi 2B & Q8 **belum pernah** dijalankan di produksi.
- **WA-1 Step 2E MERGED (2026-10-09)** — FAKE Send + retry manual (PR #10, `8ebd546`): satu transaksi REPEATABLE READ, revalidasi #2, approval basi → `NEEDS_REVIEW`, idempotensi requestKey terikat tenant+pesan+snapshot, batas ≤ 5 attempt (kebijakan beku), kunci candidate antara Send & revisi Prepare, audit atomik, zero egress. Tidak dideploy.
- **WA-1 Step 2F MERGED (2026-10-09)** — Cancel (PR #12, `30a686c`): ADMIN & MANAJER_OPERASI, alasan wajib, `CANCELED_BY_USER`, approval tertaut dihentikan, aman terhadap balapan Cancel vs Send (AC-18).
- **WA-1 Step 2G MERGED (2026-10-09)** — Read service & Communication History (PR #13, `f3a372a`): daftar/detail/riwayat dalam satu transaksi REPEATABLE READ, isolasi tenant, penyamaran pengenal (AC-17).
- **WA-1 Step 2H MERGED (2026-10-10)** — API `/api/automation/communications` (PR #14, `f97c94e`): 11 route; hasil bisnis HTTP 200 + `hasil`; gerbang sebelum baca body; pengerasan CSRF (`48b9be1`: Origin = origin `NEXTAUTH_URL`, Sec-Fetch-Site same-origin, wajib `application/json`).
- **WA-1 Step 2I MERGED (2026-10-10)** — UI Komunikasi (Simulasi) (PR #15, `d4a3e71`): daftar, ruang kerja revisi/preview/approval/FAKE Send/retry/Cancel/History; tombol "Siapkan Update Klien" hanya 4 event pilot; label "SIMULASI — TIDAK DIKIRIM KE WHATSAPP"; penerima fixture tersamar default; fakta preview dari snapshot tersimpan. Guard sidik jari Intake dipisah (opsi b owner): sidik historis V3 `ruteDanUiIntake` `930b347…` dipertahankan, guard aktif `ruteDanUiIntakeBeku` `a133f35…`. Tidak dideploy.
- **WA-1 Step 2J MERGED (2026-10-10)** — E2E Validation & Demo (PR #17, `be91229`): `check-comm-e2e` (HTTP nyata, 6 keluarga event × ID/EN byte-per-byte vs PRD §11, gate negatif, retry & batas 5, idempotensi paralel, Cancel ∥ Send, isolasi tenant, otorisasi), perangkap egress proses server, varian `NODE_ENV=production` lokal, seed demo sintetis, panduan demo, laporan bukti + 12 tangkapan layar. Tanpa perubahan kode aplikasi.
- **WA-1 OWNER ACCEPTANCE: APPROVED (10 Oktober 2026)** — OWNER-VERIFIED: owner menjalankan demo langsung di Google Chrome (laptop owner, DB lokal sintetis, perangkap egress) dan menyetujui alur menu → Siapkan Update Klien → preview ID/EN → approval → FAKE Send → riwayat audit. **WA-1 memenuhi gate PRD §18** (AC P0 lulus, bukti uji, demo diterima owner, checkpoint diperbarui oleh dokumen ini).

## G. NOT COMPLETED / NEXT GAP

**Batas alur yang sudah terverifikasi berakhir di:** Human Review / Acknowledged Signal / Audit Trail.
Pekerjaan berikutnya dimulai **sesudah** batas ini. **Jangan membangun ulang Voyage Monitoring.**

Komunikasi klien eksternal / pengiriman WhatsApp **belum** diimplementasikan maupun diverifikasi sebagai bagian alur produksi ini.

Target alur konseptual:

Validated operational event → tentukan apakah perlu komunikasi ke klien → tentukan penerima → buat pesan WhatsApp terkontrol → Human Approval bila diperlukan → pengiriman WhatsApp → status sent/delivered/failed → audit trail komunikasi

Gap lain yang tetap terbuka (rujukan: gap analysis 2026-09-30):
- Eksekusi approval TAH (`TahApprovalRequest` hanya skema/kebijakan; belum service/API/UI/executor).
- Agen TAH selain INTAKE (registri: INTAKE + `TAH_DEV_NOOP` non-produksi).
- TD-005-01 kuota AI, TD-005-02 self-approval intake terlihat portal, TD-005-03 update operasional voyage — OPEN.
- Finance self-approval masih diizinkan (`IZINKAN_SETUJU_SENDIRI = true`).
- Document intelligence/versioning, PNBP actual, vendor cost terpadu, profit v2.
- AIS live (hanya NONE/FAKE; kontrak POLL), BMKG/cuaca, event engine lintas sumber.
- Kenaikan rilis produksi `ac922f6` → `main`.

## H. KNOWN BLOCKERS

| Blocker | Dampak |
|---|---|
| Belum ada approval TAH yang bisa dieksekusi | Aksi eksternal (termasuk WhatsApp ke klien) belum boleh diotomatisasi tanpa desain gerbang approval |
| Belum ada provider/akun WhatsApp, mapping penerima, dan kebijakan pengiriman | Pengiriman WA tidak bisa diuji end-to-end |
| SG-05 terbuka (fixture penerima tak terikat tenant) | Integrasi WhatsApp nyata tidak boleh dimulai sebelum SG-05 ditutup |
| Promosi Sonnet 5 terkunci aturan PRD-005 (plafon V3 + larangan Blind-C/Eval-9) | Sonnet 5 tetap `PENDING_SPIKE` di `main` tanpa keputusan owner baru (lihat §I) |
| `SPIKE_OPENROUTER_API_KEY` kedaluwarsa 2026-10-05 | Evaluasi LIVE apa pun butuh kunci baru + saldo terverifikasi |
| Produksi menjalankan rilis lama `ac922f6` | Registri produksi berbeda dari `main` (Sonnet 5 `VERIFIED` vs `PENDING_SPIKE`) |
| Status trial/paid GCP UNVERIFIED | Risiko layanan terhenti; VM dipakai bersama aplikasi lain |

## I. MODEL STATUS — tiga keadaan, jangan dicampur

| Keadaan | Status | Label |
|---|---|---|
| **OWNER MODEL DIRECTION** | `anthropic/claude-sonnet-5` | Keputusan owner 2026-10-05 |
| **GITHUB MAIN TECHNICAL STATUS** | Sonnet 5 = **`PENDING_SPIKE`**; Sonnet 4.5 = `VERIFIED` (`LEGACY_IN_USE`). `TAH_INTAKE_MODEL=anthropic/claude-sonnet-5` di kode `main` → gagal tertutup `MODEL_TIDAK_TERVERIFIKASI`, 0 panggilan | VERIFIED 2026-10-05 |
| **PRODUCTION (rilis lama `ac922f6`)** | Registri mencatat Sonnet 5 = **`VERIFIED`** (sebelum revert `4cd338d`), tetapi **dorman**: `TAH_INTAKE_MODEL`, `TAH_CORE_ENABLED`, `VESSEL_CALL_INTAKE_ENABLED` ABSENT. Model global `OPENROUTER_SPK_MODEL = anthropic/claude-sonnet-4.5` | OWNER-VERIFIED 2026-10-05 |

**Jangan menyimpulkan TAH aktif hanya karena registri produksi menulis `VERIFIED`.**

Riwayat singkat Sonnet 5: Eval-4 heldout-3 LIVE PASS 42/42 (TEXT, Prompt v4, validator lama) → promosi sempit `b89ca36` → dicabut `4cd338d` sesudah Eval-7 Blind-A → Eval-8 Blind-B gagal target karena plafon validator V3 (bukan kegagalan model). HTTP 402 hanya sekali di Eval-4 heldout-1 (infrastruktur, akar tidak terbukti).

Syarat minimum mengubah status dari `PENDING_SPIKE` (butuh keputusan owner; PRD-005 tetap CLOSED): spesifikasi validator baru + dataset blind segar + evaluasi baru, ATAU perubahan kriteria penerimaan secara eksplisit; lalu evaluasi LIVE Sonnet 5 dengan validator final yang lulus ambang, otorisasi LIVE, kunci API baru, saldo terverifikasi.

## J. WHATSAPP AUTOMATION STATUS

| Item | Status |
|---|---|
| WA-0 architecture / read-only audit | **COMPLETE** |
| PRD WA-1 v0.2 | **OWNER APPROVED + FROZEN** — baseline `docs/whatsapp/PRD-WA-1.md` (PR #4 merged) |
| WA-1 Step 2A–2D | **MERGED** ke `main` (PR #6–#9); tidak dideploy |
| WA-1 Step 2E — FAKE Send + retry manual | **MERGED** ke `main` (PR #10, `8ebd546`, 2026-10-09); **tidak dideploy**. Satu transaksi REPEATABLE READ; revalidasi #2; approval basi → `NEEDS_REVIEW` (K1); requestKey terikat tenant+pesan+snapshot (K3); zero egress (trap runtime + scan impor, K4); batas ≤ 5 attempt via `bolehUlangiEksekusi` beku; `kunciCandidate` menserialkan Send vs revisi Prepare; tanpa migrasi; `tah-policy.ts` & berkas beku V3 tak berubah |
| WA-1 Step 2F–2I — Cancel, Read/History, API, UI | **MERGED** ke `main` (PR #12–#15, `d4a3e71`, 2026-10-10); **tidak dideploy**; tanpa migrasi baru |
| WA-1 Step 2J — E2E Validation & Demo | **MERGED** ke `main` (PR #17, `be91229`, 2026-10-10); **tidak dideploy**. Bukti: `docs/whatsapp/WA-1-STEP2J-EVIDENCE.md`; panduan demo: `docs/whatsapp/WA-1-STEP2J-DEMO.md` |
| **WA-1 (proof-of-flow FAKE, non-produksi)** | **ACCEPTED — OWNER ACCEPTANCE: APPROVED 10 Oktober 2026** (OWNER-VERIFIED, demo Chrome di laptop owner). Gate PRD §18 terpenuhi. Batasan tetap: FAKE-only, `INTERNAL_FAKE_TEST` ditolak di produksi (D-12), penerima hanya fixture `TEST_FIXTURE`, nol egress WhatsApp |
| Setuju-sendiri `WA_INTERNAL_FAKE_TEST` | Diizinkan (INTERNAL_WRITE, non-produksi; sesuai PRD AC-14, keputusan 2D). `EXTERNAL_COMMUNICATION` tetap `SELF_APPROVAL_FORBIDDEN` (AC-15). **Wajib ditinjau sebelum WA-2** |
| Risiko terbuka WA-1 (dari 2H/2I) | Tanpa rate limit di POST; sanitasi log galat belum ada; pagination & allowlist field `AuditLog` belum ada; tanpa token CSRF eksplisit (`NEXTAUTH_URL` wajib = origin publik); uji hanya terhadap `next dev`; tanpa CI independen |
| **SG-05 fixture ↔ tenant** | **TERBUKA.** Fixture penerima = konstanta kode tanpa relasi tenant. Pembatas yang wajib dipertahankan: FAKE-only, non-produksi, allowlist tenant Automation, zero egress. **Wajib diselesaikan sebelum integrasi pengiriman WhatsApp nyata** (keputusan owner 2026-10-09). |
| Production WhatsApp integration | **NOT STARTED** |
| Meta/WhatsApp production egress | **Tidak ada** |
| Perubahan produksi/deployment dari pekerjaan WA | **Tidak ada** |

Source of truth desain, kontrak, safety gate, dan acceptance/test (TS-01..TS-18): **`docs/whatsapp/PRD-WA-1.md`** — jangan diduplikasi di checkpoint.

- **Belum ada integrasi.** Di kode hanya tautan `wa.me` (click-to-chat manual) pada halaman login, landing, dan billing.
- Email: hanya draft + pencatatan manual "tandai terkirim"; belum ada pengiriman otomatis.
- Fondasi yang sudah terverifikasi di produksi dan menjadi titik awal: Voyage → Audit Log → Voyage Monitoring → Signal → Human Review → Acknowledge (§D).

## K. UX BACKLOG (ditemukan saat uji 2026-10-05 — BACKLOG, jangan diimplementasikan saat update checkpoint)

**Modal "Create New Voyage":** sesudah field diisi, klik di luar modal menutupnya; saat dibuka lagi, data yang sudah diisi hilang.
Perilaku yang diinginkan:
- klik tak sengaja di luar modal tidak boleh membuang data secara diam-diam;
- simpan draft ATAU cegah tutup-dari-luar saat form sudah diisi (dirty);
- bila user sengaja menutup form yang dirty, tampilkan konfirmasi seperti "Discard unsaved changes?".

## L. NEXT EXACT STEP

**Keputusan owner tentang fase berikutnya (belum dimulai).** WA-1 sudah ACCEPTED (10 Oktober 2026) sebagai proof-of-flow FAKE-only non-produksi.

- **WA-2 (PRD §18) NOT STARTED** — butuh PRD/keputusan terpisah: model kontak WhatsApp, E.164, consent/opt-in/opt-out, penentuan penerima, kebijakan approval untuk klien nyata, aktivasi desain `CLIENT_WA_UPDATE`. Jangan mulai tanpa persetujuan owner eksplisit.
- **Wajib ditinjau sebelum WA-2:** aturan setuju-sendiri `WA_INTERNAL_FAKE_TEST` (diizinkan untuk WA-1 per AC-14; klien nyata wajib pemutus ≠ pengaju — AC-15).
- **Wajib ditutup sebelum WA-3 (pengiriman nyata):** SG-05 (fixture ↔ tenant).
- **Risiko terbuka WA-1 (tetap):** tanpa rate limit POST; sanitasi log galat belum ada; pagination & allowlist field `AuditLog` belum ada; CSRF bergantung pada `NEXTAUTH_URL` = origin publik (tanpa token eksplisit); uji di kontainer pengembangan tanpa CI independen; `next dev` mencoba mengunduh Google Fonts (`next/font`, perilaku lama); build produksi lokal butuh `PORTAL_DATABASE_URL`.
- **Isu terpisah:** `check-validator-remediasi.mjs` 9 kegagalan historis (pra-V3) — keputusan owner (arsip/perbarui) tertunda; jangan diubah tanpa persetujuan.
- Merge ≠ izin deploy. Migrasi 2B & Q8 belum pernah dijalankan di produksi; tidak ada perubahan produksi dari WA-1.

Riwayat: WA-0 COMPLETE 2026-10-05; PRD WA-1 v0.2 FROZEN 2026-10-05; Step 2A–2D MERGED 2026-10-05; Step 2E MERGED 2026-10-09 (PR #10, `8ebd546`); Step 2F–2G MERGED 2026-10-09 (PR #12–#13); Step 2H–2I MERGED 2026-10-10 (PR #14–#15, `d4a3e71`); checkpoint + Step 2J MERGED 2026-10-10 (PR #16–#17, `be91229`); **OWNER ACCEPTANCE WA-1: APPROVED 2026-10-10**.

## M. HARD STOP / OWNER APPROVAL REQUIRED

Tidak boleh dilakukan tanpa persetujuan owner eksplisit pada sesi tersebut:
- coding/implementasi fitur;
- merge ke `main`, deploy, atau kenaikan rilis produksi;
- migrasi atau write ke database produksi;
- perubahan env/konfigurasi produksi, termasuk `TAH_INTAKE_MODEL`, `TAH_CORE_ENABLED`, `VESSEL_CALL_INTAKE_ENABLED`;
- mengaktifkan TAH Intake;
- perubahan registri model atau promosi Sonnet 5;
- evaluasi LIVE / panggilan model berbayar;
- membuka kembali PRD-005;
- perubahan GCP, VM, nginx, firewall, PM2, billing;
- registrasi provider WhatsApp atau pengiriman WhatsApp/email;
- perubahan data tenant uji/duplikat (HOLD) atau pembersihan data uji;
- menjalankan script untracked dari checkout lokal mana pun.

## N. HISTORICAL CHECKPOINT (2026-09-30, tetap benar)

- SHA kode yang diaudit pada gap analysis: `main@0b5c1c5`; PR #1 merged 2026-09-30 04:15:17 UTC.
- PRD-005: Validator V3 FINAL `ac6460c`, kandidat `prd005-intake-text/kandidat-validator-v3-2`,
  fingerprint `775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c`.
- Prinsip alur yang disepakati: source → ingest → validate → link ke pekerjaan → approval → action → audit. AI tidak boleh menciptakan fakta operasional/finansial tanpa sumber.
- PNBP/biaya resmi mengikuti billing/nota resmi; internal cost/profit terpisah dari dokumen klien. Data sensitif dan credential tidak masuk repo publik.
- External Data Pack historis dianggap cukup untuk desain; tidak perlu mengumpulkan dokumen dari nol.
- Usulan urutan paket (gap analysis §5, belum disetujui sebagai komitmen): 0 rekonsiliasi baseline → 1 TAH Approval/audit/kontrol biaya AI → 2 Vessel Call + Document Intelligence → 3 EPDA/PR/vendor/PNBP actual → 4 profit v2/closing → 5 Event Engine → 6 AIS live + BMKG → 7 Client Communication Agent → 8 WhatsApp + pilot. Estimasi awal 8–13 minggu kerja (ketidakpastian tinggi). Per keputusan owner 2026-10-05 (OD-3), fokus berikutnya adalah Client Communication / WhatsApp di atas fondasi yang sudah terverifikasi (§D).
