# FASE 0 — Desain Skema Data v2 (voyage-centric)

> **Status: DRAFT untuk direview. Belum ada kode aplikasi yang diubah.**
> Dibuat: 2026-08-06 · Induk: [ROADMAP-v2.md](./ROADMAP-v2.md)
> Fase ini dikerjakan dengan **Opus** (sesuai strategi model §6b) karena keputusan di sini mahal untuk dibalik.

---

## 1. Masalah yang dipecahkan Fase 0

Temuan dari pembacaan kode app A:

| Temuan | Bukti | Akibat |
|---|---|---|
| Biaya tidak bisa dihitung | `EpdaLineItem.qty` = **string** (`"8,432 GT"`, `"1 call"`) | Sistem tak bisa auto-calculate; semua angka diketik manual |
| Tidak ada sumber tarif | Tarif hanya angka lepas di JSON | Tak ada auto-fill, tak ada konsistensi antar-EPDA |
| Dokumen tidak punya induk | `MaritimeDocument` berdiri sendiri (link opsional ke PortCall) | Tak ada "folder digital" per kunjungan kapal |
| Tak ada versi | Satu baris per dokumen | Revisi EPDA menimpa yang lama; riwayat hilang |
| Master data berupa teks | `PortCall.port` = String | Tak bisa filter/laporan per pelabuhan dengan andal |

**Sasaran Fase 0:** ubah fondasi dari *document-centric* → *voyage-centric + katalog jasa yang dapat dihitung*, **tanpa merusak app yang sedang dipakai**.

---

## 2. Keputusan desain (dan alasannya)

### K1 — Ikuti konvensi app A, bukan teks PRD
PRD minta `snake_case` + UUID. App A memakai model Prisma PascalCase + `cuid()`.
**Putusan: ikuti app A.** Konsistensi dalam satu basis kode lebih berharga daripada mencocokkan teks PRD; mencampur dua konvensi adalah sumber bug. `cuid()` sama amannya dengan UUID untuk multi-tenant.

### K2 — `Principal` = `Owner` PRD; tambah `Customer` terpisah
App A sudah punya `Principal` yang dipakai di banyak tempat. Mengganti namanya = perubahan berisiko tanpa manfaat.
**Putusan:** `Principal` tetap (berperan sebagai Owner/pemberi order). Tambah **`Customer`** baru (pihak yang ditagih). Sering sama, kadang beda — Voyage menyimpan keduanya.

### K3 — Satu tabel `Disbursement` untuk EPDA/FPDA/FDA
PRD memisah `epda_headers` dan `fda_headers`. Padahal strukturnya nyaris identik, dan **app A sendiri sudah menyatukannya** (`makeDisbursementHandlers({ variant: 'EPDA' | 'FPDA' })`).
**Putusan:** satu tabel `Disbursement` + kolom `kind`. Lebih sedikit duplikasi, dan **variance analysis jadi mudah** (bandingkan baris EPDA vs FDA dalam voyage yang sama).

### K4 — Tarif dipisah dari definisi jasa
Satu jasa (mis. Pilotage) punya **tarif berbeda per pelabuhan** dan **berubah seiring waktu**.
**Putusan:** `ServiceCatalog` (definisi + cara hitung) dipisah dari `ServiceRate` (tarif per pelabuhan + masa berlaku).

### K5 — ⚠️ Prinsip Snapshot (paling penting untuk audit)
Baris EPDA/FDA **menyalin** tarif & cara hitung saat dibuat — **bukan** menunjuk tarif hidup.
Kalau tidak: menaikkan tarif pilot hari ini akan **mengubah nilai EPDA tahun lalu**. Itu fatal untuk audit & sengketa dengan principal.
Maka `DisbursementItem` menyimpan `unitPrice`, `calcMethod`, `currency`, `exchangeRate` sebagai nilai tetap.

### K6 — Formula pakai enum, bukan penerjemah rumus
PRD minta formula bisa diubah admin tanpa ubah kode. Menyimpan rumus sebagai teks lalu di-`eval` = lubang keamanan.
**Putusan:** enum `CalcMethod` + parameter. Aman, tetap fleksibel, menutup ~95% kasus nyata. Sisanya pakai `MANUAL`.

---

## 3. Rancangan skema (sketsa Prisma untuk direview)

### 3.1 Master Data

```prisma
model Port {
  id            String   @id @default(cuid())
  tenantId      String
  name          String
  unlocode      String?              // IDSMR, IDBPN, SGSIN
  country       String?
  timezone      String?
  latitude      Float?
  longitude     Float?
  portAuthority String?
  pilotRequired Boolean  @default(false)
  tugRequired   Boolean  @default(false)
  maxDraft      Float?
  maxLoa        Float?
  workingHours  String?
  notes         String?              // cikal bakal Port Playbook (Fase 7)
  isActive      Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?                // soft delete (PRD §40)

  @@unique([tenantId, unlocode])
  @@index([tenantId])
}

model Customer {              // pihak yang DITAGIH (Principal = pemberi order)
  id           String  @id @default(cuid())
  tenantId     String
  name         String
  customerType String?
  address      String?
  npwp         String?
  email        String?
  phone        String?
  contactPerson String?
  currency     String  @default("IDR")
  creditLimit  Float?
  paymentTermDays Int?
  isActive     Boolean @default(true)
  @@index([tenantId])
}

model Vendor {
  id          String  @id @default(cuid())
  tenantId    String
  name        String
  vendorType  String?             // PILOT, TUG, FRESH_WATER, GARBAGE, ...
  address     String?
  npwp        String?
  email       String?
  phone       String?
  bankName    String?
  bankAccount String?
  paymentTermDays Int?
  isActive    Boolean @default(true)
  @@index([tenantId])
}

model Currency {
  id       String  @id @default(cuid())
  tenantId String
  code     String                  // IDR, USD, SGD
  name     String?
  symbol   String?
  decimals Int     @default(2)
  isActive Boolean @default(true)
  @@unique([tenantId, code])
}

model ExchangeRate {
  id            String   @id @default(cuid())
  tenantId      String
  fromCurrency  String
  toCurrency    String
  rate          Float
  effectiveDate DateTime
  source        String?             // MANUAL | BI | ECB
  @@index([tenantId, fromCurrency, toCurrency, effectiveDate])
}
```

### 3.2 Service Catalog — jantung perhitungan

```prisma
enum CalcMethod {
  FLAT          // lump sum
  PER_UNIT      // qty x rate
  PER_GT        // GT kapal x rate
  PER_GT_PER_CALL
  PER_GT_PER_DAY
  PER_DAY
  PER_HOUR
  PER_TON       // tonase kargo x rate
  PERCENTAGE    // % dari basis (mis. agency fee)
  TIERED        // berjenjang menurut GT
  MANUAL        // diketik operator
}

enum ServiceCategory {
  PORT_CHARGES      // light dues, port dues, wharfage, anchorage
  MARINE_SERVICES   // pilot, tug, mooring, launch boat
  GOVERNMENT        // customs, immigration, quarantine, harbour master
  HUSBANDRY         // crew change, fresh water, garbage, CTM, medical
  AGENCY            // agency fee, communication, documentation
  OTHER             // miscellaneous, contingency
}

model ServiceCatalog {
  id              String          @id @default(cuid())
  tenantId        String
  serviceCode     String                       // PILOT, TUG, LIGHT_DUES
  serviceName     String
  category        ServiceCategory
  calcMethod      CalcMethod      @default(MANUAL)
  defaultUnit     String?                      // call, hour, ton, day, GT
  defaultCurrency String          @default("IDR")
  taxable         Boolean         @default(false)
  taxPct          Float?
  defaultVendorId String?
  glAccount       String?
  usedInEstimate  Boolean         @default(true)   // muncul di EPDA
  usedInActual    Boolean         @default(true)   // muncul di FDA
  sectionLetter   String?                      // A/B/C/D — kompatibel PDF app A
  displayOrder    Int             @default(0)
  isActive        Boolean         @default(true)

  rates ServiceRate[]
  @@unique([tenantId, serviceCode])
  @@index([tenantId, category])
}

model ServiceRate {                 // tarif per pelabuhan + masa berlaku
  id            String   @id @default(cuid())
  tenantId      String
  serviceId     String
  service       ServiceCatalog @relation(fields: [serviceId], references: [id])
  portId        String?                     // null = berlaku umum
  vesselType    String?                     // opsional: beda tarif per jenis kapal
  gtMin         Float?                      // untuk TIERED
  gtMax         Float?
  rate          Float
  currency      String   @default("IDR")
  minCharge     Float?
  effectiveFrom DateTime
  effectiveTo   DateTime?
  @@index([tenantId, serviceId, portId, effectiveFrom])
}

model ServiceTemplate {             // paket biaya standar per pelabuhan (PRD §92)
  id       String @id @default(cuid())
  tenantId String
  name     String
  portId   String?
  vesselType String?
  isDefault Boolean @default(false)
  items    ServiceTemplateItem[]
  @@index([tenantId, portId])
}

model ServiceTemplateItem {
  id           String @id @default(cuid())
  templateId   String
  template     ServiceTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  serviceId    String
  defaultQty   Float?
  displayOrder Int    @default(0)
}
```

### 3.3 Voyage — hub

```prisma
enum VoyageStatus { PLANNED CONFIRMED ARRIVED BERTHED WORKING COMPLETED DEPARTED CLOSED CANCELLED }

model Voyage {
  id           String  @id @default(cuid())
  tenantId     String
  voyageNumber String                       // VYG-2026-000001
  vesselId     String
  principalId  String?                      // = Owner (K2)
  customerId   String?                      // pihak ditagih
  portId       String?
  agencyType   String?                      // FULL, PROTECTIVE, HUSBANDRY
  status       VoyageStatus @default(PLANNED)

  eta DateTime?  etb DateTime?  etc DateTime?  etd DateTime?
  ata DateTime?  atb DateTime?  atd DateTime?

  baseCurrency String  @default("IDR")
  notes        String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  portCalls     PortCall[]
  cargoes       Cargo[]
  disbursements Disbursement[]
  invoices      Invoice[]

  @@unique([tenantId, voyageNumber])
  @@index([tenantId, status])
  @@index([tenantId, eta])
}

model Cargo {
  id        String @id @default(cuid())
  tenantId  String
  voyageId  String
  voyage    Voyage @relation(fields: [voyageId], references: [id], onDelete: Cascade)
  cargoName String
  quantity  Float?
  unit      String?                        // MT, m3, TEU
  operation String?                        // LOAD | DISCHARGE
  shipper   String?
  consignee String?
}
```

> `PortCall` yang sudah ada **ditambah** `voyageId String?` + `portId String?` (opsional dulu, agar tidak merusak data lama).

### 3.4 Disbursement (EPDA/FPDA/FDA) + versioning

```prisma
enum DisbursementKind { EPDA FPDA FDA }
enum DisbursementStatus {
  DRAFT PENDING_REVIEW APPROVED SENT REVISION_REQUESTED REVISED FINAL CLOSED CANCELLED
}

model Disbursement {
  id       String @id @default(cuid())
  tenantId String
  voyageId String
  voyage   Voyage @relation(fields: [voyageId], references: [id])
  kind     DisbursementKind
  docNumber String                        // EPDA/2026/06/0142 (pola app A dipertahankan)

  // --- versioning (PRD §97-98) ---
  rootId       String?                    // penanda rumpun revisi; V1 = dirinya sendiri
  version      Int     @default(1)
  supersededBy String?                    // diisi saat versi baru dibuat
  revisionNote String?

  baseCurrency String  @default("IDR")
  subtotal     Float   @default(0)
  agencyPct    Float   @default(2.5)
  agencyAmount Float   @default(0)
  taxAmount    Float   @default(0)
  grandTotal   Float   @default(0)
  advanceReceived Float?

  status     DisbursementStatus @default(DRAFT)
  issuedAt   DateTime @default(now())
  validUntil DateTime?
  notes      String?

  items  DisbursementItem[]
  @@unique([tenantId, docNumber])
  @@index([tenantId, voyageId, kind])
  @@index([rootId])
}

model DisbursementItem {
  id             String @id @default(cuid())
  disbursementId String
  disbursement   Disbursement @relation(fields: [disbursementId], references: [id], onDelete: Cascade)

  serviceId   String?                     // null = item ad-hoc
  vendorId    String?
  category    ServiceCategory?
  sectionLetter String?                   // A/B/C/D untuk PDF
  description String
  basis       String?                     // teks tampil: "per GT per call"

  // --- ANGKA YANG BISA DIHITUNG (pengganti qty string) ---
  quantity    Float   @default(1)
  unit        String?
  unitPrice   Float   @default(0)
  calcMethod  CalcMethod @default(MANUAL) // snapshot (K5)

  currency     String @default("IDR")
  exchangeRate Float  @default(1)         // snapshot (K5)
  amount       Float  @default(0)         // dalam currency item
  amountBase   Float  @default(0)         // dikonversi ke baseCurrency
  taxable      Boolean @default(false)
  taxAmount    Float?

  // --- khusus FDA ---
  sourceItemId      String?               // menunjuk baris EPDA → untuk variance
  vendorInvoiceNo   String?
  actualReceiptRef  String?

  displayOrder Int @default(0)
  @@index([disbursementId])
  @@index([serviceId])
}
```

### 3.5 Invoice, Payment, Approval, Audit

```prisma
model Invoice {
  id        String @id @default(cuid())
  tenantId  String
  voyageId  String?
  voyage    Voyage? @relation(fields: [voyageId], references: [id])
  sourceDisbursementId String?            // dibuat dari FDA (PRD §105)
  invoiceNumber String
  customerId String?
  invoiceDate DateTime @default(now())
  dueDate     DateTime?
  currency    String @default("IDR")
  subtotal Float @default(0)
  taxAmount Float @default(0)
  grandTotal Float @default(0)
  amountPaid Float @default(0)
  status   String @default("DRAFT")
  items    InvoiceItem[]
  payments Payment[]                      // catatan: BEDA dari model Payment (Midtrans) yang sudah ada
  @@unique([tenantId, invoiceNumber])
}

model Approval {                          // tak boleh diubah setelah tersimpan (PRD §114)
  id         String @id @default(cuid())
  tenantId   String
  entityType String                       // DISBURSEMENT | INVOICE | PO
  entityId   String
  level      Int     @default(1)
  userId     String
  decision   String                       // APPROVED | REJECTED | REQUEST_REVISION
  note       String?
  ipAddress  String?
  createdAt  DateTime @default(now())
  @@index([tenantId, entityType, entityId])
}

model AuditLog {
  id        String @id @default(cuid())
  tenantId  String
  tableName String
  recordId  String
  action    String                        // CREATE | UPDATE | DELETE | APPROVE | EXPORT | LOGIN
  oldValue  Json?
  newValue  Json?
  userId    String?
  ipAddress String?
  createdAt DateTime @default(now())
  @@index([tenantId, tableName, recordId])
}
```

> ⚠️ **Bentrok nama:** app A sudah punya `model Payment` untuk **Midtrans (langganan SaaS)**. Payment AR pelanggan **berbeda urusan**. Usul: model baru diberi nama **`InvoicePayment`** agar tidak tertukar.

---

## 4. Strategi migrasi — **aditif, tidak merusak**

Prinsip: app A sedang dipakai. **Tidak ada tabel/kolom yang dihapus di Fase 0.**

| Langkah | Tindakan | Risiko |
|---|---|---|
| **M1** | Tambah semua tabel baru. Tabel lama tak disentuh. | Nihil — app lama tetap jalan |
| **M2** | Tambah kolom **opsional**: `PortCall.voyageId?`, `PortCall.portId?`, `MaritimeDocument.voyageId?` | Nihil (nullable) |
| **M3** | **Backfill**: tiap `PortCall` lama → dibuatkan satu `Voyage` induk (data disalin dari PortCall + Vessel + Principal), lalu `voyageId` diisi | Rendah, bisa diulang; dijalankan sebagai skrip terpisah, bukan otomatis |
| **M4** | Tautkan `MaritimeDocument` lama ke Voyage lewat `portCallId` yang sudah ada | Rendah |
| **M5** | Seed: Currency (IDR/USD/SGD), Port (Samarinda, Balikpapan, Singapore), Service Catalog awal + tarif | Nihil |
| **M6** | EPDA/FDA **baru** memakai `Disbursement`. EPDA lama tetap dibaca dari `MaritimeDocument` (arsip, read-only) | Rendah — tak ada konversi paksa |

**Tidak ada dual-write.** Cut-over per modul: begitu form EPDA baru siap (Fase 3), dokumen baru masuk tabel baru; yang lama tetap tampil di Arsip. Data historis aman, tanpa risiko konversi JSON→relasional yang berantakan.

**Rollback:** karena semuanya aditif, membatalkan = berhenti memakai tabel baru. Tidak ada data lama yang hilang.

---

## 5. Yang tetap dipakai ulang (jangan dibangun ulang)

- ✅ `Tenant`, `User`, auth NextAuth, isolasi `tenantId`
- ✅ Mesin PDF + 28 template dokumen (`lib/pdf/*`) — hanya **sumber datanya** yang berubah
- ✅ Penomoran otomatis `lib/doc-number.ts` (pola `PREFIX/YYYY/MM/NNNN` dipertahankan; tambah pola `VYG-YYYY-NNNNNN` untuk Voyage)
- ✅ `MaritimeDocument` + ~45 jenis dokumen (NOR, SOF, FAL, crew, dll) — **tetap**, hanya dapat tautan `voyageId`
- ✅ e-Faktur/Coretax, Midtrans, i18n, komponen shadcn
- ✅ Pola ekstraksi AI `lib/ai/*-extract.ts` → acuan untuk import ship particular

---

## 6. Urutan kerja Fase 0

1. ✅ Review dokumen ini + persetujuan 3 keputusan (§7)
2. ✅ Tulis `prisma/schema.prisma` final — **selesai & tervalidasi**
3. ✅ Terapkan migration aditif (M1-M2) ke database — **selesai 2026-08-10** (lihat §6a)
4. ✅ Skrip backfill (M3-M4) + seed (M5) — **selesai 2026-08-10** (lihat §6b)
5. ⬜ Kerangka service layer: `src/services/` + `src/features/` (PRD §163)
6. ✅ Uji: app lama tetap jalan — `tsc --noEmit` bersih, baca dokumen lama OK

**Definition of Done:** migration jalan, data lama utuh, app lama normal, seed terisi, kerangka service siap dipakai Fase 1.

### 6a. Catatan penerapan migration (2026-08-10)

**Masalah tak terduga:** DB lokal selama ini dikelola dengan `prisma db push`, **bukan** `prisma migrate`. Akibatnya `prisma/migrations/` kosong dan `migrate status` melaporkan *"database is not managed by Prisma Migrate"*. Menjalankan `migrate dev` langsung akan dianggap **drift** → Prisma menawarkan **reset database** (drop semua tabel). Itu akan menghapus 48 dokumen + 3 tenant + 4 user data uji.

**K7 — Baseline dulu, jangan reset.** Urutan yang dipakai (aman, tanpa menyentuh data):

| # | Perintah | Efek |
|---|---|---|
| 1 | `pg_dump -F c -f backup/pre-v2-migration.dump` | Cadangan 42 KB (folder `backup/` di-gitignore) |
| 2 | `migrate diff --from-empty --to-schema-datamodel <skema git HEAD>` | Hasilkan SQL keadaan **lama** → `migrations/20260806000000_baseline_existing_schema/` |
| 3 | `migrate resolve --applied 20260806000000_baseline_existing_schema` | Tandai sudah diterapkan — **hanya menulis riwayat, tidak menjalankan SQL** |
| 4 | `migrate dev --name v2_voyage_centric` | Migration aditif jalan bersih, **tanpa reset** |

**Syarat yang membuat ini aman** (diverifikasi lebih dulu, bukan diasumsikan): `migrate diff` antara DB hidup dan skema git HEAD menghasilkan *"This is an empty migration"* — artinya DB **persis sama** dengan skema lama, sehingga baseline benar-benar mewakili keadaan nyata. Kalau ada drift, langkah 3 justru berbahaya karena mencatat kebohongan ke riwayat.

**Hasil verifikasi sesudah migration:**

| Yang diperiksa | Hasil |
|---|---|
| Jumlah baris tabel lama | **Identik** — MaritimeDocument 48, Tenant 3, User 4, Vessel 2, Principal 1, PortCall 1, Payment 0 |
| Jumlah tabel | 7 → **26** (7 lama + 18 baru + `_prisma_migrations`) |
| Kolom baru di tabel lama | `MaritimeDocument.voyageId`, `PortCall.voyageId`, `PortCall.portRefId` — ketiganya `nullable: YES` ✅ |
| Baca dokumen lama via Prisma Client | OK (`OFFICIAL_RECEIPT KW/2026/07/0001`) |
| `tsc --noEmit` seluruh app | **0 error** |

**Pelajaran untuk deploy ke produksi nanti:** DB produksi (Railway/Supabase) kemungkinan besar juga dikelola `db push` dan akan kena masalah yang sama. Ulangi urutan K7 di sana — **backup dulu, baseline dulu**, baru `migrate deploy`. Jangan sekali-kali menjawab "yes" pada tawaran reset.

### 6b. Backfill & seed (2026-08-10)

Dua skrip baru, keduanya **idempoten** (aman diulang) dan **tidak pernah menimpa** data yang sudah ada:

| Skrip | Isi | Perintah |
|---|---|---|
| `prisma/seed-v2.mjs` | M5 — Currency, Port, Service Catalog + tarif | `node prisma/seed-v2.mjs` |
| `prisma/backfill-v2.mjs` | M3-M4 — PortCall→Voyage, Document→Voyage | `node prisma/backfill-v2.mjs --dry-run` lalu tanpa flag |

> **Urutan berubah dari rencana:** jalankan **seed (M5) DULU**, baru backfill (M3). Master Port harus sudah ada supaya `PortCall.portRefId` bisa ditautkan. Dokumen ini semula menulis M3→M5.

**Hasil seed:** 3 tenant × (3 mata uang + 3 pelabuhan + 21 jasa + 19 tarif). Pelabuhan: Samarinda `IDSRI`, Balikpapan `IDBPN`, Singapore `SGSIN`. Katalog jasa mengikuti **4 seksi EPDA yang sudah dipakai app A** (dibaca dari `lineItems` dokumen EPDA nyata di DB, bukan dikarang): A Port Authority & Government Charges, B Pilotage/Towage/Mooring, C Clearance & Documentation, D Agency & Disbursements.

> ⚠️ **Tarif hasil seed = ANGKA CONTOH, bukan tarif resmi.** Ada supaya mesin hitung Fase 3 bisa diuji. Skrip hanya membuat tarif bila jasa itu **belum punya tarif sama sekali**, jadi begitu operator mengisi tarif resmi, seed ulang tidak akan menimpanya.

**Seed diterapkan ke SEMUA tenant** (bukan hanya Tribuana). Disengaja: kalau nanti UI tenant A menampilkan pelabuhan milik tenant B, kebocoran isolasi langsung kelihatan saat Fase 1.

#### ⚠️ Temuan yang membatalkan M4

Rencana M4 berbunyi *"tautkan MaritimeDocument lama ke Voyage lewat `portCallId` yang sudah ada"*. Kenyataannya: **seluruh 48 dokumen punya `portCallId = NULL`.** Tidak ada satu pun tautan untuk diikuti, jadi M4 **nihil (0 baris)** — bukan gagal, memang tidak ada pekerjaannya.

Alternatifnya adalah menebak dari kolom teks `MaritimeDocument.port`. **Sengaja tidak dilakukan.** Isi kolom itu campur aduk karena berasal dari data uji buatan AI:

```
Balikpapan (23) · Samarinda (12) · <UNKNOWN> (2) · (null) (2) · "KGTE, Balikpapan" (2)
"Soechi Lines" (1)  ← nama perusahaan, bukan pelabuhan
"INV/2026/06/TEST1" (1)  ← nomor dokumen, bukan pelabuhan
"Kapal di Pelabuhan Samarinda" (1) · "Samarinda — ETA 10 Jul 2026" (1) · "Astiku" (1)
```

Menebak dari sini akan menciptakan **relasi palsu** yang tampak sah di laporan — lebih berbahaya daripada tautan kosong. Dokumen lama tetap utuh dan terbaca sebagai arsip, persis seperti yang sudah direncanakan di **M6** (tidak ada konversi paksa). Tautan `voyageId` untuk arsip lama memang cuma nilai tambah, bukan syarat.

Skrip tetap mengimplementasikan M4 dengan benar, jadi kalau nanti dijalankan di DB produksi yang dokumennya memang tertaut ke PortCall, tautan itu akan terisi otomatis.

#### Hasil backfill

`PortCall` → `Voyage`, 1 baris (satu-satunya yang ada):

| Kolom | Nilai |
|---|---|
| voyageNumber | `VYG-2026-000001` (pola baru, per tenant per tahun) |
| kapal / principal | MT Soechi Asia XXIX / Soechi Lines |
| pelabuhan | Balikpapan → tertaut ke Master Port `IDBPN` ✅ |
| status | `DEPARTED` (PortCall) → `DEPARTED` (Voyage) |
| kargo | dipecah ke tabel `Cargo`: B40, 6000 KL (`cargoQty` teks → `quantity` Float) |

Pemetaan status: `UPCOMING→PLANNED`, `IN_PORT→ARRIVED`, `DEPARTED→DEPARTED`, `CANCELLED→CANCELLED`.

Pencocokan pelabuhan **konservatif**: cocok persis dulu (nama atau UN/LOCODE), lalu cocok sebagian **hanya bila tepat satu** pelabuhan yang cocok. Kalau ragu → dikosongkan, diisi manual lewat Master Data.

**Verifikasi sesudahnya:** jumlah baris tabel lama tetap identik (48/1/1/3/4/2); jalan kedua kedua skrip menghasilkan 0 perubahan (idempotensi terbukti).

### Hasil verifikasi skema (2026-08-06)

`npx prisma validate` → **valid** ✅

Uji SQL kering (`prisma migrate diff`, tidak diterapkan) — 592 baris:

| Operasi | Jumlah |
|---|---|
| CREATE TABLE (tabel baru) | **18** |
| CREATE TYPE (enum baru) | 6 |
| CREATE INDEX / UNIQUE | 31 |
| ALTER TABLE | 39 (mayoritas penambahan foreign key) |
| **`DROP` / `ALTER COLUMN` / `SET NOT NULL`** | **0** ✅ |

Satu-satunya perubahan pada tabel lama:
```sql
ALTER TABLE "MaritimeDocument" ADD COLUMN "voyageId" TEXT;      -- nullable
ALTER TABLE "PortCall" ADD COLUMN "portRefId" TEXT, "voyageId" TEXT;  -- nullable
```
**Terbukti aditif.** Tidak ada kolom yang dihapus, diubah tipenya, atau dijadikan wajib — sehingga baris data yang sudah ada tetap sah dan app lama berjalan tanpa perubahan.

---

## 7. ✅ Keputusan yang sudah disetujui (2026-08-06)

1. **Satu tabel `Disbursement`** untuk EPDA/FPDA/FDA — **DISETUJUI** (K3).
2. **Backfill PortCall → Voyage** — **DISETUJUI**. Data lama dibuatkan Voyage induk otomatis (M3).
3. **`InvoicePayment`** untuk AR pelanggan — **DISETUJUI**. `Payment` (Midtrans/langganan) tidak disentuh.

### Tambahan keputusan saat penulisan skema
4. **Tabel anak tidak membawa `tenantId`** (`DisbursementItem`, `InvoiceItem`, `ServiceTemplateItem`, `Cargo`) — isolasi diwarisi dari induk lewat relasi + `onDelete: Cascade`. Menyimpang dari PRD §25 (yang minta `company_id` di semua tabel), alasannya: menghindari data kembar yang bisa "melenceng" dari induknya. `ServiceRate` **tetap** membawa `tenantId` karena sering di-query langsung saat mencari tarif.

Dua hal masih tertunda dari roadmap: **isolasi data (RLS vs tenant-guard)** dan **adopsi TanStack Query/Zod**.
