# WA-2a — Rancangan fase berikutnya setelah F4

**Status: DRAFT UNTUK REVIEW OWNER — bukan baseline yang disahkan, BELUM IZIN IMPLEMENTASI.**

Tanggal: 16 Oktober 2026 (WITA); revisi preflight 16 Oktober 2026 malam.
Basis fitur: main setelah [PR #27](https://github.com/marlon870saragih-cloud/maritim-suite/pull/27), merge `5e58237c393a6115d3c55a5c1382dd3c5826a976`; HEAD F4 yang ditinjau `d665216acf85803092771a2b01bced5131cbe927`.
Handoff: [TAH-CURRENT-CHECKPOINT.md](../TAH-CURRENT-CHECKPOINT.md).
Bukti fondasi: [F3](WA-2a-F3-EVIDENCE.md), [F4](WA-2a-F4-EVIDENCE.md).

Dokumen ini berisi dua rancangan yang **terpisah**: perbaikan gate lingkup F1–F4 (§5) dan preflight 2a-G (§6). Semua nama fungsi, input, hasil, kode alasan dan nomor baris di bawah dibaca dari kode `main` @ `5e58237` pada 16 Oktober 2026. Nama berkas, endpoint, dan pengecualian yang **diusulkan** belum ada di repo dan belum disetujui.

## 1. Keputusan yang diminta

Tiga keputusan berikut **berdiri sendiri**; menyetujui salah satu tidak menyetujui yang lain:

1. **Merge dokumentasi PR #28** (checkpoint + dokumen ini sebagai rancangan).
2. **Perbaikan gate lingkup F1–F4 (§5):** persetujuan rancangan, lalu — terpisah — izin implementasi melalui PR kode tersendiri.
3. **Definisi dan scope 2a-G (§6):** persetujuan kontrak/scope, lalu — terpisah — izin implementasi per tahap (§6.15).

Rekomendasi: fase berikutnya **2a-G — API/UI lokal untuk alur pesan klien sampai APPROVED**, menggunakan service F3/F4 yang sudah merged. Arah scope awal yang diusulkan (masih rancangan): peran ADMIN dan MANAJER_OPERASI; tanpa link Sidebar dahulu; kontak/consent/grant/konfirmasi melalui setup lokal sintetis; tanpa schema/migrasi; alur berhenti di APPROVED.

**Keputusan merge F4 dan dua pengecualian scope sudah selesai.** Keputusan itu tidak sekaligus menyetujui dokumen ini atau implementasi 2a-G.

## 2. Fondasi yang sudah tersedia

| Bagian | Keadaan |
|---|---|
| F1 / #23 | Kebijakan status pesan, definisi beku CLIENT_WA_UPDATE, TTL 2 jam |
| F2 / #24 | Template deterministik ID/EN |
| F3 / #25 | Draft, preview, konfirmasi jadwal, freshness D6 |
| #26 | Gate berkas beku 2B dibandingkan dengan basis main |
| F4 / #27 | Request, approve, reject, cancel; revalidasi saat keputusan, maker-checker, penghentian approval tertaut |
| Koreksi P2 | Tolak memeriksa TTL serta memakai timestamp sesudah kunci approval |
| Batas sistem | Non-produksi, flag default OFF, belum Send/API/UI WA-2 atau LLM |

Keadaan APPROVED berarti keputusan staf sudah tercatat; tidak berarti pesan terkirim atau selalu tetap valid. Sumber, akses, consent atau bukti dapat berubah setelah keputusan.

## 3. Tujuan dan alur usulan 2a-G

Staf yang berwenang dapat menyiapkan, memeriksa, meminta persetujuan dan memutuskan pesan klien melalui layar lokal, dengan fakta berasal dari snapshot service.

Alur:
1. Pilih sinyal operasional yang layak, lalu kontak yang layak untuk voyage sinyal tersebut (§6.8).
2. Buat draft melalui service F3; tampilkan kode alasan bila prasyarat belum terpenuhi.
3. Preview isi snapshot tersimpan. **Satu pesan memiliki satu bahasa** (`language` = `ID` atau `EN`, mengikuti bahasa kontak); tampilkan penerima tersamar, konteks sumber dan ringkasan bukti freshness.
4. Minta approval dengan `snapshotFingerprint` yang benar-benar ditampilkan.
5. Checker yang memenuhi kebijakan menyetujui atau menolak dengan `proposalHash` yang ditampilkan; catatan penolakan wajib.
6. Staf dapat membatalkan bila status mengizinkan; revisi baru mengikuti aturan F3 (§6.9).
7. Tampilkan status, kode alasan, waktu keputusan dan riwayat yang diizinkan.

Label UI wajib: **"BELUM DIKIRIM — tidak ada pengiriman pada fase ini"**. Jangan tampilkan tombol Send, retry pengiriman, atau status delivered.

## 4. Scope usulan dan batas

**Masuk scope, jika disetujui:**
- Read service terbatas untuk daftar/detail/riwayat pesan serta kandidat sinyal/kontak (§6.2).
- API tipis yang memanggil service F3/F4; kebijakan bisnis tidak diduplikasi di route.
- UI daftar dan detail pesan, draft/preview/request/approve/reject/cancel serta alur revisi sesuai state machine.
- Isolasi tenant, kontrol peran, pembatasan field respons, penyamaran penerima, pagination dan penanganan konflik.
- Pengujian API, E2E, UI dan build lokal.

**Di luar scope:**
- Send, provider, webhook masuk, delivery receipt, retry pengiriman, WA LIVE.
- LLM, AI draft bebas, auto-reply, evaluasi model berbayar.
- Deploy, migrasi produksi, aktivasi flag pada lingkungan operasional.
- Perubahan schema/migrasi, definisi approval beku, aturan freshness atau maker-checker.
- Refaktor WA-1/TAH/V3, membuka kembali TAH/PRD-005, dan perbaikan baseline validator-remediasi.
- Pengelolaan lengkap kontak/consent/grant/konfirmasi dari UI, kecuali owner menambahkannya secara eksplisit.
- Link Sidebar (diusulkan menyusul, keputusan terpisah — §6.12).

Jika kebutuhan UI memerlukan perubahan di luar batas tersebut, siapkan usulan perubahan scope sebelum mengimplementasikannya.

**Apakah setup lokal yang sudah ada cukup untuk fase awal?** Ya untuk pengujian dan demo lokal: kontak, verifikasi, consent, grant, dan konfirmasi jadwal dapat dibuat pada DB loopback sekali pakai melalui service yang sudah ada (`buatKontak`, `verifikasiKontak`, service consent 2C, `ajukanGrant`/`putuskanGrant`, `catatKonfirmasiJadwal`). Keterbatasannya: operator belum dapat menyiapkan data tersebut sendiri dari UI, sehingga demo memakai data sintetis yang disiapkan skrip. Pengelolaan lewat UI = fase terpisah.

## 5. Rancangan perbaikan gate lingkup F1–F4 (E-G1) — usulan, belum diimplementasikan

Implementasi rancangan ini memerlukan **PR kode terpisah** dan izin owner tersendiri. Tidak ada kode atau skrip uji yang diubah oleh PR dokumentasi ini.

### 5.1 Fakta kode saat ini

| Uji | Bagian lingkup | Mekanisme |
|---|---|---|
| F1 `prisma/check-wa2a-message-policy.mjs` | S2, L219–263 | `git diff --name-only main` + `git ls-files --others --exclude-standard`; allowlist `BOLEH` persis (L223–259, sudah ditambah entri F2/F3/#26/F4); L262–263 `wa2-policy.ts` hanya ditambah |
| F2 `prisma/check-wa2a-template.mjs` | S2, L176–214 | sama; allowlist L180–212 |
| F3 `prisma/check-wa2a-message-f3.mjs` | L103–112 dan S3 L140–186 | L104/L110 `git show main:<berkas>` untuk membandingkan badan fungsi WA-1 dan klausa resolver; S3 allowlist L143–164, pengecualian baris F4 L167–183, larangan berkas beku L184 |
| F4 `prisma/check-wa2a-approval-f4.mjs` | S4, L166–182 | `git diff --no-renames --name-only main`; allowlist L170–176; L179 larangan berkas beku; **L180 "tanpa route API / UI baru (F4 hanya service)"**; L181 `wa2-policy.ts` hanya ditambah; **L182 `semua.includes(SVC)`** |
| 2C `prisma/check-wa2a-contact.mjs`, 2E `prisma/check-wa2a-access.mjs` | S2 L100–151; S4 L86–143 | denylist berkas beku `BEKU` terhadap `main` + pengecualian per baris; lulus pada branch dokumentasi |
| 2B `prisma/check-wa2a-schema.mjs` (#26) | L100–114, S3 | basis = `merge-base(HEAD, main)` dengan syarat ref lokal `main` = `origin/main` (gagal tertutup), `--no-renames` |

Akibatnya:
- **Pada `main` bersih**, diff terhadap `main` kosong sehingga L182 F4 gagal (hasil Claude 2026-10-16: F4 60 lulus, 1 gagal). Allowlist F1–F3 lulus secara hampa karena himpunan kosong.
- **Pada branch PR #28**, dua path dokumentasi tidak ada di allowlist F1–F4 (hasil Claude 2026-10-16 pada `383b93e`: F1 89/1, F2 50/1, F3 53/1, F4 59/2 — F4 gagal pada allowlist dan L182). Setelah PR #28 merged dan checkout `main` bersih, penolakan path dokumentasi tidak berlaku lagi; cacat L182 tetap ada.
- Asersi "perubahan ⊆ allowlist fase X" hanya bermakna pada branch fase X. Setiap fase sesudahnya terpaksa menambah path ke empat allowlist (lihat entri F2/F3/#26/F4 di allowlist F1), dan larangan F4 L180 akan menolak 2a-G mana pun.
- F1–F4 bergantung pada ref lokal `main` tanpa memeriksa kesesuaiannya dengan `origin/main`; F1–F3 memakai `git diff` tanpa `--no-renames`. F3 L104/L110 membandingkan dengan `main:` sehingga sesudah merge membandingkan berkas dengan dirinya sendiri.

### 5.2 Rancangan yang direkomendasikan: tiga lapis pemeriksaan terpisah

Setiap uji fase dipecah menjadi tiga lapis dengan tujuan berbeda. Tidak ada lapis yang dilewati hanya karena diff kosong.

| Lapis | Pertanyaan | Basis → target | Selalu dijalankan? |
|---|---|---|---|
| **I — invarian kode** | Apakah kode **saat ini** masih memenuhi sifat beku? | Isi working tree; tanpa diff | Ya |
| **H — rekaman lingkup historis** | Apakah fase yang sudah merged mengubah **persis** berkas yang tercatat? | `merge^1` → `merge^2` per fase (SHA 40-hex tercatat) | Ya |
| **P — lingkup perubahan berjalan** | Apakah perubahan **belum merged** menyentuh berkas beku? (+ allowlist persis untuk fase aktif) | `merge-base(HEAD, origin/main)` → working tree + untracked | Ya (P-global); P-fase hanya pada mode fase eksplisit |

**Lapis H — manifest historis (data dari repo, 16 Oktober 2026):**

| Fase | Merge | Basis (`^1`) | Kepala (`^2`) | Berkas |
|---|---|---|---|---|
| F1 #23 | `e5f86768cdb9ed412668652af83d95fd2ece07ae` | `b805f839014069e83d5aed43ffa94e749bd02a31` | `c5c041e0a17997f54b8f242d41a4d596deecce3b` | 4 |
| F2 #24 | `cd276bb296acf898b5bd8558c6711b9361178736` | `e5f86768cdb9ed412668652af83d95fd2ece07ae` | `217e39d49443da39bc5e8aa2961ed46f7f89845f` | 3 |
| F3 #25 | `2cec0ce6980987ea24cdea986971a2bbc9dde387` | `cd276bb296acf898b5bd8558c6711b9361178736` | `a7fedf7898d810d307e4de2ce4692a1c49ef78f8` | 16 |
| #26 | `0ad92516959e8b89e4f0945baccc03e8145a32d6` | `2cec0ce6980987ea24cdea986971a2bbc9dde387` | `46acda9b1224c14aac4c7967b706acbdf2e94064` | 4 |
| F4 #27 | `5e58237c393a6115d3c55a5c1382dd3c5826a976` | `0ad92516959e8b89e4f0945baccc03e8145a32d6` | `d665216acf85803092771a2b01bced5131cbe927` | 22 |

Jumlah berkas di atas dihitung dengan `git diff --no-renames --name-status <basis> <kepala>`; untuk kelima merge, tree merge = tree kepala (merge tidak membawa perubahan tambahan). Daftar path persis per fase disalin ke manifest pada PR perbaikan gate.

Asersi H per fase:
1. Basis dan kepala ada sebagai commit (`git cat-file -e <sha>^{commit}`); bila tidak tersedia (mis. clone dangkal) → **GAGAL** dengan pesan "riwayat tidak tersedia", bukan lewat.
2. `merge^1` = basis dan `merge^2` = kepala tercatat; tree merge = tree kepala.
3. Himpunan `git diff --no-renames --name-only basis kepala` **SAMA PERSIS** dengan manifest (bukan subset). Karena manifest tidak kosong, asersi ini menggantikan maksud L182 ("pemindai menemukan berkas fase") tanpa bergantung pada working tree.
4. Larangan khusus fase dievaluasi pada diff fasenya sendiri: F4 — tidak ada path `src/app/**`, tidak ada berkas beku L179, `wa2-policy.ts` tanpa baris dihapus (`git diff basis kepala -- src/services/whatsapp/wa2-policy.ts`); F1 — `wa2-policy.ts` hanya ditambah; F3 — larangan L184 dan pengecualian baris F4 tetap dinilai pada diff F4 historis.
5. Fungsi diff yang sama dipakai H dan P. Mutasi yang membuat fungsi itu mengembalikan himpunan kosong langsung menggagalkan asersi 3, sehingga P tidak dapat lulus hampa tanpa ketahuan.

**Lapis I — invarian yang menggantikan larangan berbasis diff:**
- **I-1 (pengganti F4 L180, lintas fase):** himpunan berkas `src/app/**` dan `src/components/**` yang mengimpor `@/services/whatsapp/*` (resolusi impor, termasuk relatif dan `import()` dinamis) = **PERSIS daftar disetujui**. Nilai sekarang = kosong (diverifikasi 16 Oktober: tidak ada berkas `src/app` atau `src/components` yang merujuk `services/whatsapp`). 2a-G harus mengubah daftar ini secara eksplisit melalui pengecualian per asersi (§6.12, X-1). Dengan begitu larangan "tanpa route/API/UI" tidak hilang hanya karena allowlist ditambah: setiap route WA-2 yang tidak terdaftar tetap tertangkap, di branch maupun di `main`.
- **I-2 (berkas beku identik):** SHA-256 isi `src/services/whatsapp/wa2-gate.ts`, `wa-access-resolver.ts`, `wa-freshness.ts`, `wa-template.ts` direkam pada manifest; perubahan → GAGAL, juga sesudah merge. Perluasan daftar ke service F3/F4 = keputusan owner G-D3.
- **I-3:** F3 L104/L110 membandingkan dengan SHA basis F3 tetap `cd276bb296acf898b5bd8558c6711b9361178736` (main sebelum F3), bukan `main:`. Badan `siapkanCandidate`/`siapkanDalamTx` dan klausa resolver tetap dibandingkan dengan keadaan sebelum F3.
- Asersi isi lain di S1/S2/S3 masing-masing uji tetap apa adanya.

**Lapis P — perubahan berjalan:**
- **Basis:** `merge-base(HEAD, refs/remotes/origin/main)`. Syarat: ref `origin/main` ada dan merge-base ditemukan; bila tidak → **GAGAL tertutup**. Override `WA2A_BASIS=<40-hex>` hanya untuk checkout terlepas/CI: wajib SHA penuh, commit ada, dan leluhur HEAD (`git merge-base --is-ancestor`), selain itu GAGAL. Tidak ada instruksi `git branch -f`. Kesegaran `origin/main` terhadap GitHub tidak dapat diperiksa tanpa jaringan (keterbatasan, dicatat di output).
- **Target:** `git diff --no-renames --name-only <BASIS>` (mencakup perubahan ter-commit sejak basis, staged, dan unstaged; berkas terhapus ikut muncul; rename muncul sebagai hapus + tambah) ditambah `git ls-files --others --exclude-standard` (untracked). Berkas yang di-ignore tidak terlihat; perubahan `.gitignore` sendiri adalah perubahan ter-track yang ikut diperiksa.
- **Mode bukti** (`WA2A_BUKTI=1`): working tree wajib bersih (`git status --porcelain=v1 --untracked-files=all` kosong) sehingga hasil terikat pada HEAD yang dicetak.
- **P-global (uji F1–F4 lama):** denylist berkas beku — WA-1 (`src/services/communication/`), TAH, intake, V3/validator, `prisma/schema.prisma`, migrasi, rollback, `docs/whatsapp/PRD-WA-1.md`, berkas I-2, berkas uji WA-2a yang sudah ada pada basis PR gate (daftar path persis di manifest, bukan pola; uji fase baru seperti `prisma/check-wa2a-g-static.mjs` tidak termasuk) dan `prisma/wa2a-lingkup.mjs` — ditambah aturan "hanya ditambah" untuk `wa2-policy.ts` dan `wa-lock.ts`. Pengecualian tetap per berkas dan per baris persis (pola `BARIS_F3`/`BARIS_F4` yang sudah ada) atau, untuk penulisan ulang besar, per berkas yang **terikat basis 40-hex tertentu** sehingga tidak berlaku lagi setelah basis berubah. Tanpa wildcard.
- **P-fase (uji fase aktif):** allowlist path persis fase aktif + jangkar (diff wajib memuat berkas jangkar fase). Hanya berjalan bila `WA2A_FASE=<id>` dinyatakan eksplisit; id tak dikenal atau fase yang sudah ada di manifest H → GAGAL. Tanpa `WA2A_FASE`, output menyatakan "lingkup fase aktif tidak diklaim" — ini mode, bukan pelewatan karena diff kosong. Bukti PR fase wajib dijalankan dalam mode fase dan mode bukti.
- Setelah fase merged, entri manifest H fase itu ditambahkan pada PR berikutnya (biasanya PR checkpoint) dengan SHA persis.

**Perilaku yang diharapkan:**

| Keadaan | I | H | P-global | P-fase |
|---|---|---|---|---|
| `main` bersih | jalan, lulus | 5 fase, 49 berkas tercatat, lulus | basis = HEAD → himpunan kosong, lulus | tidak diklaim |
| Branch dokumentasi (mis. PR #28) | lulus | lulus | 2 berkas docs, bukan beku → lulus | tidak diklaim |
| Branch fase baru (mis. 2a-G) | I-1 gagal sampai daftar disetujui diperbarui (X-1) | lulus | gagal bila menyentuh berkas beku tanpa pengecualian | `WA2A_FASE=G`: allowlist persis 2a-G + jangkar |
| `origin/main` tidak ada / tanpa merge-base | — | — | **GAGAL** | **GAGAL** |
| Clone dangkal tanpa commit H | — | **GAGAL** | — | — |

### 5.3 Path dan asersi persis untuk PR perbaikan gate (terpisah)

Berkas:
1. `prisma/wa2a-lingkup.mjs` — **baru**: basis, himpunan perubahan, manifest H, mode `WA2A_FASE`/`WA2A_BASIS`/`WA2A_BUKTI`.
2. `prisma/check-wa2a-message-policy.mjs` — S2 L219–263 diganti: H (F1), P-global, aturan tambah-saja `wa2-policy.ts` terhadap basis P; allowlist lama dipindah ke manifest H.
3. `prisma/check-wa2a-template.mjs` — S2 L176–214 diganti: H (F2), P-global.
4. `prisma/check-wa2a-message-f3.mjs` — L104 dan L110 dipin ke `cd276bb…`; S3 L140–186 diganti: H (F3), P-global; pengecualian baris F4 (L167–183) dinilai pada diff F4 historis.
5. `prisma/check-wa2a-approval-f4.mjs` — S4 L166–182 diganti: H (F4) termasuk larangan L179–L181 pada diff historis F4; L180 diganti I-1; L182 diganti asersi H-3; tambah I-2.
6. `docs/whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md` — **baru**: bukti uji positif/negatif.
7. `docs/TAH-CURRENT-CHECKPOINT.md` — status gate.

Opsional (keputusan G-D2): `prisma/check-wa2a-contact.mjs` S2 L100–151 dan `prisma/check-wa2a-access.mjs` S4 L86–143 memakai basis helper (gagal tertutup, `--no-renames`). Keduanya tidak memblokir dokumentasi saat ini. `prisma/check-wa2a-schema.mjs` (#26) tidak diubah.

### 5.4 Uji negatif wajib pada PR perbaikan gate

Dijalankan pada clone/worktree sekali pakai, bukan checkout kerja. Setiap kasus negatif harus menghasilkan exit ≠ 0 pada asersi yang disebut.

| ID | Skenario | Harapan |
|---|---|---|
| N-01 | `main` bersih, mode bawaan | Lulus; H mencetak 5 fase / 49 berkas |
| N-02 | Branch hanya dua dokumen (keadaan PR #28) | Lulus |
| N-03 | Edit **unstaged** `wa2-gate.ts` | Gagal I-2 dan P-global |
| N-04 | Edit **staged** `wa-template.ts` | Gagal I-2 dan P-global |
| N-05 | Edit **ter-commit** `wa-access-resolver.ts` pada branch | Gagal P-global (via basis) dan I-2 |
| N-06 | Berkas **untracked** `src/app/api/x/route.ts` yang mengimpor `@/services/whatsapp/wa-message.service` | Gagal I-1 |
| N-07 | `git mv src/services/whatsapp/wa-freshness.ts` ke nama lain | Gagal (hapus terlihat dengan `--no-renames`; I-2 berkas hilang) |
| N-08 | Hapus satu baris `wa2-policy.ts` | Gagal aturan tambah-saja |
| N-09 | Ubah `src/services/communication/comm-policy.ts` | Gagal P-global |
| N-10 | Hapus ref `origin/main` di clone uji | Gagal tertutup P |
| N-11 | Clone `--depth 1` | Gagal H (commit tidak tersedia) |
| N-12 | Hapus satu path dari manifest F4 | Gagal H-3 (tidak sama persis) |
| N-13 | `WA2A_BASIS` SHA pendek atau bukan leluhur HEAD | Gagal |
| N-14 | `WA2A_FASE=F4` | Gagal (fase sudah tercatat merged) |
| N-15 | Mode fase: diff tanpa berkas jangkar; diff dengan path di luar allowlist | Keduanya gagal |
| N-16 | Run lulus, lalu commit perubahan ilegal pada berkas beku, run ulang | Gagal (perubahan ter-commit tetap terlihat) |
| N-17 | Ubah uji WA-2a lama di luar pengecualian terikat basis | Gagal P-global |
| N-18 | Mutasi helper: fungsi diff selalu mengembalikan `[]` | Gagal H-3 |

### 5.5 Alasan, keterbatasan, dan alternatif yang ditolak

Alasan: memisahkan "kode sekarang aman" (I), "fase lama benar lingkupnya" (H), dan "perubahan berjalan tidak menyentuh berkas beku" (P) menghilangkan kebutuhan menambah path ke empat allowlist di setiap fase, mempertahankan bukti fase lama secara deterministik, dan menjaga larangan F4 tanpa route/UI sebagai invarian yang harus diubah secara sadar.

Keterbatasan:
- H bergantung pada ketersediaan commit; clone dangkal gagal (gagal tertutup, bukan lulus).
- Kesegaran `origin/main` tidak diverifikasi offline.
- Berkas ter-ignore tidak terlihat oleh P.
- Pengecualian terikat basis harus diperbarui bila basis branch berubah sebelum merge.
- Di `main` sendiri P hanya menjaga perubahan belum di-commit (sama dengan semantik #26); perlindungan sesudah merge untuk berkas paling kritis berasal dari I-2.

Alternatif yang ditolak: (a) menambah semua path baru ke allowlist F1–F4 setiap fase — utang berulang dan L180 tetap memblokir route sah; (b) hanya mengganti basis diff ke SHA merge fase — menghapus pemeriksaan perubahan berjalan dan tidak menjaga larangan F4 setelah fase berikutnya; (c) melewati pemeriksaan bila diff kosong — melemahkan gate.

## 6. Preflight 2a-G

### 6.1 Inventaris service yang tersedia (tanpa diubah)

Semua fungsi di bawah memanggil `gerbangWa2(ctx)` lebih dulu (`src/services/whatsapp/wa2-gate.ts`): tenant di luar allowlist Automation → `NOT_FOUND`; peran selain ADMIN/MANAJER_OPERASI → `FORBIDDEN`; konteks sistem → `FORBIDDEN`; `NODE_ENV=production` → `FORBIDDEN` "Fondasi WhatsApp klien tidak aktif (WA2_ENV_NOT_ALLOWED)."; flag `WA2_CLIENT_FOUNDATION_ENABLED` ≠ `"true"` → `FORBIDDEN` "(WA2_DISABLED)". Gerbang tidak mengisi `details.code`; alasannya ada di teks pesan. Lapis kedua `jenis()` di service approval melempar `FORBIDDEN` dengan `details.code`.

| Fungsi (berkas) | Input | `hasil` bisnis (dikembalikan) | Galat yang dilempar |
|---|---|---|---|
| `buatDraftPesanKlien` (`wa-message.service.ts`) | `{signalId, contactId}` (string 1–64) | `DRAFT_DIBUAT` {messageId, candidateId, revision, snapshotFingerprint, revisiDigantikan} / `SUDAH_ADA` {messageId, candidateId, revision, snapshotFingerprint} | `VALIDATION` "Draft pesan klien ditolak." dengan `details.code` = kode alasan F3 (mis. `EVENT_NOT_ALLOWED`, `CONTACT_INELIGIBLE`, `CONSENT_NOT_GRANTED`, `ACCESS_DENIED`, `CATEGORY_NOT_GRANTED`, `SOURCE_INVALID`, `CANDIDATE_BLOCKED`, `TEMPLATE_DATA_INVALID`, `MESSAGE_STATE_INVALID`, kode freshness/data); `NOT_FOUND` Sinyal/Kontak; `CONFLICT` `CONCURRENCY_CONFLICT` |
| `pratinjauPesanKlien` (`wa-message.service.ts`) | `{messageId, snapshotFingerprint}` (hex 64) | `DIPRATINJAU` / `DITOLAK` {alasan: `MESSAGE_STATE_INVALID`, `SNAPSHOT_MISMATCH`, kode freshness/data} / `DITAHAN` (→ NEEDS_REVIEW) / `DIBLOKIR` (→ BLOCKED) | `VALIDATION` format; `NOT_FOUND` Pesan klien; `CONFLICT` |
| `mintaApprovalPesanKlien` (`wa-message-approval.service.ts`) | `{messageId, snapshotFingerprint}` | `APPROVAL_DIMINTA` {approvalRequestId, expiresAt} / `SUDAH_ADA` {approvalRequestId} / `DITOLAK` {alasan: `SNAPSHOT_MISMATCH`, `MESSAGE_STATE_INVALID`, `APPROVAL_ALREADY_EXISTS`} / `DITAHAN` / `DIBLOKIR` | `FORBIDDEN` `ROLE_NOT_ALLOWED`; `VALIDATION`; `NOT_FOUND`; `CONFLICT` |
| `setujuiPesanKlien` | `{approvalRequestId, proposalHash, decisionNote?}` (catatan ≤ 1000) | `DISETUJUI` / `SUDAH_DIPUTUSKAN` {status} / `KEDALUWARSA` / `DITOLAK` {alasan, mis. `PROPOSAL_HASH_MISMATCH`} / `DITAHAN` / `DIBLOKIR` | `FORBIDDEN` dengan `details.code` maker-checker (§6.6) atau `APPROVAL_POLICY_MISMATCH`; `NOT_FOUND` Approval; `VALIDATION` `DECISION_NOTE_INVALID`; `CONFLICT` |
| `tolakPesanKlien` | `{approvalRequestId, proposalHash, decisionNote}` (wajib 3–1000) | `DITOLAK_PEMUTUS` / `SUDAH_DIPUTUSKAN` / `KEDALUWARSA` / `DITOLAK` / `DITAHAN` / `DIBLOKIR` | sama dengan setujui |
| `batalkanPesanKlien` | `{messageId, alasan}` (wajib 3–1000) | `DIBATALKAN` {approvalDihentikan} / `SUDAH_DIBATALKAN` / `DITOLAK` {alasan: `MESSAGE_STATE_INVALID`} | `VALIDATION` `DECISION_NOTE_INVALID`; `NOT_FOUND`; `CONFLICT` |

Catatan kontrak aktual:
- **Field keputusan bernama `hasil`.** Tidak ada field `status` atau `messageState` pada hasil mutasi; bila UI membutuhkan status terbaru, UI memuat ulang detail.
- `proposalHash` approval = `snapshotFingerprint` pesan saat request (diisi `mintaApprovalPesanKlien`); UI tetap mengirim nilai `proposalHash` dari objek approval yang ditampilkan.
- Penolakan prasyarat draft **dilempar** sebagai `VALIDATION` (HTTP 400), bukan hasil bisnis 200; UI wajib menampilkan `details.code`.
- `WaClientMessage` **tidak menyimpan `signalId` atau `voyageId`**; yang tersimpan `candidateId`. Konteks voyage/keluarga/sinyal diambil melalui ekspor bridge `muatCandidateDalamTx` (`wa1-bridge.ts`) yang mengembalikan `{id, voyageId, family, sourceType, sourceRef, signalIds, includedFields, state, blockReason, version}`.

Fungsi baca pendukung yang sudah ada: `daftarKontakPihak(ctx, partyType, partyId)` dan `bacaKontak` (mengembalikan e164 **utuh** — tidak boleh diteruskan ke UI) di `wa-contact.service.ts`; `bacaStatusConsent`, `riwayatConsent` (`wa-consent.service.ts`); `daftarGrantKontak` (`wa-grant.service.ts`); `bacaFaktaDalamTx`, `bacaVoyageTerotorisasi`, `cekAksesKontak` (`wa-voyage-view.ts`); `resolusiAkses` (`wa-access-resolver.ts`); `samarkanNomor` (`wa-phone.ts`, keluaran `+62••••7890`); ekspor bridge `klasifikasiSinyal`, `teksKunciCandidate`, `muatCandidateDalamTx`; fungsi murni `transisiPesanKlienSah` dan `otorisasiCheckerBuktiWaKlien`.

### 6.2 Read service yang diusulkan (belum ada)

Semua di berkas baru `src/services/whatsapp/wa-message-read.service.ts`, read-only, satu transaksi baca per pemanggilan, `gerbangWa2(ctx)` sebagai pernyataan pertama.

| Fungsi | Input | Keluaran | Sumber data |
|---|---|---|---|
| `daftarPesanKlien` | `{state?, take?, cursor?}` | `{items: RingkasanPesan[], nextCursor}` | WaClientMessage ber-tenant + approval tertaut + `muatCandidateDalamTx` per item (≤ 50) |
| `detailPesanKlien` | `{messageId}` | `DetailPesan` | pesan, approval tertaut, kandidat (bridge), `aksiTersedia` |
| `riwayatPesanKlien` | `{messageId, take?, cursor?}` | `{items: Peristiwa[], nextCursor}` | AuditLog tenant untuk recordId pesan dan approval tertautnya |
| `kandidatSinyalPesanKlien` | `{voyageId?, take?}` | `{items: SinyalLayak[]}` | MonitoringSignal tenant + `klasifikasiSinyal` (bridge) |
| `kandidatKontakPesanKlien` | `{signalId}` | `{voyageId, keluarga, items: KontakLayak[]}` | kontak tenant + `resolusiAkses` + `bacaStatusConsent`; nomor tersamar |

Berkas baru `src/services/whatsapp/wa2-access.ts`: `bolehAksesWa2(ctx): boolean` membungkus `gerbangWa2` dalam try/catch untuk halaman server (`wa2-gate.ts` beku, tidak diubah).

`aksiTersedia` dihitung server memakai fungsi kebijakan yang sama (`transisiPesanKlienSah`, `otorisasiCheckerBuktiWaKlien`) dan **hanya petunjuk tampilan**; service mutasi tetap penegak.

### 6.3 Kontrak HTTP umum

Prefix usulan: `/api/automation/client-messages` (terpisah dari `/api/automation/communications` WA-1). Setiap route memakai `withTenant` (`src/services/http.ts`): tenant, userId, dan peran berasal dari sesi server (`requireTenant`); `tenantId`, `role`, `userId`, `createdByUserId` dari body/query diabaikan dan tidak diteruskan.

**Mutasi (POST, menerima body):**
1. `gerbangWa2(ctx)` — sebelum body dibaca, sehingga pemanggil tak berhak atau mode produksi tidak pernah melihat galat validasi body.
2. `jsonBodyKetat(req)` — CSRF (`Sec-Fetch-Site` same-origin bila ada; `Origin` wajib = origin `NEXTAUTH_URL`), `Content-Type: application/json` wajib, maksimal 16 384 byte, JSON objek.
3. Hanya field yang dikenal diteruskan; ID resource dari path, bukan body.
4. Balasan sukses: `200 {"ok": true, ...hasilService}` (pola WA-1 Step 2H; `hasil` tetap kunci keputusan).

**Baca (GET, tanpa body):** tidak membaca body dan tidak memanggil `jsonBodyKetat` (tidak ada mutasi). Validasi query dilakukan service: ID string 1–64; `state` ∈ 9 status `STATUS_PESAN_KLIEN`; `take` bilangan bulat (daftar 1–50, bawaan 20; riwayat 1–100, bawaan 50) — route hanya mengonversi string `^\d{1,3}$` ke angka, nilai lain diteruskan apa adanya agar ditolak `VALIDATION`; `cursor` = ID dalam tenant, ID tak dikenal/tenant lain → `NOT_FOUND`; parameter tak dikenal diabaikan. Balasan `200 {"ok": true, "data": …}`.

**Peta galat** (`toResponse`, `{error:{code, message, details?}}`):

| HTTP | `code` | Penyebab |
|---|---|---|
| 401 | `UNAUTHORIZED` | tanpa sesi |
| 403 | `FORBIDDEN` | peran; flag OFF; produksi; CSRF/Origin; maker-checker (`details.code`) |
| 404 | `NOT_FOUND` | tenant di luar allowlist Automation; ID tidak ada atau milik tenant lain |
| 400 | `VALIDATION` | input/format/ukuran/content-type; prasyarat draft (`details.code`); catatan (`DECISION_NOTE_INVALID`) |
| 409 | `CONFLICT` | `CONCURRENCY_CONFLICT`, `MESSAGE_TRANSITION_FORBIDDEN` |
| 500 | `INTERNAL` | kesalahan tak terduga (tanpa detail internal) |

### 6.4 Tabel endpoint

| # | Metode dan path | Input | Output 200 | Galat utama |
|---|---|---|---|---|
| 1 | `GET /api/automation/client-messages` | query `state?`, `take?`, `cursor?` | `data: {items, nextCursor}` | 401, 403, 404, 400 |
| 2 | `POST /api/automation/client-messages` | body `{signalId, contactId}` | `hasil: DRAFT_DIBUAT \| SUDAH_ADA` | 401, 403, 404, 400 (`details.code`), 409 |
| 3 | `GET /api/automation/client-messages/candidates/signals` | query `voyageId?`, `take?` | `data: {items}` | 401, 403, 404, 400 |
| 4 | `GET /api/automation/client-messages/candidates/contacts` | query `signalId` (wajib) | `data: {voyageId, keluarga, items}` | 401, 403, 404, 400 |
| 5 | `GET /api/automation/client-messages/[id]` | path `id` | `data: DetailPesan` | 401, 403, 404 |
| 6 | `GET /api/automation/client-messages/[id]/history` | path `id`; query `take?`, `cursor?` | `data: {items, nextCursor}` | 401, 403, 404, 400 |
| 7 | `POST /api/automation/client-messages/[id]/preview` | body `{snapshotFingerprint}` | `hasil: DIPRATINJAU \| DITOLAK \| DITAHAN \| DIBLOKIR` | 401, 403, 404, 400, 409 |
| 8 | `POST /api/automation/client-messages/[id]/request-approval` | body `{snapshotFingerprint}` | `hasil: APPROVAL_DIMINTA \| SUDAH_ADA \| DITOLAK \| DITAHAN \| DIBLOKIR` | 401, 403 (`ROLE_NOT_ALLOWED`), 404, 400, 409 |
| 9 | `POST /api/automation/client-messages/[id]/cancel` | body `{alasan}` | `hasil: DIBATALKAN \| SUDAH_DIBATALKAN \| DITOLAK` | 401, 403, 404, 400, 409 |
| 10 | `POST /api/automation/client-messages/approvals/[id]/approve` | body `{proposalHash, decisionNote?}` | `hasil: DISETUJUI \| SUDAH_DIPUTUSKAN \| KEDALUWARSA \| DITOLAK \| DITAHAN \| DIBLOKIR` | 401, 403 (maker-checker), 404, 400, 409 |
| 11 | `POST /api/automation/client-messages/approvals/[id]/reject` | body `{proposalHash, decisionNote}` | `hasil: DITOLAK_PEMUTUS \| SUDAH_DIPUTUSKAN \| KEDALUWARSA \| DITOLAK \| DITAHAN \| DIBLOKIR` | 401, 403, 404, 400, 409 |

Revisi tidak memiliki endpoint tersendiri: revisi = `POST` #2 dengan signal dan kontak yang sama (§6.9).

### 6.5 Contoh request/response JSON

Semua nilai sintetis. Fingerprint contoh = SHA-256 teks sintetis, bukan data nyata. Pesan galat mengikuti teks service; pesan dari `requireAutomation` dan `notFound()` tidak dikutip ulang di sini.

**Daftar pesan**

```http
GET /api/automation/client-messages?state=PENDING_APPROVAL&take=20
```
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "msg_contoh_01",
        "revision": 2,
        "state": "PENDING_APPROVAL",
        "reasonCode": null,
        "language": "ID",
        "templateId": "wa2.schedule.ID.v1",
        "templateVersion": 1,
        "partyType": "CUSTOMER",
        "penerimaTersamar": "+62••••7890",
        "konteks": { "voyageId": "voy_contoh_01", "keluarga": "SCHEDULE_CHANGE" },
        "approval": { "id": "apr_contoh_01", "status": "PENDING", "expiresAt": "2026-10-16T16:00:00.000Z" },
        "createdAt": "2026-10-16T13:40:00.000Z",
        "updatedAt": "2026-10-16T14:00:00.000Z",
        "finalizedAt": null
      }
    ],
    "nextCursor": null
  }
}
```

`templateId` mengikuti `idTemplateKlien` (`wa2.<slug>.<bahasa>.v<versi>`) di `wa-template.ts`.

**Detail pesan**

```http
GET /api/automation/client-messages/msg_contoh_01
```
```json
{
  "ok": true,
  "data": {
    "id": "msg_contoh_01",
    "revision": 2,
    "state": "PENDING_APPROVAL",
    "reasonCode": null,
    "language": "ID",
    "templateId": "wa2.schedule.ID.v1",
    "templateVersion": 1,
    "body": "Yth. pelanggan, ETA MV CONTOH (V-CONTOH-01) di PELABUHAN CONTOH berubah. [teks sintetis; isi nyata = body snapshot tersimpan dari template F2, ditampilkan apa adanya]",
    "fields": {
      "keluarga": "SCHEDULE_CHANGE",
      "kategoriWajib": "SCHEDULE_ESTIMATE",
      "vesselName": "MV CONTOH",
      "voyageNumber": "V-CONTOH-01",
      "portName": "PELABUHAN CONTOH",
      "perubahan": [{ "medan": "eta", "lama": "2026-10-17T08:00:00.000Z", "baru": "2026-10-17T14:00:00.000Z" }]
    },
    "penerimaTersamar": "+62••••7890",
    "partyType": "CUSTOMER",
    "snapshotFingerprint": "16369c4cb3c0c95fc30ad0839726173b7e04d8f30b60e04bd4b6b4fb4285a38e",
    "freshness": { "status": "LOLOS", "aturan": "D6A_KONFIRMASI_STAF", "buktiRingkas": [{ "jenis": "KONFIRMASI_JADWAL", "medan": "eta", "dicatatPada": "2026-10-16T13:30:00.000Z" }] },
    "konteks": { "voyageId": "voy_contoh_01", "keluarga": "SCHEDULE_CHANGE", "signalIds": ["sig_contoh_01"] },
    "approval": {
      "id": "apr_contoh_01",
      "status": "PENDING",
      "proposalHash": "16369c4cb3c0c95fc30ad0839726173b7e04d8f30b60e04bd4b6b4fb4285a38e",
      "expiresAt": "2026-10-16T16:00:00.000Z",
      "decidedAt": null
    },
    "previewedAt": "2026-10-16T13:50:00.000Z",
    "approvedAt": null,
    "finalizedAt": null,
    "aksiTersedia": ["SETUJUI", "TOLAK", "BATALKAN", "BUAT_REVISI"],
    "labelPengiriman": "BELUM DIKIRIM — tidak ada pengiriman pada fase ini"
  }
}
```

**Riwayat**

```http
GET /api/automation/client-messages/msg_contoh_01/history?take=50
```
```json
{
  "ok": true,
  "data": {
    "items": [
      { "id": "aud_contoh_03", "waktu": "2026-10-16T14:00:00.000Z", "objek": "APPROVAL", "peristiwa": "WA2_APPROVAL_DIMINTA", "stateDari": null, "stateKe": "PENDING", "alasan": null, "aktor": { "userId": "usr_contoh_02", "nama": "Staf Contoh B" } },
      { "id": "aud_contoh_02", "waktu": "2026-10-16T13:50:00.000Z", "objek": "PESAN", "peristiwa": "WA2_DIPRATINJAU", "stateDari": "DRAFT", "stateKe": "PREVIEWED", "alasan": null, "aktor": { "userId": "usr_contoh_01", "nama": "Staf Contoh A" } }
    ],
    "nextCursor": "aud_contoh_01"
  }
}
```

**Kandidat sinyal dan kontak**

```http
GET /api/automation/client-messages/candidates/signals?take=20
```
```json
{ "ok": true, "data": { "items": [ { "id": "sig_contoh_01", "voyageId": "voy_contoh_01", "keluarga": "SCHEDULE_CHANGE", "reviewState": "ACKNOWLEDGED", "detectedAt": "2026-10-16T13:00:00.000Z" } ] } }
```

```http
GET /api/automation/client-messages/candidates/contacts?signalId=sig_contoh_01
```
```json
{
  "ok": true,
  "data": {
    "voyageId": "voy_contoh_01",
    "keluarga": "SCHEDULE_CHANGE",
    "items": [
      { "contactId": "ktk_contoh_01", "penerimaTersamar": "+62••••7890", "partyType": "CUSTOMER", "bahasa": "ID", "layak": true, "alasan": null },
      { "contactId": "ktk_contoh_02", "penerimaTersamar": "+65••••1234", "partyType": "PRINCIPAL", "bahasa": "EN", "layak": false, "alasan": "CATEGORY_NOT_GRANTED" }
    ]
  }
}
```

**Buat draft / revisi**

```http
POST /api/automation/client-messages
Origin: http://localhost:3100
Content-Type: application/json

{ "signalId": "sig_contoh_01", "contactId": "ktk_contoh_01" }
```
```json
{ "ok": true, "hasil": "DRAFT_DIBUAT", "messageId": "msg_contoh_02", "candidateId": "cnd_contoh_01", "revision": 3, "snapshotFingerprint": "2cbfbda1d3a5659a59c7065c6272de45d21805931595c6b91da9b817c6c77f45", "revisiDigantikan": "msg_contoh_01" }
```
```json
{ "ok": true, "hasil": "SUDAH_ADA", "messageId": "msg_contoh_01", "candidateId": "cnd_contoh_01", "revision": 2, "snapshotFingerprint": "16369c4cb3c0c95fc30ad0839726173b7e04d8f30b60e04bd4b6b4fb4285a38e" }
```
Prasyarat gagal (HTTP 400):
```json
{ "error": { "code": "VALIDATION", "message": "Draft pesan klien ditolak.", "details": { "code": "ACCESS_DENIED" } } }
```

**Preview**

```http
POST /api/automation/client-messages/msg_contoh_02/preview
Content-Type: application/json

{ "snapshotFingerprint": "2cbfbda1d3a5659a59c7065c6272de45d21805931595c6b91da9b817c6c77f45" }
```
```json
{ "ok": true, "hasil": "DIPRATINJAU", "messageId": "msg_contoh_02" }
```
```json
{ "ok": true, "hasil": "DITAHAN", "messageId": "msg_contoh_02", "alasan": "CONSENT_CHANGED" }
```
```json
{ "ok": true, "hasil": "DITOLAK", "messageId": "msg_contoh_02", "alasan": "MESSAGE_STATE_INVALID" }
```

**Minta approval**

```http
POST /api/automation/client-messages/msg_contoh_02/request-approval
Content-Type: application/json

{ "snapshotFingerprint": "2cbfbda1d3a5659a59c7065c6272de45d21805931595c6b91da9b817c6c77f45" }
```
```json
{ "ok": true, "hasil": "APPROVAL_DIMINTA", "messageId": "msg_contoh_02", "approvalRequestId": "apr_contoh_02", "expiresAt": "2026-10-16T18:05:00.000Z" }
```
```json
{ "ok": true, "hasil": "SUDAH_ADA", "messageId": "msg_contoh_02", "approvalRequestId": "apr_contoh_02" }
```

**Setujui**

```http
POST /api/automation/client-messages/approvals/apr_contoh_02/approve
Content-Type: application/json

{ "proposalHash": "2cbfbda1d3a5659a59c7065c6272de45d21805931595c6b91da9b817c6c77f45", "decisionNote": "Sesuai konfirmasi agen." }
```
```json
{ "ok": true, "hasil": "DISETUJUI", "approvalRequestId": "apr_contoh_02", "messageId": "msg_contoh_02" }
```
```json
{ "ok": true, "hasil": "KEDALUWARSA", "approvalRequestId": "apr_contoh_02", "messageId": "msg_contoh_02" }
```
```json
{ "ok": true, "hasil": "DITOLAK", "approvalRequestId": "apr_contoh_02", "alasan": "PROPOSAL_HASH_MISMATCH" }
```
```json
{ "ok": true, "hasil": "SUDAH_DIPUTUSKAN", "approvalRequestId": "apr_contoh_02", "status": "APPROVED" }
```
Maker-checker (HTTP 403):
```json
{ "error": { "code": "FORBIDDEN", "message": "Tidak berhak memutuskan approval ini (CHECKER_IS_MAKER).", "details": { "code": "CHECKER_IS_MAKER" } } }
```

**Tolak**

```http
POST /api/automation/client-messages/approvals/apr_contoh_02/reject
Content-Type: application/json

{ "proposalHash": "2cbfbda1d3a5659a59c7065c6272de45d21805931595c6b91da9b817c6c77f45", "decisionNote": "ETA belum dikonfirmasi agen." }
```
```json
{ "ok": true, "hasil": "DITOLAK_PEMUTUS", "approvalRequestId": "apr_contoh_02", "messageId": "msg_contoh_02" }
```
Catatan kosong (HTTP 400):
```json
{ "error": { "code": "VALIDATION", "message": "Catatan penolakan wajib 3–1000 karakter.", "details": { "code": "DECISION_NOTE_INVALID" } } }
```

**Batalkan**

```http
POST /api/automation/client-messages/msg_contoh_02/cancel
Content-Type: application/json

{ "alasan": "Klien meminta lewat telepon." }
```
```json
{ "ok": true, "hasil": "DIBATALKAN", "messageId": "msg_contoh_02", "approvalDihentikan": true }
```
```json
{ "ok": true, "hasil": "SUDAH_DIBATALKAN", "messageId": "msg_contoh_02" }
```

**Galat transport dan gerbang**

```json
{ "error": { "code": "FORBIDDEN", "message": "Fondasi WhatsApp klien tidak aktif (WA2_DISABLED)." } }
```
```json
{ "error": { "code": "FORBIDDEN", "message": "Fondasi WhatsApp klien tidak aktif (WA2_ENV_NOT_ALLOWED)." } }
```
```json
{ "error": { "code": "FORBIDDEN", "message": "Asal permintaan tidak sah." } }
```
```json
{ "error": { "code": "VALIDATION", "message": "Content-Type harus application/json." } }
```
```json
{ "error": { "code": "VALIDATION", "message": "Body terlalu besar (maks 16384 byte)." } }
```
```json
{ "error": { "code": "CONFLICT", "message": "Data berubah bersamaan. Coba lagi.", "details": { "code": "CONCURRENCY_CONFLICT" } } }
```
```json
{ "error": { "code": "NOT_FOUND", "message": "Pesan klien tidak ditemukan." } }
```

### 6.6 Matriks peran dan maker-checker

| Aksi | ADMIN / MANAJER_OPERASI | Peran lain | Tanpa sesi | Tenant di luar allowlist | Aturan tambahan |
|---|---|---|---|---|---|
| Baca daftar/detail/riwayat/kandidat | boleh | 403 | 401 | 404 | — |
| Buat draft / revisi | boleh | 403 | 401 | 404 | pembuat dicatat sebagai `createdByUserId` |
| Preview | boleh | 403 | 401 | 404 | pemratinjau **boleh** menjadi checker (aturan F1) |
| Minta approval | boleh (`PERAN_PEMINTA_APPROVAL_PESAN_KLIEN`) | 403 `ROLE_NOT_ALLOWED` | 401 | 404 | peminta dicatat sebagai originator |
| **Setujui** | boleh bila lolos semua aturan kanan | 403 `ROLE_NOT_ALLOWED` | 401 | 404 | bukan konteks sistem (`SYSTEM_CONTEXT_FORBIDDEN`); ≠ peminta (`SELF_APPROVAL_FORBIDDEN`, kelas EXTERNAL_COMMUNICATION, setuju-sendiri false); ≠ pembuat draft (`CHECKER_IS_MAKER`); bukan pencatat bukti freshness (`CHECKER_IS_EVIDENCE_RECORDER`); bukti pencatat tidak terbaca → `APPROVAL_POLICY_MISMATCH` |
| **Tolak** | sama dengan setujui | sama | 401 | 404 | aturan maker-checker **sama** (`siapkanKeputusan` dipakai bersama) + catatan 3–1000 |
| Batalkan | boleh, termasuk pembuat/peminta | 403 | 401 | 404 | alasan 3–1000; tanpa maker-checker |

UI boleh menyembunyikan atau menjelaskan aksi yang tidak berhak berdasarkan `aksiTersedia`, tetapi pengujian wajib memanggil API langsung untuk membuktikan larangan berlaku tanpa UI. Perluasan peran = keputusan owner.

### 6.7 Kontrak daftar, detail, dan riwayat

**Field allowlist** (kunci respons dikunci uji snapshot daftar kunci):

| Kontrak | Field yang boleh | Field yang tidak boleh |
|---|---|---|
| Ringkasan (daftar) | `id`, `revision`, `state`, `reasonCode`, `language`, `templateId`, `templateVersion`, `partyType`, `penerimaTersamar`, `konteks{voyageId, keluarga}`, `approval{id, status, expiresAt}`, `createdAt`, `updatedAt`, `finalizedAt` | `recipientE164Snapshot`, `body`, `fields`, `freshnessVerdict` mentah, `logicalMessageKey`, `activeKey`, `successKey`, `sourceFingerprint`, `partyIdSnapshot`, `grantIdSnapshot`, `consentStateVersion`, ID pengguna |
| Detail | ringkasan + `body`, `fields` (kunci: `keluarga`, `kategoriWajib`, `vesselName`, `voyageNumber`, `portName`, dan `perubahan` atau `occurredAt`/`timezone`/`eventLocalTime`), `snapshotFingerprint`, `freshness{status, aturan (`D6A_KONFIRMASI_STAF`/`D6B_MANUAL`), buktiRingkas}` — `buktiRingkas` adalah bentuk baru usulan read service (jenis, medan, waktu) tanpa ID pencatat, `konteks{voyageId, keluarga, signalIds}`, `approval{id, status, proposalHash, expiresAt, decidedAt}`, `previewedAt`, `approvedAt`, `aksiTersedia`, `labelPengiriman` | nomor utuh, `fields.grant` (ID grant kandidat), ID pencatat bukti, kunci internal di atas |
| Peristiwa (riwayat) | `id`, `waktu`, `objek` (`PESAN`/`APPROVAL`), `peristiwa`, `stateDari`, `stateKe`, `alasan`, `aktor{userId, nama}` | `ipAddress`, `oldValue`/`newValue` mentah, nomor, ID kontak/grant |

**Penyamaran:** semua nomor melalui `samarkanNomor`; tidak ada mode nomor utuh di 2a-G (berbeda dari WA-1 `?recipient=full`). Akses nomor utuh = keputusan owner terpisah.

**Pagination:** urutan stabil `createdAt desc, id desc`; `nextCursor` = ID item terakhir bila masih ada halaman; cursor milik tenant lain atau tidak ada → 404; batas `take` di §6.3.

**Keterbatasan diketahui:** konteks per item daftar memanggil `muatCandidateDalamTx` (≤ 50 per halaman); tidak ada indeks baru (tanpa migrasi). Untuk skala lokal cukup; skala besar = keputusan terpisah.

### 6.8 Alur pemilihan sinyal dan kontak

1. **Sinyal:** endpoint #3 membaca MonitoringSignal tenant (pola `listSinyal`, urutan `detectedAt desc, id desc`), lalu menyaring dengan `klasifikasiSinyal` (bridge) dan `kategoriWajibUntuk` (keluarga `SCHEDULE_CHANGE`, `EOSP`, `ALL_FAST`, `SAILED`). Status review mengikuti OD-12 sebagaimana ditegakkan Prepare WA-1. Daftar hanya petunjuk; `buatDraftPesanKlien` menegakkan semua aturan.
2. **Kontak:** endpoint #4 mengambil voyage dan keluarga sinyal; membaca kontak tenant berstatus ACTIVE; untuk tiap kontak menilai verifikasi efektif, consent (`bacaStatusConsent`), dan akses voyage+kategori (`resolusiAkses`). Hasil `layak` dan `alasan` (kode F3 yang sama) **hanya petunjuk**; draft tetap menilai ulang dalam transaksinya.
3. **Draft:** endpoint #2 dengan `{signalId, contactId}`.

Read service tidak boleh mengunci baris untuk menulis; kunci baca bersama yang dipakai `resolusiAkses` berumur satu transaksi baca.

### 6.9 Matriks aksi UI per status

Turunan dari `TRANSISI_PESAN_KLIEN` (`wa2-policy.ts`) dan service F3/F4. "Ubah status" = aksi pada `messageId` yang sama; "revisi" = `POST` #2 yang menghasilkan `messageId` baru.

| Status | Terminal | Ubah status yang tersedia | Revisi (POST #2) | Catatan |
|---|---|---|---|---|
| DRAFT | tidak | Pratinjau; Batalkan | ya: snapshot berubah → revisi baru, lama `CANCELED`/`REVISION_SUPERSEDED`; snapshot sama → `SUDAH_ADA` | preview hanya dari DRAFT |
| PREVIEWED | tidak | Minta approval; Batalkan | sama | — |
| PENDING_APPROVAL | tidak | Setujui / Tolak (checker); Batalkan (approval dihentikan) | sama; approval lama `SUPERSEDED` | tampilkan `expiresAt` dari server |
| APPROVED | **tidak** | Batalkan (eksekusi approval dihentikan) | sama | label "Disetujui — BELUM DIKIRIM"; tanpa Send |
| NEEDS_REVIEW | tidak | Batalkan | snapshot berubah → revisi baru; snapshot sama → `SUDAH_ADA` mengembalikan pesan NEEDS_REVIEW yang sama, sehingga pemulihan = Batalkan lalu buat draft baru | tampilkan `reasonCode`; tidak kembali ke DRAFT |
| EXPIRED | ya | — | buat draft baru; hasil mengikuti service | — |
| REJECTED | ya | — | sama | — |
| BLOCKED | ya | — | sama | tampilkan `reasonCode` |
| CANCELED | ya | — | sama | — |

**Pengulangan setelah timeout atau klik ganda** — hasil mengikuti aksi dan keadaan aktual, tidak selalu `SUDAH_*`:

| Aksi diulang | Kemungkinan hasil |
|---|---|
| Buat draft | `SUDAH_ADA` bila snapshot sama; revisi baru bila data berubah; `VALIDATION` bila prasyarat kini gagal |
| Pratinjau | `DITOLAK` `MESSAGE_STATE_INVALID` bila sudah PREVIEWED |
| Minta approval | `SUDAH_ADA` bila approval masih PENDING; `DITOLAK` `MESSAGE_STATE_INVALID` bila status lain |
| Setujui/Tolak | `SUDAH_DIPUTUSKAN` {status}, `KEDALUWARSA`, atau 409 |
| Batalkan | `SUDAH_DIBATALKAN`, atau `DITOLAK` bila status terminal lain |

Karena itu UI setelah timeout **memuat ulang detail lebih dulu**, menampilkan status aktual, dan tidak mengirim ulang otomatis.

### 6.10 Perilaku UI

| Keadaan | Perilaku |
|---|---|
| Navigasi | Halaman `/automation/client-messages` dan `/automation/client-messages/[id]`; akses lewat URL langsung (tanpa link Sidebar); `bolehAksesWa2` false → `notFound()` |
| Loading | kerangka tampilan; tombol aksi nonaktif |
| Empty | pesan "Belum ada pesan klien" + tombol buat draft (bila berhak) |
| Error | `code` + `message` server; `details.code` diterjemahkan dengan teks statis, tanpa logika kebijakan |
| Aksi berjalan | tombol nonaktif sampai respons (anti klik ganda); satu permintaan per aksi |
| Hasil bisnis | tampilkan `hasil` + `alasan`, lalu muat ulang detail |
| Expiry | tampilkan `expiresAt` dari server; status EXPIRED berasal dari server (`KEDALUWARSA`), UI tidak menghitung TTL |
| Konflik 409 | muat ulang detail; "Data berubah, tinjau ulang" |
| Timeout jaringan | "Status tidak pasti — memuat ulang"; tanpa klaim sukses; tanpa kirim ulang otomatis; transaksi service dibatasi 5 detik |
| Snapshot | isi, bahasa, dan fakta read-only dari server; tanpa editor isi, tanpa input nomor bebas |
| Freshness | tampilkan ringkasan dari server; UI tidak menilai ulang freshness |
| Label | "BELUM DIKIRIM — tidak ada pengiriman pada fase ini" di daftar dan detail, termasuk status APPROVED |
| Aksesibilitas | fokus keyboard pada aksi utama; tombol berlabel teks |

### 6.11 Daftar path persis

Berkas baru (22):

```
src/services/whatsapp/wa-message-read.service.ts
src/services/whatsapp/wa2-access.ts
src/app/api/automation/client-messages/route.ts
src/app/api/automation/client-messages/candidates/signals/route.ts
src/app/api/automation/client-messages/candidates/contacts/route.ts
src/app/api/automation/client-messages/[id]/route.ts
src/app/api/automation/client-messages/[id]/history/route.ts
src/app/api/automation/client-messages/[id]/preview/route.ts
src/app/api/automation/client-messages/[id]/request-approval/route.ts
src/app/api/automation/client-messages/[id]/cancel/route.ts
src/app/api/automation/client-messages/approvals/[id]/approve/route.ts
src/app/api/automation/client-messages/approvals/[id]/reject/route.ts
src/app/(app)/automation/client-messages/page.tsx
src/app/(app)/automation/client-messages/[id]/page.tsx
src/components/whatsapp/ClientMessageList.tsx
src/components/whatsapp/ClientMessageWorkspace.tsx
prisma/check-wa2a-g-static.mjs
prisma/check-wa2a-g-api.mjs
prisma/check-wa2a-g-prod.mjs
prisma/check-wa2a-g-ui.mjs
prisma/seed-wa2a-g-demo.mjs
docs/whatsapp/WA-2a-G-EVIDENCE.md
```

Alasan per berkas baru:

| Path | Alasan |
|---|---|
| `src/services/whatsapp/wa-message-read.service.ts` | read service §6.2 (satu-satunya tempat query tabel WA-2a untuk 2a-G) |
| `src/services/whatsapp/wa2-access.ts` | `bolehAksesWa2` untuk halaman; `wa2-gate.ts` beku |
| `src/app/api/automation/client-messages/route.ts` | endpoint #1 GET daftar, #2 POST draft/revisi |
| `src/app/api/automation/client-messages/candidates/signals/route.ts` | endpoint #3 |
| `src/app/api/automation/client-messages/candidates/contacts/route.ts` | endpoint #4 |
| `src/app/api/automation/client-messages/[id]/route.ts` | endpoint #5 |
| `src/app/api/automation/client-messages/[id]/history/route.ts` | endpoint #6 |
| `src/app/api/automation/client-messages/[id]/preview/route.ts` | endpoint #7 |
| `src/app/api/automation/client-messages/[id]/request-approval/route.ts` | endpoint #8 |
| `src/app/api/automation/client-messages/[id]/cancel/route.ts` | endpoint #9 |
| `src/app/api/automation/client-messages/approvals/[id]/approve/route.ts` | endpoint #10 |
| `src/app/api/automation/client-messages/approvals/[id]/reject/route.ts` | endpoint #11 |
| `src/app/(app)/automation/client-messages/page.tsx` | halaman server daftar + alur buat draft |
| `src/app/(app)/automation/client-messages/[id]/page.tsx` | halaman server detail |
| `src/components/whatsapp/ClientMessageList.tsx` | komponen client daftar, pemilihan sinyal/kontak |
| `src/components/whatsapp/ClientMessageWorkspace.tsx` | komponen client detail, preview, aksi, riwayat |
| `prisma/check-wa2a-g-static.mjs` | uji statis: impor, scope P-fase, kata/teks terlarang, egress statis, urutan gerbang |
| `prisma/check-wa2a-g-api.mjs` | uji HTTP + DB loopback sekali pakai terhadap `next dev` |
| `prisma/check-wa2a-g-prod.mjs` | uji route mode produksi lokal (G-01) |
| `prisma/check-wa2a-g-ui.mjs` | uji Playwright (playwright-core dari luar repo, pola `check-comm-ui`) |
| `prisma/seed-wa2a-g-demo.mjs` | data demo sintetis; hanya DB loopback, menolak host lain |
| `docs/whatsapp/WA-2a-G-EVIDENCE.md` | laporan bukti G-12 |

Berkas diubah (2):

| Path | Alasan |
|---|---|
| `prisma/check-wa2a-approval-f4.mjs` | hanya asersi I-1 (daftar perujuk WA-2 dari `src/app`) diganti ke 12 path route/halaman di atas — pengecualian X-1, perlu keputusan owner; bergantung pada PR perbaikan gate (§5) |
| `docs/TAH-CURRENT-CHECKPOINT.md` | status 2a-G |

Total 24 path. Tidak ada perubahan `package.json`, lockfile, schema, migrasi, `Sidebar.tsx`, `(app)/layout.tsx`, service F3/F4, `wa2-gate.ts`, atau berkas WA-1/TAH/V3. Komponen client tidak mengimpor `@/services/*` (tipe DTO dideklarasikan lokal), sehingga daftar I-1 hanya memuat 10 route dan 2 halaman.

### 6.12 Guard beku terdampak dan pengecualian per asersi

| ID | Guard / asersi | Dampak 2a-G | Usulan | Keputusan owner? |
|---|---|---|---|---|
| X-1 | `check-wa2a-approval-f4.mjs` I-1 (pengganti L180; ada setelah PR gate) | gagal sampai daftar diperbarui | ganti daftar kosong → 12 path persis (§6.11) | **ya** |
| X-0 | Bila PR gate **tidak** disetujui: allowlist F1–F4 + F4 L180/L182 | 24 path ditolak empat uji; L180 menolak semua route | tidak direkomendasikan; menuntut menambah 24 path ke empat allowlist dan melemahkan L180 | **ya** (jalur alternatif) |
| — | `check-comm-policy.mjs` L637–674: berkas yang memuat teks `services/communication` di luar foldernya = PERSIS daftar WA-1 + adapter | tidak terdampak bila berkas baru tidak memuat teks itu (termasuk komentar) | dipatuhi, dikunci `g-static` | tidak |
| — | `check-comm-ui.mjs` menu Sidebar | tidak terdampak bila Sidebar tidak diubah | link Sidebar = keputusan terpisah kelak (pengecualian khusus `Sidebar.tsx`, mungkin `(app)/layout.tsx`) | ya, bila diminta |
| — | `check-tah-policy.mjs` L615–642: `src/app` dan `src/components` tidak boleh memuat `TahApprovalRequest`/`tahApprovalRequest`, `services/tah`, `../tah/` | route/UI tidak boleh menyebut nama itu atau mengimpor `tah-policy` (mis. `MIN_CATATAN`) | data approval disajikan read service WA-2 dengan nama netral (`approval`); batas catatan dari pesan galat server | tidak (TAH beku) |
| — | `check-wa2a-schema.mjs` S3: tabel WA-2a hanya dipakai `src/services/whatsapp/` | route/UI tidak boleh memuat akses model (`.waClientMessage.` dsb.) atau nama tabel ber-kutip | semua query di read service | tidak |
| — | `check-wa2a-message-f3.mjs` L100: berkas WA-2 tidak memuat `communicationCandidate` | read service tidak boleh menyebutnya (termasuk komentar) | konteks via `muatCandidateDalamTx` | tidak |
| — | `check-wa2a-message-f3.mjs` L102: pembuat approval WA-2 = persis `wa-message-approval.service.ts` | read service hanya membaca | dipatuhi | tidak |
| — | `check-wa2a-message-policy.mjs` L200–213: hanya `wa1-bridge.ts` mengimpor modul WA-1 | read service mengimpor `./wa1-bridge` saja | dipatuhi | tidak |
| — | `check-wa2a-message-f3.mjs` S1 L94–97: bridge hanya ekspor ulang 3 modul | tidak terdampak bila ekspor bridge yang ada cukup | ekspor baru di bridge = keputusan tambahan | ya, bila diperlukan |
| — | `check-automation-policy.mjs` L367–369, `check-tah-ledger.mjs` sidik route intake | daftar route tetap; tidak terdampak | — | tidak |
| — | Schema/migrasi, service beku F3/F4, `wa2-gate.ts` | tidak diubah | bila ternyata perlu → implementasi STOP, ajukan keputusan | ya, bila terjadi |

### 6.13 Pemetaan G-01..G-12 ke skenario uji

| ID | Skenario konkret |
|---|---|
| G-01 | **`check-wa2a-g-prod.mjs`** (pola `check-comm-e2e` mode produksi): fixture dibuat lebih dulu dengan service pada proses non-produksi di PostgreSQL loopback sekali pakai; lalu `next build` + `next start` lokal (`NODE_ENV=production`) dengan flag WA-2 **sengaja `true`**, tenant di allowlist, perangkap egress `prisma/wa1-egress-trap.mjs`. Untuk 11 metode-path: sesi ADMIN sah + Origin benar + JSON sah → 403 `WA2_ENV_NOT_ALLOWED`; permintaan sama dengan content-type salah, body > 16 KB, dan Origin salah → **tetap** 403 `WA2_ENV_NOT_ALLOWED` (membuktikan gerbang mendahului CSRF/body); GET halaman → 404. Snapshot sebelum/sesudah: jumlah baris dan jumlah `version` WaClientMessage, TahApprovalRequest, AuditLog, CommunicationCandidate tidak berubah; state/versi pesan fixture tidak berubah; tanpa `[WA1-EGRESS] BLOCKED`, ada `TRAP-AKTIF`. Kontrol positif: fixture yang sama pada `next dev` (`g-api`) menghasilkan 200. Di `g-api`: flag `false` → 403 `WA2_DISABLED` pada 11 metode-path; tenant di luar allowlist → 404. Konteks sistem tidak dapat dihasilkan lewat HTTP (`requireTenant` tidak pernah mengisi `system`): dibuktikan uji DB F4 + asersi statis bahwa route hanya memakai `withTenant`. Tanpa akses produksi nyata. |
| G-02 | `g-api`: matriks {tanpa sesi, OPERATOR, ADMIN, MANAJER_OPERASI, ADMIN tenant lain} × 11 metode-path; ID tenant B dari sesi tenant A → 404; `tenantId`/`role`/`userId` di body diabaikan (baris tercatat memakai sesi); Origin hilang/salah → 403; content-type salah, body > 16 KB, JSON array → 400; query `take` = 0, 51, `abc` → 400. |
| G-03 | `g-api` + `g-ui`: `body`, `fields`, `language`, `snapshotFingerprint` di detail sama byte-per-byte dengan baris DB; nomor sesuai pola `^\+\d{2}••••\d{4}$`; nomor utuh fixture tidak muncul di JSON, HTML, maupun log respons. |
| G-04 | Alur draft → preview → request → approve; draft → preview → request → reject (catatan wajib); cancel dari DRAFT, PREVIEWED, PENDING_APPROVAL, APPROVED, NEEDS_REVIEW; `hasil` sesuai §6.1. |
| G-05 | Pengguna berbeda U1 (draft), U2 (request), U3 (pencatat konfirmasi), U4 (checker). Lewat API langsung: U1 approve/reject → 403 `CHECKER_IS_MAKER`; U2 → 403 `SELF_APPROVAL_FORBIDDEN`; U3 → 403 `CHECKER_IS_EVIDENCE_RECORDER`; U4 → `DISETUJUI` / `DITOLAK_PEMUTUS`; pemratinjau sebagai checker boleh; OPERATOR → 403. |
| G-06 | Setelah request: consent dicabut, grant dicabut, konfirmasi jadwal baru, sumber berubah, TTL lewat (ubah `expiresAt` hanya di DB sekali pakai). Hasil dan status (`DITAHAN`/`DIBLOKIR`/`KEDALUWARSA`, NEEDS_REVIEW/BLOCKED/EXPIRED, kode alasan) dikunci sesuai nilai aktual service, bukan diasumsikan. UI menampilkan kode dan status tersebut. Regresi `check-wa2a-approval-f4-db.mjs` termasuk M21/M22 tetap lulus. |
| G-07 | Approve ∥ reject paralel → tepat satu keputusan, lainnya `SUDAH_DIPUTUSKAN` atau 409; approve ganda; cancel ∥ approve; revisi menggantikan (`revisiDigantikan`, lama CANCELED `REVISION_SUPERSEDED`, approval lama SUPERSEDED); preview kedua → `DITOLAK` `MESSAGE_STATE_INVALID`; request kedua → `SUDAH_ADA`; fingerprint lama → `DITOLAK` `SNAPSHOT_MISMATCH` / `PROPOSAL_HASH_MISMATCH`. |
| G-08 | Kunci respons daftar/detail/riwayat = allowlist §6.7 (perbandingan himpunan kunci); pagination dua halaman tanpa duplikat dan urutan stabil; cursor tenant lain → 404; riwayat hanya memuat recordId pesan/approval itu. |
| G-09 | `g-static`: berkas baru tanpa impor provider/LLM (`openrouter`, `lib/ai`, `anthropic`), tanpa `fetch(` ke luar `/api/automation/client-messages`, tanpa `successKey`, tanpa route `send`; perangkap egress aktif pada server `g-api`, `g-prod`, `g-ui`. |
| G-10 | `g-ui` Playwright: loading, empty, error; klik ganda menghasilkan satu permintaan; expired dari server; konflik (data diubah dari tab lain) → muat ulang; timeout disimulasikan (rute ditahan) → "Status tidak pasti" tanpa kirim ulang; label "BELUM DIKIRIM" pada daftar dan detail termasuk APPROVED; fokus keyboard pada aksi utama. |
| G-11 | Regresi: F1–F4 statis dan DB (setelah PR gate), 2B/2C/2E, `check-comm-policy`, `check-comm-ui`, `check-comm-api`, `check-comm-e2e` (dev + produksi), `check-tah-policy`, `check-tah-ledger`, `check-automation-policy`, `check-validator-v3`; `tsc --noEmit`; `next lint`; `next build` lokal. Baseline `check-validator-remediasi` (61 lulus, 9 gagal dari 70) dilaporkan apa adanya, tidak diubah. |
| G-12 | `WA-2a-G-EVIDENCE.md`: HEAD yang diuji (mode bukti, tree bersih), path final, lingkungan (tanpa nilai rahasia), hasil aktual vs historis dipisah, suite yang tidak dijalankan + alasan, demo data sintetis, keputusan penerimaan owner. |

### 6.14 Kebutuhan lingkungan uji

Hanya nama variabel; tanpa nilai rahasia. Semua lokal/loopback.

- `DATABASE_URL`, `DIRECT_URL` — PostgreSQL 16 loopback sekali pakai.
- `NEXTAUTH_URL` (origin lokal, harus = origin peramban/uji), `NEXTAUTH_SECRET` (acak per sesi uji).
- `AUTOMATION_MONITORING_ENABLED`, `AUTOMATION_TENANT_IDS` (tenant uji sintetis).
- `WA2_CLIENT_FOUNDATION_ENABLED` — `true` hanya pada proses `next dev`/`next start` lokal uji; default repo tetap `false`.
- `NEXT_TELEMETRY_DISABLED=1`; `NODE_OPTIONS` untuk memuat perangkap egress.
- `PORTAL_DATABASE_URL` dan konfigurasi lain yang dibutuhkan `next build`.
- `playwright-core` dan Chromium dari luar repo (tanpa perubahan lockfile).

### 6.15 Tahapan implementasi dan dependensi

| Tahap | Isi | Bergantung pada | Batas |
|---|---|---|---|
| T0 | PR perbaikan gate (§5.3–§5.4) | persetujuan rancangan §5 + izin implementasi gate | hanya path §5.3 |
| T1 | `wa-message-read.service.ts`, `wa2-access.ts`, `g-static` (bagian baca), `g-api` (bagian baca) | T0 merged; persetujuan §6 (kontrak, path, X-1) | tanpa route mutasi/UI |
| T2 | Route #1–#11, X-1, `g-api` penuh, `g-prod` | T1 direview | berhenti di APPROVED |
| T3 | Halaman, komponen, `seed-wa2a-g-demo.mjs`, `g-ui` | T2 direview | tanpa Sidebar |
| T4 | Regresi G-11, build, evidence G-12, PR | T3 | tanpa deploy |
| T5 | Keputusan owner: merge dan penerimaan fase | T4 | merge ≠ deploy ≠ izin Send |

Usulan pengemasan: T0 satu PR; T1–T2 satu PR API; T3–T4 satu PR UI. Setiap tahap berhenti untuk review sebelum tahap berikutnya.

## 7. Prinsip kontrak yang dibekukan

| Area | Kontrak |
|---|---|
| Lingkungan | Gerbang WA-2 tetap menolak produksi; flag dan allowlist tetap berlaku; pengujian hanya lokal terisolasi |
| Identitas | Tenant dan user dari sesi server; jangan menerima tenant/peran/pemutus dari input klien |
| Peran | ADMIN/MANAJER_OPERASI sesuai service saat ini; perluasan role memerlukan keputusan owner |
| Maker-checker | UI menjelaskan larangan, tetapi service tetap penegak (§6.6) |
| Snapshot | Preview menampilkan snapshot tersimpan; request memakai `snapshotFingerprint`, keputusan memakai `proposalHash` yang dilihat pengguna |
| API | Endpoint/metode/payload/hasil bisnis vs galat transport (§6.3–§6.5); ID lintas tenant gagal tertutup |
| Read/riwayat | Query ber-tenant, field allowlist, urutan stabil, pagination, nomor tersamar (§6.7) |
| Mutasi | Gerbang, lalu CSRF/content-type/ukuran, sebelum mutasi; pola WA-1 dirujuk tanpa membypass gerbang WA-2 |
| Konflik dan timeout | Status terbaru dimuat ulang; jangan mengklaim aksi berhasil tanpa hasil service (§6.9–§6.10) |
| Status terminal | EXPIRED/REJECTED/BLOCKED/CANCELED tidak dihidupkan kembali; pemulihan lewat revisi |
| Fakta dan bahasa | Isi/template/fakta tidak direkonstruksi atau diedit di browser; satu pesan satu bahasa |
| Audit | Baca hanya field yang diizinkan; audit mutasi tetap dilakukan service secara atomik |

## 8. Acceptance criteria usulan

| ID | Kriteria | Bukti yang diperlukan (rinci di §6.13) |
|---|---|---|
| G-01 | Flag OFF, tenant di luar allowlist, konteks sistem, dan mode produksi ditolak sebelum mutasi | Uji route mode produksi lokal + uji API negatif; tidak ada mutasi atau egress |
| G-02 | Sesi/peran/tenant ditegakkan untuk seluruh read dan mutasi | Matriks akses; ID lintas tenant tidak dapat dibaca/diubah |
| G-03 | Preview sesuai snapshot yang tersimpan | Perbandingan isi satu bahasa, sumber, penerima tersamar dan fingerprint |
| G-04 | Request/approve/reject/cancel mengikuti state machine F3/F4 | E2E alur berhasil dan penolakan bisnis, termasuk alasan wajib |
| G-05 | Maker-checker ditegakkan server untuk approve dan reject | Uji pembuat draft, peminta dan pencatat bukti; larangan tidak hanya tombol UI |
| G-06 | Perubahan sumber/consent/grant/bukti serta expiry ditangani | Status dan kode alasan aktual tampil tepat; regresi waktu keputusan F4 tetap lulus |
| G-07 | Aksi berulang, balapan keputusan, pembatalan dan revisi tidak menimpa hasil final | Uji konkurensi/idempotensi; muat ulang status setelah konflik |
| G-08 | Read/riwayat aman dan terbatas | Field allowlist, pagination, isolasi tenant, penyamaran nomor |
| G-09 | Tidak ada jalur kirim atau panggilan provider/LLM | Jebakan egress, pemindaian statis, tidak ada successKey/route kirim |
| G-10 | UI dapat dipakai tanpa ambiguitas status | Playwright: loading/empty/error, klik ganda, expired, konflik, timeout, label belum dikirim, fokus keyboard |
| G-11 | Regresi dan build sesuai scope | Suite terdampak, tsc/lint, next build lokal |
| G-12 | Handoff dapat diaudit | HEAD dan path final, lingkungan, hasil aktual/historis dipisah, keterbatasan, demo owner |

Suite yang tidak dijalankan harus disebutkan bersama alasannya. Tidak ada klaim CI hijau jika tidak ada CI. Jangan memasukkan credential atau data klien ke laporan publik.

## 9. Urutan persetujuan

1. Owner memutuskan merge dokumentasi PR #28.
2. Owner memutuskan rancangan gate §5 (G-D1..G-D4), lalu izin implementasi PR gate.
3. Owner memutuskan definisi/scope 2a-G §6 (D-G1..D-G9).
4. Owner memberi izin implementasi per tahap §6.15.
5. Keputusan owner atas merge, penerimaan fase, checkpoint dan langkah berikutnya. Merge tidak berarti deploy atau izin Send.

## 10. Keputusan owner yang masih terbuka

**Gate (§5):**
- G-D1: setujui rancangan tiga lapis I/H/P (rekomendasi) atau pilih jalur X-0.
- G-D2: ikutkan 2C/2E (`check-wa2a-contact.mjs`, `check-wa2a-access.mjs`) ke helper basis, atau biarkan.
- G-D3: daftar berkas I-2 (empat berkas) cukup, atau diperluas ke service F3/F4.
- G-D4: pengecualian terikat basis 40-hex untuk penulisan ulang uji, atau hanya pengecualian per baris.

**2a-G (§6):**
- D-G1: prefix `/api/automation/client-messages` dan 11 metode-path §6.4.
- D-G2: daftar 24 path §6.11 sebagai batas persis.
- D-G3: peran hanya ADMIN dan MANAJER_OPERASI.
- D-G4: tanpa link Sidebar pada 2a-G.
- D-G5: kontak/consent/grant/konfirmasi hanya melalui setup lokal sintetis.
- D-G6: tanpa schema/migrasi; bila perlu → STOP.
- D-G7: pengecualian X-1 (daftar perujuk I-1 = 12 path).
- D-G8: konteks sinyal cukup dengan ekspor bridge yang ada (tanpa ekspor baru).
- D-G9: tanpa mode nomor utuh di 2a-G.

## 11. Fase lain dan arah produk

| Label | Status dan batas |
|---|---|
| F5 | Belum didefinisikan; jangan disamakan dengan 2a-G |
| 2a-F′ / 2a-I | Belum didefinisikan; menunggu owner |
| WA-2b | Rancangan pengiriman terpisah. Revalidasi final sebelum Send wajib: sumber, kontak/consent, akses/grant, snapshot/bukti dan kelayakan approval. Idempotensi, efek samping provider, retry, status gagal/tidak pasti, audit dan batas aktivasi perlu didesain serta disetujui |
| WA-2c | STOP otomatis dari pesan masuk; otorisasi konteks sistem dan autentikasi webhook harus didesain terpisah |
| WA-2d | Isi belum ditetapkan dalam tugas ini |
| AI drafting | Arah perencanaan untuk dikonfirmasi owner: AI menyusun draf berbasis sumber agar disetujui staf; perlu batas fakta, validasi, privasi, biaya, evaluasi dan audit sebelum implementasi |
| Auto-reply | Fase terpisah setelah validasi dan persetujuan; tidak termasuk izin F4 atau rancangan 2a-G |

SG-05 tetap terbuka dan harus ditutup sebelum pengiriman WhatsApp nyata. Dokumen ini tidak menggantikan PRD WA-1 yang beku atau menciptakan persetujuan untuk produksi.
