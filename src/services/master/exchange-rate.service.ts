// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// PENYIMPANGAN SENGAJA dari pola Port: ExchangeRate adalah LOG, bukan master
// data biasa. Tak ada update/delete — sekali dicatat, sebuah kurs tidak pernah
// diubah (prinsip snapshot, K5: dokumen yang sudah dibuat menyalin rate saat
// itu, jadi mengubah baris lama akan mengubah arti dokumen lama). Salah input?
// Catat baris baru dengan tanggal berlaku yang benar — jangan edit yang lama.

import type { ExchangeRate } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { num, str, tanggal, wajib } from '../input'

export type ExchangeRateInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  const rate = num(body.rate)
  if (rate === null || rate <= 0) throw validation('Rate harus lebih besar dari 0.')
  return {
    fromCurrency: wajib(str(body.fromCurrency), 'Dari mata uang').toUpperCase(),
    toCurrency: wajib(str(body.toCurrency), 'Ke mata uang').toUpperCase(),
    rate,
    effectiveDate: tanggal(body.effectiveDate) ?? new Date(),
    source: str(body.source) ?? 'MANUAL',
  }
}

/** Daftar kurs, terbaru dulu. Filter pasangan mata uang opsional. */
export async function listExchangeRates(
  ctx: TenantContext,
  opts: { fromCurrency?: string | null; toCurrency?: string | null; limit?: number } = {},
): Promise<ExchangeRate[]> {
  const db = forTenant(ctx)
  return db.exchangeRate.findMany({
    where: {
      ...(opts.fromCurrency ? { fromCurrency: opts.fromCurrency.toUpperCase() } : {}),
      ...(opts.toCurrency ? { toCurrency: opts.toCurrency.toUpperCase() } : {}),
    },
    orderBy: { effectiveDate: 'desc' },
    take: opts.limit ?? 200,
  })
}

/** Kurs paling akhir untuk satu pasangan mata uang, per tanggal tertentu (bawaan: hari ini). */
export async function getLatestRate(
  ctx: TenantContext,
  fromCurrency: string,
  toCurrency: string,
  asOf?: Date,
): Promise<ExchangeRate> {
  const db = forTenant(ctx)
  const rate = await db.exchangeRate.findFirst({
    where: {
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      effectiveDate: { lte: asOf ?? new Date() },
    },
    orderBy: { effectiveDate: 'desc' },
  })
  if (!rate) throw notFound(`Kurs ${fromCurrency.toUpperCase()} → ${toCurrency.toUpperCase()}`)
  return rate
}

export async function createExchangeRate(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<ExchangeRate> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  return db.exchangeRate.create({ data: { ...bacaInput(body), tenantId: ctx.tenantId } })
}
