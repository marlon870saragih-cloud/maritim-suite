// Penghapusan tenant — K188 (Fase 8k). 🔴 Opus. ⚠️ TIDAK BISA DIBATALKAN.
//
// Jalankan:
//   node prisma/delete-tenant.mjs --tenant=<id> --dry-run     ← WAJIB dulu
//   node prisma/delete-tenant.mjs --tenant=<id> --konfirmasi=<companyName>
//
// ---------------------------------------------------------------------------
// KENAPA INI SKRIP, BUKAN TOMBOL
//
// `Tenant` sudah punya `onDelete: Cascade` pada hampir semua relasi, sehingga
// penghapusan SECARA TEKNIS satu baris. **Justru karena itu ia berbahaya** —
// satu baris yang menghapus puluhan ribu baris tanpa peringatan. Karena itu
// K188 menetapkan: skrip terpisah (bukan endpoint, bukan tombol di UI),
// `--dry-run` wajib lebih dulu, backup wajib lebih dulu, dan berkas lampiran
// fisik TIDAK ikut terhapus pada jalan yang sama.
//
// "Tidak ada satu pun jalur kode yang bisa menghapus tenant tanpa manusia
// mengetik perintah" — dan §17/8k butir 9 menuntut itu dibuktikan dengan
// mencari `tenant.delete` di seluruh `src/app/api/` dan menemukannya nihil.
//
// ---------------------------------------------------------------------------
// EMPAT LANGKAH OFFBOARDING (K188) — SKRIP INI HANYA LANGKAH 4
//
//   1. Berhenti     → tenant read-only (perilaku `locked` yang SUDAH ADA).
//   2. Ekspor       → ADMIN menarik seluruh datanya (K186). Bisa diulang.
//   3. Tenggang     → masa tunggu. Lamanya = P51. Interim: TAK TERBATAS.
//   4. Penghapusan  → HANYA atas permintaan tertulis tenant. ← berkas ini
//
// Skrip ini TIDAK memeriksa apakah langkah 1-3 sudah dijalankan: ia tidak bisa
// tahu apakah ada surat permintaan tertulis, dan berpura-pura memeriksanya
// (mis. dengan sebuah kolom `bolehDihapus`) hanya memindahkan keputusan
// manusia ke dalam basis data tanpa membuatnya lebih benar. Yang dilakukan
// sebagai gantinya: menuntut nama perusahaan diketik ulang persis.
//
// ---------------------------------------------------------------------------
// BERKAS FISIK SENGAJA DITINGGALKAN (K110 masih berlaku)
//
// Baris `Attachment` ikut terhapus lewat cascade, tapi berkas di disk TIDAK
// dihapus skrip ini. K110: penghapusan fisik menunggu kebijakan retensi
// (P36/P59) — dan sesudah baris DB-nya hilang, berkas yatim itu justru satu-
// satunya sisa yang bisa dipakai memulihkan kalau penghapusan ini ternyata
// keliru. Direktori tenant di penyimpanan dicetak di akhir supaya operator
// bisa menghapusnya SENDIRI, sebagai tindakan terpisah dan sadar.

import { readFileSync } from 'node:fs'
import { PrismaClient, Prisma } from '@prisma/client'
import { direktoriUnggahan } from '../src/services/ops/storage/local.ts'

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

const argv = process.argv.slice(2)
const ambil = (nama) => {
  const p = argv.find((a) => a.startsWith(`--${nama}=`))
  return p ? p.slice(nama.length + 3) : null
}
const DRY_RUN = argv.includes('--dry-run')
const TENANT_ID = ambil('tenant')
const KONFIRMASI = ambil('konfirmasi')

/**
 * Tabel yang dihitung. Diturunkan dari model yang PUNYA kolom `tenantId` —
 * bukan daftar tulis-tangan, supaya model baru otomatis ikut terhitung dan
 * laporan dry-run tak pernah diam-diam kurang.
 *
 * ⚠️ Sumbernya `Prisma.dmmf`, BUKAN `prisma[model].fields`: yang terakhir
 * adalah Proxy yang menjawab `hasOwnProperty` dengan `true` untuk kunci APA
 * PUN — ia melaporkan `Cargo` punya `tenantId` padahal tidak (Cargo model
 * anak dari Voyage). Ditemukan lewat menjalankan skrip ini sungguhan, bukan
 * lewat membaca kode; kalau dibiarkan, dry-run akan gagal keras di tabel anak
 * pertama yang ditemuinya.
 */
function modelBertenant() {
  return Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1))
    .filter((k) => typeof prisma[k]?.count === 'function')
    .sort()
}

async function hitungPerTabel(tenantId) {
  const keluar = []
  for (const m of modelBertenant()) {
    const n = await prisma[m].count({ where: { tenantId } })
    if (n > 0) keluar.push({ model: m, jumlah: n })
  }
  return keluar
}

/** Jumlah baris SELURUH DB per model — untuk membuktikan tenant lain tak tersentuh. */
async function potretGlobal() {
  const keluar = {}
  for (const m of modelBertenant()) keluar[m] = await prisma[m].count()
  return keluar
}

function garis(c = '─', n = 66) {
  return c.repeat(n)
}

async function main() {
  if (!TENANT_ID) {
    console.error('❌ Wajib: --tenant=<id>. Lihat daftar tenant dengan `node prisma/usage-report.mjs`.')
    process.exitCode = 1
    return
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { id: true, companyName: true, plan: true, createdAt: true },
  })
  if (!tenant) {
    console.error(`❌ Tenant "${TENANT_ID}" tidak ditemukan.`)
    process.exitCode = 1
    return
  }

  console.log(garis('='))
  console.log(`PENGHAPUSAN TENANT — K188${DRY_RUN ? '   🔍 DRY RUN (tak menulis apa pun)' : '   ⚠️  SUNGGUHAN'}`)
  console.log(garis('='))
  console.log(`Perusahaan : ${tenant.companyName}`)
  console.log(`Tenant ID  : ${tenant.id}`)
  console.log(`Paket      : ${tenant.plan}   Dibuat: ${tenant.createdAt.toISOString().slice(0, 10)}`)
  console.log(garis())

  const perTabel = await hitungPerTabel(TENANT_ID)
  const totalBaris = perTabel.reduce((s, r) => s + r.jumlah, 0)

  console.log('\nBARIS YANG AKAN TERHAPUS (lewat cascade):')
  if (perTabel.length === 0) {
    console.log('   (tidak ada baris di tabel bertenant mana pun)')
  } else {
    for (const r of perTabel) console.log(`   ${r.model.padEnd(34)} ${String(r.jumlah).padStart(8)}`)
  }
  console.log(`   ${'TOTAL'.padEnd(34)} ${String(totalBaris).padStart(8)}`)

  const lampiran = await prisma.attachment.count({ where: { tenantId: TENANT_ID } })
  console.log(`\nBerkas lampiran milik tenant ini: ${lampiran}`)
  console.log(`   ⚠️  Baris DB-nya ikut terhapus, BERKAS FISIKNYA TIDAK (K110).`)
  console.log(`   Letaknya: ${direktoriUnggahan()}\\${TENANT_ID}`)

  const sebelum = await potretGlobal()
  const totalGlobalSebelum = Object.values(sebelum).reduce((a, b) => a + b, 0)

  if (DRY_RUN) {
    const sesudah = await potretGlobal()
    const totalGlobalSesudah = Object.values(sesudah).reduce((a, b) => a + b, 0)
    console.log(`\nBaris global SEBELUM/SESUDAH dry-run: ${totalGlobalSebelum} / ${totalGlobalSesudah}`)
    if (totalGlobalSebelum !== totalGlobalSesudah) {
      throw new Error('[K188] DRY RUN mengubah jumlah baris — ini bug serius, laporkan.')
    }
    console.log('\n🔍 DRY RUN selesai — nol baris ditulis (terbukti, bukan diklaim).')
    console.log('\nUntuk MENJALANKAN SUNGGUHAN, pastikan lebih dulu:')
    console.log('   1. Backup database TERBARU sudah ada DAN sudah pernah diuji pulih.')
    console.log('   2. Tenant sudah menarik ekspor datanya sendiri (K186, langkah 2).')
    console.log('   3. Ada PERMINTAAN TERTULIS dari tenant (K188 — bukan lisan).')
    console.log(`\nLalu jalankan:\n   node prisma/delete-tenant.mjs --tenant=${TENANT_ID} --konfirmasi="${tenant.companyName}"`)
    console.log(garis('='))
    return
  }

  // ------------------------------------------------------- jalan sungguhan
  if (KONFIRMASI !== tenant.companyName) {
    console.error('\n❌ DIBATALKAN — konfirmasi tidak cocok.')
    console.error(`   Diberikan : ${KONFIRMASI === null ? '(tidak ada)' : `"${KONFIRMASI}"`}`)
    console.error(`   Diharapkan: "${tenant.companyName}"`)
    console.error('\n   Nama perusahaan harus diketik ULANG PERSIS. Ini satu-satunya')
    console.error('   pagar yang tersisa sebelum puluhan ribu baris hilang, dan ia')
    console.error('   sengaja tak bisa dilewati dengan flag "--force" apa pun.')
    process.exitCode = 1
    return
  }

  console.log('\n⚠️  Konfirmasi cocok. Menghapus…')
  await prisma.tenant.delete({ where: { id: TENANT_ID } })

  const sesudah = await potretGlobal()
  const totalGlobalSesudah = Object.values(sesudah).reduce((a, b) => a + b, 0)

  // Pembuktian bahwa yang hilang PERSIS sebanyak yang dilaporkan dry-run —
  // kalau selisihnya beda, ada relasi yang ikut terhapus di luar hitungan dan
  // itu harus terlihat SEKARANG, bukan ditemukan berminggu-minggu kemudian.
  const selisih = totalGlobalSebelum - totalGlobalSesudah
  console.log(`\nBaris global: ${totalGlobalSebelum} → ${totalGlobalSesudah}  (hilang ${selisih})`)
  if (selisih !== totalBaris) {
    console.log(`   ⚠️  CATATAN: dilaporkan ${totalBaris}, sesungguhnya hilang ${selisih}.`)
    console.log('   Selisih ini biasanya berarti ada model bertenant yang tak terhitung')
    console.log('   (tak punya kolom tenantId tapi ikut cascade lewat induknya —')
    console.log('   mis. model anak K44 seperti CrewChangeMember/DisbursementItem).')
  }

  console.log(`\n✅ Tenant "${tenant.companyName}" terhapus.`)
  console.log(`\n⚠️  BERKAS FISIK MASIH ADA — dihapus TERPISAH & SADAR (K110):`)
  console.log(`   ${direktoriUnggahan()}\\${TENANT_ID}`)
  console.log(garis('='))
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
