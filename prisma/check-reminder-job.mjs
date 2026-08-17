// Uji job pengingat & endpoint ber-token — Fase 7e, §18/7e butir 1-11.
//
// Jalankan:  node prisma/check-reminder-job.mjs      (butuh `npm run dev` menyala)
//            BASE_URL=http://localhost:3001 node prisma/check-reminder-job.mjs
//
// KENAPA LEWAT HTTP: yang diuji di sini justru hal yang hanya ada di jalur
// lengkapnya — 401 untuk token yang salah, bentuk laporan JSON, dan job yang
// mengurus SELURUH tenant dalam satu panggilan. Memanggil service langsung akan
// melewati ketiganya. Butir 7 malah butuh dua sesi login sungguhan.
//
// CARA MENGUKUR "berapa yang lahir pada jalan ini": bukan dengan jendela waktu
// `createdAt >= t0` (yang bergantung pada jam server DB), melainkan dengan SELISIH
// HIMPUNAN ID notifikasi sebelum & sesudah tiap panggilan. Eksak, dan sekaligus
// jadi daftar bersih-bersih di akhir (butir 11).
//
// CARA "MENSIMULASIKAN HARI BERIKUTNYA" (butir 4) — jam sistem tidak diubah, dan
// route sengaja TIDAK menerima parameter waktu (lihat catatan di route). Yang
// dilakukan: baris `TASK_OVERDUE` yang sudah lahir hari ini ditulis ulang
// dedupeKey-nya ke tanggal KEMARIN — artinya "seolah-olah jalan tadi terjadi
// kemarin". Jalan berikutnya lalu harus melahirkan baris untuk tanggal HARI INI,
// dan kuncinya diperiksa sama persis dengan `TASK_OVERDUE:<taskId>:<YYYY-MM-DD
// hari ini UTC>` yang dihitung TERPISAH di skrip ini. Dua fakta itu bersama
// membuktikan yang dituntut butir 4: komponen tanggal berasal dari waktu JALAN,
// dan satu tanggal = satu baris.
//
// Skrip ini MENULIS ke database dev. Semua baris buatannya bertanda `7E-` dan
// dihapus lagi di akhir — termasuk saat gagal di tengah (blok finally), termasuk
// notifikasi yang lahir untuk data NYATA yang kebetulan ikut tersapu job.
// Jumlah baris global dibandingkan sebelum & sesudah seluruh uji (butir 11).

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
const TOKEN = process.env.JOB_RUNNER_TOKEN ?? ''
const TAG = '7E-'
const SANDI = 'Uji7eJob!2026'
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
const iso = (d) => (d ? new Date(d).toISOString() : null)
const hariUtc = (d) => new Date(d).toISOString().slice(0, 10)
const jamUtc = (d) => new Date(d).toISOString().slice(0, 13)

// ------------------------------------------------------------- sesi HTTP (butir 3 & 7)

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

async function jsonSesi(sesi, metode, path, body) {
  const res = await sesi.ambil(path, {
    method: metode,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

// ------------------------------------------------------------------ pemicu job

async function panggilJob({ token = TOKEN, job = 'reminders', kirimHeader = true } = {}) {
  const res = await fetch(`${BASE_URL}/api/jobs/run${job === null ? '' : `?job=${job}`}`, {
    method: 'POST',
    headers: kirimHeader ? { 'x-job-token': token } : {},
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

/** Semua kolom notifikasi yang dipakai uji ini. Tabelnya kecil di dev. */
const KOLOM_NOTIF = {
  id: true,
  tenantId: true,
  userId: true,
  type: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  dedupeKey: true,
  createdAt: true,
}

/** Notifikasi yang lahir selama seluruh uji — daftar bersih-bersih butir 11. */
const lahirSelamaUji = new Set()

/** Jalankan job dan kembalikan baris yang BENAR-BENAR baru (selisih himpunan id). */
async function jalankanDanUkur() {
  const sebelum = new Set(
    (await prisma.notification.findMany({ select: { id: true } })).map((r) => r.id),
  )
  const res = await panggilJob()
  const sesudah = await prisma.notification.findMany({ select: KOLOM_NOTIF })
  const baru = sesudah.filter((n) => !sebelum.has(n.id))
  for (const n of baru) lahirSelamaUji.add(n.id)
  return { ...res, baru }
}

const untukTugas = (baris, taskId) => baris.filter((n) => n.entityId === taskId)
const hasilTenant = (res, tenantId) => (res.json.hasil ?? []).find((h) => h.tenant === tenantId)

// -------------------------------------------------------------- data disposable

const D = {} // wadah semua id disposable

async function siapkanData() {
  D.tenantA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } } })
  D.tenantB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!D.tenantA || !D.tenantB) throw new Error('Tenant Tribuana / Verifikasi tidak ada di DB dev.')

  const sandi = await bcrypt.hash(SANDI, 10)
  const buatUser = (tenantId, email, role, isActive = true) =>
    prisma.user.create({
      data: { tenantId, email, name: `${TAG}${role}${isActive ? '' : '-NONAKTIF'}`, password: sandi, role, isActive },
    })

  D.u = {
    admin: await buatUser(D.tenantA.id, '7e-admin@tribuanagency.co.id', 'ADMIN'),
    manajer: await buatUser(D.tenantA.id, '7e-manajer@tribuanagency.co.id', 'MANAJER_OPERASI'),
    manajerNonaktif: await buatUser(
      D.tenantA.id,
      '7e-manajer-nonaktif@tribuanagency.co.id',
      'MANAJER_OPERASI',
      false,
    ),
    penerimaTugas: await buatUser(D.tenantA.id, '7e-pj@tribuanagency.co.id', 'OPERATOR'),
    lain: await buatUser(D.tenantA.id, '7e-lain@tribuanagency.co.id', 'OPERATOR'),
  }
  D.adminB = await prisma.user.findFirst({
    where: { tenantId: D.tenantB.id, role: 'ADMIN', isActive: true },
  })
  if (!D.adminB) throw new Error('Tenant B tidak punya ADMIN aktif.')

  D.kapalA = await prisma.vessel.create({
    data: { tenantId: D.tenantA.id, name: `${TAG}MV Pengingat A`, gt: 4200 },
  })
  D.kapalB = await prisma.vessel.create({
    data: { tenantId: D.tenantB.id, name: `${TAG}MV Pengingat B`, gt: 4200 },
  })

  // ETA 12 jam lagi → tugas ber-offset −6 jam jatuh tempo 6 jam lagi (butir 2).
  D.etaAwal = new Date(Date.now() + 12 * JAM)
  D.voyage = await prisma.voyage.create({
    data: {
      tenantId: D.tenantA.id,
      voyageNumber: `${TAG}VYG-7E-${Date.now().toString(36)}`,
      vesselId: D.kapalA.id,
      eta: D.etaAwal,
      status: 'PLANNED',
      dataOrigin: 'UJI',
    },
  })
}

const buatTugas = (data) =>
  prisma.task.create({
    data: {
      tenantId: D.tenantA.id,
      createdByUserId: D.u.admin.id,
      status: 'TODO',
      ...data,
    },
  })

// ============================================================================ uji

async function butir1() {
  console.log('\n[1] Endpoint ber-token: tanpa token / token salah / token benar')

  const tanpa = await panggilJob({ kirimHeader: false })
  cek('tanpa header x-job-token → 401', tanpa.status === 401, `status=${tanpa.status} body=${JSON.stringify(tanpa.json)}`)

  const salah = await panggilJob({ token: 'token-salah-yang-panjangnya-lain' })
  cek('token salah → 401', salah.status === 401, `status=${salah.status}`)

  const samaPanjang = await panggilJob({ token: 'X'.repeat(TOKEN.length) })
  cek(
    'token salah tapi SAMA PANJANG → 401 (bukan 500 dari timingSafeEqual)',
    samaPanjang.status === 401,
    `status=${samaPanjang.status}`,
  )

  const benar = await panggilJob()
  const h = benar.json.hasil?.[0] ?? {}
  cek('token benar → 200', benar.status === 200, `status=${benar.status}`)
  cek(
    'laporan memuat {dibuat, dilewati, dibatasi} per tenant',
    typeof h.dibuat === 'number' && typeof h.dilewati === 'number' && typeof h.dibatasi === 'number',
    JSON.stringify(benar.json.total),
  )
  info(`hasil tenant ke-1: ${JSON.stringify(h)}`)

  const asing = await panggilJob({ job: 'tidak-ada' })
  cek('?job tak dikenal → 400 (dispatch, bukan asumsi satu job)', asing.status === 400, `status=${asing.status} ${JSON.stringify(asing.json.error?.message ?? '')}`)
}

async function butir2() {
  console.log('\n[2] Tugas jatuh tempo 6 jam lagi → satu TASK_DUE bertarget; 5 jalan lagi → nihil')

  D.tDue = await buatTugas({
    voyageId: D.voyage.id,
    title: `${TAG}Siapkan dokumen clearance`,
    assigneeUserId: D.u.penerimaTugas.id,
    anchor: 'ETA',
    offsetHours: -6,
    dueAt: new Date(D.etaAwal.getTime() - 6 * JAM),
  })
  D.dueAt1 = (await prisma.task.findFirst({ where: { id: D.tDue.id } })).dueAt

  const r = await jalankanDanUkur()
  const milik = untukTugas(r.baru, D.tDue.id)
  const kunciHarap = `TASK_DUE:${D.tDue.id}:${jamUtc(D.dueAt1)}`

  cek('tepat satu notifikasi lahir untuk tugas itu', milik.length === 1, `lahir=${milik.length}`)
  cek('type = TASK_DUE', milik[0]?.type === 'TASK_DUE', `type=${milik[0]?.type}`)
  cek(
    'userId = penanggung jawab (bukan siaran)',
    milik[0]?.userId === D.u.penerimaTugas.id,
    `userId=${milik[0]?.userId} pj=${D.u.penerimaTugas.id}`,
  )
  cek('dedupeKey sesuai K101', milik[0]?.dedupeKey === kunciHarap, `${milik[0]?.dedupeKey}`)
  D.notifDue1 = milik[0]?.id

  for (let i = 0; i < 5; i++) await jalankanDanUkur()
  const jml = await prisma.notification.count({ where: { entityId: D.tDue.id, type: 'TASK_DUE' } })
  cek('sesudah 5 jalan tambahan, count di DB tetap 1', jml === 1, `count=${jml}`)
}

async function butir3() {
  console.log('\n[3] ETA digeser → dueAt bergeser → satu notifikasi BARU, yang lama tetap ada')

  const sesiAdmin = await login(D.u.admin.email)
  const etaBaru = new Date(D.etaAwal.getTime() - 2 * JAM)
  // updateVoyage() membaca SELURUH input (vesselId wajib), bukan patch parsial.
  const patch = await jsonSesi(sesiAdmin, 'PATCH', `/api/voyages/${D.voyage.id}`, {
    vesselId: D.kapalA.id,
    status: 'PLANNED',
    baseCurrency: 'IDR',
    eta: etaBaru.toISOString(),
  })
  cek('PATCH /api/voyages/[id] eta → 200', patch.status === 200, `status=${patch.status}`)

  const segar = await prisma.task.findFirst({ where: { id: D.tDue.id } })
  cek(
    'dueAt tugas ikut bergeser 2 jam (K94)',
    segar.dueAt.getTime() === D.dueAt1.getTime() - 2 * JAM,
    `${iso(D.dueAt1)} → ${iso(segar.dueAt)}`,
  )

  const r = await jalankanDanUkur()
  const milik = untukTugas(r.baru, D.tDue.id)
  const kunciBaru = `TASK_DUE:${D.tDue.id}:${jamUtc(segar.dueAt)}`

  cek('tepat satu notifikasi baru', milik.length === 1, `lahir=${milik.length}`)
  cek('kuncinya berbeda dari yang lama', milik[0]?.dedupeKey === kunciBaru, `${milik[0]?.dedupeKey}`)

  const lama = await prisma.notification.findFirst({ where: { id: D.notifDue1 } })
  cek('notifikasi lama MASIH ADA (tidak dibersihkan)', !!lama, `id=${D.notifDue1}`)
  const total = await prisma.notification.count({ where: { entityId: D.tDue.id, type: 'TASK_DUE' } })
  cek('total dua baris untuk tugas yang sama', total === 2, `count=${total}`)
}

async function butir4() {
  console.log('\n[4] TASK_OVERDUE paling banyak sekali per hari kalender')

  D.tLate = await buatTugas({
    title: `${TAG}Kirim manifest ke bea cukai`,
    assigneeUserId: D.u.penerimaTugas.id,
    dueAt: new Date(Date.now() - 30 * JAM),
    dueAtManual: true,
  })

  const r1 = await jalankanDanUkur()
  const milik = untukTugas(r1.baru, D.tLate.id)
  const kunciHariIni = `TASK_OVERDUE:${D.tLate.id}:${hariUtc(new Date())}`
  cek('jalan ke-1 → satu TASK_OVERDUE', milik.length === 1 && milik[0].type === 'TASK_OVERDUE', `lahir=${milik.length}`)
  cek('kunci = TASK_OVERDUE:<taskId>:<YYYY-MM-DD>', milik[0]?.dedupeKey === kunciHariIni, `${milik[0]?.dedupeKey}`)

  await jalankanDanUkur()
  await jalankanDanUkur()
  const jml3 = await prisma.notification.count({
    where: { entityId: D.tLate.id, type: 'TASK_OVERDUE' },
  })
  cek('3 jalan dalam satu hari → tetap 1 baris', jml3 === 1, `count=${jml3}`)

  // "Seolah-olah jalan tadi terjadi kemarin" — lihat catatan kepala berkas.
  const kemarin = hariUtc(new Date(Date.now() - 24 * JAM))
  await prisma.notification.updateMany({
    where: { id: milik[0].id },
    data: { dedupeKey: `TASK_OVERDUE:${D.tLate.id}:${kemarin}` },
  })
  info(`kunci baris lama ditulis ulang ke tanggal ${kemarin} (simulasi "jalan kemarin")`)

  const r2 = await jalankanDanUkur()
  const milik2 = untukTugas(r2.baru, D.tLate.id)
  cek('jalan "hari berikutnya" → baris kedua lahir', milik2.length === 1, `lahir=${milik2.length}`)
  cek(
    'kunci baris kedua memakai tanggal HARI INI (dari waktu jalan job)',
    milik2[0]?.dedupeKey === kunciHariIni,
    `${milik2[0]?.dedupeKey}`,
  )
  const jml4 = await prisma.notification.count({
    where: { entityId: D.tLate.id, type: 'TASK_OVERDUE' },
  })
  cek('total dua baris untuk dua tanggal berbeda', jml4 === 2, `count=${jml4}`)
}

async function butir5() {
  console.log('\n[5] SLA_BREACH: sekali seumur hidup tugas, SATU BARIS PER ADMIN/MANAJER_OPERASI aktif (K103/P34)')

  D.tBreach = await buatTugas({
    title: `${TAG}Bayar PNBP labuh`,
    assigneeUserId: D.u.penerimaTugas.id,
    status: 'DONE',
    dueAt: new Date(Date.now() - 10 * JAM),
    completedAt: new Date(Date.now() - 2 * JAM),
  })

  const penerimaSah = await prisma.user.findMany({
    where: { tenantId: D.tenantA.id, role: { in: ['ADMIN', 'MANAJER_OPERASI'] }, isActive: true },
    select: { id: true, email: true, role: true },
    orderBy: { id: 'asc' },
  })
  info(`penerima sah di tenant A (hitung langsung DB): ${penerimaSah.length} → ${penerimaSah.map((u) => `${u.role}/${u.email}`).join(', ')}`)

  const r = await jalankanDanUkur()
  const milik = untukTugas(r.baru, D.tBreach.id)

  cek(
    `jumlah baris = jumlah pengguna ADMIN+MANAJER_OPERASI aktif (${penerimaSah.length})`,
    milik.length === penerimaSah.length,
    `lahir=${milik.length}`,
  )
  cek('semua type = SLA_BREACH', milik.every((n) => n.type === 'SLA_BREACH'), `${milik.length} baris`)
  cek(
    'TIDAK ADA baris siaran (userId=null) — bukan broadcast',
    milik.every((n) => n.userId !== null),
    `null=${milik.filter((n) => n.userId === null).length}`,
  )
  const idPenerima = milik.map((n) => n.userId).sort()
  cek(
    'userId-nya persis himpunan penerima sah, tanpa kembar',
    new Set(idPenerima).size === milik.length &&
      JSON.stringify(idPenerima) === JSON.stringify(penerimaSah.map((u) => u.id).sort()),
    JSON.stringify(idPenerima),
  )
  cek(
    'dedupeKey = SLA_BREACH:<taskId>:<userId> untuk tiap penerima',
    milik.every((n) => n.dedupeKey === `SLA_BREACH:${D.tBreach.id}:${n.userId}`),
    milik.map((n) => n.dedupeKey).join(' | '),
  )
  cek(
    'MANAJER_OPERASI NONAKTIF tidak kebagian',
    !milik.some((n) => n.userId === D.u.manajerNonaktif.id),
  )
  cek(
    'OPERATOR (penanggung jawab tugas) tidak kebagian eskalasi',
    !milik.some((n) => n.userId === D.u.penerimaTugas.id),
  )

  const r2 = await jalankanDanUkur()
  cek('jalan berikutnya → nol baris tambahan untuk tugas itu', untukTugas(r2.baru, D.tBreach.id).length === 0)
  const total = await prisma.notification.count({
    where: { entityId: D.tBreach.id, type: 'SLA_BREACH' },
  })
  cek(`total tetap ${penerimaSah.length}`, total === penerimaSah.length, `count=${total}`)
  D.jmlPenerimaEskalasi = penerimaSah.length
}

async function butir6() {
  console.log('\n[6] Tugas terlambat TANPA penanggung jawab → siaran "belum ada penanggung jawab"')

  D.tYatim = await buatTugas({
    title: `${TAG}Ambil dokumen di syahbandar`,
    assigneeUserId: null,
    dueAt: new Date(Date.now() - 20 * JAM),
    dueAtManual: true,
  })

  const r = await jalankanDanUkur()
  const milik = untukTugas(r.baru, D.tYatim.id)
  cek('tepat satu notifikasi', milik.length === 1, `lahir=${milik.length}`)
  cek('userId = null (siaran)', milik[0]?.userId === null, `userId=${milik[0]?.userId}`)
  const teks = `${milik[0]?.title ?? ''} ${milik[0]?.message ?? ''}`
  cek('teks memuat "belum ada penanggung jawab"', teks.includes('belum ada penanggung jawab'))
  cek('teks memuat "no assignee"', teks.toLowerCase().includes('no assignee'))
  info(`judul: ${milik[0]?.title}`)
  info(`pesan: ${milik[0]?.message}`)
  D.notifYatim = milik[0]?.id
}

async function butir7() {
  console.log('\n[7] Bertarget benar-benar bertarget: lonceng pengguna lain')

  const sesiLain = await login(D.u.lain.email)
  const lonceng = await jsonSesi(sesiLain, 'GET', '/api/notifications')
  cek('GET /api/notifications sebagai pengguna lain → 200', lonceng.status === 200, `status=${lonceng.status}`)
  const idTampil = (lonceng.json.rows ?? []).map((r) => r.id)

  const idDue = (
    await prisma.notification.findMany({
      where: { entityId: D.tDue.id, type: 'TASK_DUE' },
      select: { id: true },
    })
  ).map((r) => r.id)

  cek(
    'notifikasi TASK_DUE milik orang pertama TIDAK muncul di lonceng orang lain',
    idDue.every((id) => !idTampil.includes(id)),
    `${idDue.length} baris TASK_DUE diperiksa, ${idTampil.length} baris terlihat oleh ${D.u.lain.email}`,
  )
  cek(
    'notifikasi SIARAN (tugas yatim) TETAP muncul di lonceng orang lain — bukti endpoint memang membaca',
    idTampil.includes(D.notifYatim),
  )

  const sesiPj = await login(D.u.penerimaTugas.email)
  const loncengPj = await jsonSesi(sesiPj, 'GET', '/api/notifications')
  const idPj = (loncengPj.json.rows ?? []).map((r) => r.id)
  cek(
    'penanggung jawab MELIHAT TASK_DUE miliknya',
    idDue.every((id) => idPj.includes(id)),
    `${idPj.length} baris terlihat oleh ${D.u.penerimaTugas.email}`,
  )
  cek(
    'penanggung jawab TIDAK melihat eskalasi SLA_BREACH (bukan untuk dia)',
    !(loncengPj.json.rows ?? []).some(
      (r) => r.type === 'SLA_BREACH' && r.entityId === D.tBreach.id,
    ),
  )
}

async function butir8() {
  console.log('\n[8] Job TIDAK PERNAH menyentuh Task (K102)')

  const potret = () =>
    prisma.task.findMany({ select: { id: true, updatedAt: true, status: true }, orderBy: { id: 'asc' } })

  const sebelum = await potret()
  await jalankanDanUkur()
  const sesudah = await potret()

  cek('jumlah baris Task identik', sebelum.length === sesudah.length, `${sebelum.length} vs ${sesudah.length}`)
  cek(
    'seluruh Task.updatedAt identik sebelum & sesudah job',
    JSON.stringify(sebelum.map((t) => [t.id, iso(t.updatedAt)])) ===
      JSON.stringify(sesudah.map((t) => [t.id, iso(t.updatedAt)])),
    `${sebelum.length} baris dibandingkan (seluruh tabel, semua tenant)`,
  )
  cek(
    'seluruh Task.status identik',
    JSON.stringify(sebelum.map((t) => t.status)) === JSON.stringify(sesudah.map((t) => t.status)),
  )
}

async function butir9() {
  console.log('\n[9] Batas 500 notifikasi per tenant per jalan')

  const dasar = Date.now() - 48 * JAM
  await prisma.task.createMany({
    data: Array.from({ length: 600 }, (_, i) => ({
      tenantId: D.tenantA.id,
      createdByUserId: D.u.admin.id,
      title: `${TAG}VOL-${String(i).padStart(3, '0')}`,
      status: 'TODO',
      assigneeUserId: D.u.penerimaTugas.id,
      dueAt: new Date(dasar + i * 1000),
      dueAtManual: true,
    })),
  })
  const idVol = (
    await prisma.task.findMany({
      where: { tenantId: D.tenantA.id, title: { startsWith: `${TAG}VOL-` } },
      select: { id: true },
    })
  ).map((r) => r.id)
  cek('600 tugas terlambat dibuat', idVol.length === 600, `count=${idVol.length}`)
  const himpunanVol = new Set(idVol)

  const r1 = await jalankanDanUkur()
  const hA1 = hasilTenant(r1, D.tenantA.id)
  const vol1 = r1.baru.filter((n) => himpunanVol.has(n.entityId))
  cek('jalan ke-1 melahirkan ≤ 500 notifikasi di tenant A', hA1.dibuat <= 500, `dibuat=${hA1.dibuat}`)
  cek('jalan ke-1 tepat 500 (jatah penuh terpakai)', hA1.dibuat === 500, `dibuat=${hA1.dibuat}`)
  cek('laporan dibatasi > 0', hA1.dibatasi > 0, `dibatasi=${hA1.dibatasi}`)
  info(`laporan jalan ke-1 tenant A: ${JSON.stringify(hA1)}`)
  info(`baris baru yang menyangkut 600 tugas volume: ${vol1.length}`)

  const r2 = await jalankanDanUkur()
  const hA2 = hasilTenant(r2, D.tenantA.id)
  const vol2 = r2.baru.filter((n) => himpunanVol.has(n.entityId))
  cek('jalan ke-2 menyelesaikan sisanya', vol1.length + vol2.length === 600, `${vol1.length}+${vol2.length}`)
  cek('jalan ke-2 tidak lagi dibatasi', hA2.dibatasi === 0, `dibatasi=${hA2.dibatasi}`)
  info(`laporan jalan ke-2 tenant A: ${JSON.stringify(hA2)}`)

  const barisVol = await prisma.notification.findMany({
    where: { entityId: { in: idVol } },
    select: { dedupeKey: true, entityId: true },
  })
  cek('tepat 600 baris untuk 600 tugas', barisVol.length === 600, `count=${barisVol.length}`)
  cek(
    'tanpa duplikat — 600 dedupeKey unik',
    new Set(barisVol.map((b) => b.dedupeKey)).size === 600,
    `unik=${new Set(barisVol.map((b) => b.dedupeKey)).size}`,
  )

  const r3 = await jalankanDanUkur()
  const hA3 = hasilTenant(r3, D.tenantA.id)
  cek('jalan ke-3 → nol baru, semuanya dilewati', r3.baru.length === 0 && hA3.dibuat === 0, `dibuat=${hA3.dibuat} dilewati=${hA3.dilewati}`)
}

async function butir10() {
  console.log('\n[10] Lintas-tenant')

  D.tB = await prisma.task.create({
    data: {
      tenantId: D.tenantB.id,
      createdByUserId: D.adminB.id,
      title: `${TAG}Tugas terlambat tenant B`,
      status: 'TODO',
      assigneeUserId: D.adminB.id,
      dueAt: new Date(Date.now() - 26 * JAM),
      dueAtManual: true,
    },
  })

  const r = await jalankanDanUkur()
  for (const t of [D.tenantA, D.tenantB]) {
    const dilaporkan = hasilTenant(r, t.id)?.dibuat ?? -1
    const nyata = r.baru.filter((n) => n.tenantId === t.id).length
    cek(
      `laporan "dibuat" tenant ${t.companyName} cocok hitungan langsung DB`,
      dilaporkan === nyata,
      `laporan=${dilaporkan} DB=${nyata}`,
    )
  }
  cek('tugas tenant B memicu tepat satu notifikasi di tenant B', untukTugas(r.baru, D.tB.id).length === 1)
  cek(
    'notifikasi tugas tenant B tersimpan di tenant B',
    untukTugas(r.baru, D.tB.id)[0]?.tenantId === D.tenantB.id,
  )

  // Setiap notifikasi ber-dedupeKey harus menunjuk Task milik tenantnya sendiri.
  const semua = await prisma.notification.findMany({
    where: { dedupeKey: { not: null }, entityType: 'TASK' },
    select: { tenantId: true, entityId: true },
  })
  let salahTenant = 0
  for (const t of [D.tenantA, D.tenantB]) {
    const idnya = Array.from(new Set(semua.filter((n) => n.tenantId === t.id).map((n) => n.entityId)))
    const cocok = await prisma.task.count({ where: { id: { in: idnya }, tenantId: t.id } })
    if (cocok !== idnya.length) salahTenant += idnya.length - cocok
    info(`${t.companyName}: ${idnya.length} tugas dirujuk, ${cocok} terbukti milik tenant ini`)
  }
  cek('nol notifikasi menyebut entitas tenant lain', salahTenant === 0, `menyimpang=${salahTenant}`)
}

// ------------------------------------------------------------------ bersih-bersih

async function hitungGlobal() {
  return {
    notification: await prisma.notification.count(),
    task: await prisma.task.count(),
    user: await prisma.user.count(),
    voyage: await prisma.voyage.count(),
    vessel: await prisma.vessel.count(),
    auditLog: await prisma.auditLog.count(),
  }
}

async function bersihkan(auditSebelum) {
  const idNotif = Array.from(lahirSelamaUji)
  let hapusNotif = 0
  for (let i = 0; i < idNotif.length; i += 500) {
    hapusNotif += (
      await prisma.notification.deleteMany({ where: { id: { in: idNotif.slice(i, i + 500) } } })
    ).count
  }

  const auditSesudah = await prisma.auditLog.findMany({ select: { id: true } })
  const auditBaru = auditSesudah.map((a) => a.id).filter((id) => !auditSebelum.has(id))
  const hapusAudit = auditBaru.length
    ? (await prisma.auditLog.deleteMany({ where: { id: { in: auditBaru } } })).count
    : 0

  const hapusTugas = (await prisma.task.deleteMany({ where: { title: { startsWith: TAG } } })).count
  const hapusVoyage = (await prisma.voyage.deleteMany({ where: { voyageNumber: { startsWith: TAG } } })).count
  const hapusKapal = (await prisma.vessel.deleteMany({ where: { name: { startsWith: TAG } } })).count
  const hapusUser = (await prisma.user.deleteMany({ where: { email: { startsWith: '7e-' } } })).count

  console.log(
    `     dihapus → notifikasi ${hapusNotif}, auditLog ${hapusAudit}, tugas ${hapusTugas}, ` +
      `voyage ${hapusVoyage}, kapal ${hapusKapal}, pengguna ${hapusUser}`,
  )
}

// ------------------------------------------------------------------------ main

async function main() {
  console.log(`Uji job pengingat Fase 7e — ${BASE_URL}`)
  if (!TOKEN) throw new Error('JOB_RUNNER_TOKEN belum ada di .env.local / .env')

  const awal = await hitungGlobal()
  const auditSebelum = new Set((await prisma.auditLog.findMany({ select: { id: true } })).map((a) => a.id))
  console.log(`Baris global sebelum uji: ${JSON.stringify(awal)}`)

  try {
    await siapkanData()
    await butir1()
    await butir2()
    await butir3()
    await butir4()
    await butir5()
    await butir6()
    await butir7()
    await butir8()
    await butir9()
    await butir10()
  } finally {
    console.log('\n[11] Bersih-bersih data disposable')
    await bersihkan(auditSebelum)
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
