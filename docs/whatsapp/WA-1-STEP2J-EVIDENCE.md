# WA-1 Step 2J — Laporan Bukti E2E Validation (FAKE-only, non-produksi)

**Tanggal:** 2026-10-10 · **Basis:** `main` @ `d4a3e71` · **Branch:** `feat/wa1-step2j-e2e`
**Lingkungan:** kontainer pengembangan; PostgreSQL 16 loopback sekali pakai; `next dev` lokal (port 3100) dengan
perangkap egress `prisma/wa1-egress-trap.mjs`; varian `NODE_ENV=production` lewat `next build` + `next start` lokal.
Tidak ada akses ke server/DB produksi. Tidak ada provider WhatsApp. Data sintetis saja.

## 1. Perubahan Step 2J (hanya pengujian, alat uji, dan dokumentasi)
| Berkas | Isi |
|---|---|
| `prisma/check-comm-e2e.mjs` (baru) | Uji E2E HTTP: 12 alur pilot × bahasa dengan body byte-per-byte vs teks PRD §11, gate negatif, retry, idempotensi, Cancel, isolasi, bukti egress; mode `produksi` |
| `prisma/wa1-egress-trap.mjs` (baru) | Preload `--import` untuk proses server uji: blokir & catat koneksi keluar non-loopback (net/tls/dns) |
| `prisma/demo-wa1-seed.mjs` (baru) | Seed demo sintetis untuk laptop owner (loopback-only) |
| `prisma/check-comm-ui.mjs` | Tangkapan layar opsional (`COMM_UI_SCREENSHOT_DIR`) di 12 langkah kunci |
| `docs/whatsapp/WA-1-STEP2J-DEMO.md`, `docs/whatsapp/WA-1-STEP2J-EVIDENCE.md` (baru) | Panduan demo dan laporan ini |
| `docs/whatsapp/evidence/step2j/*.png` (baru, 12) | Tangkapan layar run Playwright final (data sintetis; tanpa kata sandi/token) |

Tidak ada perubahan pada `src/`, schema, migrasi, PRD WA-1 (frozen), Validator V3, `src/services/tah`, atau
`prisma/check-validator-remediasi.mjs`.

## 2. Matriks Test Scenario (PRD §16)
Lapisan bukti: **E2E** = `check-comm-e2e` (HTTP nyata ke server lokal) · **UI** = `check-comm-ui` (Playwright)
· **SVC** = suite DB service (`check-comm-*-db`) · **POL** = `check-comm-policy`.

| TS | Skenario | Bukti | Hasil |
|---|---|---|---|
| TS-01 | ETA berubah | E2E §1 ID+EN byte-per-byte → FAKE_SENT; SVC prepare #2 | PASS |
| TS-02 | ETD berubah | E2E §1 ID+EN; SVC prepare #3 | PASS |
| TS-03 | ETA+ETD satu AuditLog | E2E §1 (Prepare dari sinyal ETD → candidate sama; baris ETA lalu ETD, byte-per-byte); SVC prepare #4/#31; read #27 | PASS |
| TS-04 | ETA diisi pertama kali | E2E §2 `SCHEDULE_FIRST_SET`; SVC prepare | PASS |
| TS-05 | ETA dikosongkan | E2E §2 `SCHEDULE_CLEARED`; SVC prepare | PASS |
| TS-06 | EOSP | E2E §1 ID+EN (waktu lokal + zona); UI; SVC prepare #6 | PASS |
| TS-07 | ALL_FAST tanpa berth | E2E §1 ID+EN; SVC prepare #7 | PASS |
| TS-08 | SAILED | E2E §1 ID+EN (pelabuhan Asia/Jakarta, UTC+07:00); SVC prepare #8 | PASS |
| TS-09 | Timezone kosong / bukan IANA | E2E §2 `TIMEZONE_MISSING`/`TIMEZONE_INVALID`; SVC send #33/#34 | PASS |
| TS-10 | Sumber dihapus sebelum Prepare | E2E §2 `SOURCE_DELETED`, sinyal tetap; SVC prepare | PASS |
| TS-11 | Sumber dihapus setelah Approve | E2E §3 Send `DIBLOKIR SOURCE_DELETED`, pesan BLOCKED, 0 attempt; SVC send #27–29 | PASS |
| TS-12 | Duplikasi | E2E §5 (5 Prepare paralel → 1 candidate; 6 Send paralel → 1 FAKE_SENT; replay kunci sama → 1 attempt; kunci baru → `ALREADY_FAKE_SENT`); UI klik ganda → 1 POST; SVC send #48–53 | PASS |
| TS-13 | Non-pilot | E2E §2 NOR_TENDERED, COMMENCED, VOYAGE_STATUS_CHANGED, DATA_STALE, MONITORING_ERROR, ACTUAL_DATE_MISSING → `EVENT_NOT_ALLOWED`, 0 candidate; UI tanpa tombol; POL | PASS |
| TS-14 | Proof-of-flow + pemantau egress; varian produksi | E2E §1 + §8 (perangkap egress di proses server; 0 upaya ke host WhatsApp/Meta); E2E mode `produksi` P1–P5 (`ENV_NOT_ALLOWED`, 0 baris) | PASS ¹ |
| TS-15 | `EXTERNAL_COMMUNICATION` oleh originator | SVC approval #21 `SELF_APPROVAL_FORBIDDEN`; E2E §3 memastikan approval WA berkelas `INTERNAL_WRITE` | PASS ² |
| TS-16 | ACK lalu Send tanpa approval | E2E §3 `APPROVAL_REQUIRED`, 0 attempt; SVC send #20 | PASS |
| TS-17 | Jadwal diubah lagi setelah Approve | E2E §3 `SOURCE_SUPERSEDED`, tanpa FAKE_SENT; SVC send #30 | PASS |
| TS-18 | `occurredAt` di masa depan | E2E §2 `TIME_IN_FUTURE`; SVC send #37 | PASS |

¹ Satu-satunya upaya egress yang tercatat adalah unduhan font `next/font/google` oleh `next dev` saat mengompilasi
root layout (`src/app/layout.tsx`, sudah ada sebelum WA-1) ke `fonts.googleapis.com` — **diblokir** perangkap; Next
memakai font cadangan. Tidak ada upaya ke host lain. Di `next start` (build produksi) runtime: 0 upaya egress.
² Jalur `EXTERNAL_COMMUNICATION` tidak dapat dicapai lewat API WA-1 (jenis approval WA diturunkan server); buktinya
di tingkat service.

## 3. Matriks Acceptance Criteria (PRD §15)
| AC | Bukti utama | Hasil |
|---|---|---|
| AC-01 Prepare → candidate + draft tanpa attempt | E2E §1; SVC prepare #36 (0 attempt) | PASS |
| AC-02 Non-pilot → `EVENT_NOT_ALLOWED` | TS-13 | PASS |
| AC-03 ETA+ETD satu candidate/body | TS-03 | PASS |
| AC-04 First-set / cleared diblokir | TS-04, TS-05 | PASS |
| AC-05 `TIME_IN_FUTURE` (Prepare & Send) | TS-18 | PASS |
| AC-06 Satu penerima fixture + satu bahasa, tanpa input bebas | UI (pilihan fixture tersamar, tanpa input teks/tel/textarea editor); SVC prepare `CONTACT_INELIGIBLE` | PASS |
| AC-07 Body deterministik, tanpa placeholder, preview + label simulasi | E2E §1 12× byte-per-byte vs PRD §11; UI label & preview; SVC prepare #23 | PASS |
| AC-08 Timezone wajib, tanpa fallback | TS-09 | PASS |
| AC-09 Sumber dihapus sebelum Prepare | TS-10 | PASS |
| AC-10 Sumber dihapus setelah Approve | TS-11, TS-17 | PASS |
| AC-11 Stale bila fakta relevan berubah; tak relevan tidak membatalkan | E2E §3 (nama kapal → `APPROVAL_STALE`/NEEDS_REVIEW; status voyage → tetap FAKE_SENT); UI; SVC send #38–46 | PASS |
| AC-12 Maks satu FAKE_SENT | TS-12 | PASS |
| AC-13 Bukan FAKE → `MODE_NOT_FAKE` | SVC send #26 (mode tidak dapat dipilih lewat API) | PASS ² |
| AC-14 Satu admin Prepare→Approve→FAKE Send non-produksi; produksi ditolak | E2E §3 setuju-sendiri `DISETUJUI` → FAKE_SENT; E2E mode `produksi` `ENV_NOT_ALLOWED` | PASS |
| AC-15 `SELF_APPROVAL_FORBIDDEN` untuk `EXTERNAL_COMMUNICATION` | TS-15 | PASS ² |
| AC-16 ACK ≠ approval | TS-16 | PASS |
| AC-17 History lengkap, tak ditimpa, log termasking | E2E §1 (per alur: jejak audit ≥ 7 entri, memuat WA1_REVISI_DIBUAT, WA1_ATTEMPT_DIKLAIM, WA1_PESAN_FAKE_SENT — run final 13 entri), §6 (pembatalan + alasan + actor), §8 (log tanpa pengenal); UI riwayat; SVC read #18–31 | PASS |
| AC-18 Cancel vs Send: satu pemenang | E2E §6 (Cancel DRAFT/PREVIEWED/APPROVED/FAKE_FAILED; 6× balapan, kedua cabang menang teramati); SVC cancel #26–34 | PASS |

## 4. Hasil uji (run final 2026-10-10)
| Suite | Hasil |
|---|---|
| check-comm-e2e (HTTP, `next dev` + perangkap egress) | 108/108 |
| check-comm-e2e mode `produksi` (`next start` lokal) | 5/5 |
| check-comm-ui (Playwright) | 55/55 (12 tangkapan layar) |
| check-comm-api | 43/43 |
| comm-policy / comm-schema | 326/326 · 85/85 |
| comm-prepare / approval / send / cancel / read (DB) | 98 · 95 · 120 (rentang 118–121, cek 52b dinamis) · 73 · 42 — 0 gagal |
| tah-policy / tah-ledger / validator-v3 | 322 · 98 · 226 — 0 gagal |
| eval8-runner / eval4-prep / ais-contract / automation-policy / intake-policy | 62 · 109 · 129 · 124 · 417 — 0 gagal |
| tsc, eslint (berkas Step 2J), `next lint` | bersih (peringatan lama `ReceiptForm.tsx`) |
| check-validator-remediasi | **61/70 — kegagalan historis** (identik di `f97c94e`; skrip pra-V3; tidak diubah; isu terpisah) |

**Uji mutasi (membuktikan uji E2E menangkap regresi; berkas dipulihkan sesudahnya):**
- M1 — tanda baca template ID diubah (`Hormat kami,` → `Hormat kami`): 12 cek gagal, posisi byte ditunjukkan.
- M2 — penyedia FAKE disisipi `fetch('https://graph.facebook.com/…')`: perangkap memblokir 23 upaya,
  3 cek egress gagal.

## 5. Bukti tidak ada WhatsApp nyata
1. **Perangkap egress di proses server** (`TRAP-AKTIF` di setiap proses Node `next dev`/`next start`): koneksi non-loopback
   diblokir sebelum terhubung. Self-test: `graph.facebook.com`, `api.whatsapp.com`, `wa.me` (DNS), IP publik → diblokir;
   loopback diizinkan.
2. **Log server run final:** 0 upaya ke host WhatsApp/Meta; satu-satunya host yang diblokir `fonts.googleapis.com`
   (font `next/font`, lihat catatan ¹); 0 pengenal penerima utuh di log.
3. **Data:** semua attempt di run E2E — provider `FAKE`, `simulation=true`, `externalDelivery=false`, receipt `fake_…`.
4. **Respons API** (270 respons di run E2E): tanpa URL/host provider WhatsApp; pengenal utuh hanya pada `?recipient=full`.
5. **Mutasi M2** membuktikan pemanggilan ke Graph API akan terdeteksi dan diblokir.
6. **Varian produksi lokal:** WA-1 tertutup (`ENV_NOT_ALLOWED`), 0 baris komunikasi tercipta.

## 6. Risiko & catatan terbuka
- **SG-05 OPEN** (fixture penerima tak terikat tenant) — wajib ditutup sebelum WA-3.
- **Setuju-sendiri** `WA_INTERNAL_FAKE_TEST` sesuai AC-14 — wajib ditinjau sebelum WA-2.
- Tanpa rate limit POST; sanitasi log galat belum ada; pagination/allowlist field `AuditLog` belum ada.
- CSRF bergantung pada `NEXTAUTH_URL` = origin publik (tanpa token eksplisit).
- Uji dijalankan di kontainer pengembangan terhadap `next dev`/`next start` lokal; tidak ada CI independen.
- `next dev` mencoba mengunduh Google Fonts (perilaku aplikasi lama, bukan WA-1).
- `check-validator-remediasi.mjs` 9 kegagalan historis — isu terpisah.
- Banner "trial berakhir" pada tenant sintetis = modul billing, tidak memengaruhi WA-1.

## 7. Status gate keluar WA-1 (PRD §18)
| Syarat | Status |
|---|---|
| Semua AC P0 lulus | **Terpenuhi secara teknis** — AC-01..18 PASS (AC-13/15 di tingkat service karena tak terjangkau lewat API) |
| Bukti uji | **Tersedia** — laporan ini + keluaran uji + tangkapan layar |
| Demo internal diterima owner | **BELUM** — menunggu demo & penerimaan owner |
| Checkpoint diperbarui | **BELUM** — PR #16 (checkpoint 2F–2I) belum di-merge; perlu pembaruan lagi untuk 2J |
