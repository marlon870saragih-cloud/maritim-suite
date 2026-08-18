import { PrismaClient } from '@prisma/client'

const globalForPortalPrisma = globalThis as unknown as {
  portalPrisma: PrismaClient | undefined
}

// Klien Prisma TERPISAH dari lib/prisma.ts, terhubung sebagai peran
// `maritime_portal` (K147) — TANPA BYPASSRLS, hanya SELECT + INSERT pada
// tabel yang eksplisit di-GRANT (lihat prisma/migrations/
// 20260818163500_fase8a_portal_rls). Peran DB berbeda butuh koneksi
// berbeda; mencampurnya dengan klien internal (yang extension
// maritimeDocument.create-nya mengasumsikan hak tulis penuh) akan salah pasang
// dan, lebih penting, meniadakan lapis 2 (K147) — RLS berlaku PER PERAN.
export const portalPrisma =
  globalForPortalPrisma.portalPrisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.PORTAL_DATABASE_URL } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPortalPrisma.portalPrisma = portalPrisma
