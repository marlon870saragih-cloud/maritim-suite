# PRD-004 — VESSEL CALL INTAKE
## Step 2 — Final PRD · Domain Architecture · Data Model Design

> Status: **DESIGN ONLY** (15 Sep 2026). Tidak ada kode aplikasi, skema, migrasi, atau data yang diubah.
> Baseline: branch `feat/prd002-step2-domain-foundation`, HEAD `5a7d237`. PRD-003 (AIS) dibekukan.
> Dokumen ini belum di-commit.

---

## 1. Executive Summary

Vessel Call Intake mengubah nominasi/appointment kapal yang diterima PT Tribuana Solusi Maritim menjadi **usulan voyage terstruktur** yang diperiksa dan disetujui manusia, lalu dibuat lewat **`createVoyage()` yang sudah ada**.

```
AI extracts → System verifies (deterministic) → Human approves → Domain service writes → Audit records
```

Keputusan desain inti:

| Topik | Keputusan |
|---|---|
| Data model | **Option B**: satu tabel `VesselCallIntake` + satu kolom aditif `Voyage.sourceIntakeId` (unik per tenant) sebagai jaminan database "satu intake → maksimal satu voyage" |
| Lifecycle | `NEEDS_REVIEW → CREATING → COMPLETED`; keluar: `REJECTED`, `LINKED_EXISTING`, `FAILED` (retry terkendali) |
| Matching | Deterministik bertingkat (IMO → MMSI terverifikasi → call sign → nama ternormalisasi); nama saja tak pernah lolos tanpa konfirmasi |
| Duplikat | Aturan deterministik `NO_DUPLICATE / POSSIBLE_DUPLICATE / LIKELY_DUPLICATE`, dihitung ulang di server saat approval |
| Otorisasi | Submit/review/approve: `ADMIN`, `MANAJER_OPERASI` (gerbang Automation Hub + flag intake). Service tulis yang dipanggil approval diperluas **create-only** untuk `MANAJER_OPERASI` |
| Idempotensi | Input: `activeHashKey` unik per tenant. Approval: compare-and-set status+versi + unique `Voyage.sourceIntakeId` |
| AI | Hanya ekstraksi + klasifikasi terbatas; langganan, kuota, rate-limit, timeout, kode galat tanpa teks penyedia |

Verdict: **READY FOR PRD-004 STEP 3 — LOCAL IMPLEMENTATION** (§35).

---

## 2. Problem

Semua kapabilitas hilir sudah ada — ekstraksi AI (K81), `createVoyage`, VoyageVessel, checklist otomatis (K95), Voyage Monitoring (5B), fondasi AIS (PRD-003) — tetapi **belum ada jalur terkendali** dari permintaan bisnis nyata ke record operasional. Akibatnya:

1. Voyage diinput manual; produksi hampir tak punya voyage, sehingga monitoring/AIS/checklist belum bernilai.
2. Draf AI yang ada (`/api/ai/portcall/draft`) menarget **PortCall lama**, bukan Voyage v2, tanpa gerbang peran/kuota/langganan.
3. `createVoyage()` **tidak mendeteksi kunjungan ganda** — prinsip "satu kunjungan kapal = satu record" tak dijaga sistem.

## 3. Goals

- G1 — Nominasi/appointment baru (teks/PDF/gambar/Excel) → usulan voyage terstruktur dalam satu layar review.
- G2 — Identitas master (kapal, principal, customer, pelabuhan) ditentukan **deterministik**, tampil dengan dasar kecocokannya.
- G3 — Kunjungan ganda terdeteksi sebelum voyage dibuat.
- G4 — Voyage hanya lahir lewat `createVoyage()` sesudah persetujuan `ADMIN`/`MANAJER_OPERASI`, tepat sekali.
- G5 — Setiap keputusan dapat diaudit; data mentah tidak disimpan kecuali opt-in.

## 4. Non-Goals

- Ingest otomatis (inbox, IMAP, Outlook, WhatsApp API, webhook) — D1.
- Update voyage, perubahan ETA, penggantian kapal, PDA/EPDA, invoice, vendor, email lain — D5.
- Pembuatan Port/jetty/berth master; pembuatan master otomatis oleh AI — D2.
- Auto-start Voyage Monitoring; pengiriman pesan ke luar; aksi portal.
- Framework agent umum, event bus, workflow engine, queue, `AgentRun` global (§23 PRD).
- Remediasi route lama (`/api/ai/spk/draft`, `/api/ai/portcall/draft`, `POST /api/principals`) — backlog §31.

## 5. Locked Owner Decisions

| # | Keputusan |
|---|---|
| D1 | Input manual saja: tempel teks, unggah PDF, gambar, Excel/CSV (sesuai extractor yang ada) |
| D2 | Master Vessel/Principal/Customer yang hilang boleh ditawarkan dibuat lewat flow master yang ada, **per item dengan konfirmasi eksplisit**; AI tidak pernah membuat master |
| D3 | Approver pilot: `ADMIN`, `MANAJER_OPERASI`. `OPERATOR` tetap memakai alur voyage manual, bukan approver intake |
| D4 | Dokumen asli: **opt-in** lampiran. Bawaan tidak disimpan. Yang disimpan: ekstraksi terstruktur, provenance, hash input, audit |
| D5 | Pilot hanya `NEW_NOMINATION` dan `NEW_APPOINTMENT` |

## 6. Existing Components Reused

| Komponen | Lokasi | Dipakai untuk |
|---|---|---|
| Jalur masukan teks/Excel/PDF/gambar | `lib/ai/extract-target.ts` (K81), `vessel-extract.ts` (`flattenWorkbook`), `openrouter.ts` (`PDF_NATIVE_PLUGIN`) | Ekstraksi intake (deskriptor baru, bukan framework baru) |
| Klasifikasi berkas & batas 10 MB | pola `api/ai/vessel-import/route.ts` (`classify`, `imageMime`) | Unggahan intake |
| Normalisasi identitas kapal | `lib/vessels.ts` (`normalisasiImo`, `imoCheckDigitSah`, `normalisasiMmsi`, `mmsiSah`, `normalisasiCallSign`, `SUMBER_MMSI_TERVERIFIKASI`) | Matching kapal |
| Pembuatan voyage | `services/master/voyage.service.ts` `createVoyage` | Satu-satunya jalur tulis Voyage |
| Kapal voyage (tug+barge) | `voyage-vessel.service.ts` `setVoyageVessels` | Barge/kapal tambahan sesudah voyage lahir |
| Cargo | `cargo.service.ts` `createCargo` | Cargo dari nominasi |
| Checklist otomatis | `task-template.service.ts` `instansiasiOtomatisChecklist` (dipanggil `createVoyage`) | Tidak disentuh |
| Monitoring | `automation/monitoring.service.ts` `mulaiPemantauan` | Tombol manual sesudah selesai |
| Gerbang Automation Hub | `automation/access.ts` `requireAutomation`, `gate.ts` | Akses fitur |
| Langganan / kuota / rate-limit / pemakaian | `subscription.ts`, `saas/quota.service.ts` (`PANGGILAN_AI`), `security/rate-limit.ts` (`cekBolehPanggilAi`), `saas/usage.service.ts` | Kontrol biaya AI |
| Audit | `finance/audit.ts` `catatAudit` | Jejak intake & voyage |
| Lampiran | `ops/attachment.service.ts` `uploadAttachment` + `ops/owner-guard.ts` | Dokumen asli opt-in |
| Isolasi tenant | `tenant-db.ts` `forTenant`, `tenant-guard.ts` | Semua akses data |
| Notifikasi | `notification.service.ts` `notify` | Opsional, internal |
| Pola kebijakan murni + uji Node | `monitoring-policy.ts`, `ais-policy.ts` | `intake-policy.ts` |

## 7. Intake Taxonomy

| Klasifikasi | Arti | Boleh di-approve? |
|---|---|---|
| `NEW_NOMINATION` | Principal/owner menunjuk Tribuana sebagai agen untuk kunjungan kapal baru | Ya |
| `NEW_APPOINTMENT` | Surat penunjukan formal (appointment/SPK/LOI) untuk kunjungan baru | Ya |
| `NOT_RELEVANT` | Bukan permintaan operasional kapal | Tidak — hanya Reject |
| `INSUFFICIENT_INFORMATION` | Mungkin nominasi, tapi tanpa identitas kapal **atau** tanpa pelabuhan/ETA | Tidak sampai reviewer melengkapi field wajib (§15) |
| `UNSUPPORTED_REQUEST` | Update voyage, ETA change, ganti kapal, PDA/EPDA, invoice, vendor, lebih dari satu kunjungan terpisah dalam satu dokumen | Tidak — hanya Reject |

Aturan deterministik di atas klasifikasi AI: bila hasil ekstraksi tak punya identitas kapal apa pun (nama/IMO/MMSI/call sign) **atau** tak punya pelabuhan maupun ETA, klasifikasi dipaksa `INSUFFICIENT_INFORMATION` apa pun kata model. AI tak bisa menaikkan klasifikasi ke `NEW_*` bila syarat minimum tak ada.

## 8. Extraction Contract

Diturunkan dari kolom `Voyage`, `VoyageVessel`, `Cargo`, `Vessel`, `Principal`, `Customer`, `Port` yang benar-benar ada.

```ts
type IntakeExtraction = {
  classification: 'NEW_NOMINATION' | 'NEW_APPOINTMENT' | 'NOT_RELEVANT' | 'INSUFFICIENT_INFORMATION' | 'UNSUPPORTED_REQUEST'
  vessels: {                     // 1 untuk kapal tunggal; 2+ untuk tug + barge dalam SATU kunjungan
    name?: string
    imo?: string                 // Vessel.imoNumber
    mmsi?: string                // Vessel.mmsi
    callSign?: string            // Vessel.callSign
    vesselType?: string          // Vessel.vesselType
    role?: 'TUG' | 'BARGE'       // VoyageVessel.role
  }[]
  principalName?: string         // Voyage.principalId (lewat matching)
  customerName?: string          // Voyage.customerId (lewat matching)
  portName?: string              // Voyage.portId (lewat matching)
  portUnlocode?: string          // Port.unlocode
  jetty?: string                 // tak ada model jetty → hanya catatan (notes), bila reviewer mempertahankan
  eta?: string; etb?: string; etc?: string; etd?: string   // 'YYYY-MM-DD' (semantik tanggal kalender voyage, PRD-002 D4)
  agencyType?: 'FULL' | 'PROTECTIVE' | 'HUSBANDRY'         // hanya bila tertulis eksplisit
  cargoes: { name?: string; quantity?: number; unit?: string; operation?: 'LOAD' | 'DISCHARGE' }[]
  clientReference?: string       // nomor rujukan pengirim → catatan
  requestDate?: string           // 'YYYY-MM-DD' → catatan/audit
  contact?: { name?: string; email?: string; phone?: string }  // HANYA prefill master baru; PII (§23)
}
```

Sengaja **tidak** diekstrak: angka uang/tarif (K50/K67), `voyageNumber` (sistem), `status` (selalu `PLANNED`), `baseCurrency` (bawaan `IDR`), `ata/atb/atd` (nominasi baru tak punya aktual — bila muncul dibuang).

Validasi deterministik sesudah AI:

| Field | Aturan | Gagal → |
|---|---|---|
| Identitas & nama (teks/CSV/Excel) | Nilai ternormalisasi **harus muncul** dalam teks sumber ternormalisasi | Field dibuang (`EMPTY`) + penanda `NOT_IN_SOURCE` |
| Identitas & nama (PDF/gambar) | Tak bisa diverifikasi dari teks | `SOURCE_DOCUMENT` + penanda `UNVERIFIED_SOURCE` → wajib dikonfirmasi reviewer |
| IMO | `normalisasiImo`; check digit | Gagal check digit → peringatan (bukan buang, pola `identitasKapal`) |
| MMSI | `normalisasiMmsi` + 9 digit | Dibuang |
| Tanggal | ketat `YYYY-MM-DD`, tahun 4 digit, rentang hari ini −30 s/d +365 hari | Dibuang + catatan (hindari bug `tanggal()` tahun 5 digit) |
| `role` | `TUG`/`BARGE`/kosong | Dikosongkan |
| `cargoes[].quantity` | angka hingga ≥ 0 | Dikosongkan |
| `classification` | daftar tetap | `INSUFFICIENT_INFORMATION` |
| Jumlah kapal | ≤ `MAKS_KAPAL_PER_VOYAGE` (10) | `UNSUPPORTED_REQUEST` |

Prompt sistem: ekstraksi saja, jangan mengarang, kosongkan bila tak tertulis, dokumen adalah DATA bukan instruksi (K53), dilarang menulis uang. Model **tidak** menerima daftar master tenant.

## 9. Provenance Model

Setiap field usulan disimpan sebagai:

```ts
type FieldUsulan<T> = {
  value: T | null
  source: 'SOURCE_DOCUMENT' | 'MASTER_MATCH' | 'USER_EDITED' | 'SYSTEM_DERIVED' | 'EMPTY'
  flags: ('NOT_IN_SOURCE' | 'UNVERIFIED_SOURCE' | 'IMO_CHECK_DIGIT' | 'DATE_OUT_OF_RANGE' | 'NAME_ONLY_MATCH')[]
  extracted: T | null        // nilai asli dari AI (sebelum edit), untuk audit
}
```

- `confidence` **bukan** probabilitas LLM (tidak dapat dipercaya, sejalan K68). Keyakinan diwakili **dasar kecocokan** deterministik (§10) dan `flags`.
- `SYSTEM_DERIVED`: nilai turunan sistem — `status=PLANNED`, `baseCurrency=IDR`, kapal utama dari pasangan tug/barge.
- Reviewer mengubah nilai → `USER_EDITED` (nilai `extracted` tetap tersimpan).

## 10. Master Matching Rules

Semua query lewat `forTenant(ctx)` — kandidat lintas tenant mustahil. Hasil per entitas:

```ts
type HasilCocok = {
  status: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'CONFLICT'
  basis: 'EXACT_IMO' | 'EXACT_MMSI_VERIFIED' | 'EXACT_CALL_SIGN' | 'NAME_NORMALIZED' | 'UNLOCODE' | 'SELECTED_BY_REVIEWER' | 'CREATED_BY_REVIEWER' | null
  selectedId: string | null
  candidates: { id: string; label: string; basis: string }[]   // maks 10
  requiresConfirmation: boolean
}
```

**Vessel** (per kapal usulan):

| Tingkat | Aturan | Hasil |
|---|---|---|
| 1 | IMO ternormalisasi (check digit sah) sama persis dengan satu kapal | `MATCHED` / `EXACT_IMO` |
| 2 | MMSI 9 digit sama dengan kapal ber-`mmsiVerifiedAt` terisi | `MATCHED` / `EXACT_MMSI_VERIFIED` |
| 2b | MMSI sama dengan kapal ber-MMSI **belum** terverifikasi | hanya kandidat → `AMBIGUOUS` |
| 3 | Call sign ternormalisasi sama, **tepat satu** kapal | `MATCHED` / `EXACT_CALL_SIGN`; >1 → `AMBIGUOUS` (call sign tidak unik untuk pasangan tug/barge) |
| 4 | Nama ternormalisasi sama (huruf besar, spasi dirapatkan, awalan `MV MT TB TK OB SPOB LCT KM KMP` dibuang), tepat satu | `MATCHED` / `NAME_NORMALIZED` + `requiresConfirmation=true` + flag `NAME_ONLY_MATCH`; >1 → `AMBIGUOUS` |
| — | Nama mengandung/terkandung (parsial) | hanya kandidat → `AMBIGUOUS` |
| — | Tak ada | `NOT_FOUND` |
| CONFLICT | Dua identitas menunjuk kapal berbeda (mis. IMO → A, call sign → B), atau IMO usulan ≠ IMO kapal yang cocok via nama | `CONFLICT`, tanpa `selectedId` |

Tug/barge: tiap kapal dicocokkan terpisah. **Kapal utama (`Voyage.vesselId`) = kapal ber-peran `TUG`** bila ada pasangan (sejalan pilot PRD-002: TUG primary), selain itu satu-satunya kapal. `BARGE` dan kapal lain masuk lewat `setVoyageVessels` sesudah voyage lahir.

**Principal / Customer**: nama ternormalisasi (huruf besar, tanda baca dibuang, bentuk badan usaha `PT CV TBK LTD PTE INC CO` dibuang). Sama persis & tunggal → `MATCHED` + `requiresConfirmation=true`; >1 atau parsial → `AMBIGUOUS`; nihil → `NOT_FOUND`. Customer `deletedAt` tidak pernah kandidat; `isActive=false` tampil sebagai kandidat berperingatan, tak pernah terpilih otomatis. **`customerId` tak pernah terisi tanpa tindakan reviewer** (portal, §17).

**Port**: UN/LOCODE sama → `MATCHED` / `UNLOCODE`; nama ternormalisasi sama & tunggal → `MATCHED` / `NAME_NORMALIZED` + konfirmasi; lainnya kandidat/`NOT_FOUND`. Port tidak pernah dibuat oleh intake (D2 tak mencakup Port).

AI tidak memilih kandidat. Pemilihan `AMBIGUOUS`/`CONFLICT` hanya oleh reviewer (`SELECTED_BY_REVIEWER`).

## 11. Duplicate Voyage Rules

Dihitung di `intake-policy.ts` (murni) atas kandidat yang dibaca service. Status voyage aktual: `PLANNED CONFIRMED ARRIVED BERTHED WORKING COMPLETED DEPARTED CLOSED CANCELLED`; ETA bersemantik tanggal kalender.

**Himpunan kandidat** (tenant sama, `deletedAt IS NULL`):
- voyage yang `vesselId`-nya **atau** salah satu `VoyageVessel.vesselId`-nya = salah satu kapal usulan yang sudah terpilih;
- status ∉ `{CLOSED, CANCELLED}`;
- plus intake lain berstatus `NEEDS_REVIEW`/`CREATING` dengan kapal terpilih yang sama.

`d` = selisih hari kalender |ETA usulan − ETA kandidat| (null bila salah satu kosong).

| Level | Aturan (kandidat mana pun) |
|---|---|
| `LIKELY_DUPLICATE` | kapal sama **dan** pelabuhan sama **dan** status ∈ {PLANNED, CONFIRMED, ARRIVED, BERTHED, WORKING} **dan** (`d ≤ 3` **atau** ETA kandidat kosong) |
| `POSSIBLE_DUPLICATE` | kapal sama **dan** salah satu: `d ≤ 7` (pelabuhan apa pun); pelabuhan salah satu sisi kosong; ETA salah satu sisi kosong; status ∈ {COMPLETED, DEPARTED} dengan pelabuhan sama dan `d ≤ 3`; atau intake lain yang aktif untuk kapal sama dengan `d ≤ 3` |
| `NO_DUPLICATE` | tak ada kandidat memenuhi di atas (voyage CLOSED/CANCELLED/terhapus diabaikan) |

Level akhir = level tertinggi. Ambang (`3`, `7` hari) adalah konstanta di satu modul murni (pola K105), bukan hard-code tersebar.

Keputusan reviewer:

| Level | Pilihan |
|---|---|
| `NO_DUPLICATE` | Approve |
| `POSSIBLE_DUPLICATE` | `LINK_EXISTING` · `CONTINUE_AS_NEW` (centang "sudah diperiksa") · `CANCEL_INTAKE` |
| `LIKELY_DUPLICATE` | `LINK_EXISTING` · `CONTINUE_AS_NEW` **wajib alasan ≥ 10 karakter + centang konfirmasi**, diaudit · `CANCEL_INTAKE` |

Tidak ada merge otomatis. **Duplikat dihitung ulang di server saat approval**; bila level naik sejak reviewer membuka layar (voyage baru muncul) → `409` dan reviewer harus meninjau ulang.

## 12. Intake Lifecycle

```
(ekstraksi sinkron di request; gagal → tak ada baris)
        │ berhasil
        ▼
  NEEDS_REVIEW ──reject──▶ REJECTED
     │     │
     │     └──link──▶ LINKED_EXISTING
     │ approve (CAS)
     ▼
  CREATING ──createVoyage OK──▶ COMPLETED
     │
     └──gagal / terputus──▶ FAILED ──retry terkendali (CAS)──▶ CREATING
                              └──reject──▶ REJECTED
```

State kandidat PRD yang **tidak** dipakai:
- `DRAFT`/`EXTRACTED`: ekstraksi sinkron di satu request; baris baru lahir sesudah ekstraksi sukses, jadi tak ada baris setengah jadi (sesuai "LLM failure: tidak membuat apa pun").
- `APPROVED`: identik dengan klaim `CREATING` — memisahkannya membuat jendela di mana "disetujui" tapi belum diklaim, sumber approval ganda.

Terminal: `COMPLETED`, `LINKED_EXISTING`, `REJECTED`. Transisi dijaga fungsi murni `transisiSah(dari, ke)`.

## 13. Human Review Workflow

1. Operator Hub (`ADMIN`/`MANAJER_OPERASI`) membuka **Automation Hub › Intake › Baru**: tempel teks atau unggah berkas; centang opsional "Simpan dokumen asli sebagai lampiran (berisi data pribadi)".
2. Server: gerbang → langganan → hash (intake aktif sama? kembalikan yang ada, tanpa panggilan AI) → kuota & rate-limit → ekstraksi → validasi → matching → duplikat → simpan `NEEDS_REVIEW`.
3. Layar review menampilkan:
   - **Sumber**: jenis input, waktu diterima, pengunggah, nama berkas/ukuran, hash pendek, status lampiran opt-in.
   - **Klasifikasi** + alasan bila dipaksa sistem.
   - **Field usulan** (tabel): nilai, badge provenance (ikon + teks, bukan warna saja), flags.
   - **Matching** per kapal/principal/customer/pelabuhan: status, dasar, kandidat, tombol *Pilih*, *Buat baru* (hanya Vessel/Principal/Customer), *Biarkan kosong* (hanya principal/customer).
   - **Peringatan duplikat** dengan kartu voyage kandidat (nomor, kapal, pelabuhan, ETA, status, tautan) dan pilihan keputusan.
   - **Paparan portal** (§17).
   - **Syarat approval** yang belum terpenuhi, dari server.
4. Setiap edit → `PATCH` intake (tanpa AI; matching & duplikat dihitung ulang deterministik; `version` naik).
5. Approve / Reject (alasan wajib) / Link existing.

## 14. Missing Master Workflow

```
NOT_FOUND / AMBIGUOUS / CONFLICT
   ├─ SELECT EXISTING  → reviewer memilih kandidat atau mencari master tenant
   ├─ CREATE MASTER    → dialog/flow master YANG ADA dibuka, prefill dari usulan; reviewer mengedit & menyimpan
   │                     → id baru dikaitkan ke intake (basis CREATED_BY_REVIEWER), diaudit
   └─ LEAVE UNRESOLVED → hanya principal/customer (opsional di Voyage); vessel & port wajib
```

| Master | Flow yang dipakai ulang | Catatan |
|---|---|---|
| Vessel | dialog Settings › Vessels → `POST /api/vessels` (validasi `identitasKapal`, MMSI ganda) | Sumber MMSI dari dokumen permintaan = `COMPANY_DOCUMENT` **hanya bila reviewer memilihnya**; bawaan prefill kosong (tidak mengklaim terverifikasi) |
| Customer | `createCustomer` (`POST /api/customers`) | — |
| Principal | `POST /api/principals` (route lama) | Route ini **tanpa gerbang peran** — temuan backlog §31; UI intake hanya diakses ADMIN/MANAJER_OPERASI |
| Port | tidak dibuat | `NOT_FOUND` memblokir approval; tautan ke Settings › Ports |

AI hanya prefill. Tidak ada master yang dibuat di dalam transaksi approval — master selalu dibuat terpisah dan eksplisit sebelum approve.

## 15. Approval Model

**Tidak memakai tabel `Approval` finance.** Alasan: semantiknya ronde approval dokumen uang (K42, `REQUEST_REVISION`), `approval.service.ts` terkunci ke `DISBURSEMENT`, dan kolomnya tak memuat keputusan duplikat/paparan portal. Keputusan intake disimpan di baris intake + `AuditLog`.

Prasyarat approve (diperiksa server, fungsi murni `syaratApproval`):
1. status `NEEDS_REVIEW` dan `version` sama dengan yang ditinjau;
2. klasifikasi `NEW_NOMINATION`/`NEW_APPOINTMENT`;
3. kapal utama `MATCHED` (dengan konfirmasi bila `requiresConfirmation`) atau dipilih/dibuat reviewer; tak ada kapal berstatus `CONFLICT`/`AMBIGUOUS` tanpa pilihan;
4. pelabuhan terpilih; ETA terisi & sah;
5. principal/customer: terpilih atau secara sadar "dibiarkan kosong";
6. field `UNVERIFIED_SOURCE`/`NAME_ONLY_MATCH` sudah dikonfirmasi;
7. keputusan duplikat sesuai level (§11), dihitung ulang;
8. bila customer punya akses portal aktif: `portalExposureAck=true`.

Yang dicatat: usulan final (snapshot), approver, waktu, daftar field `USER_EDITED` (sebelum/sesudah), keputusan duplikat + alasan + id kandidat, master yang dibuat reviewer (id), ack paparan portal.

## 16. Authorization Model

| Aksi | Gerbang |
|---|---|
| Semua intake (list, submit, review, approve, reject, link, retry) | `requireAutomation(ctx)` (flag Automation Hub + allowlist tenant, peran `ADMIN`/`MANAJER_OPERASI`) **dan** flag `VESSEL_CALL_INTAKE_ENABLED` persis `"true"` (gagal tertutup, pola AIS) |
| Tenant lain / flag mati | `404` (fitur tak terungkap) |
| `OPERATOR`, `VIEWER`, dll. | `403` |

Konflik yang ditemukan: service tulis yang dipanggil saat approval mensyaratkan `ADMIN`/`OPERATOR`:
`createVoyage`, `setVoyageVessels`, `createCargo`, `createCustomer`, `POST /api/vessels` (`PERAN_UBAH_KAPAL`).

Perubahan terkecil yang **eksplisit** (bukan bypass):
- Tambah `MANAJER_OPERASI` pada **pembuatan saja**: `createVoyage`, `setVoyageVessels`, `createCargo`, `createCustomer`, dan `POST /api/vessels` (konstanta baru `PERAN_BUAT_KAPAL = [...PERAN_UBAH_KAPAL, 'MANAJER_OPERASI']`; `PATCH`/`DELETE` kapal tidak berubah).
- Tidak ada `systemContext` atau peran pinjaman untuk memanggil `createVoyage` — service dipanggil dengan `ctx` approver sesungguhnya, sehingga `requireRole` tetap berlaku dan audit mencatat manusia yang benar.
- Konsekuensi yang dicatat: `MANAJER_OPERASI` juga dapat membuat voyage/kapal/customer/cargo lewat layar manual. Ini turunan langsung D3 (pilihan Step 1 "hak createVoyage diperluas").

## 17. Portal Exposure

Bukti: `portal-guard.ts` memetakan `Voyage: { customer: 'customerId' }`, dan `listVoyagesPortal` tidak menyaring status — **voyage ber-`customerId` langsung terlihat** oleh pengguna portal customer itu (nomor, kapal, pelabuhan, status, ETA/ETB/ETD/ATA), termasuk `PLANNED`.

Desain:
- `customerId` hanya terisi lewat tindakan reviewer.
- Bila customer dipilih: banner informasi "Voyage akan terlihat di portal klien bila klien punya akses portal".
- Bila customer punya ≥ 1 `PortalAccess` aktif: peringatan tegas (jumlah pengguna portal) + centang **wajib** `portalExposureAck`.
- Intake **tidak** menulis apa pun ke tabel portal, tidak membagikan lampiran (`sharedToPortal` tetap `false`), tidak membuat undangan.

## 18. Write Boundary

| Kode | Boleh menulis | Hanya membaca |
|---|---|---|
| `services/intake/intake.service.ts` | `VesselCallIntake`; `AuditLog` (lewat `catatAudit`); `Attachment` (lewat `uploadAttachment`, opt-in); `UsageEvent` (lewat `catatPemakaian`); `Notification` (opsional, `notify`) | `Vessel`, `Principal`, `Customer`, `Port`, `Voyage`, `VoyageVessel`, `PortalAccess`, `Tenant` |
| Approval (dalam service yang sama) | memanggil `createVoyage`, `setVoyageVessels`, `createCargo` — **tidak ada** `db.voyage.create/update` di intake | — |
| `lib/ai/vessel-call-extract.ts` | tidak ada (K52) | — |
| `intake-policy.ts` | tidak ada (murni) | — |

Satu-satunya tambahan pada `createVoyage`: parameter opsional ketiga `opsi?: { sourceIntakeId?: string }` yang diteruskan ke `db.voyage.create`. Pemanggil lama tidak berubah. Uji statis menegaskan intake tak memanggil tulis Voyage secara langsung.

## 19. Post-Creation Behavior

Diaudit dari kode yang ada:

| Langkah | Perilaku | Sumber |
|---|---|---|
| Peran & kuota | `requireRole`, `pastikanKuota('VOYAGE')` | `createVoyage` |
| Relasi milik tenant | kapal/principal/customer/pelabuhan diverifikasi | `pastikanRelasiMilikTenant` |
| Nomor voyage | `VYG-YYYY-NNNNNN`, tanpa lock; tabrakan → `P2002` pada `@@unique([tenantId, voyageNumber])` | `nextVoyageNumber` |
| Asal data | `stempelAsal` (UJI sampai go-live) | `origin.service` |
| VoyageVessel | baris kapal utama dibuat atomik | `createVoyage` |
| Pemakaian | `VOYAGE_CREATED` | `catatPemakaian` |
| Checklist | `instansiasiOtomatisChecklist` **hanya bila `portId` terisi**; galat ditelan | `task-template.service` |
| AuditLog | `createVoyage` **tidak** menulis audit CREATE; intake menulis `AuditLog` Voyage `CREATE` `{ peristiwa: 'DIBUAT_DARI_INTAKE', intakeId }` | intake |
| Notifikasi | tidak ada dari `createVoyage` | — |
| Portal | terlihat bila `customerId` (§17) | portal-guard |

Sesudah `createVoyage` sukses, intake menjalankan **best-effort**: `setVoyageVessels` untuk barge/kapal tambahan, lalu `createCargo` per cargo. Kegagalannya **tidak** membatalkan voyage; intake tetap `COMPLETED` dengan `postCreateWarnings` yang tampil di layar dan tercatat di audit.

**Monitoring tidak otomatis**: layar selesai menampilkan tombol yang memanggil `mulaiPemantauan` yang sudah ada.

## 20. Idempotency

**Input**
- `inputHash` = sha256 atas `jenis + isi ternormalisasi` (teks: trim, CRLF→LF, spasi berulang dirapatkan; berkas: byte mentah).
- `activeHashKey` = `inputHash` selama status non-terminal, `NULL` saat terminal; `@@unique([tenantId, activeHashKey])` (dua NULL tak bertabrakan, pola K89).
- Submit dengan hash yang punya intake aktif → kembalikan intake tersebut, **tanpa panggilan AI** (dicek sebelum kuota). Balapan dua submit bersamaan → `createMany({ skipDuplicates })` / `P2002` → baca & kembalikan yang ada.
- Hash sama dengan intake terminal → peringatan "sudah pernah diproses (COMPLETED/REJECTED/LINKED)" + wajib `confirmReprocess=true`.

**Approval**
1. Klaim atomik: `updateMany({ where: { id, status: 'NEEDS_REVIEW', version }, data: { status: 'CREATING', claimedAt, approvedByUserId, ... } })`; `count === 0` → `409`.
2. `createVoyage(ctx, body, { sourceIntakeId: intake.id })`.
3. `@@unique([tenantId, sourceIntakeId])` pada Voyage menjamin **di level database** satu intake tak pernah menghasilkan dua voyage, meski klaim dilewati.
4. `updateMany({ where: { id, status: 'CREATING' }, data: { status: 'COMPLETED', voyageId, activeHashKey: null } })`.

Double-click, dua tab, dua reviewer: hanya satu klaim menang; sisanya `409`. Tidak bergantung pada tombol yang dinonaktifkan.

## 21. Failure / Retry Semantics

| Kegagalan | Perilaku |
|---|---|
| LLM timeout (60 detik, `AbortSignal`) / galat penyedia / bentuk respons rusak | Tak ada baris intake, tak ada master, tak ada voyage. Respons berkode `AI_TIMEOUT` / `AI_UNAVAILABLE` / `AI_BAD_RESPONSE`, **tanpa teks penyedia** |
| Langganan tidak aktif | `403` dari `pastikanLanggananAktif`, sebelum AI |
| Kuota AI habis | galat `pastikanKuota`, sebelum AI |
| Rate-limit | `429`, sebelum AI |
| Matching tak lengkap | Tetap `NEEDS_REVIEW` dengan syarat approval yang belum terpenuhi |
| `createVoyage` gagal (validasi, kuota voyage, relasi, tabrakan nomor) | Tidak retry otomatis. Service memeriksa `Voyage` ber-`sourceIntakeId` ini: ada → `COMPLETED` (rekonsiliasi); tidak ada → `FAILED` + `errorCode` + audit |
| Proses terputus saat `CREATING` | Klaim > 5 menit → rekonsiliasi saat dibuka/di-retry: voyage ber-`sourceIntakeId` ada → `COMPLETED`, tidak ada → `FAILED` (`CREATING_INTERRUPTED`) |
| Retry | Hanya dari `FAILED`, oleh approver, lewat CAS `FAILED → CREATING` sesudah pengecekan `sourceIntakeId`; duplikat & syarat dihitung ulang |
| Post-create (barge/cargo) gagal | `COMPLETED` + peringatan, tanpa rollback |
| Lampiran opt-in gagal | Intake tetap dibuat; peringatan; tanpa dokumen tersimpan |

## 22. Tenant Isolation

- `VesselCallIntake` terdaftar di `TENANT_MODELS`; semua akses lewat `forTenant(ctx)`; route memakai `withTenant` dan **tak pernah** membaca `tenantId` dari request.
- Kandidat kapal/principal/customer/port/voyage/intake hanya dari tenant pemanggil.
- Tidak meniru `/api/ai/portcall/draft` (prisma mentah + filter `tenantId` manual).
- Tanpa GRANT ke `maritime_portal`.
- `ENTITAS_DIDUKUNG` bertambah `VESSEL_CALL_INTAKE` (untuk lampiran opt-in), sehingga `pastikanEntitasMilikTenant` tetap membuktikan kepemilikan.
- FK: `VesselCallIntake.tenantId → Tenant` **CASCADE**; `VesselCallIntake.voyageId → Voyage` **SET NULL**. `Voyage.sourceIntakeId` sengaja **tanpa FK** (hindari siklus FK Voyage ↔ intake). Hapus-tenant diuji dengan eksperimen ROLLBACK (pelajaran PRD-002 Step 2).

## 23. PII / Data Retention

| Data | Dikirim ke LLM | Disimpan |
|---|---|---|
| Isi permintaan (teks/berkas) | Ya — hanya isi itu, tanpa data master tenant | **Tidak**, kecuali opt-in lampiran |
| Hash, jenis, nama berkas, ukuran | Tidak | Ya |
| Field operasional usulan (kapal, pihak, pelabuhan, tanggal, cargo, rujukan) | — | Ya (`proposal`) |
| `contact` (nama/email/telepon) | — | Hanya selama non-terminal, untuk prefill master; **dikosongkan** saat terminal |
| Prompt/respons AI mentah | — | **Tidak** disimpan, tidak di-log |
| Log server `[intake]` | — | Hanya id, kode, status, hitungan |
| Audit | — | Nilai field operasional; tanpa `contact`, tanpa isi dokumen |

Lampiran opt-in: `uploadAttachment` dengan `entityType=VESSEL_CALL_INTAKE`, `kind=GENERAL`, `sensitive=true`, tak pernah dibagikan ke portal; pilihan dibuat saat unggah (berkas tak ditahan di server tanpa opt-in). Teks tempelan opt-in disimpan sebagai `.txt`. Voyage menautkan dokumen asal lewat `sourceIntakeId`.

Sweep retensi baris intake terminal: **ditunda** (§32).

## 24. AI Quota / Subscription

Urutan di `submitIntake` (semua sebelum panggilan AI):
1. `requireAutomation` + flag intake
2. validasi berkas (jenis, ≤ 10 MB, `.xls` lama ditolak)
3. `pastikanLanggananAktif(ctx)`
4. cek hash intake aktif (kembalikan tanpa biaya)
5. `pastikanKuota(ctx, 'PANGGILAN_AI')`
6. `cekBolehPanggilAi` / `catatPanggilanAi`
7. ekstraksi (timeout 60 detik)
8. `catatPemakaian(ctx, 'INTAKE_EXTRACTED', { kind, classification })` — `NAMA_PERISTIWA` bertambah satu (daftar tertutup)

`PATCH` review, approve, reject, link **tidak** memanggil AI.

Perubahan kecil pada modul AI yang ada (aditif): `chatCompletion` saat ini tanpa timeout dan melempar `json.error.message`. Step 3 menambah parameter opsional `signal` yang diteruskan ke `fetch`; pemanggil lama tak berubah. Intake memetakan semua galat ke kode (§21) dan tak pernah meneruskan pesan penyedia.

## 25. Proposed Data Model

Opsi yang dibandingkan:

| Opsi | Audit | Idempotensi input | Keamanan approval | Traceability | Kompleksitas |
|---|---|---|---|---|---|
| A — Stateless (pola draf email K78) | Lemah (usulan ditolak hilang) | Tidak ada | Hanya andalkan `createVoyage` | Tidak ada tautan voyage ↔ permintaan | Rendah |
| **B — Satu tabel intake** | Ya (+ AuditLog) | Ya | Ya (CAS + unique) | Ya | **Sedang** |
| C — Intake + tabel run/event | Ya | Ya | Ya | Ya | Tinggi; riwayat transisi sudah dicakup AuditLog |

**Dipilih: B.**

```prisma
/// PRD-004 — permintaan kunjungan kapal yang diproses Automation Hub.
/// Bukan record operasional: Voyage hanya lahir lewat createVoyage() sesudah approval.
model VesselCallIntake {
  id       String  @id @default(cuid())
  tenantId String
  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  status         String   // NEEDS_REVIEW | CREATING | COMPLETED | LINKED_EXISTING | REJECTED | FAILED
  classification String   // NEW_NOMINATION | NEW_APPOINTMENT | NOT_RELEVANT | INSUFFICIENT_INFORMATION | UNSUPPORTED_REQUEST
  version        Int      @default(1)   // optimistic concurrency review ↔ approval

  inputKind       String  // TEXT | PDF | IMAGE | WORKBOOK | CSV
  inputHash       String
  activeHashKey   String? // = inputHash selama non-terminal, NULL saat terminal
  sourceFileName  String?
  sourceSizeBytes Int?
  attachmentId    String? // opt-in (D4)
  extractorVersion String

  proposal  Json    // FieldUsulan per field (§9), termasuk contact selama non-terminal
  matches   Json    // HasilCocok per entitas (§10)
  duplicateLevel String   // NO_DUPLICATE | POSSIBLE_DUPLICATE | LIKELY_DUPLICATE
  duplicateCandidates Json // snapshot ringkas kandidat (id, nomor, status, eta, port)

  duplicateDecision String? // CONTINUE_AS_NEW | LINK_EXISTING
  decisionReason    String?
  portalExposureAck Boolean @default(false)
  postCreateWarnings Json?
  errorCode         String?

  submittedByUserId String
  reviewedByUserId  String?
  reviewedAt        DateTime?
  claimedAt         DateTime?

  voyageId String?
  voyage   Voyage? @relation(fields: [voyageId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, activeHashKey])
  @@index([tenantId, status, createdAt])
  @@index([tenantId, inputHash])
}

model Voyage {
  // ... kolom yang ada tidak berubah ...
  /// PRD-004 — intake asal voyage ini. Unik per tenant: satu intake → maksimal satu voyage.
  /// Tanpa FK (hindari siklus FK Voyage ↔ VesselCallIntake).
  sourceIntakeId String?
  intakes VesselCallIntake[]

  @@unique([tenantId, sourceIntakeId])
}
```

Bentuk JSON (`proposal`, `matches`, `duplicateCandidates`) divalidasi fungsi murni sebelum ditulis dan saat dibaca (pola "typed columns + validated JSON" PRD-002 Step 1).

## 26. Migration Proposal

Satu migrasi aditif, contoh nama `2026MMDDhhmmss_prd004_vessel_call_intake`:
- `CREATE TABLE "VesselCallIntake"` + indeks + unique `(tenantId, activeHashKey)` + FK tenant CASCADE + FK voyage SET NULL.
- `ALTER TABLE "Voyage" ADD COLUMN "sourceIntakeId" TEXT` (nullable) + `CREATE UNIQUE INDEX` `(tenantId, sourceIntakeId)`.
- Tanpa DROP, tanpa `ALTER COLUMN`, tanpa `SET NOT NULL`, tanpa `UPDATE`/`DELETE`, tanpa GRANT.
- Voyage produksi kecil; `ADD COLUMN` nullable tanpa default = perubahan metadata saja di PostgreSQL.
- Rollback: build lama mengabaikan kolom & tabel; penghapusan fisik hanya manual sesudah dump.
- Uji statis: migrasi hanya menyentuh tabel baru + satu kolom & satu indeks di `Voyage`.

## 27. API / Service Boundary Proposal

```
src/lib/ai/vessel-call-extract.ts      deskriptor ekstraksi (K81), TANPA DB
src/services/intake/
  intake-policy.ts                     MURNI: normalisasi, validasi ekstraksi, matching bertingkat,
                                       aturan duplikat, provenance, transisi, syarat approval, hash
  intake-gate.ts                       MURNI: flag VESSEL_CALL_INTAKE_ENABLED (gagal tertutup)
  intake.service.ts                    submitIntake · listIntakes · getIntake · updateIntake (edit/pilih)
                                       approveIntake · rejectIntake · linkExistingIntake · retryIntake
```

| Route (semua `withTenant`) | Fungsi |
|---|---|
| `GET /api/automation/intakes` | daftar (status, klasifikasi, kapal, ETA, level duplikat) |
| `POST /api/automation/intakes` | multipart: `text` atau `file`, `saveOriginal`, `confirmReprocess` |
| `GET /api/automation/intakes/[id]` | detail review (tanpa `contact` pada status terminal) |
| `PATCH /api/automation/intakes/[id]` | edit field / pilih kandidat / tandai "biarkan kosong" / kaitkan master baru; wajib `version` |
| `POST /api/automation/intakes/[id]/approve` | `version`, `duplicateDecision`, `decisionReason`, `portalExposureAck`, konfirmasi |
| `POST /api/automation/intakes/[id]/reject` | `reason` wajib |
| `POST /api/automation/intakes/[id]/link` | `voyageId` kandidat (harus milik tenant & termasuk kandidat duplikat) |
| `POST /api/automation/intakes/[id]/retry` | hanya dari `FAILED` |

Perubahan kecil pada modul yang ada:
- `createVoyage(ctx, body, opsi?)` — `sourceIntakeId` opsional
- tambah `MANAJER_OPERASI` pada create-only (§16)
- `chatCompletion` menerima `signal` opsional
- `NAMA_PERISTIWA` + `INTAKE_EXTRACTED`
- `ENTITAS_DIDUKUNG` + `VESSEL_CALL_INTAKE`
- `TENANT_MODELS` + `VesselCallIntake`

## 28. UI Proposal

- **Sidebar Automation Hub**: tautan "Intake Kunjungan" (gerbang server-side yang sama dengan Hub).
- **`/automation/intake`**: tombol "Intake baru" (tab Tempel teks / Unggah berkas, centang simpan dokumen asli dengan keterangan PII); tabel intake dengan filter status.
- **`/automation/intake/[id]`**: panel Sumber · Klasifikasi · Field & provenance · Matching (per entitas, pemilih kandidat, "Buat baru" membuka dialog master yang ada, "Biarkan kosong") · Duplikat (kartu kandidat + keputusan) · Paparan portal · daftar syarat approval dari server · tombol Setujui / Tolak / Tautkan.
- **Sesudah `COMPLETED`**: tautan ke voyage, peringatan pasca-pembuatan, tombol "Mulai pemantauan" (flow 5B).
- **Halaman voyage**: baris kecil "Asal: Intake" bila `sourceIntakeId` terisi (hanya untuk peran Hub).
- Aksesibilitas & i18n mengikuti `components/automation/shared.tsx` (ikon + teks, EN/ID, waktu WITA).

## 29. Audit Requirements

`AuditLog` via `catatAudit` (+ `jejakDari(req).ipAddress`):

| Peristiwa | tableName / action | newValue (tanpa PII kontak & isi dokumen) |
|---|---|---|
| Submit | `VesselCallIntake` / `CREATE` | `inputKind`, hash 12 karakter, `classification`, `duplicateLevel`, `saveOriginal` |
| Edit/pilih | `VesselCallIntake` / `UPDATE` | medan berubah (lama→baru), basis pilihan, master dibuat reviewer (id) |
| Approve (klaim) | `VesselCallIntake` / `APPROVE` | `version`, `duplicateLevel` hasil hitung ulang, `duplicateDecision`, `decisionReason`, `portalExposureAck`, kandidat duplikat (id) |
| Voyage dibuat | `Voyage` / `CREATE` | `{ peristiwa: 'DIBUAT_DARI_INTAKE', intakeId }` |
| Selesai | `VesselCallIntake` / `UPDATE` | `status=COMPLETED`, `voyageId`, `postCreateWarnings` (kode) |
| Tautkan | `VesselCallIntake` / `UPDATE` | `status=LINKED_EXISTING`, `voyageId` |
| Tolak | `VesselCallIntake` / `UPDATE` | `status=REJECTED`, alasan |
| Gagal / rekonsiliasi / retry | `VesselCallIntake` / `UPDATE` | `status`, `errorCode` |

Kegagalan menulis audit keputusan approval **melempar** (pola `finance/audit.ts`).

## 30. Test Matrix

Uji mengikuti pola repo: `prisma/check-intake-policy.mjs` (murni), `prisma/check-intake-api.mjs` (HTTP + DB dev), dan ekstraksi dengan **AI palsu yang disuntikkan** (tanpa jaringan).

| Area | Kasus | Jenis |
|---|---|---|
| Ekstraksi | nominasi valid → `NEW_NOMINATION`, field lengkap | policy + api (AI palsu) |
| | nominasi tak lengkap → `INSUFFICIENT_INFORMATION` dipaksa sistem | policy |
| | permintaan ETA change / PDA → `UNSUPPORTED_REQUEST`, approve ditolak | policy + api |
| | field terhalusinasi (IMO/nama tak ada di teks) → dibuang `NOT_IN_SOURCE` | policy |
| | PDF/gambar → `UNVERIFIED_SOURCE` wajib konfirmasi | policy |
| | tanggal tahun 5 digit / luar rentang → dibuang | policy |
| | angka uang dalam output AI → diabaikan | policy |
| | instruksi tersembunyi dalam dokumen tak mengubah klasifikasi/aturan | policy (fixture) |
| Matching kapal | IMO exact · MMSI terverifikasi exact · MMSI tak terverifikasi → hanya kandidat · call sign ternormalisasi · call sign ganda → `AMBIGUOUS` · nama ambigu · nama tunggal → konfirmasi wajib · `NOT_FOUND` · `CONFLICT` (IMO vs call sign) · tug+barge → TUG utama | policy + api |
| Matching pihak/port | principal/customer nama badan usaha ternormalisasi · customer terhapus tak jadi kandidat · port UN/LOCODE · port tak ada → blok approval | policy + api |
| Tenant | kapal tenant lain (IMO sama) tak pernah cocok · customer tenant lain tak pernah cocok · intake tenant lain → `404` · voyage kandidat tenant lain tak muncul · link ke voyage tenant lain ditolak | api |
| Duplikat | kapal sama + ETA ±2 hari + pelabuhan sama → `LIKELY` · kapal sama + pelabuhan beda ±5 hari → `POSSIBLE` · voyage CLOSED/CANCELLED → `NO_DUPLICATE` · barge di VoyageVessel voyage lain → terdeteksi · intake aktif lain → `POSSIBLE` · `CONTINUE_AS_NEW` pada `LIKELY` tanpa alasan → `400` · voyage baru muncul setelah review → `409` saat approve | policy + api |
| Approval | ADMIN → sukses · MANAJER_OPERASI → sukses (createVoyage diperluas) · OPERATOR → `403` · VIEWER → `403` · tenant di luar allowlist → `404` · flag intake mati → `404` · `version` usang → `409` | api |
| Idempotensi | input sama dua kali → intake yang sama, 0 panggilan AI kedua · submit bersamaan identik → satu intake · input sama sesudah terminal → wajib `confirmReprocess` · double approve → satu voyage · 4 approve bersamaan → tepat satu `COMPLETED`, satu Voyage, sisanya `409` · unique `sourceIntakeId` menolak voyage kedua | api |
| Portal | customer tanpa akses portal → info saja · customer dengan PortalAccess aktif → approve tanpa ack `400` · tak ada tulisan tabel portal / `sharedToPortal` | api |
| Master baru | kapal dibuat lewat `POST /api/vessels` lalu dikaitkan → basis `CREATED_BY_REVIEWER` + audit · AI tak pernah membuat master (hitungan tabel master tetap sepanjang submit/edit) | api |
| Kegagalan | LLM timeout → tanpa baris/master/voyage, kode `AI_TIMEOUT`, tanpa teks penyedia · kuota AI habis · langganan tidak aktif · rate-limit `429` · `createVoyage` gagal (kuota voyage / relasi) → `FAILED` + audit, retry terkendali · `CREATING` terputus → rekonsiliasi · post-create barge/cargo gagal → `COMPLETED` + peringatan | api |
| PII & log | `contact` kosong sesudah terminal · audit tanpa `contact` · log `[intake]` tanpa email/telepon/isi dokumen · respons tanpa `tenantId` | api + statis |
| FK | hapus tenant (ROLLBACK) dengan intake + voyage ber-`sourceIntakeId` berhasil · voyage dihapus fisik → `intake.voyageId` NULL | api |
| Regresi | pembuatan voyage manual (OPERATOR) tetap · checklist otomatis tetap (port terisi) · Voyage Monitoring (`test:automation-api`) · portal (`test:portal`, `test:customer-portal`) · tenant guard (`test:tenant`) · `test:owner`, `test:quota`, `test:usage`, `test:voyage-vessels`, `test:vessel-identity`, `test:ais-contract`, `test:automation-policy` | suite |
| Statis | migrasi aditif & tanpa GRANT · intake tak memanggil `voyage.create/update` · `lib/ai/vessel-call-extract.ts` tanpa DB · tanpa URL/penyedia baru · `VesselCallIntake` di `TENANT_MODELS` | statis |

## 31. Security Risks

| Risiko | Mitigasi desain |
|---|---|
| Prompt injection dalam dokumen | K53 di prompt; klasifikasi & syarat approval deterministik; AI tak menerima data master; tak ada tool tulis |
| Salah identitas kapal (nama saja) | Tingkat matching; `NAME_ONLY_MATCH` wajib konfirmasi; `CONFLICT` memblokir |
| Voyage ganda | Aturan duplikat + hitung ulang saat approve + unique `sourceIntakeId` |
| Paparan portal tak disengaja | `customerId` hanya oleh reviewer; ack wajib bila ada akses portal |
| PII ke penyedia LLM | Minimisasi (hanya input); tanpa penyimpanan mentah; kontak dikosongkan saat terminal |
| Biaya AI | Langganan, kuota, rate-limit, cek hash sebelum AI |
| Perluasan peran `MANAJER_OPERASI` | Create-only; update/delete tetap; diuji |
| Tabrakan nomor voyage (tanpa lock) | Sudah ada unique DB → `FAILED` terkendali, bukan voyage ganda |
| Race review ↔ approve | `version` + CAS |

**SECURITY REMEDIATION BACKLOG** (tidak dikerjakan di PRD-004):
1. `POST /api/ai/spk/draft` — tanpa gerbang peran, kuota, langganan; meneruskan `e.message` penyedia.
2. `POST /api/ai/portcall/draft` — sama; prisma mentah dengan filter `tenantId` manual.
3. **Baru (Step 2):** `POST /api/principals` — tanpa gerbang peran (semua pengguna login termasuk VIEWER dapat membuat principal); prisma mentah.
4. `lib/ai/openrouter.ts` — tanpa timeout, meneruskan pesan galat penyedia ke pemanggil (sebagian ditangani aditif via `signal` untuk intake saja).
5. `services/input.ts` `tanggal()` — menerima tahun 5 digit (chip terpisah sebelumnya).

## 32. Deferred Scope

- Ingest otomatis (inbox/IMAP/Outlook/WhatsApp/webhook).
- Permintaan update: ETA change, ganti kapal, pembatalan, PDA/EPDA, invoice, vendor.
- Satu dokumen berisi beberapa kunjungan terpisah (sekarang `UNSUPPORTED_REQUEST`).
- Master Port/jetty/berth; alias nama kapal/pihak.
- Auto-start monitoring; notifikasi ke klien; aksi portal.
- Sweep retensi baris intake terminal & lampiran opt-in.
- `AgentRun` global / riwayat run lintas agen.
- Remediasi backlog keamanan §31.
- Kalibrasi ambang duplikat dengan data nyata.

## 33. Step 3 Implementation Scope

PRD-004 STEP 3 — LOCAL IMPLEMENTATION (tanpa deploy, tanpa push):

1. **Migrasi** §26 + skema §25 + `TENANT_MODELS` + `ENTITAS_DIDUKUNG` + `NAMA_PERISTIWA`.
2. **Kebijakan murni** `intake-policy.ts`, `intake-gate.ts`: normalisasi, validasi ekstraksi, matching bertingkat, duplikat, provenance, transisi, syarat approval, hash.
3. **Ekstraksi** `lib/ai/vessel-call-extract.ts` (deskriptor K81) + `signal` opsional di `chatCompletion` + pemetaan kode galat.
4. **Service** `intake.service.ts`: submit (gerbang → langganan → hash → kuota → rate-limit → AI → matching → duplikat → simpan), update, approve (CAS → `createVoyage` → best-effort `setVoyageVessels`/`createCargo` → selesai), reject, link, retry, rekonsiliasi `CREATING`.
5. **Perubahan kecil modul yang ada**: `createVoyage` `opsi.sourceIntakeId`; `MANAJER_OPERASI` create-only pada `createVoyage`, `setVoyageVessels`, `createCargo`, `createCustomer`, `POST /api/vessels`.
6. **Route** §27 (semua `withTenant`, tanpa `tenantId` dari request).
7. **UI** §28: daftar, form intake, layar review, integrasi dialog master yang ada, panel duplikat & portal, layar selesai + tombol monitoring, sidebar.
8. **Audit** §29.
9. **Flag** `VESSEL_CALL_INTAKE_ENABLED` di `.env.example` (bawaan mati).
10. **Uji** §30 (AI palsu tersuntik, tanpa jaringan) + regresi penuh + `tsc` + `next build`.
11. Satu commit lokal terfokus sesudah seluruh gerbang lulus.

## 34. Owner Decisions

Tidak ada keputusan owner tambahan yang diperlukan untuk Step 3. Hal yang tampak seperti keputusan telah diturunkan dari keputusan terkunci atau bukti repo:
- Perluasan create-only untuk `MANAJER_OPERASI` → turunan D3.
- Ambang duplikat 3/7 hari → konstanta di satu modul murni, dapat dikalibrasi tanpa perubahan desain.
- Lampiran opt-in dipilih saat unggah → konsekuensi D4 (berkas tak ditahan tanpa persetujuan).

## 35. Verdict

**READY FOR PRD-004 STEP 3 — LOCAL IMPLEMENTATION**
