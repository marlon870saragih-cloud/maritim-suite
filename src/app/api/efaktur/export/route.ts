import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type InvStored = {
  invoiceDate?: string
  billToName?: string
  billToNpwp?: string
  vesselVoyage?: string
  portCall?: string
}
type InvSubs = { subtotal?: number; agency?: number; vat?: number }

// Bungkus sel CSV bila mengandung koma / kutip / newline.
const esc = (v: string | number) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// GET /api/efaktur/export → CSV data invoice untuk diimpor/diolah ke e-Faktur DJP.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const invoices = await prisma.maritimeDocument.findMany({
    where: { tenantId: session.user.tenantId, docType: 'INVOICE' },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  })

  const header = ['Tanggal', 'No Invoice', 'Nama Pembeli', 'NPWP Pembeli', 'Kapal/Voyage', 'DPP', 'PPN', 'Total']
  const lines = [header.join(',')]

  for (const inv of invoices) {
    const li = (inv.lineItems ?? {}) as InvStored
    const sub = (inv.subtotals ?? {}) as InvSubs
    const dpp = (sub.subtotal ?? 0) + (sub.agency ?? 0) // dasar pengenaan pajak
    const row = [
      li.invoiceDate ?? '',
      inv.docNumber,
      li.billToName ?? '',
      li.billToNpwp ?? '',
      li.vesselVoyage || li.portCall || '',
      dpp,
      sub.vat ?? 0,
      inv.grandTotal ?? 0,
    ]
    lines.push(row.map(esc).join(','))
  }

  const csv = '﻿' + lines.join('\r\n') // BOM agar Excel baca UTF-8 benar
  const today = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="efaktur-invoice-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
