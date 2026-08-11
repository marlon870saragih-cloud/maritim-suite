// Gating langganan untuk modul baru (K33, docs/FASE-3-EPDA-ENGINE.md §5).
//
// KENAPA ADA: pemeriksaan `tenantAccess(...).locked` hanya terpasang di extension
// `maritimeDocument.create` (lib/prisma.ts). `forTenant()` dibangun di atas klien
// ber-extension itu, TAPI membuat `Disbursement` tidak melewati blok tersebut —
// jadi tanpa berkas ini tenant yang langganannya habis tetap bisa menerbitkan
// EPDA lewat modul Fase 3. Itu kebocoran monetisasi, bukan cuma kerapian.
//
// Dipisah dari disbursement.service.ts supaya Invoice (Fase 4) memakai helper yang
// sama, bukan menulis pemeriksaan keduanya.

import { tenantAccess } from '@/lib/billing/access'
import type { TenantContext } from './context'
import { forbidden } from './errors'
import { forTenant } from './tenant-db'

/**
 * Melempar FORBIDDEN bila trial/langganan tenant sudah habis.
 *
 * Konteks `system` TIDAK dikecualikan — extension lama pun menilai dari
 * `data.tenantId`, bukan dari siapa pemanggilnya, dan gating ini soal hak pakai
 * tenant (bukan hak peran seperti `requireRole`).
 */
export async function pastikanLanggananAktif(ctx: TenantContext): Promise<void> {
  // Tenant bukan model bertenant (id-nya ADALAH tenantId) sehingga guard tak
  // menyuntik apa pun — karena itu id-nya dipagari eksplisit di where.
  const tenant = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true },
  })

  const akses = tenantAccess(tenant)
  if (!akses.locked) return

  throw forbidden(
    akses.kind === 'trial'
      ? 'Masa uji coba sudah berakhir — dokumen baru tidak bisa dibuat. Aktifkan langganan untuk melanjutkan.'
      : 'Langganan sudah berakhir — dokumen baru tidak bisa dibuat. Perpanjang langganan untuk melanjutkan.',
  )
}
