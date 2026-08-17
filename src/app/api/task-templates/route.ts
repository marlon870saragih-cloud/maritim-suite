// Checklist / TaskTemplate (K93). Pengelolaannya ADMIN saja (K98) — ia setara
// master data karena menentukan cara kerja seluruh perusahaan. Pagar perannya
// ada di service, bukan di sini.

import { withTenant, jsonBody } from '@/services/http'
import { createTaskTemplate, listTaskTemplates } from '@/services/ops/task-template.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/task-templates?portId=&semua=1
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(
    await listTaskTemplates(ctx, {
      portId: q.get('portId'),
      termasukNonAktif: q.get('semua') === '1',
    }),
  )
})

export const POST = withTenant(async (ctx, req) => {
  const template = await createTaskTemplate(ctx, await jsonBody(req))
  return Response.json({ ok: true, template }, { status: 201 })
})
