import { prisma } from '@/lib/prisma'
import { identitasKapal, vesselFields } from '@/lib/vessels'
import { balasanMmsiGanda, gerbangBuatKapal, konteksKapal, potretIdentitas } from '@/lib/vessel-api'
import { catatAudit } from '@/services/finance/audit'
import { jejakDari } from '@/services/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/vessels → daftar kapal milik tenant (urut nama). Semua peran yang login boleh membaca.
export async function GET() {
  const ctx = await konteksKapal()
  if (ctx instanceof Response) return ctx

  const vessels = await prisma.vessel.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: 'asc' },
  })
  return Response.json(vessels)
}

// POST /api/vessels → tambah kapal baru. PRD-002 Step 2 / D1: ADMIN & OPERATOR;
// PRD-004 Step 3 / D3: + MANAJER_OPERASI (pembuatan saja — PATCH/DELETE tidak berubah).
export async function POST(req: Request) {
  const ctx = await konteksKapal()
  if (ctx instanceof Response) return ctx
  const ditolak = gerbangBuatKapal(ctx)
  if (ditolak) return ditolak

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = vesselFields(body)
  if (!data.name) return new Response('Nama kapal wajib diisi', { status: 400 })

  const identitas = identitasKapal(body, null)
  if (identitas.errors.length) return new Response(identitas.errors.join(' '), { status: 400 })

  let vessel
  try {
    vessel = await prisma.vessel.create({
      data: { tenantId: ctx.tenantId, ...data, ...identitas.data },
    })
  } catch (e) {
    const ganda = await balasanMmsiGanda(e, ctx.tenantId, identitas.data.mmsi)
    if (ganda) return ganda
    throw e
  }

  await catatAudit(
    ctx,
    { tableName: 'Vessel', recordId: vessel.id, action: 'CREATE', newValue: potretIdentitas(vessel) },
    jejakDari(req),
  )

  // `warnings` ditambahkan (aditif) — klien lama yang hanya membaca `vessel` tidak terpengaruh.
  return Response.json({ ok: true, vessel, warnings: identitas.warnings })
}
