import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chatCompletion, firstMessageText } from '@/lib/ai/openrouter'
import { buildReceivablesSummary } from '@/lib/receivables-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/ai/tracker/ask { question } → { answer }
// AI menjawab pertanyaan tentang piutang HANYA dari ringkasan yang dihitung mesin.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { question?: string }
  const question = (body.question || '').trim()
  if (!question) return new Response('Pertanyaan kosong', { status: 400 })

  try {
    const summary = await buildReceivablesSummary(session.user.tenantId)

    const system = `Anda asisten analisa piutang (DA & Invoice Tracker) untuk perusahaan ship agent.
Jawab pertanyaan pengguna HANYA berdasarkan DATA RINGKASAN di bawah (semua angka sudah dihitung sistem).

ATURAN:
- JANGAN menghitung ulang atau mengarang angka. Gunakan persis angka pada data; Anda hanya merangkum/menjelaskan.
- Mata uang ${summary.currency}; format angka dengan pemisah ribuan (mis. 79.642.500).
- Jawab ringkas dalam Bahasa Indonesia. Sebut nama principal / no. invoice bila relevan.
- Bila pertanyaan di luar cakupan data piutang ini, katakan Anda hanya bisa menjawab seputar piutang invoice yang tampil.

DATA RINGKASAN (JSON):
${JSON.stringify(summary)}`

    const resp = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
    })
    const answer = firstMessageText(resp)
    if (!answer) throw new Error('AI tidak memberi jawaban')
    return Response.json({ answer })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memproses dengan AI'
    return new Response(msg, { status: 502 })
  }
}
