'use client'

import { useRouter } from 'next/navigation'
import { useT, useLang, type Lang } from '@/lib/i18n'
import { DOC_CATEGORIES } from '@/lib/doc-categories'

const DOCS_WORD: Record<Lang, string> = { id: 'dokumen', en: 'documents' }

export function CategoryGrid() {
  const router = useRouter()
  const docsWord = useT(DOCS_WORD)
  const { lang } = useLang()

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {DOC_CATEGORIES.map((cat) => {
        const Icon = cat.icon
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => router.push(`/dokumen/kategori/${cat.id}`)}
            className={`text-left bg-card-bg border border-card-border rounded-lg p-5 relative
                        overflow-hidden group transition-colors cursor-pointer ${cat.hoverBorder}`}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${cat.bar}`} />
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-surface-tertiary rounded-md ${cat.iconText}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg text-white">{cat.title}</h3>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-mono ${cat.badge}`}>
                {cat.docs.length} {docsWord}
              </span>
            </div>
            <p className="text-text-secondary text-sm mb-4">{cat.blurb[lang]}</p>
            <div className="flex flex-wrap gap-2">
              {cat.docs.slice(0, 4).map((doc) => (
                <span
                  key={doc.type + doc.label.en}
                  className="px-2 py-1 bg-surface-tertiary border border-border-muted rounded
                             text-xs text-text-secondary font-mono"
                >
                  {doc.label[lang]}
                </span>
              ))}
              {cat.docs.length > 4 && (
                <span className="px-2 py-1 text-xs text-text-secondary/60 font-mono">
                  +{cat.docs.length - 4}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </section>
  )
}
