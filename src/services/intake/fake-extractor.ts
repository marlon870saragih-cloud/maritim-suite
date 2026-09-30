// Pengekstrak PALSU — HANYA untuk pengembangan & uji (PRD-004 Step 3). Ditolak di
// produksi oleh intake-gate.ts (PENGEKSTRAK_DILARANG_PRODUKSI). TIDAK PERNAH
// memanggil jaringan atau LLM.
//
// Perilaku ditentukan penanda di dalam isi masukan (teks, sel Excel, atau byte berkas):
//   [[FAKE-AI:<base64url JSON>]]  → JSON itu dikembalikan apa adanya (keluaran "AI")
//   [[FAKE-AI:TIMEOUT]]           → galat AI_TIMEOUT
//   [[FAKE-AI:UNAVAILABLE]]       → galat penyedia (pesan penyedia palsu yang TIDAK boleh bocor)
//   [[FAKE-AI:BAD]]               → respons rusak (AI_BAD_RESPONSE)
//   [[FAKE-AI-RETRY:<base64url JSON>]] → (PRD-005 Step 3B) percobaan 1 "ditolak engine
//                                    plugin", percobaan 2 mengembalikan JSON — meniru jalur
//                                    ulang tanpa plugin pengekstrak sungguhan (2 percobaan).
//   tanpa penanda                 → NOT_RELEVANT tanpa data
// JSON di-base64 supaya nilai "hasil AI" tidak ikut tertulis sebagai teks sumber
// (uji NOT_IN_SOURCE tetap bermakna).
//
// PRD-005 Step 3B: setiap "percobaan" dilaporkan ke perekam TAH (no-op di luar konteks)
// dengan provider FAKE dan metadata deterministik — supaya buku besar bisa diuji tanpa
// jaringan. requestedModel = hasil resolusi TAH_INTAKE_MODEL (atau bawaan lama).

import {
  GalatEkstraksi,
  HASH_PROMPT_INTAKE,
  ID_PROMPT_INTAKE,
  VERSI_PROMPT_INTAKE,
  VERSI_SKEMA_INTAKE,
  type MasukanEkstraksi,
  type PengekstrakIntake,
} from '@/lib/ai/vessel-call-extract'
import { SPK_MODEL } from '@/lib/ai/openrouter'
import { konteksModel, laporPanggilan, type MetaPanggilanModel } from '@/lib/ai/perekam-panggilan'
import { bacaPemakaianToken } from '@/services/tah/tah-policy'

const POLA = /\[\[FAKE-AI:([A-Za-z0-9_\-=]+)\]\]/
const POLA_ULANG = /\[\[FAKE-AI-RETRY:([A-Za-z0-9_\-=]+)\]\]/

/** Pemakaian token palsu yang deterministik (bentuk OpenAI-compatible). */
const PEMAKAIAN_PALSU = { prompt_tokens: 120, completion_tokens: 30 }

function isiTeks(m: MasukanEkstraksi): string {
  if (m.kind === 'PDF' || m.kind === 'IMAGE') return m.bytes.toString('latin1')
  return m.text
}

function lapor(seq: number, hasil: 'OK' | 'AI_TIMEOUT' | 'AI_UNAVAILABLE', pakaiPlugin: boolean): void {
  const ok = hasil === 'OK'
  const meta: MetaPanggilanModel = {
    provider: 'FAKE',
    requestedModel: konteksModel()?.model ?? SPK_MODEL,
    servedModel: ok ? 'fake/deterministic' : null,
    providerRequestId: ok ? `fake-req-${seq}` : null,
    promptId: ID_PROMPT_INTAKE,
    promptVersion: VERSI_PROMPT_INTAKE,
    promptHash: HASH_PROMPT_INTAKE,
    schemaId: 'isi_intake_kunjungan',
    schemaVersion: VERSI_SKEMA_INTAKE,
    params: { temperature: 0, toolChoice: 'isi_intake_kunjungan', pdfEngine: pakaiPlugin ? 'native' : undefined },
    status: ok ? 'OK' : hasil === 'AI_TIMEOUT' ? 'TIMEOUT' : 'ERROR',
    errorCode: ok ? null : hasil,
    latencyMs: 1,
    pemakaian: bacaPemakaianToken(ok ? PEMAKAIAN_PALSU : null),
  }
  laporPanggilan(meta)
}

function uraiJson(kode: string): unknown {
  try {
    return JSON.parse(Buffer.from(kode, 'base64url').toString('utf8')) as unknown
  } catch {
    throw new GalatEkstraksi('AI_BAD_RESPONSE')
  }
}

export const ekstrakPalsu: PengekstrakIntake = async (masukan) => {
  const teks = isiTeks(masukan)
  const ulang = POLA_ULANG.exec(teks)
  if (ulang) {
    lapor(1, 'AI_UNAVAILABLE', true)
    lapor(2, 'OK', false)
    return uraiJson(ulang[1])
  }
  const cocok = POLA.exec(teks)
  if (!cocok) {
    lapor(1, 'OK', false)
    return { classification: 'NOT_RELEVANT', vessels: [], cargoes: [] }
  }
  const kode = cocok[1]
  if (kode === 'TIMEOUT') {
    lapor(1, 'AI_TIMEOUT', false)
    throw new GalatEkstraksi('AI_TIMEOUT')
  }
  if (kode === 'UNAVAILABLE') {
    lapor(1, 'AI_UNAVAILABLE', false)
    throw new Error('RAHASIA-PENYEDIA: upstream overloaded (fake)')
  }
  if (kode === 'BAD') {
    lapor(1, 'OK', false)
    throw new SyntaxError('Unexpected token')
  }
  lapor(1, 'OK', false)
  return uraiJson(kode)
}
