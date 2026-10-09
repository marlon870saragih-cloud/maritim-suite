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
**Pembaruan terakhir:** 2026-10-09 — WA-1 Step 2A–2D MERGED (PR #6–#9, `main` @ `03a1dc9`). **Step 2E (FAKE Send + retry manual): implementasi lokal selesai & teruji, PR PENDING (belum merged).** SG-05 (fixture ↔ tenant) masih TERBUKA. NEXT EXACT STEP = review owner atas PR Step 2E (§L).
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
| OD-13 | **D-14:** `VoyageEvent.occurredAt` di masa depan diblokir; timezone pelabuhan wajib valid; revalidasi sumber sebelum Prepare dan Send; sumber deleted/superseded tidak dikirim; `dataOrigin` bukan penanda data uji yang andal. | 2026-10-05 |

## B. DEVELOPMENT / GITHUB REALITY — VERIFIED 2026-10-05

| Item | Nilai |
|---|---|
| Repository | `marlon870saragih-cloud/maritim-suite` (public) |
| `origin/main` | `03a1dc97fdce16b59c380ae8cb4f0eb15d23801c` — merge commit PR #9 (WA-1 Step 2D), 2026-10-05 — VERIFIED 2026-10-09 |
| PR #5–#9 | MERGED 2026-10-05: #5 checkpoint (`ebe86eb`), #6 Step 2A (`5a0673f`), #7 Step 2B (`334052f`), #8 Step 2C (`a1692e0`), #9 Step 2D R1 (`03a1dc9`) — VERIFIED 2026-10-09 (merge commit ada di `main`) |
| Step 2E | Branch `claude/funny-pascal-tpn1rf`; PR ke `main` **PENDING** (belum merged, belum dideploy) |
| PR #3 | MERGED 2026-10-05 (`dd1b330`) — canonical checkpoint ini |
| PR #4 | MERGED 2026-10-05 (`1e81bd8`; parent `dd1b330` + `c041350`) — `docs/whatsapp/PRD-WA-1.md` baseline v0.2; documentation only |
| PR #2 | CLOSED tanpa merge (branch `docs/tah-gap-analysis-20260930` dipertahankan sebagai referensi historis) |
| PR #1 | MERGED (merge commit; parent `958c15a` + `7127d99`); PRD-002..005 ada di `main` |
| `feat/prd002-step2-domain-foundation` | `7127d991f8487bfc9f096d22182f4c1c578a9e87`, sepenuhnya termasuk di `main`; belum dihapus |
| `docs/tah-gap-analysis-20260930` | `139006d` — hanya dokumen, belum di-merge. File ini menggantikan versi checkpoint di branch tersebut; gap analysis-nya tetap rujukan perencanaan |
| CI | Tidak ada (0 workflow). Tidak ada integrasi deploy otomatis di GitHub (webhook & deploy key kosong; GitHub App terpasang hanya Claude) |
| Test WA-1 terakhir yang benar-benar dijalankan | 2026-10-09, PostgreSQL 16 loopback sekali pakai (23 migrasi), basis `03a1dc9` + perubahan Step 2E: comm-send-db 104–106/0 gagal (4× stabil), comm-policy 269, comm-schema 85, comm-prepare-db 98, comm-approval-db 95, tah-policy 322, tah-ledger 98, eval8-runner 62 (A1 sidik V3 lulus), validator-v3 226, automation-policy 124, intake-policy 417, tenant-guard lulus; tsc bersih; next lint hanya warning lama `ReceiptForm.tsx`. Rincian di PR Step 2E |
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
| WA-1 Step 2E — FAKE Send + retry manual | **Implementasi lokal selesai & teruji; PR PENDING (belum merged)**. Satu transaksi REPEATABLE READ; revalidasi #2; approval basi → `NEEDS_REVIEW` (K1); requestKey terikat tenant+pesan+snapshot (K3); zero egress (trap runtime + scan impor, K4); tanpa migrasi; `tah-policy.ts` & berkas beku V3 tak berubah |
| Di luar Step 2E (tahap berikutnya) | Cancel, API, UI, Communication History — **NOT STARTED** |
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

**Review owner atas PR WA-1 Step 2E (FAKE Send + retry manual) → keputusan merge.**

- Merge ≠ izin deploy. Migrasi 2B & Q8 belum pernah dijalankan di produksi; `INTERNAL_FAKE_TEST` ditolak di `NODE_ENV=production` (D-12).
- Sesudah merge: perbarui checkpoint ini (SHA merge, status 2E = MERGED).
- Tahap berikutnya (butuh izin owner terpisah): Cancel, API, UI, Communication History; lalu demo internal proof-of-flow non-produksi (PRD §18). SG-05 wajib ditutup sebelum WA-3 (WhatsApp nyata).

Riwayat: WA-0 COMPLETE 2026-10-05; PRD WA-1 v0.2 FROZEN 2026-10-05; Step 2A–2D MERGED 2026-10-05; Step 2E implementasi lokal 2026-10-09 (PR pending).

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
