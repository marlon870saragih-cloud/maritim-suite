import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { principalFields } from '@/lib/principals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/principals/:id → ubah data principal (ter-scope tenant).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = principalFields(body)
  if (!data.name) return new Response('Nama principal wajib diisi', { status: 400 })

  const upd = await prisma.principal.updateMany({
    where: { id: params.id, tenantId: session.user.tenantId },
    data,
  })
  if (upd.count === 0) return new Response('Not found', { status: 404 })
  return Response.json({ ok: true })
}

// DELETE /api/principals/:id → hapus principal (ter-scope tenant).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  try {
    const del = await prisma.principal.deleteMany({
      where: { id: params.id, tenantId: session.user.tenantId },
    })
    if (del.count === 0) return new Response('Not found', { status: 404 })
    return Response.json({ ok: true })
  } catch (e) {
    // FK constraint: principal masih dipakai di port call / dokumen.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return new Response('Principal masih dipakai di port call atau dokumen — tidak bisa dihapus.', {
        status: 409,
      })
    }
    throw e
  }
}
