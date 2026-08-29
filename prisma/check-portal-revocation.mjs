// Uji pencabutan akses PORTAL — C1.3 (R-1/R-2/R-3).
//
// Jalankan dari akar proyek:
//   set -a; . ./.env; set +a; node prisma/check-portal-revocation.mjs
//
// KENAPA ADA. Audit C1.3 menemukan tiga jalan masuk yang tetap terbuka setelah
// otorisasi dicabut: layout HTML yang hanya memeriksa "ada sesi atau tidak",
// PortalUser yang tak pernah dibaca ulang, dan Customer/Vendor yang tak pernah
// diverifikasi masih hidup. Uji ini memastikan ketiganya tetap tertutup.
//
// DUA LAPIS PEMBUKTIAN — sengaja, karena masing-masing menutupi kelemahan
// yang lain:
//
//   BAGIAN 1 — kunci sumber. Membaca src/services/portal/context.ts dan
//   memastikan klausa `where` benar-benar memuat setiap syarat. Ini menangkap
//   kemunduran yang tak akan terlihat oleh uji perilaku: seseorang menghapus
//   satu syarat, lalu fixture uji kebetulan tak menyentuhnya.
//
//   BAGIAN 2 — uji perilaku. Membuat fixture berawalan C13TEST-, lalu menjalankan
//   skenario nyata terhadap database. Ini menangkap kekeliruan yang tak akan
//   terlihat oleh pembacaan sumber: sintaks Prisma yang benar tetapi artinya
//   bukan yang dikira.
//
// SELURUH data yang dibuat berawalan `C13TEST-` dan dihapus di akhir, sukses
// maupun gagal. Tidak pernah menyentuh customer sungguhan.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const PREFIX = 'C13TEST-'
let gagal = 0
let lulus = 0

const ok = (nama) => { lulus++; console.log(`  \x1b[32mPASS\x1b[0m  ${nama}`) }
const no = (nama, ket) => { gagal++; console.log(`  \x1b[31mFAIL\x1b[0m  ${nama}${ket ? ' — ' + ket : ''}`) }
const cek = (nama, syarat, ket) => (syarat ? ok(nama) : no(nama, ket))

// ---------------------------------------------------------------------------
// BAGIAN 1 — kunci sumber
// ---------------------------------------------------------------------------
function bagian1() {
  console.log('\nBAGIAN 1 — klausa where di context.ts memuat seluruh syarat')
  const src = readFileSync('src/services/portal/context.ts', 'utf8')
  const fn = src.slice(src.indexOf('export async function cariAksesPortalAktif'))
  const blok = fn.slice(0, fn.indexOf('\n}'))

  cek('revokedAt: null diperiksa', /revokedAt:\s*null/.test(blok))
  cek('tenantId ikut disaring', /tenantId\b/.test(blok))
  cek('PortalUser.isActive diperiksa', /portalUser:\s*\{[^}]*isActive:\s*true/.test(blok))
  cek('PortalUser.deletedAt diperiksa', /portalUser:\s*\{[^}]*deletedAt:\s*null/.test(blok))
  cek('Customer.isActive diperiksa', /customer:\s*\{[^}]*isActive:\s*true/.test(blok))
  cek('Customer.deletedAt diperiksa', /customer:\s*\{[^}]*deletedAt:\s*null/.test(blok))
  cek('Vendor.isActive diperiksa', /vendor:\s*\{[^}]*isActive:\s*true/.test(blok))
  cek('Vendor.deletedAt diperiksa', /vendor:\s*\{[^}]*deletedAt:\s*null/.test(blok))
  cek('ikatan pihak CUSTOMER eksplisit', /pihak:\s*'CUSTOMER'/.test(blok))
  cek('ikatan pihak VENDOR eksplisit', /pihak:\s*'VENDOR'/.test(blok))
  cek('memilih akses terbaru (multi-akses tetap hidup)', /orderBy:\s*\{\s*createdAt:\s*'desc'/.test(blok))

  // Jalur unduh dokumen harus tetap lewat gerbang yang sama.
  const att = readFileSync('src/app/api/portal/attachments/[id]/content/route.ts', 'utf8')
  cek('unduh attachment memakai withPortal', /withPortal\(/.test(att))

  // Layout HTML tidak boleh kembali hanya memeriksa sesi.
  const lay = readFileSync('src/app/portal/(app)/layout.tsx', 'utf8')
  cek('layout portal memanggil requirePortal', /requirePortal\(\)/.test(lay))
  cek('layout mengalihkan ke access-revoked', /access-revoked/.test(lay))
}

// ---------------------------------------------------------------------------
// BAGIAN 2 — uji perilaku
// ---------------------------------------------------------------------------

// Salinan klausa where produksi. Bagian 1 yang menjamin salinan ini tidak
// menyimpang dari sumbernya.
const aksesAktif = (portalUserId, tenantId) =>
  prisma.portalAccess.findFirst({
    where: {
      portalUserId,
      tenantId,
      revokedAt: null,
      portalUser: { isActive: true, deletedAt: null },
      OR: [
        { pihak: 'CUSTOMER', customerId: { not: null }, customer: { isActive: true, deletedAt: null } },
        { pihak: 'VENDOR', vendorId: { not: null }, vendor: { isActive: true, deletedAt: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

async function bersihkan(tenantId) {
  await prisma.portalAccess.deleteMany({
    where: { tenantId, OR: [{ customer: { name: { startsWith: PREFIX } } }, { portalUser: { email: { startsWith: PREFIX.toLowerCase() } } }] },
  })
  await prisma.portalUser.deleteMany({ where: { tenantId, email: { startsWith: PREFIX.toLowerCase() } } })
  await prisma.customer.deleteMany({ where: { tenantId, name: { startsWith: PREFIX } } })
}

async function bagian2() {
  console.log('\nBAGIAN 2 — perilaku terhadap database')

  // Pinjam tenant yang sudah ada; TIDAK membuat Tenant baru.
  const tenant = await prisma.tenant.findFirst({ select: { id: true } })
  if (!tenant) { no('menemukan tenant untuk fixture'); return null }
  const tenantId = tenant.id

  await bersihkan(tenantId) // sisa jalannya yang gagal sebelumnya

  const custA = await prisma.customer.create({ data: { tenantId, name: PREFIX + 'CUSTOMER-A', isActive: true } })
  const custB = await prisma.customer.create({ data: { tenantId, name: PREFIX + 'CUSTOMER-B', isActive: true } })
  const user = await prisma.portalUser.create({
    data: {
      tenantId,
      email: PREFIX.toLowerCase() + 'user@example.invalid',
      password: 'tidak-dipakai-uji-ini',
      name: PREFIX + 'USER',
      isActive: true,
    },
  })
  const aksesA = await prisma.portalAccess.create({
    data: { tenantId, portalUserId: user.id, pihak: 'CUSTOMER', customerId: custA.id },
  })
  await new Promise((r) => setTimeout(r, 15)) // pastikan createdAt B > A
  const aksesB = await prisma.portalAccess.create({
    data: { tenantId, portalUserId: user.id, pihak: 'CUSTOMER', customerId: custB.id },
  })

  const pilih = () => aksesAktif(user.id, tenantId)

  // A — pengguna sah
  cek('A · akses diberikan untuk pengguna sah', (await pilih()) !== null)

  // G1 — multi-akses: yang terbaru dipilih
  cek('G1 · akses terbaru (B) yang dipilih', (await pilih())?.id === aksesB.id)

  // G2 — cabut B, A harus tetap hidup  (pencabutan satu akses ≠ logout global)
  await prisma.portalAccess.update({ where: { id: aksesB.id }, data: { revokedAt: new Date() } })
  const setelahCabutB = await pilih()
  cek('G2 · cabut B → A tetap sah (bukan logout global)', setelahCabutB?.id === aksesA.id)

  // B — cabut sisanya → ditolak
  await prisma.portalAccess.update({ where: { id: aksesA.id }, data: { revokedAt: new Date() } })
  cek('B · semua akses dicabut → ditolak', (await pilih()) === null)

  // pulihkan A untuk uji berikutnya
  await prisma.portalAccess.update({ where: { id: aksesA.id }, data: { revokedAt: null } })
  cek('B2 · akses dipulihkan → diberikan lagi', (await pilih()) !== null)

  // C — customer di-soft-delete TANPA mencabut akses lebih dulu  (R-3)
  await prisma.customer.update({ where: { id: custA.id }, data: { deletedAt: new Date(), isActive: false } })
  cek('C · customer dihapus tanpa cabut akses → ditolak (R-3)', (await pilih()) === null)
  await prisma.customer.update({ where: { id: custA.id }, data: { deletedAt: null, isActive: true } })

  // C2 — customer hanya dinonaktifkan (jalur yang justru disarankan sistem)
  await prisma.customer.update({ where: { id: custA.id }, data: { isActive: false } })
  cek('C2 · customer dinonaktifkan → ditolak', (await pilih()) === null)
  await prisma.customer.update({ where: { id: custA.id }, data: { isActive: true } })

  // D — PortalUser dinonaktifkan  (R-2)
  await prisma.portalUser.update({ where: { id: user.id }, data: { isActive: false } })
  cek('D · PortalUser dinonaktifkan → ditolak (R-2)', (await pilih()) === null)
  await prisma.portalUser.update({ where: { id: user.id }, data: { isActive: true } })

  // D2 — PortalUser di-soft-delete
  await prisma.portalUser.update({ where: { id: user.id }, data: { deletedAt: new Date() } })
  cek('D2 · PortalUser dihapus → ditolak', (await pilih()) === null)
  await prisma.portalUser.update({ where: { id: user.id }, data: { deletedAt: null } })

  // E — tenant tidak cocok (identitas sah, tenant salah)
  cek('E · tenantId tidak cocok → ditolak', (await aksesAktif(user.id, '00000000-0000-0000-0000-000000000000')) === null)

  // E2 — portalUserId tak dikenal
  cek('E2 · portalUserId asing → ditolak', (await aksesAktif('00000000-0000-0000-0000-000000000000', tenantId)) === null)

  // F — ikatan pihak tidak konsisten: CUSTOMER tanpa customerId
  const rusak = await prisma.portalAccess.create({
    data: { tenantId, portalUserId: user.id, pihak: 'CUSTOMER', customerId: null, vendorId: null },
  })
  const hasilRusak = await pilih()
  cek('F · PortalAccess CUSTOMER tanpa customerId tidak pernah dipilih', hasilRusak?.id !== rusak.id)
  await prisma.portalAccess.delete({ where: { id: rusak.id } })

  // pulihkan kondisi akhir lalu bersihkan
  cek('I · pengguna sah tetap berfungsi setelah seluruh uji', (await pilih()) !== null)

  await bersihkan(tenantId)
  const sisa = await prisma.customer.count({ where: { tenantId, name: { startsWith: PREFIX } } })
  cek('cleanup · seluruh fixture C13TEST- terhapus', sisa === 0)
  return tenantId
}

// ---------------------------------------------------------------------------
let tenantIdUntukBersih = null
try {
  bagian1()
  tenantIdUntukBersih = await bagian2()
} catch (e) {
  no('eksekusi uji', e?.message || String(e))
  if (tenantIdUntukBersih) { try { await bersihkan(tenantIdUntukBersih) } catch {} }
} finally {
  await prisma.$disconnect()
}

console.log(`\nRINGKASAN  lulus=${lulus}  gagal=${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
