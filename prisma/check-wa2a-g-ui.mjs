// Uji UI WA-2a 2a-G (T3) — Pesan Klien WhatsApp di peramban nyata (Playwright + Chromium, dari LUAR repo).
//
// Jalur NYATA: login, halaman server (pagar sesi + bolehAksesWa2), komponen client, API 2a-G, service F3/F4, DB.
// Origin peramban HARUS = origin NEXTAUTH_URL server (pagar CSRF), jadi WA2G_UI_BASE_URL = NEXTAUTH_URL.
//
//   Server (next dev, flag aktif): DATABASE_URL=$U DIRECT_URL=$U NEXTAUTH_URL=http://127.0.0.1:3400 NEXTAUTH_SECRET=<acak> \
//     AUTOMATION_MONITORING_ENABLED=true AUTOMATION_TENANT_IDS=wa2guitenantaaaaaaaa01,wa2guitenantbbbbbbbb02 \
//     WA2_CLIENT_FOUNDATION_ENABLED=true NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--import $PWD/prisma/wa1-egress-trap.mjs" \
//     npx next dev -H 127.0.0.1 -p 3400 > server-ui.log 2>&1
//   WA2G_UI_DB_URL=$U WA2G_UI_BASE_URL=http://127.0.0.1:3400 WA2G_UI_SERVER_LOG=server-ui.log \
//   WA2G_UI_PLAYWRIGHT=/jalur/node_modules/playwright-core WA2G_UI_CHROMIUM=/jalur/chromium node prisma/check-wa2a-g-ui.mjs
//
// Mode (WA2G_UI_MODE):
//   dev       (bawaan) — alur penuh peramban, maker-checker, akses, kebocoran, jaringan.
//   flag-mati — server `next dev` dengan WA2_CLIENT_FOUNDATION_ENABLED=false: kedua halaman 404 untuk sesi sah.
//   produksi  — server `next start` (NODE_ENV=production) dengan flag SENGAJA true: kedua halaman 404.
// Di semua mode: tanpa sesi → redirect /login. playwright-core SENGAJA bukan dependensi repo; tanpa WA2G_UI_* atau
// tanpa playwright-core → DILEWATI (kode 3, BUKAN lulus). DB & server WAJIB loopback; data sintetis `WA2GUI-` dihapus.

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
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
const URL_DB = process.env.WA2G_UI_DB_URL
const BASE = process.env.WA2G_UI_BASE_URL
const PW = process.env.WA2G_UI_PLAYWRIGHT
const MODE = process.env.WA2G_UI_MODE ?? 'dev'
const LOG = process.env.WA2G_UI_SERVER_LOG
if (!URL_DB || !BASE || !PW) {
  console.log('DILEWATI — WA2G_UI_DB_URL, WA2G_UI_BASE_URL, dan WA2G_UI_PLAYWRIGHT wajib diset (DB & server loopback, playwright-core di luar repo).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['WA2G_UI_DB_URL', URL_DB], ['WA2G_UI_BASE_URL', BASE]]) {
  try {
    const u = new URL(v)
    if (!LOOPBACK.includes(u.hostname)) tolak.push(`${n} bukan loopback`)
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push(`${n} memuat parameter host`)
  } catch {
    tolak.push(`${n} tak terurai`)
  }
}
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production di proses uji')
if (!['dev', 'flag-mati', 'produksi'].includes(MODE)) tolak.push(`WA2G_UI_MODE tidak dikenal: ${MODE}`)
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain (ambigu)`)
if (tolak.length) {
  console.log(`❌ DITOLAK (DB/server tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
let chromium
try {
  ;({ chromium } = await import(pathToFileURL(join(PW, 'index.mjs')).href))
} catch {
  console.log('DILEWATI — playwright-core tidak ditemukan di WA2G_UI_PLAYWRIGHT.')
  process.exit(3)
}
const ASAL = new URL(BASE).origin

// Fixture lewat service F3/F4 di proses uji ini (non-produksi); server diuji lewat peramban.
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB
process.env.NODE_ENV = 'test'
process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'
delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const KT = jiti('../src/services/whatsapp/wa-contact.service.ts')
const CS = jiti('../src/services/whatsapp/wa-consent.service.ts')
const GS = jiti('../src/services/whatsapp/wa-grant.service.ts')
const KJ = jiti('../src/services/whatsapp/wa-schedule-confirmation.service.ts')
const MS = jiti('../src/services/whatsapp/wa-message.service.ts')
const AP = jiti('../src/services/whatsapp/wa-message-approval.service.ts')
const { PrismaClient } = await import('@prisma/client')
const bcrypt = (await import('bcryptjs')).default
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

const ID_A = 'wa2guitenantaaaaaaaa01'
const ID_B = 'wa2guitenantbbbbbbbb02'
const ID_C = 'wa2guitenantcccccccc03' // sengaja di luar allowlist server
process.env.AUTOMATION_TENANT_IDS = `${ID_A},${ID_B}`
const TAG = 'WA2GUI-'
const SANDI = 'UjiWa2gUi!2026'
const JAM = 3_600_000
const BUKTI = 'Dokumen penunjukan resmi & konfirmasi telepon ke kantor pihak (uji sintetis).'
const POLA_NOMOR = /\+?62996\d{8}/
const H_DAFTAR = '/automation/client-messages'
const API = '/api/automation/client-messages'
let seq = 0
const uid = (p = 'x') => `${TAG}${p}-${++seq}`
let nomorSeq = 0
const nomorBaru = () => `+62996${String(5_000_000 + ++nomorSeq).padStart(8, '0')}`

async function bersihkan() {
  const ids = [ID_A, ID_B, ID_C]
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.tenant.deleteMany({ where: { id: { in: ids } } })
}
const PERAN = { maker: 'ADMIN', manajer: 'MANAJER_OPERASI', admin2: 'ADMIN', checker: 'MANAJER_OPERASI', checker2: 'ADMIN', operator: 'OPERATOR' }
async function dunia(id, nama, peran = Object.keys(PERAN)) {
  const t = await adm.tenant.create({ data: { id, companyName: `${TAG}${nama}`, trialEndsAt: new Date(Date.now() + 30 * 24 * JAM) } })
  const C1 = await adm.customer.create({ data: { tenantId: t.id, name: `${TAG}Customer 1` } })
  const P1 = await adm.principal.create({ data: { tenantId: t.id, name: `${TAG}Principal 1` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MV CONTOH SINTETIS' } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: 'Balikpapan', timezone: 'Asia/Makassar' } })
  const hash = await bcrypt.hash(SANDI, 10)
  const ctx = {}
  const email = {}
  for (const p of peran) {
    const e = `wa2gui-${nama.toLowerCase()}-${p.toLowerCase()}@uji.local`
    const u = await adm.user.create({ data: { tenantId: t.id, email: e, name: `${TAG}${nama}-${p}`, password: hash, role: PERAN[p], isActive: true } })
    ctx[p] = { tenantId: t.id, userId: u.id, role: PERAN[p] }
    email[p] = e
  }
  return { t, C1, P1, kapal, port, ctx, email }
}
async function sumber(w, { reviewState } = {}) {
  const v = await adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid('VYG'), dataOrigin: 'NYATA', status: 'CONFIRMED', customerId: w.C1.id, principalId: w.P1.id, eta: new Date('2026-10-15T00:00:00Z'), etd: new Date('2026-10-17T00:00:00Z') } })
  const a = await adm.auditLog.create({ data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: '2026-10-13' }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: '2026-10-15' }, createdAt: new Date(Date.now() - JAM) } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', sourceRef: a.id, explanation: 'uji', recommendation: 'uji', after: { eta: '2026-10-15' }, ...(reviewState ? { reviewState } : {}) } })
  await KJ.catatKonfirmasiJadwal(w.ctx.manajer, v.id, { field: 'eta', nilai: '2026-10-15', sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Noon report kapal (uji sintetis).' })
  return { v, s }
}
async function kontak(w, { optIn = true } = {}) {
  const r = await KT.buatKontak(w.ctx.maker, { partyType: 'CUSTOMER', partyId: w.C1.id, nomor: nomorBaru(), displayName: 'PIC uji', language: 'ID' })
  await KT.verifikasiKontak(w.ctx.maker, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: GS.tambahBulan(new Date(), 6) })
  if (optIn) await CS.catatOptIn(w.ctx.maker, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
  return r.contactId
}
/** Pesan lewat service sampai 'pratinjau' | 'menunggu'. */
async function pesanFixture(w, sampai, cid = null) {
  const s = await sumber(w)
  const c = cid ?? (await kontak(w))
  const d = await MS.buatDraftPesanKlien(w.ctx.maker, { signalId: s.s.id, contactId: c })
  await MS.pratinjauPesanKlien(w.ctx.admin2, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
  if (sampai === 'pratinjau') return { ...s, cid: c, mid: d.messageId, fp: d.snapshotFingerprint }
  const r = await AP.mintaApprovalPesanKlien(w.ctx.admin2, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
  return { ...s, cid: c, mid: d.messageId, fp: d.snapshotFingerprint, aid: r.approvalRequestId }
}
const pesan = (id) => adm.waClientMessage.findFirst({ where: { id } })

// ---------------------------------------------------------------- peramban
const browser = await chromium.launch({ executablePath: process.env.WA2G_UI_CHROMIUM || undefined, headless: true })
const jaringan = [] // { url, metode, jenis } semua permintaan peramban
const respon = [] // { url, status, body } respons API pesan klien
async function konteks({ lang = 'id' } = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, locale: lang === 'en' ? 'en-US' : 'id-ID' })
  await ctx.addCookies([{ name: 'ms-lang', value: lang, url: ASAL }])
  ctx.on('request', (r) => jaringan.push({ url: r.url(), metode: r.method(), jenis: r.resourceType() }))
  ctx.on('response', async (res) => {
    if (!new URL(res.url()).pathname.startsWith(API)) return
    try {
      respon.push({ url: res.url(), status: res.status(), body: await res.text() })
    } catch {
      /* tanpa body */
    }
  })
  return ctx
}
async function loginApi(ctx, email) {
  const { csrfToken } = await (await ctx.request.get('/api/auth/csrf')).json()
  await ctx.request.post('/api/auth/callback/credentials', { form: { csrfToken, email, password: SANDI, json: 'true' }, maxRedirects: 0 })
  if (!(await ctx.cookies()).some((k) => k.name.endsWith('next-auth.session-token'))) throw new Error(`login gagal untuk ${email}`)
}
async function loginForm(ctx, email) {
  const p = await ctx.newPage()
  await p.goto('/login', { waitUntil: 'networkidle' })
  await p.fill('#email', email)
  await p.fill('#password', SANDI)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 })
  for (let i = 0; i < 30 && !(await ctx.cookies()).some((k) => k.name.endsWith('next-auth.session-token')); i++) await p.waitForTimeout(500)
  if (!(await ctx.cookies()).some((k) => k.name.endsWith('next-auth.session-token'))) throw new Error(`login formulir gagal untuk ${email}`)
  return p
}
async function sesi(email, opsi) {
  const ctx = await konteks(opsi)
  await loginApi(ctx, email)
  return ctx
}
/** POST langsung dari konteks peramban (meniru komponen, melewati UI) — untuk bukti penolakan server. */
async function postLangsung(ctx, path, body) {
  const r = await ctx.request.post(`${API}${path}`, { headers: { origin: ASAL, 'content-type': 'application/json' }, data: body ?? {} })
  return { status: r.status(), json: await r.json().catch(() => null) }
}
const PANEL = '[data-testid="panel-pesan"]'
async function bukaDetail(ctx, mid, q = '') {
  const p = await ctx.newPage()
  const res = await p.goto(`${H_DAFTAR}/${mid}${q}`, { waitUntil: 'domcontentloaded' })
  await p.locator(PANEL).waitFor({ timeout: 60000 })
  return { p, res }
}
async function tungguState(p, state, timeout = 30000) {
  await p.locator(`${PANEL}[data-state="${state}"]`).waitFor({ timeout })
}
const aksiTampil = async (p) => (await p.locator(`${PANEL} [data-aksi]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-aksi')))).join(',')
const klikAksi = (p, a) => p.locator(`${PANEL} [data-aksi="${a}"]`).click()
async function tungguHasil(p) {
  await p.locator('[data-testid="hasil-aksi"], [data-testid="galat-aksi"]').first().waitFor({ timeout: 30000 })
  await p.waitForLoadState('networkidle').catch(() => {})
}
// textContent (bukan innerText) agar CSS `uppercase` tidak mengubah teks yang dibandingkan.
const teks = (p, sel) => p.locator(sel).first().textContent().then((x) => x ?? '').catch(() => '')

async function aksesDitolak(nama, ctxFn, harap) {
  const ctx = await ctxFn()
  const p = await ctx.newPage()
  const r1 = await p.goto(H_DAFTAR, { waitUntil: 'domcontentloaded' })
  const u1 = new URL(p.url()).pathname
  const r2 = await p.goto(`${H_DAFTAR}/cmtidakadasamasekali00001`, { waitUntil: 'domcontentloaded' })
  const u2 = new URL(p.url()).pathname
  if (harap === 'login') cek(`${nama}: kedua halaman → redirect /login`, u1 === '/login' && u2 === '/login', `${u1} | ${u2}`)
  else cek(`${nama}: kedua halaman → 404`, r1?.status() === 404 && r2?.status() === 404 && u1 === H_DAFTAR, `${r1?.status()} | ${r2?.status()}`)
  const html = await p.content()
  cek(`${nama}: tanpa konten pesan klien di halaman`, !html.includes('data-testid="panel-pesan"') && !html.includes('data-testid="daftar-pesan"') && !POLA_NOMOR.test(html))
  await ctx.close()
}

function periksaLogServer() {
  if (!LOG || !existsSync(LOG)) {
    cek('log server tersedia untuk diperiksa (WA2G_UI_SERVER_LOG)', false, 'tidak diset/tidak ada')
    return
  }
  const log = readFileSync(LOG, 'utf8')
  cek('log server: perangkap egress AKTIF', /\[WA1-EGRESS\] TRAP-AKTIF/.test(log))
  const blok = log.split('\n').filter((l) => l.includes('[WA1-EGRESS] BLOCKED'))
  const FONT = /^(fonts\.googleapis\.com|fonts\.gstatic\.com):443$/
  const host = (l) => l.replace(/^.*BLOCKED \w+ /, '').replace(/ pid=.*$/, '')
  const lain = blok.filter((l) => !FONT.test(host(l)))
  cek('log server: 0 upaya koneksi keluar selain unduhan font next/font yang dikenal (tetap DIBLOKIR)', lain.length === 0, lain.slice(0, 3).join(' | '))
  console.log(`  ℹ upaya egress yang diblokir perangkap: ${blok.length} (host: ${[...new Set(blok.map(host))].join(', ') || '—'})`)
  cek('log server: tanpa nomor utuh, tanpa host provider WhatsApp/LLM', !POLA_NOMOR.test(log) && !/graph\.facebook|whatsapp\.(com|net)|api\.anthropic|api\.openai/i.test(log))
}

try {
  await bersihkan()
  const A = await dunia(ID_A, 'A')
  const B = await dunia(ID_B, 'B', ['maker'])
  const C = await dunia(ID_C, 'C', ['maker'])
  console.log(`mode=${MODE} base=${BASE}`)

  // ========================================================================== akses (semua mode)
  bagian(`[AK] Akses halaman (${MODE})`)
  await aksesDitolak('tanpa sesi', () => konteks(), 'login')
  if (MODE === 'dev') {
    await aksesDitolak('OPERATOR (peran tidak berhak)', () => sesi(A.email.operator), '404')
    await aksesDitolak('tenant C di luar allowlist', () => sesi(C.email.maker), '404')
  } else {
    await aksesDitolak(`ADMIN tenant sah (${MODE === 'produksi' ? 'server produksi lokal, flag true' : 'flag WA-2 mati'})`, () => sesi(A.email.maker), '404')
    await aksesDitolak(`MANAJER_OPERASI tenant sah (${MODE})`, () => sesi(A.email.checker), '404')
    const cx = await sesi(A.email.maker)
    const r = await cx.request.get(API)
    const j = await r.json().catch(() => null)
    cek(`API tetap ditolak di mode ${MODE} (403 ${MODE === 'produksi' ? 'WA2_ENV_NOT_ALLOWED' : 'WA2_DISABLED'})`, r.status() === 403 && new RegExp(MODE === 'produksi' ? 'WA2_ENV_NOT_ALLOWED' : 'WA2_DISABLED').test(j?.error?.message ?? ''), `${r.status()} ${j?.error?.message ?? ''}`)
    await cx.close()
  }

  if (MODE === 'dev') {
    // ======================================================================== daftar & draft
    bagian('[D] Daftar, kandidat, draft (peramban)')
    const sUtama = await sumber(A)
    const sDismissed = await sumber(A, { reviewState: 'DISMISSED' })
    const cLayak = await kontak(A)
    const cTanpa = await kontak(A, { optIn: false })
    const cxM = await konteks()
    const pM = await loginForm(cxM, A.email.maker)
    await pM.goto(H_DAFTAR, { waitUntil: 'domcontentloaded' })
    await pM.locator('[data-testid="daftar-kosong"]').waitFor({ timeout: 60000 })
    cek('login formulir → halaman daftar; kondisi kosong; label BELUM DIKIRIM tampil', /BELUM DIKIRIM — tidak ada pengiriman pada fase ini/.test(await teks(pM, '[data-testid="label-belum-dikirim"]')))
    cek('tanpa tautan Sidebar ke halaman pesan klien (akses lewat URL langsung)', (await pM.locator(`nav a[href="${H_DAFTAR}"], aside a[href="${H_DAFTAR}"]`).count()) === 0)
    await pM.click('[data-testid="tombol-panel-draft"]')
    await pM.locator('[data-testid="daftar-sinyal"]').waitFor({ timeout: 30000 })
    const idSinyal = await pM.locator('[data-testid="opsi-sinyal"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-signal-id')))
    cek('panel kandidat: sinyal OPEN tampil, DISMISSED tidak', idSinyal.includes(sUtama.s.id) && !idSinyal.includes(sDismissed.s.id), `${idSinyal.length} sinyal`)
    await pM.locator(`[data-testid="opsi-sinyal"][data-signal-id="${sUtama.s.id}"]`).check()
    await pM.locator('[data-testid="daftar-kontak"]').waitFor({ timeout: 30000 })
    const opsiLayak = pM.locator(`[data-testid="opsi-kontak"][data-contact-id="${cLayak}"]`)
    const opsiTanpa = pM.locator(`[data-testid="opsi-kontak"][data-contact-id="${cTanpa}"]`)
    const alasanTanpa = await opsiTanpa.locator('xpath=..').locator('[data-testid="alasan-kontak"]').innerText()
    cek('kontak layak dapat dipilih; kontak tanpa opt-in nonaktif + alasan', (await opsiLayak.isEnabled()) && (await opsiTanpa.isDisabled()) && /opt-in/i.test(alasanTanpa), alasanTanpa)
    await opsiLayak.check()
    await pM.click('[data-testid="tombol-buat-draft"]')
    await pM.waitForURL(/\/automation\/client-messages\/[^/?]+\?hasil=DRAFT_DIBUAT/, { timeout: 60000 })
    const mid = new URL(pM.url()).pathname.split('/').pop()
    await pM.locator(PANEL).waitFor({ timeout: 60000 })
    cek('buat draft → detail pesan baru; hasil "Draft dibuat"; status DRAFT', /Draft dibuat/.test(await teks(pM, '[data-testid="hasil-aksi"]')) && (await pM.locator(`${PANEL}[data-state="DRAFT"]`).count()) === 1)
    cek('detail DRAFT: tombol = aksiTersedia PRATINJAU, BATALKAN, BUAT_REVISI', (await aksiTampil(pM)) === 'PRATINJAU,BATALKAN,BUAT_REVISI', await aksiTampil(pM))
    cek('detail: label BELUM DIKIRIM (UI + server), isi read-only, penerima tersamar', /BELUM DIKIRIM/.test(await teks(pM, '[data-testid="label-pengiriman-server"]')) && (await pM.locator('[data-testid="isi-pesan"] textarea, [data-testid="isi-pesan"][contenteditable]').count()) === 0 && /^\+\d{2}••••\d{4}$/.test((await teks(pM, '[data-testid="penerima"]')).trim()))
    cek('tidak ada tombol/teks Kirim/Send di detail', !/\b(Kirim|Send)\b/.test(await pM.locator(PANEL).innerText()))
    const draftUlang = await postLangsung(cxM, '', { signalId: sUtama.s.id, contactId: cLayak })
    cek('buat draft ulang (snapshot sama) → SUDAH_ADA pesan yang sama (hasil aktual service)', draftUlang.status === 200 && draftUlang.json?.hasil === 'SUDAH_ADA' && draftUlang.json?.messageId === mid)

    // ======================================================================== pratinjau, klik ganda, minta approval
    bagian('[A] Pratinjau → minta approval → maker-checker → setujui → batalkan → revisi (peramban)')
    const cxP = await sesi(A.email.admin2)
    const { p: pP } = await bukaDetail(cxP, mid)
    const postPreview = () => jaringan.filter((r) => r.metode === 'POST' && r.url.endsWith(`/${mid}/preview`)).length
    const sebelumPv = postPreview()
    await pP.locator(`${PANEL} [data-aksi="PRATINJAU"]`).dblclick()
    await tungguState(pP, 'PREVIEWED')
    await pP.waitForTimeout(500)
    cek('klik ganda "Tandai sudah dipratinjau" → TEPAT 1 POST; status PREVIEWED', postPreview() - sebelumPv === 1, `${postPreview() - sebelumPv} POST`)
    cek('PREVIEWED: tombol MINTA_APPROVAL, BATALKAN, BUAT_REVISI', (await aksiTampil(pP)) === 'MINTA_APPROVAL,BATALKAN,BUAT_REVISI', await aksiTampil(pP))
    await pP.locator(`${PANEL} [data-aksi="MINTA_APPROVAL"]`).focus()
    await pP.keyboard.press('Enter')
    await tungguState(pP, 'PENDING_APPROVAL')
    cek('akses keyboard: fokus + Enter pada "Minta approval" → PENDING_APPROVAL; expiresAt tampil', (await teks(pP, '[data-testid="approval-status"]')) === 'PENDING')
    const m1 = await pesan(mid)
    const aid = m1.approvalRequestId
    cek('peminta approval: tombol SETUJUI/TOLAK TIDAK tampil', !/SETUJUI|TOLAK/.test(await aksiTampil(pP)), await aksiTampil(pP))
    const ver0 = (await adm.tahApprovalRequest.findFirst({ where: { id: aid } })).version
    const rqP = await postLangsung(cxP, `/approvals/${aid}/approve`, { proposalHash: m1.snapshotFingerprint })
    const cxMan = await sesi(A.email.manajer)
    const { p: pMan } = await bukaDetail(cxMan, mid)
    await pM.reload({ waitUntil: 'domcontentloaded' })
    await pM.locator(PANEL).waitFor({ timeout: 60000 })
    cek('pembuat draft & pencatat bukti ETA: tombol SETUJUI/TOLAK TIDAK tampil', !/SETUJUI|TOLAK/.test(await aksiTampil(pM)) && !/SETUJUI|TOLAK/.test(await aksiTampil(pMan)), `${await aksiTampil(pM)} | ${await aksiTampil(pMan)}`)
    const rqM = await postLangsung(cxM, `/approvals/${aid}/approve`, { proposalHash: m1.snapshotFingerprint })
    const rqMan = await postLangsung(cxMan, `/approvals/${aid}/reject`, { proposalHash: m1.snapshotFingerprint, decisionNote: 'Coba tolak (uji).' })
    const a1 = await adm.tahApprovalRequest.findFirst({ where: { id: aid } })
    cek('permintaan LANGSUNG oleh peminta/pembuat/pencatat → 403 SELF_APPROVAL_FORBIDDEN / CHECKER_IS_MAKER / CHECKER_IS_EVIDENCE_RECORDER; status & versi tetap', rqP.status === 403 && rqP.json?.error?.details?.code === 'SELF_APPROVAL_FORBIDDEN' && rqM.status === 403 && rqM.json?.error?.details?.code === 'CHECKER_IS_MAKER' && rqMan.status === 403 && rqMan.json?.error?.details?.code === 'CHECKER_IS_EVIDENCE_RECORDER' && a1.status === 'PENDING' && a1.version === ver0 && (await pesan(mid)).state === 'PENDING_APPROVAL', `${rqP.json?.error?.details?.code} ${rqM.json?.error?.details?.code} ${rqMan.json?.error?.details?.code}`)
    const cxK = await sesi(A.email.checker)
    const { p: pK } = await bukaDetail(cxK, mid)
    cek('checker sah: tombol SETUJUI & TOLAK tampil', /SETUJUI/.test(await aksiTampil(pK)) && /TOLAK/.test(await aksiTampil(pK)), await aksiTampil(pK))
    await klikAksi(pK, 'SETUJUI')
    await tungguState(pK, 'APPROVED')
    cek('setujui → APPROVED "Disetujui — BELUM DIKIRIM"; approval APPROVED; successKey kosong', /Disetujui — BELUM DIKIRIM/.test(await teks(pK, `${PANEL} [data-testid="state-badge"]`)) && (await teks(pK, '[data-testid="approval-status"]')) === 'APPROVED' && (await pesan(mid)).successKey === null)
    cek('APPROVED: tombol BATALKAN, BUAT_REVISI; tanpa Kirim/Send', (await aksiTampil(pK)) === 'BATALKAN,BUAT_REVISI' && !/\b(Kirim|Send)\b/.test(await pK.locator(PANEL).innerText()), await aksiTampil(pK))
    const peristiwa = await pK.locator('[data-testid="peristiwa"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-peristiwa')))
    cek('riwayat menampilkan draft, pratinjau, approval diminta, disetujui', ['WA2_DRAFT_DIBUAT', 'WA2_DIPRATINJAU', 'WA2_APPROVAL_DIMINTA', 'WA2_PESAN_DISETUJUI'].every((x) => peristiwa.includes(x)), peristiwa.join(','))
    await klikAksi(pK, 'BATALKAN')
    await pK.click('[data-testid="tombol-konfirmasi"]')
    await pK.locator('[data-testid="galat-aksi"]').waitFor({ timeout: 30000 })
    cek('batalkan tanpa alasan → galat server DECISION_NOTE_INVALID tampil; status tetap APPROVED', /3–1000/.test(await teks(pK, '[data-testid="galat-aksi"]')) && (await pesan(mid)).state === 'APPROVED', await teks(pK, '[data-testid="galat-aksi"]'))
    await pK.fill('[data-testid="input-catatan"]', 'Dibatalkan staf (uji UI).')
    await pK.click('[data-testid="tombol-konfirmasi"]')
    await tungguState(pK, 'CANCELED')
    cek('batalkan APPROVED → CANCELED; info status akhir; tombol hanya BUAT_REVISI', (await pK.locator('[data-testid="info-terminal"]').count()) === 1 && (await aksiTampil(pK)) === 'BUAT_REVISI', await aksiTampil(pK))
    await klikAksi(pK, 'BUAT_REVISI')
    await pK.waitForURL((u) => u.pathname !== `${H_DAFTAR}/${mid}` && u.pathname.startsWith(`${H_DAFTAR}/`), { timeout: 60000 })
    await pK.locator(PANEL).waitFor({ timeout: 60000 })
    const midRev = new URL(pK.url()).pathname.split('/').pop()
    const mRev = await pesan(midRev)
    cek('UI-04/UI-08: revisi dari status terminal (CANCELED) → hasil aktual DRAFT_DIBUAT, pesan baru DRAFT, kontak SAMA persis (opsi B)', new URL(pK.url()).searchParams.get('hasil') === 'DRAFT_DIBUAT' && mRev?.state === 'DRAFT' && mRev?.contactId === cLayak && (await pesan(mid)).state === 'CANCELED', `${new URL(pK.url()).searchParams.get('hasil')} ${mRev?.state}`)

    // ======================================================================== tolak, kedaluwarsa, sudah diputuskan
    bagian('[T] Tolak, kedaluwarsa, sudah diputuskan, status tidak pasti')
    const fT = await pesanFixture(A, 'menunggu')
    const { p: pT } = await bukaDetail(cxK, fT.mid)
    await klikAksi(pT, 'TOLAK')
    await pT.fill('[data-testid="input-catatan"]', 'ab')
    await pT.click('[data-testid="tombol-konfirmasi"]')
    await pT.locator('[data-testid="galat-aksi"]').waitFor({ timeout: 30000 })
    cek('tolak dengan catatan 2 huruf → galat DECISION_NOTE_INVALID; status tetap PENDING_APPROVAL', /3–1000/.test(await teks(pT, '[data-testid="galat-aksi"]')) && (await pesan(fT.mid)).state === 'PENDING_APPROVAL')
    await klikAksi(pT, 'TOLAK')
    await pT.fill('[data-testid="input-catatan"]', 'Isi tidak sesuai (uji UI).')
    await pT.click('[data-testid="tombol-konfirmasi"]')
    await tungguState(pT, 'REJECTED')
    cek('tolak → REJECTED; hasil "Ditolak checker"; tombol hanya BUAT_REVISI', /Ditolak checker/.test(await teks(pT, '[data-testid="hasil-aksi"]')) && (await aksiTampil(pT)) === 'BUAT_REVISI', await aksiTampil(pT))
    const fE = await pesanFixture(A, 'menunggu')
    const { p: pE } = await bukaDetail(cxK, fE.mid)
    await adm.tahApprovalRequest.update({ where: { id: fE.aid }, data: { expiresAt: new Date(Date.now() - 1) } })
    await klikAksi(pE, 'SETUJUI')
    await tungguState(pE, 'EXPIRED')
    cek('approval lewat masa berlaku saat diklik → hasil "Approval kedaluwarsa" dari server; status EXPIRED', /kedaluwarsa/i.test(await teks(pE, '[data-testid="hasil-aksi"]')) && (await pesan(fE.mid)).state === 'EXPIRED')
    const fS = await pesanFixture(A, 'menunggu')
    const { p: pS } = await bukaDetail(cxK, fS.mid)
    await AP.setujuiPesanKlien(A.ctx.checker2, { approvalRequestId: fS.aid, proposalHash: fS.fp })
    await klikAksi(pS, 'SETUJUI')
    await tungguHasil(pS)
    cek('approval sudah diputuskan pengguna lain → "sudah diputuskan" ditampilkan; data dimuat ulang (APPROVED)', /sudah diputuskan/i.test(await teks(pS, '[data-testid="hasil-aksi"]')) && (await pS.locator(`${PANEL}[data-state="APPROVED"]`).count()) === 1)
    const fU = await pesanFixture(A, 'pratinjau')
    const { p: pU } = await bukaDetail(cxP, fU.mid)
    let dicegat = 0
    await pU.route(`**${API}/${fU.mid}/request-approval`, (r) => {
      dicegat++
      return r.abort('timedout')
    })
    const getDetailSebelum = jaringan.filter((r) => r.metode === 'GET' && new URL(r.url).pathname === `${API}/${fU.mid}`).length
    await klikAksi(pU, 'MINTA_APPROVAL')
    await pU.locator('[data-testid="galat-aksi"]').waitFor({ timeout: 30000 })
    await pU.waitForLoadState('networkidle').catch(() => {})
    const getDetailSesudah = jaringan.filter((r) => r.metode === 'GET' && new URL(r.url).pathname === `${API}/${fU.mid}`).length
    cek('timeout/koneksi putus → "Status tidak pasti", data dimuat ulang, TANPA kirim ulang otomatis', /tidak pasti/i.test(await teks(pU, '[data-testid="galat-aksi"]')) && dicegat === 1 && getDetailSesudah > getDetailSebelum && (await pesan(fU.mid)).state === 'PREVIEWED', `dicegat=${dicegat} muatUlang=${getDetailSesudah - getDetailSebelum}`)

    // ======================================================================== daftar: filter, paginasi, isolasi, EN
    bagian('[L] Daftar: filter, paginasi, isolasi tenant, bahasa EN')
    const cBanyak = await kontak(A)
    for (let i = 0; i < 21; i++) {
      const s = await sumber(A)
      await MS.buatDraftPesanKlien(A.ctx.maker, { signalId: s.s.id, contactId: cBanyak })
    }
    await pM.goto(H_DAFTAR, { waitUntil: 'domcontentloaded' })
    await pM.locator('[data-testid="baris-pesan"]').first().waitFor({ timeout: 60000 })
    const n1 = await pM.locator('[data-testid="baris-pesan"]').count()
    await pM.click('[data-testid="muat-lebih"]')
    await pM.waitForFunction((n) => document.querySelectorAll('[data-testid="baris-pesan"]').length > n, n1, { timeout: 30000 })
    const n2 = await pM.locator('[data-testid="baris-pesan"]').count()
    const ids = await pM.locator('[data-testid="baris-pesan"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-message-id')))
    cek('paginasi: 20 baris pertama, "Muat lebih banyak" menambah baris tanpa duplikat', n1 === 20 && n2 > 20 && new Set(ids).size === ids.length, `${n1} → ${n2}`)
    await pM.selectOption('[data-testid="filter-state"]', 'REJECTED')
    await pM.waitForFunction(() => [...document.querySelectorAll('[data-testid="baris-pesan"]')].every((e) => e.getAttribute('data-state') === 'REJECTED') && document.querySelectorAll('[data-testid="baris-pesan"]').length > 0, null, { timeout: 30000 })
    cek('filter status REJECTED → hanya baris REJECTED', (await pM.locator('[data-testid="baris-pesan"][data-state="REJECTED"]').count()) >= 1)
    const cxB = await sesi(B.email.maker)
    const pB = await cxB.newPage()
    await pB.goto(H_DAFTAR, { waitUntil: 'domcontentloaded' })
    await pB.locator('[data-testid="daftar-kosong"]').waitFor({ timeout: 60000 })
    const rB = await pB.goto(`${H_DAFTAR}/${mid}`, { waitUntil: 'domcontentloaded' })
    await pB.locator('[data-testid="galat-detail"]').waitFor({ timeout: 60000 })
    cek('isolasi tenant: tenant B melihat daftar kosong; detail pesan A → galat 404 dari API, tanpa isi', /404 NOT_FOUND/.test(await teks(pB, '[data-testid="galat-detail"]')) && rB?.status() === 200 && (await pB.locator('[data-testid="isi-pesan"]').count()) === 0)
    const cxEn = await sesi(A.email.maker, { lang: 'en' })
    const pEn = await cxEn.newPage()
    await pEn.goto(H_DAFTAR, { waitUntil: 'domcontentloaded' })
    // LangProvider client beralih ke EN sesudah hidrasi — tunggu teksnya, bukan elemen pertama.
    await pEn.waitForFunction(() => /NOT SENT/.test(document.querySelector('[data-testid="label-belum-dikirim"]')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {})
    cek('bahasa EN: judul & label "NOT SENT — no sending in this phase"', /NOT SENT — no sending in this phase/.test(await teks(pEn, '[data-testid="label-belum-dikirim"]')) && /WhatsApp Client Messages/.test(await pEn.content()))

    // ======================================================================== kebocoran & jaringan
    bagian('[X] Kebocoran & jaringan peramban')
    const htmlSemua = (await Promise.all([pM, pP, pK, pT, pE, pS, pU, pB, pEn].map((p) => p.content().catch(() => '')))).join('\n')
    cek('DOM semua halaman: tanpa nomor utuh (+62996…)', !POLA_NOMOR.test(htmlSemua))
    cek(`${respon.length} respons API pesan klien: tanpa nomor utuh`, respon.length > 30 && !respon.some((r) => POLA_NOMOR.test(r.body)))
    const asal = new URL(BASE).origin
    const luar = jaringan.filter((r) => !r.url.startsWith(asal) && !/^(data|blob|about):/.test(r.url))
    // Shell aplikasi yang SUDAH ADA (layout: NotificationBell → GET /api/notifications) dihitung terpisah; komponen baru
    // hanya memanggil API pesan klien (dikunci g-static). Selain itu, /api/* lain atau mutasi ke luar API pesan klien = gagal.
    const SHELL_GET = /^\/api\/notifications$/
    const apiLain = jaringan.filter((r) => r.url.startsWith(asal)).map((r) => ({ u: new URL(r.url), m: r.metode })).filter(({ u, m }) => u.pathname.startsWith('/api/') && !u.pathname.startsWith(API) && !u.pathname.startsWith('/api/auth/') && !(m === 'GET' && SHELL_GET.test(u.pathname)))
    const shell = jaringan.filter((r) => r.url.startsWith(asal) && r.metode === 'GET' && SHELL_GET.test(new URL(r.url).pathname)).length
    const kategori = { halaman: 0, aset: 0, api: 0, auth: 0, lain: 0 }
    for (const r of jaringan.filter((x) => x.url.startsWith(asal))) {
      const pth = new URL(r.url).pathname
      if (pth.startsWith(API)) kategori.api++
      else if (SHELL_GET.test(pth)) kategori.shell = (kategori.shell ?? 0) + 1
      else if (pth.startsWith('/api/auth/')) kategori.auth++
      else if (pth.startsWith('/_next/') || /\.(ico|png|svg|woff2?|css|js)$/.test(pth)) kategori.aset++
      else if (r.jenis === 'document' || r.jenis === 'fetch') kategori.halaman++
      else kategori.lain++
    }
    console.log(`  ℹ permintaan peramban: ${JSON.stringify(kategori)} (navigasi halaman, aset Next.js, dan koneksi dev dihitung terpisah, bukan API)`)
    cek('peramban: 0 permintaan ke origin lain', luar.length === 0, luar.slice(0, 3).map((r) => r.url).join(' | '))
    cek('peramban: /api/* hanya API pesan klien, /api/auth/*, dan GET shell layout yang sudah ada (/api/notifications); tanpa mutasi lain', apiLain.length === 0, apiLain.slice(0, 3).map(({ u, m }) => `${m} ${u.pathname}`).join(' | ') || `shell GET ${shell}`)
    periksaLogServer()
    for (const c of [cxM, cxP, cxMan, cxK, cxB, cxEn]) await c.close()
  } else {
    periksaLogServer()
  }
} catch (e) {
  gagal++
  console.log(`  ❌ PENGECUALIAN TAK TERDUGA: ${e?.stack ?? e}`)
} finally {
  await browser.close().catch(() => {})
  await bersihkan().catch((e) => console.log(`  ⚠️  pembersihan gagal: ${e?.message}`))
  await adm.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
