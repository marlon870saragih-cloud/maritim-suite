import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { extractSpkDraft } from '@/lib/ai/spk-extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/ai/spk/draft  { instruction } → { draft: Partial<SpkData> }
// AI hanya mengisi field; perhitungan & PDF tetap lewat inti deterministik.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { instruction?: string }
  const instruction = (body.instruction || '').trim()
  if (!instruction) return new Response('Instruksi kosong', { status: 400 })

  try {
    const draft = await extractSpkDraft(instruction)
    return Response.json({ draft })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memproses dengan AI'
    return new Response(msg, { status: 502 })
  }
}
