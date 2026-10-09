// Uji HTTP Step 2H — API WA-1 /api/automation/communications (jalur NYATA: sesi login, route, DB).
//
// Jalankan TERHADAP `next dev` (BUKAN `next start`: itu NODE_ENV=production, yang memang ditolak
// gerbang WA-1 / D-12) yang memakai PostgreSQL loopback sekali pakai SAMA dengan COMM_API_DB_URL:
//
//   DATABASE_URL=$U DIRECT_URL=$U NEXTAUTH_URL=http://localhost:3100 NEXTAUTH_SECRET=<acak> \
//   AUTOMATION_MONITORING_ENABLED=true WA1_INTERNAL_FAKE_TEST_ENABLED=true NEXT_TELEMETRY_DISABLED=1 \
//   AUTOMATION_TENANT_IDS=wa1s2hapitenantaaaaaaa01,wa1s2hapitenantbbbbbbb02 \
//     npx next dev -p 3100
//   COMM_API_DB_URL=$U COMM_API_BASE_URL=http://localhost:3100 node prisma/check-comm-api.mjs
//
// Tanpa COMM_API_DB_URL / COMM_API_BASE_URL → DILEWATI (kode 3). DB & server WAJIB loopback.
// Semua baris bertanda `WA1S2H-` (tenant dengan id tetap di bawah) dan dihapus di akhir.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
const URL_DB = process.env.COMM_API_DB_URL
const BASE = process.env.COMM_API_BASE_URL
if (!URL_DB || !BASE) {
  console.log('DILEWATI — COMM_API_DB_URL dan COMM_API_BASE_URL wajib diset (DB & next dev loopback).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['COMM_API_DB_URL', URL_DB], ['COMM_API_BASE_URL', BASE]]) {
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
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })
// Origin aplikasi yang sah = origin NEXTAUTH_URL server (bawaan sesuai perintah jalan di atas).
const ASAL = process.env.COMM_API_APP_ORIGIN ?? 'http://localhost:3100'

// Id tetap — server dijalankan dengan AUTOMATION_TENANT_IDS = A,B (C sengaja di luar allowlist).
const ID_A = 'wa1s2hapitenantaaaaaaa01'
const ID_B = 'wa1s2hapitenantbbbbbbb02'
const ID_C = 'wa1s2hapitenantccccccc03'
const TAG = 'WA1S2H-'
const SANDI = 'UjiWa1s2hApi!2026'
const WAKTU = '2026-10-05T02:30:00.000Z'
const FX = 'WA1_TEST_FIXTURE_SUCCESS'
const FX_GAGAL = 'WA1_TEST_FIXTURE_FAIL'
const ID_PALSU = 'cmidtidakadasamasekali0001'
let seq = 0
const uid = () => `${TAG}${++seq}`
let rkSeq = 0
const rk = () => `rk-${Date.now().toString(36)}-${++rkSeq}`

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
const P = '/api/automation/communications'
/**
 * body: undefined = tanpa body; string = mentah; objek = JSON. Permintaan SAH meniru UI di peramban:
 * header Origin = origin aplikasi, dan POST selalu `Content-Type: application/json` (juga tanpa body).
 * `headers` menimpa bawaan; nilai null = header itu TIDAK dikirim.
 */
async function api(sesi, metode, path, body, headers = {}) {
  const mentah = typeof body === 'string'
  const dasar = { origin: ASAL, ...(metode === 'POST' || body !== undefined ? { 'content-type': 'application/json' } : {}) }
  const gabung = Object.fromEntries(Object.entries({ ...dasar, ...headers }).filter(([, v]) => v !== null))
  const init = {
    method: metode,
    headers: gabung,
    body: body === undefined ? undefined : mentah ? body : JSON.stringify(body),
  }
  const res = sesi ? await sesi.ambil(path, init) : await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' })
  const teks = await res.text()
  let json = null
  try {
    json = JSON.parse(teks)
  } catch {
    /* bukan JSON */
  }
  return { status: res.status, json, teks }
}

// ------------------------------------------------------------------ data
async function bersihkan() {
  const ids = [ID_A, ID_B, ID_C]
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.tenant.deleteMany({ where: { id: { in: ids } } })
}
async function dunia(id, nama, peran) {
  const t = await adm.tenant.create({ data: { id, companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: `MT Contoh ${nama}` } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: `Pelabuhan Uji ${nama}`, timezone: 'Asia/Makassar' } })
  const hash = await bcrypt.hash(SANDI, 10)
  const email = {}
  for (const r of peran) {
    const e = `wa1s2h-${nama.toLowerCase()}-${r.toLowerCase()}@uji.local`
    await adm.user.create({ data: { tenantId: t.id, email: e, name: `${TAG}${nama}-${r}`, password: hash, role: r, isActive: true } })
    email[r] = e
  }
  return { t, kapal, port, email }
}
/** Sumber EOSP + sinyal (fakta operasional dibuat langsung di DB; alur WA-1 lewat HTTP). */
async function sumberEosp(w) {
  const v = await adm.voyage.create({ data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid() } })
  const ev = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode: 'EOSP', occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
  const s = await adm.monitoringSignal.create({ data: { tenantId: w.t.id, voyageId: v.id, kind: 'OPERATIONAL_EVENT_RECORDED', severity: 'INFO', dedupeKey: uid(), sourceType: 'VOYAGE_EVENT', sourceRef: ev.id, explanation: 'uji', recommendation: 'uji', after: { eventCode: 'EOSP', occurredAt: WAKTU } } })
  return { v, ev, s }
}
/** Alur lewat HTTP sampai titik tertentu: 'draf' | 'pratinjau' | 'menunggu' | 'disetujui'. */
async function alur(sesi, w, sampai, { fx = FX } = {}) {
  const src = await sumberEosp(w)
  const c = await api(sesi, 'POST', `${P}/candidates`, { signalId: src.s.id })
  const r = await api(sesi, 'POST', `${P}/candidates/${c.json?.candidateId}/revisions`, { recipientFixtureId: fx, language: 'ID' })
  const o = { ...src, candidateId: c.json?.candidateId, messageId: r.json?.messageId, fp: r.json?.snapshotFingerprint, langkah: [c, r] }
  if (sampai === 'draf') return o
  o.langkah.push(await api(sesi, 'POST', `${P}/messages/${o.messageId}/preview`, { snapshotFingerprint: o.fp }))
  if (sampai === 'pratinjau') return o
  const a = await api(sesi, 'POST', `${P}/messages/${o.messageId}/approval-request`)
  o.approvalId = a.json?.approvalRequestId
  o.langkah.push(a)
  if (sampai === 'menunggu') return o
  o.langkah.push(await api(sesi, 'POST', `${P}/approvals/${o.approvalId}/approve`, {}))
  return o
}
const ok200 = (r, hasil) => r.status === 200 && r.json?.ok === true && (hasil === undefined || r.json.hasil === hasil)
const galat = (r, status, code) => r.status === status && r.json?.error?.code === code && r.json.ok === undefined

async function potretTenant(tenantId) {
  const [c, m, a, at, au] = await Promise.all([
    adm.communicationCandidate.findMany({ where: { tenantId }, select: { id: true, state: true, version: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    adm.communicationMessage.findMany({ where: { tenantId }, select: { id: true, state: true, version: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    adm.tahApprovalRequest.findMany({ where: { tenantId }, select: { id: true, status: true, executionStatus: true, version: true }, orderBy: { id: 'asc' } }),
    adm.communicationAttempt.findMany({ where: { tenantId }, select: { id: true, state: true }, orderBy: { id: 'asc' } }),
    adm.auditLog.count({ where: { tenantId } }),
  ])
  return JSON.stringify({ c, m, a, at, au })
}

try {
  await bersihkan()
  const A = await dunia(ID_A, 'A', ['ADMIN', 'MANAJER_OPERASI', 'OPERATOR', 'FINANCE'])
  const B = await dunia(ID_B, 'B', ['ADMIN'])
  const C = await dunia(ID_C, 'C', ['ADMIN'])
  const sA = await login(A.email.ADMIN)
  const sMo = await login(A.email.MANAJER_OPERASI)
  const sOp = await login(A.email.OPERATOR)
  const sFin = await login(A.email.FINANCE)
  const sB = await login(B.email.ADMIN)
  const sC = await login(C.email.ADMIN)

  // Data rujukan di A (dan B) yang dibuat lewat HTTP.
  const ref = await alur(sA, A, 'disetujui')
  cek('0. persiapan lewat HTTP: prepare → revisi → preview → minta approval → approve semuanya 200 + hasil', ref.langkah.every((r) => r.status === 200 && r.json?.ok === true) && ref.langkah.map((r) => r.json.hasil).join() === 'SIAP,REVISI_DIBUAT,DIPRATINJAU,APPROVAL_DIMINTA,DISETUJUI', ref.langkah.map((r) => `${r.status}:${r.json?.hasil ?? r.json?.error?.code}`).join(' '))
  const refB = await alur(sB, B, 'disetujui')

  /** 12 handler, dengan id milik tenant A. */
  const rute = (o) => [
    ['GET', `${P}/candidates`, undefined],
    ['POST', `${P}/candidates`, { signalId: o.s.id }],
    ['GET', `${P}/candidates/${o.candidateId}`, undefined],
    ['GET', `${P}/candidates/${o.candidateId}/history`, undefined],
    ['POST', `${P}/candidates/${o.candidateId}/revisions`, { recipientFixtureId: FX, language: 'EN' }],
    ['GET', `${P}/messages/${o.messageId}`, undefined],
    ['POST', `${P}/messages/${o.messageId}/preview`, { snapshotFingerprint: o.fp }],
    ['POST', `${P}/messages/${o.messageId}/approval-request`, undefined],
    ['POST', `${P}/approvals/${o.approvalId}/approve`, {}],
    ['POST', `${P}/approvals/${o.approvalId}/reject`, { decisionNote: 'tolak uji' }],
    ['POST', `${P}/messages/${o.messageId}/send`, { requestKey: rk() }],
    ['POST', `${P}/messages/${o.messageId}/cancel`, { cancelNote: 'batal uji' }],
  ]

  // ============================================================== otentikasi & otorisasi
  bagian('[1] Otentikasi, peran, tenant — 12 handler')
  {
    const awalA = await potretTenant(ID_A)
    const tanpaSesi = await Promise.all(rute(ref).map(([m, p, b]) => api(null, m, p, b)))
    cek('1. tanpa sesi → 401 UNAUTHORIZED di 12 handler', tanpaSesi.every((r) => galat(r, 401, 'UNAUTHORIZED')), tanpaSesi.map((r) => r.status).join(','))
    for (const [nama, sesi] of [['OPERATOR', sOp], ['FINANCE', sFin]]) {
      const h = await Promise.all(rute(ref).map(([m, p, b]) => api(sesi, m, p, b)))
      cek(`2. peran ${nama} (tenant A, allowlist) → 403 FORBIDDEN di 12 handler`, h.every((r) => galat(r, 403, 'FORBIDDEN')), h.map((r) => r.status).join(','))
    }
    const hC = await Promise.all(rute(ref).map(([m, p, b]) => api(sC, m, p, b)))
    cek('3. ADMIN tenant C (di luar allowlist) → 404 NOT_FOUND di 12 handler', hC.every((r) => galat(r, 404, 'NOT_FOUND')), hC.map((r) => r.status).join(','))
    const besar = JSON.stringify({ signalId: 'x'.repeat(40_000) })
    const urutan = await Promise.all([api(sOp, 'POST', `${P}/candidates`, besar), api(sC, 'POST', `${P}/messages/${ref.messageId}/send`, '{rusak'), api(null, 'POST', `${P}/messages/${ref.messageId}/cancel`, besar)])
    cek('4. otorisasi SEBELUM body: body raksasa / rusak dari pemanggil tak berhak → 403/404/401, bukan 400', urutan[0].status === 403 && urutan[1].status === 404 && urutan[2].status === 401, urutan.map((r) => r.status).join(','))
    cek('5. semua penolakan di atas: 0 mutasi & 0 audit di tenant A', (await potretTenant(ID_A)) === awalA)
  }

  bagian('[2] Isolasi lintas tenant (A ⇄ B, keduanya allowlist & berisi data)')
  {
    const awalA = await potretTenant(ID_A)
    const hB = await Promise.all(rute(ref).filter(([, p]) => p !== `${P}/candidates`).map(([m, p, b]) => api(sB, m, p, b)))
    cek('6. ADMIN B memakai id milik A (10 handler ber-id) → 404 NOT_FOUND semua', hB.length === 10 && hB.every((r) => galat(r, 404, 'NOT_FOUND')), hB.map((r) => r.status).join(','))
    const hA = await Promise.all(rute(refB).filter(([, p]) => p !== `${P}/candidates`).map(([m, p, b]) => api(sA, m, p, b)))
    cek('7. arah sebaliknya: ADMIN A memakai id milik B → 404 semua', hA.every((r) => galat(r, 404, 'NOT_FOUND')))
    const sinyalA = await api(sB, 'POST', `${P}/candidates`, { signalId: ref.s.id })
    cek('8. ADMIN B menyiapkan candidate dari sinyal milik A → 404', galat(sinyalA, 404, 'NOT_FOUND'))
    const palsu = await api(sA, 'GET', `${P}/messages/${ID_PALSU}`)
    const silang = await api(sA, 'GET', `${P}/messages/${refB.messageId}`)
    cek('9. id tak ada vs id milik tenant lain → respons 404 IDENTIK (tak membocorkan keberadaan)', palsu.status === 404 && silang.teks === palsu.teks, `${palsu.teks} | ${silang.teks}`)
    const dA = await api(sA, 'GET', `${P}/candidates?take=100`)
    const idB = new Set((await adm.communicationCandidate.findMany({ where: { tenantId: ID_B }, select: { id: true } })).map((x) => x.id))
    cek('10. daftar A tak memuat satu pun candidate B; kursor milik B → 404', ok200(dA) && dA.json.data.items.length > 0 && !dA.json.data.items.some((c) => idB.has(c.id)) && galat(await api(sA, 'GET', `${P}/candidates?cursor=${refB.candidateId}`), 404, 'NOT_FOUND'))
    cek('11. semua percobaan lintas tenant: 0 mutasi & 0 audit di tenant A', (await potretTenant(ID_A)) === awalA)
  }

  // ============================================================== validasi input
  bagian('[3] Validasi input, batas ukuran, bentuk body')
  {
    const awalA = await potretTenant(ID_A)
    const r = [
      ['body > 16 KB (Content-Length)', await api(sA, 'POST', `${P}/candidates`, JSON.stringify({ signalId: 'x'.repeat(20_000) }))],
      ['Content-Type bukan JSON', await api(sA, 'POST', `${P}/candidates`, JSON.stringify({ signalId: ref.s.id }), { 'content-type': 'text/plain' })],
      ['JSON rusak', await api(sA, 'POST', `${P}/candidates`, '{"signalId":')],
      ['body array', await api(sA, 'POST', `${P}/candidates`, '[1,2]')],
      ['body null', await api(sA, 'POST', `${P}/candidates`, 'null')],
      ['signalId hilang', await api(sA, 'POST', `${P}/candidates`, {})],
      ['signalId bukan string', await api(sA, 'POST', `${P}/candidates`, { signalId: 42 })],
      ['bahasa tak sah', await api(sA, 'POST', `${P}/candidates/${ref.candidateId}/revisions`, { recipientFixtureId: FX, language: 'FR' })],
      ['sidik bukan hex-64', await api(sA, 'POST', `${P}/messages/${ref.messageId}/preview`, { snapshotFingerprint: 'abc' })],
      ['requestKey hilang', await api(sA, 'POST', `${P}/messages/${ref.messageId}/send`, {})],
      ['requestKey berspasi', await api(sA, 'POST', `${P}/messages/${ref.messageId}/send`, { requestKey: 'ada spasi 123' })],
      ['alasan Cancel hilang', await api(sA, 'POST', `${P}/messages/${ref.messageId}/cancel`, {})],
      ['alasan Cancel < 3', await api(sA, 'POST', `${P}/messages/${ref.messageId}/cancel`, { cancelNote: 'ab' })],
      ['catatan tolak hilang', await api(sA, 'POST', `${P}/approvals/${ref.approvalId}/reject`, {})],
      ['take=abc', await api(sA, 'GET', `${P}/candidates?take=abc`)],
      ['take=0', await api(sA, 'GET', `${P}/candidates?take=0`)],
      ['take=101', await api(sA, 'GET', `${P}/candidates?take=101`)],
      ['state tak dikenal', await api(sA, 'GET', `${P}/candidates?state=CANCELED`)],
      ['recipient tak dikenal', await api(sA, 'GET', `${P}/messages/${ref.messageId}?recipient=semua`)],
      ['id path > 64 karakter', await api(sA, 'GET', `${P}/messages/${'x'.repeat(65)}`)],
    ]
    const salah = r.filter(([, x]) => !galat(x, 400, 'VALIDATION'))
    cek(`12. ${r.length} input tak sah → 400 VALIDATION dengan bentuk galat seragam`, salah.length === 0, salah.map(([n, x]) => `${n}=${x.status}`).join('; '))
    // Body tanpa Content-Length (chunked) tetap dibatasi saat dibaca.
    const aliran = new ReadableStream({
      start(c) {
        const potong = new TextEncoder().encode('{"signalId":"' + 'y'.repeat(4096))
        for (let i = 0; i < 6; i++) c.enqueue(potong)
        c.close()
      },
    })
    const ch = await sA.ambil(`${P}/candidates`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ASAL }, body: aliran, duplex: 'half' })
    const chJson = await ch.json().catch(() => null)
    cek('13. body chunked tanpa Content-Length > 16 KB → 400 VALIDATION (batas saat membaca aliran)', ch.status === 400 && chJson?.error?.code === 'VALIDATION', `${ch.status}`)
    const metode = await Promise.all([api(sA, 'GET', `${P}/messages/${ref.messageId}/send`), api(sA, 'DELETE', `${P}/candidates`), api(sA, 'PUT', `${P}/messages/${ref.messageId}`, {})])
    cek('14. metode tak didukung → 405', metode.every((x) => x.status === 405), metode.map((x) => x.status).join(','))
    cek('15. semua input tak sah: 0 mutasi & 0 audit', (await potretTenant(ID_A)) === awalA)
  }

  // ============================================================== CSRF
  bagian('[3b] Pagar CSRF — Origin, Sec-Fetch-Site, Content-Type wajib (8 handler POST)')
  {
    const csrf = await alur(sA, A, 'pratinjau')
    const awalA = await potretTenant(ID_A)
    const post = rute(csrf).filter(([m]) => m === 'POST')
    const tanpaOrigin = await Promise.all(post.map(([m, p, b]) => api(sA, m, p, b, { origin: null })))
    cek('35. sesi ADMIN sah TANPA header Origin → 403 di 8 handler POST', post.length === 8 && tanpaOrigin.every((r) => galat(r, 403, 'FORBIDDEN')), tanpaOrigin.map((r) => r.status).join(','))
    const asing = ['http://evil.localhost:3100', 'https://galangan.tribuanagency.com', 'http://localhost:3101', 'https://localhost:3100', 'null']
    const hAsing = await Promise.all(asing.flatMap((o) => post.map(([m, p, b]) => api(sA, m, p, b, { origin: o }))))
    cek('36. Origin lain (subdomain, port, skema, "null") → 403 di 8 handler × 5 origin', hAsing.length === 40 && hAsing.every((r) => galat(r, 403, 'FORBIDDEN')))
    const hSitus = await Promise.all(['same-site', 'cross-site', 'none'].flatMap((v) => post.map(([m, p, b]) => api(sA, m, p, b, { 'sec-fetch-site': v }))))
    cek('37. Sec-Fetch-Site same-site / cross-site / none (meski Origin benar) → 403 di 8 handler', hSitus.every((r) => galat(r, 403, 'FORBIDDEN')))
    const tanpaCt = await Promise.all([
      api(sA, 'POST', `${P}/messages/${csrf.messageId}/approval-request`, undefined, { 'content-type': null }),
      api(sA, 'POST', `${P}/approvals/${ref.approvalId}/approve`, undefined, { 'content-type': null }),
      api(sA, 'POST', `${P}/messages/${csrf.messageId}/approval-request`, '', { 'content-type': 'application/x-www-form-urlencoded' }),
      api(sA, 'POST', `${P}/messages/${csrf.messageId}/approval-request`, '', { 'content-type': 'text/plain' }),
      api(sA, 'POST', `${P}/messages/${csrf.messageId}/cancel`, 'cancelNote=batal', { 'content-type': 'application/x-www-form-urlencoded' }),
    ])
    cek('38. POST tanpa body / bertipe formulir / text/plain (approval-request, approve, cancel) → 400 VALIDATION, bukan dieksekusi', tanpaCt.every((r) => galat(r, 400, 'VALIDATION')), tanpaCt.map((r) => r.status).join(','))
    cek('39. semua permintaan CSRF di atas: 0 mutasi & 0 audit di tenant A', (await potretTenant(ID_A)) === awalA)
    const sah = await api(sA, 'POST', `${P}/messages/${csrf.messageId}/approval-request`, undefined, { 'sec-fetch-site': 'same-origin' })
    cek('40. permintaan sah (Origin aplikasi + Sec-Fetch-Site same-origin + JSON, tanpa body) tetap berjalan → 200 APPROVAL_DIMINTA', ok200(sah, 'APPROVAL_DIMINTA'))
    const getTanpaOrigin = await api(sA, 'GET', `${P}/messages/${csrf.messageId}`, undefined, { origin: null })
    cek('41. GET (read-only) tak memerlukan Origin → 200', ok200(getTanpaOrigin))
  }

  // ============================================================== alur & hasil bisnis
  bagian('[4] FAKE Send, idempotensi, retry, hasil bisnis HTTP 200 + hasil')
  {
    const k = rk()
    const s1 = await api(sMo, 'POST', `${P}/messages/${ref.messageId}/send`, { requestKey: k })
    cek('16. FAKE Send → 200 FAKE_SENT, provider FAKE, simulation true, externalDelivery false, receipt fake_…', ok200(s1, 'FAKE_SENT') && s1.json.provider === 'FAKE' && s1.json.simulation === true && s1.json.externalDelivery === false && /^fake_[0-9a-f]{32}$/.test(s1.json.receipt))
    const s2 = await api(sMo, 'POST', `${P}/messages/${ref.messageId}/send`, { requestKey: k })
    cek('17. replay requestKey sama → 200 hasil attempt yang sama (ulangan), tanpa attempt baru', ok200(s2, 'FAKE_SENT') && s2.json.ulangan === true && s2.json.attemptId === s1.json.attemptId && (await adm.communicationAttempt.count({ where: { messageId: ref.messageId } })) === 1)
    const s3 = await api(sMo, 'POST', `${P}/messages/${ref.messageId}/send`, { requestKey: rk() })
    cek('18. kunci baru setelah sukses → 200 DITOLAK ALREADY_FAKE_SENT (hasil bisnis, bukan 4xx)', ok200(s3, 'DITOLAK') && s3.json.alasan === 'ALREADY_FAKE_SENT')

    const ganda = await alur(sA, A, 'disetujui')
    const hs = await Promise.all([1, 2, 3].map(() => api(sA, 'POST', `${P}/messages/${ganda.messageId}/send`, { requestKey: rk() })))
    const sukses = hs.filter((x) => ok200(x, 'FAKE_SENT') && !x.json.ulangan).length
    cek('19. klik ganda (3 Send bersamaan, kunci berbeda) → tepat satu FAKE_SENT; sisanya 200 DITOLAK / 409 CONFLICT', sukses === 1 && hs.every((x) => ok200(x) || galat(x, 409, 'CONFLICT')) && (await adm.communicationAttempt.count({ where: { messageId: ganda.messageId } })) === 1, hs.map((x) => `${x.status}:${x.json?.hasil ?? x.json?.error?.code}`).join(' '))

    const g = await alur(sA, A, 'disetujui', { fx: FX_GAGAL })
    const g1 = await api(sA, 'POST', `${P}/messages/${g.messageId}/send`, { requestKey: rk() })
    const g2 = await api(sA, 'POST', `${P}/messages/${g.messageId}/send`, { requestKey: rk() })
    cek('20. FAIL_BEFORE_ACCEPT → 200 FAKE_FAILED; retry manual → attempt #2', ok200(g1, 'FAKE_FAILED') && g1.json.alasan === 'FAKE_SIMULATED_FAILURE' && ok200(g2, 'FAKE_FAILED') && g2.json.attemptNo === 2)

    const blok = await alur(sA, A, 'disetujui')
    await adm.voyageEvent.updateMany({ where: { id: blok.ev.id }, data: { deletedAt: new Date() } })
    const hb = await api(sA, 'POST', `${P}/messages/${blok.messageId}/send`, { requestKey: rk() })
    cek('21. sumber dihapus sebelum Send → 200 DIBLOKIR SOURCE_DELETED (hasil bisnis), 0 attempt', ok200(hb, 'DIBLOKIR') && hb.json.alasan === 'SOURCE_DELETED' && (await adm.communicationAttempt.count({ where: { messageId: blok.messageId } })) === 0)

    const tanpaApproval = await alur(sA, A, 'pratinjau')
    const ta = await api(sA, 'POST', `${P}/messages/${tanpaApproval.messageId}/send`, { requestKey: rk() })
    cek('22. Send tanpa approval → 200 DITOLAK APPROVAL_REQUIRED', ok200(ta, 'DITOLAK') && ta.json.alasan === 'APPROVAL_REQUIRED')

    const t = await alur(sA, A, 'menunggu')
    const tj = await api(sMo, 'POST', `${P}/approvals/${t.approvalId}/reject`, { decisionNote: 'Isi belum sesuai' })
    const tAgain = await api(sMo, 'POST', `${P}/approvals/${t.approvalId}/approve`, {})
    cek('23. reject → 200 DITOLAK_PEMUTUS; approve sesudahnya tak menghidupkan kembali (bukan DISETUJUI)', ok200(tj, 'DITOLAK_PEMUTUS') && tAgain.json?.hasil !== 'DISETUJUI' && (await adm.communicationMessage.findFirst({ where: { id: t.messageId } })).state === 'CANCELED')
  }

  bagian('[5] Cancel lewat API')
  {
    const c = await alur(sA, A, 'disetujui')
    const b1 = await api(sMo, 'POST', `${P}/messages/${c.messageId}/cancel`, { cancelNote: '  Klien minta tunda  ' })
    cek('24. MANAJER_OPERASI (bukan pembuat) membatalkan → 200 DIBATALKAN, stateSebelum APPROVED', ok200(b1, 'DIBATALKAN') && b1.json.stateSebelum === 'APPROVED')
    const b2 = await api(sMo, 'POST', `${P}/messages/${c.messageId}/cancel`, { cancelNote: 'lagi' })
    cek('25. Cancel kedua → 200 DITOLAK CANCEL_NOT_ALLOWED dengan reasonCode CANCELED_BY_USER (klien bisa membacanya "sudah dibatalkan")', ok200(b2, 'DITOLAK') && b2.json.kode === 'CANCEL_NOT_ALLOWED' && b2.json.reasonCode === 'CANCELED_BY_USER')
    const s = await api(sA, 'POST', `${P}/messages/${c.messageId}/send`, { requestKey: rk() })
    cek('26. Send sesudah Cancel → 200 DITOLAK CANCELED_BY_USER, 0 attempt', ok200(s, 'DITOLAK') && s.json.alasan === 'CANCELED_BY_USER' && (await adm.communicationAttempt.count({ where: { messageId: c.messageId } })) === 0)
    const d = await api(sA, 'GET', `${P}/messages/${c.messageId}`)
    cek('27. detail pesan dibatalkan memuat alasan (ter-trim) & pembatal', ok200(d) && d.json.data.pembatalan?.catatan === 'Klien minta tunda' && d.json.data.pembatalan.olehUserId !== null)
  }

  // ============================================================== least privilege & read-only
  bagian('[6] Least privilege pengenal penerima & GET read-only')
  {
    const awalA = await potretTenant(ID_A)
    const daftar = await api(sA, 'GET', `${P}/candidates?take=100`)
    const dC = await api(sA, 'GET', `${P}/candidates/${ref.candidateId}`)
    const dM = await api(sA, 'GET', `${P}/messages/${ref.messageId}`)
    const dH = await api(sA, 'GET', `${P}/candidates/${ref.candidateId}/history`)
    const bawaan = [daftar, dC, dM, dH]
    cek('28. BAWAAN (daftar, detail candidate, detail pesan, riwayat): pengenal penerima utuh TIDAK muncul di respons mana pun', bawaan.every((r) => ok200(r) && !/TEST_FIXTURE_WA_\d{3}/.test(r.teks)) && dM.json.data.recipientIdentifier === 'TEST•••01' && dC.json.data.revisi[0].recipientIdentifier === 'TEST•••01')
    const fullM = await api(sA, 'GET', `${P}/messages/${ref.messageId}?recipient=full`)
    const fullH = await api(sMo, 'GET', `${P}/candidates/${ref.candidateId}/history?recipient=full`)
    const masked = await api(sA, 'GET', `${P}/messages/${ref.messageId}?recipient=masked`)
    cek('29. pengenal utuh HANYA bila diminta eksplisit (recipient=full) oleh peran berwenang; recipient=masked = bawaan', ok200(fullM) && fullM.json.data.recipientIdentifier === 'TEST_FIXTURE_WA_001' && ok200(fullH) && fullH.json.data.pesan[0].recipientIdentifier === 'TEST_FIXTURE_WA_001' && masked.json.data.recipientIdentifier === 'TEST•••01')
    const opFull = await api(sOp, 'GET', `${P}/messages/${ref.messageId}?recipient=full`)
    const bFull = await api(sB, 'GET', `${P}/messages/${ref.messageId}?recipient=full`)
    cek('30. recipient=full oleh peran tak berwenang / tenant lain → 403 / 404, tanpa pengenal', galat(opFull, 403, 'FORBIDDEN') && galat(bFull, 404, 'NOT_FOUND') && !/TEST_FIXTURE_WA_/.test(opFull.teks + bFull.teks))
    const semua = bawaan.map((r) => r.teks).join('') + fullM.teks + fullH.teks
    cek('31. respons tak memuat proposal approval, idempotencyKey, requestKey, ipAddress, logicalMessageKey, stack, maupun SQL', !/"proposal"|idempotencyKey|requestKey|ipAddress|logicalMessageKey|activeKey|successKey|at \w+ \(|prisma\.|SELECT |INSERT /i.test(semua))
    cek('32. seluruh GET di atas: 0 mutasi & 0 audit (read-only)', (await potretTenant(ID_A)) === awalA)
  }

  bagian('[7] Invarian FAKE di seluruh dunia uji')
  {
    const at = await adm.communicationAttempt.findMany({ where: { tenantId: { in: [ID_A, ID_B] } } })
    cek('33. setiap attempt: provider FAKE, simulation true, externalDelivery false, receipt hanya fake_…', at.length > 0 && at.every((x) => x.provider === 'FAKE' && x.simulation === true && x.externalDelivery === false && (x.receipt === null || /^fake_[0-9a-f]{32}$/.test(x.receipt))))
    const m = await adm.communicationMessage.findMany({ where: { tenantId: { in: [ID_A, ID_B] } } })
    const sukses = new Map()
    for (const x of m.filter((y) => y.successKey)) sukses.set(x.successKey, (sukses.get(x.successKey) ?? 0) + 1)
    cek('34. maksimal satu FAKE_SENT per pesan logis; tak ada state antara ter-commit', [...sukses.values()].every((n) => n === 1) && m.every((x) => x.state !== 'QUEUED_FAKE'))
  }
} catch (e) {
  gagal++
  console.log(`\n  ❌ Uji HTTP berhenti karena galat: ${e?.stack ?? e}`)
} finally {
  try {
    await bersihkan()
  } catch (e) {
    console.log(`  (pembersihan gagal: ${e?.message})`)
  }
  await adm.$disconnect()
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
