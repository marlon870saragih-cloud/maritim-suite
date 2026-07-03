import { Prisma, type DocType, type DocStatus } from '@prisma/client'
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
  date?: string
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
  SPK: { label: 'SPK', edit: '/finance/spk/baru', api: 'spk' },
  NOR: { label: 'NOR', edit: '/dokumen/new/NOR', api: 'nor' },
  SOF: { label: 'SOF', edit: '/dokumen/new/SOF', api: 'sof' },
  ARRIVAL_REPORT: { label: 'Arrival Report', edit: '/dokumen/new/ARRIVAL_REPORT', api: 'arrival-report' },
  DEPARTURE_REPORT: { label: 'Departure Report', edit: '/dokumen/new/DEPARTURE_REPORT', api: 'departure-report' },
  DAMAGE_REPORT: { label: 'Damage Report', edit: '/dokumen/new/DAMAGE_REPORT', api: 'damage' },
  ULLAGE_REPORT: { label: 'Ullage Report', edit: '/dokumen/new/ULLAGE_REPORT', api: 'ullage' },
  LETTER_OF_PROTEST: { label: 'Letter of Protest', edit: '/dokumen/new/LETTER_OF_PROTEST', api: 'protest' },
  NOTE_OF_PROTEST: { label: 'Note of Protest', edit: '/dokumen/new/NOTE_OF_PROTEST', api: 'note-protest' },
  CREW_CHANGE_NOTICE: { label: 'Crew Change Notice', edit: '/dokumen/new/CREW_CHANGE_NOTICE', api: 'crew-change' },
  PORT_CALL_SUMMARY: { label: 'Port Call Summary', edit: '/dokumen/new/PORT_CALL_SUMMARY', api: 'port-call-summary' },
  LETTER_OF_INDEMNITY: { label: 'Letter of Indemnity', edit: '/dokumen/new/LETTER_OF_INDEMNITY', api: 'loi' },
  TIME_SHEET: { label: 'Time Sheet', edit: '/dokumen/new/TIME_SHEET', api: 'timesheet' },
  BUNKER_REQUISITION: { label: 'Bunker Requisition', edit: '/dokumen/new/BUNKER_REQUISITION', api: 'bunker-req' },
  FAL_5: { label: 'Crew List', edit: '/dokumen/new/FAL_5', api: 'crew-list' },
  FAL_1: { label: 'General Declaration', edit: '/dokumen/new/FAL_1', api: 'gendec' },
  FAL_3: { label: "Ship's Stores", edit: '/dokumen/new/FAL_3', api: 'ship-stores' },
  FAL_2: { label: 'Cargo Declaration', edit: '/dokumen/new/FAL_2', api: 'cargo-decl' },
  AGENCY_APPOINTMENT: { label: 'Agency Appointment', edit: '/dokumen/new/AGENCY_APPOINTMENT', api: 'appointment' },
  BILL_OF_LADING: { label: 'Bill of Lading', edit: '/dokumen/new/BILL_OF_LADING', api: 'bl' },
  // Dokumen generik (SimpleDocForm) — api lewat /api/documents/simple/[type].
  SIB: { label: 'Port Clearance (SIB)', edit: '/dokumen/new/SIB', api: 'simple/SIB' },
  CREW_SIGN_ON: { label: 'Crew Sign-On', edit: '/dokumen/new/CREW_SIGN_ON', api: 'simple/CREW_SIGN_ON' },
  CREW_SIGN_OFF: { label: 'Crew Sign-Off', edit: '/dokumen/new/CREW_SIGN_OFF', api: 'simple/CREW_SIGN_OFF' },
  SHORE_PASS: { label: 'Shore Pass', edit: '/dokumen/new/SHORE_PASS', api: 'simple/SHORE_PASS' },
  FAL_4: { label: "Crew's Effects", edit: '/dokumen/new/FAL_4', api: 'simple/FAL_4' },
  FAL_6: { label: 'Passenger List', edit: '/dokumen/new/FAL_6', api: 'simple/FAL_6' },
  FAL_7: { label: 'Dangerous Goods', edit: '/dokumen/new/FAL_7', api: 'simple/FAL_7' },
  MARITIME_DECLARATION_OF_HEALTH: { label: 'Declaration of Health', edit: '/dokumen/new/MARITIME_DECLARATION_OF_HEALTH', api: 'simple/MARITIME_DECLARATION_OF_HEALTH' },
  NOTICE_OF_ARRIVAL: { label: 'Notice of Arrival', edit: '/dokumen/new/NOTICE_OF_ARRIVAL', api: 'simple/NOTICE_OF_ARRIVAL' },
  CASH_TO_MASTER: { label: 'Cash to Master', edit: '/dokumen/new/CASH_TO_MASTER', api: 'simple/CASH_TO_MASTER' },
  LETTER_OF_AUTHORIZATION: { label: 'Letter of Authorization', edit: '/dokumen/new/LETTER_OF_AUTHORIZATION', api: 'simple/LETTER_OF_AUTHORIZATION' },
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`

export const ARCHIVE_PAGE_SIZE = 20
export const DOC_STATUSES: DocStatus[] = ['DRAFT', 'FINAL', 'SENT', 'PAID', 'CANCELLED']

export type DocSearch = { q?: string; type?: string; status?: string; page?: number }
export type DocSearchResult = { rows: DocRow[]; total: number; page: number; pages: number }

/**
 * Arsip dokumen — cari & telusuri SEMUA dokumen tersimpan milik tenant (bukan
 * hanya 10/30 terbaru). Filter: kata kunci (no. dokumen/port/kapal/principal),
 * jenis, status; dengan paginasi. Selalu dibatasi tenantId sesi.
 */
export async function searchDocuments(params: DocSearch): Promise<DocSearchResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { rows: [], total: 0, page: 1, pages: 0 }

  const page = Math.max(1, Math.floor(params.page ?? 1))
  const q = params.q?.trim()
  const where: Prisma.MaritimeDocumentWhereInput = { tenantId: session.user.tenantId }
  if (params.type && DOC_META[params.type]) where.docType = params.type as DocType
  if (params.status && (DOC_STATUSES as string[]).includes(params.status)) where.status = params.status as DocStatus
  if (q) {
    const contains = { contains: q, mode: 'insensitive' as const }
    where.OR = [
      { docNumber: contains },
      { port: contains },
      { vessel: { is: { name: contains } } },
      { principal: { is: { name: contains } } },
    ]
  }

  const [total, docs] = await Promise.all([
    prisma.maritimeDocument.count({ where }),
    prisma.maritimeDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * ARCHIVE_PAGE_SIZE,
      take: ARCHIVE_PAGE_SIZE,
      include: { vessel: { select: { name: true } }, principal: { select: { name: true } } },
    }),
  ])

  const rows: DocRow[] = docs.map((d) => {
    const m = DOC_META[d.docType]
    const li = (d.lineItems ?? {}) as Stored
    return {
      id: d.id,
      docNumber: d.docNumber,
      type: m?.label ?? d.docType.replace(/_/g, ' '),
      vessel: d.vessel?.name ?? li.vesselName ?? li.vesselVoyage ?? li.toName ?? li.party ?? '—',
      port: d.port ?? '—',
      status: d.status,
      date: fmtDate(d.createdAt),
      editHref: m ? `${m.edit}?id=${d.id}` : undefined,
      viewHref: m ? `/api/documents/${m.api}?id=${d.id}` : undefined,
      downloadHref: m ? `/api/documents/${m.api}?id=${d.id}&download=1` : undefined,
    }
  })

  return { rows, total, page, pages: Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE)) }
}
