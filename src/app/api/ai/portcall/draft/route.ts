import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractPortCallDraft } from '@/lib/ai/portcall-extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Named = { id: string; name: string }

// Cocokkan nama → record master data: persis dulu, lalu sebagian (case-insensitive).
function matchByName(name: string | undefined, options: Named[]): Named | null {
  const n = (name ?? '').toLowerCase().trim()
  if (!n) return null
  const exact = options.find((o) => o.name.toLowerCase().trim() === n)
  if (exact) return exact
  const partial = options.find((o) => {
    const on = o.name.toLowerCase()
    return on.includes(n) || n.includes(on)
  })
  return partial ?? null
}

// POST /api/ai/portcall/draft { instruction }
// → { form: {vesselId, principalId, port, ...}, match: {vessel, principal} }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { instruction?: string }
  const instruction = (body.instruction || '').trim()
  if (!instruction) return new Response('Instruksi kosong', { status: 400 })

  try {
    const draft = await extractPortCallDraft(instruction)

    const [vessels, principals] = await Promise.all([
      prisma.vessel.findMany({ where: { tenantId: session.user.tenantId }, select: { id: true, name: true } }),
      prisma.principal.findMany({ where: { tenantId: session.user.tenantId }, select: { id: true, name: true } }),
    ])

    const vessel = matchByName(draft.vesselName, vessels)
    const principal = matchByName(draft.principalName, principals)

    const form = {
      vesselId: vessel?.id ?? '',
      principalId: principal?.id ?? '',
      port: draft.port ?? '',
      portCode: draft.portCode ?? '',
      eta: draft.eta ?? '',
      etd: draft.etd ?? '',
      cargo: draft.cargo ?? '',
      cargoQty: draft.cargoQty ?? '',
      cargoUnit: draft.cargoUnit ?? '',
      notes: draft.notes ?? '',
    }

    return Response.json({
      form,
      match: {
        vessel: { name: draft.vesselName ?? '', matched: !!vessel, matchedName: vessel?.name ?? null },
        principal: { name: draft.principalName ?? '', matched: !!principal, matchedName: principal?.name ?? null },
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memproses dengan AI'
    return new Response(msg, { status: 502 })
  }
}
