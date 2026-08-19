// Uji Checklist Go-Live: kunci login & pembatas laju — K185.
//
// Jalankan:  node prisma/check-rate-limit.mjs   (butuh `npm run dev` menyala)
//
// Urutan:
//   1. Login internal — N gagal beruntun mengunci identifier itu; PASSWORD
//      BENAR sekalipun tetap ditolak selagi terkunci; respons kegagalan
//      identik (tak membocorkan status akun); login BERHASIL tak menulis
//      SecurityEvent (jendela tak pernah "terisi" oleh lalu lintas sah).
//   2. Login portal — kunci TERPISAH dari internal (kind berbeda); percobaan
//      di satu pintu tak pernah mengunci pintu lain.
//   3. Jendela pulih otomatis: baris lampau dihapus SEBELUM dihitung —
//      dibuktikan dengan memundurkan timestamp lalu mengonfirmasi terbuka
//      lagi, TANPA menunggu jendela sungguhan lewat.
//   4. Pendaftaran — batas per IP per jam; IP lain tak ikut terblokir.
//   5. Panggilan AI — jaring pengaman penyalahgunaan (bukan kuota K156);
//      diperiksa lewat rute /api/ai/predict sungguhan lebih dulu, sisa
//      jendela disimulasikan (menghindari puluhan panggilan AI asli).

import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
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
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = '8RL-'
const SANDI = 'UjiLajuLogin123!'

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

function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [p] = c.split(';')
      const i = p.indexOf('=')
      if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim())
    }
  }
  const header = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: header() } })
      simpanCookie(res)
      return res
    },
    punyaSesiInternal: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
    punyaSesiPortal: () => jar.has('portal-session-dev') || jar.has('__Host-portal-session'),
  }
}

/**
 * Coba login internal SEKALI (tanpa melempar). Dengan `json:'true'`, NextAuth
 * membalas **401 tanpa redirect** untuk SEMUA kegagalan `authorize()` (null,
 * apa pun sebabnya) — diverifikasi langsung sebelum menulis uji ini. Jadi
 * yang dibandingkan untuk butir "tak membocorkan status akun" adalah status
 * HTTP + body mentah, bukan lokasi redirect (yang tak pernah ada di mode ini).
 */
async function cobaLoginInternal(email, password, ipPalsu) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  const res = await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(ipPalsu ? { 'x-forwarded-for': ipPalsu } : {}),
    },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  const body = await res.text().catch(() => '')
  return { sesi, status: res.status, body, punyaSesi: sesi.punyaSesiInternal() }
}

async function cobaLoginPortal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/portal/auth/csrf')).json()
  const res = await sesi.ambil('/api/portal/auth/callback/portal-credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return { sesi, lokasi: res.headers.get('location') ?? '', punyaSesi: sesi.punyaSesiPortal() }
}

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

const EMAIL_STAF = `${TAG.toLowerCase()}staf@uji.local`
const EMAIL_PORTAL = `${TAG.toLowerCase()}pelanggan@uji.local`
const IP_A = '203.0.113.10'
const IP_B = '203.0.113.20'

async function main() {
  let tenant
  let staf
  try {
    // ======================= 0. Persiapan =======================
    console.log('\n0. Menyiapkan tenant + akun internal & portal')
    const hash = await bcrypt.hash(SANDI, 10)

    tenant = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Laju`, plan: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
        users: { create: { name: `${TAG}Staf`, email: EMAIL_STAF, password: hash, role: 'ADMIN' } },
      },
    })
    staf = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: EMAIL_STAF } })
    const customer = await prisma.customer.create({ data: { tenantId: tenant.id, name: `${TAG}Pelanggan` } })
    const portalHash = await bcrypt.hash(SANDI, 10)
    await prisma.portalUser.create({
      data: { tenantId: tenant.id, email: EMAIL_PORTAL, name: 'Portal Uji', password: portalHash, isActive: true },
    })
    const portalAccess = await prisma.portalUser.findFirst({ where: { tenantId: tenant.id, email: EMAIL_PORTAL } })
    await prisma.portalAccess.create({
      data: { tenantId: tenant.id, portalUserId: portalAccess.id, pihak: 'CUSTOMER', customerId: customer.id },
    })

    // ============ 1. Kunci login internal ============
    console.log('\n1. Login internal — kunci sesudah percobaan gagal beruntun (butir inti)')
    const sebelumBerhasil = await cobaLoginInternal(EMAIL_STAF, SANDI)
    cek('sebelum ada percobaan gagal, password benar → berhasil', sebelumBerhasil.punyaSesi)
    const jumlahAwal = await prisma.securityEvent.count({ where: { kind: 'LOGIN_FAIL_INTERNAL', identifier: EMAIL_STAF.toLowerCase() } })
    cek('login BERHASIL tak menulis SecurityEvent (jendela tak terisi lalu lintas sah)', jumlahAwal === 0, `${jumlahAwal} baris`)

    let hasilGagalTerakhir = null
    for (let i = 0; i < 5; i++) {
      hasilGagalTerakhir = await cobaLoginInternal(EMAIL_STAF, 'password-salah-sengaja')
    }
    cek('5× password salah beruntun → tak satu pun berhasil', !hasilGagalTerakhir.punyaSesi)
    const jumlahSesudahGagal = await prisma.securityEvent.count({ where: { kind: 'LOGIN_FAIL_INTERNAL', identifier: EMAIL_STAF.toLowerCase() } })
    cek('5 baris SecurityEvent tercatat', jumlahSesudahGagal === 5, `${jumlahSesudahGagal} baris`)

    const dgnPasswordBenarSelagiTerkunci = await cobaLoginInternal(EMAIL_STAF, SANDI)
    cek('🔑 PASSWORD BENAR pun ditolak selagi terkunci', !dgnPasswordBenarSelagiTerkunci.punyaSesi)
    cek(
      'respons "terkunci" IDENTIK dengan respons "password salah" (status+body, tak membocorkan status akun)',
      dgnPasswordBenarSelagiTerkunci.status === hasilGagalTerakhir.status &&
        dgnPasswordBenarSelagiTerkunci.body === hasilGagalTerakhir.body,
      `${dgnPasswordBenarSelagiTerkunci.status}/${JSON.stringify(dgnPasswordBenarSelagiTerkunci.body)} vs ${hasilGagalTerakhir.status}/${JSON.stringify(hasilGagalTerakhir.body)}`,
    )
    const jumlahSelagiTerkunci = await prisma.securityEvent.count({ where: { kind: 'LOGIN_FAIL_INTERNAL', identifier: EMAIL_STAF.toLowerCase() } })
    cek('percobaan SELAGI terkunci tak menambah baris (ditolak sebelum sampai ke perbandingan sandi)', jumlahSelagiTerkunci === 5, `${jumlahSelagiTerkunci} baris`)

    // ============ 2. Kunci portal TERPISAH ============
    console.log('\n2. Login portal — kunci terpisah dari internal (butir 2)')
    const portalSebelum = await cobaLoginPortal(EMAIL_PORTAL, SANDI)
    cek('portal: password benar (belum ada percobaan gagal) → berhasil', portalSebelum.punyaSesi)
    let portalGagalTerakhir = null
    for (let i = 0; i < 5; i++) portalGagalTerakhir = await cobaLoginPortal(EMAIL_PORTAL, 'salah')
    cek('portal: 5× gagal beruntun → tak berhasil', !portalGagalTerakhir.punyaSesi)
    const portalTerkunci = await cobaLoginPortal(EMAIL_PORTAL, SANDI)
    cek('🔑 portal: password benar pun ditolak selagi terkunci', !portalTerkunci.punyaSesi)

    // Kunci PORTAL tak memengaruhi INTERNAL — email berbeda orang, tapi buktikan
    // KIND-nya juga terpisah dengan email yang SAMA di kedua sisi bila memungkinkan.
    const cekTerpisah = await prisma.securityEvent.count({ where: { kind: 'LOGIN_FAIL_PORTAL', identifier: EMAIL_STAF.toLowerCase() } })
    cek('kind LOGIN_FAIL_PORTAL tak ikut terisi oleh percobaan email staf internal', cekTerpisah === 0)

    // ============ 3. Jendela pulih tanpa menunggu sungguhan ============
    console.log('\n3. Baris lampau dihapus sebelum dihitung → jendela pulih (butir 3)')
    await prisma.securityEvent.updateMany({
      where: { kind: 'LOGIN_FAIL_INTERNAL', identifier: EMAIL_STAF.toLowerCase() },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) }, // 20 menit lampau > jendela 15 menit
    })
    const pulih = await cobaLoginInternal(EMAIL_STAF, SANDI)
    cek('🔑 sesudah 20 menit (dimundurkan), password benar → berhasil lagi', pulih.punyaSesi)
    const sisaBaris = await prisma.securityEvent.count({ where: { kind: 'LOGIN_FAIL_INTERNAL', identifier: EMAIL_STAF.toLowerCase() } })
    cek('baris lampau ikut TERHAPUS oleh pemeriksaan (tabel tak menumpuk)', sisaBaris === 0, `${sisaBaris} baris tersisa`)

    // ============ 4. Batas pendaftaran per IP ============
    console.log('\n4. Batas pendaftaran per IP per jam (butir 4)')
    let terakhirA
    for (let i = 0; i < 5; i++) {
      terakhirA = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_A },
        body: JSON.stringify({ companyName: `${TAG}Daftar${i}`, name: 'XX', email: `${TAG.toLowerCase()}daftar${i}-${Date.now()}@uji.local`, password: 'sandisandisandi' }),
      })
    }
    cek('5 pendaftaran pertama dari IP yang sama → diterima (201)', terakhirA.status === 201, `status ${terakhirA.status}`)
    const ke6A = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_A },
      body: JSON.stringify({ companyName: `${TAG}Daftar6`, name: 'XX', email: `${TAG.toLowerCase()}daftar6-${Date.now()}@uji.local`, password: 'sandisandisandi' }),
    })
    cek('🔑 pendaftaran KE-6 dari IP yang sama → 429', ke6A.status === 429, `status ${ke6A.status}`)
    const pesan6A = (await ke6A.json().catch(() => ({})))?.error ?? ''
    cek('pesan penolakan menyebut sebabnya', /banyak|percobaan|jam/i.test(pesan6A), pesan6A)

    const dariIpLain = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_B },
      body: JSON.stringify({ companyName: `${TAG}DaftarB`, name: 'XX', email: `${TAG.toLowerCase()}daftarb-${Date.now()}@uji.local`, password: 'sandisandisandi' }),
    })
    cek('🔑 IP LAIN tak ikut terblokir', dariIpLain.status === 201, `status ${dariIpLain.status}`)

    // ============ 5. Jaring pengaman AI ============
    console.log('\n5. Jaring pengaman penyalahgunaan pada panggilan AI (butir 5)')
    const sesiStaf = buatSesi()
    {
      const { csrfToken } = await (await sesiStaf.ambil('/api/auth/csrf')).json()
      await sesiStaf.ambil('/api/auth/callback/credentials', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, email: EMAIL_STAF, password: SANDI, json: 'true' }).toString(),
      })
    }
    cek('sesi staf untuk uji AI berhasil masuk', sesiStaf.punyaSesiInternal())

    const kapal = await prisma.vessel.create({ data: { tenantId: tenant.id, name: `${TAG}MV AI`, gt: 1000 } })
    await prisma.currency.create({ data: { tenantId: tenant.id, code: 'IDR', decimals: 2 } })
    const voyageRes = await jsonPost(sesiStaf, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    const { voyage } = await voyageRes.json()
    const disb = await prisma.disbursement.create({
      data: { tenantId: tenant.id, voyageId: voyage.id, kind: 'EPDA', docNumber: `${TAG}EPDA-0001`, status: 'DRAFT', baseCurrency: 'IDR' },
    })
    await prisma.disbursement.update({ where: { id: disb.id }, data: { rootId: disb.id } })

    const predictPertama = await jsonPost(sesiStaf, '/api/ai/predict', { disbursementId: disb.id })
    cek('panggilan predict PERTAMA (sesungguhnya) → 200', predictPertama.status === 200, `status ${predictPertama.status}`)
    const jumlahAiSesudahSatu = await prisma.securityEvent.count({ where: { kind: 'AI_CALL', identifier: staf.id.toLowerCase() } })
    cek('satu baris AI_CALL tercatat', jumlahAiSesudahSatu === 1, `${jumlahAiSesudahSatu} baris`)

    // Sisa 29 panggilan disimulasikan langsung ke DB (menghindari 29 panggilan
    // AI sungguhan yang lambat & mahal) — yang diuji adalah MEKANISME
    // pembatasnya, bukan mengulang uji AI_PREDICT_USED yang sudah dibuktikan
    // §17/8j. Baris ke-30 membuat total = ambang (30) → panggilan ke-31 harus
    // ditolak SEBELUM mengeksekusi logika AI apa pun.
    await prisma.securityEvent.createMany({
      data: Array.from({ length: 29 }, () => ({ kind: 'AI_CALL', identifier: staf.id.toLowerCase() })),
    })
    const predictKe31 = await jsonPost(sesiStaf, '/api/ai/predict', { disbursementId: disb.id })
    cek('🔑 panggilan predict ke-31 dalam jendela → 429', predictKe31.status === 429, `status ${predictKe31.status}`)
    const pesan31 = (await predictKe31.json().catch(() => ({})))?.error?.message ?? ''
    cek('pesan 429 menyebut sebabnya', /banyak|panggilan|prediksi/i.test(pesan31), pesan31)

    // `ctx.system` (skrip/job internal) TIDAK diuji lewat HTTP di sini — tak
    // ada rute yang memanggil prediksi lewat systemContext untuk dipukul.
    // Cabangnya satu baris (`if (ctx.system) return`) di kepala
    // pastikanBelumMelebihiLajuAi(), diverifikasi lewat tsc + tinjauan kode,
    // pola sama AI_VESSEL_IMPORT_USED yang ditandai terbuka di §17/8j.
  } finally {
    console.log('\n  bersih-bersih data uji…')
    if (tenant) await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => undefined)
    await prisma.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } }).catch(() => undefined)
    // SecurityEvent TIDAK berelasi FK ke Tenant/User (sengaja, lihat catatan
    // skema) — cascade Tenant.delete tak menyentuhnya. Dibersihkan eksplisit
    // lewat SETIAP identifier yang dipakai uji ini (email, userId, IP palsu).
    const identifierUji = [staf?.id, EMAIL_STAF.toLowerCase(), EMAIL_PORTAL.toLowerCase(), IP_A, IP_B].filter(Boolean)
    await prisma.securityEvent.deleteMany({ where: { identifier: { in: identifierUji } } }).catch(() => undefined)
    const sisaTenant = await prisma.tenant.count({ where: { companyName: { startsWith: TAG } } })
    const sisaEvent = await prisma.securityEvent.count({ where: { identifier: { in: identifierUji } } })
    cek('nol data uji tersisa', sisaTenant === 0 && sisaEvent === 0, `tenant=${sisaTenant} event=${sisaEvent}`)
  }

  console.log('\n' + '='.repeat(50))
  console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
  console.log('='.repeat(50))
  if (gagal > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
