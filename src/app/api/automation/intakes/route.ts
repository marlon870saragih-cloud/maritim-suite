// Automation Hub — Vessel Call Intake (PRD-004 Step 3).
// Pagar (flag intake + allowlist tenant + ADMIN/MANAJER_OPERASI) ada di service
// (requireIntake). tenantId TIDAK PERNAH dibaca dari request.

import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { requireIntake } from '@/services/intake/intake-access'
import { listIntakes, submitIntake, type MasukanSubmit } from '@/services/intake/intake.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/intakes?status=&q=&sort=createdAt|eta&dir=desc|asc&page=&perPage=
// Balasan: { intakes, total, page, perPage, terpotong }. `total` adalah jumlah baris
// yang cocok, bukan panjang halaman; `terpotong` menandai batas pindai tersentuh.
export const GET = withTenant(async (ctx, req) => {
  const { rows, ...sisa } = await listIntakes(ctx, new URL(req.url).searchParams)
  return Response.json({ intakes: rows, ...sisa })
})

const benar = (v: unknown) => v === true || v === 'true' || v === '1' || v === 'on'

// POST /api/automation/intakes
//   multipart/form-data: text | file, saveOriginal, confirmReprocess
//   application/json:    { text, saveOriginal, confirmReprocess }
export const POST = withTenant(async (ctx, req) => {
  // Gerbang DULU — berkas tidak dibaca bila fitur mati / peran tak berhak.
  requireIntake(ctx)

  let masukan: MasukanSubmit
  const jenis = req.headers.get('content-type') ?? ''
  if (jenis.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw validation('Unggahan tidak terbaca.')
    }
    const f = form.get('file')
    const t = form.get('text')
    masukan = {
      text: typeof t === 'string' ? t : null,
      file: f instanceof File && f.size > 0 ? { name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) } : null,
      saveOriginal: benar(form.get('saveOriginal')),
      confirmReprocess: benar(form.get('confirmReprocess')),
    }
  } else {
    const body = await jsonBody(req)
    masukan = {
      text: typeof body.text === 'string' ? body.text : null,
      saveOriginal: benar(body.saveOriginal),
      confirmReprocess: benar(body.confirmReprocess),
    }
  }

  const hasil = await submitIntake(ctx, masukan, jejakDari(req))
  return Response.json({ ok: true, ...hasil }, { status: hasil.reused ? 200 : 201 })
})
