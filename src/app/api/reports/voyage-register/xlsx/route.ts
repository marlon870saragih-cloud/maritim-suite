import { withTenant } from '@/services/http'
import { forTenant } from '@/services/tenant-db'
import { getVoyageRegister } from '@/services/reports.service'
import { buildVoyageRegisterWorkbook } from '@/lib/voyage-register-xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTenant(async (ctx) => {
  const [rows, tenant] = await Promise.all([
    getVoyageRegister(ctx),
    forTenant(ctx).tenant.findFirst({ where: { id: ctx.tenantId }, select: { companyName: true } }),
  ])
  const buffer = await buildVoyageRegisterWorkbook(rows, tenant?.companyName ?? 'Maritime Suite')
  const today = new Date().toISOString().slice(0, 10)

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="voyage-register-${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
})
