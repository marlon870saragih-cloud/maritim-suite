import type { Tenant } from '@prisma/client'
import type { EpdaTenant } from './epda-data'

const u = (v: string | null | undefined) => (v ? v : undefined)

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
  }
}
