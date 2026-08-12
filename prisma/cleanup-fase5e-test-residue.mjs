// Pembersihan residu test Fase 5e (verifikasi Roles 4→7 + permission matrix, 12 Ags 2026).
//
// Menghapus 3 user test (satu per role baru) yang dibuat langsung lewat script
// (belum ada UI manajemen user/tim di aplikasi ini — temuan terpisah, lihat
// catatan sesi) + 1 EPDA disposable yang dipakai membuktikan alur pemisahan
// tugas Penyusun Biaya → Manajer Operasi.

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

const TEST_EMAILS = [
  'penyusun-biaya-test@tribuanagency.co.id',
  'manajer-operasi-test@tribuanagency.co.id',
  'direktur-test@tribuanagency.co.id',
]
const DISBURSEMENT_DOC_NUMBERS_HAPUS = ['EPDA/2026/08/0003']

async function main() {
  const users = await prisma.user.findMany({ where: { email: { in: TEST_EMAILS } }, select: { id: true, email: true, role: true } })
  const disbs = await prisma.disbursement.findMany({
    where: { docNumber: { in: DISBURSEMENT_DOC_NUMBERS_HAPUS } },
    select: { id: true, docNumber: true, status: true },
  })

  console.log(`User test dihapus (${users.length}/${TEST_EMAILS.length}):`)
  for (const u of users) console.log(`  - ${u.email} (${u.role})`)
  console.log(`Disbursement dihapus (${disbs.length}/${DISBURSEMENT_DOC_NUMBERS_HAPUS.length}):`)
  for (const d of disbs) console.log(`  - ${d.docNumber} (${d.status})`)

  const dipertahankanDisb = await prisma.disbursement.findFirst({ where: { docNumber: 'FDA/2026/08/0001' }, select: { docNumber: true, status: true } })
  const dipertahankanInv = await prisma.invoice.findFirst({ where: { invoiceNumber: 'INV/2026/08/0001' }, select: { invoiceNumber: true, status: true } })
  console.log(`\nDipertahankan: ${dipertahankanDisb?.docNumber ?? '⚠️ TIDAK ADA'} (${dipertahankanDisb?.status}), ${dipertahankanInv?.invoiceNumber ?? '⚠️ TIDAK ADA'} (${dipertahankanInv?.status})`)

  if (DRY) {
    console.log('\n[--dry-run] Tidak ada yang diubah.')
    return
  }

  const disbIds = disbs.map((d) => d.id)
  const userIds = users.map((u) => u.id)

  await prisma.$transaction([
    prisma.approval.deleteMany({ where: { entityType: 'DISBURSEMENT', entityId: { in: disbIds } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'Disbursement', recordId: { in: disbIds } } }),
    prisma.disbursement.deleteMany({ where: { id: { in: disbIds } } }), // cascade → DisbursementItem
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ])

  console.log(`\n✅ Selesai. ${userIds.length} user test + ${disbIds.length} Disbursement + turunannya terhapus.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
