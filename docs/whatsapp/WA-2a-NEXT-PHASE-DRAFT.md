# WA-2a — Rancangan fase berikutnya setelah F4

**Status: DRAFT UNTUK REVIEW OWNER — bukan baseline yang disahkan, BELUM IZIN IMPLEMENTASI.**

> **Pembaruan 16 Oktober 2026 (pasca-merge PR #31):** gate (§5) dan API 2a-G T1–T2 (§6) sudah MERGED. Usulan UI tahap T3–T4 yang mengikuti kontrak API yang sudah merged ada di **§12**. UI belum diizinkan.

Tanggal: 16 Oktober 2026 (WITA); revisi preflight 16 Oktober 2026 malam.
Basis fitur: main setelah [PR #27](https://github.com/marlon870saragih-cloud/maritim-suite/pull/27), merge `5e58237c393a6115d3c55a5c1382dd3c5826a976`; HEAD F4 yang ditinjau `d665216acf85803092771a2b01bced5131cbe927`.
Handoff: [TAH-CURRENT-CHECKPOINT.md](../TAH-CURRENT-CHECKPOINT.md).
Bukti fondasi: [F3](WA-2a-F3-EVIDENCE.md), [F4](WA-2a-F4-EVIDENCE.md).

Dokumen ini berisi dua rancangan yang **terpisah**: perbaikan gate lingkup F1–F4 (§5) dan preflight 2a-G (§6). Semua nama fungsi, input, hasil, kode alasan dan nomor baris di bawah dibaca dari kode `main` @ `5e58237` pada 16 Oktober 2026. Nama berkas, endpoint, dan pengecualian yang **diusulkan** belum ada di repo dan belum disetujui.

## 1. Keputusan yang diminta

Tiga keputusan berikut **berdiri sendiri**; menyetujui salah satu tidak menyetujui yang lain:

1. **Merge dokumentasi PR #28** (checkpoint + dokumen ini sebagai rancangan).
2. **Perbaikan gate lingkup F1–F4 (§5):** disetujui, diimplementasikan, dan MERGED (PR #29, `a1f6950`). T0 selesai.
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

## 5. Perbaikan gate lingkup F1–F4 (E-G1) — MERGED (PR #29)

Owner menyetujui G-D1..G-D4, implementasi pada 12 path persis, tiga koreksi review, dan merge (16 Oktober 2026). [PR #29](https://github.com/marlon870saragih-cloud/maritim-suite/pull/29) MERGED sebagai `a1f69506e5ad04bc522c2dd8ac5232ded7fa4d42` (parent `f304918` + `2d37111`); gate lulus pada `main` bersih pasca-merge (hasil aktual di dokumen bukti). Bukti aktual: [WA-2a-GATE-SCOPE-EVIDENCE.md](WA-2a-GATE-SCOPE-EVIDENCE.md). Persetujuan ini **bukan** izin 2a-G.

### 5.1 Fakta kode baseline (`f304918`, sebelum PR gate)

| Uji | Bagian lingkup | Mekanisme lama |
|---|---|---|
| F1 `prisma/check-wa2a-message-policy.mjs` | S2, L219–263 | `git diff --name-only main` + untracked; allowlist `BOLEH` (sudah ditambah entri F2/F3/#26/F4); `wa2-policy.ts` tambah-saja terhadap `main` |
| F2 `prisma/check-wa2a-template.mjs` | S2, L176–214 | sama |
| F3 `prisma/check-wa2a-message-f3.mjs` | L103–112, S3 L140–186 | `git show main:` untuk badan WA-1 dan klausa resolver; allowlist; pengecualian baris K3 F4 terhadap `main` |
| F4 `prisma/check-wa2a-approval-f4.mjs` | S4, L166–182 | allowlist; L179 berkas beku; L180 tanpa route/UI; L181 tambah-saja; **L182 `semua.includes(SVC)`** |
| 2C `prisma/check-wa2a-contact.mjs`, 2E `prisma/check-wa2a-access.mjs` | S2 L100–151; S4 L86–143 | denylist `BEKU` terhadap ref lokal `main`, deteksi rename bawaan Git, pengecualian baris F3/F4 |
| 2B `prisma/check-wa2a-schema.mjs` (#26) | L100–114 | basis `merge-base(HEAD, main)` dengan `main` = `origin/main`, gagal tertutup — **tidak diubah** |

Hasil baseline yang dijalankan ulang di clone bersih pada `f304918` (16 Oktober malam): F1 90/0, F2 51/0, F3 54/0, **F4 60/1 (L182)**, 2C 29/0, 2E 28/0, 2B statis 32/0 (bagian DB dilewati, exit 3).

### 5.2 Rancangan terimplementasi: tiga lapis

| Lapis | Pertanyaan | Basis → target |
|---|---|---|
| **I — invarian kode** | Apakah kode sekarang memenuhi sifat beku? | isi working tree, tanpa diff |
| **H — rekaman historis** | Apakah fase merged mengubah persis berkas tercatat? | `merge^1` → `merge^2` per fase, SHA 40-hex di manifest |
| **P — perubahan berjalan** | Apakah perubahan belum merged menyentuh berkas beku? | `merge-base(HEAD, origin/main)` → working tree + untracked |

Kode: helper `prisma/wa2a-lingkup.mjs`; data: `prisma/wa2a-lingkup-manifest.json` (fase, `i1`, `i2`, `pGlobal`, `faseAktif`, `pengecualian`); uji helper: `prisma/check-wa2a-lingkup.mjs`. Keenam uji fase memanggil helper dan menambahkan asersi historis khusus fasenya.

**H.** Manifest mencatat F1 #23 (4 berkas), F2 #24 (3), F3 #25 (16), PR26 #26 (4), F4 #27 (22) — total 49. Per fase: commit tersedia (bila tidak → gagal "riwayat tidak tersedia"), induk merge = basis/kepala tercatat, tree merge = tree kepala, diff `--no-renames` **sama persis** dengan manifest dan tidak kosong. Setiap uji fase juga menulis ulang daftar lingkupnya sendiri secara literal dan memastikan manifest sama dengannya, sehingga perusakan manifest saja tidak cukup. Larangan khusus fase dinilai pada diff fasenya: F4 tanpa `src/app/`/`src/components/`, tanpa berkas beku L179, `wa2-policy.ts` tanpa baris dihapus; pengecualian baris K3 F4 (kontak/consent) dan pengecualian baris F3/F4 2C/2E dibuktikan pada diff PR #25/#27. F3 membandingkan badan fungsi WA-1 dan klausa resolver dengan basis F3 tetap `cd276bb…`, bukan `main:`. Fungsi diff yang sama dipakai H dan P; mutasi yang mengosongkannya membuat semua rekaman H gagal.

**P.** Basis `merge-base(HEAD, refs/remotes/origin/main)`; ref tidak ada atau merge-base tidak ditemukan → gagal tertutup. Override `WA2A_BASIS` hanya SHA 40-hex yang ada dan merupakan leluhur HEAD. Himpunan perubahan = `git diff --no-renames --name-only <basis>` (ter-commit sejak basis, staged, unstaged, hapus; rename = hapus + tambah) + `git ls-files --others --exclude-standard`. Denylist `pGlobal`: awalan WA-1/TAH/intake/migrasi/rollback/uji WA-1-TAH-validator, path persis schema, PRD-WA-1, 12 uji WA-2a yang ada pada basis, helper `prisma/wa2a-lingkup.mjs` dan uji helper `prisma/check-wa2a-lingkup.mjs` (ditambahkan pada revisi review PR #29), dan semua berkas I-2; tambah-saja: `wa-lock.ts`, `wa2-policy.ts`. Uji 2C/2E memakai basis yang sama dengan denylist `BEKU` masing-masing.

**Pengecualian G-D4:** hanya tuple `{basis, path, blob}`; berlaku bila basis P = basis tuple **dan** `git hash-object` berkas = blob tuple. Setelah merge, branch baru memiliki basis lain sehingga tuple tidak berlaku lagi; edit lanjutan mengubah blob. PR gate sendiri memakai delapan tuple berbasis `f304918`: enam uji yang ditulis ulang, helper, dan uji helper.

**I-1.** Grafik impor seluruh `src/**` (`.ts/.tsx/.js/.jsx/.mjs/.cjs`): alias `@/*` (satu-satunya alias di `tsconfig.json`), relatif, `index`, `from` pada `import`/`export … from`/`import type`, `import()` dan `require()` literal; komentar dan string biasa dibuang lebih dulu. Berkas di `src/app/**` dan `src/components/**` yang mencapai `src/services/whatsapp/` langsung atau lewat perantara harus **sama persis** dengan `i1.diizinkan` (saat ini kosong). Keterjangkauan dihitung sekali dengan BFS mundur dari sasaran (aman untuk siklus, tidak bergantung pada urutan impor maupun urutan pemindaian, selalu berhenti). Rantai terpendek dicetak (mis. `page.tsx → src/lib/x.ts → wa-phone.ts`). Pemindai yang sama menemukan 18 perujuk transitif modul WA-1 sebagai kontrol tidak hampa.

**I-2 — 15 berkas beku (blob Git baseline `f304918`):**

| Berkas (`src/services/whatsapp/`) | Alasan | Blob |
|---|---|---|
| `wa2-gate.ts` | gerbang WA-2 (inti awal) | `fff6cc527881307e70ffb20b185b55aa2f9f472b` |
| `wa-template.ts` | template v1 (inti awal) | `bb6acd73239be96498f7bd365c75c00a601cd338` |
| `wa-access-resolver.ts` | resolver akses (inti awal; diubah F3) | `481b600886d0bbefb8676d1f46a97b79dd6c2c21` |
| `wa-freshness.ts` | freshness D6 (inti awal; ditambah F3) | `a1fbc9ba4e62c06e65c79d1d2dd1d73cfb3ced0f` |
| `wa-message-policy.ts` | kebijakan pesan (F1, diubah F3) | `f67fb659e3cdb3498b699c424caeb0158fcbf8e5` |
| `wa-message.service.ts` | draft/preview (F3, diubah F4) | `53273c42bd4ce64d62e915d650c32abce3ba2181` |
| `wa-schedule-confirmation.service.ts` | konfirmasi jadwal (F3) | `bb13beb2c6806dc516e2d9c1b1fd11d3e6e2e294` |
| `wa1-bridge.ts` | adapter WA-1 satu-satunya (F3, diubah F4) | `972789f825781573fdba2202181db7da4c08d6c6` |
| `wa-approval-def.ts` | definisi beku CLIENT_WA_UPDATE (F1, diubah F4) | `c513f06025cdb8800a84f1c22791b07ba7d438f3` |
| `wa-approval-stop.ts` | penghentian approval tertaut (F4) | `2be550a7be457e6106d2d5f368d5744e11dabd45` |
| `wa-message-approval.service.ts` | approval pesan klien (F4) | `372b6bbc1a7621d672473dc0f1d58445c34baf48` |
| `wa-message-check.ts` | pemeriksaan kontak/akses/freshness (F4) | `9e3b779890ce4898c7b92c527ecf590b9a605501` |
| `wa-consent.service.ts` | consent; baris K3 ditambah F4 | `45d87783cad4741dec310a57a1d7a741a8a72bef` |
| `wa-contact.service.ts` | kontak; baris K3 ditambah F4 | `56180de37ac13e85f9d8d9b45f1e6d51de5e6c8f` |
| `wa-grant.service.ts` | grant; hold K3 ditambah F4 | `8eb7c111973e1c0946e11f4cb12d92f598cf3ec7` |

Aturan pemilihan: empat berkas inti awal + setiap berkas `src/services/whatsapp/` yang ditambah/diubah oleh diff F3 atau F4, kecuali `wa2-policy.ts` (aturan tambah-saja, diperluas per fase). Tidak dibekukan dengan hash: `wa-lock.ts` (tambah-saja), `wa-phone.ts`, `wa-voyage-view.ts`, `wa-db-error.ts` (tidak diubah F3/F4), dan `src/services/ops/voyage-event.service.ts` (domain operasional; K1 dijaga asersi isi F4 S2). Hash = `git hash-object` (menerapkan `.gitattributes` dan filter seperti `git add`); kelima belas berkas tanpa atribut `text`/`eol`/`filter` dan `core.autocrlf` tidak diset; blob = blob tree HEAD.

**Mode.** `WA2A_FASE=<id>`: P-fase dengan `faseAktif[id].izin` (allowlist persis) dan `jangkar`; id fase merged atau tak dikenal → gagal. Tanpa `WA2A_FASE`, output menyatakan "lingkup fase aktif TIDAK diklaim". `WA2A_BUKTI=1`: working tree wajib bersih (`git status --porcelain=v1 --untracked-files=all` kosong) dan mencetak HEAD, basis, `origin/main`, blob helper dan blob manifest; nilai lain → gagal. Fase baru: entri `faseAktif` ditambahkan di PR fase; sesudah merge, entri dipindah ke `fase` dengan SHA persis pada PR berikutnya dan divalidasi lapis H (commit bukan merge atau induk salah → gagal).

### 5.3 Path PR gate (12, sesuai izin)

1. `prisma/wa2a-lingkup.mjs` — baru
2. `prisma/wa2a-lingkup-manifest.json` — baru
3. `prisma/check-wa2a-lingkup.mjs` — baru
4. `prisma/check-wa2a-message-policy.mjs`
5. `prisma/check-wa2a-template.mjs`
6. `prisma/check-wa2a-message-f3.mjs`
7. `prisma/check-wa2a-approval-f4.mjs`
8. `prisma/check-wa2a-contact.mjs`
9. `prisma/check-wa2a-access.mjs`
10. `docs/whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md` — baru
11. `docs/whatsapp/WA-2a-NEXT-PHASE-DRAFT.md`
12. `docs/TAH-CURRENT-CHECKPOINT.md`

### 5.4 Skenario uji helper (`check-wa2a-lingkup.mjs`, clone sementara)

**Path persis.** Semua daftar path di manifest dibandingkan sebagai string persis, tidak pernah diekspansi sebagai glob. Segmen route dinamis Next.js (`[id]`, `[...slug]`) diterima sebagai nama literal; ditolak: `*` `?` `{` `}`, path absolut, backslash, karakter kontrol, segmen kosong, `.` dan `..`.

**Positif (14):** P-01 clone bersih; P-02 branch dokumentasi ter-commit; P-03 komentar/string menyerupai impor; P-04 tambah-saja hanya menambah; P-05 tuple pengecualian tepat; P-06 mode fase dengan allowlist + jangkar; P-07 perujuk yang tercantum di `i1.diizinkan`; P-08 mode bukti tree bersih; P-09 CRLF + `*.ts text` dinormalkan `hash-object`; P-10 route literal `[id]` dengan manifest sintetis; P-11 variasi urutan impor/pemindaian pada grafik bersiklus → himpunan sama; P-12 siklus tanpa jalur WA-2 → tanpa temuan; P-13 impor diri + cincin 300 berkas selesai; P-14 tuple helper tepat.

**Negatif (35 asersi):** N-01 unstaged; N-02 staged; N-03 committed; N-04 untracked di WA-1; N-05 `git rm`; N-06 hapus tanpa stage; N-07 `git mv`; N-08 tambah-saja dilanggar; N-09 impor langsung alias; N-10 impor relatif dari komponen; N-11 impor transitif; N-12 `import()` literal; N-13 `origin/main` hilang; N-14 clone `--depth 1`; N-15a JSON rusak; N-15b SHA pendek/path berpola/pengecualian berfield lebih; N-15c path dihapus dari rekaman; N-15d fase dengan commit bukan merge; N-16 basis pendek/tidak ada/bukan leluhur; N-17a fase merged/tak dikenal; N-17b jangkar hilang; N-17c path di luar allowlist; N-18a/N-18b pengecualian basis/blob salah; N-19 mutasi helper `daftarDiff → []`; N-20 mode bukti tree kotor/nilai salah; N-21 perubahan ilegal di-commit sesudah run lulus; N-22 CRLF tanpa atribut; N-23 uji WA-2a lama diubah tanpa pengecualian; N-24 `abc/route.ts` terhadap allowlist `[id]` (bukan wildcard); N-25a dua route siklus sama-sama ditemukan; N-25b hanya route A diizinkan → B gagal; N-26a helper diubah tanpa tuple; N-26b tuple helper basis/blob salah; N-26c tuple lama tidak berlaku sesudah simulasi merge. Ditambah 4 asersi murni path literal pada lapis R (total uji helper 65: 16 repo nyata/murni, 14 positif, 35 negatif).

Daftar N-01..N-18 versi rancangan sebelumnya berisi 18 skenario: **2 positif dan 16 negatif**; daftar di atas menggantikannya.

### 5.5 Keterbatasan

- **Deteksi impor:** tidak terdeteksi `import()`/`require()` dengan ekspresi terhitung (dihitung dan dilaporkan sebagai info), pemuatan lewat `fs`/`eval`, alias di luar `tsconfig.json`, dan kode hasil generate. Pemindai tidak mem-parse regex literal; regex yang memuat tanda kutip dapat mengacaukan tokenisasi. Akses tabel WA-2a di luar `src/services/whatsapp/` tetap dijaga terpisah oleh `check-wa2a-schema` S3.
- **Integritas manifest:** manifest tidak dapat melindungi dirinya sendiri. Daftar lingkup literal di uji fase membatasi perusakan rekaman H, tetapi menambah tuple pengecualian atau mengubah `i1`/`i2` di manifest tetap hanya tertangkap oleh review owner pada diff PR.
- **Riwayat:** H memerlukan commit fase; clone dangkal gagal tertutup.
- **Basis:** kesegaran `origin/main` terhadap GitHub tidak diperiksa (uji offline). Di `main` sendiri P hanya menjaga perubahan belum di-commit; perlindungan sesudah merge untuk berkas paling kritis berasal dari I-2.
- **Berkas ter-ignore** tidak terlihat oleh P.
- **Tuple terikat basis** harus diperbarui bila basis branch berubah sebelum merge.

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
| `prisma/wa2a-lingkup-manifest.json` | `i1.diizinkan` diisi 12 path route/halaman di atas (pengecualian X-1) dan entri `faseAktif.G` (allowlist persis 2a-G + jangkar) untuk mode `WA2A_FASE=G` — perlu keputusan owner; PR gate (§5) sudah merged |
| `docs/TAH-CURRENT-CHECKPOINT.md` | status 2a-G |

Total 24 path. Tidak ada perubahan `package.json`, lockfile, schema, migrasi, `Sidebar.tsx`, `(app)/layout.tsx`, service F3/F4, `wa2-gate.ts`, atau berkas WA-1/TAH/V3. Komponen client tidak mengimpor `@/services/*` (tipe DTO dideklarasikan lokal), sehingga daftar I-1 hanya memuat 10 route dan 2 halaman.

### 6.12 Guard beku terdampak dan pengecualian per asersi

| ID | Guard / asersi | Dampak 2a-G | Usulan | Keputusan owner? |
|---|---|---|---|---|
| X-1 | `prisma/wa2a-lingkup-manifest.json` `i1.diizinkan` (asersi I-1 di helper, pengganti F4 L180) | I-1 gagal sampai daftar diperbarui | ganti daftar kosong → 12 path persis (§6.11); tambah `faseAktif.G` | **ya** |
| X-0 | Jalur lama allowlist F1–F4 + F4 L180/L182 | tidak berlaku lagi bila PR gate merged (owner memilih G-D1) | — | tidak |
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
| G-03 | `g-api` + `g-ui`: untuk setiap field yang **diizinkan** kontrak detail (§6.7) — `body`, `language`, `templateId`, `templateVersion`, `snapshotFingerprint`, dan kunci `fields` yang diizinkan (`keluarga`, `kategoriWajib`, `vesselName`, `voyageNumber`, `portName`, `perubahan` atau `occurredAt`/`timezone`/`eventLocalTime`) — nilai respons sama persis dengan snapshot tersimpan di DB; himpunan kunci respons = allowlist; field terlarang tidak keluar: `fields.grant`, `recipientE164Snapshot`, `logicalMessageKey`, `activeKey`, `successKey`, `sourceFingerprint`, `partyIdSnapshot`, `grantIdSnapshot`, `consentStateVersion`, ID pencatat bukti; nomor sesuai pola `^\+\d{2}••••\d{4}$`; nomor utuh fixture tidak muncul di JSON, HTML, maupun log respons. Tidak menuntut seluruh objek `fields` DB identik dengan respons, karena kontrak mewajibkan penyaringan. |
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
| T0 | PR perbaikan gate (§5.3–§5.4) | **selesai** — PR #29 MERGED `a1f6950`, gate lulus pasca-merge | 12 path §5.3 |
| T1 | `wa-message-read.service.ts`, `wa2-access.ts`, `g-static` (bagian baca), `g-api` (bagian baca) | **selesai** — PR #31 MERGED `fa0ad59` | tanpa route mutasi/UI |
| T2 | Route #1–#11, X-1, `g-api` penuh, `g-prod` | **selesai** — PR #31 MERGED `fa0ad59` | berhenti di APPROVED |
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
| G-03 | Preview sesuai snapshot yang tersimpan, tanpa kebocoran field terlarang | Field respons yang diizinkan = snapshot tersimpan; field terlarang (mis. `fields.grant`, nomor utuh) tidak keluar; penerima tersamar |
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
2. Gate §5 selesai: disetujui (G-D1..G-D4), diimplementasikan, dan MERGED (PR #29, `a1f6950`).
3. Owner memutuskan definisi/scope 2a-G §6 (D-G1..D-G9).
4. Owner memberi izin implementasi per tahap §6.15.
5. Keputusan owner atas merge, penerimaan fase, checkpoint dan langkah berikutnya. Merge tidak berarti deploy atau izin Send.

## 10. Keputusan owner yang masih terbuka

**Gate (§5):** selesai — PR #29 MERGED (`a1f6950`); tidak ada keputusan gate yang tertunda.
- G-D1: **disetujui** — tiga lapis I/H/P termasuk deteksi impor transitif.
- G-D2: **disetujui** — 2C/2E memakai basis helper.
- G-D3: **disetujui** — I-2 diperluas ke berkas pendukung F3/F4; daftar terverifikasi 15 berkas (§5.2).
- G-D4: **disetujui** — pengecualian hanya tuple basis, path, blob akhir.

**2a-G (§6):**
- D-G1: prefix `/api/automation/client-messages` dan 11 metode-path §6.4.
- D-G2: daftar 24 path §6.11 sebagai batas persis.
- D-G3: peran hanya ADMIN dan MANAJER_OPERASI.
- D-G4: tanpa link Sidebar pada 2a-G.
- D-G5: kontak/consent/grant/konfirmasi hanya melalui setup lokal sintetis.
- D-G6: tanpa schema/migrasi; bila perlu → STOP.
- D-G7: pengecualian X-1 di manifest (`i1.diizinkan` = 12 path; `faseAktif.G`).
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

## 12. Usulan UI 2a-G (T3–T4) — pasca-merge API (PR #31)

**Status: USULAN, belum diizinkan.** Disusun dari kontrak API yang sudah merged (`main` @ `fa0ad5992bba45967271cf943f12e146a95ed142`), §6.9–§6.10, dan pola UI WA-1 yang ada (`src/app/(app)/automation/communications/*`, `src/components/automation/Communication*.tsx`). Batas tetap: tanpa Send, provider WhatsApp, webhook, worker, atau pengiriman nyata; tanpa Sidebar; tanpa perubahan service F3/F4, schema, migrasi, dependency, lockfile.

### 12.1 Alur

1. **Daftar** `/automation/client-messages`: `GET /api/automation/client-messages?state&take&cursor`. Tombol "Buat draft".
2. **Kandidat** (panel di halaman daftar):
   - pilih sinyal dari `GET …/candidates/signals?voyageId&take`;
   - lalu pilih kontak dari `GET …/candidates/contacts?signalId`. Kontak `layak=false` tampil nonaktif dengan teks alasan.
3. **Draft**: `POST …` `{signalId, contactId}`.
   - `DRAFT_DIBUAT`/`SUDAH_ADA` → buka detail `messageId`.
   - 400 → tampilkan `details.code`.
4. **Detail** `/automation/client-messages/[id]`: `GET …/[id]` dan `GET …/[id]/history`. Tombol hanya muncul bila ada di `aksiTersedia` (petunjuk; server tetap menegakkan).
   - **Pratinjau**: `POST …/[id]/preview` `{snapshotFingerprint}` dari detail.
   - **Minta approval**: `POST …/[id]/request-approval` `{snapshotFingerprint}`.
   - **Setujui**: `POST …/approvals/[aid]/approve` `{proposalHash}` = `approval.proposalHash` dari detail.
   - **Tolak**: `POST …/approvals/[aid]/reject` `{proposalHash, decisionNote}`, catatan 3–1000 karakter.
   - **Batalkan**: `POST …/[id]/cancel` `{alasan}`, berlaku di DRAFT, PREVIEWED, PENDING_APPROVAL, **APPROVED**, NEEDS_REVIEW (§6.9).
   - **Buat revisi**: lihat §12.4.
5. Setelah setiap aksi: tampilkan `hasil` (+ `alasan`), lalu muat ulang detail dan riwayat. Tanpa kirim ulang otomatis.

### 12.2 Tampilan dan kondisi

| Bagian | Isi |
|---|---|
| Daftar | `state` (badge), `reasonCode`, `revision`, `penerimaTersamar`, `partyType`, `language`, `konteks.keluarga`, `approval.status`/`expiresAt`, `createdAt`; filter `state`; "Muat lebih" via `nextCursor`; label tetap "BELUM DIKIRIM — tidak ada pengiriman pada fase ini" |
| Detail | `body` read-only, `fields` (allowlist), `freshness` (status, aturan, `buktiRingkas`), `konteks` (voyage, keluarga, sinyal), `approval` (status, `expiresAt` dari server, `decidedAt`), `previewedAt`/`approvedAt`, `labelPengiriman` |
| Riwayat | `waktu`, `objek`, `peristiwa`, `stateDari → stateKe`, `alasan`, `aktor.nama`; "Muat lebih" via `nextCursor` |
| Status | 9 status §6.9; terminal tanpa tombol ubah status; APPROVED = "Disetujui — BELUM DIKIRIM" |
| Error | 400/403/404 → `error.code` + teks statis per `details.code` (mis. `CHECKER_IS_MAKER`, `SELF_APPROVAL_FORBIDDEN`, `CHECKER_IS_EVIDENCE_RECORDER`, `DECISION_NOTE_INVALID`, `CONSENT_NOT_GRANTED`, `SOURCE_INVALID`); 401 → login; 409 → muat ulang + "Data berubah, tinjau ulang"; timeout → "Status tidak pasti — memuat ulang" |
| Hasil bisnis 200 | `DITOLAK`/`DITAHAN`/`DIBLOKIR`/`KEDALUWARSA`/`SUDAH_*` ditampilkan sebagai informasi, bukan sukses |
| Akses/flag mati | Halaman server memanggil `bolehAksesWa2(ctx)` → `notFound()` bila tenant di luar allowlist, peran bukan ADMIN/MANAJER_OPERASI, konteks sistem, flag mati, atau produksi. Tidak ada link Sidebar; akses lewat URL langsung |
| Bahasa | Teks ID/EN mengikuti `getLang()` seperti halaman WA-1 |

### 12.3 Path implementasi yang diusulkan (12 path; +2 bila opsi B §12.4)

| # | Path | Jenis | Isi |
|---|---|---|---|
| 1 | `src/app/(app)/automation/client-messages/page.tsx` | baru | halaman server: `requireTenant` + `bolehAksesWa2` → `notFound()`; merender komponen daftar |
| 2 | `src/app/(app)/automation/client-messages/[id]/page.tsx` | baru | halaman server detail, pagar sama |
| 3 | `src/components/automation/ClientMessageList.tsx` | baru | komponen client daftar + panel kandidat/draft |
| 4 | `src/components/automation/ClientMessageWorkspace.tsx` | baru | komponen client detail, aksi, riwayat |
| 5 | `src/components/automation/client-message-shared.tsx` | baru | label status, teks error, tipe DTO lokal (tanpa impor `@/services/*`) |
| 6 | `prisma/check-wa2a-g-ui.mjs` | baru | uji peramban (playwright-core dari luar repo, pola `check-comm-ui.mjs`) |
| 7 | `prisma/seed-wa2a-g-demo.mjs` | baru | data demo sintetis, hanya DB loopback |
| 8 | `docs/whatsapp/WA-2a-G-UI-EVIDENCE.md` | baru | bukti UI |
| 9 | `prisma/check-wa2a-g-static.mjs` | ubah | lapis UI (§12.6); asersi X-1 lama diganti literal fase UI |
| 10 | `prisma/check-wa2a-lingkup.mjs` | ubah (beku, butuh tuple) | literal I-1 = 10 route + 2 halaman; literal `faseAktif` fase UI; skenario sintetis P-10/N-24 tidak boleh lagi memakai id `G` (§12.5) |
| 11 | `prisma/wa2a-lingkup-manifest.json` | ubah | §12.5 |
| 12 | `docs/TAH-CURRENT-CHECKPOINT.md` | ubah | status |
| 13–14 | `src/services/whatsapp/wa-message-read.service.ts`, `prisma/check-wa2a-g-api.mjs` | ubah, **hanya bila opsi B** | `contactId` di detail + kunci uji |

Komponen client hanya memanggil `fetch` ke `/api/automation/client-messages*` (origin sendiri). Komponen tidak mengimpor `@/services/*`, sehingga perujuk I-1 baru hanya 2 halaman. Lokasi komponen `src/components/automation/` mengikuti WA-1; §6.11 sebelumnya menyebut `src/components/whatsapp/` — keputusan kecil owner, rekomendasi `automation/` demi konsistensi.

### 12.4 Keputusan `contactId` pada detail

- **Kebutuhan UI.** Revisi (`BUAT_REVISI`, §6.9) adalah `POST` `{signalId, contactId}`. Detail memberi `konteks.signalIds` dan `penerimaTersamar`, tetapi tidak `contactId`.
- **Opsi A — kontrak tetap.** Dari detail, UI membuka panel kandidat kontak (`GET …/candidates/contacts?signalId=<signalIds[0]>`) dan staf memilih kontak lagi. Dampak:
  - tanpa perubahan API dan tanpa uji ulang API;
  - satu langkah ekstra;
  - risiko memilih kontak yang salah bila dua kontak berpenerima tersamar serupa — service tetap menilai ulang, tetapi kontak yang salah tetap kontak yang sah;
  - pemulihan NEEDS_REVIEW tetap "Batalkan lalu buat draft baru".
- **Opsi B — tambah `contactId` ke allowlist detail.** `contactId` adalah ID opak ber-tenant, sudah dikeluarkan endpoint #4, dan bukan nomor. Dampak:
  - ubah `detailPesanKlien` dan kunci uji (`KUNCI_DETAIL` di `check-wa2a-g-api.mjs`, asersi statis);
  - jalankan ulang static + API dev (+ flag-mati);
  - revisi menjadi satu klik dengan kontak yang sama persis.
- **Rekomendasi: opsi B, dikerjakan di PR UI** dengan uji yang menguncinya. Alasannya: revisi adalah aksi rutin saat data berubah, dan memilih ulang kontak dari nomor tersamar rawan salah. Opsi A layak bila owner ingin PR UI tanpa menyentuh API sama sekali.

### 12.5 Usulan entri manifest H dan perubahan gate (belum diterapkan)

Mekanisme yang berlaku:
- `periksaModeFase` menolak `WA2A_FASE=<id>` bila id tercatat di `fase`.
- `validasiManifest` menolak `faseAktif` yang id-nya sama dengan fase merged.
- `periksaRekaman` mewajibkan `merge^1 = basis`, `merge^2 = kepala`, tree merge = tree kepala, dan diff basis→kepala = `berkas` persis.

Nilai di bawah dihitung dari git, bukan ditebak:

| Usulan | Nilai |
|---|---|
| `fase.G` (wajib bila fase UI memakai mode fase) | `pr: 31`, `merge: fa0ad5992bba45967271cf943f12e146a95ed142`, `basis: 6a064ea585321440d0cf71812465419495f230a8`, `kepala: ec7fc9a72d535c20d1e5a527459c0cda29af0574`, `berkas`: 19 path = `faseAktif.G.izin` saat ini (terurut). Diperiksa: `^1`/`^2` cocok, tree sama, diff 19 berkas |
| `faseAktif.G` | dihapus bersamaan (tidak boleh berdampingan dengan `fase.G`) |
| `faseAktif.GUI` (nama usulan) | `izin` = path §12.3 yang disetujui; `jangkar` = `prisma/check-wa2a-g-ui.mjs` dan `src/app/(app)/automation/client-messages/page.tsx` |
| `i1.diizinkan` | 10 route + 2 halaman (§12.3 #1–#2) |
| Tuple `check-wa2a-lingkup.mjs` | `{basis: <merge main saat PR UI dibuat>, path, blob: <blob akhir>}` — dihitung saat implementasi, tidak sekarang |
| PR #29 (gate) / PR #30 (dokumen) | **tidak direkomendasikan** dicatat sebagai fase: tidak ada uji yang memeriksanya dan keduanya bukan fase fitur. Bila owner ingin, nilainya terverifikasi: #29 `merge a1f69506…`, `basis f3049187…`, `kepala 2d37111…`, 12 berkas; #30 `merge 6a064ea5…`, `basis a1f69506…`, `kepala 1f0705f2…`, 3 berkas |

Asersi yang kini sengaja mengunci "tanpa UI" dan harus diganti, bukan dilemahkan, di PR UI:
- `check-wa2a-g-static.mjs`: "X-1: tanpa halaman/komponen UI di allowlist G", serta literal 19 path/10 route.
- `check-wa2a-lingkup.mjs`: "I-1 repo nyata … PERSIS 10 route", "X-1 manifest … faseAktif hanya G", dan skenario P-10/N-24 yang menyusun `faseAktif.G` sintetis.

Guard teks lain yang tetap berlaku untuk `src/app` dan `src/components`:
- comm-policy: larangan `services/communication`;
- tah-policy: larangan `TahApprovalRequest`/`services/tah`;
- 2B: tanpa accessor model WA-2a.

### 12.6 Acceptance criteria (dapat diuji)

| ID | Kriteria | Bukti |
|---|---|---|
| UI-01 | Kedua halaman → 404 untuk: tanpa sesi (redirect login), tenant di luar allowlist, OPERATOR, flag mati, `next start` produksi lokal; Sidebar & layout tidak berubah | g-ui + g-prod (halaman) + diff |
| UI-02 | Daftar menampilkan field §12.2, filter `state`, paginasi `nextCursor`, kondisi kosong, label BELUM DIKIRIM | g-ui |
| UI-03 | Panel kandidat: sinyal dari endpoint #3 (hanya OPEN/ACKNOWLEDGED, sesuai API); kontak tidak layak nonaktif dengan alasan; draft → detail; `SUDAH_ADA` → detail pesan yang sama; 400 menampilkan `details.code` | g-ui |
| UI-04 | Tombol aksi = `aksiTersedia`; tidak ada tombol untuk status terminal; tidak ada tombol/teks "Kirim"/Send | g-ui + g-static |
| UI-05 | Alur penuh lewat peramban: draft → pratinjau → minta approval (pengguna lain) → setujui (checker lain) → APPROVED BELUM DIKIRIM → batalkan; dan cabang tolak (catatan wajib) | g-ui |
| UI-06 | Maker-checker: pembuat/peminta/pencatat bukti mencoba setujui → pesan 403 sesuai `details.code`, status tidak berubah | g-ui |
| UI-07 | 409, `KEDALUWARSA`, `DITAHAN`, `SUDAH_DIPUTUSKAN`: muat ulang + teks status aktual; klik ganda tidak mengirim dua permintaan | g-ui |
| UI-08 | Revisi sesuai keputusan §12.4 (B: satu klik dengan kontak sama; A: pilih ulang kontak) → `DRAFT_DIBUAT` revisi baru atau `SUDAH_ADA` | g-ui |
| UI-09 | DOM & lalu lintas jaringan tanpa nomor utuh; permintaan hanya ke `/api/automation/client-messages*` dan `/api/auth*`; perangkap egress server 0 BLOCKED di luar pengecualian font yang sudah dikenal | g-ui + log server |
| UI-10 | Komponen tanpa impor `@/services/*`; halaman hanya `requireTenant` + `bolehAksesWa2`; I-1 = 10 route + 2 halaman; P-fase UI lulus `WA2A_FASE=<id UI> WA2A_BUKTI=1` | g-static + helper |
| UI-11 | Regresi: g-static, g-api (aktif & flag-mati), g-prod, helper, F1–F4, 2B/2C/2E, comm-policy, tah-policy, tsc, lint, `next build` | ringkasan exit code di bukti |
| UI-12 | Teks ID/EN; tombol berlabel teks; fokus keyboard pada aksi utama | g-ui (cek dasar) |

**Kebutuhan lingkungan.**
- PostgreSQL 16 loopback sekali pakai;
- `next dev`/`next start` loopback dengan perangkap egress;
- Chromium terpasang (`/opt/pw-browsers`);
- `playwright-core` dari luar repo — tanpa perubahan `package.json`/lockfile, mengikuti pola `check-comm-ui.mjs`.

Bila `playwright-core` tidak tersedia, g-ui DILEWATI (kode 3) dan dilaporkan apa adanya.

