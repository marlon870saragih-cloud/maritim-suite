import Link from 'next/link'
import { Eye, Pencil, Download } from 'lucide-react'
import { DocStatusControl } from '@/components/dokumen/DocStatusControl'
import type { DocRow } from '@/lib/documents'
import { cn } from '@/lib/utils'
import { getLang, type Lang } from '@/lib/i18n-server'

const RT: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Dokumen Terbaru', thNo: 'Nomor', thType: 'Tipe', thVessel: 'Kapal', thPort: 'Port', thStatus: 'Status', thAction: 'Aksi',
    view: 'Lihat', viewPdf: 'Lihat PDF', edit: 'Buka / edit', download: 'Unduh', downloadPdf: 'Unduh PDF',
    noGen: 'Generator belum tersedia', empty: 'Belum ada dokumen. Mulai buat dokumen baru di atas.',
    seeAll: 'Lihat semua',
  },
  en: {
    title: 'Recent Documents', thNo: 'Number', thType: 'Type', thVessel: 'Vessel', thPort: 'Port', thStatus: 'Status', thAction: 'Action',
    view: 'View', viewPdf: 'View PDF', edit: 'Open / edit', download: 'Download', downloadPdf: 'Download PDF',
    noGen: 'Generator not available yet', empty: 'No documents yet. Start creating one above.',
    seeAll: 'View all',
  },
}

export function RecentDocsTable({ documents, seeAllHref }: { documents: DocRow[]; seeAllHref?: string }) {
  const t = RT[getLang()]
  return (
    <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-card-border bg-surface-secondary flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-white">{t.title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-xs font-medium text-accent-blue hover:text-primary transition-colors whitespace-nowrap"
          >
            {t.seeAll} →
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
              <th className="px-5 py-3 font-medium">{t.thNo}</th>
              <th className="px-5 py-3 font-medium">{t.thType}</th>
              <th className="px-5 py-3 font-medium">{t.thVessel}</th>
              <th className="px-5 py-3 font-medium">{t.thPort}</th>
              <th className="px-5 py-3 font-medium">{t.thStatus}</th>
              <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {documents.map((doc, i) => (
              <tr
                key={doc.id}
                className={cn(
                  'hover:bg-surface-tertiary/30 transition-colors',
                  i < documents.length - 1 && 'border-b border-card-border/50'
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
                <td className="px-5 py-4">
                  <DocStatusControl id={doc.id} status={doc.status} />
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1">
                    {doc.viewHref ? (
                      <a href={doc.viewHref} target="_blank" rel="noopener noreferrer" aria-label={t.view} title={t.viewPdf}
                        className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors">
                        <Eye className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="p-1.5 text-text-secondary/25" title={t.noGen}><Eye className="w-4 h-4" /></span>
                    )}
                    {doc.editHref ? (
                      <Link href={doc.editHref} aria-label={t.edit} title={t.edit}
                        className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors">
                        <Pencil className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span className="p-1.5 text-text-secondary/25"><Pencil className="w-4 h-4" /></span>
                    )}
                    {doc.downloadHref ? (
                      <a href={doc.downloadHref} aria-label={t.download} title={t.downloadPdf}
                        className="p-1.5 rounded text-text-secondary hover:text-accent-amber hover:bg-surface-tertiary transition-colors">
                        <Download className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="p-1.5 text-text-secondary/25"><Download className="w-4 h-4" /></span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-text-secondary text-sm">
                  {t.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
