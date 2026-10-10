// Uji UI end-to-end Step 2I — Komunikasi (Simulasi) di peramban nyata (Playwright + Chromium).
//
// Jalur NYATA: login lewat formulir, halaman server, komponen client, API Step 2H, DB. Jalankan
// TERHADAP `next dev` (bukan `next start` — NODE_ENV=production ditolak gerbang WA-1 / D-12) yang memakai
// PostgreSQL loopback sekali pakai SAMA dengan COMM_UI_DB_URL. Origin peramban HARUS = origin NEXTAUTH_URL
// server (pagar CSRF Step 2H), jadi COMM_UI_BASE_URL = NEXTAUTH_URL:
//
//   DATABASE_URL=$U DIRECT_URL=$U NEXTAUTH_URL=http://localhost:3100 NEXTAUTH_SECRET=<acak> \
//   AUTOMATION_MONITORING_ENABLED=true WA1_INTERNAL_FAKE_TEST_ENABLED=true NEXT_TELEMETRY_DISABLED=1 \
//   AUTOMATION_TENANT_IDS=wa1s2iuitenantaaaaaaa01,wa1s2iuitenantbbbbbbb02 \
//     npx next dev -p 3100
//   COMM_UI_DB_URL=$U COMM_UI_BASE_URL=http://localhost:3100 \
//   COMM_UI_PLAYWRIGHT=/jalur/ke/node_modules/playwright-core COMM_UI_CHROMIUM=/jalur/ke/chrome \
//     node prisma/check-comm-ui.mjs
//
// playwright-core SENGAJA tidak menjadi dependensi repo (tanpa perubahan lockfile); tanpa COMM_UI_* atau
// tanpa playwright-core → DILEWATI (kode 3). DB & server WAJIB loopback. Semua tenant ber-id tetap di bawah
// dan dihapus di akhir.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { join } from 'node:path'
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
const URL_DB = process.env.COMM_UI_DB_URL
const BASE = process.env.COMM_UI_BASE_URL
const PW = process.env.COMM_UI_PLAYWRIGHT
if (!URL_DB || !BASE || !PW) {
  console.log('DILEWATI — COMM_UI_DB_URL, COMM_UI_BASE_URL, dan COMM_UI_PLAYWRIGHT wajib diset (DB & next dev loopback).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['COMM_UI_DB_URL', URL_DB], ['COMM_UI_BASE_URL', BASE]]) {
  try {
    const u = new URL(v)
    if (!LOOPBACK.includes(u.hostname)) tolak.push(`${n} bukan loopback`)
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push(`${n} memuat parameter host`)
  } catch {
    tolak.push(`${n} tak terurai`)
  }
}
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production')
if (tolak.length) {
  console.log(`❌ DITOLAK (DB/server tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
let chromium
try {
  ;({ chromium } = await import(pathToFileURL(join(PW, 'index.mjs')).href))
} catch {
  console.log('DILEWATI — playwright-core tidak ditemukan di COMM_UI_PLAYWRIGHT.')
  process.exit(3)
}
const ASAL = new URL(BASE).origin
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

// Id tetap — server dijalankan dengan AUTOMATION_TENANT_IDS = A,B (C sengaja di luar allowlist).
const ID_A = 'wa1s2iuitenantaaaaaaa01'
const ID_B = 'wa1s2iuitenantbbbbbbb02'
const ID_C = 'wa1s2iuitenantccccccc03'
const TAG = 'WA1S2I-'
const SANDI = 'UjiWa1s2iUi!2026'
const WAKTU = '2026-10-05T02:30:00.000Z'
const PENGENAL_UTUH = /TEST_FIXTURE_WA_\d+/
const SAMARAN_SUKSES = 'TEST•••01'
let seq = 0
const uid = () => `${TAG}${++seq}`

// ------------------------------------------------------------------ data
async function bersihkan() {
  const ids = [ID_A, ID_B, ID_C]
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.tenant.deleteMany({ where: { id: { in: ids } } })
}
async function dunia(id, nama, peran) {
  const t = await adm.tenant.create({ data: { id, companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: `MT Contoh UI ${nama}` } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: `Pelabuhan Uji UI ${nama}`, timezone: 'Asia/Makassar' } })
  const hash = await bcrypt.hash(SANDI, 10)
  const email = {}
  for (const r of peran) {
    const e = `wa1s2i-${nama.toLowerCase()}-${r.toLowerCase()}@uji.local`
    await adm.user.create({ data: { tenantId: t.id, email: e, name: `${TAG}${nama}-${r}`, password: hash, role: r, isActive: true } })
    email[r] = e
  }
  return { t, kapal, port, email }
}
async function voyage(w) {
  return adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid() } })
}
/** Sinyal dengan `explanation` unik (penanda baris di halaman Alerts). */
async function sinyal(w, v, penanda, { kind = 'OPERATIONAL_EVENT_RECORDED', eventCode = 'EOSP', after, sourceType = 'VOYAGE_EVENT', sourceRef } = {}) {
  let ref = sourceRef
  if (!ref && sourceType === 'VOYAGE_EVENT') {
    const ev = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode, occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
    ref = ev.id
  }
  return adm.monitoringSignal.create({
    data: {
      tenantId: w.t.id, voyageId: v.id, kind, severity: 'INFO', dedupeKey: uid(), sourceType, sourceRef: ref ?? null,
      explanation: penanda, recommendation: 'uji', after: after ?? { eventCode, occurredAt: WAKTU },
    },
  })
}

// ------------------------------------------------------------------ peramban
const browser = await chromium.launch({ executablePath: process.env.COMM_UI_CHROMIUM || undefined, headless: true })
const halaman = [] // untuk diagnosis saat pengecualian
// Paket demo Step 2J: COMM_UI_SCREENSHOT_DIR=<folder> → tangkapan layar halaman penuh di langkah kunci (opsional).
const DIR_FOTO = process.env.COMM_UI_SCREENSHOT_DIR
async function foto(p, nama) {
  if (DIR_FOTO) await p.screenshot({ path: join(DIR_FOTO, `${nama}.png`), fullPage: true }).catch((e) => console.log(`  ⚠ foto ${nama} gagal: ${e?.message}`))
}
const rekamanApi = [] // { url, status, body } semua respons API komunikasi (untuk pemeriksaan data sensitif)
async function konteks() {
  const ctx = await browser.newContext({ baseURL: BASE, locale: 'id-ID' })
  ctx.on('page', (p) => halaman.push(p))
  ctx.on('response', async (res) => {
    if (!res.url().includes('/api/automation/communications')) return
    try {
      rekamanApi.push({ url: res.url(), metode: res.request().method(), status: res.status(), body: await res.text() })
    } catch {
      /* respons redirect/tanpa body */
    }
  })
  return ctx
}
/** Login lewat endpoint credentials NextAuth di konteks (kuki dibagi dengan halaman). */
async function loginApi(ctx, email) {
  const { csrfToken } = await (await ctx.request.get('/api/auth/csrf')).json()
  await ctx.request.post('/api/auth/callback/credentials', { form: { csrfToken, email, password: SANDI, json: 'true' }, maxRedirects: 0 })
  const kuki = await ctx.cookies()
  if (!kuki.some((k) => k.name.endsWith('next-auth.session-token'))) throw new Error(`login gagal untuk ${email}`)
}
/** Login lewat FORMULIR halaman /login (jalur pengguna nyata). */
async function loginForm(ctx, email) {
  const p = await ctx.newPage()
  await p.goto('/login', { waitUntil: 'networkidle' }) // tunggu hidrasi: formulir dikirim lewat signIn(), bukan submit HTML
  await p.fill('#email', email)
  await p.fill('#password', SANDI)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
  for (let i = 0; i < 30 && !(await ctx.cookies()).some((k) => k.name.endsWith('next-auth.session-token')); i++) await p.waitForTimeout(500)
  if (!(await ctx.cookies()).some((k) => k.name.endsWith('next-auth.session-token'))) throw new Error(`login formulir gagal untuk ${email}`)
  return p
}
/** POST API dari konteks peramban dengan Origin aplikasi (meniru komponen client). */
async function postApi(ctx, path, body) {
  const r = await ctx.request.post(`/api/automation/communications${path}`, { headers: { origin: ASAL, 'content-type': 'application/json' }, data: body ?? {} })
  return { status: r.status(), json: await r.json().catch(() => null) }
}
const PANEL = '[data-testid="panel-pesan"]'
const stateDi = (p) => p.locator(`${PANEL} [data-testid="state-badge"]`).first()
async function tungguState(p, state, timeout = 30000) {
  await p.locator(`${PANEL} [data-testid="state-badge"][data-state="${state}"]`).first().waitFor({ timeout })
}
const tombol = (p, teks) => p.locator('button', { hasText: teks })
async function idCandidateDariUrl(p) {
  await p.waitForURL(/\/automation\/communications\/[^/]+$/, { timeout: 30000 })
  return new URL(p.url()).pathname.split('/').pop()
}

try {
  await bersihkan()
  const A = await dunia(ID_A, 'A', ['ADMIN', 'MANAJER_OPERASI', 'OPERATOR'])
  const B = await dunia(ID_B, 'B', ['ADMIN'])
  const C = await dunia(ID_C, 'C', ['ADMIN'])

  const v1 = await voyage(A)
  const sEosp = await sinyal(A, v1, 'UJI-UI-EOSP-UTAMA')
  await sinyal(A, v1, 'UJI-UI-ETA', { kind: 'ETA_CHANGED', sourceType: 'AUDIT_LOG', sourceRef: 'audit-uji-tidak-ada', after: { eta: '2026-10-07' } })
  await sinyal(A, v1, 'UJI-UI-ALLFAST', { eventCode: 'ALL_FAST' })
  await sinyal(A, v1, 'UJI-UI-SAILED', { eventCode: 'SAILED' })
  await sinyal(A, v1, 'UJI-UI-NONPILOT-COMMENCED', { eventCode: 'COMMENCED' })
  await sinyal(A, v1, 'UJI-UI-NONPILOT-ACTUALMISSING', { kind: 'ACTUAL_DATE_MISSING', sourceType: 'VOYAGE', sourceRef: v1.id, after: { ata: null, eventCode: 'EOSP' } })
  await sinyal(A, v1, 'UJI-UI-NONPILOT-STATUS', { kind: 'VOYAGE_STATUS_CHANGED', sourceType: 'VOYAGE', sourceRef: v1.id, after: { status: 'IN_PROGRESS' } })
  const v2 = await voyage(A)
  await sinyal(A, v2, 'UJI-UI-EOSP-BATAL')
  const v3 = await voyage(A)
  await sinyal(A, v3, 'UJI-UI-EOSP-GAGAL')
  const vB = await voyage(B)
  const sB = await sinyal(B, vB, 'UJI-UI-EOSP-B')

  const cxAdmin = await konteks()
  const cxMo = await konteks()
  const cxOp = await konteks()
  const cxB = await konteks()
  const cxC = await konteks()
  const pAdmin = await loginForm(cxAdmin, A.email.ADMIN)
  await loginApi(cxMo, A.email.MANAJER_OPERASI)
  await loginApi(cxOp, A.email.OPERATOR)
  await loginApi(cxB, B.email.ADMIN)
  await loginApi(cxC, C.email.ADMIN)
  cek('login ADMIN lewat formulir /login + 4 sesi lain', true)

  // ---------------------------------------------------------------- 1
  bagian('1. Alerts — tombol "Siapkan Update Klien" HANYA untuk 4 event pilot')
  await pAdmin.goto('/automation/alerts')
  await pAdmin.locator('li', { hasText: 'UJI-UI-EOSP-UTAMA' }).first().waitFor({ timeout: 30000 })
  const tombolSiap = async (penanda) => pAdmin.locator('li', { hasText: penanda }).locator('[data-testid="siapkan-update"]').count()
  for (const pn of ['UJI-UI-EOSP-UTAMA', 'UJI-UI-ETA', 'UJI-UI-ALLFAST', 'UJI-UI-SAILED']) cek(`pilot ${pn}: tombol tampil`, (await tombolSiap(pn)) === 1)
  for (const pn of ['UJI-UI-NONPILOT-COMMENCED', 'UJI-UI-NONPILOT-ACTUALMISSING', 'UJI-UI-NONPILOT-STATUS']) cek(`non-pilot ${pn}: TANPA tombol`, (await tombolSiap(pn)) === 0)
  cek('sidebar ADMIN: menu "Komunikasi (Simulasi)" ada', (await pAdmin.locator('a[href="/automation/communications"]', { hasText: 'Komunikasi (Simulasi)' }).count()) >= 1)
  await foto(pAdmin, '01-alerts-tombol-siapkan-update')

  // ---------------------------------------------------------------- 2
  bagian('2. Prepare → Revise → Preview (snapshot tersimpan, penerima tersamar)')
  await pAdmin.locator('li', { hasText: 'UJI-UI-EOSP-UTAMA' }).locator('[data-testid="siapkan-update"]').click()
  const cid = await idCandidateDariUrl(pAdmin)
  const cDb = await adm.communicationCandidate.findUnique({ where: { id: cid } })
  cek('Prepare dari UI → candidate tersimpan untuk sinyal itu (tenant A)', cDb?.tenantId === ID_A && cDb?.voyageId === v1.id && cDb?.sourceRef === sEosp.sourceRef, cid)
  await pAdmin.locator('[data-testid="label-simulasi"]').first().waitFor()
  cek('ruang kerja: label "SIMULASI — TIDAK DIKIRIM KE WHATSAPP" tampil', (await pAdmin.locator('[data-testid="label-simulasi"]').first().innerText()).includes('SIMULASI — TIDAK DIKIRIM KE WHATSAPP'))
  await foto(pAdmin, '02-ruang-kerja-label-simulasi')
  const opsi = await pAdmin.locator('[data-testid="pilih-fixture"] option').allInnerTexts()
  cek('pilihan penerima = fixture saja, tersamar (tanpa pengenal utuh)', opsi.length >= 1 && opsi.every((o) => o.includes('TEST_FIXTURE') && o.includes('•••') && !PENGENAL_UTUH.test(o)), opsi.join(' | '))
  cek('tanpa input nomor bebas / editor body (tak ada input teks/tel/textarea di ruang kerja)', (await pAdmin.locator('input[type="tel"], input[type="text"], input:not([type]), textarea, [contenteditable="true"]').count()) === 0)

  await pAdmin.selectOption('[data-testid="pilih-fixture"]', 'WA1_TEST_FIXTURE_SUCCESS')
  await pAdmin.selectOption('[data-testid="pilih-bahasa"]', 'ID')
  await tombol(pAdmin, 'Buat revisi').click()
  await tungguState(pAdmin, 'DRAFT')
  cek('revisi #1 → DRAFT', true)
  // Fakta "terbaru" diubah di DB SETELAH snapshot — pratinjau harus tetap memakai snapshot tersimpan.
  await adm.vessel.update({ where: { id: A.kapal.id }, data: { name: 'MT DIUBAH SETELAH SNAPSHOT' } })
  await tombol(pAdmin, 'Buat revisi').click()
  await pAdmin.locator(`${PANEL} >> text=#2`).waitFor({ timeout: 30000 })
  await adm.vessel.update({ where: { id: A.kapal.id }, data: { name: 'MT FAKTA TERBARU' } })
  await pAdmin.reload()
  await tungguState(pAdmin, 'DRAFT')
  const fakta = await pAdmin.locator('[data-testid="fakta-snapshot"]').innerText()
  cek('pratinjau: fakta dari SNAPSHOT revisi #2 (bukan fakta terbaru di DB)', fakta.includes('MT DIUBAH SETELAH SNAPSHOT') && !fakta.includes('MT FAKTA TERBARU') && fakta.includes('Pelabuhan Uji UI A') && fakta.includes('EOSP'), fakta.replace(/\s+/g, ' ').slice(0, 200))
  const msgs = await adm.communicationMessage.findMany({ where: { candidateId: cid }, orderBy: { revision: 'asc' } })
  cek('Revise: 2 revisi; revisi lama tak lagi aktif', msgs.length === 2 && msgs[0].state !== 'DRAFT', msgs.map((m) => `${m.revision}:${m.state}:${m.reasonCode}`).join(' '))
  const isi = await pAdmin.locator('[data-testid="isi-pesan"]').innerText()
  cek('isi pesan di UI = body tersimpan revisi terbaru (persis)', isi === msgs[1].body)
  cek('penerima TERSAMAR secara default', (await pAdmin.locator('[data-testid="penerima"]').innerText()) === SAMARAN_SUKSES)
  cek('HTML halaman tanpa pengenal utuh secara default', !PENGENAL_UTUH.test(await pAdmin.content()))

  await tombol(pAdmin, 'Tandai sudah dipratinjau').click()
  await tungguState(pAdmin, 'PREVIEWED')
  cek('Preview → PREVIEWED', true)
  await foto(pAdmin, '03-pratinjau-snapshot-tersamar')

  // ---------------------------------------------------------------- 3
  bagian('3. Approval (fakta berubah → stale; disetujui MANAJER_OPERASI)')
  // Fakta sumber berubah setelah snapshot → server menolak approval (APPROVAL_STALE) dan revisi gugur.
  await tombol(pAdmin, 'Minta approval').click()
  await tungguState(pAdmin, 'CANCELED')
  cek('fakta berubah setelah snapshot → Minta approval ditolak APPROVAL_STALE, revisi #2 gugur', (await pAdmin.locator('[data-testid="hasil-aksi"]').innerText()).includes('Approval sudah tidak berlaku'))
  await tombol(pAdmin, 'Buat revisi').click()
  await pAdmin.locator(`${PANEL} >> text=#3`).waitFor({ timeout: 30000 })
  await tungguState(pAdmin, 'DRAFT')
  cek('revisi #3 memakai snapshot fakta terbaru', (await pAdmin.locator('[data-testid="fakta-snapshot"]').innerText()).includes('MT FAKTA TERBARU'))
  await tombol(pAdmin, 'Tandai sudah dipratinjau').click()
  await tungguState(pAdmin, 'PREVIEWED')
  await tombol(pAdmin, 'Minta approval').click()
  await pAdmin.locator('[data-testid="info-approval"]', { hasText: 'PENDING' }).waitFor({ timeout: 30000 })
  cek('Minta approval → PENDING', true)
  await foto(pAdmin, '04-menunggu-approval')
  const pMo = await cxMo.newPage()
  await pMo.goto(`/automation/communications/${cid}`)
  await tungguState(pMo, 'PREVIEWED')
  await tombol(pMo, 'Setujui').click()
  await pMo.locator('[data-testid="dialog-aksi"] textarea').fill('Disetujui uji UI')
  await pMo.locator('[data-testid="dialog-aksi"] button', { hasText: 'Konfirmasi' }).click()
  await tungguState(pMo, 'APPROVED')
  const apr = await adm.tahApprovalRequest.findFirst({ where: { tenantId: ID_A, status: 'APPROVED' }, orderBy: { createdAt: 'desc' } })
  const mo = await adm.user.findFirst({ where: { email: A.email.MANAJER_OPERASI } })
  cek('MANAJER_OPERASI menyetujui → APPROVED; pemutus & catatan tercatat', apr?.decidedByUserId === mo?.id && apr?.decisionNote === 'Disetujui uji UI')
  await foto(pMo, '05-disetujui-manajer-operasi')

  // ---------------------------------------------------------------- 4
  bagian('4. FAKE Send — klik ganda tetap SATU kiriman')
  await pAdmin.reload()
  await tungguState(pAdmin, 'APPROVED')
  const kirim = []
  pAdmin.on('request', (r) => {
    if (r.method() === 'POST' && /\/messages\/[^/]+\/send$/.test(r.url())) kirim.push(r.postData())
  })
  // Dua klik SINKRON di event loop yang sama (sebelum React sempat me-render disabled) + dblclick.
  await pAdmin.locator('[data-testid="tombol-fake-send"]').evaluate((el) => {
    el.click()
    el.click()
  })
  await pAdmin.locator('[data-testid="tombol-fake-send"]').dblclick({ timeout: 2000 }).catch(() => {})
  await tungguState(pAdmin, 'FAKE_SENT')
  await pAdmin.waitForTimeout(1000)
  const mAkhir = await adm.communicationMessage.findFirst({ where: { candidateId: cid }, orderBy: { revision: 'desc' }, include: { attempts: true } })
  cek('klik ganda → hanya 1 POST /send dari UI', kirim.length === 1, `${kirim.length} POST`)
  cek('DB: FAKE_SENT dengan TEPAT 1 attempt, simulation=true, externalDelivery=false', mAkhir?.state === 'FAKE_SENT' && mAkhir.attempts.length === 1 && mAkhir.attempts[0].simulation === true && mAkhir.attempts[0].externalDelivery === false, `${mAkhir?.state} / ${mAkhir?.attempts.length}`)
  cek('panel FAKE_SENT: label SIMULASI tampil', (await pAdmin.locator(`${PANEL} [data-testid="label-simulasi"]`).innerText()).includes('SIMULASI — TIDAK DIKIRIM KE WHATSAPP'))
  cek('daftar attempt: simulation=true · externalDelivery=false', (await pAdmin.locator('[data-testid="daftar-attempt"]').innerText()).includes('simulation=true · externalDelivery=false'))
  await foto(pAdmin, '06-fake-sent-attempt')
  cek('setelah FAKE_SENT: tanpa tombol FAKE Send, revisi, atau Batalkan', (await pAdmin.locator('[data-testid="tombol-fake-send"]').count()) === 0 && (await tombol(pAdmin, 'Buat revisi').count()) === 0 && (await tombol(pAdmin, 'Batalkan pesan').count()) === 0)
  // Klik ganda lewat API dengan requestKey berbeda → server tetap menolak kiriman kedua.
  const ulang = await postApi(cxAdmin, `/messages/${mAkhir.id}/send`, { requestKey: 'ui-uji-kirim-ulang-0001' })
  const att2 = await adm.communicationAttempt.count({ where: { messageId: mAkhir.id } })
  cek('kirim ulang setelah FAKE_SENT → ditolak, attempt tetap 1', att2 === 1 && ulang.status === 200 && ulang.json?.hasil !== 'FAKE_SENT' && ulang.json?.alasan === 'ALREADY_FAKE_SENT', JSON.stringify(ulang.json).slice(0, 160))

  // ---------------------------------------------------------------- 5
  bagian('5. History')
  const riwayat = await pAdmin.locator('[data-testid="riwayat"] li').allInnerTexts()
  cek('riwayat audit tampil (≥ 5 entri: prepare, revisi, preview, approval, send)', riwayat.length >= 5, `${riwayat.length} entri`)
  await foto(pAdmin, '07-riwayat-audit')
  cek('riwayat tanpa pengenal utuh', !riwayat.some((r) => PENGENAL_UTUH.test(r)))
  // Penerima utuh HANYA atas permintaan eksplisit.
  await tombol(pAdmin, 'Tampilkan penerima utuh').click()
  await pAdmin.locator('[data-testid="penerima"]', { hasText: 'TEST_FIXTURE_WA_001' }).waitFor({ timeout: 15000 })
  cek('tombol "Tampilkan penerima utuh" → pengenal utuh tampil (permintaan eksplisit)', true)
  await foto(pAdmin, '08-penerima-utuh-eksplisit')

  // ---------------------------------------------------------------- 6
  bagian('6. Daftar komunikasi')
  await pAdmin.goto('/automation/communications')
  await pAdmin.locator('[data-testid="baris-komunikasi"]').first().waitFor({ timeout: 30000 })
  const daftar = await pAdmin.locator('[data-testid="daftar-komunikasi"]').innerText()
  cek('daftar: label SIMULASI tampil', (await pAdmin.locator('[data-testid="label-simulasi"]').innerText()).includes('SIMULASI — TIDAK DIKIRIM KE WHATSAPP'))
  cek('daftar: penerima tersamar, tanpa pengenal utuh', daftar.includes(SAMARAN_SUKSES) && !PENGENAL_UTUH.test(await pAdmin.content()))
  cek('daftar: tautan ke kandidat yang dibuat', (await pAdmin.locator(`a[href="/automation/communications/${cid}"]`).count()) === 1)
  await foto(pAdmin, '09-daftar-komunikasi')

  // ---------------------------------------------------------------- 7
  bagian('7. Cancel (alasan wajib) dan FAKE gagal → tombol retry')
  await pAdmin.goto('/automation/alerts')
  await pAdmin.locator('li', { hasText: 'UJI-UI-EOSP-BATAL' }).locator('[data-testid="siapkan-update"]').click()
  const cidBatal = await idCandidateDariUrl(pAdmin)
  await tombol(pAdmin, 'Buat revisi').click()
  await tungguState(pAdmin, 'DRAFT')
  await tombol(pAdmin, 'Batalkan pesan').click()
  await pAdmin.locator('[data-testid="dialog-aksi"] button', { hasText: 'Konfirmasi' }).click()
  await pAdmin.locator('[data-testid="hasil-aksi"]').waitFor({ timeout: 30000 })
  await pAdmin.waitForTimeout(500)
  cek('Cancel tanpa alasan → ditolak, tetap DRAFT', (await stateDi(pAdmin).getAttribute('data-state')) === 'DRAFT', await pAdmin.locator('[data-testid="hasil-aksi"]').innerText())
  await pAdmin.locator('[data-testid="dialog-aksi"] textarea').fill('Uji batal dari UI')
  await pAdmin.locator('[data-testid="dialog-aksi"] button', { hasText: 'Konfirmasi' }).click()
  await tungguState(pAdmin, 'CANCELED')
  cek('Cancel dengan alasan → CANCELED; alasan tampil', (await pAdmin.locator('[data-testid="info-pembatalan"]').innerText()).includes('Uji batal dari UI'))
  cek('riwayat memuat alasan pembatalan', (await pAdmin.locator('[data-testid="riwayat"]').innerText()).includes('Uji batal dari UI'))
  const mBatal = await adm.communicationMessage.findFirst({ where: { candidateId: cidBatal } })
  cek('DB: CANCELED / CANCELED_BY_USER', mBatal?.state === 'CANCELED' && mBatal?.reasonCode === 'CANCELED_BY_USER')
  await foto(pAdmin, '10-dibatalkan-dengan-alasan')

  await pAdmin.goto('/automation/alerts')
  await pAdmin.locator('li', { hasText: 'UJI-UI-EOSP-GAGAL' }).locator('[data-testid="siapkan-update"]').click()
  const cidGagal = await idCandidateDariUrl(pAdmin)
  await pAdmin.selectOption('[data-testid="pilih-fixture"]', 'WA1_TEST_FIXTURE_FAIL')
  await tombol(pAdmin, 'Buat revisi').click()
  await tungguState(pAdmin, 'DRAFT')
  await tombol(pAdmin, 'Tandai sudah dipratinjau').click()
  await tungguState(pAdmin, 'PREVIEWED')
  await tombol(pAdmin, 'Minta approval').click()
  await pAdmin.locator('[data-testid="info-approval"]', { hasText: 'PENDING' }).waitFor({ timeout: 30000 })
  // Setuju-sendiri DIIZINKAN untuk WA_INTERNAL_FAKE_TEST (INTERNAL_WRITE, non-produksi) — keputusan Step 2D.
  await tombol(pAdmin, 'Setujui').click()
  await pAdmin.locator('[data-testid="dialog-aksi"] button', { hasText: 'Konfirmasi' }).click()
  await tungguState(pAdmin, 'APPROVED')
  cek('setuju-sendiri ADMIN pada WA_INTERNAL_FAKE_TEST → APPROVED (sesuai kebijakan Step 2D)', true)
  await pAdmin.reload()
  await pAdmin.locator('[data-testid="tombol-fake-send"]').click()
  await tungguState(pAdmin, 'FAKE_FAILED')
  const mGagal = await adm.communicationMessage.findFirst({ where: { candidateId: cidGagal }, include: { attempts: true } })
  cek('DB: FAKE_FAILED dengan 1 attempt FAKE (simulation=true, externalDelivery=false)', mGagal?.state === 'FAKE_FAILED' && mGagal.attempts.length === 1 && mGagal.attempts[0].externalDelivery === false)
  cek('fixture FAIL → FAKE_FAILED; tombol berubah jadi "Ulangi FAKE Send"', (await pAdmin.locator('[data-testid="tombol-fake-send"]').innerText()).includes('Ulangi FAKE Send'))
  await foto(pAdmin, '11-fake-failed-tombol-retry')

  // ---------------------------------------------------------------- 8
  bagian('8. Akses: role tak berwenang, tenant di luar allowlist, isolasi tenant')
  const pOp = await cxOp.newPage()
  for (const path of ['/automation/communications', `/automation/communications/${cid}`]) {
    const r = await pOp.goto(path)
    cek(`OPERATOR ${path.replace(cid, ':id')} → 404`, r?.status() === 404)
  }
  await foto(pOp, '12-operator-404')
  await pOp.goto('/dashboard')
  cek('OPERATOR: menu Komunikasi tidak ada di sidebar', (await pOp.locator('a[href="/automation/communications"]').count()) === 0)
  const opPost = await postApi(cxOp, `/messages/${mAkhir.id}/cancel`, { cancelNote: 'coba' })
  cek('OPERATOR: POST API → 403', opPost.status === 403)

  const pC = await cxC.newPage()
  for (const path of ['/automation/communications', `/automation/communications/${cid}`]) {
    const r = await pC.goto(path)
    cek(`tenant di luar allowlist ${path.replace(cid, ':id')} → 404`, r?.status() === 404)
  }
  await pC.goto('/dashboard')
  cek('tenant di luar allowlist: menu Komunikasi tidak ada', (await pC.locator('a[href="/automation/communications"]').count()) === 0)

  const pB = await cxB.newPage()
  const prepB = await postApi(cxB, '/candidates', { signalId: sB.id })
  cek('tenant B (allowlist) membuat candidate sendiri', prepB.status === 200 && !!prepB.json?.candidateId)
  await pB.goto('/automation/communications')
  await pB.locator('[data-testid="baris-komunikasi"]').first().waitFor({ timeout: 30000 })
  cek('tenant B: daftar hanya memuat kandidat B (tanpa kandidat A)', (await pB.locator('[data-testid="baris-komunikasi"]').count()) === 1 && (await pB.locator(`a[href="/automation/communications/${cid}"]`).count()) === 0)
  await pB.goto(`/automation/communications/${cid}`)
  await pB.locator('[role="alert"]').first().waitFor({ timeout: 30000 })
  const isiB = await pB.content()
  cek('tenant B membuka URL kandidat A → galat, tanpa data A', (await pB.locator(PANEL).count()) === 0 && !isiB.includes('MT DIUBAH') && !isiB.includes('Pelabuhan Uji UI A'))

  // ---------------------------------------------------------------- 9
  bagian('9. Data sensitif dalam respons API yang dilihat peramban')
  const bocor = rekamanApi.filter((r) => PENGENAL_UTUH.test(r.body) && !/[?&]recipient=full\b/.test(r.url))
  cek(`respons API (${rekamanApi.length}) tanpa pengenal utuh kecuali ?recipient=full eksplisit`, rekamanApi.length > 10 && bocor.length === 0, bocor.map((b) => `${b.metode} ${new URL(b.url).pathname}`).join(' | '))
  const POLA_RAHASIA = /password|passwordHash|ipAddress|logicalMessageKey|requestKey|proposal"|NEXTAUTH_SECRET|DATABASE_URL/
  const rahasia = rekamanApi.filter((r) => POLA_RAHASIA.test(r.body))
  cek('respons API tanpa kata sandi/IP/logicalMessageKey/requestKey/proposal/rahasia env', rahasia.length === 0, rahasia.map((b) => `${new URL(b.url).pathname}: ${b.body.match(POLA_RAHASIA)?.[0]}`).join(' | '))
} catch (e) {
  gagal++
  console.log(`  ❌ PENGECUALIAN — ${e?.message?.split('\n')[0] ?? e}`)
  for (const p of halaman) {
    const teks = await p.locator('[data-testid="hasil-aksi"], [data-testid="panel-pesan"] [data-testid="state-badge"], [data-testid="info-approval"], [role="alert"]').allInnerTexts().catch(() => [])
    console.log(`     diagnosis ${new URL(p.url()).pathname}: ${teks.join(' | ').slice(0, 300)}`)
  }
} finally {
  await browser.close().catch(() => {})
  await bersihkan().catch((e) => console.log(`  ⚠ pembersihan gagal: ${e?.message}`))
  await adm.$disconnect()
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
