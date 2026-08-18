import type { DefaultSession } from 'next-auth'
import type { Role, Tenant } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      tenantId: string
      tenant: Tenant
      /** Fase 8 / K143-K144 — HANYA terisi pada sesi PORTAL (lib/portal-auth.ts).
       * Sesi internal (lib/auth.ts) tidak pernah mengisinya; kode internal
       * yang membaca session.user tidak boleh bergantung pada field ini. */
      portalUserId?: string
    } & DefaultSession['user']
  }

  interface User {
    role: Role
    tenantId: string
    tenant: Tenant
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: Role
    tenantId: string
    tenant: Tenant
    /** Fase 8 — sesi portal saja (lib/portal-auth.ts). */
    portalUserId?: string
  }
}
