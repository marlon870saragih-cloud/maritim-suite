// Keadaan kuota paket (K156) — baca-saja, terbuka untuk semua peran.
//
// Tanpa pagar peran: ini informasi tentang perusahaan sendiri (berapa yang sudah
// terpakai dari paket yang dibayar), bukan data operasional. Pola sama dengan
// GET /api/onboarding (K152) — yang dipagari ADMIN adalah TINDAKANNYA (menaikkan
// paket lewat checkout), bukan melihat angkanya.

import { withTenant } from '@/services/http'
import { ringkasanKuota } from '@/services/saas/quota.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/quota
export const GET = withTenant(async (ctx) => {
  return Response.json(await ringkasanKuota(ctx))
})
