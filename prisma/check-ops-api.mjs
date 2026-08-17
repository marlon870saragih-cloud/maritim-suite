// Uji API Task/Checklist lewat sesi login SUNGGUHAN — Fase 7c, §18/7c butir 1-12.
//
// Jalankan:  node prisma/check-ops-api.mjs      (butuh `npm run dev` menyala)
//
// KENAPA LEWAT HTTP DAN BUKAN MEMANGGIL SERVICE LANGSUNG: yang diuji di sini
// justru hal-hal yang hanya ada di jalur lengkapnya — kode status HTTP (403 vs
// 404 vs 409), pagar peran yang membaca sesi, dan tenant-guard yang terpasang
// lewat requireTenant(). Memanggil service dengan systemContext() akan melewati
// ketiganya dan membuktikan lebih sedikit daripada kelihatannya.
//
// Skrip ini MENULIS ke database dev. Semua barisnya bertanda `7C-` dan dihapus
// lagi di akhir (termasuk saat gagal di tengah). Satu pengecualian yang disengaja:
// butir 1 & 12 menyentuh voyage NYATA yang sudah ada di DB — tugas yang dibuatnya
// tetap ber-`7C-` dan ikut terhapus.
//
// Prasyarat: `node prisma/seed-task-template.mjs` sudah dijalankan (butir 2 & 4
// memakai template CONTOH hasil seed itu).

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
const SANDI = 'Uji7cOps!2026'
const TAG = '7C-'
const NAMA_TEMPLATE_CONTOH = 'CONTOH — ganti dengan checklist Tribuana'

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

const iso = (d) => (d ? new Date(d).toISOString() : null)
const jam = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / 3_600_000

// ------------------------------------------------------------------ sesi HTTP

function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pasangan] = c.split(';')
      const i = pasangan.indexOf('=')
      if (i > 0) jar.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim())
    }
  }
  const header = () =>
    Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        redirect: 'manual',
        headers: { ...(init.headers ?? {}), cookie: header() },
      })
      simpanCookie(res)
      return res
    },
    punyaSesi: () =>
      jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
  }
}

async function login(email) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password: SANDI, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login gagal untuk ${email}`)
  return sesi
}

async function json(sesi, metode, path, body) {
  const res = await sesi.ambil(path, {
    method: metode,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const GET = (s, p) => json(s, 'GET', p)
const POST = (s, p, b) => json(s, 'POST', p, b ?? {})
const PATCH = (s, p, b) => json(s, 'PATCH', p, b ?? {})
const DELETE = (s, p) => json(s, 'DELETE', p)

// -------------------------------------------------------------- data disposable

async function siapkanData() {
  const tenantA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } } })
  const tenantB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!tenantA || !tenantB) throw new Error('Tenant Tribuana / Verifikasi tidak ditemukan di DB dev.')

  const sandi = await bcrypt.hash(SANDI, 10)
  const buatUser = (tenantId, email, role) =>
    prisma.user.create({ data: { tenantId, email, name: `${TAG}${role}`, password: sandi, role } })

  const users = {
    admin: await buatUser(tenantA.id, '7c-admin@tribuanagency.co.id', 'ADMIN'),
    operator: await buatUser(tenantA.id, '7c-oper@tribuanagency.co.id', 'OPERATOR'),
    biaya: await buatUser(tenantA.id, '7c-biaya@tribuanagency.co.id', 'PENYUSUN_BIAYA'),
    adminB: await buatUser(tenantB.id, '7c-admin@verifikasi.local', 'ADMIN'),
  }

  const kapalA = await prisma.vessel.create({
    data: { tenantId: tenantA.id, name: `${TAG}MV Uji A`, gt: 5000, vesselType: 'General Cargo' },
  })
  const kapalB = await prisma.vessel.create({
    data: { tenantId: tenantB.id, name: `${TAG}MV Uji B`, gt: 5000 },
  })

  const samarindaA = await prisma.port.findFirst({
    where: { tenantId: tenantA.id, unlocode: 'IDSRI', deletedAt: null },
  })
  const balikpapanA = await prisma.port.findFirst({
    where: { tenantId: tenantA.id, unlocode: 'IDBPN', deletedAt: null },
  })
  const templateContoh = await prisma.taskTemplate.findFirst({
    where: { tenantId: tenantA.id, name: NAMA_TEMPLATE_CONTOH, deletedAt: null },
    include: { items: true },
  })
  if (!templateContoh) {
    throw new Error('Template CONTOH belum ada — jalankan `node prisma/seed-task-template.mjs` dulu.')
  }

  // Voyage NYATA yang sudah ada (butir 1 & 12 memakai data sungguhan).
  const voyageNyata = await prisma.voyage.findFirst({
    where: { tenantId: tenantA.id, deletedAt: null },
    orderBy: { voyageNumber: 'asc' },
  })
  if (!voyageNyata) throw new Error('Tidak ada voyage nyata di tenant Tribuana.')

  const voyageB = await prisma.voyage.create({
    data: {
      tenantId: tenantB.id,
      voyageNumber: `${TAG}VYG-B`,
      vesselId: kapalB.id,
      baseCurrency: 'IDR',
      dataOrigin: 'UJI',
      eta: new Date('2026-09-01T08:00:00.000Z'),
    },
  })

  return { tenantA, tenantB, users, kapalA, kapalB, samarindaA, balikpapanA, templateContoh, voyageNyata, voyageB }
}

async function bersihkan(d) {
  if (!d) return
  const voyages = await prisma.voyage.findMany({
    where: { OR: [{ voyageNumber: { startsWith: TAG } }, { vesselId: d.kapalA?.id }, { vesselId: d.kapalB?.id }] },
    select: { id: true },
  })
  const idVoyage = voyages.map((v) => v.id)

  const tugas = await prisma.task.findMany({
    where: { OR: [{ voyageId: { in: idVoyage } }, { title: { startsWith: TAG } }] },
    select: { id: true },
  })
  const idTugas = tugas.map((t) => t.id)

  if (idTugas.length) await prisma.task.deleteMany({ where: { id: { in: idTugas } } })
  await prisma.taskTemplate.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.auditLog.deleteMany({ where: { recordId: { in: [...idVoyage, ...idTugas] } } })
  if (idVoyage.length) await prisma.voyage.deleteMany({ where: { id: { in: idVoyage } } })
  for (const k of [d.kapalA, d.kapalB]) if (k) await prisma.vessel.deleteMany({ where: { id: k.id } })
  for (const u of Object.values(d.users ?? {})) await prisma.user.deleteMany({ where: { id: u.id } })
}

// ----------------------------------------------------------------------- uji

async function jalankan(d) {
  const sAdmin = await login(d.users.admin.email)
  const sOper = await login(d.users.operator.email)
  const sBiaya = await login(d.users.biaya.email)
  const sB = await login(d.users.adminB.email)

  const ETA_AWAL = '2026-09-01T08:00:00.000Z'

  // === 1. Tugas pada voyage nyata: dueAt sesuai jangkar; tanpa jangkar → null ===
  console.log(`\n1) dueAt dari jangkar — voyage nyata ${d.voyageNyata.voyageNumber}`)
  {
    const v = d.voyageNyata
    const r1 = await POST(sAdmin, `/api/voyages/${v.id}/tasks`, {
      title: `${TAG}clearance 24 jam sebelum ETA`,
      anchor: 'ETA',
      offsetHours: -24,
      category: 'PORT_CLEARANCE',
    })
    const harusnya = v.eta ? new Date(new Date(v.eta).getTime() - 24 * 3_600_000).toISOString() : null
    cek(
      'tugas ber-anchor ETA -24 → dueAt terhitung',
      r1.status === 201 && iso(r1.json.tugas?.dueAt) === harusnya,
      `HTTP ${r1.status}; ETA voyage=${iso(v.eta)}; dueAt=${iso(r1.json.tugas?.dueAt)}; diharapkan=${harusnya}`,
    )

    const r2 = await POST(sAdmin, `/api/voyages/${v.id}/tasks`, { title: `${TAG}tanpa jangkar` })
    cek(
      'tugas tanpa jangkar → dueAt null, tanpa galat',
      r2.status === 201 && r2.json.tugas?.dueAt === null,
      `HTTP ${r2.status}; dueAt=${iso(r2.json.tugas?.dueAt)}; sla=${r2.json.tugas?.sla?.keadaan}`,
    )

    // VYG-2026-000002 yang disebut dokumen: buktikan keadaannya di DB ini.
    const v2 = await prisma.voyage.findFirst({ where: { voyageNumber: 'VYG-2026-000002' } })
    console.log(
      `     catatan: VYG-2026-000002 ${v2 ? `ADA tapi deletedAt=${iso(v2.deletedAt)} (soft delete)` : 'tidak ada'} → dipakai ${v.voyageNumber}`,
    )
  }

  // === 4. Pintu otomatis K95 (dikerjakan lebih dulu karena melahirkan voyage uji) ===
  console.log('\n4) K95 pintu 1 — checklist otomatis saat createVoyage()')
  let voyageOtomatis = null
  {
    const r = await POST(sAdmin, '/api/voyages', {
      vesselId: d.kapalA.id,
      portId: d.samarindaA.id,
      eta: ETA_AWAL,
      etb: '2026-09-01T14:00:00.000Z',
      etd: '2026-09-03T08:00:00.000Z',
      baseCurrency: 'IDR',
    })
    voyageOtomatis = r.json.voyage
    const n = voyageOtomatis
      ? await prisma.task.count({ where: { voyageId: voyageOtomatis.id, deletedAt: null } })
      : 0
    cek(
      'voyage baru ber-portId Samarinda → checklist terpasang otomatis',
      r.status === 201 && n === d.templateContoh.items.length,
      `HTTP ${r.status}; tugas lahir=${n}; butir template=${d.templateContoh.items.length}`,
    )
    const berSumber = await prisma.task.count({
      where: { voyageId: voyageOtomatis?.id ?? '-', sourceTemplateItemId: { not: null } },
    })
    cek('semua tugas otomatis ber-sourceTemplateItemId', berSumber === n, `${berSumber}/${n}`)

    const r2 = await POST(sAdmin, '/api/voyages', {
      vesselId: d.kapalA.id,
      eta: ETA_AWAL,
      baseCurrency: 'IDR',
    })
    const n2 = r2.json.voyage
      ? await prisma.task.count({ where: { voyageId: r2.json.voyage.id } })
      : -1
    cek(
      'voyage baru TANPA portId → tidak terjadi apa-apa, tanpa galat',
      r2.status === 201 && n2 === 0,
      `HTTP ${r2.status}; tugas lahir=${n2}`,
    )
  }

  // === 2. Terapkan template manual + idempotensi ===
  console.log('\n2) K95 pintu 2 — terapkan checklist, lalu terapkan lagi')
  let voyageManual = null
  {
    const r0 = await POST(sAdmin, '/api/voyages', {
      vesselId: d.kapalA.id,
      portId: d.balikpapanA.id, // BUKAN Samarinda → tidak kena pintu otomatis
      eta: ETA_AWAL,
      etd: '2026-09-04T08:00:00.000Z',
      baseCurrency: 'IDR',
    })
    voyageManual = r0.json.voyage
    const sebelum = await prisma.task.count({ where: { voyageId: voyageManual.id } })

    const r1 = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks/apply-template`, {
      templateId: d.templateContoh.id,
    })
    const sesudah1 = await prisma.task.count({ where: { voyageId: voyageManual.id } })
    cek(
      'terapkan pertama → N tugas lahir',
      r1.status === 200 && r1.json.dibuat === d.templateContoh.items.length && sesudah1 === r1.json.dibuat,
      `HTTP ${r1.status}; respons="${r1.json.pesan}"; count DB ${sebelum} → ${sesudah1}`,
    )

    const r2 = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks/apply-template`, {
      templateId: d.templateContoh.id,
    })
    const sesudah2 = await prisma.task.count({ where: { voyageId: voyageManual.id } })
    cek(
      'terapkan kedua → 0 dibuat, N sudah ada (unique index, bukan cek aplikasi)',
      r2.status === 200 && r2.json.dibuat === 0 && r2.json.sudahAda === d.templateContoh.items.length,
      `HTTP ${r2.status}; respons="${r2.json.pesan}"; count DB tetap ${sesudah2}`,
    )
    cek('count DB tidak bertambah pada penerapan kedua', sesudah1 === sesudah2, `${sesudah1} = ${sesudah2}`)
  }

  // === 3. Geser ETA mundur 2 hari → tabel K94 pada data nyata ===
  console.log('\n3) K94 — ETA mundur 2 hari')
  {
    const semua = await prisma.task.findMany({
      where: { voyageId: voyageManual.id, anchor: 'ETA' },
      orderBy: { boardOrder: 'asc' },
    })
    const [tTodo, tManual, tDone] = [semua[0], semua[1], semua[2]]

    // Tugas 2: tenggat diketik operator → dueAtManual = true.
    await PATCH(sAdmin, `/api/tasks/${tManual.id}`, {
      title: tManual.title,
      anchor: tManual.anchor,
      offsetHours: tManual.offsetHours,
      dueAt: '2026-12-25T00:00:00.000Z',
    })
    // Tugas 3: sudah DONE.
    await POST(sAdmin, `/api/tasks/${tDone.id}/status`, { status: 'IN_PROGRESS' })
    await POST(sAdmin, `/api/tasks/${tDone.id}/status`, { status: 'DONE' })

    const sebelum = Object.fromEntries(
      (
        await prisma.task.findMany({
          where: { id: { in: [tTodo.id, tManual.id, tDone.id] } },
          select: { id: true, dueAt: true, dueAtManual: true, status: true },
        })
      ).map((t) => [t.id, t]),
    )

    const etaBaru = new Date(new Date(ETA_AWAL).getTime() + 2 * 24 * 3_600_000).toISOString()
    const auditSebelum = await prisma.auditLog.count({ where: { recordId: voyageManual.id } })
    const rp = await PATCH(sAdmin, `/api/voyages/${voyageManual.id}`, {
      vesselId: d.kapalA.id,
      portId: d.balikpapanA.id,
      eta: etaBaru,
      etd: '2026-09-04T08:00:00.000Z',
      baseCurrency: 'IDR',
    })
    const auditSesudah = await prisma.auditLog.count({ where: { recordId: voyageManual.id } })

    const sesudah = Object.fromEntries(
      (
        await prisma.task.findMany({
          where: { id: { in: [tTodo.id, tManual.id, tDone.id] } },
          select: { id: true, dueAt: true, status: true },
        })
      ).map((t) => [t.id, t]),
    )

    cek(
      'PATCH voyage berhasil',
      rp.status === 200,
      `HTTP ${rp.status}; ETA ${ETA_AWAL} → ${etaBaru}`,
    )
    cek(
      'tugas TODO ikut bergeser +48 jam',
      jam(sesudah[tTodo.id].dueAt, sebelum[tTodo.id].dueAt) === 48,
      `${iso(sebelum[tTodo.id].dueAt)} → ${iso(sesudah[tTodo.id].dueAt)}`,
    )
    cek(
      'tugas dueAtManual=true TIDAK bergeser',
      iso(sesudah[tManual.id].dueAt) === iso(sebelum[tManual.id].dueAt),
      `${iso(sebelum[tManual.id].dueAt)} → ${iso(sesudah[tManual.id].dueAt)} (manual=${sebelum[tManual.id].dueAtManual})`,
    )
    cek(
      'tugas DONE TIDAK bergeser',
      iso(sesudah[tDone.id].dueAt) === iso(sebelum[tDone.id].dueAt),
      `${iso(sebelum[tDone.id].dueAt)} → ${iso(sesudah[tDone.id].dueAt)} (status=${sebelum[tDone.id].status})`,
    )

    const audit = await prisma.auditLog.findFirst({
      where: { recordId: voyageManual.id, tableName: 'Voyage' },
      orderBy: { createdAt: 'desc' },
    })
    cek(
      'pergeseran massal menulis TEPAT SATU baris AuditLog',
      auditSesudah - auditSebelum === 1 && audit?.newValue?.peristiwa === 'SINKRON_JADWAL_TUGAS',
      `+${auditSesudah - auditSebelum} baris; diperiksa=${audit?.newValue?.diperiksa}, digeser=${audit?.newValue?.digeser}`,
    )

    // Penyuntingan yang TIDAK menyentuh tanggal tidak boleh menerbitkan audit.
    const a1 = await prisma.auditLog.count({ where: { recordId: voyageManual.id } })
    await PATCH(sAdmin, `/api/voyages/${voyageManual.id}`, {
      vesselId: d.kapalA.id,
      portId: d.balikpapanA.id,
      eta: etaBaru,
      etd: '2026-09-04T08:00:00.000Z',
      baseCurrency: 'IDR',
      notes: 'sunting catatan saja',
    })
    const a2 = await prisma.auditLog.count({ where: { recordId: voyageManual.id } })
    cek('PATCH tanpa perubahan tanggal → tidak ada audit jadwal baru', a1 === a2, `${a1} = ${a2}`)
  }

  // === 5. Transisi status (K91/K99) ===
  console.log('\n5) Transisi status')
  let tugasUji = null
  {
    const r = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks`, {
      title: `${TAG}uji transisi`,
      assigneeUserId: d.users.operator.id,
    })
    tugasUji = r.json.tugas

    const langsung = await POST(sAdmin, `/api/tasks/${tugasUji.id}/status`, { status: 'DONE' })
    cek('TODO → DONE langsung → 409', langsung.status === 409, `HTTP ${langsung.status}: ${langsung.json.error?.message}`)

    const blokirTanpaAlasan = await POST(sAdmin, `/api/tasks/${tugasUji.id}/status`, { status: 'BLOCKED' })
    cek(
      'BLOCKED tanpa alasan → 400',
      blokirTanpaAlasan.status === 400,
      `HTTP ${blokirTanpaAlasan.status}: ${blokirTanpaAlasan.json.error?.message}`,
    )

    const mulai = await POST(sAdmin, `/api/tasks/${tugasUji.id}/status`, { status: 'IN_PROGRESS' })
    cek(
      'TODO → IN_PROGRESS → startedAt terisi',
      mulai.status === 200 && mulai.json.tugas?.startedAt !== null,
      `HTTP ${mulai.status}; startedAt=${iso(mulai.json.tugas?.startedAt)}`,
    )

    const selesai = await POST(sAdmin, `/api/tasks/${tugasUji.id}/status`, { status: 'DONE' })
    cek(
      'IN_PROGRESS → DONE → completedAt terisi',
      selesai.status === 200 && selesai.json.tugas?.completedAt !== null,
      `HTTP ${selesai.status}; completedAt=${iso(selesai.json.tugas?.completedAt)}`,
    )

    const bukaOper = await POST(sOper, `/api/tasks/${tugasUji.id}/status`, { status: 'IN_PROGRESS' })
    cek(
      'DONE → IN_PROGRESS oleh OPERATOR (pemilik tugas) → 403',
      bukaOper.status === 403,
      `HTTP ${bukaOper.status}: ${bukaOper.json.error?.message}`,
    )

    const bukaAdmin = await POST(sAdmin, `/api/tasks/${tugasUji.id}/status`, { status: 'IN_PROGRESS' })
    cek(
      'DONE → IN_PROGRESS oleh ADMIN → completedAt KOSONG lagi (K99)',
      bukaAdmin.status === 200 && bukaAdmin.json.tugas?.completedAt === null,
      `HTTP ${bukaAdmin.status}; completedAt=${iso(bukaAdmin.json.tugas?.completedAt)}`,
    )
    const dbSegar = await prisma.task.findFirst({ where: { id: tugasUji.id } })
    cek('completedAt benar-benar NULL di DB', dbSegar.completedAt === null, `db=${iso(dbSegar.completedAt)}`)

    const auditBuka = await prisma.auditLog.findFirst({
      where: { tableName: 'Task', recordId: tugasUji.id },
      orderBy: { createdAt: 'desc' },
    })
    cek(
      'buka kembali tercatat di AuditLog',
      auditBuka?.newValue?.bukaKembali === true,
      `bukaKembali=${auditBuka?.newValue?.bukaKembali}`,
    )
  }

  // === 6. Peran PENYUSUN_BIAYA (K98) ===
  console.log('\n6) K98 — PENYUSUN_BIAYA')
  {
    const buat = await POST(sBiaya, `/api/voyages/${voyageManual.id}/tasks`, { title: `${TAG}tak boleh lahir` })
    cek('PENYUSUN_BIAYA membuat tugas → 403', buat.status === 403, `HTTP ${buat.status}: ${buat.json.error?.message}`)

    const miliknya = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks`, {
      title: `${TAG}tugas milik penyusun biaya`,
      assigneeUserId: d.users.biaya.id,
    })
    const ubahMilik = await POST(sBiaya, `/api/tasks/${miliknya.json.tugas.id}/status`, {
      status: 'IN_PROGRESS',
    })
    cek(
      'PENYUSUN_BIAYA ubah status tugas yang ditugaskan kepadanya → berhasil',
      ubahMilik.status === 200 && ubahMilik.json.tugas?.status === 'IN_PROGRESS',
      `HTTP ${ubahMilik.status}`,
    )

    const orangLain = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks`, {
      title: `${TAG}tugas milik operator`,
      assigneeUserId: d.users.operator.id,
    })
    const ubahOrangLain = await POST(sBiaya, `/api/tasks/${orangLain.json.tugas.id}/status`, {
      status: 'IN_PROGRESS',
    })
    cek(
      'PENYUSUN_BIAYA ubah status tugas orang lain → 403',
      ubahOrangLain.status === 403,
      `HTTP ${ubahOrangLain.status}: ${ubahOrangLain.json.error?.message}`,
    )
  }

  // === 7. Penugasan oleh OPERATOR (K98) ===
  console.log('\n7) K98 — OPERATOR menugaskan')
  {
    const t = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks`, { title: `${TAG}uji penugasan` })
    const keOrangLain = await POST(sOper, `/api/tasks/${t.json.tugas.id}/assign`, {
      assigneeUserId: d.users.admin.id,
    })
    cek(
      'OPERATOR menugaskan ke orang lain → 403',
      keOrangLain.status === 403,
      `HTTP ${keOrangLain.status}: ${keOrangLain.json.error?.message}`,
    )
    const keDiri = await POST(sOper, `/api/tasks/${t.json.tugas.id}/assign`, {
      assigneeUserId: d.users.operator.id,
    })
    cek(
      'OPERATOR menugaskan ke diri sendiri → berhasil',
      keDiri.status === 200 && keDiri.json.tugas?.assigneeUserId === d.users.operator.id,
      `HTTP ${keDiri.status}`,
    )
  }

  // === 8. Lintas-tenant ===
  console.log('\n8) Lintas-tenant')
  {
    const tugasB = await prisma.task.create({
      data: {
        tenantId: d.tenantB.id,
        voyageId: d.voyageB.id,
        title: `${TAG}milik tenant B`,
        createdByUserId: d.users.adminB.id,
        boardOrder: 1,
      },
    })
    const r = await PATCH(sAdmin, `/api/tasks/${tugasB.id}`, { title: 'DIBAJAK' })
    const segar = await prisma.task.findFirst({ where: { id: tugasB.id } })
    cek(
      'tenant A PATCH tugas milik tenant B → 404',
      r.status === 404,
      `HTTP ${r.status}: ${r.json.error?.message}`,
    )
    cek('baris tenant B tidak berubah', segar.title === tugasB.title, `title="${segar.title}"`)

    const rGet = await GET(sAdmin, `/api/tasks/${tugasB.id}`)
    cek('tenant A GET tugas milik tenant B → 404', rGet.status === 404, `HTTP ${rGet.status}`)

    const daftarB = await GET(sB, '/api/tasks?semua=1')
    cek(
      'daftar tenant B hanya memuat tugasnya sendiri',
      Array.isArray(daftarB.json) && daftarB.json.every((t) => t.tenantId === d.tenantB.id),
      `${daftarB.json.length ?? 0} baris`,
    )
  }

  // === 9. Pindah urutan: hanya boardOrder yang berubah ===
  console.log('\n9) K92 — pindah urutan 3 kartu')
  {
    const kartu = []
    for (let i = 0; i < 3; i++) {
      const r = await POST(sAdmin, `/api/voyages/${voyageOtomatis.id}/tasks`, {
        title: `${TAG}kartu ${i + 1}`,
      })
      kartu.push(r.json.tugas)
    }
    const idKartu = kartu.map((k) => k.id)
    const sebelum = await prisma.task.findMany({
      where: { voyageId: voyageOtomatis.id, status: 'TODO', deletedAt: null },
      orderBy: { boardOrder: 'asc' },
    })

    const r = await POST(sAdmin, `/api/tasks/${idKartu[2]}/order`, { indeksTujuan: 0 })
    const sesudah = await prisma.task.findMany({
      where: { voyageId: voyageOtomatis.id, status: 'TODO', deletedAt: null },
      orderBy: { boardOrder: 'asc' },
    })

    const petaSesudah = Object.fromEntries(sesudah.map((t) => [t.id, t]))
    const kartuLain = sebelum.filter((t) => t.id !== idKartu[2])
    const lainUtuh = kartuLain.every(
      (t) => petaSesudah[t.id].boardOrder === t.boardOrder && +petaSesudah[t.id].updatedAt === +t.updatedAt,
    )
    const dipindah = petaSesudah[idKartu[2]]
    const bedaHanyaBoardOrder = Object.keys(dipindah).every(
      (k) =>
        ['boardOrder', 'updatedAt'].includes(k) ||
        JSON.stringify(dipindah[k]) === JSON.stringify(sebelum.find((t) => t.id === idKartu[2])[k]),
    )

    cek('pindah kartu → 200', r.status === 200, `HTTP ${r.status}; boardOrder=${r.json.boardOrder}`)
    cek(
      `kartu ${kartuLain.length} lain TIDAK tersentuh (boardOrder & updatedAt identik)`,
      lainUtuh,
      `dinormalisasi=${r.json.dinormalisasi}`,
    )
    cek('pada kartu yang dipindah, hanya boardOrder (+updatedAt) yang berubah', bedaHanyaBoardOrder)
    cek(
      'kartu yang dipindah kini paling atas kolomnya',
      sesudah[0].id === idKartu[2],
      `urutan: ${sesudah.map((t) => t.title.replace(TAG, '')).slice(0, 4).join(' | ')}`,
    )
  }

  // === 10. Sunting TaskTemplateItem sesudah instansiasi (K95 snapshot) ===
  console.log('\n10) K95 — sunting template tidak mengubah tugas yang sudah lahir')
  {
    const buat = await POST(sAdmin, '/api/task-templates', {
      name: `${TAG}Template Uji`,
      items: [{ title: `${TAG}butir asli`, anchor: 'ETA', offsetHours: -6, priority: 'HIGH' }],
    })
    cek('ADMIN membuat template → 201', buat.status === 201, `HTTP ${buat.status}`)

    const terap = await POST(sAdmin, `/api/voyages/${voyageManual.id}/tasks/apply-template`, {
      templateId: buat.json.template.id,
    })
    const lahir = await prisma.task.findFirst({
      where: { voyageId: voyageManual.id, sourceTemplateItemId: buat.json.template.items[0].id },
    })
    cek('template diterapkan → 1 tugas lahir', terap.json.dibuat === 1 && !!lahir, `dibuat=${terap.json.dibuat}`)

    const sunting = await PATCH(sAdmin, `/api/task-templates/${buat.json.template.id}`, {
      name: `${TAG}Template Uji (disunting)`,
      items: [{ title: `${TAG}butir SUDAH DIUBAH`, anchor: 'ETD', offsetHours: 999, priority: 'LOW' }],
    })
    const sesudah = await prisma.task.findFirst({ where: { id: lahir.id } })
    cek(
      'tugas yang sudah lahir TIDAK berubah sesudah template disunting',
      sunting.status === 200 &&
        sesudah.title === lahir.title &&
        sesudah.anchor === lahir.anchor &&
        sesudah.offsetHours === lahir.offsetHours &&
        iso(sesudah.dueAt) === iso(lahir.dueAt),
      `judul="${sesudah.title}" anchor=${sesudah.anchor} offset=${sesudah.offsetHours} dueAt=${iso(sesudah.dueAt)}`,
    )

    const olehOper = await POST(sOper, '/api/task-templates', {
      name: `${TAG}Tak Boleh Lahir`,
      items: [{ title: 'x' }],
    })
    cek(
      'OPERATOR mengelola TaskTemplate → 403 (K98: ADMIN saja)',
      olehOper.status === 403,
      `HTTP ${olehOper.status}: ${olehOper.json.error?.message}`,
    )
  }

  // === 11. Langganan kedaluwarsa (K33) ===
  console.log('\n11) K33 — tenant dengan langganan kedaluwarsa')
  {
    const t = await prisma.tenant.findFirst({
      where: { id: d.tenantB.id },
      select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true },
    })
    const r = await POST(sB, `/api/voyages/${d.voyageB.id}/tasks`, { title: `${TAG}tak boleh lahir` })
    const n = await prisma.task.count({ where: { voyageId: d.voyageB.id, title: `${TAG}tak boleh lahir` } })
    cek(
      'tenant kedaluwarsa membuat tugas → 403 dan nol baris',
      r.status === 403 && n === 0,
      `plan=${t.plan} trialEndsAt=${iso(t.trialEndsAt)}; HTTP ${r.status}: ${r.json.error?.message}`,
    )
  }

  // === 12. Hapus voyage yang punya tugas ===
  console.log('\n12) Hapus voyage yang punya tugas — KEPUTUSAN: ditolak')
  {
    const sebelum = await prisma.task.count({ where: { voyageId: voyageOtomatis.id, deletedAt: null } })
    const r = await DELETE(sAdmin, `/api/voyages/${voyageOtomatis.id}`)
    const sesudah = await prisma.task.count({ where: { voyageId: voyageOtomatis.id, deletedAt: null } })
    const v = await prisma.voyage.findFirst({ where: { id: voyageOtomatis.id } })
    cek(
      'DELETE voyage bertugas → 409 dengan pesan jelas',
      r.status === 409 && /tugas/i.test(r.json.error?.message ?? ''),
      `HTTP ${r.status}: ${r.json.error?.message}`,
    )
    cek(
      'voyage & tugasnya tetap utuh',
      v.deletedAt === null && sebelum === sesudah,
      `tugas ${sebelum} → ${sesudah}; voyage.deletedAt=${iso(v.deletedAt)}`,
    )
  }
}

// --------------------------------------------------------------------- main

let data = null
try {
  console.log(`Uji API Task/Checklist 7c → ${BASE_URL}`)
  data = await siapkanData()
  await jalankan(data)
} catch (e) {
  gagal++
  console.error('\n❌ Gagal di tengah jalan:', e)
} finally {
  await bersihkan(data).catch((e) => console.error('⚠️  pembersihan gagal:', e))
  await prisma.$disconnect()
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — ${lulus} lulus, ${gagal} gagal`)
process.exitCode = gagal === 0 ? 0 : 1
