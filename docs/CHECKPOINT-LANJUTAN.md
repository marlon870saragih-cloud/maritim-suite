# CHECKPOINT — lanjutkan dari sini (dibuat 2026-09-29)

> Baca dokumen ini PERTAMA saat sesi berikutnya dimulai. Semua keputusan di bawah adalah keputusan owner yang berlaku.

## 1. Posisi saat ini

- Repo `marlon870saragih-cloud/maritim-suite`, cabang **`feat/prd002-step2-domain-foundation`**.
- HEAD saat checkpoint dibuat: `bfe02db` (penutupan PRD-005) + commit checkpoint ini. Lokal = remote, working tree bersih.
- Cabang ini = `main` (`958c15a`, 29 Agustus) + **58 commit PRD-002..PRD-005**. **BELUM di-merge ke `main`.**
- **KOREKSI 2026-09-30 (audit VM read-only):** pernyataan awal "BELUM deploy produksi" SALAH. Produksi menjalankan
  **`ac922f6`** (commit ke-42 dari 58; build 2026-09-27) dan ketujuh migrasi PRD-002..005 sudah diterapkan (deploy 14, 18,
  27 Sep — disimpulkan dari tanggal migrasi). Bukti & status fitur: `docs/PRODUCTION-STATE-2026-09-30.md`.

## 2. PRD-005 — CLOSED (jangan dibuka lagi tanpa keputusan owner)

Rincian: `docs/PRD-005-CLOSURE.md`.
- Validator V3 FINAL: `prd005-intake-text/kandidat-validator-v3-2`, sidik `775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c`,
  freeze `ac6460c`. **V3 TIDAK BOLEH diubah.**
- Blind-B (Eval-8) jawaban sempurna 64/80 = 80% < 90% → target TIDAK tercapai; keselamatan toleransi-nol PASS.
- Blind-A (Eval-7) = REGRESSION ONLY. Blind-B = bukti blind FINAL. **TIDAK ADA Blind-C / Eval-9.**
- Sonnet 5 = **`PENDING_SPIKE`** di HEAD cabang. Tidak ada LIVE, tidak ada promosi, dan PRD-005 closure sendiri tidak men-deploy.
  Catatan produksi: rilis `ac922f6` masih memuat entri Sonnet 5 `VERIFIED` (sebelum `4cd338d`), tetapi DORMAN
  (`TAH_INTAKE_MODEL` tak diset, intake mati, 0 panggilan model; model global = Sonnet 4.5).
- Keterbatasan §5.2 = FUTURE DESIGN ITEM (FDI-005-01..03), bukan blocker.

## 3. Larangan yang tetap berlaku

JANGAN: LIVE model call · memakai `SPIKE_OPENROUTER_API_KEY` untuk panggilan model · mengubah V3/prompt/spec/GT/dataset/penilai ·
membuat dataset evaluasi baru · promosi Sonnet 5 · deploy produksi · merge ke `main` tanpa persetujuan owner.

## 4. Menunggu KEPUTUSAN OWNER (belum diputuskan)

1. **Integrasi cabang ke `main`** — DIPUTUSKAN 2026-09-30 (D-3): PR + merge commit (tanpa squash/rebase/push langsung),
   TERPISAH dari deploy produksi. Merge tidak mengubah produksi (deploy manual; Railway diputus dari GitHub).
   PERHATIAN (bersyarat): Validator V3 berlaku untuk SEMUA ekstraksi intake (termasuk jalur LEGACY Sonnet 4.5), tetapi baru
   berdampak di produksi bila rilis dinaikkan dari `ac922f6` DAN intake dinyalakan (per 2026-09-30 intake MATI).
2. **Kenaikan rilis produksi `ac922f6` → HEAD** (0 migrasi): keputusan owner tersendiri, belum diputuskan.
   (Butir lama "deploy & verifikasi VM Step 4" usang — pemasangan Step 4 sudah terjadi; lihat `docs/PRODUCTION-STATE-2026-09-30.md`.)
3. Urutan pekerjaan TAH sesudah integrasi (pilih):
   - TD-005-01 kuota AI intake (tugas korektif kecil) — `docs/TAH-TECH-DEBT.md`;
   - TD-005-02 larangan setuju-sendiri intake yang terlihat portal;
   - TD-005-03 alur pembaruan operasional voyage;
   - gerbang persetujuan TAH native (`TahApprovalRequest`: saat ini hanya skema + kebijakan, belum ada service/API/UI);
   - agen TAH kedua (kode menyebut agen EPDA sebagai pengguna pertama gerbang native) — butuh PRD/desain dulu.
4. (Opsional) Dokumen Fase 3/6/7/8 masih bertuliskan "DESAIN, belum ada kode" padahal `main` sudah berisi service finance/ops/saas/
   portal/ai → perlu audit status bila owner ingin roadmap diperbarui.

## 5. Posisi TAH (inventaris read-only)

| Item | Status |
|---|---|
| PRD-002 identitas kapal & voyage multi-kapal, scheduler/backup | Kode selesai. Produksi (2026-09-30): skema diterapkan; reminders & backup AKTIF |
| PRD-003 monitoring voyage + AIS polling | Kode sampai Step 4. Produksi: monitoring AKTIF (0 voyage dipantau); AIS TIDAK terpasang |
| PRD-004 Vessel Call Intake | COMPLETE (kode). Produksi: skema & kode ada (`ac922f6`), fitur MATI |
| PRD-005 TAH Core 3A/3B/3C | COMPLETE; evaluasi V3 CLOSED. Produksi: skema ada, TAH Core MATI, V3 belum ter-deploy |
| Gerbang persetujuan TAH native | PARTIAL (skema + kebijakan saja) |
| Agen TAH selain INTAKE | NOT STARTED |
| TD-005-01/02/03 | OPEN |
| Merge ke `main` | DISETUJUI (D-3) — PR + merge commit, belum dieksekusi |
| Deploy produksi | `ac922f6` berjalan; kenaikan ke HEAD belum diputuskan |

## 6. Catatan teknis untuk sesi berikutnya

- Kunci uji OpenRouter (`SPIKE_OPENROUTER_API_KEY`, limit US$5, pemakaian US$0) **kedaluwarsa 2026-10-05** — jangan dipakai
  (tidak ada LIVE); bila kelak dibutuhkan, owner membuat kunci baru.
- Menyiapkan lingkungan uji: `npm ci --ignore-scripts` lalu `npx prisma generate`.
- PostgreSQL loopback sekali pakai: data di `/var/lib/postgresql/<nama>` (BUKAN scratchpad — izinnya direset lingkungan),
  `initdb` + `pg_ctl -o '-p 55432 -k /tmp -c listen_addresses=127.0.0.1'` sebagai user `postgres`, lalu
  `prisma migrate deploy`; matikan & hapus sesudah uji.
- Suite utama: `check-validator-v3` (226), `check-intake-policy` (417), `check-tah-policy` (313), `check-tah-ledger` (98),
  `check-eval3-ledger-db` (14, butuh DB), `check-eval8-runner` (85; E1c sengaja merah = penghalang LIVE Blind-B).
- Runner evaluasi lama (Eval-4/5/6/7) beku ke kandidat terdahulu → gagal `KANDIDAT_BERUBAH` = diharapkan.
- `check-validator-remediasi` = 61/70 di HEAD = diharapkan (menguji perilaku validator v2 yang digantikan V3;
  lihat `docs/PRD-005-VALIDATOR-V3-CHECKPOINT.md`). Angka 70/70 di `docs/PRD-005-VALIDATOR-REMEDIATION.md` berlaku untuk era v2.
- Runner evaluasi MENOLAK jalan bila `SPIKE_OPENROUTER_API_KEY` (atau `DATABASE_URL` untuk runner Eval-8) terset di env —
  jalankan dengan `env -u …`; DB uji lewat `EVAL3_LEDGER_DB_URL` / `EVAL8_DB_URL`. Nama DB loopback harus `maritime_suite`
  (migrasi portal merujuk nama itu).
