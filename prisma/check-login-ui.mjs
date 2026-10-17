// Uji regresi login staf (F-1/F-3) di peramban nyata (Playwright + Chromium, dari LUAR repo).
//
// F-1: submit native sebelum hidrasi / tanpa JS (klik maupun Enter) tidak boleh menaruh kredensial di URL.
// F-3: UI tidak boleh menyatakan sukses tanpa sesi akun yang sedang masuk (penolakan CSRF next-auth 4.24
//      dikembalikan ok:true tanpa error; providers/callback/sesi gagal; sesi lama akun lain).
// Jalankan TERHADAP server yang BARU dimulai (next dev ATAU next start), tanpa permintaan apa pun ke server
// sebelum skenario L1 — L1 = login pertama dengan profil baru sesudah server mulai, tanpa coba-ulang.
// Uji ini SENGAJA tidak menunggu `networkidle` dan tidak memanaskan server. Hasil login hanya diterima bila BERHASIL
// (sesi akun yang sama + pindah halaman) atau DITOLAK yang jelas (galat, tetap di /login, tombol pulih); hasil
// macet/tanpa hasil/gagal diamati = gagal. L9/L12 memalsukan respons /api/auth/session di PERAMBAN (route Playwright)
// sesudah callback nyata; server, DB, dan callback NextAuth tetap nyata. Kegagalan pembersihan fixture = exit nonzero.
//
//   Server: DATABASE_URL=$U DIRECT_URL=$U NEXTAUTH_URL=http://127.0.0.1:3500 NEXTAUTH_SECRET=<acak> NEXT_TELEMETRY_DISABLED=1 \
//     npx next dev -H 127.0.0.1 -p 3500 > server.out.log 2> server.err.log      (atau: next build && next start …)
//   LOGIN_UI_DB_URL=$U LOGIN_UI_BASE_URL=http://127.0.0.1:3500 LOGIN_UI_SERVER_LOG=server.out.log,server.err.log \
//   LOGIN_UI_PLAYWRIGHT=/jalur/node_modules/playwright-core LOGIN_UI_CHROMIUM=/jalur/chrome node prisma/check-login-ui.mjs
//
// playwright-core SENGAJA bukan dependensi repo; tanpa LOGIN_UI_* atau tanpa playwright-core → DILEWATI (kode 3,
// BUKAN lulus). DB & server WAJIB loopback; tenant sintetis ber-id tetap dihapus di awal dan akhir. Keluaran tidak
// pernah memuat sandi, nilai cookie, token CSRF, atau URL bersandi.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

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
const bagian = (j) => console.log(`\n${j}`)

// ---------------------------------------------------------------- guard
const URL_DB = process.env.LOGIN_UI_DB_URL
const BASE = process.env.LOGIN_UI_BASE_URL
const PW = process.env.LOGIN_UI_PLAYWRIGHT
const LOG = (process.env.LOGIN_UI_SERVER_LOG ?? '').split(',').map((s) => s.trim()).filter(Boolean)
if (!URL_DB || !BASE || !PW) {
  console.log('DILEWATI — LOGIN_UI_DB_URL, LOGIN_UI_BASE_URL, dan LOGIN_UI_PLAYWRIGHT wajib diset (DB & server loopback, playwright-core di luar repo).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['LOGIN_UI_DB_URL', URL_DB], ['LOGIN_UI_BASE_URL', BASE]]) {
  try {
    const u = new URL(v)
    if (!LOOPBACK.includes(u.hostname)) tolak.push(`${n} bukan loopback`)
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push(`${n} memuat parameter host`)
  } catch {
    tolak.push(`${n} tak terurai`)
  }
}
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production di proses uji')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain (ambigu)`)
for (const f of LOG) if (!existsSync(f)) tolak.push('LOGIN_UI_SERVER_LOG menunjuk berkas yang tidak ada')
if (tolak.length) {
  console.log(`❌ DITOLAK (DB/server tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
let chromium
try {
  ;({ chromium } = await import(pathToFileURL(join(PW, 'index.mjs')).href))
} catch {
  console.log('DILEWATI — playwright-core tidak ditemukan di LOGIN_UI_PLAYWRIGHT.')
  process.exit(3)
}
const ASAL = new URL(BASE).origin
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB

const { PrismaClient } = await import('@prisma/client')
const bcrypt = (await import('bcryptjs')).default
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const ID_T = 'loginuitenantaaaaaaa01'
const TAG = 'LOGINUI-'
const SANDI = 'UjiLoginUi!2026' // sandi akun SINTETIS uji (DB loopback sekali pakai)
const EMAIL_A = 'loginui-a@uji.local'
const EMAIL_B = 'loginui-b@uji.local'
const STR = {
  ok: /Berhasil masuk|Signed in\./,
  cred: /Email atau kata sandi salah|Incorrect email or password/,
  sesiId: /sesi tidak dapat dibuat/,
  sesiEn: /session could not be established/,
  jaringan: /Gagal menghubungi server|Could not reach the server/,
}

/** Pesan galat aman untuk keluaran: satu baris, tanpa URL DB. */
const aman = (e) => String(e?.message ?? e).replace(/postgres(?:ql)?:\/\/\S+/gi, '[url-db]').split('\n')[0].slice(0, 160)
/** Langkah pembersihan fixture; setiap langkah dicoba walau langkah lain gagal. */
const LANGKAH_BERSIH = [
  ['hapus SecurityEvent akun uji', () => adm.securityEvent.deleteMany({ where: { identifier: { in: [EMAIL_A, EMAIL_B] } } })],
  ['hapus AuditLog tenant uji', () => adm.auditLog.deleteMany({ where: { tenantId: ID_T } })],
  ['hapus tenant uji beserta user', () => adm.tenant.deleteMany({ where: { id: ID_T } })],
  [
    'verifikasi fixture tersisa = 0',
    async () => {
      const n =
        (await adm.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })) +
        (await adm.tenant.count({ where: { id: ID_T } })) +
        (await adm.securityEvent.count({ where: { identifier: { in: [EMAIL_A, EMAIL_B] } } }))
      if (n) throw new Error(`${n} baris fixture masih ada`)
    },
  ],
]
async function bersihkan() {
  const gagalLangkah = []
  for (const [nama, fn] of LANGKAH_BERSIH) {
    try {
      await fn()
    } catch (e) {
      gagalLangkah.push(`${nama}: ${aman(e)}`)
    }
  }
  return gagalLangkah
}
async function fixture() {
  const sisa = await bersihkan()
  if (sisa.length) throw new Error(`pembersihan awal gagal (${sisa.join(' | ')})`)
  const t = await adm.tenant.create({ data: { id: ID_T, companyName: `${TAG}Tenant`, trialEndsAt: new Date(Date.now() + 30 * 24 * 3_600_000) } })
  const hash = await bcrypt.hash(SANDI, 10)
  for (const [e, n] of [[EMAIL_A, 'A'], [EMAIL_B, 'B']]) {
    await adm.user.create({ data: { tenantId: t.id, email: e, name: `${TAG}${n}`, password: hash, role: 'ADMIN', isActive: true } })
  }
}

// Hitungan dipisah: login berhasil, penolakan alami (L1), penolakan disengaja, sukses tanpa sesi, hasil lain (gagal).
const hitung = { berhasil: 0, ditolakAlami: 0, ditolakDisengaja: 0, suksesTanpaSesi: 0, lainGagal: 0 }
let browser = null

/** Konteks + halaman dengan perekam: URL bersandi, pesan sukses yang PERNAH tampil, POST callback & respons. */
async function buka({ js = true, cookies = [] } = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, locale: 'id-ID', javaScriptEnabled: js })
  if (cookies.length) await ctx.addCookies(cookies.map((c) => ({ url: ASAL, ...c })))
  const p = await ctx.newPage()
  const rek = { urlPw: false, okTampil: false, postLogin: 0, callback: [], sesudahCallback: false }
  const urlBersandi = (u) => {
    try {
      return new URL(u).searchParams.has('password')
    } catch {
      return false
    }
  }
  p.on('request', (r) => {
    if (urlBersandi(r.url())) rek.urlPw = true
    const u = new URL(r.url())
    if (r.method() === 'POST' && u.pathname === '/login') rek.postLogin++
  })
  p.on('framenavigated', (f) => {
    if (f === p.mainFrame() && urlBersandi(f.url())) rek.urlPw = true
  })
  p.on('response', async (res) => {
    if (res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/auth/callback/credentials') {
      rek.sesudahCallback = true
      const j = await res.json().catch(() => null)
      let jalur = '(tanpa url)'
      try {
        const u = new URL(j?.url, ASAL)
        jalur = u.pathname + (u.searchParams.has('csrf') ? '?csrf' : '') + (u.searchParams.has('error') ? '?error' : '')
      } catch {}
      rek.callback.push(`${res.status()} ${jalur}`)
    }
  })
  if (js) {
    await p.exposeFunction('__lgnOk', () => {
      rek.okTampil = true
    })
    await p.addInitScript(() => {
      const lihat = () => {
        if (document.querySelector('.lgn-msg.ok')) window.__lgnOk?.()
      }
      new MutationObserver(lihat).observe(document, { childList: true, subtree: true, attributes: true })
    })
  }
  return { ctx, p, rek }
}
const sesiEmail = async (ctx) => (await ctx.request.get('/api/auth/session').then((r) => r.json()).catch(() => ({})))?.user?.email ?? null
const pesan = (p) => p.locator('.lgn-msg').first().textContent({ timeout: 2000 }).then((x) => (x ?? '').trim()).catch(() => '')
const isi = async (p, email, sandi = SANDI) => {
  await p.fill('#email', email)
  await p.fill('#password', sandi)
}
/**
 * Tunggu komponen siap seperti pengguna (BUKAN networkidle, tanpa permintaan ke server): tombol Masuk aktif DAN
 * tombol mata merespons klik (aria-pressed berubah), lalu dikembalikan. Berlaku sama untuk kode lama (tombol selalu
 * aktif) dan kode baru, sehingga kontrol negatif F-3 diuji sesudah hidrasi.
 */
async function tungguSiap(p) {
  await p.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 120000 })
  const mata = p.locator('button.lgn-toggle')
  for (let i = 0; i < 120; i++) {
    await mata.click()
    await p.waitForTimeout(500)
    if ((await mata.getAttribute('aria-pressed')) === 'true') {
      await mata.click()
      return
    }
  }
  throw new Error('komponen login tidak pernah siap (tombol mata tidak merespons)')
}
/**
 * Amati hasil satu login sampai tuntas. Hasil yang DITERIMA hanya:
 *   BERHASIL — pesan sukses tampil, sesi = akun yang masuk, dan halaman pindah dari /login;
 *   DITOLAK  — tanpa pesan sukses, pesan galat tampil, tetap di /login, tombol Masuk pulih, tanpa sesi akun itu.
 * Lainnya GAGAL: SUKSES_TANPA_SESI, MACET (tombol tak pulih), TANPA_HASIL (tanpa pesan), GAGAL_AMATI, LAIN.
 * `sesiAkunBoleh` = true bila server memang sudah membuat sesi akun itu tetapi UI wajib menolak (verifikasi sesi
 * di peramban sengaja digagalkan/dipalsukan).
 */
async function amatiHasil(ctx, p, rek, email, { sesiAkunBoleh = false } = {}) {
  try {
    const t0 = Date.now()
    let m = ''
    while (Date.now() - t0 < 30000) {
      m = await pesan(p)
      if (m || rek.okTampil) break
      await p.waitForTimeout(200)
    }
    if (rek.okTampil) await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
    else await p.waitForTimeout(1500)
    const jalur = new URL(p.url()).pathname
    const tombol = p.locator('button[type="submit"]')
    const teksTombol = jalur === '/login' ? ((await tombol.textContent({ timeout: 2000 }).catch(() => '')) ?? '') : ''
    const pulih = jalur === '/login' && (await tombol.isEnabled({ timeout: 2000 }).catch(() => false)) && !/Memverifikasi|Verifying/.test(teksTombol)
    const sesiSama = (await sesiEmail(ctx)) === email
    const d = `ok=${rek.okTampil} pesan=${m ? 'ada' : 'tidak'} jalur=${jalur} tombolPulih=${pulih} sesiAkun=${sesiSama}`
    let k = 'LAIN'
    if (rek.okTampil && sesiSama && jalur !== '/login') k = 'BERHASIL'
    else if (rek.okTampil && !sesiSama) k = 'SUKSES_TANPA_SESI'
    else if (!rek.okTampil && m && !STR.ok.test(m) && jalur === '/login' && pulih && (sesiAkunBoleh || !sesiSama)) k = 'DITOLAK'
    else if (!rek.okTampil && jalur === '/login' && !pulih) k = 'MACET'
    else if (!rek.okTampil && !m) k = 'TANPA_HASIL'
    return { k, d, m }
  } catch (e) {
    return { k: 'GAGAL_AMATI', d: aman(e), m: '' }
  }
}
function catatHitung(k, disengaja = false) {
  if (k === 'BERHASIL') hitung.berhasil++
  else if (k === 'DITOLAK' && disengaja) hitung.ditolakDisengaja++
  else if (k === 'DITOLAK') hitung.ditolakAlami++
  else if (k === 'SUKSES_TANPA_SESI') hitung.suksesTanpaSesi++
  else hitung.lainGagal++
}
async function loginApi(ctx, email) {
  const { csrfToken } = await (await ctx.request.get('/api/auth/csrf')).json()
  await ctx.request.post('/api/auth/callback/credentials', { form: { csrfToken, email, password: SANDI, json: 'true' }, maxRedirects: 0 })
  return sesiEmail(ctx)
}
const rusakTokenCsrf = (r) => {
  const b = new URLSearchParams(r.request().postData() || '')
  b.set('csrfToken', randomBytes(32).toString('hex'))
  r.continue({ postData: b.toString() })
}
async function kirim(p, email, sandi) {
  await p.goto('/login', { waitUntil: 'commit' })
  await tungguSiap(p)
  await isi(p, email, sandi)
  await p.click('button[type="submit"]')
}

let galatUtama = null
try {
  browser = await chromium.launch({ executablePath: process.env.LOGIN_UI_CHROMIUM || undefined, headless: true })
  await fixture()

  // ---------------------------------------------------------------- L1 (WAJIB pertama)
  bagian('L1 — login pertama, profil baru, sesudah server mulai (tanpa coba-ulang, tanpa pemanasan)')
  {
    const { ctx, p, rek } = await buka()
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k)
    console.log(`  ℹ️  L1 kategori=${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]`)
    cek('L1 hasil tuntas: BERHASIL (sesi akun A) atau DITOLAK yang jelas (galat, tetap di /login, tombol pulih)', h.k === 'BERHASIL' || h.k === 'DITOLAK', `kategori ${h.k}`)
    cek('L1 tanpa sandi di URL', !rek.urlPw)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L2/L3 F-1
  for (const [kode, judul, opsi] of [
    ['L2', 'tanpa JavaScript', { js: false }],
    ['L3', 'sebelum hidrasi (chunk JS aplikasi diblokir)', { js: true, blokirJs: true }],
  ]) {
    bagian(`${kode} — F-1 ${judul}: klik dan Enter`)
    for (const cara of ['klik', 'Enter']) {
      const { ctx, p, rek } = await buka({ js: opsi.js })
      if (opsi.blokirJs) await p.route('**/_next/static/chunks/**', (r) => r.abort())
      await p.goto('/login', { waitUntil: 'domcontentloaded' })
      await p.locator('#password').waitFor({ timeout: 120000 })
      await isi(p, EMAIL_A)
      if (cara === 'klik') await p.locator('button[type="submit"]').click({ force: true, timeout: 5000 }).catch(() => {})
      else await p.press('#password', 'Enter')
      await p.waitForTimeout(2000)
      const dis = await p.locator('button[type="submit"]').isDisabled().catch(() => null)
      cek(`${kode} ${cara}: tidak ada kredensial di URL`, !rek.urlPw, `URL bersandi=${rek.urlPw}; POST /login=${rek.postLogin}; tombol disabled=${dis}`)
      cek(`${kode} ${cara}: tanpa sesi`, (await sesiEmail(ctx)) === null)
      await ctx.close()
    }
  }

  // ---------------------------------------------------------------- L4 login sah
  bagian('L4 — login sah sesudah komponen siap')
  {
    const { ctx, p, rek } = await buka()
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k)
    cek('L4 BERHASIL: sukses tampil hanya dengan sesi akun A, lalu pindah', h.k === 'BERHASIL', `kategori ${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]`)
    cek('L4 pengalihan sah ke /dokumen', new URL(p.url()).pathname === '/dokumen', new URL(p.url()).pathname)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L5 sandi salah
  bagian('L5 — sandi salah')
  {
    const { ctx, p, rek } = await buka()
    await kirim(p, EMAIL_A, `salah-${randomBytes(4).toString('hex')}`)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k, true)
    cek('L5 DITOLAK dengan pesan sandi salah yang dipertahankan', h.k === 'DITOLAK' && STR.cred.test(h.m), `kategori ${h.k}; ${h.d}`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L6 CSRF tidak cocok (ID & EN)
  for (const lang of ['id', 'en']) {
    bagian(`L6-${lang} — token CSRF sengaja tidak cocok`)
    const { ctx, p, rek } = await buka({ cookies: lang === 'en' ? [{ name: 'ms-lang', value: 'en' }] : [] })
    if (lang === 'en') await p.addInitScript(() => localStorage.setItem('ms-lang', 'en'))
    await p.route('**/api/auth/callback/credentials', rusakTokenCsrf)
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k, true)
    cek(`L6-${lang} penolakan CSRF = DITOLAK dengan pesan sesi (${lang.toUpperCase()})`, h.k === 'DITOLAK' && (lang === 'en' ? STR.sesiEn : STR.sesiId).test(h.m), `kategori ${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L7 providers gagal
  bagian('L7 — /api/auth/providers gagal')
  {
    const { ctx, p, rek } = await buka()
    await p.goto('/login', { waitUntil: 'commit' })
    await tungguSiap(p)
    await p.route('**/api/auth/providers', (r) => r.abort())
    await isi(p, EMAIL_A)
    await p.click('button[type="submit"]')
    await p.waitForTimeout(4000)
    cek('L7 tidak ada pesan sukses, tanpa sesi', !rek.okTampil && (await sesiEmail(ctx)) === null, `ok tampil=${rek.okTampil}; path akhir ${new URL(p.url()).pathname} (next-auth sendiri pindah ke /api/auth/error)`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L8 callback gagal jaringan
  bagian('L8 — POST callback gagal jaringan')
  {
    const { ctx, p, rek } = await buka()
    await p.route('**/api/auth/callback/credentials', (r) => r.abort())
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k, true)
    cek('L8 DITOLAK dengan pesan jaringan; tombol tidak macet', h.k === 'DITOLAK' && STR.jaringan.test(h.m), `kategori ${h.k}; ${h.d}`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L9 verifikasi sesi gagal
  bagian('L9 — verifikasi sesi gagal sesudah callback (server nyata membuat sesi; permintaan sesi peramban digagalkan)')
  {
    const { ctx, p, rek } = await buka()
    await p.route('**/api/auth/session', (r) => (rek.sesudahCallback ? r.abort() : r.continue()))
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { sesiAkunBoleh: true })
    catatHitung(h.k, true)
    cek('L9 sesi tak terverifikasi → DITOLAK dengan pesan sesi, tanpa sukses/navigasi', h.k === 'DITOLAK' && STR.sesiId.test(h.m), `kategori ${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L10 sesi lama akun lain + CSRF
  bagian('L10 — sesi lama milik akun B, lalu login A ditolak CSRF (bukan bukti tunggal pemeriksaan kecocokan akun)')
  {
    const { ctx, p, rek } = await buka()
    const awal = await loginApi(ctx, EMAIL_B)
    await p.route('**/api/auth/callback/credentials', rusakTokenCsrf)
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k, true)
    cek('L10 prasyarat: sesi B ada sebelum login A', awal === EMAIL_B)
    cek('L10 sesi B tidak dianggap keberhasilan login A', h.k === 'DITOLAK' && STR.sesiId.test(h.m), `kategori ${h.k}; ${h.d}`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L12 kecocokan akun
  bagian('L12 — signIn A lolos (server nyata), verifikasi sesi mengembalikan akun B (respons sesi disimulasikan)')
  {
    const { ctx, p, rek } = await buka()
    let sesiAsliA = null
    await p.route('**/api/auth/session', async (r) => {
      if (!rek.sesudahCallback) return r.continue()
      const asli = await r.fetch()
      const j = await asli.json().catch(() => ({}))
      sesiAsliA = j?.user?.email === EMAIL_A
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...j, user: { ...(j?.user ?? {}), email: EMAIL_B, name: `${TAG}B` } }) })
    })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { sesiAkunBoleh: true })
    catatHitung(h.k, true)
    cek('L12 prasyarat: callback nyata lolos pemeriksaan awal (200, bukan signin/error)', rek.callback.length === 1 && rek.callback[0] === '200 /login', `callback=[${rek.callback.join(', ')}]`)
    cek('L12 prasyarat: server nyata memang membuat sesi akun A', sesiAsliA === true)
    cek('L12 sesi akun B ditolak: tanpa pesan sukses, tanpa navigasi, pesan sesi, tombol pulih', h.k === 'DITOLAK' && STR.sesiId.test(h.m), `kategori ${h.k}; ${h.d}`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L11 log server
  bagian('L11 — log server tanpa kredensial di URL')
  if (LOG.length) {
    const n = LOG.map((f) => (readFileSync(f, 'utf8').match(/[?&]password=/gi) ?? []).length).reduce((a, b) => a + b, 0)
    cek('L11 log server tidak memuat "?…password=" (F-1 sisi server)', n === 0, `${n} kemunculan`)
  } else {
    console.log('  ⚠️  L11 dilewati — LOGIN_UI_SERVER_LOG tidak diset (bukan lulus)')
  }
} catch (e) {
  galatUtama = aman(e)
  cek('uji selesai tanpa galat tak terduga', false, galatUtama)
} finally {
  bagian('Pembersihan')
  const gagalTutup = []
  if (browser) {
    try {
      await browser.close()
    } catch (e) {
      gagalTutup.push(`tutup peramban: ${aman(e)}`)
    }
  }
  const gagalBersih = await bersihkan()
  try {
    await adm.$disconnect()
  } catch (e) {
    gagalTutup.push(`tutup koneksi DB: ${aman(e)}`)
  }
  for (const g of [...gagalBersih, ...gagalTutup]) cek(`pembersihan: ${g.split(':')[0]}`, false, g)
  if (!gagalBersih.length && !gagalTutup.length) cek('pembersihan fixture, peramban, dan koneksi DB', true, 'fixture tersisa 0')
}

console.log(
  `\nRINGKAS LOGIN: berhasil=${hitung.berhasil} ditolak-alami=${hitung.ditolakAlami} ditolak-disengaja=${hitung.ditolakDisengaja} sukses-tanpa-sesi=${hitung.suksesTanpaSesi} lain-gagal=${hitung.lainGagal}`,
)
console.log(`HASIL: ${lulus} lulus / ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
