// Fixture SINTETIS Phase 0 — PRD-005 Step 3C (uji kompatibilitas model).
//
// SELURUHNYA FIKTIF: kapal, perusahaan, orang, nomor. Bukan dokumen pelanggan/produksi.
//   • IMO 9999993 — check digit sah, awalan 99999x (bukan kapal nyata yang diketahui).
//   • MMSI 990012345 — rentang 99 (alat bantu navigasi), tak mungkin kapal nyata.
//   • Email ber-domain .invalid (RFC 2606) — tak bisa terkirim.
// Penanda SENTINEL "SNTLPZ" disisipkan di nilai-nilai dokumen: bukti privasi bahwa isi
// dokumen TIDAK pernah tersimpan di AgentRun / AgentModelCall / AuditLog / laporan / log.
//
// Tanggal relatif terhadap hari eksekusi (validasi intake menolak tanggal < −30 / > +365 hari),
// tapi deterministik untuk satu eksekusi: teks & kebenaran-dasar memakai nilai yang sama.

export const SENTINEL = 'SNTLPZ'

const ymd = (d) => d.toISOString().slice(0, 10)
const tambahHari = (dasar, n) => new Date(dasar.getTime() + n * 86_400_000)

/** Semua kasus Phase 0. `hariIni` = Date eksekusi (UTC). */
export function kasusPhase0(hariIni = new Date()) {
  const eta1 = ymd(tambahHari(hariIni, 20))
  const eta2 = ymd(tambahHari(hariIni, 25))
  const etd2 = ymd(tambahHari(hariIni, 28))

  const C1 = {
    id: 'C1',
    kind: 'TEXT',
    teks: [
      'Kepada Yth. Agen Kapal',
      '',
      `Dengan hormat, kami menunjuk Saudara sebagai agen untuk kunjungan kapal berikut (nominasi ${SENTINEL}/NOM/001):`,
      '',
      `Nama kapal : MV ${SENTINEL} OCEAN`,
      'IMO        : 9999993',
      'MMSI       : 990012345',
      'Call sign  : SNTL9',
      'Tipe kapal : Bulk Carrier',
      'Pelabuhan  : Samarinda (IDSRI)',
      `ETA        : ${eta1}`,
      'Muatan     : Batubara 55.000 MT (muat)',
      `Principal  : PT ${SENTINEL} Shipping Lines`,
      '',
      `Narahubung: Budi ${SENTINEL}, budi.${SENTINEL.toLowerCase()}@contoh.invalid, +62-811-0000-${SENTINEL}`,
      '',
      'Terima kasih.',
    ].join('\n'),
    harap: {
      classification: ['NEW_NOMINATION', 'NEW_APPOINTMENT'],
      kapal: [{ nama: `${SENTINEL} OCEAN`, imo: '9999993', mmsi: '990012345' }],
      portUnlocode: 'IDSRI',
      eta: eta1,
      cargo: [{ quantity: 55000, operation: 'LOAD' }],
    },
  }

  const C2 = {
    id: 'C2',
    kind: 'PDF',
    namaBerkas: `appointment-${SENTINEL}-002.pdf`,
    baris: [
      'SURAT PENUNJUKAN AGEN / AGENCY APPOINTMENT',
      `No. ${SENTINEL}/APPT/002`,
      '',
      'Dengan ini kami menunjuk Saudara sebagai FULL AGENCY untuk kunjungan berikut:',
      '',
      `Tug   : TB ${SENTINEL} PERKASA 1   (call sign YDSN1)`,
      `Barge : BG ${SENTINEL} JAYA 301`,
      'Pelabuhan tujuan : Balikpapan (IDBPN)',
      `ETA : ${eta2}`,
      `ETD : ${etd2}`,
      'Muatan : Batubara 7.500 MT (bongkar / discharge)',
      '',
      `Principal : PT ${SENTINEL} Samudera`,
      `Kontak : Sari ${SENTINEL}, sari.${SENTINEL.toLowerCase()}@contoh.invalid`,
    ],
    harap: {
      classification: ['NEW_APPOINTMENT', 'NEW_NOMINATION'],
      kapal: [
        { nama: `${SENTINEL} PERKASA 1`, peran: 'TUG' },
        { nama: `${SENTINEL} JAYA 301`, peran: 'BARGE' },
      ],
      portUnlocode: 'IDBPN',
      eta: eta2,
      cargo: [{ quantity: 7500, operation: 'DISCHARGE' }],
    },
  }

  return { C1, C2 }
}

/** Bangun PDF C2 (lapisan teks) saat eksekusi — tak ada biner yang di-commit. */
export async function bangunPdf(kasus) {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { jsPDF } = require('jspdf')
  const d = new jsPDF()
  d.setFontSize(11)
  d.text(kasus.baris, 15, 20)
  return Buffer.from(d.output('arraybuffer'))
}
