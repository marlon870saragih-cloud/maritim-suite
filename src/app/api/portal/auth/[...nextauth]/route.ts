// K144 — namespace portal terpisah penuh dari /api/auth/[...nextauth] internal.
import NextAuth from 'next-auth'
import { portalAuthOptions } from '@/lib/portal-auth'

const handler = NextAuth(portalAuthOptions)

export { handler as GET, handler as POST }
