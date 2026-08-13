// Fase 6f / K75–K77 — asisten kontekstual, kemampuan 1 (MENJAWAB).
//
//   POST { jenis, id, question, bahasa?, sertakanPrediksi?, sertakanAnomali? }
//        → { ok, answer, ditolak, jenis, ukuranKonteks, dipotong }
//
// Di sinilah orkestrasinya, dan sengaja HANYA di sini (bukan di
// `konteks.service.ts` yang tak boleh tahu apa itu OpenRouter, bukan pula di
// `src/lib/ai/` yang tak boleh tahu apa itu database — K52):
//
//   bangunKonteks()  →  promptTanya()  →  chatCompletion()  →  periksaNarasi()
//
// Langkah terakhir itu WAJIB (K67/K77): tanpa `periksaNarasi()`, seluruh
// pekerjaan grounding di atasnya cuma berlaku sampai model memutuskan menulis
// angka yang enak dibaca. Narasi yang ditolak dibalas HTTP 200 dengan teks
// pengganti — narasi ditolak adalah KELUARAN YANG SAH, bukan kegagalan server;
// membuatnya 5xx akan membuat UI menampilkan "terjadi kesalahan" untuk sesuatu
// yang justru bekerja persis sebagaimana dirancang.

import { jsonBody, withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { bool, pilihan, str, wajib } from '@/services/input'
import { bangunKonteks } from '@/services/ai/konteks.service'
import { ukuranKonteks, type JenisKonteks } from '@/services/ai/konteks'
import { TEKS_NARASI_DITOLAK, periksaNarasi } from '@/services/ai/narasi-guard'
import { promptTanya } from '@/lib/ai/assistant-context'
import { chatCompletion, firstMessageText } from '@/lib/ai/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JENIS: readonly JenisKonteks[] = ['VOYAGE', 'DISBURSEMENT', 'INVOICE']
const BAHASA = ['id', 'en'] as const

/** Pagar murah terhadap pertanyaan sepanjang novel — bukan validasi isi, cuma ukuran. */
const MAKS_PERTANYAAN = 2000

export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)

  const jenis = pilihan(body.jenis, JENIS, 'Jenis konteks')
  const id = wajib(str(body.id), 'id entitas')
  const pertanyaan = wajib(str(body.question), 'Pertanyaan')
  const bahasa = pilihan(body.bahasa, BAHASA, 'Bahasa', 'id')

  if (pertanyaan.length > MAKS_PERTANYAAN) {
    throw validation(`Pertanyaan terlalu panjang (maksimal ${MAKS_PERTANYAAN} karakter).`)
  }

  // K76/4 — dibangun ULANG di sini, setiap pertanyaan. Tak ada cache.
  const konteks = await bangunKonteks(ctx, jenis, id, {
    bahasa,
    sertakanPrediksi: bool(body.sertakanPrediksi),
    sertakanAnomali: bool(body.sertakanAnomali),
  })

  const resp = await chatCompletion({
    messages: promptTanya(konteks, pertanyaan, bahasa),
    temperature: 0.1,
  })
  const jawaban = firstMessageText(resp)
  if (!jawaban) throw new Error('Model tidak memberi jawaban.')

  // K67 — pemeriksaan mekanis terhadap payload yang PERSIS dikirim ke model.
  const hasil = periksaNarasi(jawaban, konteks)

  return Response.json({
    ok: true,
    jenis,
    answer: hasil.diterima ? jawaban : TEKS_NARASI_DITOLAK[bahasa],
    ditolak: !hasil.diterima,
    // Dilaporkan apa adanya supaya kegagalan penjaga bisa didiagnosis tanpa
    // menayangkan narasinya (itu justru yang sedang dicegah).
    angkaTakDikenal: hasil.angkaTakDikenal,
    // Berapa deret ≥ 4 digit yang benar-benar diperiksa. Kelihatannya sepele,
    // tapi inilah satu-satunya bukti dari luar bahwa penjaga BEKERJA pada
    // jawaban ini — `ditolak: false` sendirian tak bisa dibedakan dari penjaga
    // yang tak pernah dipanggil.
    diperiksa: hasil.jumlahDiperiksa,
    ukuranKonteks: ukuranKonteks(konteks),
    dipotong: konteks.catatanPemotongan ?? null,
  })
})
