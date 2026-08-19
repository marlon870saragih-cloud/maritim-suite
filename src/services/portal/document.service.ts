// Dokumen di portal — dibagikan SENGAJA, tidak pernah "semua lampiran" (K170,
// Fase 8f).
//
// ⚠️ Attachment TIDAK BISA masuk `MODEL_PORTAL` (portal-guard.ts, K148): ia
// model polimorfik tanpa kolom `customerId`/`vendorId` langsung (K84 — kunci
// pihak K148 butuh KOLOM, dan Attachment sengaja tak punya FK sama sekali).
// Karena itu berkas ini TIDAK memakai `pctx.db` untuk membaca Attachment —
// ia memakai klien INTERNAL (`forTenant(systemContext(...))`), persis pola
// yang sudah dipakai `services/portal/http.ts` untuk menulis AuditLog.
//
// Keamanannya tidak bergantung pada portal-guard di jalur ini, melainkan pada
// DUA pemeriksaan eksplisit di kode (K170/3, kata demi kata dari dokumen
// desain): "route portal memeriksa `sharedToPortal` DAN pemilik entitas
// induknya = pihak pemanggil." Yang kedua WAJIB dibuktikan lewat `pctx.db`
// (portal-guard + RLS, dua lapis K147/K148) — bukan diasumsikan dari daftar
// yang kebetulan sudah difilter di `listDocumentsPortal`.

import { notFound } from '../errors'
import { systemContext } from '../context'
import { forTenant } from '../tenant-db'
import { catatAudit } from '../finance/audit'
import { penyimpananLokal } from '../ops/storage/local'
import type { PortalContext } from './context'

export type DocumentPortal = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  kind: string | null
  entityType: string
  entityId: string
  sharedAt: string | null
}

/** Konteks internal ber-jejak "portal:<portalUserId>" — sama pola http.ts (K144/4). */
function sysCtxPortal(pctx: PortalContext) {
  return systemContext(pctx.tenantId, `portal:${pctx.portalUserId}`)
}

/**
 * K167/K170 — "Dokumen": HANYA lampiran yang sengaja dibagikan, pada
 * Invoice/Voyage milik pihak ini. Dua langkah:
 *   1. `pctx.db` (portal-guard+RLS) membuktikan Invoice/Voyage mana yang
 *      MEMANG milik pihak ini — sumber id yang dipercaya.
 *   2. Klien internal menyaring Attachment persis pada id-id terbukti itu,
 *      plus `sharedToPortal = true`.
 */
export async function listDocumentsPortal(pctx: PortalContext): Promise<DocumentPortal[]> {
  if (pctx.pihak !== 'CUSTOMER') return []

  const [invoices, voyages] = await Promise.all([
    pctx.db.invoice.findMany({ where: { deletedAt: null }, select: { id: true } }),
    pctx.db.voyage.findMany({ where: { deletedAt: null }, select: { id: true } }),
  ])
  const invoiceIds = invoices.map((i) => i.id)
  const voyageIds = voyages.map((v) => v.id)
  if (invoiceIds.length === 0 && voyageIds.length === 0) return []

  const rows = await forTenant(sysCtxPortal(pctx)).attachment.findMany({
    where: {
      deletedAt: null,
      sharedToPortal: true,
      OR: [
        ...(invoiceIds.length ? [{ entityType: 'INVOICE', entityId: { in: invoiceIds } }] : []),
        ...(voyageIds.length ? [{ entityType: 'VOYAGE', entityId: { in: voyageIds } }] : []),
      ],
    },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, kind: true, entityType: true, entityId: true, sharedAt: true },
    orderBy: { sharedAt: 'desc' },
  })
  return rows.map((r) => ({ ...r, sharedAt: r.sharedAt?.toISOString() ?? null }))
}

/**
 * K170/3+4 — unduh SATU dokumen. Kedua pemeriksaan dilakukan di sini, tak satu
 * pun boleh dilewati:
 *   1. `sharedToPortal === true` (dan `sensitive === false` sebagai pagar
 *      KEDUA — K170/2 seharusnya sudah menutupnya di titik tulis, tapi baris
 *      yang lahir sebelum aturan ini ada tak boleh diam-diam lolos).
 *   2. Entitas induknya (`entityType`+`entityId`) BENAR-BENAR milik pihak
 *      pemanggil, dibuktikan `pctx.db` — bukan diasumsikan.
 * Setiap unduhan yang lolos menulis SATU `AuditLog` ber-`action='EXPORT'`
 * (K170/4): pertanyaan "pelanggan sudah menerima FDA itu belum?" jadi punya
 * jawaban yang bisa ditunjukkan.
 */
export async function getSharedAttachmentContent(
  pctx: PortalContext,
  id: string,
): Promise<{ fileName: string; mimeType: string; isi: Buffer }> {
  if (pctx.pihak !== 'CUSTOMER') throw notFound('Dokumen')

  const sysCtx = sysCtxPortal(pctx)
  const row = await forTenant(sysCtx).attachment.findFirst({ where: { id, deletedAt: null } })
  if (!row || !row.sharedToPortal || row.sensitive) throw notFound('Dokumen')

  const pemilikTerbukti =
    row.entityType === 'INVOICE'
      ? await pctx.db.invoice.findFirst({ where: { id: row.entityId }, select: { id: true } })
      : row.entityType === 'VOYAGE'
        ? await pctx.db.voyage.findFirst({ where: { id: row.entityId }, select: { id: true } })
        : null
  if (!pemilikTerbukti) throw notFound('Dokumen')

  const isi = await penyimpananLokal.baca(row.storageKey)

  await catatAudit(sysCtx, { tableName: 'Attachment', recordId: row.id, action: 'EXPORT' })

  return { fileName: row.fileName, mimeType: row.mimeType, isi }
}
