import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Receipt, FileText, Calculator, Wallet, Eye, Plus, Download, FileEdit, type LucideIcon } from 'lucide-react'
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
    id: 'foa',
    title: 'FOA',
    desc: 'Final Outturn Account',
    icon: Wallet,
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    formHref: '/finance/foa/baru',
    pdfHref: '/api/documents/foa',
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
]

export default async function FinancePage() {
  const session = await getServerSession(authOptions)
  const savedDocs = session?.user
    ? await prisma.maritimeDocument.findMany({
        where: { tenantId: session.user.tenantId, docType: { in: ['EPDA', 'FPDA', 'FOA', 'INVOICE'] } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    : []

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        kicker="Generator Keuangan"
        title="Buat dokumen keuangan"
        description="EPDA · FPDA · FOA · Invoice — perhitungan agency fee & disbursement otomatis."
      />

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
                  const li = (d.lineItems ?? {}) as { vesselName?: string; vesselVoyage?: string }
                  const kind = d.docType.toLowerCase() // 'epda' | 'fpda' | 'invoice'
                  const badge =
                    d.docType === 'FPDA'
                      ? 'text-accent-teal border-accent-teal/30 bg-accent-teal/10'
                      : d.docType === 'INVOICE'
                        ? 'text-accent-purple border-accent-purple/30 bg-accent-purple/10'
                        : d.docType === 'FOA'
                          ? 'text-accent-amber border-accent-amber/30 bg-accent-amber/10'
                          : 'text-accent-blue border-accent-blue/30 bg-accent-blue/10'
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-card-border/50 last:border-0 hover:bg-surface-tertiary/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${badge}`}>
                          {d.docType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-text-primary whitespace-nowrap">{d.docNumber}</td>
                      <td className="px-4 py-3 text-text-primary">{li.vesselName ?? li.vesselVoyage ?? '—'}</td>
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
          Keempat dokumen keuangan (EPDA · FPDA · FOA · Invoice) sudah bisa dibuat, disimpan &amp;
          diunduh — format resmi, kop &amp; rekening otomatis dari profil perusahaan Anda.
        </p>
      </div>
    </div>
  )
}
