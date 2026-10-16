// Uji HTTP WA-2a 2a-G — API lokal pesan klien /api/automation/client-messages (jalur NYATA: sesi login, route,
// service F3/F4 + layanan baca, PostgreSQL). Berhenti di APPROVED; tidak ada Send.
//
// Jalankan TERHADAP `next dev` (NODE_ENV=development; produksi diuji terpisah: check-wa2a-g-prod.mjs) yang memakai
// PostgreSQL loopback sekali pakai SAMA dengan WA2G_API_DB_URL (sudah `prisma migrate deploy`):
//
//   DATABASE_URL=$U DIRECT_URL=$U NEXTAUTH_URL=http://localhost:3200 NEXTAUTH_SECRET=<acak> NEXT_TELEMETRY_DISABLED=1 \
//   AUTOMATION_MONITORING_ENABLED=true AUTOMATION_TENANT_IDS=wa2gapitenantaaaaaaa01,wa2gapitenantbbbbbbb02 \
//   WA2_CLIENT_FOUNDATION_ENABLED=true NODE_OPTIONS="--import $PWD/prisma/wa1-egress-trap.mjs" \
//     npx next dev -p 3200 > server.log 2>&1
//   WA2G_API_DB_URL=$U WA2G_API_BASE_URL=http://localhost:3200 WA2G_API_SERVER_LOG=server.log node prisma/check-wa2a-g-api.mjs
//
// Mode flag-mati: server yang sama dengan WA2_CLIENT_FOUNDATION_ENABLED=false, lalu WA2G_API_MODE=flag-mati →
// ke-11 endpoint wajib 403 WA2_DISABLED (juga dengan body/CSRF rusak) dan DB tidak berubah.
//
// Tanpa WA2G_API_DB_URL / WA2G_API_BASE_URL → DILEWATI (kode 3). DB & server WAJIB loopback; NODE_ENV=production ditolak.
// Data sintetis bertanda `WA2G-` (nomor pola +62996…), tenant id tetap, dibersihkan di awal & akhir.

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const URL_DB = process.env.WA2G_API_DB_URL
const BASE = process.env.WA2G_API_BASE_URL
const MODE = process.env.WA2G_API_MODE ?? 'aktif'
const LOG = process.env.WA2G_API_SERVER_LOG
if (!URL_DB || !BASE) {
  console.log('DILEWATI — WA2G_API_DB_URL dan WA2G_API_BASE_URL wajib diset (DB & next dev loopback).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['WA2G_API_DB_URL', URL_DB], ['WA2G_API_BASE_URL', BASE]]) {
  try {
    const u = new URL(v)
    if (!LOOPBACK.includes(u.hostname)) tolak.push(`${n} bukan loopback`)
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push(`${n} memuat parameter host`)
  } catch {
    tolak.push(`${n} tak terurai`)
  }
}
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production')
if (!['aktif', 'flag-mati'].includes(MODE)) tolak.push(`WA2G_API_MODE tidak dikenal: ${MODE}`)
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain (ambigu)`)
if (tolak.length) {
  console.log(`❌ DITOLAK (DB/server tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
const ASAL = process.env.WA2G_API_APP_ORIGIN ?? new URL(BASE).origin.replace('127.0.0.1', 'localhost')

// Service (fixture) dijalankan di proses uji ini dengan konfigurasi non-produksi; pemanggilan HTTP ke server lain.
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB
process.env.NODE_ENV = 'test'
process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'
delete process.env.WA1_INTERNAL_FAKE_TEST_ENABLED

// Jaring egress proses uji: fetch hanya ke server uji loopback.
const fetchAsli = globalThis.fetch
const egressUji = []
globalThis.fetch = (url, init) => {
  const u = new URL(typeof url === 'string' ? url : url.url)
  if (u.origin !== new URL(BASE).origin) {
    egressUji.push(u.host)
    throw new Error(`EGRESS_DILARANG_DALAM_UJI:${u.host}`)
  }
  return fetchAsli(url, init)
}

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

// Id tetap — server dijalankan dengan AUTOMATION_TENANT_IDS = A,B (C sengaja di luar allowlist).
const ID_A = 'wa2gapitenantaaaaaaa01'
const ID_B = 'wa2gapitenantbbbbbbb02'
const ID_C = 'wa2gapitenantccccccc03'
process.env.AUTOMATION_TENANT_IDS = `${ID_A},${ID_B}`
const TAG = 'WA2G-'
const SANDI = 'UjiWa2gApi!2026'
const JAM = 3_600_000
const BUKTI = 'Dokumen penunjukan resmi & konfirmasi telepon ke kantor pihak (uji sintetis).'
const ETA_LAMA = '2026-10-13'
const ETA_BARU = '2026-10-15'
const ETD_BARU = '2026-10-17'
let seq = 0
const uid = (p = 'x') => `${TAG}${p}-${++seq}`
let nomorSeq = 0
const nomorBaru = () => `+62996${String(++nomorSeq).padStart(8, '0')}`
const POLA_NOMOR = /\+?62996\d{8}/
const KUNCI_TERLARANG = ['logicalMessageKey', 'activeKey', 'successKey', 'sourceFingerprint', 'consentStateVersion', 'recipientE164Snapshot', 'e164', 'tenantId', 'grantId', 'idempotencyKey', 'basisFingerprint', 'createdByUserId', 'approvedByUserId', 'proposal', 'freshnessVerdict', 'confirmedByUserId', 'recordedByUserId', 'oldValue', 'newValue', 'version']

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
      const res = await fetch(`${BASE}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: header() } })
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
const P = '/api/automation/client-messages'
const rekaman = []
/** body: undefined = tanpa body; string = mentah; objek/array = JSON. Bawaan meniru peramban: Origin aplikasi + JSON pada POST. */
async function api(sesi, metode, path, body, headers = {}) {
  const mentah = typeof body === 'string'
  const dasar = { origin: ASAL, ...(metode === 'POST' ? { 'content-type': 'application/json' } : {}) }
  const gabung = Object.fromEntries(Object.entries({ ...dasar, ...headers }).filter(([, v]) => v !== null))
  const init = { method: metode, headers: gabung, body: body === undefined ? undefined : mentah ? body : JSON.stringify(body) }
  const res = sesi ? await sesi.ambil(path, init) : await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' })
  const teks = await res.text()
  let json = null
  try {
    json = JSON.parse(teks)
  } catch {
    /* bukan JSON */
  }
  rekaman.push({ path: `${metode} ${path}`, teks })
  return { status: res.status, json, teks }
}
const ok = (r, hasil) => r.status === 200 && r.json?.ok === true && (hasil === undefined || r.json.hasil === hasil)
const galat = (r, status, code, detailCode) => r.status === status && r.json?.error?.code === code && r.json.ok === undefined && (detailCode === undefined || r.json.error.details?.code === detailCode)
const ringkas = (r) => `${r.status} ${r.json?.hasil ?? r.json?.error?.code ?? ''}${r.json?.alasan ? '/' + r.json.alasan : ''}${r.json?.error?.details?.code ? '/' + r.json.error.details.code : ''}`

// ------------------------------------------------------------------ data
async function bersihkan() {
  const ids = [ID_A, ID_B, ID_C]
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.tenant.deleteMany({ where: { id: { in: ids } } })
}
const PERAN = { maker: 'ADMIN', manajer: 'MANAJER_OPERASI', admin2: 'ADMIN', checker: 'MANAJER_OPERASI', checker2: 'ADMIN', operator: 'OPERATOR', direktur: 'DIREKTUR' }
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
    const e = `wa2g-${nama.toLowerCase()}-${p.toLowerCase()}@uji.local`
    const u = await adm.user.create({ data: { tenantId: t.id, email: e, name: `${TAG}${nama}-${p}`, password: hash, role: PERAN[p], isActive: true } })
    ctx[p] = { tenantId: t.id, userId: u.id, role: PERAN[p] }
    email[p] = e
  }
  return { t, C1, P1, kapal, port, ctx, email, sesi: {} }
}
const voyage = (w) =>
  adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid('VYG'), dataOrigin: 'NYATA', status: 'CONFIRMED', customerId: w.C1.id, principalId: w.P1.id, eta: new Date(`${ETA_BARU}T00:00:00Z`), etd: new Date(`${ETD_BARU}T00:00:00Z`) } })
async function jadwal(w) {
  const v = await voyage(w)
  const a = await adm.auditLog.create({ data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: ETA_LAMA }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: ETA_BARU }, createdAt: new Date(Date.now() - JAM) } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', sourceRef: a.id, explanation: 'uji', recommendation: 'uji', after: { eta: ETA_BARU } } })
  return { v, a, s }
}
async function kontak(w, { optIn = true, partyType = 'CUSTOMER', partyId = w.C1.id } = {}) {
  const r = await KT.buatKontak(w.ctx.maker, { partyType, partyId, nomor: nomorBaru(), displayName: 'PIC uji', language: 'ID' })
  await KT.verifikasiKontak(w.ctx.maker, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: GS.tambahBulan(new Date(), 6) })
  if (optIn) await CS.catatOptIn(w.ctx.maker, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
  return r.contactId
}
const konfirmasi = (w, v, ctx = w.ctx.manajer, catatan = 'Noon report kapal (uji sintetis).') =>
  KJ.catatKonfirmasiJadwal(ctx, v.id, { field: 'eta', nilai: ETA_BARU, sourceKind: 'MASTER_OR_SHIP', sourceNote: catatan })
/** Sumber jadwal terkonfirmasi + kontak customer layak (fixture lewat service; bukan bagian API 2a-G). */
async function sumber(w) {
  const j = await jadwal(w)
  await konfirmasi(w, j.v)
  const cid = await kontak(w)
  return { ...j, cid }
}
/** Alur lewat HTTP: 'draf' | 'pratinjau' | 'menunggu' | 'disetujui'. Pembuat = maker, preview & peminta = admin2, checker = checker. */
async function alur(w, sampai, src = null) {
  const s = src ?? (await sumber(w))
  const d = await api(w.sesi.maker, 'POST', P, { signalId: s.s.id, contactId: s.cid })
  const o = { ...s, mid: d.json?.messageId, fp: d.json?.snapshotFingerprint, d }
  if (sampai === 'draf') return o
  o.pv = await api(w.sesi.admin2, 'POST', `${P}/${o.mid}/preview`, { snapshotFingerprint: o.fp })
  if (sampai === 'pratinjau') return o
  o.rq = await api(w.sesi.admin2, 'POST', `${P}/${o.mid}/request-approval`, { snapshotFingerprint: o.fp })
  o.aid = o.rq.json?.approvalRequestId
  if (sampai === 'menunggu') return o
  o.ap = await api(w.sesi.checker, 'POST', `${P}/approvals/${o.aid}/approve`, { proposalHash: o.fp })
  return o
}
const pesan = (id) => adm.waClientMessage.findFirst({ where: { id } })
const approval = (id) => adm.tahApprovalRequest.findFirst({ where: { id } })
async function potret(tenantIds) {
  const where = { tenantId: { in: tenantIds } }
  const [m, a, au, k, cs, kf] = await Promise.all([
    adm.waClientMessage.findMany({ where, select: { id: true, state: true, version: true, updatedAt: true, approvalRequestId: true }, orderBy: { id: 'asc' } }),
    adm.tahApprovalRequest.findMany({ where, select: { id: true, status: true, executionStatus: true, version: true }, orderBy: { id: 'asc' } }),
    adm.auditLog.count({ where }),
    adm.waContact.findMany({ where, select: { id: true, version: true }, orderBy: { id: 'asc' } }),
    adm.waConsentState.findMany({ where, select: { id: true, version: true }, orderBy: { id: 'asc' } }),
    adm.voyageScheduleConfirmation.count({ where }),
  ])
  return JSON.stringify({ m, a, au, k, cs, kf })
}
/** Semua kunci objek (rekursif) di JSON. */
function kunciJson(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => kunciJson(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.add(k), kunciJson(x, out))
  return out
}
/** 11 metode-path dengan id nyata. */
const sebelas = (o) => [
  ['GET', `${P}`],
  ['POST', `${P}`, { signalId: o.s.id, contactId: o.cid }],
  ['GET', `${P}/candidates/signals`],
  ['GET', `${P}/candidates/contacts?signalId=${o.s.id}`],
  ['GET', `${P}/${o.mid}`],
  ['GET', `${P}/${o.mid}/history`],
  ['POST', `${P}/${o.mid}/preview`, { snapshotFingerprint: o.fp }],
  ['POST', `${P}/${o.mid}/request-approval`, { snapshotFingerprint: o.fp }],
  ['POST', `${P}/${o.mid}/cancel`, { alasan: 'Dibatalkan staf (uji).' }],
  ['POST', `${P}/approvals/${o.aid}/approve`, { proposalHash: o.fp }],
  ['POST', `${P}/approvals/${o.aid}/reject`, { proposalHash: o.fp, decisionNote: 'Isi tidak sesuai (uji).' }],
]

function periksaLogServer() {
  if (!LOG || !existsSync(LOG)) {
    cek('log server tersedia untuk diperiksa (WA2G_API_SERVER_LOG)', false, 'tidak diset/tidak ada')
    return
  }
  const log = readFileSync(LOG, 'utf8')
  cek('log server: perangkap egress AKTIF di proses server', /\[WA1-EGRESS\] TRAP-AKTIF/.test(log))
  const blok = log.split('\n').filter((l) => l.includes('[WA1-EGRESS] BLOCKED'))
  // Satu-satunya egress yang dikenal = unduhan font next/font/google oleh `next dev` saat mengompilasi root layout
  // (sudah ada sebelum WA-2a). Tetap DIBLOKIR perangkap dan dilaporkan; host LAIN apa pun = gagal.
  const FONT = /^(fonts\.googleapis\.com|fonts\.gstatic\.com):443$/
  const host = (l) => l.replace(/^.*BLOCKED \w+ /, '').replace(/ pid=.*$/, '')
  const lain = blok.filter((l) => !FONT.test(host(l)))
  cek('log server: 0 upaya koneksi keluar ke host selain unduhan font next/font (semua tetap DIBLOKIR)', lain.length === 0, lain.slice(0, 5).join(' | '))
  console.log(`  ℹ upaya egress yang diblokir perangkap: ${blok.length} (host: ${[...new Set(blok.map(host))].join(', ') || '—'})`)
  cek('log server: tanpa nomor utuh, tanpa host provider WhatsApp/LLM', !POLA_NOMOR.test(log) && !/graph\.facebook|whatsapp\.(com|net)|api\.anthropic|api\.openai/i.test(log))
}

try {
  await bersihkan()
  const A = await dunia(ID_A, 'A')
  const B = await dunia(ID_B, 'B', ['maker', 'checker'])
  const C = await dunia(ID_C, 'C', ['maker'])
  for (const w of [A, B, C]) for (const p of Object.keys(w.email)) w.sesi[p] = await login(w.email[p])
  console.log(`mode=${MODE} base=${BASE} origin=${ASAL}`)

  if (MODE === 'flag-mati') {
    // ======================================================================== flag OFF
    bagian('[OFF] Flag WA2_CLIENT_FOUNDATION_ENABLED mati di server → 11 endpoint 403 WA2_DISABLED, DB tetap')
    const fx = await sumber(A)
    const d = await MS.buatDraftPesanKlien(A.ctx.maker, { signalId: fx.s.id, contactId: fx.cid })
    await MS.pratinjauPesanKlien(A.ctx.admin2, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
    const rq = await AP.mintaApprovalPesanKlien(A.ctx.admin2, { messageId: d.messageId, snapshotFingerprint: d.snapshotFingerprint })
    const o = { ...fx, mid: d.messageId, fp: d.snapshotFingerprint, aid: rq.approvalRequestId }
    const awal = await potret([ID_A, ID_B, ID_C])
    for (const [m, path, body] of sebelas(o)) {
      const r = await api(A.sesi.checker, m, path, body)
      cek(`${m} ${path.replace(o.mid ?? '-', ':id').replace(o.aid ?? '-', ':aid').replace(/\?.*/, '')} → 403 WA2_DISABLED`, galat(r, 403, 'FORBIDDEN') && /WA2_DISABLED/.test(r.json.error.message), ringkas(r))
    }
    for (const [n, body, h] of [
      ['Content-Type text/plain', 'x', { 'content-type': 'text/plain' }],
      ['tanpa Origin', { proposalHash: o.fp }, { origin: null }],
      ['Origin asing', { proposalHash: o.fp }, { origin: 'http://evil.example' }],
      ['body > 16 KiB', JSON.stringify({ x: 'a'.repeat(20_000) }), {}],
      ['JSON rusak', '{', {}],
    ]) {
      const r = await api(A.sesi.checker, 'POST', `${P}/approvals/${o.aid}/approve`, body, h)
      cek(`flag mati + ${n} → tetap 403 WA2_DISABLED (gerbang sebelum CSRF/body)`, galat(r, 403, 'FORBIDDEN') && /WA2_DISABLED/.test(r.json.error.message), ringkas(r))
    }
    cek('flag mati: tanpa sesi → 401; tenant luar allowlist → 404 (urutan pagar Automation tetap)', (await api(null, 'GET', P)).status === 401 && (await api(C.sesi.maker, 'GET', P)).status === 404)
    cek('flag mati: DB tidak berubah (pesan, approval, audit, kontak, consent, konfirmasi)', (await potret([ID_A, ID_B, ID_C])) === awal)
    cek('proses uji: 0 egress ke luar server loopback', egressUji.length === 0, egressUji.join(','))
    periksaLogServer()
  } else {
    // ======================================================================== Z
    bagian('[Z] Sesi, tenant, peran — dari sesi server (bukan klien)')
    const z = await sumber(A)
    cek('tanpa sesi: GET daftar → 401', galat(await api(null, 'GET', P), 401, 'UNAUTHORIZED'))
    cek('tanpa sesi: POST draft → 401 (tanpa baris)', galat(await api(null, 'POST', P, { signalId: z.s.id, contactId: z.cid }), 401, 'UNAUTHORIZED') && (await adm.waClientMessage.count({ where: { tenantId: ID_A } })) === 0)
    cek('tenant C (di luar allowlist Automation): GET/POST → 404', galat(await api(C.sesi.maker, 'GET', P), 404, 'NOT_FOUND') && galat(await api(C.sesi.maker, 'POST', P, { signalId: z.s.id, contactId: z.cid }), 404, 'NOT_FOUND'))
    for (const p of ['operator', 'direktur']) {
      cek(`peran ${PERAN[p]}: GET daftar & POST draft → 403`, galat(await api(A.sesi[p], 'GET', P), 403, 'FORBIDDEN') && galat(await api(A.sesi[p], 'POST', P, { signalId: z.s.id, contactId: z.cid }), 403, 'FORBIDDEN'))
    }
    const rOpBody = await api(A.sesi.operator, 'POST', P, 'bukan json', { 'content-type': 'text/plain', origin: 'http://evil.example' })
    cek('OPERATOR + body/Origin rusak → 403 pagar peran (gerbang SEBELUM CSRF/body; bukan galat body)', galat(rOpBody, 403, 'FORBIDDEN') && !/Asal permintaan|Content-Type/.test(rOpBody.json.error.message), rOpBody.json?.error?.message)
    const rInj = await api(A.sesi.maker, 'POST', P, { signalId: z.s.id, contactId: z.cid, tenantId: ID_B, userId: A.ctx.checker.userId, role: 'DIREKTUR' })
    const mInj = await pesan(rInj.json?.messageId)
    cek('tenantId/userId/role di body DIABAIKAN: pesan milik tenant sesi, pembuat = pengguna sesi', ok(rInj, 'DRAFT_DIBUAT') && mInj?.tenantId === ID_A && mInj?.createdByUserId === A.ctx.maker.userId, ringkas(rInj))
    await api(A.sesi.maker, 'POST', `${P}/${rInj.json?.messageId}/cancel`, { alasan: 'Bersihkan uji injeksi.' })

    // ======================================================================== K
    bagian('[K] Kandidat sinyal & kontak (petunjuk; draft menilai ulang)')
    const k = await sumber(A)
    const cTanpaOptIn = await kontak(A, { optIn: false })
    const ks = await api(A.sesi.maker, 'GET', `${P}/candidates/signals`)
    cek('GET candidates/signals → memuat sinyal jadwal (keluarga JADWAL), bentuk ringkas', ok(ks) && ks.json.data.items.some((i) => i.id === k.s.id && i.voyageId === k.v.id) && ks.json.data.items.every((i) => Object.keys(i).sort().join() === 'detectedAt,id,keluarga,kind,reviewState,voyageId'), ringkas(ks))
    const ksv = await api(A.sesi.maker, 'GET', `${P}/candidates/signals?voyageId=${k.v.id}&take=1`)
    cek('candidates/signals?voyageId&take=1 → tepat sinyal voyage itu', ok(ksv) && ksv.json.data.items.length === 1 && ksv.json.data.items[0].id === k.s.id)
    cek('candidates/signals: take=0 / take=abc / take=51 → 400', galat(await api(A.sesi.maker, 'GET', `${P}/candidates/signals?take=0`), 400, 'VALIDATION') && galat(await api(A.sesi.maker, 'GET', `${P}/candidates/signals?take=abc`), 400, 'VALIDATION') && galat(await api(A.sesi.maker, 'GET', `${P}/candidates/signals?take=51`), 400, 'VALIDATION'))
    const kk = await api(A.sesi.maker, 'GET', `${P}/candidates/contacts?signalId=${k.s.id}`)
    const kLayak = kk.json?.data?.items?.find((i) => i.contactId === k.cid)
    const kTidak = kk.json?.data?.items?.find((i) => i.contactId === cTanpaOptIn)
    cek('candidates/contacts: kontak opt-in → layak; tanpa opt-in → CONSENT_NOT_GRANTED; nomor tersamar', ok(kk) && kLayak?.layak === true && kTidak?.layak === false && kTidak?.alasan === 'CONSENT_NOT_GRANTED' && !POLA_NOMOR.test(kk.teks), `${kLayak?.layak}/${kTidak?.alasan}`)
    cek('candidates/contacts: tanpa signalId → 400; id tak ada → 404; sinyal tenant B oleh A → 404', galat(await api(A.sesi.maker, 'GET', `${P}/candidates/contacts`), 400, 'VALIDATION') && galat(await api(A.sesi.maker, 'GET', `${P}/candidates/contacts?signalId=cmtidakadasamasekali00001`), 404, 'NOT_FOUND') && galat(await api(B.sesi.maker, 'GET', `${P}/candidates/contacts?signalId=${k.s.id}`), 404, 'NOT_FOUND'))
    const dTanpa = await api(A.sesi.maker, 'POST', P, { signalId: k.s.id, contactId: cTanpaOptIn })
    cek('draft ke kontak tanpa opt-in → 400 (penilaian ulang service), tanpa baris', dTanpa.status === 400 && dTanpa.json?.error?.details?.code !== undefined && (await adm.waClientMessage.count({ where: { contactId: cTanpaOptIn } })) === 0, ringkas(dTanpa))

    // ======================================================================== F
    bagian('[F] Alur utama: draft → preview → minta approval → setujui (BERHENTI di APPROVED) → batal')
    const f = await sumber(A)
    const n0 = await adm.waClientMessage.count({ where: { tenantId: ID_A } })
    for (const [n, body, h, status, code] of [
      ['tanpa Origin', { signalId: f.s.id, contactId: f.cid }, { origin: null }, 403, 'FORBIDDEN'],
      ['Origin asing', { signalId: f.s.id, contactId: f.cid }, { origin: 'http://evil.example' }, 403, 'FORBIDDEN'],
      ['Sec-Fetch-Site cross-site', { signalId: f.s.id, contactId: f.cid }, { 'sec-fetch-site': 'cross-site' }, 403, 'FORBIDDEN'],
      ['Content-Type text/plain', JSON.stringify({ signalId: f.s.id, contactId: f.cid }), { 'content-type': 'text/plain' }, 400, 'VALIDATION'],
      ['body array', [f.s.id, f.cid], {}, 400, 'VALIDATION'],
      ['JSON rusak', '{"signalId":', {}, 400, 'VALIDATION'],
      ['body > 16 KiB', JSON.stringify({ signalId: f.s.id, contactId: f.cid, x: 'a'.repeat(20_000) }), {}, 400, 'VALIDATION'],
      ['signalId bukan string', { signalId: 7, contactId: f.cid }, {}, 400, 'VALIDATION'],
    ]) {
      const r = await api(A.sesi.maker, 'POST', P, body, h)
      cek(`POST draft ${n} → ${status} ${code}`, galat(r, status, code), ringkas(r))
    }
    cek('permintaan draft yang ditolak di atas: 0 baris pesan baru', (await adm.waClientMessage.count({ where: { tenantId: ID_A } })) === n0)
    const d1 = await api(A.sesi.maker, 'POST', P, { signalId: f.s.id, contactId: f.cid })
    cek('POST draft → 200 DRAFT_DIBUAT (revision 1, revisiDigantikan null, sidik 64-hex)', ok(d1, 'DRAFT_DIBUAT') && d1.json.revision === 1 && d1.json.revisiDigantikan === null && /^[0-9a-f]{64}$/.test(d1.json.snapshotFingerprint), ringkas(d1))
    const mid = d1.json.messageId
    const fp = d1.json.snapshotFingerprint
    const d1b = await api(A.sesi.maker, 'POST', P, { signalId: f.s.id, contactId: f.cid })
    cek('POST draft ulang (snapshot sama) → SUDAH_ADA, pesan sama, tanpa baris baru', ok(d1b, 'SUDAH_ADA') && d1b.json.messageId === mid && (await adm.waClientMessage.count({ where: { tenantId: ID_A } })) === n0 + 1)
    const ls = await api(A.sesi.maker, 'GET', `${P}?state=DRAFT`)
    const it = ls.json?.data?.items?.find((i) => i.id === mid)
    cek('GET daftar?state=DRAFT → memuat pesan; penerima tersamar; kunci ringkasan persis', ok(ls) && it?.state === 'DRAFT' && !POLA_NOMOR.test(ls.teks) && /^\+\d{2}••••\d{4}$/.test(it.penerimaTersamar) && Object.keys(it).sort().join() === 'approval,createdAt,finalizedAt,id,konteks,language,partyType,penerimaTersamar,reasonCode,revision,state,templateId,templateVersion,updatedAt', it ? Object.keys(it).sort().join() : 'tak ada')
    const dt = await api(A.sesi.maker, 'GET', `${P}/${mid}`)
    cek('GET detail DRAFT → aksi PRATINJAU/BATALKAN/BUAT_REVISI; label BELUM DIKIRIM; sidik = sidik draft', ok(dt) && dt.json.data.aksiTersedia.join() === 'PRATINJAU,BATALKAN,BUAT_REVISI' && /^BELUM DIKIRIM/.test(dt.json.data.labelPengiriman) && dt.json.data.snapshotFingerprint === fp && dt.json.data.approval === null, dt.json?.data?.aksiTersedia?.join())
    cek('detail: konteks voyage & sinyal, freshness LOLOS dengan bukti ringkas (tanpa ID pencatat)', dt.json?.data?.konteks?.voyageId === f.v.id && dt.json.data.konteks.signalIds.includes(f.s.id) && dt.json.data.freshness.status === 'LOLOS' && dt.json.data.freshness.buktiRingkas.length >= 1 && !JSON.stringify(dt.json.data.freshness).includes(A.ctx.manajer.userId), JSON.stringify(dt.json?.data?.freshness))
    const mDb = await pesan(mid)
    cek('detail: body = body tersimpan; fields hanya allowlist', dt.json?.data?.body === mDb.body && Object.keys(dt.json.data.fields).every((x) => ['keluarga', 'kategoriWajib', 'vesselName', 'voyageNumber', 'portName', 'perubahan', 'occurredAt', 'timezone', 'eventLocalTime'].includes(x)))
    const pvSalah = await api(A.sesi.admin2, 'POST', `${P}/${mid}/preview`, { snapshotFingerprint: 'a'.repeat(64) })
    cek('preview sidik salah → 200 DITOLAK SNAPSHOT_MISMATCH; pesan tetap DRAFT', ok(pvSalah, 'DITOLAK') && pvSalah.json.alasan === 'SNAPSHOT_MISMATCH' && (await pesan(mid)).state === 'DRAFT')
    cek('preview tanpa sidik → 400 VALIDATION', galat(await api(A.sesi.admin2, 'POST', `${P}/${mid}/preview`, {}), 400, 'VALIDATION'))
    const rqDraft = await api(A.sesi.admin2, 'POST', `${P}/${mid}/request-approval`, { snapshotFingerprint: fp })
    cek('minta approval atas DRAFT → 200 DITOLAK MESSAGE_STATE_INVALID; 0 approval', ok(rqDraft, 'DITOLAK') && rqDraft.json.alasan === 'MESSAGE_STATE_INVALID' && (await adm.tahApprovalRequest.count({ where: { subjectId: mid } })) === 0)
    const pv = await api(A.sesi.admin2, 'POST', `${P}/${mid}/preview`, { snapshotFingerprint: fp })
    cek('preview (admin2) → 200 DIPRATINJAU; pesan PREVIEWED', ok(pv, 'DIPRATINJAU') && (await pesan(mid)).state === 'PREVIEWED', ringkas(pv))
    const verPv = (await pesan(mid)).version
    const pv2 = await api(A.sesi.admin2, 'POST', `${P}/${mid}/preview`, { snapshotFingerprint: fp })
    cek('preview ulang → hasil service apa adanya: DITOLAK MESSAGE_STATE_INVALID (tanpa mutasi)', ok(pv2, 'DITOLAK') && pv2.json.alasan === 'MESSAGE_STATE_INVALID' && (await pesan(mid)).version === verPv, ringkas(pv2))
    cek('detail PREVIEWED → aksi MINTA_APPROVAL', (await api(A.sesi.admin2, 'GET', `${P}/${mid}`)).json?.data?.aksiTersedia?.includes('MINTA_APPROVAL'))
    const rq = await api(A.sesi.admin2, 'POST', `${P}/${mid}/request-approval`, { snapshotFingerprint: fp })
    const aid = rq.json?.approvalRequestId
    cek('minta approval (admin2) → 200 APPROVAL_DIMINTA + expiresAt ≈ 2 jam', ok(rq, 'APPROVAL_DIMINTA') && Math.abs(new Date(rq.json.expiresAt).getTime() - Date.now() - 2 * JAM) < 5 * 60_000, ringkas(rq))
    const rq2 = await api(A.sesi.admin2, 'POST', `${P}/${mid}/request-approval`, { snapshotFingerprint: fp })
    cek('minta ulang → SUDAH_ADA, approval sama, tanpa baris baru', ok(rq2, 'SUDAH_ADA') && rq2.json.approvalRequestId === aid && (await adm.tahApprovalRequest.count({ where: { subjectId: mid } })) === 1)
    const dtCk = await api(A.sesi.checker, 'GET', `${P}/${mid}`)
    const dtRq = await api(A.sesi.admin2, 'GET', `${P}/${mid}`)
    cek('detail PENDING: checker sah melihat SETUJUI/TOLAK; peminta TIDAK (maker-checker sebagai petunjuk)', dtCk.json?.data?.aksiTersedia?.includes('SETUJUI') && dtCk.json.data.aksiTersedia.includes('TOLAK') && !dtRq.json?.data?.aksiTersedia?.includes('SETUJUI') && dtCk.json.data.approval?.proposalHash === fp && dtCk.json.data.approval.status === 'PENDING')
    const a0 = await approval(aid)
    for (const [nama, s, harap] of [
      ['pembuat draft', A.sesi.maker, ['FORBIDDEN', 'CHECKER_IS_MAKER']],
      ['peminta approval (juga pemberi preview)', A.sesi.admin2, ['FORBIDDEN', 'SELF_APPROVAL_FORBIDDEN']],
      ['pencatat konfirmasi ETA', A.sesi.manajer, ['FORBIDDEN', 'CHECKER_IS_EVIDENCE_RECORDER']],
    ]) {
      const r1 = await api(s, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp })
      const r2 = await api(s, 'POST', `${P}/approvals/${aid}/reject`, { proposalHash: fp, decisionNote: 'Isi tidak sesuai (uji).' })
      cek(`maker-checker server: SETUJU & TOLAK oleh ${nama} → 403 ${harap[1]}`, galat(r1, 403, ...harap) && galat(r2, 403, ...harap), `${ringkas(r1)} | ${ringkas(r2)}`)
    }
    cek('OPERATOR approve → 403; tenant B approve approval A → 404; tenant C → 404', galat(await api(A.sesi.operator, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp }), 403, 'FORBIDDEN') && galat(await api(B.sesi.checker, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp }), 404, 'NOT_FOUND') && galat(await api(C.sesi.maker, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp }), 404, 'NOT_FOUND'))
    const apSalah = await api(A.sesi.checker, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: 'b'.repeat(64) })
    cek('approve proposalHash yang tidak dilihat → 200 DITOLAK PROPOSAL_HASH_MISMATCH', ok(apSalah, 'DITOLAK') && apSalah.json.alasan === 'PROPOSAL_HASH_MISMATCH')
    cek('approve tanpa Origin oleh checker sah → 403 CSRF', galat(await api(A.sesi.checker, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp }, { origin: null }), 403, 'FORBIDDEN'))
    const a1 = await approval(aid)
    cek('semua penolakan di atas: TANPA mutasi (versi approval tetap, pesan PENDING_APPROVAL)', a1.version === a0.version && a1.status === 'PENDING' && (await pesan(mid)).state === 'PENDING_APPROVAL')
    const ap = await api(A.sesi.checker, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp })
    const mAp = await pesan(mid)
    const aAp = await approval(aid)
    cek('approve (checker sah) → 200 DISETUJUI; approval APPROVED/NOT_STARTED; pesan APPROVED; successKey kosong', ok(ap, 'DISETUJUI') && aAp.status === 'APPROVED' && aAp.executionStatus === 'NOT_STARTED' && mAp.state === 'APPROVED' && mAp.successKey === null && aAp.decidedByUserId === A.ctx.checker.userId, ringkas(ap))
    cek('approve ulang & reject sesudahnya → SUDAH_DIPUTUSKAN (tanpa mutasi)', ok(await api(A.sesi.checker, 'POST', `${P}/approvals/${aid}/approve`, { proposalHash: fp }), 'SUDAH_DIPUTUSKAN') && ok(await api(A.sesi.checker2, 'POST', `${P}/approvals/${aid}/reject`, { proposalHash: fp, decisionNote: 'Terlambat (uji).' }), 'SUDAH_DIPUTUSKAN') && (await approval(aid)).version === aAp.version)
    const dtAp = await api(A.sesi.maker, 'GET', `${P}/${mid}`)
    cek('detail APPROVED → label BELUM DIKIRIM, aksi BATALKAN/BUAT_REVISI (tanpa aksi kirim)', ok(dtAp) && dtAp.json.data.state === 'APPROVED' && dtAp.json.data.approvedAt !== null && dtAp.json.data.aksiTersedia.join() === 'BATALKAN,BUAT_REVISI' && /^BELUM DIKIRIM/.test(dtAp.json.data.labelPengiriman))
    const hs = await api(A.sesi.maker, 'GET', `${P}/${mid}/history`)
    const pr = (hs.json?.data?.items ?? []).map((i) => i.peristiwa)
    cek('history: peristiwa pesan & approval (draft, preview, diminta, disetujui), kunci persis, aktor bernama', ok(hs) && ['WA2_APPROVAL_DIMINTA', 'WA2_APPROVAL_DISETUJUI', 'WA2_PESAN_DISETUJUI'].every((x) => pr.includes(x)) && hs.json.data.items.every((i) => Object.keys(i).sort().join() === 'aktor,alasan,id,objek,peristiwa,stateDari,stateKe,waktu') && hs.json.data.items.some((i) => i.objek === 'APPROVAL') && hs.json.data.items.some((i) => i.aktor.nama?.startsWith(TAG)), pr.join(','))
    const h1 = await api(A.sesi.maker, 'GET', `${P}/${mid}/history?take=1`)
    const h2 = await api(A.sesi.maker, 'GET', `${P}/${mid}/history?take=1&cursor=${h1.json?.data?.nextCursor}`)
    cek('history paginasi take=1 → nextCursor; halaman 2 = entri berikutnya (urut waktu turun)', ok(h1) && h1.json.data.items.length === 1 && h1.json.data.nextCursor && ok(h2) && h2.json.data.items[0]?.id === hs.json.data.items[1]?.id)
    cek('history: take=0/101 → 400; kursor asing → 404', galat(await api(A.sesi.maker, 'GET', `${P}/${mid}/history?take=0`), 400, 'VALIDATION') && galat(await api(A.sesi.maker, 'GET', `${P}/${mid}/history?take=101`), 400, 'VALIDATION') && galat(await api(A.sesi.maker, 'GET', `${P}/${mid}/history?cursor=cmtidakadasamasekali00001`), 404, 'NOT_FOUND'))
    cek('cancel alasan terlalu pendek → 400 DECISION_NOTE_INVALID', galat(await api(A.sesi.maker, 'POST', `${P}/${mid}/cancel`, { alasan: 'x' }), 400, 'VALIDATION', 'DECISION_NOTE_INVALID'))
    const cn = await api(A.sesi.maker, 'POST', `${P}/${mid}/cancel`, { alasan: 'Dibatalkan staf (uji).' })
    cek('cancel APPROVED → DIBATALKAN (approvalDihentikan); pesan CANCELED; eksekusi CANCELLED', ok(cn, 'DIBATALKAN') && cn.json.approvalDihentikan === true && (await pesan(mid)).state === 'CANCELED' && (await approval(aid)).executionStatus === 'CANCELLED', ringkas(cn))
    cek('cancel ulang → SUDAH_DIBATALKAN', ok(await api(A.sesi.maker, 'POST', `${P}/${mid}/cancel`, { alasan: 'Dibatalkan staf (uji).' }), 'SUDAH_DIBATALKAN'))

    // ======================================================================== J
    bagian('[J] Tolak oleh checker')
    const j = await alur(A, 'menunggu')
    cek('reject tanpa catatan → 400 DECISION_NOTE_INVALID; catatan 2 huruf → 400', galat(await api(A.sesi.checker, 'POST', `${P}/approvals/${j.aid}/reject`, { proposalHash: j.fp }), 400, 'VALIDATION', 'DECISION_NOTE_INVALID') && galat(await api(A.sesi.checker, 'POST', `${P}/approvals/${j.aid}/reject`, { proposalHash: j.fp, decisionNote: 'ab' }), 400, 'VALIDATION', 'DECISION_NOTE_INVALID'))
    const rj = await api(A.sesi.checker, 'POST', `${P}/approvals/${j.aid}/reject`, { proposalHash: j.fp, decisionNote: 'Isi tidak sesuai (uji).' })
    cek('reject → DITOLAK_PEMUTUS; pesan REJECTED; approval REJECTED', ok(rj, 'DITOLAK_PEMUTUS') && (await pesan(j.mid)).state === 'REJECTED' && (await approval(j.aid)).status === 'REJECTED', ringkas(rj))
    const cj = await api(A.sesi.maker, 'POST', `${P}/${j.mid}/cancel`, { alasan: 'Batal setelah ditolak (uji).' })
    cek('cancel pesan REJECTED → 200 DITOLAK (hasil service), tanpa mutasi', ok(cj, 'DITOLAK') && (await pesan(j.mid)).state === 'REJECTED', ringkas(cj))

    // ======================================================================== V
    bagian('[V] Revisi, kedaluwarsa, perubahan freshness & consent — mengikuti service')
    const v1 = await alur(A, 'menunggu')
    await konfirmasi(A, v1.v, A.ctx.maker, 'Konfirmasi pengganti (uji sintetis).')
    const rv = await api(A.sesi.admin2, 'POST', P, { signalId: v1.s.id, contactId: v1.cid })
    cek('revisi (bukti berubah) → DRAFT_DIBUAT revision 2, revisiDigantikan = lama; lama CANCELED + approval SUPERSEDED', ok(rv, 'DRAFT_DIBUAT') && rv.json.revision === 2 && rv.json.revisiDigantikan === v1.mid && (await pesan(v1.mid)).state === 'CANCELED' && (await approval(v1.aid)).status === 'SUPERSEDED', ringkas(rv))
    cek('keputusan atas approval yang digantikan → SUDAH_DIPUTUSKAN', ok(await api(A.sesi.checker, 'POST', `${P}/approvals/${v1.aid}/approve`, { proposalHash: v1.fp }), 'SUDAH_DIPUTUSKAN'))
    const e1 = await alur(A, 'menunggu')
    await adm.tahApprovalRequest.update({ where: { id: e1.aid }, data: { expiresAt: new Date(Date.now() - 1) } })
    const dtE = await api(A.sesi.checker, 'GET', `${P}/${e1.mid}`)
    cek('detail approval lewat expiresAt → aksi SETUJUI/TOLAK tidak ditawarkan', ok(dtE) && !dtE.json.data.aksiTersedia.includes('SETUJUI'))
    const ex = await api(A.sesi.checker, 'POST', `${P}/approvals/${e1.aid}/approve`, { proposalHash: e1.fp })
    cek('approve setelah kedaluwarsa → KEDALUWARSA; approval & pesan EXPIRED', ok(ex, 'KEDALUWARSA') && (await approval(e1.aid)).status === 'EXPIRED' && (await pesan(e1.mid)).state === 'EXPIRED', ringkas(ex))
    const f1 = await alur(A, 'menunggu')
    const kf = await adm.voyageScheduleConfirmation.findFirst({ where: { voyageId: f1.v.id }, orderBy: { confirmedAt: 'desc' } })
    await KJ.invalidasiKonfirmasiJadwal(A.ctx.manajer, kf.id, { alasan: 'Keliru (uji).' })
    const fr = await api(A.sesi.checker, 'POST', `${P}/approvals/${f1.aid}/approve`, { proposalHash: f1.fp })
    cek('freshness berubah (konfirmasi diinvalidasi) → approve DITAHAN; pesan NEEDS_REVIEW; approval tidak APPROVED', ok(fr, 'DITAHAN') && (await pesan(f1.mid)).state === 'NEEDS_REVIEW' && (await approval(f1.aid)).status !== 'APPROVED', ringkas(fr))
    const c1 = await alur(A, 'menunggu')
    await CS.catatOptOut(A.ctx.maker, c1.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji sintetis).' })
    const dtC = await api(A.sesi.maker, 'GET', `${P}/${c1.mid}`)
    cek('opt-out atas PENDING → detail NEEDS_REVIEW, approval CANCELLED, aksi BATALKAN/BUAT_REVISI', ok(dtC) && dtC.json.data.state === 'NEEDS_REVIEW' && dtC.json.data.approval?.status === 'CANCELLED' && dtC.json.data.aksiTersedia.join() === 'BATALKAN,BUAT_REVISI', `${dtC.json?.data?.state}/${dtC.json?.data?.approval?.status}`)
    cek('approve setelah hold → SUDAH_DIPUTUSKAN (tak menghidupkan kembali)', ok(await api(A.sesi.checker, 'POST', `${P}/approvals/${c1.aid}/approve`, { proposalHash: c1.fp }), 'SUDAH_DIPUTUSKAN'))
    cek('cancel NEEDS_REVIEW → DIBATALKAN', ok(await api(A.sesi.maker, 'POST', `${P}/${c1.mid}/cancel`, { alasan: 'Kontak berhenti berlangganan (uji).' }), 'DIBATALKAN') && (await pesan(c1.mid)).state === 'CANCELED')
    const ad = await alur(A, 'disetujui')
    await CS.catatOptOut(A.ctx.maker, ad.cid, { kanal: 'WHATSAPP', bukti: 'STOP (uji sintetis).' })
    cek('APPROVED tetap bisa dibatalkan sistem: opt-out atas APPROVED → NEEDS_REVIEW + eksekusi CANCELLED', ok(ad.ap, 'DISETUJUI') && (await pesan(ad.mid)).state === 'NEEDS_REVIEW' && (await approval(ad.aid)).executionStatus === 'CANCELLED')

    // ======================================================================== C
    bagian('[C] Konkurensi lewat HTTP')
    let anomali = 0
    const pemenang = []
    for (let i = 0; i < 4; i++) {
      const p = await alur(A, 'menunggu')
      const [x, y] = await Promise.all([
        api(A.sesi.checker, 'POST', `${P}/approvals/${p.aid}/approve`, { proposalHash: p.fp }),
        api(A.sesi.checker2, 'POST', `${P}/approvals/${p.aid}/reject`, { proposalHash: p.fp, decisionNote: 'Tolak paralel (uji).' }),
      ])
      const hasil = [x, y].map((r) => (r.status === 200 ? r.json.hasil : `${r.status}:${r.json?.error?.code}`))
      const final = hasil.filter((h) => h === 'DISETUJUI' || h === 'DITOLAK_PEMUTUS').length
      const sisa = hasil.filter((h) => h !== 'DISETUJUI' && h !== 'DITOLAK_PEMUTUS')
      const a = await approval(p.aid)
      pemenang.push(hasil.find((h) => h === 'DISETUJUI' || h === 'DITOLAK_PEMUTUS') ?? '-')
      if (final !== 1 || !sisa.every((h) => h === 'SUDAH_DIPUTUSKAN' || h === '409:CONFLICT') || !['APPROVED', 'REJECTED'].includes(a.status)) anomali++
    }
    cek('4× approve ∥ reject → tepat satu keputusan final; yang lain SUDAH_DIPUTUSKAN/409; tanpa 500', anomali === 0, `anomali ${anomali}; pemenang ${pemenang.join(',')}`)
    let gandaDraft = 0
    for (let i = 0; i < 3; i++) {
      const s = await sumber(A)
      const rs = await Promise.all([1, 2, 3].map(() => api(A.sesi.maker, 'POST', P, { signalId: s.s.id, contactId: s.cid })))
      const baris = await adm.waClientMessage.count({ where: { contactId: s.cid } })
      const dibuat = rs.filter((r) => ok(r, 'DRAFT_DIBUAT')).length
      if (baris !== 1 || dibuat !== 1 || rs.some((r) => r.status >= 500 || (r.status !== 200 && r.status !== 409))) gandaDraft++
    }
    cek('3× tiga POST draft bersamaan → tepat 1 baris & 1 DRAFT_DIBUAT; sisanya SUDAH_ADA/409; tanpa 500', gandaDraft === 0, `anomali ${gandaDraft}`)

    // ======================================================================== I
    bagian('[I] Isolasi tenant & validasi query')
    const iA = await alur(A, 'menunggu')
    const bLs = await api(B.sesi.maker, 'GET', P)
    cek('tenant B: daftar tidak memuat pesan A', ok(bLs) && !bLs.json.data.items.some((x) => x.id === iA.mid))
    let bocorB = 0
    for (const [m, path, body] of sebelas(iA).filter(([, p]) => p.includes(iA.mid) || p.includes(iA.aid) || p.includes('signalId'))) {
      const r = await api(B.sesi.maker, m, path, body)
      if (!galat(r, 404, 'NOT_FOUND')) bocorB++
    }
    cek('tenant B atas id pesan/approval/sinyal A (8 endpoint) → semuanya 404', bocorB === 0, `${bocorB} bukan 404`)
    cek('tenant B: sinyal kandidat tidak memuat sinyal A', !(await api(B.sesi.maker, 'GET', `${P}/candidates/signals`)).json?.data?.items?.some((x) => x.id === iA.s.id))
    cek('pesan A tidak berubah oleh percobaan B', (await pesan(iA.mid)).state === 'PENDING_APPROVAL' && (await approval(iA.aid)).status === 'PENDING')
    for (const [q, harap] of [['state=SENT', 400], ['state=draft', 400], ['take=0', 400], ['take=51', 400], ['take=-1', 400], ['take=1.5', 400], ['cursor=cmtidakadasamasekali00001', 404]]) {
      const r = await api(A.sesi.maker, 'GET', `${P}?${q}`)
      cek(`GET daftar ?${q} → ${harap}`, r.status === harap && r.json?.ok === undefined, ringkas(r))
    }
    const pg1 = await api(A.sesi.maker, 'GET', `${P}?take=2`)
    const pg2 = await api(A.sesi.maker, 'GET', `${P}?take=2&cursor=${pg1.json?.data?.nextCursor}`)
    cek('daftar paginasi take=2 → nextCursor; halaman 2 tanpa tumpang-tindih', ok(pg1) && pg1.json.data.items.length === 2 && ok(pg2) && pg2.json.data.items.length > 0 && !pg2.json.data.items.some((x) => pg1.json.data.items.some((y) => y.id === x.id)))
    cek('id pesan tak ada → 404 (detail/history/preview/cancel)', galat(await api(A.sesi.maker, 'GET', `${P}/cmtidakadasamasekali00001`), 404, 'NOT_FOUND') && galat(await api(A.sesi.maker, 'GET', `${P}/cmtidakadasamasekali00001/history`), 404, 'NOT_FOUND') && galat(await api(A.sesi.maker, 'POST', `${P}/cmtidakadasamasekali00001/preview`, { snapshotFingerprint: 'a'.repeat(64) }), 404, 'NOT_FOUND') && galat(await api(A.sesi.maker, 'POST', `${P}/cmtidakadasamasekali00001/cancel`, { alasan: 'Tidak ada (uji).' }), 404, 'NOT_FOUND'))
    cek('id > 64 karakter → 400', galat(await api(A.sesi.maker, 'GET', `${P}/${'x'.repeat(65)}`), 400, 'VALIDATION'))

    // ======================================================================== X
    bagian('[X] Kebocoran, tanpa Send, egress')
    const bocorNomor = rekaman.filter((r) => POLA_NOMOR.test(r.teks))
    cek(`${rekaman.length} respons API: tanpa nomor utuh (+62996…)`, rekaman.length > 150 && bocorNomor.length === 0, bocorNomor.map((r) => r.path).slice(0, 3).join(' | '))
    const kunci = new Set()
    for (const r of rekaman) {
      try {
        kunciJson(JSON.parse(r.teks), kunci)
      } catch {
        /* bukan JSON */
      }
    }
    const terlarang = KUNCI_TERLARANG.filter((x) => kunci.has(x))
    cek('respons API tanpa field internal (activeKey/successKey/logicalMessageKey/sourceFingerprint/tenantId/grant/proposal/audit mentah/version…)', terlarang.length === 0, terlarang.join(', '))
    cek('respons 500 tidak ada', !rekaman.some((r) => /"code":"INTERNAL"/.test(r.teks)))
    const kirim = await api(A.sesi.checker, 'POST', `${P}/${iA.mid}/send`, {})
    cek('tidak ada endpoint Send (POST :id/send → 404/405, bukan 200)', kirim.status === 404 || kirim.status === 405, String(kirim.status))
    cek('tidak ada pesan yang punya successKey / attempt WA-1 di tenant uji', (await adm.waClientMessage.count({ where: { tenantId: { in: [ID_A, ID_B] }, successKey: { not: null } } })) === 0 && (await adm.communicationAttempt.count({ where: { tenantId: { in: [ID_A, ID_B] } } })) === 0)
    cek('proses uji: 0 egress ke luar server loopback', egressUji.length === 0, egressUji.join(','))
    periksaLogServer()
    console.log(`  ℹ status pesan uji A: ${JSON.stringify(await adm.waClientMessage.groupBy({ by: ['state'], where: { tenantId: ID_A }, _count: true }).then((g) => Object.fromEntries(g.map((x) => [x.state, x._count]))))}`)
  }
} catch (e) {
  gagal++
  console.log(`  ❌ PENGECUALIAN TAK TERDUGA: ${e?.stack ?? e}`)
} finally {
  await bersihkan().catch((e) => console.log(`  ⚠️  pembersihan gagal: ${e?.message}`))
  await adm.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
