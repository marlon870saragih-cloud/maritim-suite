import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { variancePasangan } from '@/services/finance/fda.service'
import { ServiceError } from '@/services/errors'
import { VarianceTable } from '@/components/voyage/VarianceTable'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string; title: string }> = {
  id: { kicker: 'Variance FDA vs EPDA', back: 'Kembali ke dokumen', title: 'Variance' },
  en: { kicker: 'FDA vs EPDA Variance', back: 'Back to document', title: 'Variance' },
}

export default async function VariancePage({
  params,
}: {
  params: { id: string; disbId: string }
}) {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  let hasil
  let errorMessage: string | null = null
  try {
    hasil = await variancePasangan(ctx, params.disbId)
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
      <PageHeader kicker={t.kicker} title={t.title} />

      {errorMessage ? (
        <p className="text-text-secondary text-sm bg-card-bg border border-card-border rounded-lg px-4 py-3">
          {errorMessage}
        </p>
      ) : (
        hasil && <VarianceTable hasil={hasil} />
      )}
    </div>
  )
}
