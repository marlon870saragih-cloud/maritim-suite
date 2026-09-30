// Uji keselamatan job pengingat — PRD-002 Step 3 (infrastructure closure).
//
// Jalankan:  node prisma/check-reminder-safety.mjs      (butuh `npm run dev` menyala)
//            BASE_URL=http://localhost:3001 node prisma/check-reminder-safety.mjs
//
// Melengkapi check-reminder-job.mjs (Fase 7e) dengan yang dituntut Step 3:
//   1. respons ber-`ok` + `total.gagal` (dibaca penjadwal systemd)
//   2. kunci & teks memakai tanggal/waktu BISNIS Asia/Makassar
//   3. peristiwa yang SUDAH dinotifikasi dilewati
//   4. EMPAT jalan BERSAMAAN → nol duplikat, dan hitungan `dibuat` tiap tenant
//      sama persis dengan baris yang benar-benar lahir (tak dihitung ganda)
//   5. jalan ulang (retry) → nol baris baru
//   6. isolasi tenant — tugas tenant B hanya melahirkan notifikasi di tenant B
//   7. penerima benar — bertarget ke penanggung jawab, siaran bila tanpa PJ
//   8. tak ada yang layak → tak ada notifikasi
//
// CARA MENGUKUR: selisih himpunan id Notification sebelum/sesudah SETIAP panggilan
// (pola check-reminder-job.mjs). Setiap id yang lahir dicatat, jadi bersih-bersih
// juga menghapus notifikasi untuk data NYATA yang kebetulan ikut tersapu job.
//
// Skrip ini MENULIS ke database dev. Barisnya bertanda `P2S3-RS-` / email
// `p2s3-rs-*` dan dihapus lagi di akhir, termasuk saat gagal di tengah.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { tanggalBisnis } from '../src/lib/business-time.ts'

for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* file tak ada — lewati */
  }
}

const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TOKEN = process.env.JOB_RUNNER_TOKEN ?? ''
const TAG = 'P2S3-RS-'
const EMAIL = 'p2s3-rs-'
const JAM = 3_600_000

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

// ------------------------------------------------------------------ pemicu job

async function panggilJob() {
  const res = await fetch(`${BASE_URL}/api/jobs/run?job=reminders`, {
    method: 'POST',
    headers: { 'x-job-token': TOKEN },
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const KOLOM = { id: true, tenantId: true, userId: true, type: true, title: true, message: true, entityId: true, dedupeKey: true }
const lahirSelamaUji = new Set()

/** `n` panggilan BERSAMAAN; baris yang lahir diukur dari selisih himpunan id. */
async function jalankan(n = 1) {
  const sebelum = new Set((await prisma.notification.findMany({ select: { id: true } })).map((r) => r.id))
  const res = await Promise.all(Array.from({ length: n }, () => panggilJob()))
  const sesudah = await prisma.notification.findMany({ select: KOLOM })
  const baru = sesudah.filter((x) => !sebelum.has(x.id))
  for (const x of baru) lahirSelamaUji.add(x.id)
  return { res, baru }
}

const untuk = (baris, ids) => {
  const s = new Set(Array.isArray(ids) ? ids : [ids])
  return baris.filter((n) => s.has(n.entityId))
}
const hasilTenant = (json, tenantId) => (json.hasil ?? []).find((h) => h.tenant === tenantId)

// -------------------------------------------------------------- data disposable

const D = {}

async function siapkanData() {
  D.tenantA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } }, orderBy: { createdAt: 'asc' } })
  D.tenantB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!D.tenantA || !D.tenantB) throw new Error('Tenant Tribuana / Verifikasi tidak ada di DB dev.')

  // Sandi sengaja BUKAN hash bcrypt: pengguna ini tak pernah perlu (dan tak bisa) login.
  const buatUser = (tenantId, email, role) =>
    prisma.user.create({ data: { tenantId, email, name: `${TAG}${role}`, password: `${TAG}tanpa-login`, role, isActive: true } })
  D.pjA = await buatUser(D.tenantA.id, `${EMAIL}pj-a@tribuanagency.co.id`, 'OPERATOR')
  D.pjB = await buatUser(D.tenantB.id, `${EMAIL}pj-b@verifikasi.test`, 'OPERATOR')
}

const tugas = (tenantId, pembuatId, data) =>
  prisma.task.create({ data: { tenantId, createdByUserId: pembuatId, status: 'TODO', ...data } })

// ============================================================================ uji

async function butir1() {
  console.log('\n[1] Respons untuk penjadwal: ok + total.gagal + hasil per tenant ber-gagal')
  const { res } = await jalankan()
  const r = res[0]
  cek('200', r.status === 200, `status=${r.status}`)
  cek('ok = true (tak ada tenant/notifikasi gagal)', r.json.ok === true, `ok=${r.json.ok}`)
  cek('total.gagal berupa angka = 0', r.json.total?.gagal === 0, JSON.stringify(r.json.total))
  cek('setiap hasil tenant membawa gagal (angka)', (r.json.hasil ?? []).length > 0 && r.json.hasil.every((h) => typeof h.gagal === 'number'))
}

async function butir2() {
  console.log('\n[2] Kunci TASK_OVERDUE & teks memakai waktu bisnis Asia/Makassar')
  D.tTelat = await tugas(D.tenantA.id, D.pjA.id, {
    title: `${TAG}Terlambat bertarget`,
    assigneeUserId: D.pjA.id,
    dueAt: new Date(Date.now() - 30 * JAM),
    dueAtManual: true,
  })
  const tanggalSebelum = tanggalBisnis(new Date())
  const { baru } = await jalankan()
  const tanggalSesudah = tanggalBisnis(new Date())
  const milik = untuk(baru, D.tTelat.id)
  const kunciSah = new Set([tanggalSebelum, tanggalSesudah].map((t) => `TASK_OVERDUE:${D.tTelat.id}:${t}`))
  cek('tepat satu TASK_OVERDUE', milik.length === 1 && milik[0].type === 'TASK_OVERDUE', `lahir=${milik.length}`)
  cek('dedupeKey = TASK_OVERDUE:<id>:<tanggal WITA>', kunciSah.has(milik[0]?.dedupeKey), milik[0]?.dedupeKey)
  info(`tanggal UTC hari ini ${new Date().toISOString().slice(0, 10)}, tanggal bisnis ${tanggalSesudah}`)
  cek('pesan berlabel WITA, bukan UTC', /WITA/.test(milik[0]?.message ?? '') && !/UTC/.test(milik[0]?.message ?? ''), milik[0]?.message)
  cek('bertarget ke penanggung jawab', milik[0]?.userId === D.pjA.id)
}

async function butir3() {
  console.log('\n[3] Peristiwa yang SUDAH dinotifikasi → dilewati, tak ada baris kedua')
  D.tSudah = await tugas(D.tenantA.id, D.pjA.id, {
    title: `${TAG}Sudah dinotifikasi`,
    assigneeUserId: D.pjA.id,
    dueAt: new Date(Date.now() - 40 * JAM),
    dueAtManual: true,
  })
  const kunci = `TASK_OVERDUE:${D.tSudah.id}:${tanggalBisnis(new Date())}`
  const ada = await prisma.notification.create({
    data: {
      tenantId: D.tenantA.id,
      userId: D.pjA.id,
      type: 'TASK_OVERDUE',
      title: `${TAG}sudah ada sebelumnya`,
      entityType: 'TASK',
      entityId: D.tSudah.id,
      dedupeKey: kunci,
    },
  })
  lahirSelamaUji.add(ada.id)
  const { res, baru } = await jalankan()
  cek('nol baris baru untuk tugas itu', untuk(baru, D.tSudah.id).length === 0)
  cek('count di DB tetap 1', (await prisma.notification.count({ where: { entityId: D.tSudah.id } })) === 1)
  cek('laporan tenant A: dilewati ≥ 1, gagal = 0', (hasilTenant(res[0].json, D.tenantA.id)?.dilewati ?? 0) >= 1 && hasilTenant(res[0].json, D.tenantA.id)?.gagal === 0)
}

async function butir4dan5dan7() {
  console.log('\n[4] EMPAT jalan BERSAMAAN → nol duplikat, hitungan eksak per tenant')
  const dasar = Date.now() - 50 * JAM
  await prisma.task.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      tenantId: D.tenantA.id,
      createdByUserId: D.pjA.id,
      title: `${TAG}KONKUREN-A-${String(i).padStart(2, '0')}`,
      status: 'TODO',
      // 25 bertarget, 5 tanpa penanggung jawab (butir 7)
      assigneeUserId: i < 25 ? D.pjA.id : null,
      dueAt: new Date(dasar + i * 1000),
      dueAtManual: true,
    })),
  })
  await prisma.task.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({
      tenantId: D.tenantB.id,
      createdByUserId: D.pjB.id,
      title: `${TAG}KONKUREN-B-${i}`,
      status: 'TODO',
      assigneeUserId: D.pjB.id,
      dueAt: new Date(dasar + i * 1000),
      dueAtManual: true,
    })),
  })
  const idA = (await prisma.task.findMany({ where: { title: { startsWith: `${TAG}KONKUREN-A-` } }, select: { id: true, assigneeUserId: true } }))
  const idB = (await prisma.task.findMany({ where: { title: { startsWith: `${TAG}KONKUREN-B-` } }, select: { id: true } })).map((t) => t.id)
  cek('30 tugas tenant A + 5 tugas tenant B disiapkan', idA.length === 30 && idB.length === 5)

  const { res, baru } = await jalankan(4)
  cek('keempat panggilan → 200 & ok=true', res.every((r) => r.status === 200 && r.json.ok === true), res.map((r) => `${r.status}/${r.json.ok}`).join(' '))
  const milikA = untuk(baru, idA.map((t) => t.id))
  const milikB = untuk(baru, idB)
  cek('tepat 30 baris untuk 30 tugas A (bukan 120)', milikA.length === 30, `lahir=${milikA.length}`)
  cek('tepat 5 baris untuk 5 tugas B (bukan 20)', milikB.length === 5, `lahir=${milikB.length}`)
  const kunci = [...milikA, ...milikB].map((n) => n.dedupeKey)
  cek('35 dedupeKey unik — nol duplikat', new Set(kunci).size === 35, `unik=${new Set(kunci).size}`)

  for (const t of [D.tenantA, D.tenantB]) {
    const dilaporkan = res.reduce((s, r) => s + (hasilTenant(r.json, t.id)?.dibuat ?? 0), 0)
    const nyata = baru.filter((n) => n.tenantId === t.id).length
    cek(
      `Σ dibuat dari 4 jalan (${t.companyName}) = baris yang benar-benar lahir — tak dihitung ganda`,
      dilaporkan === nyata,
      `laporan=${dilaporkan} DB=${nyata}`,
    )
  }
  cek('Σ gagal dari 4 jalan = 0', res.every((r) => r.json.total?.gagal === 0))

  console.log('\n[5] Jalan ulang (retry) sesudahnya → nol baris baru')
  const ulang = await jalankan(2)
  cek('nol baris baru untuk seluruh 35 tugas', untuk(ulang.baru, [...idA.map((t) => t.id), ...idB]).length === 0)
  for (const t of [D.tenantA, D.tenantB]) {
    const dilaporkan = ulang.res.reduce((s, r) => s + (hasilTenant(r.json, t.id)?.dibuat ?? 0), 0)
    const nyata = ulang.baru.filter((n) => n.tenantId === t.id).length
    cek(`retry: laporan dibuat ${t.companyName} = DB`, dilaporkan === nyata, `laporan=${dilaporkan} DB=${nyata}`)
  }

  console.log('\n[6] Isolasi tenant')
  cek('semua notifikasi tugas B tersimpan di tenant B', milikB.every((n) => n.tenantId === D.tenantB.id))
  cek('semua notifikasi tugas B bertarget pengguna tenant B', milikB.every((n) => n.userId === D.pjB.id))
  cek('semua notifikasi tugas A tersimpan di tenant A', milikA.every((n) => n.tenantId === D.tenantA.id))
  const bocor = await prisma.notification.count({
    where: { OR: [{ tenantId: D.tenantA.id, entityId: { in: idB } }, { tenantId: D.tenantA.id, userId: D.pjB.id }, { tenantId: D.tenantB.id, userId: D.pjA.id }] },
  })
  cek('nol notifikasi lintas tenant (entitas atau penerima)', bocor === 0, `bocor=${bocor}`)

  console.log('\n[7] Penerima')
  const pjDari = new Map(idA.map((t) => [t.id, t.assigneeUserId]))
  cek('25 tugas ber-PJ → userId = PJ-nya', milikA.filter((n) => pjDari.get(n.entityId)).every((n) => n.userId === pjDari.get(n.entityId)) && milikA.filter((n) => n.userId === D.pjA.id).length === 25)
  const siaran = milikA.filter((n) => !pjDari.get(n.entityId))
  cek('5 tugas tanpa PJ → siaran (userId = null)', siaran.length === 5 && siaran.every((n) => n.userId === null), `siaran=${siaran.length}`)
}

async function butir8() {
  console.log('\n[8] Tak ada yang layak → tak ada notifikasi')
  const jauh = await tugas(D.tenantA.id, D.pjA.id, {
    title: `${TAG}Tenggat 10 hari lagi`,
    assigneeUserId: D.pjA.id,
    dueAt: new Date(Date.now() + 240 * JAM),
    dueAtManual: true,
  })
  const tepat = await tugas(D.tenantA.id, D.pjA.id, {
    title: `${TAG}Selesai tepat waktu`,
    assigneeUserId: D.pjA.id,
    status: 'DONE',
    dueAt: new Date(Date.now() - 10 * JAM),
    completedAt: new Date(Date.now() - 12 * JAM),
  })
  const batal = await tugas(D.tenantA.id, D.pjA.id, {
    title: `${TAG}Dibatalkan & lewat tenggat`,
    assigneeUserId: D.pjA.id,
    status: 'CANCELLED',
    dueAt: new Date(Date.now() - 10 * JAM),
    dueAtManual: true,
  })
  const { res, baru } = await jalankan()
  cek('tenggat jauh → nol notifikasi', untuk(baru, jauh.id).length === 0)
  cek('selesai sebelum tenggat → nol notifikasi (bukan SLA_BREACH)', untuk(baru, tepat.id).length === 0)
  cek('dibatalkan → nol notifikasi walau lewat tenggat', untuk(baru, batal.id).length === 0)
  cek('jalan tetap ok', res[0].status === 200 && res[0].json.ok === true)
}

// ------------------------------------------------------------------ bersih-bersih

async function hitungGlobal() {
  return {
    notification: await prisma.notification.count(),
    task: await prisma.task.count(),
    user: await prisma.user.count(),
  }
}

async function bersihkan() {
  const id = Array.from(lahirSelamaUji)
  let hapusNotif = 0
  for (let i = 0; i < id.length; i += 500) {
    hapusNotif += (await prisma.notification.deleteMany({ where: { id: { in: id.slice(i, i + 500) } } })).count
  }
  const hapusTugas = (await prisma.task.deleteMany({ where: { title: { startsWith: TAG } } })).count
  const hapusUser = (await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } })).count
  console.log(`     dihapus → notifikasi ${hapusNotif}, tugas ${hapusTugas}, pengguna ${hapusUser}`)
}

// ------------------------------------------------------------------------ main

async function main() {
  console.log(`Uji keselamatan job pengingat PRD-002 Step 3 — ${BASE_URL}`)
  if (!TOKEN) throw new Error('JOB_RUNNER_TOKEN belum ada di .env.local / .env')

  const awal = await hitungGlobal()
  console.log(`Baris global sebelum uji: ${JSON.stringify(awal)}`)
  try {
    await siapkanData()
    await butir1()
    await butir2()
    await butir3()
    await butir4dan5dan7()
    await butir8()
  } finally {
    console.log('\n[9] Bersih-bersih data disposable')
    await bersihkan()
    const akhir = await hitungGlobal()
    console.log(`Baris global sesudah uji: ${JSON.stringify(akhir)}`)
    cek(
      'seluruh jumlah baris global kembali seperti semula',
      JSON.stringify(awal) === JSON.stringify(akhir),
      JSON.stringify(awal) === JSON.stringify(akhir) ? '' : `${JSON.stringify(awal)} vs ${JSON.stringify(akhir)}`,
    )
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
