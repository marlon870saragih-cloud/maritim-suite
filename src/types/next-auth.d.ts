import type { DefaultSession } from 'next-auth'
import type { Role, Tenant } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      tenantId: string
      tenant: Tenant
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
  }
}
