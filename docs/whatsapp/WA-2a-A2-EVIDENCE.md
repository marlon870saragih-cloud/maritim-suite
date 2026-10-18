# SG-05 A2 / P-2 — bukti revalidasi pra-kirim (tanpa provider, tanpa Send)

**Status SG-05: OPEN.** Dokumen ini mencatat bukti teknis P-2 di Linux. Dokumen ini **tidak** menutup SG-05 dan **tidak** membuktikan P-3. SG-05 baru dapat ditutup bila P-1, P-2, dan P-3 terbukti dan owner menyetujui penutupan.

- **Dasar keputusan:** OD-37, yaitu O-1–O-8 serta B-1, B-2/O-9, dan B-3/O-10 ([checkpoint](../TAH-CURRENT-CHECKPOINT.md) §A). Persyaratan P-2 tercantum di [SG-05-PENYELARASAN.md](SG-05-PENYELARASAN.md) §4.
- **Baseline:** `main` `a9e51fcb4670bfc017030debef78f22527dc20bd` (merge PR #41).
- **Lingkup aktual:** tepat enam path (B-1):

  | Path | Jenis |
  |---|---|
  | `src/services/whatsapp/wa-prakirim.service.ts` | baru |
  | `prisma/check-wa2a-prakirim.mjs` | baru |
  | `prisma/check-wa2a-prakirim-db.mjs` | baru |
  | `docs/whatsapp/WA-2a-A2-EVIDENCE.md` (dokumen ini) | baru |
  | `docs/TAH-CURRENT-CHECKPOINT.md` | diubah |
  | `docs/whatsapp/SG-05-PENYELARASAN.md` | diubah; hanya status bukti P-2 |

- **Yang tidak berubah:** manifest lingkup, `faseAktif`, helper gate, `wa2-policy.ts`, `wa-lock.ts`, berkas beku, schema, migrasi, dependency, route/UI, dan kode WA-1.
- **Blob yang diuji** (`git hash-object`; isi commit PR = blob ini):

  | Berkas | Blob |
  |---|---|
  | `wa-prakirim.service.ts` | `795db73e9eb38b9f3e96008c265b3c2cb5593550` |
  | `check-wa2a-prakirim.mjs` | `045c5b970fe969e1110d0dd51707cbc9bdfd9d2c` |
  | `check-wa2a-prakirim-db.mjs` | `b4cd2e1814540eb1dd427c7787e7a028dccaf528` |

## 1. Kontrak A2

**Fungsi publik.** Ada dua fungsi publik. Keduanya mengambil konteks staf tenant tepercaya dan transaksi milik pemanggil.

1. `revalidasiPraKirimDalamTx(ctx, tx, { messageId, expectedVersion, expectedSnapshotFingerprint })`
   - Statement pertamanya `gerbangWa2(ctx)` (O-5). Konteks sistem, produksi, flag mati, dan tenant di luar allowlist ditolak.
2. `periksaTokenPraKirim(ctx, tx, token)`
   - Memakai gerbang yang sama.
   - Token hanya sah bila tenant token = `ctx.tenantId`, token diterbitkan pada objek `tx` yang sama, dan baris pesan/approval di `tx` masih APPROVED/NOT_STARTED dengan version token.

**Transaksi.**
- Tidak membuka `$transaction` sendiri. Pemanggil memakai `forTenant(ctx).$transaction`.
- Semua SQL mentah menyaring `"tenantId"`. Semua kueri Prisma memakai `tenantId: ctx.tenantId`.
- Tidak ada provider, Send, `fetch`, penulisan `successKey`, status RUNNING, maupun klaim.

**Hasil** (dikembalikan sebagai nilai):

| Hasil | Arti / efek |
|---|---|
| `LAYAK` + token | Tanpa mutasi. |
| `DITAHAN` | Pesan → NEEDS_REVIEW. |
| `DIBLOKIR` | Pesan → BLOCKED; activeKey dilepas. |
| `KONFLIK` | `INPUT_STALE`, `MESSAGE_NOT_APPROVED`, `APPROVAL_NOT_ELIGIBLE`, atau `CONCURRENT_CHANGE`. Tanpa mutasi. |

- Pada DITAHAN dan DIBLOKIR, approval tertaut dihentikan (eksekusi CANCELLED) dan audit ditulis di `tx` yang sama.
- Galat:
  - `NOT_FOUND`: pesan tidak ada atau milik tenant lain; tanpa bocor.
  - `FORBIDDEN` `APPROVAL_RELATION_INVALID` / `APPROVAL_POLICY_MISMATCH`: relasi approval tidak dapat dibuktikan. Tanpa mutasi; approval yang ditunjuk tidak disentuh.
- Bila pemanggil melempar galat, penahanan ikut rollback. Tidak ada klaim (gagal aman).

**Pemeriksaan.**
- **O-6:** hanya `APPROVED` + `NOT_STARTED` yang dapat LAYAK. Status FAILED ditolak (KONFLIK); retry ditunda ke F-II.
- **O-7:** R1–R8 menurut penomoran resmi §4 P-2, ditambah:
  - X-1: sidik snapshot/activeKey;
  - X-2: bahasa;
  - X-3: proposal/basis approval;
  - X-4: freshness D6 + K7 (bukti sama dengan snapshot);
  - X-5: asal data.
- **O-1/K1-B:** urutan dan kode alasan sama dengan `revalidasiPesan` F4. A2 disusun dari helper F4 yang sudah diekspor.
- **O-4/T-2:** tidak ada TTL APPROVED. `verificationExpiresAt`, `validUntil` grant, dan freshness dinilai pada jam akhir.

**Urutan kunci (O-8).**
1. WaContact (SHARE)
2. WaConsentState (UPDATE)
3. grant/Voyage (SHARE, resolver)
4. bukti (SHARE)
5. kandidat
6. TahApprovalRequest (FOR UPDATE)
7. WaClientMessage (FOR UPDATE)

Pesan dikunci **sesudah** approval, karena jalur batal mengunci approval lebih dulu. Jam keputusan diambil sesudah semua kunci. State dan version dibaca ulang di bawah kunci; perubahan menghasilkan KONFLIK `CONCURRENT_CHANGE`.

**Relasi approval (koreksi 2):**

| Kondisi | Hasil |
|---|---|
| Input basi | KONFLIK (tanpa mutasi) |
| Proposal/basis approval ≠ snapshot/sumber pada relasi yang terbukti | DIBLOKIR `SNAPSHOT_MISMATCH` (semantik F4) |
| Relasi tidak terbukti (`approvalRequestId` kosong/asing/tenant lain, subjek bukan pesan ini, kind/kebijakan beda) | FORBIDDEN tanpa mutasi; tidak menghentikan approval yang ikatannya tidak terbukti |

**Token (koreksi 3).**
- Token adalah bantuan dalam-proses (`WeakMap` per objek `tx`, dibandingkan dengan nilai kanonik). Token **bukan** jaminan keamanan lintas proses.
- Jaminan DB: kunci baris FOR UPDATE/SHARE dipegang sampai pemanggil commit, ditambah penjaga version (uji R-1–R-4, TK-8).
- LAYAK hanya membuktikan kelayakan **saat diperiksa** di transaksi itu. LAYAK **bukan** bukti satu klaim atau exactly-once.

## 2. Hasil uji (Linux, nyata)

**Lingkungan.**
- Linux container, Node v22.22.0, Prisma 6.19.3.
- PostgreSQL 16.15 sekali pakai: cluster sementara, hanya `127.0.0.1`, port tidak standar, `prisma migrate deploy` atas baseline.
- Uji DB dijalankan dengan `env -u DATABASE_URL -u DIRECT_URL` dan variabel URL khusus uji.

| Uji | Hasil | Catatan |
|---|---|---|
| `prisma/check-wa2a-prakirim.mjs` (statis AST + mutasi di memori) | **52/0** | Lihat §2.1 |
| `prisma/check-wa2a-prakirim-db.mjs` (`WA2A2_DB_URL`) | **123/0** | Lihat §2.2 |
| Kontrol sensitivitas DB: revalidasi jam akhir dihapus sementara dari service, lalu blob dipulihkan dan sha256 dicek | 121/2 — **R-5 dan R-6 gagal sesuai harapan** (hasil LAYAK atas data kedaluwarsa) | Membuktikan uji DB menangkap hilangnya jam akhir |
| `check-wa2a-approval-f4-db` (`WA2F4_DB_URL`) | 121/0 | Sama dengan baseline |
| `check-wa2a-contact-db` / `check-wa2a-access-db` / `check-wa2a-message-f3-db` | 67/0 · 68/0 · 72/0 | Sama dengan baseline |
| `check-wa2a-lingkup` · `check-wa2a-g-static` · `check-wa2a-message-f3` · `check-wa2a-message-policy` · `check-wa2a-approval-f4` · `check-sg05-batas-fixture` | 73/0 · 152/0 · 65/0 · 99/0 · 69/0 · 55/0 | Working tree belum bersih (tanpa `WA2A_BUKTI`). Hasil `WA2A_BUKTI=1` pada HEAD bersih dicatat di deskripsi PR. |
| `tsc --noEmit` · `next lint` · `eslint` (3 berkas baru) | exit 0 · exit 0 · exit 0 | |

### 2.1 Statis (`check-wa2a-prakirim.mjs`)

**Aturan A-0–A-13 lulus pada repo nyata:**

| Aturan | Isi |
|---|---|
| A-0 | Sintaks |
| A-1 | Ekspor = 2 fungsi, gerbang lebih dulu |
| A-2 | Tanpa `$transaction`/`$executeRaw`/`*Unsafe` |
| A-3 | Impor = allowlist persis; WA-1 hanya lewat bridge; tanpa `import()` |
| A-4 | Tanpa `successKey`, `'RUNNING'`, `'FAILED'`, `fetch`, `process`, `console`, hold massal WA-1 |
| A-5 | Tulis Prisma = satu `updateMany` pesan di `tahanPesan` |
| A-6 | Tenant pada semua SQL/kueri |
| A-7 | Penjaga `{id, tenantId, state, version}` |
| A-8 | Urutan kunci + jam akhir + pesan sesudah approval |
| A-9 | Paritas bentuk dengan `revalidasiPesan` F4: 14 kondisi + urutan helper |
| A-10 | Audit tanpa nomor |
| A-11 | Urutan hold + audit di `tx` |
| A-12 | Kelayakan O-6 |
| A-13 | Kontrak token |

**Kontrol.**
- Kontrol positif lulus: berkas asli; seluruh berkas CRLF (emulasi, **bukan** bukti suite Windows); token terlarang di komentar.
- 35 mutasi masing-masing ditangkap **persis** oleh aturan sasaran. M-14 (menerima FAILED) sah tertangkap A-4 + A-12.
- M-27 memastikan perubahan F4 yang tidak diikuti A2 juga ditangkap.

**Batas klaim:** uji ini menilai bentuk satu berkas (AST). Ia bukan call graph lintas modul dan bukan bukti semantik. A-9 hanya kesamaan bentuk; kesamaan hasil dibuktikan di DB (P-x).

### 2.2 DB (`check-wa2a-prakirim-db.mjs`, 123/0)

| Kelompok | Isi (semua lulus) |
|---|---|
| G | Flag mati / produksi / sistem → FORBIDDEN; tenant di luar allowlist → NOT_FOUND; 5 bentuk masukan → VALIDATION; pesan tidak ada → NOT_FOUND. Semuanya tanpa mutasi. |
| N | Jadwal (customer) dan milestone ALL_FAST (principal + grant) → LAYAK, token lengkap dan beku. LAYAK tidak menulis pesan, approval, maupun audit. Pemeriksaan ulang tetap LAYAK. |
| D/P (23 skenario + kontrol) | Lihat rincian di bawah tabel. |
| V | Lihat rincian di bawah tabel. |
| I / T | Lihat rincian di bawah tabel. |
| TK | Lihat rincian di bawah tabel. |
| CM | Pemanggil melempar sesudah DITAHAN → hold rollback utuh. Commit normal → hold + 2 audit. Pemicu gagal audit (`WA2_PRAKIRIM_REVALIDASI_GAGAL` dan `WA2_APPROVAL_DIHENTIKAN`) → rollback tanpa efek parsial; sesudah pemicu dilepas, hold yang sama berhasil. |
| R (konkurensi nyata) | Lihat rincian di bawah tabel. |
| A / E / Z | Lihat rincian di bawah tabel. |
| BERSIH | Sesudah hapus tenant: 0 tenant/pesan bertanda, 0 kontak bernomor uji, 0 fungsi pemicu uji (diverifikasi). |

**D/P.** Setiap skenario memakai fixture berpasangan: PENDING diputus F4 `setujuiPesanKlien`, APPROVED dinilai A2, dengan drift yang sama. Pada **23/23** skenario A2 = F4 (hasil, alasan, state pesan). Approval A2 berakhir APPROVED/CANCELLED, dengan 1 audit A2 per hold.
- Kontak: verifikasi habis; INACTIVE; UNVERIFIED; bahasa ≠ snapshot.
- Consent: OPT_OUT; versi berubah.
- Grant: validUntil lewat; status EXPIRED; REVOKED; principal dipindah.
- Sumber berubah.
- Konfirmasi diinvalidasi; K7 konfirmasi baru.
- Milestone ganda / dihapus lewat service operasional.
- Kandidat BLOCKED.
- Voyage non-NYATA.
- activeKey drift; isi pesan dirusak (simulasi korupsi, pemicu dilewati); proposalHash / basisFingerprint disunting.
- Konfirmasi > 12 jam dan milestone > 24 jam terlewati **sesudah** approval.

**V.**
- Pesan PENDING_APPROVAL / CANCELED → `MESSAGE_NOT_APPROVED`.
- Approval APPROVED+FAILED / RUNNING / SUCCEEDED dan status CANCELLED → `APPROVAL_NOT_ELIGIBLE`; tanpa mutasi.
- Opt-out / cabut grant / nonaktifkan kontak lewat service → jalur hold K3 lebih dulu; A2 `MESSAGE_NOT_APPROVED`, tanpa mutasi tambahan.
- V-10: `expiresAt` lewat pada APPROVED → **LAYAK** (O-4/T-2; tanpa TTL APPROVED).

**I / T.**
- Version ±1 dan sidik basi → `INPUT_STALE`, tanpa mutasi.
- Pesan tenant A dari konteks B → NOT_FOUND; A dan B tidak berubah.
- Relasi rusak → FORBIDDEN tanpa mutasi, termasuk approval/pesan yang ditunjuk:
  - `approvalRequestId` kosong;
  - menunjuk approval pesan lain;
  - subjectId disunting;
  - approval **tenant B**;
  - id tidak ada;
  - subjectType disunting.
- Kind disunting → `APPROVAL_POLICY_MISMATCH`.

**TK.**
- Sah di tx yang sama.
- Salinan bernilai sama di tx yang sama juga sah (registri berbasis nilai).
- Dipalsu (version / approvalVersion / dinilaiPada) → false.
- Konteks tenant lain → false.
- Konteks sistem → FORBIDDEN.
- Tx lain (sudah commit) → false; tx tenant B → false.
- Baris berubah di tx yang sama → false.

**R (konkurensi nyata).**
- **R-1–R-4:** A2 LAYAK, lalu pemanggil menahan tx 1,2 s. Opt-out, nonaktifkan kontak, cabut grant, dan batal **menunggu** kunci A2; token tetap sah sampai commit; sesudahnya pesaing berhasil.
- **R-5–R-6:** verifikasi kontak / grant kedaluwarsa selama A2 menunggu kunci → DITAHAN (jam akhir sesudah kunci). R-7 kontrol → LAYAK.
- **R-8–R-9:** approval / pesan diubah transaksi lain selama A2 menunggu kunci → `CONCURRENT_CHANGE`, tanpa mutasi A2.
- **R-10–R-13:** balapan bebas 10× (opt-out, nonaktifkan, cabut grant, batal). Tanpa galat atau deadlock; keadaan akhir konsisten. Kedua urutan terjadi (sebaran LAYAK / `MESSAGE_NOT_APPROVED` / `CONCURRENT_CHANGE`).
- **R-14:** 3 A2 bersamaan (6×) → semua LAYAK, tanpa mutasi. LAYAK ≠ klaim.

**A / E / Z.**
- 28 audit pra-kirim tanpa nomor utuh (dibandingkan dengan semua e164 kontak tenant).
- Setiap audit memuat state, alasan, approvalRequestId, dan dinilaiPada; pelaku = konteks staf.
- 0 `successKey`; 0 approval RUNNING/SUCCEEDED selain 2 baris yang sengaja disunting uji; 0 pesan di status kirim.
- Jebakan egress JS 0 panggilan.
- Invarian approval aktif ↔ pesan berlaku terpenuhi.
- Tenant B tidak tersentuh.

## 3. Batas jaringan, provider, dan lingkungan

- **Jaringan (koreksi 4):** uji DB memakai koneksi PostgreSQL loopback melalui mesin Prisma (native); koneksi itu diizinkan.
  - Yang dijebak di sisi JS: `fetch`, `http(s).request/get`, `net.connect/createConnection`, `tls.connect`, `dns.lookup`. Jebakan tidak mencakup kode native.
  - Klaim "tanpa provider/Send" bersandar pada jebakan (0 panggilan) dan uji statis (A-3/A-4: impor allowlist, tanpa `fetch`/`node:*`/modul WA-1 langsung).
  - Dokumen ini **tidak** mengklaim "nol aktivitas jaringan".
- Tidak ada provider WhatsApp, kredensial, nomor nyata, aktivasi flag nyata, deploy, maupun Send.
- **Hanya Linux.** Suite ini belum dijalankan di Windows. Emulasi CRLF pada uji statis bukan bukti Windows.
- **Data uji:** sintetis bertanda `WA2A2-`, nomor pola `+62996…`.
  - DB ditolak sebelum menulis bila host bukan loopback, ada parameter host tambahan, nama DB kosong atau mirip produksi, `NODE_ENV=production`, `DATABASE_URL`/`DIRECT_URL` ambigu, atau DB berisi tenant non-uji.
  - Penjaga ini tidak bergantung pada `NODE_ENV=test` saja.

## 4. P-2 vs P-3

| | P-2 (dokumen ini) | P-3 (belum) |
|---|---|---|
| Isi | Fungsi revalidasi pra-kirim A2 dan uji mandirinya | Send (F-II FAKE/loopback) memanggil A2 di transaksi klaim yang sama |
| Bukti | Uji statis + DB di atas | Uji statis atas kode Send nyata + runtime dengan mutasi "panggilan dihapus"; 0 panggilan provider; klaim tunggal; idempotensi tidak replay antar-tenant |
| Status | Bukti teknis tersedia di Linux pada blob di kepala dokumen; menunggu review PR dan keputusan merge owner | Belum ada jalur Send; implementasi F-II belum disetujui |

Saat ini A2 **belum dipanggil** jalur produksi mana pun. Pemanggil pertamanya adalah F-II kelak (P-3).

## 5. Celah dan batas yang tercatat

1. **Windows belum diuji.** Bukti hanya Linux.
2. **X-5 (asal data) tidak tercapai secara mandiri lewat DB.** Resolver akses (R7) menolak voyage non-NYATA lebih dulu (`ACCESS_DENIED`), sama dengan F4 (S-7, paritas). X-5 dipertahankan sebagai pertahanan berlapis.
3. **Cabang R5 e164/party tidak tercapai lewat DB.** `WaContact.e164`/party dan snapshot pesan tidak dapat diubah (pemicu `wa2a_contact_guard` / `wa2a_client_message_guard`). Bahasa (X-2) diuji. Korupsi snapshot hanya disimulasikan dengan `session_replication_role=replica` (X-1b, superuser di DB sekali pakai).
4. **Token** adalah bantuan dalam-proses berbasis nilai.
   - Salinan bernilai sama di tx yang sama juga sah (TK-2).
   - Token bukan kontrol keamanan lintas proses. Jaminannya kunci DB sampai commit dan penjaga version.
   - Exactly-once tidak diklaim.
5. **TTL APPROVED tidak ditegakkan** (O-4/T-2; V-10). **Keputusan TTL wajib sebelum F-II.**
6. **Retry FAILED** ditunda ke F-II (O-6). A2 menolaknya sebagai KONFLIK.
7. **Hold pada pemeriksaan awal memakai bacaan sebelum kunci.** Kunci approval → pesan lalu memverifikasi state/version tak berubah (bila berubah: KONFLIK). Akibatnya, kondisi gagal sesaat yang pulih bersamaan tetap menghasilkan hold. Ini konservatif (gagal aman), sama dengan pola F4.
8. **Relasi approval rusak** menghasilkan FORBIDDEN tanpa perbaikan otomatis. Jalur operator untuk memperbaikinya belum ada.
9. **Timeout transaksi pemanggil** default 5 s. Penantian kunci yang lebih lama berakhir rollback (gagal tertutup); tidak diuji khusus untuk A2. Pola ini diuji di F4.
10. **A-9 statis** hanya kesamaan bentuk. Kesamaan hasil dibuktikan pada 23 skenario DB, bukan seluruh ruang masukan.

## 6. Status

- **P-2:** bukti teknis tersedia (Linux, blob di kepala dokumen), dengan celah §5. Menunggu review PR A2 dan keputusan owner terpisah untuk merge.
- **P-1:** tetap seperti sebelumnya.
- **P-3:** belum.
- **SG-05: OPEN.**
- **WA-2a 2a-G:** OWNER ACCEPTED (OD-30), tidak berubah.
- Tidak ada F-II, P-3, WA-3, provider, maupun integrasi produksi yang dimulai.
