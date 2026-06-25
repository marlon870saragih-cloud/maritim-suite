import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_STATUS = ['DRAFT', 'FINAL', 'SENT', 'PAID', 'CANCELLED']

// PATCH /api/documents/:id  { status } → ubah status dokumen (ter-scope tenant).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !VALID_STATUS.includes(body.status)) {
    return new Response('Status tidak valid', { status: 400 })
  }

  const upd = await prisma.maritimeDocument.updateMany({
    where: { id: params.id, tenantId: session.user.tenantId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { status: body.status as any },
  })
  if (upd.count === 0) return new Response('Not found', { status: 404 })
  return Response.json({ ok: true })
}

// DELETE /api/documents/:id → hapus dokumen (ter-scope tenant).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const del = await prisma.maritimeDocument.deleteMany({
    where: { id: params.id, tenantId: session.user.tenantId },
  })
  if (del.count === 0) return new Response('Not found', { status: 404 })
  return Response.json({ ok: true })
}
