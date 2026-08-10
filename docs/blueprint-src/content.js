// Isi dokumen Blueprint 2.0 Volume 1.
// Blok: h1 h2 h3 lead p ul ol table note quote pb rule
module.exports = [

// =====================================================================
// KENDALI DOKUMEN
// =====================================================================
{ t: 'h1', x: 'Kendali Dokumen' },
{ t: 'lead', x: 'Halaman ini menjelaskan status, cakupan, dan batas keberlakuan dokumen. Bacalah lebih dulu sebelum mengutip isinya.' },

{ t: 'table', w: [1, 2.4], boldFirst: true, rows: [
  ['Judul', 'Maritime Suite — Blueprint 2.0, Volume 1: Executive Blueprint'],
  ['Pemilik dokumen', 'PT Tribuana Solusi Maritim'],
  ['Alamat', 'Jl. Abdul Azis Samad No. 59B, Samarinda, Kalimantan Timur'],
  ['Versi', '2.0 — Volume 1 dari 3'],
  ['Tanggal', 'Agustus 2026'],
  ['Status', 'Draft untuk ditinjau manajemen'],
  ['Klasifikasi', 'Internal — Rahasia. Tidak untuk disebarkan tanpa izin tertulis.'],
  ['Sumber teknis', 'docs/ROADMAP-v2.md dan docs/FASE-0-SKEMA-v2.md pada repositori Maritime Suite'],
], head: ['Butir', 'Keterangan'] },

{ t: 'h2', x: 'Susunan tiga volume' },
{ t: 'p', x: 'Blueprint 2.0 sengaja dipecah menjadi tiga volume dengan umur pakai yang berbeda. Volume 1 berumur panjang karena berisi arah; Volume 2 dan 3 berubah mengikuti pembangunan.' },
{ t: 'table', head: ['Volume', 'Isi', 'Pembaca', 'Status'], w: [0.8, 2, 1.4, 1], rows: [
  ['Volume 1 — Executive Blueprint', 'Visi, masalah industri, solusi, konsep voyage-centric, modul, arsitektur, posisi pasar, model bisnis, peta jalan', 'Manajemen, calon mitra, calon investor, pelanggan awal', 'Dokumen ini'],
  ['Volume 2 — Product Requirements', 'Spesifikasi rinci tiap modul, aturan bisnis, wireframe, kriteria penerimaan', 'Tim pembangun', 'Menyusul, mengikuti fase'],
  ['Volume 3 — Technical Reference', 'Skema basis data, kontrak API, model keamanan, prosedur penerapan', 'Pengembang, auditor', 'Tumbuh bersama kode di folder docs/'],
]},

{ t: 'note', x: '**Prinsip penulisan.** Dokumen teknis ditulis **saat keputusannya diambil**, bukan dikarang di muka. Bab mana pun yang keputusannya belum diambil ditandai terbuka di Lampiran C, bukan diisi dengan tebakan. Blueprint yang berisi tebakan lebih berbahaya daripada blueprint yang mengakui belum tahu.' },

{ t: 'h2', x: 'Cara membaca tanda dalam dokumen ini' },
{ t: 'table', head: ['Tanda', 'Artinya'], w: [1, 3], boldFirst: true, rows: [
  ['Terbukti', 'Sudah ada di dalam kode atau sudah diuji. Bisa ditunjukkan hari ini.'],
  ['Dirancang', 'Keputusan desain sudah diambil dan tertulis, tetapi belum dibangun.'],
  ['Usulan', 'Belum diputuskan. Menunggu persetujuan manajemen. Angka dan rincian bisa berubah.'],
  ['Terbuka', 'Diketahui belum terjawab. Didaftar di Lampiran C agar tidak hilang.'],
]},

{ t: 'pb' },

// =====================================================================
// BAB 1 — RINGKASAN EKSEKUTIF
// =====================================================================
{ t: 'h1', x: '1. Ringkasan Eksekutif' },
{ t: 'lead', x: 'Satu halaman untuk pembaca yang hanya punya lima menit.' },

{ t: 'h2', x: '1.1 Apa yang sedang dibangun' },
{ t: 'p', x: 'Maritime Suite adalah perangkat lunak operasional untuk perusahaan keagenan kapal (ship agency). Ia menggantikan cara kerja yang hari ini bersandar pada Excel, email, dan WhatsApp — dengan satu sistem tempat seluruh kunjungan kapal, perkiraan biaya, biaya sebenarnya, dokumen, dan penagihan berada dalam satu tempat yang saling terhubung.' },
{ t: 'p', x: 'Produk ini dibangun oleh PT Tribuana Solusi Maritim, perusahaan keagenan yang beroperasi di Samarinda. Artinya sistem ini tidak dirancang dari ruang rapat, melainkan dari pekerjaan sehari-hari yang dijalani sendiri oleh pembuatnya.' },

{ t: 'h2', x: '1.2 Masalah yang diselesaikan' },
{ t: 'p', x: 'Inti pekerjaan keagenan kapal adalah mengurus uang orang lain dengan rapi. Principal menitipkan dana di muka berdasarkan perkiraan biaya (EPDA), agen membelanjakannya di pelabuhan, lalu mempertanggungjawabkannya dalam laporan akhir (FDA). Seluruh kepercayaan bisnis ini bertumpu pada satu hal: **apakah angka bisa ditelusuri**.' },
{ t: 'p', x: 'Dengan Excel, angka tidak bisa ditelusuri. Tarif tersimpan di kepala orang. Revisi menimpa versi lama sehingga riwayat hilang. Dokumen satu kunjungan kapal tercecer di enam tempat. Selisih antara perkiraan dan realisasi tidak pernah dianalisis karena datanya tidak pernah bertemu dalam satu tabel.' },

{ t: 'h2', x: '1.3 Pendekatan: berpusat pada voyage' },
{ t: 'p', x: 'Perubahan mendasar Blueprint 2.0 adalah memindahkan pusat sistem dari **dokumen** ke **voyage**. Satu voyage — satu kunjungan kapal — menjadi map digital yang memuat semuanya: EPDA beserta seluruh revisinya, FDA, faktur, dokumen pelabuhan, kargo, jadwal, dan catatan.' },
{ t: 'p', x: 'Di bawahnya berdiri **Service Catalog**: daftar jasa pelabuhan lengkap dengan tarif dan cara hitungnya (pandu dihitung dari GT kapal, tunda dari jumlah kapal tunda dan jam, dan seterusnya). Dari sinilah semua angka berasal, sehingga sistem dapat menghitung sendiri dan berhenti bergantung pada ketikan manual.' },

{ t: 'h2', x: '1.4 Posisi hari ini' },
{ t: 'table', head: ['Aspek', 'Keadaan per Agustus 2026'], w: [1.1, 2.4], boldFirst: true, rows: [
  ['Aplikasi', 'Berjalan. Autentikasi, multi-perusahaan, ~45 jenis dokumen maritim, mesin cetak PDF, e-Faktur/Coretax, dan penagihan langganan sudah berfungsi.'],
  ['Perkiraan kematangan', 'Sekitar 30–40% dari MVP yang ditargetkan.'],
  ['Fondasi data v2', 'Skema baru sudah ditulis dan tervalidasi: 18 tabel dan 6 tipe enumerasi baru, dari 7 tabel menjadi 25 tabel.'],
  ['Keamanan migrasi', 'Terbukti aditif melalui uji kering: nol operasi hapus, nol perubahan tipe kolom, nol kolom dijadikan wajib. Data lama tetap sah.'],
  ['Kemampuan AI', 'Sepuluh modul ekstraksi dokumen sudah berjalan, memakai model Claude Sonnet melalui OpenRouter.'],
  ['Pelanggan pertama', 'PT Tribuana Solusi Maritim sendiri, dengan lima klien aktif.'],
]},

{ t: 'h2', x: '1.5 Rencana' },
{ t: 'p', x: 'Pembangunan disusun dalam sembilan fase (0 sampai 8). Dua titik yang perlu diingat pembaca:' },
{ t: 'ul', x: [
  '**Akhir Fase 4** — sistem sudah berguna nyata. Siklus penuh dari voyage, EPDA, FDA, hingga faktur dapat dijalankan. Pada titik ini Tribuana berhenti memakai Excel.',
  '**Akhir Fase 8** — sistem siap dijual sebagai layanan langganan kepada perusahaan keagenan lain.',
]},
{ t: 'p', x: 'Fase 0 hingga 4 adalah tulang punggung dan harus dikerjakan berurutan. Fase 5 dan 6 menambah analitik dan kecerdasan. Fase 7 dan 8 adalah bagian terberat dan paling mahal, dan sengaja ditunda sampai produk terbukti dipakai.' },

{ t: 'h2', x: '1.6 Model bisnis' },
{ t: 'p', x: 'Arah komersial berjalan tiga tahap: dipakai sendiri lebih dulu, lalu dibuka untuk beberapa perusahaan keagenan sebagai pengguna awal, kemudian dijual sebagai langganan bulanan (SaaS). Arsitektur multi-perusahaan sudah disiapkan sejak sekarang, sehingga tahap ketiga tidak memerlukan penulisan ulang.' },
{ t: 'p', x: 'Rincian paket dan harga pada Bab 11 berstatus **usulan** dan masih harus disetujui manajemen.' },

{ t: 'h2', x: '1.7 Mengapa peluangnya nyata' },
{ t: 'p', x: 'Perangkat lunak sejenis sudah ada di tingkat global dan dikuasai pemain besar. Namun mereka mahal, berbahasa Inggris, dan tidak mengenal Indonesia: tidak memahami e-Faktur dan Coretax, tidak mengenal tarif dan kebiasaan pelabuhan lokal, serta tidak menargetkan agen berukuran menengah.' },
{ t: 'p', x: 'Celah Maritime Suite bukan menjadi yang pertama di dunia, melainkan menjadi yang pertama benar-benar cocok untuk keagenan kapal Indonesia. Pembahasan lengkap ada di Bab 10.' },

{ t: 'note', color: 'navy', x: '**Yang diminta dari pembaca dokumen ini:** persetujuan atas arah pada Bab 3 (Visi & Misi), Bab 11 (Model Bisnis), dan Bab 12 (Peta Jalan). Ketiga bab itulah yang menentukan apakah pembangunan lanjut, melambat, atau berbelok.' },

{ t: 'pb' },

// =====================================================================
// BAB 2 — PROFIL PERUSAHAAN
// =====================================================================
{ t: 'h1', x: '2. Profil Perusahaan' },
{ t: 'lead', x: 'Siapa yang membangun, di mana, dan mengapa itu penting bagi produknya.' },

{ t: 'h2', x: '2.1 Identitas' },
{ t: 'table', w: [1, 2.4], boldFirst: true, rows: [
  ['Nama', 'PT Tribuana Solusi Maritim'],
  ['Bidang', 'Keagenan kapal dan layanan penunjang maritim'],
  ['Alamat', 'Jl. Abdul Azis Samad No. 59B, Samarinda, Kalimantan Timur'],
  ['Berdiri', 'Januari 2025'],
  ['Wilayah kerja utama', 'Samarinda dan pelabuhan-pelabuhan di Kalimantan Timur'],
], head: ['Butir', 'Keterangan'] },

{ t: 'h2', x: '2.2 Letak yang menentukan' },
{ t: 'p', x: 'Samarinda berdiri di Sungai Mahakam dan menjadi salah satu pintu keluar utama batu bara Kalimantan Timur. Pola lalu lintas kapalnya khas: banyak tongkang dan kapal curah, jadwal yang bergantung pada pasang surut dan cuaca sungai, serta rangkaian perizinan yang melibatkan otoritas pelabuhan, bea cukai, imigrasi, dan karantina.' },
{ t: 'p', x: 'Ciri itu penting bagi produk. Sistem yang dirancang untuk pelabuhan kontainer besar tidak otomatis cocok untuk pola kerja ini. Maritime Suite dibangun dari pola kerja yang benar-benar dijalani di Samarinda, bukan disalin dari pasar lain.' },

{ t: 'h2', x: '2.3 Klien' },
{ t: 'p', x: 'Per Agustus 2026, PT Tribuana Solusi Maritim melayani lima perusahaan berikut.' },
{ t: 'table', head: ['No.', 'Nama Perusahaan'], w: [0.4, 4], rows: [
  ['1', 'PT Tirta Maritim Internasional'],
  ['2', 'PT Utama Ginko Maritim'],
  ['3', 'PT Armada Bahtera Semesta'],
  ['4', 'PT Energi Coal Prima'],
  ['5', 'PT Soechi Lines'],
]},
{ t: 'p', x: 'Daftar ini memiliki dua arti bagi Maritime Suite. Pertama, ia membuktikan perusahaan sudah beroperasi nyata, bukan sekadar gagasan. Kedua, ia menyediakan lima sumber kebutuhan berbeda yang dapat diuji langsung — ukuran perusahaan, jenis kargo, dan tingkat ketelitian pelaporan yang tidak seragam. Perbedaan itulah yang membuat rancangan sistem tidak sempit.' },

{ t: 'h2', x: '2.4 Layanan keagenan yang dijalankan' },
{ t: 'note', x: '**Usulan.** Daftar di bawah disusun dari cakupan modul yang sudah ada di dalam aplikasi. Mohon dikoreksi agar sesuai dengan layanan resmi perusahaan sebelum dokumen ini dipakai ke pihak luar.' },
{ t: 'table', head: ['Layanan', 'Cakupan'], w: [1.2, 2.6], boldFirst: true, rows: [
  ['Keagenan penuh (full agency)', 'Mewakili pemilik atau penyewa kapal sepanjang kunjungan: pengurusan sandar, koordinasi pandu dan tunda, hubungan dengan otoritas pelabuhan.'],
  ['Keagenan pelindung (protective agency)', 'Mewakili kepentingan satu pihak ketika agen utama ditunjuk oleh pihak lain.'],
  ['Pengurusan dokumen pelabuhan', 'Clearance masuk dan keluar, dokumen FAL, manifes kargo, laporan kedatangan dan keberangkatan.'],
  ['Husbandry', 'Pergantian awak, air tawar, penanganan sampah, kebutuhan medis, pengantaran suku cadang, cash to master.'],
  ['Pengelolaan biaya pelabuhan', 'Penyusunan EPDA, penerimaan dan pengelolaan uang muka, pembayaran vendor, penyusunan FDA dan penagihan.'],
]},

{ t: 'h2', x: '2.5 Mengapa perusahaan keagenan membangun perangkat lunaknya sendiri' },
{ t: 'p', x: 'Sebagian besar perangkat lunak maritim dibuat oleh perusahaan teknologi yang mempelajari industri ini dari luar. Maritime Suite lahir dari urutan terbalik: perusahaan keagenan yang setiap hari menyusun EPDA, mengejar tanda terima vendor, dan menjelaskan selisih biaya kepada principal, memutuskan membangun alat kerjanya sendiri.' },
{ t: 'p', x: 'Keunggulannya konkret dan sulit ditiru pesaing:' },
{ t: 'ul', x: [
  '**Kebutuhan tidak perlu ditebak.** Setiap keputusan desain diuji terhadap pekerjaan yang sedang berjalan pada minggu itu juga.',
  '**Pengguna pertama tersedia sejak hari pertama.** Tidak ada jeda panjang antara membangun dan mengetahui apakah sesuatu berguna.',
  '**Kesalahan ketahuan cepat.** Rancangan yang keliru langsung terasa dalam pekerjaan sendiri, bukan muncul sebagai keluhan pelanggan enam bulan kemudian.',
  '**Pengetahuan pelabuhan lokal ikut masuk.** Tarif, kebiasaan, dan urutan perizinan Kalimantan Timur menjadi bagian dari produk, bukan tambahan yang menyusul.',
]},
{ t: 'p', x: 'Risikonya juga jujur harus disebut: perusahaan keagenan bukan perusahaan perangkat lunak. Keterbatasan tenaga pembangun adalah kendala nyata, dan itulah alasan peta jalan disusun bertahap dengan titik guna yang jelas di Fase 4 — supaya sistem sudah memberi manfaat jauh sebelum seluruh visi selesai.' },

{ t: 'pb' },

// =====================================================================
// BAB 3 — VISI & MISI
// =====================================================================
{ t: 'h1', x: '3. Visi dan Misi' },
{ t: 'note', x: '**Usulan.** Rumusan pada bab ini disusun berdasarkan arah produk yang tercermin dari keputusan desain yang sudah diambil. Rumusan ini perlu disahkan manajemen sebelum dipakai dalam dokumen resmi perusahaan.' },

{ t: 'h2', x: '3.1 Visi' },
{ t: 'quote', x: '"Menjadi sistem operasi digital bagi keagenan kapal Indonesia — tempat setiap kunjungan kapal terekam utuh, setiap angka dapat ditelusuri, dan setiap keputusan berdiri di atas data."' },

{ t: 'h2', x: '3.2 Misi' },
{ t: 'ol', x: [
  '**Menghapus pekerjaan berulang.** Mengganti penyusunan EPDA dan FDA secara manual dengan perhitungan yang bersumber pada katalog jasa dan tarif resmi perusahaan.',
  '**Menjadikan angka dapat dipertanggungjawabkan.** Setiap nilai dalam dokumen keuangan harus dapat ditelusuri sampai ke sumber tarif, kurs, dan waktu pembuatannya.',
  '**Menyatukan yang tercerai.** Menjadikan satu voyage sebagai satu tempat, sehingga dokumen tidak lagi tersebar di email, folder, dan percakapan.',
  '**Menjaga pengetahuan tetap di perusahaan.** Memindahkan tarif, prosedur pelabuhan, dan kebiasaan kerja dari ingatan orang ke dalam sistem.',
  '**Membuka jalan bagi keagenan lain.** Membangun dengan arsitektur yang sejak awal siap melayani banyak perusahaan, agar manfaatnya tidak berhenti di satu kantor.',
]},

{ t: 'h2', x: '3.3 Nilai yang dipegang' },
{ t: 'table', head: ['Nilai', 'Wujudnya dalam produk'], w: [1, 3], boldFirst: true, rows: [
  ['Dapat ditelusuri', 'Tidak ada angka tanpa asal-usul. Setiap baris biaya menyimpan tarif, cara hitung, kurs, dan waktu yang dipakai saat dibuat.'],
  ['Jujur pada riwayat', 'Revisi tidak pernah menghapus versi sebelumnya. Dokumen lama tetap utuh sebagaimana ia dikirim dahulu.'],
  ['Sederhana di permukaan', 'Kerumitan ditanggung sistem, bukan dilimpahkan kepada operator. Layar kerja harian harus bisa dipakai staf baru dalam sehari.'],
  ['Berhati-hati dengan uang', 'Sistem tidak pernah mengarang nilai uang. Setiap angka berasal dari tarif tersimpan atau diketik manusia, dan selalu dapat diperbaiki.'],
]},

{ t: 'h2', x: '3.4 Prinsip produk' },
{ t: 'p', x: 'Lima prinsip berikut dipakai sebagai penengah ketika dua pilihan desain sama-sama masuk akal. Prinsip ini sudah dipakai dan memengaruhi bentuk skema data yang berjalan hari ini.' },
{ t: 'ol', x: [
  '**Kebenaran data mendahului kecepatan fitur.** Fondasi yang keliru menular ke seluruh modul di atasnya, dan biaya memperbaikinya berlipat seiring waktu.',
  '**Perubahan bersifat menambah, bukan merusak.** Migrasi tidak boleh membahayakan data yang sudah ada pada sistem yang sedang dipakai.',
  '**Salin, jangan menunjuk, untuk hal yang menyangkut uang.** Dokumen keuangan menyimpan salinan tarif saat dibuat, agar kenaikan tarif hari ini tidak mengubah dokumen tahun lalu.',
  '**Kecerdasan buatan membantu membaca, bukan memutuskan pembayaran.** AI boleh mengekstraksi, meringkas, dan mengusulkan; keputusan nilai uang tetap di tangan manusia.',
  '**Setiap keputusan penting ditulis.** Rancangan yang hanya hidup dalam ingatan akan hilang bersama pergantian orang.',
]},

{ t: 'pb' },

// =====================================================================
// BAB 4 — MASALAH INDUSTRI
// =====================================================================
{ t: 'h1', x: '4. Masalah Industri' },
{ t: 'lead', x: 'Bab ini menjelaskan pekerjaan keagenan kapal apa adanya, lalu menunjukkan di titik mana cara kerja hari ini patah.' },

{ t: 'h2', x: '4.1 Bagaimana keagenan kapal bekerja' },
{ t: 'p', x: 'Bagi pembaca yang tidak berasal dari industri ini, berikut alur satu kunjungan kapal dari awal sampai selesai.' },
{ t: 'table', head: ['Tahap', 'Yang terjadi', 'Keluaran'], w: [0.9, 2.4, 1.1], rows: [
  ['1. Penunjukan', 'Pemilik atau penyewa kapal (principal) menunjuk agen untuk mengurus kunjungan di suatu pelabuhan.', 'Surat penunjukan (nomination)'],
  ['2. Perkiraan biaya', 'Agen menghitung perkiraan seluruh biaya pelabuhan: labuh, tambat, pandu, tunda, jasa pemerintah, dan imbalan keagenan.', 'EPDA — Estimated Port Disbursement Account'],
  ['3. Uang muka', 'Principal mentransfer dana sesuai EPDA sebelum kapal tiba.', 'Bukti transfer, catatan uang muka'],
  ['4. Kunjungan', 'Kapal tiba, berlabuh, sandar, bongkar atau muat, lalu berangkat. Agen mengurus perizinan, vendor, dan kebutuhan kapal.', 'SOF, NOR, dokumen pelabuhan'],
  ['5. Realisasi', 'Seluruh tagihan vendor dan kuitansi dikumpulkan, lalu disusun laporan biaya sebenarnya.', 'FDA — Final Disbursement Account'],
  ['6. Penyelesaian', 'Selisih antara uang muka dan biaya nyata ditagihkan atau dikembalikan.', 'Faktur, nota kredit atau debit'],
]},
{ t: 'p', x: 'Perhatikan bahwa uang principal berpindah tangan pada tahap 3, jauh sebelum jumlah sebenarnya diketahui pada tahap 5. Seluruh hubungan bisnis ini bertumpu pada kepercayaan bahwa agen dapat menjelaskan setiap rupiah yang dibelanjakan. Karena itu kerapian pencatatan bukan urusan administratif — ia adalah modal utama.' },

{ t: 'h2', x: '4.2 Tujuh masalah yang berulang' },
{ t: 'p', x: 'Tujuh masalah berikut bukan daftar teoretis. Semuanya ditemukan dari pemeriksaan cara kerja yang berjalan dan dari pembacaan langsung terhadap struktur data aplikasi versi pertama.' },

{ t: 'h3', x: 'Masalah 1 — Perkiraan biaya disusun ulang dari nol setiap kali' },
{ t: 'p', x: 'EPDA umumnya dibuat dengan menyalin berkas Excel kunjungan sebelumnya, lalu menimpa angkanya satu per satu. Cara ini lambat, dan setiap ketikan adalah peluang salah. Kesalahan pada EPDA berujung pada dua kemungkinan yang sama-sama merugikan: uang muka kurang sehingga agen menalangi, atau uang muka berlebih sehingga principal merasa ditagih terlalu besar.' },

{ t: 'h3', x: 'Masalah 2 — Tarif tidak punya rumah' },
{ t: 'p', x: 'Tarif pandu, tunda, labuh, dan tambat tersimpan di kepala staf senior serta di berkas-berkas lama. Tidak ada satu daftar resmi yang berlaku. Akibatnya dua staf bisa memakai tarif berbeda untuk pelabuhan yang sama, dan ketika staf senior berhalangan, pekerjaan melambat.' },
{ t: 'p', x: 'Pemeriksaan struktur data aplikasi versi pertama menemukan akar teknisnya: kolom jumlah pada baris biaya disimpan sebagai teks bebas, misalnya "8,432 GT" atau "1 call". Nilai seperti itu tidak dapat dihitung mesin. Selama datanya berbentuk demikian, otomatisasi mustahil — bukan karena fiturnya belum dibuat, melainkan karena angkanya bukan angka.' },

{ t: 'h3', x: 'Masalah 3 — Satu kunjungan kapal tidak punya satu tempat' },
{ t: 'p', x: 'Dokumen satu voyage tersebar: EPDA di folder Excel, surat penunjukan di email, foto kuitansi di WhatsApp, SOF dalam bentuk pindaian, faktur di aplikasi akuntansi. Ketika principal bertanya mengenai kunjungan enam bulan lalu, jawabannya harus dirakit dari enam tempat berbeda oleh orang yang kebetulan masih ingat.' },

{ t: 'h3', x: 'Masalah 4 — Revisi menghapus jejak' },
{ t: 'p', x: 'EPDA hampir selalu direvisi: jadwal berubah, kapal tunda bertambah, masa sandar memanjang. Dalam berkas Excel, revisi berarti menimpa. Versi yang sudah dikirim ke principal minggu lalu lenyap. Ketika muncul perbedaan pendapat, tidak ada bukti versi mana yang disepakati.' },

{ t: 'h3', x: 'Masalah 5 — Selisih perkiraan dan realisasi tidak pernah dipelajari' },
{ t: 'p', x: 'Karena EPDA dan FDA hidup di berkas yang terpisah, tidak ada yang membandingkannya baris per baris secara sistematis. Padahal justru di situ letak pengetahuan paling berharga: jasa apa yang selalu diperkirakan terlalu rendah, pelabuhan mana yang biayanya paling sulit diramal, vendor mana yang tagihannya sering melampaui kesepakatan.' },

{ t: 'h3', x: 'Masalah 6 — Penagihan tertunda karena laporan tertunda' },
{ t: 'p', x: 'Faktur baru bisa terbit setelah FDA selesai, dan FDA menunggu tagihan vendor terkumpul. Setiap hari keterlambatan adalah hari uang perusahaan tertahan. Bagi perusahaan keagenan yang lebih dulu menalangi biaya pelabuhan, keterlambatan ini langsung menekan arus kas.' },

{ t: 'h3', x: 'Masalah 7 — Pengetahuan ikut pergi bersama orangnya' },
{ t: 'p', x: 'Urutan perizinan, kebiasaan pelabuhan, nama pejabat yang harus dihubungi, tarif yang berlaku — semuanya tersimpan sebagai pengalaman pribadi. Ketika seorang staf berpindah kerja, sebagian kemampuan perusahaan ikut hilang, dan pemulihannya memakan waktu berbulan-bulan.' },

{ t: 'h2', x: '4.3 Mengapa Excel akhirnya kalah' },
{ t: 'p', x: 'Excel bukan alat yang buruk. Ia justru sangat baik untuk pekerjaan yang dituntutnya: satu orang, satu berkas, satu perhitungan. Excel kalah bukan karena lemah, melainkan karena dipakai untuk hal yang bukan tugasnya.' },
{ t: 'table', head: ['Yang dibutuhkan pekerjaan keagenan', 'Kemampuan Excel'], w: [1.6, 2.4], rows: [
  ['Riwayat versi yang tak bisa dihapus', 'Menimpa berkas; riwayat hanya sebatas nama berkas'],
  ['Satu sumber tarif untuk semua staf', 'Setiap salinan berkas menjadi sumber tarif tersendiri'],
  ['Hubungan antar-dokumen dalam satu voyage', 'Tidak ada; hubungan hanya ada dalam ingatan penyusunnya'],
  ['Perbandingan lintas puluhan kunjungan', 'Harus dirakit manual setiap kali dibutuhkan'],
  ['Jejak siapa mengubah apa dan kapan', 'Tidak tersedia'],
  ['Persetujuan bertingkat sebelum dokumen keluar', 'Digantikan oleh percakapan di luar berkas'],
]},
{ t: 'p', x: 'Selama volume pekerjaan kecil, kekurangan itu tertutup oleh ingatan orang. Ketika jumlah kunjungan bertambah dan staf bertambah, ingatan tidak lagi cukup — dan kekurangannya berubah menjadi risiko.' },

{ t: 'h2', x: '4.4 Biaya yang tidak pernah tercatat' },
{ t: 'p', x: 'Kerugian dari cara kerja lama jarang muncul dalam laporan keuangan karena tidak berbentuk pengeluaran. Ia berbentuk waktu, risiko, dan peluang yang lewat.' },
{ t: 'table', head: ['Bentuk biaya', 'Wujudnya sehari-hari'], w: [1.1, 2.9], boldFirst: true, rows: [
  ['Waktu', 'Jam kerja staf senior habis untuk menyalin angka, bukan untuk mengurus kapal dan hubungan dengan principal.'],
  ['Risiko selisih', 'Salah hitung yang baru ketahuan setelah dana masuk, dan akhirnya ditanggung agen.'],
  ['Risiko reputasi', 'Ketidakmampuan menjelaskan riwayat revisi ketika terjadi perbedaan pendapat dengan principal.'],
  ['Arus kas', 'Penagihan yang tertahan karena laporan belum rampung.'],
  ['Batas pertumbuhan', 'Menambah kapal berarti menambah orang, karena kapasitas melekat pada orang, bukan pada sistem.'],
  ['Pengetahuan hilang', 'Pergantian staf menurunkan kemampuan perusahaan, bukan hanya menambah beban pelatihan.'],
]},
{ t: 'note', color: 'red', x: 'Butir terakhir adalah yang paling menentukan. Selama kapasitas melekat pada orang, pertumbuhan perusahaan dibatasi oleh jumlah orang yang bisa direkrut dan dilatih. Sistem yang benar memindahkan sebagian kapasitas itu ke perangkat lunak — dan di situlah nilai ekonomi Maritime Suite sesungguhnya berada.' },

{ t: 'pb' },

// =====================================================================
// BAB 5 — SOLUSI
// =====================================================================
{ t: 'h1', x: '5. Solusi Maritime Suite' },
{ t: 'lead', x: 'Bagaimana ketujuh masalah tadi dijawab, dan apa yang sengaja tidak dikerjakan.' },

{ t: 'h2', x: '5.1 Gagasan inti' },
{ t: 'p', x: 'Seluruh rancangan Maritime Suite berdiri di atas dua gagasan. Semua modul lain adalah turunan dari keduanya.' },
{ t: 'table', head: ['Gagasan', 'Isinya', 'Masalah yang dijawab'], w: [1, 2.2, 1], rows: [
  ['Voyage sebagai pusat', 'Satu kunjungan kapal menjadi satu wadah yang memuat seluruh dokumen, biaya, jadwal, kargo, dan catatan yang berkaitan dengannya.', 'Masalah 3, 4, 5, 7'],
  ['Katalog jasa yang dapat dihitung', 'Setiap jasa pelabuhan punya definisi, cara hitung, dan tarif yang tersimpan resmi — sehingga sistem bisa menghitung sendiri.', 'Masalah 1, 2, 6'],
]},

{ t: 'h2', x: '5.2 Empat janji produk' },
{ t: 'table', head: ['Janji', 'Cara mencapainya'], w: [1.2, 2.8], boldFirst: true, rows: [
  ['EPDA selesai dalam hitungan menit, bukan jam', 'Pilih kapal dan pelabuhan, sistem menarik daftar jasa yang berlaku beserta tarifnya, lalu menghitung dari GT kapal, jumlah hari, atau tonase kargo. Operator memeriksa dan menyesuaikan, tidak mengetik dari nol.'],
  ['Setiap angka bisa dijelaskan', 'Setiap baris menyimpan tarif, cara hitung, mata uang, dan kurs yang dipakai saat dibuat. Pertanyaan "angka ini dari mana" selalu ada jawabannya di layar.'],
  ['Riwayat tidak bisa hilang', 'Revisi membuat versi baru, bukan menimpa. Versi lama tetap dapat dibuka dan dibandingkan berdampingan.'],
  ['Selisih menjadi pengetahuan', 'Baris FDA menunjuk baris EPDA asalnya, sehingga perbandingan perkiraan dan realisasi tersedia otomatis — per jasa, per pelabuhan, per vendor.'],
]},

{ t: 'h2', x: '5.3 Yang sengaja tidak dikerjakan' },
{ t: 'p', x: 'Bagian ini sama pentingnya dengan daftar fitur. Blueprint yang tidak menyebut batas akan melebar tanpa akhir dan tidak pernah selesai.' },
{ t: 'ul', x: [
  '**Bukan sistem akuntansi umum.** Maritime Suite mengelola biaya kunjungan dan piutang usaha, lalu menyerahkan pembukuan menyeluruh kepada perangkat akuntansi yang sudah dipakai perusahaan.',
  '**Bukan sistem manajemen kapal (ship management).** Perawatan mesin, sertifikasi kapal, dan manajemen awak di atas kapal berada di luar cakupan.',
  '**Bukan sistem chartering.** Negosiasi sewa kapal, laytime, dan demurrage tidak termasuk dalam rencana sampai Fase 8.',
  '**Bukan pengganti WhatsApp.** Percakapan cepat di lapangan tetap terjadi di sana. Sistem hanya memastikan hasil keputusannya tercatat.',
  '**Belum menjadi produk siap jual pada tahap awal.** Sampai Fase 4, produk ditujukan untuk pemakaian internal. Kesiapan komersial dibangun setelah kegunaannya terbukti.',
]},

{ t: 'h2', x: '5.4 Sebelum dan sesudah' },
{ t: 'table', head: ['Kegiatan', 'Cara lama', 'Dengan Maritime Suite'], w: [1, 1.5, 1.5], rows: [
  ['Menyusun EPDA', 'Salin berkas lama, timpa angkanya satu per satu', 'Pilih kapal dan pelabuhan; sistem menarik jasa dan menghitung tarifnya'],
  ['Mencari tarif', 'Bertanya kepada staf senior atau membuka berkas lama', 'Terbaca otomatis dari Service Catalog sesuai pelabuhan dan masa berlaku'],
  ['Merevisi EPDA', 'Menimpa berkas; versi lama hilang', 'Versi baru terbentuk; versi lama tetap utuh dan dapat dibandingkan'],
  ['Menyusun FDA', 'Merakit ulang dari kuitansi dan ingatan', 'Menyalin baris EPDA sebagai kerangka, lalu diisi nilai sebenarnya'],
  ['Menerbitkan faktur', 'Mengetik ulang dari FDA', 'Terbentuk dari FDA, lengkap dengan pajak dan e-Faktur'],
  ['Menjawab pertanyaan principal', 'Merakit jawaban dari beberapa tempat', 'Membuka satu halaman voyage yang memuat semuanya'],
  ['Mengetahui jasa yang sering meleset', 'Tidak pernah diketahui', 'Laporan selisih tersedia otomatis'],
]},

{ t: 'pb' },

// =====================================================================
// BAB 6 — KONSEP VOYAGE-CENTRIC
// =====================================================================
{ t: 'h1', x: '6. Konsep Voyage-Centric' },
{ t: 'lead', x: 'Bab paling penting dalam dokumen ini. Seluruh perbedaan antara versi lama dan Blueprint 2.0 berpangkal di sini.' },

{ t: 'h2', x: '6.1 Perpindahan pusat' },
{ t: 'p', x: 'Aplikasi versi pertama berpusat pada dokumen. Setiap dokumen berdiri sendiri, dengan kaitan yang bersifat pilihan kepada catatan kunjungan. Susunan seperti ini masuk akal ketika tujuannya sekadar mencetak dokumen rapi, tetapi ia menyimpan satu kelemahan mendasar: tidak ada yang menyatukan dokumen-dokumen milik satu kunjungan kapal.' },
{ t: 'table', head: ['Hal', 'Berpusat pada dokumen', 'Berpusat pada voyage'], w: [1, 1.5, 1.5], rows: [
  ['Satuan terkecil', 'Sehelai dokumen', 'Satu kunjungan kapal'],
  ['Hubungan antar-dokumen', 'Lemah dan bersifat pilihan', 'Wajib, melalui voyage sebagai induk'],
  ['Mencari riwayat', 'Menelusuri dokumen satu per satu', 'Membuka satu halaman voyage'],
  ['Membandingkan biaya', 'Hampir mustahil', 'Bawaan sistem — EPDA dan FDA berada dalam voyage yang sama'],
  ['Laporan per pelabuhan', 'Tidak dapat diandalkan karena nama pelabuhan berupa teks bebas', 'Andal karena pelabuhan berupa data induk'],
]},

{ t: 'h2', x: '6.2 Anatomi sebuah voyage' },
{ t: 'p', x: 'Satu voyage memuat identitas kunjungan sekaligus menjadi induk bagi seluruh catatan yang lahir darinya.' },
{ t: 'table', head: ['Bagian', 'Isi'], w: [1.1, 3], boldFirst: true, rows: [
  ['Identitas', 'Nomor voyage yang terbentuk otomatis, kapal, principal (pemberi order), customer (pihak yang ditagih), pelabuhan, jenis keagenan.'],
  ['Jadwal', 'Perkiraan dan realisasi waktu tiba, sandar, selesai, dan berangkat.'],
  ['Kargo', 'Jenis muatan, jumlah, satuan, kegiatan bongkar atau muat, pengirim dan penerima.'],
  ['Port call', 'Rangkaian kejadian di pelabuhan beserta waktunya.'],
  ['Biaya', 'Seluruh EPDA, revisinya, dan FDA yang termasuk kunjungan ini.'],
  ['Penagihan', 'Faktur dan penerimaan pembayaran yang lahir dari FDA.'],
  ['Dokumen', 'Seluruh dokumen maritim yang tertaut, dari surat penunjukan hingga laporan keberangkatan.'],
]},

{ t: 'h2', x: '6.3 Siklus hidup voyage' },
{ t: 'p', x: 'Voyage berjalan melewati sembilan keadaan. Keadaan ini bukan hiasan tampilan; ia menentukan tindakan apa yang boleh dilakukan dan laporan apa yang menghitungnya.' },
{ t: 'table', head: ['Keadaan', 'Artinya'], w: [1, 3], boldFirst: true, rows: [
  ['PLANNED', 'Penunjukan diterima, kunjungan belum dipastikan.'],
  ['CONFIRMED', 'Jadwal disepakati, EPDA umumnya sudah dikirim.'],
  ['ARRIVED', 'Kapal tiba di area pelabuhan.'],
  ['BERTHED', 'Kapal sandar.'],
  ['WORKING', 'Kegiatan bongkar atau muat berlangsung.'],
  ['COMPLETED', 'Kegiatan selesai.'],
  ['DEPARTED', 'Kapal berangkat.'],
  ['CLOSED', 'FDA final, faktur terbit, urusan keuangan selesai.'],
  ['CANCELLED', 'Kunjungan batal.'],
]},

{ t: 'h2', x: '6.4 Service Catalog — sumber semua angka' },
{ t: 'p', x: 'Service Catalog adalah daftar resmi jasa pelabuhan milik perusahaan. Setiap jasa menyimpan tiga hal: apa namanya, termasuk kelompok apa, dan bagaimana cara menghitungnya.' },
{ t: 'p', x: 'Cara hitung disimpan sebagai pilihan tertutup, bukan sebagai rumus bebas yang diketik pengguna. Keputusan ini diambil karena rumus bebas yang dijalankan sistem adalah lubang keamanan yang serius. Pilihan tertutup tetap luwes untuk hampir seluruh kasus nyata, dan sisanya ditangani dengan pengisian manual.' },
{ t: 'table', head: ['Cara hitung', 'Rumus', 'Contoh pemakaian'], w: [1, 1.4, 1.6], rows: [
  ['PER_GT', 'GT kapal × tarif', 'Jasa labuh, jasa pandu'],
  ['PER_GT_PER_CALL', 'GT × tarif × jumlah kunjungan', 'Jasa tambat'],
  ['PER_GT_PER_DAY', 'GT × tarif × jumlah hari', 'Sewa dermaga berdasarkan waktu'],
  ['PER_UNIT', 'Jumlah × tarif', 'Kapal tunda, mobil pandu'],
  ['PER_HOUR', 'Jam × tarif', 'Jasa tunda per jam'],
  ['PER_DAY', 'Hari × tarif', 'Penjagaan, sewa peralatan'],
  ['PER_TON', 'Tonase kargo × tarif', 'Wharfage, jasa bongkar muat'],
  ['PERCENTAGE', 'Persentase dari nilai dasar', 'Imbalan keagenan'],
  ['TIERED', 'Tarif berjenjang menurut GT', 'Sebagian tarif resmi pelabuhan'],
  ['FLAT', 'Nilai tetap', 'Biaya administrasi'],
  ['MANUAL', 'Diketik operator', 'Pengeluaran tak berpola'],
]},
{ t: 'p', x: 'Tarif dipisahkan dari definisi jasa, karena satu jasa yang sama memiliki tarif berbeda di tiap pelabuhan dan berubah dari waktu ke waktu. Karena itu setiap tarif menyimpan pelabuhan yang berlaku, rentang GT bila berjenjang, mata uang, nilai minimum, serta masa berlaku awal dan akhir.' },

{ t: 'h2', x: '6.5 Prinsip salinan — perlindungan paling penting' },
{ t: 'p', x: 'Ketika sebuah baris biaya dibuat, sistem **menyalin** tarif, cara hitung, mata uang, dan kurs ke dalam baris tersebut. Baris itu tidak menunjuk ke tarif yang hidup di katalog.' },
{ t: 'p', x: 'Bila aturan ini tidak diterapkan, kenaikan tarif pandu pada hari ini akan diam-diam mengubah nilai seluruh EPDA tahun lalu. Dokumen yang sudah dikirim dan disepakati principal akan menunjukkan angka berbeda ketika dibuka kembali. Untuk perusahaan yang mengelola dana titipan, hal itu fatal — baik bagi pemeriksaan maupun bagi penyelesaian sengketa.' },
{ t: 'note', color: 'navy', x: '**Nilai jualnya:** dokumen keuangan Maritime Suite dapat dibuka lima tahun kemudian dan tetap menunjukkan angka yang persis sama seperti saat dikirim. Kemampuan ini tidak dapat ditiru oleh sistem yang menyimpan tarif sebagai rujukan hidup, dan tidak mungkin dijamin oleh berkas Excel.' },

{ t: 'h2', x: '6.6 Revisi dan jejaknya' },
{ t: 'p', x: 'Setiap dokumen biaya menyimpan penanda rumpun revisi, nomor versi, penunjuk ke versi penggantinya, serta catatan alasan revisi. Susunan ini memberi tiga kemampuan sekaligus:' },
{ t: 'ul', x: [
  'Seluruh riwayat satu dokumen dapat ditampilkan berurutan dari versi pertama sampai terakhir.',
  'Dua versi dapat dibandingkan berdampingan untuk melihat baris mana yang berubah dan sebesar apa.',
  'Versi mana pun yang pernah dikirim tetap dapat dicetak ulang persis seperti aslinya.',
]},
{ t: 'p', x: 'Kemampuan terakhir itulah yang menjadi alat pembelaan ketika terjadi perbedaan pendapat mengenai nilai yang disepakati.' },

{ t: 'h2', x: '6.7 Satu tabel untuk EPDA, FPDA, dan FDA' },
{ t: 'p', x: 'Perkiraan biaya (EPDA), perkiraan lanjutan (FPDA), dan laporan akhir (FDA) disimpan dalam satu bentuk yang sama, dibedakan oleh penanda jenis. Alasannya praktis: susunannya memang hampir identik, dan penyatuan ini membuat perbandingan antara perkiraan dan realisasi menjadi mudah karena keduanya berada dalam satu tempat dengan bentuk yang sama.' },
{ t: 'p', x: 'Setiap baris FDA dapat menunjuk baris EPDA asalnya. Dari hubungan sederhana itulah seluruh analisis selisih pada Bab 8 menjadi mungkin.' },

{ t: 'pb' },

// =====================================================================
// BAB 7 — GAMBARAN PLATFORM
// =====================================================================
{ t: 'h1', x: '7. Gambaran Platform' },
{ t: 'lead', x: 'Susunan lapisan, siapa yang memakai, dan bagaimana rasanya dalam sehari kerja.' },

{ t: 'h2', x: '7.1 Enam lapisan' },
{ t: 'p', x: 'Platform tersusun berlapis. Lapisan atas selalu bergantung pada lapisan di bawahnya — dan urutan inilah yang menentukan urutan pembangunan pada Bab 12.' },
{ t: 'table', head: ['Lapisan', 'Isi', 'Fase'], w: [1.1, 2.6, 0.6], rows: [
  ['6. Kecerdasan', 'Ekstraksi dokumen, prakiraan biaya, deteksi kejanggalan, asisten kontekstual', '6'],
  ['5. Analitik', 'Dasbor, laporan, pencarian menyeluruh, pusat pemberitahuan', '5'],
  ['4. Keuangan', 'Faktur, penerimaan pembayaran, piutang, nota kredit dan debit, e-Faktur', '4'],
  ['3. Biaya kunjungan', 'EPDA, FPDA, FDA, revisi, persetujuan, analisis selisih', '3–4'],
  ['2. Operasi', 'Voyage, port call, kargo, dokumen maritim', '2'],
  ['1. Data induk', 'Kapal, principal, customer, vendor, pelabuhan, mata uang, kurs, Service Catalog', '1'],
  ['0. Fondasi', 'Autentikasi, pemisahan antar-perusahaan, penomoran otomatis, mesin cetak PDF, audit', '0'],
]},

{ t: 'h2', x: '7.2 Pengguna dan perannya' },
{ t: 'table', head: ['Peran', 'Pekerjaan utama', 'Yang paling dibutuhkan'], w: [1, 1.7, 1.6], rows: [
  ['Staf operasional', 'Membuat voyage, mencatat kejadian pelabuhan, menyiapkan dokumen', 'Layar cepat, sedikit ketikan, isian otomatis'],
  ['Penyusun biaya', 'Menyusun EPDA, mengumpulkan tagihan vendor, menyusun FDA', 'Katalog jasa yang lengkap dan perhitungan otomatis'],
  ['Staf keuangan', 'Menerbitkan faktur, menagih, mencatat penerimaan, mengurus pajak', 'Faktur yang terbentuk dari FDA tanpa ketik ulang'],
  ['Manajer operasi', 'Menyetujui dokumen, memantau kunjungan berjalan', 'Persetujuan bertingkat dan pandangan menyeluruh'],
  ['Direktur', 'Menilai kinerja dan mengambil keputusan', 'Dasbor ringkas dan laporan selisih'],
  ['Principal', 'Menerima EPDA dan FDA, membayar uang muka', 'Dokumen rapi, konsisten, dan dapat dipertanggungjawabkan'],
]},
{ t: 'p', x: 'Sampai Fase 8, principal berhubungan melalui dokumen dan surel. Portal khusus untuk principal dan vendor sengaja ditunda karena membuka akses pihak luar menuntut lapisan keamanan tersendiri yang tidak layak dikerjakan sebelum inti sistem matang.' },

{ t: 'h2', x: '7.3 Satu hari kerja dengan Maritime Suite' },
{ t: 'p', x: 'Berikut gambaran alur kerja setelah Fase 4 selesai, memakai contoh kapal yang datang ke Samarinda.' },
{ t: 'ol', x: [
  '**Penunjukan masuk.** Staf operasional membuka aplikasi, memilih kapal dari data induk — GT, LOA, dan bendera terisi sendiri — lalu membuat voyage baru. Nomor voyage terbentuk otomatis.',
  '**Menyusun EPDA.** Staf memilih pelabuhan Samarinda. Sistem menampilkan daftar jasa yang berlaku beserta tarifnya, menghitung jasa berbasis GT dari data kapal, dan menjumlahkan imbalan keagenan. Staf menyesuaikan jumlah kapal tunda dan perkiraan hari sandar.',
  '**Persetujuan dan pengiriman.** Manajer memeriksa dan menyetujui. EPDA dicetak menjadi PDF dan dikirim kepada principal. Nilai yang dikirim tersimpan sebagai versi 1 dan tidak akan berubah.',
  '**Revisi.** Jadwal mundur dua hari sehingga biaya bertambah. Staf membuat versi 2 dengan catatan alasan. Versi 1 tetap utuh dan dapat dibandingkan.',
  '**Kapal tiba.** Kejadian pelabuhan dicatat pada garis waktu voyage. Keadaan voyage berpindah mengikuti kenyataan di lapangan.',
  '**Menyusun FDA.** Setelah kapal berangkat, staf membuat FDA. Sistem menyalin baris EPDA sebagai kerangka; staf mengisi nilai sebenarnya beserta nomor tagihan vendor. Selisih terhitung sendiri.',
  '**Penagihan.** Faktur terbentuk dari FDA, lengkap dengan pajak dan keperluan e-Faktur. Penerimaan pembayaran dicatat dan piutang berkurang.',
  '**Penutupan.** Voyage ditutup. Seluruh riwayat tersimpan utuh dan dapat dibuka kapan pun.',
]},

{ t: 'h2', x: '7.4 Banyak perusahaan dan banyak mata uang' },
{ t: 'p', x: 'Dua kemampuan berikut dibangun sejak awal meski manfaatnya baru terasa belakangan, karena menambahkannya di kemudian hari jauh lebih mahal daripada menyiapkannya sejak fondasi.' },
{ t: 'ul', x: [
  '**Pemisahan antar-perusahaan.** Setiap data induk membawa penanda perusahaan pemiliknya. Inilah yang memungkinkan sistem melayani banyak perusahaan keagenan tanpa penulisan ulang ketika tahap komersial tiba.',
  '**Banyak mata uang.** Biaya pelabuhan sering bercampur rupiah dan dolar. Setiap baris menyimpan mata uang, kurs, nilai asli, dan nilai yang sudah dikonversi ke mata uang dasar voyage — sehingga jumlah total selalu benar tanpa perhitungan ulang.',
]},

{ t: 'pb' },

// =====================================================================
// BAB 8 — MODUL INTI
// =====================================================================
{ t: 'h1', x: '8. Modul Inti' },
{ t: 'lead', x: 'Isi platform, disertai status masing-masing secara jujur.' },

{ t: 'h2', x: '8.1 Peta modul' },
{ t: 'table', head: ['Modul', 'Fungsi', 'Status', 'Fase'], w: [1.1, 2.2, 0.9, 0.4], rows: [
  ['Autentikasi & pengguna', 'Masuk, peran, pemisahan antar-perusahaan', 'Terbukti', '0'],
  ['Pusat dokumen', '~45 jenis dokumen maritim dan cetak PDF', 'Terbukti', '0'],
  ['e-Faktur / Coretax', 'Keperluan pajak Indonesia', 'Terbukti', '0'],
  ['Langganan & pembayaran', 'Penagihan langganan melalui Midtrans', 'Terbukti', '0'],
  ['Ekstraksi dokumen AI', 'Membaca PDF dan gambar menjadi data', 'Terbukti', '0'],
  ['Data induk', 'Kapal, principal, customer, vendor, pelabuhan, mata uang, kurs', 'Dirancang', '1'],
  ['Service Catalog', 'Definisi jasa, cara hitung, tarif per pelabuhan', 'Dirancang', '1'],
  ['Impor ship particular', 'Membaca PDF atau Excel menjadi data kapal', 'Dirancang', '1'],
  ['Voyage Hub', 'Pusat kunjungan kapal, port call, kargo', 'Dirancang', '2'],
  ['Mesin EPDA', 'Perhitungan otomatis, revisi, persetujuan', 'Dirancang', '3'],
  ['FDA & analisis selisih', 'Biaya sebenarnya dan perbandingannya', 'Dirancang', '4'],
  ['Faktur & piutang', 'Faktur dari FDA, penerimaan, tunggakan', 'Dirancang', '4'],
  ['Dasbor & laporan', 'Indikator kinerja, grafik, ekspor', 'Dirancang', '5'],
  ['Jejak audit & persetujuan', 'Catatan perubahan yang tak dapat diubah', 'Dirancang', '5'],
  ['Lapisan AI', 'Prakiraan biaya, deteksi kejanggalan, asisten', 'Usulan', '6'],
  ['Tugas & kolaborasi', 'Papan tugas, vendor, catatan internal', 'Usulan', '7'],
  ['Portal & komersial', 'Portal principal dan vendor, AIS, white-label', 'Usulan', '8'],
]},

{ t: 'h2', x: '8.2 Data induk' },
{ t: 'p', x: 'Data induk adalah fondasi bagi seluruh isian otomatis. Selama pelabuhan masih berupa teks bebas, laporan per pelabuhan tidak akan pernah dapat dipercaya.' },
{ t: 'table', head: ['Data induk', 'Isi penting'], w: [1, 3], boldFirst: true, rows: [
  ['Kapal', 'Nama, IMO, bendera, GT, NT, DWT, LOA, lebar, sarat, jenis, pemilik'],
  ['Principal', 'Pemberi order; sudah ada di aplikasi berjalan'],
  ['Customer', 'Pihak yang ditagih; sering sama dengan principal, kadang berbeda'],
  ['Vendor', 'Pandu, tunda, air tawar, sampah, pengangkutan; lengkap dengan rekening dan tempo bayar'],
  ['Pelabuhan', 'Nama, kode UN/LOCODE, otoritas, kewajiban pandu dan tunda, batas sarat dan panjang'],
  ['Mata uang & kurs', 'Daftar mata uang serta kurs bertanggal berlaku'],
]},

{ t: 'h3', x: 'Impor ship particular dari PDF atau Excel' },
{ t: 'p', x: 'Data kapal biasanya datang dari principal dalam bentuk berkas ship particular. Mengetiknya ulang lambat dan rawan salah. Sistem akan menyediakan dua pintu masuk: melalui kotak percakapan AI, dan melalui tombol impor pada halaman data kapal.' },
{ t: 'p', x: 'Alurnya: berkas diunggah, AI membaca isinya, hasil bacaan ditampilkan untuk diperiksa dan diperbaiki, barulah disimpan setelah dikonfirmasi. Langkah pemeriksaan sengaja diwajibkan agar mutu data induk terjaga. Bila kapal sudah terdaftar, sistem menawarkan pembaruan alih-alih membuat data kembar.' },
{ t: 'p', x: 'Berkas Excel dibaca langsung, sedangkan PDF — baik digital maupun hasil pindaian — dibaca oleh model AI yang mampu melihat gambar, sehingga tidak diperlukan perangkat pengenal tulisan terpisah.' },

{ t: 'h2', x: '8.3 Voyage Hub' },
{ t: 'p', x: 'Halaman voyage adalah tempat kerja utama sehari-hari. Isinya: ringkasan kunjungan, garis waktu kejadian pelabuhan, daftar kargo, seluruh dokumen biaya beserta versinya, faktur, dan berkas tertaut. Dari satu halaman ini seluruh pertanyaan mengenai satu kunjungan dapat dijawab.' },

{ t: 'h2', x: '8.4 Mesin EPDA — modul andalan' },
{ t: 'p', x: 'Modul ini adalah pembeda utama produk. Kemampuan yang direncanakan:' },
{ t: 'table', head: ['Kemampuan', 'Penjelasan'], w: [1.2, 2.8], boldFirst: true, rows: [
  ['Pengambilan dari katalog', 'Memilih pelabuhan menampilkan jasa yang berlaku beserta tarif yang sah pada tanggal tersebut.'],
  ['Perhitungan otomatis', 'Jasa berbasis GT dihitung dari data kapal; berbasis waktu dari lama sandar; berbasis tonase dari data kargo.'],
  ['Pengisian cerdas', 'Mata uang, vendor bawaan, sifat kena pajak, dan urutan cetak terisi mengikuti katalog.'],
  ['Paket standar', 'Susunan biaya baku per pelabuhan dan jenis kapal dapat disimpan sebagai templat.'],
  ['Banyak mata uang', 'Baris rupiah dan dolar dapat bercampur; total dihitung dalam mata uang dasar voyage.'],
  ['Revisi berversi', 'Versi baru terbentuk lengkap dengan catatan alasan; perbandingan antarversi tersedia.'],
  ['Persetujuan bertingkat', 'Dokumen melewati pemeriksaan sebelum dapat dikirim keluar.'],
  ['Delapan keadaan dokumen', 'Dari draf hingga tertutup, agar posisi setiap dokumen selalu jelas.'],
  ['Cetak dan kirim', 'PDF memakai mesin cetak yang sudah berjalan pada aplikasi saat ini.'],
]},
{ t: 'note', x: '**Sasaran terukur:** penyusunan EPDA untuk kunjungan biasa selesai di bawah lima menit, dari sebelumnya puluhan menit hingga berjam-jam. Sasaran inilah yang dipakai untuk menilai keberhasilan Fase 3.' },

{ t: 'h2', x: '8.5 FDA dan analisis selisih' },
{ t: 'p', x: 'FDA dibentuk dengan menyalin baris EPDA sebagai kerangka, lalu diisi nilai sebenarnya beserta nomor tagihan vendor dan rujukan kuitansi. Karena setiap baris FDA menunjuk baris EPDA asalnya, perbandingan tersedia tanpa pekerjaan tambahan.' },
{ t: 'p', x: 'Analisis selisih dapat ditampilkan menurut jasa, pelabuhan, vendor, kapal, atau principal. Manfaatnya berlapis: memperbaiki ketepatan EPDA berikutnya, menemukan vendor yang tagihannya sering melampaui kesepakatan, dan menyediakan bahan pembicaraan yang berdasar dengan principal.' },

{ t: 'h2', x: '8.6 Faktur dan piutang' },
{ t: 'p', x: 'Faktur terbentuk dari FDA sehingga tidak ada pengetikan ulang dan tidak ada peluang beda angka antara laporan dan tagihan. Modul ini menangani penerimaan pembayaran, sisa tagihan, daftar tunggakan menurut umur, kuitansi, serta nota kredit dan debit. Keperluan e-Faktur dan Coretax memakai bagian yang sudah berjalan pada aplikasi saat ini.' },

{ t: 'h2', x: '8.7 Pusat dokumen' },
{ t: 'p', x: 'Aplikasi yang berjalan sudah menangani sekitar 45 jenis dokumen maritim — surat penunjukan, laporan kedatangan dan keberangkatan, daftar awak, pergantian awak, deklarasi kargo, bunker, laporan kerusakan, dan lainnya — lengkap dengan mesin cetak PDF dan penomoran otomatis berpola.' },
{ t: 'p', x: 'Bagian ini tidak dibangun ulang. Ia hanya memperoleh satu tambahan penting: kaitan ke voyage, sehingga setiap dokumen tahu ia milik kunjungan yang mana.' },

{ t: 'h2', x: '8.8 Dasbor dan laporan' },
{ t: 'p', x: 'Direncanakan tiga sudut pandang: eksekutif (kinerja dan pendapatan), operasional (kunjungan berjalan dan yang akan datang), serta keuangan (piutang, tunggakan, arus kas). Dilengkapi laporan yang dapat diekspor ke Excel dan PDF, pencarian menyeluruh, serta pusat pemberitahuan.' },

{ t: 'h2', x: '8.9 Lapisan kecerdasan buatan' },
{ t: 'p', x: 'Sepuluh modul ekstraksi dokumen sudah berjalan pada aplikasi saat ini dan terbukti berguna: membaca tagihan, kuitansi, laporan rekening, dan dokumen pengadaan menjadi data siap pakai. Model yang dipakai adalah Claude Sonnet melalui OpenRouter, dipilih karena mampu membaca gambar sehingga PDF hasil pindaian dapat ditangani tanpa perangkat tambahan.' },
{ t: 'p', x: 'Rencana lanjutan pada Fase 6 mencakup prakiraan biaya, deteksi kejanggalan, penyusunan draf surat, dan asisten kontekstual. Satu aturan dipegang teguh:' },
{ t: 'note', color: 'red', x: '**Kecerdasan buatan tidak pernah mengarang nilai uang.** Prakiraan biaya hanya boleh berdiri di atas data nyata perusahaan — riwayat voyage, FDA terdahulu, dan tarif dalam Service Catalog — disertai keterangan tingkat keyakinan dan asal-usul angkanya. Setiap nilai selalu dapat diubah manusia. Sistem yang mengarang angka biaya adalah sistem yang tidak dapat dipercaya, dan sekali kepercayaan itu hilang ia tidak kembali.' },
{ t: 'p', x: 'Karena mutu prakiraan bergantung pada banyaknya riwayat, modul ini sengaja ditempatkan pada Fase 6 — setelah cukup data terkumpul dari pemakaian sehari-hari.' },

{ t: 'h2', x: '8.10 Yang ditunda' },
{ t: 'p', x: 'Kemampuan berikut termasuk dalam visi tetapi sengaja ditunda ke Fase 7 dan 8: papan tugas dan daftar periksa otomatis, pengelolaan vendor beserta penilaian kinerjanya, permintaan dan pesanan pembelian, catatan internal, kalender dan pengingat, portal principal dan vendor, data pergerakan kapal (AIS) dan cuaca, buku panduan pelabuhan, serta white-label.' },
{ t: 'p', x: 'Alasan penundaan sederhana: semuanya bergantung pada inti yang harus matang lebih dulu, dan mengerjakannya terlalu awal berarti membangun di atas fondasi yang masih bergerak.' },

{ t: 'pb' },

// =====================================================================
// BAB 9 — VISI TEKNOLOGI
// =====================================================================
{ t: 'h1', x: '9. Visi Teknologi' },
{ t: 'lead', x: 'Ditulis agar dapat dibaca pembaca non-teknis, tanpa menyembunyikan hal yang penting.' },

{ t: 'h2', x: '9.1 Perangkat yang dipakai' },
{ t: 'table', head: ['Bagian', 'Pilihan', 'Alasan'], w: [1, 1.2, 2], rows: [
  ['Antarmuka & server', 'Next.js 14, React 18, TypeScript', 'Satu bahasa untuk seluruh aplikasi; tipe data yang ketat menangkap kesalahan sebelum berjalan.'],
  ['Tampilan', 'Tailwind CSS dan shadcn/ui', 'Komponen siap pakai yang konsisten dan memenuhi kaidah aksesibilitas.'],
  ['Basis data', 'PostgreSQL dengan Prisma', 'Basis data relasional yang teruji; Prisma menjaga skema tetap selaras dengan kode.'],
  ['Autentikasi', 'NextAuth dengan kata sandi terenkripsi bcrypt dan token JWT', 'Sudah berjalan dan teruji pada aplikasi saat ini.'],
  ['Kecerdasan buatan', 'Claude Sonnet melalui OpenRouter', 'Mampu membaca gambar; penyedia dapat diganti tanpa mengubah kode aplikasi.'],
  ['Cetak dokumen', 'React-PDF dan jsPDF', 'Sudah menghasilkan puluhan jenis dokumen yang dipakai sehari-hari.'],
  ['Pembayaran langganan', 'Midtrans', 'Penyedia lokal, mendukung kanal pembayaran Indonesia.'],
  ['Penempatan', 'Railway dengan PostgreSQL terkelola', 'Sederhana, biaya awal rendah, dapat dipindah bila kebutuhan berubah.'],
]},
{ t: 'p', x: 'Satu keputusan penting perlu dicatat: susunan perangkat ini **dipertahankan**, tidak diganti. Naskah PRD sempat menyarankan penyedia autentikasi dan penyedia AI yang berbeda, namun mengganti fondasi yang sudah berjalan berarti membuang pekerjaan yang telah terbukti demi keuntungan yang tidak nyata. Naskah PRD yang disesuaikan dengan kenyataan, bukan sebaliknya.' },

{ t: 'h2', x: '9.2 Prinsip arsitektur' },
{ t: 'ol', x: [
  '**Fondasi lebih dulu.** Skema data dikerjakan sampai benar sebelum fitur ditumpuk di atasnya, karena kekeliruan fondasi menular ke semua modul.',
  '**Perubahan yang menambah.** Tidak ada tabel atau kolom yang dihapus selama masa peralihan. Sistem lama tetap berjalan berdampingan dengan yang baru.',
  '**Peralihan per modul.** Begitu satu modul baru siap, dokumen baru memakai jalur baru sementara dokumen lama tetap terbaca sebagai arsip. Tidak ada konversi paksa yang berisiko.',
  '**Aturan bisnis di satu tempat.** Perhitungan dikumpulkan pada lapisan layanan tersendiri, tidak disebar di dalam tampilan, agar dapat diuji dan tidak bercabang.',
  '**Pilihan tertutup, bukan rumus bebas.** Cara hitung disimpan sebagai daftar pilihan yang sah, bukan teks rumus yang dijalankan sistem.',
  '**Salinan untuk hal yang menyangkut uang.** Dokumen keuangan menyalin nilai acuan, tidak menunjuknya.',
]},

{ t: 'h2', x: '9.3 Keamanan dan pemisahan data' },
{ t: 'p', x: 'Setiap data induk membawa penanda perusahaan pemiliknya. Tabel anak — misalnya baris biaya di dalam sebuah dokumen — tidak membawa penanda tersendiri melainkan mewarisinya dari induk melalui hubungan antar-tabel. Keputusan ini diambil agar tidak muncul data kembar yang dapat menyimpang dari induknya.' },
{ t: 'note', color: 'navy', x: '**Terbuka.** Cara penegakan pemisahan data antar-perusahaan belum diputuskan: apakah memakai aturan di tingkat basis data (row-level security) atau penjagaan di lapisan layanan aplikasi. Keputusan ini wajib diambil sebelum sistem melayani perusahaan di luar Tribuana, dan tercatat pada Lampiran C.' },
{ t: 'p', x: 'Lapisan lain yang sudah dirancang: catatan audit yang merekam setiap pembuatan, perubahan, penghapusan, persetujuan, dan ekspor beserta pelakunya; catatan persetujuan yang tidak dapat diubah setelah tersimpan; serta penghapusan bertanda, sehingga data tidak pernah benar-benar lenyap.' },

{ t: 'h2', x: '9.4 Pendirian mengenai kecerdasan buatan' },
{ t: 'p', x: 'Banyak produk memasang AI sebagai hiasan pemasaran. Maritime Suite mengambil sikap berbeda dan lebih sempit, karena bidang ini menyangkut uang titipan pihak lain.' },
{ t: 'table', head: ['AI boleh', 'AI tidak boleh'], w: [1, 1], rows: [
  ['Membaca dokumen menjadi data terstruktur', 'Menetapkan nilai uang tanpa dasar'],
  ['Mengusulkan angka disertai asal-usul dan tingkat keyakinan', 'Menyetujui dokumen'],
  ['Menandai kejanggalan untuk diperiksa manusia', 'Mengirim dokumen ke pihak luar'],
  ['Menyusun draf surat dan ringkasan', 'Mengubah data induk tanpa konfirmasi'],
]},
{ t: 'p', x: 'Prakiraan biaya pada Fase 6 akan berdiri di atas riwayat voyage dan FDA milik perusahaan sendiri serta tarif dalam Service Catalog — bukan di atas pengetahuan umum model bahasa. Setiap usulan disertai keterangan dari data mana ia berasal, dan setiap nilai dapat diubah.' },

{ t: 'h2', x: '9.5 Metode pembangunan' },
{ t: 'p', x: 'Pembangunan dijalankan dengan bantuan kecerdasan buatan secara terukur, memakai dua tingkat model yang berbeda biayanya. Model yang lebih kuat dipakai untuk pekerjaan yang mahal bila keliru — rancangan skema, keputusan arsitektur, mesin perhitungan, strategi migrasi, dan pemeriksaan keamanan. Model yang lebih ringan dipakai untuk pekerjaan yang polanya sudah ditetapkan — formulir, tabel, ekspor, terjemahan antarmuka, dan pengujian.' },
{ t: 'p', x: 'Syarat mutlak metode ini: **setiap keputusan rancangan harus ditulis ke dalam dokumen**. Tanpa itu, pekerjaan lanjutan akan menyimpang dari pola dan konsistensi sistem rusak. Aturan tersebut sudah dijalankan — dokumen rancangan Fase 0 memuat enam keputusan desain beserta alasannya, dan menjadi acuan bagi seluruh pekerjaan berikutnya.' },

{ t: 'h2', x: '9.6 Bukti bahwa fondasinya aman' },
{ t: 'p', x: 'Skema data v2 sudah ditulis lengkap dan diuji secara kering — perubahan dihitung tanpa benar-benar diterapkan ke basis data. Hasilnya:' },
{ t: 'table', head: ['Jenis perubahan', 'Jumlah'], w: [2.4, 1], boldFirst: true, rows: [
  ['Tabel baru dibuat', '18'],
  ['Tipe enumerasi baru', '6'],
  ['Indeks dan kunci unik baru', '31'],
  ['Kolom dihapus', '0'],
  ['Tipe kolom diubah', '0'],
  ['Kolom dijadikan wajib', '0'],
]},
{ t: 'p', x: 'Satu-satunya perubahan pada tabel lama adalah penambahan tiga kolom bersifat pilihan. Dengan demikian seluruh baris data yang sudah ada tetap sah dan aplikasi yang berjalan tidak berubah perilakunya. Pembatalan pun mudah: cukup berhenti memakai tabel baru, tanpa ada data lama yang hilang.' },

{ t: 'pb' },

// =====================================================================
// BAB 10 — LANSKAP KOMPETITIF
// =====================================================================
{ t: 'h1', x: '10. Lanskap Kompetitif dan Posisi' },
{ t: 'lead', x: 'Bab ini ditambahkan karena pertanyaan pertama dari calon mitra atau investor hampir selalu: siapa pesaingnya, dan mengapa Anda menang.' },

{ t: 'note', x: '**Perlu diverifikasi.** Uraian pesaing di bawah disusun dari pengetahuan umum industri, bukan dari riset pasar berbayar. Sebelum dokumen ini dipakai dalam pertemuan resmi dengan investor, sebaiknya dilakukan pemeriksaan terbaru atas produk, cakupan, dan harga masing-masing pemain.' },

{ t: 'h2', x: '10.1 Pemain global' },
{ t: 'p', x: 'Pasar perangkat lunak maritim bukan lahan kosong. Beberapa pemain sudah mapan dan sebagian sangat kuat pada bidang yang beririsan langsung dengan Maritime Suite.' },
{ t: 'table', head: ['Pemain', 'Fokus', 'Kekuatan', 'Mengapa tidak menutup celah kita'], w: [0.9, 1.1, 1.3, 1.7], rows: [
  ['DA-Desk (grup Marcura)', 'Pengelolaan biaya kunjungan pelabuhan — EPDA, PDA, FDA', 'Pemain paling mapan di bidang ini; jaringan data pelabuhan yang luas', 'Menyasar pemilik dan penyewa kapal berskala besar, bukan agen menengah; berbahasa Inggris dan tanpa dukungan perpajakan Indonesia'],
  ['Veson Nautical (IMOS+)', 'Manajemen voyage dan chartering', 'Sangat kuat pada perhitungan hasil voyage dan penyewaan', 'Berpusat pada pemilik kapal dan penyewa; bukan alat kerja keagenan pelabuhan'],
  ['Softship (WiseTech Global)', 'Pelayaran liner dan keagenan', 'Bagian dari kelompok logistik besar; cakupan luas', 'Berat, mahal, dan disiapkan untuk operasi liner berskala besar'],
  ['ShipNet, BASSnet, Dataloy', 'ERP maritim menyeluruh', 'Cakupan modul sangat lebar', 'Penerapan lama dan mahal; berlebihan untuk agen berukuran menengah'],
]},

{ t: 'h2', x: '10.2 Kenyataan di Indonesia' },
{ t: 'p', x: 'Meskipun perangkat lunak kelas dunia tersedia, sebagian besar perusahaan keagenan menengah di Indonesia tetap bekerja dengan Excel, surel, dan WhatsApp. Alasannya bukan ketidaktahuan:' },
{ t: 'ul', x: [
  '**Harga.** Berlangganan sistem global dalam dolar sulit dibenarkan bagi agen dengan volume puluhan kunjungan per bulan.',
  '**Bahasa dan cara kerja.** Istilah, susunan dokumen, dan alur persetujuan disusun untuk pasar Eropa dan Timur Tengah.',
  '**Pajak.** Tidak satu pun menangani e-Faktur dan Coretax. Padahal bagian itu wajib dan memakan waktu.',
  '**Pelabuhan lokal.** Tarif, kebiasaan, dan urutan perizinan pelabuhan Indonesia tidak terwakili.',
  '**Ukuran.** Penerapan sistem besar menuntut tim internal yang tidak dimiliki agen menengah.',
]},
{ t: 'p', x: 'Dengan kata lain: pesaing kelas dunia ada, tetapi mereka tidak berada di ruangan yang sama dengan calon pengguna Maritime Suite.' },

{ t: 'h2', x: '10.3 Posisi Maritime Suite' },
{ t: 'quote', x: '"Bukan yang pertama menyatukan semuanya — melainkan yang pertama benar-benar cocok untuk keagenan kapal Indonesia."' },
{ t: 'table', head: ['Sumbu', 'Pemain global', 'Excel', 'Maritime Suite'], w: [1.1, 1, 0.9, 1.2], rows: [
  ['Harga', 'Tinggi, dalam dolar', 'Nyaris nol', 'Menengah, dalam rupiah'],
  ['Waktu penerapan', 'Berbulan-bulan', 'Seketika', 'Hitungan hari'],
  ['Perpajakan Indonesia', 'Tidak ada', 'Manual', 'e-Faktur dan Coretax bawaan'],
  ['Tarif pelabuhan lokal', 'Tidak tersedia', 'Di kepala orang', 'Tersimpan di Service Catalog'],
  ['Riwayat revisi', 'Ada', 'Tidak ada', 'Ada, dengan perbandingan antarversi'],
  ['Analisis selisih', 'Ada', 'Tidak ada', 'Bawaan sistem'],
  ['Bahasa', 'Inggris', 'Bebas', 'Indonesia dan Inggris'],
  ['Sasaran pengguna', 'Perusahaan besar', 'Semua', 'Keagenan menengah Indonesia'],
]},

{ t: 'h2', x: '10.4 Keunggulan yang sulit ditiru' },
{ t: 'ol', x: [
  '**Dibangun oleh pelakunya.** Pesaing harus membeli pengetahuan lapangan; di sini pengetahuan itu sudah ada di dalam perusahaan dan diperbarui setiap hari.',
  '**Perpajakan Indonesia sudah berjalan.** e-Faktur dan Coretax sudah berfungsi, bukan sekadar direncanakan. Bagi pemain asing, bagian ini adalah pekerjaan besar dengan imbalan pasar yang kecil.',
  '**Tarif pelabuhan lokal sebagai aset yang menumpuk.** Semakin lama sistem dipakai, semakin lengkap katalog tarif dan riwayat biayanya. Aset ini tidak dapat disalin pendatang baru.',
  '**Harga dan dukungan dalam rupiah.** Berlangganan dalam rupiah dengan dukungan berbahasa Indonesia dan zona waktu yang sama menghilangkan hambatan yang nyata.',
  '**Pelanggan pertama sudah ada.** Produk diuji pada pekerjaan sungguhan dengan lima klien aktif sejak hari pertama.',
]},

{ t: 'h2', x: '10.5 Risiko kompetitif dan jawabannya' },
{ t: 'table', head: ['Risiko', 'Jawaban'], w: [1.3, 2.7], rows: [
  ['Pemain global menurunkan harga untuk pasar Indonesia', 'Harga hanyalah satu dari lima keunggulan. Perpajakan dan tarif lokal tetap tidak mereka miliki, dan tidak sepadan untuk mereka bangun.'],
  ['Perusahaan keagenan besar membangun sistemnya sendiri', 'Sangat mungkin terjadi, dan mereka memang bukan pasar sasaran. Sasaran Maritime Suite adalah agen menengah yang tidak sanggup membangun sendiri.'],
  ['Muncul pesaing lokal serupa', 'Keunggulan terletak pada waktu mulai dan pada data tarif yang menumpuk. Karena itu Fase 4 perlu dicapai cepat.'],
  ['Pengguna enggan meninggalkan Excel', 'Peralihan tidak dipaksakan sekaligus. Sistem dapat dipakai berdampingan, dan dokumen lama tetap terbaca sebagai arsip.'],
  ['Tenaga pembangun terbatas', 'Risiko paling nyata. Ditangani dengan peta jalan bertahap dan titik guna di Fase 4, sehingga manfaat datang sebelum seluruh visi selesai.'],
]},

{ t: 'pb' },

// =====================================================================
// BAB 11 — MODEL BISNIS
// =====================================================================
{ t: 'h1', x: '11. Model Bisnis' },
{ t: 'note', x: '**Usulan.** Seluruh angka pada bab ini adalah usulan awal untuk bahan diskusi, bukan proyeksi keuangan. Belum ada penelitian harga terhadap calon pelanggan. Angka wajib ditinjau sebelum dipakai dalam pembicaraan dengan pihak luar.' },

{ t: 'h2', x: '11.1 Tiga tahap komersial' },
{ t: 'table', head: ['Tahap', 'Sasaran', 'Pengguna', 'Sumber pendapatan'], w: [1, 1.4, 1.2, 1.4], rows: [
  ['1. Pemakaian sendiri', 'Membuktikan sistem berguna dalam pekerjaan nyata', 'PT Tribuana Solusi Maritim', 'Belum ada — nilainya berupa penghematan waktu'],
  ['2. Pengguna awal', 'Membuktikan sistem berguna bagi perusahaan lain', 'Tiga sampai lima keagenan terpilih', 'Langganan dengan potongan harga sebagai imbalan masukan'],
  ['3. Langganan terbuka', 'Pertumbuhan berkelanjutan', 'Keagenan menengah di Indonesia', 'Langganan bulanan berjenjang'],
]},
{ t: 'p', x: 'Urutan ini tidak boleh dilompati. Menjual sebelum tahap satu selesai berisiko merusak nama baik perusahaan pada pasar yang saling mengenal dan berukuran kecil.' },

{ t: 'h2', x: '11.2 Dasar penetapan harga' },
{ t: 'p', x: 'Tiga dasar penetapan harga dipertimbangkan. Masing-masing memiliki akibat yang berbeda terhadap perilaku pelanggan.' },
{ t: 'table', head: ['Dasar', 'Kelebihan', 'Kekurangan'], w: [1, 1.5, 1.5], rows: [
  ['Per pengguna per bulan', 'Mudah dipahami; lazim di pasar perangkat lunak', 'Mendorong pelanggan berbagi akun demi menekan biaya — merusak jejak audit'],
  ['Per voyage', 'Adil; biaya mengikuti volume pekerjaan', 'Sulit diramal pelanggan; membuat penganggaran mereka repot'],
  ['Paket berjenjang dengan batas wajar', 'Dapat diramal, sekaligus tetap mengikuti ukuran usaha', 'Batas harus ditentukan dengan hati-hati'],
]},
{ t: 'p', x: '**Usulan: paket berjenjang.** Alasan utamanya adalah butir pertama — penetapan harga per pengguna mendorong pemakaian akun bersama, dan akun bersama merusak jejak audit yang justru menjadi nilai jual produk ini.' },

{ t: 'h2', x: '11.3 Usulan paket' },
{ t: 'table', head: ['Paket', 'Sasaran', 'Batas', 'Usulan harga per bulan'], w: [0.8, 1.2, 1.5, 1.1], rows: [
  ['Basic', 'Agen kecil, satu pelabuhan', '5 pengguna · 25 voyage per bulan · modul inti', 'Rp 2.500.000'],
  ['Professional', 'Agen menengah, beberapa pelabuhan', '15 pengguna · 100 voyage per bulan · dasbor, laporan, AI ekstraksi', 'Rp 6.000.000'],
  ['Enterprise', 'Kelompok usaha atau agen besar', 'Tanpa batas · banyak perusahaan · API · dukungan khusus', 'Mulai Rp 12.000.000'],
]},
{ t: 'p', x: 'Tambahan yang dapat dibeli terpisah: penyiapan dan pemindahan data, pelatihan di tempat, penyesuaian templat dokumen, serta data pergerakan kapal (AIS) pada Fase 8.' },

{ t: 'h2', x: '11.4 Ilustrasi, bukan proyeksi' },
{ t: 'p', x: 'Tabel berikut memperlihatkan bagaimana pendapatan berulang tersusun pada beberapa kemungkinan jumlah pelanggan. Ini adalah ilustrasi aritmetika untuk memahami bentuk model bisnis — **bukan ramalan penjualan**.' },
{ t: 'table', head: ['Kemungkinan', 'Susunan pelanggan', 'Pendapatan per bulan', 'Pendapatan setahun'], w: [1, 1.5, 1.2, 1.2], rows: [
  ['Kecil', '5 Basic + 2 Professional', 'Rp 24.500.000', 'Rp 294.000.000'],
  ['Menengah', '10 Basic + 6 Professional + 1 Enterprise', 'Rp 73.000.000', 'Rp 876.000.000'],
  ['Besar', '20 Basic + 15 Professional + 3 Enterprise', 'Rp 176.000.000', 'Rp 2.112.000.000'],
]},
{ t: 'p', x: 'Yang perlu dibaca dari tabel ini bukan angkanya, melainkan bentuknya: pendapatan berulang menumpuk. Pelanggan yang bertahan pada tahun kedua tidak perlu dijual ulang. Itulah sebabnya angka retensi lebih menentukan daripada angka penjualan baru.' },

{ t: 'h2', x: '11.5 Biaya menjalankan layanan' },
{ t: 'table', head: ['Pos biaya', 'Sifat', 'Catatan'], w: [1.1, 1, 1.9], rows: [
  ['Peladen dan basis data', 'Tetap, naik bertahap', 'Kecil pada tahap awal; naik mengikuti jumlah pelanggan'],
  ['Pemakaian AI', 'Berubah mengikuti pemakaian', 'Perlu batas per pelanggan agar tidak melampaui perhitungan harga'],
  ['Penyimpanan berkas', 'Berubah mengikuti pemakaian', 'Dokumen pindaian adalah penyumbang terbesar'],
  ['Dukungan pelanggan', 'Tenaga kerja', 'Pos terbesar setelah pengembangan; menentukan batas kelayakan paket Basic'],
  ['Pengembangan lanjutan', 'Tetap', 'Tidak berhenti setelah produk dijual'],
]},

{ t: 'h2', x: '11.6 Yang harus dibuktikan lebih dulu' },
{ t: 'p', x: 'Model bisnis ini bersandar pada beberapa dugaan yang belum diuji. Menuliskannya secara terbuka lebih berguna daripada menyembunyikannya.' },
{ t: 'ol', x: [
  'Bahwa keagenan menengah bersedia membayar bulanan untuk perangkat lunak — kebiasaan berlangganan belum merata di segmen ini.',
  'Bahwa penghematan waktu cukup besar untuk membenarkan harganya. Ini harus diukur di Tribuana lebih dulu, bukan diperkirakan.',
  'Bahwa jumlah keagenan yang layak menjadi sasaran cukup banyak. Ukuran pasar nyata belum dihitung.',
  'Bahwa peralihan dari Excel dapat berlangsung tanpa mengganggu pekerjaan berjalan.',
  'Bahwa biaya dukungan pelanggan tidak menggerus margin paket Basic.',
]},
{ t: 'p', x: 'Dugaan kedua adalah yang paling penting dan paling murah untuk diuji — cukup dengan mencatat waktu penyusunan EPDA sebelum dan sesudah Fase 3. Pengukuran itu sebaiknya disiapkan dari sekarang.' },

{ t: 'pb' },

// =====================================================================
// BAB 12 — PETA JALAN
// =====================================================================
{ t: 'h1', x: '12. Peta Jalan Fase 0–8' },
{ t: 'lead', x: 'Urutan pembangunan, hasil yang diharapkan tiap fase, dan posisi hari ini.' },

{ t: 'h2', x: '12.1 Sembilan fase' },
{ t: 'table', head: ['Fase', 'Fokus', 'Ukuran', 'Tonggak'], w: [0.4, 2, 0.6, 1.4], rows: [
  ['0', 'Fondasi data dan arsitektur', 'S–M', '—'],
  ['1', 'Data induk dan Service Catalog', 'L', '—'],
  ['2', 'Voyage Hub, port call, kargo', 'M', '—'],
  ['3', 'Mesin EPDA', 'L', '—'],
  ['4', 'FDA, faktur, penerimaan pembayaran', 'L', 'Dapat dipakai Tribuana'],
  ['5', 'Dasbor, laporan, peran, audit', 'M–L', '—'],
  ['6', 'Lapisan kecerdasan buatan', 'M', 'Sistem menjadi cerdas'],
  ['7', 'Operasi dan kolaborasi', 'XL', 'Menjadi sistem operasi'],
  ['8', 'Komersial dan SaaS', 'XL', 'Siap dijual'],
]},
{ t: 'p', x: 'Fase 0 sampai 4 adalah tulang punggung dan saling bergantung sehingga harus berurutan. Fase 5 dan 6 menambah analitik dan kecerdasan. Fase 7 dan 8 paling berat dan sengaja dikerjakan terakhir.' },

{ t: 'h2', x: '12.2 Isi tiap fase' },
{ t: 'table', head: ['Fase', 'Hasil yang diharapkan'], w: [0.5, 3.5], boldFirst: true, rows: [
  ['0', 'Skema data voyage-centric lengkap, migrasi yang aman, kerangka lapisan layanan. Belum ada perubahan yang terlihat pengguna.'],
  ['1', 'Pengelolaan seluruh data induk dan Service Catalog beserta tarifnya, ditambah impor ship particular dari PDF dan Excel. Isian otomatis mulai terasa.'],
  ['2', 'Voyage beserta penomoran otomatis, daftar voyage, halaman kerja voyage, garis waktu port call, dan kargo.'],
  ['3', 'Mesin EPDA: pengambilan dari katalog, perhitungan otomatis, banyak mata uang, revisi berversi, persetujuan bertingkat, cetak dan kirim.'],
  ['4', 'FDA beserta analisis selisih, faktur dari FDA, penerimaan pembayaran, tunggakan, kuitansi, nota kredit dan debit.'],
  ['5', 'Dasbor tiga sudut pandang, laporan yang dapat diekspor, peran dan matriks kewenangan, jejak audit, pemberitahuan, pencarian menyeluruh.'],
  ['6', 'Asisten kontekstual, prakiraan biaya berdasar riwayat, deteksi kejanggalan, draf surat, perluasan ekstraksi dokumen.'],
  ['7', 'Papan tugas dan daftar periksa, husbandry, pergantian awak, pengelolaan vendor, pesanan pembelian, catatan internal, kalender, buku panduan pelabuhan.'],
  ['8', 'Pemandu pendaftaran mandiri, paket langganan, portal principal dan vendor, data pergerakan kapal dan cuaca, white-label, pusat bantuan.'],
]},

{ t: 'h2', x: '12.3 Dua titik yang menentukan' },
{ t: 'table', head: ['Titik', 'Artinya bagi perusahaan'], w: [1, 3], boldFirst: true, rows: [
  ['Akhir Fase 4', 'Siklus penuh berjalan: voyage, EPDA, revisi, FDA, faktur, penerimaan. Tribuana berhenti memakai Excel. Sejak titik ini sistem menghasilkan penghematan nyata setiap hari.'],
  ['Akhir Fase 8', 'Sistem siap dijual sebagai langganan: pendaftaran mandiri, paket berjenjang, portal pihak luar, dan dukungan pelanggan.'],
]},
{ t: 'p', x: 'Strategi yang disepakati: kejar sampai Fase 4 atau 5 lebih dulu untuk mendapat produk nyata, baru menilai kembali apakah Fase 6 sampai 8 layak diteruskan. Penilaian ulang itu dilakukan dengan data pemakaian, bukan dengan perkiraan.' },

{ t: 'h2', x: '12.4 Posisi hari ini' },
{ t: 'table', head: ['Langkah Fase 0', 'Keadaan'], w: [3, 1], boldFirst: true, rows: [
  ['Dokumen rancangan beserta enam keputusan desain', 'Selesai'],
  ['Persetujuan atas keputusan penting', 'Selesai'],
  ['Penulisan skema data — 18 tabel dan 6 enumerasi baru', 'Selesai dan tervalidasi'],
  ['Pembuktian bahwa migrasi bersifat menambah', 'Terbukti'],
  ['Penerapan perubahan ke basis data', 'Menunggu persetujuan'],
  ['Pemindahan data lama dan pengisian data awal', 'Belum'],
  ['Kerangka lapisan layanan', 'Belum'],
  ['Pengujian bahwa aplikasi lama tetap normal', 'Belum'],
]},
{ t: 'p', x: 'Dengan kata lain, Fase 0 tinggal langkah penerapan dan pengujian. Seluruh pekerjaan rancangan yang mahal sudah selesai dan tertulis.' },

{ t: 'h2', x: '12.5 Risiko pelaksanaan' },
{ t: 'table', head: ['Risiko', 'Dampak', 'Penanganan'], w: [1.2, 0.7, 2.1], rows: [
  ['Tenaga pembangun terbatas', 'Tinggi', 'Fase disusun agar tiap fase berdiri sendiri; pekerjaan dapat berhenti di batas fase tanpa meninggalkan sistem setengah jadi.'],
  ['Cakupan melebar', 'Tinggi', 'Bab 5.3 menetapkan batas tertulis; permintaan baru masuk ke fase belakang, bukan menyela fase berjalan.'],
  ['Kehilangan data saat migrasi', 'Sangat tinggi', 'Migrasi bersifat menambah dan sudah diuji kering; wajib ada cadangan sebelum diterapkan ke basis data produksi.'],
  ['Pemakai enggan berpindah', 'Sedang', 'Peralihan per modul; sistem lama tetap dapat dibaca sebagai arsip.'],
  ['Biaya AI melampaui perhitungan', 'Sedang', 'Pemakaian dibatasi per pelanggan dan dipantau sejak Fase 6.'],
  ['Fase 6 sampai 8 tidak pernah tercapai', 'Rendah', 'Produk sudah berguna sejak Fase 4; fase berikutnya adalah penambahan nilai, bukan syarat kelayakan.'],
]},

{ t: 'pb' },

// =====================================================================
// BAB 13 — VISI MASA DEPAN
// =====================================================================
{ t: 'h1', x: '13. Visi Masa Depan' },
{ t: 'lead', x: 'Ke mana produk ini menuju bila tahap-tahap awal berhasil.' },

{ t: 'h2', x: '13.1 Tiga cakrawala' },
{ t: 'table', head: ['Cakrawala', 'Sasaran', 'Ukuran keberhasilan'], w: [1, 1.6, 1.6], rows: [
  ['2026 — Membuktikan', 'Sistem dipakai penuh di Tribuana; Excel ditinggalkan', 'Seluruh voyage tercatat di sistem; waktu penyusunan EPDA turun tajam'],
  ['2027–2028 — Memperluas', 'Tiga sampai sepuluh keagenan Indonesia memakai sistem', 'Pelanggan membayar dan bertahan; katalog tarif meluas melewati Kalimantan Timur'],
  ['2029 dan seterusnya — Memperdalam', 'Menjadi acuan bagi keagenan Indonesia; membuka kemungkinan pasar Asia Tenggara', 'Pendapatan berulang menopang tim tetap; produk berkembang dari masukan banyak pelanggan'],
]},

{ t: 'h2', x: '13.2 Dari mencatat menjadi menyarankan' },
{ t: 'p', x: 'Sistem yang baru berjalan hanya mencatat apa yang sudah terjadi. Setelah riwayat menumpuk, ia dapat mulai menyarankan.' },
{ t: 'ul', x: [
  'Ketika EPDA baru disusun, sistem dapat menunjukkan berapa nilai sebenarnya pada kunjungan serupa terdahulu, disertai rentang dan tingkat keyakinannya.',
  'Ketika sebuah baris biaya menyimpang jauh dari kebiasaan, sistem menandainya sebelum dokumen dikirim.',
  'Ketika satu vendor berulang kali menagih melampaui kesepakatan, polanya muncul sendiri tanpa harus dicari.',
  'Ketika suatu pelabuhan menunjukkan biaya yang makin sulit diramal, kenaikan ketidakpastiannya terlihat lebih awal.',
]},
{ t: 'p', x: 'Semua kemampuan itu berdiri di atas satu syarat: data yang rapi dan dapat ditelusuri. Itulah alasan Fase 0 sampai 4 dikerjakan lebih dulu dan dikerjakan dengan hati-hati. Kecerdasan tidak dapat ditambahkan belakangan ke atas data yang berantakan.' },

{ t: 'h2', x: '13.3 Nilai yang menumpuk' },
{ t: 'p', x: 'Semakin lama sistem dipakai, semakin sulit ia digantikan — dan ini terjadi dengan sendirinya:' },
{ t: 'ul', x: [
  '**Katalog tarif** makin lengkap dan makin tepat, mencakup makin banyak pelabuhan.',
  '**Riwayat biaya** menjadi dasar prakiraan yang makin baik.',
  '**Templat dokumen** menyesuaikan diri dengan kebiasaan tiap principal.',
  '**Pengetahuan pelabuhan** berpindah dari ingatan orang menjadi milik perusahaan.',
]},
{ t: 'p', x: 'Bagi pelanggan, ini berarti berpindah ke sistem lain berarti kehilangan aset. Bagi perusahaan, inilah pertahanan yang paling murah dibangun dan paling mahal ditiru.' },

{ t: 'h2', x: '13.4 Batas yang tetap dipegang' },
{ t: 'p', x: 'Sebesar apa pun sistem ini berkembang, empat batas berikut tidak akan dilanggar:' },
{ t: 'ol', x: [
  'Kecerdasan buatan tidak pernah menetapkan nilai uang tanpa dasar dan tanpa persetujuan manusia.',
  'Riwayat tidak pernah dihapus. Dokumen yang pernah dikirim harus selalu dapat dicetak ulang persis seperti aslinya.',
  'Data satu perusahaan tidak pernah terlihat oleh perusahaan lain.',
  'Kerumitan ditanggung sistem, bukan dilimpahkan kepada operator.',
]},
{ t: 'quote', x: '"Produk ini bukan tentang kapal. Ia tentang kepercayaan — dan kepercayaan itu dibangun dari angka yang dapat dijelaskan."' },

{ t: 'pb' },

// =====================================================================
// LAMPIRAN
// =====================================================================
{ t: 'h1', x: 'Lampiran A — Daftar Istilah' },
{ t: 'table', head: ['Istilah', 'Arti'], w: [1, 3.4], boldFirst: true, rows: [
  ['Agent / Keagenan', 'Perusahaan yang mewakili kepentingan kapal di suatu pelabuhan.'],
  ['AIS', 'Automatic Identification System — data pergerakan kapal.'],
  ['ATA / ATB / ATD', 'Waktu sebenarnya tiba, sandar, dan berangkat.'],
  ['Clearance', 'Pengurusan izin masuk dan keluar pelabuhan.'],
  ['Coretax', 'Sistem perpajakan inti Direktorat Jenderal Pajak.'],
  ['Cash to Master', 'Uang tunai yang diserahkan kepada nakhoda atas nama pemilik kapal.'],
  ['DWT', 'Deadweight Tonnage — daya angkut total kapal.'],
  ['e-Faktur', 'Faktur pajak elektronik.'],
  ['EPDA', 'Estimated Port Disbursement Account — perkiraan biaya kunjungan pelabuhan.'],
  ['ETA / ETB / ETD', 'Perkiraan waktu tiba, sandar, dan berangkat.'],
  ['FDA', 'Final Disbursement Account — laporan biaya sebenarnya.'],
  ['FPDA', 'Perkiraan biaya lanjutan setelah EPDA awal.'],
  ['GT', 'Gross Tonnage — ukuran isi kotor kapal; dasar banyak tarif pelabuhan.'],
  ['Husbandry', 'Layanan kebutuhan kapal dan awaknya di pelabuhan.'],
  ['LOA', 'Length Overall — panjang keseluruhan kapal.'],
  ['NOR', 'Notice of Readiness — pemberitahuan kesiapan kapal.'],
  ['PDA', 'Port Disbursement Account — istilah umum biaya kunjungan.'],
  ['Pilotage', 'Jasa pandu.'],
  ['Port Call', 'Satu kunjungan kapal ke satu pelabuhan.'],
  ['Principal', 'Pihak yang menunjuk agen: pemilik, pengelola, atau penyewa kapal.'],
  ['SOF', 'Statement of Facts — catatan kejadian dan waktunya selama kunjungan.'],
  ['Towage', 'Jasa kapal tunda.'],
  ['UN/LOCODE', 'Kode pelabuhan internasional, misalnya IDSMR untuk Samarinda.'],
  ['Voyage', 'Satu kunjungan kapal beserta seluruh dokumen dan biayanya.'],
  ['Wharfage', 'Biaya dermaga berdasarkan tonase kargo.'],
]},

{ t: 'pb' },
{ t: 'h1', x: 'Lampiran B — Enam Keputusan Desain Fondasi' },
{ t: 'p', x: 'Keputusan berikut diambil pada Fase 0 dan menjadi acuan seluruh pembangunan berikutnya. Ringkasan ini disertakan agar pembaca dokumen ini memahami dasar rancangannya tanpa perlu membuka dokumen teknis.' },
{ t: 'table', head: ['Kode', 'Keputusan', 'Alasan'], w: [0.4, 1.5, 2.4], rows: [
  ['K1', 'Mengikuti tata nama yang sudah dipakai aplikasi, bukan tata nama pada naskah PRD', 'Konsistensi dalam satu basis kode lebih berharga daripada mencocokkan naskah; mencampur dua tata nama adalah sumber kesalahan.'],
  ['K2', 'Mempertahankan Principal sebagai pemberi order, dan menambah Customer sebagai pihak yang ditagih', 'Keduanya sering sama tetapi tidak selalu; mengganti nama data yang sudah dipakai luas berisiko tanpa manfaat.'],
  ['K3', 'Menyatukan EPDA, FPDA, dan FDA dalam satu bentuk data', 'Susunannya hampir identik, dan penyatuan membuat analisis selisih menjadi mudah.'],
  ['K4', 'Memisahkan tarif dari definisi jasa', 'Satu jasa memiliki tarif berbeda di tiap pelabuhan dan berubah seiring waktu.'],
  ['K5', 'Menyalin tarif ke dalam baris dokumen, bukan menunjuknya', 'Agar kenaikan tarif hari ini tidak mengubah nilai dokumen yang sudah dikirim tahun lalu. Keputusan paling penting untuk pemeriksaan dan sengketa.'],
  ['K6', 'Menyimpan cara hitung sebagai pilihan tertutup, bukan rumus bebas', 'Rumus bebas yang dijalankan sistem adalah lubang keamanan; pilihan tertutup menutup hampir seluruh kasus nyata dengan aman.'],
]},

{ t: 'pb' },
{ t: 'h1', x: 'Lampiran C — Hal yang Masih Terbuka' },
{ t: 'p', x: 'Daftar ini sengaja disertakan. Blueprint yang menyembunyikan hal yang belum diputuskan akan menyesatkan pembacanya, dan pertanyaan yang tidak tercatat akan muncul kembali pada saat yang paling merugikan.' },
{ t: 'table', head: ['No.', 'Hal', 'Harus diputuskan sebelum'], w: [0.35, 2.4, 1.5], rows: [
  ['1', 'Cara menegakkan pemisahan data antar-perusahaan: aturan di tingkat basis data atau penjagaan di lapisan layanan', 'Sistem melayani perusahaan di luar Tribuana (Fase 8)'],
  ['2', 'Visi dan misi resmi perusahaan — rumusan pada Bab 3 masih usulan', 'Dokumen dipakai ke pihak luar'],
  ['3', 'Daftar layanan resmi perusahaan pada Bab 2.4', 'Dokumen dipakai ke pihak luar'],
  ['4', 'Paket dan harga langganan pada Bab 11', 'Pembicaraan dengan pengguna awal (Fase 8)'],
  ['5', 'Ukuran pasar nyata: jumlah keagenan menengah yang layak menjadi sasaran', 'Pembicaraan dengan calon investor'],
  ['6', 'Pemeriksaan terbaru atas produk dan harga pesaing pada Bab 10', 'Pembicaraan dengan calon investor'],
  ['7', 'Pengukuran waktu penyusunan EPDA sebelum dan sesudah, sebagai bukti penghematan', 'Fase 3 dimulai — pengukuran awal harus diambil sekarang'],
  ['8', 'Penerapan skema data v2 ke basis data, beserta cadangan datanya', 'Fase 1 dimulai'],
  ['9', 'Pemakaian pustaka tambahan pada sisi antarmuka', 'Diputuskan per kebutuhan saat membangun'],
]},

{ t: 'rule' },
{ t: 'p', x: '**Akhir Volume 1.** Volume 2 memuat spesifikasi rinci tiap modul; Volume 3 memuat acuan teknis yang tumbuh bersama kode di dalam folder dokumentasi repositori.' },
{ t: 'p', x: '_Dokumen ini bersifat internal dan rahasia. Dilarang menyebarkan tanpa izin tertulis PT Tribuana Solusi Maritim._' },

];
