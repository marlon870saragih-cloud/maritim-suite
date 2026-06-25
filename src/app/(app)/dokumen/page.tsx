import { CategoryGrid } from '@/components/dokumen/CategoryGrid'
import { QuickActions } from '@/components/dokumen/QuickActions'
import { RecentDocsTable } from '@/components/dokumen/RecentDocsTable'
import { getRecentDocuments } from '@/lib/documents'

export default async function DokumenPage() {
  const recentDocs = await getRecentDocuments()

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto space-y-8">
      {/* Row 1: Header */}
      <section className="space-y-1">
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">
          Kategori Dokumen
        </p>
        <h1 className="font-display text-[22px] text-[#C8DCF8] leading-tight">Pilih jenis dokumen</h1>
        <p className="text-text-secondary text-sm">
          29 dokumen wajib untuk operasi pelabuhan &amp; izin berlayar.
        </p>
      </section>

      {/* Row 2: Category grid */}
      <CategoryGrid />

      {/* Row 3: Quick actions */}
      <QuickActions />

      {/* Row 4: Recent documents */}
      <RecentDocsTable documents={recentDocs} />
    </div>
  )
}
