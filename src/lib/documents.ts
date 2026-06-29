import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Baris dokumen untuk tabel "Dokumen Terbaru".
export type DocRow = {
  id: string
  docNumber: string
  type: string
  vessel: string
  port: string
  status: string
  editHref?: string
  viewHref?: string
  downloadHref?: string
}

// Pemetaan DocType DB → label + rute form (edit) + segmen API (view/download PDF).
export const DOC_META: Record<string, { label: string; edit: string; api: string }> = {
  EPDA: { label: 'EPDA', edit: '/finance/epda/baru', api: 'epda' },
  FPDA: { label: 'FPDA', edit: '/finance/fpda/baru', api: 'fpda' },
  INVOICE: { label: 'Invoice', edit: '/finance/invoice/baru', api: 'invoice' },
  OFFICIAL_RECEIPT: { label: 'Kwitansi', edit: '/finance/receipt/baru', api: 'receipt' },
  DEBIT_NOTE: { label: 'Nota Debit', edit: '/finance/debit-note/baru', api: 'debit-note' },
  CREDIT_NOTE: { label: 'Nota Kredit', edit: '/finance/credit-note/baru', api: 'credit-note' },
  PURCHASE_REQUISITION: { label: 'PR', edit: '/finance/pr/baru', api: 'pr' },
  PURCHASE_ORDER: { label: 'PO', edit: '/finance/po/baru', api: 'po' },
  BDN: { label: 'BDN', edit: '/finance/bdn/baru', api: 'bdn' },
  STATEMENT_OF_ACCOUNT: { label: 'SOA', edit: '/finance/soa/baru', api: 'soa' },
  NOR: { label: 'NOR', edit: '/dokumen/new/NOR', api: 'nor' },
  SOF: { label: 'SOF', edit: '/dokumen/new/SOF', api: 'sof' },
  ARRIVAL_REPORT: { label: 'Arrival Report', edit: '/dokumen/new/ARRIVAL_REPORT', api: 'arrival-report' },
  DEPARTURE_REPORT: { label: 'Departure Report', edit: '/dokumen/new/DEPARTURE_REPORT', api: 'departure-report' },
  FAL_5: { label: 'Crew List', edit: '/dokumen/new/FAL_5', api: 'crew-list' },
  FAL_1: { label: 'General Declaration', edit: '/dokumen/new/FAL_1', api: 'gendec' },
  FAL_3: { label: "Ship's Stores", edit: '/dokumen/new/FAL_3', api: 'ship-stores' },
  FAL_2: { label: 'Cargo Declaration', edit: '/dokumen/new/FAL_2', api: 'cargo-decl' },
  AGENCY_APPOINTMENT: { label: 'Agency Appointment', edit: '/dokumen/new/AGENCY_APPOINTMENT', api: 'appointment' },
}

/** Ringkasan satu dokumen terkait sebuah Port Call (untuk panel grup di Port Call). */
export type LinkedDoc = {
  id: string
  docType: string
  label: string
  docNumber: string
  status: string
  viewHref?: string
  editHref?: string
}

/** Bentuk baris dokumen terkait dari record MaritimeDocument (label + link via DOC_META). */
export function toLinkedDoc(d: { id: string; docType: string; docNumber: string; status: string }): LinkedDoc {
  const m = DOC_META[d.docType]
  return {
    id: d.id,
    docType: d.docType,
    label: m?.label ?? d.docType.replace(/_/g, ' '),
    docNumber: d.docNumber,
    status: d.status,
    viewHref: m ? `/api/documents/${m.api}?id=${d.id}` : undefined,
    editHref: m ? `${m.edit}?id=${d.id}` : undefined,
  }
}

type Stored = { vesselName?: string; vesselVoyage?: string; toName?: string; party?: string }

/** 10 dokumen terbaru milik tenant (semua jenis: finance + maritime). */
export async function getRecentDocuments(): Promise<DocRow[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return []

  const docs = await prisma.maritimeDocument.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return docs.map((d) => {
    const m = DOC_META[d.docType]
    const li = (d.lineItems ?? {}) as Stored
    return {
      id: d.id,
      docNumber: d.docNumber,
      type: m?.label ?? d.docType.replace(/_/g, ' '),
      vessel: li.vesselName ?? li.vesselVoyage ?? li.toName ?? li.party ?? '—',
      port: d.port ?? '—',
      status: d.status,
      editHref: m ? `${m.edit}?id=${d.id}` : undefined,
      viewHref: m ? `/api/documents/${m.api}?id=${d.id}` : undefined,
      downloadHref: m ? `/api/documents/${m.api}?id=${d.id}&download=1` : undefined,
    }
  })
}
