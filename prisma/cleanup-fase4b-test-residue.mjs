// Pembersihan residu test Fase 4b (verifikasi PDF/kwitansi/OVERDUE, 12 Ags 2026).
//
// Menghapus 2 rantai EPDA→FDA→Invoice yang dibuat khusus untuk menguji
// penandaan OVERDUE (butuh dueDate lampau, tak bisa dites di atas contoh
// Fase 4a yang sudah PAID/terminal). MENYISAKAN hanya rantai contoh awal:
// FDA/2026/08/0001 (CLOSED) + INV/2026/08/0001 (PAID).
//
// Backup diambil sebelum skrip ini: backup/pre-fase4-cleanup.dump (12 Ags,
// diambil sebelum cleanup Fase 4a — dokumen 4b ini lahir SESUDAH backup itu,
// jadi tak ada di dalamnya; aman karena semuanya toh mau dihapus).
//
// Jalankan:
//   node prisma/cleanup-fase4b-test-residue.mjs --dry-run
//   node prisma/cleanup-fase4b-test-residue.mjs

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

const DISBURSEMENT_DOC_NUMBERS_HAPUS = [
  'EPDA/2026/08/0003',
  'EPDA/2026/08/0004',
  'FDA/2026/08/0002',
  'FDA/2026/08/0003',
]
const INVOICE_NUMBERS_HAPUS = ['INV/2026/08/0002', 'INV/2026/08/0003']

async function main() {
  const disbs = await prisma.disbursement.findMany({
    where: { docNumber: { in: DISBURSEMENT_DOC_NUMBERS_HAPUS } },
    select: { id: true, docNumber: true, status: true },
  })
  const invs = await prisma.invoice.findMany({
    where: { invoiceNumber: { in: INVOICE_NUMBERS_HAPUS } },
    select: { id: true, invoiceNumber: true, status: true },
  })

  console.log(`Disbursement dihapus (${disbs.length}/${DISBURSEMENT_DOC_NUMBERS_HAPUS.length}):`)
  for (const d of disbs) console.log(`  - ${d.docNumber} (${d.status})`)
  console.log(`Invoice dihapus (${invs.length}/${INVOICE_NUMBERS_HAPUS.length}):`)
  for (const i of invs) console.log(`  - ${i.invoiceNumber} (${i.status})`)

  const dipertahankanDisb = await prisma.disbursement.findFirst({ where: { docNumber: 'FDA/2026/08/0001' }, select: { docNumber: true, status: true } })
  const dipertahankanInv = await prisma.invoice.findFirst({ where: { invoiceNumber: 'INV/2026/08/0001' }, select: { invoiceNumber: true, status: true } })
  console.log(`\nDipertahankan: ${dipertahankanDisb?.docNumber ?? '⚠️ TIDAK ADA'} (${dipertahankanDisb?.status}), ${dipertahankanInv?.invoiceNumber ?? '⚠️ TIDAK ADA'} (${dipertahankanInv?.status})`)

  const disbIds = disbs.map((d) => d.id)
  const invIds = invs.map((i) => i.id)

  if (DRY) {
    console.log('\n[--dry-run] Tidak ada yang diubah.')
    return
  }

  await prisma.$transaction([
    prisma.approval.deleteMany({ where: { entityType: 'DISBURSEMENT', entityId: { in: disbIds } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'Disbursement', recordId: { in: disbIds } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'Invoice', recordId: { in: invIds } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'InvoicePayment', recordId: { in: (await prisma.invoicePayment.findMany({ where: { invoiceId: { in: invIds } }, select: { id: true } })).map((p) => p.id) } } }),
    prisma.invoice.deleteMany({ where: { id: { in: invIds } } }), // cascade → InvoiceItem, InvoicePayment
    prisma.disbursement.deleteMany({ where: { id: { in: disbIds } } }), // cascade → DisbursementItem
  ])

  console.log(`\n✅ Selesai. ${disbIds.length} Disbursement + ${invIds.length} Invoice + turunannya terhapus.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
