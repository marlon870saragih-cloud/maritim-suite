// Parser field profil perusahaan (Tenant) — dipakai oleh PATCH /api/tenant.

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v)
  const t = v.trim()
  return t === '' ? null : t
}
const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type TenantProfileInput = {
  companyName: string
  companyTagline: string | null
  companyAddress: string | null
  companyPhone: string | null
  companyEmail: string | null
  npwp: string | null
  bankName: string | null
  bankAccount: string | null
  bankHolder: string | null
  bankSwift: string | null
  defaultAgencyPct: number
  defaultCurrency: string
}

/** Ambil & rapikan field profil perusahaan dari body request. */
export function tenantProfileFields(body: Record<string, unknown>): TenantProfileInput {
  const pct = num(body.defaultAgencyPct)
  return {
    companyName: str(body.companyName) ?? '',
    companyTagline: str(body.companyTagline),
    companyAddress: str(body.companyAddress),
    companyPhone: str(body.companyPhone),
    companyEmail: str(body.companyEmail),
    npwp: str(body.npwp),
    bankName: str(body.bankName),
    bankAccount: str(body.bankAccount),
    bankHolder: str(body.bankHolder),
    bankSwift: str(body.bankSwift),
    defaultAgencyPct: pct == null ? 2.5 : pct,
    defaultCurrency: (str(body.defaultCurrency) ?? 'IDR').toUpperCase(),
  }
}
