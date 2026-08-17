// Satu checklist. PATCH mengganti SELURUH daftar butirnya (pola yang sama
// dengan ServiceTemplate Fase 1); DELETE = soft delete dan TIDAK menyentuh tugas
// yang sudah lahir dari template ini (K95).

import { withTenant, jsonBody } from '@/services/http'
import {
  getTaskTemplate,
  removeTaskTemplate,
  updateTaskTemplate,
} from '@/services/ops/task-template.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getTaskTemplate(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const template = await updateTaskTemplate(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, template })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeTaskTemplate(ctx, params.id)
  return Response.json({ ok: true })
})
