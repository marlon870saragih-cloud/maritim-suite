import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Receipt, ReceiptText, FileText, Calculator, Eye, Plus, Download, FileEdit, ArrowRight, PlusCircle, MinusCircle, ClipboardList, ShoppingCart, Fuel, BarChart3, BookText, FileSpreadsheet, FileCode, type LucideIcon } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/shared/PageHeader'

const fmt = (n: number | null) => (n ?? 0).toLocaleString('en-US')

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  FINAL: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  SENT: 'bg-accent-teal/10 text-accent-teal border-accent-teal/30',
  PAID: 'bg-status-success/10 text-status-success border-status-success/30',
  CANCELLED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
}

type FinanceDoc = {
  id: string
  title: string
  desc: string
  icon: LucideIcon
  bar: string
  iconText: string
  formHref?: string // ada → tombol "Buat" aktif
  pdfHref?: string // ada → tombol "Lihat contoh" PDF
}

const FINANCE_DOCS: FinanceDoc[] = [
  {
    id: 'epda',
    title: 'EPDA',
    desc: 'Estimasi Proforma Disbursement Account',
    icon: Calculator,
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    formHref: '/finance/epda/baru',
    pdfHref: '/api/documents/epda',
  },
  {
    id: 'fpda',
    title: 'FPDA',
    desc: 'Final Disbursement Account',
    icon: FileText,
    bar: 'bg-accent-teal',
    iconText: 'text-accent-teal',
    formHref: '/finance/fpda/baru',
    pdfHref: '/api/documents/fpda',
  },
  {
    id: 'invoice',
    title: 'Invoice',
    desc: 'Tagihan jasa keagenan (PPN 11%)',
    icon: Receipt,
    bar: 'bg-accent-purple',
    iconText: 'text-accent-purple',
    formHref: '/finance/invoice/baru',
    pdfHref: '/api/documents/invoice',
  },
  {
    id: 'receipt',
    title: 'Kwitansi',
    desc: 'Tanda terima pembayaran (terbilang otomatis)',
    icon: ReceiptText,
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    formHref: '/finance/receipt/baru',
    pdfHref: '/api/documents/receipt',
  },
  {
    id: 'debit-note',
    title: 'Nota Debit',
    desc: 'Tambahan tagihan di luar FDA / koreksi naik',
    icon: PlusCircle,
    bar: 'bg-status-danger',
    iconText: 'text-status-danger',
    formHref: '/finance/debit-note/baru',
    pdfHref: '/api/documents/debit-note',
  },
  {
    id: 'credit-note',
    title: 'Nota Kredit',
    desc: 'Pengurangan / pengembalian kelebihan tagihan',
    icon: MinusCircle,
    bar: 'bg-status-success',
    iconText: 'text-status-success',
    formHref: '/finance/credit-note/baru',
    pdfHref: '/api/documents/credit-note',
  },
  {
    id: 'pr',
    title: 'Purchase Requisition',
    desc: 'Permintaan pengadaan barang/jasa kapal',
    icon: ClipboardList,
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    formHref: '/finance/pr/baru',
    pdfHref: '/api/documents/pr',
  },
  {
    id: 'po',
    title: 'Purchase Order',
    desc: 'Order pembelian ke supplier (PPN otomatis)',
    icon: ShoppingCart,
    bar: 'bg-accent-teal',
    iconText: 'text-accent-teal',
    formHref: '/finance/po/baru',
    pdfHref: '/api/documents/po',
  },
  {
    id: 'bdn',
    title: 'Bunker Delivery Note',
    desc: 'Bukti serah bunker ke kapal (MARPOL Annex VI)',
    icon: Fuel,
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    formHref: '/finance/bdn/baru',
    pdfHref: '/api/documents/bdn',
  },
  {
    id: 'soa',
    title: 'Statement of Account',
    desc: 'Rekap tagihan & saldo per principal langganan',
    icon: BookText,
    bar: 'bg-accent-purple',
    iconText: 'text-accent-purple',
    formHref: '/finance/soa/baru',
    pdfHref: '/api/documents/soa',
  },
]

// Pemetaan DocType DB → segmen route/endpoint & label badge.
const DOC_KIND: Record<string, string> = {
  OFFICIAL_RECEIPT: 'receipt',
  DEBIT_NOTE: 'debit-note',
  CREDIT_NOTE: 'credit-note',
  PURCHASE_REQUISITION: 'pr',
  PURCHASE_ORDER: 'po',
  BDN: 'bdn',
  STATEMENT_OF_ACCOUNT: 'soa',
}
const DOC_LABEL: Record<string, string> = {
  OFFICIAL_RECEIPT: 'KWITANSI',
  DEBIT_NOTE: 'NOTA DEBIT',
  CREDIT_NOTE: 'NOTA KREDIT',
  PURCHASE_REQUISITION: 'PR',
  PURCHASE_ORDER: 'PO',
  BDN: 'BDN',
  STATEMENT_OF_ACCOUNT: 'SOA',
}

export default async function FinancePage() {
  const session = await getServerSession(authOptions)
  const savedDocs = session?.user
    ? await prisma.maritimeDocument.findMany({
        where: {
          tenantId: session.user.tenantId,
          docType: {
            in: [
              'EPDA', 'FPDA', 'INVOICE', 'OFFICIAL_RECEIPT', 'DEBIT_NOTE', 'CREDIT_NOTE',
              'PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'BDN', 'STATEMENT_OF_ACCOUNT',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    : []

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          kicker="Generator Keuangan"
          title="Buat dokumen keuangan"
          description="EPDA · FPDA · Invoice — perhitungan agency fee & disbursement otomatis."
        />
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/api/efaktur/coretax"
            title="XML impor Faktur Pajak Keluaran untuk Coretax DJP (periksa kode transaksi & NPWP sebelum impor)"
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-accent-teal/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FileCode className="w-4 h-4 text-accent-teal" />
            e-Faktur Coretax (XML)
          </a>
          <a
            href="/api/efaktur/export"
            title="Ringkasan invoice (CSV) untuk catatan internal — bukan untuk impor Coretax"
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-status-success/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-status-success" />
            Ringkasan CSV
          </a>
          <Link
            href="/finance/analisa"
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-accent-blue/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4 text-accent-blue" />
            Analisa Laba &amp; Variance
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FINANCE_DOCS.map((doc) => {
          const Icon = doc.icon
          return (
            <div
              key={doc.id}
              className="bg-card-bg border border-card-border rounded-lg p-5 relative overflow-hidden flex flex-col"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${doc.bar}`} />
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-surface-tertiary rounded-md ${doc.iconText}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-white">{doc.title}</h3>
                  <p className="text-text-secondary text-xs">{doc.desc}</p>
                </div>
              </div>

              {doc.formHref ? (
                <div className="flex items-center gap-2 mt-4">
                  <Link
                    href={doc.formHref}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                               bg-[#2E86DE] hover:bg-accent-blue text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Buat {doc.title}
                  </Link>
                  {doc.pdfHref ? (
                    <a
                      href={doc.pdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                                 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60
                                 hover:bg-surface-tertiary transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Lihat contoh
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider
                                   bg-surface-tertiary text-text-secondary/70 border border-border-muted">
                    Segera
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </section>

      {savedDocs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg text-white">Dokumen Tersimpan</h2>
            <span className="text-xs font-mono text-text-secondary">{savedDocs.length} dokumen</span>
          </div>
          <div className="bg-card-bg border border-card-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-card-border text-[10px] font-mono uppercase tracking-wider text-text-secondary/70">
                  <th className="text-left px-4 py-3 font-medium">Tipe</th>
                  <th className="text-left px-4 py-3 font-medium">No. Dokumen</th>
                  <th className="text-left px-4 py-3 font-medium">Kapal</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {savedDocs.map((d) => {
                  const li = (d.lineItems ?? {}) as { vesselName?: string; vesselVoyage?: string; receivedFrom?: string; toName?: string }
                  const kind = DOC_KIND[d.docType] ?? d.docType.toLowerCase() // 'epda' | 'fpda' | 'invoice' | 'receipt'
                  const typeLabel = DOC_LABEL[d.docType] ?? d.docType
                  const badge =
                    d.docType === 'FPDA'
                      ? 'text-accent-teal border-accent-teal/30 bg-accent-teal/10'
                      : d.docType === 'INVOICE'
                        ? 'text-accent-purple border-accent-purple/30 bg-accent-purple/10'
                        : d.docType === 'OFFICIAL_RECEIPT'
                          ? 'text-accent-amber border-accent-amber/30 bg-accent-amber/10'
                          : d.docType === 'DEBIT_NOTE'
                            ? 'text-status-danger border-status-danger/30 bg-status-danger/10'
                            : d.docType === 'CREDIT_NOTE'
                              ? 'text-status-success border-status-success/30 bg-status-success/10'
                              : d.docType === 'PURCHASE_ORDER'
                                ? 'text-accent-teal border-accent-teal/30 bg-accent-teal/10'
                                : d.docType === 'BDN'
                                  ? 'text-accent-amber border-accent-amber/30 bg-accent-amber/10'
                                  : d.docType === 'STATEMENT_OF_ACCOUNT'
                                    ? 'text-accent-purple border-accent-purple/30 bg-accent-purple/10'
                                    : 'text-accent-blue border-accent-blue/30 bg-accent-blue/10'
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-card-border/50 last:border-0 hover:bg-surface-tertiary/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badge}`}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-text-primary whitespace-nowrap">{d.docNumber}</td>
                      <td className="px-4 py-3 text-text-primary">{li.vesselName ?? li.vesselVoyage ?? li.receivedFrom ?? li.toName ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-text-primary whitespace-nowrap">
                        {d.currency} {fmt(d.grandTotal)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${STATUS_STYLE[d.status] ?? STATUS_STYLE.DRAFT}`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {d.docType === 'EPDA' && (
                            <Link
                              href={`/finance/fpda/baru?from=${d.id}`}
                              title="Buat FPDA dari EPDA ini"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-teal/30 text-accent-teal text-[10px] font-medium hover:bg-accent-teal/10 transition-colors whitespace-nowrap"
                            >
                              FPDA <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {d.docType === 'FPDA' && (
                            <Link
                              href={`/finance/invoice/baru?from=${d.id}`}
                              title="Buat Invoice dari FPDA ini"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-purple/30 text-accent-purple text-[10px] font-medium hover:bg-accent-purple/10 transition-colors whitespace-nowrap"
                            >
                              Invoice <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {d.docType === 'PURCHASE_REQUISITION' && (
                            <Link
                              href={`/finance/po/baru?from=${d.id}`}
                              title="Buat Purchase Order dari PR ini"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-teal/30 text-accent-teal text-[10px] font-medium hover:bg-accent-teal/10 transition-colors whitespace-nowrap"
                            >
                              PO <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {d.docType === 'INVOICE' && (
                            <>
                              <Link
                                href={`/finance/receipt/baru?from=${d.id}`}
                                title="Buat Kwitansi dari Invoice ini"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-amber/30 text-accent-amber text-[10px] font-medium hover:bg-accent-amber/10 transition-colors whitespace-nowrap"
                              >
                                Kwitansi <ArrowRight className="w-3 h-3" />
                              </Link>
                              <Link
                                href={`/finance/debit-note/baru?from=${d.id}`}
                                title="Buat Nota Debit dari Invoice ini"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-status-danger/30 text-status-danger text-[10px] font-medium hover:bg-status-danger/10 transition-colors whitespace-nowrap"
                              >
                                Debit <ArrowRight className="w-3 h-3" />
                              </Link>
                              <Link
                                href={`/finance/credit-note/baru?from=${d.id}`}
                                title="Buat Nota Kredit dari Invoice ini"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-status-success/30 text-status-success text-[10px] font-medium hover:bg-status-success/10 transition-colors whitespace-nowrap"
                              >
                                Kredit <ArrowRight className="w-3 h-3" />
                              </Link>
                            </>
                          )}
                          <Link
                            href={`/finance/${kind}/baru?id=${d.id}`}
                            title="Buka / edit"
                            className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                          >
                            <FileEdit className="w-4 h-4" />
                          </Link>
                          <a
                            href={`/api/documents/${kind}?id=${d.id}&download=1`}
                            title="Unduh PDF"
                            className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="bg-card-bg border border-card-border rounded-lg p-6 text-center">
        <p className="text-text-secondary text-sm">
          Ketiga dokumen keuangan (EPDA · FPDA · Invoice) sudah bisa dibuat, disimpan &amp;
          diunduh — format resmi, kop &amp; rekening otomatis dari profil perusahaan Anda.
        </p>
      </div>
    </div>
  )
}
