// CADANGAN untuk evaluasi MASA DEPAN — BUKAN bagian PRD-005 Step 3C Controlled Evaluation 1.
//
// Keputusan owner (review E1, butir 6): PDF raster/scan tanpa lapisan teks TIDAK DIUJI di
// Eval-1. Spesifikasi E11 disimpan di sini agar tidak hilang. Berkas ini TIDAK di-import oleh
// eval1-cases.mjs dan TIDAK ikut hitungan kasus, penilaian, hash pembekuan Eval-1, anggaran
// panggilan, maupun gerbang lulus. Belum ada cara render (tanpa dependensi raster) yang disetujui.
//
// Data sintetis (pola sama dengan eval1-cases.mjs). ETA dinyatakan relatif: +27 hari dari
// tanggal eksekusi. Ground truth di bawah ini BELUM ditinjau ulang untuk dipakai.

export const FUTURE_SCAN_E11 = Object.freeze({
  id: 'FUTURE-SCAN-E11',
  statusEval1: 'TIDAK_DIUJI',
  kind: 'PDF_RASTER_TANPA_LAPISAN_TEKS',
  sentinel: 'SNTLQK',
  etaOffsetHari: 27,
  isiHalaman: [
    'LETTER OF APPOINTMENT',
    'Ref: SNTLQK/LOA/1111',
    '',
    'Vessel : MV SNTLQK MERIDIAN',
    'IMO    : 9998066',
    'MMSI   : 990011101',
    'Port   : Tanjung Priok (IDTPP)',
    'ETA    : <tanggal eksekusi + 27 hari, format "D Month YYYY">',
    'Cargo  : Clinker 12,000 MT - discharge',
    'Principal: PT SNTLQK Semen Nusantara',
  ],
  ringkasanGt: {
    classification: ['NEW_NOMINATION', 'NEW_APPOINTMENT'],
    vessels: [{ name: 'SNTLQK MERIDIAN', imo: '9998066', mmsi: '990011101', role: null }],
    portName: 'TANJUNG PRIOK',
    portUnlocode: 'IDTPP',
    cargoes: [{ name: 'Clinker', quantity: 12000, unit: 'MT', operation: 'DISCHARGE' }],
    principalName: 'SNTLQK SEMEN NUSANTARA',
    clientReference: 'SNTLQK/LOA/1111',
  },
})
