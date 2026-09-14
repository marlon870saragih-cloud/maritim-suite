// Uji HTTP + DB Automation Hub — PRD-002 Step 5B.
//
// Jalankan:  node prisma/check-automation-api.mjs      (butuh `npm run dev` menyala dengan
//            AUTOMATION_MONITORING_ENABLED=true dan AUTOMATION_TENANT_IDS di .env.local)
//
// Membuktikan lewat jalur NYATA (sesi login, route, job ber-token, database):
//   A. akses & gerbang (401/403/404, tenant kembar ditolak, portal tanpa GRANT)
//   B. mulai/hentikan pemantauan + validasi kepemilikan
//   C. keenam detektor dari perubahan sungguhan (PATCH voyage, status, peristiwa)
//   D. isolasi galat per voyage (MONITORING_ERROR) & bentuk hasil job
//   E. idempotensi: jalan ulang & EMPAT jalan bersamaan tanpa duplikat
//   F. keamanan data: Voyage/Vessel/VoyageVessel/VoyageEvent/Task tak berubah
//   G. notifikasi internal WARNING/ERROR saja, dedupe, tanpa penerima luar
//   H. review ACKNOWLEDGE/DISMISS + otorisasi + lintas tenant
//   I. siklus hidup CLOSED/CANCELLED/dihapus → berhenti & EXPIRED
//   J. FK CASCADE: hapus voyage & hapus tenant (eksperimen ROLLBACK)
//
// Skrip ini MENULIS ke database dev. Semua barisnya bertanda `P2S5B-` / email
// `p2s5b-*` dan dihapus lagi di akhir, termasuk saat gagal di tengah.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { tanggalBisnis } from '../src/lib/business-time.ts'

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
const TAG = 'P2S5B-'
const EMAIL = 'p2s5b-'
const SANDI = 'UjiP2s5bAutomation!2026'
const JAM = 3_600_000
const ALLOW = (process.env.AUTOMATION_TENANT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

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
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function jalankanJob(token = TOKEN) {
  const res = await fetch(`${BASE_URL}/api/jobs/run?job=voyage-monitoring`, { method: 'POST', headers: token ? { 'x-job-token': token } : {} })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

// ------------------------------------------------------------------ data & potret

const D = {}
const lahir = { notif: new Set(), audit: new Set(), run: new Set() }

async function idSemua(model) {
  return new Set((await prisma[model].findMany({ select: { id: true } })).map((r) => r.id))
}

/** Potret tabel operasional yang TIDAK boleh diubah pemantauan (semua tenant). */
async function potretOperasional() {
  const [voyage, vessel, vv, ev, task] = await Promise.all([
    prisma.voyage.findMany({ select: { id: true, updatedAt: true, status: true, eta: true, etd: true, ata: true, atb: true, atd: true, deletedAt: true }, orderBy: { id: 'asc' } }),
    prisma.vessel.findMany({ select: { id: true, updatedAt: true, mmsi: true }, orderBy: { id: 'asc' } }),
    prisma.voyageVessel.findMany({ select: { id: true, updatedAt: true, role: true }, orderBy: { id: 'asc' } }),
    prisma.voyageEvent.findMany({ select: { id: true, occurredAt: true, eventCode: true, deletedAt: true }, orderBy: { id: 'asc' } }),
    prisma.task.findMany({ select: { id: true, updatedAt: true, status: true }, orderBy: { id: 'asc' } }),
  ])
  return JSON.stringify({ voyage, vessel, vv, ev, task })
}

async function siapkanData() {
  if (process.env.AUTOMATION_MONITORING_ENABLED !== 'true' || ALLOW.length === 0) {
    throw new Error('Setel AUTOMATION_MONITORING_ENABLED=true dan AUTOMATION_TENANT_IDS di .env.local, lalu restart dev server.')
  }
  D.A = await prisma.tenant.findUnique({ where: { id: ALLOW[0] } })
  if (!D.A) throw new Error(`Tenant allowlist ${ALLOW[0]} tidak ada di DB dev.`)
  D.B = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  D.C = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' }, id: { notIn: ALLOW } }, orderBy: { createdAt: 'asc' } })
  if (!D.B) throw new Error('Tenant Verifikasi tidak ada di DB dev.')
  info(`tenant A (allowlist) ${D.A.id} "${D.A.companyName}"; B ${D.B.id}; C (nama kembar, di luar allowlist) ${D.C?.id ?? '—'}`)

  const hash = await bcrypt.hash(SANDI, 10)
  const user = (tenantId, peran, sufiks) =>
    prisma.user.create({ data: { tenantId, email: `${EMAIL}${sufiks}@uji.local`, name: `${TAG}${peran}`, password: hash, role: peran, isActive: true } })
  D.adminA = await user(D.A.id, 'ADMIN', 'admin-a')
  D.manajerA = await user(D.A.id, 'MANAJER_OPERASI', 'manajer-a')
  D.operatorA = await user(D.A.id, 'OPERATOR', 'operator-a')
  D.viewerA = await user(D.A.id, 'VIEWER', 'viewer-a')
  D.adminB = await user(D.B.id, 'ADMIN', 'admin-b')
  if (D.C) D.adminC = await user(D.C.id, 'ADMIN', 'admin-c')

  D.kapalA = await prisma.vessel.create({ data: { tenantId: D.A.id, name: `${TAG}Kapal Uji A`, gt: 1000 } })
  D.kapalB = await prisma.vessel.create({ data: { tenantId: D.B.id, name: `${TAG}Kapal Uji B`, gt: 1000 } })
  const vy = (tenantId, vesselId, n, status = 'CONFIRMED') =>
    prisma.voyage.create({
      data: { tenantId, vesselId, voyageNumber: `${TAG}VYG-${n}-${Date.now().toString(36)}`, status, eta: new Date('2026-10-01T00:00:00.000Z'), dataOrigin: 'UJI' },
    })
  D.V1 = await vy(D.A.id, D.kapalA.id, 'UTAMA')
  D.V2 = await vy(D.A.id, D.kapalA.id, 'GALAT')
  D.V3 = await vy(D.A.id, D.kapalA.id, 'BASI')
  D.V4 = await vy(D.A.id, D.kapalA.id, 'TUTUP')
  D.V5 = await vy(D.A.id, D.kapalA.id, 'BATAL')
  D.V6 = await vy(D.A.id, D.kapalA.id, 'HAPUS')
  D.V7 = await vy(D.A.id, D.kapalA.id, 'SUDAH-CLOSED', 'CLOSED')
  D.VB = await vy(D.B.id, D.kapalB.id, 'TENANT-B')
  D.voyageIds = [D.V1, D.V2, D.V3, D.V4, D.V5, D.V6, D.V7, D.VB].map((v) => v.id)

  D.sesi = {
    adminA: await login(D.adminA.email),
    manajerA: await login(D.manajerA.email),
    operatorA: await login(D.operatorA.email),
    viewerA: await login(D.viewerA.email),
    adminB: await login(D.adminB.email),
    adminC: D.adminC ? await login(D.adminC.email) : null,
  }
}

const sinyalVoyage = (voyageId) => prisma.monitoringSignal.findMany({ where: { voyageId }, orderBy: { detectedAt: 'asc' } })

// =========================================================================== uji

async function ujiAkses() {
  console.log('\n[A] Akses & gerbang')
  cek('tanpa sesi → 401', (await api(null, 'GET', '/api/automation/health')).status === 401)
  cek('ADMIN tenant allowlist → 200', (await api(D.sesi.adminA, 'GET', '/api/automation/health')).status === 200)
  cek('MANAJER_OPERASI tenant allowlist → 200', (await api(D.sesi.manajerA, 'GET', '/api/automation/health')).status === 200)
  cek('OPERATOR → 403', (await api(D.sesi.operatorA, 'GET', '/api/automation/health')).status === 403)
  cek('VIEWER → 403', (await api(D.sesi.viewerA, 'GET', '/api/automation/signals')).status === 403)
  cek('ADMIN tenant di luar allowlist → 404 (fitur tak terungkap)', (await api(D.sesi.adminB, 'GET', '/api/automation/health')).status === 404)
  if (D.sesi.adminC) cek('ADMIN tenant bernama "Tribuana" tapi id lain → 404', (await api(D.sesi.adminC, 'GET', '/api/automation/monitored-voyages')).status === 404)
  const hal = async (sesi, path) => (await sesi.ambil(path)).status
  cek('halaman /automation: ADMIN → 200', (await hal(D.sesi.adminA, '/automation')) === 200)
  cek('halaman /automation: OPERATOR → 404', (await hal(D.sesi.operatorA, '/automation')) === 404)
  cek('halaman /automation/alerts: tenant B → 404', (await hal(D.sesi.adminB, '/automation/alerts')) === 404)
  const dasbor = await (await D.sesi.adminA.ambil('/dashboard')).text()
  const dasborOp = await (await D.sesi.operatorA.ambil('/dashboard')).text()
  cek('menu Automation Hub tampil untuk ADMIN, tidak untuk OPERATOR', dasbor.includes('href="/automation"') && !dasborOp.includes('href="/automation"'))
  cek('job tanpa token → 401', (await jalankanJob('')).status === 401)

  const url = process.env.PORTAL_DATABASE_URL
  if (url) {
    const portal = new PrismaClient({ datasources: { db: { url } } })
    for (const t of ['MonitoredVoyage', 'MonitoringRun', 'MonitoringSignal']) {
      let pesan = ''
      try {
        await portal.$queryRawUnsafe(`SELECT 1 FROM "${t}" LIMIT 1`)
      } catch (e) {
        pesan = String(e?.message ?? e)
      }
      cek(`peran DB portal tak bisa membaca "${t}"`, /permission denied/i.test(pesan), pesan.split('\n').find((l) => /permission/i.test(l))?.trim() ?? '(tak ditolak)')
    }
    await portal.$disconnect()
  } else {
    info('PORTAL_DATABASE_URL tak ada — uji GRANT portal dilewati')
  }
}

async function ujiMulai() {
  console.log('\n[B] Mulai / hentikan pemantauan')
  const daftar0 = await api(D.sesi.adminA, 'GET', '/api/automation/monitored-voyages')
  cek('GET daftar → 200 {pemantauan, bisaDipantau}', daftar0.status === 200 && Array.isArray(daftar0.json.pemantauan) && Array.isArray(daftar0.json.bisaDipantau))
  cek('voyage CLOSED tidak ditawarkan', !daftar0.json.bisaDipantau.some((v) => v.id === D.V7.id))

  const m1 = await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V1.id, tenantId: D.B.id })
  cek('ADMIN mulai V1 → 201', m1.status === 201, `status=${m1.status} ${JSON.stringify(m1.json.error ?? '')}`)
  const baris = await prisma.monitoredVoyage.findFirst({ where: { voyageId: D.V1.id } })
  cek('tenantId dari body DIABAIKAN (baris milik tenant A)', baris?.tenantId === D.A.id)
  cek('mulai lagi → 409', (await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V1.id })).status === 409)
  cek('OPERATOR mulai → 403', (await api(D.sesi.operatorA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V2.id })).status === 403)
  cek('voyage tenant lain → 404', (await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.VB.id })).status === 404)
  cek('voyage CLOSED → 400', (await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V7.id })).status === 400)
  cek('tanpa voyageId → 400', (await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', {})).status === 400)
  for (const v of [D.V2, D.V4, D.V5, D.V6]) {
    const r = await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: v.id })
    cek(`mulai ${v.voyageNumber.split('-')[2]} → 201`, r.status === 201, `status=${r.status}`)
  }
  cek('MANAJER_OPERASI mulai V3 → 201', (await api(D.sesi.manajerA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V3.id })).status === 201)
  const jejak = await prisma.auditLog.count({ where: { tenantId: D.A.id, tableName: 'MonitoredVoyage', recordId: baris?.id } })
  cek('perubahan status pemantauan diaudit (AuditLog MonitoredVoyage)', jejak >= 1, `baris=${jejak}`)
  const daftar1 = await api(D.sesi.adminA, 'GET', '/api/automation/monitored-voyages')
  const milikUji = daftar1.json.pemantauan.filter((p) => D.voyageIds.includes(p.voyageId))
  cek('6 voyage uji dipantau, kesehatan BELUM_DICEK', milikUji.length === 6 && milikUji.every((p) => p.enabled && p.kesehatan === 'BELUM_DICEK'), `n=${milikUji.length}`)
  cek('kapal utama tampil di daftar', milikUji.every((p) => p.kapalUtama === D.kapalA.name))
}

async function siapkanPerubahan() {
  console.log('\n[C0] Perubahan sumber lewat jalur aplikasi')
  const patch = await api(D.sesi.adminA, 'PATCH', `/api/voyages/${D.V1.id}`, {
    vesselId: D.kapalA.id, status: 'CONFIRMED', baseCurrency: 'IDR', eta: '2026-10-03', etd: '2026-10-05',
  })
  cek('PATCH voyage ETA +2 hari & ETD ditetapkan → 200', patch.status === 200, `status=${patch.status} ${JSON.stringify(patch.json.error ?? '')}`)
  const st = await api(D.sesi.adminA, 'PATCH', `/api/voyages/${D.V1.id}/status`, { status: 'ARRIVED' })
  cek('PATCH status CONFIRMED → ARRIVED → 200', st.status === 200, `status=${st.status}`)
  const ev = async (voyageId, eventCode, msLalu) =>
    api(D.sesi.adminA, 'POST', `/api/voyages/${voyageId}/events`, { eventCode, occurredAt: new Date(Date.now() - msLalu).toISOString() })
  D.evSailed = (await ev(D.V1.id, 'SAILED', 13 * JAM)).json.peristiwa
  D.evOther = (await ev(D.V1.id, 'OTHER', 1 * JAM)).json.peristiwa
  D.evEosp = (await ev(D.V1.id, 'EOSP', 1 * JAM)).json.peristiwa
  D.evV4 = (await ev(D.V4.id, 'EOSP', 1 * JAM)).json.peristiwa
  cek('4 peristiwa tercatat lewat API', [D.evSailed, D.evOther, D.evEosp, D.evV4].every((e) => e?.id))

  // V3 basi: mundurkan waktu (fixture uji sendiri). Kolom Prisma timestamp(3) naif → UTC eksplisit.
  await prisma.$executeRawUnsafe(`UPDATE "Voyage" SET "updatedAt" = (now() AT TIME ZONE 'UTC') - interval '30 hours' WHERE id = $1`, D.V3.id)
  await prisma.$executeRawUnsafe(`UPDATE "MonitoredVoyage" SET "startedAt" = (now() AT TIME ZONE 'UTC') - interval '30 hours' WHERE "voyageId" = $1`, D.V3.id)

  // V2 rusak: AuditLog UBAH_TANGGAL tanpa larik `medan` → harus jadi MONITORING_ERROR, bukan diam.
  const rusak = await prisma.auditLog.create({
    data: { tenantId: D.A.id, tableName: 'Voyage', recordId: D.V2.id, action: 'UPDATE', userId: D.adminA.id, newValue: { peristiwa: 'UBAH_TANGGAL', medan: 'eta' } },
  })
  lahir.audit.add(rusak.id)
}

async function ujiJalanPertama() {
  console.log('\n[C] Detektor — jalan pertama')
  const potret = await potretOperasional()
  const notifSebelum = await idSemua('notification')
  const sinyalSebelum = await idSemua('monitoringSignal')

  const r = await jalankanJob()
  cek('job ber-token → 200', r.status === 200, `status=${r.status}`)
  const hA = (r.json.hasil ?? []).find((h) => h.tenant === D.A.id)
  cek('hasil memuat tenant A dengan runId', !!hA?.runId)
  if (hA?.runId) lahir.run.add(hA.runId)
  cek('satu voyage gagal → ok:false & gagal=1 (galat terlihat)', r.json.ok === false && hA?.gagal === 1, `ok=${r.json.ok} gagal=${hA?.gagal}`)
  cek('voyage lain tetap dicek (≥ 5)', (hA?.voyagesChecked ?? 0) >= 5, `voyagesChecked=${hA?.voyagesChecked}`)
  const run = hA?.runId ? await prisma.monitoringRun.findFirst({ where: { id: hA.runId } }) : null
  cek('MonitoringRun tersimpan: PARTIAL, finishedAt, hitungan cocok', run?.status === 'PARTIAL' && !!run?.finishedAt && run?.signalsCreated === hA?.dibuat && run?.voyagesFailed === 1,
    `status=${run?.status} created=${run?.signalsCreated}/${hA?.dibuat}`)
  cek('tanpa tenant B/C di hasil job (allowlist)', !(r.json.hasil ?? []).some((h) => h.tenant === D.B.id || h.tenant === D.C?.id))

  const s1 = await sinyalVoyage(D.V1.id)
  const cari = (kind, fn = () => true) => s1.filter((s) => s.kind === kind && fn(s))
  cek('ETA_CHANGED eta mundur 2 hari → 1 WARNING', cari('ETA_CHANGED', (s) => s.after?.eta === '2026-10-03').length === 1 && cari('ETA_CHANGED', (s) => s.after?.eta)[0]?.severity === 'WARNING')
  cek('ETA_CHANGED etd ditetapkan → 1 INFO', cari('ETA_CHANGED', (s) => s.after?.etd === '2026-10-05').length === 1 && cari('ETA_CHANGED', (s) => s.after?.etd)[0]?.severity === 'INFO')
  const auditEta = cari('ETA_CHANGED')[0]?.sourceRef
  const auditAsli = auditEta ? await prisma.auditLog.findFirst({ where: { id: auditEta } }) : null
  cek('ETA_CHANGED merujuk AuditLog UBAH_TANGGAL nyata milik tenant A', auditAsli?.tenantId === D.A.id && auditAsli?.newValue?.peristiwa === 'UBAH_TANGGAL')
  cek('VOYAGE_STATUS_CHANGED → 1 INFO (CONFIRMED→ARRIVED)', cari('VOYAGE_STATUS_CHANGED').length === 1 && cari('VOYAGE_STATUS_CHANGED')[0].after?.status === 'ARRIVED')
  cek('OPERATIONAL_EVENT_RECORDED SAILED & EOSP (merujuk VoyageEvent)', cari('OPERATIONAL_EVENT_RECORDED', (s) => s.sourceRef === D.evSailed.id).length === 1 && cari('OPERATIONAL_EVENT_RECORDED', (s) => s.sourceRef === D.evEosp.id).length === 1)
  cek('peristiwa OTHER → tanpa sinyal', cari('OPERATIONAL_EVENT_RECORDED', (s) => s.sourceRef === D.evOther.id).length === 0)
  cek('ACTUAL_DATE_MISSING atd (SAILED 13 jam) → WARNING', cari('ACTUAL_DATE_MISSING', (s) => s.dedupeKey.endsWith(':atd')).length === 1)
  cek('EOSP 1 jam lalu → belum ACTUAL_DATE_MISSING ata', cari('ACTUAL_DATE_MISSING', (s) => s.dedupeKey.endsWith(':ata')).length === 0)
  cek('V1 aktif → tanpa DATA_STALE', cari('DATA_STALE').length === 0)
  cek('before/after kecil (< 300 byte)', s1.every((s) => JSON.stringify(s.before ?? null).length < 300 && JSON.stringify(s.after ?? null).length < 300))
  cek('semua sinyal baru bertenant A & run jalan ini', s1.every((s) => s.tenantId === D.A.id && s.runId === hA?.runId))

  const s3 = await sinyalVoyage(D.V3.id)
  const hari = [tanggalBisnis(new Date(Date.now() - 5 * 60_000)), tanggalBisnis(new Date())]
  cek('V3 tanpa aktivitas 30 jam → DATA_STALE WARNING kunci hari WITA', s3.length === 1 && s3[0].kind === 'DATA_STALE' && hari.some((h) => s3[0].dedupeKey === `DATA_STALE:${D.V3.id}:${h}`), s3[0]?.dedupeKey)
  const s2 = await sinyalVoyage(D.V2.id)
  cek('V2 sumber rusak → MONITORING_ERROR ERROR', s2.length === 1 && s2[0].kind === 'MONITORING_ERROR' && s2[0].severity === 'ERROR')
  cek('galat tanpa stack/detail teknis', s2[0] && s2[0].explanation.includes('DATA_SUMBER_TIDAK_SAH') && !/\bat\s|Error:|\n|prisma/i.test(s2[0].explanation))
  const mv2 = await prisma.monitoredVoyage.findFirst({ where: { voyageId: D.V2.id } })
  cek('voyage gagal tidak diberi lastCheckedAt', mv2?.lastCheckedAt === null)
  const mv1 = await prisma.monitoredVoyage.findFirst({ where: { voyageId: D.V1.id } })
  cek('voyage sukses diberi lastCheckedAt', mv1?.lastCheckedAt instanceof Date)

  cek('KEAMANAN DATA: jalan pertama tak mengubah Voyage/Vessel/VoyageVessel/VoyageEvent/Task', (await potretOperasional()) === potret)

  // Notifikasi internal
  const sinyalBaru = (await prisma.monitoringSignal.findMany({ where: { tenantId: D.A.id } })).filter((s) => !sinyalSebelum.has(s.id))
  const notifBaru = (await prisma.notification.findMany({ where: {} })).filter((n) => !notifSebelum.has(n.id))
  notifBaru.forEach((n) => lahir.notif.add(n.id))
  const penerima = await prisma.user.findMany({ where: { tenantId: D.A.id, role: { in: ['ADMIN', 'MANAJER_OPERASI'] }, isActive: true }, select: { id: true } })
  const idPenerima = new Set(penerima.map((u) => u.id))
  const penting = sinyalBaru.filter((s) => s.severity !== 'INFO')
  const notifAH = notifBaru.filter((n) => n.dedupeKey?.startsWith('AH:'))
  cek('notifikasi AH = sinyal WARNING/ERROR × penerima internal', notifAH.length === penting.length * penerima.length, `notif=${notifAH.length} sinyal=${penting.length} penerima=${penerima.length}`)
  cek('INFO tidak menghasilkan notifikasi', sinyalBaru.filter((s) => s.severity === 'INFO').every((s) => !notifAH.some((n) => n.dedupeKey.startsWith(`AH:${s.dedupeKey}:`))))
  cek('semua notifikasi AH bertarget ADMIN/MANAJER_OPERASI tenant A (tanpa siaran/pihak luar)', notifAH.every((n) => n.tenantId === D.A.id && n.userId && idPenerima.has(n.userId) && n.type === 'AUTOMATION_SIGNAL'))
  cek('OPERATOR/VIEWER tidak menerima notifikasi AH', !notifAH.some((n) => n.userId === D.operatorA.id || n.userId === D.viewerA.id))
}

async function ujiIdempotensi() {
  console.log('\n[E] Idempotensi & konkurensi')
  const sinyalSebelum = await idSemua('monitoringSignal')
  const notifSebelum = await idSemua('notification')
  const r = await jalankanJob()
  const hA = (r.json.hasil ?? []).find((h) => h.tenant === D.A.id)
  if (hA?.runId) lahir.run.add(hA.runId)
  const baru = (await prisma.monitoringSignal.findMany({ where: { tenantId: D.A.id } })).filter((s) => !sinyalSebelum.has(s.id))
  cek('jalan ulang → nol sinyal baru (kecuali galat berganti jam)', baru.every((s) => s.kind === 'MONITORING_ERROR'), `baru=${baru.map((s) => s.kind).join(',') || 0}`)
  cek('laporan dibuat = baris baru', hA?.dibuat === baru.length, `laporan=${hA?.dibuat} DB=${baru.length}`)
  const notifBaru = (await prisma.notification.findMany()).filter((n) => !notifSebelum.has(n.id))
  notifBaru.forEach((n) => lahir.notif.add(n.id))
  cek('jalan ulang → nol notifikasi AH baru untuk sinyal lama', notifBaru.filter((n) => n.dedupeKey?.startsWith('AH:') && !n.dedupeKey.includes('MONITORING_ERROR')).length === 0)

  // Satu perubahan logis baru, lalu EMPAT jalan bersamaan.
  const ev = await api(D.sesi.adminA, 'POST', `/api/voyages/${D.V1.id}/events`, { eventCode: 'COMPLETED', occurredAt: new Date(Date.now() - 30 * 60_000).toISOString() })
  D.evCompleted = ev.json.peristiwa
  const potret = await potretOperasional()
  const s0 = await idSemua('monitoringSignal')
  const hasil = await Promise.all(Array.from({ length: 4 }, () => jalankanJob()))
  hasil.forEach((x) => (x.json.hasil ?? []).forEach((h) => h.runId && lahir.run.add(h.runId)))
  cek('keempat jalan → 200', hasil.every((x) => x.status === 200), hasil.map((x) => x.status).join(' '))
  const lahirKonkuren = (await prisma.monitoringSignal.findMany({ where: { tenantId: D.A.id } })).filter((s) => !s0.has(s.id))
  const untukEvent = lahirKonkuren.filter((s) => s.sourceRef === D.evCompleted?.id)
  cek('SATU perubahan logis = SATU sinyal (bukan 4)', untukEvent.length === 1, `n=${untukEvent.length}`)
  cek('kunci dedupe unik di seluruh tenant', (await prisma.monitoringSignal.groupBy({ by: ['tenantId', 'dedupeKey'], _count: { _all: true }, having: { dedupeKey: { _count: { gt: 1 } } } })).length === 0)
  const sigmaDibuat = hasil.reduce((s, x) => s + ((x.json.hasil ?? []).find((h) => h.tenant === D.A.id)?.dibuat ?? 0), 0)
  cek('Σ dibuat 4 jalan = baris yang benar-benar lahir (tak dihitung ganda)', sigmaDibuat === lahirKonkuren.length, `laporan=${sigmaDibuat} DB=${lahirKonkuren.length}`)
  cek('KEAMANAN DATA: 4 jalan bersamaan tak mengubah tabel operasional', (await potretOperasional()) === potret)
}

async function ujiReview() {
  console.log('\n[H] Review')
  const potret = await potretOperasional()
  const s1 = await sinyalVoyage(D.V1.id)
  const warning = s1.find((s) => s.kind === 'ETA_CHANGED' && s.severity === 'WARNING')
  const info = s1.find((s) => s.kind === 'ETA_CHANGED' && s.severity === 'INFO')
  const lain = s1.find((s) => s.kind === 'VOYAGE_STATUS_CHANGED')

  const ack = await api(D.sesi.adminA, 'POST', `/api/automation/signals/${warning.id}/review`, { decision: 'ACKNOWLEDGE', note: 'Sudah dicek dengan operasi.' })
  cek('ADMIN ACKNOWLEDGE → 200 ACKNOWLEDGED', ack.status === 200 && ack.json.sinyal?.reviewState === 'ACKNOWLEDGED')
  cek('identitas peninjau tercatat', ack.json.sinyal?.reviewedByName === D.adminA.name && !!ack.json.sinyal?.reviewedAt && ack.json.sinyal?.reviewNote === 'Sudah dicek dengan operasi.')
  const db = await prisma.monitoringSignal.findFirst({ where: { id: warning.id } })
  cek('reviewedByUserId = ADMIN', db?.reviewedByUserId === D.adminA.id)
  cek('tinjau ulang sinyal yang sudah ditinjau → 409', (await api(D.sesi.adminA, 'POST', `/api/automation/signals/${warning.id}/review`, { decision: 'DISMISS' })).status === 409)
  cek('OPERATOR review → 403', (await api(D.sesi.operatorA, 'POST', `/api/automation/signals/${info.id}/review`, { decision: 'DISMISS' })).status === 403)
  cek('ADMIN tenant B review sinyal tenant A → 404', (await api(D.sesi.adminB, 'POST', `/api/automation/signals/${info.id}/review`, { decision: 'DISMISS' })).status === 404)
  cek('keputusan tak dikenal → 400', (await api(D.sesi.adminA, 'POST', `/api/automation/signals/${info.id}/review`, { decision: 'APPROVE' })).status === 400)
  cek('catatan > 500 karakter → 400', (await api(D.sesi.adminA, 'POST', `/api/automation/signals/${info.id}/review`, { decision: 'DISMISS', note: 'x'.repeat(501) })).status === 400)
  const dis = await api(D.sesi.manajerA, 'POST', `/api/automation/signals/${info.id}/review`, { decision: 'DISMISS' })
  cek('MANAJER_OPERASI DISMISS → 200 DISMISSED', dis.status === 200 && dis.json.sinyal?.reviewState === 'DISMISSED' && dis.json.sinyal?.reviewedByName === D.manajerA.name)
  cek('sinyal lain tetap OPEN', (await prisma.monitoringSignal.findFirst({ where: { id: lain.id } }))?.reviewState === 'OPEN')
  const catatanHtml = await api(D.sesi.adminA, 'POST', `/api/automation/signals/${lain.id}/review`, { decision: 'ACKNOWLEDGE', note: '<script>alert(1)</script>' })
  cek('catatan disimpan apa adanya sebagai teks (dirender aman oleh React)', catatanHtml.status === 200 && catatanHtml.json.sinyal?.reviewNote === '<script>alert(1)</script>')
  cek('KEAMANAN DATA: review tak mengubah data voyage', (await potretOperasional()) === potret)

  const list = await api(D.sesi.adminA, 'GET', `/api/automation/signals?voyageId=${D.V1.id}`)
  cek('GET sinyal per voyage → berisi info review', list.status === 200 && list.json.some((s) => s.id === warning.id && s.reviewedByName === D.adminA.name))
  cek('GET sinyal tanpa tenantId di respons', list.json.every((s) => !('tenantId' in s)))
  cek('GET sinyal voyage tenant A oleh tenant B → 404', (await api(D.sesi.adminB, 'GET', `/api/automation/signals?voyageId=${D.V1.id}`)).status === 404)
  cek('filter state tak sah → 400', (await api(D.sesi.adminA, 'GET', '/api/automation/signals?state=HACK')).status === 400)
}

async function ujiSiklus() {
  console.log('\n[I] Siklus hidup')
  const terbukaV4 = await prisma.monitoringSignal.count({ where: { voyageId: D.V4.id, reviewState: 'OPEN' } })
  cek('V4 punya sinyal OPEN sebelum ditutup', terbukaV4 >= 1, `n=${terbukaV4}`)
  cek('V4 → CLOSED', (await api(D.sesi.adminA, 'PATCH', `/api/voyages/${D.V4.id}/status`, { status: 'CLOSED' })).status === 200)
  cek('V5 → CANCELLED', (await api(D.sesi.adminA, 'PATCH', `/api/voyages/${D.V5.id}/status`, { status: 'CANCELLED' })).status === 200)
  const hapus = await api(D.sesi.adminA, 'DELETE', `/api/voyages/${D.V6.id}`)
  cek('V6 dihapus (soft delete) → 200', hapus.status === 200, `status=${hapus.status} ${JSON.stringify(hapus.json.error ?? '')}`)

  const s0 = await idSemua('monitoringSignal')
  const r = await jalankanJob()
  ;(r.json.hasil ?? []).forEach((h) => h.runId && lahir.run.add(h.runId))
  const mv = async (v) => prisma.monitoredVoyage.findFirst({ where: { voyageId: v.id } })
  cek('CLOSED → pemantauan berhenti (VOYAGE_CLOSED)', (await mv(D.V4))?.enabled === false && (await mv(D.V4))?.stopReason === 'VOYAGE_CLOSED')
  cek('CANCELLED → berhenti (VOYAGE_CANCELLED)', (await mv(D.V5))?.stopReason === 'VOYAGE_CANCELLED' && (await mv(D.V5))?.enabled === false)
  cek('dihapus → berhenti (VOYAGE_DELETED)', (await mv(D.V6))?.stopReason === 'VOYAGE_DELETED' && (await mv(D.V6))?.enabled === false)
  cek('sinyal OPEN V4 → EXPIRED', (await prisma.monitoringSignal.count({ where: { voyageId: D.V4.id, reviewState: 'OPEN' } })) === 0 && (await prisma.monitoringSignal.count({ where: { voyageId: D.V4.id, reviewState: 'EXPIRED' } })) === terbukaV4)
  const baruBerhenti = (await prisma.monitoringSignal.findMany({ where: { voyageId: { in: [D.V4.id, D.V5.id, D.V6.id] } } })).filter((s) => !s0.has(s.id))
  cek('voyage berhenti tidak menghasilkan sinyal baru', baruBerhenti.length === 0, `baru=${baruBerhenti.length}`)
  cek('penghentian otomatis diaudit', (await prisma.auditLog.count({ where: { tenantId: D.A.id, tableName: 'MonitoredVoyage', newValue: { path: ['stopReason'], equals: 'VOYAGE_CLOSED' } } })) >= 1)

  const mv3 = await mv(D.V3)
  cek('hentikan manual → 200', (await api(D.sesi.adminA, 'DELETE', `/api/automation/monitored-voyages/${mv3.id}`)).status === 200)
  cek('hentikan manual lagi → 409', (await api(D.sesi.adminA, 'DELETE', `/api/automation/monitored-voyages/${mv3.id}`)).status === 409)
  cek('stopReason MANUAL', (await mv(D.V3))?.stopReason === 'MANUAL')
  cek('hentikan milik tenant lain → 404', (await api(D.sesi.adminB, 'DELETE', `/api/automation/monitored-voyages/${mv3.id}`)).status === 404)
  cek('mulai ulang V3 → 201 dan aktif lagi', (await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V3.id })).status === 201 && (await mv(D.V3))?.enabled === true)
  cek('voyage CLOSED tak bisa dipantau ulang → 400', (await api(D.sesi.adminA, 'POST', '/api/automation/monitored-voyages', { voyageId: D.V4.id })).status === 400)

  const health = await api(D.sesi.adminA, 'GET', '/api/automation/health')
  cek('health: run terakhir + penyedia tak terkonfigurasi (bukan galat)', health.status === 200 && !!health.json.runTerakhir && health.json.penyedia?.terkonfigurasi === false)
}

async function ujiFk() {
  console.log('\n[J] FK CASCADE (eksperimen ROLLBACK)')
  const cobaRollback = async (fn) => {
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
  const hv = await cobaRollback(async (tx) => {
    await tx.$executeRawUnsafe('DELETE FROM "Voyage" WHERE id = $1', D.V5.id)
    return {
      mv: await tx.monitoredVoyage.count({ where: { voyageId: D.V5.id } }),
      sig: await tx.monitoringSignal.count({ where: { voyageId: D.V5.id } }),
    }
  })
  cek('hapus voyage → baris pemantauan ikut terhapus (CASCADE)', hv && !hv.galat && hv.mv === 0 && hv.sig === 0, JSON.stringify(hv))
  const ht = await cobaRollback(async (tx) => {
    await tx.$executeRawUnsafe('DELETE FROM "Tenant" WHERE id = $1', D.A.id)
    return {
      mv: await tx.monitoredVoyage.count({ where: { tenantId: D.A.id } }),
      run: await tx.monitoringRun.count({ where: { tenantId: D.A.id } }),
      sig: await tx.monitoringSignal.count({ where: { tenantId: D.A.id } }),
    }
  })
  cek('hapus tenant BERHASIL (tabel baru tak mematahkan delete-tenant)', ht && !ht.galat && ht.mv === 0 && ht.run === 0 && ht.sig === 0, JSON.stringify(ht))
  cek('ROLLBACK: tenant A & datanya utuh kembali', !!(await prisma.tenant.findUnique({ where: { id: D.A.id } })) && (await prisma.monitoringSignal.count({ where: { tenantId: D.A.id } })) > 0)
}

// ------------------------------------------------------------------ bersih-bersih

const MODEL_GLOBAL = ['notification', 'voyage', 'vessel', 'user', 'auditLog', 'voyageEvent', 'task', 'monitoredVoyage', 'monitoringRun', 'monitoringSignal']
async function hitungGlobal() {
  const o = {}
  for (const m of MODEL_GLOBAL) o[m] = await prisma[m].count()
  return o
}

async function bersihkan(auditAwal, notifAwal, runAwal) {
  const ids = D.voyageIds ?? []
  const auditBaru = (await prisma.auditLog.findMany({ select: { id: true } })).map((a) => a.id).filter((id) => !auditAwal.has(id))
  const notifBaru = (await prisma.notification.findMany({ select: { id: true } })).map((n) => n.id).filter((id) => !notifAwal.has(id))
  const runBaru = (await prisma.monitoringRun.findMany({ select: { id: true } })).map((r) => r.id).filter((id) => !runAwal.has(id))
  const n = {
    sinyal: (await prisma.monitoringSignal.deleteMany({ where: { OR: [{ voyageId: { in: ids } }, { runId: { in: runBaru } }] } })).count,
    pantau: (await prisma.monitoredVoyage.deleteMany({ where: { voyageId: { in: ids } } })).count,
    run: (await prisma.monitoringRun.deleteMany({ where: { id: { in: runBaru } } })).count,
    notif: (await prisma.notification.deleteMany({ where: { id: { in: notifBaru } } })).count,
    audit: (await prisma.auditLog.deleteMany({ where: { id: { in: auditBaru } } })).count,
    peristiwa: (await prisma.voyageEvent.deleteMany({ where: { voyageId: { in: ids } } })).count,
    tugas: (await prisma.task.deleteMany({ where: { voyageId: { in: ids } } })).count,
    voyage: (await prisma.voyage.deleteMany({ where: { voyageNumber: { startsWith: TAG } } })).count,
    kapal: (await prisma.vessel.deleteMany({ where: { name: { startsWith: TAG } } })).count,
    pengguna: (await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } })).count,
  }
  console.log(`     dihapus → ${JSON.stringify(n)}`)
}

async function main() {
  console.log(`Uji Automation Hub PRD-002 Step 5B — ${BASE_URL}`)
  if (!TOKEN) throw new Error('JOB_RUNNER_TOKEN belum ada di .env.local / .env')
  const awal = await hitungGlobal()
  const auditAwal = await idSemua('auditLog')
  const notifAwal = await idSemua('notification')
  const runAwal = await idSemua('monitoringRun')
  console.log(`Baris global sebelum uji: ${JSON.stringify(awal)}`)
  try {
    await siapkanData()
    await ujiAkses()
    await ujiMulai()
    await siapkanPerubahan()
    await ujiJalanPertama()
    await ujiIdempotensi()
    await ujiReview()
    await ujiSiklus()
    await ujiFk()
  } finally {
    console.log('\n[Z] Bersih-bersih data disposable')
    await bersihkan(auditAwal, notifAwal, runAwal)
    const akhir = await hitungGlobal()
    console.log(`Baris global sesudah uji: ${JSON.stringify(akhir)}`)
    cek('seluruh jumlah baris global kembali seperti semula', JSON.stringify(awal) === JSON.stringify(akhir), JSON.stringify(awal) === JSON.stringify(akhir) ? '' : `${JSON.stringify(awal)} vs ${JSON.stringify(akhir)}`)
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
