// Uji pagar isolasi tenant (services/tenant-db.ts).
//
// Jalankan:  node prisma/check-tenant-guard.mjs
//
// Kenapa ada: pagar keamanan yang tidak diuji hanya memberi rasa aman palsu.
// Berkas ini membuktikan pagarnya benar-benar menahan, dan yang paling penting —
// menangkap kelalaian paling mungkin terjadi: menambah model bertenant baru di
// schema.prisma tetapi lupa mendaftarkannya di TENANT_MODELS.
//
// Uji ini MEMBACA data yang ada dan membuat satu baris sementara yang dihapus
// lagi di akhir. Butuh minimal 2 tenant di DB.
//
// Catatan: berkas .ts diimpor langsung — Node 24 mengurai TypeScript sendiri.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
// tenant-guard.ts tidak punya impor sama sekali, jadi Node bisa menjalankannya
// langsung. Uji ini memakai objek extension yang PERSIS SAMA dengan yang dipakai
// aplikasi lewat forTenant() — bukan tiruannya.
import { TENANT_MODELS, tenantGuardExtension } from '../src/services/tenant-guard.ts'

for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* lewati */
  }
}

const prisma = new PrismaClient()

/** Klien berpagar, dibangun dari extension yang sama dengan yang dipakai app. */
const forTenant = (ctx) => prisma.$extends(tenantGuardExtension(ctx.tenantId))
let lulus = 0
let gagal = 0

function cek(nama, syarat, keterangan = '') {
  if (syarat) {
    lulus++
    console.log(`  ✅ ${nama}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${keterangan ? ` — ${keterangan}` : ''}`)
  }
}

async function melempar(fn) {
  try {
    await fn()
    return null
  } catch (e) {
    return e
  }
}

async function main() {
  // ---------- 1. Daftar TENANT_MODELS vs schema ----------
  console.log('\n1. Daftar TENANT_MODELS cocok dengan schema.prisma')
  const schema = readFileSync(new URL('./schema.prisma', import.meta.url), 'utf8')
  const diSchema = new Set()
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    if (/^\s*tenantId\s+String/m.test(m[2])) diSchema.add(m[1])
  }
  const kurang = [...diSchema].filter((m) => !TENANT_MODELS.has(m))
  const berlebih = [...TENANT_MODELS].filter((m) => !diSchema.has(m))

  cek(
    `semua ${diSchema.size} model bertenant terdaftar di guard`,
    kurang.length === 0,
    kurang.length ? `BELUM tersaring: ${kurang.join(', ')}` : '',
  )
  cek(
    'tidak ada nama model usang di guard',
    berlebih.length === 0,
    berlebih.length ? `tidak ada di schema: ${berlebih.join(', ')}` : '',
  )

  // ---------- Siapkan dua tenant ----------
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' }, take: 2 })
  if (tenants.length < 2) {
    console.log('\n⚠️  Butuh minimal 2 tenant untuk menguji isolasi — uji isolasi dilewati.')
    return
  }
  const [A, B] = tenants
  const ctxA = { tenantId: A.id, userId: 'uji', role: 'ADMIN' }
  const dbA = forTenant(ctxA)
  console.log(`\n   tenant A = ${A.companyName}\n   tenant B = ${B.companyName}`)

  // ---------- 2. Baca tidak bisa menembus tenant lain ----------
  console.log('\n2. Pembacaan terkurung pada tenant sendiri')
  const semuaPort = await prisma.port.count()
  const portA = await dbA.port.findMany()
  const portBAsli = await prisma.port.count({ where: { tenantId: B.id } })

  cek('findMany hanya mengembalikan milik tenant A', portA.every((p) => p.tenantId === A.id))
  cek(
    'jumlahnya lebih sedikit dari total lintas-tenant',
    portA.length < semuaPort && portBAsli > 0,
    `A=${portA.length} total=${semuaPort} B=${portBAsli}`,
  )

  const satuPortB = await prisma.port.findFirst({ where: { tenantId: B.id } })
  const curi = await dbA.port.findFirst({ where: { id: satuPortB.id } })
  cek('findFirst dengan id milik tenant B mengembalikan null', curi === null)

  const hitung = await dbA.port.count()
  cek('count ikut tersaring', hitung === portA.length, `count=${hitung} findMany=${portA.length}`)

  // ---------- 3. tenantId palsu dari pemanggil diabaikan ----------
  console.log('\n3. tenantId yang disodorkan pemanggil tidak dipercaya')
  // Guard MENIMPA tenantId, bukan menambah syarat. Jadi hasil yang benar bukan
  // "kosong", melainkan "punya A" — permintaan ke B diam-diam dibelokkan ke A.
  const paksa = await dbA.port.findMany({ where: { tenantId: B.id } })
  cek(
    'where.tenantId = B ditimpa oleh konteks A',
    paksa.length > 0 && paksa.every((p) => p.tenantId === A.id),
    `dapat ${paksa.length} baris, ada milik B: ${paksa.some((p) => p.tenantId === B.id)} — BOCOR`,
  )
  cek('tak satu pun baris milik B ikut terbawa', !paksa.some((p) => p.tenantId === B.id))

  // ---------- 4. Operasi berbahaya ditolak ----------
  console.log('\n4. Operasi yang tak bisa dipagari ditolak')
  for (const op of ['findUnique', 'update', 'delete', 'upsert']) {
    const e = await melempar(() =>
      op === 'update' || op === 'upsert'
        ? dbA.port[op]({ where: { id: satuPortB.id }, data: {}, create: {}, update: {} })
        : dbA.port[op]({ where: { id: satuPortB.id } }),
    )
    cek(`${op}() dilarang`, e != null && String(e.message).includes('tenant-guard'), String(e?.message).slice(0, 80))
  }

  // ---------- 5. Model tanpa tenantId tetap lewat ----------
  console.log('\n5. Model tanpa tenantId tidak ikut disaring')
  const semuaTenant = await dbA.tenant.count()
  cek('Tenant (tak bertenant) bisa dibaca normal', semuaTenant >= 2, `dapat ${semuaTenant}`)

  // ---------- 6. create mengisi tenantId sendiri ----------
  console.log('\n6. create() mengisi tenantId otomatis')
  const kode = `ZZ${Date.now().toString().slice(-3)}`
  let baru
  try {
    // Sengaja TIDAK menulis tenantId, dan menyodorkan tenantId B untuk dicoba tembus.
    baru = await dbA.port.create({ data: { name: `__uji_guard_${kode}`, unlocode: kode, tenantId: B.id } })
    cek('tenantId terisi dari konteks A, bukan dari data pemanggil', baru.tenantId === A.id, `dapat ${baru.tenantId}`)

    const terlihatOlehB = await forTenant({ tenantId: B.id, userId: 'uji', role: 'ADMIN' }).port.findFirst({
      where: { id: baru.id },
    })
    cek('baris baru tidak terlihat oleh tenant B', terlihatOlehB === null)
  } finally {
    if (baru) await prisma.port.delete({ where: { id: baru.id } })
  }

  // ---------- 7. updateMany/deleteMany tidak menyentuh tenant lain ----------
  console.log('\n7. updateMany tidak menyentuh baris tenant lain')
  const ubah = await dbA.port.updateMany({ where: { id: satuPortB.id }, data: { notes: 'DIRETAS' } })
  cek('updateMany ke id milik B mengubah 0 baris', ubah.count === 0, `count=${ubah.count}`)
  const utuh = await prisma.port.findFirst({ where: { id: satuPortB.id } })
  cek('data tenant B tetap utuh', utuh?.notes !== 'DIRETAS')
}

main()
  .catch((e) => {
    console.error('\n❌ Uji gagal dijalankan:', e)
    gagal++
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(`\n${'='.repeat(46)}`)
    console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
    process.exitCode = gagal === 0 ? 0 : 1
  })
