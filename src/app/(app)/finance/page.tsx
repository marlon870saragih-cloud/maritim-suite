import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { Receipt, ReceiptText, FileText, Calculator, Eye, Plus, Download, FileEdit, ArrowRight, PlusCircle, MinusCircle, ClipboardList, ShoppingCart, Fuel, BarChart3, BookText, FileSpreadsheet, FileSignature, Sparkles, AlertTriangle, type LucideIcon } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getLang, type Lang } from '@/lib/i18n-server'
import { PageHeader } from '@/components/shared/PageHeader'
import { EfakturExport, type MasaOption } from '@/components/finance/EfakturExport'
import { DocStatusControl } from '@/components/dokumen/DocStatusControl'
import { toIsoDate } from '@/lib/efaktur'

const fmt = (n: number | null) => (n ?? 0).toLocaleString('en-US')

type Bi = { id: string; en: string }

type FinanceDoc = {
  id: string
  title: string
  titleEn?: string // override nama untuk EN (mis. Kwitansi → Receipt)
  desc: Bi
  icon: LucideIcon
  bar: string
  iconText: string
  formHref?: string // ada → tombol "Buat" aktif
  pdfHref?: string // ada → tombol "Lihat contoh" PDF
}

const FIN: Record<Lang, {
  kicker: string; title: string; desc: string
  csvTitle: string; csvLabel: string; analisa: string; asisten: string
  pdfLabel: string; pdfTitle: string; xlsxLabel: string; xlsxTitle: string
  npwpWarnPre: string; npwpWarnLink: string; buyerWarn: (n: number) => string
  create: string; sample: string; soon: string
  saved: string; savedCount: (n: number) => string
  thType: string; thNo: string; thVessel: string; thTotal: string; thStatus: string; thAction: string
  tipOpen: string; tipDownload: string
  tipFpda: string; tipInvoice: string; tipPo: string; tipReceipt: string; tipDebit: string; tipCredit: string
  footer: string
}> = {
  id: {
    kicker: 'Generator Keuangan', title: 'Buat dokumen keuangan',
    desc: 'EPDA · FPDA · Invoice — perhitungan agency fee & disbursement otomatis.',
    csvTitle: 'Ringkasan invoice (CSV) untuk catatan internal — bukan untuk impor Coretax',
    csvLabel: 'Ringkasan CSV', analisa: 'Analisa Laba & Variance', asisten: 'Asisten Dokumen AI',
    pdfLabel: 'Laporan PDF', pdfTitle: 'Ringkasan keuangan (PDF) — KPI, aging, per principal & daftar invoice',
    xlsxLabel: 'Excel', xlsxTitle: 'Ringkasan keuangan (.xlsx) — rapi, ber-format & siap diolah di Excel',
    npwpWarnPre: 'NPWP perusahaan belum diisi untuk e-Faktur —', npwpWarnLink: 'isi di Profil Perusahaan',
    buyerWarn: (n) => `${n} invoice tanpa NPWP pembeli — lengkapi sebelum impor ke Coretax.`,
    create: 'Buat', sample: 'Lihat contoh', soon: 'Segera',
    saved: 'Dokumen Tersimpan', savedCount: (n) => `${n} dokumen`,
    thType: 'Tipe', thNo: 'No. Dokumen', thVessel: 'Kapal', thTotal: 'Total', thStatus: 'Status', thAction: 'Aksi',
    tipOpen: 'Buka / edit', tipDownload: 'Unduh PDF',
    tipFpda: 'Buat FPDA dari EPDA ini', tipInvoice: 'Buat Invoice dari FPDA ini', tipPo: 'Buat Purchase Order dari PR ini',
    tipReceipt: 'Buat Kwitansi dari Invoice ini', tipDebit: 'Buat Nota Debit dari Invoice ini', tipCredit: 'Buat Nota Kredit dari Invoice ini',
    footer: 'Ketiga dokumen keuangan (EPDA · FPDA · Invoice) sudah bisa dibuat, disimpan & diunduh — format resmi, kop & rekening otomatis dari profil perusahaan Anda.',
  },
  en: {
    kicker: 'Finance Generator', title: 'Create financial documents',
    desc: 'EPDA · FPDA · Invoice — agency fee & disbursement computed automatically.',
    csvTitle: 'Invoice summary (CSV) for internal records — not for Coretax import',
    csvLabel: 'CSV summary', analisa: 'Profit & Variance Analysis', asisten: 'AI Document Assistant',
    pdfLabel: 'PDF Report', pdfTitle: 'Financial summary (PDF) — KPI, aging, per principal & invoice list',
    xlsxLabel: 'Excel', xlsxTitle: 'Financial summary (.xlsx) — tidy, formatted & ready for Excel',
    npwpWarnPre: 'Company NPWP not set for e-Faktur —', npwpWarnLink: 'set it in Company Profile',
    buyerWarn: (n) => `${n} invoice(s) missing buyer NPWP — complete before importing to Coretax.`,
    create: 'Create', sample: 'View sample', soon: 'Soon',
    saved: 'Saved Documents', savedCount: (n) => `${n} documents`,
    thType: 'Type', thNo: 'Doc No.', thVessel: 'Vessel', thTotal: 'Total', thStatus: 'Status', thAction: 'Action',
    tipOpen: 'Open / edit', tipDownload: 'Download PDF',
    tipFpda: 'Create FPDA from this EPDA', tipInvoice: 'Create Invoice from this FPDA', tipPo: 'Create Purchase Order from this PR',
    tipReceipt: 'Create Receipt from this Invoice', tipDebit: 'Create Debit Note from this Invoice', tipCredit: 'Create Credit Note from this Invoice',
    footer: 'All three financial documents (EPDA · FPDA · Invoice) can be created, saved & downloaded — official format, letterhead & bank details auto-filled from your company profile.',
  },
}

const FINANCE_DOCS: FinanceDoc[] = [
  {
    id: 'epda',
    title: 'EPDA',
    desc: { id: 'Estimasi Proforma Disbursement Account', en: 'Estimated Proforma Disbursement Account' },
    icon: Calculator,
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    formHref: '/finance/epda/baru',
    pdfHref: '/api/documents/epda',
  },
  {
    id: 'fpda',
    title: 'FPDA',
    desc: { id: 'Final Disbursement Account', en: 'Final Disbursement Account' },
    icon: FileText,
    bar: 'bg-accent-teal',
    iconText: 'text-accent-teal',
    formHref: '/finance/fpda/baru',
    pdfHref: '/api/documents/fpda',
  },
  {
    id: 'invoice',
    title: 'Invoice',
    desc: { id: 'Tagihan jasa keagenan (PPN 11%)', en: 'Agency service invoice (VAT 11%)' },
    icon: Receipt,
    bar: 'bg-accent-purple',
    iconText: 'text-accent-purple',
    formHref: '/finance/invoice/baru',
    pdfHref: '/api/documents/invoice',
  },
  {
    id: 'receipt',
    title: 'Kwitansi',
    titleEn: 'Receipt',
    desc: { id: 'Tanda terima pembayaran (terbilang otomatis)', en: 'Payment receipt (amount in words, auto)' },
    icon: ReceiptText,
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    formHref: '/finance/receipt/baru',
    pdfHref: '/api/documents/receipt',
  },
  {
    id: 'debit-note',
    title: 'Nota Debit',
    titleEn: 'Debit Note',
    desc: { id: 'Tambahan tagihan di luar FDA / koreksi naik', en: 'Additional charge beyond FDA / upward correction' },
    icon: PlusCircle,
    bar: 'bg-status-danger',
    iconText: 'text-status-danger',
    formHref: '/finance/debit-note/baru',
    pdfHref: '/api/documents/debit-note',
  },
  {
    id: 'credit-note',
    title: 'Nota Kredit',
    titleEn: 'Credit Note',
    desc: { id: 'Pengurangan / pengembalian kelebihan tagihan', en: 'Reduction / refund of overcharge' },
    icon: MinusCircle,
    bar: 'bg-status-success',
    iconText: 'text-status-success',
    formHref: '/finance/credit-note/baru',
    pdfHref: '/api/documents/credit-note',
  },
  {
    id: 'pr',
    title: 'Purchase Requisition',
    desc: { id: 'Permintaan pengadaan barang/jasa kapal', en: 'Request to procure vessel goods/services' },
    icon: ClipboardList,
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    formHref: '/finance/pr/baru',
    pdfHref: '/api/documents/pr',
  },
  {
    id: 'po',
    title: 'Purchase Order',
    desc: { id: 'Order pembelian ke supplier (PPN otomatis)', en: 'Purchase order to supplier (VAT auto)' },
    icon: ShoppingCart,
    bar: 'bg-accent-teal',
    iconText: 'text-accent-teal',
    formHref: '/finance/po/baru',
    pdfHref: '/api/documents/po',
  },
  {
    id: 'bdn',
    title: 'Bunker Delivery Note',
    desc: { id: 'Bukti serah bunker ke kapal (MARPOL Annex VI)', en: 'Bunker delivery proof to vessel (MARPOL Annex VI)' },
    icon: Fuel,
    bar: 'bg-accent-amber',
    iconText: 'text-accent-amber',
    formHref: '/finance/bdn/baru',
    pdfHref: '/api/documents/bdn',
  },
  {
    id: 'soa',
    title: 'Statement of Account',
    desc: { id: 'Rekap tagihan & saldo per principal langganan', en: 'Charges & balance recap per subscribed principal' },
    icon: BookText,
    bar: 'bg-accent-purple',
    iconText: 'text-accent-purple',
    formHref: '/finance/soa/baru',
    pdfHref: '/api/documents/soa',
  },
  {
    id: 'spk',
    title: 'SPK',
    desc: { id: 'Surat Penunjukan Kerja — penunjukan sub-agen', en: 'Work Appointment Letter — sub-agent appointment' },
    icon: FileSignature,
    bar: 'bg-accent-blue',
    iconText: 'text-accent-blue',
    formHref: '/finance/spk/baru',
    pdfHref: '/api/documents/spk',
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
  SPK: 'spk',
}
const DOC_LABEL: Record<Lang, Record<string, string>> = {
  id: {
    OFFICIAL_RECEIPT: 'KWITANSI', DEBIT_NOTE: 'NOTA DEBIT', CREDIT_NOTE: 'NOTA KREDIT',
    PURCHASE_REQUISITION: 'PR', PURCHASE_ORDER: 'PO', BDN: 'BDN', STATEMENT_OF_ACCOUNT: 'SOA', SPK: 'SPK',
  },
  en: {
    OFFICIAL_RECEIPT: 'RECEIPT', DEBIT_NOTE: 'DEBIT NOTE', CREDIT_NOTE: 'CREDIT NOTE',
    PURCHASE_REQUISITION: 'PR', PURCHASE_ORDER: 'PO', BDN: 'BDN', STATEMENT_OF_ACCOUNT: 'SOA', SPK: 'SPK',
  },
}

export default async function FinancePage() {
  const lang = getLang()
  const t = FIN[lang]
  const session = await getServerSession(authOptions)
  const savedDocs = session?.user
    ? await prisma.maritimeDocument.findMany({
        where: {
          tenantId: session.user.tenantId,
          docType: {
            in: [
              'EPDA', 'FPDA', 'INVOICE', 'OFFICIAL_RECEIPT', 'DEBIT_NOTE', 'CREDIT_NOTE',
              'PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'BDN', 'STATEMENT_OF_ACCOUNT', 'SPK',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    : []

  // Kesiapan ekspor e-Faktur Coretax: NPWP penjual wajib (jadi <TIN>) + ada invoice.
  const [tenant, invoiceDocs] = session?.user
    ? await Promise.all([
        prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { npwp: true } }),
        prisma.maritimeDocument.findMany({
          where: { tenantId: session.user.tenantId, docType: 'INVOICE' },
          select: { lineItems: true },
          take: 1000,
        }),
      ])
    : [null, []]
  const hasNpwp = (v?: string | null) => !!(v && v.replace(/\D/g, '').length >= 15)
  const sellerNpwpOk = hasNpwp(tenant?.npwp)
  const invoiceCount = invoiceDocs.length
  const missingBuyerNpwp = invoiceDocs.filter(
    (i) => !hasNpwp((i.lineItems as { billToNpwp?: string } | null)?.billToNpwp),
  ).length
  const efakturReady = sellerNpwpOk && invoiceCount > 0

  // Daftar masa pajak (bulan invoice) untuk filter ekspor e-Faktur.
  const MASA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const masaSet = new Set<string>()
  for (const inv of invoiceDocs) {
    const iso = toIsoDate((inv.lineItems as { invoiceDate?: string } | null)?.invoiceDate ?? '')
    if (/^\d{4}-\d{2}/.test(iso)) masaSet.add(iso.slice(0, 7))
  }
  const masaList: MasaOption[] = Array.from(masaSet).sort().reverse().map((v) => {
    const [y, m] = v.split('-')
    return { value: v, label: `${MASA_MONTHS[Number(m) - 1] ?? m} ${y}` }
  })

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
        <div className="flex items-center gap-2 flex-wrap">
          <EfakturExport ready={efakturReady} sellerNpwpOk={sellerNpwpOk} masaList={masaList} />
          <a
            href="/api/efaktur/export"
            title={t.csvTitle}
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-status-success/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-status-success" />
            {t.csvLabel}
          </a>
          <a
            href="/api/finance/summary/xlsx"
            title={t.xlsxTitle}
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-accent-teal/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-accent-teal" />
            {t.xlsxLabel}
          </a>
          <a
            href="/api/finance/summary/pdf"
            target="_blank"
            rel="noopener noreferrer"
            title={t.pdfTitle}
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-accent-blue/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <FileText className="w-4 h-4 text-accent-blue" />
            {t.pdfLabel}
          </a>
          <Link
            href="/finance/analisa"
            className="inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-accent-blue/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4 text-accent-blue" />
            {t.analisa}
          </Link>
          <Link
            href="/finance/asisten"
            className="inline-flex items-center gap-2 bg-accent-purple/15 border border-accent-purple/40 hover:bg-accent-purple/25 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 text-accent-purple" />
            {t.asisten}
          </Link>

          {(!sellerNpwpOk || missingBuyerNpwp > 0) && (
            <p className="w-full text-right text-xs text-accent-amber/90 flex items-center justify-end gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {!sellerNpwpOk ? (
                <span>
                  {t.npwpWarnPre}{' '}
                  <Link href="/settings/company" className="underline hover:text-accent-amber">
                    {t.npwpWarnLink}
                  </Link>
                  .
                </span>
              ) : (
                <span>{t.buyerWarn(missingBuyerNpwp)}</span>
              )}
            </p>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FINANCE_DOCS.map((doc) => {
          const Icon = doc.icon
          const docName = lang === 'en' && doc.titleEn ? doc.titleEn : doc.title
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
                  <h3 className="font-display text-lg text-white">{docName}</h3>
                  <p className="text-text-secondary text-xs">{doc.desc[lang]}</p>
                </div>
              </div>

              {doc.formHref ? (
                <div className="flex items-center gap-2 mt-4">
                  <Link
                    href={doc.formHref}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                               bg-accent-blue hover:bg-primary text-[#231a06] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.create} {docName}
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
                      {t.sample}
                    </a>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <span className="inline-block px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider
                                   bg-surface-tertiary text-text-secondary/70 border border-border-muted">
                    {t.soon}
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
            <h2 className="font-display text-lg text-white">{t.saved}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-text-secondary">{t.savedCount(savedDocs.length)}</span>
              <Link
                href="/dokumen/arsip"
                className="text-xs font-medium text-accent-blue hover:text-primary transition-colors whitespace-nowrap"
              >
                {lang === 'id' ? 'Lihat semua' : 'View all'} →
              </Link>
            </div>
          </div>
          <div className="bg-card-bg border border-card-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-card-border text-[10px] font-mono uppercase tracking-wider text-text-secondary/70">
                  <th className="text-left px-4 py-3 font-medium">{t.thType}</th>
                  <th className="text-left px-4 py-3 font-medium">{t.thNo}</th>
                  <th className="text-left px-4 py-3 font-medium">{t.thVessel}</th>
                  <th className="text-right px-4 py-3 font-medium">{t.thTotal}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{t.thStatus}</th>
                  <th className="text-right px-4 py-3 font-medium">{t.thAction}</th>
                </tr>
              </thead>
              <tbody>
                {savedDocs.map((d) => {
                  const li = (d.lineItems ?? {}) as { vesselName?: string; vesselVoyage?: string; receivedFrom?: string; toName?: string }
                  const kind = DOC_KIND[d.docType] ?? d.docType.toLowerCase() // 'epda' | 'fpda' | 'invoice' | 'receipt'
                  const typeLabel = DOC_LABEL[lang][d.docType] ?? d.docType
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
                        {d.grandTotal == null ? <span className="text-text-secondary/60">—</span> : `${d.currency} ${fmt(d.grandTotal)}`}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <DocStatusControl id={d.id} status={d.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {d.docType === 'EPDA' && (
                            <Link
                              href={`/finance/fpda/baru?from=${d.id}`}
                              title={t.tipFpda}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-teal/30 text-accent-teal text-[10px] font-medium hover:bg-accent-teal/10 transition-colors whitespace-nowrap"
                            >
                              FPDA <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {d.docType === 'FPDA' && (
                            <Link
                              href={`/finance/invoice/baru?from=${d.id}`}
                              title={t.tipInvoice}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-purple/30 text-accent-purple text-[10px] font-medium hover:bg-accent-purple/10 transition-colors whitespace-nowrap"
                            >
                              Invoice <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {d.docType === 'PURCHASE_REQUISITION' && (
                            <Link
                              href={`/finance/po/baru?from=${d.id}`}
                              title={t.tipPo}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-teal/30 text-accent-teal text-[10px] font-medium hover:bg-accent-teal/10 transition-colors whitespace-nowrap"
                            >
                              PO <ArrowRight className="w-3 h-3" />
                            </Link>
                          )}
                          {d.docType === 'INVOICE' && (
                            <>
                              <Link
                                href={`/finance/receipt/baru?from=${d.id}`}
                                title={t.tipReceipt}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-accent-amber/30 text-accent-amber text-[10px] font-medium hover:bg-accent-amber/10 transition-colors whitespace-nowrap"
                              >
                                {lang === 'en' ? 'Receipt' : 'Kwitansi'} <ArrowRight className="w-3 h-3" />
                              </Link>
                              <Link
                                href={`/finance/debit-note/baru?from=${d.id}`}
                                title={t.tipDebit}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-status-danger/30 text-status-danger text-[10px] font-medium hover:bg-status-danger/10 transition-colors whitespace-nowrap"
                              >
                                Debit <ArrowRight className="w-3 h-3" />
                              </Link>
                              <Link
                                href={`/finance/credit-note/baru?from=${d.id}`}
                                title={t.tipCredit}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-status-success/30 text-status-success text-[10px] font-medium hover:bg-status-success/10 transition-colors whitespace-nowrap"
                              >
                                {lang === 'en' ? 'Credit' : 'Kredit'} <ArrowRight className="w-3 h-3" />
                              </Link>
                            </>
                          )}
                          <Link
                            href={`/finance/${kind}/baru?id=${d.id}`}
                            title={t.tipOpen}
                            className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                          >
                            <FileEdit className="w-4 h-4" />
                          </Link>
                          <a
                            href={`/api/documents/${kind}?id=${d.id}&download=1`}
                            title={t.tipDownload}
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
        <p className="text-text-secondary text-sm">{t.footer}</p>
      </div>
    </div>
  )
}
