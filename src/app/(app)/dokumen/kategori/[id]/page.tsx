import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, ArrowRight } from 'lucide-react'
import { getDocCategory } from '@/lib/doc-categories'
import { getLang, type Lang } from '@/lib/i18n-server'

const KT: Record<Lang, { kicker: string; back: string; pick: string; count: string }> = {
  id: { kicker: 'Kategori Dokumen', back: 'Kembali ke Dokumen', pick: 'Pilih dokumen untuk dibuat', count: 'dokumen' },
  en: { kicker: 'Document Category', back: 'Back to Documents', pick: 'Pick a document to create', count: 'documents' },
}

export default function CategoryPage({ params }: { params: { id: string } }) {
  const cat = getDocCategory(params.id)
  if (!cat) notFound()

  const lang = getLang()
  const t = KT[lang]
  const Icon = cat.icon

  return (
    <div className="p-margin-page max-w-[1100px] mx-auto space-y-6">
      <Link
        href="/dokumen"
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t.back}
      </Link>

      <header className="flex items-start gap-4">
        <div className={`p-3 bg-surface-tertiary rounded-lg ${cat.iconText} shrink-0`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.kicker}</p>
          <h1 className="font-display text-[24px] text-[#C8DCF8] leading-tight">{cat.title}</h1>
          <p className="text-text-secondary text-sm">
            {cat.blurb[lang]} · {cat.docs.length} {t.count}
          </p>
        </div>
      </header>

      <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.pick}</p>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cat.docs.map((doc) => (
          <Link
            key={doc.type + doc.label.en}
            href={`/dokumen/new/${doc.type}`}
            className={`group bg-card-bg border border-card-border rounded-lg p-5 relative overflow-hidden
                        transition-colors ${cat.hoverBorder}`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${cat.bar}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`p-2 bg-surface-tertiary rounded-md ${cat.iconText} shrink-0`}>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base text-white leading-tight">{doc.label[lang]}</h3>
                  <p className="text-text-secondary text-xs mt-1 leading-relaxed">{doc.desc[lang]}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-secondary/40 group-hover:text-accent-blue transition-colors shrink-0 mt-1" />
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}
