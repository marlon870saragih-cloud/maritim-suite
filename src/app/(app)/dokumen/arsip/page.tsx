import Link from 'next/link'
import { Eye, Pencil, Download, Search, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { DocStatusControl } from '@/components/dokumen/DocStatusControl'
import { searchDocuments, DOC_META, DOC_STATUSES } from '@/lib/documents'
import { getLang, type Lang } from '@/lib/i18n-server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const AR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Arsip', h1: 'Semua Dokumen', back: 'Kembali ke Dokumen',
    desc: 'Cari & buka kembali dokumen tersimpan kapan pun — tanpa batas waktu.',
    search: 'Cari nomor, kapal, port, principal…', allTypes: 'Semua jenis', allStatus: 'Semua status',
    apply: 'Cari', reset: 'Reset',
    thNo: 'Nomor', thType: 'Tipe', thVessel: 'Kapal', thPort: 'Port', thDate: 'Dibuat', thStatus: 'Status', thAction: 'Aksi',
    view: 'Lihat PDF', edit: 'Buka / edit', download: 'Unduh PDF', noGen: 'Generator belum tersedia',
    empty: 'Tidak ada dokumen yang cocok dengan filter.',
    count: 'dokumen', pageOf: 'Halaman', of: 'dari', prev: 'Sebelumnya', next: 'Berikutnya',
    st_DRAFT: 'Draf', st_FINAL: 'Final', st_SENT: 'Terkirim', st_PAID: 'Lunas', st_CANCELLED: 'Batal',
  },
  en: {
    kicker: 'Archive', h1: 'All Documents', back: 'Back to Documents',
    desc: 'Search & reopen any saved document, anytime — no time limit.',
    search: 'Search number, vessel, port, principal…', allTypes: 'All types', allStatus: 'All statuses',
    apply: 'Search', reset: 'Reset',
    thNo: 'Number', thType: 'Type', thVessel: 'Vessel', thPort: 'Port', thDate: 'Created', thStatus: 'Status', thAction: 'Action',
    view: 'View PDF', edit: 'Open / edit', download: 'Download PDF', noGen: 'Generator not available yet',
    empty: 'No documents match these filters.',
    count: 'documents', pageOf: 'Page', of: 'of', prev: 'Previous', next: 'Next',
    st_DRAFT: 'Draft', st_FINAL: 'Final', st_SENT: 'Sent', st_PAID: 'Paid', st_CANCELLED: 'Cancelled',
  },
}

type SP = { q?: string; type?: string; status?: string; page?: string }

export default async function ArsipPage({ searchParams }: { searchParams: SP }) {
  const t = AR[getLang()]
  const q = typeof searchParams.q === 'string' ? searchParams.q : ''
  const type = typeof searchParams.type === 'string' ? searchParams.type : ''
  const status = typeof searchParams.status === 'string' ? searchParams.status : ''
  const page = Number(searchParams.page) || 1

  const { rows, total, page: cur, pages } = await searchDocuments({ q, type, status, page })

  // Bangun URL halaman lain dengan filter dipertahankan.
  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (type) sp.set('type', type)
    if (status) sp.set('status', status)
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return s ? `/dokumen/arsip?${s}` : '/dokumen/arsip'
  }

  const typeOptions = Object.entries(DOC_META)
    .map(([value, m]) => ({ value, label: m.label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const inputCls =
    'h-10 rounded-lg bg-surface-secondary border border-card-border text-sm text-text-primary placeholder:text-text-secondary/60 px-3 focus:outline-none focus:border-accent-blue/60'

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-6">
      <section className="space-y-2">
        <Link
          href="/dokumen"
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t.back}
        </Link>
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.kicker}</p>
        <h1 className="font-display text-[22px] text-[#C8DCF8] leading-tight">{t.h1}</h1>
        <p className="text-text-secondary text-sm">{t.desc}</p>
      </section>

      {/* Filter (server-rendered GET form — tanpa JS) */}
      <form method="get" className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-text-secondary/60 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={t.search}
            className={cn(inputCls, 'w-full pl-9')}
          />
        </div>
        <select name="type" defaultValue={type} className={inputCls}>
          <option value="">{t.allTypes}</option>
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className={inputCls}>
          <option value="">{t.allStatus}</option>
          {DOC_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t[`st_${s}`]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 px-4 rounded-lg bg-accent-blue hover:bg-primary text-[#231a06] text-sm font-medium transition-colors"
        >
          {t.apply}
        </button>
        {(q || type || status) && (
          <Link
            href="/dokumen/arsip"
            className="h-10 inline-flex items-center px-4 rounded-lg border border-card-border text-sm text-text-secondary hover:text-text-primary hover:border-accent-blue/40 transition-colors"
          >
            {t.reset}
          </Link>
        )}
      </form>

      {/* Tabel */}
      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-5 py-3 font-medium">{t.thNo}</th>
                <th className="px-5 py-3 font-medium">{t.thType}</th>
                <th className="px-5 py-3 font-medium">{t.thVessel}</th>
                <th className="px-5 py-3 font-medium">{t.thPort}</th>
                <th className="px-5 py-3 font-medium">{t.thDate}</th>
                <th className="px-5 py-3 font-medium">{t.thStatus}</th>
                <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((doc, i) => (
                <tr
                  key={doc.id}
                  className={cn(
                    'hover:bg-surface-tertiary/30 transition-colors',
                    i < rows.length - 1 && 'border-b border-card-border/50'
                  )}
                >
                  <td className="px-5 py-4 font-mono text-text-primary">{doc.docNumber}</td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-1 bg-accent-blue/10 text-accent-blue rounded text-xs font-mono">
                      {doc.type}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-text-primary">{doc.vessel}</td>
                  <td className="px-5 py-4 text-text-secondary">{doc.port}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary text-xs whitespace-nowrap">{doc.date}</td>
                  <td className="px-5 py-4">
                    <DocStatusControl id={doc.id} status={doc.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {doc.viewHref ? (
                        <a
                          href={doc.viewHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t.view}
                          title={t.view}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="p-1.5 text-text-secondary/25" title={t.noGen}>
                          <Eye className="w-4 h-4" />
                        </span>
                      )}
                      {doc.editHref ? (
                        <Link
                          href={doc.editHref}
                          aria-label={t.edit}
                          title={t.edit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                      ) : (
                        <span className="p-1.5 text-text-secondary/25">
                          <Pencil className="w-4 h-4" />
                        </span>
                      )}
                      {doc.downloadHref ? (
                        <a
                          href={doc.downloadHref}
                          aria-label={t.download}
                          title={t.download}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-amber hover:bg-surface-tertiary transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="p-1.5 text-text-secondary/25">
                          <Download className="w-4 h-4" />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-text-secondary text-sm">
                    {t.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Paginasi */}
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span className="font-mono text-xs">
          {total} {t.count} · {t.pageOf} {cur} {t.of} {pages}
        </span>
        <div className="flex items-center gap-2">
          {cur > 1 ? (
            <Link
              href={pageHref(cur - 1)}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border hover:border-accent-blue/40 hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t.prev}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border/40 text-text-secondary/30">
              <ChevronLeft className="w-4 h-4" />
              {t.prev}
            </span>
          )}
          {cur < pages ? (
            <Link
              href={pageHref(cur + 1)}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border hover:border-accent-blue/40 hover:text-text-primary transition-colors"
            >
              {t.next}
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border/40 text-text-secondary/30">
              {t.next}
              <ChevronRight className="w-4 h-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
