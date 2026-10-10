// Pemetaan galat DB WA-2a → ServiceError TANPA meneruskan teks mentah PostgreSQL/Prisma.
//
// Teks galat unik PostgreSQL memuat NILAI kunci (mis. nomor telepon dalam
// `Key ("tenantId","activeE164Key")=(…, +62…)`), jadi pesan mentah TIDAK PERNAH diteruskan ke
// pemanggil, log, atau audit. Yang keluar hanya kode alasan tetap.

import { Prisma } from '@prisma/client'
import { conflict, validation, type ServiceError } from '../errors'

const teks = (e: unknown): string => String((e as { meta?: { message?: unknown } })?.meta?.message ?? (e as Error)?.message ?? '')

/** Konflik yang aman diulang di transaksi baru (pola WA-1, salinan independen). */
export function bisaDiulangWa2(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return true
  return /\b(40P01|40001)\b|deadlock detected|could not serialize/.test(teks(e))
}

export function adalahUnikNomorAktif(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const t = JSON.stringify(e.meta ?? {})
    return /activeE164Key/.test(t)
  }
  return /WaContact_tenantId_activeE164Key_key|"activeE164Key"\)/.test(teks(e))
}

/** Galat trigger/CHECK WA-2a (SQLSTATE 23514) → kode WA2A_* atau null. */
export function kodeTriggerWa2a(e: unknown): string | null {
  const m = teks(e).match(/\b(WA2A_[A-Z_]+)\b/)
  return m ? m[1] : null
}

/** Terjemahkan galat DB yang dikenal; galat lain dilempar ulang apa adanya (tanpa disamarkan jadi sukses). */
export function petakanGalatDb(e: unknown): ServiceError | null {
  if (adalahUnikNomorAktif(e)) return conflict('Nomor WhatsApp ini sudah aktif untuk kontak lain di tenant ini.', { code: 'CONTACT_NUMBER_IN_USE' })
  const kode = kodeTriggerWa2a(e)
  if (kode) return validation('Perubahan ditolak oleh aturan integritas database.', { code: kode })
  return null
}

export const MAKS_PERCOBAAN_TX_WA2 = 4

export async function denganUlangWa2<T>(fn: () => Promise<T>): Promise<T> {
  for (let percobaan = 1; ; percobaan++) {
    try {
      return await fn()
    } catch (e) {
      if (bisaDiulangWa2(e) && percobaan < MAKS_PERCOBAAN_TX_WA2) continue
      if (bisaDiulangWa2(e)) throw conflict('Permintaan bersamaan belum terselesaikan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
      const dipetakan = petakanGalatDb(e)
      if (dipetakan) throw dipetakan
      throw e
    }
  }
}
