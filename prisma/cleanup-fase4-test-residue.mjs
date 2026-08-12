// Pembersihan residu test Fase 3e-3g/4a (disetujui user, 12 Ags 2026).
//
// Menghapus dokumen EPDA/FDA sisa testing sesi ini, MENYISAKAN hanya satu
// rantai contoh: FDA/2026/08/0001 (CLOSED) + Invoice/pembayaran yang lahir
// darinya — supaya ada satu contoh nyata siklus Fase 4 di database dev.
//
// TIDAK menyentuh: dokumen arsip gaya lama (MaritimeDocument — KW, LOI, CL,
// SIB, dst, sesuai M6 Fase 0: sengaja dibiarkan jadi arsip), Master Data,
// Voyage, Cargo, Invoice/InvoicePayment (Invoice contoh dipertahankan apa
// adanya, tak ada Invoice lain yang dibuat sesi ini selain contohnya).
//
// Backup diambil sebelum skrip ini dijalankan: backup/pre-fase4-cleanup.dump
//
// Jalankan:
//   node prisma/cleanup-fase4-test-residue.mjs --dry-run   → hanya menampilkan rencana
//   node prisma/cleanup-fase4-test-residue.mjs             → menerapkan

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

const DOC_NUMBERS_HAPUS = [
  'EPDA/2026/08/0003',
  'EPDA/2026/08/0004',
  'EPDA/2026/08/0004-R1',
  'EPDA/2026/08/0004-R2',
  'EPDA/2026/08/0004-R3',
  'EPDA/2026/08/0005',
  'EPDA/2026/08/0006',
  'EPDA/2026/08/0007',
  'EPDA/2026/08/0008',
  'EPDA/2026/08/0009',
  'FDA/2026/08/0002',
  'FDA/2026/08/0003',
]

const DOC_NUMBER_DIPERTAHANKAN = 'FDA/2026/08/0001'

async function main() {
  const target = await prisma.disbursement.findMany({
    where: { docNumber: { in: DOC_NUMBERS_HAPUS } },
    select: { id: true, docNumber: true, kind: true, status: true },
  })

  const dipertahankan = await prisma.disbursement.findFirst({
    where: { docNumber: DOC_NUMBER_DIPERTAHANKAN },
    select: { id: true, docNumber: true, status: true },
  })

  console.log(`Ditemukan ${target.length}/${DOC_NUMBERS_HAPUS.length} dokumen target hapus:`)
  for (const d of target) console.log(`  - ${d.docNumber} (${d.kind}, ${d.status})`)
  const hilang = DOC_NUMBERS_HAPUS.filter((n) => !target.some((d) => d.docNumber === n))
  if (hilang.length) console.log(`  (tidak ditemukan, dilewati: ${hilang.join(', ')})`)

  console.log(`\nDipertahankan sebagai contoh: ${dipertahankan ? dipertahankan.docNumber + ' (' + dipertahankan.status + ')' : '⚠️  TIDAK DITEMUKAN'}`)

  const ids = target.map((d) => d.id)

  const approvals = await prisma.approval.count({ where: { entityType: 'DISBURSEMENT', entityId: { in: ids } } })
  const auditLogs = await prisma.auditLog.count({ where: { tableName: 'Disbursement', recordId: { in: ids } } })
  const items = await prisma.disbursementItem.count({ where: { disbursementId: { in: ids } } })

  console.log(`\nIkut terhapus: ${items} DisbursementItem (cascade), ${approvals} Approval, ${auditLogs} AuditLog.`)

  if (DRY) {
    console.log('\n[--dry-run] Tidak ada yang diubah.')
    return
  }

  await prisma.$transaction([
    prisma.approval.deleteMany({ where: { entityType: 'DISBURSEMENT', entityId: { in: ids } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'Disbursement', recordId: { in: ids } } }),
    prisma.disbursement.deleteMany({ where: { id: { in: ids } } }), // cascade → DisbursementItem
  ])

  console.log(`\n✅ Selesai. ${ids.length} dokumen + turunannya terhapus.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
