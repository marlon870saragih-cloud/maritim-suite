// Pengadaan (Fase 7i, §15/8) — daftar PR/PO/WO lintas-voyage. Jalur lama
// `/finance/{po,pr,spk}` TETAP ADA dan tidak dipindahkan (M6/K117).

import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { listPurchaseOrders } from '@/services/ops/purchase.service'
import { listWorkOrders } from '@/services/ops/workorder.service'
import { ProcurementPageClient } from '@/components/voyage/ProcurementPageClient'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string }> = {
  id: { kicker: 'Operasional', title: 'Pengadaan', desc: 'Purchase Requisition, Purchase Order, dan Work Order lintas-voyage.' },
  en: { kicker: 'Operations', title: 'Procurement', desc: 'Purchase Requisitions, Purchase Orders, and Work Orders across voyages.' },
}

export default async function ProcurementPage() {
  const ctx = await requireTenant()
  const [purchaseOrders, workOrders] = await Promise.all([listPurchaseOrders(ctx), listWorkOrders(ctx)])

  return (
    <div className="p-margin-page max-w-[1400px] mx-auto space-y-6">
      <PageHeader kicker={PH[getLang()].kicker} title={PH[getLang()].title} description={PH[getLang()].desc} />
      <ProcurementPageClient
        purchaseOrders={JSON.parse(JSON.stringify(purchaseOrders))}
        workOrders={JSON.parse(JSON.stringify(workOrders))}
      />
    </div>
  )
}
