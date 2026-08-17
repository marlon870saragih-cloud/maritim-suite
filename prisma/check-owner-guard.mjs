// Uji pagar kepemilikan entitas polimorfik — K85, Fase 7a.
//
// Jalankan:  node prisma/check-owner-guard.mjs     (butuh `npm run dev` menyala)
//
// KENAPA ADA. Attachment/Comment/EmailLog memakai (entityType, entityId) tanpa
// FK (K84). Artinya database TIDAK menjamin bahwa entityId menunjuk baris yang
// ada — apalagi baris milik tenant yang sama. tenant-guard menyaring baris
// lampirannya sendiri dan MERASA cukup; yang tidak diperiksanya adalah entitas
// yang ditunjuk. Tanpa pastikanEntitasMilikTenant(), operator tenant A bisa
// mengunggah ke entityId milik tenant B: tersimpan rapi, tersaring dari daftar
// A, dan muncul di layar B — tanpa satu pun galat. Berkas ini membuktikan
// kebocoran senyap itu tertutup.
//
// Uji ini MENULIS ke database dev (semuanya berawalan `7A-`) lalu menghapusnya
// lagi di akhir, termasuk satu voyage di tenant kedua. Tidak ada baris milik
// Tribuana yang sudah ada yang diubah.
//
// ⚠️ CARA MEMBUKTIKAN UJI INI NYATA (diwajibkan §18/7a butir 10):
//    komentari sementara panggilan `pastikanEntitasMilikTenant(...)` di
//    src/services/ops/attachment.service.ts (atau comment.service.ts), lalu
//    jalankan ulang berkas ini. Ia HARUS gagal — butir "lintas-tenant" akan
//    melaporkan 201 alih-alih 404 dan menemukan baris yang seharusnya tak lahir.
//    Kembalikan kodenya, jalankan lagi, semua lulus.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
// owner-guard.ts sengaja TANPA impor, jadi Node bisa menjalankannya langsung —
// uji memakai peta yang PERSIS SAMA dengan yang dipakai aplikasi (K11/K51).
import {
  DAFTAR_ENTITAS,
  ENTITAS_DIDUKUNG,
  entitasDidukung,
  namaModelSchema,
  periksaBentukEntitas,
} from '../src/services/ops/owner-guard.ts'
import { TENANT_MODELS } from '../src/services/tenant-guard.ts'

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
const SANDI = 'Uji7aOwner!2026'
const TAG = '7A-'
const EMAIL_A = 'owner-7a-a@tribuanagency.co.id'
const EMAIL_B = 'owner-7a-b@verifikasi.local'

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

async function login(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login gagal untuk ${email}`)
  return sesi
}

/** Unggah satu berkas kecil lewat API sungguhan (multipart). */
async function unggah(sesi, entityType, entityId, { nama = 'uji.pdf', isi = null } = {}) {
  const form = new FormData()
  if (entityType !== null) form.set('entityType', entityType)
  if (entityId !== null) form.set('entityId', entityId)
  const data = isi ?? Buffer.from('%PDF-1.4\n% uji owner-guard 7a\n')
  form.set('file', new Blob([data], { type: 'application/pdf' }), nama)
  const res = await sesi.ambil('/api/attachments', { method: 'POST', body: form })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

async function berkomentar(sesi, entityType, entityId, body = 'catatan uji 7a') {
  const res = await sesi.ambil('/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entityType, entityId, body }),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

// -------------------------------------------------------------- data disposable

async function siapkanData() {
  const tenantA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } } })
  const tenantB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!tenantA || !tenantB) throw new Error('Tenant Tribuana / Verifikasi tidak ditemukan di DB dev.')

  const sandi = await bcrypt.hash(SANDI, 10)
  const userA = await prisma.user.create({
    data: { tenantId: tenantA.id, email: EMAIL_A, name: `${TAG}Penguji A`, password: sandi, role: 'ADMIN' },
  })
  const userB = await prisma.user.create({
    data: { tenantId: tenantB.id, email: EMAIL_B, name: `${TAG}Penguji B`, password: sandi, role: 'ADMIN' },
  })

  // Entitas milik A (sasaran sah) dan milik B (sasaran terlarang bagi A).
  const kapalA = await prisma.vessel.create({
    data: { tenantId: tenantA.id, name: `${TAG}MV Uji A`, gt: 5000 },
  })
  const voyageA = await prisma.voyage.create({
    data: {
      tenantId: tenantA.id,
      voyageNumber: `${TAG}VYG-A`,
      vesselId: kapalA.id,
      baseCurrency: 'IDR',
      dataOrigin: 'UJI',
    },
  })

  const kapalB = await prisma.vessel.create({
    data: { tenantId: tenantB.id, name: `${TAG}MV Uji B`, gt: 5000 },
  })
  const voyageB = await prisma.voyage.create({
    data: {
      tenantId: tenantB.id,
      voyageNumber: `${TAG}VYG-B`,
      vesselId: kapalB.id,
      baseCurrency: 'IDR',
      dataOrigin: 'UJI',
    },
  })

  return { tenantA, tenantB, userA, userB, kapalA, kapalB, voyageA, voyageB }
}

async function bersihkan(d) {
  if (!d) return
  // Lampiran & komentar dulu (tak punya FK ke voyage — polimorfik), lalu induknya.
  const idEntitas = [d.voyageA?.id, d.voyageB?.id].filter(Boolean)
  if (idEntitas.length) {
    await prisma.attachment.deleteMany({ where: { entityId: { in: idEntitas } } })
    await prisma.comment.deleteMany({ where: { entityId: { in: idEntitas } } })
  }
  await prisma.notification.deleteMany({ where: { entityId: { in: idEntitas } } })
  for (const v of [d.voyageA, d.voyageB]) if (v) await prisma.voyage.deleteMany({ where: { id: v.id } })
  for (const k of [d.kapalA, d.kapalB]) if (k) await prisma.vessel.deleteMany({ where: { id: k.id } })
  for (const u of [d.userA, d.userB]) if (u) await prisma.user.deleteMany({ where: { id: u.id } })
}

// ------------------------------------------------------------------------ uji

async function main() {
  // ---------- 1. Peta daftar putih (MURNI — tanpa DB, tanpa server) ----------
  console.log('\n1. ENTITAS_DIDUKUNG adalah daftar putih yang tertutup')

  cek('peta tidak kosong', DAFTAR_ENTITAS.length > 0, `${DAFTAR_ENTITAS.length} entitas`)

  for (const jahat of ['RANDOM', 'random', 'Voyage', '', '__proto__', 'constructor', 'toString']) {
    let ditolak = false
    try {
      periksaBentukEntitas(jahat, 'apa-saja')
    } catch (e) {
      ditolak = e?.kode === 'VALIDATION'
    }
    cek(`entityType ${JSON.stringify(jahat)} ditolak sebagai VALIDATION`, ditolak)
  }

  cek('entityId kosong ditolak', (() => {
    try {
      periksaBentukEntitas('VOYAGE', '   ')
      return false
    } catch (e) {
      return e?.kode === 'VALIDATION'
    }
  })())

  cek('entityType sah diterima & memetakan ke model', (() => {
    const h = periksaBentukEntitas('DISBURSEMENT', ' abc ')
    return h.entityType === 'DISBURSEMENT' && h.bentuk.model === 'disbursement' && h.entityId === 'abc'
  })())

  cek('entitasDidukung() tidak tertipu rantai prototipe', !entitasDidukung('hasOwnProperty'))

  // Pagar ini hanya berarti bila model yang diperiksanya MEMANG disaring
  // tenant-guard. Kalau tidak, findFirst-nya akan menemukan baris tenant mana
  // pun dan seluruh pemeriksaan jadi teater.
  const takBerpagar = Object.values(ENTITAS_DIDUKUNG)
    .map((e) => namaModelSchema(e.model))
    .filter((m) => !TENANT_MODELS.has(m))
  cek(
    'semua model di peta juga terdaftar di TENANT_MODELS',
    takBerpagar.length === 0,
    takBerpagar.length ? `TIDAK tersaring: ${takBerpagar.join(', ')}` : '',
  )

  // ---------- Sisanya butuh server + DB ----------
  let d
  try {
    d = await siapkanData()
    const sesiA = await login(EMAIL_A, SANDI)
    const sesiB = await login(EMAIL_B, SANDI)

    console.log(`\n   tenant A = ${d.tenantA.companyName}`)
    console.log(`   tenant B = ${d.tenantB.companyName}`)

    // ---------- 2. Kendali positif ----------
    // Tanpa butir ini, uji lintas-tenant di bawah bisa "lulus" hanya karena
    // endpoint-nya rusak dan SEMUA permintaan gagal.
    console.log('\n2. Kendali positif — jalur yang sah memang berhasil')
    const sahUnggah = await unggah(sesiA, 'VOYAGE', d.voyageA.id)
    cek('tenant A mengunggah ke voyage MILIKNYA → 201', sahUnggah.status === 201, `status ${sahUnggah.status}`)
    const sahKomentar = await berkomentar(sesiA, 'VOYAGE', d.voyageA.id)
    cek('tenant A berkomentar pada voyage MILIKNYA → 201', sahKomentar.status === 201, `status ${sahKomentar.status}`)

    // ---------- 3. Lintas-tenant: LAMPIRAN ----------
    console.log('\n3. K85 — tenant A mengunggah ke entityId milik tenant B')
    const lampiranSebelum = await prisma.attachment.count()
    const serang1 = await unggah(sesiA, 'VOYAGE', d.voyageB.id)
    const lampiranSesudah = await prisma.attachment.count()

    cek(
      'unggahan lintas-tenant ditolak 404 (bukan 403 — keberadaan data tak dibocorkan)',
      serang1.status === 404,
      `status ${serang1.status}${serang1.json?.error ? ` ${serang1.json.error.code}` : ''}`,
    )
    cek(
      'NOL baris Attachment tersimpan',
      lampiranSesudah === lampiranSebelum,
      `sebelum=${lampiranSebelum} sesudah=${lampiranSesudah}`,
    )
    const nyasar = await prisma.attachment.count({ where: { entityId: d.voyageB.id } })
    cek('tidak ada lampiran yang menunjuk voyage tenant B', nyasar === 0, `dapat ${nyasar}`)

    // ---------- 4. Lintas-tenant: KOMENTAR ----------
    console.log('\n4. K85 — tenant A berkomentar pada entityId milik tenant B')
    const komentarSebelum = await prisma.comment.count()
    const serang2 = await berkomentar(sesiA, 'VOYAGE', d.voyageB.id)
    const komentarSesudah = await prisma.comment.count()

    cek('komentar lintas-tenant ditolak 404', serang2.status === 404, `status ${serang2.status}`)
    cek(
      'NOL baris Comment tersimpan',
      komentarSesudah === komentarSebelum,
      `sebelum=${komentarSebelum} sesudah=${komentarSesudah}`,
    )

    // ---------- 5. Arah sebaliknya ----------
    // Pagar harus simetris; kebocoran satu arah tetap kebocoran.
    console.log('\n5. Arah sebaliknya — tenant B menuju entitas tenant A')
    const serang3 = await unggah(sesiB, 'VOYAGE', d.voyageA.id)
    cek('unggahan B → entitas A ditolak 404', serang3.status === 404, `status ${serang3.status}`)
    const serang4 = await berkomentar(sesiB, 'VOYAGE', d.voyageA.id)
    cek('komentar B → entitas A ditolak 404', serang4.status === 404, `status ${serang4.status}`)

    // ---------- 6. entityType di luar daftar putih, lewat API ----------
    console.log('\n6. entityType di luar daftar putih ditolak API sebagai 400')
    const acak = await unggah(sesiA, 'RANDOM', d.voyageA.id)
    cek(
      'unggah entityType=RANDOM → 400 VALIDATION (bukan 500, bukan tersimpan)',
      acak.status === 400 && acak.json?.error?.code === 'VALIDATION',
      `status ${acak.status} kode ${acak.json?.error?.code}`,
    )
    const acak2 = await berkomentar(sesiA, 'RANDOM', d.voyageA.id)
    cek(
      'komentar entityType=RANDOM → 400 VALIDATION',
      acak2.status === 400 && acak2.json?.error?.code === 'VALIDATION',
      `status ${acak2.status} kode ${acak2.json?.error?.code}`,
    )
    const takAda = await prisma.attachment.count({ where: { entityType: 'RANDOM' } })
    cek('tidak ada baris ber-entityType RANDOM di database', takAda === 0, `dapat ${takAda}`)

    // ---------- 7. Tanpa sesi ----------
    console.log('\n7. Tanpa sesi — 401 sebelum apa pun diperiksa')
    const anonim = buatSesi()
    const resAnonim = await anonim.ambil(
      `/api/attachments?entityType=VOYAGE&entityId=${d.voyageA.id}`,
    )
    cek('GET /api/attachments tanpa sesi → 401', resAnonim.status === 401, `status ${resAnonim.status}`)

    // ---------- 8. EmailLog ----------
    // Service & route EmailLog lahir di 7h, bukan 7a — jadi tak ada API yang
    // bisa dipanggil di sini. Yang BISA dan perlu dibuktikan sekarang: kelima
    // entityType yang akan dipakainya sudah ada di daftar putih yang sama,
    // sehingga ia mewarisi pagar ini tanpa membangun pemeriksaan kedua.
    console.log('\n8. EmailLog (service-nya baru ada di 7h) mewarisi daftar putih yang sama')
    const dipakaiEmailLog = ['VOYAGE', 'DISBURSEMENT', 'INVOICE', 'PURCHASE_ORDER', 'WORK_ORDER']
    const belumAda = dipakaiEmailLog.filter((t) => !entitasDidukung(t))
    cek(
      'kelima entityType EmailLog ada di ENTITAS_DIDUKUNG',
      belumAda.length === 0,
      belumAda.length ? `belum ada: ${belumAda.join(', ')}` : dipakaiEmailLog.join(', '),
    )
  } finally {
    await bersihkan(d)
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Uji gagal dijalankan:', e)
    gagal++
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(`\n${'='.repeat(46)}`)
    console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
    process.exitCode = gagal === 0 ? 0 : 1
  })
