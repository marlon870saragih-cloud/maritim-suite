import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { draftDocument } from '@/lib/ai/document-ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/ai/draft  { instruction } → { seg, label, draft }
// Pintu universal: AI tentukan jenis dokumen + isi field (teks). Penyimpanan &
// perhitungan total tetap lewat endpoint /api/documents/{seg} (pengaman uang).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { instruction?: string; allowClarify?: boolean }
  const instruction = (body.instruction || '').trim()
  if (!instruction) return new Response('Instruksi kosong', { status: 400 })
  // allowClarify=false (dikirim klien setelah AI sudah bertanya sekali) → AI wajib memilih
  // dokumen, tak boleh bertanya lagi → mencegah loop tanya-jawab berputar.
  const allowClarify = body.allowClarify !== false

  try {
    const result = await draftDocument(instruction, allowClarify)
    if (!result) {
      return new Response('Belum bisa menentukan jenis dokumennya. Coba perjelas (mis. sebut "SPK" atau "invoice").', {
        status: 422,
      })
    }
    // result: { kind:'doc', seg, label, draft } | { kind:'clarify', question }
    return Response.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memproses dengan AI'
    return new Response(msg, { status: 502 })
  }
}
