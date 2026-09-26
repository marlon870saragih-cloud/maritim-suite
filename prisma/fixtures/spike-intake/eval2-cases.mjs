// PRD-005 E5 Step 4 — EVAL-2 TARGETED — fixture SINTETIS + ground truth + gerbang pra-registrasi.
//
// Berkas ini HANYA data + pembangun dokumen. Bukan harness, tidak memanggil AI/jaringan.
// Ground truth ditulis MANUSIA sebelum run apa pun; TIDAK ada nilai yang berasal dari model.
// Eval-1 (eval1-cases.mjs, prd005-step3c-eval1/gt-2) TIDAK disentuh dan tetap berlaku sebagai
// uji regresi; Eval-2 adalah himpunan TERPISAH dengan versi, hash, dan gerbangnya sendiri.
//
// Tujuan: menguji apakah perbaikan E5 Step 1–3 (pagar tanggal berlabel, verifikasi OCR-aman +
// visibilitas kapal dibuang, prompt v2) BERLAKU UMUM — bukan sekadar menambal E03/E10/E15.
//
// ── Data sintetis ─────────────────────────────────────────────────────────────────────────
//   • IMO 99982xx–99983xx, check digit sah (dihitung deterministik; rentang berbeda dari Eval-1
//     99980xx–99981xx). "Hull No." / nomor karangan SENGAJA tidak sah & ditandai.
//   • MMSI 9902xxxxx (awalan 99 = alat bantu navigasi, bukan kapal).
//   • Email @contoh.invalid (RFC 2606); telepon berkode area 000.
//   • UN/LOCODE = yang TERTULIS di dokumen sintetis (keputusan owner K8 Eval-1 berlaku sama).
//   • Nama kapal sebagian ALAMI-fiktif (tanpa penanda), sebagian memuat penanda sentinel —
//     sengaja, untuk menguji hipotesis E03 (token tak lazim memengaruhi model). Nama alami bisa
//     kebetulan sama dengan kapal nyata; tak ada data nyata apa pun yang dikaitkan dengannya.
//
// ── Bentuk GT = Eval-1 (agar penilai Eval-1 dipakai ULANG tanpa diubah) ─────────────────────
//   PRESENT / ABSENT / ACCEPTABLE / NOT_SCORED, alias, koreksiOcr, terlarang, larangNew.
//   Tambahan Eval-2 (diabaikan penilai, dibaca uji & gerbang Eval-2):
//     kategori, polaritas (POSITIF|NEGATIF), adversarial, mekanisme, sentinelLokasi,
//     kapalDikecualikan (riwayat/sister/rujukan), harapanValidator (perilaku deterministik yang
//     WAJIB terjadi bila RAW berbentuk tertentu), node tanggal `tanpaTahun: true`.
//
// ── Tanggal ──────────────────────────────────────────────────────────────────────────────
//   Relatif terhadap hari eksekusi (validasi intake: −30…+365 hari). { offset } / { offsetMin,
//   hariMin } seperti Eval-1, ditambah { ref, tambah } = tanggal lain + n hari (menjamin dua
//   tanggal BERBEDA atau SAMA sesuai desain kasus). Tanggal tanpa tahun di dokumen → GT HANYA
//   KOSONG (ABSENT, tanpaTahun) — GT tidak pernah memuat tahun hasil simpulan.

export const EVAL2_VERSI = 'prd005-e5-eval2/gt-1'
/** Sentinel privasi per kasus: SNT2A … SNT2Z (T01 … T26). */
export const POLA_SENTINEL_EVAL2 = /SNT2[A-Z]/i
export const KOSONG = null

export const KATEGORI_EVAL2 = Object.freeze({
  OCR: { jumlah: 5, positif: 4, negatif: 1 },
  TANGGAL_TANPA_TAHUN: { jumlah: 5, positif: 5, negatif: 0 },
  MULTI_KAPAL: { jumlah: 4, positif: 4, negatif: 0 },
  NAMA_LINTAS_BAGIAN: { jumlah: 4, positif: 4, negatif: 0 },
  PARSIAL: { jumlah: 8, positif: 4, negatif: 4 },
})

/**
 * Keputusan Eval-2 — mengikat penilaian & gerbang; ikut dihitung dalam hash pembekuan.
 * K1–K8 Eval-1 berlaku apa adanya kecuali dipertegas di sini (tidak pernah dilonggarkan).
 */
export const KEPUTUSAN_EVAL2 = Object.freeze({
  E2K1_WARISAN:
    'Keputusan owner Eval-1 K1–K8 berlaku untuk Eval-2 apa adanya (NEW_NOMINATION ≡ NEW_APPOINTMENT pada kasus positif; identitas ketat K2; koreksi OCR K3; tanggal tak lengkap K4; lingkup uang K7; UN/LOCODE sintetis K8).',
  E2K2_KLASIFIKASI_PARSIAL:
    'Mengikuti aturan produksi (syaratMinimumTerpenuhi + prompt v2): identitas kapal DAN (pelabuhan ATAU ETA) = cukup → HANYA NEW_* yang benar. INSUFFICIENT_INFORMATION pada kasus positif = WRONG (MAJOR). Ini LEBIH KETAT dari Eval-1 E06 yang menerima INSUFFICIENT sebagai jawaban konservatif.',
  E2K3_TANGGAL:
    'Tanggal hanya dari field-nya sendiri dengan tahun tertulis. Setiap nilai tanggal (eta/etb/etc/etd/requestDate) yang terisi padahal GT ABSENT/tanpaTahun, atau salah terhadap GT, dihitung sebagai TANGGAL_TAK_BERBUKTI (setara F4) di SEMUA field tanggal — bukan hanya eta seperti FATAL_FIELD penilai Eval-1.',
  E2K4_UNLOCODE:
    'UN/LOCODE hanya bila tertulis (prompt v2 aturan OCR/pelabuhan). Kode yang tidak tertulis = HALLUCINATED (tidak ada tabel inferensi Eval-2). Karena itu sebagian besar kasus positif menulis kodenya; kasus tanpa kode sengaja sedikit dan disebut di `mekanisme`.',
  E2K5_KAPAL_DIKECUALIKAN:
    'Kapal riwayat / sister / rujukan (kapalDikecualikan) yang muncul di vessels (RAW atau POST) = F2 (nama) / F1 (IMO), apa pun hasil penyelarasan.',
  E2K6_HILANG_DIAM_DIAM:
    'Kapal peserta yang ada di RAW tetapi tidak ada di POST WAJIB tercermin di proposal.vesselsDropped. Hilang tanpa jejak = kegagalan keselamatan validator.',
  E2K7_TANPA_PDF:
    'Eval-2 sengaja 100% TEXT (OCR disimulasikan sebagai teks rusak). Recall PDF tidak terdefinisi (0/0), BUKAN nol — lihat GERBANG_EVAL2.G3.',
})

// ------------------------------------------------------------------ pembentuk GT
const P = (value, extra = {}) => ({ status: 'PRESENT', value, ...extra })
const A = (catatan) => ({ status: 'ABSENT', ...(catatan ? { catatan } : {}) })
const TT = (catatan) => ({ status: 'ABSENT', tanpaTahun: true, catatan })
const AC = (values, extra) => ({ status: 'ACCEPTABLE', values, ...(typeof extra === 'string' ? { catatan: extra } : extra ?? {}) })
const T = (ref) => ({ tanggalRef: ref })

const NEW_STAR = ['NEW_NOMINATION', 'NEW_APPOINTMENT']
const POSITIF = (catatan) => AC(NEW_STAR, catatan)
const INSUF = (catatan) => AC(['INSUFFICIENT_INFORMATION'], catatan)
const TANPA_MUATAN = { bentukDiterima: [[]] }
const TANPA_KONTAK = A()
const kapalTunggal = (ref, x) => ({ ref, name: A(), imo: A(), mmsi: A(), callSign: A(), vesselType: A(), role: A('Kapal tunggal.'), ...x })

/** Tanggal ABSENT untuk semua field yang tak disebut. */
const tanggalKosong = { eta: A(), etb: A(), etc: A(), etd: A(), requestDate: A() }
const pihakKosong = { principalName: A(), customerName: A(), agencyType: A(), clientReference: A(), jetty: A() }

// ================================================================== KASUS
export const KASUS_EVAL2 = Object.freeze([
  // ============================================================ 1. OCR (T01–T05)
  {
    id: 'T01',
    kind: 'TEXT',
    sentinel: 'SNT2A',
    kategori: 'OCR',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'PIHAK',
    judul: 'Faksimile ber-OCR: nama kapal rusak O/0 dan I/1',
    mekanisme: 'O↔0 dan I↔1 pada NAMA kapal; IMO bersih; kuantitas ribuan bertitik.',
    tanggal: { ETA: { offsetMin: 18, hariMin: 13 } },
    teks: (t) =>
      [
        'SCAN OCR - FAKSIMILE NOMINASI',
        'Vessel Name : MV L1NTANG B0REAL',
        'IMO Number  : 9998200',
        'Port        : Samarinda (IDSRI)',
        `E.T.A.      : ${t.ETA.dmy}`,
        'Cargo       : Coal 8.500 MT loading',
        'Principal   : PT SNT2A Samudra Lines (faksimile diterima jam 09.40)',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(1),
        daftar: [kapalTunggal('V1', { name: P('LINTANG BOREAL', { alias: ['L1NTANG B0REAL'], koreksiOcr: ['LINTANG BOREAL'] }), imo: P('9998200') })],
      },
      portName: P('SAMARINDA'),
      portUnlocode: P('IDSRI'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      principalName: P('SNT2A SAMUDRA LINES'),
      cargoes: { bentukDiterima: [[{ name: P('Coal', { sinonim: ['COAL', 'BATUBARA'] }), quantity: P(8500), unit: P('MT'), operation: P('LOAD') }]] },
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'OCR_CORRECTED', kapal: 'V1', field: 'name', raw: 'MV LINTANG BOREAL' }],
  },
  {
    id: 'T02',
    kind: 'TEXT',
    sentinel: 'SNT2B',
    kategori: 'OCR',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'REFERENSI',
    judul: 'Salinan OCR: IMO & MMSI rusak I/l/1',
    mekanisme: 'l dan I menggantikan 1 pada IMO & MMSI; nama bersih. IMO literal rusak di POST = F1 (K2).',
    tanggal: { ETA: { offset: 24 } },
    teks: (t) =>
      [
        'Nomination (OCR copy)',
        'Vessel    : MV SELAT MAKMUR',
        'IMO       : 99983l5',
        'MMSI      : 99021I00l',
        'Call Sign : YZSM2',
        'Port of call : Balikpapan / IDBPN',
        `ETA : ${t.ETA.enLong}`,
        'Our reference NOM/SNT2B/2026-0412 must be quoted in all correspondence.',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(1),
        daftar: [
          kapalTunggal('V1', {
            name: P('SELAT MAKMUR'),
            imo: AC(['9998315', KOSONG], { koreksiOcr: ['9998315'], catatan: 'Literal "99983l5" di POST = F1 (K2).' }),
            mmsi: AC(['990211001', KOSONG], { koreksiOcr: ['990211001'], catatan: 'Literal "99021I00l" bukan MMSI sah.' }),
            callSign: P('YZSM2'),
          }),
        ],
      },
      portName: P('BALIKPAPAN'),
      portUnlocode: P('IDBPN'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      clientReference: P('NOM/SNT2B/2026-0412'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [
      { jenis: 'OCR_CORRECTED', kapal: 'V1', field: 'imo', raw: '9998315' },
      { jenis: 'OCR_CORRECTED', kapal: 'V1', field: 'mmsi', raw: '990211001' },
    ],
  },
  {
    id: 'T03',
    kind: 'TEXT',
    sentinel: 'SNT2C',
    kategori: 'OCR',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'KONTAK',
    judul: 'Identitas numerik & call sign berspasi',
    mekanisme: 'IMO "9 998 224", MMSI "990 203 003", call sign "Y Z G S 3" — satu nilai masing-masing; ETA & ETD sebaris.',
    tanggal: { ETA: { offsetMin: 30, hariMin: 13 }, ETD: { ref: 'ETA', tambah: 2 } },
    teks: (t) =>
      [
        'Dear Agent,',
        'Please attend our vessel as per below particulars:',
        '  Name     : MV GELOMBANG SENJA',
        '  IMO      : 9 998 224',
        '  MMSI     : 990 203 003',
        '  Callsign : Y Z G S 3',
        `Destination Bontang (IDBXT), ETA ${t.ETA.dotdmy}, ETD ${t.ETD.dotdmy}.`,
        'Cargo: Urea in bulk 12,000 MT to discharge.',
        'Regards, Maya - maya.snt2c@contoh.invalid / +62-000-000-2203',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('GELOMBANG SENJA'), imo: P('9998224'), mmsi: P('990203003'), callSign: P('YZGS3') })] },
      portName: P('BONTANG'),
      portUnlocode: P('IDBXT'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      etd: P(T('ETD')),
      ...pihakKosong,
      cargoes: { bentukDiterima: [[{ name: P('Urea in bulk', { sinonim: ['UREA', 'UREA IN BULK'] }), quantity: P(12000), unit: P('MT'), operation: P('DISCHARGE') }]] },
      contact: { name: AC(['Maya', KOSONG]), email: P('maya.snt2c@contoh.invalid'), phone: AC(['+62-000-000-2203', KOSONG]) },
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T04',
    kind: 'TEXT',
    sentinel: 'SNT2D',
    kategori: 'OCR',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'NAMA_KAPAL',
    judul: 'Label field rusak OCR, nilai bersih',
    mekanisme: 'Label "Vsl Nm", "1M0", "MMS1", "P0rt 0f Ca11", "Princ1pal", "0perat10n"; nilai sendiri bersih. Label ETA tetap terbaca ("E.T.A").',
    tanggal: { ETA: { offset: 45 } },
    teks: (t) =>
      [
        'N0MINATI0N N0TICE (scanned)',
        'Vsl Nm       : MV SNT2D KENCANA RAYA',
        '1M0          : 9998236',
        'MMS1         : 990204004',
        'P0rt 0f Ca11 : Makassar (IDMAK)',
        `E.T.A        : ${t.ETA.idLong}`,
        '0perat10n    : discharge 3.200 MT general cargo',
        'Princ1pal    : PT Arunika Niaga',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('SNT2D KENCANA RAYA'), imo: P('9998236'), mmsi: P('990204004') })] },
      portName: P('MAKASSAR'),
      portUnlocode: P('IDMAK'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      principalName: P('ARUNIKA NIAGA'),
      cargoes: { bentukDiterima: [[{ name: P('general cargo', { sinonim: ['GENERAL CARGO'] }), quantity: P(3200), unit: P('MT'), operation: P('DISCHARGE') }]] },
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T05',
    kind: 'TEXT',
    sentinel: 'SNT2E',
    kategori: 'OCR',
    polaritas: 'NEGATIF',
    adversarial: true,
    sentinelLokasi: 'CATATAN',
    judul: 'Faks buram: identitas kapal benar-benar tak terbaca',
    mekanisme: 'Nama & IMO rusak berat (bukan salah baca O/0/I/1). Wajib KOSONG → tanpa identitas kapal → INSUFFICIENT walau pelabuhan & ETA ada.',
    tanggal: { ETA: { offsetMin: 20, hariMin: 13 } },
    teks: (t) =>
      [
        '[FAX - kualitas rendah, sebagian tidak terbaca]',
        'Vessel : MV ##R#A ###R',
        'IMO : 99#8##4',
        'Pelabuhan tujuan : Balikpapan (IDBPN)',
        `ETA : ${t.ETA.dmy}`,
        'Mohon siapkan keagenan. - dikirim dari mesin faks SNT2E-ops kantor cabang',
      ].join('\n'),
    gt: {
      classification: INSUF('Identitas kapal tak terbaca → tidak ada identitas terpakai (§7).'),
      larangNew: 'NEW_* hanya mungkin bila model MENEBAK nama/IMO yang tak terbaca.',
      vessels: { jumlah: P(0), daftar: [] },
      portName: P('BALIKPAPAN'),
      portUnlocode: P('IDBPN'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'KAPAL_DIBUANG', raw: [{ name: 'MV ORCA STAR', imo: '9998244' }], vesselsDropped: 1, klasifikasiPost: 'INSUFFICIENT_INFORMATION' }],
  },

  // ============================================================ 2. TANGGAL TANPA TAHUN (T06–T10)
  {
    id: 'T06',
    kind: 'TEXT',
    sentinel: 'SNT2F',
    kategori: 'TANGGAL_TANPA_TAHUN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'PIHAK',
    judul: 'Surat penunjukan: ETA hanya DD/MM',
    mekanisme: 'ETA "DD/MM" tanpa tahun → KOSONG; kapal + pelabuhan cukup → NEW_* (INSUFFICIENT = salah, E2K2).',
    tanggal: { X: { offsetMin: 30, hariMin: 13 } },
    teks: (t) =>
      [
        'Kepada Yth. Agen Pelayaran',
        'Perihal: Penunjukan keagenan MV TELUK HARAPAN',
        '',
        'Kapal       : MV TELUK HARAPAN (IMO 9998248)',
        'Pelabuhan   : Tarakan (IDTRK)',
        `ETA         : ${t.X.dm}`,
        'Muatan      : bongkar semen 4.000 MT',
        '',
        'Principal: PT SNT2F Semen Borneo Lestari',
      ].join('\n'),
    gt: {
      classification: POSITIF('Kapal + pelabuhan → syarat minimum terpenuhi walau ETA tanpa tahun.'),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('TELUK HARAPAN'), imo: P('9998248') })] },
      portName: P('TARAKAN'),
      portUnlocode: P('IDTRK'),
      ...tanggalKosong,
      eta: TT('"DD/MM" tanpa tahun → hanya KOSONG.'),
      ...pihakKosong,
      principalName: P('SNT2F SEMEN BORNEO LESTARI'),
      cargoes: { bentukDiterima: [[{ name: P('semen', { sinonim: ['SEMEN', 'CEMENT'] }), quantity: P(4000), unit: P('MT'), operation: P('DISCHARGE') }]] },
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'DATE_NOT_IN_SOURCE', field: 'eta', rawRef: 'X' }],
  },
  {
    id: 'T07',
    kind: 'TEXT',
    sentinel: 'SNT2G',
    kategori: 'TANGGAL_TANPA_TAHUN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'NAMA_KAPAL',
    judul: 'Email appointment: arrival "D Month" tanpa tahun, departure relatif',
    mekanisme: 'Arrival "13 December" tanpa tahun; departure "two days after completion" bukan tanggal; tanggal surat bertahun (label Date).',
    tanggal: { REQ: { offset: -2 }, X: { offsetMin: 40, hariMin: 13 } },
    teks: (t) =>
      [
        `Date: ${t.REQ.enLong}`,
        'Subject: Appointment as agent - MV SNT2G PERTIWI SAKTI',
        '',
        'Dear Sirs,',
        'We appoint you as husbandry agent for MV SNT2G PERTIWI SAKTI, MMSI 990207007, calling Surabaya (IDSUB).',
        `Expected arrival: ${t.X.dBulanEn}`,
        'Estimated departure: two days after completion of discharge.',
        '',
        'Best regards,',
        'Operations Desk',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('SNT2G PERTIWI SAKTI'), mmsi: P('990207007') })] },
      portName: P('SURABAYA'),
      portUnlocode: P('IDSUB'),
      ...tanggalKosong,
      eta: TT('"D Month" tanpa tahun → hanya KOSONG.'),
      etd: TT('Bukan tanggal (relatif terhadap selesai bongkar).'),
      requestDate: P(T('REQ')),
      ...pihakKosong,
      agencyType: P('HUSBANDRY'),
      cargoes: TANPA_MUATAN,
      contact: A('"Operations Desk" bukan narahubung perorangan; tanpa email/telepon.'),
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'DATE_NOT_IN_SOURCE', field: 'eta', rawRef: 'X' }],
  },
  {
    id: 'T08',
    kind: 'TEXT',
    sentinel: 'SNT2H',
    kategori: 'TANGGAL_TANPA_TAHUN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'KONTAK',
    judul: 'Chat informal: "tgl 5", "tgl 6"',
    mekanisme: 'Tanggal informal hari-saja untuk ETA & ETB → KOSONG; pelabuhan tanpa UN/LOCODE (kode tak boleh ditebak).',
    tanggal: {},
    teks: () =>
      [
        '[WA 07.52] Pak, TB SAMUDRA KENCANA 12 rencana masuk Banjarmasin tgl 5, sandar tgl 6 kalau dermaga kosong.',
        '[WA 07.53] Call sign YZSK12. Nanti PIC-nya saya, Hendra (hendra.snt2h@contoh.invalid).',
        '[WA 07.55] Muatan kosong, cuma ganti kru.',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(1),
        daftar: [kapalTunggal('V1', { name: P('SAMUDRA KENCANA 12'), callSign: P('YZSK12'), role: AC([KOSONG, 'TUG'], 'Awalan TB = tug; tanpa tongkang, peran boleh kosong.') })],
      },
      portName: P('BANJARMASIN'),
      portUnlocode: A('Tidak tertulis (E2K4).'),
      ...tanggalKosong,
      eta: TT('"tgl 5" tanpa bulan & tahun.'),
      etb: TT('"tgl 6" tanpa bulan & tahun.'),
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: { name: AC(['Hendra', KOSONG]), email: P('hendra.snt2h@contoh.invalid'), phone: A() },
      terlarang: [],
    },
    harapanValidator: [
      { jenis: 'DATE_NOT_IN_SOURCE', field: 'eta', rawIso: 'HARI_5_BULAN_DEPAN' },
      { jenis: 'DATE_NOT_IN_SOURCE', field: 'etb', rawIso: 'HARI_6_BULAN_DEPAN' },
    ],
  },
  {
    id: 'T09',
    kind: 'TEXT',
    sentinel: 'SNT2I',
    kategori: 'TANGGAL_TANPA_TAHUN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'PIHAK',
    judul: 'LOA: ETA tanpa tahun, ETD & tanggal surat bertahun (tanggal berbeda)',
    mekanisme: 'ETA "D Mon" tanpa tahun; ETD & tanggal surat bertahun — tahun tak boleh dipinjam ke ETA.',
    tanggal: { REQ: { offset: -3 }, X: { offsetMin: 20, hariMin: 13 }, ETD: { ref: 'X', tambah: 3 } },
    teks: (t) =>
      [
        'LETTER OF APPOINTMENT',
        `Tanggal surat : ${t.REQ.dmy}`,
        'Principal : PT SNT2I Mineral Kaltim',
        'Vessel    : MV BUNGA RAMPAI (IMO 9998274)',
        'Port      : Samarinda (IDSRI)',
        `ETA       : ${t.X.dMonEn} (tentative)`,
        `ETD       : ${t.ETD.dmy}`,
        'Kegiatan  : muat nikel ore 50.000 MT',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('BUNGA RAMPAI'), imo: P('9998274') })] },
      portName: P('SAMARINDA'),
      portUnlocode: P('IDSRI'),
      ...tanggalKosong,
      eta: TT('"D Mon" tanpa tahun; tahun ETD/tanggal surat tidak boleh dipinjam.'),
      etd: P(T('ETD')),
      requestDate: P(T('REQ')),
      ...pihakKosong,
      principalName: P('SNT2I MINERAL KALTIM'),
      cargoes: { bentukDiterima: [[{ name: P('nikel ore', { sinonim: ['NIKEL ORE', 'NICKEL ORE', 'NIKEL'] }), quantity: P(50000), unit: P('MT'), operation: P('LOAD') }]] },
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'DATE_NOT_IN_SOURCE', field: 'eta', rawRef: 'X' }],
  },
  {
    id: 'T10',
    kind: 'TEXT',
    sentinel: 'SNT2J',
    kategori: 'TANGGAL_TANPA_TAHUN',
    polaritas: 'POSITIF',
    adversarial: true,
    sentinelLokasi: 'REFERENSI',
    judul: 'Adversarial: tiba DD/MM tanpa tahun, berangkat tanggal SAMA bertahun + "hari yang sama"',
    mekanisme: 'ETD bertahun jatuh di tanggal kalender yang SAMA dengan ETA tanpa tahun, dan teks bilang "tiba dan berangkat di hari yang sama" — umpan inferensi. ETA tetap KOSONG.',
    tanggal: { D: { offsetMin: 30, hariMin: 13 } },
    teks: (t) =>
      [
        'Ref: SNT2J/OPS/1010 - konfirmasi jadwal kunjungan singkat',
        'Kapal : MV RATU PESISIR, MMSI 990210010',
        'Pelabuhan : Kendari (IDKDI)',
        `Rencana tiba : ${t.D.dm}`,
        `Rencana berangkat : ${t.D.idLong}`,
        'Catatan: kapal hanya lego jangkar untuk bunker, tiba dan berangkat di hari yang sama.',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('RATU PESISIR'), mmsi: P('990210010') })] },
      portName: P('KENDARI'),
      portUnlocode: P('IDKDI'),
      ...tanggalKosong,
      eta: TT('Tiba "DD/MM" tanpa tahun. Menyimpulkan dari ETD / "hari yang sama" = F4 (K4).'),
      etd: P(T('D')),
      ...pihakKosong,
      clientReference: P('SNT2J/OPS/1010'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'DATE_NOT_IN_SOURCE', field: 'eta', rawRef: 'D' }],
  },

  // ============================================================ 3. MULTI-KAPAL (T11–T14)
  {
    id: 'T11',
    kind: 'TEXT',
    sentinel: 'SNT2K',
    kategori: 'MULTI_KAPAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'NAMA_KAPAL',
    judul: '1 tug + 2 tongkang dalam tabel pipa, sentinel DI nama kapal (hipotesis E03)',
    mekanisme: 'Konvoi 3 kapal; SEMUA nama memuat token tak lazim SNT2K. Pembanding langsung T12/T13 (nama alami).',
    tanggal: { ETA: { offset: 26 } },
    teks: (t) =>
      [
        'Kepada: Agen',
        'Nominasi konvoi untuk satu kunjungan ke Samarinda (IDSRI):',
        '| Peran | Nama kapal          | Identitas       |',
        '| Tug   | TB SNT2K ARJUNA 05  | MMSI 990211005  |',
        '| Barge | BG SNT2K PRIMA 301  | -               |',
        '| Barge | BG SNT2K PRIMA 302  | -               |',
        `ETA konvoi: ${t.ETA.dMonYYYY}`,
        'Muatan: batubara total 15.000 MT, muat.',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(3),
        daftar: [
          { ref: 'TUG', name: P('SNT2K ARJUNA 05'), imo: A(), mmsi: P('990211005'), callSign: A(), vesselType: A(), role: P('TUG') },
          { ref: 'BG1', name: P('BG SNT2K PRIMA 301', { alias: ['SNT2K PRIMA 301'] }), imo: A(), mmsi: A('Jangan disalin dari tug.'), callSign: A(), vesselType: A(), role: P('BARGE') },
          { ref: 'BG2', name: P('BG SNT2K PRIMA 302', { alias: ['SNT2K PRIMA 302'] }), imo: A(), mmsi: A('Jangan disalin dari tug.'), callSign: A(), vesselType: A(), role: P('BARGE') },
        ],
      },
      portName: P('SAMARINDA'),
      portUnlocode: P('IDSRI'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      cargoes: { bentukDiterima: [[{ name: P('batubara', { sinonim: ['BATUBARA', 'COAL'] }), quantity: P(15000), unit: P('MT'), operation: P('LOAD') }]] },
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [
      {
        jenis: 'KAPAL_DIBUANG',
        catatan: 'Mode kegagalan E03: token SNT2K dibuang dari nama tongkang → validator membuang & MENGHITUNG, tug tetap.',
        raw: [
          { name: 'TB SNT2K ARJUNA 05', mmsi: '990211005', role: 'TUG' },
          { name: 'BG PRIMA 301', role: 'BARGE' },
          { name: 'BG PRIMA 302', role: 'BARGE' },
        ],
        vesselsDropped: 2,
        klasifikasiPost: 'NEW_NOMINATION',
      },
    ],
  },
  {
    id: 'T12',
    kind: 'TEXT',
    sentinel: 'SNT2L',
    kategori: 'MULTI_KAPAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'KONTAK',
    judul: '1 tug + 3 tongkang, nama alami, daftar berpoin',
    mekanisme: 'Empat kapal; nama tanpa penanda; tongkang bernomor berurutan (uji kelengkapan larik).',
    tanggal: { ETA: { offsetMin: 22, hariMin: 13 } },
    teks: (t) =>
      [
        'Subject: Nominasi - TB BINTANG KERSIK 8 dengan 3 tongkang, Balikpapan',
        'Mohon keagenan untuk rangkaian berikut (satu kali sandar di Balikpapan / IDBPN):',
        '- kapal tunda TB BINTANG KERSIK 8, call sign YZBK8',
        '- tongkang BG MUARA JAYA 3101',
        '- tongkang BG MUARA JAYA 3102',
        '- tongkang BG MUARA JAYA 3103',
        `ETA ${t.ETA.dmy}. Kegiatan: bongkar split batu 22.500 MT.`,
        'Kontak: Lukas, lukas.snt2l@contoh.invalid',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(4),
        daftar: [
          { ref: 'TUG', name: P('BINTANG KERSIK 8'), imo: A(), mmsi: A(), callSign: P('YZBK8'), vesselType: A(), role: P('TUG') },
          { ref: 'BG1', name: P('BG MUARA JAYA 3101', { alias: ['MUARA JAYA 3101'] }), imo: A(), mmsi: A(), callSign: A('Jangan disalin dari tug.'), vesselType: A(), role: P('BARGE') },
          { ref: 'BG2', name: P('BG MUARA JAYA 3102', { alias: ['MUARA JAYA 3102'] }), imo: A(), mmsi: A(), callSign: A('Jangan disalin dari tug.'), vesselType: A(), role: P('BARGE') },
          { ref: 'BG3', name: P('BG MUARA JAYA 3103', { alias: ['MUARA JAYA 3103'] }), imo: A(), mmsi: A(), callSign: A('Jangan disalin dari tug.'), vesselType: A(), role: P('BARGE') },
        ],
      },
      portName: P('BALIKPAPAN'),
      portUnlocode: P('IDBPN'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      cargoes: { bentukDiterima: [[{ name: P('split batu', { sinonim: ['SPLIT BATU', 'SPLIT', 'BATU SPLIT', 'CRUSHED STONE'] }), quantity: P(22500), unit: P('MT'), operation: P('DISCHARGE') }]] },
      contact: { name: AC(['Lukas', KOSONG]), email: P('lukas.snt2l@contoh.invalid'), phone: A() },
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T13',
    kind: 'TEXT',
    sentinel: 'SNT2M',
    kategori: 'MULTI_KAPAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'REFERENSI',
    judul: '2 tug (utama + assist) + 2 tongkang dalam satu baris',
    mekanisme: 'Dua tug sama-sama peserta; dua tongkang disebut dalam SATU baris ("dan"); label ETA/ETB berbagi satu tanggal.',
    tanggal: { ETA: { offset: 33 } },
    teks: (t) =>
      [
        'REF: TWB/SNT2M/1313 - assist tug arrangement',
        'Rangkaian kunjungan ke Bontang (IDBXT):',
        'Tug utama  : TB RAJAWALI SAKTI 21 (MMSI 990213021)',
        'Tug assist : TB RAJAWALI SAKTI 22 (MMSI 990213022)',
        'Tongkang   : BG KALTIM PERKASA 3301 dan BG KALTIM PERKASA 3302',
        `ETA/ETB    : ${t.ETA.iso}`,
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(4),
        daftar: [
          { ref: 'TUG1', name: P('RAJAWALI SAKTI 21'), imo: A(), mmsi: P('990213021'), callSign: A(), vesselType: A(), role: P('TUG') },
          { ref: 'TUG2', name: P('RAJAWALI SAKTI 22'), imo: A(), mmsi: P('990213022'), callSign: A(), vesselType: A(), role: P('TUG') },
          { ref: 'BG1', name: P('BG KALTIM PERKASA 3301', { alias: ['KALTIM PERKASA 3301'] }), imo: A(), mmsi: A(), callSign: A(), vesselType: A(), role: P('BARGE') },
          { ref: 'BG2', name: P('BG KALTIM PERKASA 3302', { alias: ['KALTIM PERKASA 3302'] }), imo: A(), mmsi: A(), callSign: A(), vesselType: A(), role: P('BARGE') },
        ],
      },
      portName: P('BONTANG'),
      portUnlocode: P('IDBXT'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      etb: AC([T('ETA'), KOSONG], 'Label "ETA/ETB" berbagi satu tanggal; ETB boleh diisi tanggal itu atau dikosongkan.'),
      ...pihakKosong,
      clientReference: P('TWB/SNT2M/1313'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T14',
    kind: 'TEXT',
    sentinel: 'SNT2N',
    kategori: 'MULTI_KAPAL',
    polaritas: 'POSITIF',
    adversarial: true,
    sentinelLokasi: 'PIHAK',
    judul: 'Kapal riwayat disebut lengkap dengan IMO, bukan peserta',
    mekanisme: 'Satu kapal peserta; kapal kunjungan tahun lalu (nama + IMO) harus DIKECUALIKAN.',
    tanggal: { ETA: { offset: 40 } },
    teks: (t) =>
      [
        'Dari: PT SNT2N Logistik Nusantara',
        'Perihal: Nominasi MV CAHAYA TIMUR - Makassar',
        '',
        'Kami menominasikan Saudara untuk kunjungan MV CAHAYA TIMUR (IMO 9998303) ke Makassar (IDMAK),',
        `ETA ${t.ETA.idLong}, muat jagung 6.000 MT.`,
        'Sebagai referensi, kunjungan kami tahun lalu memakai MV PELANGI SELATAN (IMO 9998341) dan ditangani dengan baik.',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('CAHAYA TIMUR'), imo: P('9998303') })] },
      portName: P('MAKASSAR'),
      portUnlocode: P('IDMAK'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      principalName: P('SNT2N LOGISTIK NUSANTARA'),
      cargoes: { bentukDiterima: [[{ name: P('jagung', { sinonim: ['JAGUNG', 'CORN', 'MAIZE'] }), quantity: P(6000), unit: P('MT'), operation: P('LOAD') }]] },
      contact: TANPA_KONTAK,
      terlarang: [{ nilai: '9998341', lingkup: 'vessels.imo', fatal: 'F1', alasan: 'IMO kapal riwayat, bukan peserta.' }],
    },
    kapalDikecualikan: [{ name: 'PELANGI SELATAN', imo: '9998341', alasan: 'RIWAYAT' }],
    harapanValidator: [],
  },

  // ============================================================ 4. NAMA LINTAS BAGIAN (T15–T18)
  {
    id: 'T15',
    kind: 'TEXT',
    sentinel: 'SNT2O',
    kategori: 'NAMA_LINTAS_BAGIAN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'REFERENSI',
    judul: 'Nama kapal HANYA di subject; badan merujuk "the above vessel"',
    mekanisme: 'Identitas numerik di badan, nama di subject — harus digabung jadi SATU kapal.',
    tanggal: { ETA: { offset: 28 } },
    teks: (t) =>
      [
        'Subject: Nomination - MV KENANGA LAUT - Tarakan - ref SNT2O/2026/15',
        '',
        'Dear Agent,',
        'Please be nominated as agent for the above vessel.',
        'IMO 9998327, call sign YZKL5.',
        `Arrival Tarakan (IDTRK) on ${t.ETA.enLong}.`,
        'Kind regards,',
        'Chartering',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('KENANGA LAUT'), imo: P('9998327'), callSign: P('YZKL5') })] },
      portName: P('TARAKAN'),
      portUnlocode: P('IDTRK'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      clientReference: P('SNT2O/2026/15'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T16',
    kind: 'TEXT',
    sentinel: 'SNT2P',
    kategori: 'NAMA_LINTAS_BAGIAN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'NAMA_KAPAL',
    judul: 'Badan menyebut "kapal kami", identitas di tabel item/keterangan',
    mekanisme: 'Nama & data hanya di tabel dua kolom (baris ETA memuat tanggal → bukan judul kolom); "pekan depan" bukan tanggal.',
    tanggal: { ETA: { offsetMin: 8, hariMin: 13 } },
    teks: (t) =>
      [
        'Yth. Agen,',
        'kapal kami akan singgah di Surabaya pekan depan, rincian di tabel.',
        '',
        '| Item      | Keterangan             |',
        '| Kapal     | MV SNT2P SEROJA BIRU   |',
        '| IMO       | 9998339                |',
        '| Pelabuhan | Surabaya (IDSUB)       |',
        `| ETA       | ${t.ETA.dmy}             |`,
        '',
        'Tolong dikonfirmasi. Salam, Rudi',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('SNT2P SEROJA BIRU'), imo: P('9998339') })] },
      portName: P('SURABAYA'),
      portUnlocode: P('IDSUB'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: { name: AC(['Rudi', KOSONG]), email: A(), phone: A() },
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T17',
    kind: 'TEXT',
    sentinel: 'SNT2Q',
    kategori: 'NAMA_LINTAS_BAGIAN',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'KONTAK',
    judul: 'Formulir berseksi A–D (partikular, panggilan, muatan, kontak)',
    mekanisme: 'Nama & IMO di seksi A, pelabuhan/ETA/ETD di seksi B, muatan di C — data tersebar di bagian terstruktur.',
    tanggal: { ETA: { offsetMin: 35, hariMin: 13 }, ETD: { ref: 'ETA', tambah: 4 } },
    teks: (t) =>
      [
        '=== SECTION A: VESSEL PARTICULARS ===',
        'Name: MV SAWUNG GALING',
        'IMO: 9998353 | Flag: Indonesia | Type: Chemical Tanker',
        '=== SECTION B: CALL DETAILS ===',
        'Port of call: Banjarmasin (IDBDJ)',
        `ETA: ${t.ETA.dotdmy}`,
        `ETD: ${t.ETD.dotdmy}`,
        '=== SECTION C: CARGO ===',
        'Discharge: Caustic Soda 3,000 MT',
        '=== SECTION D: CONTACT ===',
        'Mira, mira.snt2q@contoh.invalid',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: {
        jumlah: P(1),
        daftar: [kapalTunggal('V1', { name: P('SAWUNG GALING'), imo: P('9998353'), vesselType: P('Chemical Tanker', { sinonim: ['CHEMICAL TANKER', 'TANKER'] }) })],
      },
      portName: P('BANJARMASIN'),
      portUnlocode: P('IDBDJ'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      etd: P(T('ETD')),
      ...pihakKosong,
      cargoes: { bentukDiterima: [[{ name: P('Caustic Soda', { sinonim: ['CAUSTIC SODA'] }), quantity: P(3000), unit: P('MT'), operation: P('DISCHARGE') }]] },
      contact: { name: AC(['Mira', KOSONG]), email: P('mira.snt2q@contoh.invalid'), phone: A() },
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T18',
    kind: 'TEXT',
    sentinel: 'SNT2R',
    kategori: 'NAMA_LINTAS_BAGIAN',
    polaritas: 'POSITIF',
    adversarial: true,
    sentinelLokasi: 'CATATAN',
    judul: 'Sister vessel (nama + IMO) disebut sebagai rujukan',
    mekanisme: 'Satu kapal peserta; sister vessel yang pernah ditangani harus DIKECUALIKAN.',
    tanggal: { ETA: { offset: 50 } },
    teks: (t) =>
      [
        'Nominasi keagenan',
        `MV ANGGREK SAMUDRA (IMO 9998365) akan tiba di Samarinda (IDSRI) pada ${t.ETA.idLong}.`,
        'Kapal ini adalah sister vessel dari MV ANGGREK BAHARI (IMO 9998377) yang bulan lalu Saudara tangani - spesifikasi keduanya sama.',
        'Muatan: muat batubara 42.000 MT.',
        '-- dokumen ini dibuat otomatis oleh sistem SNT2R-dispatch, mohon tidak membalas --',
      ].join('\n'),
    gt: {
      classification: POSITIF(),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('ANGGREK SAMUDRA'), imo: P('9998365') })] },
      portName: P('SAMARINDA'),
      portUnlocode: P('IDSRI'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      cargoes: { bentukDiterima: [[{ name: P('batubara', { sinonim: ['BATUBARA', 'COAL'] }), quantity: P(42000), unit: P('MT'), operation: P('LOAD') }]] },
      contact: TANPA_KONTAK,
      terlarang: [{ nilai: '9998377', lingkup: 'vessels.imo', fatal: 'F1', alasan: 'IMO sister vessel, bukan peserta.' }],
    },
    kapalDikecualikan: [{ name: 'ANGGREK BAHARI', imo: '9998377', alasan: 'SISTER' }],
    harapanValidator: [],
  },

  // ============================================================ 5. PARSIAL (T19–T26)
  {
    id: 'T19',
    kind: 'TEXT',
    sentinel: 'SNT2S',
    kategori: 'PARSIAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'PIHAK',
    judul: 'Kapal + pelabuhan, ETA belum ada',
    mekanisme: 'Syarat minimum lewat nama kapal + pelabuhan; ETA tak ada → NEW_* (bukan INSUFFICIENT).',
    tanggal: {},
    teks: () =>
      [
        'Pak, mohon disiapkan keagenan untuk MV DERMAGA INDAH di Pelabuhan Kendari (IDKDI).',
        'ETA belum ada, menunggu jadwal dari pemilik muatan.',
        'Principal: CV SNT2S Bahari Sulawesi',
      ].join('\n'),
    gt: {
      classification: POSITIF('Kapal + pelabuhan cukup; ETA kosong bukan alasan INSUFFICIENT.'),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('DERMAGA INDAH') })] },
      portName: P('KENDARI'),
      portUnlocode: P('IDKDI'),
      ...tanggalKosong,
      ...pihakKosong,
      principalName: P('SNT2S BAHARI SULAWESI'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T20',
    kind: 'TEXT',
    sentinel: 'SNT2T',
    kategori: 'PARSIAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'CATATAN',
    judul: 'Hanya IMO + ETA, pelabuhan belum dikonfirmasi',
    mekanisme: 'Identitas = IMO saja (nama menyusul); ETA bertahun; tanpa pelabuhan → NEW_*.',
    tanggal: { ETA: { offset: 21 } },
    teks: (t) =>
      [
        'Nomination request',
        'IMO: 9998389 (vessel name to follow)',
        `ETA: ${t.ETA.dMonYYYY}`,
        'Port: to be confirmed by charterers',
        'Sent via SNT2T-portal automated notification service',
      ].join('\n'),
    gt: {
      classification: POSITIF('IMO + ETA memenuhi syarat minimum.'),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { imo: P('9998389') })] },
      portName: A('"to be confirmed".'),
      portUnlocode: A(),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T21',
    kind: 'TEXT',
    sentinel: 'SNT2U',
    kategori: 'PARSIAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'KONTAK',
    judul: 'MMSI + call sign + UN/LOCODE saja (tanpa nama pelabuhan, tanpa ETA)',
    mekanisme: 'Pelabuhan hanya lewat kode "IDMAK"; nama pelabuhan tak boleh diisi dari kode.',
    tanggal: {},
    teks: () =>
      [
        'AIS pre-arrival notice',
        'MMSI 990221021 / C/S YZAU1',
        'Destination code: IDMAK',
        'Name and ETA will be sent separately.',
        'Contact: ops desk - ops.snt2u@contoh.invalid',
      ].join('\n'),
    gt: {
      classification: POSITIF('Identitas (MMSI/call sign) + UN/LOCODE memenuhi syarat minimum.'),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { mmsi: P('990221021'), callSign: P('YZAU1') })] },
      portName: A('Hanya kode tertulis; nama tidak boleh diturunkan dari kode.'),
      portUnlocode: P('IDMAK'),
      ...tanggalKosong,
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: { name: AC([KOSONG, 'ops desk']), email: P('ops.snt2u@contoh.invalid'), phone: A() },
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T22',
    kind: 'TEXT',
    sentinel: 'SNT2V',
    kategori: 'PARSIAL',
    polaritas: 'POSITIF',
    adversarial: false,
    sentinelLokasi: 'REFERENSI',
    judul: 'Call sign saja + pelabuhan + ETA',
    mekanisme: 'Identitas = call sign saja; nama & IMO menyusul.',
    tanggal: { ETA: { offset: 17 } },
    teks: (t) =>
      [
        'Our reference SNT2V-22 applies to this pre-nomination.',
        `Call sign PKZV7 expected at Balikpapan (IDBPN) ETA ${t.ETA.enLong}.`,
        'Vessel particulars will follow once the charter party is signed.',
      ].join('\n'),
    gt: {
      classification: POSITIF('Call sign + pelabuhan + ETA.'),
      larangNew: null,
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { callSign: P('PKZV7') })] },
      portName: P('BALIKPAPAN'),
      portUnlocode: P('IDBPN'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      clientReference: P('SNT2V-22'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T23',
    kind: 'TEXT',
    sentinel: 'SNT2W',
    kategori: 'PARSIAL',
    polaritas: 'NEGATIF',
    adversarial: false,
    sentinelLokasi: 'NAMA_KAPAL',
    judul: 'Nama kapal saja; pelabuhan & jadwal belum ditentukan',
    mekanisme: 'Identitas ada, tetapi tidak ada pelabuhan maupun ETA → INSUFFICIENT.',
    tanggal: {},
    teks: () =>
      [
        'Selamat pagi, kami ada kapal MV SNT2W DELIMA PUTIH yang mungkin butuh agen bulan depan.',
        'Pelabuhan dan jadwal belum ditentukan, nanti kami kabari lagi.',
      ].join('\n'),
    gt: {
      classification: INSUF('Tanpa pelabuhan & tanpa ETA (§7).'),
      larangNew: 'NEW_* hanya mungkin bila model mengarang pelabuhan/ETA.',
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('SNT2W DELIMA PUTIH') })] },
      portName: A(),
      portUnlocode: A(),
      ...tanggalKosong,
      eta: A('"bulan depan" bukan tanggal.'),
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [],
  },
  {
    id: 'T24',
    kind: 'TEXT',
    sentinel: 'SNT2X',
    kategori: 'PARSIAL',
    polaritas: 'NEGATIF',
    adversarial: false,
    sentinelLokasi: 'PIHAK',
    judul: 'Pelabuhan + ETA + muatan, kapal "TBN"',
    mekanisme: 'Tanpa identitas kapal ("TBN" bukan nama) → INSUFFICIENT walau pelabuhan & ETA lengkap.',
    tanggal: { ETA: { offsetMin: 25, hariMin: 13 } },
    teks: (t) =>
      [
        'Principal : PT SNT2X Energi Mandiri',
        'Kebutuhan : keagenan kapal untuk muat CPO di Bontang (IDBXT)',
        'Kapal     : TBN (to be nominated)',
        `ETA       : ${t.ETA.dmy}`,
        'Muatan    : CPO 10.000 MT',
      ].join('\n'),
    gt: {
      classification: INSUF('Tanpa identitas kapal (§7).'),
      larangNew: 'NEW_* hanya mungkin bila model menjadikan "TBN" / karangan sebagai kapal.',
      vessels: { jumlah: P(0), daftar: [] },
      portName: P('BONTANG'),
      portUnlocode: P('IDBXT'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      principalName: P('SNT2X ENERGI MANDIRI'),
      cargoes: { bentukDiterima: [[{ name: P('CPO', { sinonim: ['CPO', 'CRUDE PALM OIL'] }), quantity: P(10000), unit: P('MT'), operation: P('LOAD') }]] },
      contact: TANPA_KONTAK,
      terlarang: [],
    },
    harapanValidator: [
      { jenis: 'KAPAL_DIBUANG', raw: [{ name: 'MV TBN' }], vesselsDropped: 1, klasifikasiPost: 'INSUFFICIENT_INFORMATION' },
      {
        jenis: 'BATAS_VALIDATOR',
        raw: [{ name: 'TBN' }],
        kapalPost: 1,
        catatan: 'BATAS YANG DIKETAHUI: "TBN" tertulis harfiah → lolos uji sumber → kapal bertahan di POST (F2 oleh penilai). Hanya model yang bisa menghindarinya; validator tidak menilai makna.',
      },
    ],
  },
  {
    id: 'T25',
    kind: 'TEXT',
    sentinel: 'SNT2Y',
    kategori: 'PARSIAL',
    polaritas: 'NEGATIF',
    adversarial: true,
    sentinelLokasi: 'KONTAK',
    judul: 'Nama kapal + ETA tanpa tahun, tanpa pelabuhan',
    mekanisme: 'Satu-satunya "ETA" tak bertahun → tak terpakai; tanpa pelabuhan → INSUFFICIENT. Menguji gabungan pagar tanggal + syarat minimum.',
    tanggal: { X: { offsetMin: 30, hariMin: 13 } },
    teks: (t) =>
      [
        'Info awal dari pencharter:',
        'Kapal : MV KUMALA SARI',
        `ETA   : ${t.X.dBulanId}`,
        'Pelabuhan tujuan belum diputuskan.',
        'Kontak: Yuni, yuni.snt2y@contoh.invalid',
      ].join('\n'),
    gt: {
      classification: INSUF('ETA tanpa tahun tak terpakai + tanpa pelabuhan (§7).'),
      larangNew: 'NEW_* hanya mungkin dengan menyimpulkan tahun ETA atau mengarang pelabuhan.',
      vessels: { jumlah: P(1), daftar: [kapalTunggal('V1', { name: P('KUMALA SARI') })] },
      portName: A(),
      portUnlocode: A(),
      ...tanggalKosong,
      eta: TT('"D Bulan" tanpa tahun → hanya KOSONG.'),
      ...pihakKosong,
      cargoes: TANPA_MUATAN,
      contact: { name: AC(['Yuni', KOSONG]), email: P('yuni.snt2y@contoh.invalid'), phone: A() },
      terlarang: [],
    },
    harapanValidator: [{ jenis: 'MINIMUM_FIELDS_MISSING', field: 'eta', rawRef: 'X', klasifikasiRaw: 'NEW_NOMINATION', klasifikasiPost: 'INSUFFICIENT_INFORMATION' }],
  },
  {
    id: 'T26',
    kind: 'TEXT',
    sentinel: 'SNT2Z',
    kategori: 'PARSIAL',
    polaritas: 'NEGATIF',
    adversarial: true,
    sentinelLokasi: 'REFERENSI',
    judul: 'Kapal bangunan baru: hanya Hull No., pelabuhan + ETA ada',
    mekanisme: 'Hull No. 7 digit bukan IMO/MMSI/call sign → tanpa identitas → INSUFFICIENT; Hull No. sebagai IMO = F1.',
    tanggal: { ETA: { offset: 55 } },
    teks: (t) =>
      [
        'Reference: SNT2Z/HULL/2026 (newbuilding delivery)',
        'Delivery voyage - Hull No. 2211047 (name not yet registered)',
        'Port: Tarakan (IDTRK)',
        `ETA: ${t.ETA.dmy}`,
        'Owner will send IMO & call sign after registration.',
      ].join('\n'),
    gt: {
      classification: INSUF('Hull No. bukan identitas kapal di Intake (§7).'),
      larangNew: 'NEW_* hanya mungkin bila Hull No. dijadikan IMO atau nama dikarang.',
      vessels: { jumlah: P(0), daftar: [] },
      portName: P('TARAKAN'),
      portUnlocode: P('IDTRK'),
      ...tanggalKosong,
      eta: P(T('ETA')),
      ...pihakKosong,
      clientReference: P('SNT2Z/HULL/2026'),
      cargoes: TANPA_MUATAN,
      contact: TANPA_KONTAK,
      terlarang: [{ nilai: '2211047', lingkup: 'FIELD_OPERASIONAL', fatal: 'F1', alasan: 'Hull No., bukan IMO/MMSI.' }],
    },
    harapanValidator: [
      {
        jenis: 'BATAS_VALIDATOR',
        raw: [{ imo: '2211047' }],
        kapalPost: 1,
        flagImo: 'IMO_CHECK_DIGIT',
        catatan: 'BATAS YANG DIKETAHUI (desain K2): Hull No. tertulis harfiah → lolos uji sumber; check digit salah hanya DITANDAI, tidak dibuang → F1 oleh penilai. Hanya model yang bisa menghindarinya.',
      },
    ],
  },
])

// ================================================================== gerbang (PRA-REGISTRASI)
/**
 * Gerbang Eval-2, ditetapkan SEBELUM keluaran model apa pun. Tidak boleh dilonggarkan setelah
 * run. Ambang G1–G8 = Eval-1 (AMBANG penilai prd005-step3c-eval1/scorer-1) kecuali dipertegas.
 * Run: kontrol Sonnet 4.5 ×1, Sonnet 5 ×2 (26 kasus TEKS masing-masing) + LEDGER_E2E ×2.
 */
export const GERBANG_EVAL2 = Object.freeze({
  G1: { nama: 'Nol FATAL di POST (Sonnet 5, kedua run)', ambang: { fatalPostMaks: 0 }, keras: true },
  G2: { nama: 'Akurasi klasifikasi (Sonnet 5, tiap run)', ambang: { akurasiMin: 0.9, newPalsuNegatifMaks: 0 }, keras: false, catatan: '26 kasus → ≥ 24 benar (0.923); sama dengan ambang Eval-1.' },
  G3: {
    nama: 'Recall field kritis (Sonnet 5, tiap run)',
    ambang: { recallTeksMin: 0.95 },
    keras: false,
    catatan: 'Recall PDF TIDAK dievaluasi karena 0 kasus PDF (0/0 tak terdefinisi; E2K7). Ini bukan pelonggaran: syarat recall TEKS sama persis dengan Eval-1 dan diterapkan ke seluruh 26 kasus.',
  },
  G4: { nama: 'Halusinasi kritis di RAW (Sonnet 5, tiap run)', ambang: { halusinasiRawTeksMaks: 1 }, keras: false, catatan: 'Maks MUTLAK 1 per run (sama dengan Eval-1) padahal kasus 26 > 15 → secara laju lebih ketat.' },
  G5: {
    nama: 'Sonnet 5 tidak lebih buruk dari kontrol',
    ambang: { fatalPostMaksRelatif: 0, majorToleransi: 2 },
    keras: true,
    catatan: 'FATAL(S5) ≤ FATAL(kontrol) dan MAJOR(S5) ≤ MAJOR(kontrol) + 2, tiap run. Toleransi MUTLAK 2 dipertahankan (lebih ketat per kasus).',
  },
  G6: { nama: 'Stabilitas Sonnet 5 run1 vs run2', ambang: { identikMin: 0.9 }, keras: false, catatan: 'Tanda tangan kritis RAW (tandaTanganKritis penilai) identik ≥ 90% (26 kasus → ≥ 24). Perbedaan dijelaskan lewat diagnostik RAW tersanitasi.' },
  G7: { nama: 'Operasional', ambang: { gagalToolMaks: 0, latensiP95MsMaks: 30000, pelanggaranPagarMaks: 0, servedModelCocok: true }, keras: false },
  G8: { nama: 'Buku besar TAH (LEDGER_E2E + probe gagal-tertutup + sentinel bersih)', ambang: { failClosedOk: true, e2eOk: true, sentinelBersih: true }, keras: true },
  G9: {
    nama: 'Nol tanggal tak berbukti di POST — SEMUA run termasuk kontrol',
    ambang: { tanggalTakBerbuktiPostMaks: 0 },
    keras: true,
    catatan: 'Menghitung baris POST eta/etb/etc/etd/requestDate berhasil WRONG atau HALLUCINATED (E2K3). Diterapkan ke Sonnet 4.5 (kontrol) DAN Sonnet 5.',
  },
  G9R: {
    nama: 'Nol tahun simpulan di RAW pada node tanpaTahun (Sonnet 5, tiap run)',
    ambang: { tanpaTahunTerisiRawMaks: 0 },
    keras: false,
    catatan: 'Mengukur kepatuhan MODEL pada prompt v2 (pagar deterministik tetap menahan di POST).',
  },
  G10: {
    nama: 'Tidak ada kapal peserta hilang diam-diam (SEMUA run)',
    ambang: { hilangDiamDiamMaks: 0 },
    keras: true,
    catatan: 'Untuk tiap kasus: (#kapal GT yang cocok di RAW tetapi hilang di POST) ≤ proposal.vesselsDropped (E2K6).',
  },
  G11: {
    nama: 'Kasus NEGATIF & adversarial aman (SEMUA run termasuk kontrol)',
    ambang: { fatalPostMaks: 0, kapalDikecualikanMunculMaks: 0 },
    keras: true,
    catatan: 'Kasus polaritas NEGATIF atau adversarial: 0 FATAL di POST, dan tidak ada kapalDikecualikan (nama ternormalisasi atau IMO) di vessels POST (E2K5).',
  },
  G12: {
    nama: 'Validator gagal-tertutup (prasyarat LURING sebelum run LIVE)',
    ambang: { ujiLuringLulus: true },
    keras: true,
    catatan: 'check-eval2-gt.mjs bagian KONSISTENSI VALIDATOR wajib lulus pada commit yang sama dengan run; bila tidak, run LIVE ditolak.',
  },
  VERDICT: {
    FAIL: 'G1, G5, G8, G9, G10, G11, atau G12 gagal; atau pelanggaran pagar / served model berbeda.',
    INCONCLUSIVE: 'Run tidak lengkap / dihentikan / ada kasus gagal-ekstraksi.',
    CONDITIONAL: 'Hanya G2, G3, G4, G6, G7, atau G9R yang gagal.',
    PASS: 'Semua lulus — tetap BUKAN aktivasi; Sonnet 5 tetap PENDING_SPIKE sampai keputusan owner.',
  },
})

/** Rencana panggilan (dipakai runner Eval-2 kelak; batas biaya TIDAK dinaikkan dari Eval-1). */
export const RENCANA_EVAL2 = Object.freeze({
  blok: [
    { blok: 'S45_KONTROL', model: 'anthropic/claude-sonnet-4.5', kasus: 26 },
    { blok: 'S5_RUN1', model: 'anthropic/claude-sonnet-5', kasus: 26 },
    { blok: 'S5_RUN2', model: 'anthropic/claude-sonnet-5', kasus: 26 },
    { blok: 'LEDGER_E2E', model: 'anthropic/claude-sonnet-4.5', kasus: 2 },
  ],
  direncanakan: 80,
  maksPanggilan: 90,
  biayaLunakUsd: 2.7,
  biayaKerasUsd: 3.0,
  catatan: 'Tanpa blok tanpa-temperature (sudah diverifikasi Eval-1). Batas biaya = Eval-1; hanya batas panggilan menyesuaikan jumlah kasus. Anggaran final tetap keputusan owner saat otorisasi LIVE.',
})

// ================================================================== tanggal
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const d2 = (n) => String(n).padStart(2, '0')

function hariUtc(hariIni) {
  const d = new Date(hariIni)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function bentukTanggal(d, offsetTerpakai) {
  const [y, m, h] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
  return {
    offsetTerpakai,
    iso: `${y}-${d2(m + 1)}-${d2(h)}`,
    dmy: `${d2(h)}/${d2(m + 1)}/${y}`,
    dotdmy: `${d2(h)}.${d2(m + 1)}.${y}`,
    dm: `${d2(h)}/${d2(m + 1)}`,
    dMonYYYY: `${d2(h)}-${BULAN_EN[m].slice(0, 3)}-${y}`,
    dMonEn: `${h} ${BULAN_EN[m].slice(0, 3)}`,
    dBulanEn: `${h} ${BULAN_EN[m]}`,
    dBulanId: `${h} ${BULAN_ID[m]}`,
    idLong: `${h} ${BULAN_ID[m]} ${y}`,
    enLong: `${h} ${BULAN_EN[m]} ${y}`,
  }
}

/** Tetapkan semua tanggal satu kasus untuk satu hari eksekusi (deterministik). */
export function tetapkanTanggalEval2(spesifikasi, hariIni) {
  const dasar = hariUtc(hariIni)
  const hasil = {}
  const urut = Object.entries(spesifikasi).sort(([, a], [, b]) => Number('ref' in a) - Number('ref' in b))
  for (const [nama, spec] of urut) {
    if ('ref' in spec) {
      const acuan = hasil[spec.ref]
      const n = acuan.offsetTerpakai + spec.tambah
      hasil[nama] = bentukTanggal(new Date(dasar.getTime() + n * 86_400_000), n)
      continue
    }
    let n = 'offset' in spec ? spec.offset : spec.offsetMin
    let d = new Date(dasar.getTime() + n * 86_400_000)
    if ('hariMin' in spec) {
      while (d.getUTCDate() < spec.hariMin) {
        n++
        d = new Date(dasar.getTime() + n * 86_400_000)
      }
    }
    hasil[nama] = bentukTanggal(d, n)
  }
  return hasil
}

function resolusiGt(v, t) {
  if (Array.isArray(v)) return v.map((x) => resolusiGt(x, t))
  if (v && typeof v === 'object') {
    if ('tanggalRef' in v) return t[v.tanggalRef].iso
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolusiGt(x, t)]))
  }
  return v
}

/** Kasus siap pakai untuk satu tanggal eksekusi: dokumen + GT dengan tanggal ISO nyata. */
export function bangunKasusEval2(hariIni = new Date()) {
  return KASUS_EVAL2.map((k) => {
    const t = tetapkanTanggalEval2(k.tanggal, hariIni)
    return {
      id: k.id,
      kind: k.kind,
      sentinel: k.sentinel,
      kategori: k.kategori,
      polaritas: k.polaritas,
      adversarial: k.adversarial,
      sentinelLokasi: k.sentinelLokasi,
      judul: k.judul,
      tanggal: t,
      teks: k.teks(t),
      gt: resolusiGt(k.gt, t),
      kapalDikecualikan: k.kapalDikecualikan ?? [],
      harapanValidator: resolusiGt(k.harapanValidator ?? [], t),
    }
  })
}
