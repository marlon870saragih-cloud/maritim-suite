import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { bandingkanDokumen } from '@/services/finance/revision.service'
import { ServiceError } from '@/services/errors'
import { CompareTable } from '@/components/voyage/CompareTable'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string; title: string }> = {
  id: { kicker: 'Bandingkan Versi', back: 'Kembali ke dokumen', title: 'Bandingkan v{a} ↔ v{b}' },
  en: { kicker: 'Compare Versions', back: 'Back to document', title: 'Compare v{a} ↔ v{b}' },
}

export default async function CompareVersionsPage({
  params,
  searchParams,
}: {
  params: { id: string; disbId: string }
  searchParams: { with?: string }
}) {
  const lang = getLang()
  const t = PH[lang]
  const ctx = await requireTenant()

  let hasil
  let errorMessage: string | null = null
  try {
    hasil = await bandingkanDokumen(ctx, params.disbId, searchParams.with ?? null)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    if (e instanceof ServiceError && e.code === 'VALIDATION') {
      errorMessage = e.message
    } else {
      throw e
    }
  }

  return (
    <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
      <Link
        href={`/voyages/${params.id}/disbursements/${params.disbId}`}
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>
      <PageHeader
        kicker={t.kicker}
        title={hasil ? t.title.replace('{a}', String(hasil.versiLama)).replace('{b}', String(hasil.versiBaru)) : t.kicker}
      />

      {errorMessage ? (
        <p className="text-text-secondary text-sm bg-card-bg border border-card-border rounded-lg px-4 py-3">
          {errorMessage}
        </p>
      ) : (
        hasil && <CompareTable hasil={hasil} />
      )}
    </div>
  )
}
