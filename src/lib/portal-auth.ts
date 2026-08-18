// Konfigurasi NextAuth KEDUA, terpisah penuh dari lib/auth.ts (K143/K144).
//
// Provider "portal-credentials" mengautentikasi PortalUser (bukan User),
// cookie-nya `__Host-portal-session` (bukan nama bawaan NextAuth) supaya
// sesi portal TIDAK PERNAH terkirim ke route internal dan sebaliknya
// (K144/3) — dua sesi yang kebetulan sama-sama JWT NextAuth, tapi tak
// pernah bisa saling terbaca: secret berbeda (PORTAL_NEXTAUTH_SECRET),
// cookie berbeda, dan callback session() di sini SENGAJA TIDAK menyertakan
// `role` — pihak luar tidak punya peran internal (K149, PortalContext).
//
// JWT hanya membawa portalUserId. `pihak`/`pihakId` TIDAK disimpan di token:
// withPortal() (K149) membaca PortalAccess dari database pada SETIAP
// permintaan (K168) — kalau disimpan di token, mencabut akses (mengisi
// `revokedAt`) tidak akan berlaku sampai token kedaluwarsa, dan itu persis
// yang K168 tolak ("pihak luar harus bisa diputus SEKETIKA").

import type { NextAuthOptions, User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

const COOKIE_PORTAL_SESSION =
  process.env.NODE_ENV === 'production' ? '__Host-portal-session' : 'portal-session-dev'

export const portalAuthOptions: NextAuthOptions = {
  secret: process.env.PORTAL_NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: 'portal-credentials',
      name: 'portal-credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null

        // PortalUser.email unik PER TENANT (bukan global, K166) — tanpa
        // konteks tenant di form login, satu email bisa cocok >1 baris kalau
        // orang yang sama diundang beberapa keagenan. Diambil yang paling
        // baru aktif; halaman /portal/login (8f) akan menambah pemilih
        // tenant eksplisit bila ini jadi masalah nyata (belum ada layar
        // portal sejak 8a — lihat catatan §17/8a).
        const kandidat = await prisma.portalUser.findMany({
          where: { email: credentials.email, isActive: true, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })
        for (const u of kandidat) {
          if (await bcrypt.compare(credentials.password, u.password)) {
            await prisma.portalUser.update({
              where: { id: u.id },
              data: { lastLoginAt: new Date() },
            })
            // `next-auth`'s `User` type juga mewajibkan `role`/`tenant` (dipakai
            // sesi INTERNAL, lib/auth.ts) — PortalUser tak punya keduanya sama
            // sekali (K143: pihak luar tak punya peran internal). Type cast di
            // sini SATU-SATUNYA tempatnya; jwt()/session() di bawah tak pernah
            // membaca role/tenant dari objek ini.
            return { id: u.id, email: u.email, name: u.name, tenantId: u.tenantId } as unknown as User
          }
        }
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.portalUserId = user.id
        token.tenantId = user.tenantId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.portalUserId = token.portalUserId as string
        session.user.tenantId = token.tenantId as string
      }
      return session
    },
  },
  pages: {
    signIn: '/portal/login',
  },
  session: { strategy: 'jwt' },
  cookies: {
    sessionToken: {
      name: COOKIE_PORTAL_SESSION,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
}
