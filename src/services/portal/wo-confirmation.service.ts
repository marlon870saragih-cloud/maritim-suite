// Konfirmasi "pekerjaan selesai" dari portal vendor — K173, cetakan
// payment-confirmation.service.ts (K169) kata demi kata.
//
// ⚠️ ATURAN YANG MENGIKAT: tindakan ini TIDAK PERNAH mengubah `WorkOrder.status`
// atau `WorkOrder.actualEnd` — keduanya bahan metrik ketepatan waktu (K114) yang
// dipakai MENILAI vendor itu sendiri, dan pihak yang dinilai tidak boleh menulis
// angka penilaiannya (alasan K123, dipakai ulang K173). Yang boleh: satu
// `Comment` + satu `Notification` ke pembuat WO. Operator yang menetapkan
// `actualEnd`/status sesudahnya, lewat layar internal yang sudah ada.

import { notFound, forbidden, validation } from '../errors'
import { systemContext } from '../context'
import { forTenant } from '../tenant-db'
import { createComment } from '../ops/comment.service'
import { notify } from '../notification.service'
import type { PortalContext } from './context'

const PANJANG_CATATAN_MAKS = 2000

export type HasilKonfirmasiSelesai = {
  ok: true
  woNumber: string
  /** Diteruskan apa adanya — TIDAK berarti status/actualEnd WO sudah berubah. */
  belumMengubahStatus: true
}

export async function konfirmasiSelesaiPortal(
  pctx: PortalContext,
  workOrderId: string,
  body: { note?: unknown },
): Promise<HasilKonfirmasiSelesai> {
  if (pctx.pihak !== 'VENDOR') throw forbidden('Layar ini hanya untuk vendor.')

  // Kepemilikan dibuktikan LEBIH DULU lewat pctx.db (portal-guard+RLS) —
  // sebelum satu baris pun ditulis di jalur internal. `createdByUserId`
  // diambil di sini juga karena WorkOrder TIDAK di-GRANT untuk User (jalur
  // internal yang dipakai untuk notify() perlu id-nya, bukan nested include).
  const wo = await pctx.db.workOrder.findFirst({
    where: { id: workOrderId, deletedAt: null },
    select: { id: true, woNumber: true, voyageId: true },
  })
  if (!wo) throw notFound('Work Order')

  const catatan = typeof body.note === 'string' ? body.note.trim() : ''
  if (catatan.length > PANJANG_CATATAN_MAKS) {
    throw validation(`Catatan maksimal ${PANJANG_CATATAN_MAKS} karakter.`)
  }

  const sysCtx = systemContext(pctx.tenantId, `portal:${pctx.portalUserId}`)
  const internal = await forTenant(systemContext(pctx.tenantId)).workOrder.findFirst({
    where: { id: wo.id },
    select: { createdByUserId: true },
  })

  const isiKomentar =
    `Vendor mengonfirmasi pekerjaan sudah selesai via portal.` +
    (catatan ? ` Catatan: ${catatan}` : '') +
    ' — status & tanggal selesai belum berubah; menunggu verifikasi tim operasi.'

  await createComment(sysCtx, { entityType: 'WORK_ORDER', entityId: wo.id, body: isiKomentar })

  if (internal?.createdByUserId) {
    await notify(sysCtx, {
      type: 'VENDOR_WORK_CONFIRMED',
      userId: internal.createdByUserId,
      title: `Vendor mengonfirmasi pekerjaan selesai: ${wo.woNumber}`,
      message: catatan || 'Vendor menekan "Pekerjaan sudah kami selesaikan". Periksa & catat status sungguhannya.',
      entityType: 'WORK_ORDER',
      entityId: wo.id,
      href: `/procurement/${wo.id}`,
    })
  }

  return { ok: true, woNumber: wo.woNumber, belumMengubahStatus: true }
}
