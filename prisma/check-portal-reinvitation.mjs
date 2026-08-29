// Uji undangan-ulang & pemulihan akun portal — C1.4.
//
// Jalankan dari akar proyek (butuh `npm run dev` menyala):
//   node prisma/check-portal-reinvitation.mjs
//
// KENAPA ADA. Sebelum C1.4, menerima undangan menulis `acceptedAt` LEBIH DULU
// dan sendirian, lalu mencari `PortalUser` dengan saringan `deletedAt: null`
// yang TIDAK dikenal kendala unik (tenantId, email). Akibatnya akun yang pernah
// dihapus lembut tak bisa diundang ulang selamanya: penerimaan gagal pada
// kendala itu, tapi undangannya sudah terlanjur tertandai terpakai — dan
// `cancelPortalInvitation()` menolak menghapus undangan yang sudah diterima.
// Token hangus, undangan berikutnya gagal identik. Buntu, bukan galat.
//
// KENAPA LEWAT HTTP. Yang diuji di sini adalah SEMANTIK TRANSAKSI, dan itu
// tidak bisa dibuktikan oleh salinan logika: satu-satunya cara menunjukkan
// `acceptedAt` benar-benar dibatalkan adalah menjalankan jalur kode yang
// sungguhan. `access.service.ts` memakai alias `@/...` yang hanya dikenal
// bundler Next.js (bukan Node telanjang), jadi uji ini memanggilnya lewat
// route-nya sendiri — pola yang sama dipakai check-portal-guard.mjs.
//
// `email.ts` SENGAJA tanpa impor, jadi Node memuatnya langsung: aturan
// kanonikalisasi diuji terhadap fungsi yang SAMA PERSIS dengan yang dipakai
// aplikasi, bukan tiruannya (pola K11/K51, sama seperti portal-guard.ts).
//
// SETIAP nomor uji memakai surel & pihaknya SENDIRI. Itu disengaja: pada
// rancangan sebelumnya uji-uji berbagi satu akun, sehingga satu kegagalan
// merusak prasyarat semua uji sesudahnya dan hasilnya jadi tak terbaca.
//
// SELURUH data yang dibuat berawalan C14TEST- / c14test- dan dihapus di akhir,
// pada jalur sukses, gagal, maupun terlempar. Tidak pernah menyentuh data nyata.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { normalisasiEmailPortal } from '../src/services/portal/email.ts'

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

// ---------------------------------------------------------------------------
// PAGAR: uji ini MENULIS. Ia hanya boleh menyentuh database pengembangan lokal.
// Diperiksa sebelum satu pun koneksi dibuka, dan gagal-tertutup.
// ---------------------------------------------------------------------------
const URL_DB = process.env.DATABASE_URL ?? ''
const inang = (URL_DB.match(/@([^:/?]+)/) ?? [, ''])[1]
if (!['localhost', '127.0.0.1', '::1'].includes(inang)) {
  console.error(`\n  MENOLAK BERJALAN — DATABASE_URL menunjuk inang "${inang}", bukan database lokal.`)
  console.error('  Uji ini membuat & menghapus baris; ia tidak boleh diarahkan ke produksi.\n')
  process.exit(1)
}

const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = 'C14TEST-'
const TAG_EMAIL = 'c14test-'
const SANDI_A = 'SandiAwal123!'
const SANDI_B = 'SandiBaru456!'
const ADMIN = { email: 'adm@tribuanagency.co.id', password: 'DevTest123!' }

let lulus = 0
let gagal = 0
const cek = (nama, kondisi, detail = '') => {
  if (kondisi) {
    lulus++
    console.log(`  PASS  ${nama}${detail ? ` — ${detail}` : ''}`)
  } else {
    gagal++
    console.log(`  FAIL  ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}

// ------------------------------------------------------------------ sesi HTTP
function buatSesi(cookieSesi) {
  const jar = new Map()
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        redirect: 'manual',
        headers: {
          ...(init.headers ?? {}),
          cookie: Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
        },
      })
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pasangan] = c.split(';')
        const i = pasangan.indexOf('=')
        if (i > 0) jar.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim())
      }
      return res
    },
    punyaSesi: () => jar.has(cookieSesi),
  }
}

async function loginInternal(email, password) {
  const sesi = buatSesi('next-auth.session-token')
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login internal gagal untuk ${email}`)
  return sesi
}

/** true bila kredensial diterima pintu portal. Tidak pernah mencetak sandi. */
async function bisaLoginPortal(email, password) {
  const sesi = buatSesi('portal-session-dev')
  const { csrfToken } = await (await sesi.ambil('/api/portal/auth/csrf')).json()
  await sesi.ambil('/api/portal/auth/callback/portal-credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return sesi.punyaSesi()
}

// ------------------------------------------------------------------ API portal
async function undang(sesi, isi) {
  const res = await sesi.ambil('/api/portal-invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(isi),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function terima(token, isi) {
  const res = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...isi }),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function undangDapatToken(sesi, isi) {
  const u = await undang(sesi, isi)
  if (u.status !== 201 || !u.body?.token) {
    throw new Error(`undangan tak terduga ditolak (${u.status}): ${JSON.stringify(u.body)}`)
  }
  return u.body.token
}

const ambilUser = (email) => prisma.portalUser.findFirst({ where: { email } })
const ambilAkses = (portalUserId) =>
  prisma.portalAccess.findMany({ where: { portalUserId }, orderBy: { createdAt: 'asc' } })
const invTerakhirBelumDipakai = (email) =>
  prisma.portalInvitation.findFirst({ where: { email, acceptedAt: null }, orderBy: { createdAt: 'desc' } })

/**
 * Salinan klausa `where` cariAksesPortalAktif() (services/portal/context.ts).
 * Yang menjamin salinan ini tidak menyimpang dari sumbernya adalah BAGIAN 1
 * prisma/check-portal-revocation.mjs, yang membaca berkas sumbernya langsung.
 */
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

// ------------------------------------------------------------------ bersih-bersih
async function bersihkan() {
  await prisma.portalAccess.deleteMany({ where: { portalUser: { email: { startsWith: TAG_EMAIL } } } })
  await prisma.portalUser.deleteMany({ where: { email: { startsWith: TAG_EMAIL } } })
  await prisma.portalInvitation.deleteMany({ where: { email: { startsWith: TAG_EMAIL } } })
  await prisma.portalAccess.deleteMany({ where: { customer: { name: { startsWith: TAG } } } })
  await prisma.portalAccess.deleteMany({ where: { vendor: { name: { startsWith: TAG } } } })
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.vendor.deleteMany({ where: { name: { startsWith: TAG } } })
}

// ---------------------------------------------------------------------------
async function main() {
  await bersihkan() // sisa jalannya yang gagal sebelumnya

  const tenantA = await prisma.tenant.findFirst({ where: { companyName: 'PT Tribuana Solusi Maritim' } })
  const tenantB = await prisma.tenant.findFirst({ where: { companyName: 'PT Verifikasi Maritim Jaya' } })
  if (!tenantA || !tenantB) throw new Error('Tenant dev A/B tidak ada.')
  const admin = await loginInternal(ADMIN.email, ADMIN.password)

  let n = 0
  const cust = (label) =>
    prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}C${++n}-${label}`, isActive: true } })
  const vend = (label) =>
    prisma.vendor.create({ data: { tenantId: tenantA.id, name: `${TAG}V${++n}-${label}`, isActive: true } })

  /** Undang + terima sekali jalan; mengembalikan baris PortalUser-nya. */
  async function siapkanAkun(email, pihakIsi, sandi, nama) {
    const token = await undangDapatToken(admin, { email, ...pihakIsi })
    const r = await terima(token, { password: sandi, name: nama })
    if (r.status !== 201) throw new Error(`persiapan akun gagal (${r.status}): ${JSON.stringify(r.body)}`)
    return ambilUser(normalisasiEmailPortal(email))
  }

  // ========================================================== 1
  console.log('\nTEST 1 — surel baru dikanonikkan')
  {
    const c = await cust('t1')
    const mentah = `  ${TAG_EMAIL}T1.User@Example.COM  `
    const kanonik = normalisasiEmailPortal(mentah)
    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email: mentah, customerId: c.id })
    const inv = await prisma.portalInvitation.findFirst({ where: { email: kanonik } })
    cek('undangan menyimpan surel kanonik', inv?.email === kanonik, inv?.email)
    cek('bentuk mentah tidak tersimpan', !(await prisma.portalInvitation.findFirst({ where: { email: mentah } })))

    const t = await terima(token, { password: SANDI_A, name: `${TAG}T1` })
    cek('penerimaan berhasil', t.status === 201, `status=${t.status}`)
    const u = await ambilUser(kanonik)
    cek('satu PortalUser lahir dengan surel kanonik', !!u && u.email === kanonik)
    cek('satu PortalAccess lahir', (await ambilAkses(u.id)).length === 1)
    cek('bisa masuk portal', await bisaLoginPortal(kanonik, SANDI_A))
  }

  // ========================================================== 2
  console.log('\nTEST 2 — identitas aktif + akses hidup yang sama → ditolak SEBELUM token')
  {
    const c = await cust('t2')
    const email = `${TAG_EMAIL}t2@example.com`
    await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: c.id }, SANDI_A, `${TAG}T2`)
    const sebelum = await prisma.portalInvitation.count({ where: { email } })

    const u = await undang(admin, { pihak: 'CUSTOMER', email, customerId: c.id })
    cek('ditolak dengan CONFLICT', u.status === 409, `status=${u.status}`)
    cek('pesan tanpa id teknis', !/[0-9a-z]{20,}/.test(u.body?.error?.message ?? ''), u.body?.error?.message)
    cek('tidak ada token diterbitkan', !u.body?.token)
    cek('jumlah undangan tak bertambah', (await prisma.portalInvitation.count({ where: { email } })) === sebelum)
  }

  // ========================================================== 3
  console.log('\nTEST 3 — PortalUser terhapus lembut diundang ulang')
  {
    const c = await cust('t3')
    const email = `${TAG_EMAIL}t3@example.com`
    const sebelum = await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: c.id }, SANDI_A, `${TAG}T3`)
    // Persis keadaan produksi 28 Ags: akses dicabut, lalu identitasnya dihapus lembut.
    await prisma.portalAccess.updateMany({ where: { portalUserId: sebelum.id }, data: { revokedAt: new Date() } })
    await prisma.portalUser.update({ where: { id: sebelum.id }, data: { deletedAt: new Date(), isActive: false } })

    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: c.id })
    const t = await terima(token, { password: SANDI_B })
    cek('penerimaan berhasil', t.status === 201, `status=${t.status}`)

    const sesudah = await ambilUser(email)
    cek('id PortalUser TIDAK berubah', sesudah.id === sebelum.id)
    cek('isActive dipulihkan', sesudah.isActive === true)
    cek('deletedAt dibersihkan', sesudah.deletedAt === null)
    cek('passwordSetAt diperbarui', +sesudah.passwordSetAt > +sebelum.passwordSetAt)
    cek('hash kata sandi berganti', sesudah.password !== sebelum.password)
    cek('sandi LAMA ditolak', !(await bcrypt.compare(SANDI_A, sesudah.password)))
    cek('sandi BARU diterima', await bcrypt.compare(SANDI_B, sesudah.password))
    cek('bisa masuk dengan sandi baru', await bisaLoginPortal(email, SANDI_B))
    cek('TIDAK bisa masuk dengan sandi lama', !(await bisaLoginPortal(email, SANDI_A)))
    cek('tidak ada PortalUser kembar', (await prisma.portalUser.count({ where: { email } })) === 1)
  }

  // ========================================================== 4
  console.log('\nTEST 4 — PortalUser nonaktif (deletedAt tetap null) diundang ulang')
  {
    const v = await vend('t4')
    const email = `${TAG_EMAIL}t4@example.com`
    const sebelum = await siapkanAkun(email, { pihak: 'VENDOR', vendorId: v.id }, SANDI_A, `${TAG}T4`)
    await prisma.portalAccess.updateMany({ where: { portalUserId: sebelum.id }, data: { revokedAt: new Date() } })
    await prisma.portalUser.update({ where: { id: sebelum.id }, data: { isActive: false } })

    const token = await undangDapatToken(admin, { pihak: 'VENDOR', email, vendorId: v.id })
    const r = await terima(token, { password: SANDI_B })
    cek('penerimaan berhasil', r.status === 201, `status=${r.status}`)
    const sesudah = await ambilUser(email)
    cek('baris yang SAMA dipulihkan', sesudah.id === sebelum.id)
    cek('isActive kembali true', sesudah.isActive === true)
    cek('deletedAt tetap null', sesudah.deletedAt === null)
    cek('sandi baru dipasang', await bcrypt.compare(SANDI_B, sesudah.password))
    cek('sandi lama tidak berlaku', !(await bcrypt.compare(SANDI_A, sesudah.password)))
  }

  // ========================================================== 5
  console.log('\nTEST 5 — identitas AKTIF diberi akses ke pihak TAMBAHAN')
  {
    const c1 = await cust('t5a')
    const c2 = await cust('t5b')
    const email = `${TAG_EMAIL}t5@example.com`
    const sebelum = await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: c1.id }, SANDI_A, `${TAG}T5`)

    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: c2.id })
    const t = await terima(token, { password: SANDI_B })
    cek('penerimaan berhasil', t.status === 201, `status=${t.status}`)

    const sesudah = await ambilUser(email)
    cek('id PortalUser dipakai ulang', sesudah.id === sebelum.id)
    cek('hash kata sandi TIDAK berubah', sesudah.password === sebelum.password)
    cek('passwordSetAt TIDAK digeser', +sesudah.passwordSetAt === +sebelum.passwordSetAt)
    cek('sandi ASLI tetap berlaku', await bcrypt.compare(SANDI_A, sesudah.password))
    cek('sandi yang baru diketik TIDAK dipasang', !(await bcrypt.compare(SANDI_B, sesudah.password)))
    cek('PortalAccess kedua dibuat', (await ambilAkses(sesudah.id)).length === 2)
  }

  // ========================================================== 6
  console.log('\nTEST 6 — PortalAccess yang sudah DICABUT diundang ulang')
  {
    const c = await cust('t6')
    const email = `${TAG_EMAIL}t6@example.com`
    const u = await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: c.id }, SANDI_A, `${TAG}T6`)
    const target = (await ambilAkses(u.id))[0]
    await prisma.portalAccess.update({ where: { id: target.id }, data: { revokedAt: new Date() } })

    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: c.id })
    const t = await terima(token, { password: SANDI_B })
    cek('penerimaan berhasil', t.status === 201, `status=${t.status}`)

    const sesudah = await ambilAkses(u.id)
    const hidup = sesudah.find((a) => a.id === target.id)
    cek('id PortalAccess dipakai ulang', t.body?.accessId === target.id)
    cek('revokedAt dibersihkan', hidup?.revokedAt === null)
    cek('createdAt asli dipertahankan', +hidup.createdAt === +target.createdAt)
    cek('TIDAK ada baris akses kembar', sesudah.length === 1, `n=${sesudah.length}`)
  }

  // ========================================================== 7 & 8
  console.log('\nTEST 7/8 — duplikat beda huruf besar-kecil & spasi')
  {
    const c1 = await cust('t7a')
    const c2 = await cust('t7b')
    const c3 = await cust('t7c')
    const dasar = `${TAG_EMAIL}t7@example.com`
    const asli = await siapkanAkun(dasar, { pihak: 'CUSTOMER', customerId: c1.id }, SANDI_A, `${TAG}T7`)

    const t2 = await undangDapatToken(admin, { pihak: 'CUSTOMER', email: `${TAG_EMAIL}T7@Example.COM`, customerId: c2.id })
    const r2 = await terima(t2, { password: SANDI_B })
    cek('7 · penerimaan berhasil', r2.status === 201, `status=${r2.status}`)
    cek('7 · identitas yang SAMA dipakai', r2.body?.portalUserId === asli.id)
    cek('7 · tidak ada PortalUser kedua', (await prisma.portalUser.count({ where: { email: dasar } })) === 1)

    const t3 = await undangDapatToken(admin, { pihak: 'CUSTOMER', email: `   ${dasar}   `, customerId: c3.id })
    const r3 = await terima(t3, { password: SANDI_B })
    cek('8 · penerimaan berhasil', r3.status === 201, `status=${r3.status}`)
    cek('8 · identitas yang SAMA dipakai', r3.body?.portalUserId === asli.id)
    cek('8 · total tetap satu identitas', (await prisma.portalUser.count({ where: { email: { startsWith: `${TAG_EMAIL}t7` } } })) === 1)
    cek('8 · tiga akses terpisah terbentuk', (await ambilAkses(asli.id)).length === 3)
  }

  // ========================================================== 9
  console.log('\nTEST 9 — kegagalan SESUDAH acceptedAt → seluruhnya dibatalkan (PF-1)')
  {
    // Kegagalan NYATA, bukan suntikan ke kode produksi: pihak yang dituju
    // undangan dihapus keras SESUDAH undangan terbit. `PortalInvitation`
    // menyimpan customerId sebagai teks tanpa foreign key, jadi undangannya
    // selamat — tapi `PortalAccess.create` di dalam transaksi kena
    // PortalAccess_customerId_fkey dan melempar.
    //
    // Identitasnya sengaja TERHAPUS LEMBUT: kalau transaksinya benar, bukan
    // hanya `acceptedAt` yang kembali NULL — pemulihan PortalUser-nya ikut
    // batal. Satu uji membuktikan keduanya.
    const cTetap = await cust('t9-tetap')
    const cHilang = await cust('t9-hilang')
    const email = `${TAG_EMAIL}t9@example.com`
    const u = await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: cTetap.id }, SANDI_A, `${TAG}T9`)
    const sebelum = await ambilUser(email)

    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: cHilang.id })
    const inv = await invTerakhirBelumDipakai(email)
    cek('acceptedAt SEBELUM = NULL', inv.acceptedAt === null)

    await prisma.portalUser.update({ where: { id: u.id }, data: { deletedAt: new Date(), isActive: false } })
    await prisma.customer.delete({ where: { id: cHilang.id } })

    const r = await terima(token, { password: SANDI_B })
    cek('penerimaan gagal (kegagalan di dalam transaksi)', r.status >= 400, `status=${r.status}`)

    const invSesudah = await prisma.portalInvitation.findFirst({ where: { id: inv.id } })
    const uSesudah = await ambilUser(email)
    cek('acceptedAt SESUDAH = NULL (dibatalkan)', invSesudah.acceptedAt === null)
    cek('PortalUser TETAP terhapus lembut (pemulihan ikut batal)', uSesudah.deletedAt !== null)
    cek('isActive TETAP false', uSesudah.isActive === false)
    cek('kata sandi TIDAK ikut tertimpa', uSesudah.password === sebelum.password)
    cek('tidak ada PortalAccess baru', (await ambilAkses(u.id)).length === 1)

    // Inti PF-1: tokennya masih utuh dan masih bisa ditebus.
    const c2 = await cust('t9-pengganti')
    const token2 = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: c2.id })
    const r2 = await terima(token2, { password: SANDI_B })
    cek('undangan berikutnya berhasil (tidak buntu)', r2.status === 201, `status=${r2.status}`)
    const uAkhir = await ambilUser(email)
    cek('akun akhirnya benar-benar pulih', uAkhir.deletedAt === null && uAkhir.isActive === true)
    cek('id identitas tetap sama sepanjang uji', uAkhir.id === sebelum.id)
  }

  // ========================================================== 10
  console.log('\nTEST 10 — dua penerimaan bersamaan atas token yang sama')
  {
    const c = await cust('t10')
    const email = `${TAG_EMAIL}t10@example.com`
    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: c.id })
    const [a, b] = await Promise.all([
      terima(token, { password: SANDI_A, name: `${TAG}T10` }),
      terima(token, { password: SANDI_A, name: `${TAG}T10` }),
    ])
    const status = [a.status, b.status].sort()
    cek('tepat satu berhasil', status.filter((s) => s === 201).length === 1, `status=${status.join(',')}`)
    cek('tepat satu kalah bersih (409)', status.filter((s) => s === 409).length === 1, `status=${status.join(',')}`)
    const u = await ambilUser(email)
    cek('hanya satu PortalUser', (await prisma.portalUser.count({ where: { email } })) === 1)
    cek('hanya satu PortalAccess', (await ambilAkses(u.id)).length === 1)
  }

  // ========================================================== 11
  console.log('\nTEST 11 — jalur bertahan: identitas aktif + akses hidup saat token ditebus')
  {
    const c1 = await cust('t11a')
    const c2 = await cust('t11b')
    const email = `${TAG_EMAIL}t11@example.com`
    const u = await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: c1.id }, SANDI_A, `${TAG}T11`)

    const token = await undangDapatToken(admin, { pihak: 'CUSTOMER', email, customerId: c2.id })
    const inv = await invTerakhirBelumDipakai(email)
    // Akses ke c2 diberikan lewat jalur lain SESUDAH undangan terbit — pagar
    // waktu-undang sudah lewat, jadi cabang bertahanlah yang harus menahan.
    await prisma.portalAccess.create({
      data: { tenantId: tenantA.id, portalUserId: u.id, pihak: 'CUSTOMER', customerId: c2.id },
    })
    const jumlahSebelum = (await ambilAkses(u.id)).length

    const r = await terima(token, { password: SANDI_B })
    cek('konflik bersih, bukan 500', r.status === 409, `status=${r.status}`)
    cek('pesan tidak menyebut kendala database', !/P2002|constraint|unique/i.test(r.body?.error?.message ?? ''))
    cek('acceptedAt tetap NULL', (await prisma.portalInvitation.findFirst({ where: { id: inv.id } })).acceptedAt === null)
    cek('tidak ada baris akses kembar', (await ambilAkses(u.id)).length === jumlahSebelum, `n=${jumlahSebelum}`)
    cek('sandi identitas aktif tidak tersentuh', (await ambilUser(email)).password === u.password)
  }

  // ========================================================== 12
  console.log('\nTEST 12 — surel sama, tenant berbeda')
  {
    const c = await cust('t12')
    const email = `${TAG_EMAIL}t12@example.com`
    const diA = await siapkanAkun(email, { pihak: 'CUSTOMER', customerId: c.id }, SANDI_A, `${TAG}T12A`)
    // Tenant B tak punya sesi staf di uji ini — barisnya dibuat langsung, karena
    // yang dibuktikan di sini ATURAN IDENTITAS-nya (unik PER tenant, K166),
    // bukan jalur undangannya.
    const diB = await prisma.portalUser.create({
      data: { tenantId: tenantB.id, email, password: 'x', name: `${TAG}T12B`, isActive: true },
    })
    cek('dua baris terpisah diizinkan', diA.id !== diB.id)
    cek('masing-masing di tenantnya sendiri', diA.tenantId === tenantA.id && diB.tenantId === tenantB.id)
    cek('total dua baris untuk surel ini', (await prisma.portalUser.count({ where: { email } })) === 2)
    cek('identitas tenant A tidak terlihat sebagai akses tenant B', (await aksesAktif(diA.id, tenantB.id)) === null)
  }

  // ========================================================== 13
  console.log('\nTEST 13 — otorisasi akun yang sudah dipulihkan (kunci C1.3)')
  {
    const email = `${TAG_EMAIL}t3@example.com` // akun yang dipulihkan di TEST 3
    const u = await ambilUser(email)
    cek('tenant + pihak yang benar → diizinkan', (await aksesAktif(u.id, tenantA.id)) !== null)
    cek('tenant lain → ditolak', (await aksesAktif(u.id, tenantB.id)) === null)

    const hidup = await aksesAktif(u.id, tenantA.id)
    const asing = await cust('t13-asing')
    cek('akses yang dipilih tidak menunjuk pihak asing', hidup.customerId !== asing.id)

    // C1.3 tetap berlaku pada baris yang dipulihkan.
    await prisma.portalUser.update({ where: { id: u.id }, data: { isActive: false } })
    cek('identitas dinonaktifkan → ditolak (C1.3 R-2)', (await aksesAktif(u.id, tenantA.id)) === null)
    await prisma.portalUser.update({ where: { id: u.id }, data: { isActive: true, deletedAt: new Date() } })
    cek('identitas dihapus lembut → ditolak', (await aksesAktif(u.id, tenantA.id)) === null)
    await prisma.portalUser.update({ where: { id: u.id }, data: { deletedAt: null } })
    cek('dinyalakan lagi → diizinkan', (await aksesAktif(u.id, tenantA.id)) !== null)

    await prisma.customer.update({ where: { id: hidup.customerId }, data: { deletedAt: new Date(), isActive: false } })
    cek('pihak yang diwakili dihapus → ditolak (C1.3 R-3)', (await aksesAktif(u.id, tenantA.id)) === null)
  }

  console.log(`\nRINGKASAN  lulus=${lulus}  gagal=${gagal}`)
}

// ---------------------------------------------------------------------------
let kode = 0
try {
  await main()
  kode = gagal === 0 ? 0 : 1
} catch (e) {
  console.error(`\n  EKSEKUSI GAGAL — ${e?.message ?? String(e)}`)
  kode = 1
} finally {
  try {
    await bersihkan()
    const sisaU = await prisma.portalUser.count({ where: { email: { startsWith: TAG_EMAIL } } })
    const sisaC = await prisma.customer.count({ where: { name: { startsWith: TAG } } })
    const sisaV = await prisma.vendor.count({ where: { name: { startsWith: TAG } } })
    const sisaI = await prisma.portalInvitation.count({ where: { email: { startsWith: TAG_EMAIL } } })
    console.log(`cleanup   sisa fixture — portalUser=${sisaU} customer=${sisaC} vendor=${sisaV} invitation=${sisaI}`)
    if (sisaU || sisaC || sisaV || sisaI) kode = 1
  } catch (e) {
    console.error(`  CLEANUP GAGAL — ${e?.message ?? String(e)}`)
    kode = 1
  }
  await prisma.$disconnect()
}
process.exit(kode)
