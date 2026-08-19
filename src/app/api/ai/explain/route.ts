// Fase 6f / K67 — narasi "Jelaskan" untuk hasil hitungan mesin.
//
//   POST { payload, bahasa? } → { ok, answer, ditolak, angkaTakDikenal }
//
// `payload` adalah objek yang SUDAH DIHITUNG mesin (`PrediksiBaris` dari 6c,
// `Anomali` dari 6e, atau `KonteksAI`) dan dikirim ulang oleh klien. Itu bukan
// kelalaian: K66 melarang menyimpan prediksi, jadi tidak ada tempat di server
// untuk mengambilnya kembali, dan menghitung ulang di sini akan membuat narasi
// menjelaskan angka yang BERBEDA dari yang sedang dilihat operator di layar —
// persis kegagalan yang paling sulit disadari.
//
// Radius risikonya kecil dan sengaja dibiarkan kecil: payload titipan klien
// hanya menentukan apa yang DIJELASKAN, tak pernah apa yang disimpan (K52), dan
// `periksaNarasi()` di bawah tetap memakai payload yang sama sebagai satu-satunya
// himpunan angka yang sah.

import { jsonBody, withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { pilihan } from '@/services/input'
import { pastikanLanggananAktif } from '@/services/subscription'
import { pastikanKuota } from '@/services/saas/quota.service'
import { TEKS_NARASI_DITOLAK, periksaNarasi } from '@/services/ai/narasi-guard'
import { promptJelaskan } from '@/lib/ai/explain'
import { chatCompletion, firstMessageText } from '@/lib/ai/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BAHASA = ['id', 'en'] as const

/** Sepadan dengan anggaran konteks K76/3 — payload sebesar ini sudah tak wajar. */
const MAKS_PAYLOAD = 20000

export const POST = withTenant(async (ctx, req) => {
  // K54 — endpoint ini memanggil OpenRouter, jadi gerbang langganan berlaku.
  // Dipanggil eksplisit di sini (bukan lewat konteks.service.ts) karena jalur
  // ini memang tak menyentuh database sama sekali.
  await pastikanLanggananAktif(ctx)
  // Fase 8c / K156 — kuota panggilan AI, BERSEBELAHAN dengan gerbang langganan
  // di atas (K33). Dua pagar berdiri sendiri: langganan habis tetap menolak
  // meski kuota longgar, dan sebaliknya.
  await pastikanKuota(ctx, 'PANGGILAN_AI')

  const body = await jsonBody(req)
  const bahasa = pilihan(body.bahasa, BAHASA, 'Bahasa', 'id')
  const payload = body.payload

  if (payload === null || payload === undefined || typeof payload !== 'object') {
    throw validation('payload wajib berupa objek hasil hitungan (PrediksiBaris/Anomali/KonteksAI).')
  }

  let teks: string
  try {
    teks = JSON.stringify(payload)
  } catch {
    throw validation('payload tidak bisa diserialisasi.')
  }
  if (teks.length > MAKS_PAYLOAD) {
    throw validation(`payload terlalu besar (maksimal ${MAKS_PAYLOAD} karakter).`)
  }

  const resp = await chatCompletion({
    messages: promptJelaskan(payload, bahasa),
    temperature: 0.1,
  })
  const narasi = firstMessageText(resp)
  if (!narasi) throw new Error('Model tidak memberi penjelasan.')

  const hasil = periksaNarasi(narasi, payload)

  return Response.json({
    ok: true,
    answer: hasil.diterima ? narasi : TEKS_NARASI_DITOLAK[bahasa],
    ditolak: !hasil.diterima,
    angkaTakDikenal: hasil.angkaTakDikenal,
    /** Bukti dari luar bahwa penjaga benar-benar dijalankan — lihat catatan di ask/route.ts. */
    diperiksa: hasil.jumlahDiperiksa,
  })
})
