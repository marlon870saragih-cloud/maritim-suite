// Jembatan HTTP → service portal (K149). Cetakan services/http.ts, dengan
// dua beda yang menegakkan §3 dokumen desain:
//   1. Membuka SATU transaksi ber-RLS (withPortalTx) yang membungkus SELURUH
//      penanganan permintaan — bukan sekadar mengambil konteks.
//   2. Menulis SATU AuditLog per permintaan yang BERHASIL, userId berawalan
//      `portal:` (K144/4) — lewat klien INTERNAL (`systemContext`), karena
//      AuditLog tidak ada di MODEL_PORTAL/tidak di-GRANT ke peran
//      maritime_portal sama sekali (K147/K148: default-deny).

import { requirePortal, type PortalContext } from './context'
import { toResponse, jejakDari } from '../http'
import { systemContext } from '../context'
import { catatAudit } from '../finance/audit'
import { withPortalTx } from './portal-db'

/**
 * Bungkus handler route portal.
 *
 *   export const GET = withPortal(async (pctx) => Response.json(await listInvoicesPortal(pctx)))
 */
export function withPortal<A extends unknown[]>(
  handler: (pctx: PortalContext, req: Request, ...extra: A) => Promise<Response>,
) {
  return async (req: Request, ...extra: A): Promise<Response> => {
    try {
      const sesi = await requirePortal()
      return await withPortalTx(sesi, async (db) => {
        const pctx: PortalContext = { ...sesi, db }
        const res = await handler(pctx, req, ...extra)

        // K144/4 — jejak SETIAP tindakan portal yang berhasil (handler tidak
        // melempar). Lewat klien internal (bukan `db`/maritime_portal — peran
        // itu tak punya hak apa pun atas AuditLog, K147/K148).
        await catatAudit(
          systemContext(sesi.tenantId, `portal:${sesi.portalUserId}`),
          {
            tableName: `portal:${new URL(req.url).pathname}`,
            recordId: sesi.pihakId,
            action: 'ACCESS',
          },
          jejakDari(req),
        )

        return res
      })
    } catch (e) {
      return toResponse(e)
    }
  }
}
