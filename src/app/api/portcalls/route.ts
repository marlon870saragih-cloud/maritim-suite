import type { PortCallStatus } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { portCallFields } from '@/lib/portcalls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validasi kapal & principal milik tenant. Return string error, atau null bila valid.
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

// GET /api/portcalls → daftar port call milik tenant (join kapal + principal).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const portCalls = await prisma.portCall.findMany({
    where: { tenantId: session.user.tenantId },
    include: {
      vessel: { select: { id: true, name: true } },
      principal: { select: { id: true, name: true } },
    },
    orderBy: [{ eta: 'desc' }, { createdAt: 'desc' }],
  })
  return Response.json(portCalls)
}

// POST /api/portcalls → tambah port call baru.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = portCallFields(body)
  if (!data.port) return new Response('Pelabuhan wajib diisi', { status: 400 })

  const err = await validateRefs(session.user.tenantId, data.vesselId, data.principalId)
  if (err) return new Response(err, { status: 400 })

  const portCall = await prisma.portCall.create({
    data: {
      tenantId: session.user.tenantId,
      ...data,
      status: data.status as PortCallStatus,
    },
  })
  return Response.json({ ok: true, portCall })
}
