import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { vesselFields } from '@/lib/vessels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/vessels → daftar kapal milik tenant (urut nama).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const vessels = await prisma.vessel.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: 'asc' },
  })
  return Response.json(vessels)
}

// POST /api/vessels → tambah kapal baru.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = vesselFields(body)
  if (!data.name) return new Response('Nama kapal wajib diisi', { status: 400 })

  const vessel = await prisma.vessel.create({
    data: { tenantId: session.user.tenantId, ...data },
  })
  return Response.json({ ok: true, vessel })
}
