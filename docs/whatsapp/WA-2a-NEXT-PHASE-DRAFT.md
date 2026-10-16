# WA-2a — Rancangan fase berikutnya setelah F4

**Status: DRAFT UNTUK REVIEW OWNER — bukan baseline yang disahkan, bukan izin implementasi.**

Tanggal: 16 Oktober 2026 (WITA).
Basis fitur: main setelah [PR #27](https://github.com/marlon870saragih-cloud/maritim-suite/pull/27), merge `5e58237c393a6115d3c55a5c1382dd3c5826a976`; HEAD F4 yang ditinjau `d665216acf85803092771a2b01bced5131cbe927`.
Handoff: [TAH-CURRENT-CHECKPOINT.md](../TAH-CURRENT-CHECKPOINT.md).
Bukti fondasi: [F3](WA-2a-F3-EVIDENCE.md), [F4](WA-2a-F4-EVIDENCE.md).

## 1. Keputusan yang diminta

Rekomendasi: fase berikutnya **2a-G — API/UI lokal untuk alur pesan klien sampai APPROVED**, menggunakan service F3/F4 yang sudah merged.

Owner perlu memutuskan:
1. Apakah 2a-G menjadi fase implementasi berikutnya.
2. Apakah scope awal memakai kontak, consent, grant, dan konfirmasi yang sudah tersedia dari setup lokal; pengelolaan lengkap data tersebut lewat UI diusulkan sebagai scope terpisah.
3. Matriks akses, kebutuhan read service, kontrak API, navigasi UI, dan daftar path persis melalui preflight.
4. Acceptance criteria dan urutan pengerjaan di bawah.
5. Pemetaan arah AI drafting dan auto-reply ke fase terpisah. Tidak termasuk 2a-G yang diusulkan.

**Keputusan merge F4 dan dua pengecualian scope sudah selesai.** Keputusan itu tidak sekaligus menyetujui dokumen ini atau implementasi 2a-G.

## 2. Fondasi yang sudah tersedia

| Bagian | Keadaan |
|---|---|
| F1 / #23 | Kebijakan status pesan, definisi beku CLIENT_WA_UPDATE, TTL 2 jam |
| F2 / #24 | Template deterministik ID/EN |
| F3 / #25 | Draft, preview, konfirmasi jadwal, freshness D6 |
| #26 | Gate berkas beku dibandingkan dengan basis main |
| F4 / #27 | Request, approve, reject, cancel; revalidasi saat keputusan, maker-checker, penghentian approval tertaut |
| Koreksi P2 | Tolak memeriksa TTL serta memakai timestamp sesudah kunci approval |
| Batas sistem | Non-produksi, flag default OFF, belum Send/API/UI WA-2 atau LLM |

Keadaan APPROVED berarti keputusan staf sudah tercatat; tidak berarti pesan terkirim atau selalu tetap valid. Sumber, akses, consent atau bukti dapat berubah setelah keputusan.

## 3. Tujuan dan alur usulan 2a-G

Staf yang berwenang dapat menyiapkan, memeriksa, meminta persetujuan dan memutuskan pesan klien melalui layar lokal, dengan fakta berasal dari snapshot service.

Alur:
1. Pilih kandidat/sumber operasional dan kontak yang layak.
2. Buat draft melalui service F3; tampilkan alasan jika prasyarat belum terpenuhi.
3. Preview isi ID/EN yang tersedia sesuai snapshot, penerima tersamar, sumber dan bukti freshness.
4. Minta approval dengan fingerprint snapshot yang benar-benar ditampilkan.
5. Checker yang memenuhi kebijakan meninjau dan menyetujui atau menolak; alasan penolakan wajib.
6. Staf dapat membatalkan bila status mengizinkan; revisi baru mengikuti aturan F3/F4.
7. Tampilkan status akhir, alasan bisnis, waktu keputusan dan riwayat yang diizinkan.

Label UI wajib menjelaskan bahwa alur ini belum mengirim WhatsApp. Jangan tampilkan tombol Send, retry pengiriman, atau status delivered.

## 4. Scope usulan dan batas

**Masuk scope, jika disetujui:**
- Read service terbatas untuk daftar/detail/riwayat pesan yang dibutuhkan UI, bila fondasi yang tersedia belum mencukupi.
- API tipis yang memanggil service F3/F4; kebijakan bisnis tidak diduplikasi di route.
- UI daftar dan detail pesan, draft/preview/request/approve/reject/cancel serta alur revisi sesuai state machine.
- Isolasi tenant, kontrol peran, pembatasan field respons, penyamaran penerima, pagination dan penanganan konflik.
- Pengujian API, E2E, UI dan build lokal.

**Di luar scope:**
- Send, provider, webhook masuk, delivery receipt, retry pengiriman, WA LIVE.
- LLM, AI draft bebas, auto-reply, evaluasi model berbayar.
- Deploy, migrasi produksi, aktivasi flag pada lingkungan operasional.
- Perubahan schema/migrasi, definisi approval beku, aturan freshness atau maker-checker.
- Refaktor WA-1/TAH/V3 dan perbaikan validator-remediasi.
- Pengelolaan lengkap kontak/consent/grant/konfirmasi dari UI, kecuali owner menambahkannya secara eksplisit.

Jika kebutuhan UI memerlukan perubahan di luar batas tersebut, siapkan usulan perubahan scope sebelum mengimplementasikannya.

## 5. Kontrak yang harus dibekukan saat preflight

| Area | Usulan kontrak |
|---|---|
| Lingkungan | Gerbang WA-2 tetap menolak produksi; flag dan allowlist tetap berlaku; pengujian hanya lokal terisolasi |
| Identitas | Tenant dan user dari sesi server; jangan menerima tenant/peran/pemutus dari input klien |
| Peran | Awali dengan ADMIN/MANAJER_OPERASI sesuai service saat ini; perluasan role memerlukan keputusan owner |
| Maker-checker | UI menjelaskan larangan, tetapi service tetap penegak: checker bukan pembuat draft, peminta, atau pencatat bukti |
| Snapshot | Preview menampilkan snapshot tersimpan; permintaan memakai snapshotFingerprint, keputusan memakai proposalHash yang dilihat pengguna |
| API | Tetapkan endpoint/metode/payload/hasil bisnis vs galat transport; ID lintas tenant gagal tertutup; jangan bocorkan keberadaan resource tenant lain |
| Read/riwayat | Query ber-tenant, field allowlist, urutan stabil dan pagination; nomor tersamar secara default; akses nomor utuh tidak diasumsikan |
| Mutasi | Validasi input, sesi, proteksi CSRF/origin dan content-type sebelum mutasi; pola WA-1 boleh dijadikan rujukan setelah ditinjau, bukan bypass gerbang WA-2 |
| Konflik dan timeout | Status terbaru dimuat ulang; jangan mengklaim aksi berhasil tanpa hasil service; retry harus memakai state/fingerprint yang sesuai |
| Status terminal | EXPIRED/REJECTED/BLOCKED/CANCELED tidak dihidupkan kembali; pemulihan lewat revisi sesuai kebijakan |
| Fakta dan bahasa | Isi/template/fakta tidak boleh direkonstruksi atau diedit bebas di browser; perubahan bahasa mengikuti kontrak snapshot yang disetujui |
| Audit | Baca hanya field yang diizinkan; audit mutasi tetap dilakukan service secara atomik |

Nama endpoint dan lokasi navigasi sengaja belum ditetapkan sebagai keputusan owner. Preflight harus memeriksa pola repo aktual, mengusulkan kontrak konkret, dan menyertakan daftar **path persis** untuk kode, tes dan bukti. Jangan memakai wildcard sebagai persetujuan scope. Perubahan gate berkas beku harus dijelaskan per asersi.

## 6. Acceptance criteria usulan

| ID | Kriteria | Bukti yang diperlukan |
|---|---|---|
| G-01 | Flag OFF, tenant di luar allowlist, konteks sistem, dan mode produksi ditolak | Uji API negatif; tidak ada mutasi atau egress |
| G-02 | Sesi/peran/tenant ditegakkan untuk seluruh read dan mutasi | Matriks akses; ID lintas tenant tidak dapat dibaca/diubah |
| G-03 | Preview sesuai snapshot yang tersimpan | Perbandingan isi ID/EN, sumber, penerima tersamar dan fingerprint |
| G-04 | Request/approve/reject/cancel mengikuti state machine F3/F4 | E2E alur berhasil dan penolakan bisnis, termasuk alasan wajib |
| G-05 | Maker-checker ditegakkan server | Uji pembuat draft, peminta dan pencatat bukti; larangan tidak hanya tombol UI |
| G-06 | Perubahan sumber/consent/grant/bukti serta expiry ditangani | UI menampilkan NEEDS_REVIEW/BLOCKED/EXPIRED dan kode alasan secara tepat; regresi waktu keputusan F4 tetap lulus |
| G-07 | Aksi berulang, balapan keputusan, pembatalan dan revisi tidak menimpa hasil final | Uji konkurensi/idempotensi yang relevan; muat ulang status setelah konflik |
| G-08 | Read/riwayat aman dan terbatas | Field allowlist, pagination, isolasi tenant, penyamaran nomor |
| G-09 | Tidak ada jalur kirim atau panggilan provider/LLM | Jebakan egress pada proses pengujian terkait, pemindaian scope, tidak ada successKey/eksekusi pengiriman |
| G-10 | UI dapat dipakai tanpa ambiguitas status | Playwright: loading/empty/error, double-click, expired, konflik, label belum dikirim; keyboard/fokus pada aksi utama |
| G-11 | Regresi dan build sesuai scope | API/E2E/UI, F1–F4 dan suite terdampak, tsc/lint, next build lokal dengan konfigurasi uji sah |
| G-12 | Handoff dapat diaudit | HEAD dan path final, lingkungan, hasil aktual/historis dipisah, keterbatasan, demo owner dan keputusan penerimaan |

Suite yang tidak dijalankan harus disebutkan bersama alasannya. Tidak ada klaim CI hijau jika tidak ada CI. Jangan memasukkan credential atau data klien ke laporan publik.

## 7. Urutan pengerjaan setelah persetujuan

1. Preflight read-only: kebutuhan read service, kontrak endpoint/response, role matrix, navigasi, path persis dan gate beku.
2. Owner menyetujui kontrak dan scope implementasi.
3. Implementasi read/API dengan uji akses dan state; review sebelum melanjutkan UI bila ada perubahan kontrak.
4. Implementasi UI dan pengujian E2E/Playwright; alur berhenti di APPROVED.
5. Gate akhir dan demo lokal dengan data sintetis; laporan bukti dikaitkan ke HEAD yang diuji.
6. Keputusan owner atas merge, penerimaan fase, checkpoint dan langkah berikutnya. Merge tidak berarti deploy atau izin Send.

## 8. Fase lain dan arah produk

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
