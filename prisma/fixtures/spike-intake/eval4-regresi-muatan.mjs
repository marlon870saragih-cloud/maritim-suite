// PRD-005 Eval-4 prep — KASUS REGRESI MUATAN (bukan held-out).
//
// Keputusan owner D6: kasus Eval-3 yang sudah diperiksa (termasuk H20, H18, H24–H36) adalah bahan
// REGRESI/AUDIT, bukan held-out. Kasus di sini SALINAN teks Eval-3 dengan GT muatan yang DIKOREKSI
// (audit H20); fixture Eval-3 beku (eval3-cases.mjs, SHA c6098c1a…) TIDAK diubah.
//
// RG-H20: sumber "to load sawn timber" → GT menerima [] ATAU baris setia {sawn timber, LOAD, tanpa
//         jumlah/satuan}; jumlah/satuan apa pun = HALLUCINATED (F5), operasi DISCHARGE = WRONG (F5).
// RG-H18: "Discharging completed" tanpa komoditas → hanya [] yang benar.
// Bentuk GT = scorer-1/scorer-2 (PRESENT / ABSENT / ACCEPTABLE / NOT_SCORED).

export const VERSI_REGRESI_MUATAN = 'prd005-e5-eval4/regresi-muatan-1'

const P = (value, extra = {}) => ({ status: 'PRESENT', value, ...extra })
const A = () => ({ status: 'ABSENT' })
const AC = (values) => ({ status: 'ACCEPTABLE', values })
const NS = (catatan) => ({ status: 'NOT_SCORED', catatan })
const PIHAK_NS = Object.fromEntries(['principalName', 'customerName', 'clientReference', 'agencyType', 'jetty'].map((f) => [f, NS('Non-keagenan.')]))
const kosong = { eta: A(), etb: A(), etc: A(), etd: A(), requestDate: A(), portName: A(), portUnlocode: A() }
const INFO = AC(['NOT_RELEVANT', 'UNSUPPORTED_REQUEST'])

export const KASUS_REGRESI_MUATAN = Object.freeze([
  {
    id: 'RG-H20', asal: 'Eval-3 H20', kind: 'TEXT', kategori: 'C_BUKAN_KEAGENAN', niatKeagenan: false,
    teks: [
      'Dear Sir/Madam,',
      'We are evaluating a possible call of MV LAYANG BENGAWAN (IMO 9998535) at Probolinggo (IDPRO), ETA 28 October 2026, to load sawn timber.',
      'Could you kindly advise your agency fee and indicative port costs for such a call?',
      'Our charterers will decide on the voyage after comparing quotations.',
      'Best regards, Hendra - commercial desk, KTX3AT Timber Lines',
    ].join('\n'),
    gt: {
      classification: INFO, larangNew: 'Permintaan tarif — bukan nominasi/penunjukan.', ...kosong, ...PIHAK_NS,
      vessels: { jumlah: NS('Non-keagenan.'), daftar: [] }, portName: AC(['PROBOLINGGO', null]), portUnlocode: AC(['IDPRO', null]), eta: AC(['2026-10-28', null]),
      cargoes: { bentukDiterima: [[], [{ name: P('sawn timber', { sinonim: ['SAWN TIMBER'] }), quantity: A(), unit: A(), operation: AC(['LOAD', null]) }]] },
      contact: A(), terlarang: [],
    },
  },
  {
    id: 'RG-H18', asal: 'Eval-3 H18', kind: 'TEXT', kategori: 'C_BUKAN_KEAGENAN', niatKeagenan: false,
    teks: ['VOYAGE COMPLETION REPORT', 'MV NILAM SARI - Dumai (IDDUM)', 'Arrival: 06/09/2026', 'Departure: 09/09/2026', 'Discharging completed without incident. For your records - KTX3AR operations.'].join('\n'),
    gt: {
      classification: INFO, larangNew: 'Riwayat kunjungan selesai.', ...kosong, ...PIHAK_NS,
      vessels: { jumlah: NS('Non-keagenan.'), daftar: [] }, portName: AC(['DUMAI', null]), portUnlocode: AC(['IDDUM', null]), eta: AC(['2026-09-06', null]), etd: AC(['2026-09-09', null]),
      cargoes: { bentukDiterima: [[]] },
      contact: A(), terlarang: [],
    },
  },
])
