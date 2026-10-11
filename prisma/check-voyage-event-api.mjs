// Uji HTTP route VoyageEvent — POST & DELETE `/api/voyages/[id]/events[/eventId]` lewat jalur NYATA
// (sesi login NextAuth, route, withTenant, service, database). Dibuat untuk pembuktian kompatibilitas K1
// (WA-2a F4: penulis VoyageEvent kini bertransaksi + mengunci Voyage FOR NO KEY UPDATE).
//
// Jalankan (server `next dev` loopback + PostgreSQL loopback sekali pakai yang sudah `migrate deploy`):
//   VE_API_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite \
//   VE_API_BASE_URL=http://localhost:3100 [VE_API_TRANSKRIP=/path/transkrip.json] [VE_API_HARAP_K1=1] \
//     node prisma/check-voyage-event-api.mjs
//
// • Uji DIFERENSIAL: transkrip ternormalisasi (status + body, id/waktu diganti label) ditulis ke VE_API_TRANSKRIP;
//   transkrip dari server kode `main` dan kode cabang harus IDENTIK.
// • VE_API_HARAP_K1=1 → tambahan: POST/DELETE MENUNGGU selama Voyage dipegang FOR SHARE (hanya kode K1).
// • Ditolak bila DB atau server bukan loopback, atau NODE_ENV=production. Data bertanda `VEAPI-`, dihapus di akhir.

import { writeFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'

const URL_DB = process.env.VE_API_DB_URL
const BASE_URL = process.env.VE_API_BASE_URL
if (!URL_DB || !BASE_URL) {
  console.log('DILEWATI — VE_API_DB_URL & VE_API_BASE_URL wajib (DB + server loopback).')
  process.exit(3)
}
const loopback = (u) => {
  try {
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(u).hostname)
  } catch {
    return false
  }
}
if (!loopback(URL_DB) || !loopback(BASE_URL) || (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
  console.log('❌ DITOLAK: DB/server wajib loopback dan NODE_ENV bukan production.')
  process.exit(1)
}
const { PrismaClient } = await import('@prisma/client')
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

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
const TAG = 'VEAPI-'
const SANDI = 'UjiVeApiRoute!2026'
const JAM = 3_600_000
const tidur = (ms) => new Promise((r) => setTimeout(r, ms))

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
  await s.ambil('/api/auth/callback/credentials', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, email, password: SANDI, json: 'true' }).toString() })
  if (!s.punya()) throw new Error(`login gagal untuk ${email}`)
  return s
}
async function api(sesi, metode, path, body) {
  const init = { method: metode, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }
  const res = sesi ? await sesi.ambil(path, init) : await fetch(`${BASE_URL}${path}`, { ...init, redirect: 'manual' })
  const teks = await res.text()
  let json = null
  try {
    json = JSON.parse(teks)
  } catch {
    json = { _bukanJson: true }
  }
  return { status: res.status, json }
}

// Normalisasi transkrip: id & waktu → label stabil (urutan kemunculan), sehingga main vs cabang dapat dibandingkan.
const label = new Map()
const lbl = (v, awalan) => {
  if (!label.has(v)) label.set(v, `${awalan}${label.size + 1}`)
  return label.get(v)
}
const norm = (o) =>
  JSON.parse(JSON.stringify(o, (k, v) => {
    if (typeof v !== 'string') return v
    if (['id', 'voyageId', 'portCallId', 'recordedByUserId'].includes(k)) return lbl(v, 'ID')
    if (['createdAt', 'occurredAt'].includes(k)) return '<waktu>'
    return v
  }))
const transkrip = []
const catat = (langkah, r) => {
  transkrip.push({ langkah, status: r.status, body: norm(r.json) })
  return r
}

async function bersihkan() {
  await adm.tenant.deleteMany({ where: { companyName: { startsWith: TAG } } })
}

try {
  await bersihkan()
  const hash = await bcrypt.hash(SANDI, 10)
  const aktif = new Date(Date.now() + 30 * 24 * JAM)
  const T = await adm.tenant.create({ data: { companyName: `${TAG}Tenant T`, trialEndsAt: aktif } })
  const U = await adm.tenant.create({ data: { companyName: `${TAG}Tenant U`, trialEndsAt: aktif } })
  const W = await adm.tenant.create({ data: { companyName: `${TAG}Tenant W habis`, trialEndsAt: new Date(Date.now() - 24 * JAM) } })
  const user = (t, role, s) => adm.user.create({ data: { tenantId: t.id, email: `veapi-${s}@uji.local`, name: `${TAG}${role}`, password: hash, role, isActive: true } })
  const uAdmin = await user(T, 'ADMIN', 'admin-t')
  const uOp = await user(T, 'OPERATOR', 'operator-t')
  const uMan = await user(T, 'MANAJER_OPERASI', 'manajer-t')
  const uView = await user(T, 'VIEWER', 'viewer-t')
  const uAdminU = await user(U, 'ADMIN', 'admin-u')
  const uAdminW = await user(W, 'ADMIN', 'admin-w')
  const kapal = (t) => adm.vessel.create({ data: { tenantId: t.id, name: `${TAG}Kapal`, gt: 1000 } })
  const kT = await kapal(T)
  const kU = await kapal(U)
  const kW = await kapal(W)
  const vy = (t, k, n, ubah = {}) => adm.voyage.create({ data: { tenantId: t.id, vesselId: k.id, voyageNumber: `${TAG}${n}-${Date.now().toString(36)}`, status: 'CONFIRMED', dataOrigin: 'UJI', ...ubah } })
  const V = await vy(T, kT, 'UTAMA')
  const V2 = await vy(T, kT, 'KEDUA')
  const VD = await vy(T, kT, 'HAPUS', { deletedAt: new Date() })
  const VU = await vy(U, kU, 'TENANT-U')
  const VW = await vy(W, kW, 'TENANT-W')
  const S = { admin: await login(uAdmin.email), op: await login(uOp.email), man: await login(uMan.email), view: await login(uView.email), adminU: await login(uAdminU.email), adminW: await login(uAdminW.email) }
  const lalu = (ms) => new Date(Date.now() - ms).toISOString()
  const P = (v) => `/api/voyages/${v.id}/events`

  console.log('\n[POST] /api/voyages/[id]/events')
  cek('tanpa sesi → 401', catat('post-tanpa-sesi', await api(null, 'POST', P(V), { eventCode: 'EOSP', occurredAt: lalu(JAM) })).status === 401)
  cek('VIEWER → 403', catat('post-viewer', await api(S.view, 'POST', P(V), { eventCode: 'EOSP', occurredAt: lalu(JAM) })).status === 403)
  const r1 = catat('post-operator', await api(S.op, 'POST', P(V), { eventCode: 'EOSP', occurredAt: lalu(3 * JAM), description: 'uji', remarks: 'catatan' }))
  const ev1 = r1.json?.peristiwa
  cek('OPERATOR → 201 {ok, peristiwa} bentuk lengkap, source MANUAL, pencatat & nama pencatat', r1.status === 201 && r1.json.ok === true && ev1 && ['id', 'voyageId', 'portCallId', 'eventCode', 'description', 'occurredAt', 'source', 'remarks', 'recordedByUserId', 'recordedByName', 'createdAt'].every((k) => k in ev1) && Object.keys(ev1).length === 11 && ev1.source === 'MANUAL' && ev1.recordedByUserId === uOp.id && ev1.recordedByName === `${TAG}OPERATOR` && ev1.portCallId === null && ev1.voyageId === V.id, JSON.stringify(r1.json).slice(0, 120))
  cek('ADMIN → 201', catat('post-admin', await api(S.admin, 'POST', P(V), { eventCode: 'ALL_FAST', occurredAt: lalu(2 * JAM) })).status === 201)
  cek('MANAJER_OPERASI → 201', catat('post-manajer', await api(S.man, 'POST', P(V), { eventCode: 'COMPLETED', occurredAt: lalu(JAM) })).status === 201)
  const rKode = catat('post-kode-asing', await api(S.admin, 'POST', P(V), { eventCode: 'ASING', occurredAt: lalu(JAM) }))
  cek('kode peristiwa asing → 400 (pesan daftar pilihan)', rKode.status === 400 && /Kode peristiwa tidak dikenal/.test(JSON.stringify(rKode.json)))
  cek('tanpa eventCode → 400', catat('post-tanpa-kode', await api(S.admin, 'POST', P(V), { occurredAt: lalu(JAM) })).status === 400)
  cek('tanpa occurredAt → 400', catat('post-tanpa-waktu', await api(S.admin, 'POST', P(V), { eventCode: 'EOSP' })).status === 400)
  cek('portCallId tak dikenal → 404', catat('post-portcall-asing', await api(S.admin, 'POST', P(V), { eventCode: 'EOSP', occurredAt: lalu(JAM), portCallId: 'tidak-ada' })).status === 404)
  cek('voyage tenant lain → 404', catat('post-voyage-tenant-lain', await api(S.admin, 'POST', P(VU), { eventCode: 'EOSP', occurredAt: lalu(JAM) })).status === 404)
  cek('voyage terhapus → 404', catat('post-voyage-terhapus', await api(S.admin, 'POST', P(VD), { eventCode: 'EOSP', occurredAt: lalu(JAM) })).status === 404)
  cek('voyage tak ada → 404', catat('post-voyage-tak-ada', await api(S.admin, 'POST', '/api/voyages/tidak-ada/events', { eventCode: 'EOSP', occurredAt: lalu(JAM) })).status === 404)
  cek('tenant trial habis → 403 (penegakan langganan tetap)', catat('post-langganan-habis', await api(S.adminW, 'POST', P(VW), { eventCode: 'EOSP', occurredAt: lalu(JAM) })).status === 403)
  cek('body rusak → 400 (jsonBody → objek kosong)', catat('post-body-rusak', await (async () => {
    const res = await S.admin.ambil(P(V), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{rusak' })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  })()).status === 400)
  const daftar = catat('get-daftar', await api(S.admin, 'GET', P(V)))
  cek('GET daftar: 3 peristiwa, terurut occurredAt MENAIK', daftar.status === 200 && daftar.json.length === 3 && daftar.json.map((e) => e.eventCode).join() === 'EOSP,ALL_FAST,COMPLETED')
  const sejajar = await Promise.all(Array.from({ length: 6 }, (_, i) => api(S.admin, 'POST', P(V2), { eventCode: 'EOSP', occurredAt: lalu((i + 1) * 60_000) })))
  cek('6 POST bersamaan pada voyage sama → semua 201, 6 baris, tanpa deadlock', sejajar.every((r) => r.status === 201) && (await adm.voyageEvent.count({ where: { voyageId: V2.id, deletedAt: null } })) === 6)
  transkrip.push({ langkah: 'post-sejajar', status: sejajar.map((r) => r.status) })

  console.log('\n[DELETE] /api/voyages/[id]/events/[eventId]')
  const D = (v, e) => `/api/voyages/${v.id}/events/${e}`
  cek('tanpa sesi → 401', catat('del-tanpa-sesi', await api(null, 'DELETE', D(V, ev1.id))).status === 401)
  cek('VIEWER → 403', catat('del-viewer', await api(S.view, 'DELETE', D(V, ev1.id))).status === 403)
  cek('voyage salah (peristiwa milik voyage lain) → 404', catat('del-voyage-salah', await api(S.admin, 'DELETE', D(V2, ev1.id))).status === 404)
  cek('tenant lain → 404', catat('del-tenant-lain', await api(S.adminU, 'DELETE', D(V, ev1.id))).status === 404)
  const rd = catat('del-operator', await api(S.op, 'DELETE', D(V, ev1.id)))
  const baris = await adm.voyageEvent.findFirst({ where: { id: ev1.id } })
  cek('OPERATOR → 200 {ok:true}; soft delete (baris tetap, deletedAt terisi)', rd.status === 200 && JSON.stringify(rd.json) === '{"ok":true}' && baris && baris.deletedAt instanceof Date)
  cek('hapus ulang → 404 Peristiwa', catat('del-ulang', await api(S.admin, 'DELETE', D(V, ev1.id))).status === 404)
  cek('peristiwa tak ada → 404', catat('del-tak-ada', await api(S.admin, 'DELETE', D(V, 'tidak-ada'))).status === 404)
  cek('voyage terhapus → 404', catat('del-voyage-terhapus', await api(S.admin, 'DELETE', D(VD, 'apa-saja'))).status === 404)
  const daftar2 = catat('get-daftar-2', await api(S.admin, 'GET', P(V)))
  cek('GET daftar sesudah hapus: peristiwa terhapus tidak tampil', daftar2.status === 200 && daftar2.json.length === 2 && !daftar2.json.some((e) => e.id === ev1.id))

  if (process.env.VE_API_HARAP_K1 === '1') {
    console.log('\n[K1] Route menunggu kunci Voyage (hanya kode K1)')
    const tunggu = async (aksi) => {
      let selesai = null
      const r = await adm.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT "id" FROM "Voyage" WHERE "id" = $1 FOR SHARE', V.id)
        const jalan = aksi().then((x) => {
          selesai = x
        })
        await tidur(1500)
        return { jalan, menunggu: selesai === null }
      }, { timeout: 20_000 })
      await r.jalan
      return { menunggu: r.menunggu, hasil: selesai }
    }
    const k1 = await tunggu(() => api(S.admin, 'POST', P(V), { eventCode: 'SAILED', occurredAt: lalu(JAM) }))
    cek('POST MENUNGGU selama Voyage dipegang FOR SHARE, lalu 201', k1.menunggu && k1.hasil?.status === 201)
    const k2 = await tunggu(() => api(S.admin, 'DELETE', D(V, k1.hasil.json.peristiwa.id)))
    cek('DELETE MENUNGGU selama Voyage dipegang FOR SHARE, lalu 200', k2.menunggu && k2.hasil?.status === 200)
  }
} catch (e) {
  gagal++
  console.log(`❌ Uji gagal dijalankan: ${e?.stack ?? e}`)
} finally {
  if (process.env.VE_API_TRANSKRIP) writeFileSync(process.env.VE_API_TRANSKRIP, JSON.stringify(transkrip, null, 1))
  await bersihkan().catch(() => {})
  await adm.$disconnect()
}
console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
