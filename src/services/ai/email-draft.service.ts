// Pembangun DATA (bukan prosa) untuk Email draft — Fase 6g · K78–K79.
//
// Catatan penyimpangan kecil dari §11 docs/FASE-6-AI-LAYER.md: peta modul di
// sana hanya menyebut `src/lib/ai/email-draft.ts` (penyusun prompt, tanpa DB)
// tanpa berkas service terpisah — tersirat data boleh diambil langsung di
// route. Empat templat K79 masing-masing butuh gabungan data yang cukup beda
// (Voyage+Disbursement / Voyage+Disbursement+variance / Invoice+Customer /
// Disbursement item+Vendor), jadi logikanya dipisah ke sini supaya
// `api/ai/email-draft/route.ts` tetap tipis dan mengikuti pola service-layer
// yang sama dengan `konteks.service.ts`/`prediction.service.ts`.
//
// ⚠️ Sama seperti `konteks.service.ts` (K76/1): TIDAK ADA QUERY MENTAH DI SINI
// untuk Voyage/Disbursement/Invoice — semua lewat service yang SAMA dipakai UI
// (`getVoyage`, `getDisbursementDetail`, `getInvoiceDetail`, `getVendor`,
// `getCustomer`). Pagar tenant & hak akses ikut otomatis; entitas tenant lain
// jatuh ke NOT_FOUND yang sama persis dengan yang dilihat UI.
//
// ⚠️ `payload` yang dikembalikan di sini adalah SATU-SATUNYA sumber angka bagi
// LLM (K79 — "templat menyediakan placeholder yang diisi server, LLM hanya
// merangkai kalimat"). Field yang tidak ditulis eksplisit di sini TIDAK PERNAH
// terkirim ke model — termasuk npwp, address, id internal, dan apa pun milik
// tenant lain. Sama semangatnya dengan K76/2 pada `konteks.service.ts`.

import type { TenantContext } from '../context'
import { validation } from '../errors'
import { pastikanLanggananAktif } from '../subscription'
import { getVoyage } from '../master/voyage.service'
import { getVendor } from '../master/vendor.service'
import { getCustomer } from '../master/customer.service'
import { getDisbursementDetail } from '../finance/disbursement.service'
import { getInvoiceDetail } from '../finance/invoice.service'
import { variancePasangan } from '../finance/fda.service'
// Tipe & daftar templat hidup di modul MURNI (lib/ai/email-draft.ts) — lihat
// catatan di kepala berkas itu soal kenapa arahnya begini (K52/check-ai-guardrail).
import { TEMPLAT_EMAIL, type TemplatEmail, type DataEmail } from '@/lib/ai/email-draft'

export { TEMPLAT_EMAIL }
export type { TemplatEmail, DataEmail }

// -------------------------------------------------------------- pembantu kecil

function tgl(nilai: Date | string | null | undefined): string | null {
  if (!nilai) return null
  const d = nilai instanceof Date ? nilai : new Date(nilai)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function angka(nilai: number | null | undefined): number | null {
  return typeof nilai === 'number' && Number.isFinite(nilai) ? nilai : null
}

/** Status Disbursement yang layak dikirimi pengantar EPDA/FPDA (§12/1: "aktif pada status APPROVED+"). */
const STATUS_EPDA_INTRO = new Set(['APPROVED', 'SENT', 'FINAL', 'CLOSED'])
/** Status Invoice yang masih relevan diingatkan — PAID/DRAFT/CANCELLED tidak. */
const STATUS_INVOICE_REMINDER = new Set(['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'])

// ---------------------------------------------------------------- EPDA_INTRO

async function dataEpdaIntro(ctx: TenantContext, disbursementId: string): Promise<DataEmail> {
  const d = await getDisbursementDetail(ctx, disbursementId)
  if (d.kind !== 'EPDA' && d.kind !== 'FPDA') {
    throw validation('Templat "Pengantar EPDA" hanya untuk dokumen EPDA/FPDA.')
  }
  if (!STATUS_EPDA_INTRO.has(d.status)) {
    throw validation(
      `Dokumen berstatus ${d.status} — setujui dulu (APPROVED) sebelum membuat draf pengantar.`,
    )
  }
  const v = await getVoyage(ctx, d.voyageId)

  return {
    templat: 'EPDA_INTRO',
    to: v.principal?.email ?? null,
    toName: v.principal?.name ?? null,
    payload: {
      docNumber: d.docNumber,
      kind: d.kind,
      voyageNumber: v.voyageNumber,
      vessel: v.vessel?.name ?? null,
      gt: angka(v.vessel?.gt ?? null),
      port: v.port?.name ?? null,
      eta: tgl(v.eta),
      etb: tgl(v.etb),
      currency: d.baseCurrency,
      grandTotal: d.hitung.grandTotal,
      validUntil: tgl(d.validUntil),
      // Kosong → prompt (lib/ai/email-draft.ts) diinstruksikan memasukkan
      // permintaan dana muka; K79 eksplisit menyebut ini.
      advanceReceived: angka(d.advanceReceived),
      principal: v.principal?.name ?? null,
    },
  }
}

// ------------------------------------------------------------ FDA_SETTLEMENT

async function ringkasVariance(ctx: TenantContext, disbursementId: string): Promise<string | null> {
  try {
    const hasil = await variancePasangan(ctx, disbursementId)
    const r = hasil.ringkasan
    const pct = r.variancePct === null ? null : Math.round(r.variancePct * 10) / 10
    return (
      `EPDA ${r.epdaBase} vs FDA ${r.fdaBase}, selisih ${r.varianceBase}` +
      (pct === null ? '' : ` (${pct}%)`) +
      `. ${r.jumlah.BERUBAH} baris berubah, ${r.jumlah.TAK_DIANGGARKAN} tak dianggarkan, ${r.jumlah.TIDAK_TEREALISASI} tidak terealisasi.`
    )
  } catch {
    // FDA tanpa EPDA asal (mis. dibuat manual) — bukan galat, cuma tak ada pembanding.
    return null
  }
}

async function dataFdaSettlement(ctx: TenantContext, disbursementId: string): Promise<DataEmail> {
  const d = await getDisbursementDetail(ctx, disbursementId)
  if (d.kind !== 'FDA') {
    throw validation('Templat "Penyelesaian FDA" hanya untuk dokumen FDA.')
  }
  if (d.status !== 'FINAL' && d.status !== 'CLOSED') {
    throw validation(`Dokumen berstatus ${d.status} — tandai FINAL dulu sebelum membuat draf penyelesaian.`)
  }
  const v = await getVoyage(ctx, d.voyageId)
  const advance = angka(d.advanceReceived)
  const saldo = advance === null ? null : Math.round((d.hitung.grandTotal - advance) * 100) / 100

  return {
    templat: 'FDA_SETTLEMENT',
    to: v.principal?.email ?? null,
    toName: v.principal?.name ?? null,
    payload: {
      docNumber: d.docNumber,
      voyageNumber: v.voyageNumber,
      vessel: v.vessel?.name ?? null,
      port: v.port?.name ?? null,
      currency: d.baseCurrency,
      grandTotal: d.hitung.grandTotal,
      advanceReceived: advance,
      // null = dana muka belum dicatat — prompt diinstruksikan menanyakannya,
      // bukan mengasumsikan saldo nol.
      saldo,
      varianceRingkasan: await ringkasVariance(ctx, d.id),
      principal: v.principal?.name ?? null,
    },
  }
}

// --------------------------------------------------------------- VENDOR_RFQ

async function dataVendorRfq(ctx: TenantContext, disbursementId: string, itemId: string): Promise<DataEmail> {
  const d = await getDisbursementDetail(ctx, disbursementId)
  const item = d.items.find((it) => it.id === itemId)
  if (!item) throw validation('Baris dokumen tidak ditemukan.')
  if (!item.vendorId) {
    throw validation('Baris ini belum punya vendor — pilih baris lain atau isi vendor dulu di baris ini.')
  }
  const vendor = await getVendor(ctx, item.vendorId)
  const v = await getVoyage(ctx, d.voyageId)

  return {
    templat: 'VENDOR_RFQ',
    to: vendor.email ?? null,
    toName: vendor.name,
    payload: {
      vendor: vendor.name,
      service: item.description,
      voyageNumber: v.voyageNumber,
      vessel: v.vessel?.name ?? null,
      gt: angka(v.vessel?.gt ?? null),
      port: v.port?.name ?? null,
      eta: tgl(v.eta),
      etb: tgl(v.etb),
    },
  }
}

// ---------------------------------------------------------- INVOICE_REMINDER

async function dataInvoiceReminder(ctx: TenantContext, invoiceId: string): Promise<DataEmail> {
  const inv = await getInvoiceDetail(ctx, invoiceId)
  if (!STATUS_INVOICE_REMINDER.has(inv.status)) {
    throw validation(`Invoice berstatus ${inv.status} — pengingat hanya relevan untuk invoice yang belum lunas.`)
  }
  const customer = inv.customerId ? await getCustomer(ctx, inv.customerId) : null

  return {
    templat: 'INVOICE_REMINDER',
    to: customer?.email ?? null,
    toName: customer?.name ?? null,
    payload: {
      invoiceNumber: inv.invoiceNumber,
      customer: customer?.name ?? null,
      currency: inv.currency,
      invoiceDate: tgl(inv.invoiceDate),
      dueDate: tgl(inv.dueDate),
      grandTotal: inv.grandTotal,
      amountPaid: inv.amountPaid,
      outstanding: inv.outstanding,
      jumlahPembayaran: inv.payments.length,
      pembayaranTerakhir:
        inv.payments.length > 0
          ? tgl(inv.payments[inv.payments.length - 1].paymentDate)
          : null,
    },
  }
}

// ---------------------------------------------------------------------- inti

export type OpsiDataEmail = { itemId?: string }

/**
 * Rakit `DataEmail` untuk satu templat (K79). `entityId` adalah id
 * Disbursement untuk EPDA_INTRO/FDA_SETTLEMENT/VENDOR_RFQ, atau id Invoice
 * untuk INVOICE_REMINDER. VENDOR_RFQ tambahan butuh `opsi.itemId`.
 */
export async function rakitDataEmail(
  ctx: TenantContext,
  templat: TemplatEmail,
  entityId: string,
  opsi: OpsiDataEmail = {},
): Promise<DataEmail> {
  await pastikanLanggananAktif(ctx)

  if (!TEMPLAT_EMAIL.includes(templat)) throw validation(`Templat email tidak dikenal: ${String(templat)}.`)
  if (typeof entityId !== 'string' || entityId.trim() === '') throw validation('id entitas wajib diisi.')

  if (templat === 'VENDOR_RFQ') {
    const itemId = opsi.itemId
    if (typeof itemId !== 'string' || itemId.trim() === '') {
      throw validation('itemId wajib diisi untuk templat permintaan penawaran vendor.')
    }
    return dataVendorRfq(ctx, entityId, itemId)
  }
  if (templat === 'EPDA_INTRO') return dataEpdaIntro(ctx, entityId)
  if (templat === 'FDA_SETTLEMENT') return dataFdaSettlement(ctx, entityId)
  return dataInvoiceReminder(ctx, entityId)
}
