import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getDisbursementDetail } from '@/services/finance/disbursement.service'
import { statusApprovalUntukUi } from '@/services/finance/approval.service'
import { listVendors } from '@/services/master/vendor.service'
import { ServiceError } from '@/services/errors'
import { DisbursementBuilder, type BuilderDisbursement } from '@/components/voyage/DisbursementBuilder'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string }> = {
  id: { kicker: 'Disbursement', back: 'Kembali ke voyage' },
  en: { kicker: 'Disbursement', back: 'Back to voyage' },
}

export default async function DisbursementBuilderPage({
  params,
}: {
  params: { id: string; disbId: string }
}) {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  let disb
  try {
    disb = await getDisbursementDetail(ctx, params.disbId)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }
  if (disb.voyageId !== params.id) notFound()

  const vendors = await listVendors(ctx, { termasukNonAktif: true })
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]))
  const approvalUi = await statusApprovalUntukUi(ctx, disb)

  const builderDisb: BuilderDisbursement = {
    id: disb.id,
    docNumber: disb.docNumber,
    kind: disb.kind,
    status: disb.status,
    version: disb.version,
    baseCurrency: disb.baseCurrency,
    agencyPct: disb.agencyPct,
    validUntil: disb.validUntil,
    notes: disb.notes,
    hitung: disb.hitung,
    warnings: disb.warnings,
    transisiTersedia: disb.transisiTersedia,
    bolehUbahItem: disb.bolehUbahItem,
    bolehRevisi: disb.bolehRevisi,
    approvals: approvalUi.approvals.map((a) => ({
      id: a.id,
      level: a.level,
      userName: a.userName,
      userRole: a.userRole,
      decision: a.decision,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    })),
    levelTarget: approvalUi.levelTarget,
    bolehMemutuskanSekarang: approvalUi.bolehMemutuskanSekarang,
    items: disb.items.map((it) => ({
      id: it.id,
      serviceId: it.serviceId,
      description: it.description,
      basis: it.basis,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      currency: it.currency,
      calcMethod: it.calcMethod,
      sectionLetter: it.sectionLetter,
      vendorId: it.vendorId,
      vendorName: it.vendorId ? (vendorName.get(it.vendorId) ?? null) : null,
      amount: it.amount,
      amountBase: it.amountBase,
    })),
  }

  return (
    <div className="p-margin-page max-w-[1400px] mx-auto space-y-6">
      <Link
        href={`/voyages/${params.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>
      <PageHeader kicker={t.kicker} title={disb.docNumber} />
      <DisbursementBuilder disb={builderDisb} voyageId={params.id} />
    </div>
  )
}
