// Uji HTTP + DB pengambilan posisi AIS — PRD-003 Step 4.
//
// Jalankan:  node prisma/check-ais-poll-api.mjs
//   Butuh `npm run dev` menyala dengan .env.local berisi:
//     AUTOMATION_MONITORING_ENABLED=true, AUTOMATION_TENANT_IDS=<id>,
//     AIS_ENABLED=true, AIS_TENANT_IDS=<id yang sama>, AIS_PROVIDER=FAKE,
//     AIS_MONTHLY_CALL_CAP=1000, AIS_STALE_HOURS=6, AIS_POLL_INTERVAL_MIN=60
//
// Adapter FAKE → TIDAK ADA panggilan jaringan ke penyedia AIS mana pun. Perilaku
// ditentukan MMSI fiksi 99000000x (lihat src/services/ais/adapters/fake.ts).
//
//   A. akses & gerbang (401/403/404, portal tanpa GRANT, job ber-token)
//   B. jalan pertama: D4 tug saja, D2 MMSI terverifikasi, normalisasi, dua waktu, tanpa payload
//   C. belum jatuh tempo → tanpa baris run & tanpa panggilan
//   D. idempotensi: jalan ulang di jam yang sama → nol observasi baru
//   E. konkurensi: 4 jalan bersamaan → satu jalan bermakna, observasi unik
//   F. mismatch MMSI & posisi 0,0 → ditolak, PARTIAL, ok:false, tak tersimpan
//   G. timeout penyedia → FAILED, ulang sekali, backoff; voyage-monitoring TETAP jalan
//   H. AIS_PROVIDER_DOWN & AIS_STALE dari data tersimpan, tanpa duplikat
//   I. kuota habis → DISABLED_QUOTA tanpa panggilan
//   J. retensi 90/180 hari
//   K. isolasi tenant & FK CASCADE (eksperimen ROLLBACK)
//   L. keamanan data: Voyage/Vessel/VoyageVessel/VoyageEvent/Task tak berubah
//
// Skrip ini MENULIS ke database dev. Barisnya bertanda `P3S4-` / email `p3s4-*`
// dan dihapus di akhir (termasuk saat gagal), lalu jumlah baris global dibandingkan.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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

const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TOKEN = process.env.JOB_RUNNER_TOKEN ?? ''
const TAG = 'P3S4-'
const EMAIL = 'p3s4-'
const SANDI = 'UjiP3s4AisPoll!2026'
const JAM = 3_600_000
const HARI = 24 * JAM
const AIS_IDS = (process.env.AIS_TENANT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

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
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function api(sesi, path) {
  const res = sesi ? await sesi.ambil(path) : await fetch(`${BASE_URL}${path}`, { redirect: 'manual' })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function job(nama, token = TOKEN) {
  const res = await fetch(`${BASE_URL}/api/jobs/run?job=${nama}`, { method: 'POST', headers: token ? { 'x-job-token': token } : {} })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
const barisA = (r) => (Array.isArray(r.json.hasil) ? r.json.hasil.find((h) => h.tenant === D.A.id) : null)

// ------------------------------------------------------------------ data & potret

const D = {}
const lahir = { monRun: new Set() }

async function idSemua(model) {
  return new Set((await prisma[model].findMany({ select: { id: true } })).map((r) => r.id))
}

async function potretOperasional() {
  const [voyage, vessel, vv, ev, task] = await Promise.all([
    prisma.voyage.findMany({ select: { id: true, updatedAt: true, status: true, eta: true, etd: true, ata: true, atb: true, atd: true, deletedAt: true }, orderBy: { id: 'asc' } }),
    prisma.vessel.findMany({ select: { id: true, updatedAt: true, mmsi: true, mmsiSource: true, mmsiVerifiedAt: true }, orderBy: { id: 'asc' } }),
    prisma.voyageVessel.findMany({ select: { id: true, updatedAt: true, role: true }, orderBy: { id: 'asc' } }),
    prisma.voyageEvent.findMany({ select: { id: true, occurredAt: true, eventCode: true, deletedAt: true }, orderBy: { id: 'asc' } }),
    prisma.task.findMany({ select: { id: true, updatedAt: true, status: true }, orderBy: { id: 'asc' } }),
  ])
  return JSON.stringify({ voyage, vessel, vv, ev, task })
}

/** Majukan "jatuh tempo": geser run AIS tenant A ke belakang (baris AIS semuanya lahir dari uji ini). */
async function mundurkanRun(jam = 2) {
  await prisma.$executeRawUnsafe(`UPDATE "AisPollRun" SET "startedAt" = "startedAt" - ($2 || ' hours')::interval WHERE "tenantId" = $1`, D.A.id, String(jam))
}
const stateA = () => prisma.aisProviderState.findFirst({ where: { tenantId: D.A.id, provider: 'FAKE' } })
const resetState = () => prisma.aisProviderState.updateMany({ where: { tenantId: D.A.id }, data: { consecutiveFailures: 0, outageStartedAt: null, backoffUntil: null, lastErrorCode: null, rateLimitResetAt: null, lockedUntil: null, lockedBy: null } })
const aturPantau = (voyage, enabled) => prisma.monitoredVoyage.updateMany({ where: { voyageId: voyage.id }, data: { enabled } })
const obsKapal = (kapal) => prisma.aisObservation.findMany({ where: { vesselId: kapal.id }, orderBy: { positionAt: 'desc' } })
const runBaru = async (sebelum) => (await prisma.aisPollRun.findMany({ where: { tenantId: D.A.id }, orderBy: { startedAt: 'asc' } })).filter((r) => !sebelum.has(r.id))

async function tungguBilaDekatPergantianJam() {
  const m = new Date().getUTCMinutes()
  if (m >= 57) {
    const ms = (60 - m) * 60_000 - new Date().getUTCSeconds() * 1000 + 5000
    info(`dekat pergantian jam — menunggu ${Math.round(ms / 1000)} detik supaya posisi FAKE stabil`)
    await tunggu(ms)
  }
}

async function siapkanData() {
  if (process.env.AIS_ENABLED !== 'true' || process.env.AIS_PROVIDER !== 'FAKE' || AIS_IDS.length === 0) {
    throw new Error('Setel AIS_ENABLED=true, AIS_PROVIDER=FAKE, AIS_TENANT_IDS, AIS_MONTHLY_CALL_CAP di .env.local, lalu restart dev server.')
  }
  D.A = await prisma.tenant.findUnique({ where: { id: AIS_IDS[0] } })
  D.B = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!D.A || !D.B) throw new Error('Tenant A (allowlist AIS) atau tenant Verifikasi tidak ada di DB dev.')
  info(`tenant A (AIS) ${D.A.id}; tenant B (bukan AIS) ${D.B.id}`)

  const hash = await bcrypt.hash(SANDI, 10)
  const user = (tenantId, role, s) => prisma.user.create({ data: { tenantId, email: `${EMAIL}${s}@uji.local`, name: `${TAG}${role}`, password: hash, role, isActive: true } })
  D.adminA = await user(D.A.id, 'ADMIN', 'admin-a')
  D.manajerA = await user(D.A.id, 'MANAJER_OPERASI', 'manajer-a')
  D.operatorA = await user(D.A.id, 'OPERATOR', 'operator-a')
  D.adminB = await user(D.B.id, 'ADMIN', 'admin-b')

  const TERV = new Date('2026-09-01T00:00:00.000Z')
  const kapal = (tenantId, nama, mmsi, sumber = 'COMPANY_DOCUMENT', terverifikasi = true) =>
    prisma.vessel.create({ data: { tenantId, name: `${TAG}${nama}`, gt: 500, mmsi, mmsiSource: mmsi ? sumber : null, mmsiVerifiedAt: mmsi && terverifikasi ? TERV : null } })
  D.kTug = await kapal(D.A.id, 'TUG OK', '990000001')
  D.kBarge = await kapal(D.A.id, 'BARGE', '990000006') // BARGE ber-MMSI 0,0 — tak boleh pernah diambil (D4)
  D.kSat = await kapal(D.A.id, 'TUG SATELIT', '990000002')
  D.kPub = await kapal(D.A.id, 'TUG PUBLIK', '990000007', 'PUBLIC_TRACKING', false) // D2
  D.kNo = await kapal(D.A.id, 'TUG TANPA DATA', '990000004')
  D.kMis = await kapal(D.A.id, 'TUG MISMATCH', '990000003')
  D.kNol = await kapal(D.A.id, 'TUG NOL', '990000009') // dipakai untuk TIMEOUT (seluruh panggilan)
  D.kBasi = await kapal(D.A.id, 'TUG BASI', '990000005')
  D.kB = await kapal(D.B.id, 'TUG TENANT B', '990000001') // MMSI sama, tenant lain (unik per tenant)

  const vy = async (tenantId, primer, n, tambahan = [], jamMulai = 1) => {
    const v = await prisma.voyage.create({ data: { tenantId, vesselId: primer.id, voyageNumber: `${TAG}VYG-${n}-${Date.now().toString(36)}`, status: 'CONFIRMED', eta: new Date('2026-10-01T00:00:00.000Z'), dataOrigin: 'UJI' } })
    await prisma.voyageVessel.createMany({ data: tambahan.map(([k, role], i) => ({ voyageId: v.id, vesselId: k.id, role, sortOrder: i })) })
    await prisma.monitoredVoyage.create({ data: { tenantId, voyageId: v.id, startedAt: new Date(Date.now() - jamMulai * JAM), startedByUserId: tenantId === D.A.id ? D.adminA.id : D.adminB.id } })
    return v
  }
  D.V1 = await vy(D.A.id, D.kBarge, 'TUGBARGE', [[D.kBarge, 'BARGE'], [D.kTug, 'TUG']])
  D.V2 = await vy(D.A.id, D.kSat, 'SATELIT')
  D.V3 = await vy(D.A.id, D.kPub, 'PUBLIK', [[D.kPub, 'TUG']])
  D.V4 = await vy(D.A.id, D.kNo, 'TANPADATA', [], 10)
  D.V5 = await vy(D.A.id, D.kMis, 'MISMATCH')
  D.V7 = await vy(D.A.id, D.kNol, 'TIMEOUT')
  D.V8 = await vy(D.A.id, D.kBasi, 'BASI', [], 10)
  D.VB = await vy(D.B.id, D.kB, 'TENANTB')
  D.voyageIds = [D.V1, D.V2, D.V3, D.V4, D.V5, D.V7, D.V8, D.VB].map((v) => v.id)
  for (const v of [D.V5, D.V7, D.V8]) await aturPantau(v, false) // skenario khusus dinyalakan per fase

  D.sesi = {
    adminA: await login(D.adminA.email),
    manajerA: await login(D.manajerA.email),
    operatorA: await login(D.operatorA.email),
    adminB: await login(D.adminB.email),
  }
  D.potret = await potretOperasional()
}

// =========================================================================== uji

async function ujiAkses() {
  console.log('\n[A] Akses & gerbang')
  cek('health AIS tanpa sesi → 401', (await api(null, '/api/automation/ais/health')).status === 401)
  const h = await api(D.sesi.adminA, '/api/automation/ais/health')
  cek('health AIS ADMIN tenant A → 200 aktif FAKE, kuota 1000, stale 6', h.status === 200 && h.json.aktif === true && h.json.penyedia === 'FAKE' && h.json.kuotaBulanan === 1000 && h.json.ambangStaleJam === 6, JSON.stringify({ s: h.status, a: h.json.aktif, k: h.json.kuotaBulanan }))
  cek('health AIS tanpa kunci/URL di respons', !/key|token|https?:\/\//i.test(JSON.stringify(h.json)))
  cek('MANAJER_OPERASI → 200', (await api(D.sesi.manajerA, '/api/automation/ais/health')).status === 200)
  cek('OPERATOR → 403', (await api(D.sesi.operatorA, '/api/automation/ais/health')).status === 403)
  cek('ADMIN tenant di luar allowlist → 404', (await api(D.sesi.adminB, '/api/automation/ais/health')).status === 404)
  cek('posisi voyage tenant A oleh tenant B → 404', (await api(D.sesi.adminB, `/api/automation/ais/voyages/${D.V1.id}`)).status === 404)
  cek('posisi voyage tenant B oleh tenant A → 404', (await api(D.sesi.adminA, `/api/automation/ais/voyages/${D.VB.id}`)).status === 404)
  cek('job AIS tanpa token → 401', (await job('ais-position-poll', '')).status === 401)
  const url = process.env.PORTAL_DATABASE_URL
  if (url) {
    const portal = new PrismaClient({ datasources: { db: { url } } })
    for (const t of ['AisObservation', 'AisPollRun', 'AisProviderState']) {
      let pesan = ''
      try {
        await portal.$queryRawUnsafe(`SELECT 1 FROM "${t}" LIMIT 1`)
      } catch (e) {
        pesan = String(e?.message ?? e)
      }
      cek(`peran DB portal tak bisa membaca "${t}"`, /permission denied/i.test(pesan))
    }
    await portal.$disconnect()
  } else {
    info('PORTAL_DATABASE_URL tak ada — uji GRANT portal dilewati')
  }
}

async function ujiJalanPertama() {
  console.log('\n[B] Jalan pertama — D4, D2, normalisasi')
  await tungguBilaDekatPergantianJam()
  const r = await job('ais-position-poll')
  const h = barisA(r)
  cek('job → 200, baris tenant A', r.status === 200 && !!h?.runId, `status=${r.status} ${JSON.stringify(h)}`)
  cek('jalan OK & ok:true', h?.status === 'OK' && r.json.ok === true, `status=${h?.status} ok=${r.json.ok}`)
  const run = h?.runId ? await prisma.aisPollRun.findFirst({ where: { id: h.runId } }) : null
  cek('run tersimpan: finishedAt, agentVersion, panggilan ≥ 1', !!run?.finishedAt && run?.agentVersion === 'prd003-s4.1' && run?.providerCalls >= 1)
  cek('D2: kapal PUBLIC_TRACKING dihitung dilewati', (run?.vesselsSkippedUnverified ?? 0) >= 1, `skip=${run?.vesselsSkippedUnverified}`)
  cek('tanpa data dihitung (NO_DATA)', (run?.noData ?? 0) >= 1)
  const tug = await obsKapal(D.kTug)
  const sat = await obsKapal(D.kSat)
  cek('tug ber-MMSI terverifikasi → 1 observasi', tug.length === 1, `n=${tug.length}`)
  cek('D4: BARGE tak pernah diambil (0 observasi, walau ber-MMSI terverifikasi)', (await obsKapal(D.kBarge)).length === 0)
  cek('D2: MMSI PUBLIC_TRACKING → 0 observasi', (await obsKapal(D.kPub)).length === 0)
  cek('kapal utama tanpa peran → diambil', sat.length === 1)
  cek('sentinel satelit dinormalisasi null, sumber SATELLITE', sat[0]?.sogKnots === null && sat[0]?.cogDeg === null && sat[0]?.headingDeg === null && sat[0]?.navStatus === null && sat[0]?.sourceType === 'SATELLITE')
  cek('dua waktu: positionAt < fetchedAt, umur konsisten', tug[0] && tug[0].positionAt < tug[0].fetchedAt && Math.abs(tug[0].ageSecAtFetch - (tug[0].fetchedAt - tug[0].positionAt) / 1000) <= 1)
  cek('observasi: tenant A, run ini, provider FAKE, mmsi = Vessel.mmsi, hash 64 hex', tug[0]?.tenantId === D.A.id && tug[0]?.runId === h?.runId && tug[0]?.provider === 'FAKE' && tug[0]?.mmsi === D.kTug.mmsi && /^[0-9a-f]{64}$/.test(tug[0]?.payloadHash ?? ''))
  const kolom = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'AisObservation'`)
  cek('tabel observasi tanpa kolom payload/raw mentah', !kolom.some((c) => /payload$|raw/i.test(c.column_name) && c.column_name !== 'payloadHash'), kolom.map((c) => c.column_name).join(','))
  cek('tenant B tak diproses (bukan allowlist AIS)', !(r.json.hasil ?? []).some((x) => x.tenant === D.B.id) && (await obsKapal(D.kB)).length === 0)
  cek('KEAMANAN DATA: jalan pertama tak mengubah tabel operasional', (await potretOperasional()) === D.potret)

  const pos = await api(D.sesi.adminA, `/api/automation/ais/voyages/${D.V1.id}`)
  const kTug = pos.json.kapal?.find((k) => k.vesselId === D.kTug.id)
  const kBar = pos.json.kapal?.find((k) => k.vesselId === D.kBarge.id)
  cek('posisi voyage: tug punya posisi terakhir, barge bukan sumber posisi', pos.status === 200 && pos.json.status === 'AKTIF' && !!kTug?.terakhir && kBar?.sumberPosisi === false && kBar?.terakhir === null)
  cek('posisi voyage: tanpa tenantId/mmsi di respons', !/tenantId|mmsi"/.test(JSON.stringify(pos.json)))
  const pub = await api(D.sesi.adminA, `/api/automation/ais/voyages/${D.V3.id}`)
  cek('posisi voyage: kapal MMSI publik ditandai belum terverifikasi', pub.json.kapal?.[0]?.mmsiTerverifikasi === false && pub.json.kapal?.[0]?.terakhir === null)
  const hh = await api(D.sesi.adminA, '/api/automation/ais/health')
  cek('health: run terakhir OK, panggilan bulan ini ≥ 1, sukses terakhir terisi', hh.json.runTerakhir?.status === 'OK' && hh.json.panggilanBulanIni >= 1 && !!hh.json.suksesTerakhirPada)
  const hAuto = await api(D.sesi.adminA, '/api/automation/health')
  cek('kartu Automation Hub: sumber posisi FAKE terkonfigurasi', hAuto.json.penyedia?.terkonfigurasi === true && hAuto.json.penyedia?.nama === 'FAKE')
}

async function ujiJatuhTempo() {
  console.log('\n[C] Belum jatuh tempo')
  const sebelum = await idSemua('aisPollRun')
  const r = await job('ais-position-poll')
  cek('jalan ulang segera → SKIPPED_NOT_DUE, tanpa panggilan', barisA(r)?.status === 'SKIPPED_NOT_DUE' && barisA(r)?.panggilan === 0 && r.json.ok === true)
  cek('tanpa baris run baru', (await runBaru(sebelum)).length === 0)
}

async function ujiIdempotensi() {
  console.log('\n[D] Idempotensi')
  await tungguBilaDekatPergantianJam()
  const jam0 = new Date().getUTCHours()
  const n0 = await prisma.aisObservation.count({ where: { tenantId: D.A.id } })
  await mundurkanRun()
  const r = await job('ais-position-poll')
  const h = barisA(r)
  const jam1 = new Date().getUTCHours()
  if (jam0 === jam1) {
    cek('jalan ulang jam yang sama → 0 observasi baru, duplikat dihitung', h?.status === 'OK' && h?.dibuat === 0 && h?.dilewati >= 2, JSON.stringify(h))
    cek('jumlah observasi tetap', (await prisma.aisObservation.count({ where: { tenantId: D.A.id } })) === n0)
  } else {
    info('pergantian jam terjadi di tengah uji — hanya keunikan yang dinilai')
  }
  const dup = await prisma.aisObservation.groupBy({ by: ['tenantId', 'vesselId', 'provider', 'positionAt'], _count: { _all: true }, having: { vesselId: { _count: { gt: 1 } } } })
  cek('tak ada posisi ganda (tenant, kapal, provider, positionAt)', dup.length === 0)
}

async function ujiKonkurensi() {
  console.log('\n[E] Konkurensi — kunci sewa')
  await tungguBilaDekatPergantianJam()
  await mundurkanRun()
  const sebelum = await idSemua('aisPollRun')
  const hasil = await Promise.all(Array.from({ length: 4 }, () => job('ais-position-poll')))
  cek('keempat jalan → 200', hasil.every((x) => x.status === 200), hasil.map((x) => x.status).join(' '))
  const baru = await runBaru(sebelum)
  const bermakna = baru.filter((r) => ['OK', 'PARTIAL', 'FAILED'].includes(r.status))
  cek('tepat SATU jalan bermakna; sisanya SKIPPED_LOCKED/NOT_DUE', bermakna.length === 1, baru.map((r) => r.status).join(',') + ' / ' + hasil.map((x) => barisA(x)?.status).join(','))
  cek('panggilan penyedia hanya dari jalan pemegang kunci', baru.filter((r) => r.status === 'SKIPPED_LOCKED').every((r) => r.providerCalls === 0))
  const st = await stateA()
  cek('kunci dilepas setelah selesai', st?.lockedUntil === null && st?.lockedBy === null)
  const dup = await prisma.aisObservation.groupBy({ by: ['tenantId', 'vesselId', 'provider', 'positionAt'], _count: { _all: true }, having: { vesselId: { _count: { gt: 1 } } } })
  cek('observasi tetap unik setelah 4 jalan bersamaan', dup.length === 0)
  cek('KEAMANAN DATA: konkurensi tak mengubah tabel operasional', (await potretOperasional()) === D.potret)
}

async function ujiMismatch() {
  console.log('\n[F] MMSI mismatch')
  // Posisi 0,0 & nilai tidak sah lainnya dicakup check-ais-contract.mjs (normalisasi murni);
  // barge ber-MMSI 0,0 (990000006) di V1 sekaligus membuktikan D4 — tak pernah diambil.
  await aturPantau(D.V5, true)
  await mundurkanRun()
  const sebelum = await idSemua('aisPollRun')
  const r = await job('ais-position-poll')
  const h = barisA(r)
  const run = (await runBaru(sebelum))[0]
  cek('mismatch → PARTIAL, errorCode MMSI_MISMATCH, ok:false', h?.status === 'PARTIAL' && run?.errorCode === 'MMSI_MISMATCH' && r.json.ok === false, JSON.stringify({ s: h?.status, e: run?.errorCode, ok: r.json.ok }))
  cek('rejectedMismatch = 1', run?.rejectedMismatch === 1)
  cek('observasi mismatch TIDAK tersimpan (baik MMSI diminta maupun balasan)', (await obsKapal(D.kMis)).length === 0 && (await prisma.aisObservation.count({ where: { mmsi: '990000033' } })) === 0)
  const st = await stateA()
  cek('mismatch bukan kegagalan penyedia (gagal beruntun 0)', st?.consecutiveFailures === 0)
  await aturPantau(D.V5, false)
}

async function ujiTimeout() {
  console.log('\n[G] Timeout penyedia → FAILED, backoff; voyage-monitoring tetap jalan')
  await aturPantau(D.V7, true)
  await mundurkanRun()
  const sebelum = await idSemua('aisPollRun')
  const r = await job('ais-position-poll')
  const run = (await runBaru(sebelum))[0]
  cek('timeout → FAILED, PROVIDER_TIMEOUT, ok:false', run?.status === 'FAILED' && run?.errorCode === 'PROVIDER_TIMEOUT' && r.json.ok === false, JSON.stringify({ s: run?.status, e: run?.errorCode }))
  cek('diulang tepat sekali (2 panggilan untuk 1 potongan)', run?.providerCalls === 2, `calls=${run?.providerCalls}`)
  const st = await stateA()
  cek('state: gagal beruntun 1, outageStartedAt & backoffUntil terisi', st?.consecutiveFailures === 1 && !!st?.outageStartedAt && st?.backoffUntil > new Date())
  cek('respons job tanpa teks vendor/stack', !/stack|Error:|https?:\/\//.test(JSON.stringify(r.json)))

  await mundurkanRun()
  const sebelum2 = await idSemua('aisPollRun')
  const r2 = await job('ais-position-poll')
  const run2 = (await runBaru(sebelum2))[0]
  cek('selama backoff → SKIPPED_BACKOFF tanpa panggilan', barisA(r2)?.status === 'SKIPPED_BACKOFF' && run2?.providerCalls === 0)

  const monSebelum = await idSemua('monitoringRun')
  const m = await job('voyage-monitoring')
  const mA = barisA(m)
  if (mA?.runId) lahir.monRun.add(mA.runId)
  ;(await prisma.monitoringRun.findMany({ select: { id: true } })).filter((x) => !monSebelum.has(x.id)).forEach((x) => lahir.monRun.add(x.id))
  cek('REGRESI: voyage-monitoring → 200 & tenant A diproses walau penyedia AIS gagal', m.status === 200 && !!mA?.runId && !mA?.galat, JSON.stringify({ s: m.status, g: mA?.galat }))
  const mv1 = await prisma.monitoredVoyage.findFirst({ where: { voyageId: D.V1.id } })
  cek('REGRESI: voyage uji diberi lastCheckedAt (deteksi internal jalan)', mv1?.lastCheckedAt instanceof Date)
  cek('REGRESI: kegagalan AIS tak menghasilkan MONITORING_ERROR', (await prisma.monitoringSignal.count({ where: { voyageId: { in: D.voyageIds }, kind: 'MONITORING_ERROR' } })) === 0)
  await aturPantau(D.V7, false)
}

async function ujiSinyal() {
  console.log('\n[H] AIS_PROVIDER_DOWN & AIS_STALE')
  await prisma.aisProviderState.updateMany({ where: { tenantId: D.A.id }, data: { consecutiveFailures: 3, outageStartedAt: new Date(Date.now() - 4 * JAM), backoffUntil: new Date(Date.now() + JAM) } })
  const notifAwal = await idSemua('notification')
  const monSebelum = await idSemua('monitoringRun')
  const m = await job('voyage-monitoring')
  ;(await prisma.monitoringRun.findMany({ select: { id: true } })).filter((x) => !monSebelum.has(x.id)).forEach((x) => lahir.monRun.add(x.id))
  cek('voyage-monitoring → 200', m.status === 200)
  const down = await prisma.monitoringSignal.findMany({ where: { voyageId: { in: D.voyageIds }, kind: 'AIS_PROVIDER_DOWN' } })
  const aktifA = [D.V1, D.V2, D.V3, D.V4].map((v) => v.id)
  cek('AIS_PROVIDER_DOWN ERROR satu per voyage aktif tenant A', aktifA.every((id) => down.filter((s) => s.voyageId === id).length === 1) && down.every((s) => s.severity === 'ERROR' && s.sourceType === 'AIS_PROVIDER'), `n=${down.length}`)
  cek('tanpa sinyal AIS untuk tenant B', !down.some((s) => s.voyageId === D.VB.id))
  const notif = (await prisma.notification.findMany({ where: { tenantId: D.A.id } })).filter((n) => !notifAwal.has(n.id) && down.some((s) => n.dedupeKey === `AH:${s.dedupeKey}:${n.userId}`))
  cek('notifikasi internal ke ADMIN/MANAJER tenant A untuk sinyal ERROR', notif.length >= down.length && notif.every((n) => n.type === 'AUTOMATION_SIGNAL'))
  const hh = await api(D.sesi.adminA, '/api/automation/ais/health')
  cek('health: providerDown true', hh.json.providerDown === true && hh.json.gagalBeruntun === 3)

  // AIS_STALE: pulihkan penyedia, nyalakan V8 (posisi 8 jam lalu), ambil posisi.
  await resetState()
  await aturPantau(D.V8, true)
  await mundurkanRun()
  const r = await job('ais-position-poll')
  cek('penyedia pulih → jalan OK', barisA(r)?.status === 'OK', JSON.stringify(barisA(r)))
  const basi = await obsKapal(D.kBasi)
  cek('posisi basi (≥ 8 jam) tetap tersimpan sebagai bukti', basi.length === 1 && Date.now() - basi[0].positionAt.getTime() >= 8 * JAM)
  const monSebelum2 = await idSemua('monitoringRun')
  await job('voyage-monitoring')
  ;(await prisma.monitoringRun.findMany({ select: { id: true } })).filter((x) => !monSebelum2.has(x.id)).forEach((x) => lahir.monRun.add(x.id))
  const stale = await prisma.monitoringSignal.findMany({ where: { voyageId: { in: D.voyageIds }, kind: 'AIS_STALE' } })
  const s8 = stale.filter((s) => s.voyageId === D.V8.id)
  cek('AIS_STALE WARNING untuk tug basi, merujuk observasi', s8.length === 1 && s8[0].severity === 'WARNING' && s8[0].sourceType === 'AIS_OBSERVATION' && s8[0].sourceRef === basi[0].id, `n=${s8.length}`)
  cek('AIS_STALE kunci memuat posisi (episode)', s8[0]?.dedupeKey === `AIS_STALE:${D.V8.id}:${D.kBasi.id}:${basi[0].positionAt.toISOString()}`)
  const s4 = stale.filter((s) => s.voyageId === D.V4.id)
  cek('tanpa observasi sejak mulai+6 jam, penyedia merespons → AIS_STALE (sumber AIS_PROVIDER)', s4.length === 1 && s4[0].sourceType === 'AIS_PROVIDER')
  cek('tug segar (V1) & MMSI publik (V3) → tanpa AIS_STALE', !stale.some((s) => s.voyageId === D.V1.id || s.voyageId === D.V3.id))
  const jumlah = await prisma.monitoringSignal.count({ where: { voyageId: { in: D.voyageIds } } })
  const monSebelum3 = await idSemua('monitoringRun')
  await job('voyage-monitoring')
  ;(await prisma.monitoringRun.findMany({ select: { id: true } })).filter((x) => !monSebelum3.has(x.id)).forEach((x) => lahir.monRun.add(x.id))
  const baruAis = await prisma.monitoringSignal.count({ where: { voyageId: { in: D.voyageIds }, kind: { startsWith: 'AIS_' } } })
  cek('jalan ulang monitoring → nol sinyal AIS baru (dedupe)', baruAis === stale.length + down.length && (await prisma.monitoringSignal.count({ where: { voyageId: { in: D.voyageIds } } })) >= jumlah, `ais=${baruAis}`)
  cek('KEAMANAN DATA: sinyal AIS tak mengubah tabel operasional', (await potretOperasional()) === D.potret)
  await aturPantau(D.V8, false)
}

async function ujiKuota() {
  console.log('\n[I] Kuota bulanan habis (D5)')
  await resetState()
  const pengisi = await prisma.aisPollRun.create({ data: { tenantId: D.A.id, provider: 'FAKE', agentVersion: `${TAG}pengisi-kuota`, startedAt: new Date(Date.now() - 3 * JAM), finishedAt: new Date(Date.now() - 3 * JAM), status: 'OK', providerCalls: 1000 } })
  await prisma.$executeRawUnsafe(`UPDATE "AisPollRun" SET "startedAt" = "startedAt" - interval '2 hours' WHERE "tenantId" = $1 AND id <> $2`, D.A.id, pengisi.id)
  const n0 = await prisma.aisObservation.count({ where: { tenantId: D.A.id } })
  const sebelum = await idSemua('aisPollRun')
  const r = await job('ais-position-poll')
  const run = (await runBaru(sebelum))[0]
  cek('kuota habis → DISABLED_QUOTA KUOTA_HABIS, 0 panggilan, ok:false (terlihat)', run?.status === 'DISABLED_QUOTA' && run?.errorCode === 'KUOTA_HABIS' && run?.providerCalls === 0 && r.json.ok === false, JSON.stringify({ s: run?.status, e: run?.errorCode }))
  cek('tanpa observasi baru', (await prisma.aisObservation.count({ where: { tenantId: D.A.id } })) === n0)
  const hh = await api(D.sesi.adminA, '/api/automation/ais/health')
  cek('health: panggilan bulan ini ≥ kuota', hh.json.panggilanBulanIni >= 1000)
  await prisma.aisPollRun.deleteMany({ where: { id: pengisi.id } })
}

async function ujiRetensi() {
  console.log('\n[J] Retensi (D3)')
  const obs = (hari) => prisma.aisObservation.create({ data: { tenantId: D.A.id, vesselId: D.kTug.id, provider: 'FAKE', mmsi: D.kTug.mmsi, positionAt: new Date(Date.now() - hari * HARI), fetchedAt: new Date(Date.now() - hari * HARI), lat: -0.5, lon: 117.1, ageSecAtFetch: 0 } })
  const run = (hari) => prisma.aisPollRun.create({ data: { tenantId: D.A.id, provider: 'FAKE', agentVersion: `${TAG}retensi`, startedAt: new Date(Date.now() - hari * HARI), finishedAt: new Date(Date.now() - hari * HARI), status: 'OK' } })
  const o91 = await obs(91)
  const o89 = await obs(89)
  const r181 = await run(181)
  const r179 = await run(179)
  await resetState()
  await mundurkanRun()
  const r = await job('ais-position-poll')
  cek('jalan OK', barisA(r)?.status === 'OK', JSON.stringify(barisA(r)))
  cek('observasi 91 hari terhapus, 89 hari bertahan', !(await prisma.aisObservation.findFirst({ where: { id: o91.id } })) && !!(await prisma.aisObservation.findFirst({ where: { id: o89.id } })))
  cek('run 181 hari terhapus, 179 hari bertahan', !(await prisma.aisPollRun.findFirst({ where: { id: r181.id } })) && !!(await prisma.aisPollRun.findFirst({ where: { id: r179.id } })))
}

async function ujiFk() {
  console.log('\n[K] FK CASCADE (eksperimen ROLLBACK)')
  const coba = async (fn) => {
    let hasil = null
    try {
      await prisma.$transaction(async (tx) => {
        hasil = await fn(tx)
        throw Object.assign(new Error('ROLLBACK_SENGAJA'), { sengaja: true })
      }, { timeout: 60_000 })
    } catch (e) {
      if (!e?.sengaja) hasil = { galat: String(e?.message ?? e).split('\n').slice(-2).join(' ') }
    }
    return hasil
  }
  const hv = await coba(async (tx) => {
    await tx.$executeRawUnsafe('DELETE FROM "VoyageVessel" WHERE "vesselId" = $1', D.kTug.id)
    await tx.$executeRawUnsafe('DELETE FROM "Vessel" WHERE id = $1', D.kTug.id)
    return { obs: await tx.aisObservation.count({ where: { vesselId: D.kTug.id } }) }
  })
  cek('hapus kapal → observasinya ikut terhapus (CASCADE)', hv && !hv.galat && hv.obs === 0, JSON.stringify(hv))
  const runId = (await prisma.aisObservation.findFirst({ where: { tenantId: D.A.id, runId: { not: null } } }))?.runId
  const hr = await coba(async (tx) => {
    await tx.$executeRawUnsafe('DELETE FROM "AisPollRun" WHERE id = $1', runId)
    return { tanpaRun: await tx.aisObservation.count({ where: { runId } }), tetap: await tx.aisObservation.count({ where: { tenantId: D.A.id } }) }
  })
  cek('hapus run → observasi tetap, runId SET NULL', hr && !hr.galat && hr.tanpaRun === 0 && hr.tetap > 0, JSON.stringify(hr))
  const ht = await coba(async (tx) => {
    await tx.$executeRawUnsafe('DELETE FROM "Tenant" WHERE id = $1', D.A.id)
    return {
      obs: await tx.aisObservation.count({ where: { tenantId: D.A.id } }),
      run: await tx.aisPollRun.count({ where: { tenantId: D.A.id } }),
      st: await tx.aisProviderState.count({ where: { tenantId: D.A.id } }),
    }
  })
  cek('hapus tenant BERHASIL dengan tabel AIS terisi (jebakan cascade Step 2 tak terulang)', ht && !ht.galat && ht.obs === 0 && ht.run === 0 && ht.st === 0, JSON.stringify(ht))
  cek('ROLLBACK: data AIS tenant A utuh kembali', (await prisma.aisObservation.count({ where: { tenantId: D.A.id } })) > 0)
}

// ------------------------------------------------------------------ bersih-bersih

const MODEL_GLOBAL = ['notification', 'voyage', 'vessel', 'voyageVessel', 'user', 'auditLog', 'voyageEvent', 'task', 'monitoredVoyage', 'monitoringRun', 'monitoringSignal', 'aisObservation', 'aisPollRun', 'aisProviderState']
async function hitungGlobal() {
  const o = {}
  for (const m of MODEL_GLOBAL) o[m] = await prisma[m].count()
  return o
}

async function bersihkan(awal) {
  const ids = D.voyageIds ?? []
  const baru = async (model, himpunan) => (await prisma[model].findMany({ select: { id: true } })).map((r) => r.id).filter((id) => !himpunan.has(id))
  const monRunBaru = await baru('monitoringRun', awal.monRun)
  const n = {
    sinyal: (await prisma.monitoringSignal.deleteMany({ where: { OR: [{ voyageId: { in: ids } }, { runId: { in: monRunBaru } }] } })).count,
    notif: (await prisma.notification.deleteMany({ where: { id: { in: await baru('notification', awal.notif) } } })).count,
    monRun: (await prisma.monitoringRun.deleteMany({ where: { id: { in: monRunBaru } } })).count,
    audit: (await prisma.auditLog.deleteMany({ where: { id: { in: await baru('auditLog', awal.audit) } } })).count,
    aisObs: (await prisma.aisObservation.deleteMany({ where: { id: { in: await baru('aisObservation', awal.aisObs) } } })).count,
    aisRun: (await prisma.aisPollRun.deleteMany({ where: { id: { in: await baru('aisPollRun', awal.aisRun) } } })).count,
    aisState: (await prisma.aisProviderState.deleteMany({ where: { id: { in: await baru('aisProviderState', awal.aisState) } } })).count,
    pantau: (await prisma.monitoredVoyage.deleteMany({ where: { voyageId: { in: ids } } })).count,
    vv: (await prisma.voyageVessel.deleteMany({ where: { voyageId: { in: ids } } })).count,
    voyage: (await prisma.voyage.deleteMany({ where: { voyageNumber: { startsWith: TAG } } })).count,
    kapal: (await prisma.vessel.deleteMany({ where: { name: { startsWith: TAG } } })).count,
    pengguna: (await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } })).count,
  }
  console.log(`     dihapus → ${JSON.stringify(n)}`)
}

async function main() {
  console.log(`Uji AIS PRD-003 Step 4 — ${BASE_URL} (adapter FAKE, tanpa jaringan penyedia)`)
  if (!TOKEN) throw new Error('JOB_RUNNER_TOKEN belum ada di .env.local / .env')
  const hitungAwal = await hitungGlobal()
  const awal = {
    notif: await idSemua('notification'),
    audit: await idSemua('auditLog'),
    monRun: await idSemua('monitoringRun'),
    aisObs: await idSemua('aisObservation'),
    aisRun: await idSemua('aisPollRun'),
    aisState: await idSemua('aisProviderState'),
  }
  console.log(`Baris global sebelum uji: ${JSON.stringify(hitungAwal)}`)
  try {
    await siapkanData()
    await ujiAkses()
    await ujiJalanPertama()
    await ujiJatuhTempo()
    await ujiIdempotensi()
    await ujiKonkurensi()
    await ujiMismatch()
    await ujiTimeout()
    await ujiSinyal()
    await ujiKuota()
    await ujiRetensi()
    await ujiFk()
    console.log('\n[L] Keamanan data akhir')
    cek('KEAMANAN DATA: seluruh uji AIS tak mengubah Voyage/Vessel/VoyageVessel/VoyageEvent/Task', (await potretOperasional()) === D.potret)
  } finally {
    console.log('\n[Z] Bersih-bersih data disposable')
    await bersihkan(awal)
    const akhir = await hitungGlobal()
    console.log(`Baris global sesudah uji: ${JSON.stringify(akhir)}`)
    cek('seluruh jumlah baris global kembali seperti semula', JSON.stringify(hitungAwal) === JSON.stringify(akhir), JSON.stringify(hitungAwal) === JSON.stringify(akhir) ? '' : `${JSON.stringify(hitungAwal)} vs ${JSON.stringify(akhir)}`)
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
