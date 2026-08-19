import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
// Checklist go-live / K185 — kunci sementara sesudah percobaan gagal beruntun.
import { cekBolehLogin, catatLoginGagal, ipDariHeaderNextAuth } from '@/services/security/rate-limit'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null

        // Diperiksa SEBELUM apa pun lain — termasuk sebelum query User — supaya
        // identifier yang terblokir tak sempat membebani DB atau bcrypt (yang
        // sengaja lambat). Hasilnya SELALU `null` yang sama seperti password
        // salah: pemanggil tak bisa membedakan "terkunci" dari "salah kata
        // sandi" lewat respons ini (K185 — tak membocorkan status akun).
        const kunci = await cekBolehLogin('LOGIN_FAIL_INTERNAL', credentials.email)
        if (kunci.diblokir) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tenant: true },
        })
        const ip = ipDariHeaderNextAuth(req?.headers)
        if (!user) {
          await catatLoginGagal('LOGIN_FAIL_INTERNAL', credentials.email, ip)
          return null
        }
        if (!user.isActive) {
          // Fase 5g — dinonaktifkan lewat UI Tim. Tetap dihitung ke jendela
          // yang sama: endpoint ini masih dipukul berulang, dan menutupnya
          // dari penghitungan hanya membuka celah kecil yang tak perlu ada.
          await catatLoginGagal('LOGIN_FAIL_INTERNAL', credentials.email, ip)
          return null
        }

        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) {
          await catatLoginGagal('LOGIN_FAIL_INTERNAL', credentials.email, ip)
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          // logoUrl (base64 ~8.7KB) DIBUANG dari sesi: kalau ikut, cookie JWT
          // membengkak & kena batas header HTTP/2 proxy → login gagal
          // (ERR_HTTP2_PROTOCOL_ERROR). Logo dibaca segar dari DB saat perlu
          // (kop PDF via epdaTenantForSession, form profil via server page).
          tenant: { ...user.tenant, logoUrl: null },
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.tenantId = user.tenantId
        token.tenant = user.tenant
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        session.user.role = token.role
        session.user.tenantId = token.tenantId
        session.user.tenant = token.tenant
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
}
