# FASE 3 — Desain EPDA Engine (mesin hitung, revisi, approval)

> **Status: DESAIN untuk direview. Belum ada kode aplikasi yang ditulis.**
> Dibuat: 2026-08-11 · Induk: [ROADMAP-v2.md](./ROADMAP-v2.md) §6 · Acuan: [FASE-0-SKEMA-v2.md](./FASE-0-SKEMA-v2.md) · [POLA-SERVICE-LAYER.md](./POLA-SERVICE-LAYER.md)
> Dikerjakan dengan **Opus** sesuai ROADMAP §6b — fase ini menyentuh **uang** dan **mesin hitung**, dua dari tiga sinyal wajib-Opus.
>
> **Penomoran keputusan melanjutkan Fase 0** (yang berhenti di K10), jadi dokumen ini mulai dari **K11**. Rujukan K1–K10 selalu berarti keputusan Fase 0.
>
> **Cara memakai dokumen ini:** §14 adalah rencana kerja bertahap (3a–3g). Mulai dari 3a, jangan melompat. Setiap increment menyebutkan cara memverifikasinya. Kalau sebuah keputusan di sini terasa salah saat coding, **ubah dokumen ini dulu**, jangan menyimpang diam-diam — itu aturan §6b roadmap.
>
> ⚠️ **§15 berisi 14 pertanyaan yang SENGAJA tidak dijawab** karena jawabannya kebijakan bisnis Tribuana, bukan keputusan teknis. Lima di antaranya **memblokir** increment tertentu. Baca §15 sebelum mulai.

---

## 1. Masalah yang dipecahkan Fase 3

Fase 0 menyiapkan tempatnya, Fase 1 mengisi katalog & tarif, Fase 2 membuat hub-nya. Yang masih kosong: **jalur kode yang benar-benar menghasilkan angka**.

| Temuan sekarang | Bukti | Akibat |
|---|---|---|
| Belum ada satu pun `Disbursement` yang bisa dibuat dari UI | `VoyageFinancePanel.tsx` = placeholder, `_count.disbursements` selalu 0 | Voyage Workspace belum berguna secara finansial |
| EPDA nyata masih ditulis lewat jalur lama | `api/documents/epda` → `MaritimeDocument.lineItems` JSON, `qty` teks bebas | Tidak bisa dihitung, tidak bisa divariansi, tidak ada versi |
| `CalcMethod` sudah ada tapi tak ada yang membacanya | komentar di `service-catalog.service.ts`: *"rumus sesungguhnya jalan nanti di Fase 3"* | Katalog & tarif Fase 1 belum menghasilkan apa pun |
| 9 status `DisbursementStatus` tanpa aturan transisi | enum ada di schema, tak ada kode yang memakainya | Status bisa melompat sembarangan begitu ditulis |
| `rootId`/`version`/`supersededBy` tanpa mekanik | kolom ada, tak ada yang mengisinya | Revisi akan menimpa, persis masalah app A yang mau dipecahkan |
| `Approval` tanpa alur | model ada (immutable), tak ada yang membuat barisnya | EPDA keluar ke principal tanpa jejak persetujuan |

**Sasaran Fase 3:** operator memilih jasa dari katalog → angka muncul sendiri (tarif, mata uang, vendor, pajak) → total hidup → simpan DRAFT → review → approve → PDF dengan tata letak yang sama seperti sekarang. Target roadmap: **EPDA < 5 menit**.

**Sasaran yang TIDAK diambil di Fase 3** (biar batasnya jelas): Invoice (Fase 4), pembayaran/AR (Fase 4), prediksi biaya AI (Fase 6), kirim email (lihat P10 di §15 — belum ada mailer di repo ini).

---

## 2. Mesin hitung — arsitektur

### K11 — Mesin hitung = modul **murni tanpa impor**, diuji langsung oleh Node

`src/services/finance/calc-engine.ts` tidak boleh mengimpor apa pun kecuali `import type`. Tidak Prisma, tidak `forTenant`, tidak `ServiceError`, tidak tanggal-library.

Ini menyalin preseden yang sudah terbukti di repo ini: `src/services/tenant-guard.ts` sengaja tanpa impor supaya `prisma/check-tenant-guard.mjs` bisa mengimpornya langsung — sehingga **uji memakai objek yang persis sama dengan yang dipakai aplikasi, bukan tiruannya**. Alasan yang sama berlaku dua kali lipat untuk mesin uang.

**Sudah diverifikasi nyata** (bukan diasumsikan): Node 24.16 di mesin ini mengurai TypeScript sendiri, dan `import type { CalcMethod } from '@prisma/client'` **terhapus** saat stripping sehingga berkas `.ts` tetap bisa diimpor dari `.mjs` tanpa bundler. Uji coba: modul `.ts` dengan `import type` dari `@prisma/client` + satu fungsi murni, diimpor dari `.mjs`, jalan benar.

Konsekuensi yang harus dipatuhi:
- **`import type` saja.** Satu `import { X }` biasa (tanpa `type`) akan merusak `node prisma/check-epda-calc.mjs`. Uji itulah yang menangkapnya.
- Mesin hitung **tidak melempar `ServiceError`** (itu impor). Ia mengembalikan `warnings: CalcWarning[]`; service layer di atasnya yang memutuskan mana yang jadi `validation()` dan mana yang cuma peringatan di UI.
- Tidak ada `new Date()` di dalam mesin. Semua tanggal masuk sebagai argumen. (Fungsi yang bergantung jam sekarang tidak bisa diuji.)

**Bonus besar:** karena murni, **UI klien mengimpor modul yang sama** untuk total hidup di layar. Tidak ada rumus kembar antara server dan browser — sumber bug klasik pada form uang. Server tetap menghitung ulang saat simpan, dan **nilai server yang menang** (klien hanya pratinjau).

**Alternatif yang ditolak:** menaruh rumus di service yang menyentuh Prisma (tak bisa diuji tanpa DB, dan mustahil dipakai klien); menambah `vitest`/`jest` (repo ini belum punya test runner sama sekali — satu-satunya pola uji adalah skrip `.mjs`; menambah runner adalah keputusan tersendiri yang tidak perlu diambil untuk memulai Fase 3).

### K12 — Pemisahan tegas: **autofill** (sekali, menyentuh DB) vs **hitung** (murni, berulang)

Ini keputusan paling penting di §2 karena ia menghapus seluruh kelas ambiguitas *"apakah angka ikut berubah kalau ETD diedit?"*.

| Lapisan | Berkas | Kapan jalan | Boleh sentuh DB |
|---|---|---|---|
| **Autofill / resolusi** | `autofill.service.ts` | **hanya** saat baris dibuat, atau saat operator menekan **"Perbarui dari katalog"** | ya |
| **Mesin hitung** | `calc-engine.ts` | setiap kali baris/dokumen dihitung (simpan, render, pratinjau UI) | **tidak** |

Artinya: `quantity` dan `unitPrice` yang sudah tersimpan **otoritatif**. ETD berubah? Baris lama **tidak** ikut berubah sendiri. UI menampilkan tanda "durasi voyage berubah sejak baris ini dibuat — perbarui?" dan operator memutuskan. Ini sejalan dengan K5 (snapshot) dan menghindari dokumen yang nilainya bergerak sendiri di belakang operator.

### K13 — Invarian penyimpanan: `amount` selalu bisa diturunkan ulang dari kolom yang tersimpan

Aturan yang mengikat seluruh Fase 3:

```
amount = bulatkan( batasMinimum( f(calcMethod, quantity, unitPrice), minCharge ), decimals )
amountBase = bulatkan( amount × exchangeRate, decimalsBase )

f = quantity × unitPrice                 untuk semua calcMethod
  = quantity × unitPrice / 100           khusus PERCENTAGE
```

`quantity` menyimpan **seluruh pengali yang sudah dikalikan habis**, bukan satu komponennya. Jadi untuk `PER_GT_PER_DAY` dengan GT 8.432 dan 3 etmal: `quantity = 25296` (= 8432 × 3), `basis = "8.432 GT × 3 etmal"`.

Kenapa begitu: `days`, `calls`, dan GT **tidak punya kolom** di `DisbursementItem`. Kalau `quantity` hanya menyimpan GT, angka 3-etmal itu hilang dan `amount` tidak bisa diaudit maupun dihitung ulang — persis penyakit `qty` teks di app A, cuma dalam bentuk lebih halus. Dengan aturan ini, **tiga kolom (`calcMethod`, `quantity`, `unitPrice`) + `minCharge` selalu mereproduksi `amount` persis**, dan itu bisa diuji sebagai invarian (`verifikasiBaris()` di §14/3a).

`basis` adalah **teks untuk manusia dan PDF saja**. Tidak ada satu baris kode pun yang boleh mem-*parse* `basis`. (Larangan ini ditulis eksplisit karena `parseQty()` di `epda-data.ts` adalah kesalahan yang sedang kita tinggalkan.)

### K14 — `amount` tidak pernah diedit tangan; untuk memaksa angka, ubah `calcMethod` baris jadi `MANUAL`

Kolom `amount` selalu turunan. Operator yang ingin memaksa nominal tertentu pada baris Pilotage mengubah `calcMethod` baris itu (bukan katalognya) ke `MANUAL`, lalu isi `quantity = 1`, `unitPrice = nominal`. Sah karena `calcMethod` di `DisbursementItem` memang **snapshot** (K5) — miliknya baris itu, bukan cermin katalog.

Akibatnya `MANUAL` dan `PER_UNIT` beraritmatika identik (`q × p`); yang membedakan **dari mana angkanya datang**: `PER_UNIT` di-autofill dari `ServiceRate`, `MANUAL` tidak pernah di-autofill dan tidak pernah memunculkan peringatan "tarif tidak ditemukan". Itu memang beda yang berarti, dan tidak butuh kolom `isOverridden` baru.

### K15 — ⚠️ Satu penambahan skema yang dibutuhkan Fase 3: `DisbursementItem.minCharge Float?`

Tarif hasil seed sudah memakai `minCharge` (PILOTAGE: `minCharge: 2_500_000`). `ServiceRate.minCharge` **tidak** punya padanan snapshot di `DisbursementItem`. Akibat nyata kalau dibiarkan: begitu operator mengubah `quantity`, batas minimum hilang atau harus dibaca ulang dari `ServiceRate` yang mungkin sudah berubah — dua-duanya melanggar K5, dan invarian K13 patah (`amount ≠ f(q,p)`).

**Putusan: tambahkan `minCharge Float?` ke `DisbursementItem`.** Aditif, nullable, nol risiko — bentuk yang persis sama dengan M1/M2 Fase 0, dan wajib mengikuti prosedur K7 (backup → baseline → migrate) saat naik ke produksi.

**Alternatif yang ditolak:**
- *Baca ulang dari `ServiceRate` saat hitung* — melanggar K5; menaikkan tarif hari ini akan mengubah EPDA tahun lalu.
- *Tulis di `basis`* — memaksa mem-parse teks, dilarang K13.
- *Begitu minimum mengikat, ubah baris jadi `MANUAL`* — invarian tetap utuh dan **tanpa migrasi**, tapi perilakunya mengejutkan ("kok Pilotage saya jadi MANUAL sendiri?") dan menghilangkan kemampuan hitung ulang. Ini **fallback resmi** kalau ada alasan kuat untuk membekukan skema; kalau dipakai, tulis alasannya di dokumen ini.

### K16 — Formula per `CalcMethod` (spesifikasi lengkap)

Konteks yang diberikan autofill ke mesin hitung:

```ts
/** Semua nilai boleh null — mesin melaporkan warning, tidak melempar. */
export type KonteksVoyage = {
  gt: number | null            // Vessel.gt lewat Voyage.vesselId
  nrt: number | null           // Vessel.nrt (belum dipakai formula mana pun; disiapkan)
  etmal: number | null         // hasil hitungEtmal() — lihat K17
  calls: number                // default 1 (lihat K18)
  cargoTon: number | null      // Σ Cargo.quantity bersatuan ton — lihat K19
  basisPersen: number          // basis untuk PERCENTAGE, dalam baseCurrency — lihat K20
}
```

`quantityUsul` = nilai yang **di-autofill sekali** ke `DisbursementItem.quantity`. Sesudah tersimpan, mesin tidak pernah menurunkannya lagi (K12).

| `calcMethod` | `quantityUsul` | `f` | Butuh dari voyage | Diisi operator | `basis` (contoh) |
|---|---|---|---|---|---|
| `FLAT` | `1` (dipaksa; nilai lain ditolak) | `q × p` | — | — | `lump sum per call` |
| `PER_UNIT` | `1` | `q × p` | — | **jumlah unit** | `4 unit × Rp 6.250.000` |
| `PER_GT` | `gt` | `q × p` | `gt` | — | `8.432 GT` |
| `PER_GT_PER_CALL` | `gt × calls` | `q × p` | `gt`, `calls` | — | `8.432 GT × 1 call` |
| `PER_GT_PER_DAY` | `gt × etmal` | `q × p` | `gt`, `etmal` | (etmal bisa ditimpa) | `8.432 GT × 3 etmal` |
| `PER_DAY` | `etmal` | `q × p` | `etmal` | (bisa ditimpa) | `3 etmal` |
| `PER_HOUR` | `1` | `q × p` | — | **jumlah jam** | `6 jam` |
| `PER_TON` | `cargoTon` (usul saja) | `q × p` | `cargoTon` | sering ditimpa — lihat K19 | `6.000 MT` |
| `PERCENTAGE` | `basisPersen` | `q × p / 100` | `basisPersen` | — | `2,5% dari Rp 69.381.680` |
| `TIERED` | `1` | `q × p` | `gt` **untuk memilih baris tarif**, bukan untuk mengalikan | — | `bracket GT 5.001–10.000` |
| `MANUAL` | `1` | `q × p` | — | **quantity & unitPrice** | (diisi operator) |

Aturan tambahan yang tidak boleh ditebak sendiri oleh implementor:

1. **`FLAT` memaksa `quantity = 1`.** Kalau payload mengirim 3, itu `VALIDATION` ("jasa lump-sum tak punya kuantitas; pakai PER_UNIT"). Tanpa aturan ini `FLAT` dan `PER_UNIT` jadi tak terbedakan dan totalnya bisa 3× tanpa jejak.
2. **Nilai konteks yang `null` → `amount = 0` + warning, bukan lemparan.** Kode warning: `GT_TIDAK_ADA`, `ETMAL_TIDAK_ADA`, `TON_TIDAK_ADA`, `TARIF_TIDAK_ADA`, `TARIF_AMBIGU`, `KURS_TIDAK_ADA`, `MINIMUM_MENGIKAT`, `BASIS_PERSEN_NOL`. Baris dengan warning tetap bisa disimpan sebagai DRAFT (operator sering menyusun EPDA sebelum semua data lengkap) tapi **memblokir transisi ke `PENDING_REVIEW`** (§6/K30). Ini yang membuat EPDA setengah-matang tidak bisa naik ke approval.
3. **`quantity` negatif ditolak** (`VALIDATION`). `unitPrice` negatif **diizinkan** — dipakai untuk baris koreksi/diskon/refund pada FDA; ini nyata dan tidak boleh diblokir.
4. **`minCharge` diterapkan sesudah `f`, sebelum pembulatan** (K13). Kalau mengikat → warning `MINIMUM_MENGIKAT` supaya operator tahu kenapa angkanya tidak sama dengan `q × p` (dan bukan mengira ada bug).
5. Hanya `PERCENTAGE` yang membagi 100. Tidak ada `calcMethod` lain yang boleh punya cabang khusus di `f` — kalau muncul kebutuhan baru, itu enum baru, bukan `if` baru.

### K17 — Durasi (`etmal`): estimasi untuk EPDA, aktual untuk FDA

```ts
export function hitungEtmal(mulai: Date | null, selesai: Date | null): number | null
// null bila salah satu kosong atau selesai < mulai
// jam / 24, dibulatkan KE ATAS, minimum 1
```

Pemilihan tanggalnya (di `autofill.service.ts`, bukan di mesin):

| `kind` | mulai | selesai | fallback |
|---|---|---|---|
| `EPDA` / `FPDA` | `voyage.etb ?? voyage.eta` | `voyage.etd ?? voyage.etc` | tak ada → `etmal = null` + warning |
| `FDA` | `voyage.atb ?? voyage.ata` | `voyage.atd` | jatuh ke tanggal estimasi + warning `PAKAI_TANGGAL_ESTIMASI` |

Pembulatan ke atas + minimum 1 mengikuti praktik **etmal** pelabuhan Indonesia (1 etmal = 24 jam, kurang dari 24 jam dihitung 1 etmal), dan cocok dengan dokumen nyata Tribuana yang berbunyi *"per GT per etmal × 3"* untuk kunjungan 3 hari. Tetap: **ini asumsi tarif, bukan matematika** → **P6 di §15**. Dibuat satu fungsi murni dengan satu titik pembulatan supaya kalau aturannya beda per pelabuhan, yang diubah cuma satu tempat.

### K18 — `calls` = 1, tetap, sampai ada bukti sebaliknya

`PER_GT_PER_CALL` mengalikan `calls`. Satu `Voyage` sekarang bisa punya banyak `PortCall`, jadi "call" bisa berarti (a) 1 karena satu EPDA = satu kunjungan pelabuhan, atau (b) jumlah `PortCall` di voyage itu.

**Putusan: `calls = 1` konstan**, dan operator boleh menimpa `quantity` bila memang 2 kali gerakan. Alasan: satu-satunya voyage nyata di DB punya satu port call, dan mengalikan otomatis dengan jumlah port call akan **menaikkan tagihan tanpa diminta** — arah kesalahan yang paling mahal. Kalau ternyata Tribuana membuat satu EPDA untuk multi-port call, ini berubah (**P7 di §15**), dan perubahannya satu baris di `autofill.service.ts`.

### K19 — `PER_TON` mengusulkan tonase kargo, tapi **tidak memaksanya**

`cargoTon` = Σ `Cargo.quantity` untuk baris yang satuannya, setelah di-`trim`+`toUpperCase`, ada di `{ MT, TON, TONS, TONNE, TONNES, T, METRIC TON }`. Satuan lain (`m3`, `TEU`, `KL`) **diabaikan** dan memunculkan warning `SATUAN_KARGO_BUKAN_TON`.

Contoh nyata dari DB: cargo hasil backfill adalah **"B40, 6000 KL"** — kiloliter, satuan volume. Mengubah KL → MT butuh densitas produk, dan menebak densitas berarti menebak uang. **Tidak dikonversi otomatis, sekarang maupun nanti** (**P13 di §15** kalau Tribuana mau tabel densitas).

Catatan penting yang mudah salah: seed memberi `FRESH_WATER` `calcMethod = PER_TON`, tapi yang dimaksud **ton air bersih**, bukan tonase kargo. Karena itu `cargoTon` selalu hanya **usul yang bisa diedit**, dengan label sumbernya di UI ("dari Cargo: 6.000 MT"). Mesin tidak pernah menurunkannya ulang (K12), jadi operator yang mengganti 6.000 → 25 (ton air) tidak akan tertimpa balik.

### K20 — Basis `PERCENTAGE`: total semua baris **non-PERCENTAGE**, dalam `baseCurrency`, dua-lintasan

```
basisPersen = Σ amountBase  untuk semua item dalam disbursement ini yang calcMethod ≠ 'PERCENTAGE'
```

- Dihitung **dua lintasan**: lintasan 1 semua baris non-persen, lintasan 2 baris persen. Deterministik, tidak tergantung `displayOrder`, tidak ada persen-dari-persen.
- **Baris `PERCENTAGE` wajib memakai `baseCurrency` disbursement** (`exchangeRate = 1`, ditegakkan `VALIDATION`). Persentase dari total campuran mata uang tak punya arti tunggal, dan aturan ini menjaga invarian K13 tetap utuh (`quantity = basis dalam baseCurrency`, `unitPrice = persen`).
- Basis 0 → `amount = 0` + warning `BASIS_PERSEN_NOL`.
- **Pajak tidak masuk basis.** PPN dihitung per baris dari `taxable`/`taxPct` (K22), bukan sebagai baris `PERCENTAGE`.

**Alternatif yang ditolak:** basis = subtotal seksi A+B+C saja (mengecualikan D) — tampak "wajar" tapi tidak ada apa pun di kode/dokumen yang mendukungnya, dan menebak basis agency fee = menebak pendapatan Tribuana. Basis yang benar → **P5 di §15**.

### K21 — Agency fee hidup di **header** (`agencyPct`/`agencyAmount`), bukan sebagai baris item

Ada tabrakan nyata di skema+seed: `Disbursement` punya `agencyPct`/`agencyAmount` di header **dan** seed membuat jasa `AGENCY_FEE` dengan `calcMethod = PERCENTAGE`, `rate = 2.5`. Kalau dua-duanya dipakai, agency fee **terhitung dua kali** dan EPDA-nya salah — ke arah yang menguntungkan Tribuana, yang justru paling merusak kepercayaan principal saat ketahuan.

**Putusan: header adalah satu-satunya sumber agency fee.**
- Alasan: PDF yang sudah dipakai mencetak `Agency handling {agencyPct}%` sebagai **baris total**, terpisah dari seksi A–D (`EpdaDocument.tsx`); `Tenant.defaultAgencyPct` sudah ada sejak app A; `computeTotals()` lama juga menghitungnya dari header. Memindahkannya ke item = mengubah tata letak PDF nyata tanpa alasan.
- Penegakan: menambahkan item dengan `serviceCode === 'AGENCY_FEE'` ditolak `VALIDATION` yang menyebut penggantinya ("atur % di header dokumen"). Kodenya satu konstanta `KODE_AGENCY_FEE = 'AGENCY_FEE'` di satu berkas.
- `calcMethod = PERCENTAGE` **tetap sah** untuk baris lain (mis. pungutan berbasis persen dari pihak ketiga). Yang dilarang cuma jasa agency fee itu sendiri.
- `agencyAmount = bulatkan(subtotalBase × agencyPct / 100)`; `agencyPct` awal diambil dari `Tenant.defaultAgencyPct`, bisa diubah per dokumen selama masih editable.
- Skala/minimum agency fee per GT (dokumen nyata menulis *"per GT scale, min. applied"*) **tidak diimplementasikan** — itu tabel tarif yang belum kita punya (**P5**).

### K22 — Pajak per baris, dijumlahkan ke header; tarif pajak **selalu dari data**, tak pernah di-hardcode

```
item.taxAmount = taxable ? bulatkan(amount × taxPct / 100, decimals) : null
```

- `taxable` dan `taxPct` di-snapshot dari `ServiceCatalog` saat baris dibuat (K5). **Tidak ada angka 11 atau 12 di dalam kode.** Kalau `taxable = true` tapi `taxPct` kosong → `VALIDATION` saat submit (bukan diam-diam 0).
- `Disbursement.taxAmount = Σ item.taxAmount (dalam base) + pajak atas agencyAmount bila jasa agency fee ber-`taxable`` (seed: `AGENCY_FEE` `taxable: true, taxPct: 11`).
- `grandTotal = subtotal + agencyAmount + taxAmount`, semuanya `baseCurrency`.
- ⚠️ PDF yang ada **tidak punya baris pajak** (hanya Subtotal → Agency handling → Total). Kalau `taxAmount > 0`, `EpdaData` butuh satu baris tambahan. Perubahan kecil dan aditif di `EpdaDocument.tsx`, tapi **sadari itu menyentuh tata letak dokumen resmi** → dikerjakan di increment 3d, bukan diselipkan.
- Apakah PPN memang muncul di EPDA (bukan cuma di Invoice), berapa tarifnya, dan jasa mana saja yang kena → **P4 di §15**. Mesin siap; angkanya bukan urusan mesin.

### K23 — Pembulatan: per baris, memakai `Currency.decimals`, `subtotal` = jumlah baris yang **sudah** dibulatkan

- Bulatkan di **tingkat baris** (`amount`, lalu `amountBase`), bukan di akhir. `subtotal` = Σ baris yang sudah bulat. Kalau dibulatkan di akhir, total di PDF tidak sama dengan jumlah kolom yang dicetak — pertanyaan pertama yang diajukan principal.
- `decimals` dari `Currency.decimals` (seed: IDR 0, USD/SGD 2). Mata uang tak terdaftar → `VALIDATION` (bukan asal 2).
- Pembulatan: **half-up pada nilai absolut** (`Math.sign(n) * Math.round(Math.abs(n) * 10^d) / 10^d`) supaya baris koreksi negatif (K16/3) tidak berperilaku beda arah dari yang positif — `Math.round(-0.5)` = `-0` di JS, jebakan klasik.
- `Float` dipertahankan (bukan `Decimal`): seluruh skema Fase 0 sudah `Float`, mengubahnya sekarang bukan aditif dan menyentuh semua kolom uang. Dengan pembulatan per baris ke desimal mata uang, galat `Float` tidak pernah muncul di angka yang tercetak. Ditinjau ulang kalau nanti ada rekonsiliasi sen-per-sen di Fase 4.

---

## 3. Autocomplete — urutan resolusi tarif, vendor, mata uang

Ini "smart autocomplete" yang dijanjikan roadmap. Semuanya jalan **sekali**, saat baris dibuat (K12).

### K24 — `tanggalJasa`: satu tanggal untuk memilih tarif **dan** kurs

```
tanggalJasa(EPDA/FPDA) = voyage.eta ?? voyage.ata ?? disbursement.issuedAt ?? sekarang
tanggalJasa(FDA)       = voyage.ata ?? voyage.atb ?? voyage.eta ?? disbursement.issuedAt ?? sekarang
```

Bukan "hari ini". Alasannya tertulis di dokumen Tribuana sendiri, di catatan EPDA nyata: *"Government tariffs follow PP/PM rates prevailing at the time of the call."* Tarif yang berlaku adalah tarif **saat kunjungan**, bukan saat pengetikan. Satu fungsi (`tanggalJasa()`), dipakai baik oleh pemilih tarif maupun pemilih kurs, supaya keduanya tak pernah memakai tanggal berbeda pada dokumen yang sama.

### K25 — Pemilihan `ServiceRate`: saring dulu, skor, lalu tie-break yang eksplisit

**Langkah 1 — saring kandidat** (`serviceId` = jasa yang dipilih; tenant dipagari `forTenant`):

| Kolom | Syarat lolos |
|---|---|
| `effectiveFrom` | `≤ tanggalJasa` |
| `effectiveTo` | `null` **atau** `≥ tanggalJasa` |
| `portId` | `= voyage.portId` **atau** `null` (umum) |
| `vesselType` | `= vessel.vesselType` **atau** `null` |
| `gtMin` / `gtMax` | `gtMin ≤ gt ≤ gtMax`, batas `null` = tak terbatas. **Kalau `gt` kosong**, hanya baris tanpa bracket yang lolos |

**Langkah 2 — skor spesifisitas** (makin spesifik makin menang):

| Kecocokan | Poin |
|---|---|
| `portId` sama persis (bukan `null`) | **+4** |
| `vesselType` sama persis | **+2** |
| punya bracket GT (`gtMin` atau `gtMax` terisi) | **+1** |

Bobot 4 > 2+1 disengaja: **tarif khusus pelabuhan selalu mengalahkan** kombinasi apa pun dari kecocokan lain. Tarif pelabuhan itu regulasi lokal; jenis kapal dan bracket GT adalah pemodelan kita sendiri.

**Langkah 3 — tie-break**, berurutan: `effectiveFrom` terbaru → `createdAt` terbaru → `id` terkecil (biar deterministik & bisa diuji).

**Langkah 4 — jujur soal ambiguitas:** kalau dua kandidat teratas berskor sama **dan** ber-`effectiveFrom` sama, ambil yang pertama menurut tie-break **dan** munculkan warning `TARIF_AMBIGU` berisi kedua id. UI menampilkannya sebagai peringatan yang bisa diklik ("2 tarif bersaing — periksa Master Tarif"). Memilih diam-diam di antara dua tarif uang yang sah adalah tepat jenis kesalahan yang tak akan pernah ada yang menyadarinya.

Bagian skor + tie-break ini **murni** (`pilihTarif(kandidat[], konteks)` di `rate-resolver.ts`, tanpa impor) sehingga bisa diuji dengan array bikinan tanpa DB. Query-nya sendiri ada di `autofill.service.ts`.

### K26 — `TIERED` = bracket sebagai fitur **resolusi tarif**, bukan aritmatika

Ambiguitas nyata: "tiered" bisa berarti (a) tarif bracket = lump sum untuk band GT itu, atau (b) tarif bracket = tarif per-GT yang berlaku di band itu.

**Putusan yang menghapus ambiguitasnya secara struktural:** bracket GT di K25 langkah 1 berlaku untuk **semua** `calcMethod`. Maka:
- Kasus (b) sudah bisa dinyatakan sebagai `PER_GT` dengan beberapa baris `ServiceRate` yang ber-bracket GT — **tanpa** `TIERED`.
- Maka `TIERED` cukup berarti kasus (a): **`quantity = 1`, `amount = rate` bracket terpilih** (lump sum per band). `basis` mencetak bracket-nya (`"bracket GT 5.001–10.000"`) supaya principal bisa memeriksa.

Skala agency fee Tribuana termasuk (a) atau (b) → bagian dari **P5 di §15**. Yang penting: kedua bentuk sudah bisa dinyatakan tanpa mengubah kode, jadi jawaban Marlon nanti cuma soal mengisi Master Tarif.

### K27 — Vendor, mata uang, satuan, pajak, seksi: urutan spesifik → umum

Saat baris dibuat untuk sebuah `ServiceCatalog`:

| Field item | Urutan resolusi | Catatan |
|---|---|---|
| `unitPrice` | `ServiceRate.rate` terpilih → **0 + warning `TARIF_TIDAK_ADA`** | tidak pernah menebak |
| `minCharge` | `ServiceRate.minCharge` → `null` | snapshot (K15) |
| `currency` | `ServiceRate.currency` → `ServiceCatalog.defaultCurrency` → `Disbursement.baseCurrency` | tarif menang: tarif SGSIN wajar ber-SGD walau katalog bawaan IDR |
| `vendorId` | **payload operator** → `ServiceCatalog.defaultVendorId` → `null` | `ServiceRate` tak punya kolom vendor; kalau nanti perlu vendor per pelabuhan, itu penambahan skema tersendiri (bukan Fase 3) |
| `unit` | `ServiceCatalog.defaultUnit` → `null` | teks tampilan |
| `taxable`, `taxPct` | `ServiceCatalog` | snapshot (K22) |
| `category`, `sectionLetter` | `ServiceCatalog` | menjaga pengelompokan PDF A–D |
| `description` | `ServiceCatalog.serviceName` | boleh diedit operator sesudahnya |
| `displayOrder` | `ServiceCatalog.displayOrder`, lalu urutan penambahan | |
| `calcMethod` | `ServiceCatalog.calcMethod` | snapshot; boleh diubah per baris (K14) |

**Tarif tidak ditemukan TIDAK memblokir penyimpanan DRAFT.** Baris tersimpan `unitPrice = 0` + warning, dan warning itu memblokir submit ke review (K30). Alasannya praktis: operator sering menyusun kerangka EPDA sebelum tarif resmi masuk — dan 19 tarif contoh hasil seed memang belum tarif resmi (**P8**). Memblokir di sini akan menghentikan pekerjaan; memblokir di submit menghentikan **dokumen salah keluar**. Itu tempat pagar yang benar.

### K28 — Template (`ServiceTemplate`) = pintu "isi sekaligus", bukan entitas yang dilacak

Operator memilih template → sistem menjalankan autofill untuk setiap `ServiceTemplateItem` (memakai `defaultQty` sebagai `quantity` bila terisi, kalau tidak pakai `quantityUsul` K16) → semua baris masuk sebagai item biasa. `templateId` **tidak disimpan** di `Disbursement` — sengaja, sudah jadi keputusan tertulis di kepala `service-template.service.ts` ("Tak ada dokumen yang menyimpan templateId"). Template boleh dipakai berkali-kali dan digabung dengan penambahan manual; baris ganda (jasa yang sama dua kali) **diizinkan** dengan peringatan lunak di UI — kadang memang ada dua gerakan pandu yang ditagih terpisah.

---

## 4. Multi-currency & semantik snapshot

### K29 — Kurs di-snapshot **saat baris disimpan**, dan tidak pernah bergerak sendiri sesudahnya

| Momen | Yang terjadi pada `exchangeRate` |
|---|---|
| Baris dibuat / diubah (status masih editable) | di-snapshot ulang dari `getLatestRate(ctx, item.currency, disb.baseCurrency, tanggalJasa)` |
| Transisi status apa pun (submit/approve/sent) | **tidak disentuh** |
| `revise()` membuat versi baru | **disalin apa adanya**; ada opsi eksplisit "segarkan tarif & kurs" yang **mati secara bawaan** (K36) |
| FDA dibuat dari EPDA | di-snapshot **ulang** memakai `tanggalJasa(FDA)` — FDA soal uang yang benar-benar keluar |

Kenapa saat simpan baris dan bukan saat finalisasi: kalau kurs baru dijepret saat approve, `amountBase` yang dilihat approver **bukan** yang dilihat operator, dan total bisa berubah di antara "ajukan" dan "setujui" tanpa ada yang mengubah apa pun. Approver harus menyetujui angka yang benar-benar dilihatnya.

### K30 — Kurs tidak ada: **tolak simpan**, jangan pernah diam-diam pakai 1

Tiga kasus, urut:

1. `item.currency === disb.baseCurrency` → `exchangeRate = 1`, **tanpa query**. (Kasus mayoritas: semua IDR.)
2. Ada baris `ExchangeRate` → pakai `rate` dari `getLatestRate(...)`, yang sudah ada di `exchange-rate.service.ts` dan memang sudah `effectiveDate ≤ asOf` + `desc`. **Jangan tulis pencari kurs baru.**
3. Tidak ada → **`VALIDATION`**: *"Kurs USD → IDR per 28 Jun 2026 belum ada. Tambahkan di Master › Kurs, atau isi kurs manual pada baris ini."* Penyimpanan baris **gagal**, kecuali payload menyertakan `exchangeRate` eksplisit (override operator) — yang dicatat ke `AuditLog` dengan `action = 'UPDATE'` dan penanda override.

`getLatestRate` melempar `NOT_FOUND`; service Fase 3 **menangkapnya** dan menerjemahkan jadi `VALIDATION` dengan pesan di atas — `NOT_FOUND` di sini akan tampil sebagai 404 dan membingungkan (operatornya tidak salah URL, dia cuma kurang data).

Default 1 secara diam-diam adalah kegagalan terburuk yang mungkin di modul ini: satu baris USD 12.000 akan tercatat Rp 12.000 alih-alih ~Rp 195 juta, dan totalnya tetap "kelihatan wajar". Karena itu dilarang keras, bukan cuma tidak disarankan.

**Kurs terbalik tidak dihitung otomatis.** Kalau yang ada di master cuma IDR→USD sementara yang dibutuhkan USD→IDR, sistem **tidak** membalik (1/rate) sendiri — pembulatan kurs terbalik menghasilkan selisih yang muncul lagi di rekonsiliasi. Operator memasukkan pasangan yang dibutuhkan.

### K31 — `baseCurrency` diwarisi dari `Voyage` dan dibekukan sejak baris pertama masuk

`Disbursement.baseCurrency` = `voyage.baseCurrency` saat dokumen dibuat. Boleh diubah **hanya** selagi dokumen masih `DRAFT` **dan** belum punya item. Sesudah ada item, mengubahnya berarti menghitung ulang seluruh snapshot — yaitu membuang alasan adanya snapshot. Kalau mata uang dasarnya salah: buat dokumen baru (masih DRAFT, murah), jangan ubah.

---

## 5. Docnumber

### K32 — Mekanisme **paralel di service layer**, bukan memperluas Prisma extension

`lib/doc-number.ts` + extension di `lib/prisma.ts` menomori `MaritimeDocument` otomatis saat `create`. Untuk `Disbursement`: **jangan** dipasang ke extension.

Alasan:
1. Extension itu berkunci pada `maritimeDocument.create` + `docType`; `Disbursement` memakai `kind` + butuh sufiks revisi (K35). Menaruhnya di extension berarti logika revisi ikut masuk ke ORM.
2. Urutannya dihitung dengan `count()` per bulan. Untuk revisi yang lahir di bulan berbeda dari induknya, `count()` bukan sumber yang benar. Presedennya sudah ada dan lebih baik: `nextVoyageNumber()` di `voyage.service.ts` mem-parse nomor **terbesar** (`findFirst` + `orderBy desc`), tahan terhadap soft-delete.
3. Fase 0 sudah memutuskan logika bisnis tinggal di `src/services/` (`POLA-SERVICE-LAYER.md` §1). Sihir di dalam ORM adalah kebalikannya.

Yang **tetap dipakai ulang**: `formatDocNumber()` dan `monthWindow()` dari `lib/doc-number.ts` — formatnya satu, jangan ada string format kedua di repo.

```
EPDA/2026/06/0142        ← v1
EPDA/2026/06/0142-R1     ← revisi 1 (nomor induk dipertahankan, lihat K35)
```

| `kind` | prefix | reset |
|---|---|---|
| `EPDA` | `EPDA` | per tenant, per bulan, 4 digit |
| `FDA` | `FDA` | idem |
| `FPDA` | `FPDA` | idem — **tapi lihat P3**: `lib/doc-number.ts` lama memetakan `FPDA → 'FDA'`, jadi FPDA/FDA belum jelas bedanya |

Nomor diterbitkan **saat dokumen dibuat** (masih DRAFT), sama seperti app A (K1: ikuti konvensi app A). Konsekuensi yang diterima: DRAFT yang dibatalkan meninggalkan lubang nomor. Itu wajar untuk dokumen keuangan (nomor hilang lebih baik daripada nomor didaur-ulang) dan sama dengan perilaku sekarang.

Risiko tabrakan nomor pada operasi bersamaan **diterima secara sadar**, konsisten dengan `nextVoyageNumber()` dan `lib/doc-number.ts`: app ini dipakai satu-dua operator. `@@unique([tenantId, docNumber])` menjadikan tabrakan sebagai kegagalan yang keras dan terlihat (P2002 → `CONFLICT` "coba simpan ulang"), bukan data rusak yang senyap.

### K33 — ⚠️ Gating langganan **tidak** ikut terbawa — harus dipanggil eksplisit

Temuan saat membaca `lib/prisma.ts`: pemeriksaan `tenantAccess(...).locked` (trial/langganan habis → tak boleh membuat dokumen) hanya terpasang di `maritimeDocument.create`. `forTenant()` memang dibangun di atas klien ber-extension itu, **tapi** membuat `Disbursement` tidak melewati blok tersebut. Tanpa tindakan, tenant yang langganannya habis tetap bisa menerbitkan EPDA lewat modul baru — kebocoran monetisasi, bukan cuma kerapian.

**Putusan:** `disbursement.service.ts` memanggil `pastikanLanggananAktif(ctx)` (pembungkus tipis atas `tenantAccess` dari `lib/billing/access`) di **setiap** fungsi yang membuat dokumen atau menaikkan statusnya. Ditulis sebagai satu helper supaya modul Fase 4 (Invoice) tinggal memakai yang sama.

---

## 6. Mesin status (lifecycle)

### K34 — Graf transisi eksplisit; apa pun yang tak tercantum = ditolak

Tabel ini **satu-satunya sumber kebenaran**, diimplementasikan sebagai konstanta murni di `disbursement-status.ts` (bisa diuji tanpa DB).

| Dari | Ke | Dipicu oleh | Syarat |
|---|---|---|---|
| `DRAFT` | `PENDING_REVIEW` | penyusun (`OPERATOR`/`ADMIN`) | ≥1 item, **nol warning pemblokir** (K30/§K16-2), `grandTotal > 0` |
| `DRAFT` | `CANCELLED` | penyusun / `ADMIN` | — |
| `PENDING_REVIEW` | `APPROVED` | approver | semua level kebijakan approval terpenuhi (K38) |
| `PENDING_REVIEW` | `REVISION_REQUESTED` | approver (`decision = REQUEST_REVISION`) | — |
| `PENDING_REVIEW` | `DRAFT` | penyusun ("tarik kembali") | **belum ada** baris `Approval` untuk versi ini |
| `PENDING_REVIEW` | `CANCELLED` | `ADMIN` | — |
| `REVISION_REQUESTED` | `PENDING_REVIEW` | penyusun (ajukan ulang) | syarat sama dengan submit |
| `REVISION_REQUESTED` | `CANCELLED` | `ADMIN` | — |
| `APPROVED` | `SENT` | operator ("tandai terkirim ke principal") | — |
| `APPROVED` | `REVISION_REQUESTED` | `ADMIN` | ronde approval berikutnya wajib penuh (K38) |
| `APPROVED` | `CANCELLED` | `ADMIN` | — |
| `SENT` | `REVISED` | **otomatis** oleh `revise()` | versi penerus berhasil dibuat |
| `SENT` | `FINAL` | operator — **`FDA` saja** (K35) | — |
| `SENT` | `CLOSED` | operator / otomatis Fase 4 | — |
| `FINAL` | `CLOSED` | otomatis Fase 4 (invoice lunas) atau manual `ADMIN` | — |
| `REVISED` | — | **tidak ada** | terminal; hanya versi penerus yang hidup |
| `CLOSED` | — | tidak ada | terminal |
| `CANCELLED` | — | tidak ada | terminal |

Aturan pelengkap:
- **`REVISED` berarti "sudah disalip versi lebih baru"**, bukan "sudah direvisi dan ini yang terbaru". Konsekuensinya `supersededBy` selalu terisi pada baris ber-status `REVISED`, dan itu bisa diuji sebagai invarian. Tafsir kebalikannya ditolak karena membuat `supersededBy` tak bermakna.
- **Revisi bukan untuk perbaikan internal.** Selagi dokumen belum `SENT`, koreksi jalan lewat lingkaran `PENDING_REVIEW → REVISION_REQUESTED → PENDING_REVIEW` **pada versi yang sama**. Versi baru hanya lahir untuk dokumen yang sudah keluar ke principal. Kalau tidak, setiap salah ketik internal menghasilkan versi baru dan riwayat yang dilihat principal jadi sampah.
- Transisi mundur dari `APPROVED`/`SENT` ke `DRAFT` **tidak ada**. Dokumen yang sudah disetujui tidak pernah jadi draft lagi; jalurnya `REVISION_REQUESTED` (belum terkirim) atau versi baru (sudah terkirim).
- `CANCELLED` ≠ hapus. Hapus tetap **soft delete** (`deletedAt`) sesuai aturan #4 `POLA-SERVICE-LAYER.md`, dan hanya diizinkan untuk `DRAFT` yang belum pernah punya item — sama semangatnya dengan `removeVoyage()` yang menolak menghapus voyage yang sudah punya aktivitas.
- Setiap transisi menulis satu baris `AuditLog` (`action = 'UPDATE'`, `oldValue = {status}`, `newValue = {status}`). Ini juga yang dipakai K38 untuk mengetahui kapan ronde approval terakhir di-reset.

### K35 — Subset status per `kind`

| Status | `EPDA` | `FPDA` | `FDA` |
|---|---|---|---|
| `DRAFT` → `PENDING_REVIEW` → `APPROVED` | ✅ | ✅ | ✅ |
| `SENT` | ✅ (ke principal, minta dana muka) | ✅ | ✅ (ke principal, penyelesaian) |
| `REVISION_REQUESTED` / `REVISED` | ✅ | ✅ | ✅ |
| `FINAL` | ❌ **tidak dipakai** | ❌ | ✅ |
| `CLOSED` | ✅ (saat FDA voyage ini `FINAL`, atau manual) | ✅ | ✅ (saat invoice lunas — Fase 4) |
| `CANCELLED` | ✅ | ✅ | ✅ |

Jawaban langsung atas pertanyaan "apakah FDA punya `SENT` seperti EPDA?" — **ya**, dan itu bahkan lebih penting: FDA dikirim ke principal untuk penyelesaian saldo. Yang **tidak** dimiliki EPDA adalah `FINAL`: sebuah estimasi tidak pernah menjadi "final", ia digantikan oleh FDA. `FINAL` pada FDA berarti "angkanya sudah disepakati, terkunci, siap ditagihkan" — dan itulah **satu-satunya gerbang** dari mana Invoice boleh dibuat (K42).

`FPDA` diperlakukan identik dengan EPDA sampai P3 dijawab.

### K36 — Editability ditentukan status, satu fungsi, satu tempat

```ts
export const BOLEH_UBAH_ITEM: ReadonlySet<DisbursementStatus> = new Set(['DRAFT', 'REVISION_REQUESTED'])
```

- Item (tambah/ubah/hapus): hanya pada `DRAFT` & `REVISION_REQUESTED`.
- Header ringan (`notes`, `validUntil`, `revisionNote`): sama.
- `agencyPct`: sama (ia mengubah uang).
- `baseCurrency`: `DRAFT` **dan** belum ada item (K31).
- Di luar itu: `CONFLICT` — *"Dokumen ber-status APPROVED tidak bisa diubah. Buat revisi (versi baru) atau minta revisi."* Pakai `CONFLICT`, bukan `FORBIDDEN`: ini soal keadaan dokumen, bukan hak pengguna.
- Setiap fungsi tulis item **wajib** memanggil pemeriksa ini lebih dulu. Diuji: coba PATCH item pada dokumen `APPROVED` → harus 409.

---

## 7. Revisi & versioning

### K37 — `revise()` = salin utuh ke baris baru; yang lama tak pernah disentuh isinya

Pemicu: operator menekan **"Buat Revisi"** pada dokumen ber-status `SENT` (atau `APPROVED`, kalau P1 nanti mengizinkan). Satu transaksi:

1. Baca dokumen sumber + seluruh item (lewat `forTenant`).
2. Buat `Disbursement` baru: `version = sumber.version + 1`, `rootId = sumber.rootId ?? sumber.id`, `status = DRAFT`, `docNumber` = nomor induk + `-R{version-1}` (K38), `revisionNote` wajib diisi (`VALIDATION` kalau kosong — alasan revisi adalah bagian dari jejak audit, bukan opsional), `supersededBy = null`.
3. Salin **semua** item; setiap item baru `sourceItemId = item lama.id`; `exchangeRate`/`unitPrice`/`minCharge` **disalin apa adanya**.
4. Baris lama: `status = 'REVISED'`, `supersededBy = <id baru>`. **Item lama tidak disentuh, tidak disalin-pindah, tidak di-soft-delete.**
5. `AuditLog`: `action = 'CREATE'` pada baris baru + `'UPDATE'` pada baris lama.

Opsi **"segarkan tarif & kurs"** tersedia di dialog revisi, **mati secara bawaan**. Menyala = langkah 3 menjalankan ulang autofill (tarif & kurs per `tanggalJasa` terkini) dan menampilkan pratinjau perubahannya sebelum simpan. Bawaan mati karena revisi biasanya lahir dari satu perubahan spesifik (ETA bergeser, satu jasa dibatalkan) — menyegarkan segalanya diam-diam akan menggeser baris yang tidak diminta siapa pun.

Invarian yang bisa diuji:
- `rootId` satu rumpun sama untuk semua versi; `version` unik & berurutan dalam rumpun.
- Paling banyak **satu** baris per rumpun dengan `supersededBy = null` (yang hidup).
- Semua baris ber-`supersededBy` terisi berstatus `REVISED` atau `CANCELLED`.
- Versi 1: `rootId = id` dirinya sendiri (skema menulis "V1 = id dirinya sendiri" — isi eksplisit, jangan biarkan `null`, supaya query rumpun tidak butuh `OR`).

### K38 — Nomor revisi: **nomor induk dipertahankan + sufiks `-R{n}`**

`EPDA/2026/06/0142` → `EPDA/2026/06/0142-R1` → `-R2`. Alasan: principal mengenali dokumennya lewat nomor; menerbitkan nomor urut baru memutus tautan antara estimasi dan revisinya, dan `@@unique([tenantId, docNumber])` melarang nomor identik. **Bonus: PDF tidak perlu diubah sama sekali** — `EpdaDocument.tsx` sudah mencetak `data.docNumber`, jadi sufiks langsung terbaca oleh penerima. (Apakah principal menerima gaya penomoran ini → **P11**, murah untuk diubah.)

### K39 — "Bandingkan versi": diff **per baris**, dihitung saat diminta, tidak disimpan

Kunci pencocokan = rantai `sourceItemId`. Item versi N menunjuk pendahulunya di versi N−1.

| Keluaran diff | Definisi |
|---|---|
| `BARU` | item versi baru tanpa `sourceItemId` (atau pendahulunya tidak ada di versi pembanding) |
| `DIHAPUS` | item versi lama yang tak punya keturunan di versi baru |
| `BERUBAH` | ada di keduanya, salah satu dari `quantity`, `unitPrice`, `currency`, `exchangeRate`, `amount`, `amountBase`, `description`, `vendorId` berbeda |
| `SAMA` | ada di keduanya, semua field di atas sama |

Plus diff header: `agencyPct`, `subtotal`, `agencyAmount`, `taxAmount`, `grandTotal` (nilai lama → baru → delta).

Fungsi murni (`bandingkanVersi(itemLama[], itemBaru[])` di `compare.ts`), **tanpa DB, tanpa penyimpanan**. Diff yang disimpan pasti melenceng dari kenyataan begitu ada yang mengedit; diff yang dihitung tak bisa berbohong.

### K40 — Semantik `sourceItemId` diperluas resmi: **"baris asal tempat baris ini disalin"**

Komentar skema menulis `sourceItemId` = *"menunjuk baris EPDA padanannya → variance"*. Fase 3 memperluasnya menjadi **pendahulu langsung**, dipakai dua-duanya:

- item EPDA v2 → item EPDA v1 (untuk diff revisi),
- item FDA → item EPDA (untuk variance).

Aman karena keduanya **tidak pernah** ada bersamaan pada satu baris: setiap item punya paling banyak satu pendahulu langsung, dan artinya selalu sama ("disalin dari"). Tak ada perubahan skema; yang perlu diperbarui hanya **komentar** di `schema.prisma` (dan itu dilakukan di increment 3e, bukan sekarang).

### K41 — PDF versi lama tetap bisa diambil selamanya, tanpa menyimpan berkas

Repo ini tidak pernah menyimpan blob PDF — semua di-render saat diminta (`renderToBuffer` di `disbursement-handlers.ts`). Karena `revise()` tidak pernah menghapus atau mengubah item versi lama (K37), `GET /api/disbursements/{id}/pdf` untuk versi lama akan selamanya menghasilkan PDF yang identik. **Syaratnya satu: jangan pernah hard-delete `DisbursementItem`.** Karena `DisbursementItem` bukan model bertenant, tenant-guard **tidak** akan menahan `deleteMany` yang keliru di sini — jadi larangan ini harus hidup sebagai aturan tertulis + uji (K44).

---

## 8. Approval

### K42 — Mekanik approval (yang **bisa** diputuskan tanpa Marlon)

- Satu keputusan = satu baris `Approval`, **append-only**. Tidak ada `update`/`delete` pada model ini, selamanya (skema: *"Sekali tersimpan tidak boleh diubah"*). Diuji.
- `entityType = 'DISBURSEMENT'`, `entityId = disbursement.id` — **per versi**, bukan per rumpun. Versi baru mulai dengan lembar approval bersih. Itu benar: yang disetujui adalah angka, dan angkanya berubah.
- `userName`/`userRole` di-snapshot saat menulis (skema sudah menyiapkan kolomnya) supaya jejak tetap terbaca kalau user dihapus.
- `ipAddress` **tidak** dibaca oleh service (service tak tahu HTTP — aturan #5 `POLA-SERVICE-LAYER.md`). Route meneruskannya sebagai argumen eksplisit: `putuskanApproval(ctx, id, body, jejak: { ipAddress?: string | null })`. Pola argumen `jejak` ini dipakai konsisten oleh semua fungsi yang menulis `Approval`/`AuditLog`.
- `decision ∈ { 'APPROVED', 'REJECTED', 'REQUEST_REVISION' }`, divalidasi dengan `pilihan()` dari `services/input.ts` (jangan bikin validator baru).
- **`REJECTED` vs `REQUEST_REVISION`:** `REQUEST_REVISION` → status `REVISION_REQUESTED` (kembali ke penyusun, masih hidup). `REJECTED` → status `CANCELLED` (dokumen mati; kalau masih dibutuhkan, buat baru). Pemisahan ini perlu supaya "tolak" tidak berarti "kerjakan lagi".
- **Ronde approval** dihitung ulang setiap kali dokumen kembali dari `REVISION_REQUESTED`: baris `Approval` yang dihitung hanya yang `createdAt >` waktu transisi `REVISION_REQUESTED` terakhir untuk entity itu (dibaca dari `AuditLog`, K34). Baris lama tetap ada (immutable) tapi tidak lagi dihitung. Tanpa aturan ini, dokumen yang direvisi akan lolos dengan persetujuan atas angka yang sudah tidak ada.

### K43 — ⚠️ Jumlah level & pemetaan peran: **TIDAK diputuskan di sini** (P1)

Tidak ada apa pun di `schema.prisma`, `docs/`, `prisma/seed-v2.mjs`, maupun kode app A yang menyebut berapa level approval yang dipakai Tribuana atau siapa yang menyetujui apa. PDF nyata hanya punya dua kotak tanda tangan bertuliskan **"Prepared by — Operations Department"** dan **"Approved by — Branch Manager"** (`epda-data.ts`), yang **mengesankan** satu level, tapi kotak tanda tangan pada template bukan kebijakan approval. Peran yang tersedia sekarang cuma empat (`ADMIN`, `OPERATOR`, `FINANCE`, `VIEWER`) dan roadmap Fase 5 berencana menumbuhkannya jadi tujuh — jadi memetakan level ke peran sekarang berisiko dibongkar lagi.

**Cara agar ketidaktahuan ini tidak menghentikan pekerjaan:** seluruh kebijakan dikurung di **satu fungsi murni**.

```ts
// src/services/finance/approval-policy.ts — MURNI, tanpa impor.
// ⚠️ ISI SEMENTARA. Kebijakan approval Tribuana yang sebenarnya belum diketahui
// (P1 di docs/FASE-3-EPDA-ENGINE.md §15). Mengubah kebijakan = mengubah HANYA
// berkas ini, selama bentuknya masih satu-dua level berbasis peran.
export type LevelApproval = { level: number; peran: readonly Role[] }
export function kebijakanApproval(kind: DisbursementKind): readonly LevelApproval[] {
  return [{ level: 1, peran: ['ADMIN'] }]
}
```

Interim: **satu level, peran `ADMIN`**. Dipilih karena paling sedikit mengasumsikan dan tidak mungkin membuat dokumen lolos tanpa siapa pun melihat. Kalau jawaban Marlon nanti butuh (a) level berbeda per `kind`, (b) ambang nilai ("di atas Rp X butuh 2 level"), atau (c) **kebijakan berbeda per tenant** — (a) dan (b) muat di fungsi ini; **(c) butuh penambahan skema** (kolom di `Tenant` atau tabel `ApprovalPolicy`) yang **sengaja belum dibuat** sampai kebijakannya diketahui. Membangun tabel konfigurasi untuk aturan yang belum ada bentuknya adalah cara paling cepat membangun tabel yang salah.

### K44 — Menyetujui dokumen sendiri: **diizinkan tapi tercatat**, dengan satu konstanta untuk mematikannya (P2)

```ts
export const IZINKAN_SETUJU_SENDIRI = true  // ⚠️ kebijakan, bukan teknis — P2
```

Alasan interim `true`: keadaan sekarang **tidak ada approval sama sekali** — EPDA app A langsung keluar. Mengizinkan-tapi-mencatat karena itu bukan kemunduran, sementara memblokir bisa membuat tim kecil (atau satu orang yang sedang piket) **mentok total** dan kembali memakai Excel — kegagalan yang justru lebih buruk. Setiap persetujuan-diri tetap meninggalkan baris `Approval` bernama, jadi kalau ternyata tidak boleh, jejaknya ada dan konstantanya satu baris.

---

## 9. FDA dari EPDA + variance

### K45 — `buatFdaDariEpda()`: sumber, penyaringan, dan apa yang disalin

**Sumber:** satu `Disbursement` ber-`kind ∈ {EPDA, FPDA}`, `supersededBy = null`, `status ∈ {APPROVED, SENT, CLOSED}`, pada voyage yang sama. Kalau ada lebih dari satu rumpun yang memenuhi (mis. dua kunjungan pelabuhan dalam satu voyage), **operator memilih** — jangan menebak. Kalau tak ada satu pun: `CONFLICT` *"Belum ada EPDA yang disetujui pada voyage ini."*

**Item yang disalin:** semua item yang `serviceId = null` (ad-hoc) **atau** yang jasanya ber-`usedInActual = true`. Baris yang hanya relevan untuk estimasi (mis. contingency) dengan sengaja tertinggal — itu memang gunanya kolom `usedInEstimate`/`usedInActual` di katalog.

**Per item FDA baru:**

| Field | Dari EPDA | Alasan |
|---|---|---|
| `sourceItemId` | `= item EPDA.id` | tautan variance (K40) |
| `serviceId`, `category`, `sectionLetter`, `unit`, `calcMethod`, `description`, `basis`, `displayOrder` | disalin | menjaga PDF & variance tetap sebaris |
| `quantity`, `unitPrice`, `minCharge` | **disalin sebagai titik awal** | mayoritas baris tak berubah; mengosongkan justru mengundang salah ketik. FDA ber-status `DRAFT` sampai operator memeriksa |
| `vendorId` | disalin | boleh diubah (vendor aktual bisa beda) |
| `currency` | disalin | |
| `exchangeRate` | **dijepret ulang** per `tanggalJasa(FDA)` | uang aktual, kurs saat kunjungan/penyelesaian (K29) |
| `vendorInvoiceNo`, `actualReceiptRef` | **kosong** | ini justru yang harus diisi manusia |
| `taxable`, `taxPct` | disalin | |

Header FDA: `voyageId`, `baseCurrency`, `agencyPct` disalin dari EPDA; `docNumber` diterbitkan baru dengan prefix `FDA` (K32); `version = 1`, `rootId = id` sendiri (rumpun FDA **terpisah** dari rumpun EPDA — FDA bukan revisi EPDA, dan menyatukan rumpunnya akan merusak invarian K37).

**Boleh diedit operator di FDA** (selagi `DRAFT`/`REVISION_REQUESTED`): `quantity`, `unitPrice`, `currency` + `exchangeRate`, `vendorId`, `vendorInvoiceNo`, `actualReceiptRef`, `description`, `basis`, `taxable`/`taxPct`, `minCharge`, `calcMethod`.
**Terkunci:** `sourceItemId` dan `serviceId` — mengubahnya membuat variance berbohong tanpa terlihat.
**Baris tambahan diizinkan** (biaya aktual yang tak diestimasi) → `sourceItemId = null` → di laporan variance ditandai **"TAK DIANGGARKAN"** dengan variance = seluruh nilainya.

### K46 — Variance: dihitung saat diminta, per baris **dan** header, dalam `baseCurrency`

```
perBaris:  varianceBase  = fda.amountBase − (epda.amountBase ?? 0)
           variancePct   = epda.amountBase ? varianceBase / epda.amountBase × 100 : null
header:    Σ per baris, plus selisih agencyAmount, taxAmount, dan grandTotal
```

- `null` untuk `variancePct` bila basis 0 — jangan cetak `Infinity`, jangan cetak 0 (dua-duanya bohong).
- Baris EPDA **tanpa** keturunan di FDA = **"TIDAK TEREALISASI"**, variance = −(nilai EPDA). Ini harus ikut ditampilkan; kalau tidak, jasa yang diestimasi tapi tidak terjadi hilang tanpa jejak dan total variance tidak berjumlah.
- Fungsi murni `hitungVariance(itemEpda[], itemFda[])` → array + ringkasan. **Tidak disimpan** — tak ada kolomnya di skema, dan menyimpan angka turunan uang menjamin ada dua versi kebenaran.
- Ambang penandaan ("merah kalau >X%") **tidak diputuskan** → **P7b/P12 di §15**. Sementara: tampilkan semua, urut menurun berdasarkan `|varianceBase|`, tanpa penilaian merah/hijau. Menampilkan tanpa menghakimi tidak butuh kebijakan.

---

## 10. Serah-terima ke Invoice (Fase 4) — hanya titik temunya

### K47 — Satu gerbang: Invoice hanya boleh lahir dari FDA ber-status `FINAL`

`Invoice.sourceDisbursementId` sudah ada di skema. Fase 3 **tidak** membangun Invoice; ia hanya menetapkan kontraknya supaya desain Fase 4 tidak memaksa membongkar Fase 3:

- **Prasyarat:** `kind = 'FDA'`, `status = 'FINAL'`, `supersededBy = null`, `deletedAt = null`. Selain itu → `CONFLICT`.
- **Yang dibaca Fase 4:** item FDA (untuk `InvoiceItem`), `grandTotal`, `baseCurrency`, `voyageId`, `customerId` (dari `Voyage.customerId`, bukan dari disbursement — pihak yang ditagih milik voyage, K2).
- **Arah tergantung:** Fase 4 mengimpor dari `services/finance/disbursement.service.ts`. **Tidak boleh sebaliknya** — `disbursement.service.ts` tak boleh tahu apa pun soal Invoice, kecuali satu hal: menolak transisi keluar dari `FINAL` bila sudah ada Invoice yang menunjuknya (pemeriksaan `count()` sederhana, tanpa impor modul invoice).
- **Konversi mata uang tidak diulang.** Invoice mewarisi `baseCurrency` FDA dan `amountBase` yang sudah di-snapshot. Menghitung ulang FX pada saat penagihan akan menghasilkan angka yang berbeda dari FDA yang sudah dikirim ke principal.
- `Disbursement.advanceReceived` (dana muka) — siapa yang mencatat dan kapan, belum jelas milik Fase 3 atau 4 → **P9**. Fase 3 cukup menampilkan & menyimpannya sebagai angka yang diisi operator (PDF FPDA lama sudah memakainya untuk menghitung saldo).

---

## 11. Peta modul (untuk pelaksana)

Semua mengikuti `POLA-SERVICE-LAYER.md` §5 (6 aturan) tanpa kecuali. **Kolom "impor DB" adalah kontrak, bukan saran** — berkas bertanda ❌ harus tetap bisa diimpor Node langsung (K11).

```
src/services/finance/
  calc-engine.ts            ❌ murni. f(), pembulatan, minCharge, hitungEtmal(), warning. INTI.
  disbursement-status.ts    ❌ murni. tabel transisi K34 + BOLEH_UBAH_ITEM (K36).
  approval-policy.ts        ❌ murni. kebijakan level (K43) — TITIK SENTUH SATU-SATUNYA untuk P1.
  rate-resolver.ts          ❌ murni. skor + tie-break pemilihan ServiceRate (K25).
  compare.ts                ❌ murni. bandingkanVersi() (K39).
  variance.ts               ❌ murni. hitungVariance() (K46).
  totals.ts                 ❌ murni. dua-lintasan (K20) → subtotal/agency/tax/grandTotal.
  autofill.service.ts       ✅ DB. KonteksVoyage (gt/etmal/cargoTon), query kandidat tarif,
                                 getLatestRate, → usulan item lengkap (K12, K24-K28).
  disbursement.service.ts   ✅ DB. CRUD header, transisi status, pastikanLanggananAktif (K33).
  disbursement-item.service.ts ✅ DB. CRUD item — SELALU lewat induk (K44).
  disbursement-number.ts    ✅ DB. nomor + sufiks revisi (K32), pakai formatDocNumber lama.
  revision.service.ts       ✅ DB. revise() (K37) + baca rumpun untuk compare.
  approval.service.ts       ✅ DB. tulis Approval (append-only), evaluasi ronde (K42).
  fda.service.ts            ✅ DB. buatFdaDariEpda() (K45) + baca pasangan untuk variance.
  audit.ts                  ✅ DB. catatAudit(ctx, {tableName, recordId, action, oldValue, newValue}, jejak)

src/lib/pdf/
  disbursement-epda-data.ts ✅ DB. Disbursement+items → EpdaData (bentuk LAMA, K48).

src/app/api/voyages/[id]/disbursements/route.ts            GET list, POST buat
src/app/api/disbursements/[id]/route.ts                    GET, PATCH header, DELETE (soft)
src/app/api/disbursements/[id]/items/route.ts              POST, dan POST ?template=<id>
src/app/api/disbursements/[id]/items/[itemId]/route.ts     PATCH, DELETE
src/app/api/disbursements/[id]/status/route.ts             POST transisi
src/app/api/disbursements/[id]/approvals/route.ts          GET riwayat, POST keputusan
src/app/api/disbursements/[id]/revise/route.ts             POST
src/app/api/disbursements/[id]/compare/route.ts            GET ?with=<idVersiLain>
src/app/api/disbursements/[id]/pdf/route.ts                GET (?download=1)
src/app/api/disbursements/[id]/fda/route.ts                POST buat FDA dari dokumen ini
src/app/api/disbursements/[id]/variance/route.ts           GET

src/components/voyage/
  VoyageFinancePanel.tsx    ← diganti isinya (K49)
  DisbursementBuilder.tsx   ← baru
  DisbursementLineTable.tsx ← baru
  ServicePickerDialog.tsx   ← baru
  VarianceTable.tsx         ← baru (3g)

prisma/check-epda-calc.mjs  ← uji mesin hitung (pola check-tenant-guard.mjs)
```

### K44 (lanjutan) — `DisbursementItem` adalah model **anak**: tenant-guard TIDAK menjaganya

Ini jebakan keamanan paling mungkin di Fase 3, jadi ditulis sebagai aturan, bukan catatan.

`DisbursementItem` **tidak ada** di `TENANT_MODELS` (dan memang tidak boleh — keputusan #4 Fase 0: tabel anak tak membawa `tenantId`). Akibatnya guard **tidak** menyuntikkan apa pun dan **tidak** melarang `update`/`delete` pada model ini. `prisma.disbursementItem.update({ where: { id } })` akan **berhasil menyentuh item tenant lain** kalau id-nya benar. Tidak ada yang menahan.

**Aturan wajib, tanpa perkecualian:**
1. Setiap fungsi yang menyentuh item **membuka dengan** `const disb = await getDisbursement(ctx, disbursementId)` — dipagari, `NOT_FOUND` untuk tenant lain.
2. Setiap query item menyertakan `disbursementId` di `where`, **juga** saat sudah ada `id`: `updateMany({ where: { id, disbursementId }, data })`. Bukan `update({ where: { id } })`.
3. **Tidak ada** hard-delete item pada dokumen yang pernah keluar dari `DRAFT` (K41 bergantung pada ini). Hapus item hanya di `DRAFT`/`REVISION_REQUESTED`; `revise()` tidak pernah menghapus item versi lama.
4. `prisma/check-epda-calc.mjs` (atau uji pendamping) memuat kasus: item milik tenant B tidak bisa diubah lewat service dengan ctx tenant A.

### K48 — Pakai ulang mesin PDF & bentuk `EpdaData`; **jangan** tulis dokumen PDF baru

`disbursement-epda-data.ts` memetakan `Disbursement` + items → **`EpdaData` yang sudah ada**, lalu `DisbursementDocument` yang sudah ada me-render-nya. Tata letak, 4 seksi, kop, halaman 2 (notes + remittance + tanda tangan) tetap persis. Pemetaan:

| `EpdaData` | Dari model baru |
|---|---|
| `sections[]` | item dikelompokkan menurut `sectionLetter`, diurutkan A→D lalu `displayOrder`. Judul seksi dari peta konstan (judul A–D sudah dipakai seed & sample) |
| `EpdaLineItem.qty` | **teks tampilan** dari `basis`/`quantity`+`unit` — di sini `qty` teks tidak berbahaya karena tak ada lagi yang menghitung darinya (K13) |
| `EpdaLineItem.rate` / `amount` | `unitPrice` / `amount` |
| `agencyPct` | header `agencyPct` (K21) |
| `docNumber` | termasuk sufiks `-R{n}` (K38) — tak perlu ubah PDF |
| `usdRate` | kurs indikatif: `getLatestRate(IDR→USD, tanggalJasa)` bila ada; kalau tidak, dikosongkan (catatan USD hilang, bukan salah) |
| `advanceReceived` | header, untuk varian FPDA/FDA |
| `preparedByRole`/`approvedByRole` | `Tenant.signerTitle` bila ada, kalau tidak nilai bawaan sample |

Dua perubahan kecil yang **memang** dibutuhkan (dikerjakan di 3d, sadar menyentuh dokumen resmi): (1) baris pajak di blok total bila `taxAmount > 0` (K22); (2) `variant` untuk `kind = 'FDA'` — `VARIANT` sekarang hanya punya `'EPDA' | 'FPDA'`, dan `FDA` bisa dipetakan ke label `FPDA` yang sudah ada sampai P3 dijawab.

⚠️ Jalur lama (`api/documents/epda`, `api/documents/fpda` → `MaritimeDocument`) **tidak disentuh dan tidak dimatikan** di Fase 3, sejalan M6 (cut-over per modul). Dokumen lama tetap terbaca di Arsip. Mematikan tombol lama adalah keputusan tersendiri, sesudah operator percaya jalur baru.

---

## 12. UI — apa yang mengganti `VoyageFinancePanel`

Bukan desain piksel; ini kontrak data & alur supaya pelaksana tahu layar apa yang harus ada. Mengikuti konvensi yang sudah dipakai `VoyageCargoPanel.tsx`: `'use client'`, `useT`/`STR` **dua bahasa (id+en) sejak awal**, `fetch` + `router.refresh()`, `Dialog` shadcn, pesan galat dibaca dari `body.error.message`.

### K49 — Tab Finansial: daftar dokumen; builder = layar tersendiri

**Tab Finansial (di `VoyageWorkspace`)** berubah dari 3 kartu jumlah menjadi tabel dokumen: `docNumber` (+ chip `v2` bila `version > 1`), `kind`, chip status, `grandTotal` + `baseCurrency`, `issuedAt`, aksi. Tombol **"Buat EPDA"** dan (bila ada EPDA `APPROVED`+) **"Buat FDA"**. Kartu Invoice/Dokumen tetap sebagai jumlah sampai Fase 4.

**Builder** — `/voyages/[id]/disbursements/[disbId]`, halaman sendiri (bukan dialog): tabelnya lebar dan operator akan lama di sini.

1. **Strip header:** nomor, chip status, versi (+ tautan "bandingkan dengan v1"), base currency, `agencyPct` (bisa diedit selagi editable), `validUntil`, `revisionNote` bila ada.
2. **Dua pintu penambahan:** `[+ Dari Template]` (pilih `ServiceTemplate`, semua item sekaligus — K28) dan `[+ Tambah Jasa]` (pencarian katalog, tampilkan kode+nama+kategori+`calcMethod`; multi-pilih).
3. **Tabel baris, dikelompokkan A/B/C/D** dengan subtotal per seksi — cermin PDF, supaya yang di layar = yang tercetak. Per baris: deskripsi (+`basis` abu di bawahnya), `quantity` (dapat diedit; label sumber autofill mis. *"8.432 GT × 3 etmal — dari kapal & ETB/ETD"*), `unit`, `unitPrice`, mata uang (+`exchangeRate` bila ≠ base), `amount`, vendor, ikon warning, hapus.
4. **Total hidup** — dihitung di klien dengan **modul `calc-engine.ts`+`totals.ts` yang sama** (K11): subtotal → agency `x%` → pajak (bila ada) → grand total, plus catatan ekuivalen USD. Server menghitung ulang saat simpan dan **nilai server yang menang**; kalau beda, tampilkan angka server (jangan diam-diam pilih salah satu).
5. **Panel peringatan** yang bisa diklik ke barisnya: "Tarif belum ada (2 baris)", "Kurs USD→IDR belum ada", "GT kapal kosong", "2 tarif bersaing". **Selama panel ini berisi warning pemblokir, tombol "Ajukan Review" mati** dengan alasan yang terlihat (K34) — bukan tombol mati tanpa penjelasan.
6. **Aksi menurut status** (satu sumber: `disbursement-status.ts` — jangan hard-code daftar tombol di komponen): `Simpan` · `Ajukan Review` · `Setujui`/`Minta Revisi`/`Tolak` (bila peran & kebijakan mengizinkan) · `Tandai Terkirim` · `Buat Revisi` · `Unduh PDF` · `Buat FDA` · `Batalkan`.
7. **Riwayat approval** — daftar hanya-baca di bawah: siapa, peran, level, keputusan, catatan, kapan.
8. **Layar bandingkan versi** — dua kolom, penanda warna `BARU`/`DIHAPUS`/`BERUBAH`, dan diff header di atas (K39).
9. **Layar variance (3g)** — tabel FDA vs EPDA per baris + ringkasan, urut `|varianceBase|` menurun, tanpa penilaian merah/hijau sampai P12 dijawab.

Yang **tidak** dibangun di Fase 3: kirim email ke principal (belum ada mailer di repo — **P10**), unggah lampiran kuitansi vendor (Fase 7), prediksi biaya AI (Fase 6).

---

## 13. Yang dipakai ulang, dan yang sengaja tidak dibangun ulang

| Dipakai ulang apa adanya | Catatan |
|---|---|
| `forTenant()` / tenant-guard | tak ada model bertenant **baru** di Fase 3 → `TENANT_MODELS` tak berubah; `test:tenant` tetap 17/17 |
| `ServiceError` + `withTenant` + `jsonBody` | tak ada bentuk galat baru |
| `services/input.ts` (`str/num/int/bool/tanggal/wajib/pilihan`) | **jangan** tambah `zod` untuk ini. Item disbursement hanya perlu satu pembaca array bergaya `bacaItems()` di `service-template.service.ts`. Kalau nanti validasi berjenjang benar-benar terasa sesak, itu keputusan baru dengan alasan tertulis (tension roadmap §8) |
| Mesin PDF + `EpdaData` + `DisbursementDocument` | K48 |
| `formatDocNumber`/`monthWindow` | K32 |
| `getLatestRate()` | K30 — jangan tulis pencari kurs kedua |
| `ServiceTemplate` + `ServiceCatalog` + `ServiceRate` | K25–K28 |
| `lib/billing/access.ts` | K33 |
| Pola uji `.mjs` | K11 |

| Sengaja **tidak** diadakan | Alasan |
|---|---|
| Test runner baru (vitest/jest) | pola `.mjs` sudah cukup untuk logika murni; menambah runner = keputusan tersendiri |
| State library (Zustand/TanStack Query) | builder cukup dengan `useState` + `router.refresh()`, sama seperti panel Fase 2 |
| `Decimal`/uang integer | K23 |
| Tabel `ApprovalPolicy` | K43 — jangan bangun konfigurasi untuk kebijakan yang belum diketahui |
| Penyimpanan blob PDF | K41 |
| Kolom variance / diff tersimpan | K39, K46 |
| Menyentuh 54 route lama & `api/documents/epda` | M6 + `POLA-SERVICE-LAYER.md` §8 |

**Satu-satunya penyimpangan skema yang diminta Fase 3: `DisbursementItem.minCharge Float?` (K15).** Kalau ada tekanan untuk nol perubahan skema, fallback-nya ada di K15.

---

## 14. Rencana bertahap (3a → 3g)

Aturan: setiap increment berdiri sendiri, punya cara verifikasi konkret, dan **tidak boleh** dimulai sebelum yang sebelumnya lulus verifikasi. Di setiap batas: `npx tsc --noEmit` **0 error** dan `npm run test:tenant` **17/17** — sama seperti disiplin Fase 1 & 2.

Model: **3a & 3b Opus** (mesin uang + pagar), **3c–3g Sonnet mengikuti dokumen ini**, kembali ke Opus bila muncul salah satu sinyal §6b roadmap.

---

### 3a — Mesin hitung murni + uji (tanpa DB, tanpa UI) 🔴 Opus

**Isi:** `calc-engine.ts`, `totals.ts`, `disbursement-status.ts`, `approval-policy.ts`, `rate-resolver.ts`, `compare.ts`, `variance.ts` — semuanya murni. Plus `prisma/check-epda-calc.mjs` dan skrip `"test:calc"` di `package.json`.

**Cara memverifikasi:**
1. `node prisma/check-epda-calc.mjs` — semua lulus. Wajib memuat:
   - **Fixture emas dari EPDA Tribuana nyata** (`SAMPLE_EPDA`, replika `EPDA-Tribuana.pdf`), GT 8.432, 3 etmal, agency 2,5%:

     | Baris | Formula | Harapan |
     |---|---|---|
     | Anchorage dues | `PER_GT_PER_CALL` 8.432 × 75 | **632.400** |
     | Berthing dues | `PER_GT_PER_DAY` 8.432 × 120 × 3 | **3.035.520** |
     | Light dues | `PER_GT` 8.432 × 55 | **463.760** |
     | Pilotage in/out | `PER_UNIT` 2 × 4.750.000 | **9.500.000** |
     | Tug | `PER_UNIT` 4 × 6.250.000 | **25.000.000** |
     | Subtotal A/B/C/D | | **6.631.680 / 38.100.000 / 5.650.000 / 19.000.000** |
     | Subtotal | | **69.381.680** |
     | Agency 2,5% | | **1.734.542** |
     | Total | | **71.116.222** |
   - `FLAT` dengan `quantity = 3` → ditolak.
   - `minCharge` mengikat (Pilotage GT kecil: 500 GT × 175 = 87.500 → jadi **2.500.000**) + warning `MINIMUM_MENGIKAT`.
   - `PERCENTAGE` dua-lintasan: dua baris persen tidak pernah saling menghitung; hasil tak berubah walau urutan input diacak.
   - `gt = null` → `amount = 0` + `GT_TIDAK_ADA` (bukan lemparan, bukan `NaN`).
   - `hitungEtmal`: 25 jam → **2**; 23 jam → **1**; 0 jam → **1**; selesai < mulai → **null**.
   - Pembulatan: `decimals = 0` (IDR) tak pernah menyisakan sen; nilai negatif membulat simetris.
   - **Invarian K13**: untuk setiap kasus, `verifikasiBaris(item)` membuktikan `amount` bisa diturunkan ulang dari `calcMethod`+`quantity`+`unitPrice`+`minCharge` saja.
   - `pilihTarif`: tarif khusus pelabuhan mengalahkan tarif umum yang lebih baru; dua tarif berskor & bertanggal sama → warning `TARIF_AMBIGU`; hasil sama walau array kandidat diacak.
   - Tabel transisi: ~10 transisi sah lolos, ~10 tak sah ditolak (termasuk `APPROVED → DRAFT`, `REVISED → apa pun`, `CLOSED → apa pun`).
   - `bandingkanVersi` & `hitungVariance` pada data bikinan (termasuk baris `DIHAPUS`/`TIDAK TEREALISASI`).
2. `npx tsc --noEmit` 0 error.
3. **Bukti K11:** hilangkan kata `type` dari salah satu `import type` → uji **gagal**. Kembalikan. (Membuktikan pagarnya nyata, bukan niat baik.)

**Selesai berarti:** rumus & aturan status terbukti benar sebelum satu baris pun menyentuh DB.

---

### 3b — Skema (`minCharge`) + service layer Disbursement + API, **tanpa UI** 🔴 Opus

**Isi:** migration aditif `DisbursementItem.minCharge Float?` (prosedur K7: backup → baseline → migrate); `autofill.service.ts`, `disbursement.service.ts`, `disbursement-item.service.ts`, `disbursement-number.ts`, `audit.ts`, `pastikanLanggananAktif`; route `disbursements` (list/create/get/patch/items/status). Belum ada approval, revisi, FDA.

**Cara memverifikasi** (lewat API nyata — `fetch` dari sesi login, bukan hanya `tsc`; ini yang dipakai Fase 1 & 2):
1. Migration: hitung baris tabel lama **identik** sebelum/sesudah; `minCharge` `nullable: YES`.
2. Buat EPDA pada `VYG-2026-000002` → `docNumber` = `EPDA/2026/08/0001`; buat satu lagi → `0002`.
3. `POST items` untuk `PILOTAGE` → terisi otomatis `unitPrice` 175, `currency` IDR, `minCharge` 2.500.000, `calcMethod` `PER_GT_PER_CALL`, `sectionLetter` B, `quantity` = GT kapal; `amount` cocok dengan yang dihitung tangan.
4. `POST items?template=<id>` → semua baris template masuk sekali jalan.
5. Kapal tanpa `gt` → baris tersimpan, `amount` 0, warning `GT_TIDAK_ADA` ada di respons.
6. Baris USD tanpa kurs → **400 `VALIDATION`** menyebut pasangan mata uang. Tambahkan kurs → berhasil, `exchangeRate` ter-snapshot, `amountBase` benar. Ubah kurs master sesudahnya → `amountBase` baris **tidak berubah** (bukti K5).
7. `AGENCY_FEE` sebagai item → **400** dengan pesan yang mengarahkan ke header.
8. Transisi: DRAFT→PENDING_REVIEW dengan warning pemblokir → **ditolak**; sesudah diperbaiki → berhasil; PATCH item pada dokumen `PENDING_REVIEW` → **409**; `PENDING_REVIEW → DRAFT` berhasil (belum ada approval).
9. **Lintas-tenant:** ctx tenant A memanggil `PATCH /api/disbursements/{id-milik-B}/items/{itemId}` → **404**, dan baris B **tidak berubah** (bukti K44).
10. Tenant dengan langganan kedaluwarsa → pembuatan EPDA **ditolak** (bukti K33).
11. `npm run test:tenant` 17/17, `tsc` 0 error.

---

### 3c — Builder UI di Voyage Workspace 🟢 Sonnet

**Isi:** `VoyageFinancePanel` jadi daftar dokumen; `DisbursementBuilder` + `DisbursementLineTable` + `ServicePickerDialog`; total hidup dari modul murni; panel warning; tombol menurut status. Dua bahasa sejak awal.

**Cara memverifikasi:** di browser sungguhan (bagian ini **wajib dilihat mata manusia** — verifikasi Fase 2 lewat `fetch` saja meninggalkan utang ini): buat EPDA dari nol dalam **< 5 menit** (target roadmap) memakai template + 2 penambahan manual; angka total di layar **sama persis** dengan yang dikembalikan server saat simpan; ubah `quantity` → total ikut berubah tanpa reload; dokumen `PENDING_REVIEW` → tabel jadi hanya-baca dan tombol simpan hilang; peringatan bisa diklik dan melompat ke barisnya; ganti bahasa id↔en → tak ada teks yang bocor.

---

### 3d — PDF memakai model baru 🟢 Sonnet

**Isi:** `disbursement-epda-data.ts`, route `/api/disbursements/[id]/pdf`, tombol Unduh PDF; baris pajak di blok total bila `taxAmount > 0`; petakan `kind` → `variant`.

**Cara memverifikasi:** render EPDA dari model baru dan **bandingkan berdampingan** dengan `GET /api/documents/epda` (contoh lama): kop, 4 seksi + subtotal, blok total, halaman 2 **tak berubah bentuknya**. Nomor dokumen benar (termasuk `-R1` bila ada). Dokumen ber-`taxAmount = 0` menghasilkan tata letak yang identik dengan sekarang (tak ada baris pajak kosong). Unduh & buka di pembaca PDF sungguhan, bukan hanya cek HTTP 200.

> **Kenapa 3d sebelum revisi/approval:** sesudah 3d, Tribuana sudah bisa memakai jalur baru untuk pekerjaan nyata (buat → hitung → PDF → kirim manual). 3e/3f tanpa 3d tidak mengirim apa pun yang bisa dipakai. Ini menyimpang dari urutan yang disarankan di brief, dan disengaja.

---

### 3e — Revisi / versioning + bandingkan 🟢 Sonnet

**Isi:** `revision.service.ts`, route `revise` + `compare`, dialog revisi (`revisionNote` wajib, sakelar "segarkan tarif & kurs" mati bawaan), layar bandingkan. Perbarui komentar `sourceItemId` di `schema.prisma` sesuai K40 (**komentar saja, tanpa migration**).

**Cara memverifikasi:** EPDA `SENT` → Buat Revisi → v2 `DRAFT`, nomor `-R1`, item tersalin dengan `sourceItemId` terisi; v1 jadi `REVISED` + `supersededBy` terisi; **PDF v1 masih bisa diunduh dan isinya identik dengan sebelumnya** (bukti K41); edit satu `quantity` di v2 → compare menampilkan tepat 1 `BERUBAH`, sisanya `SAMA`; hapus satu baris & tambah satu baru → muncul `DIHAPUS` + `BARU`; `revisionNote` kosong → 400; revisi dari v2 → v3 dengan `-R2` dan `rootId` sama untuk ketiganya; hanya satu baris rumpun ber-`supersededBy = null`.

---

### 3f — Approval berjenjang 🟢 Sonnet (⚠️ terhalang P1/P2)

**Isi:** `approval.service.ts`, route `approvals`, tombol Setujui/Minta Revisi/Tolak, riwayat approval hanya-baca.

⚠️ **Boleh dibangun dengan kebijakan interim K43/K44** (1 level `ADMIN`, persetujuan-diri diizinkan-tercatat), **tapi jangan dianggap selesai** sampai P1 & P2 dijawab. Konstantanya sudah terkurung di `approval-policy.ts` supaya jawabannya nanti murah.

**Cara memverifikasi:** `PENDING_REVIEW` + approve oleh `ADMIN` → `APPROVED` + satu baris `Approval` (dengan `userName`/`userRole`/`ipAddress` terisi); approve oleh `VIEWER` → **403**; `REQUEST_REVISION` → status `REVISION_REQUESTED`, dokumen bisa diedit lagi, **tanpa** versi baru (bukti K34); ajukan ulang → approval lama **tidak** dihitung, wajib ronde baru (bukti K42); `REJECTED` → `CANCELLED`; percobaan `UPDATE`/`DELETE` baris `Approval` lewat service → tidak ada jalurnya (dan uji membuktikannya); tarik kembali sesudah ada baris approval → **ditolak**.

---

### 3g — FDA dari EPDA + variance 🟢 Sonnet

**Isi:** `fda.service.ts`, route `fda` + `variance`, `VarianceTable`, tombol "Buat FDA" di daftar dokumen.

**Cara memverifikasi:** EPDA `APPROVED` → Buat FDA → semua item ber-`usedInActual` tersalin dengan `sourceItemId`, `vendorInvoiceNo` kosong, `docNumber` prefix `FDA`, `rootId` = dirinya sendiri (**bukan** rootId EPDA); item ber-`usedInActual = false` tidak tersalin; ubah satu `quantity` naik 20% → variance baris & header cocok hitung tangan, `variancePct` benar; tambah baris tanpa `sourceItemId` → **"TAK DIANGGARKAN"**; hapus satu baris FDA → baris EPDA-nya muncul sebagai **"TIDAK TEREALISASI"** dengan variance negatif dan total variance tetap berjumlah; voyage tanpa EPDA `APPROVED` → **409** dengan pesan yang jelas; ubah `serviceId` item FDA → ditolak.

---

### Definition of Done Fase 3

Operator Tribuana bisa: buat EPDA dari katalog+template dalam < 5 menit, dengan tarif/mata uang/vendor/pajak terisi sendiri; melihat total hidup yang sama dengan PDF; mengajukan & menyetujui; mengunduh PDF bertata letak sama seperti sekarang; membuat revisi dengan riwayat utuh dan PDF versi lama masih terambil; membuat FDA dari EPDA dan melihat variance per baris. `tsc` 0 error, `test:tenant` 17/17, `test:calc` semua lulus, dan **semua verifikasi 3b/3c dilakukan pada API/browser nyata**, bukan hanya `tsc`.

**Tidak** termasuk DoD: email ke principal (P10), tarif resmi (P8 — di luar pekerjaan kode), kebijakan approval final (P1).

---

## 15. ⚠️ Pertanyaan terbuka — **butuh jawaban Marlon**, sengaja tidak ditebak

Ini kebijakan bisnis PT Tribuana Solusi Maritim, bukan keputusan teknis. Menebaknya berarti mengirim proses yang salah ke principal nyata. Kolom **Blokir** = increment yang tidak boleh dinyatakan selesai sebelum ini dijawab.

| # | Pertanyaan | Interim yang dipakai | Blokir |
|---|---|---|---|
| **P1** | **Berapa level approval EPDA/FDA, dan siapa yang menyetujui tiap level?** Apakah beda untuk EPDA vs FDA? Ada ambang nilai (mis. di atas Rp X butuh 2 level)? Kebijakannya seragam untuk semua tenant atau per-tenant? Tak ada apa pun di kode/docs yang menjawab ini; dua kotak tanda tangan di PDF ("Operations Department" / "Branch Manager") **bukan** kebijakan approval. | 1 level, peran `ADMIN` (K43) | **3f** |
| **P2** | **Boleh menyetujui dokumen yang disusun sendiri?** Tim kecil bisa mentok kalau dilarang; dokumen uang bisa lolos tanpa mata kedua kalau diizinkan. | Diizinkan **tapi tercatat** (K44) | **3f** |
| **P3** | **Apa bedanya `FPDA` dan `FDA`?** Skema v2 punya tiga `kind`, tapi app A memetakan `FPDA → prefix 'FDA'` dan memberinya judul "Final Disbursement Account" — di app A, FPDA **adalah** FDA. Apakah `FPDA` benar-benar dipakai Tribuana (mis. proforma revisi sebelum kedatangan), atau enum-nya harus tinggal EPDA+FDA? | `FPDA` diperlakukan seperti EPDA; prefix `FPDA` | 3d, 3g |
| **P4** | **PPN: berapa tarifnya, jasa mana yang kena, dan apakah PPN muncul di EPDA atau baru di Invoice?** Seed menandai hanya `AGENCY_FEE` `taxable` dengan `taxPct: 11`. Apakah PPN dikenakan juga atas agency amount di header? Kode **tidak pernah** meng-hardcode tarif pajak (K22). | Baca dari `ServiceCatalog`; baris pajak di PDF hanya bila > 0 | 3d |
| **P5** | **Agency fee: persentase dari apa, dan apakah ada skala per GT + minimum?** EPDA nyata menulis *"per GT scale, min. applied"* — skalanya belum ada di sistem. Basis 2,5% = seluruh subtotal A+B+C+D, atau ada pos yang dikecualikan (CTM/disbursement pihak ketiga)? | Basis = semua baris non-`PERCENTAGE`; skala GT tidak diimplementasikan (K20/K21/K26) | 3b (angkanya), 3d |
| **P6** | **Etmal: kurang dari 24 jam dihitung 1 etmal penuh?** Sama di Samarinda, Balikpapan, Singapore? Dihitung dari ETB/ETD atau ETA/ETD? | `ceil`, minimum 1, dari `etb ?? eta` → `etd ?? etc` (K17) | 3b |
| **P7** | **Satu EPDA = satu port call, atau satu voyage yang bisa punya beberapa port call?** Ini menentukan apakah `calls` pada `PER_GT_PER_CALL` harus mengalikan jumlah port call. | `calls = 1` konstan (K18) | 3b |
| **P8** | **Tarif resmi pelabuhan** — 19 tarif hasil seed masih **angka contoh** (sudah tercatat sebagai utang di ROADMAP §8 dan `seed-v2.mjs`). Bukan pekerjaan kode, tapi **memblokir pengiriman EPDA nyata ke principal**. | Tarif contoh; peringatan tetap terpampang | pemakaian produksi |
| **P9** | **Dana muka (`advanceReceived`) & Cash to Master:** siapa yang mencatat, kapan, dan apakah itu bagian Fase 3 atau Fase 4 (AR)? | Angka yang diisi operator di header; dipakai PDF FDA/FPDA (K47) | 3d |
| **P10** | **Kirim EPDA lewat email dari aplikasi** — roadmap Fase 3 menyebut "PDF + email principal", tapi **tidak ada mailer apa pun di repo** (tak ada nodemailer/resend/sendgrid/SMTP). Perlu penyedia email (biaya, domain, DKIM) atau cukup unduh PDF lalu kirim manual dari Outlook? | Unduh manual; status `SENT` ditandai operator | fitur email |
| **P11** | **Penomoran revisi `EPDA/2026/06/0142-R1`** — principal Tribuana menerima gaya ini, atau lebih suka nomor baru sama sekali? | Sufiks `-R{n}` (K38) | 3e (murah diubah) |
| **P12** | **Ambang variance** yang dianggap "perlu penjelasan" (mis. > 10% atau > Rp X per baris)? Dipakai untuk penandaan & nanti anomaly detection Fase 6. | Tanpa ambang; urut `|variance|` menurun (K46) | 3g (kosmetik) |
| **P13** | **Konversi KL → MT** untuk kargo cair (butuh densitas per produk) — perlu tabel densitas, atau operator selalu mengisi tonase manual? Cargo nyata di DB berbunyi "B40, 6000 KL". | Tak ada konversi; operator isi manual (K19) | — |
| **P14** | **Apakah `DisbursementItem.minCharge` boleh ditambahkan** (migration aditif nullable, K15)? Kalau skema harus dibekukan total, fallback-nya ada di K15 tapi lebih buruk. | Ditambahkan di 3b | **3b** |

**Cara termurah menjawabnya:** P1, P2, P3, P5, P6, P7 bisa dijawab dengan melihat **satu berkas EPDA + FDA nyata yang sudah pernah dikirim Tribuana** (siapa yang tanda tangan, apa basis agency fee-nya, bagaimana etmal dihitung, apakah ada dokumen "FPDA") — kemungkinan lebih cepat daripada rapat kebijakan.

---

## 16. Ringkasan keputusan (K11–K49)

| # | Keputusan |
|---|---|
| K11 | Mesin hitung = modul murni tanpa impor, diuji langsung Node (`import type` saja) |
| K12 | Autofill (sekali, DB) dipisah tegas dari hitung (murni, berulang) |
| K13 | Invarian: `amount` selalu bisa diturunkan ulang; `quantity` menyimpan pengali yang sudah dikalikan habis; `basis` tak pernah di-parse |
| K14 | `amount` tak pernah diedit tangan; untuk memaksa angka, ubah baris jadi `MANUAL` |
| K15 | ⚠️ Tambah `DisbursementItem.minCharge Float?` (satu-satunya penambahan skema) |
| K16 | Formula lengkap 11 `CalcMethod` + `FLAT` memaksa qty 1 + warning, bukan lemparan |
| K17 | `hitungEtmal()`: `ceil`, min 1; EPDA pakai tanggal estimasi, FDA pakai aktual |
| K18 | `calls = 1` konstan |
| K19 | `PER_TON` mengusulkan tonase kargo bersatuan ton; KL tak dikonversi |
| K20 | Basis `PERCENTAGE` = Σ baris non-persen dalam `baseCurrency`, dua lintasan |
| K21 | Agency fee **hanya** di header; item `AGENCY_FEE` ditolak |
| K22 | Pajak per baris dari snapshot katalog; tarif pajak tak pernah di-hardcode |
| K23 | Bulatkan per baris memakai `Currency.decimals`; `Float` dipertahankan |
| K24 | `tanggalJasa` (bukan hari ini) memilih tarif **dan** kurs |
| K25 | Pemilihan `ServiceRate`: saring → skor (port +4, vesselType +2, bracket +1) → tie-break → warning bila ambigu |
| K26 | `TIERED` = bracket sebagai fitur resolusi tarif; `TIERED` sendiri = lump sum per band |
| K27 | Urutan resolusi vendor/mata uang/satuan/pajak/seksi; tarif hilang tak memblokir DRAFT |
| K28 | Template = pintu isi-sekaligus; `templateId` tidak disimpan |
| K29 | Kurs dijepret saat baris disimpan; tidak bergerak saat transisi status |
| K30 | Kurs tak ada → `VALIDATION`; **dilarang** diam-diam pakai 1; tak ada pembalikan otomatis |
| K31 | `baseCurrency` diwarisi Voyage, dibekukan begitu ada item |
| K32 | Docnumber: mekanisme paralel di service layer, pakai ulang `formatDocNumber` |
| K33 | ⚠️ Gating langganan harus dipanggil eksplisit — extension lama tak menjangkau `Disbursement` |
| K34 | Graf transisi status eksplisit; `REVISED` = "sudah disalip"; revisi bukan untuk perbaikan internal |
| K35 | Subset per `kind`: `FINAL` hanya FDA; `SENT` dipakai keduanya |
| K36 | Editable hanya pada `DRAFT` & `REVISION_REQUESTED`; di luar itu `CONFLICT` |
| K37 | `revise()` menyalin utuh; versi lama tak pernah disentuh; "segarkan tarif" mati bawaan |
| K38 | Nomor revisi = nomor induk + `-R{n}` (PDF tak perlu diubah) |
| K39 | Diff per baris lewat rantai `sourceItemId`, dihitung saat diminta, tak disimpan |
| K40 | `sourceItemId` resmi berarti "baris asal tempat baris ini disalin" (revisi **dan** FDA) |
| K41 | PDF versi lama selamanya terambil; jangan pernah hard-delete item |
| K42 | Approval append-only, per versi, ronde di-reset sesudah `REVISION_REQUESTED`; `jejak` sebagai argumen |
| K43 | ⚠️ Level & peran approval **tidak diputuskan** — terkurung di `approval-policy.ts` (P1) |
| K44 | Menyetujui sendiri diizinkan-tercatat (P2) **+** `DisbursementItem` model anak: guard tak menjaganya, akses **wajib** lewat induk |
| K45 | `buatFdaDariEpda()`: sumber, penyaringan `usedInActual`, field yang disalin vs dikosongkan |
| K46 | Variance dihitung saat diminta, per baris + header, termasuk "TIDAK TEREALISASI" |
| K47 | Invoice hanya dari FDA `FINAL`; ketergantungan satu arah Fase 4 → Fase 3 |
| K48 | Pakai ulang `EpdaData` + `DisbursementDocument`; jalur `MaritimeDocument` lama tak disentuh |
| K49 | Tab Finansial = daftar dokumen; builder = halaman sendiri; total hidup dari modul murni yang sama |
