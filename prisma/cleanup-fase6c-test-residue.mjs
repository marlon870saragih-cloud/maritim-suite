// Pembersihan residu test Fase 6c (verifikasi Cost Prediction, 13 Ags 2026).
//
// `check-ai-predict-api.mjs` sudah membersihkan dirinya sendiri di blok `finally`.
// Skrip ini adalah JARING PENGAMAN untuk keadaan skrip itu mati di tengah jalan
// (server dev mati, login gagal, Ctrl-C) sehingga data disposable-nya tertinggal.
//
// Yang dihapus: SEMUA baris bertanda `6C-` — voyage, disbursement (beserta
// itemnya lewat cascade), vessel, dan dua user penguji. Termasuk satu voyage +
// satu FDA di TENANT KEDUA yang sengaja dibuat untuk membuktikan pagar K65.
//
// Yang SENGAJA dipertahankan (sama seperti cleanup-fase4/4b/5d/5e): contoh
// `FDA/2026/08/0001` + `INV/2026/08/0001` dan seluruh voyage/disbursement lama.
//
//   node prisma/cleanup-fase6c-test-residue.mjs --dry-run
//   node prisma/cleanup-fase6c-test-residue.mjs

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

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
const DRY = process.argv.includes('--dry-run')

const TAG = '6C-'
const TEST_EMAILS = [
  'predict-6c-a@tribuanagency.co.id',
  'predict-6c-b@verifikasi.local',
  'predict-6c-doc@tribuanagency.co.id',
]

async function main() {
  const voyages = await prisma.voyage.findMany({
    where: { voyageNumber: { startsWith: TAG } },
    select: { id: true, voyageNumber: true, tenantId: true },
  })
  const ids = voyages.map((v) => v.id)
  const disbs = await prisma.disbursement.findMany({
    where: { voyageId: { in: ids } },
    select: { id: true, docNumber: true, status: true },
  })
  const vessels = await prisma.vessel.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true, name: true },
  })
  const users = await prisma.user.findMany({
    where: { email: { in: TEST_EMAILS } },
    select: { id: true, email: true },
  })

  console.log(`Voyage disposable (${voyages.length}):`)
  for (const v of voyages) console.log(`  - ${v.voyageNumber} (tenant ${v.tenantId})`)
  console.log(`Disbursement disposable (${disbs.length}):`)
  for (const d of disbs) console.log(`  - ${d.docNumber} (${d.status})`)
  console.log(`Vessel disposable (${vessels.length}):`)
  for (const v of vessels) console.log(`  - ${v.name}`)
  console.log(`User penguji (${users.length}):`)
  for (const u of users) console.log(`  - ${u.email}`)

  const dipertahankan = await prisma.disbursement.findFirst({
    where: { docNumber: 'FDA/2026/08/0001' },
    select: { docNumber: true, status: true, dataOrigin: true },
  })
  console.log(
    `\nDipertahankan: ${dipertahankan?.docNumber ?? '⚠️ TIDAK ADA'} (${dipertahankan?.status}, dataOrigin ${dipertahankan?.dataOrigin})`,
  )

  if (DRY) {
    console.log('\n[--dry-run] Tidak ada yang diubah.')
    return
  }

  const disbIds = disbs.map((d) => d.id)
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { tableName: 'Disbursement', recordId: { in: disbIds } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'Voyage', recordId: { in: ids } } }),
    prisma.approval.deleteMany({ where: { entityType: 'DISBURSEMENT', entityId: { in: disbIds } } }),
    prisma.disbursement.deleteMany({ where: { voyageId: { in: ids } } }), // cascade → DisbursementItem
    prisma.voyage.deleteMany({ where: { id: { in: ids } } }),
    prisma.vessel.deleteMany({ where: { id: { in: vessels.map((v) => v.id) } } }),
    prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }),
  ])

  console.log('\n✅ Residu Fase 6c dibersihkan.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
