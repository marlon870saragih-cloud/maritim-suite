# CHECKPOINT — lanjutkan dari sini (dibuat 2026-09-29)

> Baca dokumen ini PERTAMA saat sesi berikutnya dimulai. Semua keputusan di bawah adalah keputusan owner yang berlaku.

## 1. Posisi saat ini

- Repo `marlon870saragih-cloud/maritim-suite`, cabang **`feat/prd002-step2-domain-foundation`**.
- HEAD saat checkpoint dibuat: `bfe02db` (penutupan PRD-005) + commit checkpoint ini. Lokal = remote, working tree bersih.
- Cabang ini = `main` (`958c15a`, 29 Agustus) + **56 commit PRD-002..PRD-005**. **BELUM di-merge ke `main`. BELUM deploy produksi.**

## 2. PRD-005 — CLOSED (jangan dibuka lagi tanpa keputusan owner)

Rincian: `docs/PRD-005-CLOSURE.md`.
- Validator V3 FINAL: `prd005-intake-text/kandidat-validator-v3-2`, sidik `775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c`,
  freeze `ac6460c`. **V3 TIDAK BOLEH diubah.**
- Blind-B (Eval-8) jawaban sempurna 64/80 = 80% < 90% → target TIDAK tercapai; keselamatan toleransi-nol PASS.
- Blind-A (Eval-7) = REGRESSION ONLY. Blind-B = bukti blind FINAL. **TIDAK ADA Blind-C / Eval-9.**
- Sonnet 5 = **`PENDING_SPIKE`**. Tidak ada LIVE, tidak ada promosi, tidak ada deploy.
- Keterbatasan §5.2 = FUTURE DESIGN ITEM (FDI-005-01..03), bukan blocker.

## 3. Larangan yang tetap berlaku

JANGAN: LIVE model call · memakai `SPIKE_OPENROUTER_API_KEY` untuk panggilan model · mengubah V3/prompt/spec/GT/dataset/penilai ·
membuat dataset evaluasi baru · promosi Sonnet 5 · deploy produksi · merge ke `main` tanpa persetujuan owner.

## 4. Menunggu KEPUTUSAN OWNER (belum diputuskan)

1. **Integrasi cabang ke `main`** (usulan langkah berikut): buat PR yang ditinjau untuk PRD-002..005.
   PERHATIAN: Validator V3 berlaku untuk SEMUA ekstraksi intake (termasuk jalur LEGACY Sonnet 4.5) → setelah merge, intake produksi
   menjadi lebih konservatif (lebih banyak nilai kosong untuk ditinjau manusia, tidak ada nilai salah). Owner perlu menerima ini.
2. **Deploy & verifikasi VM** yang tertunda: `docs/PRD-002-STEP3-INFRA.md` §3 (butir wajib diverifikasi sebelum pemasangan, Step 4).
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
| PRD-002 identitas kapal & voyage multi-kapal, scheduler/backup | PARTIAL — kode selesai; pemasangan produksi (Step 4) belum |
| PRD-003 monitoring voyage + AIS polling | PARTIAL — kode sampai Step 4; aktivasi produksi belum terbukti |
| PRD-004 Vessel Call Intake | COMPLETE (kode) |
| PRD-005 TAH Core 3A/3B/3C | COMPLETE; evaluasi V3 CLOSED |
| Gerbang persetujuan TAH native | PARTIAL (skema + kebijakan saja) |
| Agen TAH selain INTAKE | NOT STARTED |
| TD-005-01/02/03 | OPEN |
| Merge ke `main` / deploy | NOT STARTED |

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
