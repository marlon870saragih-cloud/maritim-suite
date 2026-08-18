// Fase 6h bagian 2 / K82, diperketat K112 (7f) — penyimpanan tarif hasil
// ekstraksi AI. TERPISAH dari `POST /api/service-rates` generik (dipakai form
// manual Master › Jasa) karena K82/4+K112 mewajibkan SETIAP penyimpanan dari
// jalur AI menulis AuditLog berisi asal-usul berkas — endpoint generik tak
// punya & tak perlu itu.
//
//   POST multipart: file, portId, items (JSON string dari array
//                    { serviceId, portId?, vesselType?, gtMin?, gtMax?, rate,
//                      currency?, minCharge?, effectiveFrom? })
//        → { hasil: [{ ok, rate? , error? }], lampiranId }
//
// K112 — lembar tarif itu SENDIRI (bukan cuma namanya) sekarang jadi lampiran:
// SATU Attachment (kind=RATE_SHEET) dibuat dari berkas yang sama yang dibaca
// AI, ditautkan ke Port yang operator pilih eksplisit di dialog (satu lembar
// biasanya memuat banyak baris lintas-jasa — ServiceRate sendiri bukan tempat
// orang membuka lampiran). AuditLog tiap baris ServiceRate lalu memuat
// `attachmentId`+`sha256` (bukan sekadar nama berkas) — tarif yang dipakai di
// EPDA jadi bisa ditelusuri sampai ke PDF aslinya, dan hash membuktikan
// berkasnya tak diganti sesudahnya.
//
// Berkas diunggah SEKALI per impor (bukan sekali per baris) — satu edaran
// tarif = satu lampiran, dipakai bersama oleh semua baris yang lahir darinya.
//
// Baris ServiceRate diproses SATU PER SATU (bukan transaksi tunggal):
// kegagalan satu baris (mis. serviceId ternyata sudah dihapus di antara
// pratinjau & simpan) tak boleh menggagalkan baris lain yang sudah dicentang
// benar oleh operator. `createServiceRate` SELALU membuat baris baru (tak ada
// mode update di jalur ini sama sekali, K82/1).

import { withTenant, jejakDari } from '@/services/http'
import { validation } from '@/services/errors'
import { str, wajib } from '@/services/input'
import { createServiceRate } from '@/services/master/service-rate.service'
import { catatAudit } from '@/services/finance/audit'
import { uploadAttachment } from '@/services/ops/attachment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAKS_BARIS = 200
const MAX_BYTES = 10 * 1024 * 1024

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
  const tipeKonten = req.headers.get('content-type') ?? ''
  if (!tipeKonten.toLowerCase().includes('multipart/form-data')) {
    throw validation('Permintaan harus dikirim sebagai multipart/form-data (berkas + items + portId).')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw validation('Isi permintaan tidak bisa dibaca.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) throw validation('Field "file" wajib ada dan harus berupa berkas — K112 mewajibkan berkas sumbernya sendiri tersimpan, bukan cuma namanya.')
  if (file.size > MAX_BYTES) {
    throw validation(`Ukuran berkas ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 10 MB.`)
  }

  const portId = wajib(str(form.get('portId')), 'Pelabuhan sumber tarif ini')

  let daftar: ItemMentah[]
  try {
    const parsed = JSON.parse(String(form.get('items') ?? '[]'))
    daftar = Array.isArray(parsed) ? parsed : []
  } catch {
    throw validation('Isi "items" tidak bisa dibaca.')
  }
  if (daftar.length === 0) throw validation('items wajib diisi minimal satu baris.')
  if (daftar.length > MAKS_BARIS) throw validation(`Terlalu banyak baris sekaligus (maksimal ${MAKS_BARIS}).`)

  // K112 — SATU Attachment untuk seluruh impor ini, dibuat SEBELUM baris
  // ServiceRate mana pun ditulis: kalau langkah ini gagal (mis. tipe berkas
  // ditolak periksaBerkas()), tak ada baris ServiceRate yatim tanpa lampiran.
  const isi = Buffer.from(await file.arrayBuffer())
  const lampiran = await uploadAttachment(ctx, {
    entityType: 'PORT',
    entityId: portId,
    fileName: file.name,
    mimeType: file.type || null,
    isi,
    kind: 'RATE_SHEET',
    note: 'Sumber impor tarif AI',
  })

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
      // K82/4 + K112 — WAJIB, bukan opsional: satu AuditLog per baris
      // tersimpan, `newValue` memuat attachmentId+sha256 (bukan sekadar nama
      // berkas) supaya asal-usul tarif ini terlacak sampai ke lembar aslinya.
      await catatAudit(
        ctx,
        {
          tableName: 'ServiceRate',
          recordId: rate.id,
          action: 'CREATE',
          newValue: {
            ...rate,
            sourceFile: file.name,
            importedVia: 'ai-rate-import',
            attachmentId: lampiran.attachment.id,
            sha256: lampiran.attachment.sha256,
          },
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

  return Response.json({ hasil, lampiranId: lampiran.attachment.id })
})
