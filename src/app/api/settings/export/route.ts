// Ekspor mandiri data tenant (K186, Fase 8k) — ADMIN saja (dijaga di service).
//
// POST memulai lalu MEMBALAS SEGERA (202) tanpa menunggu bundel selesai —
// K186: "tugas berjalan lama … bukan permintaan HTTP yang ditunggu di
// browser". Pemberitahuan selesainya lewat Notification.

import { jejakDari, withTenant } from '@/services/http'
import { listExportJobs, mintaEkspor, jalankanEkspor } from '@/services/saas/export.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/settings/export — riwayat & keadaan permintaan ekspor.
export const GET = withTenant(async (ctx) => {
  return Response.json(await listExportJobs(ctx))
})

// POST /api/settings/export — minta ekspor baru.
export const POST = withTenant(async (ctx, req) => {
  const job = await mintaEkspor(ctx, jejakDari(req))

  // Sengaja TIDAK di-`await`: respons berangkat lebih dulu, pekerjaan
  // berlanjut di latar. `jalankanEkspor()` sudah menangkap seluruh galatnya
  // sendiri (status GAGAL + Notification), jadi tak ada lemparan yang bisa
  // lolos ke sini dan menjadi unhandled rejection.
  void jalankanEkspor(ctx, job.id)

  return Response.json({ ok: true, job }, { status: 202 })
})
