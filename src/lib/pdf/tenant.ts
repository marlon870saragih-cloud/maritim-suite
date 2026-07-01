import type { Tenant } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { EpdaTenant } from './epda-data'

const u = (v: string | null | undefined) => (v ? v : undefined)

// Baca profil perusahaan SEGAR dari DB (bukan dari token sesi yang bisa basi
// setelah profil diedit). Dipakai generator PDF agar kop selalu terbaru.
export async function epdaTenantForSession(
  tenantId: string | null | undefined
): Promise<EpdaTenant | null> {
  if (!tenantId) return null
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } })
  return t ? epdaTenantFromTenant(t) : null
}

// Map profil perusahaan (Tenant dari DB/session) → kop dokumen EPDA.
export function epdaTenantFromTenant(t: Tenant): EpdaTenant {
  return {
    companyName: t.companyName,
    companyTagline: u(t.companyTagline),
    companyAddress: u(t.companyAddress),
    companyPhone: u(t.companyPhone),
    companyEmail: u(t.companyEmail),
    npwp: u(t.npwp),
    logoUrl: u(t.logoUrl),
    bankName: u(t.bankName),
    bankAccount: u(t.bankAccount),
    bankHolder: u(t.bankHolder),
    bankSwift: u(t.bankSwift),
    signerName: u(t.signerName),
    signerTitle: u(t.signerTitle),
  }
}
