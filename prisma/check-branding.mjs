// Uji Merek/White-label — K180-K182, Fase 8i (sisi Sonnet: skema+UI+kontras+
// slug+logo — TIDAK termasuk migrate-logo-to-attachment.mjs, K181, ditunda ke
// giliran Opus).
//
// Jalankan:  node prisma/check-branding.mjs      (butuh `npm run dev` menyala)
//
// Urutan:
//   1. Tanpa sesi → 401. Bukan ADMIN → 403.
//   2. Kontras: bahkan titik terburuk (abu-abu #757575) tetap dinyatakan aman
//      (bukti matematis K180 — lihat catatan di services/saas/contrast.ts);
//      warna jelas aman (biru gelap) → amanAA true, peringatan null juga.
//   3. Slug: terlalu pendek/karakter tak sah/kata terlarang → 400; dua
//      tenant bentrok slug yang sama → 409; slug sah → tersimpan.
//   4. Merek publik ber-slug (`/api/portal/branding/[slug]`) → 200 data
//      benar; slug tak ada → 404 rapi.
//   5. Unggah logo → 201, byte cocok; unggah KEDUA → logo lama di-soft-
//      delete, Tenant menunjuk yang baru; publik & sesi otentik keduanya
//      menyajikan byte yang sama.
//   6. Sesi portal (pelanggan) sungguhan → /api/portal/profile.merek cocok
//      dengan yang diatur ADMIN.

import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = '8I-'
const SANDI = 'Uji8iMerek!2026'

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

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pasangan] = c.split(';')
      const i = pasangan.indexOf('=')
      if (i > 0) jar.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim())
    }
  }
  const header = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: header() } })
      simpanCookie(res)
      return res
    },
  }
}

async function loginInternal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return sesi
}

async function loginPortal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/portal/auth/csrf')).json()
  await sesi.ambil('/api/portal/auth/callback/portal-credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return sesi
}

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const jsonPatch = (sesi, path, body) =>
  sesi.ambil(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function unggahLogo(sesi, isi, namaBerkas = 'logo.png') {
  const form = new FormData()
  form.set('file', new Blob([isi], { type: 'image/png' }), namaBerkas)
  return sesi.ambil('/api/settings/branding/logo', { method: 'POST', body: form })
}

// PNG 1x1 sungguhan (header valid) — cukup untuk lolos periksaBerkas (ekstensi+mime).
const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000155bfaba50000000049454e44ae426082',
  'hex',
)
const PNG_1PX_B = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da636460606000000005000159d43fc70000000049454e44ae426082',
  'hex',
)

async function main() {
  let tenantA, tenantB

  try {
    const sandiHash = await bcrypt.hash(SANDI, 10)
    const EMAIL_ADMIN = 'branding-8i-admin@uji.local'
    const EMAIL_OPERATOR = 'branding-8i-operator@uji.local'
    const EMAIL_PORTAL_X = 'branding-8i-pelanggan@uji.local'

    tenantA = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Merek A`, plan: 'TRIAL', modulesEnabled: ['finance'],
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
        users: {
          create: [
            { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: sandiHash, role: 'ADMIN' },
            { name: `${TAG}Operator`, email: EMAIL_OPERATOR, password: sandiHash, role: 'OPERATOR' },
          ],
        },
      },
    })
    tenantB = await prisma.tenant.create({
      data: { companyName: `${TAG}Uji Merek B`, plan: 'TRIAL', modulesEnabled: ['finance'], trialEndsAt: new Date(Date.now() + 7 * 86_400_000) },
    })
    const emailAdminB = 'branding-8i-admin-b@uji.local'
    await prisma.user.create({ data: { tenantId: tenantB.id, name: `${TAG}Admin B`, email: emailAdminB, password: sandiHash, role: 'ADMIN' } })

    const sesiAdmin = await loginInternal(EMAIL_ADMIN, SANDI)
    const sesiOperator = await loginInternal(EMAIL_OPERATOR, SANDI)
    const sesiAdminB = await loginInternal(emailAdminB, SANDI)

    // ================= 1. Sesi & peran =================
    console.log('\n1. Tanpa sesi → 401; bukan ADMIN → 403')
    const tanpaSesi = await fetch(`${BASE_URL}/api/settings/branding`)
    cek('GET tanpa sesi → 401', tanpaSesi.status === 401, `status ${tanpaSesi.status}`)

    const opGet = await sesiOperator.ambil('/api/settings/branding')
    cek('GET oleh OPERATOR → 403', opGet.status === 403, `status ${opGet.status}`)
    const opPatch = await jsonPatch(sesiOperator, '/api/settings/branding', { brandPrimaryColor: '#0059BB' })
    cek('PATCH oleh OPERATOR → 403', opPatch.status === 403, `status ${opPatch.status}`)

    const awal = await (await sesiAdmin.ambil('/api/settings/branding')).json()
    cek('ADMIN GET awal → belum ada warna/slug/logo', !awal.brandPrimaryColor && !awal.portalSlug && !awal.logoTersedia)

    // ================= 2. Kontras =================
    // Catatan: "kuning cerah" BUKAN contoh warna gagal — hitam di atas kuning
    // rasionya ~19.6:1 (sangat aman, ini justru CONTOH pemilihan otomatis
    // bekerja benar). Dibuktikan numerik (lihat catatan di contrast.ts): dengan
    // kandidat putih/hitam murni, rasio TERBAIK dari keduanya tidak pernah
    // jatuh di bawah ~4.58:1 untuk warna latar apa pun — titik terburuknya ada
    // di abu-abu #757575 (g≈117.4). Jadi `amanAA` SELALU true & `peringatan`
    // SELALU null pada praktiknya; itu bukan cacat, itu buktinya K180
    // terpenuhi. Yang diuji di sini karena itu BUKAN "warna gagal → peringatan
    // muncul" (skenario yang mustahil terjadi lewat hex apa pun), melainkan
    // "bahkan di titik terburuk sekalipun, sistem tetap melaporkan aman".
    console.log('\n2. Pemeriksa kontras — bahkan titik terburuk (abu-abu) tetap dinyatakan aman')
    const rendah = await jsonPatch(sesiAdmin, '/api/settings/branding', { brandPrimaryColor: '#757575' })
    const jRendah = await rendah.json()
    cek('warna abu-abu titik-terburuk diterima (tak ditolak, K180)', rendah.status === 200, `status ${rendah.status}`)
    cek('kontras.amanAA = true bahkan di titik terburuk (bukti matematis K180)', jRendah.kontras?.amanAA === true, `rasio ${jRendah.kontras?.rasio}`)
    cek('kontras.tekstAman terisi (sistem selalu memilih yang terbaik)', jRendah.kontras?.tekstAman === '#FFFFFF' || jRendah.kontras?.tekstAman === '#000000', jRendah.kontras?.tekstAman)
    cek('kontras.peringatan null karena aman', jRendah.kontras?.peringatan === null)

    const aman = await jsonPatch(sesiAdmin, '/api/settings/branding', { brandPrimaryColor: '#0059BB' })
    const jAman = await aman.json()
    cek('warna biru gelap → amanAA true', jAman.kontras?.amanAA === true, `rasio ${jAman.kontras?.rasio}`)
    cek('peringatan null saat aman', jAman.kontras?.peringatan === null)
    cek('tekstAman putih untuk biru gelap', jAman.kontras?.tekstAman === '#FFFFFF')

    const hexSalah = await jsonPatch(sesiAdmin, '/api/settings/branding', { brandPrimaryColor: 'bukan-hex' })
    cek('hex tak sah → 400', hexSalah.status === 400, `status ${hexSalah.status}`)

    // ================= 3. Slug =================
    console.log('\n3. Alamat portal (slug) — validasi & keunikan lintas-tenant')
    const slugPendek = await jsonPatch(sesiAdmin, '/api/settings/branding', { portalSlug: 'ab' })
    cek('slug terlalu pendek → 400', slugPendek.status === 400, `status ${slugPendek.status}`)

    const slugKarakter = await jsonPatch(sesiAdmin, '/api/settings/branding', { portalSlug: 'ada spasi!' })
    cek('slug berkarakter tak sah → 400', slugKarakter.status === 400, `status ${slugKarakter.status}`)

    const slugTerlarang = await jsonPatch(sesiAdmin, '/api/settings/branding', { portalSlug: 'login' })
    cek('slug "login" (bentrok rute) → 400', slugTerlarang.status === 400, `status ${slugTerlarang.status}`)

    const slugA = `${TAG.toLowerCase()}tenant-a`
    const slugSah = await jsonPatch(sesiAdmin, '/api/settings/branding', { portalSlug: slugA })
    cek('slug sah → 200, tersimpan', slugSah.status === 200, `status ${slugSah.status}`)
    const jSlugSah = await slugSah.json()
    cek('portalSlug tersimpan sesuai kiriman', jSlugSah.portalSlug === slugA, jSlugSah.portalSlug)

    const bentrok = await jsonPatch(sesiAdminB, '/api/settings/branding', { portalSlug: slugA })
    cek('tenant LAIN pakai slug yang sama → 409', bentrok.status === 409, `status ${bentrok.status}`)

    // ================= 4. Merek publik ber-slug =================
    console.log('\n4. Merek publik (/api/portal/branding/[slug]) — sebelum login')
    const publikRes = await fetch(`${BASE_URL}/api/portal/branding/${slugA}`)
    const jPublik = await publikRes.json()
    cek('GET publik slug sah → 200', publikRes.status === 200, `status ${publikRes.status}`)
    cek('companyName cocok', jPublik.companyName === `${TAG}Uji Merek A`, jPublik.companyName)
    cek('brandPrimaryColor cocok', jPublik.brandPrimaryColor === '#0059BB', jPublik.brandPrimaryColor)
    cek('logoViaAttachment masih false (belum unggah)', jPublik.logoViaAttachment === false)

    const publik404 = await fetch(`${BASE_URL}/api/portal/branding/${TAG.toLowerCase()}tak-ada-xyz`)
    cek('slug tak ada → 404 rapi', publik404.status === 404, `status ${publik404.status}`)

    // Halaman login ber-slug (server component) — 200 utk slug sah, 404 Next.js utk yang tak ada.
    const halamanLoginSah = await fetch(`${BASE_URL}/portal/${slugA}/login`)
    cek('halaman /portal/<slug>/login sah → 200', halamanLoginSah.status === 200, `status ${halamanLoginSah.status}`)
    const halamanLoginTakAda = await fetch(`${BASE_URL}/portal/${TAG.toLowerCase()}tak-ada-xyz/login`)
    cek('halaman /portal/<slug>/login tak ada → 404', halamanLoginTakAda.status === 404, `status ${halamanLoginTakAda.status}`)

    // ================= 5. Logo =================
    console.log('\n5. Unggah logo — byte cocok, unggahan kedua ganti yang lama (soft-delete)')
    const unggah1 = await unggahLogo(sesiAdmin, PNG_1PX, 'logo1.png')
    const jUnggah1 = await unggah1.json()
    cek('unggah logo pertama → 201', unggah1.status === 201, `status ${unggah1.status}`)
    cek('sha256 cocok', jUnggah1.attachment?.sha256 === sha256(PNG_1PX))

    const setelahUnggah1 = await (await sesiAdmin.ambil('/api/settings/branding')).json()
    cek('logoTersedia = true', setelahUnggah1.logoTersedia === true)
    cek('logoViaAttachment = true', setelahUnggah1.logoViaAttachment === true)

    const previewSendiri = await sesiAdmin.ambil('/api/settings/branding/logo')
    const bufPreview = Buffer.from(await previewSendiri.arrayBuffer())
    cek('pratinjau logo sendiri → 200, byte identik', previewSendiri.status === 200 && sha256(bufPreview) === sha256(PNG_1PX))

    const attSetelah1 = await prisma.tenant.findUnique({ where: { id: tenantA.id }, select: { logoAttachmentId: true } })
    const idLogo1 = attSetelah1.logoAttachmentId

    const publikSetelahLogo = await (await fetch(`${BASE_URL}/api/portal/branding/${slugA}`)).json()
    cek('merek publik: logoViaAttachment true, logoDataUrl null', publikSetelahLogo.logoViaAttachment === true && publikSetelahLogo.logoDataUrl === null)

    const logoPublik = await fetch(`${BASE_URL}/api/portal/branding/${slugA}/logo`)
    const bufLogoPublik = Buffer.from(await logoPublik.arrayBuffer())
    cek('logo publik (sebelum login) → 200, byte identik', logoPublik.status === 200 && sha256(bufLogoPublik) === sha256(PNG_1PX))
    cek('logo publik → Cache-Control public', /public/.test(logoPublik.headers.get('cache-control') ?? ''), logoPublik.headers.get('cache-control'))

    // unggahan kedua — logo lama harus ke-soft-delete
    const unggah2 = await unggahLogo(sesiAdmin, PNG_1PX_B, 'logo2.png')
    cek('unggah logo KEDUA → 201', unggah2.status === 201, `status ${unggah2.status}`)

    const attSetelah2 = await prisma.tenant.findUnique({ where: { id: tenantA.id }, select: { logoAttachmentId: true } })
    cek('logoAttachmentId berubah ke yang baru', attSetelah2.logoAttachmentId !== idLogo1)

    const logoLama = await prisma.attachment.findUnique({ where: { id: idLogo1 }, select: { deletedAt: true } })
    cek('Attachment logo LAMA di-soft-delete (K110)', logoLama?.deletedAt instanceof Date)

    const logoPublikBaru = await fetch(`${BASE_URL}/api/portal/branding/${slugA}/logo`)
    const bufLogoBaru = Buffer.from(await logoPublikBaru.arrayBuffer())
    cek('logo publik sesudah ganti → byte = logo KEDUA', sha256(bufLogoBaru) === sha256(PNG_1PX_B))

    // ================= 6. Sesi portal sungguhan =================
    console.log('\n6. Sesi portal (pelanggan) sungguhan — merek di /api/portal/profile cocok')
    await prisma.currency.create({ data: { tenantId: tenantA.id, code: 'IDR', decimals: 2 } }).catch(() => {})
    const custX = await prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}Pelanggan X` } })
    const inv = await jsonPost(sesiAdmin, '/api/portal-invitations', { pihak: 'CUSTOMER', email: EMAIL_PORTAL_X, customerId: custX.id })
    const { token } = await inv.json()
    const terima = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: SANDI, name: EMAIL_PORTAL_X }),
    })
    cek('undangan pelanggan diterima → 201', terima.status === 201, `status ${terima.status}`)

    const sesiPortalX = await loginPortal(EMAIL_PORTAL_X, SANDI)
    const profil = await (await sesiPortalX.ambil('/api/portal/profile')).json()
    cek('profil.merek.companyName cocok Tenant A', profil.merek?.companyName === `${TAG}Uji Merek A`, profil.merek?.companyName)
    cek('profil.merek.accentColor cocok', profil.merek?.accentColor === '#0059BB', profil.merek?.accentColor)
    cek('profil.merek.logoViaAttachment true', profil.merek?.logoViaAttachment === true)

    const logoSesi = await sesiPortalX.ambil('/api/portal/branding/logo')
    const bufLogoSesi = Buffer.from(await logoSesi.arrayBuffer())
    cek('logo lewat sesi portal AUTENTIK → 200, byte = logo KEDUA', logoSesi.status === 200 && sha256(bufLogoSesi) === sha256(PNG_1PX_B))
    cek('logo lewat sesi portal → Cache-Control private,no-store (K108 tetap berlaku di jalur ini)', /private|no-store/.test(logoSesi.headers.get('cache-control') ?? ''))
  } finally {
    console.log('\n  bersih-bersih data uji…')
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue
      await prisma.portalAccess.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.portalUser.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.portalInvitation.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.attachment.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.customer.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch((e) => {
        console.error(`   ⚠️  gagal membersihkan tenant ${tenant.id}:`, e?.message ?? e)
      })
    }
  }
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
    console.log('⚠️  Ingat: migrate-logo-to-attachment.mjs (K181) BELUM diuji — menunggu giliran Opus.')
    process.exitCode = gagal === 0 ? 0 : 1
  })
