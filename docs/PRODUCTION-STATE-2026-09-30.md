# Keadaan Produksi Terverifikasi — 2026-09-30

Catatan bukti hasil audit READ-ONLY di VM produksi (GCP Compute Engine, `asia-southeast2-a`) pada 2026-09-30.
Dokumen ini hanya mencatat; tidak ada perubahan produksi. Repo ini PUBLIK: sengaja TIDAK memuat ID proyek GCP,
nama user sistem operasi, path home, nama tenant, IP, atau nilai env apa pun.

Bila dokumen lain bertentangan dengan catatan ini untuk keadaan per 2026-09-30, catatan inilah yang berlaku.
Keadaan produksi sesudah tanggal ini tetap wajib dibaca ulang dari VM (`docs/PRODUCTION-DEPLOYMENT.md` aturan 1).

## 1. Rilis yang berjalan

- **Kode = commit `ac922f6b530a1dcadde5f2d7aed04734c0576431`** (`chore(deploy): retire Railway artifacts and fix TAH DB tests`),
  commit ke-42 dari 58 commit PRD-002..PRD-005 di cabang `feat/prd002-step2-domain-foundation`.
- Bukti: sha256 (16 hex pertama) empat berkas di direktori rilis yang melayani port aplikasi identik dengan `ac922f6`:

  | Berkas | sha256[:16] |
  |---|---|
  | `prisma/schema.prisma` | `b60e336dd38ae2ca` |
  | `src/app/api/jobs/run/route.ts` | `4d5127db9c4e1701` |
  | `src/services/intake/intake-policy.ts` | `4f5b1273d9a01cee` |
  | `src/lib/ai/model-capabilities.ts` | `99da39fb121e18f0` |

  Berkas yang lahir SESUDAH `ac922f6` (leksikon v2/v3, `docs/PRD-005-CLOSURE.md`) tidak ada di direktori rilis.
- Direktori rilis = hasil ekstrak arsip (BUKAN git checkout). Build Next.js: 2026-09-27 17:23 UTC.
- Selisih: produksi **42 commit di depan `main`** (`958c15a`) dan **16 commit di belakang** HEAD cabang (`f7635a2`);
  16 commit itu memuat **0 migrasi** (validator v2 → V3 FINAL, Sonnet 5 kembali `PENDING_SPIKE`, harness Eval-5..8, dokumen).

## 2. Database

- PostgreSQL 16.15 lokal. `_prisma_migrations`: 21 baris, **0 gagal/menggantung**. Ketujuh migrasi PRD-002..005 sudah diterapkan:

  | Migrasi | Diterapkan (UTC) |
  |---|---|
  | `20260914120000_prd002_vessel_identity_voyage_vessels` | 2026-09-14 02:29 |
  | `20260914130000_prd002_voyage_vessel_fk_cascade` | 2026-09-14 02:29 |
  | `20260914045610_prd002_step5b_voyage_monitoring` | 2026-09-14 07:47 |
  | `20260915011208_prd003_step4_ais_observation` | 2026-09-18 17:35 |
  | `20260917043000_prd004_vessel_call_intake` | 2026-09-18 17:35 |
  | `20260919040000_prd004_attachment_retention` | 2026-09-27 17:31 |
  | `20260924050000_prd005_tah_core_foundation` | 2026-09-27 17:31 |

- **Riwayat deploy (DISIMPULKAN dari tanggal migrasi, bukan dari catatan deploy):** 2026-09-14, 2026-09-18, 2026-09-27.
  Tidak ada catatan deploy di repo untuk ketiganya; siapa yang melakukan belum tercatat.
- Urutan timestamp tidak lazim (`045610` diterapkan sesudah `120000`) tidak menimbulkan masalah.
- Sesudah tanggal ini tidak ada migrasi tertunda untuk HEAD cabang.

## 3. Fitur dan flag (NAMA env saja; nilai sengaja tidak dicatat)

Flag PRD-002..005 yang ADA di env produksi: `AUTOMATION_MONITORING_ENABLED`, `AUTOMATION_TENANT_IDS`, `JOB_RUNNER_BASE_URL`, `JOB_RUNNER_TOKEN`.
Yang TIDAK ADA (di `.env` maupun env proses): `VESSEL_CALL_INTAKE_ENABLED`, `VESSEL_CALL_INTAKE_EXTRACTOR`, `TAH_CORE_ENABLED`,
`TAH_INTAKE_MODEL`, `AIS_*`. Di kode `ac922f6` flag tak diset = MATI (gagal tertutup).

| Fitur | Status 2026-09-30 | Bukti |
|---|---|---|
| Monitoring voyage (PRD-002 Step 5B) | AKTIF, tidak ada voyage yang dipantau | 381 `MonitoringRun` OK; `MonitoredVoyage` 0; `MonitoringSignal` 0 |
| Job pengingat (reminders) | AKTIF (keputusan owner D-2, 2026-09-30) | timer tiap jam, semua sukses, `dibuat` 0 |
| Polling AIS (PRD-003) | TIDAK TERPASANG | tanpa flag, tanpa timer, 0 baris |
| Vessel Call Intake (PRD-004) | MATI | tanpa flag; 1 intake historis (2026-09-19, TEXT, `REJECTED`) → pernah dinyalakan sementara |
| TAH Core / buku besar (PRD-005) | MATI | tanpa flag; `AgentRun` 0, `AgentModelCall` 0 |
| Validator V3 | TIDAK ADA di produksi | rilis `ac922f6` memakai validator v1; berdampak nol selama intake mati |
| Purge lampiran (P36) | BELUM PERNAH JALAN | 0 dipurge; 7 lampiran soft-deleted > 30 hari; tak ada penjadwal yang memanggil |
| Backup `pg-backup` | JALAN | harian, terakhir sukses 2026-09-29; drop-in pelapor terpasang |

## 4. Model AI

- `OPENROUTER_SPK_MODEL` (model bawaan GLOBAL semua fitur AI) = `anthropic/claude-sonnet-4.5` — dicatat karena menyangkut
  keselamatan model dan bukan rahasia.
- Registri di rilis `ac922f6` masih memuat `anthropic/claude-sonnet-5` berstatus `VERIFIED` (promosi `b89ca36`, dicabut `4cd338d`
  SESUDAH rilis ini), tetapi **dorman**: `TAH_INTAKE_MODEL` tidak diset, intake mati, 0 panggilan model tercatat.
- Kesimpulan: **tidak ada jalur produksi yang memakai Sonnet 5.**

## 5. Penjadwal & deploy otomatis

- Timer terpasang: `maritime-reminders.timer` (enabled), `maritime-monitoring.timer` (enabled), `pg-backup.timer` (enabled).
  `maritime-ais-poll.timer` tidak terpasang. Unit job berjalan dengan `DynamicUser=yes` + `LoadCredential` (token tak ada di unit).
- Deploy produksi = manual (arsip rilis). Railway diputus dari GitHub oleh owner (2026-09-30).

## 6. Keputusan owner 2026-09-30

- **D-1:** tenant uji/duplikat di produksi = HOLD, tidak diubah.
- **D-2:** reminders tetap ENABLED.
- **D-3:** penyelarasan GitHub (`main`) terpisah dari deploy produksi; tidak ada deploy pada langkah penyelarasan.
