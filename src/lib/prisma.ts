import { PrismaClient, type DocType } from '@prisma/client'
import { needsAutoNumber, monthWindow, formatDocNumber } from './doc-number'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Klien dasar (di-cache lintas hot-reload).
const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = base

// Extension: saat membuat MaritimeDocument tanpa No. dokumen (kosong/placeholder),
// isi otomatis berurutan. Terpusat di satu tempat → berlaku ke SEMUA endpoint simpan.
export const prisma = base.$extends({
  query: {
    maritimeDocument: {
      async create({ args, query }) {
        const data = args.data as
          | { docNumber?: string; tenantId?: string; docType?: string; lineItems?: unknown }
          | undefined
        if (data && data.tenantId && data.docType && needsAutoNumber(data.docNumber)) {
          const { year, mm, start, end } = monthWindow()
          const count = await base.maritimeDocument.count({
            where: { tenantId: data.tenantId, docType: data.docType as DocType, createdAt: { gte: start, lt: end } },
          })
          const num = formatDocNumber(data.docType, year, mm, count + 1)
          data.docNumber = num // kolom DB (dipakai tabel & rantai dokumen)
          // Cerminkan ke payload lineItems agar muncul di form & PDF (form baca dari sini).
          const li = data.lineItems
          if (li && typeof li === 'object') (li as { docNumber?: string }).docNumber = num
        }
        return query(args)
      },
    },
  },
})
