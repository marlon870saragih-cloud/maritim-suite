// Parser & tipe field principal — dipakai bersama oleh route POST & PATCH /api/principals.

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v)
  const t = v.trim()
  return t === '' ? null : t
}

export const DA_FORMATS = ['EPDA', 'FPDA', 'FOA'] as const

export type PrincipalInput = {
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  preferredFormat: string
}

/** Ambil & rapikan field principal dari body request. */
export function principalFields(body: Record<string, unknown>): PrincipalInput {
  const fmt = str(body.preferredFormat)
  return {
    name: str(body.name) ?? '',
    contactPerson: str(body.contactPerson),
    email: str(body.email),
    phone: str(body.phone),
    address: str(body.address),
    preferredFormat: fmt && (DA_FORMATS as readonly string[]).includes(fmt) ? fmt : 'FPDA',
  }
}
