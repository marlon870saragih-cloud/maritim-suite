// K122 (Fase 7i) — PO `RECEIVED` + WO `COMPLETED`/`VERIFIED` voyage ini yang
// BELUM dipakai jadi baris Disbursement, untuk dialog "Ambil dari PO/WO" di
// builder FDA. Cuma daftar; PENGISIAN baris + PENYIMPANANNYA tetap lewat
// endpoint disbursement item yang sudah ada (manusia mengonfirmasi).

import { withTenant } from '@/services/http'
import { listPoUntukDiambil } from '@/services/ops/purchase.service'
import { listWoUntukDiambil } from '@/services/ops/workorder.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  const [po, wo] = await Promise.all([listPoUntukDiambil(ctx, params.id), listWoUntukDiambil(ctx, params.id)])
  return Response.json({ po, wo })
})
