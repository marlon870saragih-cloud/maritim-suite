// Fase 6h bagian 2 / K82 — penyimpanan tarif hasil ekstraksi AI. TERPISAH dari
// `POST /api/service-rates` generik (dipakai form manual Master › Jasa) karena
// K82/4 mewajibkan SETIAP penyimpanan dari jalur AI menulis AuditLog berisi
// nama berkas sumber — endpoint generik tak punya & tak perlu itu.
//
//   POST { items: [{ serviceId, portId?, vesselType?, gtMin?, gtMax?, rate,
//                     currency?, minCharge?, effectiveFrom? }], sourceFileName }
//        → { hasil: [{ ok, rate? , error? }] }  (satu per item, urutan sama)
//
// Menyimpan lewat `createServiceRate()` yang SUDAH ADA (validasi rate>0,
// gtMin<=gtMax, relasi milik tenant — tak diduplikasi di sini) — route ini
// CUMA menambahkan lapisan AuditLog per baris di atasnya. `createServiceRate`
// SELALU membuat baris baru (tak ada mode update di jalur ini sama sekali,
// K82/1) — konsisten dengan `service-rate.service.ts` yang memang tak punya
// fungsi "upsert tarif".
//
// Baris diproses SATU PER SATU (bukan transaksi tunggal): kegagalan satu
// baris (mis. serviceId ternyata sudah dihapus di antara pratinjau & simpan)
// tak boleh menggagalkan baris lain yang sudah dicentang benar oleh operator.

import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { validation } from '@/services/errors'
import { str, wajib } from '@/services/input'
import { createServiceRate } from '@/services/master/service-rate.service'
import { catatAudit } from '@/services/finance/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAKS_BARIS = 200

type ItemMentah = {
  serviceId?: unknown
  portId?: unknown
  vesselType?: unknown
  gtMin?: unknown
  gtMax?: unknown
  rate?: unknown
  currency?: unknown
  minCharge?: unknown
  effectiveFrom?: unknown
}

export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)
  const sourceFileName = wajib(str(body.sourceFileName), 'Nama berkas sumber')

  const daftar = Array.isArray(body.items) ? (body.items as ItemMentah[]) : []
  if (daftar.length === 0) throw validation('items wajib diisi minimal satu baris.')
  if (daftar.length > MAKS_BARIS) throw validation(`Terlalu banyak baris sekaligus (maksimal ${MAKS_BARIS}).`)

  const jejak = jejakDari(req)
  const hasil: ({ ok: true; rateId: string } | { ok: false; error: string })[] = []

  for (const item of daftar) {
    // Di luar try: kalau createServiceRate SUDAH sukses tapi catatAudit
    // melempar (K42 sengaja tak menelan kegagalan audit), baris ini TIDAK
    // boleh dilaporkan sebagai "gagal biasa" — tarifnya sungguhan sudah ada
    // di DB. Melaporkannya sebagai gagal-total akan menggoda operator mencoba
    // lagi dan membuat baris duplikat untuk jasa/tanggal yang sama.
    let rateIdTersimpan: string | null = null
    try {
      const rate = await createServiceRate(ctx, item as Record<string, unknown>)
      rateIdTersimpan = rate.id
      // K82/4 — WAJIB, bukan opsional: satu AuditLog per baris tersimpan,
      // `newValue` memuat nama berkas sumber supaya asal-usul tarif ini
      // (bukan diketik manual operator) terlacak selamanya.
      await catatAudit(
        ctx,
        {
          tableName: 'ServiceRate',
          recordId: rate.id,
          action: 'CREATE',
          newValue: { ...rate, sourceFile: sourceFileName, importedVia: 'ai-rate-import' },
        },
        jejak,
      )
      hasil.push({ ok: true, rateId: rate.id })
    } catch (e) {
      const pesan = e instanceof Error ? e.message : 'Gagal menyimpan baris.'
      hasil.push({
        ok: false,
        error: rateIdTersimpan
          ? `Tarif tersimpan (id ${rateIdTersimpan}) tapi jejak audit gagal dicatat — JANGAN diulang, periksa manual di Master › Jasa: ${pesan}`
          : pesan,
      })
    }
  }

  return Response.json({ hasil })
})
