# TAH Gap Analysis — 30 September 2026

Audit READ-ONLY terhadap kebutuhan operasional PT Tribuana Solusi Maritim.

**SHA kode yang diaudit:** `0b5c1c5e4898926d19751086067f09fed47c6c77` (`main` GitHub saat verifikasi).
**Waktu pemeriksaan akhir lokal:** 30 September 2026, sekitar 18.11 WITA.
**Status:** audit dan usulan urutan PRD selesai; implementasi belum dijalankan.

Dokumen ini menyimpan hasil audit yang sebelumnya disampaikan dalam percakapan “Analisis gap operasional TAH”. Penyimpanan dokumentasi di GitHub dan folder laptop diotorisasi owner setelah audit. Otorisasi tersebut tidak mencakup implementasi, deploy, aktivasi fitur, atau perubahan infrastruktur.

## 1. Verified baseline

TAH memiliki fondasi operasional yang cukup besar, tetapi belum membentuk alur lengkap dari dokumen masuk sampai WhatsApp terkirim dan tercatat.

| Objek | Hasil verifikasi |
|---|---|
| Repository | `marlon870saragih-cloud/maritim-suite` |
| GitHub main | `0b5c1c5e4898926d19751086067f09fed47c6c77` |
| Integrasi branch | PR #1 sudah merged pada 30 September 2026, 04.15.17 UTC / 12.15.17 WITA. |
| Branch fitur GitHub | `feat/prd002-step2-domain-foundation` pada `7127d991f8487bfc9f096d22182f4c1c578a9e87`. |
| Checkout laptop | Folder `D:\rapikan\04 DEVELOPMENT DAN AI\CLAUDE CODE\aplikasi maritim\maritime-suite`; branch fitur yang sama, HEAD `28b0ef92b4c0d4afe71312fc99b33d7b72a90565`. |
| Selisih kode | GitHub main berada 43 commit lebih maju dari checkout laptop, dengan 111 file berubah. |
| Working tree laptop | File tracked tidak berubah, tidak ada perubahan staged. Keseluruhan working tree belum clean karena enam file untracked. |
| Enam file untracked | `_chk.mjs`, `_dedupe.mjs`, `_logo.mjs`, `_q.mjs`, `_wipe.mjs`, `prisma/_demo-tenant.mjs`. Tidak dijalankan, diubah, dihapus, atau di-stage dalam audit. |
| Ref main lokal | Masih `958c15a7c1688cf9d83c6dc23ad236c5de71a267`; bukan main GitHub terkini. |
| Worktree Claude tambahan | `.claude/worktrees/affectionate-torvalds-466131`, detached pada `958c15a7c1688cf9d83c6dc23ad236c5de71a267`, working tree bersih tetapi lebih lama. |

`git status` lokal melaporkan behind 6 terhadap cached upstream. Itu bukan ukuran selisih remote terkini: pemeriksaan remote langsung membuktikan SHA GitHub di atas. Audit tidak melakukan fetch/pull atau mengganti checkout.

### Metode dan batas verifikasi

- Branch/HEAD GitHub dibaca langsung; metadata merge PR #1 dikonfirmasi melalui API GitHub.
- Source lokal dibaca dan dibandingkan dengan daftar perubahan GitHub pada SHA main. Source yang berubah dibaca pada SHA main tersebut. Domain, finance, schema, TAH Core services, AIS, dan monitoring yang diperiksa tidak berubah antara HEAD laptop dan SHA audit.
- Kebutuhan operasional berasal dari percakapan “Jadikan Baseline Kerja” dan instruksi audit owner. Lampiran operasional historis tidak dianalisis ulang dalam audit ini; klaim pembacaan lampiran dari percakapan lama bukan verifikasi ulang dokumen asli.
- Build, test, panggilan model, job, migration, dan aplikasi tidak dijalankan. Hasil pengujian yang disebut di bawah merupakan bukti terdokumentasi dari checkpoint, bukan pengujian ulang audit ini.
- VM, database, GCP, nginx, firewall, PM2, dan timer produksi tidak diperiksa langsung atau diubah dalam audit ini.
- Commit penyimpanan dokumentasi sesudah audit akan memiliki SHA berbeda. Jangan mengganti “SHA kode yang diaudit” dengan SHA dokumen dan menganggap kode telah diaudit ulang.

### PRD-005: CLOSED

- Validator V3 FINAL FREEZE: `ac6460c193b1b301b47375a322bc5559c2f46cce`.
- Kandidat: `prd005-intake-text/kandidat-validator-v3-2`.
- Fingerprint kandidat: `775b899b396ab8165ad98d140b5a9cd8c6062157e9ec2921551fde4b2b3b956c`.
- Blind-B: **64/80 = 80% pada pengujian offline dengan jawaban sempurna**, di bawah target 90%. Ini bukan ukuran akurasi model live.
- Safety gates toleransi-nol tercatat PASS. Validator gagal tertutup tetapi konservatif.
- Sonnet 5 tetap `PENDING_SPIKE` pada SHA kode audit.
- Tidak membuka kembali V3, LIVE evaluation, Blind-C/Eval-9, atau promosi model. Future Design Items dibawa sebagai keterbatasan, bukan alasan mengulang PRD-005.

### Produksi: bukti historis terdokumentasi, bukan verifikasi live baru

Catatan `docs/PRODUCTION-STATE-2026-09-30.md` menyatakan:

| Area | Keadaan yang tercatat dalam audit VM sebelumnya |
|---|---|
| Rilis | `ac922f6b530a1dcadde5f2d7aed04734c0576431`; rilis arsip, bukan Git checkout. |
| Database | 21 migrasi applied, 0 gagal/menggantung; tujuh migrasi PRD-002..005 sudah diterapkan. |
| Monitoring | Aktif, tetapi `MonitoredVoyage` 0 dan `MonitoringSignal` 0. |
| Reminders | Aktif; keputusan owner tetap enabled. |
| Intake / TAH Core | Mati; `AgentRun` dan `AgentModelCall` 0. |
| AIS polling | Belum terpasang. |
| Validator V3 | Belum ada di produksi. |
| Model | Global Sonnet 4.5; entri Sonnet 5 pada rilis lama tercatat VERIFIED tetapi dorman, bukan jalur aktif. |
| Retensi lampiran | Kode tersedia tetapi purge belum dijadwalkan menurut catatan tersebut. |
| Tenant uji/duplikat | HOLD; tidak diubah. |

**Merge GitHub tidak membuktikan deploy atau aktivasi produksi.** Semua keadaan runtime di atas perlu pemeriksaan read-only baru sebelum dipakai sebagai kondisi live sesi mendatang.

## 2. Sudah ada

| Area | Implementasi yang tersedia |
|---|---|
| Intake | Input manual teks/PDF/gambar/Excel/CSV; ekstraksi, validasi, matching master, review manusia, pemeriksaan duplikasi, approval, retry, dan pengaman satu intake tidak membuat dua voyage. |
| Vessel/Voyage/Vessel Call | Master kapal, identitas MMSI dan verifikasi sumbernya, Voyage, PortCall, cargo, tug–barge/multi-kapal, task/checklist dan timeline. |
| Dokumen | Berbagai extractor dan generator dokumen, lampiran, hash, penanda sensitif, expiry dan pembagian lampiran ke portal. EPDA/FDA memiliki revisi dan hubungan antarversi. |
| EPDA/FDA | Kalkulasi, snapshot tarif/kurs/pajak, approval, revisi, FDA dari EPDA, serta perbandingan estimated–actual per baris. |
| PR dan vendor | PR→PO, WO, approval, penerimaan, vendor invoice submission dan pengambilan tagihan ke FDA dengan pengaman penggunaan ulang submission. |
| TAH Core/audit | AgentRun, AgentModelCall, ledger ekstraksi Intake, identitas model/prompt, AuditLog dan kebijakan kelas risiko. |
| Monitoring | Monitoring voyage, sinyal perubahan ETA/status/event, data basi/error, review sinyal dan notifikasi internal. |
| Komunikasi | Draft email EPDA/FDA/invoice/vendor RFQ serta pencatatan komunikasi manual. Belum pengiriman otomatis. |

Fondasi tersebut perlu diteruskan. Tidak perlu membangun ulang EPDA, PR/PO, vendor invoice atau variance yang sudah tersedia.

## 3. Gap terhadap kebutuhan PT TSM

| Area | Gap |
|---|---|
| Intake pembaruan operasional | Revisi ETA/ETB/ETD untuk voyage berjalan belum mempunyai alur khusus. Dokumen update dapat ditolak sebagai UNSUPPORTED_REQUEST; jadwal diperbarui manual. TD-005-03 masih OPEN. |
| Kesatuan Vessel Call | Voyage/PortCall sudah ada; perlu kontrak identitas yang mengikat appointment, dokumen, biaya, kegiatan dan closing ke pekerjaan yang sama. Perubahan status Voyage belum mensyaratkan kelengkapan closing. |
| Document intelligence/versioning | Belum pengelolaan menyeluruh hubungan draft→revisi→signed→bukti pelaksanaan, provenance per field dan deduplikasi transaksi lintas scan/PDF/Excel. Hash lampiran hanya memperingatkan file identik, bukan memastikan satu transaksi dihitung sekali. |
| Vessel master/Q88 | Identitas dan beberapa particulars tersedia; belum pembuktian lengkap sumber/tanggal per field serta pengelolaan seluruh informasi Q88 sebagai master berversi. Data lama tidak boleh dianggap selalu berlaku. |
| Internal cost/PR | PR adalah permintaan, bukan bukti actual. Belum ditemukan pencatatan realisasi dan pertanggungjawaban biaya internal yang terhubung lengkap ke actual cost/profit voyage. |
| Vendor cost | Komponen tersedia, tetapi quotation→PO/WO→delivery→invoice→payment belum menjadi satu sumber biaya terpadu. |
| PNBP actual resmi | Belum ditemukan alur khusus Inaportnet/Phinisi atau billing resmi→verifikasi→actual→bukti pembayaran. Receipt generik belum menjamin sumber resmi. Item sesuai nota tetap pending actual sampai buktinya diterima. |
| Planned vs actual profit/margin | Variance EPDA–FDA tersedia, tetapi layar laba membaca MaritimeDocument legacy, bukan keseluruhan Disbursement/Invoice v2. Belum profit terpadu dari pendapatan, biaya internal, vendor dan PNBP. |
| Approval gates | TahApprovalRequest masih skema/kebijakan, belum service/API/UI dan executor bisnis. Registry hanya INTAKE serta TAH_DEV_NOOP nonproduksi. Finance lama satu level dan self-approval diizinkan; perlu diselaraskan dengan kebijakan tindakan finansial/eksternal TAH. |
| Audit trail | Ada tetapi belum menyeluruh. Hapus VoyageEvent hanya menandai deletedAt tanpa pencatat penghapusan/alasan lengkap. Penyelesaian ledger bersifat best-effort dan perlu rekonsiliasi kegagalan. Jangan menyebut seluruh audit immutable atau lengkap. |
| AIS | Kerangka polling, normalisasi, dedupe, quota/backoff dan health sudah ada; adapter hanya NONE/FAKE. Belum sumber AIS live. |
| BMKG | Belum integrasi cuaca. PORT_WEATHER baru fondasi skema, tanpa ingest/service cuaca dan pemetaan area voyage. |
| Event engine | Sinyal internal tersedia; belum alur lintas dokumen/posisi/cuaca/kegiatan yang menghasilkan event tervalidasi lalu usulan tindakan. |
| Client Communication/WA | Belum laporan pagi/sore berbasis sumber, approval versi pesan, penerima per client/voyage, WA sender, antrean pengiriman, delivery webhook, retry dan bukti pengiriman. Status sent manual bukan delivery receipt. |

## 4. Risiko dan dependency

1. **Kesinambungan baseline.** Checkout laptop tertinggal. CHECKPOINT-LANJUTAN.md historis masih memuat “belum merged” walaupun PR #1 sudah merged. SHA kode audit, posisi checkout, SHA dokumentasi dan rilis produksi harus dipisahkan.
2. **Kontrol sebelum automation.** TD-005-01 kuota AI Intake, TD-005-02 self-approval Intake yang terlihat portal, dan TD-005-03 update voyage tetap OPEN. Penyelesaian PRD-005 tidak menutup ketiganya.
3. **Perbedaan kebijakan approval.** TAH melarang self-approval secara bawaan untuk risiko finansial/eksternal, sedangkan finance lama mempunyai kebijakan interim berbeda. Tetapkan matriks approver, ambang nilai dan perlakuan owner secara eksplisit sebelum executor finance/komunikasi.
4. **Integrasi AISStream.** Source Map memakai jalur WebSocket, sedangkan kontrak source saat ini hanya menerima POLL. Diperlukan adapter/bridge atau perubahan kontrak yang didesain; bukan sekadar memasukkan API key.
5. **Batas monitoring.** Pembacaan mengambil 500 record sumber paling awal dan sampai 200 monitored voyage tertua tanpa rotasi menyeluruh; AIS memilih sampai 50 kapal berdasarkan urutan ID. Pada volume tertentu data lebih baru dapat terlewat. Perkuat sebelum hasilnya menjadi pemicu WA.
6. **Sumber biaya resmi.** Jalur awal boleh berbasis upload billing/nota resmi dan verifikasi manusia. Jangan menggantungkan pekerjaan pada asumsi bahwa API Inaportnet/Phinisi sudah tersedia untuk PT TSM; jangan mengarang tarif PNBP tetap.
7. **Dokumen finansial dan privasi.** Internal cost/profit tidak masuk EPDA atau komunikasi client. Bukti asli sensitif disimpan privat; fixture development disanitasi. Kredensial tidak masuk dokumen audit, repo publik, atau prompt.
8. **Keputusan owner.** Definisi margin, matriks approval, format FPDA, penerima laporan dan perilaku saat data posisi/cuaca kosong perlu ditetapkan. Format FPDA PT TSM belum dianggap approved hanya karena generator tersedia.
9. **Akses live.** Data Pack historis yang sudah disepakati cukup untuk desain. Akses provider AIS/BMKG/WA, nomor/akun WA, mapping penerima dan kebijakan pengiriman tetap dependency tersendiri. Audit tidak mengaktifkan integrasi tersebut.
10. **Batas PRD-005.** Jangan membuka ulang V3 atau siklus evaluasi. Gunakan keterbatasan yang sudah dicatat dan review manusia. Perubahan spesifikasi di masa depan adalah keputusan terpisah.

## 5. Urutan PRD dari checkpoint sampai WhatsApp automation

Nama berikut merupakan usulan urutan, bukan penomoran PRD baru yang sudah disepakati. Penyimpanan dokumen ini tidak otomatis menyetujui implementasinya.

| Urutan | Paket pekerjaan | Kriteria selesai |
|---|---|---|
| 0 | Rekonsiliasi baseline dan kesinambungan kerja | Checkpoint sesuai GitHub; posisi checkout/WIP jelas; rilis produksi terpisah; keputusan, bukti pemeriksaan dan next exact step tercatat. PRD-005 tetap CLOSED. |
| 1 | TAH Approval, audit dan kontrol biaya AI | Approval atas versi usulan tertentu; keputusan dipisahkan dari eksekusi; kebijakan self-approval jelas; audit dan kuota dapat direkonsiliasi. |
| 2 | Vessel Call + Document Intelligence | Satu identitas pekerjaan, hubungan sumber/versi dokumen, deduplikasi transaksi dan pembaruan operasional melalui review manusia. |
| 3 | EPDA + internal PR + vendor + PNBP actual | Memperluas engine yang ada; estimated/committed/actual dipisahkan; setiap actual memiliki sumber; billing resmi dapat masuk lewat dokumen tanpa menunggu API resmi. |
| 4 | Profit/margin v2 + closing/FPDA | Planned vs actual revenue/cost/profit konsisten; revisi tidak dihitung ganda; informasi internal tidak bocor ke client; format FPDA disetujui. |
| 5 | Operational Event Engine | Event memiliki sumber, waktu, tingkat validasi, deduplikasi dan aturan tindakan; perubahan manual/dokumen dapat diproses lebih dahulu. |
| 6 | AIS live + BMKG | Adapter nyata, pemetaan kapal/area voyage, freshness, batas pemakaian dan perilaku ketika sumber terganggu; event engine menerima observasi tervalidasi. |
| 7 | Client Communication Agent | Draft pagi/sore dan berbasis event; angka/posisi/cuaca dapat ditelusuri; approval melekat pada isi dan penerima tertentu. |
| 8 | WhatsApp automation + pilot terbatas | Pengiriman, delivery status, retry tanpa duplikasi, penanganan kegagalan dan audit ujung-ke-ujung terbukti pada pilot. |

**Estimasi awal:** sekitar **8–13 minggu kerja**, satu engineer fokus, review rutin dan keputusan owner tersedia. Ini estimasi perencanaan berketidakpastian tinggi, bukan komitmen waktu atau hasil pengujian. Waktu tunggu akses provider/persetujuan dapat menambah durasi. Estimasi perlu dipersempit saat scope dan acceptance criteria tiap PRD disetujui.

**Next exact step:** baca checkpoint pendamping, verifikasi Git state saat sesi dimulai, kemudian susun desain/acceptance criteria paket 1 berdasarkan gap di atas setelah ada otorisasi pekerjaan berikutnya. Jangan langsung coding, mengulang PRD-005, atau mengaktifkan fitur produksi dari dokumen ini.

## Referensi bukti

Semua tautan source dipatok ke SHA kode yang diaudit, bukan branch bergerak.

- [PR #1 dan merge main](https://github.com/marlon870saragih-cloud/maritim-suite/pull/1)
- [Perbandingan checkout laptop dengan SHA audit](https://github.com/marlon870saragih-cloud/maritim-suite/compare/28b0ef92b4c0d4afe71312fc99b33d7b72a90565...0b5c1c5e4898926d19751086067f09fed47c6c77)
- [Penutupan PRD-005](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/docs/PRD-005-CLOSURE.md)
- [Catatan produksi historis](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/docs/PRODUCTION-STATE-2026-09-30.md)
- [Register technical debt](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/docs/TAH-TECH-DEBT.md)
- [Intake service terkini pada audit](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/intake/intake.service.ts)
- [Voyage dan VoyageVessel](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/prisma/schema.prisma#L704-L828)
- [Status Voyage](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/master/voyage.service.ts#L363-L380)
- [Disbursement dan versioning](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/prisma/schema.prisma#L1065-L1176)
- [Deduplikasi lampiran](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ops/attachment.service.ts#L299-L305)
- [PR/PO](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ops/purchase.service.ts#L284-L356)
- [Tagihan vendor](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ops/vendor-submission.service.ts#L38-L100)
- [Layar laba legacy](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/app/%28app%29/finance/analisa/page.tsx#L15-L61)
- [Laporan v2](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/reports.service.ts#L25-L69)
- [Kebijakan approval finance](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/finance/approval-policy.ts#L51-L69)
- [Registry TAH](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/tah/registry.ts#L18-L42)
- [Ledger agen](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/tah/agent-run.service.ts)
- [Registry AIS](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ais/registry.ts#L7-L12)
- [Kontrak POLL AIS](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ais/ais-policy.ts#L144-L149)
- [Monitoring dan batas pembacaan](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/automation/monitoring.service.ts)
- [VoyageEvent dan penghapusan](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ops/voyage-event.service.ts#L97-L124)
- [EmailLog manual](https://github.com/marlon870saragih-cloud/maritim-suite/blob/0b5c1c5e4898926d19751086067f09fed47c6c77/src/services/ops/email-log.service.ts)

Laporan berhenti sebelum implementasi. Untuk melanjutkan sesi, baca `TAH-CURRENT-CHECKPOINT.md`.
