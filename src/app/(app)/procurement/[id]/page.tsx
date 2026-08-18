// Detail PR/PO (Fase 7i) — shell server tipis: ambil PO, sisanya interaktif
// di PurchaseBuilder.tsx (client), pola sama voyages/[id]/disbursements/[disbId].

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getPurchaseOrder } from '@/services/ops/purchase.service'
import { ServiceError } from '@/services/errors'
import { PurchaseBuilder } from '@/components/voyage/PurchaseBuilder'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string }> = {
  id: { kicker: 'Pengadaan', back: 'Kembali ke Pengadaan' },
  en: { kicker: 'Procurement', back: 'Back to Procurement' },
}

export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  let po
  try {
    po = await getPurchaseOrder(ctx, params.id)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }

  return (
    <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
      <Link href="/procurement" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>
      <PageHeader kicker={t.kicker} title={po.docNumber} description={`${po.kind} · ${po.status}`} />
      <PurchaseBuilder po={JSON.parse(JSON.stringify(po))} />
    </div>
  )
}
