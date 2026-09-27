# PRD-005 — Hasil Eval-4 Sonnet 5 (Vessel Call Intake, TEXT)

Dokumen bukti permanen yang disanitasi. Tidak memuat kunci API, prompt mentah, isi dokumen
klien, atau keluaran model mentah. Artefak run asli (checkpoint/laporan JSON) disimpan di
direktori kerja sementara sesi evaluasi dan **tidak** ikut repo; sidik sha256-nya dicatat di
bawah supaya salinan yang disimpan owner bisa dicocokkan.

## 1. Tujuan

Membuktikan secara terkendali bahwa `anthropic/claude-sonnet-5` + Prompt v4 aman dan cukup
akurat untuk ekstraksi Vessel Call Intake **input TEXT**, sebelum promosi registri model.
Hasil ini menjadi dasar promosi SEMPIT (keputusan owner D-P1): Sonnet 5 hanya untuk intake
TEXT; CSV/WORKBOOK/PDF/IMAGE tetap jalur LEGACY (Sonnet 4.5 + Prompt v3).

## 2. Identitas yang diuji

| Item | Nilai |
|---|---|
| Model diminta & wajib dilayani | `anthropic/claude-sonnet-5` (persis; tanpa fallback/route/provider override) |
| Prompt | `vessel-call-extract` versi 4, skema 4 |
| Hash Prompt v4 (sha256 system prompt + skema tool) | `6ed1edba38780badcff111e70f63e83d95668f15b99644f174bac1984ce65959` |
| Transport | tool paksa `isi_intake_kunjungan`; temperature **tidak dikirim**; tanpa plugin PDF |
| Paket held-out | `prd005-eval4/heldout-3` — 20 kasus × 2 ulangan + regresi RG-H20, RG-H18 (42 slot) |
| Hash spesifikasi paket | `00a6e44d071f96de286066ff0ab7efbb788a82c4f96cf5e1a20af6927acf0018` |
| SHA fixture held-out | `d6135a2f12843ab4b8fe1db3cf2bd3398799d67b5cb6cded4b9233269c459fab` |
| SHA `intake-policy.ts` (validator/normalisasi, dibekukan) | `4f5b1273d9a01ceee308f201a40a7594ce6fabc2220cacc0657f139f50f2059c` |
| Runner | `prd005-eval4/runner-3`, checkpoint `checkpoint-2` (terikat tanggal efektif + sidik sumber) |
| Kebijakan berhenti | `SEMUA_PELANGGARAN_TOLERANSI_NOL_HENTIKAN_SEBELUM_PANGGILAN_BERIKUT` |
| Commit kode yang dievaluasi | `ddb9632c4127af781d1b0807030f5ebaa43f1336` |

## 3. Hasil heldout-3 — EVAL4_PASS

Tanggal efektif: **2026-09-27** (satu tanggal; mulai 11:46:29 UTC).

| Ukuran | Hasil | Ambang beku |
|---|---|---|
| Panggilan selesai | **42/42** (0 gagal, 0 ulang) | ≤ 42, ulang 0 |
| Identitas diminta/dilayani | 42/42 `anthropic/claude-sonnet-5` | persis |
| Held-out lulus (klasifikasi POST benar, 0 FATAL, 0 MAJOR) | **40/40** | ≥ 36/40 |
| Konsistensi antar-ulangan (POST) | **20/20** | ≥ 18/20 |
| Regresi H20 (muatan karangan) | **LULUS** (0 F5 di RAW & POST) | toleransi nol |
| Regresi H18 | **LULUS** | — |
| FATAL POST | **0** | 0 |
| MAJOR POST | **0** | — (syarat slot lulus) |
| Muatan tak berbukti (RAW/POST) | **0 / 0** | 0 |
| Pelanggaran identitas/fallback | **0** | 0 |
| Pelanggaran output tool | **0** | 0 |
| Pelanggaran toleransi-nol | **0** | 0 |
| Integritas GT | OK | — |
| Token | 254.465 input / 10.517 output | ≤ 1.050.000 / 210.000 |
| Biaya aktual | **US$0.6141** (maks US$0.016668/panggilan) | ≤ US$2.10 total, ≤ US$0.05/panggilan |

Catatan jujur atas hasil:

- Q07: subtipe berbeda antar-ulangan (NEW_APPOINTMENT vs NEW_NOMINATION). Keduanya diterima GT;
  tanda tangan konsistensi beku memperlakukannya sebagai kelas yang sama.
- Keluaran antar-ulangan hampir identik; konsistensi 20/20 tidak mengukur variasi lintas waktu/penyedia.
- H20 diklasifikasikan NOT_RELEVANT (heldout-2: UNSUPPORTED_REQUEST) — keduanya diterima GT.

Sidik artefak (salinan sementara sesi evaluasi):
checkpoint `43000f85acfc3ecf66fec5c911fa1c4006c6bcab7b24b2f926a992a0abb8eb1a`,
laporan `81087af89fbd839dbe1c1ce8fc6c14a4b8067a394ad388ac60733c2ed3246488`.

## 4. Riwayat run sebelumnya (tetap berlaku sebagai bukti historis)

| Paket | Hasil | Ringkasan |
|---|---|---|
| `heldout-1` | **EVAL4_INCONCLUSIVE** | Berhenti di slot 20/42 karena HTTP 402 dari penyedia (19 panggilan selesai, US$0.276164). Akar masalah 402 **tidak terbukti** (hanya kode status yang tercatat). RCA: Q16 = cacat GT laten (bentuk verbatim "bijih nikel (nickel ore)" tak diterima); Q17 = teks sumber ambigu ("dua rangkaian" vs aturan "lebih dari satu kunjungan terpisah"). |
| `heldout-2` | **EVAL4_FAIL** | Q16 GT & teks Q17 dikoreksi. Berhenti di slot 21 (Q19 u1) karena 1 FATAL `F3@portName` (21 panggilan, US$0.306826). |
| `heldout-3` | **EVAL4_PASS** | Lihat §3. |

Probe pendahuluan: identitas dilayani (1 panggilan, US$0.000072) dan kemampuan transport
(1 panggilan, US$0.013614). Total biaya seluruh evaluasi Sonnet 5 ≈ US$1.21.

## 5. Cacat Q19 dan perbaikannya

- Sumber: `tujuan Pel. Pontianak (IDPNK)`. Model menulis nama pelabuhan setia sumber
  ("Pel. Pontianak") dan UN/LOCODE IDPNK yang benar.
- Akar masalah: **cacat normalisasi validator**, bukan halusinasi model. `normalisasiNamaPort`
  hanya membuang awalan `PORT OF`/`PELABUHAN`, sehingga `PEL PONTIANAK ≠ PONTIANAK` → F3.
- Perbaikan (produksi, disetujui owner): awalan token utuh `PEL` di AWAL nama juga dibuang
  (`Pel.`, `Pel`, `Pelabuhan` setara); kata yang sekadar diawali PEL (mis. PELITA, PELINDO) tidak
  tersentuh. Dibuktikan offline (replay sidik POST persis) lalu live di heldout-3 (Q19 bersih 2/2).

## 6. Paparan held-out (caveat)

Kasus yang sama dipakai ulang lintas run: sebelum heldout-3, Q01–Q17 telah dikirim ke
Sonnet 5 dua kali (Q17 sekali dengan teks lama), Q18–Q19 sekali, Q20 belum pernah. Panggilan
API tidak melatih model, tetapi paket ini **bukan** lagi "belum pernah dilihat model" dan
penyusun evaluasi telah melihat keluarannya.

## 7. Batas bukti — yang TERVERIFIKASI dan yang TIDAK

Terverifikasi (dasar promosi registri `VERIFIED`/`SPIKE`):

- Vessel Call Intake **input TEXT** dengan Prompt v4;
- tool paksa; temperature tidak dikirim; identitas dilayani persis; tanpa fallback;
- gerbang kualitas held-out, konsistensi, dan keselamatan toleransi-nol.

**TIDAK** terverifikasi (tetap jalur LEGACY Sonnet 4.5 + Prompt v3, atau di luar cakupan):

- PDF (native maupun tanpa plugin), IMAGE, CSV, WORKBOOK;
- penerimaan parameter temperature (`acceptsTemperature: false` = tidak dikirim, **bukan** bukti ditolak);
- fitur AI lain (SPK, invoice, document AI, rute `/api/ai/*`) dan model bawaan global
  `OPENROUTER_SPK_MODEL` (tetap Sonnet 4.5);
- beban/latensi produksi nyata.

## 8. Aktivasi & rollback

- Aktivasi sempit: `TAH_INTAKE_MODEL="anthropic/claude-sonnet-5"` (hanya intake TEXT memakai
  Sonnet 5 + Prompt v4; jenis lain tetap LEGACY, tercatat di `AgentModelCall`).
- **Jangan** set `OPENROUTER_SPK_MODEL` ke Sonnet 5 (mengubah semua fitur AI).
- Jejak audit model/prompt per panggilan hanya ada bila `TAH_CORE_ENABLED="true"`.
- Rollback: hapus/kosongkan `TAH_INTAKE_MODEL` lalu restart → perilaku lama persis
  (Sonnet 4.5 + Prompt v3, dibuktikan uji byte-identik).
