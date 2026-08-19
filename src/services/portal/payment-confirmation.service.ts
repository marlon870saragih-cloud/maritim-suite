// Konfirmasi pembayaran dari portal — SATU-SATUNYA tulisan yang bermakna
// bagi pelanggan (K169, Fase 8f).
//
// ⚠️ ATURAN YANG MENGIKAT, kata demi kata dari dokumen desain: tindakan ini
// TIDAK PERNAH membuat `InvoicePayment`, TIDAK PERNAH mengubah `Invoice.status`,
// TIDAK PERNAH mengurangi outstanding. Ia hanya membuat satu `Notification` ke
// FINANCE + satu `Comment` bertanda "dari portal" + (opsional) satu
// `Attachment`. Manusia yang mencatat penerimaannya sungguhan — seperti
// sekarang. Prinsipnya sebentuk dengan K122 (PO tak pernah menulis baris FDA
// sendiri) dan K52 (AI tak pernah menulis): tak satu pun tindakan pihak luar
// boleh mengubah angka uang, status dokumen, atau data induk.
//
// Tulisannya lewat klien INTERNAL (`systemContext`, pola sama document.service.ts
// & http.ts K144/4) — Comment/Notification/Attachment tak satu pun ada di
// MODEL_PORTAL_TULIS (K148: baru VendorInvoiceSubmission yang dirancang untuk
// portal-guard). Keamanannya bersandar pada VERIFIKASI KEPEMILIKAN lewat
// `pctx.db` SEBELUM baris pertama ditulis — persis pola K85.

import { notFound, validation } from '../errors'
import { systemContext } from '../context'
import { forTenant } from '../tenant-db'
import { createComment } from '../ops/comment.service'
import { uploadAttachment } from '../ops/attachment.service'
import { notify } from '../notification.service'
import type { PortalContext } from './context'

const PANJANG_RUJUKAN_MAKS = 200
const PANJANG_CATATAN_MAKS = 2000
const UKURAN_BUKTI_MAKS = 20 * 1024 * 1024 // sama dgn BATAS_UKURAN_BYTE attachment.service.ts

export type HasilKonfirmasiPembayaran = {
  ok: true
  invoiceNumber: string
  /** Diteruskan apa adanya — TIDAK berarti Invoice sudah berubah statusnya. */
  belumMengubahTagihan: true
}

export async function konfirmasiPembayaranPortal(
  pctx: PortalContext,
  invoiceId: string,
  body: {
    referenceNumber: unknown
    note?: unknown
    berkas?: { fileName: string; mimeType: string | null; isi: Buffer } | null
  },
): Promise<HasilKonfirmasiPembayaran> {
  if (pctx.pihak !== 'CUSTOMER') throw notFound('Invoice')

  // Kepemilikan dibuktikan LEBIH DULU, lewat pctx.db (portal-guard + RLS,
  // K147/K148) — sebelum satu baris pun ditulis di jalur internal.
  const inv = await pctx.db.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: { id: true, invoiceNumber: true, voyageId: true },
  })
  if (!inv) throw notFound('Invoice')

  const rujukan = String(body.referenceNumber ?? '').trim()
  if (!rujukan) throw validation('Nomor rujukan transfer wajib diisi.')
  if (rujukan.length > PANJANG_RUJUKAN_MAKS) throw validation(`Nomor rujukan maksimal ${PANJANG_RUJUKAN_MAKS} karakter.`)

  const catatan = typeof body.note === 'string' ? body.note.trim() : ''
  if (catatan.length > PANJANG_CATATAN_MAKS) throw validation(`Catatan maksimal ${PANJANG_CATATAN_MAKS} karakter.`)

  if (body.berkas && body.berkas.isi.length > UKURAN_BUKTI_MAKS) {
    throw validation(`Ukuran bukti transfer melebihi batas ${UKURAN_BUKTI_MAKS / 1024 / 1024} MB.`)
  }

  const sysCtx = systemContext(pctx.tenantId, `portal:${pctx.portalUserId}`)

  const isiKomentar =
    `Pelanggan mengonfirmasi pembayaran via portal. Nomor rujukan: ${rujukan}.` +
    (catatan ? ` Catatan: ${catatan}` : '') +
    ' — belum tercatat sebagai pembayaran; menunggu verifikasi FINANCE.'

  // 1 — Comment "dari portal" (authorUserId = portal:<id>, pola AuditLog K144/4).
  await createComment(sysCtx, { entityType: 'INVOICE', entityId: inv.id, body: isiKomentar })

  // 2 — Attachment OPSIONAL (bukti transfer). Sengaja tidak dipaksa: rujukan
  // tertulis di Comment sudah cukup untuk memulai verifikasi manusia; berkas
  // hanya mempercepatnya.
  if (body.berkas) {
    await uploadAttachment(sysCtx, {
      entityType: 'INVOICE',
      entityId: inv.id,
      fileName: body.berkas.fileName,
      mimeType: body.berkas.mimeType,
      isi: body.berkas.isi,
      kind: 'RECEIPT',
      note: `Bukti transfer dari pelanggan (portal) — ref. ${rujukan}`,
    })
  }

  // 3 — Notification BERTARGET ke tiap FINANCE aktif (bukan siaran — pola K103/
  // K156: Notification.readAt satu nilai per baris, siaran akan ditandai
  // terbaca oleh siapa pun yang membacanya duluan).
  const penerima = await forTenant(sysCtx).user.findMany({
    where: { role: 'FINANCE', isActive: true },
    select: { id: true },
  })
  for (const u of penerima) {
    await notify(sysCtx, {
      type: 'PORTAL_PAYMENT_CONFIRMED',
      userId: u.id,
      title: `Pelanggan mengonfirmasi pembayaran: ${inv.invoiceNumber}`,
      message: `Ref. ${rujukan}${catatan ? ` — ${catatan}` : ''}. Periksa & catat penerimaannya di Invoice.`,
      entityType: 'INVOICE',
      entityId: inv.id,
      href: inv.voyageId ? `/voyages/${inv.voyageId}/invoices/${inv.id}` : undefined,
    })
  }

  return { ok: true, invoiceNumber: inv.invoiceNumber, belumMengubahTagihan: true }
}
