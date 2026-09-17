// Pengekstrak PALSU — HANYA untuk pengembangan & uji (PRD-004 Step 3). Ditolak di
// produksi oleh intake-gate.ts (PENGEKSTRAK_DILARANG_PRODUKSI). TIDAK PERNAH
// memanggil jaringan atau LLM.
//
// Perilaku ditentukan penanda di dalam isi masukan (teks, sel Excel, atau byte berkas):
//   [[FAKE-AI:<base64url JSON>]]  → JSON itu dikembalikan apa adanya (keluaran "AI")
//   [[FAKE-AI:TIMEOUT]]           → galat AI_TIMEOUT
//   [[FAKE-AI:UNAVAILABLE]]       → galat penyedia (pesan penyedia palsu yang TIDAK boleh bocor)
//   [[FAKE-AI:BAD]]               → respons rusak (AI_BAD_RESPONSE)
//   tanpa penanda                 → NOT_RELEVANT tanpa data
// JSON di-base64 supaya nilai "hasil AI" tidak ikut tertulis sebagai teks sumber
// (uji NOT_IN_SOURCE tetap bermakna).

import { GalatEkstraksi, type MasukanEkstraksi, type PengekstrakIntake } from '@/lib/ai/vessel-call-extract'

const POLA = /\[\[FAKE-AI:([A-Za-z0-9_\-=]+)\]\]/

function isiTeks(m: MasukanEkstraksi): string {
  if (m.kind === 'PDF' || m.kind === 'IMAGE') return m.bytes.toString('latin1')
  return m.text
}

export const ekstrakPalsu: PengekstrakIntake = async (masukan) => {
  const cocok = POLA.exec(isiTeks(masukan))
  if (!cocok) return { classification: 'NOT_RELEVANT', vessels: [], cargoes: [] }
  const kode = cocok[1]
  if (kode === 'TIMEOUT') throw new GalatEkstraksi('AI_TIMEOUT')
  if (kode === 'UNAVAILABLE') throw new Error('RAHASIA-PENYEDIA: upstream overloaded (fake)')
  if (kode === 'BAD') throw new SyntaxError('Unexpected token')
  try {
    return JSON.parse(Buffer.from(kode, 'base64url').toString('utf8')) as unknown
  } catch {
    throw new GalatEkstraksi('AI_BAD_RESPONSE')
  }
}
