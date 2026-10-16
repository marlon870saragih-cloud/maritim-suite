// WA-2a 2a-G — API tipis pesan klien. Aturan (tenant, peran, flag, non-produksi, validasi, maker-checker) ada di
// service; route hanya menerjemahkan HTTP ⇄ service. Tanpa pengiriman: alur berhenti di APPROVED.
import { jsonBodyKetat, withTenant } from '@/services/http'
import { gerbangWa2 } from '@/services/whatsapp/wa2-gate'
import { buatDraftPesanKlien } from '@/services/whatsapp/wa-message.service'
import { daftarPesanKlien } from '@/services/whatsapp/wa-message-read.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/client-messages?state&take&cursor — daftar (penerima tersamar)
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  const take = q.get('take')
  const data = await daftarPesanKlien(ctx, {
    state: q.get('state') ?? undefined,
    // Angka hanya bila berbentuk bilangan; selain itu diteruskan apa adanya agar ditolak service (VALIDATION).
    take: take === null ? undefined : /^\d{1,3}$/.test(take) ? Number(take) : take,
    cursor: q.get('cursor') ?? undefined,
  })
  return Response.json({ ok: true, data })
})

// POST /api/automation/client-messages { signalId, contactId } — draft baru / revisi
export const POST = withTenant(async (ctx, req) => {
  gerbangWa2(ctx) // gerbang SEBELUM body dibaca: pemanggil tak berhak / mode produksi tak pernah melihat galat body/CSRF
  const b = await jsonBodyKetat(req)
  const h = await buatDraftPesanKlien(ctx, { signalId: b.signalId, contactId: b.contactId })
  return Response.json({ ok: true, ...h })
})
