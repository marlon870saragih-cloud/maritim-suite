// Backfill provenance (Fase 6a / K57): setiap Voyage & Disbursement yang sudah
// ada diberi cap asal yang EKSPLISIT, sehingga `dataOrigin = NULL` tak pernah
// lagi muncul dan tafsir "NULL berarti UJI" tinggal jadi jaring pengaman.
//
// Jalankan dari folder project:
//   node prisma/backfill-data-origin.mjs --dry-run   → hanya menampilkan rencana
//   node prisma/backfill-data-origin.mjs             → menerapkan
//
// SIFAT SKRIP INI (sama dengan backfill-v2.mjs Fase 0):
// - IDEMPOTEN — baris yang SUDAH punya dataOrigin dilewati, jadi aman diulang
//   dan tak pernah menimpa pelabelan ulang yang dilakukan ADMIN sesudahnya.
// - ADITIF — hanya mengisi kolom yang sebelumnya kosong; tak ada baris dihapus,
//   tak ada nilai lain diubah.
// - PESIMIS — tak satu pun baris dicap 'NYATA'. Aplikasi ini belum pernah
//   dipakai produksi (§1.1 FASE-6-AI-LAYER.md), jadi 'NYATA' hasil backfill akan
//   menjadi kebohongan pertama yang dipercaya seluruh formula confidence.
//   Hitungan akhir NYATA = 0 adalah bagian dari definisi lulus.
//
// ATURAN PELABELAN (K57):
//   'SEED'  → baris yang lahir dari skrip seed-v2.mjs / backfill-v2.mjs.
//             Untuk Voyage, penandanya bukan tebakan tanggal melainkan FAKTA
//             struktural: backfill-v2.mjs membuat Voyage DARI PortCall lama lalu
//             menautkannya (portCall.voyageId), dan hanya jalur itu yang
//             menghasilkan Voyage tanpa pernah lewat createVoyage(). Voyage yang
//             punya PortCall tertaut hasil backfill = 'SEED'.
//             seed-v2.mjs sendiri TIDAK pernah membuat Voyage/Disbursement (ia
//             hanya mengisi Currency/Port/ServiceCatalog/ServiceRate), jadi tak
//             ada Disbursement ber-asal 'SEED' — dan itu memang benar.
//   'UJI'   → semua sisanya: dokumen uji developer Fase 2-5, termasuk yang sudah
//             soft-deleted/CANCELLED. Ditandai, TIDAK dihapus (K59).

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
// provenance.ts murni (K51) — tak punya impor nilai, jadi Node bisa
// menjalankannya langsung. Skrip ini memakai konstanta yang PERSIS SAMA dengan
// yang dipakai aplikasi, bukan salinan string yang bisa menyimpang.
import { ASAL_DATA, rangkumAsal } from '../src/services/ai/provenance.ts'

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

async function main() {
  console.log(
    DRY ? '=== MODE PRATINJAU (tidak menulis apa pun) ===\n' : '=== MENERAPKAN BACKFILL ASAL DATA ===\n',
  )

  // ---------- Voyage ----------
  const voyages = await prisma.voyage.findMany({
    where: { dataOrigin: null },
    select: {
      id: true,
      voyageNumber: true,
      tenantId: true,
      deletedAt: true,
      createdAt: true,
      // Penanda backfill-v2.mjs: PortCall lama yang ditautkan ke voyage ini.
      portCalls: { select: { id: true, createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const voyageSudah = await prisma.voyage.count({ where: { dataOrigin: { not: null } } })
  console.log(`Voyage tanpa cap: ${voyages.length} (sudah bercap sebelumnya: ${voyageSudah})`)

  const rencanaVoyage = []
  for (const v of voyages) {
    // PortCall yang LEBIH TUA dari voyage-nya hanya bisa terjadi lewat
    // backfill-v2.mjs (di jalur normal, PortCall dibuat DI DALAM voyage yang
    // sudah ada). Ini pembeda yang faktual, bukan tebakan tanggal.
    const dariBackfill = v.portCalls.some((pc) => pc.createdAt < v.createdAt)
    const asal = dariBackfill ? 'SEED' : 'UJI'
    rencanaVoyage.push({ id: v.id, asal })
    console.log(
      `  ${v.voyageNumber}  → ${asal}` +
        (dariBackfill ? '  (hasil backfill-v2.mjs: PortCall lama tertaut)' : '') +
        (v.deletedAt ? '  [soft-deleted]' : ''),
    )
  }

  // ---------- Disbursement ----------
  const disbursements = await prisma.disbursement.findMany({
    where: { dataOrigin: null },
    select: { id: true, docNumber: true, kind: true, status: true, deletedAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const disbSudah = await prisma.disbursement.count({ where: { dataOrigin: { not: null } } })
  console.log(`\nDisbursement tanpa cap: ${disbursements.length} (sudah bercap sebelumnya: ${disbSudah})`)

  const rencanaDisb = []
  for (const d of disbursements) {
    // Tak ada jalur seed yang membuat Disbursement, jadi semuanya 'UJI'.
    rencanaDisb.push({ id: d.id, asal: 'UJI' })
    console.log(
      `  ${d.docNumber}  [${d.kind}/${d.status}]  → UJI` + (d.deletedAt ? '  [soft-deleted]' : ''),
    )
  }

  // ---------- Terapkan ----------
  if (!DRY) {
    for (const r of rencanaVoyage) {
      await prisma.voyage.update({ where: { id: r.id }, data: { dataOrigin: r.asal } })
    }
    for (const r of rencanaDisb) {
      await prisma.disbursement.update({ where: { id: r.id }, data: { dataOrigin: r.asal } })
    }
  }

  // ---------- Ringkasan & pemeriksaan ----------
  const [semuaVoyage, semuaDisb] = await Promise.all([
    prisma.voyage.findMany({ select: { dataOrigin: true } }),
    prisma.disbursement.findMany({ select: { dataOrigin: true } }),
  ])
  const hVoyage = rangkumAsal(semuaVoyage.map((v) => v.dataOrigin))
  const hDisb = rangkumAsal(semuaDisb.map((d) => d.dataOrigin))

  console.log('\n=== RINGKASAN ===')
  console.log(`  Voyage       ${DRY ? 'akan dicap' : 'dicap'}: ${rencanaVoyage.length}`)
  console.log(`  Disbursement ${DRY ? 'akan dicap' : 'dicap'}: ${rencanaDisb.length}`)
  console.log(`\n  Keadaan DB ${DRY ? 'SEKARANG (belum berubah)' : 'SESUDAH'}:`)
  for (const [nama, h] of [
    ['Voyage      ', hVoyage],
    ['Disbursement', hDisb],
  ]) {
    console.log(`    ${nama}  ${ASAL_DATA.map((a) => `${a}=${h[a]}`).join('  ')}`)
  }

  const nullTersisa =
    semuaVoyage.filter((v) => v.dataOrigin === null).length +
    semuaDisb.filter((d) => d.dataOrigin === null).length
  const totalNyata = hVoyage.NYATA + hDisb.NYATA

  console.log(`\n    Baris masih NULL : ${nullTersisa}`)
  console.log(`    Total NYATA      : ${totalNyata}`)

  if (DRY) {
    console.log('\nPratinjau saja — belum ada yang ditulis. Jalankan tanpa --dry-run untuk menerapkan.')
    return
  }

  // Backfill yang menghasilkan 'NYATA' berarti aturannya salah, bukan datanya
  // istimewa — gagalkan dengan berisik daripada mengawetkan angka yang
  // menaikkan confidence Fase 6 tanpa dasar.
  if (totalNyata > 0) {
    console.log(
      `\n❌ GAGAL: ${totalNyata} baris ber-asal NYATA sesudah backfill. Backfill tidak boleh` +
        ` pernah menghasilkan NYATA (§15/6a butir 2). Periksa aturan pelabelan di skrip ini.`,
    )
    process.exitCode = 1
    return
  }
  if (nullTersisa > 0) {
    console.log(
      `\n❌ GAGAL: masih ada ${nullTersisa} baris tanpa cap. Definition of done 6a menuntut 0.`,
    )
    process.exitCode = 1
    return
  }
  console.log('\n✅ Selesai — setiap voyage & disbursement punya asal yang eksplisit, NYATA = 0.')
}

main()
  .catch((e) => {
    console.error('❌ Backfill gagal:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
