# Maritime Suite v2.0 — Roadmap & Keputusan

> Dokumen kerja evolusi **app A (`maritime-suite`)** menuju **PRD v2.0**.
> Dibuat: 2026-08-06. Status: **PERENCANAAN — belum coding fitur besar.**
> Kalau laptop mati / sesi hilang, buka file ini + memory Claude untuk lanjut.

---

## 0. Konteks

- **App yang dievolusikan:** `D:\rapikan\04 DEVELOPMENT DAN AI\CLAUDE CODE\aplikasi maritim\maritime-suite`
- **Stack app A (dipertahankan):** Next.js 14 + React 18 + TS, Tailwind + shadcn/ui, **Prisma + PostgreSQL**, **NextAuth** (credentials+bcrypt+JWT), AI via **OpenRouter → Claude Sonnet 4.5**, payment **Midtrans**, PDF @react-pdf/jspdf, multi-tenant (`Tenant`), i18n EN/ID, e-Faktur/Coretax.
- **Pemilik:** PT Tribuana Solusi Maritim (Samarinda).
- **PRD:** v2.0, 10 part (ada di riwayat chat / ChatGPT). Visi = "Maritime Operating System" untuk ship agency.
- **Model data app A sekarang:** *document-centric* (tabel `MaritimeDocument` flat + JSON). Belum ada Voyage, Master Data ternormalisasi, Service Catalog, versioning.

## 1. Keputusan yang sudah diambil (2026-08-06)

1. **Evolusi app A**, bukan rebuild.
2. **Pertahankan stack app A** — TETAP NextAuth + Prisma + OpenRouter (BUKAN Supabase Auth + OpenAI seperti tulisan PRD). PRD di-adjust ke kenyataan.
3. **Target rilis: internal Tribuana dulu, arsitektur siap-SaaS** (multi-tenant `tenantId` dipertahankan).
4. **AI ikuti PRD penuh** (Cost Prediction + confidence), TAPI di-**ground ke data histori voyage/FDA** + Service Catalog (bukan LLM ngarang nominal). Angka selalu bisa diedit. Realistis di fase belakang (butuh data histori).
5. **Isolasi data antar-company** (Postgres RLS vs tenant-guard di service layer): **belum diputus** — bahas nanti.

## 2. Perubahan yang sudah dikerjakan

- ✅ **AI dinaikkan Haiku 4.5 → Sonnet 4.5** — `src/lib/ai/openrouter.ts` (default `anthropic/claude-sonnet-4.5`). Untuk Sonnet 5: set env `OPENROUTER_SPK_MODEL="anthropic/claude-sonnet-5"`. Alasan: akurasi + **multimodal** (bisa baca PDF/gambar).

## 3. Requirement tambahan

- **Import ship particular dari PDF/Excel** di **AI chat box** → baca → preview → konfirmasi → simpan ke **Master Vessel**.
  - **Dua pintu:** (a) chat box AI, (b) tombol "Import from PDF/Excel" di halaman Master Vessel.
  - **Alur:** upload → AI ekstrak → **PREVIEW (user cek/edit)** → [Konfirmasi & Simpan] → Master Vessel. (Ada konfirmasi biar kualitas Master Data terjaga; opsi auto-save bila confidence tinggi bisa ditambah nanti.)
  - Kalau kapal sudah ada → tawarkan update, jangan dobel.
  - Excel via `exceljs` (sudah dependency). PDF via **Sonnet vision** (digital & scan, tanpa OCR terpisah). Ikut pola `lib/ai/*-extract.ts`.
  - Aman guardrail (data teknis IMO/GT/LOA, bukan uang). Masuk **Fase 1**.

## 4. Pivot inti (wajib duluan)

Refactor **document-centric → voyage-centric + Service Catalog**.
- `Voyage` = hub (1 voyage = folder digital: EPDA, revisi, FDA, invoice, SOF, NOR, lampiran, dll).
- `Service Catalog` = sumber semua angka (formula: Pilotage = GT × tarif, Towage = jml tug × tarif, dst; bisa diedit Company Admin tanpa ubah kode).
- Semua modul PRD menggantung di dua ini.

## 5. Proyeksi beda v2 vs app A sekarang

**Headline: ~65–70% baru/berubah, ~30–35% dipakai ulang** (evolusi, bukan tulis ulang).

| Lapisan | % berubah | Di mana |
|---|---|---|
| Database / data model | ~75–80% | 6 tabel → ~25–40 tabel (Voyage, Master Data, Service Catalog, EPDA/FDA header+items, versioning, approval, audit) |
| Business logic | ~65% | auto-cost engine, formula, revisi, approval, variance, invoice-dari-FDA, AI |
| UI / halaman | ~65–70% | halaman inti baru (lihat bawah) |
| Fondasi (reuse) | ~20–30% berubah saja | auth, multi-tenant, PDF engine, doc types, e-Faktur, i18n, Midtrans, shadcn |

**UI yang benar-benar baru:** Voyage Workspace, Master Data section (8+ halaman), EPDA flagship (smart autocomplete), Dashboard analitik, Global Search, Notification Center, AI Assistant panel.
**UI yang tetap mirip:** kerangka layout (sidebar+header), output PDF, login/register/settings, komponen shadcn.

> **TODO saat v2 jadi:** buat laporan before/after final (angka pasti + daftar perubahan).

## 6. Rencana 9 Fase (0–8)

| Fase | Fokus | Ukuran | Milestone |
|---|---|---|---|
| 0 | Fondasi data & arsitektur | S–M | — |
| 1 | Master Data + Service Catalog (+import PDF/Excel) | L | — |
| 2 | Voyage Hub + Port Call + Cargo | M | — |
| 3 | EPDA Engine (flagship) | L | — |
| 4 | FDA + Invoice + Payment | L | ✅ Bisa dipakai Tribuana |
| 5 | Dashboard + Reports + Roles + Audit | M–L | — |
| 6 | AI Layer (prediction, anomaly, assistant) | M | 🧠 Cerdas |
| 7 | Operations & Collaboration (Task, Vendor, Portal internal, Playbook) | XL | 🚢 Jadi "OS" |
| 8 | SaaS Commercial (portal, onboarding, AIS, white-label) | XL | 💰 Siap dijual |

**Titik penting:** berguna nyata di akhir **Fase 4**; siap jual di akhir **Fase 8**.

### Detail fase

**Fase 0 — Fondasi Data & Arsitektur** (belum ada fitur user)
Skema Prisma voyage-centric + Master Data + Service Catalog + EPDA/FDA header-items + versioning + approval + audit. Strategi migrasi dari `MaritimeDocument`. Refactor ke service layer (`features/`, `services/`). Deliverable: skema + migrasi + kerangka service.

**Fase 1 — Master Data + Service Catalog** (fondasi #1)
CRUD Vessel (tab detail), Owner, Customer, Vendor, Port, Berth/Terminal, Currency, Exchange Rate, Service Catalog (tarif+formula). ⭐ Import ship particular PDF/Excel (dua pintu). Deliverable: auto-fill nyata.

**Fase 2 — Voyage Hub + Port Call + Cargo**
Voyage + auto-number, Voyage List, Voyage Workspace (kerangka), Port Call timeline (Add Event), Cargo. Deliverable: bisa buat voyage & rekam aktivitas.

**Fase 3 — EPDA Engine** (flagship)
Ambil item dari Service Catalog → auto-cost formula → smart autocomplete (rate/currency/vendor/tax otomatis), multi-currency, revisi/versioning + compare, approval berjenjang, lifecycle 8-status, PDF + email principal. Deliverable: EPDA < 5 menit.

**Fase 4 — FDA + Invoice + Payment** ✅
FDA dari voyage (actual, vendor bills, variance), Invoice otomatis dari FDA, Payment (AR), Outstanding, Receipt, Cash to Master / Cash Advance. Deliverable: siklus penuh; Tribuana berhenti pakai Excel.

**Fase 5 — Dashboard + Reports + Roles + Audit**
Dashboard Executive/Ops/Finance + KPI + charts, Reports + export, Roles 4→7 + permission matrix, Audit Log, Notification Center, Global Search.

**Fase 6 — AI Layer** 🧠
AI Assistant kontekstual, Cost Prediction (grounded histori + confidence), Anomaly Detection, Email draft, Document Summary, perluas ekstraksi file. Ditaruh di sini karena butuh data histori dulu.

**Fase 7 — Operations & Collaboration** 🚢 (paling besar)
Task Management + Kanban + auto-checklist, Husbandry, Crew Change, Vendor Management + performance, PO, Work Order, Internal Chat/Notes, Timeline, Calendar, Reminder, SLA, Attachment Center, Email history, Digital Port Playbook / Knowledge Base.

**Fase 8 — SaaS Commercial** 💰 (siap jual)
Onboarding wizard, subscription tiers, license add-ons (reuse Midtrans), Customer Portal, Vendor Portal, Marine data (AIS/Weather/Congestion), White-label, Product Analytics, compliance/backup/monitoring, Help Center + support SLA.

### Urutan & prioritas
- **Fase 0–4 = tulang punggung** (urut, saling gantung) — prioritas utama.
- **Fase 5–6** = otak & mata (analitik + AI).
- **Fase 7–8 = paling berat/mahal** — PRD taruh di v2.1–v4.0; kerjakan bertahap.
- **Strategi:** kejar sampai Fase 4/5 dulu (produk nyata), baru evaluasi Fase 6–8.

## 6b. Strategi model: kapan Opus, kapan Sonnet

**Prinsip:** Opus dipakai saat menentukan **apa & bagaimana bentuknya**; Sonnet dipakai saat **mengerjakan pola yang sudah ditentukan**. Target: hasil ~90-95% setara all-Opus dengan biaya ~25-30% Opus saja.
Yang bikin Sonnet kalah = **ambiguitas**. Jadi Opus menghabisi ambiguitas dulu, Sonnet jalan di jalur bersih.

**OPUS** 🔴: desain skema DB & relasi; keputusan arsitektur; **modul pertama tiap pola** (jadi acuan); mesin hitung (formula EPDA, variance, multi-currency); strategi migrasi data; bug yang sudah 2x gagal; review keamanan multi-tenant; desain prompt & guardrail AI Cost Prediction.

**SONNET** 🟢: CRUD/form/tabel/list-detail; modul ke-2 dst yang meniru pola; import/export; validasi rutin; i18n; styling & komponen UI; test, seed, dokumentasi; bug jelas (typo/import/null); refactor kecil.

| Fase | Model | Catatan |
|---|---|---|
| 0 Fondasi/skema | **OPUS 100%** | Jangan hemat di sini — semua fase menggantung. |
| 1 Master Data | Opus ~20% / Sonnet ~80% | Opus: Service Catalog + formula, modul Vessel pertama. |
| 2 Voyage Hub | Opus ~30% / Sonnet ~70% | Opus: struktur Voyage Workspace + state timeline. |
| 3 EPDA Engine | **Opus ~50%** | Opus: auto-cost, versioning, approval, multi-currency. |
| 4 FDA+Invoice | Opus ~30% / Sonnet ~70% | Opus: variance & invoice-dari-FDA. |
| 5 Dashboard/Report | **Sonnet ~90%** | Opus hanya untuk query agregasi berat. |
| 6 AI Layer | Opus ~40% / Sonnet ~60% | Opus: grounding prediction + anomaly. |
| 7 Operations | **Sonnet ~85%** | Opus: desain task-engine & SLA. |
| 8 SaaS | Opus ~25% / Sonnet ~75% | Opus: portal & isolasi akses eksternal. |

**Sinyal WAJIB naik ke Opus di tengah jalan:**
1. Sonnet gagal **2x** pada masalah sama → jangan coba ke-3.
2. Sonnet mulai **menebak / bikin asumsi baru** → ada ambiguitas.
3. Menyentuh **uang, migrasi data, atau akses lintas-tenant**.

**Syarat wajib:** setiap keputusan Opus (skema/pola/formula) **ditulis ke `docs/`**, lalu Sonnet diminta "ikuti pola di docs/...". Tanpa ini Sonnet mengarang gaya sendiri → konsistensi hancur (ini sumber utama jarak kualitas).

**Catatan plan:** Opus umumnya butuh plan Max (bukan Pro). Estimasi beban kerja: ~14-21 sesi kerja sampai Fase 4 (bisa dipakai), ~36-53 sesi untuk full PRD. Cek limit nyata via `/usage`.

## 7. Langkah berikutnya

### Progres Fase 0 (per 2026-08-10)

Detail lengkap: **[FASE-0-SKEMA-v2.md](./FASE-0-SKEMA-v2.md)**

| Langkah | Status |
|---|---|
| Dokumen desain + 6 keputusan (K1-K6) | ✅ selesai |
| Persetujuan user: Disbursement gabung, backfill PortCall→Voyage, `InvoicePayment` | ✅ disetujui |
| Tulis `prisma/schema.prisma` (18 tabel + 6 enum baru) | ✅ selesai, `prisma validate` **valid** |
| Bukti aditif: uji SQL kering → **0 DROP / 0 ALTER COLUMN / 0 SET NOT NULL** | ✅ terbukti |
| **Terapkan migration ke database (dev lokal)** | ✅ **selesai 2026-08-10** — tanpa reset, data utuh (lihat K7) |
| Uji app lama tetap normal | ✅ `tsc --noEmit` 0 error, baca dokumen lama OK |
| Seed M5 (`prisma/seed-v2.mjs`) | ✅ 3 tenant × (3 mata uang + 3 pelabuhan + 21 jasa + 19 tarif contoh) |
| Backfill M3 (`prisma/backfill-v2.mjs`) | ✅ 1 PortCall → `VYG-2026-000001` + Cargo, pelabuhan tertaut `IDBPN` |
| Backfill M4 (dokumen → voyage) | ✅ **nihil** — 48 dokumen semuanya `portCallId = NULL`, tidak ada yang bisa ditautkan (lihat §6b) |
| Kerangka service layer `src/services/` + `src/features/` | ⬜ **berikutnya** |

**Keputusan user 2026-08-10:** target = **DB development lokal** (`localhost:5432/maritime_suite`), commit dikerjakan di branch `feat/v2-fase-0-voyage-centric`.

**K7 (baru) — baseline sebelum migrate.** DB ternyata dikelola `db push`, bukan `migrate`, sehingga `migrate dev` akan menawarkan **reset** (hapus semua data). Diselesaikan dengan: backup `pg_dump` → buat migration baseline dari skema git HEAD → `migrate resolve --applied` → baru `migrate dev`. Rinciannya di [FASE-0-SKEMA-v2.md §6a](./FASE-0-SKEMA-v2.md). **Ulangi urutan ini saat deploy ke produksi.**

**K8 (baru) — M4 dibatalkan, dan itu keputusan yang benar.** Semua dokumen lama tidak punya `portCallId`, dan kolom teks `port` berisi campuran nama perusahaan & nomor dokumen. Menebak tautan dari situ akan membuat relasi palsu yang tampak sah di laporan. Dokumen lama dibiarkan sebagai arsip sesuai M6. Rinciannya di [FASE-0-SKEMA-v2.md §6b](./FASE-0-SKEMA-v2.md).

**Urutan menjalankan skrip** (seed dulu, supaya Master Port ada saat backfill menautkan pelabuhan):
```bash
node prisma/seed-v2.mjs
node prisma/backfill-v2.mjs --dry-run
node prisma/backfill-v2.mjs
```

### Berikutnya

1. **Kerangka service layer** `src/services/` + `src/features/` — penutup Fase 0.
2. Lalu **Fase 1: Master Data + Service Catalog** (CRUD Vessel/Port/Customer/Vendor/Currency + ⭐ import ship particular PDF/Excel).
3. Sebelum Fase 1 dimulai: user perlu **mengganti tarif contoh** dengan tarif pelabuhan resmi (atau memutuskan itu bagian dari Fase 1).

## 8. Tension yang belum diselesaikan (untuk diingat)

- Isolasi data (RLS vs tenant-guard) — belum diputus.
- Adopsi sebagian stack rekomendasi PRD (TanStack Query, Zod, Zustand) — putuskan per-item saat build.
- Komentar guardrail "AI tak pernah hitung uang" di `openrouter.ts` — perlu diperbarui saat modul AI Cost Prediction dibangun.
