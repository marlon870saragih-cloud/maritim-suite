import type { PortCallStatus } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { portCallFields } from '@/lib/portcalls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function validateRefs(tenantId: string, vesselId: string, principalId: string | null) {
  if (!vesselId) return 'Kapal wajib dipilih'
  const vessel = await prisma.vessel.findFirst({ where: { id: vesselId, tenantId }, select: { id: true } })
  if (!vessel) return 'Kapal tidak valid'
  if (principalId) {
    const p = await prisma.principal.findFirst({ where: { id: principalId, tenantId }, select: { id: true } })
    if (!p) return 'Principal tidak valid'
  }
  return null
}

// PATCH /api/portcalls/:id → ubah port call (ter-scope tenant).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = portCallFields(body)
  if (!data.port) return new Response('Pelabuhan wajib diisi', { status: 400 })

  const err = await validateRefs(session.user.tenantId, data.vesselId, data.principalId)
  if (err) return new Response(err, { status: 400 })

  const upd = await prisma.portCall.updateMany({
    where: { id: params.id, tenantId: session.user.tenantId },
    data: { ...data, status: data.status as PortCallStatus },
  })
  if (upd.count === 0) return new Response('Not found', { status: 404 })
  return Response.json({ ok: true })
}

// DELETE /api/portcalls/:id → hapus port call (ter-scope tenant).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const del = await prisma.portCall.deleteMany({
    where: { id: params.id, tenantId: session.user.tenantId },
  })
  if (del.count === 0) return new Response('Not found', { status: 404 })
  return Response.json({ ok: true })
}
