import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { CategoryGrid } from '@/components/dokumen/CategoryGrid'
import { QuickActions } from '@/components/dokumen/QuickActions'
import { RecentDocsTable } from '@/components/dokumen/RecentDocsTable'
import { getRecentDocuments } from '@/lib/documents'
import { DOC_CATEGORIES } from '@/lib/doc-categories'
import { getLang, type Lang } from '@/lib/i18n-server'

// Jumlah dokumen unik yang benar-benar tersedia (dihitung dari katalog).
const DOC_COUNT = new Set(DOC_CATEGORIES.flatMap((c) => c.docs.map((d) => d.type))).size

const DK: Record<Lang, { kicker: string; h1: string; desc: (n: number) => string; ai: string }> = {
  id: {
    kicker: 'Kategori Dokumen', h1: 'Pilih jenis dokumen',
    desc: (n) => `${n} dokumen untuk operasi pelabuhan & izin berlayar.`, ai: 'Asisten Dokumen AI',
  },
  en: {
    kicker: 'Document Categories', h1: 'Choose a document type',
    desc: (n) => `${n} documents for port operations & sailing clearance.`, ai: 'AI Document Assistant',
  },
}

export default async function DokumenPage() {
  const lang = getLang()
  const t = DK[lang]
  const recentDocs = await getRecentDocuments()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      {/* Row 1: Header */}
      <section className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">
            {t.kicker}
          </p>
          <h1 className="font-display text-[22px] text-[#C8DCF8] leading-tight">{t.h1}</h1>
          <p className="text-text-secondary text-sm">{t.desc(DOC_COUNT)}</p>
        </div>
        <Link
          href="/finance/asisten"
          className="inline-flex items-center gap-2 bg-accent-purple/15 border border-accent-purple/40
                     hover:bg-accent-purple/25 text-white rounded-lg px-4 py-2.5 text-sm font-medium
                     transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4 text-accent-purple" />
          {t.ai}
        </Link>
      </section>

      {/* Row 2: Category grid */}
      <CategoryGrid />

      {/* Row 3: Quick actions */}
      <QuickActions />

      {/* Row 4: Recent documents */}
      <RecentDocsTable documents={recentDocs} seeAllHref="/dokumen/arsip" />
    </div>
  )
}
