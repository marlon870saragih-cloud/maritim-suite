// Uji E2E Step 2J — validasi WA-1 lewat jalur HTTP NYATA (sesi login → route → service → DB) terhadap
// server LOKAL yang dijalankan dengan perangkap egress (prisma/wa1-egress-trap.mjs).
//
// Mode `dev` (bawaan) — server `next dev` + flag WA-1 aktif:
//   NODE_OPTIONS="--import $PWD/prisma/wa1-egress-trap.mjs" DATABASE_URL=$U DIRECT_URL=$U \
//   NEXTAUTH_URL=http://localhost:3100 NEXTAUTH_SECRET=<acak> AUTOMATION_MONITORING_ENABLED=true \
//   WA1_INTERNAL_FAKE_TEST_ENABLED=true NEXT_TELEMETRY_DISABLED=1 \
//   AUTOMATION_TENANT_IDS=wa1s2je2etenantaaaaaa01,wa1s2je2etenantbbbbbb02 npx next dev -p 3100 2> server.log
//   COMM_E2E_DB_URL=$U COMM_E2E_BASE_URL=http://localhost:3100 COMM_E2E_SERVER_LOG=server.log \
//     node prisma/check-comm-e2e.mjs
//
// Mode `produksi` — server `next start` LOKAL (NODE_ENV=production) dengan env yang sama, DB sekali pakai:
//   COMM_E2E_MODE=produksi … node prisma/check-comm-e2e.mjs → semua akses WA-1 ditolak (D-12 / TS-14 varian).
//
// Body diharapkan disusun LANGSUNG dari teks PRD WA-1 §11 (bukan dari kode template). DB & server WAJIB
// loopback; tanpa env → DILEWATI (kode 3). Semua tenant ber-id tetap di bawah, dihapus di akhir.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'node:fs'

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
const URL_DB = process.env.COMM_E2E_DB_URL
const BASE = process.env.COMM_E2E_BASE_URL
const MODE = process.env.COMM_E2E_MODE ?? 'dev'
const LOG = process.env.COMM_E2E_SERVER_LOG
if (!URL_DB || !BASE) {
  console.log('DILEWATI — COMM_E2E_DB_URL dan COMM_E2E_BASE_URL wajib diset (DB & server lokal loopback).')
  process.exit(3)
}
const LOOPBACK = ['127.0.0.1', 'localhost', '::1', '[::1]']
const tolak = []
for (const [n, v] of [['COMM_E2E_DB_URL', URL_DB], ['COMM_E2E_BASE_URL', BASE]]) {
  try {
    const u = new URL(v)
    if (!LOOPBACK.includes(u.hostname)) tolak.push(`${n} bukan loopback`)
    if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push(`${n} memuat parameter host`)
  } catch {
    tolak.push(`${n} tak terurai`)
  }
}
if (!['dev', 'produksi'].includes(MODE)) tolak.push('COMM_E2E_MODE harus dev | produksi')
if (tolak.length) {
  console.log(`❌ DITOLAK (DB/server tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })
const ASAL = new URL(BASE).origin

const ID_A = 'wa1s2je2etenantaaaaaa01'
const ID_B = 'wa1s2je2etenantbbbbbb02'
const TAG = 'WA1S2J-'
const SANDI = 'UjiWa1s2jE2e!2026'
const WAKTU = '2026-10-05T02:30:00.000Z'
const FX = 'WA1_TEST_FIXTURE_SUCCESS'
const FX_GAGAL = 'WA1_TEST_FIXTURE_FAIL'
const FX_ULANG = 'WA1_TEST_FIXTURE_RETRY'
const PENGENAL = /TEST_FIXTURE_WA_\d+/
let seq = 0
const uid = () => `${TAG}${++seq}`
let rkSeq = 0
const rk = () => `e2e-${Date.now().toString(36)}-${++rkSeq}`

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
const rekaman = [] // semua respons API (pemeriksaan data sensitif)
async function api(sesi, metode, path, body) {
  const res = await sesi.ambil(`${P}${path}`, {
    method: metode,
    headers: metode === 'POST' ? { origin: ASAL, 'content-type': 'application/json' } : { origin: ASAL },
    body: metode === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })
  const teks = await res.text()
  rekaman.push({ path, teks })
  let json = null
  try {
    json = JSON.parse(teks)
  } catch {
    /* bukan JSON */
  }
  return { status: res.status, json }
}

// ------------------------------------------------------------------ data
async function bersihkan() {
  const ids = [ID_A, ID_B]
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
  await adm.tenant.deleteMany({ where: { id: { in: ids } } })
}
async function dunia(id, nama, peran) {
  const t = await adm.tenant.create({ data: { id, companyName: `${TAG}${nama}` } })
  const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: `MT E2E ${nama}` } })
  const port = await adm.port.create({ data: { tenantId: t.id, name: `Pelabuhan E2E ${nama}`, timezone: 'Asia/Makassar' } })
  const portJkt = await adm.port.create({ data: { tenantId: t.id, name: `Pelabuhan Barat ${nama}`, timezone: 'Asia/Jakarta' } })
  const hash = await bcrypt.hash(SANDI, 10)
  const email = {}
  for (const r of peran) {
    const e = `wa1s2j-${nama.toLowerCase()}-${r.toLowerCase()}@uji.local`
    await adm.user.create({ data: { tenantId: t.id, email: e, name: `${TAG}${nama}-${r}`, password: hash, role: r, isActive: true } })
    email[r] = e
  }
  return { t, kapal, port, portJkt, email }
}
const LAMA = { eta: '2026-10-10', etd: '2026-10-11' }
const BARU = { eta: '2026-10-12', etd: '2026-10-14' }
async function voyage(w, ubah = {}) {
  return adm.voyage.create({
    data: { tenantId: w.t.id, vesselId: w.kapal.id, portId: w.port.id, voyageNumber: uid(), eta: new Date(`${BARU.eta}T00:00:00Z`), etd: new Date(`${BARU.etd}T00:00:00Z`), ...ubah },
  })
}
/** Sumber jadwal: AuditLog UBAH_TANGGAL + sinyal ETA_CHANGED per medan (pola monitoring Step 2). */
async function sumberJadwal(w, medan, { lama = LAMA, baru = BARU, voyageUbah = {} } = {}) {
  const v = await voyage(w, voyageUbah)
  const ambil = (o) => Object.fromEntries(medan.map((m) => [m, o[m]]))
  const a = await adm.auditLog.create({
    data: { tenantId: w.t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', ...ambil(lama) }, newValue: { peristiwa: 'UBAH_TANGGAL', medan, ...ambil(baru) } },
  })
  const s = {}
  for (const m of medan) {
    s[m] = await adm.monitoringSignal.create({
      data: { tenantId: w.t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: uid(), sourceType: 'AUDIT_LOG', sourceRef: a.id, explanation: 'e2e', recommendation: 'e2e', after: { [m]: baru[m] } },
    })
  }
  return { v, a, s, sinyal: s[medan[0]] }
}
async function sumberMilestone(w, eventCode, { voyageUbah = {}, eventUbah = {}, kind = 'OPERATIONAL_EVENT_RECORDED', reviewState = 'OPEN' } = {}) {
  const v = await voyage(w, voyageUbah)
  const e = await adm.voyageEvent.create({ data: { tenantId: w.t.id, voyageId: v.id, eventCode, occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji', ...eventUbah } })
  const sinyal = await adm.monitoringSignal.create({
    data: { tenantId: w.t.id, voyageId: v.id, kind, severity: 'INFO', dedupeKey: uid(), sourceType: 'VOYAGE_EVENT', sourceRef: e.id, reviewState, explanation: 'e2e', recommendation: 'e2e', after: { eventCode, occurredAt: WAKTU } },
  })
  return { v, e, sinyal }
}

// --------------------------------------------- body diharapkan — teks PRD WA-1 §11 (independen dari kode)
const TTD_ID = ['Hormat kami,', 'PT Tribuana Solusi Maritim']
const TTD_EN = ['Regards,', 'PT Tribuana Solusi Maritim']
function harapan(keluarga, bahasa, { kapal, voyage: vn, port, medan = [], waktu }) {
  const id = bahasa === 'ID'
  const kepala = id ? ['[SIMULASI INTERNAL — TIDAK DIKIRIM]'] : ['[INTERNAL SIMULATION — NOT SENT]']
  const vp = id ? `Voyage: ${vn} | Pelabuhan: ${port}` : `Voyage: ${vn} | Port: ${port}`
  const salam = id ? 'Yth. Bapak/Ibu,' : 'Dear Sir/Madam,'
  let judul
  let isi
  if (keluarga === 'SCHEDULE_CHANGE') {
    judul = id ? `Update Jadwal Kapal — ${kapal}` : `Vessel Schedule Update — ${kapal}`
    const baris = ['eta', 'etd'].filter((m) => medan.includes(m)).map((m) =>
      id ? `${m.toUpperCase()}: dari ${LAMA[m]} menjadi ${BARU[m]}.` : `${m.toUpperCase()}: revised from ${LAMA[m]} to ${BARU[m]}.`,
    )
    isi = [id ? `Berikut perubahan jadwal ${kapal}:` : `Please note the following schedule changes for ${kapal}:`, ...baris]
  } else if (keluarga === 'EOSP') {
    judul = id ? `Update Kapal — ${kapal}` : `Vessel Update — ${kapal}`
    isi = [id ? `Milestone EOSP untuk ${kapal} pada kunjungan ${port} tercatat pada ${waktu}.` : `The EOSP milestone for ${kapal} on the ${port} port call was recorded at ${waktu}.`]
  } else if (keluarga === 'ALL_FAST') {
    judul = id ? `Update Sandar — ${kapal}` : `Berthing Update — ${kapal}`
    isi = [id ? `${kapal} — ALL FAST tercatat di ${port} pada ${waktu}.` : `${kapal} — ALL FAST recorded at ${port} at ${waktu}.`]
  } else {
    judul = id ? `Update Keberangkatan — ${kapal}` : `Departure Update — ${kapal}`
    isi = [id ? `${kapal} telah berangkat dari ${port} pada ${waktu}.` : `${kapal} sailed from ${port} at ${waktu}.`]
  }
  return [...kepala, judul, vp, salam, ...isi, ...(id ? TTD_ID : TTD_EN)].join('\n')
}
const SLUG = { SCHEDULE_CHANGE: 'schedule', EOSP: 'eosp', ALL_FAST: 'all_fast', SAILED: 'sailed' }
/** Perbedaan byte pertama (untuk diagnosis bila tak sama). */
function beda(a, b) {
  const x = Buffer.from(a ?? '', 'utf8')
  const y = Buffer.from(b ?? '', 'utf8')
  if (x.equals(y)) return ''
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return `byte ${i}: aktual ${JSON.stringify((a ?? '').slice(Math.max(0, i - 20), i + 30))} ≠ harapan ${JSON.stringify((b ?? '').slice(Math.max(0, i - 20), i + 30))}`
}

// ------------------------------------------------------------------ langkah alur lewat HTTP
const ok200 = (r, ...hasil) => r.status === 200 && r.json?.ok === true && (hasil.length === 0 || hasil.includes(r.json.hasil))
async function siapkanDraf(sesi, signalId, bahasa, fx = FX) {
  const c = await api(sesi, 'POST', '/candidates', { signalId })
  if (!ok200(c, 'SIAP')) return { c }
  const r = await api(sesi, 'POST', `/candidates/${c.json.candidateId}/revisions`, { recipientFixtureId: fx, language: bahasa })
  return { c, r, candidateId: c.json.candidateId, messageId: r.json?.messageId, fp: r.json?.snapshotFingerprint }
}
async function sampaiDisetujui(sAdmin, sPemutus, o) {
  o.pv = await api(sAdmin, 'POST', `/messages/${o.messageId}/preview`, { snapshotFingerprint: o.fp })
  o.ar = await api(sAdmin, 'POST', `/messages/${o.messageId}/approval-request`)
  o.approvalId = o.ar.json?.approvalRequestId
  o.ap = await api(sPemutus, 'POST', `/approvals/${o.approvalId}/approve`, { decisionNote: 'Disetujui uji E2E 2J' })
  return o
}
const detail = async (sesi, mid, q = '') => (await api(sesi, 'GET', `/messages/${mid}${q}`)).json?.data
const riwayat = async (sesi, cid) => (await api(sesi, 'GET', `/candidates/${cid}/history`)).json?.data

try {
  await bersihkan()

  if (MODE === 'produksi') {
    // ================================================================ varian NODE_ENV=production (lokal)
    bagian('P. NODE_ENV=production (server lokal `next start`, DB sekali pakai) — WA-1 harus tertutup total')
    const A = await dunia(ID_A, 'A', ['ADMIN'])
    const src = await sumberMilestone(A, 'EOSP')
    const sA = await login(A.email.ADMIN)
    const hal = await sA.ambil('/automation/communications')
    cek('P1. halaman /automation/communications → 404 (menu & halaman tersembunyi)', hal.status === 404, `HTTP ${hal.status}`)
    const daftar = await api(sA, 'GET', '/candidates')
    cek('P2. GET daftar → 403 ENV_NOT_ALLOWED', daftar.status === 403 && /ENV_NOT_ALLOWED/.test(daftar.json?.error?.message ?? ''), `${daftar.status} ${daftar.json?.error?.message}`)
    const prep = await api(sA, 'POST', '/candidates', { signalId: src.sinyal.id })
    cek('P3. POST Prepare → 403 ENV_NOT_ALLOWED', prep.status === 403 && /ENV_NOT_ALLOWED/.test(prep.json?.error?.message ?? ''), `${prep.status} ${prep.json?.error?.message}`)
    const kirim = await api(sA, 'POST', '/messages/idtidakada0000000000000001/send', { requestKey: rk() })
    cek('P4. POST FAKE Send → 403 ENV_NOT_ALLOWED (gerbang sebelum DB)', kirim.status === 403 && /ENV_NOT_ALLOWED/.test(kirim.json?.error?.message ?? ''), `${kirim.status}`)
    const [c, m, at, ap] = await Promise.all([
      adm.communicationCandidate.count({ where: { tenantId: ID_A } }),
      adm.communicationMessage.count({ where: { tenantId: ID_A } }),
      adm.communicationAttempt.count({ where: { tenantId: ID_A } }),
      adm.tahApprovalRequest.count({ where: { tenantId: ID_A } }),
    ])
    cek('P5. 0 candidate, 0 pesan, 0 attempt, 0 approval tercipta di mode produksi', c + m + at + ap === 0, `${c}/${m}/${at}/${ap}`)
  } else {
    const A = await dunia(ID_A, 'A', ['ADMIN', 'MANAJER_OPERASI', 'OPERATOR'])
    const B = await dunia(ID_B, 'B', ['ADMIN'])
    const sA = await login(A.email.ADMIN)
    const sMo = await login(A.email.MANAJER_OPERASI)
    const sOp = await login(A.email.OPERATOR)
    const sB = await login(B.email.ADMIN)
    const KAPAL = A.kapal.name

    // ============================================================ 1
    bagian('1. Semua event pilot × ID/EN lewat HTTP — Prepare → Revisi → Preview → Approval → FAKE Send → History (TS-01..03, TS-06..08)')
    const KASUS = [
      { ts: 'TS-01', keluarga: 'SCHEDULE_CHANGE', medan: ['eta'] },
      { ts: 'TS-02', keluarga: 'SCHEDULE_CHANGE', medan: ['etd'] },
      { ts: 'TS-03', keluarga: 'SCHEDULE_CHANGE', medan: ['eta', 'etd'] },
      { ts: 'TS-06', keluarga: 'EOSP' },
      { ts: 'TS-07', keluarga: 'ALL_FAST' },
      { ts: 'TS-08', keluarga: 'SAILED' },
    ]
    const bukti = []
    for (const k of KASUS) {
      for (const bahasa of ['ID', 'EN']) {
        const label = `${k.ts} ${k.keluarga}${k.medan ? `(${k.medan.join('+')})` : ''} ${bahasa}`
        // SAILED memakai pelabuhan Asia/Jakarta: membuktikan konversi zona lain (UTC+07:00).
        const jkt = k.keluarga === 'SAILED'
        const src = k.keluarga === 'SCHEDULE_CHANGE' ? await sumberJadwal(A, k.medan) : await sumberMilestone(A, k.keluarga, jkt ? { voyageUbah: { portId: A.portJkt.id } } : {})
        const port = jkt ? A.portJkt.name : A.port.name
        const waktu = jkt ? '2026-10-05 09:30 (UTC+07:00, Asia/Jakarta)' : '2026-10-05 10:30 (UTC+08:00, Asia/Makassar)'
        const harap = harapan(k.keluarga, bahasa, { kapal: KAPAL, voyage: src.v.voyageNumber, port, medan: k.medan, waktu })
        const o = await siapkanDraf(sA, src.sinyal.id, bahasa)
        // TS-03: Prepare dari sinyal ETD (sumber sama) harus menunjuk candidate yang SAMA.
        if (k.medan?.length === 2) {
          const c2 = await api(sA, 'POST', '/candidates', { signalId: src.s.etd.id })
          cek(`${label}: Prepare dari sinyal ETD → candidate SAMA (satu logical update)`, ok200(c2, 'SIAP') && c2.json.candidateId === o.candidateId)
        }
        const d0 = await detail(sA, o.messageId)
        const selisih = beda(d0?.body, harap)
        cek(`${label}: body draf = teks PRD §11 byte-per-byte`, !!d0 && selisih === '', selisih || `${Buffer.byteLength(harap)} byte`)
        cek(`${label}: template ${'wa1.' + SLUG[k.keluarga] + '.' + bahasa + '.v1'}, penerima tersamar di detail bawaan`, d0?.templateId === `wa1.${SLUG[k.keluarga]}.${bahasa}.v1` && d0?.recipientIdentifier === 'TEST•••01')
        await sampaiDisetujui(sA, sMo, o)
        const kirim = await api(sA, 'POST', `/messages/${o.messageId}/send`, { requestKey: rk() })
        const h = await riwayat(sA, o.candidateId)
        const m = h?.pesan?.find((x) => x.id === o.messageId)
        const at = m?.attempts ?? []
        cek(
          `${label}: Preview → Approval (MANAJER_OPERASI) → FAKE_SENT`,
          ok200(o.pv, 'DIPRATINJAU') && ok200(o.ar, 'APPROVAL_DIMINTA') && ok200(o.ap, 'DISETUJUI') && ok200(kirim, 'FAKE_SENT'),
          [o.pv, o.ar, o.ap, kirim].map((r) => r.json?.hasil ?? r.status).join(' → '),
        )
        cek(
          `${label}: History — FAKE_SENT, body snapshot tetap byte-identik, 1 attempt FAKE/simulation/tanpa egress, approval SUCCEEDED`,
          m?.state === 'FAKE_SENT' && beda(m.body, harap) === '' && at.length === 1 && at[0].provider === 'FAKE' && at[0].simulation === true && at[0].externalDelivery === false && m.approval?.status === 'APPROVED' && m.approval?.executionStatus === 'SUCCEEDED',
        )
        const peristiwa = new Set((h?.jejakAudit ?? []).map((j) => j.peristiwa))
        cek(`${label}: jejak audit lengkap (candidate, revisi, pratinjau, approval, klaim, attempt, FAKE_SENT)`, ['WA1_REVISI_DIBUAT', 'WA1_PESAN_FAKE_SENT', 'WA1_ATTEMPT_DIKLAIM'].every((p) => peristiwa.has(p)) && (h?.jejakAudit?.length ?? 0) >= 7, `${h?.jejakAudit?.length} entri`)
        bukti.push({ kasus: label, candidateId: o.candidateId, messageId: o.messageId, attemptId: at[0]?.id, receipt: at[0]?.receipt, byte: Buffer.byteLength(harap) })
      }
    }
    console.log(`  ℹ bukti ID (12 alur): ${JSON.stringify(bukti.map((b) => `${b.kasus} c=${b.candidateId} m=${b.messageId} a=${b.attemptId}`))}`)

    // ============================================================ 2
    bagian('2. Gate negatif lewat HTTP (TS-04, TS-05, TS-09, TS-10, TS-13, TS-18)')
    const hasilPrep = async (sinyalId) => api(sA, 'POST', '/candidates', { signalId: sinyalId })
    const fs = await sumberJadwal(A, ['eta'], { lama: { eta: null } })
    const rFs = await hasilPrep(fs.sinyal.id)
    cek('TS-04 ETA diisi pertama kali → DIBLOKIR SCHEDULE_FIRST_SET', ok200(rFs, 'DIBLOKIR') && rFs.json.alasan === 'SCHEDULE_FIRST_SET', rFs.json?.alasan)
    const cl = await sumberJadwal(A, ['eta'], { baru: { eta: null }, voyageUbah: { eta: null } })
    const rCl = await hasilPrep(cl.sinyal.id)
    cek('TS-05 ETA dikosongkan → DIBLOKIR SCHEDULE_CLEARED', ok200(rCl, 'DIBLOKIR') && rCl.json.alasan === 'SCHEDULE_CLEARED', rCl.json?.alasan)
    const portKosong = await adm.port.create({ data: { tenantId: ID_A, name: 'Pelabuhan Tanpa Zona', timezone: null } })
    const tz1 = await sumberMilestone(A, 'EOSP', { voyageUbah: { portId: portKosong.id } })
    const rTz1 = await hasilPrep(tz1.sinyal.id)
    cek('TS-09 timezone pelabuhan kosong → DITOLAK_PULIH TIMEZONE_MISSING', ok200(rTz1, 'DITOLAK_PULIH') && rTz1.json.alasan === 'TIMEZONE_MISSING', rTz1.json?.alasan)
    const portUtc = await adm.port.create({ data: { tenantId: ID_A, name: 'Pelabuhan Zona Salah', timezone: 'WITA+8' } })
    const tz2 = await sumberMilestone(A, 'ALL_FAST', { voyageUbah: { portId: portUtc.id } })
    const rTz2 = await hasilPrep(tz2.sinyal.id)
    cek('TS-09 varian: timezone bukan IANA → DITOLAK_PULIH TIMEZONE_INVALID', ok200(rTz2, 'DITOLAK_PULIH') && rTz2.json.alasan === 'TIMEZONE_INVALID', rTz2.json?.alasan)
    const del = await sumberMilestone(A, 'SAILED', { eventUbah: { deletedAt: new Date() } })
    const rDel = await hasilPrep(del.sinyal.id)
    const sinyalTetap = await adm.monitoringSignal.findUnique({ where: { id: del.sinyal.id } })
    cek('TS-10 VoyageEvent sumber dihapus sebelum Prepare → DIBLOKIR SOURCE_DELETED; sinyal lama tetap ada', ok200(rDel, 'DIBLOKIR') && rDel.json.alasan === 'SOURCE_DELETED' && !!sinyalTetap, rDel.json?.alasan)
    const fut = await sumberMilestone(A, 'EOSP', { eventUbah: { occurredAt: new Date(Date.now() + 2 * 86_400_000) } })
    const rFut = await hasilPrep(fut.sinyal.id)
    cek('TS-18 occurredAt di masa depan → DITOLAK_PULIH TIME_IN_FUTURE', ok200(rFut, 'DITOLAK_PULIH') && rFut.json.alasan === 'TIME_IN_FUTURE', rFut.json?.alasan)
    const sebelumNonPilot = await adm.communicationCandidate.count({ where: { tenantId: ID_A } })
    const nonPilot = []
    for (const kode of ['NOR_TENDERED', 'COMMENCED']) nonPilot.push([`OPERATIONAL_EVENT_RECORDED ${kode}`, (await sumberMilestone(A, kode)).sinyal])
    const vNp = await voyage(A)
    for (const kind of ['VOYAGE_STATUS_CHANGED', 'DATA_STALE', 'MONITORING_ERROR', 'ACTUAL_DATE_MISSING']) {
      nonPilot.push([kind, await adm.monitoringSignal.create({ data: { tenantId: ID_A, voyageId: vNp.id, kind, severity: 'INFO', dedupeKey: uid(), sourceType: kind === 'MONITORING_ERROR' ? 'SYSTEM' : 'VOYAGE', sourceRef: vNp.id, explanation: 'e2e', recommendation: 'e2e', after: { eventCode: 'EOSP' } } })])
    }
    for (const [nama, s] of nonPilot) {
      const r = await hasilPrep(s.id)
      cek(`TS-13 ${nama} → DITOLAK EVENT_NOT_ALLOWED`, ok200(r, 'DITOLAK') && r.json.alasan === 'EVENT_NOT_ALLOWED' && r.json.candidateId === null, r.json?.alasan)
    }
    cek('TS-13: tidak ada candidate eksternal tercipta untuk 6 sinyal non-pilot', (await adm.communicationCandidate.count({ where: { tenantId: ID_A } })) === sebelumNonPilot)

    // ============================================================ 3
    bagian('3. Gate Send & approval lewat HTTP (TS-11, TS-15, TS-16, TS-17, AC-11)')
    const t16 = await sumberMilestone(A, 'EOSP', { reviewState: 'ACKNOWLEDGED' })
    const o16 = await siapkanDraf(sA, t16.sinyal.id, 'ID')
    await api(sA, 'POST', `/messages/${o16.messageId}/preview`, { snapshotFingerprint: o16.fp })
    const k16 = await api(sA, 'POST', `/messages/${o16.messageId}/send`, { requestKey: rk() })
    cek('TS-16 sinyal ACKNOWLEDGED + Send tanpa approval pesan → DITOLAK APPROVAL_REQUIRED, 0 attempt', ok200(k16, 'DITOLAK') && k16.json.alasan === 'APPROVAL_REQUIRED' && (await adm.communicationAttempt.count({ where: { messageId: o16.messageId } })) === 0, k16.json?.alasan)

    const t11 = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'ALL_FAST')).sinyal.id, 'EN'))
    const ev11 = (await adm.communicationCandidate.findUnique({ where: { id: t11.candidateId } })).sourceRef
    await adm.voyageEvent.update({ where: { id: ev11 }, data: { deletedAt: new Date() } })
    const k11 = await api(sA, 'POST', `/messages/${t11.messageId}/send`, { requestKey: rk() })
    const m11 = await detail(sA, t11.messageId)
    cek('TS-11 sumber dihapus setelah Approve → Send DIBLOKIR SOURCE_DELETED; pesan BLOCKED; 0 attempt', ok200(k11, 'DIBLOKIR') && k11.json.alasan === 'SOURCE_DELETED' && m11?.state === 'BLOCKED' && (m11?.attempts?.length ?? -1) === 0, `${k11.json?.hasil} ${k11.json?.alasan} ${m11?.state}`)

    const j17 = await sumberJadwal(A, ['eta'])
    const t17 = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, j17.sinyal.id, 'ID'))
    await adm.voyage.update({ where: { id: j17.v.id }, data: { eta: new Date('2026-10-20T00:00:00Z') } })
    await adm.auditLog.create({ data: { tenantId: ID_A, tableName: 'Voyage', recordId: j17.v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: BARU.eta }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: '2026-10-20' } } })
    const k17 = await api(sA, 'POST', `/messages/${t17.messageId}/send`, { requestKey: rk() })
    cek('TS-17 jadwal diubah lagi setelah Approve → DIBLOKIR SOURCE_SUPERSEDED, tanpa FAKE_SENT', ok200(k17, 'DIBLOKIR') && k17.json.alasan === 'SOURCE_SUPERSEDED' && (await adm.communicationAttempt.count({ where: { messageId: t17.messageId } })) === 0, `${k17.json?.hasil} ${k17.json?.alasan}`)

    const vAc = await voyage(A, { vesselId: (await adm.vessel.create({ data: { tenantId: ID_A, name: 'MT Akan Diganti' } })).id })
    const eAc = await adm.voyageEvent.create({ data: { tenantId: ID_A, voyageId: vAc.id, eventCode: 'SAILED', occurredAt: new Date(WAKTU), recordedByUserId: 'u-uji' } })
    const sAc = await adm.monitoringSignal.create({ data: { tenantId: ID_A, voyageId: vAc.id, kind: 'OPERATIONAL_EVENT_RECORDED', severity: 'INFO', dedupeKey: uid(), sourceType: 'VOYAGE_EVENT', sourceRef: eAc.id, explanation: 'e2e', recommendation: 'e2e', after: { eventCode: 'SAILED', occurredAt: WAKTU } } })
    const tAc = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, sAc.id, 'ID'))
    await adm.voyage.update({ where: { id: vAc.id }, data: { status: 'CONFIRMED' } })
    const kTakRelevan = await api(sA, 'POST', `/messages/${tAc.messageId}/send`, { requestKey: rk() })
    cek('AC-11 perubahan TAK relevan (status voyage) setelah Approve → tidak membatalkan; FAKE_SENT', ok200(kTakRelevan, 'FAKE_SENT'), kTakRelevan.json?.hasil)
    const tAc2 = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'EOSP')).sinyal.id, 'EN'))
    const vAc2 = await adm.voyage.findUnique({ where: { id: (await adm.communicationCandidate.findUnique({ where: { id: tAc2.candidateId } })).voyageId } })
    await adm.vessel.update({ where: { id: vAc2.vesselId }, data: { name: 'MT E2E A (berganti nama)' } })
    const kRelevan = await api(sA, 'POST', `/messages/${tAc2.messageId}/send`, { requestKey: rk() })
    const mAc2 = await detail(sA, tAc2.messageId)
    cek('AC-11 fakta relevan (nama kapal) berubah setelah Approve → PERLU_TINJAUAN APPROVAL_STALE; pesan NEEDS_REVIEW; 0 attempt', ok200(kRelevan, 'PERLU_TINJAUAN') && kRelevan.json.alasan === 'APPROVAL_STALE' && mAc2?.state === 'NEEDS_REVIEW' && mAc2?.attempts?.length === 0, `${kRelevan.json?.hasil} ${kRelevan.json?.alasan}`)
    await adm.vessel.update({ where: { id: vAc2.vesselId }, data: { name: KAPAL } })

    const t15 = await sampaiDisetujui(sA, sA, await siapkanDraf(sA, (await sumberMilestone(A, 'SAILED')).sinyal.id, 'EN'))
    cek('Approval WA_INTERNAL_FAKE_TEST setuju-sendiri (AC-14, satu admin) → DISETUJUI (kebijakan 2D, non-produksi)', ok200(t15.ap, 'DISETUJUI'), t15.ap.json?.hasil)
    const apr15 = await adm.tahApprovalRequest.findUnique({ where: { id: t15.approvalId } })
    cek('TS-15/AC-15: kelas approval WA tetap INTERNAL_WRITE — EXTERNAL_COMMUNICATION tak dipakai (SELF_APPROVAL_FORBIDDEN dijaga suite comm-approval-db #21)', apr15?.actionRisk === 'INTERNAL_WRITE' && apr15?.kind === 'WA_INTERNAL_FAKE_TEST', `${apr15?.kind}/${apr15?.actionRisk}`)

    // ============================================================ 4
    bagian('4. Retry & batas percobaan lewat HTTP')
    const r1 = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'EOSP')).sinyal.id, 'ID', FX_ULANG))
    const r1a = await api(sA, 'POST', `/messages/${r1.messageId}/send`, { requestKey: rk() })
    const r1b = await api(sA, 'POST', `/messages/${r1.messageId}/send`, { requestKey: rk() })
    const m1 = await detail(sA, r1.messageId)
    cek('FAIL_ONCE_THEN_SUCCESS: attempt #1 FAKE_FAILED → retry manual #2 FAKE_SENT, snapshot sama', ok200(r1a, 'FAKE_FAILED') && ok200(r1b, 'FAKE_SENT') && m1?.state === 'FAKE_SENT' && m1?.attempts?.length === 2 && r1b.json.attemptNo === 2, `${r1a.json?.hasil} → ${r1b.json?.hasil}; ${m1?.attempts?.map((a) => `#${a.attemptNo}:${a.state}`).join(' ')}`)
    const r5 = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'ALL_FAST')).sinyal.id, 'EN', FX_GAGAL))
    const hasil5 = []
    for (let i = 0; i < 5; i++) hasil5.push((await api(sA, 'POST', `/messages/${r5.messageId}/send`, { requestKey: rk() })).json?.hasil)
    const ke6 = await api(sA, 'POST', `/messages/${r5.messageId}/send`, { requestKey: rk() })
    const n5 = await adm.communicationAttempt.count({ where: { messageId: r5.messageId } })
    cek('FAIL_BEFORE_ACCEPT: 5 percobaan FAKE_FAILED; ke-6 → PERCOBAAN_HABIS EXECUTION_ATTEMPTS_EXHAUSTED; tetap 5 attempt', hasil5.every((h) => h === 'FAKE_FAILED') && ok200(ke6, 'PERCOBAAN_HABIS') && n5 === 5, `${hasil5.join(',')} → ${ke6.json?.hasil}; ${n5} attempt`)

    // ============================================================ 5
    bagian('5. Idempotensi & duplikasi lewat HTTP bersamaan (TS-12 / AC-12)')
    const sumDup = await sumberMilestone(A, 'SAILED')
    const prepParalel = await Promise.all(Array.from({ length: 5 }, () => api(sA, 'POST', '/candidates', { signalId: sumDup.sinyal.id })))
    const idsPrep = new Set(prepParalel.map((r) => r.json?.candidateId))
    cek('5 Prepare bersamaan (klik ganda / dua tab) → SATU candidate', idsPrep.size === 1 && prepParalel.every((r) => ok200(r, 'SIAP')), `${idsPrep.size} id`)
    const oDup = await sampaiDisetujui(sA, sMo, await (async () => {
      const r = await api(sA, 'POST', `/candidates/${[...idsPrep][0]}/revisions`, { recipientFixtureId: FX, language: 'ID' })
      return { candidateId: [...idsPrep][0], messageId: r.json?.messageId, fp: r.json?.snapshotFingerprint }
    })())
    const kirimParalel = await Promise.all(Array.from({ length: 6 }, () => api(sA, 'POST', `/messages/${oDup.messageId}/send`, { requestKey: rk() })))
    const sukses = kirimParalel.filter((r) => ok200(r, 'FAKE_SENT') && r.json.ulangan === false).length
    const nDup = await adm.communicationAttempt.count({ where: { messageId: oDup.messageId } })
    cek('6 FAKE Send bersamaan (kunci berbeda) → tepat 1 FAKE_SENT, 1 attempt; sisanya DITOLAK/CONFLICT terkendali', sukses === 1 && nDup === 1 && kirimParalel.every((r) => r.status === 200 || r.status === 409), kirimParalel.map((r) => r.json?.hasil ?? r.status).join(','))
    const kunci = rk()
    const oRep = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'EOSP')).sinyal.id, 'EN'))
    const rep = await Promise.all([1, 2, 3].map(() => api(sA, 'POST', `/messages/${oRep.messageId}/send`, { requestKey: kunci })))
    const idsAt = new Set(rep.filter((r) => r.status === 200).map((r) => r.json?.attemptId))
    cek('replay requestKey SAMA (bersamaan) → 1 attempt; semua menunjuk attempt yang sama', (await adm.communicationAttempt.count({ where: { messageId: oRep.messageId } })) === 1 && idsAt.size === 1, rep.map((r) => r.json?.hasil ?? r.status).join(','))
    const setelah = await api(sA, 'POST', `/messages/${oRep.messageId}/send`, { requestKey: rk() })
    cek('kunci BARU untuk pesan logis yang sudah FAKE_SENT → DITOLAK ALREADY_FAKE_SENT', ok200(setelah, 'DITOLAK') && setelah.json.alasan === 'ALREADY_FAKE_SENT', setelah.json?.alasan)

    // ============================================================ 6
    bagian('6. Cancel lewat HTTP (AC-18) + History')
    const cDraf = await siapkanDraf(sA, (await sumberMilestone(A, 'EOSP')).sinyal.id, 'ID')
    const tanpaAlasan = await api(sA, 'POST', `/messages/${cDraf.messageId}/cancel`, { cancelNote: ' ' })
    cek('Cancel tanpa alasan → 400 VALIDATION, tetap DRAFT', tanpaAlasan.status === 400 && (await detail(sA, cDraf.messageId))?.state === 'DRAFT', `${tanpaAlasan.status}`)
    const kasusBatal = [['DRAFT', cDraf]]
    const cPrev = await siapkanDraf(sA, (await sumberMilestone(A, 'ALL_FAST')).sinyal.id, 'EN')
    await api(sA, 'POST', `/messages/${cPrev.messageId}/preview`, { snapshotFingerprint: cPrev.fp })
    kasusBatal.push(['PREVIEWED', cPrev])
    kasusBatal.push(['APPROVED', await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'SAILED')).sinyal.id, 'ID'))])
    const cGagal = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, 'EOSP')).sinyal.id, 'EN', FX_GAGAL))
    await api(sA, 'POST', `/messages/${cGagal.messageId}/send`, { requestKey: rk() })
    kasusBatal.push(['FAKE_FAILED', cGagal])
    for (const [st, o] of kasusBatal) {
      const r = await api(sMo, 'POST', `/messages/${o.messageId}/cancel`, { cancelNote: `Batal uji E2E dari ${st}` })
      const m = await detail(sA, o.messageId)
      const kirim = await api(sA, 'POST', `/messages/${o.messageId}/send`, { requestKey: rk() })
      cek(`Cancel ${st} (oleh MANAJER_OPERASI) → CANCELED_BY_USER; alasan tercatat; Send sesudahnya ditolak`, ok200(r, 'DIBATALKAN') && m?.state === 'CANCELED' && m?.reasonCode === 'CANCELED_BY_USER' && m?.pembatalan?.catatan === `Batal uji E2E dari ${st}` && ok200(kirim, 'DITOLAK'), `${r.json?.hasil} ${m?.state} kirim=${kirim.json?.hasil}/${kirim.json?.alasan}`)
    }
    const hBatal = await riwayat(sA, kasusBatal[2][1].candidateId)
    cek('History memuat entri pembatalan dengan alasan & actor', (hBatal?.jejakAudit ?? []).some((j) => j.newValue?.catatan === 'Batal uji E2E dari APPROVED' && j.userId))
    const tolakSent = await api(sA, 'POST', `/messages/${bukti[0].messageId}/cancel`, { cancelNote: 'coba batal setelah terkirim' })
    cek('Cancel pesan FAKE_SENT → DITOLAK CANCEL_NOT_ALLOWED', ok200(tolakSent, 'DITOLAK') && tolakSent.json.kode === 'CANCEL_NOT_ALLOWED', tolakSent.json?.kode)
    let pemenangSah = 0
    const balapan = []
    for (let i = 0; i < 6; i++) {
      const o = await sampaiDisetujui(sA, sMo, await siapkanDraf(sA, (await sumberMilestone(A, i % 2 ? 'EOSP' : 'SAILED')).sinyal.id, 'ID'))
      // Urutan berangkat bergantian (dan Send diberi jeda 0–30 ms) supaya kedua cabang pemenang ikut teruji.
      const batal = () => api(sMo, 'POST', `/messages/${o.messageId}/cancel`, { cancelNote: 'balapan cancel vs send' })
      const kirim = () => api(sA, 'POST', `/messages/${o.messageId}/send`, { requestKey: rk() })
      const tunda = (ms, fn) => new Promise((r) => setTimeout(r, ms)).then(fn)
      const [rc, rs] = i % 2 === 0 ? await Promise.all([tunda(i * 5, batal), kirim()]) : await Promise.all([batal(), tunda(i * 5, kirim)])
      const m = await adm.communicationMessage.findUnique({ where: { id: o.messageId } })
      const batalMenang = ok200(rc, 'DIBATALKAN') && m.state === 'CANCELED' && m.successKey === null && !ok200(rs, 'FAKE_SENT')
      const kirimMenang = ok200(rs, 'FAKE_SENT') && m.state === 'FAKE_SENT' && !ok200(rc, 'DIBATALKAN')
      if (batalMenang !== kirimMenang) pemenangSah++
      balapan.push(`${rc.json?.hasil ?? rc.status}/${rs.json?.hasil ?? rs.status}→${m.state}`)
    }
    cek('AC-18: 6× Cancel ∥ FAKE Send bersamaan → selalu TEPAT SATU pemenang; tak pernah CANCELED + terkirim', pemenangSah === 6, balapan.join(' '))
    console.log(`  ℹ pemenang balapan: Send ${balapan.filter((b) => b.endsWith('FAKE_SENT')).length}×, Cancel ${balapan.filter((b) => b.endsWith('CANCELED')).length}× (kedua cabang juga diuji deterministik di comm-cancel-db #26/#27)`)

    // ============================================================ 7
    bagian('7. Isolasi tenant & otorisasi lewat HTTP')
    const target = bukti[3]
    const lintas = await Promise.all([
      api(sB, 'GET', `/candidates/${target.candidateId}/history`),
      api(sB, 'GET', `/messages/${target.messageId}?recipient=full`),
      api(sB, 'POST', `/messages/${target.messageId}/cancel`, { cancelNote: 'lintas tenant' }),
      api(sB, 'POST', `/messages/${target.messageId}/send`, { requestKey: rk() }),
    ])
    cek('tenant B → riwayat/detail/cancel/send milik A: semuanya 404 tanpa data A', lintas.every((r) => r.status === 404) && !lintas.some((r) => JSON.stringify(r.json).includes(KAPAL)), lintas.map((r) => r.status).join(','))
    const daftarB = await api(sB, 'GET', '/candidates?take=50')
    cek('daftar tenant B tidak memuat satu pun candidate A', ok200(daftarB) && !daftarB.json.data.items.some((c) => bukti.some((b) => b.candidateId === c.id)))
    const op = await Promise.all([api(sOp, 'GET', '/candidates'), api(sOp, 'POST', `/messages/${target.messageId}/cancel`, { cancelNote: 'operator' })])
    cek('OPERATOR → 403 untuk baca & aksi', op.every((r) => r.status === 403), op.map((r) => r.status).join(','))
    const tanpaSesi = await fetch(`${BASE}${P}/candidates`, { redirect: 'manual' })
    cek('tanpa sesi → 401', tanpaSesi.status === 401, `${tanpaSesi.status}`)
    const utuh = await detail(sA, target.messageId, '?recipient=full')
    cek('pengenal utuh hanya atas permintaan eksplisit ?recipient=full (pengguna berwenang)', utuh?.recipientIdentifier === 'TEST_FIXTURE_WA_001')

    // ============================================================ 8
    bagian('8. Bukti tidak ada WhatsApp nyata / egress')
    const semuaAt = await adm.communicationAttempt.findMany({ where: { tenantId: { in: [ID_A, ID_B] } }, select: { provider: true, simulation: true, externalDelivery: true, receipt: true } })
    cek(`${semuaAt.length} attempt: provider FAKE, simulation=true, externalDelivery=false, receipt fake_…`, semuaAt.length >= 20 && semuaAt.every((a) => a.provider === 'FAKE' && a.simulation === true && a.externalDelivery === false && (a.receipt === null || /^fake_/.test(a.receipt))), `${semuaAt.length} attempt`)
    const POLA_META = /graph\.facebook|whatsapp\.(com|net)|wa\.me\/|api\.twilio|messagebird|360dialog/i
    const bocorMeta = rekaman.filter((r) => POLA_META.test(r.teks))
    cek(`respons API (${rekaman.length}) tanpa host/URL provider WhatsApp`, rekaman.length > 100 && bocorMeta.length === 0, bocorMeta.map((r) => r.path).join(' | '))
    const bocorPengenal = rekaman.filter((r) => PENGENAL.test(r.teks) && !/[?&]recipient=full\b/.test(r.path))
    cek('respons API tanpa pengenal utuh kecuali ?recipient=full eksplisit', bocorPengenal.length === 0, bocorPengenal.map((r) => r.path).join(' | '))
    if (LOG && existsSync(LOG)) {
      const log = readFileSync(LOG, 'utf8')
      cek('log server: perangkap egress AKTIF di proses server', /\[WA1-EGRESS\] TRAP-AKTIF/.test(log))
      const blok = log.split('\n').filter((l) => l.includes('[WA1-EGRESS] BLOCKED'))
      // Satu-satunya egress yang dikenal = unduhan font `next/font/google` oleh `next dev` saat mengompilasi
      // root layout (src/app/layout.tsx, sudah ada sebelum WA-1; di build produksi terjadi saat build). Itu
      // tetap DIBLOKIR perangkap dan dilaporkan; host LAIN apa pun = gagal.
      const FONT = /^(fonts\.googleapis\.com|fonts\.gstatic\.com):443$/
      const host = (l) => l.replace(/^.*BLOCKED \w+ /, '').replace(/ pid=.*$/, '')
      const lain = blok.filter((l) => !FONT.test(host(l)))
      cek('log server: 0 upaya koneksi keluar ke host selain unduhan font next/font (semua tetap DIBLOKIR)', lain.length === 0, lain.slice(0, 5).join(' | '))
      console.log(`  ℹ upaya egress yang diblokir perangkap: ${blok.length} (host: ${[...new Set(blok.map(host))].join(', ') || '—'})`)
      cek('log server: 0 upaya koneksi ke host provider WhatsApp/Meta', !blok.some((l) => POLA_META.test(l)))
      cek('log server: tanpa pengenal penerima utuh & tanpa host provider WhatsApp', !PENGENAL.test(log) && !POLA_META.test(log))
    } else {
      cek('log server tersedia untuk diperiksa (COMM_E2E_SERVER_LOG)', false, 'COMM_E2E_SERVER_LOG tidak diset/tidak ada')
    }
  }
} catch (e) {
  gagal++
  console.log(`  ❌ PENGECUALIAN — ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`)
} finally {
  await bersihkan().catch((e) => console.log(`  ⚠ pembersihan gagal: ${e?.message}`))
  await adm.$disconnect()
}

console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
