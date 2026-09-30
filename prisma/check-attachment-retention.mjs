// Uji retensi lampiran — PRD-004 Step 5B-C2F (P36, menutup K110).
//
// Jalankan:  node prisma/check-attachment-retention.mjs
//   butuh DB dev. TANPA dev server, TANPA jaringan, TANPA OpenRouter.
//
// Lapis:
//   1. KEBIJAKAN — batas retensi, kepemilikan kunci, penolakan traversal (murni).
//   2. PENYIMPANAN — hapus() idempoten pada berkas hilang, MELEMPAR pada galat
//      lain, menolak kunci yang keluar dari direktori unggahan.
//   3. PENYAPUAN — hanya yang layak dimusnahkan; lampiran hidup / belum lewat
//      tenggang / sudah ditandai tak disentuh; kunci lintas tenant DILEWATI;
//      gagal hapus membiarkan baris di antrean; urutan operasi menyembuhkan diri.
//
// ⚠️ UPLOAD_DIR di-override ke direktori sementara SEBELUM modul penyimpanan
//    dibaca, jadi `.uploads` proyek TIDAK PERNAH tersentuh oleh uji ini.
// ⚠️ Baris DB uji ditandai `C2F-` dan dihapus lagi di `finally`, termasuk saat gagal.

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { PrismaClient } from '@prisma/client'

for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {
    /* tak ada berkasnya — lewati */
  }
}

// Dipasang SEBELUM import modul penyimpanan: direktoriUnggahan() membacanya saat dipanggil,
// tapi menaruhnya di sini membuat mustahil ada jalan yang memakai .uploads asli.
const AKAR = mkdtempSync(join(tmpdir(), 'c2f-uploads-'))
process.env.UPLOAD_DIR = AKAR

const { penyimpananLokal, buatStorageKey, buatTokenBerkas, direktoriUnggahan } = await import(
  '../src/services/ops/storage/local.ts'
)
const {
  RETENSI_LAMPIRAN_HARI,
  MAKS_BARIS_PER_JALAN,
  batasRetensiLampiran,
  kunciMilikTenant,
  sapuBaris,
} = await import('../src/services/ops/attachment-retention-policy.ts')

const prisma = new PrismaClient()
const TAG = 'C2F-'
const HARI = 24 * 60 * 60 * 1000

let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++
    console.log(`  ✅ ${nama}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}

function tulisBerkas(kunci) {
  const path = join(AKAR, kunci)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'isi-uji-c2f')
  return path
}
const ada = (kunci) => existsSync(join(AKAR, kunci))

const dibuat = []
async function buatLampiran({ tenantId, deletedAt, purgedAt = null, storageKey, tulis = true }) {
  const kunci = storageKey ?? buatStorageKey(tenantId, buatTokenBerkas(), '.pdf')
  if (tulis) tulisBerkas(kunci)
  const row = await prisma.attachment.create({
    data: {
      tenantId,
      entityType: 'VESSEL_CALL_INTAKE',
      entityId: `${TAG}entity`,
      fileName: `${TAG}berkas.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 11,
      sha256: `${TAG}${Math.random().toString(36).slice(2)}`,
      storageKey: kunci,
      uploadedByUserId: `${TAG}user`,
      deletedAt,
      purgedAt,
    },
  })
  dibuat.push(row.id)
  return row
}

/** Antrean + penanda berbasis Prisma — SAMA dengan yang dipakai service sungguhan. */
async function jalankanSapu({ sekarang, penyimpanan = penyimpananLokal, maksBaris = MAKS_BARIS_PER_JALAN }) {
  const batas = batasRetensiLampiran(sekarang)
  const antre = await prisma.attachment.findMany({
    where: { purgedAt: null, deletedAt: { not: null, lte: batas }, id: { in: dibuat } },
    select: { id: true, tenantId: true, storageKey: true },
    orderBy: { deletedAt: 'asc' },
    take: maksBaris,
  })
  return sapuBaris(antre, batas, penyimpanan, async (id) => {
    const n = await prisma.attachment.updateMany({ where: { id, purgedAt: null }, data: { purgedAt: sekarang } })
    return n.count > 0
  })
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true }, take: 2 })
  if (tenants.length < 2) throw new Error('Butuh minimal 2 tenant di DB dev untuk uji lintas tenant.')
  const [A, B] = tenants.map((t) => t.id)
  const sekarang = new Date()
  const lama = new Date(sekarang.getTime() - (RETENSI_LAMPIRAN_HARI + 5) * HARI)
  const baru = new Date(sekarang.getTime() - 1 * HARI)

  console.log(`\n[1] Kebijakan retensi (murni) — tenggang ${RETENSI_LAMPIRAN_HARI} hari`)
  const batas = batasRetensiLampiran(sekarang)
  cek('batas = sekarang − tenggang', Math.round((sekarang - batas) / HARI) === RETENSI_LAMPIRAN_HARI)
  cek('soft-delete lama berada SEBELUM batas (layak musnah)', lama < batas)
  cek('soft-delete baru berada SESUDAH batas (belum layak)', baru > batas)
  cek('tenggang lebih panjang dari jendela batal 24 jam pengunggah', RETENSI_LAMPIRAN_HARI * 24 > 24)

  console.log('\n[2] Kepemilikan kunci penyimpanan')
  cek('kunci diawali tenantId → milik tenant', kunciMilikTenant(`${A}/2026/09/abc.pdf`, A))
  cek('kunci tenant lain → DITOLAK', !kunciMilikTenant(`${B}/2026/09/abc.pdf`, A))
  cek('kunci tanpa pemisah → DITOLAK', !kunciMilikTenant(A, A))
  cek('kunci diawali pemisah → DITOLAK', !kunciMilikTenant(`/${A}/x.pdf`, A))
  cek('prefix palsu (tenantId + sufiks) → DITOLAK', !kunciMilikTenant(`${A}jahat/x.pdf`, A))
  cek('kunci traversal → DITOLAK', !kunciMilikTenant(`../${A}/x.pdf`, A))
  cek('kunci ber-NUL → DITOLAK', !kunciMilikTenant(`${A}/\0x.pdf`, A))
  cek('kunci kosong → DITOLAK', !kunciMilikTenant('', A))

  console.log('\n[3] Penyimpanan: hapus() idempoten & tak bisa keluar direktori')
  cek('direktoriUnggahan mengikuti UPLOAD_DIR sementara', direktoriUnggahan() === AKAR)
  const kunciAda = `${A}/2026/09/${buatTokenBerkas()}.pdf`
  tulisBerkas(kunciAda)
  cek('berkas uji tertulis', ada(kunciAda))
  await penyimpananLokal.hapus(kunciAda)
  cek('hapus() memusnahkan berkas', !ada(kunciAda))
  let idempoten = true
  try {
    await penyimpananLokal.hapus(kunciAda)
  } catch {
    idempoten = false
  }
  cek('hapus() kedua kali (berkas hilang) TIDAK melempar — idempoten', idempoten)
  for (const [nama, kunci] of [
    ['traversal', '../keluar.pdf'],
    ['NUL', 'x\0y'],
    ['kosong', ''],
  ]) {
    let ditolak = false
    try {
      await penyimpananLokal.hapus(kunci)
    } catch {
      ditolak = true
    }
    cek(`hapus() menolak kunci ${nama}`, ditolak)
  }

  console.log('\n[4] Penyapuan: hanya yang layak yang dimusnahkan')
  const layak = await buatLampiran({ tenantId: A, deletedAt: lama })
  const hidup = await buatLampiran({ tenantId: A, deletedAt: null })
  const belumLewat = await buatLampiran({ tenantId: A, deletedAt: baru })
  const ditandai = await buatLampiran({ tenantId: A, deletedAt: lama, purgedAt: sekarang })

  const j1 = await jalankanSapu({ sekarang })
  cek('tepat satu baris dimusnahkan', j1.dimusnahkan === 1, JSON.stringify(j1))
  cek('berkas yang layak HILANG dari disk', !ada(layak.storageKey))
  cek('berkas lampiran yang masih hidup TETAP ADA', ada(hidup.storageKey))
  cek('berkas yang belum lewat tenggang TETAP ADA', ada(belumLewat.storageKey))
  cek('berkas yang sudah ditandai purged TIDAK disentuh lagi', ada(ditandai.storageKey))

  const layakSesudah = await prisma.attachment.findUnique({ where: { id: layak.id } })
  cek('baris TIDAK dihapus — ia jadi nisan', layakSesudah !== null)
  cek('purgedAt terisi', layakSesudah?.purgedAt instanceof Date)
  cek('deletedAt tidak diubah', layakSesudah?.deletedAt?.getTime() === lama.getTime())
  cek('storageKey dipertahankan sebagai bukti', layakSesudah?.storageKey === layak.storageKey)
  const hidupSesudah = await prisma.attachment.findUnique({ where: { id: hidup.id } })
  cek('lampiran hidup tetap purgedAt NULL', hidupSesudah?.purgedAt === null)

  console.log('\n[5] Idempotensi penyapuan')
  const j2 = await jalankanSapu({ sekarang })
  cek('jalan kedua tidak menemukan pekerjaan', j2.diperiksa === 0 && j2.dimusnahkan === 0, JSON.stringify(j2))

  console.log('\n[6] Kunci lintas tenant DILEWATI, bukan dihapus')
  const kunciAsing = buatStorageKey(B, buatTokenBerkas(), '.pdf')
  const palsu = await buatLampiran({ tenantId: A, deletedAt: lama, storageKey: kunciAsing })
  const j3 = await jalankanSapu({ sekarang })
  cek('dilaporkan sebagai dilewati', j3.dilewati === 1, JSON.stringify(j3))
  cek('tidak ikut dimusnahkan', j3.dimusnahkan === 0)
  cek('berkas di direktori tenant lain TETAP ADA', ada(kunciAsing))
  const palsuSesudah = await prisma.attachment.findUnique({ where: { id: palsu.id } })
  cek('barisnya TIDAK ditandai purged (butuh mata manusia)', palsuSesudah?.purgedAt === null)
  await prisma.attachment.deleteMany({ where: { id: palsu.id } })

  console.log('\n[7] Gagal hapus → baris tetap di antrean (dapat dicoba lagi)')
  const gagalHapus = await buatLampiran({ tenantId: A, deletedAt: lama })
  const penyimpananRusak = {
    hapus: async () => {
      const e = new Error('disk read-only (uji)')
      e.code = 'EACCES'
      throw e
    },
  }
  const j4 = await jalankanSapu({ sekarang, penyimpanan: penyimpananRusak })
  cek('kegagalan dihitung, bukan ditelan diam-diam', j4.gagal === 1, JSON.stringify(j4))
  cek('tidak ada yang dilaporkan musnah', j4.dimusnahkan === 0)
  const gagalSesudah = await prisma.attachment.findUnique({ where: { id: gagalHapus.id } })
  cek('purgedAt TETAP NULL — baris masih di antrean', gagalSesudah?.purgedAt === null)
  cek('berkasnya memang masih ada', ada(gagalHapus.storageKey))

  console.log('\n[8] Penyembuhan diri: berkas sudah hilang, baris belum ditandai')
  rmSync(join(AKAR, gagalHapus.storageKey), { force: true })
  const j5 = await jalankanSapu({ sekarang })
  cek('jalan berikutnya menandai walau berkas sudah tiada (ENOENT ditelan)', j5.dimusnahkan === 1, JSON.stringify(j5))
  const sembuh = await prisma.attachment.findUnique({ where: { id: gagalHapus.id } })
  cek('purgedAt akhirnya terisi', sembuh?.purgedAt instanceof Date)

  console.log('\n[9] Batas baris per jalan')
  const b1 = await buatLampiran({ tenantId: A, deletedAt: lama })
  const b2 = await buatLampiran({ tenantId: A, deletedAt: lama })
  const j6 = await jalankanSapu({ sekarang, maksBaris: 1 })
  cek('maksBaris=1 → hanya satu diperiksa', j6.diperiksa === 1 && j6.dimusnahkan === 1, JSON.stringify(j6))
  const sisa = await prisma.attachment.count({ where: { id: { in: [b1.id, b2.id] }, purgedAt: null } })
  cek('sisanya tetap menunggu jalan berikutnya', sisa === 1)
}

main()
  .catch((e) => {
    console.error('\n💥 GALAT:', e.message)
    gagal++
  })
  .finally(async () => {
    const n = await prisma.attachment.deleteMany({ where: { id: { in: dibuat } } })
    console.log(`\n[Z] Bersih-bersih → baris lampiran uji dihapus: ${n.count}`)
    rmSync(AKAR, { recursive: true, force: true })
    console.log(`     direktori unggahan sementara dihapus: ${!existsSync(AKAR)}`)
    await prisma.$disconnect()
    console.log(gagal === 0 ? `\n✅ SEMUA LULUS — lulus ${lulus}, gagal 0` : `\n❌ lulus ${lulus}, gagal ${gagal}`)
    if (gagal > 0) process.exitCode = 1
  })
