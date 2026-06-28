import Link from 'next/link'
import { Eye, Pencil, Download } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { DocRow } from '@/lib/documents'
import { cn } from '@/lib/utils'

export function RecentDocsTable({ documents }: { documents: DocRow[] }) {
  return (
    <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-card-border bg-surface-secondary">
        <h2 className="font-display text-xl text-white">Dokumen Terbaru</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
              <th className="px-5 py-3 font-medium">Nomor</th>
              <th className="px-5 py-3 font-medium">Tipe</th>
              <th className="px-5 py-3 font-medium">Kapal</th>
              <th className="px-5 py-3 font-medium">Port</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium text-right">Aksi</th>
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
                  <StatusBadge status={doc.status} />
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1">
                    {doc.viewHref ? (
                      <a href={doc.viewHref} target="_blank" rel="noopener noreferrer" aria-label="Lihat" title="Lihat PDF"
                        className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors">
                        <Eye className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="p-1.5 text-text-secondary/25" title="Generator belum tersedia"><Eye className="w-4 h-4" /></span>
                    )}
                    {doc.editHref ? (
                      <Link href={doc.editHref} aria-label="Buka / edit" title="Buka / edit"
                        className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors">
                        <Pencil className="w-4 h-4" />
                      </Link>
                    ) : (
                      <span className="p-1.5 text-text-secondary/25"><Pencil className="w-4 h-4" /></span>
                    )}
                    {doc.downloadHref ? (
                      <a href={doc.downloadHref} aria-label="Unduh" title="Unduh PDF"
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
                  Belum ada dokumen. Mulai buat dokumen baru di atas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
