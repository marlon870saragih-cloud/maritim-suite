# WA-2a — Bukti perbaikan gate lingkup F1–F4 (I/H/P)

**Status:** diimplementasikan di branch `fix/wa2a-gate-lingkup-ihp`, menunggu review dan keputusan merge owner. Bukan izin 2a-G, deploy, migrasi, aktivasi flag, atau pengiriman WhatsApp.

Keputusan owner (16 Oktober 2026): G-D1 tiga lapis I/H/P dengan deteksi impor transitif; G-D2 2C/2E ikut; G-D3 I-2 diperluas ke berkas pendukung F3/F4; G-D4 pengecualian hanya tuple basis, path, blob akhir. Scope: 12 path persis. Rancangan dan daftar I-2: [WA-2a-NEXT-PHASE-DRAFT.md §5](WA-2a-NEXT-PHASE-DRAFT.md#5-perbaikan-gate-lingkup-f1f4-e-g1--diimplementasikan-di-pr-gate-menunggu-reviewmerge).

## 1. Identitas yang diuji

| Item | Nilai |
|---|---|
| Baseline `main` | `f3049187334d4665eb276b125f6a1e9918da41bb` (merge PR #28), diverifikasi `git fetch` sebelum bekerja |
| **HEAD yang diuji** | `4da70eb7cb3b20de390cd0c050b4d79035b53cf3` — commit kode gate (9 berkas `prisma/`) |
| Blob helper / manifest pada HEAD uji | `ec75d569b90ad7360d22140e9e5b6fc302637a25` / `dd551ae6822108b49dfc98c3f5d9104d1640ed47` |
| Commit sesudah HEAD uji | hanya dokumentasi: berkas ini, `WA-2a-NEXT-PHASE-DRAFT.md`, `TAH-CURRENT-CHECKPOINT.md` — diverifikasi dengan `git diff --name-only 4da70eb HEAD` dan dicatat di deskripsi PR |
| Lingkungan | Node 22.22.0, git 2.43.0, Linux; clone `git clone --shared` sekali pakai di direktori sementara; `node_modules` disambungkan lewat symlink yang ter-ignore; tanpa DB, tanpa jaringan |
| Ref di clone uji | `refs/remotes/origin/main` dan `refs/heads/main` di-set ke baseline **di clone saja**; ref repo kerja tidak dipindahkan |

Semua hasil di §2–§4 adalah **hasil aktual yang dijalankan Claude Code pada 16 Oktober 2026 malam** pada identitas di atas. Hasil sebelum tanggal itu dipisah di §6.

## 2. Hasil aktual pada HEAD uji (`WA2A_BUKTI=1`, working tree bersih)

| Uji | Baseline `f304918` | HEAD uji `4da70eb` | Exit |
|---|---|---|---|
| F1 `check-wa2a-message-policy.mjs` | 90/0 | **100/0** | 0 |
| F2 `check-wa2a-template.mjs` | 51/0 | **61/0** | 0 |
| F3 `check-wa2a-message-f3.mjs` | 54/0 | **66/0** | 0 |
| F4 `check-wa2a-approval-f4.mjs` | **60/1** (L182 `semua.includes(SVC)`) | **70/0** | 0 |
| 2C `check-wa2a-contact.mjs` | 29/0 | **37/0** | 0 |
| 2E `check-wa2a-access.mjs` | 28/0 | **36/0** | 0 |
| Helper `check-wa2a-lingkup.mjs` | — (baru) | **50/0** | 0 |
| 2B `check-wa2a-schema.mjs` (tidak diubah) | statis 32/0, DB dilewati | statis 32/0, DB dilewati | 3 (DILEWATI DB) |
| Regresi WA-1 `check-comm-policy.mjs` | — | 326/0 | 0 |
| Regresi TAH `check-tah-policy.mjs` | — | 322/0 | 0 |

Baris bukti yang dicetak helper: `HEAD=4da70eb7cb3b20de390cd0c050b4d79035b53cf3 basis=f3049187334d4665eb276b125f6a1e9918da41bb origin/main=f3049187334d4665eb276b125f6a1e9918da41bb helper=ec75d569… manifest=dd551ae6…`.

Pada repo kerja (sebelum commit, working tree berisi perubahan yang sama) hasilnya identik kecuali jumlah asersi mode bukti: F1 99/0, F2 60/0, F3 65/0, F4 69/0, 2C 36/0, 2E 35/0, helper 50/0. Selisih +1 di clone = asersi "mode bukti: working tree bersih".

Sebelum tuple pengecualian G-D4 dicatat, keenam uji fase **gagal** pada P-global karena keenam uji itu sendiri adalah berkas beku yang diubah — bukti bahwa P bekerja pada repo nyata.

## 3. Kontrol positif dan negatif dengan skrip uji sebenarnya

Dijalankan di clone yang sama, ref `origin/main` diganti sesuai skenario.

| ID | Skenario | Hasil |
|---|---|---|
| E-1 (positif) | **`main` bersih pasca-merge** (origin/main = HEAD = `4da70eb`, diff kosong), enam uji dengan `WA2A_BUKTI=1` | semua exit 0 (100/0, 61/0, 66/0, **70/0**, 37/0, 36/0) — cacat L182 tidak muncul lagi |
| E-2 (positif) | **Branch dokumentasi**: commit perubahan `docs/TAH-CURRENT-CHECKPOINT.md` | semua exit 0, angka sama |
| E-3a (negatif) | Edit unstaged `src/services/whatsapp/wa-message-approval.service.ts` | F4 exit 1: P-global dan I-2 gagal |
| E-3b (negatif) | Route untracked `src/app/api/uji-x/route.ts` mengimpor `@/services/whatsapp/wa-phone` | F4 exit 1: I-1 gagal dengan rantai `src/app/api/uji-x/route.ts → src/services/whatsapp/wa-phone.ts` |
| E-4 (negatif) | `WA2A_BUKTI=1` dengan berkas untracked | F2 exit 1: "mode bukti: working tree bersih" gagal |

## 4. Uji helper (`check-wa2a-lingkup.mjs`, 50/0)

**R — repo nyata (12 asersi):** manifest sah; 5 fase / 49 berkas; rekaman H F1, F2, F3, PR26, F4 lulus; blob I-2 = `git hash-object` = blob tree HEAD untuk 15 berkas; 75 atribut `.gitattributes` (`text`, `eol`, `filter`, `diff`, `crlf` × 15) `unspecified`; pemindai I-1 menemukan 18 perujuk transitif modul WA-1 (kontrol tidak hampa); perujuk WA-2 = daftar manifest (kosong); tokenisasi specifier (komentar/string diabaikan, `import('@/' + n)` dihitung dinamis).

**S — skenario pada clone sementara:** 9 kontrol positif (P-01..P-09) dan 29 asersi negatif (N-01..N-23 dengan sub-kasus), rinciannya di [rancangan §5.4](WA-2a-NEXT-PHASE-DRAFT.md#54-skenario-uji-helper-check-wa2a-lingkupmjs-clone-sementara). Cakupan yang diminta owner:

| Kebutuhan | Skenario |
|---|---|
| Baseline bersih, branch dokumentasi, komentar menyerupai impor | P-01, P-02, P-03 (+ E-1, E-2) |
| Committed, staged, unstaged, untracked | N-03, N-02, N-01, N-04 |
| Penghapusan, rename | N-05, N-06, N-07 |
| Impor langsung, transitif | N-09, N-10, N-12; N-11 |
| Ref hilang, riwayat hilang | N-13; N-14 |
| Manifest tidak valid | N-15a–d |
| Basis tidak sah | N-16 |
| Mode fase, jangkar, path di luar allowlist | P-06, N-17a; N-17b; N-17c |
| Pengecualian basis/blob salah | P-05; N-18a, N-18b |
| Mutasi helper diff kosong | N-19 |
| Mode bukti pada tree kotor | P-08; N-20 |
| Perubahan ilegal sesudah commit | N-21 |
| Hash mengikuti aturan Git dan `.gitattributes` | P-09 (CRLF + `*.ts text` → blob sama), N-22 (CRLF tanpa atribut → I-2 gagal) |
| Uji WA-2a lama tidak bisa dilemahkan diam-diam | N-23 |

Clone sementara dibuat di `os.tmpdir()` dan dihapus di akhir; `git status` repo kerja tidak berubah oleh skenario (diverifikasi).

## 5. Asersi lama → pengganti

Semua asersi perilaku dipertahankan. Yang diganti hanya asersi lingkup berbasis `git diff main`:

| Uji | Asersi lama | Pengganti |
|---|---|---|
| F1 | "hanya berkas F1 (+F2/F3) yang berubah/baru" | H F1 sama persis + daftar literal 4 path; P-global |
| F1 | `wa2-policy.ts` tambah-saja terhadap `main` | H F1 tambah-saja pada diff PR #23; P tambah-saja terhadap basis |
| F2 | "hanya berkas F2 … yang berubah/baru" | H F2 sama persis + daftar literal 3 path; P-global |
| F3 | badan `siapkanCandidate`/`siapkanDalamTx` dan klausa resolver "IDENTIK dengan main" | sama, dibandingkan dengan basis F3 `cd276bb…` (nama asersi diubah) |
| F3 | "hanya berkas F3 …"; larangan migrasi/schema/…; pengecualian K3 F4; `wa2-policy.ts` tambah-saja | H F3 + daftar literal 16 path; larangan dinilai pada diff PR #25; K3 dinilai pada diff PR #27; P |
| F4 | allowlist; L179 berkas beku; L180 tanpa route/UI; L181 tambah-saja; **L182** | H F4 = allowlist literal 22 path (memuat service approval); L179–L181 pada diff PR #27; L180 lintas fase = I-1; L182 = H "sama persis, tidak kosong" |
| 2C / 2E | berkas beku vs `main` + pengecualian baris; "pengecualian tidak dipakai untuk berkas lain"; 2E `wa-lock`/`wa2-policy` tambah-saja | H: berkas beku pada diff PR #25/#27 = persis kunci pengecualian dan berubah hanya pada baris disetujui; P: berkas beku terhadap basis hanya lewat tuple; 2E tambah-saja terhadap basis |

Pengecualian baris F3/F4 lama **terbukti tepat** pada diff historis (2C: `communication.service.ts`, `check-comm-policy.mjs` di PR #25; `check-comm-policy.mjs` di PR #27; 2E: ditambah `wa-contact.service.ts`, `wa-consent.service.ts` di PR #27).

Tuple G-D4 PR ini (basis `f3049187334d4665eb276b125f6a1e9918da41bb`):

| Path | Blob akhir |
|---|---|
| `prisma/check-wa2a-access.mjs` | `6585f23d5b4bd6998f608729e987a3e52f5d08ef` |
| `prisma/check-wa2a-approval-f4.mjs` | `a511cd34a698fa174303689b56fda0adc6f8d6cf` |
| `prisma/check-wa2a-contact.mjs` | `de33fe626a8f1c254aacb27f11431baee1401a2f` |
| `prisma/check-wa2a-message-f3.mjs` | `4b2c19134800ce2d0c64c0f1ee8505126a22ca26` |
| `prisma/check-wa2a-message-policy.mjs` | `118eced51c321296cb84a8e09f595094d3507320` |
| `prisma/check-wa2a-template.mjs` | `b2ae0eab54cd2cb01fb6c4793eca4cb42cfcedbd` |

Setelah merge, branch berikutnya memiliki basis lain sehingga keenam tuple tidak berlaku lagi.

## 6. Bukti historis (tidak dijalankan ulang di sini)

- 16 Oktober 2026 (sesi sebelumnya, dilaporkan Claude Code): F4 60/1 di `main` `5e58237`; F1 89/1, F2 50/1, F3 53/1, F4 59/2 di branch PR #28 `383b93e`. Angka baseline `f304918` pada §2 adalah run baru pada HEAD `main` sesudah PR #28.
- Hasil F4 61/0 dan 121/0 pada `d665216` (sebelum merge #27) tetap laporan historis di [WA-2a-F4-EVIDENCE.md](WA-2a-F4-EVIDENCE.md).

## 7. Tidak dijalankan dan alasannya

- Uji DB (`*-db.mjs`, bagian DB `check-wa2a-schema.mjs`), `check-comm-ui.mjs` (butuh DB + Playwright + `next dev`): PR ini tidak mengubah kode aplikasi, schema, atau migrasi, dan izin tidak mencakup DB.
- `tsc --noEmit`, `next lint`, `next build`: berkas yang diubah hanya `.mjs`/`.json`/`.md` di `prisma/` dan `docs/`, di luar `src/`; sintaks `.mjs` diperiksa dengan `node --check` dan JSON dengan `JSON.parse`.
- Tidak ada CI di repo; tidak ada klaim CI hijau.

## 8. Keterbatasan

- **Deteksi impor:** `import()`/`require()` dengan ekspresi terhitung hanya dihitung (info), tidak diselesaikan; pemuatan lewat `fs`/`eval`, alias di luar `tsconfig.json`, dan kode hasil generate tidak terdeteksi; regex literal yang memuat tanda kutip dapat mengacaukan tokenisasi.
- **Integritas manifest:** manifest tidak melindungi dirinya sendiri. Daftar lingkup literal di uji fase membatasi perusakan rekaman H, tetapi penambahan tuple pengecualian atau perubahan `i1`/`i2` hanya tertangkap review owner pada diff PR.
- **Riwayat dan basis:** H butuh commit fase (clone dangkal gagal tertutup); kesegaran `origin/main` tidak diperiksa offline; di `main` sendiri P hanya menjaga perubahan belum di-commit.
- **Berkas ter-ignore** tidak terlihat oleh P.
- **2B (`check-wa2a-schema.mjs`)** tidak diubah dan tetap mensyaratkan ref lokal `main` = `origin/main`.
