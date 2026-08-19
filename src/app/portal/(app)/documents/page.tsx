'use client'

// Dokumen yang sengaja dibagikan (K170) — TIDAK PERNAH "semua lampiran".

import { useEffect, useState } from 'react'
import { FileText, Download, FolderOpen } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type DocRow = { id: string; fileName: string; mimeType: string; sizeBytes: number; kind: string | null; entityType: string; sharedAt: string | null }

const T: Record<Lang, Record<string, string>> = {
  id: { title: 'Dokumen', desc: 'Dokumen yang dibagikan keagenan kepada Anda.', empty: 'Belum ada dokumen yang dibagikan.', download: 'Unduh' },
  en: { title: 'Documents', desc: 'Documents shared with you by the agency.', empty: 'No documents shared yet.', download: 'Download' },
}

function fmtUkuran(b: number) {
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function PortalDocumentsPage() {
  const t = useT(T)
  const [rows, setRows] = useState<DocRow[] | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/attachments').then((r) => (r.ok ? r.json() : [])).then((d) => hidup && setRows(d))
    return () => {
      hidup = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">{t.title}</h1>
        <p className="text-text-secondary text-sm">{t.desc}</p>
      </div>

      {rows && rows.length === 0 && (
        <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center text-text-secondary text-sm">
          <FolderOpen className="h-6 w-6 mx-auto mb-2 opacity-50" />
          {t.empty}
        </div>
      )}

      <div className="divide-y divide-card-border bg-card-bg border border-card-border rounded-lg">
        {(rows ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-white text-sm truncate">{d.fileName}</p>
                <p className="text-text-secondary text-xs">{fmtUkuran(d.sizeBytes)}{d.kind ? ` · ${d.kind}` : ''}</p>
              </div>
            </div>
            <a
              href={`/api/portal/attachments/${d.id}/content`}
              className="inline-flex items-center gap-1.5 rounded-md border border-card-border px-3 py-1.5 text-xs shrink-0
                         text-text-secondary hover:text-white hover:border-accent-blue/50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {t.download}
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
