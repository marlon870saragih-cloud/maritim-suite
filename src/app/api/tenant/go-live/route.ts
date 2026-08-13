// Fase 6a / K56 — tenant menyatakan mulai memakai aplikasi untuk pekerjaan
// sungguhan. Sesudah ini, setiap Voyage/Disbursement BARU dicap 'NYATA'.
//
// Catatan penyimpangan dari dokumen desain: §15/6a menuliskan path
// `/api/tenants/go-live` (jamak), tapi repo ini sudah punya `/api/tenant`
// (tunggal) untuk profil perusahaan. Dua folder `tenant` dan `tenants`
// berdampingan akan jadi sumber salah tebak permanen, jadi dipakai yang tunggal.

import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { getGoLive, setGoLive } from '@/services/ai/origin.service'
import { tanggal } from '@/services/input'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tenant/go-live → status sekarang.
export const GET = withTenant(async (ctx) => Response.json(await getGoLive(ctx)))

/**
 * POST /api/tenant/go-live (ADMIN)
 *
 * body kosong / `{}`           → go-live = sekarang
 * `{ goLiveAt: "2026-08-12" }` → go-live pada tanggal itu (mis. mundur satu hari)
 * `{ goLiveAt: null }`         → batalkan go-live (baris yang terlanjur 'NYATA'
 *                                 TIDAK ikut berubah — K56)
 */
export const POST = withTenant(async (ctx, req) => {
  const body = await jsonBody(req)
  const diminta = 'goLiveAt' in body ? tanggal(body.goLiveAt) : new Date()
  const status = await setGoLive(ctx, diminta, jejakDari(req))
  return Response.json({ ok: true, ...status })
})
