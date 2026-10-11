# WA-2a Step 2F — F3: Bukti Draft, Preview & Konfirmasi Jadwal

| Item | Nilai |
|---|---|
| Status | **SELESAI DI LOKAL — menunggu review owner** (PR OPEN, belum di-merge) |
| Persetujuan | D1–D3 (Solusi A), D2 (2 ekspor WA-1 + pengecualian uji spesifik), D5, D6-A, D6-B, D7, D8, D9, D-GRANT (opsi A), D-FRESHNESS, kebijakan draft F3 |
| Basis | `main` @ `cd276bb296acf898b5bd8558c6711b9361178736` (F1 #23 + F2 #24 merged), working tree bersih sebelum mulai |
| Cakupan | Service layer saja: adapter WA-1, evaluator freshness D6, konfirmasi jadwal, draft & preview pesan klien. **Tanpa** approval (F4), Send, API/UI, LLM, auto-reply, migrasi |
| Produksi | Tidak disentuh. Flag `WA2_CLIENT_FOUNDATION_ENABLED` default OFF; produksi selalu ditolak gerbang. Status `maritime_portal` di produksi tidak disentuh dan tidak diklaim |

## 1. Berkas

| Berkas | Jenis | Isi |
|---|---|---|
| `src/services/communication/communication.service.ts` | **WA-1, tambahan (D2)** | `export` pada `siapkanDalamTx` yang sudah ada + fungsi baru `muatCandidateDalamTx` (3 baris). Badan `siapkanCandidate` & `siapkanDalamTx` identik dengan `main` (diuji sidik) |
| `src/services/whatsapp/wa1-bridge.ts` | Baru | SATU-SATUNYA pengimpor WA-1; hanya ekspor ulang dari 3 modul; tanpa gerbang/flag WA-1 |
| `src/services/whatsapp/wa-access-resolver.ts` | Ubah (D-GRANT) | + `grants` (id, kategori, validUntil) per voyage dari query & kunci YANG SAMA; klausa `FROM … WHERE … FOR SHARE` identik dengan `main` (diuji) |
| `src/services/whatsapp/wa2-policy.ts` | Tambahan (data) | Konstanta D6, kategori wajib per keluarga, peran pencatat, aturan pilih grant, kode alasan F3 |
| `src/services/whatsapp/wa-message-policy.ts` | Ubah (F1, D-FRESHNESS) | `penilaianFreshness` tanpa bukti → `FRESHNESS_EVIDENCE_MISSING`; `pilihGrantUntukPesan`, `kategoriWajibUntuk` |
| `src/services/whatsapp/wa-freshness.ts` | Baru, murni | Evaluator D6-A (konfirmasi ≤ 12 jam) & D6-B (MANUAL ≤ 24 jam, tanpa ganda) |
| `src/services/whatsapp/wa-schedule-confirmation.service.ts` | Baru | Catat & invalidasi konfirmasi ETA/ETD |
| `src/services/whatsapp/wa-message.service.ts` | Baru | Draft & preview `WaClientMessage` |
| `prisma/check-wa2a-message-f3.mjs` | Baru | 54 pemeriksaan statis + murni |
| `prisma/check-wa2a-message-f3-db.mjs` | Baru | 72 pemeriksaan DB (konkurensi, rollback, diferensial WA-1) |
| `prisma/check-comm-policy.mjs` | **Uji beku WA-1 — pengecualian #2 (D2)** | Allowlist perujuk +1 path persis `src/services/whatsapp/wa1-bridge.ts` |
| `prisma/check-wa2a-contact.mjs`, `prisma/check-wa2a-access.mjs` | Lingkup (disetujui) | Pengecualian PER BARIS untuk 2 berkas di atas; berkas/baris beku lain tetap ditolak. 2E: +1 asersi tipe `grants` (D-GRANT) |
| `prisma/check-wa2a-message-policy.mjs` | Lingkup + D-FRESHNESS | S1: hanya adapter yang mengimpor WA-1 (3 modul persis). S2: +path F3 persis. P3/P4: asersi "tanpa aturan" DIGANTI asersi D6 (90 pemeriksaan, sebelumnya 86) |
| `prisma/check-wa2a-template.mjs` | Lingkup | S2: +path F3 persis |
| `docs/whatsapp/WA-2a-F3-EVIDENCE.md` | Baru | Dokumen ini |

**Tidak berubah:** schema, migrasi, rollback, `tah-policy.ts`, `registry.ts`, Validator V3, template v1 (`wa-template.ts`), service 2a-C (`wa-contact`, `wa-consent`, `wa2-gate`, `wa-lock`), dan semua berkas WA-1 selain dua ekspor di atas.

## 2. Perilaku

**Konfirmasi jadwal (F3c).**
- Hanya ADMIN/MANAJER_OPERASI, hanya ETA/ETD. Nilai wajib = jadwal voyage terkini (kunci tanggal K-1) pada voyage NYATA milik tenant — **tidak ada konfirmasi palsu**.
- Baris `Voyage` dikunci **FOR UPDATE**, dan jam diambil **sesudah** kunci didapat, sehingga permintaan identik bersamaan diserialkan dan yang kedua menjadi `SUDAH_ADA`. Uji mutasi M3 membuktikan `FOR SHARE` saja menghasilkan duplikat.
- Invalidasi sekali (dijaga trigger 2B); berulang → `SUDAH_DIINVALIDASI`. Audit atomik, tanpa teks catatan mentah.

**Draft (F3d)** — satu transaksi:
1. Gerbang WA-2, sinyal milik tenant, keluarga pilot.
2. Kontak ACTIVE + VERIFIED; bahasa dari `WaContact.language`.
3. Consent `OPT_IN` (dikunci, versi disnapshot).
4. Resolver 2E: voyage sinyal ∈ akses dan kategori wajib terpenuhi. Principal → grant snapshot dipilih deterministik: masa berlaku terpanjang, lalu `grantId` terkecil; kandidat dan aturan dicatat di `fields.grant` dan audit.
5. Baru kemudian Prepare WA-1 (adapter) + revalidasi sumber + freshness D6 dari bukti DB terkunci + syarat data D8.

Semua penolakan dilempar sebagai galat → **transaksi dibatalkan utuh**, termasuk tulisan Prepare pada kandidat. Jalur WA-2 tidak pernah memblokir kandidat bersama.

Snapshot immutable + sidik (domain `WA2_SNAPSHOT`, tanpa jam evaluasi supaya revisi identik idempoten). Revisi berbeda → yang lama `CANCELED` (`REVISION_SUPERSEDED`) + yang baru `DRAFT`, atomik. Nomor revisi diserialkan dengan kunci kandidat.

**Preview.** Sidik sodoran = sidik tersimpan = sidik dihitung ulang. Kontak, consent (versi sama), akses, grant snapshot, kandidat, sumber, dan freshness diperiksa ulang:
- akses atau consent berubah → `NEEDS_REVIEW`;
- sumber atau kandidat berubah → `BLOCKED` (pesan saja; kandidat WA-1 tidak disentuh);
- freshness tidak lolos → ditolak tanpa ubah state.

**Audit WA-2** ditulis pada tabel `WaClientMessage`, bukan tabel kandidat WA-1, karena riwayat kandidat WA-1 membaca AuditLog bertabel kandidat.

## 3. Hasil uji (PostgreSQL 16 loopback sekali pakai, data sintetis, egress dijebak)

| Suite | Hasil |
|---|---|
| `check-wa2a-message-f3` (baru) | 54/0 |
| `check-wa2a-message-f3-db` (baru) | 72/0 |
| `check-wa2a-message-policy` (F1) | 90/0 |
| `check-wa2a-template` (F2) | 51/0 |
| wa2a-access · access-db · contact · contact-db | 28 · 68 · 29 · 67 (0 gagal) |
| `check-wa2a-schema` (2B) | 128/0 **setelah commit**; sebelum commit 127/1 — lihat §6 |
| Validator V3 · intake · tah-policy · tah-ledger | 226 · 417 · 322 · 98 (0 gagal) |
| comm-policy · schema · prepare · approval · send · cancel · read | 326 · 85 · 98 · 95 · 117–121 · 73 · 42 (0 gagal) |
| **comm-api · comm-e2e · comm-ui** (`next dev` lokal, Playwright/Chromium, perangkap egress) | **43 · 108 · 55 (0 gagal)** — identik dengan baseline `main` sebelum F3, dan dijalankan dua kali (gate F3a dan F3e) |
| eval3-ledger-db · tenant-guard | 14 · 2 (0 gagal) |
| `tsc --noEmit` · `npm run lint` · eslint berkas F3 | 0 galat · lulus · lulus |
| `prisma migrate diff --exit-code` | **0 — "No difference detected"**; 0 berkas migrasi/schema/rollback berubah |

### Konkurensi & rollback (service sungguhan, dua koneksi atau lebih)

| Uji | Hasil |
|---|---|
| 10× enam konfirmasi identik bersamaan | tepat 1 baris; 1 `DICATAT` + 5 `SUDAH_ADA`; 0 galat |
| 10× dua kontak, kandidat sama, bersamaan | keduanya sukses; satu kandidat; revisi 1 & 2; 0 benturan |
| 10× cabut grant ∥ buat draft | tak pernah ada pesan aktif ber-grant `REVOKED` |
| Audit draft gagal SETELAH revisi lama dibatalkan (trigger uji) | revisi lama tetap `DRAFT` & aktif; tanpa revisi baru; tanpa audit penggantian |
| Penolakan sebelum Prepare (kontak, consent, akses) | 0 kandidat baru; baris consent `NONE` tidak tersisa |
| Penolakan freshness/sumber setelah Prepare | kandidat tidak dibuat/diblokir (rollback) |

### Diferensial WA-1 (perilaku terlihat)

| Uji | Hasil |
|---|---|
| `daftarCandidate` WA-1: kandidat via WA-2 vs via Prepare WA-1 | identik (kecuali id/waktu/pelaku) |
| `detailCandidate` WA-1 | identik; pesan WA-2 tidak tampil di WA-1 |
| `riwayatKomunikasi` WA-1 | identik (hanya `WA1_CANDIDATE_DIBUAT`), tanpa audit `WA2_*` |
| Aksi WA-1 berikutnya (revisi simulasi) | hasil sama pada kedua kandidat |
| Draft WA-2 pada kandidat yang punya pesan & approval WA-1 | baris pesan & approval WA-1 tidak berubah sedikit pun |
| Flag FAKE WA-1 | tidak diset selama seluruh jalur WA-2 (WA-2 tidak bergantung padanya) |

### Uji mutasi (sementara, lalu dipulihkan)

| Mutasi | Terdeteksi oleh |
|---|---|
| M1 hasil resolver diabaikan di draft | DB (6) |
| M2 consent OPT_IN tidak diperiksa | DB (2) |
| M3 konfirmasi FOR UPDATE → FOR SHARE | statis (1) + **uji konkurensi DB** (duplikat) |
| M4 batas 12 jam dihapus | DB (1); uji statis berhenti dengan galat |
| M5 grant pertama dipilih (tanpa urutan) | statis (3) + DB (1) |
| M6 ACTIVE/VERIFIED kontak tidak diperiksa | DB (2) |
| M7 syarat grant belum kedaluwarsa dihapus dari resolver | statis (1) + DB (1) |
| M8 preview tidak menolak sumber berubah | statis (1) + DB (2) |
| M9 peristiwa ganda diizinkan | statis (2) + DB (1) |

## 4. Pengecualian uji yang dipakai (persis)

1. `check-comm-policy.mjs` §12, perujuk modul komunikasi: **+1 path persis** `src/services/whatsapp/wa1-bridge.ts` (D2).
2. `check-wa2a-contact.mjs` S2 & `check-wa2a-access.mjs` S4: hanya dua berkas di atas, dan hanya **baris** yang disetujui (dicocokkan teks per baris). Berkas/baris lain tetap ditolak.
3. `check-wa2a-access.mjs` S1: asersi tipe `AksesVoyage` + `GrantAkses` (D-GRANT).
4. `check-wa2a-message-policy.mjs`: S1 hanya adapter boleh mengimpor 3 modul WA-1; P3/P4 diganti asersi D6 (D-FRESHNESS); S2 +path F3 persis.
5. `check-wa2a-template.mjs` S2: +path F3 persis.

Pengecualian #1 D1 (pembuat `TahApprovalRequest`) **belum** dipakai — itu F4. Tidak ada pengecualian lain.

## 5. Keterbatasan & catatan

- **Waktu milestone dengan zona IANA ber-`_`** tetap ditolak template v1 (F2); zona Indonesia tidak terpengaruh. Template v1 tidak diubah.
- **Peristiwa ganda yang disisipkan bersamaan** (phantom) tidak dicegah kunci baris; F4 wajib memeriksa ulang saat approval.
- **Pesan yang sumbernya berubah setelah APPROVED** wajib direvalidasi di WA-2b (keputusan owner D6-A).
- **Bukti freshness saat preview/approval** dinilai ulang dari DB saat itu; bukti terbaru yang sah boleh berbeda dari bukti di snapshot selama nilainya sama.
- Uji API/E2E/UI untuk route WA-2 belum ada karena WA-2 belum punya route/UI (2a-G).

## 6. Temuan: uji lingkup 2B membandingkan dengan `HEAD`

`check-wa2a-schema.mjs` (2B) memeriksa berkas beku yang berubah **dibandingkan `HEAD`**, artinya hanya perubahan yang belum di-commit.
- **Sebelum commit:** 127/1. Yang terdeteksi hanya dua berkas beku dengan pengecualian F3 yang disetujui (`communication.service.ts`, `check-comm-policy.mjs`).
- **Sesudah commit:** 128/0.
- **Uji 2B tidak diubah** karena tidak termasuk daftar pengecualian yang disetujui.
- Ketepatan baris kedua berkas itu dibuktikan oleh uji 2C/2E yang membandingkan dengan `main` per baris.
- Memperluas pengecualian per baris yang sama ke uji 2B adalah **keputusan owner**.

## 7. Bukti tidak ada perubahan produksi

Semua koneksi DB ke `127.0.0.1:55432` (cluster sekali pakai). Server uji `next dev` hanya di `localhost:3100` dengan perangkap egress. Tidak ada akses VM/GCP, deploy, migrasi produksi, WhatsApp, atau provider.
