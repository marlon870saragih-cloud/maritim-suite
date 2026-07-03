// Status akses tenant berdasarkan trial / langganan.
// Satu sumber logika untuk banner UI (layout) & penegakan server (extension Prisma).

export interface TenantAccessInput {
  plan: string
  trialEndsAt?: Date | string | null
  subscriptionEndsAt?: Date | string | null
}

export interface TenantAccess {
  active: boolean // masih boleh membuat dokumen baru
  locked: boolean // trial/langganan habis → mode read-only
  kind: 'trial' | 'subscription' | 'none'
  daysLeft: number | null
}

function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null
  const end = new Date(d).getTime()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - Date.now()) / 86_400_000)
}

export function tenantAccess(t: TenantAccessInput | null | undefined): TenantAccess {
  if (!t) return { active: false, locked: true, kind: 'none', daysLeft: null }

  // Paket berbayar → dinilai dari subscriptionEndsAt.
  if (t.plan !== 'TRIAL') {
    const left = daysUntil(t.subscriptionEndsAt)
    const active = left !== null && left > 0
    return { active, locked: !active, kind: 'subscription', daysLeft: left }
  }

  // TRIAL → dinilai dari trialEndsAt.
  const left = daysUntil(t.trialEndsAt)
  const active = left !== null && left > 0
  return { active, locked: !active, kind: 'trial', daysLeft: left }
}

// Pesan tanda (dilempar extension Prisma bila write ditolak saat locked).
export const SUBSCRIPTION_LOCKED = 'SUBSCRIPTION_LOCKED'
