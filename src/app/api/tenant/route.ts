import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { tenantProfileFields } from '@/lib/tenant-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/tenant → ubah profil perusahaan (tenant milik user yang login).
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  // companyName sengaja diabaikan di sini (terkunci sesuai pendaftaran → anti-manipulasi).
  const data = tenantProfileFields(body)

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data,
  })
  return Response.json({ ok: true })
}
