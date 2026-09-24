// Uji HTTP + DB buku besar TAH pada Vessel Call Intake — PRD-005 Step 3B.
//
// Butuh `npm run dev` + database dev yang sama, dengan (server DAN skrip ini):
//   AUTOMATION_MONITORING_ENABLED=true
//   AUTOMATION_TENANT_IDS=<tenant A>,<tenant X>   (dua tenant ber-akses Hub → uji isolasi)
//   VESSEL_CALL_INTAKE_ENABLED=true
//   VESSEL_CALL_INTAKE_EXTRACTOR=FAKE             (tanpa jaringan / LLM — WAJIB)
//   OPENROUTER_API_KEY TIDAK diset                (bukti tak ada panggilan penyedia)
//   OPENROUTER_SPK_MODEL=anthropic/legacy-probe   (membedakan model lama vs TAH_INTAKE_MODEL)
//
// Mode (server di-restart per mode dengan env yang sesuai):
//   node prisma/check-tah-ledger-api.mjs                  TAH_CORE_ENABLED=true,  TAH_INTAKE_MODEL tak diset
//   node prisma/check-tah-ledger-api.mjs --tah-off        TAH_CORE_ENABLED tak diset (nol baris ledger)
//   node prisma/check-tah-ledger-api.mjs --model-verified TAH_CORE_ENABLED=true,  TAH_INTAKE_MODEL=anthropic/claude-sonnet-4.5
//   node prisma/check-tah-ledger-api.mjs --model-pending  TAH_CORE_ENABLED=true,  TAH_INTAKE_MODEL=anthropic/claude-sonnet-5
//
// Skrip ini MENULIS ke database dev (tag `P5S3B-`) dan menghapusnya lagi di akhir, termasuk
// saat gagal. Uji kegagalan ledger MENGGANTI NAMA tabel TAH sesaat (hanya DB dev/throwaway!)
// dan selalu memulihkannya di blok finally.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const MODE = process.argv.includes('--tah-off') ? 'OFF' : process.argv.includes('--model-verified') ? 'VERIFIED' : process.argv.includes('--model-pending') ? 'PENDING' : 'ON'
const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = 'P5S3B-'
const SANDI = 'UjiP5s3bLedger!2026'
const ALLOW = (process.env.AUTOMATION_TENANT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const ACAK = Date.now().toString(36)
const SENTINEL = 'SNTLQ'

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

// ---------------------------------------------------------------- HTTP
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
async function baca(res) {
  const teks = await res.text()
  let json = {}
  try {
    json = JSON.parse(teks)
  } catch {
    json = { _teks: teks }
  }
  return { status: res.status, json, teks }
}
async function kirim(sesi, text) {
  const form = new FormData()
  form.set('text', text)
  form.set('saveOriginal', 'false')
  form.set('confirmReprocess', 'false')
  return baca(await sesi.ambil('/api/automation/intakes', { method: 'POST', body: form }))
}
const api = async (sesi, metode, path, body) =>
  baca(await sesi.ambil(path, { method: metode, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))

const palsu = (obj, awalan = 'FAKE-AI') => `[[${awalan}:${Buffer.from(JSON.stringify(obj)).toString('base64url')}]]`
const hariDepan = (n) => new Date(Date.now() + n * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10)

// ---------------------------------------------------------------- data & pembersihan
const D = { users: [], intakes: new Set(), runs: new Set(), mulai: new Date() }

async function jalanUntukHash(tenantId, inputHash) {
  const rows = await prisma.agentRun.findMany({ where: { tenantId, inputHash }, orderBy: { startedAt: 'asc' }, include: { modelCalls: { orderBy: { seq: 'asc' } } } })
  for (const r of rows) D.runs.add(r.id)
  return rows
}
async function hashIntake(id) {
  return (await prisma.vesselCallIntake.findFirst({ where: { id }, select: { inputHash: true } }))?.inputHash ?? null
}
const hitungLedger = async () => ({ run: await prisma.agentRun.count(), panggilan: await prisma.agentModelCall.count() })

async function siapkan() {
  if (process.env.AUTOMATION_MONITORING_ENABLED !== 'true' || ALLOW.length < 2) throw new Error('Setel AUTOMATION_MONITORING_ENABLED=true dan DUA id di AUTOMATION_TENANT_IDS.')
  if (process.env.VESSEL_CALL_INTAKE_ENABLED !== 'true' || process.env.VESSEL_CALL_INTAKE_EXTRACTOR !== 'FAKE') throw new Error('Uji ini WAJIB memakai VESSEL_CALL_INTAKE_EXTRACTOR=FAKE (tanpa penyedia).')
  if (process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY harus TIDAK diset untuk uji ini.')
  D.A = await prisma.tenant.findUnique({ where: { id: ALLOW[0] } })
  D.X = await prisma.tenant.findUnique({ where: { id: ALLOW[1] } })
  if (!D.A || !D.X) throw new Error('Tenant allowlist tidak ada di DB dev.')
  const hash = await bcrypt.hash(SANDI, 10)
  const buat = async (tenantId, n) => {
    const u = await prisma.user.create({ data: { tenantId, email: `p5s3b-${n}-${ACAK}@uji.local`, name: `${TAG}${n}`, password: hash, role: 'ADMIN', isActive: true } })
    D.users.push(u)
    return u
  }
  D.uA = await buat(D.A.id, 'a')
  D.uA2 = await buat(D.A.id, 'a2')
  D.uX = await buat(D.X.id, 'x')
  D.sA = await login(D.uA.email)
  D.sA2 = await login(D.uA2.email)
  D.sX = await login(D.uX.email)
}

async function bersihkan() {
  const ids = [...D.intakes]
  const semuaRun = await prisma.agentRun.findMany({ where: { OR: [{ id: { in: [...D.runs] } }, { subjectId: { in: ids } }, { triggeredByUserId: { in: D.users.map((u) => u.id) } }] }, select: { id: true } })
  const runIds = semuaRun.map((r) => r.id)
  await prisma.auditLog.deleteMany({ where: { OR: [{ tableName: 'AgentRun', recordId: { in: runIds } }, { tableName: 'VesselCallIntake', recordId: { in: ids } }, { userId: { in: D.users.map((u) => u.id) } }] } })
  await prisma.agentRun.deleteMany({ where: { id: { in: runIds } } }) // AgentModelCall ikut (CASCADE)
  await prisma.vesselCallIntake.deleteMany({ where: { id: { in: ids } } })
  await prisma.usageEvent.deleteMany({ where: { userId: { in: D.users.map((u) => u.id) } } })
  await prisma.securityEvent.deleteMany({ where: { identifier: { in: D.users.map((u) => u.id) } } })
  await prisma.user.deleteMany({ where: { id: { in: D.users.map((u) => u.id) } } })
  const sisa = (await prisma.agentRun.count({ where: { id: { in: runIds } } })) + (await prisma.user.count({ where: { name: { startsWith: TAG } } }))
  info(`bersih: ${runIds.length} run, ${ids.length} intake, ${D.users.length} pengguna uji dihapus; sisa bertanda = ${sisa}`)
  return sisa === 0
}

// ---------------------------------------------------------------- skenario
const usulanBaru = (n) => ({
  classification: 'NEW_NOMINATION',
  vessels: [{ name: `MV ${SENTINEL} KAPAL ${n}` }],
  portName: `${SENTINEL} PELABUHAN`,
  principalName: `PT ${SENTINEL} PRINCIPAL`,
  eta: hariDepan(10),
  clientReference: `${SENTINEL}-REF-${n}`,
  contact: { name: `${SENTINEL} Narahubung`, email: `${SENTINEL.toLowerCase()}@contoh.invalid`, phone: '+62-811-0000' },
  // 7654.5: titik desimal tak pernah muncul di hash heksadesimal (hindari positif palsu).
  cargoes: [{ name: `${SENTINEL} BATUBARA`, quantity: 7654.5, unit: 'MT', operation: 'LOAD' }],
})
const teksSumber = (n, penanda) =>
  `Nominasi kapal MV ${SENTINEL} KAPAL ${n} ke ${SENTINEL} PELABUHAN, principal PT ${SENTINEL} PRINCIPAL, ref ${SENTINEL}-REF-${n}. DOK${SENTINEL}ISI-${ACAK}-${n}\n${penanda}`

async function modeOn(expectedModel) {
  console.log(`\n[ON] TAH Core aktif — model yang diharapkan: ${expectedModel}`)
  const awalPemakaian = await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: 'INTAKE_EXTRACTED' } })
  let intakeBaru = 0

  // 1. sukses
  const r1 = await kirim(D.sA, teksSumber(1, palsu(usulanBaru(1))))
  cek('submit sukses → 201 NEEDS_REVIEW (perilaku intake lama)', r1.status === 201 && r1.json.intake?.status === 'NEEDS_REVIEW', `${r1.status}`)
  const it1 = r1.json.intake
  if (it1?.id) D.intakes.add(it1.id), intakeBaru++
  const h1 = await hashIntake(it1?.id)
  const j1 = await jalanUntukHash(D.A.id, h1)
  const run1 = j1[0]
  cek('tepat SATU AgentRun untuk ekstraksi ini', j1.length === 1, `${j1.length}`)
  cek('run: SUCCEEDED / PROPOSAL_CREATED / INTAKE / EXTRACT / HUMAN', run1?.status === 'SUCCEEDED' && run1?.outcome === 'PROPOSAL_CREATED' && run1?.agentKey === 'INTAKE' && run1?.runType === 'EXTRACT' && run1?.triggerType === 'HUMAN')
  cek('run: versi agen = vessel-call-extract/1, pemicu = pengaju', run1?.agentVersion === 'vessel-call-extract/1' && run1?.triggeredByUserId === D.uA.id)
  cek('run: subjek = VesselCallIntake:<id>, inputHash = hash intake', run1?.subjectType === 'VesselCallIntake' && run1?.subjectId === it1?.id && run1?.inputHash === h1 && run1?.inputKind === 'TEXT')
  cek('run: finishedAt/durationMs terisi, bukan terlambat, tanpa galat', !!run1?.finishedAt && run1?.durationMs >= 0 && run1?.lateCompletion === false && run1?.errorCode === null)
  cek('run: outputHash sha256, ringkasan teks "INTAKE …"', /^[0-9a-f]{64}$/.test(run1?.outputHash ?? '') && /^INTAKE /.test(run1?.resultSummary ?? ''))
  cek('run.result = ringkasan Q3 (nama field, hitungan)', Array.isArray(run1?.result?.fieldTerisi) && run1?.result?.classification === it1?.classification && run1?.result?.jumlahKapal === 1 && run1?.result?.jumlahCargo === 1)
  const mc = run1?.modelCalls ?? []
  cek('tepat 1 AgentModelCall (seq 1)', mc.length === 1 && mc[0].seq === 1)
  cek('model call: provider FAKE, requestedModel sesuai resolusi', mc[0]?.provider === 'FAKE' && mc[0]?.requestedModel === expectedModel, mc[0]?.requestedModel)
  cek('model call: served/id/usage terekam', mc[0]?.servedModel === 'fake/deterministic' && mc[0]?.providerRequestId === 'fake-req-1' && mc[0]?.inputTokens === 120 && mc[0]?.outputTokens === 30)
  cek('model call: identitas prompt & skema', mc[0]?.promptId === 'vessel-call-extract' && mc[0]?.promptVersion === '1' && /^[0-9a-f]{64}$/.test(mc[0]?.promptHash ?? '') && mc[0]?.schemaId === 'isi_intake_kunjungan')
  cek('model call: params hanya daftar izin', Object.keys(mc[0]?.params ?? {}).every((k) => ['temperature', 'toolChoice', 'pdfEngine', 'timeoutMs', 'maxTokens'].includes(k)))
  cek('model call: biaya null (belum diverifikasi)', mc[0]?.costAmount === null && mc[0]?.costSource === null)

  // 2. privasi: sentinel tak ada di tabel TAH / audit AgentRun
  const ledgerTeks = JSON.stringify(await prisma.agentRun.findMany({ where: { tenantId: D.A.id }, include: { modelCalls: true } }))
  const auditTeks = JSON.stringify(await prisma.auditLog.findMany({ where: { tenantId: D.A.id, tableName: 'AgentRun' } }))
  cek(`privasi: nilai/dokumen/kontak (${SENTINEL}) TIDAK ada di AgentRun/AgentModelCall`, !new RegExp(SENTINEL, 'i').test(ledgerTeks) && !/7654\.5|contoh\.invalid|\+62-811/.test(ledgerTeks))
  cek('privasi: audit AgentRun tanpa payload', auditTeks.length > 2 && !new RegExp(SENTINEL, 'i').test(auditTeks))
  cek('privasi: tak ada kunci/prompt/respons mentah di ledger', !/sk-or|Bearer|Anda membaca|tool_calls|choices/.test(ledgerTeks))
  cek('kontrol: nilai TETAP di VesselCallIntake (sumber kebenaran fitur)', JSON.stringify(it1?.proposal ?? {}).includes(SENTINEL))

  // 3. dua percobaan dalam satu run
  const r2 = await kirim(D.sA, teksSumber(2, palsu(usulanBaru(2), 'FAKE-AI-RETRY')))
  if (r2.json.intake?.id) D.intakes.add(r2.json.intake.id), intakeBaru++
  const j2 = await jalanUntukHash(D.A.id, await hashIntake(r2.json.intake?.id))
  const c2 = j2[0]?.modelCalls ?? []
  cek('RETRY: 201, SATU run SUCCEEDED dengan DUA AgentModelCall', r2.status === 201 && j2.length === 1 && j2[0].status === 'SUCCEEDED' && c2.length === 2, `${r2.status} runs=${j2.length} calls=${c2.length}`)
  cek('RETRY: seq1 ERROR AI_UNAVAILABLE (plugin), seq2 OK', c2[0]?.seq === 1 && c2[0]?.status === 'ERROR' && c2[0]?.errorCode === 'AI_UNAVAILABLE' && c2[0]?.params?.pdfEngine === 'native' && c2[1]?.seq === 2 && c2[1]?.status === 'OK')

  // 4. kegagalan ekstraksi → FAILED + galat HTTP lama
  for (const [penanda, kode, statusPanggilan] of [['TIMEOUT', 'AI_TIMEOUT', 'TIMEOUT'], ['UNAVAILABLE', 'AI_UNAVAILABLE', 'ERROR'], ['BAD', 'AI_BAD_RESPONSE', 'OK']]) {
    const teks = `Permintaan uji ${TAG}${penanda}-${ACAK} [[FAKE-AI:${penanda}]]`
    const r = await kirim(D.sA, teks)
    cek(`${penanda}: HTTP 502 ${kode} tanpa pesan penyedia (sama seperti sebelum 3B)`, r.status === 502 && r.json.error?.details?.code === kode && !r.teks.includes('RAHASIA-PENYEDIA'), `${r.status}`)
    const runs = await prisma.agentRun.findMany({ where: { tenantId: D.A.id, triggeredByUserId: D.uA.id, status: 'FAILED', errorCode: kode, startedAt: { gte: D.mulai } }, include: { modelCalls: true }, orderBy: { startedAt: 'desc' }, take: 1 })
    for (const x of runs) D.runs.add(x.id)
    const f = runs[0]
    cek(`${penanda}: run FAILED ${kode}, tanpa subjek, percobaan ${statusPanggilan}`, !!f && f.subjectId === null && f.outcome === null && f.modelCalls.length === 1 && f.modelCalls[0].status === statusPanggilan)
    const intakeAda = await prisma.vesselCallIntake.count({ where: { tenantId: D.A.id, inputHash: f?.inputHash ?? '-' } })
    cek(`${penanda}: tak ada baris intake (tak ada data dibuat)`, intakeAda === 0)
  }
  const rahasia = JSON.stringify(await prisma.agentRun.findMany({ where: { tenantId: D.A.id }, include: { modelCalls: true } }))
  cek('pesan penyedia palsu RAHASIA-PENYEDIA tak tersimpan di ledger', !rahasia.includes('RAHASIA'))

  // 5. NOT_RELEVANT (tanpa penanda) → tetap sukses
  const r5 = await kirim(D.sA, `Pesan biasa tanpa permintaan kapal ${TAG}${ACAK}`)
  if (r5.json.intake?.id) D.intakes.add(r5.json.intake.id), intakeBaru++
  const j5 = await jalanUntukHash(D.A.id, await hashIntake(r5.json.intake?.id))
  cek('tanpa penanda → 201, run SUCCEEDED, result.classification = klasifikasi intake', r5.status === 201 && j5[0]?.status === 'SUCCEEDED' && j5[0]?.result?.classification === r5.json.intake?.classification)

  // 6. isolasi tenant
  const rX = await kirim(D.sX, teksSumber(6, palsu(usulanBaru(6))))
  if (rX.json.intake?.id) D.intakes.add(rX.json.intake.id)
  const hX = await hashIntake(rX.json.intake?.id)
  const jX = await jalanUntukHash(D.X.id, hX)
  cek('tenant X: run tercatat di tenant X', rX.status === 201 && jX.length === 1 && jX[0].tenantId === D.X.id && jX[0].modelCalls.every((m) => m.tenantId === D.X.id))
  cek('tenant A tak memiliki run/panggilan milik X', (await prisma.agentRun.count({ where: { tenantId: D.A.id, subjectId: rX.json.intake?.id } })) === 0 && (await prisma.agentModelCall.count({ where: { tenantId: D.A.id, agentRunId: jX[0]?.id } })) === 0)
  cek('X tak melihat intake A lewat API (pagar lama tetap)', (await api(D.sX, 'GET', `/api/automation/intakes/${it1?.id}`)).status === 404)

  // 7. idempotensi / duplikat
  const ulang = await kirim(D.sA, teksSumber(1, palsu(usulanBaru(1))))
  cek('kirim ulang input sama → 200 reused, TANPA run baru', ulang.status === 200 && ulang.json.reused === true && (await jalanUntukHash(D.A.id, h1)).length === 1)
  const teksSerentak = teksSumber(7, palsu(usulanBaru(7)))
  const serentak = await Promise.all([kirim(D.sA, teksSerentak), kirim(D.sA2, teksSerentak), kirim(D.sA, teksSerentak)])
  const idSerentak = new Set(serentak.map((r) => r.json.intake?.id).filter(Boolean))
  for (const id of idSerentak) D.intakes.add(id)
  intakeBaru += idSerentak.size
  const hS = await hashIntake([...idSerentak][0])
  const jS = await jalanUntukHash(D.A.id, hS)
  cek('3 submit identik serentak → tepat SATU intake (tak ada aksi bisnis ganda)', idSerentak.size === 1 && (await prisma.vesselCallIntake.count({ where: { tenantId: D.A.id, inputHash: hS } })) === 1, serentak.map((r) => r.status).join(','))
  cek('serentak: tepat satu PROPOSAL_CREATED; sisanya DUPLICATE_DISCARDED ke intake pemenang', jS.filter((r) => r.outcome === 'PROPOSAL_CREATED').length === 1 && jS.every((r) => r.status === 'SUCCEEDED' && r.subjectId === [...idSerentak][0]), `${jS.length} run: ${jS.map((r) => r.outcome).join(',')}`)
  info(`balapan serentak menghasilkan ${jS.length} run (1 = pesaing lain dijawab "reused" sebelum AI; 2+ = balapan AI sungguhan)`)

  // 8. gagal MEMBUAT run → tak ada AI, tak ada intake
  const teksGagalMulai = teksSumber(8, palsu(usulanBaru(8)))
  const pemakaianSebelum = await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: 'INTAKE_EXTRACTED' } })
  let rG
  await prisma.$executeRawUnsafe('ALTER TABLE "AgentRun" RENAME TO "AgentRun_uji_p5s3b"')
  try {
    rG = await kirim(D.sA, teksGagalMulai)
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "AgentRun_uji_p5s3b" RENAME TO "AgentRun"')
  }
  cek('ledger tak bisa dibuat → permintaan gagal (bukan 2xx)', rG.status >= 500, `${rG.status}`)
  cek('… tak ada intake tercipta & pemakaian INTAKE_EXTRACTED tak bertambah', (await prisma.vesselCallIntake.count({ where: { tenantId: D.A.id, createdAt: { gte: D.mulai }, proposal: { path: ['clientReference', 'value'], equals: `${SENTINEL}-REF-8` } } })) === 0 && (await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: 'INTAKE_EXTRACTED' } })) === pemakaianSebelum)

  // 9. gagal MENUTUP (panggilan tak tercatat) → intake tetap berhasil
  const teksGagalTutup = teksSumber(9, palsu(usulanBaru(9)))
  let rT
  await prisma.$executeRawUnsafe('ALTER TABLE "AgentModelCall" RENAME TO "AgentModelCall_uji_p5s3b"')
  try {
    rT = await kirim(D.sA, teksGagalTutup)
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "AgentModelCall_uji_p5s3b" RENAME TO "AgentModelCall"')
  }
  if (rT.json.intake?.id) D.intakes.add(rT.json.intake.id), intakeBaru++
  const jT = await jalanUntukHash(D.A.id, await hashIntake(rT.json.intake?.id))
  cek('ledger gagal mencatat panggilan → intake TETAP 201 (best-effort)', rT.status === 201 && rT.json.intake?.status === 'NEEDS_REVIEW', `${rT.status}`)
  cek('… run tetap SUCCEEDED, 0 panggilan tercatat (tercatat di audit: panggilanTercatat=false)', jT[0]?.status === 'SUCCEEDED' && jT[0]?.modelCalls.length === 0)

  // 10. alur persetujuan tak menyentuh ledger
  const sebelum = await hitungLedger()
  const detail = await api(D.sA, 'GET', `/api/automation/intakes/${r5.json.intake?.id}`)
  const tolak = await api(D.sA, 'POST', `/api/automation/intakes/${r5.json.intake?.id}/reject`, { version: detail.json.intake?.version, reason: 'uji 3B' })
  cek('reject intake (alur lama) → 200 REJECTED', tolak.status === 200 && tolak.json.intake?.status === 'REJECTED', `${tolak.status}`)
  const sesudah = await hitungLedger()
  cek('persetujuan/penolakan TIDAK membuat run/panggilan baru', sebelum.run === sesudah.run && sebelum.panggilan === sesudah.panggilan)

  // 11. semantik pemakaian AI tak berubah (TD-005-01 tetap terbuka)
  const akhirPemakaian = await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: 'INTAKE_EXTRACTED' } })
  cek('INTAKE_EXTRACTED bertambah tepat satu per intake baru (seperti sebelumnya)', akhirPemakaian - awalPemakaian === intakeBaru, `${akhirPemakaian - awalPemakaian} vs ${intakeBaru}`)
  cek('tak ada UsageEvent berawalan AI_ dari intake (kuota AI tetap tak menghitung intake — TD-005-01)', (await prisma.usageEvent.count({ where: { tenantId: D.A.id, nama: { startsWith: 'AI_' }, createdAt: { gte: D.mulai } } })) === 0)
}

async function modeLayanan() {
  console.log('\n[LAYANAN] agent-run.service langsung ke DB (jiti)')
  const require = createRequire(import.meta.url)
  const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
  const S = jiti(join(AKAR, 'src/services/tah/agent-run.service.ts'))
  const ctxA = { tenantId: D.A.id, userId: D.uA.id, role: 'ADMIN' }
  const ctxX = { tenantId: D.X.id, userId: D.uX.id, role: 'ADMIN' }
  const meta = (i, extra = {}) => ({ provider: 'FAKE', requestedModel: 'm', servedModel: null, providerRequestId: null, promptId: 'p', promptVersion: '1', promptHash: 'h', schemaId: null, schemaVersion: null, params: { temperature: 0, apiKey: 'sk-RAHASIA', messages: ['DOK'] }, status: 'OK', errorCode: null, latencyMs: i, pemakaian: { inputTokens: 1, outputTokens: 2, cachedInputTokens: null, reasoningTokens: null }, ...extra })

  let tolak = null
  try {
    await S.mulaiRun(ctxA, { agentKey: 'HANTU', runType: 'EXTRACT', triggerType: 'HUMAN' })
  } catch (e) {
    tolak = e
  }
  cek('agen tak terdaftar → mulaiRun menolak', tolak !== null)
  const r = await S.mulaiRun(ctxA, { agentKey: 'INTAKE', runType: 'EXTRACT', triggerType: 'HUMAN' })
  D.runs.add(r.id)
  const lihatX = await jiti(join(AKAR, 'src/services/tenant-db.ts')).forTenant(ctxX).agentRun.findMany({ where: { id: r.id } })
  cek('forTenant(X) tak melihat run milik A', lihatX.length === 0)
  await prisma.agentRun.updateMany({ where: { id: r.id }, data: { status: 'ABANDONED' } })
  const ok = await S.selesaiRun(ctxA, r, { outcome: 'PROPOSAL_CREATED', subjectType: 'VesselCallIntake', subjectId: 'x', resultSummary: 'ringkas', result: { a: 1 } }, Array.from({ length: 25 }, (_, i) => meta(i)))
  const setelah = await prisma.agentRun.findFirst({ where: { id: r.id }, include: { modelCalls: true } })
  cek('ABANDONED → SUCCEEDED diterima sebagai penyelesaian TERLAMBAT', ok === true && setelah.status === 'SUCCEEDED' && setelah.lateCompletion === true)
  cek('panggilan dibatasi 20 per run, seq 1..20', setelah.modelCalls.length === 20 && setelah.modelCalls.map((m) => m.seq).sort((a, b) => a - b)[19] === 20)
  cek('params disaring daftar izin (kunci/pesan dibuang)', setelah.modelCalls.every((m) => JSON.stringify(m.params) === '{"temperature":0}'))
  const lagi = await S.gagalRun(ctxA, r, 'INTERNAL', [])
  cek('run final tak bisa ditutup ulang (SUCCEEDED → FAILED ditolak, tanpa melempar)', lagi === false && (await prisma.agentRun.findFirst({ where: { id: r.id } })).status === 'SUCCEEDED')
  const besar = await S.mulaiRun(ctxA, { agentKey: 'INTAKE', runType: 'EXTRACT', triggerType: 'HUMAN' })
  D.runs.add(besar.id)
  await S.selesaiRun(ctxA, besar, { outcome: 'PROPOSAL_CREATED', result: { x: 'y'.repeat(20_000) }, resultSummary: 'z'.repeat(400) }, [])
  const b = await prisma.agentRun.findFirst({ where: { id: besar.id } })
  cek('hasil > 16 KB tak disimpan; ringkasan dipotong ≤ 300', b.result === null && b.resultSummary.length <= 300)
  const aud = await prisma.auditLog.findMany({ where: { tableName: 'AgentRun', recordId: r.id } })
  cek('audit run: STARTED + LATE_COMPLETION, tanpa payload', aud.some((a) => a.newValue?.peristiwa === 'TAH_RUN_STARTED') && aud.some((a) => a.newValue?.peristiwa === 'TAH_RUN_LATE_COMPLETION') && !JSON.stringify(aud).includes('ringkas'))
}

async function modeOff() {
  console.log('\n[OFF] TAH Core mati — intake lama, NOL baris ledger')
  const awal = await hitungLedger()
  const r1 = await kirim(D.sA, teksSumber(21, palsu(usulanBaru(21))))
  if (r1.json.intake?.id) D.intakes.add(r1.json.intake.id)
  cek('submit sukses → 201 NEEDS_REVIEW', r1.status === 201 && r1.json.intake?.status === 'NEEDS_REVIEW', `${r1.status}`)
  const r2 = await kirim(D.sA, teksSumber(22, palsu(usulanBaru(22), 'FAKE-AI-RETRY')))
  if (r2.json.intake?.id) D.intakes.add(r2.json.intake.id)
  cek('RETRY → 201 (pelaporan no-op)', r2.status === 201, `${r2.status}`)
  for (const [p, k] of [['TIMEOUT', 'AI_TIMEOUT'], ['UNAVAILABLE', 'AI_UNAVAILABLE'], ['BAD', 'AI_BAD_RESPONSE']]) {
    const r = await kirim(D.sA, `Uji mati ${TAG}${p}-${ACAK} [[FAKE-AI:${p}]]`)
    cek(`${p} → 502 ${k} (sama seperti sebelum 3B)`, r.status === 502 && r.json.error?.details?.code === k, `${r.status}`)
  }
  const r3 = await kirim(D.sX, teksSumber(23, palsu(usulanBaru(23))))
  if (r3.json.intake?.id) D.intakes.add(r3.json.intake.id)
  const akhir = await hitungLedger()
  cek('NOL AgentRun & NOL AgentModelCall tertulis', akhir.run === awal.run && akhir.panggilan === awal.panggilan, `${JSON.stringify(awal)} → ${JSON.stringify(akhir)}`)
}

async function modePending() {
  console.log('\n[PENDING] TAH_INTAKE_MODEL=anthropic/claude-sonnet-5 (PENDING_SPIKE) — intake gagal tertutup')
  const awal = await hitungLedger()
  const g = await api(D.sA, 'GET', '/api/automation/intakes')
  cek('GET daftar intake → 404 MODEL_TIDAK_TERVERIFIKASI', g.status === 404 && g.json.error?.details?.code === 'MODEL_TIDAK_TERVERIFIKASI', `${g.status} ${g.teks.slice(0, 120)}`)
  const s = await kirim(D.sA, teksSumber(31, palsu(usulanBaru(31))))
  cek('submit → 404 MODEL_TIDAK_TERVERIFIKASI (tanpa fallback ke model lama)', s.status === 404 && s.json.error?.details?.code === 'MODEL_TIDAK_TERVERIFIKASI', `${s.status}`)
  const hal = await D.sA.ambil('/automation/intake')
  cek('halaman /automation/intake → 404', hal.status === 404, `${hal.status}`)
  const akhir = await hitungLedger()
  cek('tak ada run / panggilan tercipta', akhir.run === awal.run && akhir.panggilan === awal.panggilan)
  cek('tak ada intake tercipta', (await prisma.vesselCallIntake.count({ where: { tenantId: D.A.id, createdAt: { gte: D.mulai } } })) === 0)
}

async function main() {
  console.log(`Mode: ${MODE}`)
  await siapkan()
  const tahSkrip = process.env.TAH_CORE_ENABLED === 'true'
  if ((MODE === 'OFF') === tahSkrip) throw new Error(`TAH_CORE_ENABLED skrip (${process.env.TAH_CORE_ENABLED ?? 'tak diset'}) tak cocok dengan mode ${MODE}.`)
  if (MODE === 'OFF') await modeOff()
  else if (MODE === 'PENDING') await modePending()
  else {
    const expected = MODE === 'VERIFIED' ? 'anthropic/claude-sonnet-4.5' : process.env.OPENROUTER_SPK_MODEL || 'anthropic/claude-sonnet-4.5'
    await modeOn(expected)
    if (MODE === 'ON') await modeLayanan()
  }
}

let bersih = false
try {
  await main()
} catch (e) {
  gagal++
  console.log(`💥 ${e?.stack ?? e}`)
} finally {
  try {
    bersih = await bersihkan()
  } catch (e) {
    console.log(`💥 pembersihan gagal: ${e?.message ?? e}`)
  }
  cek('pembersihan data uji tuntas', bersih)
  await prisma.$disconnect()
}
console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
