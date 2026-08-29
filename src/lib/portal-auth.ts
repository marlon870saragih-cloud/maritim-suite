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
// Fase 8j — pemakaian (K183/K184), churn signal K184: tenant portal yang mulai
// sepi sebelum langganannya habis. systemContext karena tak ada TenantContext
// pra-sesi di sini (persis alasan `authorize()` memakai `prisma` mentah).
import { systemContext } from '@/services/context'
import { catatPemakaian } from '@/services/saas/usage.service'
// Checklist go-live / K185 — kunci sementara sesudah percobaan gagal beruntun.
import { cekBolehLogin, catatLoginGagal, ipDariHeaderNextAuth } from '@/services/security/rate-limit'
// C1.4 — satu-satunya aturan identitas surel portal, dipakai bersama oleh
// undangan, penerimaan undangan, dan pintu masuk ini.
import { normalisasiEmailPortal } from '@/services/portal/email'

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
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null

        // C1.4 — dikanonikkan dengan helper yang SAMA yang dipakai saat
        // mengundang & menerima undangan (services/portal/email.ts). Tanpa ini
        // baris dibuat dalam bentuk kanonik tapi dicari apa adanya: orang yang
        // mengetik `Ops@Samudra.co.id`, atau menempel alamatnya berikut satu
        // spasi di ujung, tak akan pernah cocok dengan barisnya sendiri.
        const email = normalisasiEmailPortal(credentials.email)

        // Diperiksa SEBELUM query — pola sama persis lib/auth.ts, kunci
        // terpisah dari sesi internal ('LOGIN_FAIL_PORTAL') supaya percobaan
        // di satu pintu tak pernah mengunci pintu yang lain.
        //
        // Kuncinya memakai bentuk kanonik juga: kalau tidak, mengubah-ubah
        // huruf besar-kecil pada alamat yang sama menghasilkan jendela hitung
        // yang berbeda-beda — penebak sandi tinggal berganti pola kapital
        // untuk melewati batas percobaan.
        const kunci = await cekBolehLogin('LOGIN_FAIL_PORTAL', email)
        if (kunci.diblokir) return null
        const ip = ipDariHeaderNextAuth(req?.headers)

        // PortalUser.email unik PER TENANT (bukan global, K166) — tanpa
        // konteks tenant di form login, satu email bisa cocok >1 baris kalau
        // orang yang sama diundang beberapa keagenan. Diambil yang paling
        // baru aktif; halaman /portal/login (8f) akan menambah pemilih
        // tenant eksplisit bila ini jadi masalah nyata (belum ada layar
        // portal sejak 8a — lihat catatan §17/8a).
        const kandidat = await prisma.portalUser.findMany({
          where: { email, isActive: true, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        })
        for (const u of kandidat) {
          if (await bcrypt.compare(credentials.password, u.password)) {
            await prisma.portalUser.update({
              where: { id: u.id },
              data: { lastLoginAt: new Date() },
            })
            // Fase 8j / K183 — userId sengaja TIDAK diisi (skema: null untuk
            // peristiwa portal/sistem); PORTAL_LOGIN sendiri sudah menyatakan
            // sumbernya, sentinel tambahan hanya mengulang informasi yang sama.
            await catatPemakaian(systemContext(u.tenantId), 'PORTAL_LOGIN')
            // `next-auth`'s `User` type juga mewajibkan `role`/`tenant` (dipakai
            // sesi INTERNAL, lib/auth.ts) — PortalUser tak punya keduanya sama
            // sekali (K143: pihak luar tak punya peran internal). Type cast di
            // sini SATU-SATUNYA tempatnya; jwt()/session() di bawah tak pernah
            // membaca role/tenant dari objek ini.
            return { id: u.id, email: u.email, name: u.name, tenantId: u.tenantId } as unknown as User
          }
        }
        // Tak ada kandidat cocok SAMA SEKALI, atau tak satu pun kata sandinya
        // cocok — keduanya "gagal", dicatat ke jendela yang sama. Tak
        // membedakan "email tak terdaftar" dari "kata sandi salah" (sengaja,
        // sama alasan lib/auth.ts: tak membocorkan status akun).
        await catatLoginGagal('LOGIN_FAIL_PORTAL', email, ip)
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
