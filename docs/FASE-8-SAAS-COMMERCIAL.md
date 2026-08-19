# FASE 8 — Desain SaaS Commercial (Onboarding, Langganan & Duitku, Customer Portal, Vendor Portal, Data Maritim, White-label, Analitik, Kepatuhan, Help Center)

> **Status: DESAIN untuk direview. Belum ada kode aplikasi yang ditulis.**
> Dibuat: 2026-08-17 · Induk: [ROADMAP-v2.md](./ROADMAP-v2.md) §6 & §6b · Acuan: [FASE-0-SKEMA-v2.md](./FASE-0-SKEMA-v2.md) · [FASE-3-EPDA-ENGINE.md](./FASE-3-EPDA-ENGINE.md) · [FASE-6-AI-LAYER.md](./FASE-6-AI-LAYER.md) · [FASE-7-OPERATIONS.md](./FASE-7-OPERATIONS.md) · [POLA-SERVICE-LAYER.md](./POLA-SERVICE-LAYER.md)
>
> **Penomoran keputusan melanjutkan Fase 7** (berhenti di **K142**; diperiksa dengan menyapu seluruh `docs/`, `src/`, `prisma/` — `K142` adalah nomor tertinggi yang muncul). Dokumen ini mulai dari **K143**. Rujukan: K1–K10 = Fase 0, K11–K49 = Fase 3, K50–K82 = Fase 6, K83–K142 = Fase 7.
> **Pertanyaan terbuka melanjutkan Fase 7** (berhenti di **P47**), jadi dokumen ini mulai dari **P48**.
>
> **Cara memakai dokumen ini:** §17 adalah rencana kerja bertahap (8a–8l). Mulai dari **8a** — ia membangun model identitas pihak luar dan pagar isolasinya; sepuluh increment sesudahnya menggantung padanya, dan tak satu pun boleh dimulai sebelum 8a lulus uji. Kalau sebuah keputusan di sini terasa salah saat coding, **ubah dokumen ini dulu**, jangan menyimpang diam-diam (aturan §6b roadmap).
>
> ⚠️ **§3 adalah bagian terpenting dokumen ini.** Ia menjawab kewajiban yang ditulis Fase 0 secara eksplisit: **K9 (isolasi tenant lewat service layer, RLS ditolak) WAJIB ditinjau ulang di Fase 8 saat portal pelanggan/vendor dibuka ke pengguna luar** ([POLA-SERVICE-LAYER.md §2](./POLA-SERVICE-LAYER.md), [ROADMAP-v2.md §8](./ROADMAP-v2.md)). Peninjauan itu **tidak** berakhir dengan "masih cukup" — lihat **K147**. Baca §3 sebelum bagian mana pun yang lain.
>
> ⚠️ **§19 berisi 17 pertanyaan yang SENGAJA tidak dijawab** karena jawabannya kebijakan komersial/hukum PT Tribuana Solusi Maritim, bukan keputusan teknis. Enam di antaranya **memblokir** increment tertentu. Baca §19 sebelum mulai.
>
> ⚠️ **Batas Fase 8 vs rencana deploy.** Marlon punya rencana terpisah (disetujui, sedang **dijeda** sampai Fase 7+8 selesai) untuk menaruh aplikasi di **satu VM Google Compute Engine** — nginx + Node + Postgres + systemd, meniru pola VPS Hostinger yang sudah ia pakai. Dokumen ini **tidak** mendesain ulang rencana itu dan **tidak** boleh mengandaikan platform lain (tidak ada asumsi serverless Vercel, tidak ada Kubernetes, tidak ada layanan terkelola yang belum dibeli). Di tiga tempat desain ini benar-benar menyentuh keputusan deploy — RLS & peran database (K147), SSL domain kustom white-label (K182), penyimpanan berkas & backup (K186) — itu ditandai sebagai **catatan deploy**, bukan sebagai desain infrastruktur.

---

## 1. Masalah yang dipecahkan Fase 8 — dan batas jujurnya

Roadmap menyebut Fase 8 sebagai fase **XL**, milestone *"💰 Siap dijual"*, dengan satu baris cakupan: *"Onboarding wizard, subscription tiers, license add-ons (reuse Midtrans), Customer Portal, Vendor Portal, Marine data (AIS/Weather/Congestion), White-label, Product Analytics, compliance/backup/monitoring, Help Center + support SLA."* Itu satu-satunya rujukan cakupan yang ada di repo. Dokumen ini adalah rinciannya yang pertama.

Fase 0–7 membangun **produk**. Fase 8 membangun **usaha di sekelilingnya**: cara perusahaan lain masuk, cara mereka membayar, cara pihak di luar perusahaan melihat sebagian isinya, dan cara semua itu tetap terpisah rapi.

### 1.1 Apa yang sebenarnya hilang hari ini

| Yang hilang | Bukti di repo | Akibat hari ini |
|---|---|---|
| Tidak ada **jalur masuk perusahaan baru** yang berguna | `/register` ada (`api/auth/register/route.ts`) dan sudah membuat `Tenant` + `User` ADMIN + trial 7 hari — tapi berhenti di situ: tenant baru mendarat di aplikasi kosong tanpa mata uang, pelabuhan, atau katalog jasa | Perusahaan yang mendaftar sendiri melihat aplikasi yang tak bisa dipakai untuk apa pun, lalu pergi. Praktisnya setiap tenant harus disiapkan tangan |
| **Paket langganan tidak sama** dengan paket yang direncanakan dijual | Kode: `lib/billing/plans.ts` → `m1` Rp 250.000 / `m2` Rp 450.000 / `all` Rp 600.000, dibatasi **jumlah modul**. Blueprint §11.3: Basic Rp 2.500.000 / Professional Rp 6.000.000 / Enterprise mulai Rp 12.000.000, dibatasi **pengguna & voyage** | Dua model harga hidup berbarengan di satu produk, berbeda sepuluh kali lipat. Ini bukan detail — ini menentukan seluruh bentuk gating (**P48**) |
| Tidak ada **batas kuota** apa pun | `Tenant.modulesEnabled` mengatur modul mana yang menyala; tak ada satu pun hitungan pengguna, voyage, penyimpanan, atau panggilan AI | Paket "5 pengguna · 25 voyage" tidak bisa dijual, karena tak ada yang menghitungnya |
| Hanya **satu gerbang pembayaran** | `lib/billing/midtrans.ts` + `api/billing/{checkout,notification}` — Midtrans Snap saja | Kartu Indonesia yang ditolak satu gerbang tidak punya jalan kedua. Marlon sudah mengalami ini di produk lain (Salindia) dan memutuskan gerbang kedua pada **17 Ags 2026** — lihat §5 |
| Tidak ada **identitas pihak luar** sama sekali | `User.role` adalah enum `Role` berisi **tujuh peran internal** (ADMIN, OPERATOR, FINANCE, VIEWER, MANAJER_OPERASI, PENYUSUN_BIAYA, DIREKTUR). Semuanya staf Tribuana. `authorize()` di `lib/auth.ts` mencari satu tabel `User` saja | Pelanggan & vendor berhubungan lewat PDF dan surel. Blueprint §7.2 menuliskannya terang: *"Sampai Fase 8, principal berhubungan melalui dokumen dan surel."* |
| Tidak ada **data pergerakan kapal** | tak ada satu pun panggilan ke penyedia AIS/cuaca di `src/lib/` | `Voyage.eta` diketik tangan dan basi diam-diam |
| Merek **tercampur dua lapis** | `public/logo-transparent.png` (merek produk, hardcoded di layar) vs `Tenant.logoUrl` (merek pelanggan, sudah dipakai di kop PDF) | Belum ada yang memutuskan apakah produk ini dijual sebagai "Maritime Suite" atau sebagai merek pelanggan (**P56**) |
| Tidak ada **pengukuran pemakaian** | tak ada tabel/kode analitik apa pun | Pertanyaan *"fitur mana yang benar-benar dipakai?"* — pertanyaan paling menentukan untuk produk yang dijual — tak punya jawaban selain tebakan |
| Kepatuhan & operasional **sengaja ditunda ke sini** | punchlist keamanan/infra (rate limit, brute-force, security header, CI/CD, Sentry, backup otomatis, UU PDP) ditunda sampai *"Fase 8 selesai"* | Aplikasi belum boleh menerima pelanggan berbayar. §11 memisahkan mana yang **fitur** dan mana yang **checklist go-live** |

### 1.2 Premis yang harus dipegang seluruh dokumen ini

Fase 6 harus jujur bahwa data historinya nol. Fase 7 harus jujur bahwa aplikasinya belum pernah dipakai satu hari pun. Fase 8 harus jujur tentang **empat** hal:

1. **Belum ada satu pun pelanggan berbayar, dan belum ada satu pun percakapan harga dengan calon pelanggan.** Blueprint §11 menuliskannya sendiri: *"Belum ada penelitian harga terhadap calon pelanggan."* Konsekuensi desain: setiap angka komersial (harga, kuota, lama trial, jam SLA dukungan) **dikurung di satu modul murni** dan dicatat sebagai `P<n>`, persis pola `approval-policy.ts` (P1), `anomaly-rules.ts` (P19), dan `sla-policy.ts` (P32). Yang dibangun adalah **mesinnya**, bukan angkanya.
2. **Aplikasi belum di-deploy ke mana pun.** Ini bukan kelemahan di fase ini — ini **keuntungan terbesarnya**, dan §3 memanfaatkannya. Semua yang mahal diubah sesudah ada data produksi (peran database, kebijakan RLS, model identitas, bentuk `orderId`) masih gratis diubah hari ini. Kesempatan itu tidak datang dua kali.
3. **Pihak luar yang masuk bukan "pengguna dengan peran lain".** Seorang pelanggan yang login adalah **lawan** dari tenant lain di database yang sama. Ini pembalikan asumsi keamanan yang dipegang sejak Fase 0, dan seluruh §3 ada karena itu.
4. **Fase 8 lebih mudah dibengkakkan daripada Fase 7.** Sepuluh sub-fitur, dan tiap satunya punya versi "lengkap" berbulan-bulan (portal dengan chat, mesin penagihan berulang penuh, AIS peta langsung, white-label sampai CSS, help center dengan tiket & basis pengetahuan sendiri). Karena itu §16 (*yang sengaja tidak dibangun*) tetap panjang. Ukuran keberhasilan Fase 8 bukan "fiturnya banyak", melainkan: **satu keagenan selain Tribuana bisa mendaftar, membayar, memakai, dan mengundang pelanggannya — tanpa Marlon menyentuh database.**

### 1.3 Dua "tagihan" yang tidak boleh tertukar — ditulis di depan karena inilah kesalahan baca termahal di fase ini

Kata "invoice" di dokumen ini berarti **dua hal yang sama sekali berbeda**, dan mencampurnya akan menghasilkan skema yang salah:

| | **Tagihan langganan (SaaS)** | **Tagihan keagenan (produk)** |
|---|---|---|
| Siapa menagih | Maritime Suite (Marlon) | Tenant (mis. PT Tribuana) |
| Siapa ditagih | Tenant, yaitu perusahaan keagenan | `Customer` — perusahaan pelayaran yang memakai jasa keagenan |
| Apa yang ditagih | Langganan bulanan + add-on | Jasa keagenan: EPDA/FDA → Invoice |
| Model data | `Payment` (sudah ada, Fase 0) + `SubscriptionInvoice` (baru, K164) | `Disbursement` → `Invoice` → `InvoicePayment` (Fase 3/4) |
| Gerbang | Midtrans & Duitku (K158) | **Tidak ada** — dibayar transfer bank, dicatat manual sebagai `InvoicePayment` |
| Kalau macet | Tenant jadi read-only (K157) | Piutang (AR) naik; laporan Outstanding |

Skema sudah pernah menuliskan pemisahan ini dan **harus dipertahankan** — komentar `InvoicePayment` di `schema.prisma` berbunyi: *"Pembayaran tagihan PELANGGAN (AR). Sengaja bukan `Payment`; model itu sudah dipakai untuk langganan SaaS lewat Midtrans, urusan yang berbeda."* Fase 8 memperluas keduanya, dan **tidak pernah** menyambungkannya. Tidak ada satu pun jalur kode di dokumen ini yang membuat pembayaran langganan menyentuh `Invoice`, atau sebaliknya.

### 1.4 Yang sudah ada dan dipakai ulang tanpa ditulis ulang

| Aset | Berkas | Dipakai Fase 8 untuk |
|---|---|---|
| Pagar tenant + `forTenant()` + 6 aturan service | `services/tenant-guard.ts`, `POLA-SERVICE-LAYER.md` §5 | seluruh jalur **internal**; jalur portal mendapat pagar **kedua** (K148) |
| `TenantContext` + `requireTenant()` + `systemContext()` | `services/context.ts` | cetakan `PortalContext` (K143) |
| `withTenant()` + `ServiceError` → status HTTP | `services/http.ts`, `services/errors.ts` | cetakan `withPortal()` (K149) |
| Pendaftaran mandiri + trial 7 hari | `api/auth/register/route.ts` | K151 — **tidak** ditulis ulang; wizard adalah lapisan sesudahnya |
| Midtrans Snap + verifikasi tanda tangan konstan-waktu | `lib/billing/midtrans.ts`, `api/billing/*` | K158–K161 — Duitku jadi **kembarannya**, bukan penggantinya |
| Gating langganan | `lib/billing/access.ts` + `services/subscription.ts` (K33) | K156/K157 — kuota menumpang mekanisme yang sama |
| `Tenant.plan`/`modulesEnabled`/`trialEndsAt`/`subscriptionEndsAt` | `schema.prisma` | K155 — kolom yang sudah ada dipakai, tidak diganti |
| `Tenant.logoUrl` + kop PDF ber-merek tenant | `schema.prisma`, `lib/pdf/*` | K179 — white-label **sudah setengah ada**; yang kurang cuma layar & portal |
| `Attachment` + adapter penyimpanan (K106/K107) | `services/ops/*` (Fase 7) | unggah tagihan vendor (K172), logo tenant (K181), ekspor data (K186) |
| `owner-guard.ts` + `pastikanEntitasMilikTenant` (K85) | `services/ops/` (Fase 7) | cetakan langsung untuk daftar putih portal (K148) |
| `Notification` + `notify()` + `dedupeKey` (K86/K101) | `services/notification.service.ts` | pemberitahuan langganan hampir habis, tagihan vendor masuk |
| `AuditLog` + `catatAudit()` | `services/finance/audit.ts` | **wajib** untuk setiap tindakan portal (K150) |
| Endpoint job ber-token + idempoten (K88/K102) | `api/jobs/run` (Fase 7) | sapuan langganan kedaluwarsa, cache AIS, backup terjadwal |
| `KnowledgeArticle` (K140, Fase 7) | `services/ops/knowledge.service.ts` | K189 — Help Center menumpang ini, bukan CMS kedua |
| Konvensi UI dua bahasa + `router.refresh()` | `VoyageWorkspace.tsx` dsb. | semua layar baru, **termasuk** layar portal |
| Pola uji `.mjs` yang bisa dijalankan Node langsung | `prisma/check-*.mjs` | semua modul murni Fase 8 |

### 1.5 Sasaran & bukan-sasaran

**Sasaran Fase 8:** sebuah keagenan yang belum pernah bertemu Marlon bisa mendaftar sendiri, dituntun sampai bisa membuat voyage pertamanya, membayar lewat salah satu dari dua gerbang, ditahan dengan sopan saat kuotanya habis, mengundang pelanggannya untuk melihat tagihan sendiri, mengundang vendornya untuk melihat PO yang ditujukan kepadanya, menempelkan mereknya sendiri pada dokumen dan portal, dan meminta seluruh datanya diekspor kalau ia berhenti berlangganan. Dan: **bug satu endpoint portal tidak boleh membuat data keagenan lain terlihat.**

**Bukan sasaran Fase 8** (batasnya ditulis di depan supaya tidak melar):
- **Penagihan berulang otomatis** (kartu disimpan, auto-debit tiap bulan) — K163. Yang dibangun: perpanjangan manual yang diingatkan, sama seperti perilaku Midtrans sekarang.
- **Marketplace / banyak penjual / bagi hasil** — di luar seluruh roadmap.
- **Portal yang bisa dipakai bekerja** (pelanggan membuat order, vendor menawar harga) — K169/K173. Portal Fase 8 adalah **jendela**, bukan meja kerja.
- **Peta AIS langsung di layar** dengan pelacakan berkelanjutan — K177. Yang dibangun: pengambilan atas permintaan, dengan cache.
- **White-label sampai tema CSS penuh** — K180. Yang dibangun: logo, satu warna, nama, dan subdomain.
- **Sistem tiket dukungan sendiri** — K190. Kanal dukungan adalah surel/WhatsApp; yang dibangun adalah **isi bantuan**, bukan helpdesk.
- **Aplikasi mobile / offline** — di luar seluruh roadmap v2.
- **Migrasi 54 route lama ke pola service layer** — masih `POLA-SERVICE-LAYER.md` §8; tapi §3 mengubah **statusnya** dari "boleh santai" menjadi **prasyarat bagi RLS penuh**, dan itu ditulis terang di K147.

---

## 2. Prinsip yang mengikat seluruh Fase 8

### K143 — Pengguna luar **bukan** `User` dengan peran baru. Identitasnya tabel sendiri

Godaan yang harus ditolak lebih dulu, karena ia yang paling murah dikerjakan dan paling mahal disesali: tambahkan `CUSTOMER` dan `VENDOR` ke enum `Role`, tautkan `User.customerId`, selesai dalam satu sore.

| Pendekatan | Bentuk | Kenapa ditolak / dipilih |
|---|---|---|
| Tambah nilai ke enum `Role` | `Role` jadi sembilan nilai; `User` dapat kolom `customerId`/`vendorId` nullable | **Ditolak.** Tujuh peran itu adalah **peta wewenang internal** yang sudah dipakai di puluhan `requireRole(...)`. Setiap pemanggilan yang menulis `requireRole(ctx, 'ADMIN', 'OPERATOR')` diam-diam berarti "bukan pihak luar" — dan artinya setiap panggilan yang **lupa** menyebut peran (banyak jalur baca tidak memakai `requireRole` sama sekali, karena semua peran internal boleh membaca) **otomatis terbuka untuk pihak luar**. Kegagalannya senyap, jumlahnya puluhan, dan tak satu pun menghasilkan galat |
| Tabel `PortalUser` terpisah + sesi terpisah | Dua tabel identitas, dua provider NextAuth, dua namespace route | **Dipilih.** Kode internal yang sudah ada **tidak berubah artinya sama sekali**: `TenantContext` tetap berarti "staf tenant ini". Pihak luar memakai `PortalContext`, yang tidak pernah bisa masuk ke `withTenant()` |
| Satu tabel `User` + kolom `kind` (`INTERNAL`/`PORTAL`) | Satu tabel, satu provider, cabang di setiap pagar | **Ditolak.** Bentuk paling berbahaya dari semuanya: `getServerSession` yang sama mengembalikan kedua jenis, jadi setiap route lama yang cuma memeriksa `if (!session?.user)` — dan **itulah persis pola 54 route lama** (`POLA-SERVICE-LAYER.md` §1) — langsung menerima pengguna portal pada hari pertama |

Yang menentukan bukan kerapian, melainkan **arah kegagalannya**. Dengan tabel & sesi terpisah, kode internal yang lupa dipagari akan **menolak** pengguna portal (sesinya tak dikenali). Dengan enum yang diperluas, kode internal yang lupa dipagari akan **menerimanya**. Di fase yang seluruh nilainya bergantung pada isolasi, hanya satu dari dua arah itu boleh dipilih.

Konsekuensi yang diterima sadar: dua halaman login, dua alur lupa-kata-sandi, dan sedikit kode yang mirip di dua tempat. Itu harga yang jauh lebih murah daripada satu kebocoran.

### K144 — Portal punya **namespace, sesi, dan lapisan service sendiri**; tidak pernah menumpang route internal

```
/login                    → sesi internal (NextAuth "credentials")           TIDAK BERUBAH
/api/**                   → withTenant(), TenantContext                      TIDAK BERUBAH

/portal/login             → sesi portal   (NextAuth "portal-credentials")    BARU
/portal/**                → layar pihak luar                                 BARU
/api/portal/**            → withPortal(), PortalContext                      BARU
```

Aturan yang mengikat:
1. **Tidak ada satu pun handler yang melayani keduanya.** Kalau sebuah data dibutuhkan dua-duanya (mis. PDF invoice), yang dipakai bersama adalah **service**-nya, bukan route-nya — dan service portal memanggil proyeksi berdaftar-putih (K167), bukan service internal apa adanya.
2. **`withPortal()` tidak pernah menghasilkan `TenantContext`.** Tipenya berbeda; kompilasi gagal kalau tertukar. Ini pagar termurah yang bisa dibeli: TypeScript, bukan ingatan.
3. **Cookie sesi berbeda nama** (`__Host-portal-session`), sehingga sesi portal tidak pernah dikirim ke route internal dan sebaliknya. Sesi bocor lewat cookie yang sama adalah kelas bug yang cukup dihindari sekali di awal.
4. Setiap tindakan portal **menulis `AuditLog`** dengan `userId = "portal:<portalUserId>"` — jejak yang membedakan pihak luar dari staf tanpa menambah kolom.

### K145 — Penambahan skema Fase 8 tetap **aditif**, dan `TENANT_MODELS` bertambah 8

Semua tabel di dokumen ini **baru**. Tidak ada `DROP`, tidak ada `ALTER COLUMN`, tidak ada `SET NOT NULL` pada tabel yang sudah ada. Perubahan pada tabel lama hanya **kolom nullable** (`Payment.gateway`, `Payment.gatewayRef`, `Tenant.onboardingState`, `Tenant.brandPrimaryColor`, `Tenant.portalSlug`, `Tenant.customDomain`, `Tenant.logoAttachmentId`) dan **satu unique index** atas kolom yang seluruh isinya `NULL` (aman: `NULL` tak pernah bertabrakan dengan `NULL` di Postgres — argumen yang sama sudah dipakai K89). Prosedur **K7** (backup → baseline → `migrate`) tetap wajib.

Delapan model bertenant baru — `PortalUser`, `PortalAccess`, `PortalInvitation`, `SubscriptionInvoice`, `VendorInvoiceSubmission`, `MarineDataCache`, `UsageEvent`, `DataRequest` — **wajib** didaftarkan di `TENANT_MODELS` (`POLA-SERVICE-LAYER.md` §6). Satu model **anak** — `SubscriptionInvoiceItem` — sengaja **tidak** membawa `tenantId` dan tidak didaftarkan; aksesnya lewat induk (K44).

> Catatan untuk pelaksana: sama seperti K89, patokan `npm run test:tenant` bukan angka, melainkan **semua lulus**. Uji itu memang dirancang untuk **gagal menyebut nama model** yang lupa didaftarkan. Jangan "perbaiki" dengan menurunkan ekspektasi angkanya.

### K146 — Semua angka komersial di **satu modul murni**, dan bawaannya "belum ditetapkan"

```ts
// services/saas/commercial-policy.ts — MURNI, import type saja (K11/K51)
export const KUOTA_PER_PAKET: Readonly<Record<string, Kuota>> = { /* semua null = tak dibatasi (P48/P49) */ }
export const HARI_TRIAL = 7                       // sudah berlaku di api/auth/register (P51)
export const AMBANG_PERINGATAN_KUOTA = 0.8        // 80% → peringatkan, jangan blokir (K156)
export const GERBANG_BAWAAN: 'MIDTRANS' | 'DUITKU' = 'MIDTRANS'   // P50
export const SLA_DUKUNGAN = null                  // null = belum dijanjikan apa pun (P60)
export const RETENSI_SESUDAH_BERHENTI_HARI = null // null = belum ada kebijakan (P51/P59)
```

`null` **bukan** kemalasan; ia pernyataan. Mengisi kuota dengan tebakan berarti sistem mulai menolak pekerjaan pelanggan berbayar dengan batas yang tak pernah disepakati siapa pun, dan penolakan yang salah pada pelanggan berbayar jauh lebih merusak daripada tidak ada batas. Persis pola `sla-policy.ts` (K105) untuk P32: mesinnya jalan, kebijakannya menunggu.

---

## 3. ⚠️ Peninjauan ulang **K9** — isolasi tenant saat pihak luar memegang sesi

> **Ini bagian yang Fase 0 perintahkan ditulis.** [POLA-SERVICE-LAYER.md §2](./POLA-SERVICE-LAYER.md) menutup keputusannya dengan kalimat: *"**Kapan keputusan ini WAJIB ditinjau ulang:** saat **Fase 8** membuka Customer Portal / Vendor Portal — yaitu ketika pengguna **di luar organisasi** mulai memegang sesi. Saat itu radius ledakan sebuah bug berubah, dan RLS sebagai lapis kedua jadi sepadan. Catat ini di rencana Fase 8; jangan sampai terlewat."* Bagian ini adalah pemenuhan janji itu — dan hasilnya **bukan** "masih cukup".

### 3.1 Apa yang persisnya diputuskan di K9, dan atas dasar apa

K9 memilih **tenant-guard di service layer** (Prisma `$extends`, `services/tenant-guard.ts`, ~150 baris) dan **menolak Postgres RLS**, atas lima pertimbangan yang ditulis sebagai tabel. Dua di antaranya menahan seluruh keputusan:

| Alasan K9 menolak RLS (2026-08-10) | Statusnya hari ini (2026-08-17) |
|---|---|
| *"Connection pooling — bentrok: PgBouncer mode transaksi membuat `SET LOCAL` tak andal (Railway/Supabase memakainya)"* | **Tidak lagi berlaku.** Target deploy sudah diputuskan dan bukan Railway/Supabase, melainkan **satu VM Compute Engine dengan Postgres di mesin yang sama** — koneksi langsung, tanpa PgBouncer mode transaksi. `schema.prisma` bahkan sudah menyediakan `directUrl`. Alasan teknis terkuat penolakan RLS **hilang bersama keputusan deploy itu** |
| *"Biaya penerapan tinggi: kebijakan per tabel + pembungkus transaksi di setiap query"* | **Masih berlaku sepenuhnya untuk jalur internal.** 54 route lama masih memakai `prisma` langsung dengan `where tenantId` tulisan tangan (`POLA-SERVICE-LAYER.md` §8). Menyalakan RLS untuk peran database yang dipakai jalur itu akan mematikan 54 route sekaligus |
| *"Ancaman nyata saat ini adalah kode kita sendiri yang lupa menyaring, bukan penyerang dengan akses SQL langsung"* | **Berubah maknanya**, dan inilah inti §3 — lihat 3.2 |

Jadi peninjauan ini menemukan keadaan yang **asimetris**: satu alasan penolakan mati, satu masih hidup, dan ancamannya berubah bentuk. Keputusan yang jujur karenanya juga asimetris (K147) — bukan "RLS untuk semuanya", bukan pula "tidak berubah".

### 3.2 Radius ledakan: apa yang berubah, dan yang lebih penting — **sumbu isolasinya bertambah**

**Keadaan sebelum Fase 8.** Setiap sesi milik staf Tribuana. Sebuah endpoint yang lupa `forTenant` membocorkan data tenant lain — tetapi (a) hanya ada **satu** tenant nyata (`goLiveAt` Tribuana; sisanya seed/uji), dan (b) yang menerima kebocoran adalah karyawan perusahaan pemilik aplikasi. Radius ledakan praktisnya **nol**. Itu sebabnya K9 benar pada waktunya, dan dokumen ini tidak menyalahkannya.

**Keadaan sesudah Fase 8.** Tiga hal berubah sekaligus:

1. **Ada banyak tenant nyata yang saling bersaing.** Dua keagenan di Samarinda adalah pesaing langsung. Bocornya satu baris `Disbursement` bukan pelanggaran teknis; itu bocornya struktur biaya kepada pesaing.
2. **Yang memegang sesi bukan lagi karyawan yang bisa ditegur.** Ia pelanggan atau vendor — orang yang tak punya kewajiban apa pun kepada pemilik data, dan yang **id-nya sendiri bisa ia baca** dari URL portalnya.
3. **Dan yang paling menentukan: muncul sumbu isolasi KEDUA yang tenant-guard tidak pernah dirancang untuk menutupnya.**

Butir ketiga adalah temuan terpenting seluruh peninjauan ini, dan ia mudah terlewat. Perhatikan:

```
Sumbu 1 — antar-tenant :  invoice milik keagenan A  ⟂  invoice milik keagenan B
                          → dijaga tenant-guard (menyuntik tenantId ke setiap where). ✅

Sumbu 2 — antar-PIHAK  :  invoice untuk PT Samudra  ⟂  invoice untuk PT Nusantara
   di dalam SATU tenant   (dua-duanya customer milik keagenan A, tenantId IDENTIK)
                          → tenant-guard TIDAK MENJAGA APA PUN di sini. ❌
```

`forTenant(ctx).invoice.findMany({ where: { status: 'ISSUED' } })` dipanggil dari endpoint portal adalah query yang **lolos seluruh pagar Fase 0 dengan sempurna** dan mengembalikan tagihan **semua** pelanggan keagenan itu kepada satu pelanggan. Tidak ada galat. `npm run test:tenant` tetap 100% lulus — karena uji itu memeriksa sumbu 1, dan ini sumbu 2.

Ini juga alasan kenapa jawaban "pasang RLS pada `tenantId` saja" **tidak cukup**: RLS pada `tenantId` menjaga sumbu 1, yang sudah dijaga tenant-guard. Sumbu 2 tetap terbuka. Peninjauan yang berhenti pada "RLS ya/tidak" akan melewatkan risiko yang justru paling besar di fase ini.

Satu contoh konkret supaya tidak abstrak — endpoint yang tampak wajar dan bocor total:

```ts
// ❌ Kelihatan benar, lulus tsc, lulus test:tenant, dan membocorkan seluruh
//    piutang keagenan A kepada satu pelanggannya.
export const GET = withPortal(async (pctx) =>
  Response.json(await forTenant(pctx as any).invoice.findMany({ where: { deletedAt: null } })),
)
```

Yang membuatnya berbahaya bukan kecerobohannya, melainkan **betapa mirip ia dengan kode yang benar** di seluruh repo ini. Setiap service internal berbentuk persis seperti itu. Pelaksana yang menyalin pola yang sudah terbukti akan menulis bug ini, bukan pelaksana yang malas.

### 3.3 Alternatif yang dipertimbangkan

| Pilihan | Menutup sumbu 1 | Menutup sumbu 2 | Biaya | Putusan |
|---|---|---|---|---|
| **A. Tetap tenant-guard saja**, portal memakai `forTenant` + `where` tulisan tangan | ✅ | ❌ — bergantung ingatan, di jalur yang paling tidak boleh bergantung ingatan | Nol | **Ditolak.** Ini persis pola yang `POLA-SERVICE-LAYER.md` §1 sebut sebagai masalah yang harus dipecahkan — dipasang di tempat yang taruhannya paling tinggi |
| **B. RLS penuh sekarang** untuk semua peran & semua tabel | ✅✅ | ⚠️ butuh kebijakan tambahan per-pihak | **Sangat tinggi**: mematikan 54 route lama seketika; membungkus setiap query di transaksi interaktif; dua bulan kerja yang bukan fitur | **Ditolak untuk sekarang** — tapi jalannya dibuka, lihat K147 |
| **C. Skema Postgres per tenant** (`tenant_a.invoice`, …) | ✅✅ | ❌ | Sangat tinggi: Prisma tidak mendukung ini dengan wajar; migration jadi N kali; ~50 tabel × N tenant | **Ditolak.** Menukar satu masalah yang bisa diuji dengan masalah operasional yang tak bisa |
| **D. Database terpisah per tenant** | ✅✅✅ | ❌ | Tertinggi. Untuk target "keagenan menengah Indonesia" (blueprint §11.3) ini biaya server & operasi yang tidak akan pernah kembali | **Ditolak** |
| **E. Pagar aplikasi kedua khusus portal (`forPortal`, fail-closed, daftar putih model & pihak)** | ✅ | ✅ | Rendah: satu berkas, ~120 baris, cetakannya sudah ada (`owner-guard.ts` K85) | **Dipilih sebagai lapis 1** |
| **F. RLS + peran database kedua, HANYA untuk jalur portal** | ✅ ditegakkan database | ✅ ditegakkan database | Sedang: kebijakan pada ~10 tabel yang memang dijangkau portal, satu peran DB, satu klien Prisma kedua. **Tidak menyentuh 54 route lama sama sekali** karena mereka memakai peran DB yang berbeda | **Dipilih sebagai lapis 2** |

E dan F **tidak** saling menggantikan: keduanya menutup sumbu yang sama dengan mekanisme yang berbeda, sehingga kebocoran menuntut **dua** kegagalan yang tak berkorelasi (bug TypeScript **dan** kebijakan SQL yang salah). Ini satu-satunya tempat di seluruh v2 yang layak membayar dua lapis; alasannya bukan "keamanan itu bagus", melainkan bahwa di sinilah satu bug tunggal punya konsekuensi komersial yang tidak bisa ditarik kembali.

### K147 — ⚠️ **Revisi terhadap K9**: RLS **diterima**, tapi hanya untuk jalur portal, lewat **peran database kedua**

**Ini membalik separuh K9, dan disebutkan terang-terangan** — pola yang sama dipakai Fase 7 saat merevisi K80 (→K111) dan mengetatkan K82 (→K112). K9 berbunyi *"tenant-guard, **bukan** Postgres RLS"*. Sesudah dokumen ini, kalimat itu berlaku untuk **jalur internal saja**. Jalur portal memakai RLS, dan pemakaian itu adalah pemakaian RLS yang pertama di repo ini.

**Bentuknya:**

```
Peran DB  maritime_app     ← dipakai seluruh aplikasi internal (yang sekarang).
                             RLS pada tabel-tabel portal: AKTIF, tapi peran ini
                             ada di dalam daftar BYPASSRLS. Perilakunya tidak
                             berubah satu bit pun. 54 route lama aman.

Peran DB  maritime_portal  ← dipakai HANYA oleh PrismaClient kedua yang melayani
                             /api/portal/**. TANPA bypass. Tanpa hak DDL. Hanya
                             SELECT (+ INSERT pada dua tabel, K172).
                             Kebijakan RLS-nya menyaring DUA sumbu sekaligus:
                               USING (
                                 "tenantId" = current_setting('app.tenant_id', true)
                                 AND <kunci pihak> = current_setting('app.party_id', true)
                               )
                             Tabel tanpa kebijakan → tidak terjangkau sama sekali
                             (default-deny; peran ini tidak diberi GRANT SELECT).
```

`SET LOCAL app.tenant_id` / `app.party_id` dijalankan **satu kali** di dalam `withPortal()`, sebagai perintah pertama transaksi interaktif yang membungkus seluruh penanganan permintaan portal. Ini bekerja andal justru karena keputusan deploy sudah diambil: satu VM, Postgres lokal, **tanpa** PgBouncer mode transaksi. Itulah bagian K9 yang mati dan membuat pilihan ini mungkin hari ini padahal tidak mungkin sepuluh hari lalu.

**Kenapa hanya jalur portal, dan bukan semuanya:**

| | Jalur internal | Jalur portal |
|---|---|---|
| Siapa pemegang sesi | staf tenant, terikat kontrak kerja | pihak luar, tak terikat apa pun |
| Berapa jalur kode yang harus diamankan | ~54 route lama + seluruh service | ~10 endpoint, semuanya **baru** |
| Biaya menyalakan RLS | mematikan 54 route yang sedang dipakai | **nol** — belum ada satu barisnya |
| Apa yang hilang kalau tidak dinyalakan | risiko yang sudah ditanggung sejak Fase 0, dan sudah berjalan | risiko yang belum pernah ada, di titik paling mahal |

Menyalakan RLS di tempat yang biayanya nol dan taruhannya tertinggi, sambil menunda di tempat yang biayanya tinggi dan taruhannya tidak berubah, bukan kompromi setengah hati — itu urutan yang benar. Dan penting: **memasang kebijakan RLS sekarang tidak menghalangi RLS penuh nanti.** Kebijakannya sudah ada dan sudah terbukti bekerja; yang tersisa nanti hanyalah mencabut `maritime_app` dari daftar bypass — sesudah 54 route lama dimigrasi. Itu menaikkan status migrasi route lama dari "boleh santai" (`POLA-SERVICE-LAYER.md` §8) menjadi **satu-satunya penghalang RLS penuh**, dan itu ditulis di sini supaya tidak hilang lagi.

**Catatan deploy (bukan desain deploy):** rencana VM tunggal harus menyediakan **dua** kredensial Postgres, bukan satu — `DATABASE_URL` (yang sudah ada) dan `PORTAL_DATABASE_URL` (baru). Keduanya menunjuk database yang sama. Pembuatan peran + kebijakan dikirim sebagai migration SQL biasa, jadi ia ikut prosedur K7 dan tidak menuntut langkah manual di server. Kalau suatu hari deploy pindah ke platform yang memaksa PgBouncer mode transaksi, **K147 harus ditinjau ulang** — dan lapis 1 (K148) tetap berdiri sendiri sementara itu.

**Apa yang secara jujur TIDAK ditutup K147:** penyerang yang mendapat kredensial `maritime_app` (mis. lewat RCE di proses Node) tetap melewati semuanya. RLS di sini bukan pertahanan terhadap penyerang berdaulat; ia pertahanan terhadap **endpoint portal yang ditulis salah** — yaitu persis ancaman yang paling mungkin terjadi, oleh orang yang paling berniat baik.

### K148 — `forPortal(pctx)`: pagar aplikasi **fail-closed**, dengan daftar putih model **dan** kunci pihak

Lapis pertama. Bentuknya sengaja dibuat sebagai **kebalikan** tenant-guard, dan perbedaannya bukan gaya:

| | `forTenant()` (K9, Fase 0) | `forPortal()` (K148, Fase 8) |
|---|---|---|
| Model yang tak terdaftar | **lolos tanpa disaring** (`if (!TENANT_MODELS.has(model)) return args`) | **melempar** — model yang tak ada di `MODEL_PORTAL` tidak bisa disentuh sama sekali |
| Operasi yang tak dikenal | melempar | melempar |
| Operasi tulis | diizinkan (`create`/`updateMany`/`deleteMany`) | **hanya** `findFirst`/`findMany`/`count` + `create` pada dua model (K172). Sisanya melempar |
| Yang disuntikkan ke `where` | `tenantId` | `tenantId` **dan** kunci pihak (`customerId`/`vendorId`), sesuai peta per model |
| Kalau peta salah/kurang | uji `test:tenant` menyebut nama modelnya | akses **ditolak**; tidak ada keadaan "terlanjur terbuka" |

```ts
// services/portal/portal-guard.ts — MURNI, TANPA impor (cetakan: tenant-guard.ts)
type KunciPihak = { customer?: string; vendor?: string }   // nama kolom, per model

export const MODEL_PORTAL: Readonly<Record<string, KunciPihak>> = {
  Invoice:       { customer: 'customerId' },
  Voyage:        { customer: 'customerId' },
  PurchaseOrder: { vendor: 'vendorId' },
  WorkOrder:     { vendor: 'vendorId' },
  // …dan hanya yang benar-benar dibuka. Menambah satu = keputusan sadar.
}
```

Model yang **tidak** punya kunci pihak langsung (mis. `InvoiceItem`, `PurchaseOrderItem` — model anak tanpa `tenantId`, K44) **tidak pernah** diakses lewat `forPortal` sama sekali; ia hanya boleh ikut lewat `include` dari induk yang sudah tersaring. Ini bukan penyederhanaan: model anak tak punya kolom yang bisa disaring, jadi memberinya jalan masuk sendiri berarti membuka pintu tanpa kunci — persis pelajaran K44 dan K65, di permukaan yang lebih berbahaya.

### K149 — `withPortal()`: satu-satunya pintu masuk portal, dan ia yang memasang **kedua** lapis

```ts
// services/portal/http.ts — cetakan: services/http.ts (withTenant)
export function withPortal<A extends unknown[]>(
  handler: (pctx: PortalContext, req: Request, ...extra: A) => Promise<Response>,
) { /* 1) baca sesi portal  2) buka transaksi pada klien PORTAL
       3) SET LOCAL app.tenant_id / app.party_id  4) jalankan handler
       5) AuditLog  6) terjemahkan ServiceError → status (dipakai ulang apa adanya) */ }
```

```ts
export type PortalContext = {
  tenantId:     string
  portalUserId: string
  pihak:        'CUSTOMER' | 'VENDOR'
  pihakId:      string        // Customer.id atau Vendor.id
  // TIDAK ADA `role`. Pihak luar tidak punya peran internal — K143.
}
```

Tiga larangan yang menyertainya:
1. `PortalContext` **tidak boleh** dikonversi ke `TenantContext`, tidak dengan cast, tidak dengan helper "praktis". Kalau sebuah service internal dibutuhkan portal, yang dibuat adalah **proyeksi** di `services/portal/` (K167) — bukan jembatan.
2. `systemContext()` **tidak pernah** dipakai di jalur portal. Ia berperan ADMIN dan melewati `requireRole` (`context.ts`); memakainya di sini meniadakan seluruh §3.
3. Route di `/api/portal/**` yang **tidak** dibungkus `withPortal` adalah cacat pelaksanaan, dan diuji: `check-portal-guard.mjs` menyapu direktori itu dan gagal bila menemukan `export const GET/POST` yang tidak melewati `withPortal`. Uji struktural, bukan uji perilaku — karena kesalahan ini bentuknya "lupa", dan lupa tidak bisa diuji dengan kasus.

### K150 — Bukti, bukan keyakinan: `test:portal` wajib membuktikan **kedua** sumbu, pada **kedua** lapis

`prisma/check-portal-guard.mjs` — dan ia harus membuktikan dirinya nyata (pola K85 butir 4: matikan satu pagar → uji gagal):

| # | Yang dibuktikan | Cara |
|---|---|---|
| 1 | Sumbu 1, lapis aplikasi | `pctx` pelanggan tenant A membaca id invoice milik tenant B → **NOT_FOUND**, bukan 403 (aturan #6 `POLA-SERVICE-LAYER.md`) |
| 2 | **Sumbu 2, lapis aplikasi** | `pctx` pelanggan X (tenant A) membaca invoice pelanggan Y (tenant A, `tenantId` **sama**) → **NOT_FOUND** |
| 3 | Sumbu 1, lapis database | `psql` sebagai `maritime_portal` **tanpa** `SET app.tenant_id` → `SELECT count(*) FROM "Invoice"` → **0 baris**, bukan galat izin, bukan seluruh tabel |
| 4 | **Sumbu 2, lapis database** | `SET app.tenant_id` benar, `app.party_id` pelanggan X → `SELECT` hanya mengembalikan invoice X. Hitung tangan |
| 5 | Lapis 2 berdiri sendiri | Nonaktifkan sementara `forPortal` (pakai klien portal mentah) → **RLS tetap menahan** butir 3 & 4. Ini yang membuktikan dua lapis, bukan satu lapis yang ditulis dua kali |
| 6 | Lapis 1 berdiri sendiri | Beri `maritime_portal` `BYPASSRLS` sementara → **`forPortal` tetap menahan** butir 1 & 2. Kembalikan |
| 7 | Fail-closed | `forPortal(pctx).vessel.findMany()` (model tak terdaftar) → **melempar**, bukan mengembalikan data |
| 8 | Tulis tertutup | `forPortal(pctx).invoice.updateMany(...)` → **melempar** |
| 9 | Peran DB tak berdaya lebih | `maritime_portal` mencoba `INSERT` ke `Invoice`, `DROP TABLE`, `SET ROLE maritime_app` → ketiganya **ditolak database** |
| 10 | Sesi tak tertukar | Cookie sesi portal dikirim ke `/api/voyages` → **401**. Cookie sesi internal dikirim ke `/api/portal/invoices` → **401** |
| 11 | Jejak | Setiap butir di atas yang berhasil menulis satu `AuditLog` ber-`userId` berawalan `portal:` |

Butir 5 dan 6 adalah inti uji ini. Tanpa keduanya, "dua lapis" hanyalah klaim.

### Konsekuensi kalau peninjauan K9 tidak dikerjakan sekarang

Portal tetap bisa dibangun, dan **kemungkinan besar akan tampak bekerja dengan sempurna** — karena selama pengujian dilakukan dengan satu pelanggan pada satu tenant, sumbu 2 tidak pernah diuji dan sumbu 1 dijaga tenant-guard. Kebocorannya baru muncul pada pelanggan kedua di tenant yang sama, yaitu tepat pada saat produk mulai laku. Dan kebocoran itu tidak menghasilkan galat, tidak masuk log, dan tidak terlihat di layar mana pun — yang bocor **terlihat rapi dan masuk akal** bagi yang menerimanya. Ia diketahui saat seseorang menyebutkannya, dan pada titik itu kerusakan reputasinya sudah terjadi di pasar yang blueprint §10 sendiri gambarkan sebagai *"saling mengenal dan berukuran kecil"*.

Ada pula alasan waktu yang tak akan berulang: memasang peran database kedua dan kebijakan RLS **hari ini** berbiaya satu migration pada database yang belum punya data produksi. Melakukannya setelah go-live berarti mengubah kepemilikan objek dan hak akses pada database yang sedang melayani pelanggan berbayar. Itu perbedaan antara satu sore dan satu jendela pemeliharaan yang menegangkan.

---

## 4. Onboarding wizard — dari "mendaftar" ke "bisa dipakai"

### K151 — `/register` yang sudah ada **dipertahankan apa adanya**; wizard adalah lapisan **sesudah** pendaftaran

`api/auth/register/route.ts` sudah melakukan yang benar: membuat `Tenant` (dengan profil perusahaan & logo), membuat `User` pertama ber-peran `ADMIN`, memasang `plan: 'TRIAL'`, `modulesEnabled` empat modul, dan `trialEndsAt` tujuh hari. Menulis ulang jalur itu berarti mengambil risiko pada satu-satunya jalur yang sudah terbukti membuat tenant dengan benar, demi kerapian.

Yang **kurang** bukan pendaftarannya, melainkan apa yang terjadi sesudahnya: tenant baru mendarat di aplikasi tanpa mata uang, tanpa pelabuhan, tanpa katalog jasa — sehingga fitur unggulan (EPDA yang mengisi dirinya sendiri) tidak punya bahan, dan kesan pertamanya adalah aplikasi yang rusak.

**Putusan:** tiga tambahan, semuanya aditif.
1. Satu kolom `Tenant.onboardingState Json?` — keadaan wizard (langkah mana yang sudah tuntas/dilewati). `Json?` dan bukan tabel: bentuknya akan berubah beberapa kali dalam setahun pertama, isinya kecil, dan tak ada yang perlu meng-query-nya (semangat yang sama dengan alasan `dataOrigin` dipilih `String?` di K55).
2. Satu langkah **penyemaian awal** yang berjalan sekali (K153).
3. Satu layar wizard di `/onboarding` yang **selalu bisa dilewati**.

### K152 — Enam langkah, semuanya **boleh dilewati**, dan tak satu pun memblokir aplikasi

| # | Langkah | Apa yang terjadi | Boleh dilewati |
|---|---|---|---|
| 1 | Profil perusahaan & logo | mengisi field `Tenant` yang sudah ada (kop dokumen) | ✅ (sebagian sudah terisi dari `/register`) |
| 2 | Mata uang & kurs | mengaktifkan IDR + USD, satu kurs awal | ✅ |
| 3 | Pelabuhan yang dilayani | memilih dari daftar pelabuhan Indonesia bawaan | ✅ |
| 4 | Katalog jasa & tarif | menyalin **template contoh berlabel** (K153) atau mulai kosong | ✅ |
| 5 | Undang rekan kerja | membuat `User` tambahan (tunduk kuota paket, K156) | ✅ |
| 6 | Kapal pertama | manual, atau ⭐ **impor partikular dari PDF/Excel** (Fase 1, sudah ada) | ✅ |

Aturan yang mengikat, dan alasannya:
- **Tidak ada langkah yang memblokir pemakaian aplikasi.** Wizard adalah tawaran, bukan gerbang. Onboarding yang memaksa membuat orang mengisi asal-asalan untuk lewat, dan data asal-asalan lebih buruk daripada data kosong — pelajaran yang sama sudah dibayar di K96 (tugas tidak memblokir voyage) dan K72 (anomali tidak memblokir).
- **Kemajuan tersimpan**, dan sisa langkah muncul sebagai kartu kecil di Dashboard sampai tuntas atau ditutup. Bukan modal yang menghadang setiap kali login.
- **Langkah 4 tidak pernah mengaku tarif resmi.** Ini pengulangan langsung dari catatan ROADMAP §8 yang masih terbuka sejak Fase 1: *"19 tarif contoh hasil seed belum diganti tarif resmi — harus beres sebelum EPDA dikirim ke principal."* Untuk tenant baru, kesalahan yang sama akan lahir kembali di setiap pendaftaran kalau labelnya tidak dipasang.

### K153 — Penyemaian tenant baru memakai `dataOrigin: 'SEED'` dan berlabel **CONTOH**, tanpa kecuali

Fase 6 membangun sistem provenance (K55–K59) supaya AI tidak pernah belajar dari data latihan. Tenant baru adalah **sumber data seed terbesar** yang akan pernah dimiliki sistem ini — satu penyemaian per pendaftaran, selamanya.

- Setiap baris yang dibuat penyemaian membawa `dataOrigin = 'SEED'` bila modelnya punya kolom itu, dan namanya berawalan `CONTOH — ` bila tidak.
- `Tenant.goLiveAt` tetap `null` sesudah pendaftaran. Konsekuensinya sudah dirancang Fase 6 dan berlaku otomatis: selama `goLiveAt` null, setiap baris baru dicap `UJI` (K56), dan prediksi biaya menolak belajar darinya (K57). Tenant menekan "mulai pakai sungguhan" sendiri di Settings › Data & AI — layar yang sudah ada.
- Skrip penyemaian **memakai ulang** `prisma/seed-v2.mjs` yang sudah terbukti (3 mata uang + 3 pelabuhan + 21 jasa + 19 tarif contoh), dipanggil lewat `systemContext(tenantId)`, satu tenant per panggilan. Tidak ada skrip penyemaian kedua.

### K154 — Pendaftaran mandiri dibuka, tapi dengan **tiga rem** — dan satu di antaranya keputusan Marlon

Pendaftaran terbuka pada aplikasi yang bisa membuat PDF, memanggil LLM berbayar (OpenRouter), dan menyimpan berkas adalah undangan bagi penyalahgunaan. Tiga rem, dari yang paling murah:

| Rem | Bentuk | Catatan |
|---|---|---|
| **Verifikasi email** | tenant tetap dibuat, tapi `Tenant.emailVerifiedAt` null → fitur berbiaya keluar (AI, kirim PDF, unggah) ditolak sampai terverifikasi | ⚠️ Butuh pengirim surel — **P10 masih terbuka sejak Fase 3**. Sampai P10 dijawab, rem ini **tidak bisa dipasang**, dan itu dicatat sebagai risiko, bukan disembunyikan |
| **Batas laju pendaftaran** | per IP, per jam | Ini **checklist go-live**, bukan fitur (§11) — tapi ia **prasyarat** membuka pendaftaran ke publik, jadi ditulis di sini juga |
| **Persetujuan manual** | tenant baru masuk keadaan `PENDING_REVIEW`; Marlon menyetujui | Apakah ini yang diinginkan → **P62**. Interim: **tidak** ada persetujuan manual (perilaku `/register` sekarang), karena mengubahnya nanti adalah satu `if` |

### Siapa boleh apa (onboarding)

| Tindakan | ADMIN | OPERATOR | MANAJER_OPERASI | PENYUSUN_BIAYA | FINANCE | VIEWER | DIREKTUR |
|---|---|---|---|---|---|---|---|
| Melihat kartu kemajuan onboarding | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Menjalankan langkah wizard (mengubah master data) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mengundang rekan kerja (membuat `User`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Menekan "mulai pakai sungguhan" (`goLiveAt`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Wizard menyentuh Master Data & Settings, dan catatan peran Fase 5e sudah menetapkan bahwa itu wilayah `ADMIN` — termasuk menutup `MANAJER_OPERASI` darinya. Konsisten dengan aturan yang sudah berlaku (alasan yang sama dipakai K98 untuk `TaskTemplate`), bukan dengan intuisi bahwa "yang mendaftar kan pasti mau mengatur semuanya".

### Konsekuensi kalau Onboarding tidak dibangun sekarang

Setiap pelanggan baru menuntut penyiapan tangan oleh Marlon: membuat mata uang, memasukkan pelabuhan, menyalin katalog jasa. Untuk tiga sampai lima pengguna awal (blueprint §11.1 tahap 2) itu masih mungkin — dan itulah alasan increment ini **boleh dipangkas** kalau waktu habis. Tapi ia menjadi penghalang keras pada tahap 3 ("langganan terbuka"), dan lebih halus dari itu: tanpa penyemaian, calon pelanggan yang mencoba sendiri akan menilai produk dari layar kosong, bukan dari fitur terbaiknya. Yang hilang bukan waktu penyiapan, melainkan kesan pertama.

---

## 5. Paket langganan & penagihan SaaS — termasuk gerbang kedua (Duitku)

> Baca **§1.3** sebelum bagian ini. Seluruh bagian ini soal **tagihan langganan**: Maritime Suite menagih tenant. Tak satu pun keputusan di sini menyentuh `Invoice`/`InvoicePayment` (tagihan keagenan kepada pelanggannya).

### 5.1 Keadaan hari ini, dan satu pertentangan yang harus diselesaikan manusia

Yang **sudah** ada dan bekerja: `lib/billing/plans.ts` (sumber harga di server — komentar pertamanya sudah menegaskan *"JANGAN pernah percaya angka dari browser"*), `Payment` (pesanan + status + payload mentah), `api/billing/checkout` (Snap), `api/billing/notification` (webhook ber-verifikasi tanda tangan SHA512 konstan-waktu, idempoten, perpanjangan yang **menambah** ke sisa langganan alih-alih memotongnya), `lib/billing/access.ts` (trial vs langganan → `locked`), dan `services/subscription.ts` (K33).

Untuk fondasi yang dibangun sebelum ada pelanggan, ini sudah benar di semua titik yang biasanya salah. Fase 8 **memperluas**, tidak memperbaiki.

Yang harus diselesaikan manusia, dan tidak boleh ditebak kode:

| | Kode hari ini (`plans.ts`) | Blueprint §11.3 |
|---|---|---|
| Paket | `m1` / `m2` / `all` | Basic / Professional / Enterprise |
| Harga | Rp 250.000 / 450.000 / 600.000 | Rp 2.500.000 / 6.000.000 / mulai 12.000.000 |
| Dasar batas | jumlah **modul** | jumlah **pengguna & voyage** |
| Status | berjalan di kode | *"usulan awal untuk bahan diskusi"* — blueprint menandainya sendiri |

Selisihnya **sepuluh kali lipat**, dan dasar pembatasannya berbeda jenis. Ini bukan detail penetapan harga; ia menentukan apa yang harus dihitung sistem. Menebaknya berarti membangun mesin kuota untuk batas yang salah → **P48**. Desain di bawah sengaja dibuat **tak peduli angka**: ia bekerja untuk kedua kemungkinan.

### K155 — Paket adalah **satu tabel data di kode**, bukan enum baru; `Plan` yang ada tetap dipakai

Enum `Plan` (`TRIAL`/`STARTER`/`PRO`/`FULL_SUITE`) sudah tertulis di `Tenant.plan` dan `Payment.plan`. Mengganti nilainya berarti migration pada kolom lama — dilarang K145 (aditif) dan berisiko tanpa imbalan.

**Putusan:** enum tetap; yang berubah adalah **isi** `BILLING_PLANS`, yang memang sudah berupa objek biasa di `plans.ts`. Bentuk `BillingPlan` diperluas dengan satu field:

```ts
export interface BillingPlan {
  id: string; plan: Plan; priceIDR: number; choiceCount: number
  labelId: string; labelEn: string
  kuota: Kuota            // BARU — K156. Semua nilainya boleh null.
}

export type Kuota = {
  penggunaAktif: number | null      // null = tak dibatasi
  voyagePerBulan: number | null
  penyimpananMB: number | null
  panggilanAiPerBulan: number | null
}
```

Kalau P48 dijawab dengan skema Basic/Professional/Enterprise, yang berubah **hanya isi objek ini** — bukan skema, bukan alur pembayaran, bukan mesin kuota. Itulah gunanya memisahkan mesin dari kebijakan (pola yang sama sudah dipakai `approval-policy.ts`, `anomaly-rules.ts`, `sla-policy.ts`).

### K156 — Kuota **memperingatkan sebelum menahan**, dihitung saat diminta, dan menahan **hanya pembuatan baru**

```ts
// services/saas/quota.ts — MURNI (K11/K51)
export type KeadaanKuota = 'AMAN' | 'MENDEKATI' | 'HABIS' | 'TIDAK_DIBATASI'
nilaiKuota({ terpakai, batas }) → { keadaan, sisa, persen }
```

| Keadaan | Definisi | Yang terjadi |
|---|---|---|
| `TIDAK_DIBATASI` | `batas = null` | Tidak ada yang dihitung, tidak ada yang ditampilkan. **Ini bawaan hari ini** (K146) |
| `AMAN` | `< 80%` | — |
| `MENDEKATI` | `≥ 80%` (`AMBANG_PERINGATAN_KUOTA`) | Spanduk di layar + satu `Notification` ke ADMIN, idempoten per bulan lewat `dedupeKey` (K101) |
| `HABIS` | `≥ 100%` | Pembuatan **baris baru** dari jenis itu ditolak dengan pesan yang menyebut angkanya dan menawarkan naik paket |

Tiga aturan yang menentukan apakah fitur ini membantu atau membuat orang marah:

1. **Kuota tidak pernah menyembunyikan atau menghapus data yang sudah ada.** Voyage ke-26 pada paket berbatas 25 ditolak **pembuatannya**; 25 yang sudah ada tetap terbuka, terbaca, tercetak, tertagih. Sama persis dengan perilaku `tenantAccess().locked` yang sudah berlaku: langganan habis → read-only, bukan gelap.
2. **Dihitung saat diminta, tidak disimpan.** Sejalan K100 (keadaan SLA) dan K113 (skor vendor): satu `count()` ber-index lebih murah daripada kolom yang selalu basi. `voyagePerBulan` dihitung dengan `monthWindow()` yang sudah ada (K32).
3. **Satu pemeriksa, satu titik panggil.** `pastikanKuota(ctx, 'VOYAGE')` dipanggil bersebelahan dengan `pastikanLanggananAktif(ctx)` yang sudah ada (K33) — pola & tempatnya identik, sehingga pelaksana tidak perlu belajar mekanisme kedua. Menyebarkannya ke banyak tempat adalah cara termurah membuat sebagian jalur lupa dipagari, dan **kebocoran monetisasi** persis seperti yang sudah dicatat di komentar `services/subscription.ts`.

### K157 — Trial & masa berakhir: yang sudah berlaku dipertahankan; yang ditambah hanya **peringatan**

Perilaku hari ini sudah benar dan tidak diubah: `TRIAL` 7 hari dinilai dari `trialEndsAt`; paket berbayar dinilai dari `subscriptionEndsAt`; habis → `locked` → dokumen baru ditolak, data lama tetap terbaca (`lib/billing/access.ts`).

Yang ditambah: **pemberitahuan sebelum habis**, memakai job ber-token yang sudah ada (K88) dan `Notification` yang sudah ada (K86) — H-7, H-3, H-1, dan hari-H, idempoten lewat `dedupeKey` (`SUBSCRIPTION_EXPIRING:<tenantId>:<YYYY-MM-DD>`). Nol tabel baru; ini contoh kedua (sesudah K115) bahwa mekanisme Fase 7 memang sepadan dibangun sekali.

Yang **tidak** dibangun, dan alasannya: masa tenggang otomatis, penurunan paket otomatis, dan penghapusan data setelah sekian lama. Ketiganya kebijakan komersial yang belum ada jawabannya (**P51**), dan yang ketiga tak boleh ditebak sama sekali — kode yang menghapus data pelanggan berdasarkan tebakan adalah kode yang tak boleh ditulis. Sampai P51 dijawab, data tenant yang berhenti berlangganan **tetap ada selamanya**, dan itu keadaan yang aman.

### K158 — **Dua gerbang pembayaran** (Midtrans + Duitku), dengan alasan operasional, bukan alasan arsitektur

> **Keputusan Marlon, 17 Ags 2026** — belum tercatat di dokumen mana pun sebelum ini.

| Pertimbangan | Satu gerbang (keadaan sekarang) | **Dua gerbang (dipilih)** |
|---|---|---|
| Pembayaran gagal karena penerbit kartu | Buntu. Pelanggan yang mau membayar tidak bisa membayar, dan tak ada yang tahu kenapa | Ada jalan kedua. Ini alasan utamanya, dan ia **berdasar pengalaman**: pada produk Marlon yang lain (**Salindia**, `salindia.app`), kartu Indonesia yang ditolak satu gerbang terbukti lolos di gerbang lain |
| Gangguan gerbang | Seluruh penerimaan berhenti selama gangguan | Beralih dalam hitungan menit (K163) |
| Cakupan metode bayar | Terbatas pada katalog satu gerbang | Gabungan dua katalog (VA bank berbeda, e-wallet, ritel) |
| Biaya | Satu kontrak, satu rekonsiliasi | Dua kontrak, dua rekonsiliasi, dua set kredensial. **Ini harga nyata** dan diterima sadar |
| Risiko kode | Satu jalur, satu skema tanda tangan | **Dua skema tanda tangan yang berbeda** — dan di sinilah seluruh bahayanya. Lihat K160 |

Acuan pola (bukan kode yang disalin — stack-nya berbeda: Salindia FastAPI/Python, Maritime Suite Next.js/TypeScript): `backend/app/duitku.py` + `backend/app/midtrans.py` di repo Salindia. Yang **diambil** dari sana adalah tiga hal yang sudah terbukti di produksi:
1. Kedua modul gerbang dibuat **kembar bentuknya** — satu fungsi membuat transaksi, satu fungsi memverifikasi notifikasi, keduanya melempar galat yang diterjemahkan pemanggil jadi 502.
2. **Satu sumber kebenaran harga** untuk kedua gerbang. Di Salindia, `midtrans.py` mengimpor `PLAN_HARGA` dari `duitku.py` dengan komentar *"supaya kedua gerbang tak pernah beda harga"*. Di sini: keduanya membaca `lib/billing/plans.ts` yang sudah ada. Tidak ada tabel harga kedua, dalam bentuk apa pun.
3. **Aktivasi hanya dari callback server-ke-server**, tidak pernah dari `returnUrl`/`finish` di browser — karena yang kedua bisa dipalsukan pemilik browser.

### K159 — `Payment` diperluas tiga kolom; dan `orderId` **wajib membawa nama gerbangnya**

```prisma
// Payment (tabel yang sudah ada, Fase 0) — tambahan aditif Fase 8 / K159
/// 'MIDTRANS' | 'DUITKU'. NULL = baris lama (semuanya Midtrans) — sengaja
/// TIDAK di-backfill: baris lama tak punya arti komersial, dan menulis ulang
/// riwayat pembayaran demi kerapian adalah risiko tanpa imbalan (M6).
gateway    String?
/// Nomor rujukan milik gerbang (Duitku `reference`, Midtrans `transaction_id`).
/// Dipakai saat rekonsiliasi manual dengan dasbor gerbang.
gatewayRef String?
/// Metode yang akhirnya dipakai pembeli (VA BCA, QRIS, kartu…), apa adanya dari
/// payload. Untuk menjawab "orang membayar pakai apa" tanpa membedah kolom `raw`.
payMethod  String?
```

Dan satu perubahan bentuk yang **kecil tapi menahan seluruh kelas bug**:

```
Sekarang :  SUB-<planId>-<epoch>-<acak>
Fase 8   :  SUB-<MT|DK>-<planId>-<epoch>-<acak>
                  ^^^^^ awalan gerbang, WAJIB
```

**Kenapa awalan gerbang, dan kenapa ini bukan kosmetik.** Handler yang ada mencari pesanan dengan `prisma.payment.findUnique({ where: { orderId } })` — **hanya** dengan `orderId`. Dengan dua gerbang yang berbagi satu ruang nama `orderId`, sebuah callback bertanda tangan sah dari gerbang A bisa menunjuk baris `Payment` yang lahir di gerbang B, dan handler tidak punya cara menolaknya. Skenarionya bukan hipotetis: `merchantOrderId` Duitku sepenuhnya ditentukan **kita**, jadi siapa pun yang memegang akun merchant Duitku (termasuk merchant lain yang bereksperimen, atau kita sendiri saat menguji sandbox) bisa membuat transaksi dengan `merchantOrderId` yang menyerupai pesanan Midtrans kita.

Tiga pagar, dan ketiganya wajib — satu saja tidak cukup:
1. **Awalan** `SUB-MT-` / `SUB-DK-` membuat tabrakan terlihat sebelum menyentuh database.
2. Setiap handler mencari dengan **`orderId` DAN `gateway`** (`findFirst({ where: { orderId, gateway: 'DUITKU' } })`), bukan `orderId` saja. Kalau tak ketemu → 404, **bukan** diproses.
3. `@@unique([gateway, orderId])` ditambahkan berdampingan dengan `@@unique([orderId])` yang sudah ada. Yang kedua tetap dipertahankan: ia yang menjamin awalan benar-benar bekerja, bukan sekadar konvensi penamaan.

### K160 — Dua endpoint callback yang **terpisah**, dua verifikator yang terpisah; tidak pernah satu handler yang menebak

Ini keputusan yang paling mudah salah di seluruh §5, karena bentuk "satu endpoint `/api/billing/notification` yang mengenali gerbangnya dari isi payload" terlihat lebih rapi dan menghemat satu berkas.

**Ditolak, dengan alasan yang bisa diperiksa.** Kedua gerbang berbeda di **empat** hal sekaligus:

| | **Midtrans** (sudah ada) | **Duitku** (baru) |
|---|---|---|
| Bentuk badan permintaan | JSON | **`application/x-www-form-urlencoded`** (Salindia membacanya lewat `request.form()`) |
| Algoritma tanda tangan | `SHA512(order_id + status_code + gross_amount + serverKey)` | `MD5(merchantCode + amount + merchantOrderId + apiKey)` |
| Nama field | `order_id`, `gross_amount`, `signature_key`, `transaction_status`, `fraud_status` | `merchantOrderId`, `amount`, `signature`, `resultCode`, `merchantCode` |
| Penanda lunas | `settlement`, atau `capture` **dan** `fraud_status = 'accept'` | `resultCode == '00'` |

Handler tunggal harus **menebak** gerbang dari bentuk badan permintaan sebelum memverifikasi apa pun — yaitu mengambil keputusan keamanan berdasarkan data yang belum diautentikasi. Payload yang dirancang agar ambigu akan diarahkan ke verifikator yang lebih lemah. Kelas bug ini punya nama di literatur (*algorithm confusion*), sudah pernah meruntuhkan pustaka JWT, dan tidak ada alasan mengundangnya ke sini demi menghemat satu berkas.

**Putusan:**

```
POST /api/billing/notification            → Midtrans. TIDAK BERUBAH sedikit pun.
                                            (URL ini sudah terdaftar di dasbor Midtrans.)
POST /api/billing/duitku/callback         → Duitku. Baru, terpisah, form-encoded.
```

Empat aturan yang mengikat keduanya:
1. **Algoritma tidak pernah dipilih dari isi permintaan.** Ia ditentukan oleh **path**-nya. Endpoint Midtrans hanya tahu SHA512; endpoint Duitku hanya tahu MD5. Tidak ada cabang.
2. **Perbandingan konstan-waktu**, keduanya. `verifyNotificationSignature` yang ada sudah memakai `crypto.timingSafeEqual` dengan pemeriksaan panjang; kembarannya untuk Duitku menyalin pola itu persis. (Salindia memakai `hmac.compare_digest` untuk alasan yang sama.)
3. **Tanda tangan salah → 403 dan berhenti.** Tidak ada pencatatan sebagian, tidak ada "coba verifikator satunya".
4. Endpoint Duitku memeriksa **`merchantCode` cocok** dengan milik kita sebelum apa pun (pagar pertama di `callback_sah()` Salindia — bukan hiasan: tanpa itu, tanda tangan yang sah dari merchant Duitku **lain** tetap diproses sebagai milik kita).

### K161 — ⚠️ Tanda tangan Duitku **tidak memuat status**, dan itu mengubah aturan idempotensi

Bagian ini ada karena satu detail yang mudah lewat saat menyalin pola: 

```
Midtrans : SHA512( order_id + status_code + gross_amount + serverKey )
                                ^^^^^^^^^^^ status ikut ditandatangani
Duitku   : MD5   ( merchantCode + amount + merchantOrderId + apiKey )
                   (tidak ada status, tidak ada stempel waktu, tidak ada nonce)
```

Akibatnya nyata dan harus dihadapi, bukan diasumsikan aman:

1. **`resultCode` tidak terlindungi tanda tangan.** Ia tiba di badan permintaan yang sama, tapi tanda tangannya tetap sah untuk `resultCode` apa pun. Karena itu `resultCode` hanya boleh dipakai sebagai **saklar dua nilai** (`'00'` = lanjutkan, selain itu = balas 200 dan berhenti) — tak pernah sebagai sumber nilai yang disimpan.
2. **Callback Duitku bisa diputar ulang.** Tanda tangan yang sama sah selamanya untuk pasangan (amount, orderId) yang sama. Siapa pun yang pernah melihat satu callback sah bisa mengirimkannya lagi kapan saja.
3. Karena itu **idempotensi bukan optimasi di sini, melainkan pagar keamanan.** Kalau setiap callback lunas menambah 30 hari (`SUBSCRIPTION_DAYS`), pemutaran ulang = langganan gratis tanpa batas. Handler yang ada sudah benar (`if (payment.status === 'PAID') return 200`), dan jalur Duitku **wajib** memakai pemeriksaan yang sama sebagai perintah pertama sesudah verifikasi. Salindia menutupnya dengan `if db.tandai_lunas(order_id):` yang hanya bernilai benar sekali — pola yang sama, dinyatakan sebagai aturan di sini supaya tidak hilang saat diterjemahkan ke TypeScript.
4. **Nominal wajib dicocokkan dengan baris `Payment` kita**, di kedua gerbang. Ini menutup celah yang **masih ada di kode Midtrans hari ini**: `api/billing/notification/route.ts` tidak pernah membandingkan `gross_amount` dengan `payment.amount`. Untuk Midtrans, nominal ikut ditandatangani sehingga celahnya sempit; untuk Duitku, `amount` **adalah** bahan tanda tangan sehingga nominal yang berbeda menghasilkan tanda tangan berbeda — tetapi ketergantungan pada properti itu adalah alasan yang halus, dan pemeriksaan yang eksplisit berbiaya satu baris. Salindia melakukannya di kedua gerbang. Fase 8 mengikutinya, dan **memperbaiki jalur Midtrans yang ada sekalian** — satu-satunya perubahan pada kode billing lama yang diminta dokumen ini.

Ringkas — perintah wajib di kedua handler, dalam urutan ini:

```
1. verifikasi tanda tangan (algoritma dari PATH, bukan dari body)   → gagal: 403, berhenti
2. Duitku: merchantCode cocok?                                       → gagal: 403, berhenti
3. cari Payment WHERE orderId AND gateway                            → tak ada: 200 {ignored}
4. sudah PAID?                                                       → ya: 200, berhenti (K161/3)
5. nominal cocok dengan Payment.amount?                              → tidak: 400, berhenti (K161/4)
6. status gerbang → status internal
7. bila PAID: satu transaksi { Payment.status, Tenant.subscriptionEndsAt } (K163)
8. selalu balas 200 pada keadaan yang sudah ditangani — supaya gerbang berhenti mengulang
```

Butir 3 sengaja membalas **200** dan bukan 404 untuk pesanan yang tak dikenal: tombol "test notification" di dasbor gerbang mengirim order fiktif, dan membalas galat membuat gerbang mengulang selamanya. Perilaku ini sudah benar di kode Midtrans yang ada (`{ ok: true, ignored: true }`) dan disalin ke Duitku.

### K162 — Pemilihan gerbang di checkout: **ditawarkan, diingat, dan selalu bisa ditukar**

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Sistem memilih otomatis (mis. bergiliran / termurah) | **Ditolak.** Pembeli yang gagal bayar tidak bisa "coba yang satunya" karena ia tak tahu ada yang satunya. Justru kemampuan mencoba jalan kedua adalah **seluruh alasan** K158 |
| Selalu tanya, tanpa bawaan | **Ditolak.** Satu pilihan tambahan di layar bayar menurunkan penyelesaian pembayaran, untuk keputusan yang tak dimengerti pembeli |
| **Bawaan + tombol "Coba gerbang lain"** | **Dipilih.** Bawaan dari `GERBANG_BAWAAN` (**P50**); pilihan terakhir yang **berhasil** disimpan di `Tenant.preferredGateway String?` dan jadi bawaan berikutnya. Kalau checkout gagal atau pembeli kembali tanpa membayar, layar menawarkan gerbang satunya secara terang, dengan kalimat sederhana: *"Pembayaran tidak berhasil? Coba lewat <gerbang lain>."* |

Aturan pendamping yang tak boleh dilanggar: **satu pesanan = satu gerbang**. Menukar gerbang **selalu** membuat baris `Payment` baru dengan `orderId` baru; baris lama dibiarkan `PENDING` sampai kedaluwarsa sendiri. Mencoba "memindahkan" pesanan antar-gerbang adalah cara termurah membuat dua callback sah untuk satu langganan.

### K163 — Perpanjangan, dan apa yang terjadi saat gerbang pilihan sedang mati

Perpanjangan memakai aritmetika yang **sudah** ada dan sudah benar di `api/billing/notification`: `base = max(sekarang, subscriptionEndsAt)` lalu `+ SUBSCRIPTION_DAYS`. Membayar lebih awal tidak pernah menghanguskan sisa hari. Aturan ini dipindahkan apa adanya ke satu fungsi murni `hitungAkhirLangganan(sekarang, akhirSekarang, hari)` supaya kedua handler memakai aritmetika yang **sama persis**, bukan dua salinan yang perlahan berbeda.

Saat sebuah gerbang bermasalah:

| Keadaan | Yang terjadi |
|---|---|
| `createTransaction`/`createInvoice` gagal (jaringan, 5xx, ditolak gerbang) | `Payment` ditandai `FAILED` (perilaku yang sudah ada), layar menampilkan galat **dan** tombol gerbang satunya — tanpa mengulang isian |
| Kredensial satu gerbang kosong di env | Gerbang itu **tidak muncul** di layar. `midtransConfigured()` yang ada sudah jadi cetakannya; `duitkuConfigured()` kembarannya. Aplikasi tak pernah menampilkan tombol yang pasti gagal |
| Kedua gerbang mati | Layar bayar menampilkan instruksi transfer manual + kontak. Pengaktifan manual tetap lewat jalur ADMIN yang ada di database — **tidak** ada endpoint "aktifkan paket saya" yang bisa dipanggil pengguna. (Salindia menutup ini dengan saklar `ALLOW_SELF_UPGRADE` yang bawaannya **mati**, disertai komentar bahwa menyembunyikan tombolnya di layar tidak menutup apa pun. Pelajaran yang sama berlaku di sini) |
| Callback terlambat / hilang | Tombol **"Periksa status pembayaran"** di halaman Billing → memanggil API status gerbang untuk `orderId` itu → memperbarui `Payment` lewat jalur yang **sama** dengan callback (fungsi yang sama, bukan salinan). Ini yang membuat pembayaran tidak pernah tergantung selamanya karena satu webhook meleset |

### K164 — Kuitansi langganan adalah **dokumen sendiri**, bukan `Invoice`

Pelanggan berbayar akan meminta bukti untuk pembukuannya. Tiga pilihan:

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Pakai model `Invoice` yang ada | **Ditolak, tegas.** `Invoice` adalah tagihan keagenan kepada `Customer`-nya (§1.3). Menaruh tagihan langganan di sana berarti langganan Maritime Suite muncul di laporan piutang tenant, ikut terhitung di dasbor keuangannya, dan mengotori setiap laporan Fase 5. Ini kesalahan yang tak bisa diurai lagi sesudah ada data |
| Tidak ada dokumen; cukup riwayat `Payment` | **Ditolak.** Perusahaan Indonesia butuh dokumen bernomor untuk membebankan biaya |
| **`SubscriptionInvoice` + `SubscriptionInvoiceItem`** | **Dipilih.** Tabel sendiri, penomoran sendiri (`INV-SUB/2026/08/0001` lewat `formatDocNumber` yang sudah ada, K32), PDF lewat mesin PDF yang sudah ada. Terbit **otomatis** saat `Payment` jadi `PAID`, dari satu tempat — di dalam transaksi yang sama dengan perpanjangan langganan |

Kop dokumen ini memakai identitas **penjual** (Maritime Suite / badan usaha Marlon), **bukan** `Tenant.logoUrl` — satu-satunya dokumen di seluruh aplikasi yang begitu. Ini juga titik di mana white-label (§9) **tidak berlaku**, dan itu disengaja: sebuah tenant tidak boleh menerbitkan kuitansi langganan ber-merek dirinya sendiri untuk uang yang ia bayarkan ke pihak lain.

PPN atas langganan dan apakah kuitansi ini harus jadi Faktur Pajak / e-Faktur → **P64**. Interim: dokumen tanpa komponen pajak, dengan catatan kaki bahwa perlakuan pajak menyusul. Menebak status PPN adalah menebak kewajiban hukum orang lain.

### K165 — Add-on lisensi: **baris di pesanan yang sama**, bukan mesin langganan kedua

Blueprint §11.3 menyebut tambahan yang dijual terpisah: penyiapan & pemindahan data, pelatihan, penyesuaian templat dokumen, dan **data AIS**. Tiga yang pertama adalah jasa manusia — tak butuh kode sama sekali selain baris di kuitansi. Yang keempat menyalakan fitur (§8).

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Model `Subscription` + `SubscriptionItem` penuh (berulang, prorata, siklus penagihan) | **Ditolak.** Itu produk tersendiri. Prorata & siklus penagihan hanya berarti kalau ada penagihan otomatis berulang — dan itu bukan sasaran Fase 8 (§1.5) |
| **Add-on = `Tenant.addonsEnabled String[]`, dibeli sebagai baris pada pesanan yang sama** | **Dipilih.** Bentuknya persis `modulesEnabled` yang sudah ada dan sudah bekerja — nol mekanisme baru, nol tabel baru. Aktif untuk periode langganan yang sama, habis bersamaan |

Kalau suatu hari add-on perlu masa berlaku sendiri, itu keputusan baru dengan bukti nyata di tangan. Membangunnya sekarang berarti membangun untuk kebutuhan yang belum pernah diucapkan siapa pun.

### Siapa boleh apa (langganan & penagihan)

| Tindakan | ADMIN | OPERATOR | MANAJER_OPERASI | PENYUSUN_BIAYA | FINANCE | VIEWER | DIREKTUR |
|---|---|---|---|---|---|---|---|
| Melihat paket & sisa masa aktif | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Melihat pemakaian kuota | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Membuka halaman Billing & riwayat pembayaran | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Melakukan checkout / memilih gerbang | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mengunduh kuitansi langganan (PDF) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Membeli add-on | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

`FINANCE` boleh **melihat & mengunduh** tapi tidak boleh **membeli**: mencatat biaya adalah pekerjaannya, mengikat perusahaan pada pengeluaran baru bukan. `DIREKTUR` mengikuti pola Fase 5e ("lihat-saja semua"). Kalau ternyata terlalu kaku → **P52** (murah diubah: satu baris `requireRole`).

### Konsekuensi kalau Langganan & Billing tidak dibangun sekarang

Produk tetap bisa dipakai — tapi **tidak bisa dijual**, dan itu seluruh milestone Fase 8. Lebih rinci: tanpa kuota, paket berbatas tidak bisa ditawarkan sama sekali (yang tersisa hanya batas "jumlah modul" yang tak berhubungan dengan nilai yang diterima pelanggan); tanpa gerbang kedua, setiap pembeli yang kartunya ditolak hilang tanpa jejak dan tanpa keluhan — kerugian yang **tak pernah terlihat di laporan mana pun**; tanpa kuitansi, calon pelanggan berbentuk PT harus meminta bukti lewat WhatsApp setiap bulan; dan tanpa peringatan masa berakhir, langganan mati diam-diam lalu tenant menemukan aplikasinya read-only pada hari kapal sandar.

---

## 6. Customer Portal

> Prasyarat mutlak: **§3 sudah dibangun dan `test:portal` lulus** (increment 8a). Tidak ada satu pun layar di bagian ini yang boleh dibuat sebelum itu.

Blueprint §7.2 mencantumkan *Principal* sebagai pengguna keenam, dengan catatan: *"Sampai Fase 8, principal berhubungan melalui dokumen dan surel. Portal khusus untuk principal dan vendor sengaja ditunda karena membuka akses pihak luar menuntut lapisan keamanan tersendiri yang tidak layak dikerjakan sebelum inti sistem matang."* Lapisan itu adalah §3. Bagian ini yang memakainya.

### K166 — Tiga tabel identitas: `PortalUser` (orang), `PortalAccess` (hak atas satu pihak), `PortalInvitation` (undangan)

```prisma
/// Orang di luar tenant yang boleh masuk portal. SENGAJA BUKAN `User` (K143):
/// tabel, provider NextAuth, cookie, dan namespace API-nya semuanya terpisah.
model PortalUser {
  id       String @id @default(cuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  email    String
  password String     // bcrypt, pola yang sama dengan User
  name     String
  phone    String?

  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  passwordSetAt DateTime?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  accesses PortalAccess[]

  /// Unik PER TENANT, bukan global — beda dari User.email yang unik global.
  /// Alasannya di bawah (P63).
  @@unique([tenantId, email])
  @@index([tenantId, isActive])
}

/// Hak seorang PortalUser atas SATU pihak (satu Customer atau satu Vendor).
/// Dipisah dari PortalUser supaya satu orang bisa mewakili dua pihak pada tenant
/// yang sama (mis. perusahaan yang jadi pelanggan sekaligus vendor) tanpa dua akun.
model PortalAccess {
  id           String @id @default(cuid())
  tenantId     String
  tenant       Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  portalUserId String
  portalUser   PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)

  pihak      String   // 'CUSTOMER' | 'VENDOR' — konstanta di modul murni, bukan enum DB (alasan K55)
  customerId String?
  customer   Customer? @relation(fields: [customerId], references: [id])
  vendorId   String?
  vendor     Vendor?   @relation(fields: [vendorId], references: [id])

  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@unique([portalUserId, pihak, customerId, vendorId])
  @@index([tenantId, customerId])
  @@index([tenantId, vendorId])
}

/// Undangan berbatas waktu. Token disimpan sebagai HASH, bukan apa adanya —
/// bocornya isi tabel tidak boleh berarti bocornya akses (pelajaran yang sama
/// dengan menyimpan bcrypt, bukan kata sandi).
model PortalInvitation {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email      String
  pihak      String
  customerId String?
  vendorId   String?
  tokenHash  String   @unique   // sha256(token); token asli hanya pernah ada di tautan undangan
  expiresAt  DateTime
  acceptedAt DateTime?
  invitedByUserId String
  createdAt  DateTime @default(now())

  @@index([tenantId, email])
}
```

Dua keputusan bentuk yang perlu dibaca sebagai keputusan:

**Kenapa `@@unique([tenantId, email])` dan bukan unik global.** `User.email` unik global (satu orang = satu tenant). Untuk pihak luar itu salah: PT Samudra bisa jadi pelanggan tiga keagenan berbeda, dan orang yang sama (`ops@samudra.co.id`) mewakili mereka di ketiganya. Unik global memaksa orang itu memakai tiga alamat surel palsu. Harganya: satu akun per tenant, jadi ia login tiga kali di tiga subdomain — kurang nyaman, tapi **jauh** lebih aman, karena tak pernah ada satu sesi yang berdaulat lintas-tenant. Apakah akun portal lintas-tenant diinginkan → **P63**; interim: **tidak**, dan interim ini yang paling murah dipertahankan.

**Kenapa `PortalAccess` terpisah dari `PortalUser`.** Menaruh `customerId` langsung di `PortalUser` memaksa akun kedua untuk orang yang sama saat ia juga vendor, dan mengubah "cabut akses" dari satu baris jadi penghapusan akun. Dengan tabel terpisah, pencabutan adalah pengisian `revokedAt` — dan `PortalContext` dibangun dari **satu** `PortalAccess` aktif per sesi (kalau seseorang punya dua, ia memilih di layar setelah login, dan `pihakId` di sesi berubah — bukan bertambah).

### K167 — Portal tidak membaca model internal; ia membaca **proyeksi berdaftar-putih**

Pagar K148 menyaring **baris**. Ia tidak menyaring **kolom** — dan kolom adalah tempat kebocoran yang lebih halus: `Disbursement` memuat margin, `Voyage.notes` memuat catatan internal, `Invoice` bertaut ke FDA yang memuat harga beli vendor.

**Putusan:** setiap layar portal dilayani fungsi proyeksi di `services/portal/`, yang mengembalikan **tipe baru** — bukan model Prisma. `Response.json(baris)` atas model Prisma **dilarang** di seluruh `/api/portal/**`, dan pelanggaran itu diuji secara struktural bersama K149.

```ts
// services/portal/customer-view.ts
export type InvoicePortal = {
  id: string; nomor: string; tanggal: string; jatuhTempo: string | null
  mataUang: string; total: number; sudahDibayar: number; sisa: number
  status: InvoiceStatus
  kapal: string | null; voyage: string | null      // nama & nomor saja
  baris: { uraian: string; jumlah: number }[]      // TANPA vendor, TANPA harga beli
}
```

Yang dilihat pelanggan, lengkap — daftar putih, bukan daftar hitam:

| Layar | Isinya | Yang **tidak pernah** ikut |
|---|---|---|
| Beranda | ringkasan: berapa tagihan terbuka, total outstanding, kunjungan berjalan | — |
| Tagihan saya | daftar `Invoice` ber-`customerId` = pihaknya; unduh PDF | tagihan pelanggan lain; `Disbursement`; harga beli; margin |
| Detail tagihan | baris tagihan, pembayaran yang sudah tercatat, sisa | `DisbursementItem`, `vendorId`, `vendorInvoiceNo` |
| Kunjungan kapal | `Voyage` ber-`customerId` = pihaknya: nomor, kapal, pelabuhan, status, ETA/ETB/ETD/ATA | `notes`, biaya internal, tugas, komentar internal |
| Dokumen | **hanya** dokumen yang **sengaja dibagikan** (K170) | seluruh Attachment Center |

Empat hal yang **tidak** ada di portal pelanggan, dan alasan tiap satunya:

- **FDA/EPDA mentah.** Ia memuat vendor dan harga beli. Kalau pelanggan memang harus melihat rinciannya, yang dibagikan adalah **PDF FDA yang sudah disetujui** lewat K170 — dokumen yang sudah dikurasi manusia, bukan query. Apakah pelanggan boleh melihat FDA → **P52**.
- **Nama & tarif vendor.** Itu rantai pasok tenant; membocorkannya ke pelanggan berarti pelanggan bisa menghubungi vendor langsung. Merusak nilai usaha pelanggan kita sendiri.
- **Tugas, komentar, timeline internal (Fase 7).** Seluruhnya percakapan internal. Kalimat *"vendor ini selalu telat"* tidak pernah ditulis dengan asumsi akan dibaca pihak luar.
- **Pelanggan lain, dalam bentuk apa pun** — termasuk penomoran yang bisa ditebak. `Invoice.invoiceNumber` berurutan per tenant, jadi pelanggan bisa menyimpulkan volume tenant dari nomornya. Diterima sadar (menyembunyikannya berarti mengubah penomoran yang sudah dipakai di dokumen resmi, K32) — tapi **tidak** boleh diperparah dengan menampilkan total agregat tenant di mana pun di portal.

### K168 — Akses portal lahir dari **undangan**, tidak pernah dari pendaftaran mandiri

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Pelanggan mendaftar sendiri lalu memilih perusahaan | **Ditolak.** Siapa pun bisa mengaku pelanggan siapa pun. Verifikasi kepemilikan surel tidak membuktikan hubungan dagang |
| Tenant membuatkan akun + kata sandi, dikirim manual | **Ditolak.** Kata sandi yang diketahui pembuatnya bukan kata sandi |
| **Undangan bertoken dari dalam aplikasi** | **Dipilih.** ADMIN/FINANCE membuka `Customer`, menekan "Undang ke portal", memasukkan surel → `PortalInvitation` + tautan berisi token. Penerima memasang kata sandinya sendiri; `PortalUser` + `PortalAccess` baru lahir **saat undangan diterima** |

Aturan yang menyertainya:
- Token: acak 32 byte, disimpan sebagai `sha256`, **berlaku 7 hari**, sekali pakai (`acceptedAt` mengunci).
- ⚠️ **Ketergantungan yang jujur:** pengiriman undangan butuh surel — **P10 masih terbuka sejak Fase 3**, dan Fase 7 pun tidak menjawabnya (K134/K136). Sampai P10 dijawab, alur yang berlaku: aplikasi **menampilkan tautan undangan** untuk disalin dan dikirim tenant lewat kanalnya sendiri (WhatsApp/surel pribadi). Ini persis pola `EmailLog` Fase 7 (K136: sistem tak pernah mengklaim mengirim apa yang tidak dikirimnya) dan **cukup** untuk menyatakan increment-nya selesai. Yang belum selesai operasionalnya, bukan kodenya.
- Mencabut akses = mengisi `PortalAccess.revokedAt`. Sesi yang sedang berjalan mati pada permintaan berikutnya, karena `withPortal` memeriksa `PortalAccess` **setiap** permintaan — tidak pernah percaya pada isi token JWT saja. Ini beda sengaja dari sesi internal (yang membaca peran dari JWT): pihak luar harus bisa diputus **seketika**, dan biaya satu query per permintaan portal jauh lebih murah daripada jendela beberapa jam di mana mantan pelanggan masih bisa membaca.

### K169 — Yang boleh **ditulis** pelanggan: satu hal, dan itu pun tidak mengubah apa-apa

Portal Fase 8 adalah **jendela**, bukan meja kerja (§1.5).

| Tindakan | Ada? | Alasan |
|---|---|---|
| Melihat & mengunduh | ✅ | seluruh nilai portal |
| Mengubah kata sandi & nama sendiri | ✅ | menyentuh barisnya sendiri saja |
| **Mengonfirmasi pembayaran** ("sudah saya transfer", + nomor rujukan + lampiran bukti) | ✅ | Satu-satunya tulisan yang bermakna. Ia **tidak** membuat `InvoicePayment`, **tidak** mengubah `Invoice.status`, **tidak** mengurangi outstanding. Ia membuat satu `Notification` ke FINANCE + satu lampiran (`Attachment` ber-`entityType='INVOICE'`) + satu `Comment` bertanda *dari portal*. Manusia yang mencatat penerimaannya, seperti sekarang |
| Memesan jasa / membuat permintaan keagenan | ❌ | Butuh alur persetujuan, harga, dan kontrak. Itu produk tersendiri |
| Menyanggah tagihan sebagai keadaan formal | ❌ | Sanggahan yang punya status butuh alur penyelesaian. Cukup lewat catatan, dan diselesaikan manusia |

Prinsip yang mengikat, sebentuk dengan K122 (PO tak pernah menulis baris FDA sendiri) dan K52 (AI tak pernah menulis): **tak satu pun tindakan pihak luar boleh mengubah angka uang, status dokumen, atau data induk.** Kalau suatu hari itu dibuka, ia keputusan tersendiri dengan desainnya sendiri — bukan perluasan diam-diam dari layar yang sudah ada.

### K170 — Dokumen di portal: **dibagikan sengaja**, tidak pernah "semua lampiran"

Attachment Center (K106) menyimpan kuitansi vendor, lembar tarif, paspor awak, foto kerusakan. Membukanya ke portal — bahkan tersaring per voyage — akan membocorkan hampir semua yang K167 baru saja tutup.

**Putusan:** satu penanda pada tabel yang sudah ada, nol tabel baru:

```prisma
// Attachment (Fase 7 / K106) — tambahan aditif Fase 8
/// Fase 8 / K170 — true HANYA bila seseorang menekan "Bagikan ke portal".
/// Bawaan false. Lampiran ber-`sensitive = true` (K125/K126) TIDAK PERNAH boleh
/// disetel true — ditegakkan service, dan diuji.
sharedToPortal Boolean @default(false)
sharedAt       DateTime?
sharedByUserId String?
```

Empat aturan:
1. Bawaan **mati**. Sama semangat dengan K111 (berkas ringkasan AI: bawaan tidak disimpan) — perubahan yang membuat data terlihat pihak lain tidak pernah jadi bawaan.
2. `sensitive = true` → membagikan **ditolak** dengan galat yang menyebut alasannya. Ini pagar mesin, bukan disiplin.
3. Pengunduhan lewat portal memakai route portal sendiri (`/api/portal/attachments/[id]/content`) yang memeriksa: `sharedToPortal` **dan** pemilik entitas induknya = pihak pemanggil. Route internal `GET /api/attachments/[id]/content` (K108) **tidak pernah** menerima sesi portal.
4. Setiap unduhan portal menulis `AuditLog` ber-`action = 'EXPORT'` — yang membuat pertanyaan *"pelanggan sudah menerima FDA itu belum?"* punya jawaban yang bisa ditunjukkan.

PDF yang dihasilkan sistem (Invoice) tidak butuh penanda ini: ia dibuat ulang saat diminta dari data yang memang sudah tersaring K167.

### Siapa boleh apa (Customer Portal)

**Sisi internal — siapa yang mengelola akses portal:**

| Tindakan | ADMIN | OPERATOR | MANAJER_OPERASI | PENYUSUN_BIAYA | FINANCE | VIEWER | DIREKTUR |
|---|---|---|---|---|---|---|---|
| Mengundang pengguna portal pelanggan | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Mencabut akses portal | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Membagikan lampiran ke portal (`sharedToPortal`) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Membagikan lampiran **sensitif** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Melihat siapa saja yang punya akses portal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

`FINANCE` boleh mengundang karena pelanggan portal pada dasarnya urusan penagihan. `MANAJER_OPERASI` boleh **mencabut** tapi tidak mengundang: menghentikan akses adalah tindakan pengamanan yang tak boleh menunggu, memberi akses adalah keputusan komersial. Membagikan lampiran sensitif **tidak dimiliki siapa pun**, termasuk ADMIN — bila memang perlu, tandanya dicabut dulu secara sadar di layar lampiran, dan itu dua tindakan bercatat, bukan satu.

**Sisi portal — pengguna portal pelanggan:** melihat tagihan/kunjungan/dokumen pihaknya sendiri; mengubah kata sandi & namanya; mengonfirmasi pembayaran (K169). Tidak ada peran di dalam portal — semua pengguna portal satu pihak punya hak yang sama. Peran di dalam portal adalah kerumitan yang belum diminta siapa pun.

### Konsekuensi kalau Customer Portal tidak dibangun sekarang

Pelanggan tetap dilayani seperti sekarang — PDF dikirim lewat surel/WhatsApp, pertanyaan *"tagihan saya yang belum dibayar apa saja?"* dijawab staf dengan membuka aplikasi dan mengetik ulang. Untuk Tribuana sendiri itu masih bisa ditanggung. Yang hilang adalah **alasan tenant lain membayar lebih**: portal pelanggan adalah satu-satunya fitur di seluruh roadmap yang terlihat oleh **pelanggan tenant**, sehingga ia satu-satunya yang membuat tenant terlihat lebih profesional di mata kliennya sendiri. Blueprint §10 menyebut harga sebagai satu dari lima keunggulan; portal adalah salah satu dari empat yang bukan harga.

---

## 7. Vendor Portal

> Fase 7 §6 menaruh batas ini di depan dengan tegas: *"Roadmap Fase 8 menyebut **Vendor Portal** — vendor punya akun, masuk sendiri, melihat PO/WO yang ditujukan kepadanya, mengunggah tagihan. **Tak satu pun dari itu ada di Fase 7.**"* Bagian ini membayar janji itu — memakai `PurchaseOrder`, `WorkOrder`, dan `Attachment` yang sudah dibangun Fase 7, tanpa satu pun tabel operasional baru.

Vendor Portal memakai **seluruh** mekanisme §6 apa adanya: `PortalUser`, `PortalAccess` (dengan `pihak = 'VENDOR'`), `PortalInvitation`, `forPortal`, RLS. Yang berbeda hanya proyeksinya dan satu jalur tulis. Itu bukan kebetulan — itu alasan §6 dan §7 dipisah dari 8a: mekanismenya dibangun sekali (semangat K84).

### K171 — Vendor melihat pekerjaan yang **ditujukan kepadanya**, dan tidak pernah melihat harga jual

| Layar | Isinya | Yang **tidak pernah** ikut |
|---|---|---|
| Beranda | PO/WO terbuka, tagihan yang sudah diunggah & statusnya | — |
| Pesanan (PO) | `PurchaseOrder` ber-`vendorId` = pihaknya, status `SENT` ke atas: nomor, tanggal, baris, jumlah, `neededBy`, `deliveryTo`, PDF | PO ke vendor lain; PO ber-status `DRAFT`/`PENDING_APPROVAL` |
| Perintah kerja (WO) | `WorkOrder` ber-`vendorId` = pihaknya: lingkup, jadwal rencana, `agreedAmount`, kapal & pelabuhan | penilaian kinerja (`VendorRating`, K115), skor vendor (K113) |
| Kunjungan terkait | nomor voyage, nama kapal, pelabuhan, ETA/ETB — hanya untuk voyage yang punya PO/WO miliknya | seluruh voyage lain; biaya; pelanggan |
| Tagihan saya | riwayat unggahan + status (K172) | pembayaran ke vendor lain |

Empat larangan, masing-masing dengan alasannya:
- **PO `DRAFT` / `PENDING_APPROVAL` tak pernah terlihat.** Vendor yang melihat pesanan yang belum disetujui akan mulai bekerja atas dasar dokumen yang bisa berubah atau batal. Yang muncul hanya `SENT` ke atas (`po-status.ts`, K120) — dan itu memberi arti nyata pada transisi `APPROVED → SENT`: **saat itulah** dokumen jadi kenyataan bagi pihak luar.
- **Harga jual dan margin tak pernah terlihat.** Vendor melihat `agreedAmount`-nya sendiri. Berapa yang ditagihkan tenant ke pelanggan atas jasa itu bukan urusannya, dan membocorkannya melemahkan posisi tawar tenant pada pekerjaan berikutnya.
- **Skor & penilaian tak pernah terlihat.** K113 sudah menetapkan skor vendor sebagai informasi untuk manusia di dalam. Menampilkannya ke vendor mengubah alat penilaian jujur menjadi alat negosiasi, dan orang berhenti menilai jujur begitu yang dinilai membacanya. (Ini juga alasan `VERIFIED` dipisah dari `COMPLETED` di K123 — semangat yang sama.)
- **Vendor lain tak pernah terlihat**, termasuk keberadaannya.

Apakah `agreedAmount` sendiri pun terlalu banyak, dan apakah vendor sebaiknya hanya melihat lingkup pekerjaan → **P53**. Interim: nilai kesepakatan **ditampilkan**, karena itu memang nilai yang sudah disepakati kedua pihak dan tertulis di SPK yang selama ini dikirim.

### K172 — Unggah tagihan vendor: masuk sebagai **usulan**, tidak pernah langsung jadi baris biaya

Ini **satu-satunya** jalur tulis pihak luar yang membuat baris baru di seluruh Fase 8, dan karena itu ia dirancang paling ketat.

```prisma
model VendorInvoiceSubmission {
  id       String @id @default(cuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  vendorId String
  vendor   Vendor @relation(fields: [vendorId], references: [id])
  purchaseOrderId String?
  workOrderId     String?
  voyageId        String?

  invoiceNo   String
  invoiceDate DateTime
  currency    String   @default("IDR")
  amount      Float
  note        String?

  /// SUBMITTED → UNDER_REVIEW → ACCEPTED | REJECTED. Mesin transisi murni,
  /// cetakan disbursement-status.ts (K34-K36), sama seperti K91/K120/K121.
  status String @default("SUBMITTED")
  reviewNote      String?
  reviewedByUserId String?
  reviewedAt       DateTime?

  /// Diisi HANYA bila operator menekan "Ambil ke FDA" dan MENYIMPAN sendiri.
  linkedDisbursementItemId String?

  submittedByPortalUserId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId, vendorId, status])
  @@index([tenantId, status, createdAt])
}
```

Aturan yang mengikat:
1. **Tak pernah menyentuh uang secara otomatis.** Sejalan penuh dengan **K122** (*"PO/WO tidak pernah menulis baris biaya sendiri ke Disbursement"*): kiriman vendor muncul di builder FDA sebagai tawaran *"Ambil dari tagihan vendor"* yang **mengisi form** — manusia yang menyimpan. Kalau pratinjau dibatalkan, **tidak ada** `DisbursementItem` yang lahir. Ini pemeriksaan inti increment-nya.
2. **Berkasnya wajib**, dan ia `Attachment` ber-`entityType = 'VENDOR_INVOICE_SUBMISSION'` — didaftarkan di `ENTITAS_DIDUKUNG` (K85) seperti entitas lain. Nol mekanisme unggah kedua; batas ukuran, allowlist tipe, normalisasi nama, dan `sha256` (K109) berlaku apa adanya. Untuk unggahan dari pihak luar, allowlist tipe berhenti menjadi kenyamanan dan mulai menjadi pertahanan — dan ia sudah ada.
3. **Nominal kiriman tak pernah dipercaya sebagai angka.** Ia ditampilkan sebagai *"vendor menyatakan Rp X"* berdampingan dengan `agreedAmount` dari WO. Selisihnya dihitung dan ditampilkan; yang memutuskan manusia.
4. **Batas laju**: paling banyak sekian kiriman per vendor per hari, angkanya di `commercial-policy.ts` (**P54**). Endpoint tulis yang bisa dipanggil pihak luar tanpa batas laju adalah lubang biaya penyimpanan, dan ini satu-satunya endpoint tulis semacam itu di aplikasi.
5. **Kiriman ganda diberi tahu, tidak ditolak** — `sha256` yang sama sudah pernah masuk (K109 memakai pola yang sama untuk lampiran). Vendor yang mengirim ulang karena tak yakin adalah perilaku normal.

### K173 — Vendor boleh **mengonfirmasi**, tidak boleh **mengubah status**

Godaan: biarkan vendor menekan "Selesai" pada Work Order-nya.

Ditolak, dan alasannya sudah tertulis di **K123**: `VERIFIED` sengaja dipisah dari `COMPLETED` supaya *"yang dinilai tak menilai dirinya"*. Membiarkan vendor menutup WO-nya sendiri membatalkan seluruh alasan itu — dan `WorkOrder.actualEnd` adalah bahan **metrik ketepatan waktu** (K114), yaitu angka yang dipakai menilai vendor itu sendiri. Pihak yang dinilai tidak boleh menulis angka penilaiannya.

Yang **boleh**: vendor menekan *"Pekerjaan sudah kami selesaikan"* → satu `Comment` (K128) pada WO + satu `Notification` ke pembuat WO. Operator yang menetapkan `actualEnd` dan status. Bentuk yang sama persis dengan K169 (konfirmasi pembayaran pelanggan), dan itu disengaja: **pihak luar melapor, orang dalam mencatat.** Satu kalimat itu adalah seluruh model kolaborasi Fase 8.

### K174 — Portal vendor **tidak** menghidupkan pemberitahuan otomatis ke vendor

PO yang terbit tidak mengirim surel ke vendor; ia **muncul** di portalnya. Alasannya bukan malas: pengiriman surel adalah **P10** yang masih terbuka sejak Fase 3, dan Fase 7 sudah memutuskan tidak menambah mekanisme email setengah jadi (K136/K138). Membangun pengiriman otomatis ke pihak luar sekarang berarti menjawab P10 diam-diam dengan pilihan penyedia yang belum diputuskan.

Yang ada: tombol *"Salin tautan portal"* dan `EmailLog` (K136) yang mencatat bahwa manusia sudah memberi tahu. Sesudah P10 dijawab, ini bertambah satu pemanggilan — bentuk datanya tidak berubah (persis catatan T6 Fase 7).

### Siapa boleh apa (Vendor Portal)

| Tindakan | ADMIN | OPERATOR | MANAJER_OPERASI | PENYUSUN_BIAYA | FINANCE | VIEWER | DIREKTUR |
|---|---|---|---|---|---|---|---|
| Mengundang pengguna portal vendor | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mencabut akses portal vendor | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Melihat kiriman tagihan vendor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Menerima / menolak kiriman tagihan | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Menarik kiriman ke baris FDA (pratinjau) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

Vendor adalah hubungan **operasional** (beda dari pelanggan yang hubungan penagihan), jadi `OPERATOR` mengundang — konsisten dengan hak Master Data vendor di Fase 1. `PENYUSUN_BIAYA` boleh menilai kiriman karena menyusun FDA memang pekerjaannya (K123 memberinya hak yang setara pada dokumen biaya).

**Sisi portal — pengguna portal vendor:** melihat PO/WO/kunjungan pihaknya; mengunggah tagihan; berkomentar pada PO/WO-nya; mengubah kata sandi & namanya. Tidak lebih.

### Konsekuensi kalau Vendor Portal tidak dibangun sekarang

Tagihan vendor tetap masuk lewat WhatsApp dan surel, lalu diketik ulang ke FDA oleh penyusun biaya — pekerjaan ganda yang justru terjadi di titik paling rawan salah ketik (nominal). Vendor tetap menelepon untuk bertanya *"SPK-nya sudah keluar belum?"*. Dan `Attachment Center` (K106) tetap diisi tangan dari lampiran surel, padahal sumbernya — vendor sendiri — punya berkas aslinya. Perlu dicatat jujur: dari seluruh Fase 8, ini sub-fitur yang **paling bisa ditunda** tanpa merusak yang lain, karena ia tidak menghalangi penjualan. Ia menghemat waktu, dan waktu bisa menunggu; sedangkan langganan dan isolasi tidak bisa.

---

## 8. Data maritim — AIS, cuaca, kongesti

### K175 — Satu antarmuka penyedia; bawaannya **tidak ada penyedia**, dan itu keadaan yang sah

Roadmap menyebut *"Marine data (AIS/Weather/Congestion)"* tanpa menyebut penyedia. Memilih penyedia adalah keputusan komersial (langganan berbayar, cakupan wilayah Indonesia, batas panggilan) yang **tidak bisa diambil di dalam tugas desain ini** — tidak ada akses untuk membandingkan penyedia, harga, atau cakupan, dan **penyedia fiktif tidak boleh ditulis** ke dokumen yang akan dipakai orang membeli. → **P55**.

Yang bisa diputuskan sekarang tanpa tahu penyedianya adalah **bentuk integrasinya**, dan bentuk itu tidak akan berubah oleh siapa pun yang terpilih:

```ts
// services/marine/provider.ts — antarmuka, cetakan: PenyimpananBerkas (K107)
export type PosisiKapal = {
  imo: string | null; mmsi: string | null
  lat: number; lon: number
  sog: number | null; cog: number | null      // kecepatan & haluan
  waktu: Date                                  // waktu POSISI, bukan waktu pengambilan
  sumber: string                               // nama penyedia, apa adanya
}

export type PenyediaDataMaritim = {
  nama: string
  posisiKapal(id: { imo?: string; mmsi?: string }): Promise<PosisiKapal | null>
  cuacaPelabuhan(portId: { lat: number; lon: number }): Promise<RingkasCuaca | null>
  kongestiPelabuhan(kode: string): Promise<RingkasKongesti | null>
}
```

Bawaan Fase 8: **`penyediaKosong`** — mengembalikan `null` untuk semuanya, tanpa galat. Layar menampilkan *"Data pergerakan kapal belum aktif"* dengan tautan ke halaman add-on. Ini pola yang sama dengan `midtransConfigured()` yang sudah ada: fitur yang belum dikonfigurasi **tidak pernah** menampilkan tombol yang pasti gagal.

Alasan adapter, sama persis dengan K107: penyedia **pasti** berganti (harga naik, cakupan kurang, layanan tutup), dan penggantian itu harus berarti satu berkas baru — bukan menyentuh setiap pemanggil.

### K176 — Data pihak ketiga adalah **cache bertanda waktu**, tak pernah menimpa data operasional

```prisma
model MarineDataCache {
  id       String @id @default(cuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  jenis    String    // 'VESSEL_POSITION' | 'PORT_WEATHER' | 'PORT_CONGESTION'
  kunci    String    // IMO / MMSI / kode pelabuhan — apa adanya, bukan id internal kita
  penyedia String
  payload  Json      // respons apa adanya (semangat Payment.raw)
  diambilPada DateTime @default(now())
  berlakuSampai DateTime

  @@unique([tenantId, jenis, kunci, penyedia])
  @@index([tenantId, berlakuSampai])
}
```

Tiga aturan:
1. **Tidak pernah menimpa kolom operasional.** `Voyage.eta`, `PortCall.ata`, `Vessel.*` tetap milik manusia. Data AIS tampil **di sebelahnya**, dengan sumber dan waktunya tertulis.
2. **Waktu posisi ≠ waktu pengambilan.** Keduanya disimpan dan **keduanya ditampilkan** (*"posisi pukul 14:20, diambil 14:35"*). Data posisi kapal yang berumur enam jam ditampilkan sebagai enam jam lalu, bukan sebagai "sekarang" — dan menyembunyikan umurnya adalah kebohongan yang persis sejenis dengan yang dilarang K66 (prediksi basi) dan K113 (skor basi).
3. **Cache per tenant, bukan global.** Dua tenant yang memantau kapal yang sama membayar dua panggilan. Cache lintas-tenant akan menjadi **satu-satunya** tabel di sistem ini yang barisnya dibagi antar-tenant — meruntuhkan invarian `TENANT_MODELS` demi menghemat panggilan API. Ditolak: invarian yang punya perkecualian bukan invarian lagi, dan §3 baru saja menghabiskan seluruh anggaran kerumitan untuk menjaganya.

### K177 — Diambil saat **diminta**, dengan kuota — bukan polling berkelanjutan

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Polling berkala semua kapal aktif | **Ditolak.** Biaya per panggilan × jumlah kapal × frekuensi, berjalan diam-diam, dan tagihannya baru terlihat di akhir bulan. Blueprint §11.5 sudah menandai "pemakaian AI" sebagai biaya yang perlu dibatasi per pelanggan; ini persis jenis yang sama |
| **Atas permintaan + cache + kuota** | **Dipilih.** Tombol "Perbarui posisi" di Voyage Workspace; cache berlaku sekian menit (`commercial-policy.ts`); kuota panggilan per tenant per bulan, memakai mesin K156 yang sama |

Satu perkecualian yang diizinkan, dan hanya satu: **satu penyegaran terjadwal per hari** untuk voyage ber-status `WORKING`/`ARRIVED`, lewat endpoint job ber-token yang sudah ada (K88), berbatas jumlah per jalan (pola K102). Ia berguna nyata (kapal yang mendekat), jumlahnya kecil, dan tunduk kuota yang sama.

### K178 — AIS **tidak pernah** mengubah ETA/ATA sendiri; ia mengusulkan, manusia menekan

Godaan yang paling masuk akal di bagian ini: posisi AIS menunjukkan kapal sudah sandar → tandai `ata` otomatis.

Ditolak, dan alasannya sudah dibayar dua kali di roadmap ini: **K52** (AI tak pernah menulis, hanya mengusulkan ke layar pratinjau) dan **K130** (peristiwa tidak mengubah status/tanggal aktual otomatis). AIS adalah sumber pihak ketiga dengan kualitas yang tak kita kendalikan — transponder mati, posisi meleset, kapal berlabuh dekat dermaga tanpa sandar. `ata` adalah **fakta hukum** yang masuk ke SOF, jadi dasar tagihan, dan disengketakan principal. Fakta hukum tidak boleh ditulis oleh tebakan.

Yang muncul: spanduk *"Posisi AIS menunjukkan kapal berada di dermaga sejak 14:20. Catat sebagai ATA?"* dengan tombol yang **mengisi form** — dan manusia yang menyimpan. Bentuk yang persis sama dengan K122, K169, dan K173. Empat fitur berbeda, satu pola, nol mekanisme baru.

### Konsekuensi kalau Data Maritim tidak dibangun sekarang

ETA tetap diketik dari surel principal dan basi diam-diam; operator tetap membuka situs pelacakan kapal di tab lain lalu mengetik ulang. Perlu dikatakan terus terang: ini sub-fitur dengan **ketidakpastian nilai tertinggi** di seluruh Fase 8, karena nilainya bergantung sepenuhnya pada cakupan penyedia di perairan Indonesia — dan itu belum diperiksa siapa pun. Karena itu ia ditaruh belakangan (8h), dirancang sebagai add-on berbayar terpisah (K165), dan **layak dibatalkan seluruhnya** kalau P55 dijawab dengan *"harganya tidak sepadan"*. Membatalkannya tidak merusak satu pun bagian lain — itu justru gunanya dirancang sebagai adapter.

---

## 9. White-label

### K179 — **Maritime Suite tetap merek produk.** Yang di-white-label adalah apa yang dilihat pelanggan tenant

Pertanyaannya harus dijawab tegas sebelum satu baris kode ditulis, karena jawabannya menentukan bentuk datanya: apakah produk ini dijual sebagai "Maritime Suite", atau dijual agar tenant bisa mengaku membuatnya sendiri?

**Putusan: tiga lapis merek, dan hanya lapis ketiga yang bisa diganti tenant.**

| Lapis | Mereknya | Keadaan hari ini | Fase 8 |
|---|---|---|---|
| 1. **Produk** — halaman masuk, halaman harga, kuitansi langganan (K164), Help Center | **Maritime Suite** | `public/logo-transparent.png` | **Tidak berubah.** Tenant tidak bisa mengganti ini |
| 2. **Dokumen** — kop EPDA/FDA/Invoice/SPK/SOF | **merek tenant** | ✅ **sudah bekerja** — `Tenant.logoUrl` + profil perusahaan dipakai kop PDF sejak Fase 0 | Tidak berubah; hanya pindah penyimpanan (K181) |
| 3. **Aplikasi & portal** — sidebar, header, halaman masuk portal | **Maritime Suite** di mana-mana | hardcoded | **Di sinilah white-label bekerja** (K180) |

Alasannya bukan selera, melainkan tiga hal yang bisa diperiksa:
1. **Bagian yang paling penting sudah ter-white-label sejak awal.** Yang dilihat principal & pelanggan adalah **dokumen**, dan dokumen sudah membawa kop tenant sejak Fase 0. Nilai terbesar white-label sudah didapat tanpa fitur white-label.
2. **Menghapus merek produk dari aplikasi internal berarti menghapus alasan orang menyebutkannya.** Pasar yang blueprint §10 gambarkan *"saling mengenal dan berukuran kecil"* dijangkau dari mulut ke mulut. Produk tanpa nama tidak diceritakan.
3. **White-label penuh adalah janji dukungan yang berbeda.** Kalau tenant mengaku membuat sendiri, keluhan pelanggannya tidak bisa diteruskan ke kita, dan setiap perubahan tampilan jadi urusan negosiasi. Itu model usaha lain, bukan fitur.

Apakah Marlon setuju dengan pembagian ini — atau memang ingin menjual produk berlabel putih penuh sebagai penawaran Enterprise → **P56**. Interim: pembagian di atas, yang **kebetulan juga yang paling murah dibangun**, sehingga menundanya tidak memblokir apa pun.

### K180 — Cakupan white-label: **logo, satu warna, nama tampilan, subdomain.** Bukan tema

| Yang bisa diatur tenant | Bentuk | Kenapa cukup |
|---|---|---|
| Logo | `Tenant.logoAttachmentId` (K181) | Sudah ada isinya; tinggal dipakai di layar, bukan hanya di PDF |
| Satu warna aksen | `Tenant.brandPrimaryColor String?` (hex) | Satu variabel CSS. Menyentuh tombol, tautan, header — cukup untuk "terasa milik kami" |
| Nama tampilan | `Tenant.companyName` yang sudah ada | Muncul di sidebar & judul tab |
| Alamat portal | `Tenant.portalSlug String?` → `portal.maritimesuite.id/<slug>` | K182 |

Yang **sengaja tidak** diberikan: palet warna penuh, CSS/tema kustom, penggantian huruf, penataan ulang menu, templat email sendiri. Alasannya satu dan cukup: setiap satunya menjadi **permukaan dukungan permanen** — begitu tenant bisa mengubah tampilan, setiap perubahan UI yang kita lakukan bisa merusak tampilan mereka, dan setiap keluhan tampilan jadi keluhan kita. Satu warna cukup untuk terasa milik mereka, dan cukup sempit untuk tidak pernah rusak.

Catatan aksesibilitas yang harus ditegakkan mesin, bukan diserahkan selera: warna yang dipilih diperiksa kontrasnya terhadap teks putih & hitam; kalau gagal, sistem memakai varian gelap/terangnya untuk teks dan mengatakannya di layar. Tenant yang memilih kuning cerah tidak boleh menghasilkan tombol yang tulisannya tak terbaca — dan ia tidak akan menyadarinya sendiri.

### K181 — ⚠️ Hutang yang dibayar di sini: `Tenant.logoUrl` base64 pindah ke penyimpanan berkas

Keadaan sekarang, dan bukti bahwa ia sudah menimbulkan masalah nyata: `logoUrl` menyimpan **data URL base64** langsung di kolom teks (`api/auth/register` menerima sampai 2,5 MB), dan `lib/auth.ts` sudah harus membuangnya dari sesi dengan komentar yang menjelaskan sebabnya — *"logoUrl (base64 ~8.7KB) DIBUANG dari sesi: kalau ikut, cookie JWT membengkak & kena batas header HTTP/2 proxy → login gagal (ERR_HTTP2_PROTOCOL_ERROR)"*.

Itu bug produksi yang sudah pernah terjadi, dan bentuk datanya yang menyebabkannya. Fase 7 sudah membangun tempat yang benar (K106/K107: `Attachment` + adapter penyimpanan). Fase 8 memakainya:

- Kolom aditif `Tenant.logoAttachmentId String?`. `logoUrl` **tidak dihapus** (M6) dan tetap dibaca sebagai cadangan bila `logoAttachmentId` null — sehingga tenant lama tidak berubah sedikit pun.
- Satu skrip migrasi sekali jalan memindahkan isi base64 → berkas → `Attachment` (`kind = 'BRANDING'`) → mengisi `logoAttachmentId`. **Idempoten**, `--dry-run` dulu, dan **tidak** mengosongkan `logoUrl` (pola M6/K48: jalur lama tidak dimatikan pada saat yang sama dengan jalur baru dinyalakan).
- Logo disajikan lewat route yang sama dengan lampiran lain (K108) — **tak pernah** dari `public/`, dengan satu perkecualian sadar: logo boleh di-cache publik karena ia memang tampil di halaman masuk portal yang belum terautentikasi.

Ini **migrasi data pada tabel yang dipakai**, jadi ia menyandang sinyal wajib-Opus §6b nomor 3 — dan ditandai begitu di §17.

### K182 — Alamat portal: **subdomain lebih dulu**; domain milik tenant adalah add-on dengan syarat deploy

| Pilihan | Bentuk | Putusan |
|---|---|---|
| Path: `/portal/<slug>` | tak butuh DNS, tak butuh sertifikat | **Dipilih untuk 8a–8g.** Bekerja pada VM tunggal apa adanya, tanpa satu pun langkah operasional |
| Subdomain kita: `<slug>.portal.maritimesuite.id` | satu wildcard DNS + satu sertifikat wildcard, dipasang sekali | **Dipilih untuk 8i.** Terlihat profesional, biaya operasional tetap (bukan per tenant) |
| Domain tenant: `portal.tribuana.co.id` | tenant mengarahkan CNAME; kita menerbitkan & memperbarui sertifikat **per domain** | **Ditunda** — add-on Enterprise, **P57** |

**Catatan deploy (bukan desain deploy).** Domain kustom adalah satu-satunya bagian Fase 8 yang benar-benar menuntut sesuatu dari rencana VM: penerbitan sertifikat per domain (mis. Let's Encrypt dengan verifikasi HTTP) dan pemuatan ulang nginx saat ada domain baru — yaitu proses yang menyentuh konfigurasi server dari dalam aplikasi. Itu keputusan operasional yang **milik rencana deploy**, bukan dokumen ini. Yang ditetapkan di sini hanya bentuk datanya (`Tenant.customDomain String?` + `customDomainVerifiedAt`) supaya tidak ada migration lagi saat P57 dijawab. Sampai itu: kolomnya ada, jalurnya tidak.

### Konsekuensi kalau White-label tidak dibangun sekarang

Nyaris tidak ada yang rusak — dan itu perlu dikatakan terus terang. Dokumen yang dilihat pelanggan **sudah** membawa merek tenant sejak Fase 0, yaitu 90% nilainya. Yang tersisa adalah tampilan aplikasi internal dan halaman masuk portal, yang dilihat orang-orang yang sudah tahu mereka memakai Maritime Suite. Satu-satunya kerugian nyata dari menunda adalah **K181 tidak terbayar**: logo tetap base64 di kolom teks, dan bug kelas ERR_HTTP2_PROTOCOL_ERROR tetap menunggu setiap kali seseorang menyentuh isi sesi. Kalau §9 dipangkas, **K181 tetap dikerjakan** — ia perbaikan utang teknis, bukan fitur white-label.

---

## 10. Product Analytics

> Bagian terkecil dokumen ini, disengaja: roadmap menyebutnya satu kata di antara sembilan, dan menaruh usaha lebih di sini berarti mengambilnya dari §3 atau §5.

### K183 — `UsageEvent`: satu tabel ringkas, **milik sendiri**, tanpa pihak ketiga

```prisma
model UsageEvent {
  id       String @id @default(cuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  nama     String    // 'VOYAGE_CREATED' | 'EPDA_ISSUED' | 'AI_PREDICT_USED' | 'PORTAL_LOGIN' | …
  /// Konteks SANGAT ringkas — tak pernah memuat isi dokumen, nama orang, atau nominal.
  meta     Json?
  userId   String?   // string polos (pola AuditLog); null untuk peristiwa portal/sistem
  createdAt DateTime @default(now())

  @@index([tenantId, nama, createdAt])
  @@index([createdAt])
}
```

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Alat analitik pihak ketiga (skrip di halaman) | **Ditolak.** Mengirim perilaku pemakaian data keuangan pelanggan ke pihak ketiga menuntut dasar hukum dan pemberitahuan (UU PDP, §11), untuk pertanyaan yang bisa dijawab satu tabel. Ia juga menambahkan skrip eksternal ke aplikasi yang seluruh nilainya adalah kerahasiaan |
| Menurunkan dari `AuditLog` yang sudah ada | **Ditolak, meski menggoda.** `AuditLog` adalah **jejak hukum**: ia tak boleh dipangkas, disampel, atau dipadatkan. Analitik justru ingin ketiganya. Menggabungkannya berarti salah satu kepentingan mengalah, dan yang mengalah akan selalu yang hukum |
| **Tabel sendiri, ringkas, per tenant** | **Dipilih.** Boleh dipangkas kapan saja tanpa merusak apa pun |

Aturan: peristiwa dicatat di **service**, bukan di komponen UI (klik yang tidak menghasilkan apa-apa bukan pemakaian); `meta` tidak pernah memuat isi dokumen, nama pihak, atau nominal; dan pencatatan **menelan galatnya sendiri** persis seperti `notify()` (K86) — analitik yang bisa menggagalkan penyimpanan voyage adalah analitik yang harus dimatikan.

### K184 — Yang diukur adalah **pemakaian fitur**, bukan produktivitas orang

Sepuluh peristiwa cukup untuk menjawab pertanyaan yang benar-benar menentukan: fitur mana yang dipakai, fitur mana yang tidak pernah disentuh sesudah dibangun, di langkah mana onboarding berhenti, dan tenant mana yang berhenti memakai aplikasi sebelum langganannya habis (sinyal paling awal dari pelanggan yang akan pergi).

Yang **sengaja tidak** dibangun: laporan per-orang, peringkat pengguna, waktu aktif. Alasannya sudah ditulis Fase 7 §17 saat menolak *cycle time* per orang — **"berisiko sosial"**. Alat yang bisa dipakai menilai karyawan akan dipakai menilai karyawan, dan sesudah itu orang mulai memakai aplikasi untuk terlihat baik alih-alih untuk bekerja. Itu merusak data yang justru jadi bahan Fase 6.

Dua tingkat pembacaan, keduanya kecil:
- **Untuk tenant** (ADMIN/DIREKTUR): ringkasan pemakaian perusahaannya sendiri + pemakaian kuota (K156).
- **Untuk Marlon** (lintas-tenant): **tidak** dibangun sebagai layar di aplikasi. Ia satu skrip `.mjs` yang dijalankan langsung ke database. Membangun layar lintas-tenant di dalam aplikasi berarti membuat satu jalur kode yang sengaja melewati seluruh isolasi §3 — dan jalur seperti itu, sekali ada, akan dipakai untuk hal lain. `systemContext` sendiri sudah menolak mode "lihat semua tenant" (`context.ts`), dan penolakan itu dipertahankan di sini.

### Konsekuensi kalau Product Analytics tidak dibangun sekarang

Keputusan produk tetap diambil dari perasaan — persis keadaan yang K113 tolak untuk vendor (*"vendor mana yang sering telat" dijawab dengan perasaan*), dipakai pada pertanyaan yang jauh lebih mahal: fitur mana yang layak dilanjutkan. Blueprint §11.6 sendiri menuliskan lima dugaan yang belum diuji dan menyebut yang kedua *"paling penting dan paling murah untuk diuji"*; tanpa pengukuran pemakaian, tak satu pun dari kelimanya akan pernah punya bukti. Tabelnya satu dan pencatatannya satu baris per tempat — ini sub-fitur dengan usaha terkecil di seluruh Fase 8, dan menundanya berarti kehilangan data **yang tidak bisa dikumpulkan surut**.

---

## 11. Kepatuhan, backup, monitoring — dan batas antara **fitur** dan **checklist go-live**

### K185 — Batas ditulis di depan: yang mana keputusan desain, yang mana pekerjaan eksekusi

Ada satu punchlist keamanan/infrastruktur yang sudah dikenal dan **sengaja ditunda sampai "Fase 8 selesai"**. Isinya bercampur dua jenis pekerjaan yang sangat berbeda, dan mencampurnya membuat keduanya tak pernah selesai: yang satu butuh **keputusan** (bentuk data, alur, hak akses), yang satu butuh **eksekusi** (pasang, konfigurasi, uji).

Fase 7 memakai cara yang sama untuk memisahkan Vendor Portal dari Vendor Management, dan cara itu bekerja. Diulang di sini:

| Butir | Jenis | Di mana |
|---|---|---|
| Dasbor kepatuhan tenant (siapa akses apa, ekspor apa) | **Fitur** — butuh model & hak akses | **§11, K186–K188** |
| Ekspor seluruh data tenant (mandiri) | **Fitur** | **K186** |
| Hak subjek data UU PDP (akses/koreksi/hapus) | **Fitur** — butuh alur & jejak | **K187** |
| Offboarding: berhenti berlangganan → ekspor → hapus | **Fitur** | **K188** |
| Backup terjadwal + **uji pemulihan** | **Eksekusi**, dengan satu ujung fitur: layar "backup terakhir kapan, berhasil tidak" | **K186** (bagian yang terlihat) + checklist |
| Batas laju (rate limit) & perlindungan brute-force login | **Eksekusi** — middleware, nol keputusan desain | **Checklist go-live** |
| Security header (CSP, HSTS, X-Frame-Options) | **Eksekusi** | **Checklist go-live** |
| Pelacakan galat (Sentry atau setara) | **Eksekusi** | **Checklist go-live** |
| CI/CD | **Eksekusi** | **Checklist go-live** |
| Pemindaian virus lampiran (diakui belum ada di K109) | **Eksekusi** + satu keputusan penyedia | **Checklist go-live** |
| Rotasi kredensial, akses SSH, firewall VM | **Eksekusi** | **Checklist go-live** — milik rencana deploy |

**Yang masuk checklist go-live tidak butuh nomor K**, dan memberinya nomor K justru merugikan: ia menciptakan kesan keputusan yang harus dipertimbangkan, padahal yang dibutuhkan hanya waktu untuk mengerjakannya. Checklist itu tinggal di dokumen deploy, dan **Definition of Done Fase 8 (§18) mensyaratkan checklist itu selesai** — sehingga ia tidak bisa hilang, hanya tidak didesain di sini.

Satu hal yang harus dikatakan tanpa dilunakkan: **aplikasi ini belum boleh menerima pelanggan berbayar sebelum checklist itu selesai.** Membuka pendaftaran ke publik (K154) pada aplikasi tanpa batas laju login dan tanpa pelacakan galat bukan risiko yang bisa ditanggung "sambil jalan" — dan urutannya di §17 dibuat mencerminkan itu.

### K186 — Backup & ekspor: yang bisa dilihat tenant, dan yang harus bisa dibuktikan

**Backup** adalah pekerjaan operasional (`pg_dump` terjadwal + berkas unggahan), dan dokumen ini tidak mendesain jadwalnya. Yang **didesain** adalah ujungnya yang terlihat, karena backup yang tak pernah dilihat siapa pun adalah backup yang tak pernah ketahuan rusak:

- Job ber-token yang sudah ada (K88) mendapat `?job=backup-status` yang mencatat hasil backup terakhir (waktu, ukuran, berhasil/gagal) ke `Tenant`-independen sederhana (satu baris konfigurasi sistem, bukan tabel bertenant — ini urusan operator aplikasi, bukan tenant).
- Layar **Settings › Sistem** (ADMIN) menampilkan *"Backup terakhir: 17 Ags 2026 02:00, berhasil, 340 MB"* — atau **peringatan merah** bila lebih dari 48 jam.
- **Uji pemulihan** adalah butir checklist go-live, bukan kode: pulihkan ke database kosong, hitung baris, buka satu voyage. Backup yang belum pernah dipulihkan bukan backup, ia harapan.

**Ekspor data tenant mandiri** — ini yang jadi fitur nyata:

| Aspek | Putusan |
|---|---|
| Siapa | `ADMIN` tenant itu, atas datanya sendiri |
| Isi | seluruh data operasional tenant dalam **XLSX per tabel** (memakai `exceljs` yang sudah jadi dependency) + **JSON** untuk kesetiaan penuh + berkas lampiran |
| Cara | tugas berjalan lama → hasilnya jadi `Attachment` ber-`kind='EXPORT'`, diberitahukan lewat `Notification` saat siap. Bukan permintaan HTTP yang ditunggu di browser |
| Batas | satu ekspor aktif per tenant; berkas hasil kedaluwarsa (isi `expiresAt` K106) |
| Jejak | `AuditLog` `action = 'EXPORT'` + ukuran + jumlah tabel |

Kenapa ini fitur dan bukan kebaikan hati: ia **prasyarat komersial**. Perusahaan tidak memindahkan pembukuannya ke sistem yang datanya tak bisa diambil kembali, dan pertanyaan *"kalau kami berhenti, data kami bagaimana?"* akan muncul di percakapan penjualan pertama. Ia juga separuh dari K188 dan separuh dari K187 — satu mesin, tiga kegunaan.

### K187 — UU PDP: hak subjek data diwujudkan sebagai **jalur nyata**, bukan janji di kebijakan privasi

Aplikasi ini menyimpan data pribadi orang: pengguna internal, kontak pelanggan & vendor, dan — sejak Fase 7 — **data awak kapal** (K125/K126: nama, kebangsaan, nomor dokumen, salinan paspor). Untuk data awak, tenant adalah pengendali data dan **Maritime Suite adalah pemroses**. Pembagian itu menentukan siapa menjawab permintaan siapa, dan harus ditulis sebelum ada pelanggan.

```prisma
/// Permintaan hak subjek data (akses / koreksi / penghapusan). Append-only pada
/// bagian permintaannya; penyelesaiannya ditulis manusia. Ada supaya permintaan
/// semacam ini punya jejak dan tenggat, bukan hidup di kotak masuk seseorang.
model DataRequest {
  id       String @id @default(cuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  jenis   String    // 'AKSES' | 'KOREKSI' | 'PENGHAPUSAN'
  subjek  String    // siapa yang meminta (nama/surel, apa adanya)
  konteks String?   // 'CREW' | 'PORTAL_USER' | 'USER' | 'LAINNYA'
  uraian  String

  status  String   @default("BARU")   // BARU | DIPROSES | SELESAI | DITOLAK
  hasil   String?
  ditanganiUserId String?
  selesaiPada     DateTime?
  createdAt DateTime @default(now())

  @@index([tenantId, status, createdAt])
}
```

Tiga aturan yang menentukan apakah ini berguna atau hiasan:
1. **Penghapusan tidak pernah otomatis.** Permintaan hapus atas data yang terikat dokumen keuangan (nama pada FDA yang sudah ditagihkan) bertabrakan dengan kewajiban penyimpanan dokumen. Sistem **tidak boleh** memutuskan mana yang menang. Ia mencatat, mengingatkan, dan menunjukkan **di mana saja** data itu muncul — manusia yang memutuskan. Ini sebentuk dengan K110 (berkas fisik tak pernah dihapus tanpa kebijakan retensi).
2. **Aturan Fase 7 tetap berlaku dan tidak dilonggarkan**: data awak tak pernah masuk konteks AI (K126/3), lampirannya wajib `sensitive` (K126/2), setiap pembacaan tercatat (K126/4), dan **tak satu pun boleh dibagikan ke portal** (K170/2).
3. **Yang harus ditulis manusia**, bukan kode: kebijakan privasi, perjanjian pemrosesan data (DPA) antara Maritime Suite dan tenant, penanggung jawab perlindungan data, dan lama retensi → **P59**. Dokumen ini menyiapkan **jalurnya**; isinya kewajiban hukum yang tidak boleh ditebak mesin maupun agen.

### K188 — Offboarding adalah kebalikan onboarding, dan ia **harus dibangun bersamanya**

Tenant yang berhenti berlangganan hari ini akan tetap ada di database selamanya, dengan datanya utuh. Itu **aman**, dan itu sebabnya jadi keadaan interim. Tapi ia bukan keadaan akhir yang benar: menyimpan data perusahaan yang sudah tidak berhubungan dengan kita adalah tanggungan hukum, bukan aset.

Empat langkah, semuanya **dimulai manusia**, tak satu pun terjadwal:

```
1. Berhenti     → tenant read-only (perilaku `locked` yang SUDAH ADA). Data utuh.
2. Ekspor       → ADMIN tenant menarik seluruh datanya (K186). Bisa diulang.
3. Tenggang     → masa tunggu sebelum penghapusan. Lamanya = P51. Interim: TAK TERBATAS.
4. Penghapusan  → hanya atas permintaan tertulis tenant, dijalankan skrip terpisah,
                  dengan `--dry-run` yang menghitung baris per tabel lebih dulu.
```

Tentang langkah 4: `Tenant` sudah punya `onDelete: Cascade` pada hampir semua relasi, sehingga penghapusan **secara teknis** satu baris. Justru karena itu ia berbahaya — satu baris yang menghapus puluhan ribu baris tanpa peringatan. Karena itu: skrip terpisah (bukan endpoint, bukan tombol di UI), `--dry-run` wajib lebih dulu, backup wajib lebih dulu, dan berkas lampiran fisik **tidak** ikut terhapus pada jalan yang sama (K110 masih berlaku: penghapusan fisik menunggu kebijakan retensi, P36/P59). Tidak ada satu pun jalur kode yang bisa menghapus tenant tanpa manusia mengetik perintah.

### Siapa boleh apa (kepatuhan)

| Tindakan | ADMIN | OPERATOR | MANAJER_OPERASI | PENYUSUN_BIAYA | FINANCE | VIEWER | DIREKTUR |
|---|---|---|---|---|---|---|---|
| Melihat status backup | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Meminta ekspor seluruh data tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mengunduh berkas hasil ekspor | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mencatat & menangani `DataRequest` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Melihat siapa mengakses apa (jejak akses portal) | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Menghapus tenant | **tak seorang pun lewat aplikasi** — skrip + permintaan tertulis (K188) | | | | | | |

Ekspor hanya `ADMIN` termasuk **bukan** `DIREKTUR`, meski Fase 5e memberi direktur "lihat-saja semua": satu berkas berisi seluruh data perusahaan adalah objek yang berbeda jenisnya dari sebuah layar laporan, dan menyalinnya keluar adalah tindakan, bukan penglihatan. Alasan yang sama sudah dipakai K110 saat menutup lampiran sensitif dari `DIREKTUR`.

### Konsekuensi kalau bagian ini tidak dibangun sekarang

Produk tidak boleh dijual. Bukan karena fiturnya kurang, tetapi karena tiga pertanyaan yang **pasti** ditanyakan calon pelanggan berbentuk PT tidak punya jawaban: *"data kami di-backup?"*, *"kalau kami berhenti, data kami bisa diambil?"*, dan *"bagaimana kepatuhan data pribadi?"*. Menjawabnya dengan janji lisan pada pelanggan pertama akan berhasil; menjawabnya begitu pada pelanggan kelima tidak. Dan bagian yang tak bisa ditunda dengan alasan apa pun adalah **checklist go-live** (K185): membuka pendaftaran publik tanpa batas laju dan tanpa pelacakan galat berarti kejadian pertama yang serius akan diketahui dari keluhan pelanggan, bukan dari sistem.

---

## 12. Help Center & dukungan

### K189 — Help Center **menumpang `KnowledgeArticle`** yang sudah dibangun Fase 7

K140 (Fase 7) membangun `KnowledgeArticle` untuk pengetahuan yang tidak terikat pelabuhan, lengkap dengan status draft/terbit dan sudah tersambung ke Global Search. Membangun CMS kedua untuk bantuan produk berarti dua editor, dua pencarian, dan dua tempat orang lupa memperbarui.

**Putusan:** satu kolom pembeda, nol tabel baru.

```prisma
// KnowledgeArticle (Fase 7 / K140) — tambahan aditif Fase 8
/// 'TENANT' (bawaan — pengetahuan milik tenant, perilaku K140 apa adanya)
/// | 'PRODUK' (bantuan Maritime Suite, ditulis Marlon, terlihat SEMUA tenant).
lingkup String @default("TENANT")
```

Artikel ber-`lingkup = 'PRODUK'` hidup di satu tenant khusus milik operator aplikasi dan dibaca semua tenant lewat **satu** service yang secara eksplisit hanya mengambil `lingkup='PRODUK'` **dan** `status='PUBLISHED'`. Ini satu-satunya pembacaan lintas-tenant yang sengaja ada di seluruh aplikasi, dan karena itu:
- ia **hanya-baca**, hanya untuk dua kolom itu, dan diberi nama yang mengaku (`bacaArtikelProduk()`);
- ia **tidak** memakai `forTenant` (yang justru akan menyaringnya keluar) — dan penyimpangan itu ditulis sebagai komentar di berkasnya, sesuai perintah `POLA-SERVICE-LAYER.md` (*"Kalau perlu menyimpang, tulis alasannya di komentar supaya tidak dikira kelalaian"*);
- ia **tak pernah** dijangkau `forPortal` — Help Center portal, kalau nanti perlu, adalah halaman statis terpisah.

Isi awal minimal, dan sengaja pendek: memulai (5 langkah onboarding), menyusun EPDA pertama, dari FDA ke Invoice, mengundang pelanggan ke portal, arti paket & kuota, dan cara membayar (dua gerbang). Enam artikel yang menjawab enam pertanyaan pertama; sisanya ditulis saat pertanyaannya benar-benar datang, bukan dibayangkan.

### K190 — Dukungan adalah **kanal**, bukan produk; dan SLA yang belum bisa ditepati tidak dituliskan

| Pilihan | Kenapa ditolak / dipilih |
|---|---|
| Sistem tiket di dalam aplikasi | **Ditolak.** Membangun helpdesk berarti membangun antrean, penugasan, status, dan SLA-nya sendiri — produk kedua, untuk melayani pelanggan yang jumlahnya masih nol |
| Live chat | **Ditolak.** Menjanjikan kehadiran yang tidak ada |
| **Kanal yang sudah dipakai + satu halaman kontak** | **Dipilih.** WhatsApp & surel — kanal nyata pasar ini (P35 Fase 7 sudah menandai WhatsApp sebagai kanal nyata mereka). Satu halaman "Bantuan" berisi kontak, jam layanan, dan tautan Help Center |

Tentang SLA: `SLA_DUKUNGAN = null` di `commercial-policy.ts` (K146), dan halaman bantuan menuliskan **jam layanan** (kapan kami ada) tanpa menjanjikan **waktu tanggap** (berapa lama kami menjawab). Bedanya penting: yang pertama bisa ditepati satu orang; yang kedua tidak, dan janji layanan yang dilanggar lebih merusak daripada tidak ada janji. Blueprint §11.5 sendiri menandai dukungan pelanggan sebagai *"pos terbesar setelah pengembangan"* — biaya itu nyata dan belum diukur siapa pun. Berapa jam layanan dan waktu tanggap yang berani dijanjikan → **P60**.

Satu hal kecil yang dibangun karena ia menghemat waktu paling banyak per baris kode: tombol **"Kirim info diagnostik"** yang menyalin versi aplikasi, id tenant, peran, dan halaman yang sedang dibuka ke papan klip — **tanpa** data bisnis apa pun. Separuh waktu dukungan habis untuk mencari tahu siapa yang bertanya dan sedang di mana.

### Konsekuensi kalau Help Center tidak dibangun sekarang

Setiap pertanyaan pertama pelanggan baru dijawab Marlon secara pribadi, dan jawaban yang sama diketik ulang berkali-kali. Untuk tiga sampai lima pengguna awal itu justru **lebih baik** daripada dokumentasi — percakapan langsung adalah cara termurah mengetahui apa yang membingungkan. Karena itu §12 sengaja ditaruh paling akhir dan boleh dipangkas: nilainya baru muncul pada pelanggan kesepuluh, dan sampai saat itu isinya sebaiknya ditulis dari pertanyaan yang benar-benar diajukan, bukan dari bayangan.

---

## 13. Peta modul (untuk pelaksana)

Semua mengikuti `POLA-SERVICE-LAYER.md` §5 (6 aturan) tanpa kecuali, **kecuali** yang ditandai eksplisit di §12 (K189). **Kolom "impor DB" adalah kontrak, bukan saran** — berkas bertanda ❌ harus tetap bisa diimpor Node langsung (K11/K51).

```
src/services/portal/                ← BARU. Seluruh jalur pihak luar. Tak satu pun
                                       berkas di sini boleh diimpor oleh service internal.
  portal-guard.ts       ❌ murni. MODEL_PORTAL + kunci pihak + operasi yang diizinkan (K148).
                           Cetakan: services/tenant-guard.ts. TANPA impor apa pun.
  portal-db.ts          ✅ DB. forPortal(pctx) — memasang guard ke KLIEN PORTAL (K148).
  portal-client.ts      ✅ DB. PrismaClient kedua dgn PORTAL_DATABASE_URL (K147). SATU-SATUNYA
                           tempat kredensial portal disebut.
  context.ts            ❌ murni. PortalContext. TIDAK punya `role` (K143).
  http.ts               ✅ DB. withPortal(): sesi portal → transaksi → SET LOCAL → audit (K149).
  auth.ts               ✅ DB. provider NextAuth "portal-credentials", cookie sendiri (K144).
  invitation.service.ts ✅ DB. buat/terima undangan, token di-hash (K168).
  access.service.ts     ✅ DB. PortalAccess: beri, cabut, daftar (K166/K168).
  customer-view.ts      ✅ DB. PROYEKSI pelanggan — tipe baru, bukan model Prisma (K167).
  vendor-view.ts        ✅ DB. PROYEKSI vendor (K171).
  vendor-submission.service.ts ✅ DB. satu-satunya jalur tulis pihak luar (K172).

src/services/saas/                  ← BARU. Komersial. Jalur INTERNAL biasa (withTenant).
  commercial-policy.ts  ❌ murni. SEMUA angka komersial — titik sentuh P48-P51/P60 (K146).
  quota.ts              ❌ murni. nilaiKuota() → keadaan + sisa (K156).
  quota.service.ts      ✅ DB. pastikanKuota(ctx, jenis) — bersebelahan dgn K33.
  subscription-calc.ts  ❌ murni. hitungAkhirLangganan() — dipakai KEDUA gerbang (K163).
  onboarding.service.ts ✅ DB. keadaan wizard + penyemaian tenant baru (K152/K153).
  sub-invoice.service.ts ✅ DB. SubscriptionInvoice + nomor + PDF (K164).
  usage.service.ts      ✅ DB. catatPemakaian() — menelan galatnya sendiri (K183).
  export.service.ts     ✅ DB+FS. ekspor seluruh data tenant → Attachment (K186).
  data-request.service.ts ✅ DB. DataRequest (K187).

src/lib/billing/                    ← DIPERLUAS, bukan ditulis ulang.
  plans.ts              (ADA) + field `kuota` pada BillingPlan (K155). SUMBER HARGA TUNGGAL.
  midtrans.ts           (ADA) tidak berubah.
  duitku.ts             ❌/✅ BARU. KEMBARAN midtrans.ts: buatInvoice() + callbackSah()
                           (SHA256 header, MD5 callback) + duitkuConfigured() (K158/K160).
  gateway.ts            ❌ murni. daftar gerbang aktif + awalan orderId + pemilihan (K159/K162).
  access.ts             (ADA) tidak berubah.

src/services/marine/
  provider.ts           ❌ murni. antarmuka PenyediaDataMaritim + penyediaKosong (K175).
  cache.service.ts      ✅ DB. MarineDataCache + kadaluwarsa (K176).
  marine.service.ts     ✅ DB. atas-permintaan + kuota + jejak (K177).

src/app/api/
  billing/checkout/route.ts            (ADA) + pilihan gerbang (K162)
  billing/notification/route.ts        (ADA) + pencocokan nominal & gateway (K159/K161)
  billing/duitku/create/route.ts       POST — buat invoice Duitku
  billing/duitku/callback/route.ts     POST form-encoded — MD5, TERPISAH (K160)
  billing/status/route.ts              POST — "Periksa status pembayaran" (K163)
  billing/invoices/**                  GET daftar + PDF kuitansi langganan (K164)
  onboarding/route.ts                  GET keadaan, POST langkah selesai/dilewati
  portal-invitations/**                POST buat, DELETE cabut (K168)
  quota/route.ts                       GET pemakaian kuota (K156)
  tenant/export/route.ts               POST minta ekspor, GET status (K186)
  data-requests/**                     CRUD (K187)
  marine/vessel-position/route.ts      POST (kuota + cache, K177)

src/app/api/portal/                   ← SELURUHNYA withPortal(). Tak ada perkecualian.
  auth/[...nextauth]/route.ts          provider & cookie portal (K144)
  invitations/accept/route.ts          POST terima undangan + pasang kata sandi
  me/route.ts                          GET profil, PATCH nama/kata sandi
  invoices/route.ts + [id]/route.ts    GET (K167)
  voyages/route.ts + [id]/route.ts     GET (K167)
  purchase-orders/**                   GET (K171)
  work-orders/**                       GET (K171)
  submissions/route.ts                 GET, POST — satu-satunya tulis (K172)
  attachments/[id]/content/route.ts    GET — sharedToPortal + kepemilikan pihak (K170)

src/app/(portal)/                     ← layout & layar pihak luar, TERPISAH dari (app).
  portal/login · portal/undangan/[token] · portal/(app)/{beranda,tagihan,kunjungan,
  pesanan,perintah-kerja,tagihan-saya,profil}

src/components/saas/
  OnboardingCard.tsx · OnboardingWizard.tsx (K152)
  PlanPicker.tsx · GatewayPicker.tsx (K162) · QuotaMeter.tsx (K156)
  BillingPanel.tsx (ADA — diperluas: gerbang, kuitansi, periksa status)
  PortalAccessPanel.tsx (di Customer & Vendor, K168)
  ShareToPortalToggle.tsx (K170) · BrandingSettings.tsx (K180)
  ExportDataPanel.tsx (K186) · BackupStatusCard.tsx (K186)

prisma/
  check-portal-guard.mjs   ⭐ uji K150 — 11 pemeriksaan, DUA sumbu, DUA lapis
  check-billing.mjs        uji verifikator kedua gerbang + idempotensi + nominal (K160/K161)
  check-quota.mjs          uji quota.ts murni (K156)
  migrate-logo-to-attachment.mjs   ⚠️ migrasi data, --dry-run wajib (K181)
  delete-tenant.mjs        ⚠️ --dry-run wajib, TIDAK PERNAH jadi endpoint (K188)
  cleanup-fase8-test-residue.mjs
```

Skrip baru di `package.json`: `"test:portal"`, `"test:billing"`, `"test:quota"`.

> **Catatan penempatan.** `src/services/portal/` dan `src/services/saas/` meneruskan pengelompokan per-domain yang sudah ada (`master/`, `finance/`, `ai/`, `ops/`) — bukan penyimpangan dari K10, yang menolak lokasi **UI** ketiga. Yang **baru dan disengaja** adalah larangan arah impor: `services/portal/*` tidak pernah diimpor dari luar `app/api/portal/**`, dan tidak pernah mengimpor `services/tenant-db.ts`. Kalau kelak ada satu impor yang melanggar itu, seluruh §3 kehilangan artinya — jadi larangan ini diuji secara struktural bersama K149.

---

## 14. UI — di mana semuanya muncul

Bukan desain piksel; kontrak data & tempat. Konvensi yang sudah dipakai (`VoyageWorkspace.tsx`, `DisbursementBuilder.tsx`) berlaku penuh, **termasuk di portal**: `'use client'`, `useT`/`STR` dua bahasa sejak awal, `fetch` + `router.refresh()`, `Dialog` shadcn, galat dibaca dari `body.error.message`.

**Sisi internal (`(app)` — yang sudah ada):**

1. **Dashboard** — kartu **kemajuan onboarding** (K152, hilang setelah tuntas/ditutup) dan spanduk kuota `MENDEKATI`/`HABIS` (K156).
2. **Settings › Langganan** (memperluas `BillingPanel.tsx` yang ada) — paket & sisa masa aktif, **pengukur kuota**, pemilih gerbang (K162), riwayat pembayaran + gerbangnya, unduh kuitansi (K164), add-on (K165), tombol *"Periksa status pembayaran"* (K163).
3. **Settings › Merek** (baru, ADMIN) — logo, warna aksen + **pratinjau kontras** (K180), alamat portal.
4. **Settings › Portal** (baru) — daftar `PortalUser` + akses + undangan tertunda; tombol cabut. Satu tempat untuk melihat **semua** pihak luar yang bisa masuk.
5. **Settings › Sistem** (baru, ADMIN) — status backup (K186), tombol ekspor data, `DataRequest`, tombol job manual yang sudah ada dari K88.
6. **Master Data › Customer / Vendor** — tab **Portal** pada halaman detail yang sudah ada: siapa yang diundang, siapa aktif, kapan terakhir masuk. Memperluas halaman, bukan membuat yang kedua (aturan K116).
7. **Layar Invoice** — panel *"Konfirmasi pembayaran dari pelanggan"* (K169) di sebelah riwayat `InvoicePayment`.
8. **Builder FDA** — tombol *"Ambil dari tagihan vendor"* di sebelah *"Ambil dari PO/WO"* (K122) yang sudah ada. **Sengaja bentuk & tempat yang sama**: keduanya mengisi form, keduanya tak menyimpan sendiri.
9. **Voyage Workspace** — kartu posisi kapal + tombol *"Perbarui posisi"* (K177) dan spanduk usul ATA (K178) di tab Port Call.
10. **Lampiran** — saklar *"Bagikan ke portal"* per lampiran, mati untuk yang `sensitive` (K170).
11. **Bantuan** (baru) — Help Center (K189) + kontak + tombol info diagnostik (K190).

**Sisi portal (`(portal)` — seluruhnya baru):** kerangka sederhana, sengaja **tidak** memakai `AppShell` internal — sidebar & menunya berbeda, dan berbagi kerangka adalah cara termudah sebuah menu internal muncul di layar pihak luar karena satu `if` yang lupa.

- `/portal/login`, `/portal/undangan/[token]` (pasang kata sandi), `/portal/lupa` (menunggu P10).
- Pelanggan: Beranda · Tagihan · Kunjungan · Dokumen · Profil.
- Vendor: Beranda · Pesanan · Perintah Kerja · Tagihan Saya · Profil.
- Merek tenant tampil di header portal (K180); satu baris kecil *"Ditenagai Maritime Suite"* di kaki (K179).

Yang **tidak** dibangun: layar analitik lintas-tenant (K184), helpdesk (K190), peta AIS (K177), dan editor tema (K180).

---

## 15. ⚠️ Keputusan lama yang menurut fase ini **perlu ditinjau ulang**

Aturan yang sama dengan Fase 6 & 7: keputusan lama tidak diubah diam-diam. Tujuh catatan berikut adalah **usulan**; keputusannya milik Marlon. (Penomoran T bersifat lokal per fase, seperti T1–T6 Fase 7.)

| # | Menyentuh | Kenapa perlu ditinjau | Usulan |
|---|---|---|---|
| **T1** | **K9** — tenant-guard, RLS ditolak | Inti seluruh §3. Alasan pooling sudah mati bersama keputusan deploy VM; radius ledakan berubah total; dan **sumbu isolasi kedua** (antar-pihak) tak pernah tercakup tenant-guard sama sekali | **K147**: RLS **diterima untuk jalur portal** lewat peran DB kedua; jalur internal tetap tenant-guard. Ini **revisi K9**, dinyatakan terbuka |
| **T2** | **`POLA-SERVICE-LAYER.md` §8** — 54 route lama boleh santai dimigrasi | Statusnya berubah: selama route lama memakai `prisma` langsung, peran `maritime_app` **harus** ber-`BYPASSRLS`, dan RLS penuh mustahil | Naikkan dari "bertahap saat kebetulan disentuh" menjadi **satu-satunya penghalang RLS penuh**, dengan hitungan sisa route yang terlihat. Bukan pekerjaan Fase 8, tapi **konsekuensinya milik Fase 8** |
| **T3** | **`Plan` & `BILLING_PLANS`** — 250/450/600 rb berdasar jumlah modul | Blueprint §11.3 mengusulkan 2,5/6/12 jt berdasar pengguna & voyage. Dua model harga hidup berbarengan, beda 10× | **P48**. Desain K155/K156 sengaja tak peduli angka, jadi tidak memblokir — tapi **tidak boleh dijual** sebelum diselesaikan |
| **T4** | **K33 / `services/subscription.ts`** — gating langganan | Komentarnya sendiri menyebut "kebocoran monetisasi" sebagai alasan ia ada. Kuota (K156) menambah jenis kebocoran kedua di titik-titik yang sama | Panggil `pastikanKuota` **bersebelahan** dengan `pastikanLanggananAktif`, di berkas yang sama, supaya keduanya lupa atau tak sama sekali |
| **T5** | **`api/billing/notification`** — tak mencocokkan `gross_amount` | Aman selama satu gerbang (nominal ikut ditandatangani), tapi bergantung pada properti algoritma alih-alih pemeriksaan eksplisit — dan gerbang kedua membuat asumsi itu lebih sulit dipertahankan | **K161/4**: cocokkan nominal di **kedua** gerbang. Satu baris; satu-satunya perubahan pada kode billing lama yang diminta dokumen ini |
| **T6** | **`Tenant.logoUrl`** base64 di kolom teks | Sudah menyebabkan satu bug nyata (`ERR_HTTP2_PROTOCOL_ERROR`, terdokumentasi di `lib/auth.ts`); Fase 7 sudah menyediakan tempat yang benar | **K181**: pindah ke `Attachment`, `logoUrl` tetap sebagai cadangan (M6). **Kerjakan meski §9 dipangkas** |
| **T7** | **P10** (mailer) — terbuka sejak Fase 3 | Fase 8 menambah **tiga** kebutuhan surel sekaligus: undangan portal (K168), verifikasi pendaftaran (K154), peringatan langganan (K157). Ia berhenti jadi kenyamanan dan mulai jadi penghalang | Jawab P10 **sebelum 8f**. Sampai itu: tautan undangan disalin manual (K168) — cukup untuk menyatakan kode selesai, tidak cukup untuk menyatakan produk siap dijual |

---

## 16. Yang dipakai ulang, dan yang **sengaja tidak** dibangun

| Dipakai ulang apa adanya | Catatan |
|---|---|
| `forTenant()` + tenant-guard + `POLA-SERVICE-LAYER.md` §5 | seluruh jalur internal; 8 model baru wajib masuk `TENANT_MODELS` (K145) |
| `tenant-guard.ts` sebagai **cetakan** | K148 — `portal-guard.ts` bentuknya sama, arah kegagalannya dibalik |
| `owner-guard.ts` / `ENTITAS_DIDUKUNG` (K85) | daftar putih `VENDOR_INVOICE_SUBMISSION` (K172) |
| `services/http.ts` (`withTenant`, `jejakDari`, `jsonBody`) | cetakan `withPortal()` (K149) |
| `lib/billing/{plans,midtrans,access}.ts` + `api/billing/*` | K155–K163 — **diperluas**, hampir tak diubah |
| `services/subscription.ts` (K33) | K156 — kuota menumpang titik panggil yang sama |
| `Attachment` + adapter penyimpanan (K106/K107) | tagihan vendor (K172), logo (K181), ekspor (K186) — **nol** mekanisme unggah kedua |
| `Notification` + `dedupeKey` (K86/K101) | peringatan langganan, kiriman vendor, ekspor siap |
| `AuditLog` + `catatAudit()` | **wajib** untuk setiap tindakan portal (K144/K150) |
| Endpoint job ber-token + idempoten (K88/K102) | sapuan langganan, cache AIS, status backup |
| `formatDocNumber`/`monthWindow` (K32) | nomor kuitansi langganan; jendela kuota bulanan |
| Mesin PDF | kuitansi langganan (K164) — pola K48 |
| `KnowledgeArticle` (K140) | K189 — Help Center menumpang, bukan CMS kedua |
| `disbursement-status.ts` sebagai cetakan mesin status | K172 — status kiriman vendor |
| `dataOrigin` / provenance (K55–K59) | K153 — penyemaian tenant baru dicap `SEED` |
| `exceljs` (dependency yang sudah ada) | K186 — ekspor XLSX |
| Pola uji `.mjs` + `cleanup-*-test-residue.mjs` | seluruh increment |
| Konvensi UI dua bahasa + `router.refresh()` | seluruh layar, **termasuk portal** |

| Sengaja **tidak** diadakan | Alasan |
|---|---|
| `CUSTOMER`/`VENDOR` sebagai nilai enum `Role` | K143 — arah kegagalannya salah |
| Satu tabel `User` untuk internal & portal | K143 |
| Satu handler callback untuk dua gerbang | K160 — memilih algoritma dari data yang belum diautentikasi |
| Ruang nama `orderId` bersama antar-gerbang | K159 |
| Penagihan berulang otomatis / kartu tersimpan / prorata | §1.5, K165 — perpanjangan tetap tindakan manusia |
| Tabel `Subscription` + `SubscriptionItem` penuh | K165 — `addonsEnabled String[]` cukup |
| Pendaftaran mandiri pengguna portal | K168 — hanya undangan |
| Pihak luar yang bisa mengubah status/uang/master data | K169/K173 — pihak luar melapor, orang dalam mencatat |
| Peran di dalam portal | §6 — kerumitan yang belum diminta siapa pun |
| Membuka Attachment Center ke portal | K170 — hanya yang sengaja dibagikan, tak pernah yang `sensitive` |
| Polling AIS berkelanjutan / peta langsung | K177 — biaya tak terlihat |
| AIS/cuaca menulis ETA/ATA sendiri | K178 — sejalan K52 & K130 |
| Cache data maritim lintas-tenant | K176 — invarian yang punya perkecualian bukan invarian |
| Tema/CSS kustom per tenant, templat surel per tenant | K180 — permukaan dukungan permanen |
| Merek produk yang bisa dihapus tenant | K179 — **P56** |
| Alat analitik pihak ketiga; laporan produktivitas per orang | K183/K184 — berisiko sosial & hukum |
| Layar analitik lintas-tenant di dalam aplikasi | K184 — jalur yang melewati isolasi §3, sekali ada akan dipakai lagi |
| Sistem tiket / live chat | K190 — dukungan adalah kanal |
| Penghapusan data otomatis (tenant, subjek data, berkas) | K187/K188, K110 — tak ada jalur kode yang menghapus tanpa manusia |
| Rate limit, Sentry, security header, CI/CD sebagai keputusan K | K185 — itu **checklist go-live**, butuh eksekusi bukan desain. Tetap syarat DoD |
| Menyentuh 54 route lama | `POLA-SERVICE-LAYER.md` §8 — tapi lihat **T2** |

**Penambahan skema yang diminta Fase 8:** 9 model baru (8 bertenant + 1 anak), **nol enum baru** (semua status memakai `String` + konstanta di modul murni — alasan K55), dan **11 kolom nullable** pada tabel lama (`Payment` ×3, `Tenant` ×6, `Attachment` ×3, `KnowledgeArticle` ×1 — dengan bawaan, sehingga aditif) plus satu unique index. Tidak ada kolom lama yang berubah tipe, berubah nullability, atau dihapus. **Satu perubahan non-skema pada database**: peran `maritime_portal` + kebijakan RLS (K147), dikirim sebagai migration SQL.

---

## 17. Rencana bertahap (8a → 8l)

Aturan sama dengan Fase 3, 6, & 7: setiap increment **berdiri sendiri**, punya cara verifikasi konkret, dan **tidak boleh** dimulai sebelum yang sebelumnya lulus. Di setiap batas: `npx tsc --noEmit` **0 error**, `npm run test:tenant` **semua lulus**, `test:calc` / `test:ai` / `test:ops` / `test:owner` tanpa regresi.

**Satu aturan tambahan yang khusus Fase 8:** sejak 8a ada, `npm run test:portal` ikut wajib lulus di **setiap** batas increment berikutnya — bukan hanya di increment portal. Pagar isolasi bisa rusak karena perubahan di tempat yang tampak tak berhubungan.

**Model (ROADMAP §6b, Fase 8 = Opus ~25% / Sonnet ~75%):**

| Increment | Model | Alasan |
|---|---|---|
| **8a** | 🔴 **Opus** | Model identitas pihak luar + **dua** pagar isolasi + peran DB + kebijakan RLS. Menyentuh **akses lintas-tenant** = sinyal wajib-Opus §6b nomor 3, dalam bentuknya yang paling berat sejauh ini. Sebanding dengan `owner-guard.ts`/`ownership.service.ts` yang ditandai Opus di Fase 7 — tapi permukaannya lebih luas, karena yang di seberang pagar bukan lagi rekan sekantor |
| 8b | 🟢 Sonnet | Wizard + penyemaian: UI & pemanggilan skrip yang sudah ada |
| **8c** | 🔴 **Opus** untuk `quota.ts`+`commercial-policy.ts` / 🟢 Sonnet UI | Menyentuh **uang** (gating berbayar): sinyal wajib-Opus §6b nomor 3. Mesin kuota yang salah menolak pekerjaan pelanggan berbayar |
| **8d** | 🔴 **Opus** | Verifikasi tanda tangan, idempotensi, dua algoritma, aktivasi langganan. **Uang + keamanan.** Kesalahan di sini berarti langganan gratis atau pembayaran hilang |
| 8e | 🟢 Sonnet | Kuitansi + halaman billing: PDF & CRUD meniru pola yang ada |
| 8f | 🟢 Sonnet **dengan syarat 8a lulus** | Proyeksi & layar. Keamanannya **sudah** dibawa 8a; yang tersisa daftar putih kolom — pekerjaan teliti, bukan ambigu. ⚠️ Kalau muncul godaan menambah model ke `MODEL_PORTAL`, **naik ke Opus** (aturan §6b nomor 3) |
| 8g | 🟢 Sonnet | Meniru 8f; satu jalur tulis yang polanya sudah ditetapkan K172 |
| 8h | 🟢 Sonnet ⚠️ **terhalang P55** | Adapter + cache + kuota. Tak ada yang ambigu **sesudah** penyedia dipilih |
| 8i | 🟢 Sonnet / 🔴 **Opus untuk `migrate-logo-to-attachment.mjs`** | Branding = UI. Migrasi logo = **migrasi data pada tabel yang dipakai** = sinyal wajib-Opus §6b nomor 3 |
| 8j | 🟢 Sonnet | Satu tabel + satu pemanggilan |
| **8k** | 🔴 **Opus** | Ekspor seluruh data + penghapusan tenant. **Penghapusan data lintas-tabel** dengan cascade — kelas kesalahan yang tak bisa ditarik kembali |
| 8l | 🟢 Sonnet | Konten + satu kolom |

Hitungan kasar: 8a + 8d + 8k + separuh 8c + sebagian 8i ≈ **4 dari 12 increment ≈ 33%** bobot Opus — di atas 25% yang diperkirakan roadmap. Alasannya jujur: roadmap menandai Fase 8 dengan *"Opus: portal & isolasi akses eksternal"* dan memperkirakan satu bidang; ternyata ada **empat** bidang yang menyentuh salah satu dari tiga sinyal wajib-Opus (isolasi eksternal, uang/gating, verifikasi pembayaran, penghapusan data). Naikkan ke Opus di tengah jalan bila salah satu sinyal §6b muncul.

**Urutan pemangkasan bila waktu habis:** 8l (help center) → 8h (data maritim, bisa dibatalkan seluruhnya) → 8j (analitik) → 8i (white-label, **kecuali K181 yang tetap dikerjakan**) → 8g (vendor portal). **8a, 8c, 8d, 8k tidak bisa dipangkas** tanpa membatalkan tujuan fase ini: tiga yang pertama karena tanpanya produk tak bisa dijual, yang terakhir karena tanpanya produk tak boleh dijual.

---

### 8a — Identitas portal + **dua lapis isolasi** (skema, guard, peran DB, RLS) 🔴 Opus

**Isi:** migration aditif seluruh 9 model + 11 kolom (prosedur K7: backup → baseline → migrate); 8 nama masuk `TENANT_MODELS`; migration SQL peran `maritime_portal` + kebijakan RLS (K147); `portal-guard.ts` + `portal-db.ts` + `portal-client.ts` (K148); `PortalContext` + `withPortal()` (K149); provider NextAuth portal + cookie terpisah (K144); `invitation.service.ts` + `access.service.ts` (K166/K168). **Belum ada layar portal** — hanya login yang bisa berhasil dan satu endpoint uji.

> Migration seluruh 9 model dikerjakan **sekaligus di 8a**, bukan dicicil — alasan yang sama dengan 7a: prosedur K7 berbiaya tetap dan berisiko tiap kali dijalankan.

**Cara memverifikasi (DB & API nyata, bukan hanya `tsc`):**
1. Migration: hitung baris **semua** tabel lama identik sebelum & sesudah; ketiga kolom `Payment` baru `nullable: YES`; `SELECT count(*) FROM "Payment" WHERE gateway IS NOT NULL` → **0**; kedua unique index (`orderId` dan `gateway,orderId`) terpasang.
2. `npm run test:tenant` **gagal dulu** sebelum 8 model didaftarkan, dengan **menyebut nama modelnya**; sesudah didaftarkan → semua lulus. Jalankan sengaja dalam urutan ini — itu membuktikan pagar Fase 0 masih bekerja.
3. **Peran DB:** `psql -U maritime_portal` → `SELECT count(*) FROM "Invoice"` **tanpa** `SET app.tenant_id` → **0 baris** (bukan galat izin, bukan seluruh tabel). Lalu `SET app.tenant_id` + `app.party_id` yang benar → jumlahnya **cocok dengan hitung tangan** untuk pelanggan itu.
4. **Peran DB tak berdaya lebih:** sebagai `maritime_portal`, jalankan `INSERT INTO "Invoice" …`, `DROP TABLE "Invoice"`, `SET ROLE maritime_app`, dan `SELECT * FROM "User"` → **keempatnya ditolak database**.
5. `node prisma/check-portal-guard.mjs` — 11 pemeriksaan K150 lulus, **termasuk butir 5 & 6** (masing-masing lapis dibuktikan berdiri sendiri dengan mematikan yang lain sementara). Tanpa kedua butir itu increment ini **tidak boleh** dinyatakan selesai.
6. **Sumbu 2 (yang paling mudah terlewat):** buat dua `Customer` pada **tenant yang sama**, masing-masing satu invoice. `pctx` pelanggan X membaca id invoice pelanggan Y → **NOT_FOUND**. Ulangi lewat SQL langsung sebagai `maritime_portal` → **0 baris**.
7. **Fail-closed:** `forPortal(pctx).vessel.findMany()` → **melempar** (model tak terdaftar); `forPortal(pctx).invoice.updateMany()` → **melempar**.
8. **Sesi tak tertukar:** cookie portal → `/api/voyages` = **401**; cookie internal → `/api/portal/invoices` = **401**. Periksa dengan `curl`, bukan lewat browser yang mungkin menyimpan dua-duanya.
9. Undangan: token muncul **sekali** di respons dan **tidak** tersimpan apa adanya (`SELECT tokenHash` ≠ token); token kedaluwarsa → **400**; token dipakai dua kali → **409**; menerima undangan → satu `PortalUser` + satu `PortalAccess` lahir.
10. Cabut akses → permintaan **berikutnya** dari sesi yang sama = **401** (bukti `PortalAccess` diperiksa tiap permintaan, K168), tanpa menunggu token kedaluwarsa.
11. Setiap tindakan di atas menulis `AuditLog` ber-`userId` berawalan `portal:` — hitung barisnya.

---

### 8b — Onboarding wizard + penyemaian tenant baru 🟢 Sonnet

**Isi:** `Tenant.onboardingState`; `onboarding.service.ts`; layar `/onboarding` + `OnboardingCard.tsx` di Dashboard; penyemaian memakai `seed-v2.mjs` lewat `systemContext` (K153).

**Cara memverifikasi:**
1. Daftar tenant baru lewat `/register` → langsung sesudahnya: **3 mata uang, 3 pelabuhan, 21 jasa** ada; `Tenant.goLiveAt` **null**; setiap baris hasil semai ber-`dataOrigin = 'SEED'` atau bernama berawalan `CONTOH — ` (periksa di DB, bukan di layar).
2. Buat voyage pada tenant baru itu → `dataOrigin = 'UJI'` (bukti K56 masih bekerja lewat `goLiveAt` null).
3. Lewati semua langkah → aplikasi **tetap bisa dipakai penuh**; kartu hilang; `onboardingState` mencatat "dilewati", bukan "selesai".
4. Selesaikan satu langkah, muat ulang → kemajuan bertahan (tersimpan di server, bukan di `localStorage`).
5. `OPERATOR` membuka `/onboarding` → **403** pada langkah yang mengubah master data; kartu ringkasannya tetap terlihat (K152 tabel peran).
6. Jalankan penyemaian **dua kali** pada tenant yang sama → tidak ada duplikat (idempoten lewat unik yang sudah ada), dan laporannya menyebut *"sudah ada"*.

---

### 8c — Paket, kuota & gating 🔴 Opus (mesin) / 🟢 Sonnet (UI)

**Isi:** `commercial-policy.ts` + `quota.ts` (murni) + `quota.service.ts`; field `kuota` pada `BillingPlan`; `pastikanKuota` dipanggil bersebelahan dengan `pastikanLanggananAktif`; `QuotaMeter.tsx`; peringatan `MENDEKATI`; `check-quota.mjs`.

**Cara memverifikasi:**
1. Bawaan (`batas = null`) → `TIDAK_DIBATASI`, **tak ada** yang berubah di layar mana pun, dan tak ada query tambahan. Ini bukti K146 bekerja: fitur menyala tanpa mengubah perilaku hari ini.
2. Setel `voyagePerBulan = 3` untuk satu paket → voyage ke-4 di bulan berjalan → **403** dengan pesan menyebut angka **3** dan tautan naik paket. Voyage bulan lalu **tidak** ikut terhitung (bukti `monthWindow`).
3. **Data lama tetap terbuka saat `HABIS`:** ketiga voyage tetap terbaca, teredit, tercetak, tertagih. **Hanya pembuatan baru** yang ditolak (K156/1).
4. Pada 80% → satu `Notification` ke ADMIN; jalankan job lagi di bulan yang sama → **tidak bertambah** (idempoten `dedupeKey`, K101).
5. Kuota pengguna: batas 2, coba buat `User` ketiga → 403. **Nonaktifkan** satu pengguna (`isActive = false`, Fase 5g) → boleh lagi (bukti yang dihitung adalah pengguna **aktif**).
6. Langganan habis **dan** kuota masih longgar → tetap ditolak `pastikanLanggananAktif` (bukti K33 tidak dilemahkan, dan kedua pagar berdiri sendiri).
7. `node prisma/check-quota.mjs` — batas nol, batas null, tepat-di-batas, lewat-batas, dan negatif (data rusak) semuanya ditangani tanpa lemparan.

---

### 8d — Gerbang kedua: Duitku + `gateway` pada `Payment` + kedua callback 🔴 Opus ⚠️ terhalang P50

**Isi:** `lib/billing/duitku.ts` (kembaran `midtrans.ts`); `gateway.ts` (awalan `orderId`, daftar gerbang aktif); route `billing/duitku/{create,callback}`; `subscription-calc.ts` (dipakai **kedua** handler); pencocokan nominal + `gateway` pada **kedua** handler (K159/K161, termasuk perbaikan jalur Midtrans); `GatewayPicker.tsx`; `billing/status`; `check-billing.mjs`.

⚠️ **Jangan mulai sebelum P50 dijawab** — tanpa kredensial Duitku (sandbox pun cukup), separuh increment ini tak bisa diverifikasi dengan cara yang berarti, dan verifikasi tanda tangan adalah **seluruh** isinya.

**Cara memverifikasi:**
1. Checkout Duitku → `Payment` lahir dengan `gateway = 'DUITKU'`, `orderId` berawalan **`SUB-DK-`**; `paymentUrl` terbuka di sandbox. Checkout Midtrans → `SUB-MT-`, perilaku lama **tak berubah sedikit pun**.
2. **Tanda tangan Duitku:** hitung `MD5(merchantCode + amount + merchantOrderId + apiKey)` di luar aplikasi (satu baris `node -e`), kirim callback form-encoded → **200** dan langganan aktif. Ubah **satu karakter** tanda tangan → **403** dan **tidak ada** yang berubah di DB (periksa `Payment.status` & `Tenant.subscriptionEndsAt` sebelum-sesudah).
3. **Tanda tangan Midtrans:** ulangi dengan SHA512 → jalur lama masih benar (bukti tak ada regresi).
4. **Tabrakan ruang nama — pemeriksaan inti increment ini:** kirim callback **Duitku yang sah** dengan `merchantOrderId` milik pesanan **Midtrans** yang ada → **404/diabaikan**, dan pesanan Midtrans itu **tidak berubah**. Ulangi terbalik. Ini yang dijaga K159, dan ia harus dibuktikan, bukan diandaikan.
5. **`merchantCode` asing:** callback bertanda tangan sah tapi `merchantCode` bukan milik kita → **403** (K160/4).
6. **Idempotensi & pemutaran ulang (K161/3):** kirim callback lunas Duitku yang **sama persis** 5×. `Tenant.subscriptionEndsAt` bertambah **tepat sekali** 30 hari. Ini pemeriksaan keamanan, bukan kerapian — tanda tangan Duitku tak punya nonce.
7. **Nominal (K161/4):** callback bertanda tangan sah dengan `amount` yang **tidak cocok** dengan `Payment.amount` → **400**, tak ada aktivasi. Lakukan di **kedua** gerbang.
8. **`resultCode` bukan sumber kebenaran:** callback dengan tanda tangan sah tapi `resultCode = '01'` → **200**, tanpa aktivasi.
9. **Perpanjangan:** langganan bersisa 10 hari, bayar lagi → sisa jadi **40 hari**, bukan 30. Lakukan lewat **kedua** gerbang dan bandingkan — angkanya harus identik (bukti `subscription-calc.ts` dipakai berdua, bukan disalin).
10. **Gerbang tak terkonfigurasi:** kosongkan env Duitku → tombolnya **hilang** dari layar dan endpoint-nya **503**. Ulangi untuk Midtrans.
11. **Diingat:** bayar lewat Duitku → checkout berikutnya bawaannya Duitku (`Tenant.preferredGateway`). Tombol "Coba gerbang lain" membuat `Payment` **baru** dengan `orderId` baru; baris lama tetap `PENDING` dan **tidak** ikut aktif saat yang baru lunas.
12. **Callback hilang:** matikan callback, bayar di sandbox, lalu tekan "Periksa status pembayaran" → `Payment` & langganan diperbarui lewat **fungsi yang sama** dengan callback (buktikan dengan membaca kode, bukan hanya hasilnya).

---

### 8e — Kuitansi langganan + halaman Billing 🟢 Sonnet

**Isi:** `SubscriptionInvoice` + `SubscriptionInvoiceItem` + `sub-invoice.service.ts` + PDF; perluasan `BillingPanel.tsx`; add-on (K165).

**Cara memverifikasi:**
1. Pembayaran lunas → **tepat satu** `SubscriptionInvoice` lahir, `INV-SUB/2026/08/0001`; bayar lagi → `0002` (pola K32).
2. Callback diulang (8d butir 6) → **tidak** lahir kuitansi kedua (lahirnya di dalam transaksi yang sama dengan aktivasi).
3. PDF diunduh & dibuka di pembaca PDF sungguhan: kop **Maritime Suite**, bukan `Tenant.logoUrl` (bukti K164). Bandingkan berdampingan dengan Invoice keagenan — keduanya **jelas berbeda kop**.
4. `FINANCE` mengunduh → boleh; `FINANCE` menekan checkout → **403**; `OPERATOR` membuka halaman Billing → **403** (K155 tabel peran).
5. Beli add-on → masuk sebagai **baris pada pesanan yang sama**; `Tenant.addonsEnabled` bertambah saat lunas; habis bersamaan dengan langganan.
6. **Tak ada satu baris pun** muncul di `Invoice`/`InvoicePayment`/laporan Outstanding tenant (bukti §1.3 — hitung sebelum & sesudah).

---

### 8f — Customer Portal 🟢 Sonnet ⚠️ syarat: 8a lulus · terkait P52, P10

**Isi:** `customer-view.ts` (proyeksi); route `/api/portal/{invoices,voyages,attachments}`; layar `(portal)`; `PortalAccessPanel.tsx` di halaman Customer; `sharedToPortal` + `ShareToPortalToggle.tsx` (K170); konfirmasi pembayaran (K169).

**Cara memverifikasi:**
1. Undang pelanggan → terima undangan → login → hanya **tagihannya sendiri** yang tampil. Cocokkan jumlah barisnya dengan `SELECT count(*) FROM "Invoice" WHERE customerId = …` di DB.
2. **Sumbu 2 lewat HTTP (bukan hanya lewat service):** ambil id invoice pelanggan lain **pada tenant yang sama** dari DB, panggil `GET /api/portal/invoices/<id>` → **404**.
3. **Kolom:** periksa **JSON mentah** respons — tidak ada `vendorId`, `vendorInvoiceNo`, `notes`, harga beli, atau field apa pun yang tak disebut `InvoicePortal` (K167). Periksa payload, bukan tampilan.
4. Lampiran: unggah dua berkas ke sebuah Invoice, bagikan **satu** → portal melihat satu. Unduh yang dibagikan → byte identik (`sha256` sama). Unduh id yang **tidak** dibagikan → **404**.
5. Lampiran `sensitive = true` → tombol "Bagikan ke portal" **dinonaktifkan**, dan memanggil API-nya langsung → **400** menyebut alasannya (K170/2).
6. **Konfirmasi pembayaran:** pelanggan mengirim konfirmasi → satu `Notification` ke FINANCE + satu `Comment` + satu `Attachment`; **`Invoice.status` & `amountPaid` tidak berubah sama sekali** (bukti K169). Periksa sebelum-sesudah.
7. Cabut akses → pelanggan itu **401** pada permintaan berikutnya; pelanggan lain tetap bisa masuk.
8. `npm run test:portal` tetap lulus penuh sesudah increment ini.

---

### 8g — Vendor Portal + unggah tagihan 🟢 Sonnet ⚠️ terhalang P53, P54

**Isi:** `vendor-view.ts`; route `/api/portal/{purchase-orders,work-orders,submissions}`; layar vendor; `VendorInvoiceSubmission` + mesin status + batas laju; tombol *"Ambil dari tagihan vendor"* di builder FDA.

**Cara memverifikasi:**
1. Vendor melihat **hanya** PO/WO ber-`vendorId` miliknya. PO ber-status `DRAFT`/`PENDING_APPROVAL` **tidak** muncul; setelah transisi ke `SENT` → muncul (bukti K171).
2. **JSON mentah** tidak memuat harga jual, `VendorRating`, skor vendor, atau vendor lain.
3. Unggah tagihan 1 MB PDF → `VendorInvoiceSubmission` `SUBMITTED` + satu `Attachment` ber-`entityType='VENDOR_INVOICE_SUBMISSION'`, `sha256` cocok dengan `sha256sum` berkas. `entityType` itu terdaftar di `ENTITAS_DIDUKUNG` — hapus sementara dari daftar → unggahan **ditolak** (bukti K85 masih menjaga).
4. Unggah berkas **sama** dua kali → diberi tahu "sudah pernah dikirim", **tidak ditolak** (K172/5).
5. Batas laju terlampaui → **429** dengan pesan jelas; keesokan harinya boleh lagi.
6. **K172/1 — pemeriksaan inti increment ini:** di builder FDA, *"Ambil dari tagihan vendor"* → pilih → **form terisi tapi belum tersimpan**; batalkan → **tidak ada** `DisbursementItem` lahir (hitung sebelum-sesudah). Simpan → baris lahir **dan** `linkedDisbursementItemId` terisi.
7. Selisih nominal: kiriman Rp 12 jt vs `WorkOrder.agreedAmount` Rp 10 jt → layar menampilkan **kedua angka + selisihnya**, dan tidak menolak apa pun (K172/3).
8. **K173:** vendor menekan "Pekerjaan sudah kami selesaikan" → satu `Comment` + satu `Notification`; `WorkOrder.status` & `actualEnd` **tidak berubah**.
9. **Lintas-tenant:** vendor bernama sama di tenant B → vendor tenant A tetap tidak melihat satu pun barisnya.

---

### 8h — Data maritim (AIS/cuaca/kongesti) 🟢 Sonnet ⚠️ **terhalang P55**

**Isi:** `provider.ts` + `penyediaKosong`; `MarineDataCache` + `cache.service.ts`; `marine.service.ts` (kuota + cache); kartu posisi di Voyage Workspace; spanduk usul ATA (K178); satu penyegaran terjadwal per hari lewat job (K177).

⚠️ **Jangan mulai sebelum P55 dijawab.** Antarmuka (K175) boleh ditulis kapan saja — ia tak bergantung penyedia — tapi **tak satu pun** verifikasi di bawah bisa dijalankan tanpa penyedia nyata, dan increment yang tak bisa diverifikasi tidak boleh dinyatakan selesai. Kalau jawabannya *"harganya tidak sepadan"*, **coret increment ini seluruhnya** — itu keputusan yang sah, dan `penyediaKosong` sudah membuat aplikasi berperilaku benar tanpanya.

**Cara memverifikasi:**
1. Tanpa penyedia (bawaan): kartu menulis *"belum aktif"*, **tidak** ada panggilan jaringan (periksa log), tidak ada galat.
2. Dengan penyedia: "Perbarui posisi" → satu baris `MarineDataCache`; tekan lagi dalam masa berlaku → **tidak ada** panggilan kedua (hitung dari log penyedia, bukan dari layar).
3. Layar menampilkan **dua** waktu berbeda: waktu posisi dan waktu pengambilan (K176/2).
4. Kuota habis → tombol menolak dengan pesan menyebut angkanya; cache yang sudah ada **tetap terbaca**.
5. **K178:** posisi menunjukkan kapal di dermaga → spanduk usul ATA muncul; tekan → **form terisi, belum tersimpan**; `Voyage.ata` **tidak** berubah sampai manusia menyimpan. Abaikan spanduk → tidak terjadi apa-apa, selamanya.
6. **Cache per tenant:** dua tenant memantau IMO yang sama → **dua** baris cache, dan tenant A tidak pernah membaca baris tenant B (`test:tenant` mencakup model ini).
7. Penyedia mati/timeout → kartu menulis *"tidak bisa dihubungi"*, tidak ada lemparan, halaman voyage tetap terbuka penuh.

---

### 8i — White-label + migrasi logo 🟢 Sonnet / 🔴 Opus untuk skrip migrasi ⚠️ terhalang P56 (sebagian), P57 (domain)

**Isi:** kolom branding pada `Tenant`; `BrandingSettings.tsx` + pemeriksa kontras; variabel CSS satu warna; header portal ber-merek tenant; `Tenant.logoAttachmentId` + `migrate-logo-to-attachment.mjs` (K181).

**Cara memverifikasi:**
1. `--dry-run` skrip migrasi: melaporkan jumlah tenant ber-`logoUrl`, total byte, **tanpa** menulis apa pun. Hitung baris `Attachment` sebelum-sesudah dry-run → **identik**.
2. Jalankan sungguhan → `logoAttachmentId` terisi; berkas ada di penyimpanan; `sha256` cocok dengan hasil dekode base64 aslinya; **`logoUrl` masih utuh** (bukti M6).
3. Jalankan **dua kali** → tidak ada `Attachment` ganda (idempoten).
4. **Kop PDF tidak berubah sedikit pun** — bandingkan PDF sebelum & sesudah migrasi berdampingan. Ini pemeriksaan terpenting: migrasi yang mengubah dokumen resmi adalah kegagalan meski datanya benar.
   > **⚠️ Koreksi saat implementasi (8i):** "bandingkan" di sini TIDAK BISA berarti membandingkan byte mentah PDF. `@react-pdf/renderer` mengacak tag subset font (`/KXLVNJ+Spectral-Bold` → `/HSKCNK+…`) **dan** penomoran objek PDF pada **setiap** render — dua render dari data yang sama persis terbukti berbeda 7056 byte. Instrumen yang benar (dipakai `prisma/check-logo-migration.mjs` lewat `prisma/pdf-fingerprint.py`): bandingkan **piksel tiap halaman** (render 100 DPI), **teks terekstrak**, dan **byte gambar tertanam** (logo kop = satu-satunya gambar di dokumen ini). Ketiganya terbukti stabil lintas render, jadi perbedaan padanya adalah perubahan dokumen yang sesungguhnya.
5. Tenant tanpa `logoAttachmentId` (belum dimigrasi) tetap memakai `logoUrl` — periksa dengan satu tenant yang sengaja dilewati.
   > **Tambahan yang ditemukan saat implementasi:** `PATCH /api/tenant` menerima logo ber-mime `svg+xml`, tetapi daftar putih K109 (`TIPE_DITERIMA`) **sengaja** menolak SVG (membawa script). Jadi ada tenant yang logonya sah sebagai `logoUrl` tapi **tidak boleh** menjadi `Attachment`. Skrip melewatinya dengan sebab yang disebutkan — **bukan** melebarkan daftar putih demi laporan 100% — dan tenant itu tetap bekerja lewat cadangan `logoUrl`. Butir 5 karena itu juga menguji jalur ini.
6. Warna aksen kontras rendah → sistem memakai varian yang terbaca; teks tombol tetap terbaca di kedua tema.
   > **⚠️ Koreksi saat implementasi (8i):** contoh `#FFFF00` di naskah awal **keliru** — hitam di atas kuning cerah rasionya ~19,6:1, salah satu kombinasi paling terbaca yang ada (rambu jalan). Lebih jauh, dibuktikan numerik: dengan dua kandidat teks putih & hitam murni, rasio **terbaik** dari keduanya tak pernah jatuh di bawah **~4,58:1** untuk warna latar apa pun (titik terburuk `#757575`) — selalu di atas ambang AA 4,5:1. Artinya jalur "sistem memperingatkan" **mustahil terpicu lewat hex apa pun**; itu bukan cacat melainkan bukti bahwa "pilih otomatis yang terbaik" sendirian sudah memenuhi K180. Cabang peringatan tetap ditulis sebagai jaring pengaman bila kandidat teks kelak bukan putih/hitam murni lagi. Uji yang benar karena itu berbunyi "bahkan titik terburuk pun tetap aman", bukan "warna gagal memicu peringatan".
7. Halaman masuk portal menampilkan logo & nama tenant; kuitansi langganan **tetap** ber-kop Maritime Suite (bukti K179 lapis 1 vs 3).
8. Slug portal dua tenant tidak bisa bertabrakan (unique) dan slug yang tak ada → 404 rapi, bukan galat server.

---

### 8j — Product Analytics 🟢 Sonnet

**Isi:** `UsageEvent` + `usage.service.ts`; ~10 titik pencatatan di service; ringkasan pemakaian di Settings; satu skrip `.mjs` lintas-tenant untuk Marlon (K184).

**Cara memverifikasi:**
1. Buat voyage → satu `UsageEvent` `VOYAGE_CREATED` ber-`tenantId` benar. Batalkan pembuatan → **tidak ada** baris.
2. **Menelan galatnya sendiri:** buat `usage.service` melempar dengan sengaja (ubah sementara) → pembuatan voyage **tetap berhasil**. Kembalikan. Ini pemeriksaan inti increment ini.
3. `meta` tidak memuat nama pihak, isi dokumen, atau nominal — periksa 20 baris terakhir dengan mata.
4. Login portal tercatat ber-`userId = null` dan tetap ber-`tenantId` benar.
5. Ringkasan tenant hanya menampilkan data tenant itu (`test:tenant` mencakup model ini).
6. Tidak ada satu pun layar di aplikasi yang menampilkan data lintas-tenant — cari `UsageEvent` di seluruh `src/app/` dan buktikan hanya lewat skrip (K184).

---

### 8k — Kepatuhan: ekspor, hak subjek data, backup terlihat, offboarding 🔴 Opus

**Isi:** `export.service.ts` (XLSX+JSON+lampiran → `Attachment`); `DataRequest` + service + layar; `?job=backup-status` + `BackupStatusCard.tsx`; `delete-tenant.mjs` (K188).

**Cara memverifikasi:**
1. Minta ekspor → `Notification` saat siap; berkas hasil terbuka di Excel; **jumlah baris per sheet cocok** dengan `count()` di DB untuk tenant itu. Periksa minimal 5 tabel.
2. Ekspor **tidak** memuat satu baris pun milik tenant lain — sisipkan data pancingan di tenant B, ekspor tenant A, cari namanya di berkas hasil.
3. Ekspor kedua saat yang pertama berjalan → ditolak dengan pesan jelas (satu ekspor aktif per tenant).
4. Berkas hasil ber-`expiresAt`; `DIREKTUR` mencoba mengunduh → **403** (K186 tabel peran).
5. `DataRequest` jenis `PENGHAPUSAN` → sistem menampilkan **di mana saja** data itu muncul, dan **tidak menghapus apa pun**; status berpindah hanya karena manusia (K187/1).
6. Status backup > 48 jam → kartu merah. Setel waktu mundur untuk mengujinya.
7. **`delete-tenant.mjs --dry-run`** → melaporkan jumlah baris per tabel yang akan terhapus, **tanpa** menulis. Hitung baris seluruh DB sebelum-sesudah dry-run → identik.
8. Jalankan sungguhan pada tenant **uji** → baris tenant itu hilang, tenant lain **tak berubah satu baris pun** (hitung semua tabel), dan **berkas lampiran fisik masih ada di disk** (bukti K110 masih berlaku).
9. Tidak ada endpoint HTTP mana pun yang bisa menghapus tenant — cari `deleteTenant`/`tenant.delete` di seluruh `src/app/api/` dan buktikan nihil.

---

### 8l — Help Center & bantuan 🟢 Sonnet ⚠️ terkait P60

**Isi:** kolom `KnowledgeArticle.lingkup`; `bacaArtikelProduk()` dengan komentar penyimpangan; halaman `/bantuan` + 6 artikel awal; tombol info diagnostik.

**Cara memverifikasi:**
1. Artikel `lingkup='PRODUK'` & `PUBLISHED` terbaca dari **tenant mana pun**; artikel `DRAFT` **tidak**, dari tenant mana pun.
2. Artikel `lingkup='TENANT'` milik tenant B **tidak pernah** terbaca tenant A (bukti K140 tidak dilemahkan) — ini pemeriksaan inti, karena §12 sengaja membuat satu penyimpangan.
3. `bacaArtikelProduk()` adalah **satu-satunya** fungsi yang membaca lintas-tenant; cari pemanggil `prisma.knowledgeArticle` di luar itu → nihil. Komentar penyimpangan ada di berkasnya.
4. `forPortal(pctx).knowledgeArticle` → **melempar** (tak terdaftar di `MODEL_PORTAL`, K189).
5. Tombol diagnostik menyalin versi/tenantId/peran/halaman — dan **tidak** menyalin data bisnis apa pun. Tempel ke editor teks dan baca isinya.
6. Halaman bantuan menampilkan **jam layanan**, tidak menampilkan janji waktu tanggap (K190).

---

## 18. Definition of Done Fase 8

Sebuah perusahaan keagenan **selain Tribuana** bisa menjalani seluruh siklus tanpa Marlon menyentuh database:

- **mendaftar sendiri**, dituntun sampai punya mata uang, pelabuhan, katalog jasa contoh berlabel, dan kapal pertama — lalu membuat voyage pertamanya di hari yang sama;
- **membayar** lewat salah satu dari **dua** gerbang, mencoba yang lain saat yang satu gagal, dan menerima **kuitansi bernomor** yang tidak pernah tercampur dengan tagihan keagenannya sendiri;
- **diingatkan sebelum langganan habis**, dan saat habis menjadi read-only — bukan gelap, bukan hilang;
- **ditahan dengan sopan** saat kuotanya penuh, dengan angka yang disebutkan dan jalan keluar yang ditawarkan — sementara semua data lamanya tetap terbuka;
- **mengundang pelanggannya** melihat tagihan & kunjungannya sendiri, dan **mengundang vendornya** melihat PO/WO yang ditujukan kepadanya serta mengirim tagihan yang masuk sebagai **usulan**, bukan sebagai angka;
- **menempelkan mereknya** pada dokumen (yang sudah berlaku sejak Fase 0) dan pada portal yang dilihat mitranya;
- **menarik seluruh datanya keluar** kapan saja, dan tahu backup terakhir kapan;

Dan yang paling menentukan untuk fase ini, dua hal yang harus dibuktikan, bukan diyakini:

1. **Bug satu endpoint portal tidak cukup untuk membocorkan apa pun.** `test:portal` membuktikan **dua sumbu** (antar-tenant **dan** antar-pihak di dalam satu tenant) tertutup oleh **dua lapis** yang masing-masing terbukti berdiri sendiri saat yang lain sengaja dimatikan (K150 butir 5 & 6).
2. **Tak satu pun tindakan pihak luar mengubah angka uang, status dokumen, atau data induk.** Setiap tulisan dari luar berhenti di kotak masuk manusia (K169, K172, K173, K178).

`tsc` 0 error · `test:tenant` semua lulus (jumlah bertambah, K145) · `test:calc`, `test:ai`, `test:ops`, `test:owner`, `test:ai-guard` tanpa regresi · `test:portal`, `test:billing`, `test:quota` lulus. Verifikasi **8a, 8c, 8d, 8f, 8g, 8k** dilakukan pada **API/DB nyata** (dan 8a sebagian lewat `psql` langsung — RLS tak bisa dibuktikan dari dalam aplikasi); **8b, 8e, 8i, 8j, 8l** pada **browser sungguhan**.

**⚠️ Syarat tambahan yang berdiri di luar kode, dan tanpanya Fase 8 TIDAK selesai:** **checklist go-live** (K185) tuntas — batas laju & perlindungan brute-force login, security header, pelacakan galat, CI/CD, pemindaian virus lampiran, backup terjadwal **yang sudah pernah diuji pulih**. Membuka pendaftaran publik tanpa itu berarti kejadian pertama yang serius diketahui dari keluhan pelanggan.

**Tidak** termasuk DoD: harga & kuota final (**P48/P49** — bukan pekerjaan kode, tapi **memblokir penjualan**), pengiriman surel (**P10** — undangan disalin manual), penyedia AIS (**P55** — 8h boleh dicoret), domain kustom (**P57**), kebijakan privasi & DPA (**P59** — pekerjaan hukum), jam & waktu tanggap dukungan (**P60**), penagihan berulang otomatis (§1.5), dan RLS untuk jalur internal (**T2** — menunggu migrasi 54 route lama).

---

## 19. ⚠️ Pertanyaan terbuka — **butuh jawaban Marlon**, sengaja tidak ditebak

Melanjutkan P1–P47 (Fase 3 §15, Fase 6 §16, Fase 7 §20 — yang **masih berlaku**; **P10** punya dampak paling langsung ke fase ini, lalu P36 dan P22). Ini kebijakan komersial & hukum PT Tribuana Solusi Maritim, bukan keputusan teknis — menebaknya berarti mengirimkan model usaha yang salah ke pasar yang kecil dan saling mengenal. Kolom **Blokir** = increment yang tidak boleh dinyatakan selesai sebelum ini dijawab.

| # | Pertanyaan | Interim yang dipakai | Blokir |
|---|---|---|---|
| **P48** | ⚠️ **Paket & harga mana yang berlaku?** Kode hari ini menjual 3 paket Rp 250/450/600 rb berdasar **jumlah modul**; blueprint §11.3 mengusulkan Basic Rp 2,5 jt / Professional Rp 6 jt / Enterprise mulai Rp 12 jt berdasar **pengguna & voyage**. Beda sepuluh kali lipat dan beda dasar pembatasan. Ini pertanyaan pertama yang harus dijawab sebelum satu rupiah masuk | `BILLING_PLANS` yang ada dipertahankan; `kuota` semuanya `null` (K146/K155) → tak ada yang dibatasi | 8c, 8e — **dan memblokir penjualan**, bukan cuma kode |
| **P49** | ⚠️ **Batas tiap paket berapa?** Pengguna aktif, voyage per bulan, penyimpanan lampiran, panggilan AI. Blueprint §11.5 sudah menandai AI & penyimpanan sebagai biaya berubah yang *"perlu batas per pelanggan agar tidak melampaui perhitungan harga"* — jadi batas AI bukan kenyamanan, ia yang menjaga margin | Semua `null` = tak dibatasi. Mesinnya jalan, angkanya menunggu (K156) | 8c |
| **P50** | ⚠️ **Akun Duitku sudah ada?** Merchant code & API key (sandbox cukup untuk membangun), dan **gerbang mana yang jadi bawaan**? | `GERBANG_BAWAAN = 'MIDTRANS'` (yang sudah berjalan); Duitku muncul bila env terisi (K162/K163) | 8d |
| **P51** | **Trial 7 hari cukup?** Dan sesudah langganan berakhir: berapa lama data disimpan sebelum boleh dihapus, dan apakah tenant otomatis turun ke paket gratis atau read-only? | 7 hari (yang sudah berlaku); read-only selamanya; **tak ada** penghapusan otomatis (K157/K188) | — (interim aman tanpa batas waktu) |
| **P52** | **Pelanggan boleh melihat apa saja?** Cukup Invoice & jadwal kunjungan, atau juga FDA (yang memuat vendor & harga beli)? Dan siapa di dalam yang boleh mengundang pelanggan — ADMIN saja, atau FINANCE juga? | Invoice + kunjungan + dokumen yang **sengaja dibagikan**; FDA **tidak**; ADMIN & FINANCE mengundang (K167/K168) | 8f |
| **P53** | **Vendor boleh melihat nilai kesepakatan (`agreedAmount`) di portal?** Ia memang sudah tertulis di SPK yang selama ini dikirim — tapi di layar ia jadi mudah dibandingkan antar-pekerjaan | Ditampilkan; harga jual & skor vendor **tidak pernah** (K171) | 8g |
| **P54** | **Vendor mengunggah tagihan — memang diinginkan, atau surel/WhatsApp sudah cukup?** Jawaban *"vendor kami tidak akan memakainya"* menghemat satu increment penuh. Dan bila diinginkan: berapa kiriman per vendor per hari yang wajar? | Diunggah sebagai **usulan** yang tak pernah jadi baris biaya sendiri; batas laju di `commercial-policy.ts` (K172) | 8g |
| **P55** | ⚠️ **Penyedia data AIS/cuaca mana, dan anggarannya berapa per bulan?** Yang menentukan bukan fiturnya melainkan **cakupan di perairan Indonesia** — kalau kapal di Sungai Mahakam tak terpantau, seluruh fitur tak bernilai. Dokumen ini **sengaja tidak menebak** penyedia maupun harganya; itu riset yang harus dilakukan dengan penyedia sungguhan | `penyediaKosong` — fitur mati rapi, layar mengatakannya (K175) | **8h** (dan 8h boleh **dicoret seluruhnya**) |
| **P56** | **White-label memang diinginkan?** Dokumen mengusulkan produk tetap bermerek Maritime Suite, dokumen bermerek tenant (sudah berlaku), portal bermerek tenant. Atau memang ingin menjual berlabel putih penuh sebagai penawaran Enterprise — dengan konsekuensi dukungan yang berbeda? | Tiga lapis merek, hanya lapis portal & aplikasi yang bisa diatur (K179/K180) | 8i (sebagian) |
| **P57** | **Domain milik tenant sendiri (`portal.tribuana.co.id`) perlu?** Ia menuntut penerbitan sertifikat per domain dan pemuatan ulang nginx dari dalam aplikasi — pekerjaan yang milik rencana deploy, bukan dokumen ini | Subdomain kita saja; kolom `customDomain` disiapkan tapi jalurnya mati (K182) | 8i (bagian domain) |
| **P58** | **Analitik pemakaian boleh dikirim ke pihak ketiga?** Dokumen ini mengusulkan **tidak** — semua di database sendiri | Tabel sendiri, tanpa skrip eksternal (K183) | — |
| **P59** | ⚠️ **UU PDP: siapa penanggung jawab perlindungan data, apa isi kebijakan privasi & DPA dengan tenant, dan berapa lama retensi data pribadi (khususnya data awak, K125/K126)?** Ini pekerjaan hukum yang **tidak boleh** ditebak agen maupun kode. Tanpa jawabannya, produk boleh dibangun tapi **tidak boleh dijual** | Jalur `DataRequest` ada; penghapusan **tak pernah** otomatis; aturan data awak Fase 7 tetap berlaku penuh (K187) | 8k **tidak** terblokir (mesinnya netral); **penjualan** terblokir |
| **P60** | **Jam layanan dukungan dan waktu tanggap yang berani dijanjikan?** Blueprint §11.5 menandai dukungan sebagai pos biaya terbesar setelah pengembangan. Menjanjikan yang tak bisa ditepati lebih merusak daripada tidak menjanjikan | `SLA_DUKUNGAN = null`; halaman bantuan menulis **jam layanan** saja (K190) | 8l (isinya, bukan kodenya) |
| **P61** | **Backup: ke mana, berapa lama disimpan, siapa yang menguji pemulihan dan seberapa sering?** Backup yang belum pernah dipulihkan bukan backup | Kartu status backup + peringatan >48 jam; jadwal & uji pulih adalah checklist go-live (K186) | — (tapi **syarat DoD**) |
| **P62** | **Tenant baru langsung aktif, atau perlu persetujuan manual dulu?** Persetujuan manual menahan penyalahgunaan tapi mematikan "coba sekarang" | Langsung aktif — perilaku `/register` yang sudah berjalan (K154) | — (satu `if` untuk mengubah) |
| **P63** | **Satu orang yang mewakili pelanggan pada tiga keagenan berbeda — satu akun atau tiga?** Satu akun lebih nyaman; tiga akun berarti tak pernah ada sesi yang berdaulat lintas-tenant | Tiga akun (`@@unique([tenantId, email])`, K166) — pilihan yang paling murah dipertahankan | 8a (**murah diubah sebelum ada data**, mahal sesudahnya) |
| **P64** | **PPN atas langganan: kuitansi langganan harus jadi Faktur Pajak / e-Faktur?** Aplikasi ini sudah punya kemampuan e-Faktur untuk tagihan keagenan; pertanyaannya apakah tagihan **langganan** juga menuntutnya | Kuitansi tanpa komponen pajak, dengan catatan kaki (K164) | 8e |

**Ringkasan status blokir:** enam pertanyaan memblokir increment — **P48/P49** (8c, 8e), **P50** (8d), **P52** (8f), **P53/P54** (8g), **P55** (8h). Dua tidak memblokir kode tapi **memblokir penjualan**: **P48** (harga) dan **P59** (kepatuhan). Sisanya aman didiskusikan sambil jalan.

**Cara termurah menjawab sebagian besarnya:** **P48, P49, P51, P64** bisa diselesaikan dalam **satu sesi bersama akuntan/konsultan pajak sambil membuka blueprint Bab 11** — keempatnya satu percakapan, dan tanpa keempatnya tidak ada yang bisa dijual. **P50** cuma perlu mendaftar akun sandbox Duitku, satu jam. **P52, P53, P54** paling baik dijawab dengan **menelepon dua pelanggan dan dua vendor Tribuana** dan menanyakan apakah mereka mau memakai portal — jawaban "tidak" adalah jawaban yang sah dan menghemat satu increment penuh. **P55** menuntut riset penyedia yang **belum bisa dilakukan siapa pun di dalam tugas desain ini** dan harus dikerjakan dengan penyedia sungguhan. **P59** adalah pekerjaan hukum yang tak menunggu data dan bisa dimulai hari ini — dan ia yang paling lama selesai, jadi memulainya paling awal adalah penghematan terbesar.

---

## 20. Ringkasan keputusan (K143–K190)

| # | Keputusan |
|---|---|
| K143 | Pengguna luar **bukan** `User` ber-peran baru; `PortalUser` tabel & sesi sendiri — arah kegagalannya menolak, bukan menerima |
| K144 | Portal punya namespace (`/portal`, `/api/portal`), cookie, dan lapisan service sendiri; tak ada handler yang melayani keduanya |
| K145 | Skema Fase 8 tetap aditif; 8 model bertenant baru **wajib** masuk `TENANT_MODELS`, 1 model anak tidak; nol enum baru |
| K146 | Semua angka komersial di satu modul murni; bawaannya `null` = belum ditetapkan, bukan tebakan |
| **K147** | ⚠️ **Revisi K9** — RLS **diterima untuk jalur portal** lewat peran DB kedua (`maritime_portal`, tanpa bypass); jalur internal tetap tenant-guard sampai 54 route lama dimigrasi. Alasan pooling K9 mati bersama keputusan deploy VM tunggal |
| K148 | `forPortal()` — pagar aplikasi **fail-closed**: daftar putih model **dan** kunci pihak; model tak terdaftar **melempar**, tulis hampir seluruhnya tertutup |
| K149 | `withPortal()` satu-satunya pintu portal; memasang kedua lapis; `PortalContext` tak pernah jadi `TenantContext`; diuji struktural |
| K150 | `test:portal` wajib membuktikan **dua sumbu** × **dua lapis**, termasuk membuktikan tiap lapis berdiri sendiri saat yang lain dimatikan |
| K151 | `/register` yang ada dipertahankan; wizard adalah lapisan **sesudah** pendaftaran, bukan penggantinya |
| K152 | Enam langkah wizard, **semuanya boleh dilewati**; tak satu pun memblokir pemakaian aplikasi |
| K153 | Penyemaian tenant baru ber-`dataOrigin='SEED'` & berlabel CONTOH; `goLiveAt` tetap null (Fase 6 berlaku otomatis) |
| K154 | Pendaftaran mandiri dibuka dengan tiga rem; verifikasi surel **terhalang P10** dan itu dicatat, bukan disembunyikan |
| K155 | Paket adalah data di `plans.ts`, bukan enum baru; `Plan` yang ada tidak disentuh; `BillingPlan` bertambah field `kuota` |
| K156 | Kuota **memperingatkan di 80% sebelum menahan di 100%**; dihitung saat diminta; hanya menahan **pembuatan baru**, tak pernah menyembunyikan data lama |
| K157 | Trial & masa berakhir yang sudah berlaku dipertahankan; yang ditambah hanya peringatan idempoten. Tak ada penurunan/penghapusan otomatis |
| K158 | **Dua gerbang** (Midtrans + Duitku) karena alasan operasional nyata: kartu Indonesia yang ditolak satu gerbang lolos di gerbang lain. **Satu sumber harga** untuk keduanya |
| K159 | `Payment` + `gateway`/`gatewayRef`/`payMethod`; `orderId` **wajib berawalan gerbang**; pencarian selalu `orderId` **DAN** `gateway`; unique ganda |
| K160 | **Dua endpoint callback terpisah**; algoritma ditentukan **path**, tak pernah isi permintaan (menolak *algorithm confusion*); Duitku form-encoded + MD5, Midtrans JSON + SHA512 |
| K161 | ⚠️ Tanda tangan Duitku **tak memuat status & tak punya nonce** → bisa diputar ulang; idempotensi jadi **pagar keamanan**, dan nominal wajib dicocokkan di **kedua** gerbang |
| K162 | Gerbang: bawaan + diingat + tombol "coba yang lain"; **satu pesanan = satu gerbang**, menukar selalu membuat `orderId` baru |
| K163 | Perpanjangan menambah ke sisa (aritmetika yang sudah ada, dijadikan satu fungsi murni untuk kedua gerbang); jalan keluar saat gerbang mati; tombol periksa status |
| K164 | Kuitansi langganan = `SubscriptionInvoice` **sendiri**, ber-kop penjual — **tak pernah** `Invoice` (§1.3) |
| K165 | Add-on = baris pesanan + `Tenant.addonsEnabled String[]`; **bukan** mesin langganan kedua |
| K166 | `PortalUser` (orang) + `PortalAccess` (hak atas satu pihak) + `PortalInvitation` (token di-hash); surel unik **per tenant** |
| K167 | Portal membaca **proyeksi berdaftar-putih**, tak pernah model Prisma; daftar kolom eksplisit; FDA/vendor/tugas/komentar tak pernah ikut |
| K168 | Akses portal lahir dari **undangan bertoken**, tak pernah pendaftaran mandiri; `PortalAccess` diperiksa **setiap** permintaan supaya pencabutan berlaku seketika |
| K169 | Pelanggan hanya boleh **mengonfirmasi pembayaran** — tak mengubah status, tak membuat `InvoicePayment`, tak mengurangi outstanding |
| K170 | Lampiran ke portal **hanya yang sengaja dibagikan**; `sensitive` tak pernah bisa dibagikan; unduhan portal lewat route sendiri + `AuditLog` EXPORT |
| K171 | Vendor melihat PO `SENT` ke atas & WO miliknya; **tak pernah** harga jual, skor, penilaian, atau vendor lain |
| K172 | Tagihan vendor masuk sebagai **usulan** (`VendorInvoiceSubmission`) — tak pernah jadi `DisbursementItem` sendiri (sejalan K122); berkas lewat `Attachment` yang sudah ada |
| K173 | Vendor **mengonfirmasi**, tak pernah mengubah status/`actualEnd` — yang dinilai tak boleh menulis angka penilaiannya (sejalan K123) |
| K174 | Portal vendor tidak menghidupkan pemberitahuan otomatis; P10 masih terbuka, dan tak dijawab diam-diam |
| K175 | Satu antarmuka `PenyediaDataMaritim`; bawaan **`penyediaKosong`**; penyedia sungguhan → **P55**, tak ditebak |
| K176 | Data pihak ketiga = **cache bertanda waktu** per tenant; tak pernah menimpa kolom operasional; waktu posisi ≠ waktu pengambilan, keduanya ditampilkan |
| K177 | Diambil **saat diminta** + cache + kuota; satu penyegaran terjadwal per hari untuk voyage aktif. Tak ada polling |
| K178 | AIS **tidak pernah** menulis ETA/ATA; ia mengisi form, manusia menyimpan (sejalan K52/K130) |
| K179 | **Maritime Suite tetap merek produk**; dokumen sudah ber-merek tenant sejak Fase 0; yang di-white-label adalah aplikasi & portal (**P56**) |
| K180 | Cakupan white-label: logo, **satu** warna, nama, subdomain. Tanpa tema/CSS/templat surel — permukaan dukungan permanen |
| K181 | ⚠️ Hutang dibayar: `Tenant.logoUrl` base64 (penyebab bug HTTP/2 yang terdokumentasi) pindah ke `Attachment`; `logoUrl` tetap sebagai cadangan (M6) |
| K182 | Alamat portal: path → subdomain kita; domain milik tenant = add-on, kolomnya disiapkan, jalurnya menunggu **P57** (catatan deploy) |
| K183 | `UsageEvent` satu tabel milik sendiri; **tanpa** alat pihak ketiga; **bukan** turunan `AuditLog` (jejak hukum tak boleh dipangkas) |
| K184 | Mengukur **pemakaian fitur**, bukan produktivitas orang; layar lintas-tenant **tidak** dibangun — hanya skrip |
| K185 | Batas tegas **fitur vs checklist go-live**; yang eksekusi tidak diberi nomor K, tapi **tetap syarat DoD** |
| K186 | Backup: yang terlihat adalah status & peringatan; **ekspor data tenant mandiri** jadi fitur — prasyarat komersial, bukan kebaikan hati |
| K187 | UU PDP: `DataRequest` sebagai jalur nyata; **penghapusan tak pernah otomatis**; aturan data awak Fase 7 tak dilonggarkan |
| K188 | Offboarding = kebalikan onboarding, empat langkah, **semuanya dimulai manusia**; penghapusan tenant hanya lewat skrip ber-`--dry-run`, tak pernah endpoint |
| K189 | Help Center **menumpang `KnowledgeArticle`** (K140) lewat satu kolom `lingkup`; satu-satunya pembacaan lintas-tenant yang disengaja, diberi nama yang mengaku & berkomentar |
| K190 | Dukungan adalah **kanal**, bukan produk; **jam layanan** ditulis, **waktu tanggap** tidak dijanjikan sampai **P60** dijawab |







