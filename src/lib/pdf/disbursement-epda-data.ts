// Fase 3d (K48) — memetakan Disbursement (model v2, voyage-centric) + item-itemnya
// ke bentuk EpdaData yang SUDAH ADA, supaya mesin PDF lama (DisbursementDocument)
// bisa dipakai ulang apa adanya. Tata letak PDF TIDAK diubah di sini — hanya dua
// perubahan sadar yang didokumentasikan di K48 (baris pajak + varian FDA→FPDA)
// dikerjakan di epda-data.ts/EpdaDocument.tsx, bukan di berkas ini.
//
// Beda dari *-data.ts lain di folder ini: berkas ini MENYENTUH DB (bukan
// sample statis) — satu-satunya pintu masuk resmi untuk PDF disbursement baru.

import type { DisbursementItem } from '@prisma/client'
import type { TenantContext } from '@/services/context'
import { forTenant } from '@/services/tenant-db'
import { notFound, ServiceError } from '@/services/errors'
import { getDisbursementDetail, type DisbursementDetail } from '@/services/finance/disbursement.service'
import { getLatestRate } from '@/services/master/exchange-rate.service'
import { epdaTenantForSession } from './tenant'
import { SAMPLE_EPDA, SAMPLE_FPDA, type EpdaData, type EpdaLineItem, type EpdaSection } from './epda-data'

type PdfVariant = 'EPDA' | 'FPDA'

// Judul seksi A–D — sama persis dengan yang dipakai seed katalog & SAMPLE_EPDA (K48).
const SECTION_TITLES: Record<string, string> = {
  A: 'Port Authority & Government Charges',
  B: 'Pilotage, Towage & Mooring',
  C: 'Clearance & Documentation',
  D: 'Agency & Disbursements',
}
const OTHER_KEY = 'OTHER'
const LETTER_ORDER = ['A', 'B', 'C', 'D']

const tgl = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'

const numTxt = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function qtyText(it: Pick<DisbursementItem, 'quantity' | 'unit'>): string {
  const txt = it.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return it.unit ? `${txt} ${it.unit}` : txt
}

// Rate hanya bermakna ditampilkan bila satuannya sama dengan mata uang dokumen
// (kolom PDF berjudul "Rate (IDR)" tunggal, bukan per-baris) — kalau beda, kosongkan
// (strip) alih-alih menampilkan angka dalam mata uang yang salah label.
function rateText(it: DisbursementItem, baseCurrency: string): number | undefined {
  return it.currency.toUpperCase() === baseCurrency.toUpperCase() ? it.unitPrice : undefined
}

function toLineItem(it: DisbursementItem, baseCurrency: string): EpdaLineItem {
  return {
    description: it.description,
    basis: it.basis ?? undefined,
    qty: qtyText(it),
    rate: rateText(it, baseCurrency),
    amount: it.amountBase,
  }
}

function buildSections(items: readonly DisbursementItem[], baseCurrency: string): EpdaSection[] {
  const groups = new Map<string, DisbursementItem[]>()
  for (const it of items) {
    const key = it.sectionLetter && SECTION_TITLES[it.sectionLetter] ? it.sectionLetter : OTHER_KEY
    const bucket = groups.get(key)
    if (bucket) bucket.push(it)
    else groups.set(key, [it])
  }
  const orderedKeys = [
    ...LETTER_ORDER.filter((l) => groups.has(l)),
    ...Array.from(groups.keys()).filter((k) => !LETTER_ORDER.includes(k)),
  ]
  return orderedKeys.map((key) => ({
    letter: key === OTHER_KEY ? '—' : key,
    title: SECTION_TITLES[key] ?? 'Other Charges',
    items: groups.get(key)!.map((it) => toLineItem(it, baseCurrency)),
  }))
}

async function cargoText(voyageId: string, ctx: TenantContext): Promise<string> {
  const cargoes = await forTenant(ctx).cargo.findMany({ where: { voyageId }, orderBy: { createdAt: 'asc' } })
  if (cargoes.length === 0) return '—'
  return cargoes
    .map((c) => {
      const qty = c.quantity != null ? ` ${numTxt(c.quantity)}${c.unit ? ` ${c.unit}` : ''}` : ''
      const op = c.operation ? ` — ${c.operation}` : ''
      return `${c.cargoName}${qty}${op}`
    })
    .join('; ')
}

/**
 * Kurs indikatif IDR↔USD untuk catatan di PDF EPDA (K48). Hilang = catatan
 * USD dikosongkan (bukan kesalahan) — dipanggil hanya untuk varian EPDA,
 * satu-satunya yang menampilkannya.
 */
async function usdRateIndikatif(ctx: TenantContext, baseCurrency: string, asOf: Date): Promise<number | undefined> {
  if (baseCurrency.toUpperCase() === 'USD') return undefined
  try {
    const kurs = await getLatestRate(ctx, 'USD', baseCurrency, asOf)
    return kurs.rate
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') return undefined
    throw e
  }
}

/**
 * Pintu masuk 3d: Disbursement + items (model v2) → EpdaData siap-render.
 * Dipanggil oleh route `/api/disbursements/[id]/pdf` — tidak menulis apa pun.
 */
export async function disbursementToEpdaData(
  ctx: TenantContext,
  id: string,
): Promise<{ data: EpdaData; variant: PdfVariant }> {
  const disb: DisbursementDetail = await getDisbursementDetail(ctx, id)

  const voyage = await forTenant(ctx).voyage.findFirst({
    where: { id: disb.voyageId, deletedAt: null },
    include: { vessel: true, principal: true, port: true },
  })
  if (!voyage) throw notFound('Voyage')

  const variant: PdfVariant = disb.kind === 'EPDA' ? 'EPDA' : 'FPDA' // K48: FDA dipetakan ke label FPDA sampai P3 terjawab
  const sampleForVariant = variant === 'EPDA' ? SAMPLE_EPDA : SAMPLE_FPDA

  const [tenant, cargo, usdRate] = await Promise.all([
    epdaTenantForSession(ctx.tenantId),
    cargoText(voyage.id, ctx),
    variant === 'EPDA' ? usdRateIndikatif(ctx, disb.baseCurrency, disb.issuedAt) : Promise.resolve(undefined),
  ])

  const signerTitle = tenant?.signerTitle

  const data: EpdaData = {
    tenant: tenant ?? sampleForVariant.tenant,
    docNumber: disb.docNumber,
    issuedAt: tgl(disb.issuedAt),
    validUntil: tgl(disb.validUntil),
    currency: disb.baseCurrency,

    vesselName: voyage.vessel?.name ?? '—',
    principal: voyage.principal?.name ?? '—',
    imo: voyage.vessel?.imoNumber ?? '—',
    flag: voyage.vessel?.flag ?? '—',
    port: voyage.port?.name ?? '—',
    portCode: voyage.port?.unlocode ?? '—',
    gt: numTxt(voyage.vessel?.gt),
    nrt: numTxt(voyage.vessel?.nrt),
    eta: tgl(voyage.eta),
    etd: tgl(voyage.etd),
    loa: voyage.vessel?.loa != null ? `${numTxt(voyage.vessel.loa)} m` : '—',
    draft: voyage.vessel?.maxDraft != null ? `${numTxt(voyage.vessel.maxDraft)} m` : '—',
    cargo,

    sections: buildSections(disb.items, disb.baseCurrency),
    agencyPct: disb.agencyPct,
    taxAmount: disb.hitung.taxAmount,
    usdRate,
    advanceReceived: disb.advanceReceived ?? undefined,
    notes: disb.notes ? [...sampleForVariant.notes, disb.notes] : sampleForVariant.notes,
    preparedByRole: signerTitle ?? sampleForVariant.preparedByRole,
    approvedByRole: signerTitle ?? sampleForVariant.approvedByRole,
  }

  return { data, variant }
}
