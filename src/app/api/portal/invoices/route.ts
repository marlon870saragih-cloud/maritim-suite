// Endpoint uji 8a (K150/§17) — MEMBUKTIKAN withPortal()+forPortal() bekerja
// nyata lewat HTTP. Proyeksi PENUH (customer-view.ts → InvoicePortal, K167)
// menyusul di 8f; kolom di bawah SUDAH aman ditampilkan (bukan model Prisma
// mentah — tak ada vendorId, tak ada margin), tapi belum lengkap sengaja.

import { withPortal } from '@/services/portal/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withPortal(async (pctx) => {
  const rows = await pctx.db.invoice.findMany({
    select: { id: true, invoiceNumber: true, status: true, currency: true, grandTotal: true, amountPaid: true },
    orderBy: { invoiceDate: 'desc' },
  })
  return Response.json(rows)
})
