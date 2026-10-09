// WA-1 Step 2H — API tipis Communication Candidate. Semua aturan (tenant, peran, flag WA,
// non-produksi, validasi) ada di service; route hanya menerjemahkan HTTP ⇄ service.
import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbang, siapkanCandidate } from '@/services/communication/communication.service'
import { daftarCandidate } from '@/services/communication/communication-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/communications/candidates?voyageId&state&take&cursor — daftar (penerima disamarkan)
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  const take = q.get('take')
  const data = await daftarCandidate(ctx, {
    voyageId: q.get('voyageId') ?? undefined,
    state: q.get('state') ?? undefined,
    // Angka hanya bila berbentuk bilangan; selain itu diteruskan apa adanya agar ditolak service (VALIDATION).
    take: take === null ? undefined : /^\d{1,3}$/.test(take) ? Number(take) : take,
    cursor: q.get('cursor') ?? undefined,
  })
  return Response.json({ ok: true, data })
})

// POST /api/automation/communications/candidates { signalId } — Siapkan Update Klien
export const POST = withTenant(async (ctx, req) => {
  gerbang(ctx) // otorisasi SEBELUM body dibaca: pemanggil tak berhak tak pernah melihat galat validasi
  const b = await jsonBodyKetat(req)
  const h = await siapkanCandidate(ctx, { signalId: b.signalId })
  return Response.json({ ok: true, ...h })
})
