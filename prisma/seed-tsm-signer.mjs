// Seed penanda tangan untuk tenant TSM yang sudah ada.
// Mengisi signerName/signerTitle pada Tenant "PT Tribuana Solusi Maritim"
// HANYA bila masih kosong (tidak menimpa data yang sudah diisi manual).
//
// Jalankan dari folder project:  node prisma/seed-tsm-signer.mjs
// (Pastikan kolom signerName/signerTitle sudah ada — jalankan `npx prisma db push` lebih dulu.)

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

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
  const tenant = await prisma.tenant.findFirst({
    where: { companyName: { contains: 'Tribuana', mode: 'insensitive' } },
  })
  if (!tenant) {
    console.log('⚠️  Tenant TSM (mengandung "Tribuana") tidak ditemukan — lewati seed.')
    return
  }

  const data = {}
  if (!tenant.signerName) data.signerName = 'Marlon Saragih'
  if (!tenant.signerTitle) data.signerTitle = 'Branch Manager'

  if (Object.keys(data).length === 0) {
    console.log('✓ Penanda tangan TSM sudah terisi — tidak ada perubahan.')
    return
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data })
  console.log(`✓ Seed TSM: ${JSON.stringify(data)} → ${tenant.companyName}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
