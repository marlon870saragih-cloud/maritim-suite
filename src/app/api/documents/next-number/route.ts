import { getServerSession } from 'next-auth'
import { DocType } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { monthWindow, formatDocNumber } from '@/lib/doc-number'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/documents/next-number?type=EPDA → intip nomor dokumen berikutnya
// (preview) untuk prefill form dokumen baru. Menghitung dgn logika yang sama
// dengan Prisma extension (lib/prisma.ts): urut per tenant + jenis + bulan.
// Catatan: ini PREVIEW — nomor final tetap ditetapkan saat simpan (extension),
// jadi bila dua form dibuka bersamaan angkanya bisa sama sampai salah satu tersimpan.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const type = new URL(req.url).searchParams.get('type') ?? ''
  if (!(type in DocType)) return new Response('Jenis dokumen tidak valid', { status: 400 })

  const { year, mm, start, end } = monthWindow()
  const count = await prisma.maritimeDocument.count({
    where: {
      tenantId: session.user.tenantId,
      docType: type as DocType,
      createdAt: { gte: start, lt: end },
    },
  })
  return Response.json({ docNumber: formatDocNumber(type, year, mm, count + 1) })
}
