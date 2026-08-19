// Product Analytics (K183/K184, Fase 8j) — `UsageEvent`, satu tabel ringkas
// milik sendiri. Bukan alat pihak ketiga (kerahasiaan data keuangan
// pelanggan menuntut dasar hukum kalau dikirim keluar, UU PDP), dan bukan
// turunan `AuditLog` (jejak hukum itu tak boleh dipangkas/disampel —
// analitik justru ingin keduanya).
//
// `catatPemakaian()` mengikuti pola `notify()` (notification.service.ts,
// K86) TITIK DEMI TITIK: dipanggil dari SERVICE lain di titik peristiwa
// terjadi (bukan komponen UI — klik yang tak menghasilkan apa pun bukan
// pemakaian), dan MENELAN kegagalannya sendiri. Analitik yang bisa
// menggagalkan penyimpanan voyage adalah analitik yang harus dimatikan.
//
// `meta` TIDAK PERNAH memuat isi dokumen, nama pihak, atau nominal — hanya
// bentuk peristiwa (jenis, kind, langkah). Diperiksa manual di
// `prisma/check-usage.mjs` §17/8j butir 3.
//
// `userId`: `null` untuk peristiwa portal/sistem (skema, K183) — bukan
// sentinel string seperti `AuditLog`/`Notification`. Sumber peristiwa itu
// sendiri (PORTAL_LOGIN, VENDOR_INVOICE_SUBMITTED, dll) sudah menyatakan
// asalnya; menambah sentinel di userId hanya mengulang informasi yang sama.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'

/**
 * Daftar TERTUTUP (K109/K85 semangat yang sama: yang lupa disebut harus
 * ditolak diam-diam oleh tipe, bukan lolos sebagai string bebas). ~10 titik
 * pencatatan, menjawab EMPAT pertanyaan K184: fitur mana dipakai, fitur mana
 * tak pernah disentuh, di langkah mana onboarding berhenti, tenant mana
 * mulai sepi sebelum langganannya habis.
 */
export const NAMA_PERISTIWA = [
  'VOYAGE_CREATED',
  'DISBURSEMENT_SENT',
  'INVOICE_ISSUED',
  'AI_PREDICT_USED',
  'AI_VESSEL_IMPORT_USED',
  'PORTAL_LOGIN',
  'ONBOARDING_STEP_DONE',
  'TASK_COMPLETED',
  'REPORT_EXPORTED',
  'VENDOR_INVOICE_SUBMITTED',
] as const
export type NamaPeristiwa = (typeof NAMA_PERISTIWA)[number]

/**
 * K183 — dicatat di service, menelan galatnya sendiri. TIDAK melempar dalam
 * keadaan apa pun; kegagalan menulis analitik tidak boleh membatalkan
 * transaksi operasional yang memicunya.
 */
export async function catatPemakaian(
  ctx: TenantContext,
  nama: NamaPeristiwa,
  meta?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    await forTenant(ctx).usageEvent.create({
      data: {
        tenantId: ctx.tenantId,
        nama,
        meta: meta ?? undefined,
        userId: ctx.system ? null : ctx.userId,
      },
    })
  } catch (e) {
    console.error('[usage] gagal mencatat pemakaian (ditelan, tidak melempar):', nama, e)
  }
}

// --------------------------------------------------------- ringkasan tenant

const JENDELA_HARI = 30

export type RingkasanPemakaian = {
  jendelaHari: number
  perPeristiwa: { nama: NamaPeristiwa; jumlah: number }[]
  peristiwaTerakhir: string | null // ISO, kapan tenant ini terakhir tercatat memakai APA PUN
}

/**
 * K184 — "untuk tenant: ringkasan pemakaian perusahaannya sendiri". TANPA
 * pagar peran, pola sama `ringkasanKuota()` (K156): ini informasi tentang
 * perusahaan sendiri, bukan data operasional — yang dipagari adalah
 * TINDAKAN (mis. checkout), bukan MELIHAT angkanya.
 */
export async function ringkasanPemakaian(ctx: TenantContext): Promise<RingkasanPemakaian> {
  const sejak = new Date(Date.now() - JENDELA_HARI * 24 * 60 * 60 * 1000)
  const db = forTenant(ctx)

  const [dikelompokkan, terakhir] = await Promise.all([
    db.usageEvent.groupBy({
      by: ['nama'],
      where: { createdAt: { gte: sejak } },
      _count: { _all: true },
    }),
    db.usageEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])

  const peta = new Map(dikelompokkan.map((r) => [r.nama, r._count._all]))
  return {
    jendelaHari: JENDELA_HARI,
    // Semua nama peristiwa TERTUTUP ikut ditampilkan meski 0 — "fitur mana
    // tak pernah disentuh" (K184) harus terlihat sebagai baris bernilai nol,
    // bukan baris yang tak ada.
    perPeristiwa: NAMA_PERISTIWA.map((nama) => ({ nama, jumlah: peta.get(nama) ?? 0 })),
    peristiwaTerakhir: terakhir?.createdAt.toISOString() ?? null,
  }
}
