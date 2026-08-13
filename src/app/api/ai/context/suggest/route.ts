// Fase 6f / K77 — asisten kontekstual, kemampuan 2 (MENGUSULKAN ISIAN).
//
//   POST { jenis, id, instruction, fields[], bahasa?, sertakanPrediksi?, sertakanAnomali? }
//        → { ok, usulan: [{ field, nilai, diterima, angkaTakDikenal }] }
//
// ⚠️ K52 — TIDAK ADA SATU PUN PENULISAN KE DATABASE DI JALUR INI, dan tidak akan
// pernah ada. Yang dikembalikan endpoint ini adalah teks yang muncul di field
// sebagai pratinjau; penyimpanan tetap lewat endpoint Fase 1–5 yang sudah punya
// validasi, tenant-guard, status-guard, dan AuditLog. Kalau suatu hari ada yang
// tergoda menambahkan `forTenant(ctx).disbursement.update(...)` di berkas ini
// demi kenyamanan, seluruh permukaan serangan prompt-injection (K53) berubah
// dari "AI salah bicara" menjadi "AI salah menagih principal".
//
// ⚠️ K67 berlaku SAMA untuk usulan, bukan hanya untuk narasi. Model yang
// mengarang nominal di sebuah field usulan sama berbahayanya dengan yang
// mengarangnya di paragraf penjelasan — bedanya, yang di field justru LEBIH
// mungkin ditekan "simpan" tanpa dibaca. Karena itu setiap nilai usulan
// dilewatkan `periksaNarasi()` terhadap konteks yang sama, dan yang gagal
// ditandai `diterima: false` (dikembalikan apa adanya + ditandai, bukan
// disembunyikan: UI 6g yang memutuskan cara menampilkannya, dan menyembunyikan
// di sini berarti operator tak pernah tahu modelnya baru saja menebak).

import { jsonBody, withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { bool, pilihan, str, wajib } from '@/services/input'
import { bangunKonteks } from '@/services/ai/konteks.service'
import type { JenisKonteks } from '@/services/ai/konteks'
import { periksaNarasi } from '@/services/ai/narasi-guard'
import { promptSaran } from '@/lib/ai/assistant-context'
import { chatCompletion, firstToolArguments } from '@/lib/ai/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JENIS: readonly JenisKonteks[] = ['VOYAGE', 'DISBURSEMENT', 'INVOICE']
const BAHASA = ['id', 'en'] as const

const MAKS_INSTRUKSI = 2000
const MAKS_FIELD = 12

type Usulan = {
  field: string
  nilai: string
  /** K67 — false bila memuat deret ≥ 4 digit yang tak ada di konteks. */
  diterima: boolean
  angkaTakDikenal: string[]
  /** Berapa deret ≥ 4 digit yang diperiksa — bukti penjaga benar-benar berjalan. */
  diperiksa: number
}

/** Baca daftar field dari body; hanya string tak kosong yang dihitung. */
function bacaFields(nilai: unknown): string[] {
  if (!Array.isArray(nilai)) return []
  const bersih: string[] = []
  for (const f of nilai) {
    if (typeof f !== 'string') continue
    const v = f.trim()
    if (v === '' || bersih.includes(v)) continue
    bersih.push(v)
  }
  return bersih
}

export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)

  const jenis = pilihan(body.jenis, JENIS, 'Jenis konteks')
  const id = wajib(str(body.id), 'id entitas')
  const instruksi = wajib(str(body.instruction), 'Instruksi')
  const bahasa = pilihan(body.bahasa, BAHASA, 'Bahasa', 'id')
  const fields = bacaFields(body.fields)

  if (instruksi.length > MAKS_INSTRUKSI) {
    throw validation(`Instruksi terlalu panjang (maksimal ${MAKS_INSTRUKSI} karakter).`)
  }
  if (fields.length === 0) throw validation('fields wajib diisi minimal satu nama field.')
  if (fields.length > MAKS_FIELD) {
    throw validation(`Terlalu banyak field sekaligus (maksimal ${MAKS_FIELD}).`)
  }

  const konteks = await bangunKonteks(ctx, jenis, id, {
    bahasa,
    sertakanPrediksi: bool(body.sertakanPrediksi),
    sertakanAnomali: bool(body.sertakanAnomali),
  })

  const { messages, tools, toolChoice } = promptSaran(konteks, instruksi, fields, bahasa)
  const resp = await chatCompletion({ messages, tools, toolChoice, temperature: 0.1 })

  const argumen = firstToolArguments(resp)
  if (argumen === null) throw new Error('Model tidak memanggil tool usulan.')

  let terurai: unknown
  try {
    terurai = JSON.parse(argumen)
  } catch {
    throw new Error('Usulan dari model bukan JSON yang sah.')
  }

  const mentah = (terurai as { usulan?: unknown }).usulan
  const daftar = Array.isArray(mentah) ? mentah : []

  const usulan: Usulan[] = []
  for (const baris of daftar) {
    if (!baris || typeof baris !== 'object') continue
    const b = baris as { field?: unknown; nilaiUsulan?: unknown }
    const field = typeof b.field === 'string' ? b.field.trim() : ''
    const nilai = typeof b.nilaiUsulan === 'string' ? b.nilaiUsulan : ''
    // Penyaringan KEDUA (skema tool sudah membatasi lewat `enum`): field di luar
    // yang diminta dibuang, bukan diteruskan. Skema adalah permintaan kepada
    // model; ini yang menjadikannya kenyataan.
    if (field === '' || !fields.includes(field)) continue
    if (nilai.trim() === '') continue

    const periksa = periksaNarasi(nilai, konteks)
    usulan.push({
      field,
      nilai,
      diterima: periksa.diterima,
      angkaTakDikenal: periksa.angkaTakDikenal,
      diperiksa: periksa.jumlahDiperiksa,
    })
  }

  return Response.json({ ok: true, jenis, usulan })
})
