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
  const data: ReturnType<typeof tenantProfileFields> & { logoUrl?: string | null } =
    tenantProfileFields(body)

  // logoUrl HANYA disentuh bila dikirim (simpan teks biasa tak mengirimnya → logo aman).
  // Terima data URL gambar; kirim null eksplisit untuk menghapus.
  if (typeof body.logoUrl === 'string') {
    if (!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);/.test(body.logoUrl)) {
      return new Response('Format logo tidak didukung', { status: 415 })
    }
    if (body.logoUrl.length > 2_500_000) {
      return new Response('Logo terlalu besar (maks ~1,8 MB)', { status: 413 })
    }
    data.logoUrl = body.logoUrl
  } else if (body.logoUrl === null) {
    data.logoUrl = null
  }

  await prisma.tenant.update({
    where: { id: session.user.tenantId },
    data,
  })
  return Response.json({ ok: true })
}
