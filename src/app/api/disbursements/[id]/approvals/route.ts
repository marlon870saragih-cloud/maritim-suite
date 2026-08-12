import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { statusApprovalUntukUi, putuskanApproval } from '@/services/finance/approval.service'
import { getDisbursement } from '@/services/finance/disbursement.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/**
 * Bukan cuma riwayat mentah: sekaligus `levelTarget`/`bolehMemutuskanSekarang`
 * (§12/6-7) supaya UI bisa menyegarkan tombol keputusan setiap kali status
 * dokumen berubah — bukan cuma sekali saat halaman dimuat. Lihat catatan di
 * DisbursementBuilder.tsx soal kenapa ini perlu di-refetch, bukan disimpan
 * sebagai field statis di `disb`.
 */
export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  const disb = await getDisbursement(ctx, params.id)
  return Response.json(await statusApprovalUntukUi(ctx, disb))
})

export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const disbursement = await putuskanApproval(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, disbursement })
})
