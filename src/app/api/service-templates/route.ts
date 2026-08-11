import { withTenant, jsonBody } from '@/services/http'
import { createServiceTemplate, listServiceTemplates } from '@/services/master/service-template.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/service-templates?portId=xxx&semua=1
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const templates = await listServiceTemplates(ctx, {
    portId: url.searchParams.get('portId'),
    termasukNonAktif: url.searchParams.get('semua') === '1',
  })
  return Response.json(templates)
})

// POST /api/service-templates
export const POST = withTenant(async (ctx, req) => {
  const template = await createServiceTemplate(ctx, await jsonBody(req))
  return Response.json({ ok: true, template }, { status: 201 })
})
