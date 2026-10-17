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
// L1/L4/L13 (login sah tanpa gangguan isi): WAJIB BERHASIL — penolakan CSRF alami dihitung GAGAL (race login pertama).
// L13–L15 memakai proxy HTTP loopback di dalam uji ini (peramban → proxy → server) untuk MENGATUR URUTAN respons
// /api/auth/* tanpa mengubah isinya; peramban menyimpan cookie hanya saat respons diteruskan proxy.
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
import http from 'node:http'
import net from 'node:net'
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
  tidakPasti: /tidak dapat dipastikan|could not be confirmed/,
}

// Proxy HTTP loopback untuk uji urutan respons /api/auth/*. Peramban → proxy → server Next. Respons diteruskan apa adanya
// (termasuk Set-Cookie), sehingga peramban menyimpan cookie HANYA saat respons benar-benar diteruskan. Aturan:
//   lepas : tanpa penahanan;
//   O2    : respons sesi awal (permintaan TANPA cookie CSRF, sebelum callback) ditahan sampai respons /api/auth/csrf
//           diteruskan atau ≤ tahanMs; permintaan callback ditahan sampai semua respons sesi awal diteruskan (≤ tahanMs);
//   O3    : respons sesi awal ditahan sampai respons callback diteruskan (≤ 3×tahanMs);
//   O4    : respons sesi awal ditahan 300 ms; respons /api/auth/csrf ditahan sampai respons sesi awal diteruskan.
//   hang  : respons sesi awal TIDAK PERNAH diteruskan (uji batas waktu);  abort: koneksi sesi awal diputus;
//   tahan : respons sesi awal ditahan tahanMs;  csrf-hang: respons /api/auth/csrf TIDAK PERNAH diteruskan;
//   manual-sesi / manual-csrf: respons sesi awal / respons csrf PERTAMA ditahan sampai lepas() dipanggil;
//   kepala-csrf / kepala-callback: header respons csrf / callback PERTAMA diteruskan, body ditahan sampai lepas().
// Peristiwa direkam tanpa nilai: jalur, metode, ada/tidaknya cookie CSRF, nama Set-Cookie, status, dan kecocokan token
// body↔cookie callback sebagai boolean.
function buatProxy(target) {
  const T = new URL(target)
  const sinyal = () => { let buka; const p = new Promise((r) => (buka = r)); return { p, buka } }
  const tunda = (ms) => new Promise((r) => setTimeout(r, ms))
  let st
  const atur = (aturan = 'lepas', tahanMs = 4000) => {
    st = { aturan, tahanMs, t0: Date.now(), ev: [], callbackDilihat: false, nCallback: 0, sesiTertahan: 0, csrfDiteruskan: sinyal(), callbackDiteruskan: sinyal(), sesiDilepas: sinyal(), adaSesiAwal: false, lepasan: sinyal(), tLepas: null }
  }
  atur()
  const catat = (e, d) => st.ev.push({ t: Date.now() - st.t0, e, ...d })
  const tokenCookie = (h) => { const m = /(?:^|;\s*)next-auth\.csrf-token=([^;]*)/.exec(h || ''); return m ? decodeURIComponent(m[1]).split('|')[0] : null }
  const namaSetCookie = (h) => [].concat(h['set-cookie'] || []).map((x) => x.split('=')[0])
  const tahanSesi = new Set()
  const server = http.createServer(async (req, res) => {
    const s = st, jalur = new URL(req.url, 'http://x').pathname, auth = jalur.startsWith('/api/auth/')
    const potong = []; for await (const c of req) potong.push(c); const body = Buffer.concat(potong)
    const adaCsrf = !!tokenCookie(req.headers.cookie)
    const headers = { ...req.headers }; if (auth) delete headers['accept-encoding']
    const sesiAwal = jalur === '/api/auth/session' && !adaCsrf && !s.callbackDilihat
    if (auth) catat('permintaan', { jalur, metode: req.method, adaCookieCsrf: adaCsrf, sesiAwal, sesiAwalBerjalan: s.sesiTertahan })
    if (jalur === '/api/auth/csrf') {
      s.nCsrf = (s.nCsrf || 0) + 1
      if (s.sesiTertahan > 0) s.csrfSaatSesiAwalBerjalan = (s.csrfSaatSesiAwalBerjalan || 0) + 1
    }
    if (jalur === '/api/auth/callback/credentials' && req.method === 'POST') {
      s.callbackDilihat = true; s.nCallback++
      const tb = new URLSearchParams(body.toString()).get('csrfToken'), tc = tokenCookie(req.headers.cookie)
      catat('callback-diterima-proxy', { n: s.nCallback, tokenBodyCocokCookie: !!tc && tc === tb, sesiAwalMasihTertahan: s.sesiTertahan })
      if (s.aturan === 'O2' && s.sesiTertahan > 0) await Promise.race([s.sesiDilepas.p, tunda(s.tahanMs)])
    }
    if (sesiAwal) { s.adaSesiAwal = true; s.sesiTertahan++ }
    const up = http.request({ host: T.hostname, port: T.port, method: req.method, path: req.url, headers }, async (r) => {
      const isi = []; for await (const c of r) isi.push(c); const buf = Buffer.concat(isi)
      if (sesiAwal) {
        catat('sesi-awal-dijawab-server', { setCookie: namaSetCookie(r.headers) })
        if (s.aturan === 'O2') await Promise.race([s.csrfDiteruskan.p, tunda(s.tahanMs)])
        if (s.aturan === 'O3') await Promise.race([s.callbackDiteruskan.p, tunda(3 * s.tahanMs)])
        if (s.aturan === 'O4') await tunda(300)
        if (s.aturan === 'tahan') await tunda(s.tahanMs)
        if (s.aturan === 'manual-sesi') { tahanSesi.add(res); await s.lepasan.p; tahanSesi.delete(res) }
        if (s.aturan === 'hang') { tahanSesi.add(res); return }
        if (s.aturan === 'abort') { res.destroy(); s.sesiTertahan--; if (!s.sesiTertahan) s.sesiDilepas.buka(); catat('sesi-awal-diputus', {}); return }
      }
      if (jalur === '/api/auth/csrf' && s.aturan === 'O4' && s.sesiTertahan > 0) await Promise.race([s.sesiDilepas.p, tunda(s.tahanMs)])
      if (jalur === '/api/auth/csrf' && s.aturan === 'csrf-hang') { tahanSesi.add(res); return }
      const pertama = (jalur === '/api/auth/csrf' && s.nCsrf === 1) || (jalur === '/api/auth/callback/credentials' && s.nCallback === 1)
      if (pertama && jalur === '/api/auth/csrf' && s.aturan === 'manual-csrf') { tahanSesi.add(res); await s.lepasan.p; tahanSesi.delete(res) }
      if (pertama && ((jalur === '/api/auth/csrf' && s.aturan === 'kepala-csrf') || (jalur === '/api/auth/callback/credentials' && s.aturan === 'kepala-callback'))) {
        res.writeHead(r.statusCode, r.headers); res.flushHeaders(); catat('kepala-diteruskan-body-ditahan', { jalur, setCookie: namaSetCookie(r.headers) })
        tahanSesi.add(res); await s.lepasan.p; tahanSesi.delete(res)
        try { res.end(buf) } catch {}
        catat('body-dilepas', { jalur, socketTertutup: !!res.socket?.destroyed || res.writableEnded === false })
        if (jalur === '/api/auth/csrf') s.csrfDiteruskan.buka()
        if (jalur === '/api/auth/callback/credentials') s.callbackDiteruskan.buka()
        return
      }
      res.writeHead(r.statusCode, r.headers); res.end(buf)
      if (auth) {
        const d = { jalur, status: r.statusCode, setCookie: namaSetCookie(r.headers) }
        if (jalur === '/api/auth/callback/credentials') { try { const u = new URL(JSON.parse(buf.toString()).url, 'http://x'); d.urlRespons = u.pathname + (u.searchParams.has('csrf') ? '?csrf' : '') + (u.searchParams.has('error') ? '?error' : '') } catch { d.urlRespons = '(?)' } }
        catat('respons-diteruskan', d)
      }
      if (sesiAwal) { s.sesiTertahan--; if (!s.sesiTertahan) s.sesiDilepas.buka() }
      if (jalur === '/api/auth/csrf') s.csrfDiteruskan.buka()
      if (jalur === '/api/auth/callback/credentials') s.callbackDiteruskan.buka()
    })
    up.on('error', () => { try { res.destroy() } catch {} })
    up.end(body)
  })
  server.on('upgrade', (req, sock, head) => {
    const up = net.connect(T.port, T.hostname, () => {
      const baris = [`${req.method} ${req.url} HTTP/1.1`]; for (let i = 0; i < req.rawHeaders.length; i += 2) baris.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      up.write(baris.join('\r\n') + '\r\n\r\n'); if (head?.length) up.write(head); sock.pipe(up).pipe(sock)
    })
    up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy())
  })
  return {
    mulai: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    atur, keadaan: () => st,
    lepas: () => { st.tLepas = Date.now() - st.t0; catat('lepas-dipanggil', {}); st.lepasan.buka() },
    tutup: () => new Promise((r) => { for (const x of tahanSesi) { try { x.destroy() } catch {} } server.closeAllConnections?.(); server.close(() => r()) }),
  }
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
let px = null
let PX = null

/** Konteks + halaman dengan perekam: URL bersandi, pesan sukses yang PERNAH tampil, POST callback & respons. */
async function buka({ js = true, cookies = [], base = BASE } = {}) {
  const ctx = await browser.newContext({ baseURL: base, locale: 'id-ID', javaScriptEnabled: js })
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
const sesiEmail = async (ctx) => (await ctx.request.get(`${ASAL}/api/auth/session`).then((r) => r.json()).catch(() => ({})))?.user?.email ?? null
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
async function amatiHasil(ctx, p, rek, email, { sesiAkunBoleh = false, tungguMs = 30000 } = {}) {
  try {
    const t0 = Date.now()
    let m = ''
    while (Date.now() - t0 < tungguMs) {
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
  px = buatProxy(ASAL)
  PX = await px.mulai()
  await fixture()

  // ---------------------------------------------------------------- L1 (WAJIB pertama)
  bagian('L1 — login pertama, profil baru, sesudah server mulai (tanpa coba-ulang, tanpa pemanasan)')
  {
    const { ctx, p, rek } = await buka()
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A)
    catatHitung(h.k)
    console.log(`  ℹ️  L1 kategori=${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]`)
    cek('L1 login sah pertama WAJIB BERHASIL dengan sesi akun A (penolakan CSRF alami = gagal)', h.k === 'BERHASIL', `kategori ${h.k}`)
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
    const jalur7 = new URL(p.url()).pathname
    cek('L7 tidak ada pesan sukses, tanpa sesi, tetap di /login', !rek.okTampil && (await sesiEmail(ctx)) === null && jalur7 === '/login', `ok tampil=${rek.okTampil}; path akhir ${jalur7}`)
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
    cek('L8 callback terkirim lalu gagal jaringan → DITOLAK dengan pesan status tidak pasti; tombol tidak macet', h.k === 'DITOLAK' && STR.tidakPasti.test(h.m), `kategori ${h.k}; ${h.d}`)
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
    cek('L9 verifikasi sesi gagal sesudah callback → DITOLAK dengan pesan status tidak pasti, tanpa sukses/navigasi', h.k === 'DITOLAK' && STR.tidakPasti.test(h.m), `kategori ${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]`)
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

  // ---------------------------------------------------------------- L25/L26 klasifikasi sesudah callback terkirim
  bagian('L25 — callback nyata berhasil; verifikasi sesi di peramban diganti HTTP 500 dengan body JSON')
  {
    const { ctx, p, rek } = await buka()
    let nSesiSesudah = 0
    await p.route('**/api/auth/session', (r) => {
      if (!rek.sesudahCallback) return r.continue()
      nSesiSesudah++
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'galat simulasi' }) })
    })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { sesiAkunBoleh: true })
    await p.waitForTimeout(2000)
    catatHitung(h.k, true)
    const sesiServer = (await sesiEmail(ctx)) === EMAIL_A
    cek('L25 prasyarat: callback nyata lolos (200 /login) dan server memang membuat sesi akun A', rek.callback.length === 1 && rek.callback[0] === '200 /login' && sesiServer, `callback=[${rek.callback.join(', ')}]; sesi server ada=${sesiServer}`)
    cek('L25 verifikasi sesi HTTP 500 → status TIDAK PASTI (bukan "sesi tidak dapat dibuat"), tanpa sukses/navigasi, tombol pulih', h.k === 'DITOLAK' && STR.tidakPasti.test(h.m) && !STR.sesiId.test(h.m), `kategori ${h.k}; ${h.d}`)
    cek('L25 tanpa retry otomatis: tepat 1 callback dan 1 permintaan verifikasi sesi', rek.callback.length === 1 && nSesiSesudah === 1, `callback=${rek.callback.length} verifikasiSesi=${nSesiSesudah}`)
    await ctx.close()
  }
  for (const [kode, status, body, ket] of [
    ['L26a', 500, {}, 'HTTP 500 dengan body JSON tanpa url'],
    ['L26b', 200, {}, 'HTTP 200 dengan body JSON tanpa url'],
  ]) {
    bagian(`${kode} — callback nyata diproses server, respons di peramban diganti ${ket}`)
    const { ctx, p, rek } = await buka()
    let nSesiSesudah = 0
    await p.route('**/api/auth/callback/credentials', async (r) => {
      await r.fetch() // server nyata memproses callback (Set-Cookie disimpan konteks), respons peramban dipalsukan
      await r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await p.route('**/api/auth/session', (r) => {
      if (rek.sesudahCallback) nSesiSesudah++
      return r.continue()
    })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { sesiAkunBoleh: true })
    catatHitung(h.k, true)
    const sesiServer = (await sesiEmail(ctx)) === EMAIL_A
    cek(`${kode} prasyarat: server nyata membuat sesi akun A`, sesiServer, `sesi server ada=${sesiServer}`)
    cek(`${kode} respons callback tidak dapat diverifikasi → status TIDAK PASTI, tanpa sukses/navigasi, tombol pulih, tanpa retry`, h.k === 'DITOLAK' && STR.tidakPasti.test(h.m) && rek.callback.length === 1 && nSesiSesudah === 0, `kategori ${h.k}; ${h.d}; callback=[${rek.callback.join(', ')}]; verifikasiSesi=${nSesiSesudah}`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L13 race terkendali
  const ringkasProxy = (k) => `csrf=${k.nCsrf || 0} csrfSaatSesiAwalBerjalan=${k.csrfSaatSesiAwalBerjalan || 0} callback=${k.nCallback} tokenCocok=[${k.ev.filter((e) => e.e === 'callback-diterima-proxy').map((e) => e.tokenBodyCocokCookie).join(',')}]`
  bagian('L13 — race CSRF terkendali (proxy): respons sesi awal tanpa cookie ditahan sampai token CSRF diambil')
  {
    px.atur('O2', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 45000 })
    const k = px.keadaan()
    catatHitung(h.k)
    console.log(`  ℹ️  L13 ${ringkasProxy(k)}; urutan: ${k.ev.filter((e) => /permintaan|diteruskan/.test(e.e) && !/_log/.test(e.jalur ?? '')).map((e) => `${e.e === 'permintaan' ? '→' : '←'}${(e.jalur ?? '').replace('/api/auth/', '')}${e.e === 'permintaan' ? (e.adaCookieCsrf ? '+c' : '-c') : e.setCookie?.includes('next-auth.csrf-token') ? '[setCsrf]' : ''}`).join(' ')}`)
    cek('L13 login sah WAJIB BERHASIL dengan sesi akun A', h.k === 'BERHASIL', `kategori ${h.k}; ${h.d}`)
    cek('L13 token CSRF tidak diambil selama respons sesi awal masih berjalan', (k.nCsrf || 0) === 1 && (k.csrfSaatSesiAwalBerjalan || 0) === 0, ringkasProxy(k))
    cek('L13 tepat 1 callback, token body = cookie (tanpa retry tersembunyi)', k.nCallback === 1 && k.ev.some((e) => e.e === 'callback-diterima-proxy' && e.tokenBodyCocokCookie), ringkasProxy(k))
    await ctx.close()
  }

  // ---------------------------------------------------------------- L14 gangguan sesi/token
  for (const [kode, aturan, judul, harap, tunggu] of [
    ['L14a', 'abort', 'permintaan sesi awal diputus', 'BERHASIL', 45000],
    ['L14b', 'hang', 'respons sesi awal tidak pernah tiba', 'DITOLAK-sesi', 45000],
    ['L14c', 'csrf-hang', 'respons /api/auth/csrf tidak pernah tiba', 'DITOLAK-jaringan', 60000],
  ]) {
    bagian(`${kode} — gangguan: ${judul} (proxy)`)
    px.atur(aturan, 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: tunggu })
    const k = px.keadaan()
    catatHitung(h.k, harap !== 'BERHASIL')
    console.log(`  ℹ️  ${kode} kategori=${h.k}; ${h.d}; ${ringkasProxy(k)}`)
    if (harap === 'BERHASIL') cek(`${kode} tanpa macet/sukses palsu: BERHASIL dengan sesi akun A`, h.k === 'BERHASIL', `kategori ${h.k}`)
    if (harap === 'DITOLAK-sesi') cek(`${kode} callback TIDAK dikirim sebelum sesi awal selesai; DITOLAK dengan pesan sesi, tombol pulih`, h.k === 'DITOLAK' && STR.sesiId.test(h.m) && k.nCallback === 0, `kategori ${h.k}; callback=${k.nCallback}`)
    if (harap === 'DITOLAK-jaringan') cek(`${kode} DITOLAK dengan pesan jaringan sesudah batas waktu, tombol pulih, tanpa callback`, h.k === 'DITOLAK' && STR.jaringan.test(h.m) && k.nCallback === 0, `kategori ${h.k}; callback=${k.nCallback}`)
    cek(`${kode} tanpa retry tersembunyi (csrf ≤ 1, callback ≤ 1)`, (k.nCsrf || 0) <= 1 && k.nCallback <= 1, ringkasProxy(k))
    await ctx.close()
  }

  // ---------------------------------------------------------------- L15 kirim ganda
  bagian('L15 — klik Masuk lalu Enter dan klik lagi selama menunggu (proxy menahan sesi awal 3 dtk)')
  {
    px.atur('tahan', 3000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    await p.press('#password', 'Enter').catch(() => {})
    await p.locator('button[type="submit"]').click({ force: true, timeout: 2000 }).catch(() => {})
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 45000 })
    const k = px.keadaan()
    catatHitung(h.k)
    cek('L15 tepat 1 pengambilan token dan 1 callback; BERHASIL dengan sesi akun A', h.k === 'BERHASIL' && (k.nCsrf || 0) === 1 && k.nCallback === 1, `kategori ${h.k}; ${ringkasProxy(k)}`)
    await ctx.close()
  }

  // ---------------------------------------------------------------- L16–L22 siklus hidup percobaan
  const tungguProxy = async (p, f, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f(px.keadaan())) return true; await p.waitForTimeout(100) } return false }
  const callbackSesudahLepas = (k) => k.ev.filter((e) => e.e === 'callback-diterima-proxy' && k.tLepas !== null && e.t >= k.tLepas).length
  const urutanProxy = (k) => k.ev.filter((e) => !/_log/.test(e.jalur ?? '') && /permintaan|diteruskan|lepas|ditahan|dilepas/.test(e.e)).map((e) => `${e.t}:${e.e === 'permintaan' ? '→' : e.e === 'respons-diteruskan' ? '←' : e.e + ':'}${(e.jalur ?? '').replace('/api/auth/', '')}`).join(' ')
  const ringkasan = []
  async function lepasDanAmati(p, rek, kode) {
    await p.waitForTimeout(500)
    px.lepas()
    await p.waitForTimeout(5000) // konteks TIDAK ditutup: beri waktu kelanjutan percobaan lama berjalan
    const k = px.keadaan()
    ringkasan.push(`${kode}: ${urutanProxy(k)}`)
    return { k, cbSesudah: callbackSesudahLepas(k), okSesudah: rek.okTampil }
  }

  bagian('L16 — respons token ditahan melewati batas waktu, LALU dilepas (konteks tetap terbuka)')
  {
    px.atur('manual-csrf', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 60000 })
    catatHitung(h.k, true)
    cek('L16 batas waktu sebelum callback → DITOLAK dengan pesan jaringan, tombol pulih', h.k === 'DITOLAK' && STR.jaringan.test(h.m), `kategori ${h.k}; ${h.d}`)
    const o = await lepasDanAmati(p, rek, 'L16')
    cek('L16 sesudah respons token lama dilepas: TIDAK ada callback, tidak ada sukses, tetap di /login', o.k.nCallback === 0 && !o.okSesudah && new URL(p.url()).pathname === '/login', `callback=${o.k.nCallback} (sesudah lepas ${o.cbSesudah}); ok=${o.okSesudah}`)
    await ctx.close()
  }

  bagian('L17 — percobaan baru sesudah batas waktu, lalu respons token percobaan lama dilepas')
  {
    px.atur('manual-csrf', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const h1 = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 60000 })
    cek('L17 percobaan 1 batas waktu → DITOLAK dengan pesan jaringan', h1.k === 'DITOLAK' && STR.jaringan.test(h1.m), `kategori ${h1.k}`)
    await isi(p, EMAIL_A)
    await p.click('button[type="submit"]')
    const okBaru = await tungguProxy(p, (k) => k.nCallback >= 1, 30000)
    await p.waitForTimeout(300)
    const o = await lepasDanAmati(p, rek, 'L17')
    const s = await sesiEmail(ctx)
    catatHitung(rek.okTampil && s === EMAIL_A ? 'BERHASIL' : 'LAIN')
    cek('L17 percobaan 2 BERHASIL dengan sesi akun A', okBaru && rek.okTampil && s === EMAIL_A, `callback=${o.k.nCallback}; ok=${rek.okTampil}; sesiAkun=${s === EMAIL_A}`)
    cek('L17 percobaan lama tidak mengirim callback sesudah dilepas (total tepat 1 callback, 2 token)', o.k.nCallback === 1 && o.cbSesudah === 0 && (o.k.nCsrf || 0) === 2, `csrf=${o.k.nCsrf} callback=${o.k.nCallback} sesudahLepas=${o.cbSesudah}`)
    await ctx.close()
  }

  for (const [kode, aturan, judul, syarat] of [
    ['L18', 'manual-sesi', 'meninggalkan halaman saat menunggu sesi awal', (k) => k.sesiTertahan > 0],
    ['L19', 'manual-csrf', 'meninggalkan halaman saat menunggu token', (k) => (k.nCsrf || 0) >= 1],
  ]) {
    bagian(`${kode} — ${judul}, lalu respons dilepas`)
    px.atur(aturan, 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const menunggu = await tungguProxy(p, syarat, 30000)
    await p.locator('a[href="/register"]').first().click()
    const keluar = await p.waitForURL((u) => u.pathname === '/register', { timeout: 60000 }).then(() => true, () => false)
    const o = await lepasDanAmati(p, rek, kode)
    cek(`${kode} prasyarat: percobaan sedang menunggu lalu halaman ditinggalkan (navigasi klien ke /register)`, menunggu && keluar)
    cek(`${kode} sesudah dilepas: TIDAK ada callback, tidak ada sukses/navigasi, tetap di /register, tanpa sesi`, o.k.nCallback === 0 && !o.okSesudah && new URL(p.url()).pathname === '/register' && (await sesiEmail(ctx)) === null, `csrf=${o.k.nCsrf || 0} callback=${o.k.nCallback}; ok=${o.okSesudah}; jalur=${new URL(p.url()).pathname}`)
    await ctx.close()
  }

  bagian('L20 — header respons token tiba, body ditahan melewati batas waktu, lalu dilepas')
  {
    px.atur('kepala-csrf', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 60000 })
    catatHitung(h.k, true)
    cek('L20 DITOLAK dengan pesan jaringan sebelum callback, tombol pulih', h.k === 'DITOLAK' && STR.jaringan.test(h.m), `kategori ${h.k}; ${h.d}`)
    const o = await lepasDanAmati(p, rek, 'L20')
    cek('L20 sesudah body dilepas: TIDAK ada callback, tidak ada sukses', o.k.nCallback === 0 && !o.okSesudah, `callback=${o.k.nCallback}; ok=${o.okSesudah}`)
    await ctx.close()
  }

  bagian('L21 — header respons callback tiba (Set-Cookie sesi), body ditahan melewati batas waktu, lalu dilepas')
  {
    px.atur('kepala-callback', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    await kirim(p, EMAIL_A)
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 60000, sesiAkunBoleh: true })
    catatHitung(h.k, true)
    const sesiSaatGalat = (await sesiEmail(ctx)) === EMAIL_A
    cek('L21 callback sudah terkirim → DITOLAK dengan pesan status TIDAK PASTI (bukan sukses, bukan "gagal" pasti), tombol pulih', h.k === 'DITOLAK' && STR.tidakPasti.test(h.m), `kategori ${h.k}; ${h.d}; sesi server ada=${sesiSaatGalat}`)
    const o = await lepasDanAmati(p, rek, 'L21')
    cek('L21 sesudah body dilepas: tetap 1 callback, tidak ada sukses/navigasi', o.k.nCallback === 1 && !o.okSesudah && new URL(p.url()).pathname === '/login', `callback=${o.k.nCallback}; ok=${o.okSesudah}`)
    console.log(`  ℹ️  L21 ketidakpastian yang dibuktikan: sesi akun A di server sesudah percobaan dibatalkan = ${sesiSaatGalat}`)
    await ctx.close()
  }

  bagian('L22 — pelacak: pasang/lepas saat navigasi keluar-masuk /login (dev = Strict Mode)')
  {
    px.atur('lepas', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    const bungkus = () => p.evaluate(() => !String(window.fetch).includes('[native code]'))
    await p.goto('/login', { waitUntil: 'commit' })
    await tungguSiap(p)
    const s1 = await bungkus()
    await p.locator('a[href="/register"]').first().click(); await p.waitForURL((u) => u.pathname === '/register', { timeout: 60000 })
    await p.waitForTimeout(500)
    const s2 = await bungkus()
    await p.locator('a[href="/login"]').first().click(); await p.waitForURL((u) => u.pathname === '/login', { timeout: 60000 })
    await tungguSiap(p)
    const s3 = await bungkus()
    await p.locator('a[href="/register"]').first().click(); await p.waitForURL((u) => u.pathname === '/register', { timeout: 60000 })
    await p.waitForTimeout(500)
    const s4 = await bungkus()
    await p.locator('a[href="/login"]').first().click(); await p.waitForURL((u) => u.pathname === '/login', { timeout: 60000 })
    await tungguSiap(p)
    cek('L22 fetch dibungkus di /login dan PULIH ke asli setiap kali halaman ditinggalkan', s1 && !s2 && s3 && !s4, `login=${s1} register=${s2} login=${s3} register=${s4}`)
    await isi(p, EMAIL_A)
    await p.click('button[type="submit"]')
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 45000 })
    const k = px.keadaan()
    catatHitung(h.k)
    cek('L22 login sesudah keluar-masuk BERHASIL, tepat 1 token dan 1 callback', h.k === 'BERHASIL' && (k.nCsrf || 0) === 1 && k.nCallback === 1, `kategori ${h.k}; ${ringkasProxy(k)}`)
    await ctx.close()
  }

  bagian('L23 — kirim ganda sintetis: dua submit dalam satu tick (form.requestSubmit ×2), sesi awal ditahan 3 dtk')
  {
    px.atur('tahan', 3000)
    const { ctx, p, rek } = await buka({ base: PX })
    await p.goto('/login', { waitUntil: 'commit' })
    await tungguSiap(p)
    await isi(p, EMAIL_A)
    await p.evaluate(() => { const f = document.querySelector('form'); f.requestSubmit(); f.requestSubmit() })
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 45000 })
    await p.waitForTimeout(2000)
    const k = px.keadaan()
    catatHitung(h.k)
    cek('L23 tepat 1 token dan 1 callback; BERHASIL', h.k === 'BERHASIL' && (k.nCsrf || 0) === 1 && k.nCallback === 1, `kategori ${h.k}; ${ringkasProxy(k)}`)
    await ctx.close()
  }
  bagian('L24 — submit lagi sesudah pesan sukses tampil, sebelum pengalihan (jeda 600 ms)')
  {
    px.atur('lepas', 4000)
    const { ctx, p, rek } = await buka({ base: PX })
    const dokumenBaru = []
    p.on('request', (r) => {
      if (r.isNavigationRequest() && r.frame() === p.mainFrame() && !new URL(r.url()).pathname.startsWith('/login')) dokumenBaru.push(new URL(r.url()).pathname)
    })
    await p.goto('/login', { waitUntil: 'commit' })
    await tungguSiap(p)
    await isi(p, EMAIL_A)
    await p.click('button[type="submit"]')
    await p.locator('.lgn-msg.ok').waitFor({ timeout: 45000 })
    const kirimUlang = await p.evaluate(() => {
      if (!location.pathname.startsWith('/login')) return 'sudah pindah'
      const f = document.querySelector('form'), b = document.querySelector('button[type="submit"]')
      const nonaktif = b.disabled
      f.requestSubmit(); b.click()
      return `requestSubmit+click; tombol nonaktif=${nonaktif}`
    })
    const h = await amatiHasil(ctx, p, rek, EMAIL_A, { tungguMs: 45000 })
    await p.waitForTimeout(3000)
    const k = px.keadaan()
    catatHitung(h.k)
    cek('L24 prasyarat: submit ulang dilakukan saat pesan sukses tampil dan halaman belum pindah', kirimUlang.startsWith('requestSubmit'), kirimUlang)
    cek('L24 tidak ada login kedua: tepat 1 token dan 1 callback; BERHASIL', h.k === 'BERHASIL' && (k.nCsrf || 0) === 1 && k.nCallback === 1, `kategori ${h.k}; ${ringkasProxy(k)}`)
    cek('L24 tepat 1 pengalihan dokumen dari /login', dokumenBaru.length === 1, `pengalihan=[${dokumenBaru.join(', ')}]`)
    await ctx.close()
  }
  for (const r of ringkasan) console.log(`  ℹ️  urutan ${r}`)

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
  if (px) {
    try {
      await px.tutup()
    } catch (e) {
      gagalTutup.push(`tutup proxy uji: ${aman(e)}`)
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
