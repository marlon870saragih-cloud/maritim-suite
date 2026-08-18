// WorkOrder (model v2, K121) → SpkData, memakai ulang mesin PDF LAMA
// (SpkDocument) apa adanya (K119). ⚠️ Nama bertumpang-tindih dengan berkas
// LAMA `spk-data.ts`/`SpkDocument.tsx` yang aslinya untuk surat penunjukan
// sub-agen — TAPI bentuknya (penerima/scope/terms/tanda tangan, TANPA
// perhitungan uang) memang cocok dipakai ulang untuk SPK-ke-vendor: itulah
// alasan K119 memilihnya, bukan kebetulan penamaan.

import type { TenantContext } from '@/services/context'
import { forTenant } from '@/services/tenant-db'
import { getWorkOrder } from '@/services/ops/workorder.service'
import { epdaTenantForSession } from './tenant'
import { SAMPLE_SPK, type SpkData } from './spk-data'

const tgl = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'

/** Pintu masuk 7i: WorkOrder (v2) → SpkData siap-render. Dipanggil route `/api/work-orders/[id]/pdf`. */
export async function workOrderToSpkData(ctx: TenantContext, id: string): Promise<SpkData> {
  const wo = await getWorkOrder(ctx, id)
  const tenant = await epdaTenantForSession(ctx.tenantId)

  const [vendor, voyage] = await Promise.all([
    forTenant(ctx).vendor.findFirst({
      where: { id: wo.vendorId },
      select: { name: true, contactPerson: true, address: true, vendorType: true },
    }),
    forTenant(ctx).voyage.findFirst({
      where: { id: wo.voyageId, deletedAt: null },
      include: { vessel: true, port: true, principal: true, cargoes: true },
    }),
  ])

  return {
    tenant: tenant ?? SAMPLE_SPK.tenant,
    docNumber: wo.woNumber,
    issuedAt: tgl(wo.createdAt),
    validity: wo.plannedEnd ? `Sampai ${tgl(wo.plannedEnd)}` : SAMPLE_SPK.validity,
    appointmentType: wo.service?.serviceName ?? 'Work Order',
    toContact: vendor?.contactPerson ?? '—',
    toCompany: vendor?.name ?? '—',
    toRole: vendor?.vendorType ?? 'Vendor',
    toCity: vendor?.address ?? '',
    principal: voyage?.principal?.name ?? '—',
    vesselName: voyage?.vessel?.name ?? '—',
    gtNrt: voyage?.vessel?.gt ? String(voyage.vessel.gt) : '—',
    cargo: voyage?.cargoes[0]?.cargoName ?? '—',
    loadingDate: tgl(wo.plannedStart),
    loadPort: voyage?.port?.name ?? '—',
    dischPort: voyage?.port?.name ?? '—',
    scopeItems: [{ text: wo.scope, detail: wo.notes ?? undefined }],
    terms: wo.agreedAmount
      ? [`Nilai pekerjaan disepakati: ${wo.currency} ${wo.agreedAmount.toLocaleString('en-US')}.`]
      : [],
    approvedByName: (tenant ?? SAMPLE_SPK.tenant).signerName ?? SAMPLE_SPK.approvedByName,
    approvedByTitle: (tenant ?? SAMPLE_SPK.tenant).signerTitle ?? SAMPLE_SPK.approvedByTitle,
  }
}
