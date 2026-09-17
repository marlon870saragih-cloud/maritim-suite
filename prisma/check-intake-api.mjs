// Uji HTTP + DB Vessel Call Intake — PRD-004 Step 3.
//
// Jalankan (mode utama, fitur MENYALA):
//   node prisma/check-intake-api.mjs
//   butuh `npm run dev` dengan .env.local:
//     AUTOMATION_MONITORING_ENABLED=true
//     AUTOMATION_TENANT_IDS=<tenant A>,<tenant X>     (DUA tenant ber-akses Hub → uji isolasi data)
//     VESSEL_CALL_INTAKE_ENABLED=true
//     VESSEL_CALL_INTAKE_EXTRACTOR=FAKE               (tanpa jaringan / LLM)
//
// Jalankan (mode fitur MATI — restart dev server dengan VESSEL_CALL_INTAKE_ENABLED=false):
//   node prisma/check-intake-api.mjs --flag-off
//
// Skrip ini MENULIS ke database dev. Semua baris bertanda `P4S3-` / email `p4s3-*`
// (voyage hasil intake dilacak lewat id) dan dihapus lagi di akhir, termasuk saat gagal.
// Berkas lampiran opt-in yang tertulis ke .uploads tidak dihapus (K110) — barisnya dihapus.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import ExcelJS from 'exceljs'

for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch {
    /* file tak ada — lewati */
  }
}

const MODE_MATI = process.argv.includes('--flag-off')
const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = 'P4S3-'
const EMAIL = 'p4s3-'
const SANDI = 'UjiP4s3Intake!2026'
const ALLOW = (process.env.AUTOMATION_TENANT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const ACAK = Date.now().toString(36)

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
const info = (t) => console.log(`     · ${t}`)

// ------------------------------------------------------------------ sesi HTTP

function buatSesi() {
  const jar = new Map()
  const simpan = (res) => {
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
      simpan(res)
      return res
    },
    punya: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
  }
}

async function login(email) {
  const s = buatSesi()
  const { csrfToken } = await (await s.ambil('/api/auth/csrf')).json()
  await s.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password: SANDI, json: 'true' }).toString(),
  })
  if (!s.punya()) throw new Error(`login gagal untuk ${email}`)
  return s
}

async function api(sesi, metode, path, body) {
  const init = { method: metode, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }
  const res = sesi ? await sesi.ambil(path, init) : await fetch(`${BASE_URL}${path}`, { ...init, redirect: 'manual' })
  const teks = await res.text()
  let json = {}
  try {
    json = JSON.parse(teks)
  } catch {
    json = { _teks: teks }
  }
  return { status: res.status, json, teks }
}

async function unggah(sesi, { text, file, saveOriginal = false, confirmReprocess = false }) {
  const form = new FormData()
  if (text !== undefined) form.set('text', text)
  if (file) form.set('file', new Blob([file.bytes], { type: file.type ?? 'application/octet-stream' }), file.name)
  form.set('saveOriginal', String(saveOriginal))
  form.set('confirmReprocess', String(confirmReprocess))
  const res = await sesi.ambil('/api/automation/intakes', { method: 'POST', body: form })
  const teks = await res.text()
  let json = {}
  try {
    json = JSON.parse(teks)
  } catch {
    json = { _teks: teks }
  }
  return { status: res.status, json, teks }
}

const palsu = (obj) => `[[FAKE-AI:${Buffer.from(JSON.stringify(obj)).toString('base64url')}]]`
const hariDepan = (n) => new Date(Date.now() + n * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10)
const tgl = (ymd) => new Date(`${ymd}T00:00:00.000Z`)

// ------------------------------------------------------------------ data

const D = {}
const lacak = { voyage: new Set(), intake: new Set(), blokir: new Set() }

const MODEL_GLOBAL = [
  'tenant', 'user', 'vessel', 'principal', 'customer', 'port', 'voyage', 'voyageVessel', 'cargo', 'task',
  'vesselCallIntake', 'auditLog', 'usageEvent', 'securityEvent', 'attachment', 'notification',
  'portalUser', 'portalAccess', 'portalInvitation', 'monitoredVoyage',
]
async function hitungGlobal() {
  const o = {}
  for (const m of MODEL_GLOBAL) o[m] = await prisma[m].count()
  return o
}
async function idSemua(model) {
  return new Set((await prisma[model].findMany({ select: { id: true } })).map((r) => r.id))
}

async function siapkanData() {
  const hash = await bcrypt.hash(SANDI, 10)
  const user = (tenantId, peran, sufiks) =>
    prisma.user.create({ data: { tenantId, email: `${EMAIL}${sufiks}-${ACAK}@uji.local`, name: `${TAG}${peran}`, password: hash, role: peran, isActive: true } })

  D.A = await prisma.tenant.findUnique({ where: { id: ALLOW[0] } })
  if (!D.A) throw new Error(`Tenant allowlist ${ALLOW[0]} tidak ada di DB dev.`)
  D.X = ALLOW[1] ? await prisma.tenant.findUnique({ where: { id: ALLOW[1] } }) : null
  D.B = await prisma.tenant.findFirst({ where: { id: { notIn: ALLOW } }, orderBy: { createdAt: 'asc' } })
  info(`tenant A ${D.A.id} "${D.A.companyName}"; X (allowlist kedua) ${D.X?.id ?? '—'}; B (di luar allowlist) ${D.B?.id ?? '—'}`)

  D.adminA = await user(D.A.id, 'ADMIN', 'admin-a')
  D.manajerA = await user(D.A.id, 'MANAJER_OPERASI', 'manajer-a')
  D.operatorA = await user(D.A.id, 'OPERATOR', 'operator-a')
  D.viewerA = await user(D.A.id, 'VIEWER', 'viewer-a')
  D.finA = await user(D.A.id, 'FINANCE', 'finance-a')
  if (D.X) D.adminX = await user(D.X.id, 'ADMIN', 'admin-x')
  if (D.B) D.adminB = await user(D.B.id, 'ADMIN', 'admin-b')

  const kapal = (tenantId, data) => prisma.vessel.create({ data: { tenantId, gt: 500, ...data, name: `${TAG}${data.name}` } })
  D.mmsi = `98${String(Date.now()).slice(-7)}`
  D.kImo = await kapal(D.A.id, { name: 'Sea Star', imoNumber: '9398242', callSign: `ZZ${ACAK.slice(-4).toUpperCase()}` })
  D.kMmsi = await kapal(D.A.id, { name: 'Mandiri Uji', mmsi: D.mmsi, mmsiSource: 'COMPANY_DOCUMENT', mmsiVerifiedAt: new Date() })
  D.kMmsiBelum = await kapal(D.A.id, { name: 'Belum Verif', mmsi: `97${String(Date.now()).slice(-7)}`, mmsiSource: 'PUBLIC_TRACKING' })
  D.kBarge = await kapal(D.A.id, { name: 'Patra Uji', vesselType: 'Oil Barge' })
  D.kNama = await kapal(D.A.id, { name: 'Sinar Uji Satu' })
  D.kKembar1 = await kapal(D.A.id, { name: 'Kembar Uji' })
  D.kKembar2 = await prisma.vessel.create({ data: { tenantId: D.A.id, gt: 500, name: `MV ${TAG}Kembar Uji` } })
  if (D.X) D.kX = await kapal(D.X.id, { name: 'Tenant X Kapal', imoNumber: '9176187' })

  D.portA = await prisma.port.create({ data: { tenantId: D.A.id, name: `${TAG}Samarinda Uji`, unlocode: `QZ${ACAK.slice(-3).toUpperCase()}` } })
  D.portA2 = await prisma.port.create({ data: { tenantId: D.A.id, name: `${TAG}Balikpapan Uji` } })
  D.principalA = await prisma.principal.create({ data: { tenantId: D.A.id, name: `PT ${TAG}Surya Uji` } })
  D.custA = await prisma.customer.create({ data: { tenantId: D.A.id, name: `${TAG}Pelanggan Uji` } })
  D.custPortal = await prisma.customer.create({ data: { tenantId: D.A.id, name: `${TAG}Pelanggan Portal` } })
  D.portalUser = await prisma.portalUser.create({ data: { tenantId: D.A.id, email: `${EMAIL}portal-${ACAK}@uji.local`, password: hash, name: `${TAG}Portal` } })
  D.portalAccess = await prisma.portalAccess.create({ data: { tenantId: D.A.id, portalUserId: D.portalUser.id, pihak: 'CUSTOMER', customerId: D.custPortal.id } })
  if (D.X) D.custX = await prisma.customer.create({ data: { tenantId: D.X.id, name: `${TAG}Pelanggan Uji` } })

  D.sesi = {
    adminA: await login(D.adminA.email),
    manajerA: await login(D.manajerA.email),
    operatorA: await login(D.operatorA.email),
    viewerA: await login(D.viewerA.email),
    finA: await login(D.finA.email),
    adminX: D.adminX ? await login(D.adminX.email) : null,
    adminB: D.adminB ? await login(D.adminB.email) : null,
  }
}

/** Teks nominasi: nilai identitas TERTULIS di teks, keluaran "AI" di penanda base64. */
function nominasi({ vessels, portName, portUnlocode, eta, principalName, customerName, cargoes = [], contact, classification = 'NEW_NOMINATION', ekstra = '' }) {
  const baris = [
    `Nomination ${ACAK} ${Math.random().toString(36).slice(2)}`,
    ...vessels.map((v) => `Vessel ${v.name ?? ''} ${v.imo ? `IMO ${v.imo}` : ''} ${v.mmsi ? `MMSI ${v.mmsi}` : ''} ${v.callSign ? `CS ${v.callSign}` : ''} ${v.role ?? ''}`),
    portName ? `Port: ${portName}` : '',
    portUnlocode ? `Locode ${portUnlocode}` : '',
    eta ? `ETA ${eta}` : '',
    principalName ? `Principal ${principalName}` : '',
    customerName ? `Bill to ${customerName}` : '',
    contact ? `Contact ${contact.name} ${contact.email}` : '',
    ekstra,
    palsu({ classification, vessels, portName, portUnlocode, eta, principalName, customerName, cargoes, contact }),
  ]
  return baris.filter(Boolean).join('\n')
}

async function kirimBaru(sesi, isi, opsi = {}) {
  const r = await unggah(sesi, { text: isi, ...opsi })
  if (r.json?.intake?.id) lacak.intake.add(r.json.intake.id)
  return r
}

const baca = (sesi, id) => api(sesi, 'GET', `/api/automation/intakes/${id}`)
const tambal = (sesi, id, versi, body) => api(sesi, 'PATCH', `/api/automation/intakes/${id}`, { version: versi, ...body })
const setujui = (sesi, id, versi, body = {}) => api(sesi, 'POST', `/api/automation/intakes/${id}/approve`, { version: versi, ...body })
const tolak = (sesi, id, versi, reason) => api(sesi, 'POST', `/api/automation/intakes/${id}/reject`, { version: versi, reason })
const tautkan = (sesi, id, versi, voyageId) => api(sesi, 'POST', `/api/automation/intakes/${id}/link`, { version: versi, voyageId })
const cobaLagi = (sesi, id, versi) => api(sesi, 'POST', `/api/automation/intakes/${id}/retry`, { version: versi })

/** Tinjau sampai syarat data terpenuhi: principal & customer dikosongkan, kecocokan nama dikonfirmasi. */
async function lengkapi(sesi, intake) {
  let it = intake
  const langkah = async (body) => {
    const r = await tambal(sesi, it.id, it.version, body)
    if (r.status !== 200) throw new Error(`PATCH gagal ${r.status} ${r.teks.slice(0, 200)}`)
    it = r.json.intake
  }
  if (it.review.unconfirmedFields.length) await langkah({ confirmSourceFields: true })
  for (let i = 0; i < it.proposal.vessels.length; i++) {
    const h = it.matches.vessels[i]
    if (h.status === 'MATCHED' && h.requiresConfirmation && !h.confirmed) await langkah({ confirm: { entity: 'vessel', index: i } })
  }
  if (it.matches.port.status === 'MATCHED' && it.matches.port.requiresConfirmation && !it.matches.port.confirmed) await langkah({ confirm: { entity: 'port' } })
  if (!it.matches.principal.leftEmpty && it.review.conditions.includes('PRINCIPAL_UNRESOLVED')) {
    if (it.matches.principal.status === 'MATCHED') await langkah({ confirm: { entity: 'principal' } })
    else await langkah({ leaveEmpty: { entity: 'principal', value: true } })
  }
  if (it.review.conditions.includes('CUSTOMER_UNRESOLVED')) await langkah({ leaveEmpty: { entity: 'customer', value: true } })
  return it
}

// =========================================================================== uji

async function ujiAkses() {
  console.log('\n[A] Akses, gerbang & peran')
  cek('tanpa sesi → 401', (await api(null, 'GET', '/api/automation/intakes')).status === 401)
  cek('ADMIN → 200', (await api(D.sesi.adminA, 'GET', '/api/automation/intakes')).status === 200)
  cek('MANAJER_OPERASI → 200', (await api(D.sesi.manajerA, 'GET', '/api/automation/intakes')).status === 200)
  for (const [nama, s] of [['OPERATOR', D.sesi.operatorA], ['VIEWER', D.sesi.viewerA], ['FINANCE', D.sesi.finA]]) {
    cek(`${nama} GET → 403`, (await api(s, 'GET', '/api/automation/intakes')).status === 403)
    cek(`${nama} POST intake → 403 (berkas tak dibaca)`, (await unggah(s, { text: nominasi({ vessels: [{ name: 'X' }], eta: hariDepan(3) }) })).status === 403)
  }
  if (D.sesi.adminB) cek('ADMIN tenant di luar allowlist → 404', (await api(D.sesi.adminB, 'GET', '/api/automation/intakes')).status === 404)
  const hal = async (s, p) => (await s.ambil(p)).status
  cek('halaman /automation/intake: ADMIN 200, OPERATOR 404', (await hal(D.sesi.adminA, '/automation/intake')) === 200 && (await hal(D.sesi.operatorA, '/automation/intake')) === 404)
  const dasbor = await (await D.sesi.manajerA.ambil('/dashboard')).text()
  const dasborOp = await (await D.sesi.operatorA.ambil('/dashboard')).text()
  cek('menu Intake tampil untuk MANAJER_OPERASI, tidak untuk OPERATOR', dasbor.includes('href="/automation/intake"') && !dasborOp.includes('href="/automation/intake"'))
  const url = process.env.PORTAL_DATABASE_URL
  if (url) {
    const portal = new PrismaClient({ datasources: { db: { url } } })
    let pesan = ''
    try {
      await portal.$queryRawUnsafe('SELECT 1 FROM "VesselCallIntake" LIMIT 1')
    } catch (e) {
      pesan = String(e.message)
    } finally {
      await portal.$disconnect()
    }
    cek('peran DB portal tak bisa membaca VesselCallIntake', /permission denied|42501/i.test(pesan))
  }
}

async function ujiSubmitDasar() {
  console.log('\n[B] Submit, ekstraksi palsu, validasi & idempotensi input')
  const hitungMaster = async () => JSON.stringify(await Promise.all(['vessel', 'principal', 'customer', 'port', 'voyage'].map((m) => prisma[m].count({ where: { tenantId: D.A.id } }))))
  const masterAwal = await hitungMaster()
  const aiAwal = await prisma.securityEvent.count({ where: { kind: 'AI_CALL', identifier: D.adminA.id } })

  const isi = nominasi({
    vessels: [{ name: D.kImo.name, imo: '9398242' }],
    portName: D.portA.name, eta: hariDepan(20), principalName: D.principalA.name,
    cargoes: [{ name: 'Batubara', quantity: 5000, unit: 'MT', operation: 'LOAD', price: 99 }],
    contact: { name: 'Budi Uji', email: `budi-${ACAK}@contoh.local` },
  })
  const r1 = await kirimBaru(D.sesi.adminA, isi)
  cek('submit teks → 201 NEEDS_REVIEW', r1.status === 201 && r1.json.intake?.status === 'NEEDS_REVIEW', `${r1.status}`)
  const it = r1.json.intake
  D.itUtama = it
  cek('klasifikasi NEW_NOMINATION, kapal cocok EXACT_IMO', it.classification === 'NEW_NOMINATION' && it.matches.vessels[0].basis === 'EXACT_IMO' && it.matches.vessels[0].selectedId === D.kImo.id)
  cek('respons tanpa tenantId', !r1.teks.includes('tenantId') && !r1.teks.includes(D.A.id))
  cek('principal cocok nama → wajib konfirmasi; customer tanpa nama → NOT_FOUND', it.matches.principal.requiresConfirmation && it.matches.customer.status === 'NOT_FOUND')
  cek('port cocok nama → wajib konfirmasi', it.matches.port.status === 'MATCHED' && it.matches.port.requiresConfirmation)
  cek('angka uang dari AI tak tersimpan', !JSON.stringify(it.proposal).includes('"price"'))
  const aiSesudah1 = await prisma.securityEvent.count({ where: { kind: 'AI_CALL', identifier: D.adminA.id } })
  cek('satu panggilan AI tercatat (rate-limit K185)', aiSesudah1 === aiAwal + 1)
  cek('AI TIDAK membuat master/voyage (hitungan tenant A tetap)', (await hitungMaster()) === masterAwal)
  const baris = await prisma.vesselCallIntake.findUnique({ where: { id: it.id } })
  cek('isi mentah tidak disimpan (hanya hash)', !JSON.stringify(baris).includes('Nomination') && /^[0-9a-f]{64}$/.test(baris.inputHash) && baris.activeHashKey === baris.inputHash)
  cek('tanpa opt-in → tak ada lampiran', baris.attachmentId === null && (await prisma.attachment.count({ where: { entityType: 'VESSEL_CALL_INTAKE', entityId: it.id } })) === 0)
  cek('pemakaian INTAKE_EXTRACTED tercatat', (await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: 'INTAKE_EXTRACTED', userId: D.adminA.id } })) === 1)
  const auditCreate = await prisma.auditLog.findFirst({ where: { tableName: 'VesselCallIntake', recordId: it.id, action: 'CREATE' } })
  cek('audit CREATE tanpa isi dokumen/kontak', !!auditCreate && !JSON.stringify(auditCreate.newValue).includes('budi'))

  // Idempotensi input
  const r2 = await kirimBaru(D.sesi.adminA, `  ${isi.replace(/\n/g, '\r\n')}  `)
  cek('input sama (beda spasi/CRLF) → intake yang sama, reused', r2.status === 200 && r2.json.reused === true && r2.json.intake.id === it.id)
  cek('… tanpa panggilan AI kedua', (await prisma.securityEvent.count({ where: { kind: 'AI_CALL', identifier: D.adminA.id } })) === aiSesudah1)

  const isiBersamaan = nominasi({ vessels: [{ name: D.kNama.name }], portName: D.portA2.name, eta: hariDepan(40) })
  const serentak = await Promise.all([1, 2, 3, 4].map(() => kirimBaru(D.sesi.manajerA, isiBersamaan)))
  const ids = new Set(serentak.map((r) => r.json.intake?.id))
  cek('4 submit identik serentak → tepat satu intake', ids.size === 1 && serentak.every((r) => r.status === 200 || r.status === 201), `${serentak.map((r) => r.status)}`)

  // Validasi masukan
  cek('teks kosong → 400', (await unggah(D.sesi.adminA, { text: '   ' })).status === 400)
  cek('teks + berkas bersamaan → 400', (await unggah(D.sesi.adminA, { text: 'a', file: { name: 'a.pdf', bytes: Buffer.from('x') } })).status === 400)
  cek('berkas .xls lama → 400', (await unggah(D.sesi.adminA, { file: { name: 'a.xls', bytes: Buffer.from('x') } })).status === 400)
  cek('berkas .exe → 400', (await unggah(D.sesi.adminA, { file: { name: 'a.exe', bytes: Buffer.from('x') } })).status === 400)
  cek('berkas > 10 MB → 400', (await unggah(D.sesi.adminA, { file: { name: 'besar.pdf', bytes: Buffer.alloc(10 * 1024 * 1024 + 1, 65) } })).status === 400)

  // Galat AI — tak ada baris dibuat, tanpa teks penyedia
  const sebelum = await prisma.vesselCallIntake.count()
  for (const [penanda, kode] of [['TIMEOUT', 'AI_TIMEOUT'], ['UNAVAILABLE', 'AI_UNAVAILABLE'], ['BAD', 'AI_BAD_RESPONSE']]) {
    const r = await unggah(D.sesi.manajerA, { text: `Permintaan ${ACAK} ${penanda}\n[[FAKE-AI:${penanda}]]` })
    cek(`AI ${penanda} → 502 ${kode}, tanpa pesan penyedia`, r.status === 502 && r.json.error?.details?.code === kode && !r.teks.includes('RAHASIA-PENYEDIA'), `${r.status}`)
  }
  cek('… tidak ada intake yang dibuat', (await prisma.vesselCallIntake.count()) === sebelum)

  // Rate-limit
  await prisma.securityEvent.createMany({ data: Array.from({ length: 30 }, () => ({ kind: 'AI_CALL', identifier: D.finA.id })) })
  D.adminLimit = D.finA
  const tampung = await prisma.user.update({ where: { id: D.finA.id }, data: { role: 'ADMIN' } })
  const sesiLimit = await login(tampung.email)
  const rl = await unggah(sesiLimit, { text: nominasi({ vessels: [{ name: 'RL' }], eta: hariDepan(5) }) })
  cek('rate-limit AI terlampaui → 429 sebelum AI', rl.status === 429, `${rl.status}`)
  await prisma.user.update({ where: { id: D.finA.id }, data: { role: 'FINANCE' } })

  // Langganan tidak aktif
  const trialLama = D.A.trialEndsAt
  const planLama = D.A.plan
  const subsLama = D.A.subscriptionEndsAt
  await prisma.tenant.update({ where: { id: D.A.id }, data: { plan: 'TRIAL', trialEndsAt: new Date(Date.now() - 86_400_000) } })
  try {
    const rs = await unggah(D.sesi.adminA, { text: nominasi({ vessels: [{ name: 'SUB' }], eta: hariDepan(5) }) })
    cek('langganan habis → 403 sebelum AI', rs.status === 403, `${rs.status}`)
  } finally {
    await prisma.tenant.update({ where: { id: D.A.id }, data: { plan: planLama, trialEndsAt: trialLama, subscriptionEndsAt: subsLama } })
  }
}

async function ujiBerkas() {
  console.log('\n[C] PDF / gambar / Excel / CSV & dokumen asli opt-in')
  const isiAi = { classification: 'NEW_APPOINTMENT', vessels: [{ name: D.kImo.name, imo: '9398242' }], portUnlocode: D.portA.unlocode, eta: hariDepan(60), cargoes: [] }
  const pdf = await unggah(D.sesi.adminA, { file: { name: 'appointment.pdf', type: 'application/pdf', bytes: Buffer.from(`%PDF-1.4 ${ACAK}\n${palsu(isiAi)}`, 'latin1') }, saveOriginal: true })
  if (pdf.json.intake?.id) lacak.intake.add(pdf.json.intake.id)
  const itPdf = pdf.json.intake
  cek('PDF → 201, identitas UNVERIFIED_SOURCE', pdf.status === 201 && itPdf.proposal.vessels[0].name.flags.includes('UNVERIFIED_SOURCE'), `${pdf.status}`)
  cek('Step 4F: PDF → kecocokan IMO persis pun wajib dikonfirmasi (bukan "cek dokumen")', itPdf.matches.vessels[0].basis === 'EXACT_IMO' && itPdf.matches.vessels[0].requiresConfirmation && itPdf.review.conditions.includes('VESSEL_CONFIRMATION_REQUIRED') && itPdf.review.conditions.includes('PORT_CONFIRMATION_REQUIRED') && !itPdf.review.conditions.includes('SOURCE_FIELDS_UNCONFIRMED'))
  const lamp = await prisma.attachment.findFirst({ where: { entityType: 'VESSEL_CALL_INTAKE', entityId: itPdf.id } })
  cek('opt-in → lampiran sensitif, tak dibagikan ke portal', !!lamp && lamp.sensitive === true && lamp.sharedToPortal === false && itPdf.attachmentId === lamp.id)
  cek('ADMIN bisa mengunduh dokumen asli', (await D.sesi.adminA.ambil(`/api/attachments/${lamp.id}/content`)).status === 200)
  const q = `/api/attachments?entityType=VESSEL_CALL_INTAKE&entityId=${itPdf.id}`
  cek('OPERATOR tak bisa melihat lampiran intake lewat jalur generik → 403', (await api(D.sesi.operatorA, 'GET', q)).status === 403)
  cek('OPERATOR tak bisa mengunduh dokumen asli → 403', (await D.sesi.operatorA.ambil(`/api/attachments/${lamp.id}/content`)).status === 403)
  cek('VIEWER → 403', (await api(D.sesi.viewerA, 'GET', q)).status === 403)
  if (D.sesi.adminX) cek('tenant lain → 404', (await api(D.sesi.adminX, 'GET', q)).status === 404)
  const komentar = await api(D.sesi.operatorA, 'POST', '/api/comments', { entityType: 'VESSEL_CALL_INTAKE', entityId: itPdf.id, body: 'uji' })
  cek('OPERATOR tak bisa berkomentar pada intake → 403', komentar.status === 403, `${komentar.status}`)
  const k1 = await tambal(D.sesi.adminA, itPdf.id, itPdf.version, { confirm: { entity: 'vessel', index: 0 } })
  const k = await tambal(D.sesi.adminA, itPdf.id, k1.json.intake.version, { confirm: { entity: 'port' } })
  cek('Step 4F: konfirmasi kapal & pelabuhan → syarat itu hilang', k.status === 200 && !k.json.intake.review.conditions.some((c) => c === 'VESSEL_CONFIRMATION_REQUIRED' || c === 'PORT_CONFIRMATION_REQUIRED'))
  const tanpaDok = await unggah(D.sesi.adminA, { file: { name: 'tanpa-simpan.pdf', type: 'application/pdf', bytes: Buffer.from(`%PDF-1.4 ${ACAK} b
${palsu({ ...isiAi, eta: hariDepan(64) })}`, 'latin1') } })
  if (tanpaDok.json.intake?.id) lacak.intake.add(tanpaDok.json.intake.id)
  cek('Step 4F: PDF tanpa dokumen asli → tidak ada syarat "cek dokumen", tetap konfirmasi kecocokan', tanpaDok.status === 201 && tanpaDok.json.intake.attachmentId === null && !tanpaDok.json.intake.review.conditions.includes('SOURCE_FIELDS_UNCONFIRMED') && tanpaDok.json.intake.review.conditions.includes('VESSEL_CONFIRMATION_REQUIRED'))
  D.itPdf = k.json.intake

  const img = await unggah(D.sesi.adminA, { file: { name: 'wa.png', type: 'image/png', bytes: Buffer.from(`\x89PNG ${ACAK}${palsu({ ...isiAi, eta: hariDepan(61) })}`, 'latin1') } })
  if (img.json.intake?.id) lacak.intake.add(img.json.intake.id)
  cek('gambar → 201, UNVERIFIED_SOURCE, tanpa lampiran bawaan', img.status === 201 && img.json.intake.proposal.portUnlocode.flags.includes('UNVERIFIED_SOURCE') && img.json.intake.attachmentId === null)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Nominasi')
  ws.addRow(['Vessel', D.kNama.name])
  ws.addRow(['ETA', hariDepan(62)])
  ws.addRow(['Port', D.portA2.name])
  ws.addRow([palsu({ classification: 'NEW_NOMINATION', vessels: [{ name: D.kNama.name, imo: '9400124' }], portName: D.portA2.name, eta: hariDepan(62), cargoes: [] })])
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer())
  const rx = await unggah(D.sesi.adminA, { file: { name: `nominasi-${ACAK}.xlsx`, bytes: xlsx } })
  if (rx.json.intake?.id) lacak.intake.add(rx.json.intake.id)
  const vx = rx.json.intake?.proposal?.vessels?.[0]
  cek('Excel → 201, nama terverifikasi dari sel; IMO karangan dibuang NOT_IN_SOURCE', rx.status === 201 && vx?.name.source === 'SOURCE_DOCUMENT' && vx?.imo.value === null && vx?.imo.flags.includes('NOT_IN_SOURCE'), `${rx.status}`)

  const csv = `vessel,eta\n${D.kNama.name},${hariDepan(63)}\n${palsu({ classification: 'NOT_RELEVANT', vessels: [], cargoes: [] })}\n`
  const rc = await unggah(D.sesi.adminA, { file: { name: `n-${ACAK}.csv`, type: 'text/csv', bytes: Buffer.from(csv) } })
  if (rc.json.intake?.id) lacak.intake.add(rc.json.intake.id)
  cek('CSV → 201 NOT_RELEVANT → approve diblok (CLASSIFICATION_NOT_SUPPORTED)', rc.status === 201 && rc.json.intake.review.conditions.includes('CLASSIFICATION_NOT_SUPPORTED'))
  const tolakCsv = await setujui(D.sesi.adminA, rc.json.intake.id, rc.json.intake.version, {})
  cek('… approve NOT_RELEVANT → 400', tolakCsv.status === 400 && tolakCsv.json.error?.details?.conditions?.includes('CLASSIFICATION_NOT_SUPPORTED'))
}

async function ujiMatching() {
  console.log('\n[D] Pencocokan kapal lewat API')
  const kirim = async (vessels) => (await kirimBaru(D.sesi.manajerA, nominasi({ vessels, portName: D.portA2.name, eta: hariDepan(90 + Math.floor(Math.random() * 100)) }))).json.intake
  const a = await kirim([{ name: 'nama lain', mmsi: D.mmsi }])
  cek('MMSI terverifikasi → EXACT_MMSI_VERIFIED', a.matches.vessels[0].basis === 'EXACT_MMSI_VERIFIED' && a.matches.vessels[0].selectedId === D.kMmsi.id)
  const b = await kirim([{ mmsi: D.kMmsiBelum.mmsi }])
  cek('MMSI belum terverifikasi → hanya kandidat (tak terpilih)', b.matches.vessels[0].status === 'AMBIGUOUS' && b.matches.vessels[0].selectedId === null)
  const c = await kirim([{ callSign: D.kImo.callSign }])
  cek('call sign unik → EXACT_CALL_SIGN', c.matches.vessels[0].basis === 'EXACT_CALL_SIGN' && c.matches.vessels[0].selectedId === D.kImo.id)
  const d = await kirim([{ name: 'SPOB SINAR UJI SATU' }])
  // Nama kapal tersimpan "P4S3-Sinar Uji Satu" → nama sebagian (awalan tag) → kandidat
  cek('nama → kandidat/konfirmasi, tak pernah otomatis', d.matches.vessels[0].selectedId === null || d.matches.vessels[0].requiresConfirmation)
  const e = await kirim([{ name: `${TAG}Sinar Uji Satu` }])
  cek('nama tunggal persis → MATCHED + wajib konfirmasi', e.matches.vessels[0].basis === 'NAME_NORMALIZED' && e.matches.vessels[0].requiresConfirmation && e.review.conditions.includes('VESSEL_CONFIRMATION_REQUIRED'))
  const f = await kirim([{ name: `${TAG}Kembar Uji` }])
  cek('nama ganda (Kembar / MV Kembar) → AMBIGUOUS', f.matches.vessels[0].status === 'AMBIGUOUS' && f.matches.vessels[0].candidates.length >= 2)
  const pilih = await tambal(D.sesi.manajerA, f.id, f.version, { select: { entity: 'vessel', index: 0, id: D.kKembar2.id } })
  cek('peninjau memilih kandidat → SELECTED_BY_REVIEWER', pilih.status === 200 && pilih.json.intake.matches.vessels[0].basis === 'SELECTED_BY_REVIEWER')
  const g = await kirim([{ name: 'Apa saja', imo: '9398242', mmsi: D.mmsi }])
  cek('IMO → kapal A, MMSI → kapal B → CONFLICT', g.matches.vessels[0].status === 'CONFLICT' && g.review.conditions.includes('PRIMARY_VESSEL_UNRESOLVED'))
  if (D.kX) {
    const h = await kirim([{ name: 'Tenant X Kapal', imo: '9176187' }])
    cek('kapal tenant lain (IMO sama) tak pernah cocok', h.matches.vessels[0].selectedId === null && !JSON.stringify(h.matches).includes(D.kX.id))
    const silang = await tambal(D.sesi.manajerA, h.id, h.version, { select: { entity: 'vessel', index: 0, id: D.kX.id } })
    cek('memilih kapal tenant lain → 404', silang.status === 404)
    const custSilang = await tambal(D.sesi.manajerA, h.id, h.version, { select: { entity: 'customer', id: D.custX.id } })
    cek('memilih customer tenant lain → 404', custSilang.status === 404)
  }
  const tb = await kirim([{ name: `${TAG}Patra Uji`, role: 'BARGE' }, { name: 'nama tug', mmsi: D.mmsi, role: 'TUG' }])
  cek('tug+barge → kapal utama = TUG (indeks 1)', tb.review.primaryVesselIndex === 1)
  D.itTugBarge = tb
}

async function ujiDuplikat() {
  console.log('\n[E] Duplikat, tautkan, hitung ulang saat approve')
  const eta = hariDepan(150)
  const vLama = await prisma.voyage.create({
    data: { tenantId: D.A.id, vesselId: D.kImo.id, portId: D.portA.id, voyageNumber: `${TAG}VYG-LAMA-${ACAK}`, status: 'CONFIRMED', eta: tgl(eta), dataOrigin: 'UJI', vessels: { create: [{ vesselId: D.kImo.id }] } },
  })
  const vTutup = await prisma.voyage.create({
    data: { tenantId: D.A.id, vesselId: D.kImo.id, portId: D.portA.id, voyageNumber: `${TAG}VYG-TUTUP-${ACAK}`, status: 'CLOSED', eta: tgl(hariDepan(151)), dataOrigin: 'UJI' },
  })
  D.vLama = vLama
  const kirim = async (o) => (await kirimBaru(D.sesi.adminA, nominasi({ vessels: [{ name: D.kImo.name, imo: '9398242' }], principalName: D.principalA.name, ...o }))).json.intake
  const likely = await kirim({ portUnlocode: D.portA.unlocode, eta: hariDepan(151) })
  cek('kapal & pelabuhan sama, ETA +1 → LIKELY; voyage CLOSED diabaikan', likely.duplicateLevel === 'LIKELY_DUPLICATE' && likely.duplicateCandidates.some((c) => c.id === vLama.id) && !likely.duplicateCandidates.some((c) => c.id === vTutup.id))
  const lk = await lengkapi(D.sesi.adminA, likely)
  cek('LIKELY tanpa keputusan → 400 DUPLICATE_DECISION_REQUIRED', (await setujui(D.sesi.adminA, lk.id, lk.version)).json.error?.details?.conditions?.includes('DUPLICATE_DECISION_REQUIRED'))
  const tanpaAlasan = await setujui(D.sesi.adminA, lk.id, lk.version, { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true })
  cek('LIKELY + CONTINUE_AS_NEW tanpa alasan → 400 DUPLICATE_REASON_REQUIRED', tanpaAlasan.status === 400 && tanpaAlasan.json.error.details.conditions.includes('DUPLICATE_REASON_REQUIRED'))
  cek('keputusan LINK_EXISTING lewat approve → 400', (await setujui(D.sesi.adminA, lk.id, lk.version, { duplicateDecision: 'LINK_EXISTING' })).status === 400)
  const vLain = await prisma.voyage.create({ data: { tenantId: D.A.id, vesselId: D.kNama.id, voyageNumber: `${TAG}VYG-BUKAN-${ACAK}`, status: 'PLANNED', dataOrigin: 'UJI' } })
  cek('tautkan ke voyage yang bukan kandidat → 400', (await tautkan(D.sesi.adminA, lk.id, lk.version, vLain.id)).status === 400)
  if (D.X) {
    const vX = await prisma.voyage.create({ data: { tenantId: D.X.id, vesselId: D.kX.id, voyageNumber: `${TAG}VYG-X-${ACAK}`, status: 'PLANNED', dataOrigin: 'UJI' } })
    cek('tautkan ke voyage tenant lain → 400', (await tautkan(D.sesi.adminA, lk.id, lk.version, vX.id)).status === 400)
  }
  const jumlahVoyage = await prisma.voyage.count({ where: { tenantId: D.A.id } })
  const link = await tautkan(D.sesi.adminA, lk.id, lk.version, vLama.id)
  cek('tautkan → LINKED_EXISTING, voyageId = voyage lama', link.status === 200 && link.json.intake.status === 'LINKED_EXISTING' && link.json.intake.voyageId === vLama.id)
  cek('… TIDAK ada voyage baru', (await prisma.voyage.count({ where: { tenantId: D.A.id } })) === jumlahVoyage)
  const barisLink = await prisma.vesselCallIntake.findUnique({ where: { id: lk.id } })
  cek('… activeHashKey dikosongkan; kontak dibuang', barisLink.activeHashKey === null && barisLink.proposal.contact === null)
  cek('terminal → PATCH/approve ditolak 409', (await tambal(D.sesi.adminA, lk.id, barisLink.version, { fields: { jetty: 'x' } })).status === 409 && (await setujui(D.sesi.adminA, lk.id, barisLink.version)).status === 409)

  const possible = await kirim({ portName: D.portA2.name, eta: hariDepan(155) })
  cek('pelabuhan beda, ETA +5 → POSSIBLE', possible.duplicateLevel === 'POSSIBLE_DUPLICATE')
  const pk = await lengkapi(D.sesi.adminA, possible)
  const tanpaCentang = await setujui(D.sesi.adminA, pk.id, pk.version, { duplicateDecision: 'CONTINUE_AS_NEW' })
  cek('POSSIBLE + CONTINUE_AS_NEW tanpa centang → 400', tanpaCentang.status === 400 && tanpaCentang.json.error.details.conditions.includes('DUPLICATE_REVIEW_CONFIRMATION_REQUIRED'))
  const ok = await setujui(D.sesi.adminA, pk.id, pk.version, { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true })
  cek('POSSIBLE + CONTINUE_AS_NEW + centang → COMPLETED', ok.status === 200 && ok.json.intake.status === 'COMPLETED', `${ok.status} ${ok.teks.slice(0, 120)}`)
  if (ok.json.intake?.voyageId) lacak.voyage.add(ok.json.intake.voyageId)

  // Hitung ulang saat approve: tak ada duplikat saat ditinjau → voyage muncul → 409
  const etaBaru = hariDepan(250)
  const bersih = await kirim({ portUnlocode: D.portA.unlocode, eta: etaBaru })
  cek('awalnya NO_DUPLICATE', bersih.duplicateLevel === 'NO_DUPLICATE')
  const bk = await lengkapi(D.sesi.adminA, bersih)
  const penyela = await api(D.sesi.operatorA, 'POST', '/api/voyages', { vesselId: D.kImo.id, portId: D.portA.id, eta: etaBaru })
  if (penyela.json.voyage?.id) lacak.voyage.add(penyela.json.voyage.id)
  const naik = await setujui(D.sesi.adminA, bk.id, bk.version)
  cek('voyage baru muncul sesudah tinjauan → approve 409 DUPLICATE_LEVEL_INCREASED', naik.status === 409 && naik.json.error?.details?.code === 'DUPLICATE_LEVEL_INCREASED', `${naik.status}`)
  const segar = (await baca(D.sesi.adminA, bk.id)).json.intake
  cek('… level tersimpan naik ke LIKELY & versi naik, status tetap NEEDS_REVIEW', segar.duplicateLevel === 'LIKELY_DUPLICATE' && segar.version === bk.version + 1 && segar.status === 'NEEDS_REVIEW')
  const alasanPendek = await setujui(D.sesi.adminA, bk.id, segar.version, { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true, decisionReason: 'beda' })
  cek('… alasan < 10 karakter → 400', alasanPendek.status === 400)
  const denganAlasan = await setujui(D.sesi.adminA, bk.id, segar.version, { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true, decisionReason: 'SPK terpisah untuk kunjungan kedua' })
  cek('… alasan ≥ 10 → COMPLETED, alasan tersimpan & diaudit', denganAlasan.status === 200 && denganAlasan.json.intake.decisionReason === 'SPK terpisah untuk kunjungan kedua')
  if (denganAlasan.json.intake?.voyageId) lacak.voyage.add(denganAlasan.json.intake.voyageId)
  const auditApprove = await prisma.auditLog.findFirst({ where: { tableName: 'VesselCallIntake', recordId: bk.id, action: 'APPROVE' } })
  cek('… audit APPROVE memuat keputusan, alasan, kandidat', auditApprove?.newValue?.duplicateDecision === 'CONTINUE_AS_NEW' && auditApprove.newValue.decisionReason.includes('SPK') && auditApprove.newValue.duplicateCandidateIds.length > 0)

  // Intake lain yang aktif untuk kapal sama
  const i1 = await kirim({ portName: D.portA2.name, eta: hariDepan(300) })
  const i2 = await kirim({ portName: D.portA2.name, eta: hariDepan(301) })
  cek('intake lain yang aktif, kapal sama, ETA ±1 → POSSIBLE (INTAKE)', i2.duplicateCandidates.some((c) => c.type === 'INTAKE' && c.id === i1.id))
}

async function ujiApproval() {
  console.log('\n[F] Approval, peran, konkurensi, createVoyage')
  const it = await lengkapi(D.sesi.adminA, D.itUtama)
  cek('syarat data terpenuhi sesudah tinjauan', it.review.conditions.length === 0, JSON.stringify(it.review.conditions))
  cek('OPERATOR approve → 403', (await setujui(D.sesi.operatorA, it.id, it.version)).status === 403)
  cek('VIEWER approve → 403', (await setujui(D.sesi.viewerA, it.id, it.version)).status === 403)
  cek('OPERATOR reject/link/PATCH → 403', (await tolak(D.sesi.operatorA, it.id, it.version, 'tidak')).status === 403 && (await tambal(D.sesi.operatorA, it.id, it.version, { fields: { jetty: 'A' } })).status === 403)
  if (D.sesi.adminX) {
    cek('tenant lain (Hub aktif) GET/PATCH/approve/reject/link → 404', (await Promise.all([
      baca(D.sesi.adminX, it.id), tambal(D.sesi.adminX, it.id, it.version, { fields: { jetty: 'x' } }), setujui(D.sesi.adminX, it.id, it.version),
      tolak(D.sesi.adminX, it.id, it.version, 'tidak'), tautkan(D.sesi.adminX, it.id, it.version, D.vLama.id), cobaLagi(D.sesi.adminX, it.id, it.version),
    ])).every((r) => r.status === 404))
    cek('daftar tenant lain tidak memuat intake A', !(await api(D.sesi.adminX, 'GET', '/api/automation/intakes')).teks.includes(it.id))
  }
  cek('versi usang → 409', (await setujui(D.sesi.adminA, it.id, it.version - 1)).status === 409)

  const jumlahVoyage = await prisma.voyage.count({ where: { tenantId: D.A.id } })
  const serentak = await Promise.all([1, 2, 3, 4].map((i) => setujui(i % 2 ? D.sesi.adminA : D.sesi.manajerA, it.id, it.version)))
  const sukses = serentak.filter((r) => r.status === 200)
  cek('4 approve serentak → tepat satu sukses, sisanya 409', sukses.length === 1 && serentak.filter((r) => r.status === 409).length === 3, serentak.map((r) => r.status).join(','))
  const selesai = sukses[0]?.json.intake
  if (!selesai) throw new Error(`approve serentak tanpa satu pun sukses: ${serentak.map((r) => r.teks.slice(0, 120)).join(' | ')}`)
  if (selesai?.voyageId) lacak.voyage.add(selesai.voyageId)
  cek('… tepat satu voyage baru', (await prisma.voyage.count({ where: { tenantId: D.A.id } })) === jumlahVoyage + 1)
  const v = await prisma.voyage.findUnique({ where: { id: selesai.voyageId }, include: { cargoes: true, vessels: true } })
  cek('voyage: sourceIntakeId, PLANNED, kapal/pelabuhan/ETA sesuai, nomor VYG', v.sourceIntakeId === it.id && v.status === 'PLANNED' && v.vesselId === D.kImo.id && v.portId === D.portA.id && v.eta.toISOString().slice(0, 10) === it.proposal.eta.value && /^VYG-\d{4}-\d{6}$/.test(v.voyageNumber))
  cek('voyage: principal = hasil konfirmasi peninjau / customer kosong (sengaja)', v.principalId === D.principalA.id && v.customerId === null)
  cek('voyage: baris VoyageVessel kapal utama + cargo dari intake', v.vessels.length === 1 && v.cargoes.length === 1 && v.cargoes[0].cargoName === 'Batubara' && v.cargoes[0].quantity === 5000)
  cek('voyage: dataOrigin dicap createVoyage (bukan intake)', typeof v.dataOrigin === 'string')
  cek('Step 4F: catatan voyage tanpa id internal intake', !v.notes.includes(it.id) && v.notes.includes('Intake Kunjungan Kapal') && v.sourceIntakeId === it.id)
  cek('audit Voyage CREATE DIBUAT_DARI_INTAKE', !!(await prisma.auditLog.findFirst({ where: { tableName: 'Voyage', recordId: v.id, action: 'CREATE' } }))?.newValue?.intakeId)
  cek('pemakaian VOYAGE_CREATED lewat createVoyage', (await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: 'VOYAGE_CREATED', createdAt: { gte: v.createdAt } } })) >= 1)
  cek('intake COMPLETED, kontak dibuang di DTO & DB', selesai.status === 'COMPLETED' && selesai.proposal.contact === null && (await prisma.vesselCallIntake.findUnique({ where: { id: it.id } })).proposal.contact === null)
  const auditIntake = await prisma.auditLog.findMany({ where: { tableName: 'VesselCallIntake', recordId: it.id } })
  cek('audit intake lengkap (CREATE, UPDATE tinjau, APPROVE, COMPLETED) tanpa PII kontak', ['CREATE', 'UPDATE', 'APPROVE'].every((a) => auditIntake.some((x) => x.action === a)) && !JSON.stringify(auditIntake).includes('budi-'))
  cek('pemantauan TIDAK dinyalakan otomatis', (await prisma.monitoredVoyage.count({ where: { voyageId: v.id } })) === 0)
  cek('unique DB: voyage kedua dengan sourceIntakeId sama ditolak', await prisma.voyage
    .create({ data: { tenantId: D.A.id, vesselId: D.kImo.id, voyageNumber: `${TAG}VYG-GANDA-${ACAK}`, sourceIntakeId: it.id } })
    .then((x) => { lacak.voyage.add(x.id); return false })
    .catch((e) => e.code === 'P2002'))
  const hal = await (await D.sesi.adminA.ambil(`/voyages/${v.id}`)).text()
  const halOp = await (await D.sesi.operatorA.ambil(`/voyages/${v.id}`)).text()
  cek('halaman voyage: "Asal: Vessel Call Intake" untuk ADMIN, tidak untuk OPERATOR', hal.includes(`/automation/intake/${it.id}`) && !halOp.includes(`/automation/intake/${it.id}`))
  const pantau = await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: v.id })
  cek('tombol "Mulai pemantauan" memakai flow 5B yang ada', pantau.status === 201)
  await prisma.monitoredVoyage.deleteMany({ where: { voyageId: v.id } })

  // MANAJER_OPERASI + tug/barge: approve sukses (createVoyage & setVoyageVessels diperluas)
  const tb = await lengkapi(D.sesi.manajerA, D.itTugBarge)
  const rtb = await setujui(D.sesi.manajerA, tb.id, tb.version, tb.duplicateLevel === 'NO_DUPLICATE' ? {} : { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true, decisionReason: 'uji tug barge terpisah' })
  cek('MANAJER_OPERASI approve → COMPLETED', rtb.status === 200 && rtb.json.intake.status === 'COMPLETED', `${rtb.status} ${rtb.teks.slice(0, 160)}`)
  if (rtb.json.intake?.voyageId) {
    lacak.voyage.add(rtb.json.intake.voyageId)
    const vt = await prisma.voyage.findUnique({ where: { id: rtb.json.intake.voyageId }, include: { vessels: { orderBy: { sortOrder: 'asc' } } } })
    const daftar = (await api(D.sesi.manajerA, 'GET', '/api/automation/intakes')).json.intakes.find((x) => x.id === tb.id)
    cek('Step 4F: daftar memakai nama MASTER kapal utama & pelabuhan, tandai pasangan', daftar?.vesselName === D.kMmsi.name && daftar?.portName === D.portA2.name && daftar?.vesselCount === 2)
    cek('tug = kapal utama; VoyageVessel TUG + BARGE', vt.vesselId === D.kMmsi.id && vt.vessels.length === 2 && vt.vessels[0].role === 'TUG' && vt.vessels[1].vesselId === D.kBarge.id && vt.vessels[1].role === 'BARGE')
    cek('postCreateWarnings kosong', rtb.json.intake.postCreateWarnings.length === 0)
  }

  // Tolak
  const t = D.itPdf
  cek('tolak tanpa alasan → 400', (await tolak(D.sesi.adminA, t.id, t.version, '')).status === 400)
  const rj = await tolak(D.sesi.manajerA, t.id, t.version, 'Bukan untuk kami')
  cek('tolak → REJECTED, hash dilepas', rj.status === 200 && rj.json.intake.status === 'REJECTED' && (await prisma.vesselCallIntake.findUnique({ where: { id: t.id } })).activeHashKey === null)
}

async function ujiMasterBaru() {
  console.log('\n[G] Master yang belum ada → dibuat manusia lewat flow master')
  const nama = `${TAG}Kapal Baru ${ACAK}`
  const r = await kirimBaru(D.sesi.manajerA, nominasi({ vessels: [{ name: nama, imo: '9400124' }], portName: D.portA2.name, eta: hariDepan(200), principalName: `PT ${TAG}Principal Baru ${ACAK}`, customerName: `${TAG}Customer Baru ${ACAK}` }))
  let it = r.json.intake
  cek('kapal/principal/customer NOT_FOUND → approve diblok', it.matches.vessels[0].status === 'NOT_FOUND' && it.review.conditions.includes('PRIMARY_VESSEL_UNRESOLVED') && it.review.conditions.includes('PRINCIPAL_UNRESOLVED'))
  const masterAwal = await prisma.vessel.count({ where: { tenantId: D.A.id } })
  cek('tak ada master yang dibuat otomatis', masterAwal === (await prisma.vessel.count({ where: { tenantId: D.A.id } })) && !(await prisma.vessel.findFirst({ where: { name: nama } })))
  const kv = await api(D.sesi.manajerA, 'POST', '/api/vessels', { name: nama, imoNumber: '9400124' })
  cek('MANAJER_OPERASI boleh MEMBUAT kapal (POST /api/vessels)', kv.status === 200 && !!kv.json.vessel?.id, `${kv.status} ${kv.teks.slice(0, 80)}`)
  cek('MANAJER_OPERASI tetap TIDAK boleh mengubah/menghapus kapal', (await api(D.sesi.manajerA, 'PATCH', `/api/vessels/${kv.json.vessel.id}`, { name: 'x' })).status === 403 && (await api(D.sesi.manajerA, 'DELETE', `/api/vessels/${kv.json.vessel.id}`)).status === 403)
  cek('VIEWER tetap tak boleh membuat kapal', (await api(D.sesi.viewerA, 'POST', '/api/vessels', { name: `${TAG}viewer` })).status === 403)
  const kc = await api(D.sesi.manajerA, 'POST', '/api/customers', { name: `${TAG}Customer Baru ${ACAK}` })
  cek('MANAJER_OPERASI boleh MEMBUAT customer; tetap tak boleh mengubahnya', kc.status === 201 && (await api(D.sesi.manajerA, 'PATCH', `/api/customers/${kc.json.customer.id}`, { name: 'x' })).status === 403)
  const kp = await api(D.sesi.manajerA, 'POST', '/api/principals', { name: `PT ${TAG}Principal Baru ${ACAK}` })

  let p = await tambal(D.sesi.manajerA, it.id, it.version, { select: { entity: 'vessel', index: 0, id: kv.json.vessel.id, created: true } })
  it = p.json.intake
  cek('kaitkan kapal baru → CREATED_BY_REVIEWER', it.matches.vessels[0].basis === 'CREATED_BY_REVIEWER' && it.matches.vessels[0].selectedId === kv.json.vessel.id)
  p = await tambal(D.sesi.manajerA, it.id, it.version, { select: { entity: 'principal', id: kp.json.principal.id, created: true } })
  it = p.json.intake
  p = await tambal(D.sesi.manajerA, it.id, it.version, { select: { entity: 'customer', id: kc.json.customer.id, created: true } })
  it = p.json.intake
  cek('pelabuhan tidak bisa "dibuat" lewat intake → 400', (await tambal(D.sesi.manajerA, it.id, it.version, { select: { entity: 'port', id: D.portA.id, created: true } })).status === 400)
  const auditTinjau = await prisma.auditLog.findMany({ where: { tableName: 'VesselCallIntake', recordId: it.id, action: 'UPDATE' } })
  cek('audit mencatat master yang dibuat peninjau', auditTinjau.some((a) => JSON.stringify(a.newValue).includes(kv.json.vessel.id)))
  it = await lengkapi(D.sesi.manajerA, it)
  const ok = await setujui(D.sesi.manajerA, it.id, it.version, it.duplicateLevel === 'NO_DUPLICATE' ? {} : { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true, decisionReason: 'uji master baru terpisah' })
  cek('approve dengan master baru → COMPLETED; customer terisi', ok.status === 200 && ok.json.intake.status === 'COMPLETED', `${ok.status} ${ok.teks.slice(0, 160)}`)
  if (ok.json.intake?.voyageId) {
    lacak.voyage.add(ok.json.intake.voyageId)
    const v = await prisma.voyage.findUnique({ where: { id: ok.json.intake.voyageId } })
    cek('… voyage memakai kapal/principal/customer baru', v.vesselId === kv.json.vessel.id && v.principalId === kp.json.principal.id && v.customerId === kc.json.customer.id)
  }
  const auditA = await prisma.auditLog.findFirst({ where: { tableName: 'VesselCallIntake', recordId: it.id, action: 'APPROVE' } })
  cek('audit APPROVE memuat masterDibuatPeninjau', auditA?.newValue?.masterDibuatPeninjau?.includes(kv.json.vessel.id))
}

async function ujiPortal() {
  console.log('\n[H] Paparan portal klien')
  const portalAwal = JSON.stringify(await Promise.all(['portalUser', 'portalAccess', 'portalInvitation'].map((m) => prisma[m].count())))
  const r = await kirimBaru(D.sesi.adminA, nominasi({ vessels: [{ name: D.kImo.name, imo: '9398242' }], portUnlocode: D.portA.unlocode, eta: hariDepan(330), customerName: D.custPortal.name }))
  let it = r.json.intake
  cek('customer dicocokkan otomatis TIDAK dipakai tanpa tindakan peninjau', it.review.conditions.includes('CUSTOMER_UNRESOLVED') && it.review.portalActiveAccessCount === 0)
  it = (await tambal(D.sesi.adminA, it.id, it.version, { confirm: { entity: 'customer' } })).json.intake
  cek('customer dikonfirmasi → jumlah akses portal aktif terbaca', it.review.portalActiveAccessCount === 1 && it.review.decisionsNeeded.includes('PORTAL_ACK_REQUIRED'))
  it = await lengkapi(D.sesi.adminA, it)
  const keputusan = it.duplicateLevel === 'NO_DUPLICATE' ? {} : { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true, decisionReason: 'uji portal kunjungan terpisah' }
  const tanpaAck = await setujui(D.sesi.adminA, it.id, it.version, keputusan)
  cek('approve tanpa ack portal → 400 PORTAL_ACK_REQUIRED', tanpaAck.status === 400 && tanpaAck.json.error.details.conditions.includes('PORTAL_ACK_REQUIRED'))
  const ack = await setujui(D.sesi.adminA, it.id, it.version, { ...keputusan, portalExposureAck: true })
  cek('dengan ack → COMPLETED, ack tersimpan', ack.status === 200 && ack.json.intake.portalExposureAck === true, `${ack.status}`)
  if (ack.json.intake?.voyageId) lacak.voyage.add(ack.json.intake.voyageId)
  cek('intake tidak menulis tabel portal', JSON.stringify(await Promise.all(['portalUser', 'portalAccess', 'portalInvitation'].map((m) => prisma[m].count()))) === portalAwal)

  await prisma.portalAccess.update({ where: { id: D.portalAccess.id }, data: { revokedAt: new Date() } })
  const r2 = await kirimBaru(D.sesi.adminA, nominasi({ vessels: [{ name: D.kNama.name }], portName: D.portA2.name, eta: hariDepan(340) }))
  const s2 = await tambal(D.sesi.adminA, r2.json.intake.id, r2.json.intake.version, { select: { entity: 'customer', id: D.custPortal.id } })
  cek('akses portal dicabut → ack tidak wajib', s2.json.intake.review.portalActiveAccessCount === 0 && !s2.json.intake.review.decisionsNeeded.includes('PORTAL_ACK_REQUIRED'))
}

async function ujiGagalDanRekonsiliasi() {
  console.log('\n[I] Kegagalan createVoyage, retry, rekonsiliasi')
  // Tabrakan nomor voyage yang deterministik: nomor terakhir non-angka → createVoyage menghitung "000NaN".
  const tahun = new Date().getFullYear()
  const b1 = await prisma.voyage.create({ data: { tenantId: D.A.id, vesselId: D.kNama.id, voyageNumber: `VYG-${tahun}-zzzzzz`, status: 'CANCELLED', dataOrigin: 'UJI' } })
  const b2 = await prisma.voyage.create({ data: { tenantId: D.A.id, vesselId: D.kNama.id, voyageNumber: `VYG-${tahun}-000NaN`, status: 'CANCELLED', dataOrigin: 'UJI' } })
  lacak.blokir.add(b1.id)
  lacak.blokir.add(b2.id)
  let it = (await kirimBaru(D.sesi.adminA, nominasi({ vessels: [{ name: D.kImo.name, imo: '9398242' }], portName: D.portA2.name, eta: hariDepan(345) }))).json.intake
  it = await lengkapi(D.sesi.adminA, it)
  const kep = it.duplicateLevel === 'NO_DUPLICATE' ? {} : { duplicateDecision: 'CONTINUE_AS_NEW', duplicateConfirmed: true, decisionReason: 'uji kegagalan pembuatan' }
  const jumlah = await prisma.voyage.count({ where: { tenantId: D.A.id } })
  const gagalBuat = await setujui(D.sesi.adminA, it.id, it.version, kep)
  cek('createVoyage gagal (tabrakan nomor) → 409 CREATE_FAILED', gagalBuat.status === 409 && gagalBuat.json.error?.details?.errorCode === 'VOYAGE_NUMBER_COLLISION', `${gagalBuat.status} ${gagalBuat.teks.slice(0, 160)}`)
  cek('Step 4F: pesan utama tanpa kode mentah (kode hanya di details)', !gagalBuat.json.error.message.includes('VOYAGE_NUMBER_COLLISION') && /Voyage belum dibuat/.test(gagalBuat.json.error.message))
  const f = (await baca(D.sesi.adminA, it.id)).json.intake
  cek('… intake FAILED + errorCode, tanpa voyage, hash tetap dipegang', f.status === 'FAILED' && f.errorCode === 'VOYAGE_NUMBER_COLLISION' && (await prisma.voyage.count({ where: { tenantId: D.A.id } })) === jumlah && (await prisma.vesselCallIntake.findUnique({ where: { id: it.id } })).activeHashKey !== null)
  cek('… audit FAILED tercatat', (await prisma.auditLog.findMany({ where: { tableName: 'VesselCallIntake', recordId: it.id } })).some((a) => a.newValue?.status === 'FAILED'))
  cek('FAILED → approve ditolak (pakai retry)', (await setujui(D.sesi.adminA, it.id, f.version, kep)).status === 409)
  cek('OPERATOR retry → 403', (await cobaLagi(D.sesi.operatorA, it.id, f.version)).status === 403)
  await prisma.voyage.deleteMany({ where: { id: { in: [b1.id, b2.id] } } })
  lacak.blokir.clear()
  const ulang = await cobaLagi(D.sesi.adminA, it.id, f.version)
  cek('retry sesudah penyebab hilang → COMPLETED', ulang.status === 200 && ulang.json.intake.status === 'COMPLETED', `${ulang.status} ${ulang.teks.slice(0, 160)}`)
  if (ulang.json.intake?.voyageId) lacak.voyage.add(ulang.json.intake.voyageId)
  cek('retry dari COMPLETED → 409', (await cobaLagi(D.sesi.adminA, it.id, ulang.json.intake.version)).status === 409)

  // Proses terputus saat CREATING — tanpa voyage (> 5 menit) → FAILED
  let a = (await kirimBaru(D.sesi.adminA, nominasi({ vessels: [{ name: D.kNama.name }], portName: D.portA2.name, eta: hariDepan(350) }))).json.intake
  await prisma.vesselCallIntake.update({ where: { id: a.id }, data: { status: 'CREATING', claimedAt: new Date(Date.now() - 10 * 60_000) } })
  a = (await baca(D.sesi.adminA, a.id)).json.intake
  cek('CREATING terputus tanpa voyage → FAILED (CREATING_INTERRUPTED)', a.status === 'FAILED' && a.errorCode === 'CREATING_INTERRUPTED')
  // … klaim baru (< 5 menit) dibiarkan
  let b = (await kirimBaru(D.sesi.adminA, nominasi({ vessels: [{ name: D.kNama.name }], portName: D.portA2.name, eta: hariDepan(352) }))).json.intake
  await prisma.vesselCallIntake.update({ where: { id: b.id }, data: { status: 'CREATING', claimedAt: new Date() } })
  b = (await baca(D.sesi.adminA, b.id)).json.intake
  cek('CREATING baru (< 5 menit) → tetap CREATING, PATCH/approve 409', b.status === 'CREATING' && (await setujui(D.sesi.adminA, b.id, b.version)).status === 409)
  // … voyage ternyata sudah terbentuk → COMPLETED
  const vAda = await prisma.voyage.create({ data: { tenantId: D.A.id, vesselId: D.kNama.id, voyageNumber: `${TAG}VYG-REKON-${ACAK}`, sourceIntakeId: b.id, dataOrigin: 'UJI' } })
  b = (await baca(D.sesi.adminA, b.id)).json.intake
  cek('CREATING + voyage ber-sourceIntakeId ada → COMPLETED (RECONCILED)', b.status === 'COMPLETED' && b.voyageId === vAda.id && b.postCreateWarnings.includes('RECONCILED'))

  // Input sama sesudah terminal
  const isi = nominasi({ vessels: [{ name: D.kNama.name }], portName: D.portA2.name, eta: hariDepan(355) })
  const t1 = (await kirimBaru(D.sesi.adminA, isi)).json.intake
  await tolak(D.sesi.adminA, t1.id, t1.version, 'uji proses ulang')
  const t2 = await kirimBaru(D.sesi.adminA, isi)
  cek('input sama sesudah REJECTED → 409 ALREADY_PROCESSED', t2.status === 409 && t2.json.error?.details?.code === 'ALREADY_PROCESSED' && t2.json.error.details.intakeId === t1.id)
  const t3 = await kirimBaru(D.sesi.adminA, isi, { confirmReprocess: true })
  cek('… dengan confirmReprocess → intake baru', t3.status === 201 && t3.json.intake.id !== t1.id)
}

async function ujiRegresi() {
  console.log('\n[J] Regresi pembuatan voyage manual')
  const r = await api(D.sesi.operatorA, 'POST', '/api/voyages', { vesselId: D.kNama.id, portId: D.portA2.id, eta: hariDepan(9) })
  cek('OPERATOR membuat voyage manual → 201, sourceIntakeId null', r.status === 201 && r.json.voyage.sourceIntakeId === null)
  if (r.json.voyage?.id) lacak.voyage.add(r.json.voyage.id)
  const r2 = await api(D.sesi.manajerA, 'POST', '/api/voyages', { vesselId: D.kNama.id })
  cek('MANAJER_OPERASI membuat voyage manual → 201 (perluasan D3)', r2.status === 201)
  if (r2.json.voyage?.id) {
    lacak.voyage.add(r2.json.voyage.id)
    cek('MANAJER_OPERASI tetap tak boleh mengubah/menghapus voyage', (await api(D.sesi.manajerA, 'PATCH', `/api/voyages/${r2.json.voyage.id}`, { vesselId: D.kNama.id })).status === 403 && (await api(D.sesi.manajerA, 'DELETE', `/api/voyages/${r2.json.voyage.id}`)).status === 403)
  }
  cek('VIEWER tetap tak boleh membuat voyage', (await api(D.sesi.viewerA, 'POST', '/api/voyages', { vesselId: D.kNama.id })).status === 403)
  cek('sourceIntakeId dari body diabaikan (bukan jalur tulis kedua)', await (async () => {
    const x = await api(D.sesi.operatorA, 'POST', '/api/voyages', { vesselId: D.kNama.id, sourceIntakeId: 'palsu123' })
    if (x.json.voyage?.id) lacak.voyage.add(x.json.voyage.id)
    return x.status === 201 && x.json.voyage.sourceIntakeId === null
  })())
}

async function ujiFk() {
  console.log('\n[K] FK: hapus voyage & hapus tenant (eksperimen ROLLBACK)')
  const it = await prisma.vesselCallIntake.findFirst({ where: { tenantId: D.A.id, status: 'COMPLETED', voyageId: { not: null } } })
  let setNull = false
  let tenantTerhapus = false
  try {
    await prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { voyageId: it.voyageId } })
      await tx.voyage.delete({ where: { id: it.voyageId } })
      setNull = (await tx.vesselCallIntake.findUnique({ where: { id: it.id } })).voyageId === null
      await tx.tenant.delete({ where: { id: D.A.id } })
      tenantTerhapus = (await tx.vesselCallIntake.count({ where: { tenantId: D.A.id } })) === 0 && (await tx.voyage.count({ where: { tenantId: D.A.id } })) === 0
      throw Object.assign(new Error('ROLLBACK_SENGAJA'), { sengaja: true })
    }, { timeout: 60_000 })
  } catch (e) {
    if (!e.sengaja) info(`galat tak terduga: ${e.message}`)
  }
  cek('voyage dihapus fisik → intake.voyageId NULL (SET NULL)', setNull)
  cek('hapus tenant dengan intake + voyage ber-sourceIntakeId berhasil (CASCADE)', tenantTerhapus)
  cek('ROLLBACK: tenant & intake utuh kembali', !!(await prisma.tenant.findUnique({ where: { id: D.A.id } })) && (await prisma.vesselCallIntake.findUnique({ where: { id: it.id } })).voyageId === it.voyageId)
}

// =========================================================================== mode fitur MATI

async function ujiFlagMati() {
  console.log('\n[M] Fitur MATI (VESSEL_CALL_INTAKE_ENABLED bukan "true")')
  const sebelum = await prisma.vesselCallIntake.count()
  const aiSebelum = await prisma.securityEvent.count({ where: { kind: 'AI_CALL' } })
  for (const [nama, s] of [['ADMIN', D.sesi.adminA], ['MANAJER_OPERASI', D.sesi.manajerA], ['OPERATOR', D.sesi.operatorA]]) {
    const hasil = await Promise.all([
      api(s, 'GET', '/api/automation/intakes'),
      unggah(s, { text: nominasi({ vessels: [{ name: 'MATI' }], eta: hariDepan(3) }) }),
      api(s, 'GET', '/api/automation/intakes/apa-saja'),
      api(s, 'PATCH', '/api/automation/intakes/apa-saja', { version: 1 }),
      api(s, 'POST', '/api/automation/intakes/apa-saja/approve', { version: 1 }),
      api(s, 'POST', '/api/automation/intakes/apa-saja/reject', { version: 1, reason: 'x' }),
      api(s, 'POST', '/api/automation/intakes/apa-saja/link', { version: 1, voyageId: 'x' }),
      api(s, 'POST', '/api/automation/intakes/apa-saja/retry', { version: 1 }),
    ])
    cek(`${nama}: seluruh route intake → 404`, hasil.every((r) => r.status === 404), hasil.map((r) => r.status).join(','))
  }
  cek('halaman /automation/intake → 404', (await D.sesi.adminA.ambil('/automation/intake')).status === 404)
  cek('menu Intake tidak tampil', !(await (await D.sesi.adminA.ambil('/dashboard')).text()).includes('href="/automation/intake"'))
  cek('lampiran intake lewat jalur generik → 404', (await api(D.sesi.adminA, 'GET', '/api/attachments?entityType=VESSEL_CALL_INTAKE&entityId=apa-saja')).status === 404)
  cek('Automation Hub lain tetap jalan (monitoring 200)', (await api(D.sesi.adminA, 'GET', '/api/automation/health')).status === 200)
  cek('tidak ada intake / panggilan AI tercipta', (await prisma.vesselCallIntake.count()) === sebelum && (await prisma.securityEvent.count({ where: { kind: 'AI_CALL' } })) === aiSebelum)
  const r = await api(D.sesi.operatorA, 'POST', '/api/voyages', { vesselId: D.kNama.id })
  cek('pembuatan voyage manual tetap normal', r.status === 201 && r.json.voyage.sourceIntakeId === null)
  if (r.json.voyage?.id) lacak.voyage.add(r.json.voyage.id)
}

// =========================================================================== bersih-bersih

async function bersihkan(awalId) {
  const baru = async (model) => (await prisma[model].findMany({ select: { id: true } })).map((r) => r.id).filter((id) => !awalId[model].has(id))
  const intakeIds = [...new Set([...lacak.intake, ...(await baru('vesselCallIntake'))])]
  const voyageDariIntake = (await prisma.voyage.findMany({ where: { OR: [{ sourceIntakeId: { in: intakeIds } }, { id: { in: [...lacak.voyage, ...lacak.blokir] } }, { voyageNumber: { startsWith: TAG } }] }, select: { id: true } })).map((v) => v.id)
  const voyageBaru = (await baru('voyage')).filter((id) => !voyageDariIntake.includes(id))
  const semuaVoyage = [...voyageDariIntake, ...voyageBaru]
  const n = {
    lampiran: (await prisma.attachment.deleteMany({ where: { id: { in: await baru('attachment') } } })).count,
    komentar: (await prisma.comment.deleteMany({ where: { entityType: 'VESSEL_CALL_INTAKE' , entityId: { in: intakeIds } } })).count,
    intake: (await prisma.vesselCallIntake.deleteMany({ where: { id: { in: intakeIds } } })).count,
    pantau: (await prisma.monitoredVoyage.deleteMany({ where: { voyageId: { in: semuaVoyage } } })).count,
    tugas: (await prisma.task.deleteMany({ where: { voyageId: { in: semuaVoyage } } })).count,
    voyage: (await prisma.voyage.deleteMany({ where: { id: { in: semuaVoyage } } })).count,
    aksesPortal: (await prisma.portalAccess.deleteMany({ where: { id: { in: await baru('portalAccess') } } })).count,
    penggunaPortal: (await prisma.portalUser.deleteMany({ where: { email: { startsWith: EMAIL } } })).count,
    customer: (await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } })).count,
    principal: (await prisma.principal.deleteMany({ where: { name: { contains: TAG } } })).count,
    port: (await prisma.port.deleteMany({ where: { name: { startsWith: TAG } } })).count,
    kapal: (await prisma.vessel.deleteMany({ where: { OR: [{ name: { startsWith: TAG } }, { id: { in: await baru('vessel') } }] } })).count,
    audit: (await prisma.auditLog.deleteMany({ where: { id: { in: await baru('auditLog') } } })).count,
    pemakaian: (await prisma.usageEvent.deleteMany({ where: { id: { in: await baru('usageEvent') } } })).count,
    keamanan: (await prisma.securityEvent.deleteMany({ where: { id: { in: await baru('securityEvent') } } })).count,
    notifikasi: (await prisma.notification.deleteMany({ where: { id: { in: await baru('notification') } } })).count,
    pengguna: (await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } })).count,
  }
  console.log(`     dihapus → ${JSON.stringify(n)}`)
}

async function main() {
  console.log(`Uji Vessel Call Intake PRD-004 Step 3 — ${BASE_URL} — mode ${MODE_MATI ? 'FITUR MATI' : 'FITUR MENYALA'}`)
  if (process.env.AUTOMATION_MONITORING_ENABLED !== 'true' || ALLOW.length === 0) {
    throw new Error('Setel AUTOMATION_MONITORING_ENABLED=true dan AUTOMATION_TENANT_IDS di .env.local, lalu restart dev server.')
  }
  const hidup = process.env.VESSEL_CALL_INTAKE_ENABLED === 'true'
  if (!MODE_MATI && (!hidup || process.env.VESSEL_CALL_INTAKE_EXTRACTOR !== 'FAKE')) {
    throw new Error('Mode utama butuh VESSEL_CALL_INTAKE_ENABLED=true dan VESSEL_CALL_INTAKE_EXTRACTOR=FAKE di .env.local (lalu restart dev server).')
  }
  if (MODE_MATI && hidup) throw new Error('Mode --flag-off butuh VESSEL_CALL_INTAKE_ENABLED bukan "true" (lalu restart dev server).')

  const awal = await hitungGlobal()
  const awalId = {}
  for (const m of ['vesselCallIntake', 'voyage', 'attachment', 'portalAccess', 'vessel', 'auditLog', 'usageEvent', 'securityEvent', 'notification']) awalId[m] = await idSemua(m)
  const potretTenant = async () => JSON.stringify((await prisma.tenant.findMany({ orderBy: { id: 'asc' } })).map(({ updatedAt, ...r }) => r))
  const tenantAwal = await potretTenant()
  console.log(`Baris global sebelum uji: ${JSON.stringify(awal)}`)
  try {
    await siapkanData()
    if (MODE_MATI) {
      await ujiFlagMati()
    } else {
      await ujiAkses()
      await ujiSubmitDasar()
      await ujiBerkas()
      await ujiMatching()
      await ujiDuplikat()
      await ujiApproval()
      await ujiMasterBaru()
      await ujiPortal()
      await ujiGagalDanRekonsiliasi()
      await ujiRegresi()
      await ujiFk()
    }
  } finally {
    console.log('\n[Z] Bersih-bersih data disposable')
    await bersihkan(awalId)
    const akhir = await hitungGlobal()
    console.log(`Baris global sesudah uji: ${JSON.stringify(akhir)}`)
    cek('seluruh jumlah baris global kembali seperti semula', JSON.stringify(awal) === JSON.stringify(akhir), JSON.stringify(awal) === JSON.stringify(akhir) ? '' : `${JSON.stringify(awal)} vs ${JSON.stringify(akhir)}`)
    cek('baris Tenant tidak berubah (langganan dipulihkan)', (await potretTenant()) === tenantAwal)
  }
  console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
  if (gagal > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\n💥', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
