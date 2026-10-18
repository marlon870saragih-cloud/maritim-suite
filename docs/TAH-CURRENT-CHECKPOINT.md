# TAH / Maritim Suite — Current Checkpoint (CANONICAL)

> **SESSION START RULE**
> Every new TAH / Maritim Automation / WhatsApp Automation session MUST first read this file
> (`docs/TAH-CURRENT-CHECKPOINT.md`) and continue from **NEXT EXACT STEP** (§L).
> DO NOT perform a recovery audit from zero unless:
> - this checkpoint explicitly says UNVERIFIED for the state you depend on,
> - repository state materially changed without a checkpoint update,
> - production state materially changed,
> - or the owner explicitly requests a new audit.

> **SESSION END RULE**
> Before ending every development session, update this checkpoint with:
> - date/time
> - branch
> - HEAD SHA
> - working tree state
> - completed step
> - tests/results
> - production state if changed
> - known blockers
> - NEXT EXACT STEP
>
> This checkpoint is the canonical handoff between the owner, ChatGPT, Claude Code, and future sessions.

**Checkpoint resmi:** 2026-10-05 — TAH / Maritim Suite → WhatsApp Automation handoff.
**Pembaruan terakhir:** 2026-10-19 WITA (2026-10-18 UTC) — **PR #40 (A1 SG-05) MERGED; keputusan owner D-1, D-2, D-2b, D-4 disinkronkan (OD-33–OD-36). SG-05 tetap OPEN.** `main` = `ab4dac7628683755d301c7620613f1b125fd7987` (merge PR #40; parent `23ec4e8` + `2f7ee38`; tree merge = tree HEAD PR `2f7ee38`; 3 path). Pasca-merge (clone `main` bersih, Linux, statis tanpa DB/HTTP): `check-sg05-batas-fixture` 55/0, `check-wa2a-lingkup` 73/0, `check-wa2a-g-static` 153/0, `check-wa2a-message-f3` 66/0. Uji SG-05 **belum dijalankan di Windows sungguhan**; 0 check-run (repo tanpa CI) bukan CI hijau. Keputusan D-1/D-2/D-2b/D-4 = **DISETUJUI** — dilaporkan owner dari sesi ChatGPT Work sesudah merge PR #40 (2026-10-18 14:21 UTC); tanggal persis keputusan tidak tercatat di repository; disinkronkan ke repository melalui pembaruan ini (OD-33–OD-36). D-2b mengizinkan pengembangan jalur FAKE/loopback non-produksi untuk bukti integrasi; D-4 hanya penyusunan rancangan A2. **Tidak ada izin implementasi A2, F-II, atau WA-3**; tidak ada deploy, aktivasi flag nyata, provider, atau Send. Status bukti SG-05: P-1 tersedia (keputusan + uji statis Linux), P-2 belum, P-3 belum. Penerimaan WA-2a 2a-G (OD-30) tetap; F-6 = pengecualian demo; U-1 = backlog UX. WA-3: belum dimulai. **NEXT EXACT STEP: review rancangan A2 (`RANCANGAN-A2-SG05.md` — belum ada di repository), lalu keputusan owner atas scope implementasi A2 (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-18 — **SG-05 A1 (batas fixture WA-1) diimplementasikan atas keputusan owner D-3 (OD-32); draft PR #40, belum merged. SG-05 tetap OPEN.** Revisi 1 (temuan reviewer: `spawnSync mkdir ENOENT` di Windows/Node 24.16.0; sisip M4 salah tempat pada berkas CRLF) memperbaiki helper mutasi uji; validasi sisip + sintaks M4 ditambahkan; bukti hanya Linux (emulasi CRLF/PATH minimal), suite Windows belum dijalankan ulang. Baseline `main` = `23ec4e8f59904af9e9827c3a57953abe18874d4a` (merge PR #39). Tepat tiga path: [SG-05-PENYELARASAN.md](whatsapp/SG-05-PENYELARASAN.md) (baru), `prisma/check-sg05-batas-fixture.mjs` (baru; uji statis S-1–S-6 + kontrol mutasi pada clone sementara, tanpa DB/jaringan), dan berkas ini. Tanpa perubahan `src/`, manifest, helper gate, tuple, frozen scope, schema, migrasi, atau dependency. Uji statis hanya menjaga agar fixture WA-1 tidak dipakai jalur WA-2/provider; **bukan** bukti kebenaran penerima saat Send dan tidak menggantikan uji runtime (S-4 = heuristik teks, bukan call graph). D-1 (penyimpangan fixture), D-2 (penyelarasan SG-05R), D-2b (batas fase), dan D-4 (desain A2) **belum diputuskan**; isinya tercatat sebagai usulan. Penerimaan 2a-G (OD-30) tetap berlaku. Koreksi istilah: "zero egress" pada §F dibatasi menjadi tanpa pengiriman WhatsApp/provider; F-6 (Google Fonts) dan keterbatasan ukur proxy loopback tetap dicatat terpisah. **NEXT EXACT STEP: review draft PR A1; merge memerlukan persetujuan owner terpisah (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-18 — **Demo owner WA-2a 2a-G di Windows/Edge dijalankan; OWNER ACCEPTANCE WA-2a 2a-G: DITERIMA (OD-30)** atas satu run **uji coba** (bukan run penerimaan bersih) di laptop owner, baseline `1b20baa`. D1–D15 sesuai; **D16 dijalankan tetapi kriterianya tidak terpenuhi** (`BLOCKED=20`), pengecualian diterima owner; pembersihan 10a–10f selesai. Temuan **F-6**: server `next dev` mencoba `fonts.googleapis.com` 20 kali (semua diblokir), sehingga D16 tidak terpenuhi — owner menerima F-6 apa adanya. Keputusan owner: A-01–A-09 Sesuai, A-10 Diterima, Q-1 boleh (peminta/pencatat bukti dapat membatalkan), U-1 (temuan tampilan) → backlog UX, tidak memblokir (OD-31). Penerimaan ini untuk proof-of-flow lokal non-produksi sampai APPROVED/BELUM DIKIRIM; **bukan** izin deploy, aktivasi flag, Send, atau WA-3. SG-05 tetap TERBUKA. Koreksi kit: klaim "BLOCKED 0" Linux tidak membuktikan tanpa egress (proxy loopback). Dokumen ini dan panduan demo dimasukkan lewat PR (OD-31; merge memerlukan persetujuan terpisah). **NEXT EXACT STEP: review/keputusan merge PR dokumentasi, lalu owner memilih langkah berikutnya (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-18 — **PR #37 dan PR #38 (perbaikan login staf F-1/F-3) MERGED; kit demo WA-2a 2a-G v4 disusun untuk review (OD-26).** `origin/main` = `1b20baa1ac83e3ab2689bff4a77f290fc2aadd91` (merge PR #38, parent `c2ad40b` + `b54cc09`; tree merge = tree HEAD PR `8a1e18d`; delta tepat 2 path). PR #37 = merge `c2ad40b` (parent `a50c9bf` + `0b57481`, 2 path). Pasca-merge PR #38 di `main` bersih (Linux, Node v22.22.0, tanpa `WA2A_FASE`): helper 73/0, g-static 153/0 (`WA2A_BUKTI=1`), comm-policy 326/0, tah-policy 322/0 (§B). Kit v4 (usulan di luar repo, belum di-commit): panduan memakai baseline `1b20baa`, login sukses memuat penuh halaman tujuan, status "tidak pasti" → muat ulang untuk memeriksa (tanpa coba-ulang otomatis). Verifikasi teknis kit v4 di Linux/Chromium (bukan Windows/Edge): uji asap 17/0 — 5/5 login satu klik bersesi termasuk login pertama sesudah `next dev` dingin, D1–D9 + D15 sampai "Disetujui — BELUM DIKIRIM", BLOCKED 0. **Windows/Edge BELUM DIJALANKAN.** **Penerimaan owner (T5/G-12) belum dilakukan; A-01–A-10 BELUM DINILAI; Q-1 menunggu owner.** Tidak ada perubahan kode aplikasi oleh kit; tidak di-deploy; tanpa Send. **NEXT EXACT STEP: owner meninjau kit v4, lalu demo interaktif di laptop Windows/Edge dan keputusan penerimaan (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-17 — **Persiapan demo & penerimaan owner WA-2a 2a-G (OD-26)** — kit demo Windows/PowerShell disusun: [WA-2a-G-DEMO.md](whatsapp/WA-2a-G-DEMO.md) (lokal, data sintetis, tanpa Send). Panduan Windows/PowerShell **BELUM DIJALANKAN** (pemeriksaan teks blok bukan uji runtime). Bukti Linux historis: padanan bash panduan versi awal, D1–D15 16/0 pada `a50c9bf`. Uji terarah revisi kit (Linux): 29/30 login bersesi, 1/30 F-3 walau indikator siap. Reviewer melaporkan bahwa parser PowerShell 5.1/7.6 tidak menemukan galat sintaks pada 16 blok versi sebelumnya; ini bukan uji runtime, dan sebagian blok sudah diubah sesudahnya. Semuanya bukti verifikasi kit, bukan penerimaan. **Demo penerimaan owner ditunda** sampai keputusan terpisah tentang F-1/F-3. **Penerimaan owner (T5/G-12) belum dilakukan**; semua kriteria A-01–A-10 BELUM DINILAI. Temuan persiapan dicatat tanpa diperbaiki (§L). **NEXT EXACT STEP: owner meninjau kit, lalu demo interaktif dan keputusan penerimaan (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-17 — **PR #36 (portabilitas Windows `check-comm-policy`) MERGED** — merge `a50c9bf968d0569f7393b63e1da0330f8f0ca578` (parent `e4a351e` + `073f897`), expected HEAD `073f897b0e34dffe2699b81464927ceeba19b3cd` atas persetujuan merge owner terpisah (OD-25); tree merge = tree HEAD PR (`312b07e`); delta `e4a351e → merge^2` = 4 path. Pasca-merge di `main` bersih (Linux, Node v22.22.0, tanpa `WA2A_FASE`): comm-policy 326/0, 2B statis 32/0 (exit 3 = bagian DB dilewati), helper 73/0 dan g-static 153/0 (`WA2A_BUKTI=1`); `faseAktif` = `{}`, 13 tuple, tuple tidak diubah. Tidak ada pengujian Windows baru pasca-merge (bukti reviewer berlaku untuk blob identik `56f8362`/`766123f`). Tidak ada fase aktif; tidak ada perubahan aplikasi; tidak di-deploy.
**Pembaruan sebelumnya (historis):** 2026-10-17 — **PR #35 (penutupan fase GUI) MERGED** — merge `e4a351eb6c908b12aad757ccff6bf9c92072903b` (parent `c787078` + `31d1563`), expected HEAD `31d1563b2a01a49171a70d36edc5add2d27773a7` atas persetujuan merge owner terpisah (OD-23); tree merge = tree HEAD PR; pasca-merge helper 73/0 dan g-static 153/0 (H GUI lulus, `faseAktif` kosong) di `main` bersih (§B). **Portabilitas Windows `check-comm-policy` diimplementasikan (OD-24) dalam PR terpisah, OPEN — belum merged.** HEAD kode uji `a95e90f`: suite statis Linux lulus (§B); bukti Windows nyata dari reviewer (Node v24.16.0, `process.platform=win32`, tanpa shim) pada baseline `e4a351e` + patch 4 path **belum di-commit** dengan blob yang sama (comm-policy `56f8362`, wa2a-schema `766123f`): baseline comm-policy 325/1 → patch 326/0; 2B statis 32/0 (exit 3); g-static mode bawaan tanpa `WA2A_BUKTI` 152/0; pembuat ketiga di subdirektori dalam → comm-policy 325/1; baris di luar `BARIS_2B` → 2B 31/1 dan g-static 151/1. Tidak dijalankan di Windows: helper penuh, F1–F4/2C/2E, tah-policy, audit scope, DB/UI/HTTP/build; bukti tersebut bukan pengujian HEAD PR final. Tidak ada fase aktif; tidak ada perubahan kode aplikasi; tidak di-deploy; F5, WA-2b, dan pengiriman nyata belum disetujui. **NEXT EXACT STEP: review dan keputusan merge PR portabilitas oleh owner (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-17 — **Penutupan fase GUI di manifest lingkup diimplementasikan (OD-22), PR OPEN — belum merged.** Branch `claude/intelligent-turing-vubpcx` dari `main` `c787078` (merge PR #34): `fase.GUI` dicatat sebagai rekaman historis PR #33 (diperiksa lapis H), `faseAktif` = `{}` tanpa fase pengganti, satu tuple pengecualian untuk uji helper beku. HEAD kode uji `41820f4`; helper 73/0, g-static 153/0, F1–F4/2C/2E lulus, 2B statis 32/0 (exit 3), comm/tah-policy 326/0 · 322/0 (Linux); `WA2A_FASE=GUI` kini ditolak (§B). Tidak ada perubahan kode aplikasi; tidak di-deploy; Windows, F5, WA-2b, dan pengiriman nyata belum disetujui. **NEXT EXACT STEP: review dan keputusan merge PR penutupan oleh owner (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-17 — **PR #33 UI 2a-G (T3–T4) MERGED** — merge `93fb95e30835817c3e7b9ee5d0294795282e821f` (parent `c1003d5` + `5b775e4`), merge commit dengan expected HEAD `5b775e4375d7dad8a7b7b570f69d1e6ac6439e23` atas **persetujuan merge owner terpisah (OD-21)**; implementasinya berada dalam scope OD-20 (14 path, lokal non-produksi). [PR #33](https://github.com/marlon870saragih-cloud/maritim-suite/pull/33). Tree merge = tree PR. Tanpa review/komentar/check-run (repo tidak punya CI). Pemeriksaan pasca-merge di clone `main` bersih lulus (§B). Tidak di-deploy; flag nyata tidak diaktifkan; pengiriman WhatsApp nyata belum ada. Portabilitas Windows `check-comm-policy` (325/1) belum diperbaiki (usulan belum disetujui). **NEXT EXACT STEP: keputusan owner atas langkah berikutnya (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-17 — **Revisi 1 PR #33 (UI 2a-G T3–T4): perbaikan race test UI**, hanya `prisma/check-wa2a-g-ui.mjs` (menunggu kondisi panel APPROVED dengan batas 30 s, tanpa jeda tetap; asersi tepat 1 POST approve + versi approval tetap). Tanpa perubahan aplikasi, manifest, helper, atau berkas beku; PR tetap 14 path. HEAD kode uji `9a9fa2e`: g-static 153/0, helper 69/0, g-ui dev 45/0, flag-mati 10/0, produksi lokal 10/0, build sukses; race direproduksi pada test lama (43/1), ditahan test baru dengan injeksi sama (45/0), kontrol negatif 44/1 ([bukti UI §6](whatsapp/WA-2a-G-UI-EVIDENCE.md)). `check-comm-policy` 326/0 di Linux; kegagalan portabilitas Windows (325/1) **belum diperbaiki** (berkas beku, usulan terpisah belum disetujui). **PR #33 OPEN — belum merged, tidak di-deploy.** Pengiriman WhatsApp nyata belum diaktifkan. **NEXT EXACT STEP: review dan keputusan merge PR #33 oleh owner (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-16 — **PR #32 MERGED** (`c1003d5fe01bac21acce30a8dffebc5061cbe468`, koreksi rencana UI-01/UI-04 + OD-20). **UI 2a-G T3–T4 diimplementasikan** di branch `feat/wa2a-g-ui` (14 path, opsi B `contactId` di detail, manifest `fase.G` + `faseAktif.GUI`). HEAD kode uji `5fda8d4`; g-static 153/0, helper 69/0, g-api 109/0 & 22/0, g-ui dev 44/0, flag-mati 10/0, produksi lokal 10/0, g-prod 20/0, build sukses ([bukti UI](whatsapp/WA-2a-G-UI-EVIDENCE.md)). **PR UI OPEN, belum di-merge.** Pengiriman WhatsApp nyata belum diaktifkan. **NEXT EXACT STEP: review dan keputusan merge PR UI (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-16 — **PR #31 API 2a-G (T1–T2) MERGED** — merge `fa0ad5992bba45967271cf943f12e146a95ed142` (parent `6a064ea` + `ec7fc9a`), merge commit dengan expected HEAD `ec7fc9a`. Tanpa review/komentar/check-run (repo tidak punya CI). Pemeriksaan pasca-merge di clone `main` bersih lulus (§B). API selesai; **UI belum diimplementasikan**; pengiriman WhatsApp nyata belum diaktifkan. Usulan UI T3–T4 di [rancangan §12](whatsapp/WA-2a-NEXT-PHASE-DRAFT.md#12-usulan-ui-2a-g-t3t4--pasca-merge-api-pr-31). Owner menyetujui usulan dengan dua koreksi (OD-20). **NEXT EXACT STEP: implementasi UI T3–T4 opsi B dalam PR terpisah; merge PR UI perlu izin owner tersendiri (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-16 — **Revisi 1 PR #31: kandidat sinyal kini hanya OPEN/ACKNOWLEDGED, disaring di query sebelum batas jumlah** (izin owner, dalam 19 path). HEAD kode yang diuji `ba617ba`; static 131/0, API dev 104/0, flag-mati 22/0, helper 66/0, gate scope F1–F4/2C/2E lulus, tsc/lint bersih ([bukti §0](whatsapp/WA-2a-G-EVIDENCE.md)). PR #31 tetap OPEN, belum merged. **NEXT EXACT STEP: review dan keputusan merge PR API 2a-G (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-16 — **PR #30 MERGED** (`6a064ea585321440d0cf71812465419495f230a8`). **API 2a-G (T1–T2) diimplementasikan** di branch `feat/wa2a-g-api` atas izin owner (19 path, X-1): read service + 10 route `/api/automation/client-messages`, berhenti di APPROVED, tanpa Send/UI. HEAD kode yang diuji `4d6f995`; uji baru dan regresi lulus di clone bersih ([bukti 2a-G](whatsapp/WA-2a-G-EVIDENCE.md)). **PR API OPEN, belum di-merge.** **NEXT EXACT STEP: review dan keputusan merge PR API 2a-G (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-16, 23.47 WITA — **PR #29 gate lingkup I/H/P MERGED** (`a1f69506e5ad04bc522c2dd8ac5232ded7fa4d42`); verifikasi pasca-merge di `main` bersih lulus (F4 70/0; sebelumnya 60/1). **Blocker gate lingkup F1–F4 DITUTUP** berdasarkan hasil tersebut. 2a-G **belum diizinkan**; pengiriman WhatsApp tetap di luar scope. Bukti: [WA-2a-GATE-SCOPE-EVIDENCE.md](whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md). **NEXT EXACT STEP: persetujuan scope dan implementasi API 2a-G (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-16 malam — PR #28 MERGED (`f3049187334d4665eb276b125f6a1e9918da41bb`); **perbaikan gate lingkup I/H/P diimplementasikan di branch `fix/wa2a-gate-lingkup-ihp` ([PR #29](https://github.com/marlon870saragih-cloud/maritim-suite/pull/29), belum merged; tiga temuan review sudah diperbaiki)** sesuai keputusan owner G-D1..G-D4. Bukan izin 2a-G. Bukti: [WA-2a-GATE-SCOPE-EVIDENCE.md](whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md). **NEXT EXACT STEP: review dan keputusan merge PR gate (§L).**
**Pembaruan sebelumnya:** 2026-10-16, 18.42 WITA — **WA-2a F1–F4 MERGED**. F1 #23, F2 #24, F3 #25, perbaikan uji 2B #26, dan F4 #27 sudah masuk ke main. Merge F4: `5e58237c393a6115d3c55a5c1382dd3c5826a976`, HEAD yang ditinjau: `d665216acf85803092771a2b01bced5131cbe927`. Owner menyetujui kelanjutan setelah rekomendasi merge dan dua pengecualian scope (§A). F4 berhenti di **APPROVED**, tanpa Send. Tidak ada deploy, migrasi produksi, atau aktivasi flag dalam sesi ini. WA-2 belum production-ready. Revisi dokumentasi PR #28 (16 Oktober malam): masalah gate lingkup F1–F4 dicatat (§B, §H), jejak historis dilengkapi, rancangan perbaikan gate dan preflight 2a-G dimuat di dokumen rancangan. **NEXT EXACT STEP: tiga keputusan owner yang terpisah — merge dokumentasi PR #28, rancangan/izin perbaikan gate, definisi/izin 2a-G; implementasi apa pun tetap memerlukan persetujuan owner (§L).**
**Pembaruan sebelumnya (historis):** 2026-10-11 — WA-2a 2B/2C/2E merged (#19–#21). WA-1 diterima owner pada 10 Oktober 2026 sebagai proof-of-flow FAKE-only non-produksi (#17/#18); penerimaan tersebut tidak mencakup pengiriman WhatsApp nyata.
**Status pekerjaan:** TAH / PRD-005 **CLOSED**. Pekerjaan produk berikutnya: **Client Communication / WhatsApp Automation**.
**Dokumen pendamping:** `docs/whatsapp/PRD-WA-1.md` (**baseline WA-1 v0.2 — source of truth WhatsApp Automation**), `docs/PRD-005-CLOSURE.md`, `docs/PRODUCTION-STATE-2026-09-30.md`, `docs/TAH-TECH-DEBT.md`,
`docs/TAH-GAP-ANALYSIS-2026-09-30.md` (saat ini hanya di branch `docs/tah-gap-analysis-20260930`, belum di `main`).

**Label bukti:**
- **VERIFIED (tanggal)** — dibaca langsung oleh sesi yang menulis entri.
- **OWNER-VERIFIED (tanggal)** — dijalankan/diamati owner di produksi dan dilaporkan; output mentah tidak ditinjau sesi penulis.
- **HISTORICAL (tanggal)** — benar pada tanggal itu; belum diperiksa ulang.
- **UNVERIFIED** — belum ada bukti.

Repo ini PUBLIK: jangan mencatat credential, nilai env rahasia, ID proyek GCP, IP, atau data klien.

---

## A. OWNER DECISIONS (berlaku sampai diubah owner)

| ID | Keputusan | Tanggal |
|---|---|---|
| OD-1 | Produksi resmi = GCP Compute Engine. Railway ditinggalkan (diputus & di-uninstall dari GitHub). Vercel App di-uninstall dari GitHub. | 2026-09-27 / 2026-09-30 |
| OD-2 | **TAH / PRD-005 CLOSED.** Jangan membuka kembali PRD-005 atau menjalankan siklus evaluasi baru kecuali owner memerintahkan secara eksplisit. Validator V3 FINAL (`ac6460c`) tidak diubah; tidak ada Blind-C/Eval-9. | 2026-09-29 / 2026-10-05 |
| OD-3 | **Pekerjaan produk berikutnya = Client Communication / WhatsApp Automation.** | 2026-10-05 |
| OD-4 | **Arah model TAH ke depan = `anthropic/claude-sonnet-5`.** Ini arah, BUKAN promosi teknis (lihat §I). | 2026-10-05 |
| OD-5 | Reminders produksi tetap ENABLED (D-2). | 2026-09-30 |
| OD-6 | Tenant uji/duplikat di produksi = HOLD, tidak diubah (D-1). | 2026-09-30 |
| OD-7 | Penyelarasan GitHub terpisah dari deploy produksi (D-3). Merge, deploy, aktivasi fitur, dan promosi model = langkah terpisah, masing-masing dengan persetujuan owner. | 2026-09-30 |
| OD-8 | `origin/main` di GitHub = source of truth kode. Jangan melanjutkan dari folder/arsip/checkout lama. Jangan menyimpulkan `main` == produksi. | 2026-10-05 |
| OD-9 | File ini = canonical checkpoint. | 2026-10-05 |
| OD-10 | **PRD WA-1 v0.2 OWNER APPROVED + FROZEN** sebagai baseline (`docs/whatsapp/PRD-WA-1.md`). Persetujuan baseline tidak mengotorisasi implementasi. | 2026-10-05 |
| OD-11 | **P-04 / D-12:** proof-of-flow `INTERNAL_FAKE_TEST` hanya non-production/local-dev; tidak ada pengecualian untuk VM produksi; staging penuh tidak dibangun di WA-1. | 2026-10-05 |
| OD-12 | **P-08 / D-13:** `OPEN` → boleh Prepare; `ACKNOWLEDGED` → boleh Prepare; `DISMISSED` → tidak boleh; `EXPIRED` → tidak boleh. ACK bukan approval; komunikasi eksternal tetap butuh human approval terpisah. | 2026-10-05 |
| OD-13 | **D-14:** `VoyageEvent.occurredAt` di masa depan diblokir; timezone pelabuhan wajib valid; revalidasi sumber sebelum Prepare dan Send; sumber deleted/superseded tidak dikirim; `dataOrigin` bukan penanda data uji yang andal. | 2026-10-05 |
| OD-14 | **OWNER ACCEPTANCE WA-1: APPROVED.** Owner menjalankan demo langsung (Google Chrome, laptop owner, DB lokal sintetis) dan menerima: menu Komunikasi (Simulasi), Siapkan Update Klien dari event kapal, preview ID, preview EN, approval, FAKE Send, riwayat audit. Penerimaan berlaku untuk proof-of-flow **FAKE-only non-produksi**; bukan izin deploy, WA-2, atau pengiriman WhatsApp nyata. | 2026-10-10 |
| OD-15 | **F4: merge disetujui** untuk HEAD `d665216acf85803092771a2b01bced5131cbe927`, termasuk tambahan path persis `prisma/check-voyage-event-api.mjs` pada allowlist F1–F4 dan pengecualian E1 sisi WA-2 pada asersi pembuat approval di `prisma/check-wa2a-message-f3.mjs`. Dasar: owner menjawab “ok lanjut” sesudah tiga keputusan tersebut diajukan pada review akhir 16 Oktober. Tercatat pula dalam pesan merge #27. Bukan izin deploy/Send. | 2026-10-16 |
| OD-16 | Lanjutkan pembaruan checkpoint dan penyusunan rancangan fase berikutnya sebagai dokumentasi untuk review. Definisi fase dan implementasi berikutnya belum disetujui; F5, 2a-F′, 2a-I tidak ditebak. | 2026-10-16 |
| OD-36 | **D-4: penyusunan rancangan A2 SG-05 disetujui** — rancangan saja; **bukan** izin implementasi A2. Sumber: dilaporkan owner dari sesi ChatGPT Work sesudah merge PR #40 (2026-10-18 14:21 UTC); tanggal persis keputusan tidak tercatat di repository; disinkronkan ke repository melalui pembaruan ini. | Tanggal keputusan tidak tercatat (diketahui sesudah merge PR #40, 2026-10-18 14:21 UTC); disinkronkan ke repository 2026-10-19 WITA (2026-10-18 UTC) |
| OD-35 | **D-2b: jalur FAKE/loopback non-produksi boleh dikembangkan untuk bukti integrasi (F-II) sebelum SG-05 ditutup** — tidak mengizinkan provider resmi, nomor nyata, kredensial nyata, atau pengiriman WhatsApp. Padanan [SG-05-PENYELARASAN.md](whatsapp/SG-05-PENYELARASAN.md) §7 Y-4; syarat Y-4 "tanpa aktivasi flag nyata" tetap berlaku sebagai batas teknis. Integrasi WhatsApp nyata (F-III/WA-3) tetap menunggu SG-05 CLOSED. **Implementasi F-II memerlukan persetujuan scope terpisah.** Sumber: dilaporkan owner dari sesi ChatGPT Work sesudah merge PR #40 (2026-10-18 14:21 UTC); tanggal persis keputusan tidak tercatat di repository; disinkronkan ke repository melalui pembaruan ini. | Tanggal keputusan tidak tercatat (diketahui sesudah merge PR #40, 2026-10-18 14:21 UTC); disinkronkan ke repository 2026-10-19 WITA (2026-10-18 UTC) |
| OD-34 | **D-2: penyelarasan SG-05R disetujui** — penerima nyata (WaContact) terikat tenant pesan dan direvalidasi sebelum klaim pengiriman (R1–R8; [SG-05-PENYELARASAN.md](whatsapp/SG-05-PENYELARASAN.md) §4 P-2, §7 Y-1–Y-3). PRD-WA-1 tidak diedit (beku). Sumber: dilaporkan owner dari sesi ChatGPT Work sesudah merge PR #40 (2026-10-18 14:21 UTC); tanggal persis keputusan tidak tercatat di repository; disinkronkan ke repository melalui pembaruan ini. | Tanggal keputusan tidak tercatat (diketahui sesudah merge PR #40, 2026-10-18 14:21 UTC); disinkronkan ke repository 2026-10-19 WITA (2026-10-18 UTC) |
| OD-33 | **D-1: penyimpangan fixture WA-1 diterima terbatas** — P-1(a) fixture tanpa relasi tenant dan P-1(b) Approve WA-1 tanpa cek SG-05, hanya untuk simulasi FAKE internal non-produksi dalam tenant allowlist Automation, dengan batas penghentian P-1 ([SG-05-PENYELARASAN.md](whatsapp/SG-05-PENYELARASAN.md) §4). Bukan penutupan SG-05. Sumber: dilaporkan owner dari sesi ChatGPT Work sesudah merge PR #40 (2026-10-18 14:21 UTC); tanggal persis keputusan tidak tercatat di repository; disinkronkan ke repository melalui pembaruan ini. | Tanggal keputusan tidak tercatat (diketahui sesudah merge PR #40, 2026-10-18 14:21 UTC); disinkronkan ke repository 2026-10-19 WITA (2026-10-18 UTC) |
| OD-32 | **D-3: implementasi A1 SG-05 disetujui** berdasarkan rancangan opsi A v2 (di luar repo): tepat tiga path — `docs/whatsapp/SG-05-PENYELARASAN.md` (baru), `prisma/check-sg05-batas-fixture.mjs` (baru), berkas ini. Mencakup implementasi, uji statis dan kontrol mutasi terisolasi, commit, push biasa tanpa force, dan draft PR. **Merge memerlukan persetujuan terpisah.** Bukan izin perubahan `src/`, manifest, gate, tuple, frozen scope, schema, migrasi, dependency, deploy, flag nyata, provider, Send, A2, WA-3, atau perbaikan F-6/U-1. D-1, D-2, D-2b, D-4 **belum diputuskan**. SG-05 tetap OPEN. | 2026-10-18 |
| OD-31 | **U-1 (temuan tampilan demo) = A: masuk backlog UX, tidak memblokir penerimaan.** Owner menyetujui commit dan PR untuk tepat dua dokumen (`docs/whatsapp/WA-2a-G-DEMO.md`, berkas ini) dari kit v4.1. **Merge memerlukan persetujuan terpisah.** Langkah berikutnya (perencanaan WA-3, SG-05, perbaikan F-6/U-1) masing-masing memerlukan persetujuan terpisah dan belum dimulai. | 2026-10-18 |
| OD-30 | **OWNER ACCEPTANCE WA-2a 2a-G: DITERIMA** atas run **uji coba** Windows/Edge 18 Oktober 2026 (laptop owner, baseline `1b20baa`, data sintetis, tanpa Send). Jawaban owner apa adanya: A-01 1, A-02 1, A-03 1, A-04 1, A-05 1, A-06 1, A-07 1, A-08 1, A-09 1 (semua "Sesuai"); A-10 **A (Diterima)**; Q-1 **A** (peminta dan pencatat bukti boleh membatalkan pesan berstatus menunggu approval); F-6 **A** (diterima apa adanya untuk demo lokal); K-1 Ya (koreksi kit v4.1); K-2 Ya (pembaruan checkpoint); K-3 nomor OD berurutan dari OD-27. U-1 (temuan tampilan) tidak dijawab = **belum diputuskan**. Fakta pendamping: penolakan server untuk self-approval (A-05), kedaluwarsa (A-07), dan lintas tenant (A-08) tidak diperagakan, buktinya uji otomatis; D16 tidak terpenuhi (F-6). Lingkup: proof-of-flow lokal non-produksi; **bukan** izin deploy, aktivasi flag di lingkungan nyata, Send, provider, atau WA-3. | 2026-10-18 |
| OD-29 | **Persiapan kit demo v4 dan verifikasi lokal terbatas disetujui** (pasca-merge PR #38): usulan di luar repo untuk `docs/whatsapp/WA-2a-G-DEMO.md` dan berkas ini; tanpa perubahan kode aplikasi, test, dependency, schema, migrasi, manifest, gate, tuple, atau frozen scope; tanpa commit, push, PR, merge, deploy. | 2026-10-18 |
| OD-28 | **Merge PR #38 disetujui** hanya untuk HEAD `b54cc09afb06aff967d72e1938fa43c43af27340` atas `main` `c2ad40b`, dengan merge commit; diikuti verifikasi pasca-merge (§B). Bukan izin deploy, aktivasi lingkungan nyata, WhatsApp Send, perubahan kode tambahan, atau penerimaan demo owner. | 2026-10-18 |
| OD-27 | **Merge PR #37 disetujui** (login: cegah kredensial di URL dan sukses login palsu, F-1/F-3); merge `c2ad40b` (parent `a50c9bf` + `0b57481`). Rincian persetujuan tercatat di percakapan/PR #37 dan tidak diringkas ulang di sini. | 2026-10-17 |
| OD-26 | **Langkah berikutnya = opsi A: persiapan demo & penerimaan owner WA-2a 2a-G** — lokal, data sintetis, tanpa Send; laptop demo Windows. Izin hanya menyiapkan kit demo dan memverifikasi kelayakannya. **Bukan** penerimaan produk, izin perbaikan aplikasi, publikasi, deploy, aktivasi flag, atau pengiriman. | 2026-10-17 |
| OD-25 | **Merge PR #36 disetujui** hanya untuk HEAD `073f897b0e34dffe2699b81464927ceeba19b3cd`, terbatas pada perbaikan portabilitas test Windows (OD-24) dan verifikasi pasca-merge. Bukan izin perubahan aplikasi, fase baru, deploy, aktivasi flag, atau pengiriman. | 2026-10-17 |
| OD-24 | **Implementasi portabilitas Windows `check-comm-policy` disetujui** (terpisah dari OD-22/OD-23), berdasarkan paket usulan v2 yang direview (SHA-256 `4b6ea72916fbcf51d4b3b3fd407bf55200376daf39b735b7b206791b52376c1e`) dan bukti Windows reviewer (arsip SHA-256 `5d55c0250e42fdd82f34068e0d969694df355ea37f5c86a86e25fc664a01d985`): tepat 4 path (`prisma/check-comm-policy.mjs`, `prisma/check-wa2a-schema.mjs`, `prisma/wa2a-lingkup-manifest.json`, berkas ini); perubahan beku hanya 2 baris normalisasi pemisah path di comm-policy (blob `56f8362eb8d9513c66a27fb324fe4c7a932c616c`) dan penggantian entri `BARIS_2B` 2B (blob `766123ffba93318360a76386b7d6d6050369e611`), masing-masing lewat satu tuple berbasis `e4a351eb6c908b12aad757ccff6bf9c92072903b`. Daftar pembuat `TahApprovalRequest` tetap PERSIS dua service; pola pencarian & rekursi tetap; `faseAktif` tetap `{}`. Mencakup implementasi, uji, commit, push biasa, dan PR. **Merge memerlukan persetujuan terpisah** untuk HEAD final. Bukan izin F5/WA-2b, Send, deploy, atau aktivasi flag. | 2026-10-17 |
| OD-23 | **Merge PR #35 disetujui** hanya untuk HEAD `31d1563b2a01a49171a70d36edc5add2d27773a7`, terbatas pada penutupan fase GUI (OD-22) dan verifikasi pasca-merge. Bukan izin fase baru, Windows, deploy, aktivasi flag, atau pengiriman. | 2026-10-17 |
| OD-22 | **Implementasi penutupan fase GUI disetujui** (persetujuan owner terpisah dari OD-20 dan OD-21), berdasarkan paket usulan yang direview (SHA-256 `5e594019aa26a21dddd8e34e4f01f5220cfd2d54d94b697cd7f88e07dab24034`): tepat 4 path (`prisma/wa2a-lingkup-manifest.json`, `prisma/check-wa2a-lingkup.mjs`, `prisma/check-wa2a-g-static.mjs`, berkas ini); `fase.GUI` = {pr 33, merge `93fb95e`, basis `c1003d5`, kepala `5b775e4`, 14 berkas}; `faseAktif` = `{}`; perubahan beku hanya `prisma/check-wa2a-lingkup.mjs` lewat satu tuple {basis `c787078233f9f4da721ededfe9b67800aeaa12ca`, blob `fe545789fcb1193bc00ea4a03a75c21bd632b53d`}. Mencakup implementasi, uji, commit, push branch terpisah, dan PR. **Merge memerlukan persetujuan terpisah** untuk HEAD final. Bukan izin Windows, F5, WA-2b, Send, deploy, atau aktivasi flag. | 2026-10-17 |
| OD-21 | **Merge PR #33 disetujui** (persetujuan owner terpisah dari OD-20) hanya untuk expected HEAD `5b775e4375d7dad8a7b7b570f69d1e6ac6439e23`, terbatas pada UI 2a-G sesuai OD-20 (14 path, lokal non-produksi, berhenti di APPROVED tanpa Send), termasuk verifikasi pasca-merge. Tidak mencakup deploy, aktivasi flag nyata, perubahan frozen scope, perubahan manifest, atau fase berikutnya. | 2026-10-17 |
| OD-20 | **Rencana UI 2a-G disetujui dengan dua koreksi** (UI-01: tanpa sesi → redirect login, sesi tidak berhak/flag mati/produksi → 404, dibuktikan `check-wa2a-g-ui.mjs`; UI-04: status terminal tanpa aksi pengubah, "Buat revisi" tetap mengikuti `aksiTersedia`). Merge PR #32 sesudah koreksi; implementasi UI T3–T4 opsi B (14 path), komponen `src/components/automation/`, manifest `fase.G` + `faseAktif.GUI`. Bukan izin merge PR UI, deploy, atau pengiriman nyata. | 2026-10-16 |
| OD-19 | **Merge PR #31 disetujui** untuk HEAD `ec7fc9a72d535c20d1e5a527459c0cda29af0574`, termasuk verifikasi, pemeriksaan pasca-merge, pembaruan checkpoint, dan penyusunan scope UI. Implementasi UI, perubahan kontrak `contactId`, dan perubahan manifest **belum** diizinkan. | 2026-10-16 |
| OD-18 | **2a-G tahap API (T1–T2) disetujui untuk implementasi:** koreksi checkpoint + merge PR #30; 19 path persis; X-1 (`i1.diizinkan` = 10 route, `faseAktif.G`); adaptasi uji helper gate dengan tuple. Merge PR API memerlukan persetujuan terpisah. Bukan izin UI, Send, provider, webhook, LLM, dependency, deploy, flag di lingkungan nyata, atau DB nyata. | 2026-10-16 |
| OD-17 | **Gate lingkup WA-2a:** G-D1..G-D4 disetujui (tiga lapis I/H/P, 2C/2E ikut, I-2 diperluas ke berkas pendukung F3/F4, pengecualian hanya tuple basis+path+blob); implementasi 12 path, tiga koreksi review, dan merge PR #29 pada HEAD `2d37111` disetujui. Bukan izin 2a-G, deploy, atau pengiriman. | 2026-10-16 |

## B. DEVELOPMENT / GITHUB REALITY — pembaruan terbatas VERIFIED 2026-10-16

| Item | Nilai |
|---|---|
| Repository | `marlon870saragih-cloud/maritim-suite` (public) |
| `origin/main` saat penulisan | `1b20baa1ac83e3ab2689bff4a77f290fc2aadd91` — merge PR #38 (login: percobaan dapat dibatalkan, tanpa race CSRF), parent `c2ad40b` + `b54cc09`; tree merge = tree HEAD PR (`8a1e18d6cc8c93f9699180bdb8be6d3276829fd3`); VERIFIED 2026-10-18 melalui GitHub dan git. |
| Merge PR #37 (historis) | `c2ad40bdcb45e5de2e5f97f9c17f4ba2a8992bd4` — merge PR #37 (login: cegah kredensial di URL dan sukses login palsu, F-1/F-3), parent `a50c9bf` + `0b57481`; 2 path (`src/app/(auth)/login/page.tsx`, `prisma/check-login-ui.mjs`); basis PR #38. Bukti pra-merge PR #37 tercatat di deskripsi PR #37, tidak diringkas ulang di sini. |
| Merge PR #36 (historis) | `a50c9bf968d0569f7393b63e1da0330f8f0ca578` — merge PR #36 (portabilitas Windows), parent `e4a351e` + `073f897`; tree merge = tree HEAD PR (`312b07e`); basis PR #37. |
| Merge PR #35 (historis) | `e4a351eb6c908b12aad757ccff6bf9c92072903b` — merge PR #35 (penutupan fase GUI), parent `c787078` + `31d1563`; basis PR #36. |
| Merge PR #34 (historis) | `c787078233f9f4da721ededfe9b67800aeaa12ca` — merge PR #34 (dokumentasi pasca-merge PR #33), parent `93fb95e` + `7d12a37`; basis PR #35. |
| Merge PR #33 (historis) | `93fb95e30835817c3e7b9ee5d0294795282e821f` — merge PR #33 (UI 2a-G T3–T4), parent `c1003d5` + `5b775e4`; tree merge = tree HEAD PR (`3f02297`). |
| Basis historis PR UI (#33) | `c1003d5fe01bac21acce30a8dffebc5061cbe468` — merge PR #32 (dokumen rencana UI), parent `fa0ad59` + `bfa93fa`. Bukan `main` terkini. |
| Branch `feat/wa2a-g-ui` (PR #33, MERGED `93fb95e`) | Dari `c1003d5`. Commit kode `5fda8d4` (awal) lalu `9a9fa2e` (revisi 1, hanya test UI) = **HEAD kode yang diuji**; commit sesudahnya hanya dokumentasi. Uji di clone sekali pakai (ref di clone saja), PostgreSQL 16 loopback sekali pakai, `next dev`/`next build`/`next start` loopback dengan perangkap egress, Playwright dari luar repo. Tree bersih sebelum/sesudah |
| Baseline historis PR #31 | `fa0ad5992bba45967271cf943f12e146a95ed142` — merge PR #31 (API 2a-G). |
| Demo owner Windows/Edge (2026-10-18; uji coba; OD-30) | Laptop owner: Windows, PowerShell 7.6.7, Node 24.16.0, npm 11.13.0, Git 2.55.0, PostgreSQL 16.14 (binary), Edge; baseline `1b20baa`; panduan v4 (SHA-256 identik). Blok 0–6 OK; login semua peran bersesi; D1–D15 sesuai; D16 dijalankan, kriteria tidak terpenuhi (`TRAP-AKTIF=185 BLOCKED=20 URL-dengan-password=0`; semua BLOCKED = `tls fonts.googleapis.com:443`, F-6), pengecualian diterima owner (OD-30). Pembersihan 10a–10f OK (PID + waktu mulai cocok, `pg_ctl` exit 3, folder demo dihapus, folder catatan `wa2g-demo-catatan\20261018-142054` tetap). Bukti: tangkapan layar owner dan log tersamar di laptop owner (tidak di repo). Tidak dijalankan (tetap terbatas): PowerShell 5.1, kedaluwarsa, lintas tenant, penolakan server self-approval, status login tidak pasti/timeout, dan suite uji otomatis repo di Windows/Edge; satu demo ini bukan bukti seluruh suite lulus di Windows |
| Pasca-merge PR #38 (VERIFIED 2026-10-18) | **Pemeriksaan baru pasca-merge** (statis/gate saja). Checkout `main` terpisah, Linux 6.18 x86_64, Node v22.22.0; HEAD = `origin/main` (fetch GitHub) = `1b20baa`; parent 1 `c2ad40b`, parent 2 `b54cc09` (expected HEAD); tree merge = tree HEAD PR `8a1e18d`; delta `c2ad40b → 1b20baa` = tepat 2 path dengan blob `e5422d1` (page.tsx) dan `23ad253` (check-login-ui); tree bersih sebelum dan sesudah; tanpa `WA2A_FASE`. helper 73/0, g-static 153/0 (`WA2A_BUKTI=1`), comm-policy 326/0, tah-policy 322/0 (semua exit 0). Merge commit dengan expected HEAD; tanpa squash/rebase/force-push/auto-merge; branch tidak dihapus. GitHub: 0 check-run, 0 status (bukan CI hijau). Tidak dijalankan ulang pasca-merge: UI/DB/HTTP/build/mutasi (tree identik dengan HEAD yang diuji; bukti pra-merge di deskripsi PR #38). Arsip bukti `bukti-pr38-merge.zip` SHA-256 `02535326b90229698937e770a5b0ed3e775bc8cf654f9467aebbd70eb652d91f` (di luar repo) |
| PR #38 (MERGED `1b20baa`; catatan pra-merge, dilaporkan di PR) | Basis `c2ad40b`, HEAD `b54cc09`. `check-login-ui` 61/0 pada `next dev` ×3 (Strict Mode) dan `next start` ×2; login sah pertama sesudah server dingin berhasil di kelima run; regresi `check-wa2a-g-ui` dev 45/0 dan produksi 10/0, `check-comm-ui` dev 55/0; eslint/tsc 0/0. Linux, Chromium 141 headless. **Windows/Edge belum diuji.** Bergantung pada protokol internal next-auth 4.24.14 |
| Verifikasi kit demo v4 (2026-10-18; bukan penerimaan) | Linux 6.18, Node v22.22.0, PostgreSQL 16.15, Chromium Playwright; checkout baru dari GitHub @ `1b20baa`; klaster sekali pakai 127.0.0.1:55433, 24 migrasi, seed sintetis, `next dev` loopback dengan perangkap egress. Uji asap 17/0: 5/5 login satu klik (tombol aktif → pesan sukses → muat penuh `/dokumen` → sesi akun sama), termasuk login pertama sesudah server dingin; D1–D9 + D15; 0 query `password` di peramban; Blok 7 padanan TRAP-AKTIF 49 / BLOCKED 0 / URL-dengan-password 0. Pembersihan berbasis identitas lulus; pindai rahasia 0. Teks blok PowerShell 48/0, penyamar (regex Python) 10/0 — bukan parser/uji .NET. Satu run. Tidak dijalankan: D10–D14, Windows/Edge. **Koreksi 2026-10-18:** BLOCKED 0 di sini tidak membuktikan tanpa egress — container memakai proxy HTTPS loopback dan `next/font/google` mengunduh Google Fonts lewat proxy itu tanpa tercatat (F-6) |
| Pasca-merge PR #36 (VERIFIED 2026-10-17) | **Pemeriksaan baru pasca-merge** (statis/gate saja). Clone `main` sekali pakai, Linux 6.18 x86_64, Node v22.22.0; HEAD = `origin/main` = `a50c9bf968d0569f7393b63e1da0330f8f0ca578`; tree bersih sebelum dan sesudah; tanpa `WA2A_FASE`. comm-policy 326/0 (tepat 2 pembuat); 2B statis 32/0 (exit 3 = bagian DB dilewati, bukan DB lulus); helper 73/0 dan g-static 153/0 (`WA2A_BUKTI=1`; H GUI lulus, `faseAktif` kosong, P-global 0 berkas berubah). 13 tuple; dua tuple PR #36 tidak diubah. Tidak dijalankan ulang pasca-merge: F1–F4/2C/2E, tah-policy (bukti pra-merge pada `073f897`), UI/DB/HTTP/build; tidak ada pengujian Windows baru |
| PR #36 portabilitas Windows (MERGED `a50c9bf`; catatan pra-merge) | Basis `e4a351e`. **HEAD kode yang diuji `a95e90f75038a9baeb606c6e0980ab72a2050551`** (3 berkas: comm-policy, wa2a-schema, manifest); commit sesudahnya hanya berkas ini. **Linux** (uji baru Claude; clone sekali pakai, Linux 6.18 x86_64, Node v22.22.0; `main` = `origin/main` = `e4a351e`; tree bersih): comm-policy 326/0 (tepat 2 pembuat), 2B statis 32/0 (exit 3 = bagian DB dilewati), helper 73/0 dan g-static 153/0 (mode bawaan `WA2A_BUKTI=1`; P-global: 2 beku berpengecualian), F1 100/0, F2 61/0, F3 66/0, F4 70/0, 2C 37/0, 2E 36/0, tah-policy 322/0. **Windows** — bukti Windows nyata dari reviewer (Node v24.16.0, `process.platform=win32`, tanpa shim) pada baseline `e4a351e` + patch 4 path **belum di-commit** dengan blob yang sama (comm-policy `56f8362`, wa2a-schema `766123f`): baseline comm-policy 325/1 → patch 326/0; 2B statis 32/0 (exit 3); g-static mode bawaan tanpa `WA2A_BUKTI` 152/0; pembuat ketiga di subdirektori dalam → comm-policy 325/1; baris di luar `BARIS_2B` → 2B 31/1 dan g-static 151/1. Tidak dijalankan di Windows: helper penuh, F1–F4/2C/2E, tah-policy, audit scope, DB/UI/HTTP/build; bukti tersebut bukan pengujian HEAD PR final. Scope dibuktikan dengan daftar diff persis (audit committed/staged/unstaged/untracked = 4 path, blob kedua berkas beku) + gate + review; tanpa fase aktif baru. Tidak dijalankan: UI, DB, HTTP, build (kode aplikasi tidak berubah). **Pasca-merge (nanti):** mode bawaan `WA2A_BUKTI=1` di `main` bersih; bukti scope `git diff --name-only e4a351e <merge>^2` = 4 path; tuple tidak diganti sesudah merge. |
| Pasca-merge PR #35 (VERIFIED 2026-10-17) | **Pemeriksaan baru pasca-merge** (statis/gate saja). Clone `main` sekali pakai, Linux 6.18 x86_64, Node v22.22.0; HEAD = `origin/main` = `e4a351eb6c908b12aad757ccff6bf9c92072903b`; tree bersih sebelum dan sesudah. Mode bawaan `WA2A_BUKTI=1`: helper 73/0 (7 fase / 82 berkas, H GUI lulus, `WA2A_FASE=GUI` ditolak), g-static 153/0 (H GUI lulus, `faseAktif` kosong, P-global 0 berkas berubah). Delta `c787078 → merge^2` = tepat 4 path. Tuple tidak diubah. Tidak dijalankan ulang pasca-merge: F1–F4/2C/2E, 2B, comm/tah-policy (bukti pra-merge pada `31d1563`), UI/DB/HTTP/build, Windows |
| PR #35 penutupan fase GUI (MERGED `e4a351e`; catatan pra-merge) | Basis `c787078`. **HEAD kode yang diuji `41820f4eb26e1543f99ea8d8c258188c45205654`** (3 berkas: manifest, uji helper, g-static); commit sesudahnya hanya berkas ini. Uji baru di clone sekali pakai (Linux 6.18 x86_64, Node v22.22.0; `main` = `origin/main` = `c787078`; tree bersih sebelum dan sesudah), mode bawaan `WA2A_BUKTI=1`: helper 73/0 (H GUI lulus), g-static 153/0 (H GUI lulus, `faseAktif` kosong, P-global: 1 beku berpengecualian), F1 100/0, F2 61/0, F3 66/0, F4 70/0, 2C 37/0, 2E 36/0; 2B statis 32/0 (exit 3 = bagian DB dilewati); comm-policy 326/0, tah-policy 322/0; `WA2A_FASE=GUI` → gagal "fase sudah tercatat merged". Kontrol negatif di clone eksperimen terpisah dan audit scope eksternal: lihat deskripsi PR. **Batas:** mode bawaan tidak membatasi seluruh berkas non-beku; scope PR ini dibuktikan dengan daftar diff persis (committed/staged/unstaged/untracked = 4 path) dan review. Tidak dijalankan: UI, DB, HTTP, build (kode aplikasi tidak berubah), Windows. **Prosedur pasca-merge (nanti):** mode bawaan `WA2A_BUKTI=1` di clone `main` bersih (helper + g-static, rekaman H GUI); bukti scope = `git diff --name-only c787078 <merge>^2` tepat 4 path; **jangan** memakai `WA2A_FASE=GUI`; **jangan** mengganti tuple hanya karena merge-base mode bawaan berubah sesudah merge (di `main` diff kosong, tuple tidak dipakai). |
| Pasca-merge PR #33 (VERIFIED 2026-10-17) | **Pemeriksaan baru pasca-merge** (statis/gate saja). Clone `main` sekali pakai, Linux 6.18 x86_64, Node v22.22.0; HEAD = `origin/main` = `93fb95e30835817c3e7b9ee5d0294795282e821f` diverifikasi; tree bersih sebelum dan sesudah. Mode bawaan + `WA2A_BUKTI=1` (basis = merge-base = HEAD, fase tidak diklaim): g-static 151/0, helper 69/0, F1 100/0, F2 61/0, F3 66/0, F4 70/0, 2C 37/0, 2E 36/0. Bukti scope merge `WA2A_BASIS=c1003d5 WA2A_FASE=GUI WA2A_BUKTI=1`: g-static 153/0 (P-fase GUI 14 berkas, jangkar ada, P-global 1 beku berpengecualian), helper 69/0. 2B statis 32/0 (DB dilewati, exit 3); comm-policy 326/0 dan tah-policy 322/0 di Linux; tsc bersih; lint exit 0 tanpa error, 1 warning existing `ReceiptForm.tsx:118`. Tidak dijalankan ulang pasca-merge: 2B DB, F3/F4/2C/2E DB, g-api, g-prod, g-ui (dev/flag mati/produksi), `next build`. Kode identik dengan HEAD uji `9a9fa2e` (commit sesudahnya hanya dokumen), jadi bukti lama tetap tercatat pada HEAD asalnya di [bukti UI §6](whatsapp/WA-2a-G-UI-EVIDENCE.md). Windows tidak diuji |
| Pasca-merge PR #31 (VERIFIED 2026-10-16) | Clone `main` sekali pakai, HEAD = `origin/main` = `fa0ad59` diverifikasi; tree bersih sebelum dan sesudah. Mode bawaan + `WA2A_BUKTI=1` (basis = merge-base = HEAD, diff kosong, fase tidak diklaim): g-static 129/0, helper 66/0, F1 100/0, F2 61/0, F3 66/0, F4 70/0, 2C 37/0, 2E 36/0. Bukti scope merge `WA2A_BASIS=6a064ea WA2A_FASE=G WA2A_BUKTI=1`: g-static 131/0 (P-fase G 19 berkas, jangkar ada, P-global 1 beku berpengecualian). tsc & lint bersih; semua exit 0. Mode `WA2A_FASE=G` tanpa basis sengaja tidak dipakai: di `main` diff kosong sehingga jangkar pasti tidak ada (asumsi gate, bukan cacat). Tidak dijalankan ulang: uji DB, HTTP API/prod, build — kode identik dengan HEAD uji `ba617ba` (commit sesudahnya hanya dokumen); bukti API tetap tercatat pada HEAD asalnya ([bukti 2a-G](whatsapp/WA-2a-G-EVIDENCE.md)) |
| Baseline historis PR #30 | `6a064ea585321440d0cf71812465419495f230a8` — merge PR #30, basis branch API. |
| Baseline historis gate (bukan HEAD terkini) | `a1f69506e5ad04bc522c2dd8ac5232ded7fa4d42` — merge PR #29 (gate I/H/P), parent `f304918` + `2d37111`. |
| Baseline historis F4 (bukan HEAD terkini) | `5e58237c393a6115d3c55a5c1382dd3c5826a976` — merge commit PR #27, parent `0ad9251` + `d665216`; VERIFIED 2026-10-16. Basis fitur sesudah F4, dipertahankan sebagai sejarah. |
| PR #23–#27 | MERGED — #23 F1 `e5f8676`, #24 F2 `cd276bb`, #25 F3 `2cec0ce`, #26 perbaikan uji 2B `0ad9251` (11 Oktober); #27 F4 `5e58237` (16 Oktober). Keadaan GitHub diverifikasi dalam rangka review/merge F4. |
| PR #30 | MERGED 2026-10-16 — checkpoint pasca-merge gate + label baseline historis F4 (`6a064ea`, merge commit dengan expected HEAD `1f0705f`); docs-only. VERIFIED 2026-10-16 |
| Branch `feat/wa2a-g-api` (PR #31, MERGED `fa0ad59`) | API 2a-G (T1–T2), dari `6a064ea`. Commit kode `55c793e` → `e29761b` (adaptasi 3 skenario helper) → `4d6f995` (hapus `contactId` dari detail) = HEAD uji putaran awal; revisi 1: `c3696d0` (uji kandidat sinyal, gagal pada kode lama) → `ba617ba` (perbaikan) = **HEAD kode yang diuji terbaru**; commit sesudahnya hanya dokumentasi (`ec7fc9a`). Uji di clone sekali pakai, ref di clone saja; PostgreSQL 16 loopback sekali pakai + `migrate deploy` migrasi yang ada; `next dev`/`next start` loopback dengan perangkap egress. Bukti API: HEAD `ba617ba` (static 131/0, API dev 104/0, flag-mati 22/0, helper 66/0) dan putaran awal `4d6f995` (regresi penuh, build, prod lokal 20/0) |
| PR #28–#29 | MERGED 2026-10-16 — #28 checkpoint + rancangan DRAFT (`f3049187334d4665eb276b125f6a1e9918da41bb`); #29 gate lingkup I/H/P (`a1f69506e5ad04bc522c2dd8ac5232ded7fa4d42`, parent `f304918` + `2d37111`). VERIFIED 2026-10-16 melalui GitHub dan git |
| PR #22 | MERGED 2026-10-11 11.39 WITA — checkpoint WA-2a Step 2B/2C/2E merged, merge `b805f839014069e83d5aed43ffa94e749bd02a31` (parent `4086756` + `e60d6e2`), satu berkas dokumentasi. VERIFIED 2026-10-16 melalui GitHub dan git |
| Sesi dokumentasi 2026-10-16 | Putaran 1: melalui GitHub API pada branch `docs/wa2a-f4-checkpoint-20261016` (commit `383b93e`), tanpa checkout lokal. Putaran 2 (revisi, malam): checkout lokal branch yang sama dari `383b93ecbb6fb1e9445c014c7d7f2a31b4205aff`, working tree bersih sebelum mulai, hanya dua dokumen ini yang diubah, push tanpa force; HEAD akhir tercatat pada PR #28. Kedua putaran tidak menjalankan suite aplikasi, script DB, atau build, dan tidak mengakses produksi. |
| Sesi PR gate 2026-10-16 malam | Checkout lokal, branch `fix/wa2a-gate-lingkup-ihp` dari `f304918` (branch lokal lama `claude/intelligent-turing-vubpcx` tidak ditimpa). Working tree bersih saat commit. HEAD kode yang diuji `4da70eb`; commit sesudahnya hanya tiga dokumen. Uji gate di clone sementara; ref repo kerja tidak dipindahkan. Tanpa DB, deploy, flag, provider. Putaran 2 (revisi review): dari HEAD PR `7d7270c` (working tree bersih), HEAD kode uji `22c84f9`, commit sesudahnya hanya tiga dokumen; push biasa ke branch yang sama. |
| PR #18–#21 | MERGED (merge commit biasa) — VERIFIED 2026-10-11 via GitHub: #18 checkpoint WA-1 accepted (2026-10-10); #19 WA-2a Step 2B schema & fondasi DB (`5eec4f4`, 2026-10-10); #20 WA-2a Step 2C service kontak & consent (`39cdcec`, 2026-10-10); #21 WA-2a Step 2E akses principal & resolver otorisasi (`4086756`, 2026-10-11) |
| PR #16–#17 | MERGED 2026-10-10 (merge commit biasa): #16 checkpoint Step 2F–2I (`543be91`); #17 Step 2J E2E Validation & Demo — pengujian, perangkap egress, seed demo, bukti & 12 tangkapan layar (`be91229`). Tanpa perubahan `src/`, schema, migrasi, PRD, V3 — VERIFIED 2026-10-10 |
| PR #11–#15 | MERGED (merge commit biasa): #11 checkpoint Step 2E (`5e70451`, 2026-10-09); #12 Step 2F Cancel (`30a686c`, 2026-10-09); #13 Step 2G Read service & Communication History (`f3a372a`, 2026-10-09); #14 Step 2H API `/api/automation/communications` + pengerasan CSRF `48b9be1` (`f97c94e`, 2026-10-10); #15 Step 2I UI Komunikasi (Simulasi) `0553db7` + pemisahan guard sidik jari Intake `a4045a0` (`d4a3e71`, 2026-10-10). Tanpa schema/migrasi baru sejak 2B/Q8 — VERIFIED 2026-10-10 |
| PR #5–#9 | MERGED 2026-10-05: #5 checkpoint (`ebe86eb`), #6 Step 2A (`5a0673f`), #7 Step 2B (`334052f`), #8 Step 2C (`a1692e0`), #9 Step 2D R1 (`03a1dc9`) — VERIFIED 2026-10-09 (merge commit ada di `main`) |
| PR #10 | MERGED 2026-10-09 (`8ebd546`, merge commit biasa): WA-1 Step 2E — `efb4e78` implementasi + `60d9dca` perbaikan review (balapan Send vs Prepare → `kunciCandidate`; batas ≤ 5 attempt lewat `bolehUlangiEksekusi` beku). 9 berkas; tanpa schema/migrasi; berkas beku V3 utuh — VERIFIED 2026-10-09 |
| PR #3 | MERGED 2026-10-05 (`dd1b330`) — canonical checkpoint ini |
| PR #4 | MERGED 2026-10-05 (`1e81bd8`; parent `dd1b330` + `c041350`) — `docs/whatsapp/PRD-WA-1.md` baseline v0.2; documentation only |
| PR #2 | CLOSED tanpa merge (branch `docs/tah-gap-analysis-20260930` dipertahankan sebagai referensi historis) |
| PR #1 | MERGED (merge commit; parent `958c15a` + `7127d99`); PRD-002..005 ada di `main` |
| `feat/prd002-step2-domain-foundation` | `7127d991f8487bfc9f096d22182f4c1c578a9e87`, sepenuhnya termasuk di `main`; belum dihapus |
| `docs/tah-gap-analysis-20260930` | `139006d` — hanya dokumen, belum di-merge. File ini menggantikan versi checkpoint di branch tersebut; gap analysis-nya tetap rujukan perencanaan |
| CI | Pada HEAD F4 `d665216`: 0 check-run, 0 workflow run, 0 commit status; status gabungan `pending` dengan daftar kosong. VERIFIED 2026-10-16. Tidak ada bukti CI independen untuk F4. Temuan webhook/deploy key/aplikasi terpasang pada checkpoint lama bersifat HISTORICAL dan tidak diperiksa ulang dalam sesi ini. |
| Test WA-1 historis Step 2J | 2026-10-10 (Step 2J) pada `807ec82` (= tree `be91229` minus berkas checkpoint), PostgreSQL 16 loopback sekali pakai + server lokal dengan perangkap egress `prisma/wa1-egress-trap.mjs`: **comm-e2e 108/108** (12 alur pilot × ID/EN, body byte-per-byte vs PRD §11), **comm-e2e mode produksi 5/5** (`next start` lokal → `ENV_NOT_ALLOWED`, 0 baris), comm-ui Playwright 55/55, comm-api 43/43, comm-policy 326, comm-schema 85, comm-prepare-db 98, comm-approval-db 95, comm-send-db 118–121 (cek 52b dinamis; selalu 0 gagal), comm-cancel-db 73, comm-read-db 42, tah-policy 322, tah-ledger 98, validator-v3 226, eval8-runner 62, eval4-prep 109, ais-contract 129, automation-policy 124, intake-policy 417; tsc & eslint bersih; next lint hanya warning lama `ReceiptForm.tsx`. Matriks TS-01..18 & AC-01..18 PASS (`docs/whatsapp/WA-1-STEP2J-EVIDENCE.md`). Uji mutasi E2E (template, panggilan Graph API) tertangkap. **Kegagalan historis:** `check-validator-remediasi` 61 lulus, 9 gagal dari 70 (dahulu ditulis 61/70) — identik di baseline (skrip pra-V3), bukan regresi; tidak diubah (isu terpisah, keputusan owner tertunda) |
| Test fondasi WA-2a 2B/2C/2E historis | Dilaporkan pada checkpoint 2026-10-11 (PR #22), pada HEAD PR #21 `87b0476` (tree = `main` `4086756`), PostgreSQL 16 loopback sekali pakai, data sintetis, sebelum merge: wa2a-access 27/0, wa2a-access-db 68/0 (3 run), wa2a-contact 28/0, wa2a-contact-db 67/0, wa2a-schema 128/0, validator-v3 226/0, intake-policy 417/0, tah-policy 322/0, tah-ledger 98/0, comm-policy 326/0, comm-schema 85/0, comm-prepare-db 98/0, comm-approval-db 95/0, comm-send-db 121/0, comm-cancel-db 73/0, comm-read-db 42/0, eval3-ledger-db 14/0, tenant-guard 2/0; `tsc --noEmit` 0 galat; `npm run lint` lulus (hanya warning lama). Pada `main` lama `39cdcec`, wa2a-schema 126/127 (asersi lingkup 2B usang, dikoreksi di PR #21). Tidak dijalankan saat itu: uji API/E2E/UI dan `next build`. HISTORICAL — dipulihkan dari checkpoint sebelum PR #28; tidak diulang. |
| Bukti uji terakhir WA-2a / regresi WA-1 | **Dilaporkan Claude Code 2026-10-16** pada kode P2 yang di-commit sebagai `d665216` (Node 22.22.0, PostgreSQL 16.15 loopback sekali pakai, data sintetis): F4 statis **61/0** (di branch F4 sebelum merge; keadaan sesudah merge lihat baris gate lingkup di bawah), F4 DB **121/0 (2 jalan)**; F3 54/0 & 72/0; F1 90/0; F2 51/0; 2B 130/0; 2C 29/0 & 67/0; 2E 28/0 & 68/0; WA-1 policy/schema 326/0 & 85/0; prepare/read/approval/cancel/send 98/0, 42/0, 95/0, 73/0, 120/0; TAH 322/0 & 98/0; V3 226/0; tsc/eslint bersih; migrate diff tanpa perbedaan. M21/M22 tertangkap. Codex memverifikasi kode, diff dan isi laporan, **tidak menjalankan ulang pengujian atau meninjau log mentah lengkap**. Sumber: [WA-2a-F4-EVIDENCE.md §7](whatsapp/WA-2a-F4-EVIDENCE.md#7-temuan-review-p2--ttl-pada-tolakpesanklien-sesudah-kunci-approval-16-okt-2026). |
| Bukti F4 historis, tidak diulang pada P2 | VoyageEvent HTTP cabang 27/0 vs main 25/0, transkrip dilaporkan identik; automation-api 104/0; owner-guard 26/0; HTTP WA-1 API/E2E/UI 43/0, 108/0, 55/0. M1–M20 tidak diulang; total gabungan dengan M21/M22 = 21/22 tertangkap, M16 dicatat ekuivalen. Baseline validator-remediasi tetap 61 lulus, 9 gagal dari 70 (dahulu ditulis 61/9 atau 61/70 — hasil yang sama), dilaporkan identik main. Lihat bukti F4 §6–§7; bukan hasil run baru oleh sesi checkpoint. |
| Gate lingkup F1–F4 (temuan 2026-10-16) | **Dilaporkan Claude Code 2026-10-16** (run read-only di worktree sekali pakai, ref lokal `main` = `5e58237`), bukan uji baru pada putaran revisi: (a) pada **`main` bersih** `5e58237`: `check-wa2a-approval-f4` 60 lulus, 1 gagal — asersi L182 `semua.includes(SVC)` gagal karena diff terhadap `main` kosong; (b) pada **branch PR #28** `383b93e`: F1 89/1, F2 50/1, F3 53/1, F4 59/2 — allowlist F1–F4 menolak dua path dokumentasi (F4 juga gagal L182); 2C 29/0 dan 2E 28/0 lulus pada run yang sama. Setelah PR #28 merged dan checkout `main` bersih, penolakan path dokumentasi tidak berlaku lagi; cacat L182 tetap ada (perkiraan dari kode, belum dijalankan ulang). Cacat desain gate, bukan regresi kode aplikasi. Status sesudahnya: lihat baris berikut. |
| Verifikasi gate pasca-merge PR #29 | **Hasil aktual Claude Code 2026-10-16 malam** di clone bersih pada `main` = `a1f69506e5ad04bc522c2dd8ac5232ded7fa4d42` (`main` = `origin/main` = HEAD, basis = HEAD, diff kosong, `WA2A_BUKTI=1`): helper 65/0, F1 100/0, F2 61/0, F3 66/0, **F4 70/0**, 2C 37/0, 2E 36/0, comm-policy 326/0, tah-policy 322/0 (semua exit 0); **2B hanya statis 32/0, bagian DB dilewati, exit 3**. Manifest: fase G tidak aktif; 15 blob I-2 cocok; tuple bootstrap berbasis `f304918` tidak lagi mengizinkan perubahan (diverifikasi). Uji DB, UI, tsc/lint/build tidak dijalankan (tanpa perubahan `src/`). |
| Perbaikan gate lingkup I/H/P — pra-merge (HISTORICAL) | **Dilaporkan Claude Code 2026-10-16, putaran 2 (revisi review), sebelum merge** pada HEAD uji `22c84f904e8bbfe5881a2a9dfa7d009c86e4424c` (clone bersih, `WA2A_BUKTI=1`, basis `f304918`): F1 100/0, F2 61/0, F3 66/0, F4 70/0, 2C 37/0, 2E 36/0, helper 65/0 (16 repo nyata/murni, 14 positif, 35 negatif), 2B statis 32/0 (DB dilewati, exit 3), comm-policy 326/0, tah-policy 322/0. Tiga temuan review diperbaiki: path literal `[id]`, impor transitif bersiklus, helper dilindungi P-global; uji baru gagal 57/8 terhadap helper lama. **Historis putaran 1** pada `4da70eb`: angka F1–F4/2C/2E sama, helper 50/0. Baseline `f304918`: F4 60/1 (L182). Uji DB, UI, tsc/lint/build tidak dijalankan (tanpa perubahan `src/`). Rincian: [WA-2a-GATE-SCOPE-EVIDENCE.md](whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md); rancangan: [WA-2a-NEXT-PHASE-DRAFT.md §5](whatsapp/WA-2a-NEXT-PHASE-DRAFT.md#5-perbaikan-gate-lingkup-f1f4-e-g1--merged-pr-29). |
| Test penuh terakhir (seluruh repo) | 2026-09-30 pada `f7635a2` (kode identik dengan `main`): tsc/lint/build hijau; 21/21 migrasi dari nol (PostgreSQL 16); suite offline & DB hijau. Merah yang diharapkan: `check-eval8-runner` E1c, `check-validator-remediasi` 61 lulus, 9 gagal dari 70 |
| Checkout lain milik owner | Checkout laptop lama (HEAD `28b0ef9`, enam file untracked termasuk `_wipe.mjs`) — HISTORICAL 2026-09-30. Jangan dijadikan basis kerja; jangan jalankan script untracked tanpa dibaca |

## C. PRODUCTION / GCP REALITY — OWNER-VERIFIED 2026-10-05

### GCP
| Item | Nilai |
|---|---|
| VM | `tribuana-vm`, zone `asia-southeast2-a`, **RUNNING**, `e2-medium` |
| Disk | 30 GB |
| Billing | `billingEnabled=true`. Status trial vs paid: **UNVERIFIED** (`billingEnabled` hanya membuktikan akun billing tertaut) |

### Maritim Suite
| Item | Nilai |
|---|---|
| Proses | PM2 `maritime-suite` **online**; Node 22.23.2; port 3001 aktif |
| Path aplikasi | `/home/LENOVO/maritime-suite` |
| Reverse proxy | nginx **active**; `https://maritim.tribuanagency.com/login` → **HTTP 200** |
| Jenis deploy | Build hasil deploy (arsip), **bukan git checkout** |

### Kode produksi
| Item | Nilai |
|---|---|
| Build | 27 Sep 2026 |
| Fingerprint | **Cocok dengan rilis historis `ac922f6`** pada file pembeda (`intake-policy.ts`, `model-capabilities.ts`, `package.json`); `maritim-lexicon-v2.ts` & `-v3.ts` **tidak ada** → **Validator V3 tidak ada di produksi** |
| Terhadap GitHub | Produksi **tidak identik** dengan `main`: 16 commit di belakang `main` (selisih berisi 0 migrasi — VERIFIED via git). **Jangan menyimpulkan GitHub `main` == produksi.** |

### Konfigurasi produksi (nilai rahasia hanya PRESENT/ABSENT)
| Kunci | Nilai |
|---|---|
| `AUTOMATION_MONITORING_ENABLED` | `true` |
| `AUTOMATION_TENANT_IDS` | PRESENT (1 tenant) |
| `OPENROUTER_SPK_MODEL` | `anthropic/claude-sonnet-4.5` |
| `TAH_INTAKE_MODEL` | ABSENT |
| `TAH_CORE_ENABLED` | ABSENT |
| `VESSEL_CALL_INTAKE_ENABLED` | ABSENT |
| `OPENROUTER_API_KEY` | PRESENT |
| `DATABASE_URL` | PRESENT |

**TAH Intake tidak terbukti aktif di produksi.** Jangan membuka kembali TAH hanya karena hal ini; pekerjaan pengembangan TAH/PRD-005 sudah CLOSED.

### Scheduler (systemd)
- `maritime-monitoring.timer` → `maritime-monitoring.service` → `/usr/local/sbin/maritime-job-run voyage-monitoring`; terobservasi berjalan kira-kira tiap jam.
- Service bertipe `Type=oneshot`: status `inactive (dead)` sesudah eksekusi sukses adalah **NORMAL**.
- Juga terpasang (HISTORICAL 2026-09-30): `maritime-reminders.timer` (enabled, tiap jam), `pg-backup.timer` (harian). `maritime-ais-poll.timer` tidak terpasang. Tidak ada mekanisme deploy otomatis di VM (tanpa cron/timer deploy/repo git).

### Belum diverifikasi pada 2026-10-05
- Log aplikasi produksi — **UNVERIFIED**.
- Layanan lain di VM yang sama — **UNVERIFIED** (HISTORICAL 2026-09-30: `galangan-app`, `nouvo-api`, `ankor-app` di PM2, MariaDB, uvicorn, next-server lain). Tindakan pada VM berpotensi memengaruhi layanan tersebut.
- Eksposur jaringan (app mendengarkan di semua antarmuka; aturan firewall GCP & upstream nginx) — **UNVERIFIED**.

## D. VOYAGE MONITORING — PRODUCTION E2E VERIFIED (OWNER-VERIFIED 2026-10-05)

**Data uji:** voyage `VYG-2026-000003`, kapal MT DS Grace, pelabuhan Balikpapan, agency type full, tujuan: uji otomasi produksi.

**Hasil:**
1. Voyage uji berhasil dibuat.
2. Voyage langsung muncul di Automation Hub.
3. Monitoring berhasil diaktifkan; Monitored Voyages berubah 0 → 1.
4. Pemanggilan manual `sudo systemctl start maritime-monitoring.service` selesai SUCCESS; `voyage-monitoring` mengembalikan HTTP 200 / gagal 0.
5. Baseline awal: status voyage PLANNED, Health = Healthy, last successful check tercatat.
6. Status voyage dinaikkan manual PLANNED → CONFIRMED.
7. Run monitoring berikutnya mendeteksi perubahan dan membuat satu sinyal **INFO — Status changed**:
   "Status voyage VYG-2026-000003 berubah dari PLANNED menjadi CONFIRMED." Sumber sinyal: `AUDIT_LOG`.
8. Sinyal muncul di Automation Hub → Alerts.
9. Alur Human Review terverifikasi: admin meng-acknowledge sinyal dengan catatan
   "Test automation - status change verified by admin".
10. Sinyal tersimpan pada State=All sebagai **Acknowledged**; reviewer dan timestamp review tersimpan.

**VERDICT: VOYAGE MONITORING PRODUCTION E2E = VERIFIED.**

Alur yang terverifikasi:

Voyage operational change → Audit Log → scheduled Voyage Monitoring → Signal / Alert → Human Review → Acknowledge → persistent Audit Trail

Jangan membangun ulang atau mengaudit ulang alur ini dari nol pada sesi berikutnya kecuali ada bukti regresi.

Catatan: voyage uji `VYG-2026-000003` beserta sinyalnya **masih ada di database produksi** (data uji, bukan data operasional). Pembersihan = keputusan owner terpisah.

## E. DATABASE REALITY

| Item | Nilai | Label |
|---|---|---|
| Engine | PostgreSQL 16 lokal di VM, DB `maritime_suite` | HISTORICAL 2026-09-30 |
| Migrasi | 21 diterapkan, 0 gagal (termasuk 7 migrasi PRD-002..005) | HISTORICAL 2026-09-30; 2026-10-05 **UNVERIFIED** |
| Tabel TAH/PRD | 11/11 ada | HISTORICAL 2026-09-30 |
| `AgentRun` / `AgentModelCall` / `TahApprovalRequest` | 0 / 0 / 0 | HISTORICAL 2026-09-30; 2026-10-05 **UNVERIFIED** |
| `MonitoredVoyage` | ≥ 1 (voyage uji) | OWNER-VERIFIED 2026-10-05 (via UI) |
| `MonitoringSignal` | ≥ 1 (sinyal uji, Acknowledged) | OWNER-VERIFIED 2026-10-05 (via UI) |
| `VesselCallIntake` | 1 (REJECTED, 2026-09-19, extractor v1) | HISTORICAL 2026-09-30 |
| Lampiran | 0 dipurge; 7 kandidat (soft-deleted > 30 hari); tidak ada penjadwal purge | HISTORICAL 2026-09-30 |

## F. COMPLETED

- PRD-002: identitas kapal/MMSI, voyage multi-kapal, waktu bisnis WITA, job pengingat, pelaporan backup, unit systemd, monitoring voyage internal.
- PRD-003: framework polling AIS (adapter NONE/FAKE).
- PRD-004: Vessel Call Intake (fitur mati di produksi), retensi lampiran.
- PRD-005 (**CLOSED**): ledger `AgentRun`/`AgentModelCall`, skema & kebijakan `TahApprovalRequest`, registri model gagal-tertutup, Validator V3 FINAL, harness Eval-1..8.
  Blind-B offline jawaban sempurna 64/80 (80% < target 90%); safety gates toleransi-nol PASS. Angka tersebut bukan akurasi model live.
- Penyelarasan GitHub: PR #1 merged; koreksi dokumen keadaan produksi (`7127d99`).
- Audit merge-safety 2c/2d/2e PASS (2026-09-30); Railway & Vercel di-uninstall dari GitHub.
- Gap analysis operasional (2026-09-30; gap kode diverifikasi ulang terhadap `main` pada 2026-10-05: masih ada).
- **Voyage Monitoring production E2E VERIFIED (2026-10-05)** — lihat §D.
- **WA-0 architecture / read-only audit: COMPLETE (2026-10-05).**
- **PRD WA-1 v0.2: OWNER APPROVED + FROZEN (2026-10-05)** — `docs/whatsapp/PRD-WA-1.md`, PR #4 merged.
- **WA-1 Step 2A–2D MERGED (2026-10-05)** — 2A kebijakan murni + 8 template + fixture TEST_FIXTURE (PR #6); 2B schema `CommunicationCandidate/Message/Attempt` (PR #7); 2C Prepare/candidate/preview (PR #8); 2D approval `WA_INTERNAL_FAKE_TEST` via definisi terpisah, `tah-policy.ts` beku utuh (keputusan R1, PR #9). Migrasi 2B & Q8 **belum pernah** dijalankan di produksi.
- **WA-1 Step 2E MERGED (2026-10-09)** — FAKE Send + retry manual (PR #10, `8ebd546`): satu transaksi REPEATABLE READ, revalidasi #2, approval basi → `NEEDS_REVIEW`, idempotensi requestKey terikat tenant+pesan+snapshot, batas ≤ 5 attempt (kebijakan beku), kunci candidate antara Send & revisi Prepare, audit atomik, zero egress. Tidak dideploy.
- **WA-1 Step 2F MERGED (2026-10-09)** — Cancel (PR #12, `30a686c`): ADMIN & MANAJER_OPERASI, alasan wajib, `CANCELED_BY_USER`, approval tertaut dihentikan, aman terhadap balapan Cancel vs Send (AC-18).
- **WA-1 Step 2G MERGED (2026-10-09)** — Read service & Communication History (PR #13, `f3a372a`): daftar/detail/riwayat dalam satu transaksi REPEATABLE READ, isolasi tenant, penyamaran pengenal (AC-17).
- **WA-1 Step 2H MERGED (2026-10-10)** — API `/api/automation/communications` (PR #14, `f97c94e`): 11 route; hasil bisnis HTTP 200 + `hasil`; gerbang sebelum baca body; pengerasan CSRF (`48b9be1`: Origin = origin `NEXTAUTH_URL`, Sec-Fetch-Site same-origin, wajib `application/json`).
- **WA-1 Step 2I MERGED (2026-10-10)** — UI Komunikasi (Simulasi) (PR #15, `d4a3e71`): daftar, ruang kerja revisi/preview/approval/FAKE Send/retry/Cancel/History; tombol "Siapkan Update Klien" hanya 4 event pilot; label "SIMULASI — TIDAK DIKIRIM KE WHATSAPP"; penerima fixture tersamar default; fakta preview dari snapshot tersimpan. Guard sidik jari Intake dipisah (opsi b owner): sidik historis V3 `ruteDanUiIntake` `930b347…` dipertahankan, guard aktif `ruteDanUiIntakeBeku` `a133f35…`. Tidak dideploy.
- **WA-1 Step 2J MERGED (2026-10-10)** — E2E Validation & Demo (PR #17, `be91229`): `check-comm-e2e` (HTTP nyata, 6 keluarga event × ID/EN byte-per-byte vs PRD §11, gate negatif, retry & batas 5, idempotensi paralel, Cancel ∥ Send, isolasi tenant, otorisasi), perangkap egress proses server, varian `NODE_ENV=production` lokal, seed demo sintetis, panduan demo, laporan bukti + 12 tangkapan layar. Tanpa perubahan kode aplikasi.
- **WA-1 OWNER ACCEPTANCE: APPROVED (10 Oktober 2026)** — OWNER-VERIFIED: owner menjalankan demo langsung di Google Chrome (laptop owner, DB lokal sintetis, perangkap egress) dan menyetujui alur menu → Siapkan Update Klien → preview ID/EN → approval → FAKE Send → riwayat audit. **WA-1 memenuhi gate PRD §18** (AC P0 lulus, bukti uji, demo diterima owner, checkpoint diperbarui oleh dokumen ini).

- **WA-2a Step 2B MERGED (2026-10-10)** — schema & fondasi DB lokal (PR #19): 7 tabel baru aditif (`WaContact`, `WaConsentState`, `WaConsentEvent`, `WaPrincipalAccessGrant`, `WaPrincipalAccessGrantVoyage`, `WaClientMessage`, `VoyageScheduleConfirmation`), 5 CHECK, 11 trigger hanya di tabel baru, rollback lokal. Keputusan owner DB-1, DB-2, DB-3, B-5 (LOCAL ONLY). Bukti: `docs/whatsapp/WA-2a-B-EVIDENCE.md`.
- **WA-2a Step 2C MERGED (2026-10-10)** — service kontak & consent (PR #20): registrasi/verifikasi/nonaktifkan kontak, E.164, opt-in/opt-out, gerbang `WA2_CLIENT_FOUNDATION_ENABLED` (default OFF; produksi selalu ditolak). Keputusan owner C-1..C-4. Bukti: `docs/whatsapp/WA-2a-C-EVIDENCE.md`.
- **WA-2a Step 2E MERGED (2026-10-11)** — akses principal & resolver otorisasi (PR #21): resolver satu pintu (default deny principal), grant maker-checker ≤ 12 bulan, pembaca voyage terbatas per kategori, race R5′–R10. Koreksi asersi lingkup `check-wa2a-schema` yang gagal di `main` sejak PR #20. Keputusan owner E-1..E-6. Bukti: `docs/whatsapp/WA-2a-E-EVIDENCE.md`.

- **WA-2a F1 MERGED (2026-10-11, PR #23)** — kebijakan status pesan dan definisi beku CLIENT_WA_UPDATE, TTL 2 jam, maker-checker.
- **WA-2a F2 MERGED (2026-10-11, PR #24)** — template deterministik ID/EN, tanpa LLM.
- **WA-2a F3 MERGED (2026-10-11, PR #25)** — draft, preview, konfirmasi jadwal dan freshness D6. Bukti: [WA-2a-F3-EVIDENCE.md](whatsapp/WA-2a-F3-EVIDENCE.md).
- **Perbaikan gate 2B MERGED (2026-10-11, PR #26)** — pemeriksaan berkas beku dibandingkan dengan basis main, bukan HEAD.
- **WA-2a F4 MERGED (2026-10-16, PR #27, `5e58237c393a6115d3c55a5c1382dd3c5826a976`)** — request/approve/reject/cancel pada service, berhenti di APPROVED/NOT_STARTED. K1: penulis VoyageEvent mengunci Voyage FOR NO KEY UPDATE; K3/K6: hold, cancel, dan revisi menghentikan approval tertaut; K5: checker berbeda dari pembuat draft, peminta, dan pencatat bukti; K7: bukti berubah menghasilkan EVIDENCE_CHANGED; K11: EXPIRED terminal. Rincian kontrak K1–K11 mengikuti bukti/kode F4, tidak didefinisikan ulang di checkpoint.
- **PR #28 MERGED (2026-10-16, `f304918`)** — checkpoint dan rancangan berstatus DRAFT; bukan izin implementasi.
- **Gate lingkup I/H/P MERGED (2026-10-16, PR #29, `a1f69506e5ad04bc522c2dd8ac5232ded7fa4d42`)** — termasuk perbaikan review (path literal `[id]`, impor bersiklus, perlindungan helper); lulus di `main` bersih pasca-merge; helper `prisma/wa2a-lingkup.mjs`, manifest, uji helper, enam uji fase/2C/2E ditulis ulang; asersi perilaku dipertahankan. Bukti: [WA-2a-GATE-SCOPE-EVIDENCE.md](whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md).
- **Perbaikan pra-merge F4 selesai** — revalidasi penuh Setujui dengan jam sesudah kunci; bukti kompatibilitas HTTP POST/DELETE VoyageEvent; P2 Tolak memeriksa TTL dan memakai timestamp sesudah kunci. P2 direproduksi oleh Claude pada kode lama lalu diuji setelah perbaikan. Dua pengecualian scope diterima owner (§A). Sumber: [bukti F4 §6–§7](whatsapp/WA-2a-F4-EVIDENCE.md). Persetujuan merge F4 bukan penerimaan produk WA-2 secara keseluruhan atau izin pengiriman.

## G. NOT COMPLETED / NEXT GAP

**Batas alur produksi yang sebelumnya terverifikasi berakhir di:** Human Review / Acknowledged Signal / Audit Trail. Secara pengembangan, WA-2a sudah sampai service approval F4 dan API 2a-G (PR #31, merged); UI 2a-G merged di PR #33 (`93fb95e`, tidak di-deploy). Send belum ada.
Pekerjaan berikutnya dimulai **sesudah** batas ini. **Jangan membangun ulang Voyage Monitoring.**

Komunikasi klien eksternal / pengiriman WhatsApp **belum** diimplementasikan maupun diverifikasi sebagai bagian alur produksi ini.

Target alur konseptual:

Validated operational event → tentukan apakah perlu komunikasi ke klien → tentukan penerima → buat pesan WhatsApp terkontrol → Human Approval bila diperlukan → pengiriman WhatsApp → status sent/delivered/failed → audit trail komunikasi

Gap lain yang tetap terbuka (rujukan: gap analysis 2026-09-30):
- Eksekusi approval TAH umum masih di luar pekerjaan ini. Mekanisme khusus WA-1 dan service approval pesan klien WA-2a F4 sudah ada; keberadaan keduanya tidak berarti executor eksternal umum atau Send WA-2 sudah tersedia.
- Agen TAH selain INTAKE (registri: INTAKE + `TAH_DEV_NOOP` non-produksi).
- TD-005-01 kuota AI, TD-005-02 self-approval intake terlihat portal, TD-005-03 update operasional voyage — OPEN.
- Finance self-approval masih diizinkan (`IZINKAN_SETUJU_SENDIRI = true`).
- Document intelligence/versioning, PNBP actual, vendor cost terpadu, profit v2.
- AIS live (hanya NONE/FAKE; kontrak POLL), BMKG/cuaca, event engine lintas sumber.
- Kenaikan rilis produksi `ac922f6` → `main`.

## H. KNOWN BLOCKERS

| Blocker | Dampak |
|---|---|
| Belum ada Send WA-2 dan definisi fase lanjutan yang disahkan | F4 sudah menyediakan approval service, tetapi APPROVED/NOT_STARTED bukan izin pengiriman. API/UI dan pengiriman memerlukan kontrak serta persetujuan tersendiri. |
| Provider/akun WhatsApp dan kebijakan pengiriman belum ditetapkan | Fondasi kontak/consent/grant tersedia di WA-2a, tetapi integrasi pengiriman belum dimulai; tidak ada E2E WhatsApp nyata. |
| SG-05 terbuka (fixture penerima tak terikat tenant) | Integrasi WhatsApp nyata (provider resmi, kredensial/nomor nyata — F-III/WA-3) tidak boleh dimulai sebelum SG-05 ditutup. P-1 tersedia (OD-33 + A1 PR #40; bukti statis Linux). Bukti P-2 (A2) dan P-3 (jalur Send F-II) belum ada. F-II FAKE/loopback diizinkan secara prinsip (OD-35); implementasinya memerlukan persetujuan scope — [SG-05-PENYELARASAN.md](whatsapp/SG-05-PENYELARASAN.md) |
| Promosi Sonnet 5 terkunci aturan PRD-005 (plafon V3 + larangan Blind-C/Eval-9) | Sonnet 5 tetap `PENDING_SPIKE` di `main` tanpa keputusan owner baru (lihat §I) |
| `SPIKE_OPENROUTER_API_KEY` kedaluwarsa 2026-10-05 | Evaluasi LIVE apa pun butuh kunci baru + saldo terverifikasi |
| Produksi menjalankan rilis lama `ac922f6` | Registri produksi berbeda dari `main` (Sonnet 5 `VERIFIED` vs `PENDING_SPIKE`) |
| Status trial/paid GCP UNVERIFIED | Risiko layanan terhenti; VM dipakai bersama aplikasi lain |

## I. MODEL STATUS — tiga keadaan, jangan dicampur

| Keadaan | Status | Label |
|---|---|---|
| **OWNER MODEL DIRECTION** | `anthropic/claude-sonnet-5` | Keputusan owner 2026-10-05 |
| **GITHUB MAIN TECHNICAL STATUS** | Sonnet 5 = **`PENDING_SPIKE`**; Sonnet 4.5 = `VERIFIED` (`LEGACY_IN_USE`). `TAH_INTAKE_MODEL=anthropic/claude-sonnet-5` di kode `main` → gagal tertutup `MODEL_TIDAK_TERVERIFIKASI`, 0 panggilan | VERIFIED 2026-10-05 |
| **PRODUCTION (rilis lama `ac922f6`)** | Registri mencatat Sonnet 5 = **`VERIFIED`** (sebelum revert `4cd338d`), tetapi **dorman**: `TAH_INTAKE_MODEL`, `TAH_CORE_ENABLED`, `VESSEL_CALL_INTAKE_ENABLED` ABSENT. Model global `OPENROUTER_SPK_MODEL = anthropic/claude-sonnet-4.5` | OWNER-VERIFIED 2026-10-05 |

**Jangan menyimpulkan TAH aktif hanya karena registri produksi menulis `VERIFIED`.**

Riwayat singkat Sonnet 5: Eval-4 heldout-3 LIVE PASS 42/42 (TEXT, Prompt v4, validator lama) → promosi sempit `b89ca36` → dicabut `4cd338d` sesudah Eval-7 Blind-A → Eval-8 Blind-B gagal target karena plafon validator V3 (bukan kegagalan model). HTTP 402 hanya sekali di Eval-4 heldout-1 (infrastruktur, akar tidak terbukti).

Syarat minimum mengubah status dari `PENDING_SPIKE` (butuh keputusan owner; PRD-005 tetap CLOSED): spesifikasi validator baru + dataset blind segar + evaluasi baru, ATAU perubahan kriteria penerimaan secara eksplisit; lalu evaluasi LIVE Sonnet 5 dengan validator final yang lulus ambang, otorisasi LIVE, kunci API baru, saldo terverifikasi.

## J. WHATSAPP AUTOMATION STATUS

| Item | Status |
|---|---|
| WA-0 architecture / read-only audit | **COMPLETE** |
| PRD WA-1 v0.2 | **OWNER APPROVED + FROZEN** — baseline `docs/whatsapp/PRD-WA-1.md` (PR #4 merged) |
| WA-1 Step 2A–2D | **MERGED** ke `main` (PR #6–#9); tidak dideploy |
| WA-1 Step 2E — FAKE Send + retry manual | **MERGED** ke `main` (PR #10, `8ebd546`, 2026-10-09); **tidak dideploy**. Satu transaksi REPEATABLE READ; revalidasi #2; approval basi → `NEEDS_REVIEW` (K1); requestKey terikat tenant+pesan+snapshot (K3); tanpa egress provider pada jalur Send FAKE WA-1 (trap runtime + scan impor, K4; bukan klaim aplikasi tanpa lalu lintas jaringan — lihat F-6); batas ≤ 5 attempt via `bolehUlangiEksekusi` beku; `kunciCandidate` menserialkan Send vs revisi Prepare; tanpa migrasi; `tah-policy.ts` & berkas beku V3 tak berubah |
| WA-1 Step 2F–2I — Cancel, Read/History, API, UI | **MERGED** ke `main` (PR #12–#15, `d4a3e71`, 2026-10-10); **tidak dideploy**; tanpa migrasi baru |
| WA-1 Step 2J — E2E Validation & Demo | **MERGED** ke `main` (PR #17, `be91229`, 2026-10-10); **tidak dideploy**. Bukti: `docs/whatsapp/WA-1-STEP2J-EVIDENCE.md`; panduan demo: `docs/whatsapp/WA-1-STEP2J-DEMO.md` |
| **WA-1 (proof-of-flow FAKE, non-produksi)** | **ACCEPTED — OWNER ACCEPTANCE: APPROVED 10 Oktober 2026** (OWNER-VERIFIED, demo Chrome di laptop owner). Gate PRD §18 terpenuhi. Batasan tetap: FAKE-only, `INTERNAL_FAKE_TEST` ditolak di produksi (D-12), penerima hanya fixture `TEST_FIXTURE`, nol egress WhatsApp |
| Setuju-sendiri `WA_INTERNAL_FAKE_TEST` | Diizinkan (INTERNAL_WRITE, non-produksi; sesuai PRD AC-14, keputusan 2D). `EXTERNAL_COMMUNICATION` tetap `SELF_APPROVAL_FORBIDDEN` (AC-15). F4 menerapkan maker-checker khusus CLIENT_WA_UPDATE; perilaku WA-1 tetap dipertahankan. |
| Risiko terbuka WA-1 (dari 2H/2I) | Tanpa rate limit di POST; sanitasi log galat belum ada; pagination & allowlist field `AuditLog` belum ada; tanpa token CSRF eksplisit (`NEXTAUTH_URL` wajib = origin publik); uji hanya terhadap `next dev`; tanpa CI independen |
| **SG-05 fixture ↔ tenant** | **TERBUKA.** Fixture penerima = konstanta kode tanpa relasi tenant. Pembatas yang wajib dipertahankan: FAKE-only, non-produksi, allowlist tenant Automation, tanpa pengiriman WhatsApp/provider nyata (bukan klaim tanpa lalu lintas jaringan: F-6 Google Fonts dan keterbatasan ukur proxy loopback dicatat terpisah). **Wajib diselesaikan sebelum integrasi pengiriman WhatsApp nyata** (keputusan owner 2026-10-09). A1 **MERGED** (PR #40, `ab4dac7`; OD-32): batas fixture + uji statis `prisma/check-sg05-batas-fixture.mjs` — **tidak menutup SG-05**. D-1/D-2/D-2b/D-4 disetujui (OD-33–OD-36; dilaporkan owner sesudah merge PR #40). Status bukti: **P-1 tersedia** — keputusan OD-33 + uji statis 55/0 di Linux pada `ab4dac7`, Windows sungguhan belum diuji, cakupan hanya batas fixture di `src/`; **P-2 belum** (A2 belum diimplementasikan/diuji); **P-3 belum** (jalur Send F-II belum ada) ([SG-05-PENYELARASAN.md](whatsapp/SG-05-PENYELARASAN.md)). |
| WA-2a Step 2B — schema & fondasi DB | **MERGED** ke `main` (PR #19, 2026-10-10); **tidak dideploy; migrasi belum diterapkan di produksi/staging** |
| WA-2a Step 2C — kontak & consent (2a-D digabung, C-1) | **MERGED** ke `main` (PR #20, 2026-10-10); service saja; tidak dideploy |
| WA-2a Step 2E — akses principal & resolver | **MERGED** ke `main` (PR #21, 2026-10-11); service saja; tidak dideploy |
| WA-2a 2a-F: F1–F4 | **MERGED** (#23–#27, termasuk #26). Draft → preview → request → approve/reject/cancel tersedia pada service lokal; berhenti di APPROVED. |
| Gate lingkup WA-2a I/H/P | **MERGED** (PR #29, `a1f6950`), lulus pasca-merge; blocker gate ditutup — G-D1..G-D4 disetujui owner; hasil aktual di [bukti gate](whatsapp/WA-2a-GATE-SCOPE-EVIDENCE.md) |
| WA-2a 2a-G — API (T1–T2) | **MERGED** (PR #31, `fa0ad59`). Read service + 10 route (11 metode-path) di atas F3/F4; gerbang sebelum CSRF/body; berhenti di APPROVED; tanpa Send. Revisi 1: kandidat sinyal hanya OPEN/ACKNOWLEDGED, disaring di query sebelum batas jumlah. **Keterbatasan:** jendela `min(take × 5, 250)` — sinyal berstatus layak tetapi jenis kejadiannya tidak didukung masih dapat menutupi kandidat layak yang lebih lama. Bukti: [WA-2a-G-EVIDENCE.md](whatsapp/WA-2a-G-EVIDENCE.md) |
| Fase GUI di manifest lingkup | **DITUTUP — MERGED (PR #35, `e4a351e`)** (OD-22/OD-23): `fase.GUI` = rekaman historis PR #33 (lapis H), `faseAktif` = `{}`, `WA2A_FASE=GUI` ditolak. Tidak ada fase aktif pengganti. |
| Penerimaan owner WA-2a 2a-G (T5/G-12) | **DITERIMA — OWNER ACCEPTANCE (OD-30, 18 Oktober 2026)** atas satu run uji coba Windows/Edge (bukan run penerimaan bersih; F-6 diterima apa adanya). A-01–A-09 Sesuai, A-10 Diterima, Q-1 boleh; U-1 backlog UX (OD-31). Proof-of-flow lokal non-produksi sampai APPROVED/BELUM DIKIRIM; bukan production readiness, bukan izin Send/deploy/WA-3. Kit: [WA-2a-G-DEMO.md](whatsapp/WA-2a-G-DEMO.md) |
| WA-2a 2a-G — UI (T3–T4) | **MERGED (PR #33, `93fb95e`), lokal non-produksi, tidak di-deploy** (OD-20; revisi 1 = perbaikan race test, HEAD kode uji `9a9fa2e`). 2 halaman + 3 komponen di atas API; tombol dari `aksiTersedia`; revisi dengan `contactId` detail (opsi B); label BELUM DIKIRIM; tanpa Send/Sidebar. Bukti: [WA-2a-G-UI-EVIDENCE.md](whatsapp/WA-2a-G-UI-EVIDENCE.md) |
| Login staf (F-1/F-3) | **Diperbaiki di `main`** (PR #37 `c2ad40b`; PR #38 `1b20baa`): form POST + tombol nonaktif sebelum halaman siap (F-1); sukses hanya dengan sesi akun yang sama (F-3); tunggu permintaan `/api/auth/*` selesai sebelum token CSRF; percobaan dapat dibatalkan; status "tidak pasti" tanpa coba-ulang otomatis; muat penuh sesudah sukses. Diuji otomatis di Linux/Chromium; di Windows/Edge hanya satu demo manual owner (18 Oktober 2026: login bersesi, `URL-dengan-password=0`) — uji otomatis login di Windows/Edge belum dijalankan. Bukan penerimaan WA-2a |
| F5 / 2a-F′ / 2a-I | **BELUM DIDEFINISIKAN.** Tidak disamakan otomatis dengan 2a-G atau WA-2b. |
| Flag `WA2_CLIENT_FOUNDATION_ENABLED` | Default `"false"` (`.env.example`); `NODE_ENV=production` selalu ditolak gerbang WA-2a — VERIFIED 2026-10-11 |
| WA-2 production readiness | **TIDAK production-ready.** API 2a-G hanya lokal non-produksi (produksi ditolak `WA2_ENV_NOT_ALLOWED`, diuji lokal); UI 2a-G merged di PR #33 (produksi 404, diuji lokal; tidak di-deploy); belum ada pengiriman. Hasil HTTP VoyageEvent/WA-1 adalah regresi operasional, bukan penerimaan API/UI WA-2. |
| Production WhatsApp integration | **NOT STARTED** |
| Meta/WhatsApp production egress | **Tidak ada** |
| Perubahan produksi/deployment dari pekerjaan WA | **Tidak ada** |

Source of truth desain, kontrak, safety gate, dan acceptance/test (TS-01..TS-18): **`docs/whatsapp/PRD-WA-1.md`** — jangan diduplikasi di checkpoint.

- **Belum ada integrasi.** Di kode hanya tautan `wa.me` (click-to-chat manual) pada halaman login, landing, dan billing.
- Email: hanya draft + pencatatan manual "tandai terkirim"; belum ada pengiriman otomatis.
- Fondasi yang sudah terverifikasi di produksi dan menjadi titik awal: Voyage → Audit Log → Voyage Monitoring → Signal → Human Review → Acknowledge (§D).

### J.1 Dokumen desain WA-2 — penelusuran historis 2026-10-11 dan pembaruan 2026-10-16

Penelusuran lintas branch/riwayat/filesystem pada 11 Oktober tidak diulang pada sesi ini. F1–F4 sudah diimplementasikan dan merged sesudah checkpoint lama; ketidaklengkapan PRD menyeluruh tidak berarti F1–F4 belum dimulai.

| Dokumen | Status |
|---|---|
| PRD WA-2 (mis. `PRD-WA-2-DRAFT.md`) | **TIDAK DITEMUKAN** di `main`, di semua branch remote, di riwayat commit, di pencarian issue GitHub (0 hasil), maupun di filesystem sesi (pencarian nama berkas). Status persetujuan: **UNVERIFIED** |
| Desain WA-2 "rev2" | **TIDAK DITEMUKAN** sebagai berkas. Hanya dirujuk di komentar kode (`wa-access-resolver.ts`: "desain rev2 §4.1") dan `WA-2a-C-EVIDENCE.md` §1 |
| Daftar keputusan owner WA-2 | **Tidak ada dokumen tersendiri.** ID keputusan hanya tercatat di dokumen bukti/PR: DB-1, DB-2, DB-3, B-5 (2B); C-1..C-4 (2C); E-1..E-6 (2E); B-3, K-05/K-05b, D-T1 dirujuk tanpa definisi lengkap |
| `WA-2a-B/C/E-EVIDENCE.md` | Ada di `main` (`docs/whatsapp/`) |
| Definisi F1–F4 / fase tersisa | F1–F4: kontrak, implementasi dan bukti tersedia pada PR #23–#27. F5, 2a-F′, 2a-I tetap belum didefinisikan. Rancangan 2a-G tersedia pada [WA-2a-NEXT-PHASE-DRAFT.md](whatsapp/WA-2a-NEXT-PHASE-DRAFT.md), belum baseline yang disahkan. |

Implikasi: jangan membuka ulang F1–F4 hanya karena checkpoint lama tertinggal. Fase tersisa perlu definisi, daftar path, acceptance criteria, dan keputusan owner sebelum implementasi.

## K. UX BACKLOG (ditemukan saat uji 2026-10-05 — BACKLOG, jangan diimplementasikan saat update checkpoint)

**Modal "Create New Voyage":** sesudah field diisi, klik di luar modal menutupnya; saat dibuka lagi, data yang sudah diisi hilang.
Perilaku yang diinginkan:
- klik tak sengaja di luar modal tidak boleh membuang data secara diam-diam;
- simpan draft ATAU cegah tutup-dari-luar saat form sudah diisi (dirty);
- bila user sengaja menutup form yang dirty, tampilkan konfirmasi seperti "Discard unsaved changes?".

## L. NEXT EXACT STEP

**PR #40 (A1 SG-05) MERGED `ab4dac7`; SG-05 tetap OPEN. D-1/D-2/D-2b/D-4 disetujui (OD-33–OD-36; dilaporkan owner). Urutan: WA-1 CLOSED → WA-2a ACCEPTED (OD-30) → A1 merged; bukti P-1 tersedia sesuai batas OD-33 (bukan bukti keamanan pengiriman) → A2/P-2 → F-II/P-3 → keputusan owner menutup SG-05 → WA-3. Berikutnya: (1) review rancangan A2 (`RANCANGAN-A2-SG05.md`, belum ada di repository); (2) keputusan owner atas scope implementasi A2 — belum disetujui; (3) scope F-II FAKE/loopback — belum disetujui; (4) keputusan penutupan SG-05; (5) WA-3 (provider resmi, template resmi, pesan nyata ke nomor internal, webhook status nyata) dengan scope dan persetujuan terpisah. A2 dan F-II bukan WA-3; integrasi Tribuana Digital Port bukan pengganti urutan ini. WA-2a 2a-G DITERIMA owner (OD-30); U-1 masuk backlog UX (OD-31). PR #39 (dokumentasi demo) MERGED `23ec4e8`; PR #40 MERGED `ab4dac7`. Selain itu: setiap fase baru (termasuk WA-3), perbaikan kode (mis. F-6, U-1), deploy, atau Send memerlukan persetujuan terpisah. Tidak ada fase aktif.**

- Peta fase yang dipakai owner: **WA-2** = kontak, consent, draf, approval (berhenti di APPROVED, tanpa Send); **WA-3** = provider resmi dan pesan nyata internal. Penyebutan "WA-2b/Send" di bawah adalah istilah lama dan tidak membuka fase baru.
- Nomor OD-27–OD-30 diberikan berurutan atas keputusan owner (K-3, OD-30).
- Penerimaan owner **terpisah** dari hasil uji teknis: hasil Linux pada §B tidak menilai A-01–A-10.

1. PR #31 (API) MERGED `fa0ad59`; PR #32 (rencana UI dikoreksi, OD-20) MERGED `c1003d5`; [PR #33](https://github.com/marlon870saragih-cloud/maritim-suite/pull/33) (UI, HEAD `5b775e4`, HEAD kode uji `9a9fa2e`) MERGED `93fb95e` (OD-21).
2. **Opsi langkah berikutnya (perlu keputusan owner, belum disetujui):**
   - penutupan fase GUI: **MERGED** (PR #35, `e4a351e`, OD-23). Tidak ada fase aktif; scope PR berikutnya dibuktikan dengan daftar diff persis + gate + review, atau dengan fase baru yang disetujui owner;
   - portabilitas Windows `check-comm-policy`: **MERGED** (PR #36, `a50c9bf`, OD-25). Bukti Windows reviewer berlaku untuk blob identik dan hanya untuk suite yang dijalankan reviewer (§B);
3. Deploy, aktivasi flag di lingkungan nyata, dan pengiriman WhatsApp nyata tetap tidak diizinkan.
   - Portabilitas Windows `check-comm-policy`: diperbaiki di `main` (PR #36); suite Windows selain comm-policy, 2B statis, dan g-static belum dijalankan.
4. F5, 2a-F′, 2a-I tetap belum didefinisikan. Jangan menganggap 2a-G sebagai definisi otomatis bagi label tersebut.
5. WA-2b memerlukan desain Send terpisah. APPROVED/NOT_STARTED dapat basi akibat perubahan di luar WA-2; **revalidasi final sebelum Send wajib**. WA-2c = STOP otomatis dari pesan masuk; WA-2d belum didefinisikan dalam pekerjaan ini.
6. Arah “AI menyusun draf untuk disetujui staf; auto-reply terbatas setelah validasi tahap berikutnya” dipertahankan sebagai arah perencanaan yang perlu dikonfirmasi dan dipetakan ke fase. F1–F4 dan API 2a-G memakai template deterministik tanpa LLM.

**Temuan persiapan demo (OD-26).** F-1 dan F-3 sudah diperbaiki di `main` melalui PR #37/#38 dengan persetujuan owner terpisah (status di bawah diperbarui 2026-10-18). Temuan lain tetap dicatat tanpa diperbaiki:
- F-1 (**DIPERBAIKI**, PR #37 `c2ad40b`; Windows/Edge: satu demo manual owner tanpa kejadian, uji otomatis belum) (temuan **keamanan login staf umum**, bukan khusus WA-2a): sebelum perbaikan, form login (`src/app/(auth)/login/page.tsx`, `<form onSubmit… noValidate>` tanpa `method`) yang dikirim sebelum hidrasi menjadi GET native → email dan sandi di query URL (teramati di log `next dev`).
- F-2: migrasi `20260818163500_fase8a_portal_rls` mewajibkan nama database `maritime_suite` (`GRANT CONNECT ON DATABASE maritime_suite`) dan membuat role `maritime_portal` dengan sandi pengembangan tetap.
- F-3 (**DIPERBAIKI**, PR #37 `c2ad40b` + PR #38 `1b20baa`; Windows/Edge: satu demo manual owner tanpa kejadian, uji otomatis belum) (temuan **autentikasi** login staf umum): sebelum perbaikan, UI login menampilkan sukses tanpa sesi. Kode NextAuth 4.24.14 yang terpasang mengembalikan penolakan CSRF credentials sebagai `200 {url: …/signin?csrf=true}` tanpa `error`, sehingga `res.error` kosong. Pada diagnosa Linux `next dev`, 7/7 kejadian F-3 yang direkam adalah penolakan CSRF: token POST ≠ token cookie, terjadi pada login pertama sesudah server dingin. Mekanisme penimpaan cookie CSRF oleh permintaan `/api/auth/*` yang berjalan bersamaan masih **hipotesis**. Kejadian F-3 sebelumnya yang responsnya tidak direkam **tidak** disimpulkan sebagai CSRF.
- F-4: sandi akun demo seed 2a-G tetap dan tercantum di repo publik (hanya untuk DB loopback sintetis).
- Q-1 (**DIJAWAB OD-30: boleh**): peminta dan pencatat bukti dapat membatalkan pesan berstatus menunggu approval; perilaku ini sesuai kebijakan owner.
- F-6 (**diterima apa adanya, OD-30**): server `next dev` mengunduh Google Fonts (`next/font/google` di `src/app/layout.tsx`); di laptop owner diblokir perangkap (BLOCKED=20), di container Linux lolos lewat proxy loopback tanpa tercatat. D16 (`BLOCKED`=0) tidak dapat terpenuhi selama ini berlaku.
- U-1 (**backlog UX, tidak memblokir — OD-31**): temuan tampilan demo — teks "BELUM DIKIRIM" ganda yang tidak diterjemahkan, DATA PESAN dengan nama teknis/JSON, riwayat "DRAFT → —", galat "400 VALIDATION" campur ID/EN, 404 berbahasa EN, alasan batal/tolak tidak tampil di riwayat, label "WA1_EKSEKUSI_DIBATALKAN".
- Usulan penanganan F-1/F-3 (memo diagnosa kit v3) sudah digantikan oleh perbaikan yang merged di PR #37/#38. F-2 dan F-4 tidak berubah.

**Batas dan risiko yang tetap berlaku:**
- K1–K11 mengikuti implementasi/bukti F4. Timeout transaksi Prisma 5 detik: penantian lebih lama gagal dan rollback; UI kelak perlu menjelaskan kemungkinan mencoba ulang.
- Dua keputusan scope F4 sudah selesai melalui OD-15; tidak ada lagi keputusan merge F4 yang tertunda.
- SG-05 (fixture ↔ tenant) tetap harus ditutup sebelum pengiriman WhatsApp nyata. Uji statis A1 bukan bukti penutupan; persetujuan atas kewajiban integrasi bukan bukti integrasi bekerja.
- Risiko historis WA-1 tetap: rate limit POST, sanitasi log, pagination/allowlist AuditLog, CSRF bergantung NEXTAUTH_URL, tanpa CI independen. Build lokal membutuhkan konfigurasi yang sah termasuk PORTAL_DATABASE_URL; jangan menulis nilai rahasia ke repo.
- Validator-remediasi 61 lulus, 9 gagal dari 70 tetap baseline terpisah; bukan alasan mengubah V3 atau membuka PRD-005.
- Tidak ada perubahan produksi oleh sesi ini. Keadaan produksi pada §C–§E bersifat historis/owner-verified sesuai tanggalnya, tidak diverifikasi ulang pada 16 Oktober. Merge tidak mengotorisasi deploy, migrasi produksi, aktivasi flag, atau pengiriman.

Riwayat WA-1 dan fondasi 2B/2C/2E tetap pada §F. F1 #23 → F2 #24 → F3 #25 → perbaikan gate 2B #26 → F4 #27 sudah merged; basis fitur terbaru `5e58237c393a6115d3c55a5c1382dd3c5826a976`.

## M. HARD STOP / OWNER APPROVAL REQUIRED

Tidak boleh dilakukan tanpa persetujuan owner eksplisit pada sesi tersebut:
- coding/implementasi fitur;
- merge ke `main`, deploy, atau kenaikan rilis produksi;
- migrasi atau write ke database produksi;
- perubahan env/konfigurasi produksi, termasuk `TAH_INTAKE_MODEL`, `TAH_CORE_ENABLED`, `VESSEL_CALL_INTAKE_ENABLED`;
- mengaktifkan TAH Intake;
- perubahan registri model atau promosi Sonnet 5;
- evaluasi LIVE / panggilan model berbayar;
- membuka kembali PRD-005;
- perubahan GCP, VM, nginx, firewall, PM2, billing;
- registrasi provider WhatsApp atau pengiriman WhatsApp/email;
- perubahan data tenant uji/duplikat (HOLD) atau pembersihan data uji;
- menjalankan script untracked dari checkout lokal mana pun.

## N. HISTORICAL CHECKPOINT (2026-09-30, tetap benar)

- SHA kode yang diaudit pada gap analysis: `main@0b5c1c5`; PR #1 merged 2026-09-30 04:15:17 UTC.
- PRD-005: Validator V3 FINAL `ac6460c`, kandidat `prd005-intake-text/kandidat-validator-v3-2`,
  fingerprint `775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c`.
- Prinsip alur yang disepakati: source → ingest → validate → link ke pekerjaan → approval → action → audit. AI tidak boleh menciptakan fakta operasional/finansial tanpa sumber.
- PNBP/biaya resmi mengikuti billing/nota resmi; internal cost/profit terpisah dari dokumen klien. Data sensitif dan credential tidak masuk repo publik.
- External Data Pack historis dianggap cukup untuk desain; tidak perlu mengumpulkan dokumen dari nol.
- Usulan urutan paket (gap analysis §5, belum disetujui sebagai komitmen): 0 rekonsiliasi baseline → 1 TAH Approval/audit/kontrol biaya AI → 2 Vessel Call + Document Intelligence → 3 EPDA/PR/vendor/PNBP actual → 4 profit v2/closing → 5 Event Engine → 6 AIS live + BMKG → 7 Client Communication Agent → 8 WhatsApp + pilot. Estimasi awal 8–13 minggu kerja (ketidakpastian tinggi). Per keputusan owner 2026-10-05 (OD-3), fokus berikutnya adalah Client Communication / WhatsApp di atas fondasi yang sudah terverifikasi (§D).
