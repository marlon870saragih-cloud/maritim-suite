# PRD TAH-MWS — Marine Weather, Laporan WhatsApp & STS Readiness/Advisory

**Maritim Suite / Tribuana Automation Hub — PT Tribuana Solusi Maritim**

| Atribut | Nilai |
|---|---|
| Document ID | TSM-TAH-MWS-PRD |
| Versi | **0.1 — DRAFT — NOT APPROVED** |
| Tanggal | 9 Oktober 2026 (Asia/Makassar) |
| Owner produk | Owner Maritim Suite / PT Tribuana Solusi Maritim |
| Basis kode yang direkonsiliasi | `main` @ `5e7045129780cb90b5517539bcd09ecb4a5730c4` |
| Hubungan dengan WA-1 | Dokumen **terpisah**. `docs/whatsapp/PRD-WA-1.md` v0.2 tetap **FROZEN** dan tidak diubah oleh dokumen ini |
| Status approval dokumen | **BELUM DISETUJUI.** Dokumen ini tidak mengotorisasi implementasi, schema/migrasi, pemilihan penyedia, deploy, atau pengiriman pesan apa pun |
| Checkpoint kanonik | `docs/TAH-CURRENT-CHECKPOINT.md` (belum diperbarui untuk dokumen ini) |

> **Catatan pemulihan (wajib dibaca).** Pada audit read-only 9 Okt 2026, hasil diskusi "Jumat pagi" tentang
> marine weather, STS, format WhatsApp, dan Compact/Collapsed Prompt Card **tidak ditemukan** di GitHub
> (semua branch remote, commit, PR #1–#11, dan dokumen). Draf ini disusun **hanya** dari keputusan owner yang
> dinyatakan ulang secara tertulis pada sesi 9 Okt 2026 dan dari kode `main` @ `5e70451`. Draf ini **tidak**
> mengklaim memuat teks asli Jumat pagi. Bagian yang bergantung pada teks asli ditandai **OPEN**.

**Aturan pembacaan:** **EXISTING** = terbukti ada di kode `main` @ `5e70451`. **PROPOSED** = usulan desain
dalam draf ini, butuh persetujuan owner. **OPEN** = belum diputuskan / belum dipulihkan. OD-MW-xx = keputusan
owner yang sudah diketahui. P-MW-xx = usulan. Q-MW-xx = pertanyaan terbuka. Contoh format di dokumen ini
memakai **token**, bukan angka — tidak ada nilai cuaca di dokumen ini yang boleh dibaca sebagai data.

---

## 1. Ringkasan

TAH-MWS menambahkan tiga kemampuan di atas fondasi Automation Hub dan WA-1:

1. **Marine Weather Monitoring** — kondisi perairan saat ini dan potensi perubahan selama periode prakiraan
   (gelombang, angin, arus; arus bawah permukaan hanya bila sumber mendukung kedalaman tertentu), dengan
   sumber, timestamp, lokasi, periode prakiraan, dan status ketersediaan data yang selalu tampil.
2. **Laporan WhatsApp marine** — ringkas, terstruktur, header sesuai konteks (PT TSM / TRIBUANA AGENCY),
   perbandingan kini vs prakiraan, penutup lokasi dinamis.
3. **STS Readiness & Safety Advisory** — dua kelas komunikasi yang dipisah tegas: pengingat kesiapan STS
   untuk staf internal PT TSM, dan advisory keselamatan terverifikasi untuk klien. Informasi internal tidak
   boleh sampai ke penerima/grup klien.

Prinsip yang tidak bisa ditawar: **tidak ada data cuaca yang dikarang** — nilai yang tidak tersedia dari
sumber ditampilkan sebagai tidak tersedia, bukan diperkirakan, diinterpolasi diam-diam, atau dihasilkan LLM.

## 2. Kondisi existing (direkonsiliasi ke `main` @ `5e70451`)

| Area | Fakta | Bukti |
|---|---|---|
| Cache data maritim | Model `MarineDataCache` (jenis `VESSEL_POSITION` / `PORT_WEATHER` / `PORT_CONGESTION`, per tenant, `payload` mentah, `berlakuSampai`) **ada di schema tetapi tidak dipakai** kode mana pun selain daftar tenant-guard | `prisma/schema.prisma:2064`, `src/services/tenant-guard.ts:74` |
| Penyedia cuaca/arus | **Tidak ada.** Pemilihan penyedia AIS/cuaca masih keputusan terbuka P55 | `docs/FASE-8-SAAS-COMMERCIAL.md:1770` |
| Lokasi pelabuhan | `Port.latitude`, `Port.longitude`, `Port.timezone` ada tetapi **opsional** | `prisma/schema.prisma` model `Port` |
| Posisi kapal | Kerangka AIS hanya adapter NONE/FAKE; tidak ada AIS live | `src/services/ais/`, `src/services/automation/provider.ts` |
| Voyage Monitoring | Ada dan E2E produksi diverifikasi owner 5 Okt 2026 | Checkpoint §D |
| Komunikasi WhatsApp | WA-1 Step 2A–2E: FAKE-only, 4 keluarga event (ETA/ETD, EOSP, ALL_FAST, SAILED), 8 template deterministik, satu penerima fixture, approval + audit + idempotensi + retry ≤ 5 | PR #6–#10, `src/services/communication/` |
| Pengingat | Hanya job pengingat SLA tugas (menulis `Notification`, tanpa LLM); bukan pengingat STS | `src/services/ops/reminder-job.ts` |
| STS | Tidak ada konsep STS di schema/service (hanya muncul di fixture eval PRD-005) | `git grep -w STS` |
| Identitas tenant | `Tenant.companyName`, `Tenant.logoUrl` | `prisma/schema.prisma` model `Tenant` |

## 3. Pengguna

| Pengguna | Kebutuhan |
|---|---|
| Staf operasi PT TSM | Pengingat kesiapan STS dan gambaran kondisi perairan untuk perencanaan internal |
| Manajer operasi / reviewer | Meninjau dan menyetujui setiap pesan ke klien; melihat sumber dan waktu data sebelum menyetujui |
| Klien (owner/charterer/agen principal/master — OPEN, Q-MW-09) | Advisory keselamatan dan laporan kondisi perairan yang terverifikasi, ringkas, dan jelas sumbernya |

## 4. Modul 1 — Marine Weather Monitoring

### 4.1 Parameter

| Parameter | Satuan (PROPOSED) | Arah | Wajib? | Catatan |
|---|---|---|---|---|
| Tinggi gelombang signifikan | meter | — | Ya, bila sumber menyediakan | Jenis tinggi (signifikan/maksimum) mengikuti label sumber; tidak dikonversi diam-diam |
| Kecepatan angin | knot | Arah **datang** (konvensi meteorologi) — OPEN Q-MW-04 | Ya, bila sumber menyediakan | Hembusan (gust) hanya bila sumber menyediakan |
| Arus laut/sungai | knot atau m/s — OPEN Q-MW-05 | Arah **menuju** (konvensi oseanografi) — OPEN Q-MW-04 | Bila tersedia | Arus sungai (mis. alur sungai) hanya dari sumber yang mencakup lokasi itu |
| Arus bawah permukaan | sama dengan arus | sama | **Hanya** bila sumber kredibel menyatakan kedalaman spesifik | Wajib menampilkan kedalaman; tanpa kedalaman eksplisit → **tidak ditampilkan sama sekali** |

### 4.2 Provenans wajib per nilai (PROPOSED)

Setiap nilai yang tampil di aplikasi atau pesan wajib membawa:
- **Sumber** (nama penyedia/produk data);
- **Waktu terbit/pembaruan sumber** (bukan hanya waktu pengambilan);
- **Waktu pengambilan** oleh sistem;
- **Lokasi** — titik koordinat atau nama area sesuai cakupan sumber; bila nilai berlaku untuk area, tampilkan area, bukan seolah titik;
- **Periode prakiraan** (awal–akhir, dengan zona waktu IANA lokasi; tanpa fallback ke zona server/browser/UTC — selaras D-10 WA-1);
- **Status ketersediaan** (§4.3).

### 4.3 Status ketersediaan data (PROPOSED)

| Status | Arti | Tampilan |
|---|---|---|
| `TERSEDIA` | Semua parameter wajib ada dari sumber, dalam batas kesegaran | Nilai + provenans |
| `SEBAGIAN` | Sebagian parameter tidak disediakan sumber | Nilai yang ada + "tidak tersedia dari sumber" untuk sisanya |
| `TIDAK_TERSEDIA` | Sumber tidak mencakup lokasi/periode | Tidak ada angka; pernyataan ketersediaan saja |
| `BASI` | Data melewati ambang kesegaran (ambang OPEN Q-MW-06) | Tidak boleh masuk pesan klien; tampil di aplikasi dengan label basi |
| `SUMBER_GAGAL` | Pengambilan gagal/error | Tidak ada angka; status gagal + waktu percobaan |

### 4.4 Aturan anti-fabrikasi (PROPOSED, toleransi nol)
1. Tidak ada nilai yang dihasilkan LLM, ditebak, diinterpolasi, atau diambil dari lokasi lain tanpa label eksplisit.
2. Nilai kosong tidak diisi dengan nilai default, nol, atau nilai periode sebelumnya.
3. Perbandingan "kini vs prakiraan" hanya dihitung secara deterministik dari nilai bersumber; bila kedua sisi berasal dari sumber berbeda, keduanya diberi label sumber masing-masing.
4. Kata kategori (mis. "tenang/sedang/tinggi") hanya dipakai bila skala kategorinya ditetapkan owner (Q-MW-07); tanpa itu, angka saja.
5. Konversi satuan hanya dengan faktor tetap yang terdokumentasi; satuan asli sumber tetap tercatat.

## 5. Modul 2 — Format laporan WhatsApp marine

### 5.1 Ketentuan (OD-MW-05..08)
- Singkat, terstruktur, mudah dibaca di layar ponsel.
- Header **PT TSM / TRIBUANA AGENCY** sesuai konteks — aturan pemilihan header **OPEN** (Q-MW-08).
- Bandingkan kondisi saat ini dengan potensi perubahan selama periode prakiraan.
- Penutup lokasi **dinamis** dari data voyage/pelabuhan/area; **tidak boleh** hardcoded "SAMARINDA".

### 5.2 Kerangka ilustratif (PROPOSED — token, bukan data)

```
{{HEADER}}
{{JUDUL_LAPORAN}} — {{NAMA_KAPAL}} / {{NO_VOYAGE}}
Lokasi: {{LOKASI}}  |  Periode: {{AWAL}} – {{AKHIR}} {{ZONA}}

KONDISI SAAT INI ({{WAKTU_OBSERVASI}})
• Gelombang : {{GEL_KINI}}
• Angin     : {{ANGIN_KINI_KEC}} dari {{ANGIN_KINI_ARAH}}
• Arus      : {{ARUS_KINI_KEC}} menuju {{ARUS_KINI_ARAH}}

POTENSI PERUBAHAN ({{AWAL}} – {{AKHIR}})
• Gelombang : {{GEL_PRAKIRAAN}}
• Angin     : {{ANGIN_PRAKIRAAN}}
• Arus      : {{ARUS_PRAKIRAAN}}

Sumber: {{SUMBER}} — diperbarui {{WAKTU_TERBIT}}
{{CATATAN_KETERSEDIAAN}}

{{PENUTUP_LOKASI}}, {{TANGGAL_LOKAL}}
```

Aturan render (PROPOSED, selaras pola WA-1 D-04/P-02): template deterministik berversi tanpa LLM; token tak
terisi → render gagal (tidak dikirim); parameter `TIDAK_TERSEDIA` dirender sebagai teks ketersediaan, bukan
dihapus diam-diam; `{{PENUTUP_LOKASI}}` tak dapat ditentukan → pesan **diblokir** (tanpa nilai default).
Format arah (kompas 8/16 mata angin vs derajat) OPEN (Q-MW-04).

## 6. Modul 3 — STS Readiness (internal) & Safety Advisory (klien)

### 6.1 Dua kelas komunikasi yang terpisah (OD-MW-09..12)

| Aspek | `STS_INTERNAL_REMINDER` (PROPOSED) | `STS_CLIENT_ADVISORY` (PROPOSED) |
|---|---|---|
| Tujuan | Mengingatkan staf PT TSM tentang kesiapan STS | Menyampaikan advisory keselamatan terverifikasi kepada klien |
| Penerima | Hanya pengguna/kanal internal PT TSM | Hanya penerima klien yang terdaftar untuk voyage itu |
| Isi | Boleh memuat catatan internal, daftar periksa, status kesiapan, kontak internal | Hanya fakta terverifikasi dan advisory; **tanpa** catatan, biaya, penilaian, atau status internal |
| Approval | Alur internal (peran OPEN, Q-MW-11) | Human approval terpisah, `EXTERNAL_COMMUNICATION`, **tanpa self-approval** (selaras K-4 WA-1) |
| Template | Set template sendiri | Set template sendiri; **tidak berbagi** template dengan internal |

### 6.2 Invarian pemisahan (PROPOSED, gate wajib)
1. Kelas pesan ditentukan saat candidate dibuat dan **tidak dapat diubah**; mengubah kelas = candidate baru.
2. Pesan `STS_INTERNAL_REMINDER` hanya dapat menuju penerima berkelas internal; percobaan ke penerima/grup klien → diblokir dengan reason code (mis. `RECIPIENT_CLASS_MISMATCH`), tercatat di audit.
3. Pesan `STS_CLIENT_ADVISORY` dirender hanya dari field yang ditandai boleh-eksternal; field internal tidak tersedia bagi template klien (pemisahan pada tingkat data, bukan hanya teks).
4. Approval mengikat kelas, penerima, dan fingerprint isi; perubahan salah satunya membatalkan approval (pola SG-07 WA-1).
5. Satu approval tidak pernah berlaku untuk kedua kelas sekaligus.

### 6.3 Advisory "terverifikasi"
Definisi verifikasi — siapa yang memverifikasi, terhadap sumber apa, dan bukti apa yang disimpan — **OPEN**
(Q-MW-12). Sampai diputuskan, advisory klien tidak boleh dibangun. Advisory bersifat informasi; batas tanggung
jawab dan teks penafian **OPEN** (Q-MW-13).

### 6.4 Isi pengingat kesiapan STS
Daftar item kesiapan STS, pemicu waktu pengingat (mis. H-x sebelum operasi), dan sumber data kesiapan **OPEN**
(Q-MW-10). Draf ini tidak menetapkan daftar periksa STS.

## 7. Modul 4 — Compact / Collapsed Prompt Card (Full Copy)

**Yang diketahui:** owner menyebut kebutuhan "Compact Prompt Card / Collapsed Prompt Card (Full Copy)" sebagai
bagian pekerjaan Jumat pagi 9 Okt 2026.

**Yang tidak berhasil dipulihkan:** teks asli, tujuan, isi, tata letak, dan tempat penggunaannya. Tidak ada
jejak di repo (pencarian "prompt card", "compact prompt", "collapsed prompt", "full copy" di semua branch: 0 hasil).

**Status: OPEN (Q-MW-14).** Draf ini **tidak** menetapkan spesifikasi. Penafsiran yang mungkin — dicatat hanya
sebagai pertanyaan untuk owner, bukan klaim:
- (a) kartu UI di aplikasi yang menampilkan laporan secara ringkas (collapsed) dengan tombol salin teks lengkap (full copy) untuk ditempel ke WhatsApp;
- (b) kartu prompt kerja (instruksi siap-salin) untuk sesi AI/pengembangan;
- (c) hal lain.

Yang dibutuhkan untuk menutup OPEN ini: teks asli dari owner atau deskripsi ulang tertulis.

## 8. Hubungan dengan WA-1 dan batas scope

### 8.1 Yang tidak berubah
- PRD WA-1 v0.2 tetap FROZEN. WA-1 D-03 membatasi WA-1 pada empat keluarga event; marine weather dan STS **bukan** bagian WA-1 dan tidak dimasukkan ke WA-1.
- Kode WA-1 Step 2A–2E tidak dikerjakan ulang: FAKE Send dan zero egress, isolasi tenant, approval dan audit, idempotensi, retry ≤ 5, penguncian Send/Prepare tetap seperti adanya.
- SG-05 tetap **OPEN** sampai ada penyelesaian terverifikasi.
- Kebijakan TAH yang dibekukan (`tah-policy.ts`, berkas Validator V3) tidak disentuh.

### 8.2 Usulan integrasi (butuh persetujuan owner)

| ID | Usulan |
|---|---|
| P-MW-01 | TAH-MWS memakai ulang pola WA-1 (candidate → preview → approval → kirim → audit) dengan keluarga pesan baru, bukan jalur paralel |
| P-MW-02 | Keluarga pesan baru (`MARINE_REPORT`, `STS_INTERNAL_REMINDER`, `STS_CLIENT_ADVISORY`) didefinisikan di fase/PRD terpisah, bukan dengan merevisi D-03 WA-1 |
| P-MW-03 | Selama belum ada jalur WhatsApp resmi, semua pesan TAH-MWS hanya mode FAKE/non-produksi (selaras D-12 WA-1) |
| P-MW-04 | Penerima grup klien membutuhkan model penerima/consent WA-2; WA-1 non-goal #3 (grup) tetap berlaku sampai fase itu |
| P-MW-05 | Pengingat internal STS dapat memakai notifikasi in-app (pola `Notification`) sebelum WhatsApp internal — keputusan kanal OPEN (Q-MW-11) |
| P-MW-06 | Data cuaca disimpan sebagai observasi bertanda waktu yang tidak pernah menimpa kolom operasional (selaras komentar K176 pada `MarineDataCache`); pemakaian/perubahan model itu butuh persetujuan schema terpisah |
| P-MW-07 | SG-05 wajib ditutup sebelum penerima nyata apa pun, termasuk penerima internal |

### 8.3 Non-goals draf ini
Implementasi; schema/migrasi; pemilihan atau kontrak penyedia data; panggilan API eksternal; pengiriman
WhatsApp nyata; LLM untuk menyusun laporan; rekomendasi navigasi atau keputusan operasi STS otomatis;
perubahan PRD WA-1; perubahan checkpoint kanonik.

## 9. Safety gates yang diusulkan (desain, PROPOSED)

| ID | Pemeriksaan | Saat gagal |
|---|---|---|
| MW-SG-01 | Setiap nilai cuaca dalam pesan punya provenans lengkap (§4.2) | `WEATHER_PROVENANCE_MISSING` — blok |
| MW-SG-02 | Data dalam batas kesegaran (ambang Q-MW-06) saat Prepare **dan** saat Kirim | `WEATHER_DATA_STALE` — blok |
| MW-SG-03 | Lokasi penutup dan zona waktu dapat ditentukan dari data voyage/pelabuhan/area | `LOCATION_UNRESOLVED` / `TIMEZONE_MISSING` — blok, tanpa default |
| MW-SG-04 | Arus bawah permukaan hanya bila kedalaman eksplisit dari sumber | `SUBSURFACE_DEPTH_MISSING` — nilai dihapus dari render + catatan |
| MW-SG-05 | Kelas pesan cocok dengan kelas penerima (§6.2) | `RECIPIENT_CLASS_MISMATCH` — blok + audit |
| MW-SG-06 | Advisory klien punya bukti verifikasi (definisi Q-MW-12) | `ADVISORY_NOT_VERIFIED` — blok |

## 10. Keputusan owner yang sudah diketahui

Sumber: pernyataan tertulis owner pada sesi 9 Okt 2026 (bukan teks asli Jumat pagi).

| ID | Keputusan |
|---|---|
| OD-MW-01 | Laporan memuat kondisi saat ini dan potensi perubahan selama periode prakiraan yang dinyatakan |
| OD-MW-02 | Parameter: tinggi gelombang; kecepatan dan arah angin; kecepatan dan arah arus laut/sungai bila tersedia |
| OD-MW-03 | Arus bawah permukaan hanya bila ada sumber kredibel yang spesifik terhadap kedalaman |
| OD-MW-04 | Wajib menyertakan sumber, timestamp, lokasi, periode prakiraan, status ketersediaan; dilarang mengarang data cuaca |
| OD-MW-05 | Format WhatsApp singkat, terstruktur, mudah dibaca |
| OD-MW-06 | Header PT TSM / TRIBUANA AGENCY sesuai konteks |
| OD-MW-07 | Menampilkan perbandingan kondisi saat ini dengan potensi perubahan, dengan angka penting |
| OD-MW-08 | Penutup lokasi dinamis, bukan selalu SAMARINDA |
| OD-MW-09 | Pengingat kesiapan STS untuk staf internal PT TSM |
| OD-MW-10 | Advisory keselamatan terverifikasi untuk klien |
| OD-MW-11 | Penerima, informasi, dan proses persetujuan internal vs klien dipisahkan sesuai kewenangan |
| OD-MW-12 | Informasi internal tidak boleh terkirim ke grup klien |
| OD-MW-13 | WA-1 tetap fondasi komunikasi; PRD WA-1 v0.2 tidak diubah; tidak ada implementasi fitur baru dari draf ini |
| OD-MW-14 | Kebutuhan Compact/Collapsed Prompt Card dicatat; spesifikasi yang belum dipulihkan ditandai OPEN |

## 11. Pertanyaan dan keputusan OPEN

| ID | Pertanyaan | Menghalangi |
|---|---|---|
| Q-MW-01 | Penyedia data gelombang/angin/arus mana, cakupannya di perairan Indonesia (termasuk alur sungai), lisensi, dan anggarannya? (terkait P55) | Seluruh Modul 1–2 |
| Q-MW-02 | Penyedia arus bawah permukaan yang dianggap kredibel, dan kedalaman mana yang relevan? | Arus bawah permukaan |
| Q-MW-03 | Lokasi acuan laporan: koordinat pelabuhan, posisi kapal (butuh AIS live), area perairan, atau titik STS? | Modul 1–3 |
| Q-MW-04 | Konvensi arah: angin "dari" / arus "menuju"? Format arah: mata angin atau derajat? | Template |
| Q-MW-05 | Satuan: gelombang meter; angin knot; arus knot atau m/s? | Template |
| Q-MW-06 | Ambang kesegaran data untuk tampil di aplikasi dan untuk dikirim ke klien | MW-SG-02 |
| Q-MW-07 | Perlukah skala kategori (mis. tenang/sedang/tinggi) dan ambangnya, atau angka saja? | Template |
| Q-MW-08 | Kapan header "PT TSM" dan kapan "TRIBUANA AGENCY"? (per tenant, per klien, per jenis pesan?) | Template |
| Q-MW-09 | Siapa penerima klien (master/owner/charterer/agen principal) dan apakah lewat grup? | Modul 2–3, WA-2 |
| Q-MW-10 | Daftar item kesiapan STS, pemicu waktu pengingat, dan sumber datanya | Modul 3 internal |
| Q-MW-11 | Kanal dan peran approval untuk pengingat internal (in-app, WhatsApp internal, keduanya)? | Modul 3 internal |
| Q-MW-12 | Definisi "advisory terverifikasi": verifikator, sumber acuan, bukti yang disimpan | Modul 3 klien |
| Q-MW-13 | Batas tanggung jawab dan teks penafian advisory | Modul 3 klien |
| Q-MW-14 | Compact/Collapsed Prompt Card: teks asli, tujuan, isi, tempat penggunaan | Modul 4 |
| Q-MW-15 | Jadwal laporan: berbasis event, terjadwal (mis. pagi/sore), atau atas permintaan? | Semua modul |
| Q-MW-16 | Bahasa laporan: ID saja, atau ID/EN seperti WA-1? | Template |
| Q-MW-17 | Penomoran fase: apakah TAH-MWS menjadi fase sesudah WA-2, atau berjalan paralel untuk bagian internal saja? | Urutan kerja |

## 12. Risiko

| Risiko | Mitigasi (PROPOSED) |
|---|---|
| Angka cuaca keliru/basi diteruskan ke klien | Provenans wajib, gate kesegaran saat Prepare dan Kirim, human approval |
| Informasi internal bocor ke grup klien | Kelas pesan tetap, pemisahan pada tingkat data, gate kelas penerima, audit |
| Sumber tidak mencakup alur sungai/area tertentu | Status `TIDAK_TERSEDIA` eksplisit; tidak memakai area terdekat tanpa label |
| Advisory dibaca sebagai instruksi navigasi | Definisi verifikasi + penafian (Q-MW-12/13) sebelum dibangun |
| Scope creep ke WA-1 yang frozen | Dokumen terpisah; usulan integrasi hanya lewat P-MW-xx |
| Teks asli Jumat pagi berbeda dari draf ini | Owner meninjau draf terhadap teks asli bila ditemukan; draf direvisi |

## 13. Usulan urutan (PROPOSED, bukan komitmen)

1. Owner meninjau draf ini dan menjawab Q-MW yang memblokir (terutama Q-MW-01, 03, 08, 09, 12, 14).
2. Draf direvisi menjadi v0.2 dan, bila disetujui, disimpan lewat PR dokumen; checkpoint kanonik diperbarui sesudahnya.
3. Implementasi apa pun hanya dengan izin owner terpisah, dimulai dari bagian yang tidak bergantung pada penyedia/penerima nyata.

## 14. NEXT EXACT STEP

Owner meninjau draf v0.1 ini. **DO NOT START:** implementasi, schema/migrasi, pemilihan/kontrak penyedia,
panggilan API eksternal, pengiriman WhatsApp, deploy, perubahan PRD WA-1, perubahan checkpoint kanonik.

## 15. Riwayat perubahan

| Versi | Tanggal | Perubahan | Status |
|---|---|---|---|
| 0.1 | 2026-10-09 | Draf awal dari keputusan owner yang dinyatakan ulang pada sesi 9 Okt 2026, direkonsiliasi ke `main` @ `5e70451`. Teks asli Jumat pagi tidak ditemukan; Compact Prompt Card OPEN | **DRAFT — NOT APPROVED** |
