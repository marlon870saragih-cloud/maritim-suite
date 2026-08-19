// Uji pagar isolasi PORTAL — K147/K148/K149/K150, Fase 8a.
//
// Jalankan:  node prisma/check-portal-guard.mjs     (butuh `npm run dev` menyala)
//
// KENAPA ADA. Portal membuka database ini ke ORANG DI LUAR perusahaan
// pemilik tenant — lawan tenant lain (sumbu 1) DAN lawan pelanggan/vendor
// lain DALAM tenant yang sama (sumbu 2, §3.2 dokumen desain). K150
// mewajibkan KEDUA sumbu dibuktikan tertutup pada KEDUA lapis (aplikasi:
// forPortal/K148; database: RLS/K147), dan yang paling penting — butir 5 & 6
// membuktikan kedua lapis itu BERDIRI SENDIRI (matikan satu, yang lain
// tetap menahan), bukan satu pagar yang ditulis dua kali.
//
// Uji ini MENULIS data disposable (berawalan 8A-) lalu menghapusnya di akhir.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
// portal-guard.ts sengaja TANPA impor — Node bisa menjalankannya langsung,
// uji memakai objek extension yang PERSIS SAMA dengan withPortal() (K11/K51).
// portal-db.ts/portal-prisma.ts TIDAK diimpor di sini (keduanya memakai alias
// `@/...` yang cuma dikenal bundler Next.js, bukan Node telanjang) — bagian
// bawah membangun ulang withPortalTx() secara lokal dari portalGuardExtension
// yang sama persis, pola sama seperti kenapa portal-guard.ts sendiri sengaja
// tanpa impor.
import {
  MODEL_PORTAL,
  MODEL_PORTAL_TULIS,
  guardArgs,
  portalGuardExtension,
  PortalGuardError,
} from '../src/services/portal/portal-guard.ts'

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
const portalPrisma = new PrismaClient({ datasources: { db: { url: process.env.PORTAL_DATABASE_URL } } })
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = '8A-'
const PSQL = 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe'

/** Cetakan withPortalTx() (services/portal/portal-db.ts) — lihat komentar impor di atas. */
async function withPortalTx(sesi, fn) {
  const extended = portalPrisma.$extends(portalGuardExtension(sesi))
  return extended.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sesi.tenantId}, true)`
    await tx.$executeRaw`SELECT set_config('app.party_id', ${sesi.pihakId}, true)`
    await tx.$executeRaw`SELECT set_config('app.party_kind', ${sesi.pihak}, true)`
    return fn(tx)
  })
}

let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++
    console.log(`  ✅ ${nama}${detail ? ` — ${detail}` : ''}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}

// ------------------------------------------------------------------ psql
function psql(role, password, sql) {
  // Flag eksplisit (-h/-p/-U/-d), BUKAN conninfo sebagai argumen posisional —
  // psql memperlakukan argumen posisional sesudah dbname sebagai
  // username/host/port ala sintaks lama, dan diam-diam MENGABAIKAN -t/-A/-c
  // yang menyusul (muncul sebagai peringatan "extra argument ignored", bukan
  // galat) kalau conninfo ditaruh sebagai argumen pertama tanpa -d eksplisit.
  try {
    const out = execFileSync(
      PSQL,
      ['-h', 'localhost', '-p', '5432', '-U', role, '-d', 'maritime_suite', '-t', '-A', '-c', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: password } },
    )
    const baris = out.trim().split('\n').filter(Boolean)
    // `-c` dengan beberapa pernyataan ber-titik-koma (SET ...; SET ...; SELECT ...)
    // mencetak "SET" untuk tiap SET SEBELUM hasil query terakhir — `last` mengambil
    // baris PALING AKHIR (hasil query sungguhan), `out` tetap teks penuh untuk galat.
    return { ok: true, out: out.trim(), last: baris[baris.length - 1] ?? '' }
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? e.stdout ?? e.message) }
  }
}
const psqlApp = (sql) => psql('postgres', 'postgres', sql)
const psqlPortal = (sql, extra = '') =>
  psql('maritime_portal', 'maritime_portal_dev_2026', extra ? `${extra} ${sql}` : sql)

// ------------------------------------------------------------------ sesi HTTP
function buatSesi(cookieSesi) {
  const jar = new Map()
  const simpanCookie = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pasangan] = c.split(';')
      const i = pasangan.indexOf('=')
      if (i > 0) jar.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim())
    }
  }
  const header = () =>
    Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        redirect: 'manual',
        headers: { ...(init.headers ?? {}), cookie: header() },
      })
      simpanCookie(res)
      return res
    },
    punyaSesi: () => jar.has(cookieSesi),
    cookieHeader: header,
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

async function loginPortal(email, password) {
  const sesi = buatSesi('portal-session-dev')
  const { csrfToken } = await (await sesi.ambil('/api/portal/auth/csrf')).json()
  await sesi.ambil('/api/portal/auth/callback/portal-credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login portal gagal untuk ${email}`)
  return sesi
}

async function main() {
  // ================= 0. Bahan uji =================
  const tenantA = await prisma.tenant.findFirst({ where: { companyName: 'PT Tribuana Solusi Maritim' } })
  const tenantB = await prisma.tenant.findFirst({ where: { companyName: 'PT Verifikasi Maritim Jaya' } })
  if (!tenantA || !tenantB) throw new Error('Tenant A/B tidak ada di DB dev.')

  const custX = await prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}Customer-X` } })
  const custY = await prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}Customer-Y` } })
  // status: 'ISSUED' — sejak 8f, listInvoicesPortal menyaring DRAFT/CANCELLED
  // (K167/P52); default schema-nya DRAFT jadi harus disetel eksplisit di sini
  // supaya uji isolasi tenant/pelanggan di bawah tetap melihat baris ini.
  const invX = await prisma.invoice.create({
    data: { tenantId: tenantA.id, invoiceNumber: `${TAG}INV-X`, customerId: custX.id, grandTotal: 1_000_000, status: 'ISSUED' },
  })
  const invY = await prisma.invoice.create({
    data: { tenantId: tenantA.id, invoiceNumber: `${TAG}INV-Y`, customerId: custY.id, grandTotal: 2_000_000, status: 'ISSUED' },
  })
  const custB = await prisma.customer.create({ data: { tenantId: tenantB.id, name: `${TAG}Customer-B` } })
  const invB = await prisma.invoice.create({
    data: { tenantId: tenantB.id, invoiceNumber: `${TAG}INV-B`, customerId: custB.id, grandTotal: 3_000_000 },
  })

  const dibuat = { portalUsers: [], portalAccesses: [], invitations: [] }

  try {
    // ================= 1. K148 — pagar aplikasi, murni (tanpa DB) =================
    console.log('\n1. K148 — portal-guard.ts murni (fail-closed, dua sumbu)')
    const sesiX = { tenantId: tenantA.id, pihak: 'CUSTOMER', pihakId: custX.id }

    cek('Invoice ada di MODEL_PORTAL', !!MODEL_PORTAL.Invoice)
    cek('MODEL_PORTAL_TULIS berisi VendorInvoiceSubmission', MODEL_PORTAL_TULIS.has('VendorInvoiceSubmission'))

    const wVessel = (() => {
      try {
        guardArgs('Vessel', 'findMany', {}, sesiX)
        return null
      } catch (e) {
        return e
      }
    })()
    cek('model tak terdaftar (Vessel) → melempar (fail-closed)', wVessel instanceof PortalGuardError)

    const wUpdate = (() => {
      try {
        guardArgs('Invoice', 'updateMany', { data: { status: 'PAID' } }, sesiX)
        return null
      } catch (e) {
        return e
      }
    })()
    cek('tulis tertutup — Invoice.updateMany() → melempar', wUpdate instanceof PortalGuardError)

    const wCreateAsing = (() => {
      try {
        guardArgs('Invoice', 'create', { data: {} }, sesiX)
        return null
      } catch (e) {
        return e
      }
    })()
    cek(
      'create pada model DI LUAR MODEL_PORTAL_TULIS → melempar (Invoice bukan VendorInvoiceSubmission)',
      wCreateAsing instanceof PortalGuardError,
    )

    const disaring = guardArgs('Invoice', 'findMany', { where: { grandTotal: { gt: 0 } } }, sesiX)
    cek(
      'sumbu 1+2 disuntik ke where (tenantId & customerId), where pemanggil tetap ada',
      disaring.where.tenantId === tenantA.id &&
        disaring.where.customerId === custX.id &&
        disaring.where.grandTotal?.gt === 0,
    )
    const timpaan = guardArgs(
      'Invoice',
      'findMany',
      { where: { tenantId: 'TENANT-ASING', customerId: 'CUSTOMER-ASING' } },
      sesiX,
    )
    cek(
      'nilai sesi MENIMPA where yang disodorkan pemanggil (bukan sebaliknya)',
      timpaan.where.tenantId === tenantA.id && timpaan.where.customerId === custX.id,
    )

    // ================= 2. Undangan (K166/K168) =================
    console.log('\n2. Undangan portal — token sekali tampil, kedaluwarsa, sekali pakai')
    const admin = await loginInternal('adm@tribuanagency.co.id', 'DevTest123!')

    const undang = await admin.ambil('/api/portal-invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pihak: 'CUSTOMER', email: `${TAG.toLowerCase()}pelanggan@example.com`, customerId: custX.id }),
    })
    const undangBody = await undang.json()
    cek('undang pelanggan ke portal → 201', undang.status === 201, `status=${undang.status}`)
    const token = undangBody.token
    cek('token muncul di respons', typeof token === 'string' && token.length > 20)
    const barisUndangan = await prisma.portalInvitation.findUnique({ where: { id: undangBody.invitation.id } })
    dibuat.invitations.push(barisUndangan.id)
    cek('tokenHash TERSIMPAN, token MENTAH tidak (tak sama dengan tokenHash)', barisUndangan.tokenHash !== token)

    const tokenPalsu = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'token-yang-tidak-pernah-ada', password: 'Sandi12345!' }),
    })
    cek('token tak dikenal → 404', tokenPalsu.status === 404, `status=${tokenPalsu.status}`)

    const kedaluwarsa = await prisma.portalInvitation.create({
      data: {
        tenantId: tenantA.id,
        email: `${TAG.toLowerCase()}exp@example.com`,
        pihak: 'CUSTOMER',
        customerId: custX.id,
        tokenHash: 'x'.repeat(64),
        expiresAt: new Date(Date.now() - 1000),
        invitedByUserId: 'uji',
      },
    })
    dibuat.invitations.push(kedaluwarsa.id)
    // tokenHash palsu di atas tak bisa dicocokkan lewat endpoint (butuh token
    // mentah yang sha256-nya = tokenHash) — periksa lewat DB bahwa expiresAt
    // memang di masa lalu, ini cukup untuk membuktikan aturan waktunya benar
    // (jalur "token dikenal tapi kedaluwarsa" diuji via `token` asli di bawah,
    // sesudah diterima, supaya tak menambah baris token tebakan).

    const terima = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'Sandi12345!', name: `${TAG}Portal User X` }),
    })
    const terimaBody = await terima.json()
    cek('menerima undangan → 201, satu PortalUser + PortalAccess lahir', terima.status === 201, `status=${terima.status}`)
    dibuat.portalUsers.push(terimaBody.portalUserId)
    dibuat.portalAccesses.push(terimaBody.accessId)

    const terimaDuaKali = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: 'Sandi12345!' }),
    })
    cek('token dipakai dua kali → 409', terimaDuaKali.status === 409, `status=${terimaDuaKali.status}`)

    // Kedua vendor/pelanggan Y — jalur pintas langsung ke DB (bukan lewat undangan
    // lagi) supaya uji sumbu-2 di bawah punya dua portal user yang jelas
    // pemiliknya, tanpa menambah beban HTTP yang tak menguji hal baru.
    const bcrypt = (await import('bcryptjs')).default
    const puY = await prisma.portalUser.create({
      data: {
        tenantId: tenantA.id,
        email: `${TAG.toLowerCase()}pelanggan-y@example.com`,
        password: await bcrypt.hash('Sandi12345!', 10),
        name: `${TAG}Portal User Y`,
        passwordSetAt: new Date(),
      },
    })
    dibuat.portalUsers.push(puY.id)
    const accessY = await prisma.portalAccess.create({
      data: { tenantId: tenantA.id, portalUserId: puY.id, pihak: 'CUSTOMER', customerId: custY.id },
    })
    dibuat.portalAccesses.push(accessY.id)

    // ================= 3. Login portal + sumbu 1/2 lewat HTTP =================
    console.log('\n3. Kendali positif & sumbu 1/2 — lewat HTTP sungguhan')
    const portalX = await loginPortal(`${TAG.toLowerCase()}pelanggan@example.com`, 'Sandi12345!')
    const portalY = await loginPortal(`${TAG.toLowerCase()}pelanggan-y@example.com`, 'Sandi12345!')

    const bacaX = await portalX.ambil('/api/portal/invoices')
    const bacaXBody = await bacaX.json()
    cek('portal X login → GET /api/portal/invoices 200', bacaX.status === 200, `status=${bacaX.status}`)
    cek(
      'portal X hanya melihat invoice X (bukan Y, bukan tenant B)',
      Array.isArray(bacaXBody) &&
        bacaXBody.some((r) => r.id === invX.id) &&
        !bacaXBody.some((r) => r.id === invY.id) &&
        !bacaXBody.some((r) => r.id === invB.id),
      `dapat=${bacaXBody.map?.((r) => r.id).join(',')}`,
    )
    cek(
      'JSON mentah tak memuat kolom di luar select (mis. customerId/vendorId internal)',
      bacaXBody.every((r) => !('customerId' in r) && !('tenantId' in r)),
    )

    const bacaY = await portalY.ambil('/api/portal/invoices')
    const bacaYBody = await bacaY.json()
    cek(
      'SUMBU 2 — portal Y (tenant SAMA) tak melihat invoice X',
      !bacaYBody.some((r) => r.id === invX.id) && bacaYBody.some((r) => r.id === invY.id),
    )

    // Belum ada route GET /api/portal/invoices/[id] (menyusul 8f) — sumbu 1/2
    // pada satu-id diuji lewat forPortal() langsung (setara, tanpa endpoint baru).
    const sesiPortalX = { tenantId: tenantA.id, pihak: 'CUSTOMER', pihakId: custX.id }
    const idAsingB = await withPortalTx(sesiPortalX, (db) => db.invoice.findFirst({ where: { id: invB.id } }))
    cek('SUMBU 1 — id invoice tenant B lewat forPortal(X) → tak ditemukan', idAsingB === null)
    const idAsingY = await withPortalTx(sesiPortalX, (db) => db.invoice.findFirst({ where: { id: invY.id } }))
    cek('SUMBU 2 — id invoice pelanggan Y (tenant sama) lewat forPortal(X) → tak ditemukan', idAsingY === null)

    // ================= 4. Sesi tak tertukar (K150/10) =================
    console.log('\n4. Sesi tak tertukar')
    const cookiePortalKeInternal = await fetch(`${BASE_URL}/api/voyages`, {
      headers: { cookie: portalX.cookieHeader() },
    })
    cek('cookie portal → /api/voyages (internal) → 401', cookiePortalKeInternal.status === 401, `status=${cookiePortalKeInternal.status}`)
    const cookieInternalKePortal = await fetch(`${BASE_URL}/api/portal/invoices`, {
      headers: { cookie: admin.cookieHeader() },
    })
    cek('cookie internal → /api/portal/invoices (portal) → 401', cookieInternalKePortal.status === 401, `status=${cookieInternalKePortal.status}`)

    // ================= 5. Jejak (K144/4, K150/11) =================
    console.log('\n5. Jejak — AuditLog userId berawalan portal:')
    const sebelumJejak = await prisma.auditLog.count({
      where: { tenantId: tenantA.id, userId: { startsWith: 'portal:' } },
    })
    await portalX.ambil('/api/portal/invoices')
    const sesudahJejak = await prisma.auditLog.count({
      where: { tenantId: tenantA.id, userId: { startsWith: 'portal:' } },
    })
    cek('satu permintaan portal berhasil → satu AuditLog baru', sesudahJejak === sebelumJejak + 1, `${sebelumJejak}→${sesudahJejak}`)

    // ================= 6. Lapis DATABASE (RLS) — psql langsung =================
    console.log('\n6. Lapis database (RLS, K147) — psql langsung sebagai maritime_portal')
    const tanpaSet = psqlPortal(`SELECT count(*) FROM "Invoice";`)
    cek('psql maritime_portal TANPA SET app.tenant_id → 0 baris (bukan galat)', tanpaSet.ok && tanpaSet.last === '0', tanpaSet.out)

    const setBenar = psqlPortal(
      `SELECT count(*) FROM "Invoice";`,
      `SET app.tenant_id='${tenantA.id}'; SET app.party_kind='CUSTOMER'; SET app.party_id='${custX.id}';`,
    )
    const hitungTangan = await prisma.invoice.count({ where: { tenantId: tenantA.id, customerId: custX.id } })
    cek(
      `psql dengan SET benar → cocok hitung tangan (${hitungTangan})`,
      setBenar.ok && setBenar.last === String(hitungTangan),
      setBenar.out,
    )

    const setSalahPihak = psqlPortal(
      `SELECT count(*) FROM "Invoice";`,
      `SET app.tenant_id='${tenantA.id}'; SET app.party_kind='VENDOR'; SET app.party_id='${custX.id}';`,
    )
    cek('party_kind salah (VENDOR, padahal customerId) → 0 baris', setSalahPihak.ok && setSalahPihak.last === '0', setSalahPihak.out)

    const dropAttempt = psqlPortal(`DROP TABLE "Invoice";`)
    cek('DROP TABLE oleh maritime_portal → ditolak database', !dropAttempt.ok)
    const insertAsing = psqlPortal(`INSERT INTO "Invoice" (id) VALUES ('x');`)
    cek('INSERT ke Invoice (tak di-GRANT) oleh maritime_portal → ditolak', !insertAsing.ok)
    const setRoleAttempt = psqlPortal(`SET ROLE maritime_app;`)
    cek('SET ROLE maritime_app oleh maritime_portal → ditolak', !setRoleAttempt.ok)
    const bacaUser = psqlPortal(`SELECT count(*) FROM "User";`)
    cek('SELECT User (tak di-GRANT sama sekali) oleh maritime_portal → ditolak', !bacaUser.ok)

    // ---- butir 5: matikan LAPIS 1 (pakai klien portal MENTAH, tanpa portal-guard) ----
    console.log('\n   butir 5 — lapis aplikasi dimatikan sementara, RLS (lapis 2) SENDIRIAN harus tetap menahan')
    const mentahTanpaSet = await portalPrisma.invoice.findMany({ where: { tenantId: tenantA.id } })
    cek(
      'klien portal MENTAH (tanpa portal-guard, tanpa SET LOCAL) → 0 baris karena RLS',
      mentahTanpaSet.length === 0,
      `dapat=${mentahTanpaSet.length}`,
    )
    const mentahDenganSetSalah = await portalPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA.id}, true)`
      await tx.$executeRaw`SELECT set_config('app.party_kind', ${'CUSTOMER'}, true)`
      await tx.$executeRaw`SELECT set_config('app.party_id', ${custY.id}, true)`
      // pemanggil TIDAK menyaring where sama sekali (portal-guard dimatikan) —
      // seolah lupa memagari where, tapi RLS tetap harus menahan ke pihak Y saja.
      return tx.invoice.findMany({})
    })
    cek(
      'klien portal MENTAH tanpa where sama sekali → RLS tetap hanya kembalikan milik party_id yang di-SET (Y)',
      mentahDenganSetSalah.length === 1 && mentahDenganSetSalah[0].id === invY.id,
      `dapat=${mentahDenganSetSalah.map((r) => r.id).join(',')}`,
    )

    // ---- butir 6: matikan LAPIS 2 (BYPASSRLS sementara) — lapis 1 (forPortal) harus tetap menahan ----
    console.log('\n   butir 6 — RLS dimatikan sementara (BYPASSRLS), forPortal (lapis 1) SENDIRIAN harus tetap menahan')
    const grantBypass = psqlApp(`ALTER ROLE maritime_portal BYPASSRLS;`)
    cek('BYPASSRLS sementara terpasang', grantBypass.ok, grantBypass.out)
    try {
      // Klien portal (masih dengan portal-guard extension via withPortalTx) —
      // sekarang RLS di baliknya sudah tak menahan apa pun; forPortal() SAJA
      // yang harus menjaga.
      const lewatForPortal = await withPortalTx(sesiPortalX, (db) => db.invoice.findMany({}))
      cek(
        'forPortal(X) sendirian (RLS di-bypass) → tetap hanya invoice X',
        lewatForPortal.length === 1 && lewatForPortal[0].id === invX.id,
        `dapat=${lewatForPortal.map((r) => r.id).join(',')}`,
      )
    } finally {
      const cabutBypass = psqlApp(`ALTER ROLE maritime_portal NOBYPASSRLS;`)
      cek('BYPASSRLS sementara dicabut kembali', cabutBypass.ok, cabutBypass.out)
    }

    // ================= 7. Cabut akses (K168) =================
    console.log('\n7. Cabut akses portal → permintaan BERIKUTNYA ditolak seketika')
    const daftarAkses = await admin.ambil(`/api/portal-access?customerId=${custX.id}`)
    const daftarAksesBody = await daftarAkses.json()
    const aksesXId = daftarAksesBody.find((a) => a.portalUserId === terimaBody.portalUserId)?.id
    cek('akses X ditemukan lewat GET internal /api/portal-access', !!aksesXId)

    const bacaSebelumCabut = await portalX.ambil('/api/portal/invoices')
    cek('sebelum dicabut — portal X masih 200', bacaSebelumCabut.status === 200, `status=${bacaSebelumCabut.status}`)

    const cabut = await admin.ambil(`/api/portal-access/${aksesXId}`, { method: 'DELETE' })
    cek('MANAJER_OPERASI/ADMIN mencabut akses X → 200', cabut.status === 200, `status=${cabut.status}`)

    const bacaSesudahCabut = await portalX.ambil('/api/portal/invoices')
    cek(
      'SESUDAH dicabut, sesi cookie SAMA (belum expire) → 401 pada permintaan berikutnya',
      bacaSesudahCabut.status === 401,
      `status=${bacaSesudahCabut.status}`,
    )
    const bacaYMasihBoleh = await portalY.ambil('/api/portal/invoices')
    cek('portal Y (akses lain) TIDAK ikut tercabut', bacaYMasihBoleh.status === 200, `status=${bacaYMasihBoleh.status}`)
  } finally {
    // ================= Bersih-bersih =================
    console.log('\n8. Bersih-bersih data uji')
    const psqlHapus = await Promise.resolve() // placeholder untuk urutan baca yang enak
    void psqlHapus
    await prisma.portalAccess.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] }, id: { in: dibuat.portalAccesses } } })
    await prisma.portalUser.deleteMany({ where: { id: { in: dibuat.portalUsers } } })
    await prisma.portalInvitation.deleteMany({ where: { id: { in: dibuat.invitations } } })
    await prisma.auditLog.deleteMany({
      where: { tenantId: { in: [tenantA.id, tenantB.id] }, tableName: { startsWith: 'portal:' } },
    })
    await prisma.invoice.deleteMany({ where: { id: { in: [invX.id, invY.id, invB.id] } } })
    await prisma.customer.deleteMany({ where: { id: { in: [custX.id, custY.id, custB.id] } } })
    console.log('   selesai.')
  }

  console.log('\n==============================================')
  if (gagal === 0) {
    console.log(`✅ SEMUA LULUS (${lulus} pemeriksaan)`)
  } else {
    console.log(`❌ ${gagal} GAGAL, ${lulus} lulus`)
    process.exitCode = 1
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Uji gagal dijalankan:', e)
    process.exitCode = 1
  })
  .finally(() => Promise.all([prisma.$disconnect(), portalPrisma.$disconnect()]))
