// Seed data awal v2 (Fase 0 / M5): Currency, Port, Service Catalog + tarif contoh.
//
// Jalankan dari folder project:  node prisma/seed-v2.mjs
//
// SIFAT SKRIP INI:
// - IDEMPOTEN — aman dijalankan berulang kali.
// - TIDAK PERNAH MENIMPA. Baris yang sudah ada dibiarkan apa adanya. Begitu
//   operator mengisi tarif resmi, menjalankan ulang skrip ini tidak akan
//   menghapusnya.
// - Diterapkan ke SEMUA tenant. Sengaja: kalau nanti UI tenant A menampilkan
//   pelabuhan milik tenant B, kebocoran isolasi langsung kelihatan saat Fase 1.
//
// ⚠️ TARIF DI SINI ADALAH ANGKA CONTOH, BUKAN TARIF RESMI. Dipakai supaya mesin
//    hitung (Fase 3) bisa diuji. WAJIB diganti tarif resmi pelabuhan sebelum
//    EPDA dikirim ke principal.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
// Fase 8b / K153 — sumber data & logika TUNGGAL, dipakai juga oleh
// onboarding.service.ts (satu tenant, lewat systemContext). Node menguraikan
// TypeScript-nya sendiri (K11/K51), berkas itu sengaja tanpa alias `@/...`.
import { seedTenant } from '../src/services/saas/seed-data.ts'

// Muat DATABASE_URL dari .env / .env.local (script berdiri sendiri, bukan via Next.js).
for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* file tak ada — lewati */
  }
}

const prisma = new PrismaClient()

async function main() {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } })
  if (tenants.length === 0) {
    console.log('⚠️  Tidak ada tenant — tidak ada yang di-seed.')
    return
  }

  console.log(`Seed data awal v2 untuk ${tenants.length} tenant\n`)
  for (const t of tenants) {
    const h = await seedTenant(prisma, t.id)
    const total = h.currency + h.port + h.service + h.rate
    console.log(
      `  ${t.companyName}\n` +
        `    mata uang +${h.currency}  pelabuhan +${h.port}  jasa +${h.service}  tarif +${h.rate}` +
        (total === 0 ? '   (sudah lengkap, tidak ada perubahan)' : ''),
    )
  }

  console.log(
    '\n⚠️  Tarif yang dibuat skrip ini adalah ANGKA CONTOH, bukan tarif resmi.\n' +
      '    Ganti dengan tarif pelabuhan yang berlaku sebelum EPDA dikirim ke principal.\n' +
      '    Menjalankan ulang skrip ini TIDAK akan menimpa tarif yang sudah Anda isi.',
  )
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
