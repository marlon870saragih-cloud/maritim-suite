import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { principalFields } from '@/lib/principals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/principals → daftar principal milik tenant (urut nama).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const principals = await prisma.principal.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: 'asc' },
  })
  return Response.json(principals)
}

// POST /api/principals → tambah principal baru.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = principalFields(body)
  if (!data.name) return new Response('Nama principal wajib diisi', { status: 400 })

  const principal = await prisma.principal.create({
    data: { tenantId: session.user.tenantId, ...data },
  })
  return Response.json({ ok: true, principal })
}
