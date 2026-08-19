// Tagihan vendor — SATU-SATUNYA jalur tulis pihak luar yang membuat baris
// baru di seluruh Fase 8 (K172). TAK PERNAH menyentuh uang secara otomatis
// (K122 sejalan): baris hanya "usulan", operator yang memutuskan memakainya
// lewat "Ambil dari tagihan vendor" di builder FDA.
//
// Sisi STAF (menandai submission terpakai, daftar untuk dialog picker) SENGAJA
// TIDAK ada di sini — §13 dokumen desain menegaskan "tak satu pun berkas di
// services/portal/ boleh diimpor oleh service internal", dan
// disbursement-item.service.ts (internal) perlu memanggilnya. Sisi itu ada di
// services/ops/vendor-submission.service.ts, cetakan pembagian yang sama
// dengan attachment.service.ts (internal) vs document.service.ts (portal)
// untuk model Attachment yang sama.

import { systemContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, rateLimited, forbidden } from '../errors'
import { str, num, tanggal } from '../input'
import { uploadAttachment, type HasilUnggah } from '../ops/attachment.service'
import { BATAS_KIRIMAN_VENDOR_PER_HARI } from '../saas/commercial-policy'
// Fase 8j — pemakaian (K183/K184). Boleh diimpor: usage.service.ts murni
// bertetangga services/saas/, bukan services/portal/ — larangan §13 di kepala
// berkas ini hanya soal service INTERNAL mengimpor services/portal/, bukan
// arah sebaliknya.
import { catatPemakaian } from '../saas/usage.service'
import type { PortalContext } from './context'

function pastikanVendor(pctx: PortalContext): void {
  if (pctx.pihak !== 'VENDOR') throw forbidden('Layar ini hanya untuk vendor.')
}

const PANJANG_NOMOR_MAKS = 100
const PANJANG_CATATAN_MAKS = 2000
const UKURAN_BERKAS_MAKS = 20 * 1024 * 1024 // sama dengan BATAS_UKURAN_BYTE attachment.service.ts

export type HasilUsulanTagihan = {
  ok: true
  submissionId: string
  status: string
  unggahan: HasilUnggah
}

/** Awal hari ini (UTC) — cukup untuk "per hari", tak perlu presisi zona waktu tenant (P54 tetap null hari ini). */
function awalHariIni(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

/**
 * K172/4 — batas laju. `BATAS_KIRIMAN_VENDOR_PER_HARI === null` (bawaan hari
 * ini, P54 belum berangka) → TIDAK ada query sama sekali, cetakan
 * `adaBatasTerpasang()` di quota.ts: biaya fitur ini nol sampai batasnya
 * benar-benar diisi.
 */
async function pastikanBelumMelebihiLaju(pctx: PortalContext): Promise<void> {
  if (BATAS_KIRIMAN_VENDOR_PER_HARI === null) return
  const sysCtx = systemContext(pctx.tenantId)
  const hariIni = await forTenant(sysCtx).vendorInvoiceSubmission.count({
    where: { vendorId: pctx.pihakId, createdAt: { gte: awalHariIni() } },
  })
  if (hariIni >= BATAS_KIRIMAN_VENDOR_PER_HARI) {
    throw rateLimited(
      `Batas ${BATAS_KIRIMAN_VENDOR_PER_HARI} kiriman tagihan per hari sudah tercapai. Coba lagi besok.`,
    )
  }
}

/**
 * K172 — kirim satu tagihan. Urutan mengikuti pola uploadAttachment()
 * (bentuk → tulis → berkas):
 *   1. Batas laju (K172/4).
 *   2. PO/WO tautan OPSIONAL divalidasi milik vendor ini lewat `pctx.db`
 *      (portal-guard+RLS) — bukan dipercaya dari input.
 *   3. Baris VendorInvoiceSubmission DAN berkas WAJIB (K172/2) SAMA-SAMA
 *      ditulis lewat klien INTERNAL (`systemContext`) — lihat catatan di
 *      bawah untuk alasannya BUKAN `pctx.db` untuk baris #3.
 *
 * ⚠️ KENAPA CREATE-nya BUKAN lewat `pctx.db`, meski model ini terdaftar di
 * MODEL_PORTAL_TULIS (K148) — ditemukan lewat kegagalan sungguhan
 * (`check-vendor-portal.mjs`), bukan diduga di atas kertas: `pctx.db` adalah
 * klien di DALAM satu transaksi interaktif (`withPortalTx`, K149) yang belum
 * commit selama handler permintaan ini masih berjalan. `uploadAttachment()`
 * WAJIB lewat klien INTERNAL (Attachment tak ada di MODEL_PORTAL_TULIS) —
 * klien itu koneksi/transaksi yang SAMA SEKALI TERPISAH, dan pada level
 * isolasi Postgres standar (READ COMMITTED) koneksi terpisah TIDAK PERNAH
 * melihat baris yang ditulis transaksi lain yang belum commit. Baris
 * `VendorInvoiceSubmission` yang baru dibuat lewat `pctx.db` karena itu
 * "tidak ada" bagi `pastikanEntitasMilikTenant()` (K85) yang dipanggil
 * `uploadAttachment()` — gagal NOT_FOUND, bukan galat aneh, tapi konsisten
 * dengan cara kerja transaksi database.
 *
 * Perbaikannya: baris #3 DAN #4 SAMA-SAMA lewat klien INTERNAL yang SAMA
 * (`sysCtx`, satu koneksi) — persis pola payment-confirmation.service.ts K169
 * (Comment+Attachment keduanya lewat `systemContext`). Amannya TETAP terjaga
 * karena `tenantId`/`vendorId` yang ditulis berasal dari `pctx.tenantId`/
 * `pctx.pihakId` — nilai sesi tervalidasi server, BUKAN dari input pemanggil —
 * jaminan yang sama persis dengan yang portal-guard berikan, hanya
 * ditegakkan di sini secara eksplisit alih-alih lewat ekstensi Prisma.
 * `pctx.db` tetap dipakai untuk PEMBACAAN (verifikasi PO/WO di #2) karena itu
 * TIDAK menyentuh masalah lintas-transaksi ini sama sekali.
 */
export async function buatUsulanTagihan(
  pctx: PortalContext,
  body: {
    invoiceNo: unknown
    invoiceDate: unknown
    currency?: unknown
    amount: unknown
    note?: unknown
    purchaseOrderId?: unknown
    workOrderId?: unknown
  },
  berkas: { fileName: string; mimeType: string | null; isi: Buffer },
): Promise<HasilUsulanTagihan> {
  pastikanVendor(pctx)
  await pastikanBelumMelebihiLaju(pctx)

  const invoiceNo = str(body.invoiceNo)
  if (!invoiceNo) throw validation('Nomor tagihan wajib diisi.')
  if (invoiceNo.length > PANJANG_NOMOR_MAKS) throw validation(`Nomor tagihan maksimal ${PANJANG_NOMOR_MAKS} karakter.`)

  const invoiceDate = tanggal(body.invoiceDate)
  if (!invoiceDate) throw validation('Tanggal tagihan wajib diisi dan harus tanggal yang sah.')

  const amount = num(body.amount)
  if (amount === null || amount <= 0) throw validation('Jumlah tagihan wajib diisi dan harus lebih dari nol.')

  const note = str(body.note)
  if (note && note.length > PANJANG_CATATAN_MAKS) throw validation(`Catatan maksimal ${PANJANG_CATATAN_MAKS} karakter.`)

  const currency = (str(body.currency) ?? 'IDR').toUpperCase()

  if (!berkas) throw validation('Berkas tagihan wajib dilampirkan (K172/2).')
  if (berkas.isi.length > UKURAN_BERKAS_MAKS) {
    throw validation(`Ukuran berkas melebihi batas ${UKURAN_BERKAS_MAKS / 1024 / 1024} MB.`)
  }

  // PO/WO opsional — dibuktikan milik vendor ini lewat pctx.db SEBELUM ditulis
  // (portal-guard sudah menyaring vendorId, jadi findFirst yang tak ketemu
  // berarti bukan milik pihak ini, bukan kebetulan tak ada).
  let purchaseOrderId: string | null = null
  let workOrderId: string | null = null
  let voyageId: string | null = null

  const poInput = str(body.purchaseOrderId)
  if (poInput) {
    const po = await pctx.db.purchaseOrder.findFirst({ where: { id: poInput, deletedAt: null }, select: { id: true, voyageId: true } })
    if (!po) throw notFound('Purchase Order')
    purchaseOrderId = po.id
    voyageId = po.voyageId ?? voyageId
  }
  const woInput = str(body.workOrderId)
  if (woInput) {
    const wo = await pctx.db.workOrder.findFirst({ where: { id: woInput, deletedAt: null }, select: { id: true, voyageId: true } })
    if (!wo) throw notFound('Work Order')
    workOrderId = wo.id
    voyageId = wo.voyageId ?? voyageId
  }

  // #3 — klien INTERNAL, BUKAN pctx.db (lihat catatan panjang di atas
  // fungsi ini). tenantId/vendorId eksplisit dari sesi tervalidasi server —
  // tak pernah dari input pemanggil.
  const sysCtx = systemContext(pctx.tenantId, `portal:${pctx.portalUserId}`)
  const submission = await forTenant(sysCtx).vendorInvoiceSubmission.create({
    data: {
      tenantId: pctx.tenantId,
      vendorId: pctx.pihakId,
      invoiceNo,
      invoiceDate,
      currency,
      amount,
      note,
      purchaseOrderId,
      workOrderId,
      voyageId,
      status: 'SUBMITTED',
      submittedByPortalUserId: pctx.portalUserId,
    },
  })

  // #4 — klien INTERNAL YANG SAMA (sysCtx, satu koneksi) — sekarang bisa
  // melihat baris #3 karena keduanya lewat jalur yang sama.
  const unggahan = await uploadAttachment(sysCtx, {
    entityType: 'VENDOR_INVOICE_SUBMISSION',
    entityId: submission.id,
    fileName: berkas.fileName,
    mimeType: berkas.mimeType,
    isi: berkas.isi,
    kind: 'RECEIPT',
    note: `Tagihan vendor (portal) — ${invoiceNo}`,
  })

  // Fase 8j / K183 — userId null (peristiwa portal), sysCtx sudah dibangun
  // di atas untuk #3/#4, dipakai ulang di sini.
  await catatPemakaian(sysCtx, 'VENDOR_INVOICE_SUBMITTED')

  return { ok: true, submissionId: submission.id, status: submission.status, unggahan }
}
