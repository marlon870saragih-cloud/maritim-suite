// Uji relasi kapal-voyage (tug + barge), backfill, invarian kapal utama & jejak tanggal — PRD-002 Step 2.
//
// Jalankan:  node prisma/check-voyage-vessels.mjs      (bagian 4 butuh `npm run dev` menyala)
//            BASE_URL=http://localhost:3001 node prisma/check-voyage-vessels.mjs
//
// Empat lapis:
//   1. KUNCI SUMBER — skema/migrasi/kode dibaca apa adanya: `Voyage.vesselId` masih
//      ada, migrasi tanpa DROP, `voyageVessel` hanya dipakai sebagai model akar di
//      satu berkas service, tanpa nama/nomor kapal pilot di berkas Step 2.
//   2. MURNI — validasi daftar kapal & deteksi perubahan tanggal (berkas tanpa impor).
//   3. DB — hasil backfill & kendala unik (voyageId, vesselId).
//   4. HTTP — alur penuh lewat sesi login sungguhan.
//
// Skrip ini MENULIS ke database dev. Semua barisnya bertanda `P2S2-VV-` / email
// `p2s2-vv-*` dan dihapus lagi di akhir, termasuk saat gagal di tengah.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { MAKS_KAPAL_PER_VOYAGE, PERAN_KAPAL_VOYAGE, bacaDaftarKapalVoyage } from '../src/lib/vessels.ts'
import { kunciTanggal, perubahanTanggalVoyage } from '../src/services/master/voyage-dates.ts'

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

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const prisma = new PrismaClient()
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const SANDI = 'UjiP2s2Voyage!2026'
const TAG = 'P2S2-VV-'
const EMAIL = 'p2s2-vv-'
const MIGRASI = '20260914120000_prd002_vessel_identity_voyage_vessels'
const MIGRASI_FK = '20260914130000_prd002_voyage_vessel_fk_cascade'

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
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')

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
    punyaSesi: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
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

async function panggil(sesi, metode, path, body) {
  const res = await sesi.ambil(path, {
    method: metode,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const teks = await res.text()
  let json = null
  try {
    json = JSON.parse(teks)
  } catch {
    /* teks polos */
  }
  return { status: res.status, teks, json }
}

function semuaBerkas(dir, keluar = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) semuaBerkas(p, keluar)
    else if (/\.(ts|tsx)$/.test(n)) keluar.push(p)
  }
  return keluar
}

// ------------------------------------------------------------------ 1. KUNCI SUMBER

function bagianSumber() {
  console.log('\n1) Kunci sumber (skema, migrasi, pemakaian model)')
  const skema = baca('prisma/schema.prisma')
  const blokVoyage = skema.match(/model Voyage \{[\s\S]*?\n\}/)?.[0] ?? ''
  cek('Voyage.vesselId TETAP ada sebagai String wajib (tidak dihapus/diganti nama)', /\n\s*vesselId\s+String\s/.test(blokVoyage))
  cek('Voyage tidak memakai kolom tug_id/barge_id khusus', !/tug_?id|barge_?id/i.test(blokVoyage))
  const blokVV = skema.match(/model VoyageVessel \{[\s\S]*?\n\}/)?.[0] ?? ''
  cek('model VoyageVessel ada dengan @@unique([voyageId, vesselId])', /@@unique\(\[voyageId, vesselId\]\)/.test(blokVV))
  cek('VoyageVessel tidak punya kolom/role PRIMARY (satu-satunya penentu = Voyage.vesselId)', !/isPrimary|PRIMARY/.test(blokVV.replace(/\/\/\/.*$/gm, '')))
  cek('Vessel punya @@unique([tenantId, mmsi])', /model Vessel \{[\s\S]*?@@unique\(\[tenantId, mmsi\]\)/.test(skema))
  // Regresi yang ditemukan di Step 2: RESTRICT/NO ACTION menggagalkan penghapusan tenant
  // yang punya voyage (K188). Relasi di-CASCADE; penolakan "kapal masih dipakai" pindah ke route.
  cek('relasi VoyageVessel.vessel memakai onDelete: Cascade (penghapusan tenant K188 tetap bekerja)',
    /\n\s*vessel\s+Vessel\s+@relation\(fields: \[vesselId\], references: \[id\], onDelete: Cascade\)/.test(blokVV))
  const sqlFk = baca(`prisma/migrations/${MIGRASI_FK}/migration.sql`).replace(/--.*$/gm, '')
  cek('migrasi lanjutan FK: hanya tukar constraint ke ON DELETE CASCADE, tanpa DROP TABLE/COLUMN',
    /ON DELETE CASCADE/.test(sqlFk) && !/DROP\s+(TABLE|COLUMN)/i.test(sqlFk))
  const routeHapus = baca('src/app/api/vessels/[id]/route.ts')
  cek('DELETE /api/vessels/:id memeriksa kapal utama DAN kapal terkait voyage sebelum menghapus',
    /vessels:\s*\{\s*some:\s*\{\s*vesselId:\s*params\.id\s*\}\s*\}/.test(routeHapus) && /vesselId:\s*params\.id\s*\}/.test(routeHapus))

  const sql = baca(`prisma/migrations/${MIGRASI}/migration.sql`)
  const tanpaKomentar = sql.replace(/--.*$/gm, '')
  cek('migrasi Step 2 tanpa DROP', !/\bDROP\b/i.test(tanpaKomentar))
  cek('migrasi Step 2 tanpa ALTER COLUMN / SET NOT NULL', !/ALTER\s+COLUMN|SET\s+NOT\s+NULL/i.test(tanpaKomentar))
  cek('backfill idempoten (ON CONFLICT DO NOTHING) & deterministik (id vvbf_ || Voyage.id)',
    /ON CONFLICT \("voyageId", "vesselId"\) DO NOTHING/.test(tanpaKomentar) && /'vvbf_' \|\| v\."id"/.test(tanpaKomentar))

  const pemakaiAkar = semuaBerkas(join(AKAR, 'src'))
    .filter((p) => /\.voyageVessel\./.test(readFileSync(p, 'utf8')))
    .map((p) => p.slice(AKAR.length).replace(/\\/g, '/'))
  cek('`voyageVessel` sebagai model akar HANYA di voyage-vessel.service.ts (akses anak lewat induk, K44)',
    pemakaiAkar.length === 1 && pemakaiAkar[0].endsWith('src/services/master/voyage-vessel.service.ts'), pemakaiAkar.join(', '))

  const berkasStep2 = [
    'src/lib/vessels.ts', 'src/lib/vessel-api.ts', 'src/services/master/voyage-vessel.service.ts',
    'src/services/master/voyage-dates.ts', 'src/components/voyage/VoyageVesselsPanel.tsx',
    `prisma/migrations/${MIGRASI}/migration.sql`,
  ]
  const pilot = berkasStep2.filter((f) => /MANDIRI|PATRA|525200433|YDB6405|SURYA PERKASA|TIRTA MARITIM/i.test(baca(f)))
  cek('tak ada nama/nomor kapal atau principal pilot di berkas Step 2', pilot.length === 0, pilot.join(', '))
  cek('peran kapal generik: TUG & BARGE saja', JSON.stringify(PERAN_KAPAL_VOYAGE) === JSON.stringify(['TUG', 'BARGE']))
}

// ------------------------------------------------------------------ 2. MURNI

function bagianMurni() {
  console.log('\n2) Validasi daftar kapal & perubahan tanggal (modul murni)')
  const ok = bacaDaftarKapalVoyage([{ vesselId: 'a', role: 'TUG' }, { vesselId: 'b', role: 'barge' }, { vesselId: 'c', role: '' }])
  cek('TUG, BARGE (huruf kecil dinormalisasi) & tanpa peran diterima',
    ok.errors.length === 0 && ok.items[0].role === 'TUG' && ok.items[1].role === 'BARGE' && ok.items[2].role === null)
  cek('peran PRIMARY ditolak (kapal utama bukan peran)', bacaDaftarKapalVoyage([{ vesselId: 'a', role: 'PRIMARY' }]).errors.length === 1)
  cek('kapal ganda dalam satu voyage ditolak', bacaDaftarKapalVoyage([{ vesselId: 'a' }, { vesselId: 'a' }]).errors.length === 1)
  cek('daftar kosong ditolak', bacaDaftarKapalVoyage([]).errors.length === 1)
  cek(`lebih dari ${MAKS_KAPAL_PER_VOYAGE} kapal ditolak`,
    bacaDaftarKapalVoyage(Array.from({ length: MAKS_KAPAL_PER_VOYAGE + 1 }, (_, i) => ({ vesselId: `v${i}` }))).errors.length === 1)
  cek('bukan larik ditolak', bacaDaftarKapalVoyage('a').errors.length === 1)
  cek('kapal tanpa id ditolak', bacaDaftarKapalVoyage([{ role: 'TUG' }]).errors.length === 1)

  cek('kunci tanggal = tanggal kalender UTC (tanpa konversi zona)', kunciTanggal(new Date('2026-09-20T00:00:00.000Z')) === '2026-09-20')
  cek('jam berbeda pada tanggal sama → BUKAN perubahan (ETA bersemantik tanggal, D4)',
    perubahanTanggalVoyage({ eta: new Date('2026-09-20T00:00:00Z') }, { eta: new Date('2026-09-20T08:00:00Z') }) === null)
  const ubah = perubahanTanggalVoyage(
    { eta: new Date('2026-09-20T00:00:00Z'), etd: null, atd: null },
    { eta: new Date('2026-09-21T00:00:00Z'), etd: new Date('2026-09-25T00:00:00Z'), atd: null },
  )
  cek('ETA 20→21 & ETD kosong→25 terdeteksi terstruktur',
    JSON.stringify(ubah?.medan) === JSON.stringify(['eta', 'etd']) && ubah?.lama.eta === '2026-09-20' && ubah?.baru.eta === '2026-09-21' && ubah?.lama.etd === null && ubah?.baru.etd === '2026-09-25')
  cek('ATB/ATD ikut diperiksa', perubahanTanggalVoyage({ atb: null }, { atb: new Date('2026-09-22T00:00:00Z') })?.medan[0] === 'atb')
  cek('tanpa perubahan → null', perubahanTanggalVoyage({ eta: new Date('2026-09-20T00:00:00Z') }, { eta: '2026-09-20' }) === null)
}

// ------------------------------------------------------------------ 3. DB

async function bagianDb(tA) {
  console.log('\n3) Backfill & kendala database')
  // Batas waktu = saat migrasi Step 2 selesai. Backfill hanya bertanggung jawab atas voyage
  // yang SUDAH ADA saat itu. Voyage yang lahir sesudahnya lewat `prisma.voyage.create` mentah
  // (fixture skrip uji lain) memang tanpa baris — itu kasus pembaca toleran, diuji di bagian 4.
  const [mig] = await prisma.$queryRaw`SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = ${MIGRASI}`
  cek('migrasi Step 2 tercatat selesai di _prisma_migrations', !!mig?.finished_at)
  // ⚠️ `Voyage.createdAt` = timestamp(3) TANPA zona (disimpan UTC oleh Prisma), sedangkan
  // `finished_at` = timestamptz. Membandingkan keduanya langsung membuat PostgreSQL menafsirkan
  // kolom naif dengan zona waktu SESI (mis. +08) — voyage yang lahir beberapa jam sesudah migrasi
  // ikut terhitung "pra-migrasi". Batasnya karena itu diubah ke UTC naif di dalam SQL.
  const BATAS = Prisma.sql`(SELECT finished_at AT TIME ZONE 'UTC' FROM "_prisma_migrations" WHERE migration_name = ${MIGRASI})`
  const [{ voyage }] = await prisma.$queryRaw`SELECT count(*)::int AS voyage FROM "Voyage" WHERE "createdAt" < ${BATAS}`
  const [{ backfill }] = await prisma.$queryRaw`SELECT count(*)::int AS backfill FROM "VoyageVessel" WHERE id LIKE 'vvbf\_%'`
  const [{ tanpaBaris }] = await prisma.$queryRaw`
    SELECT count(*)::int AS "tanpaBaris" FROM "Voyage" v
    WHERE v."createdAt" < ${BATAS}
      AND NOT EXISTS (SELECT 1 FROM "VoyageVessel" vv WHERE vv."voyageId" = v.id AND vv."vesselId" = v."vesselId")`
  const [{ sesudahTanpaBaris }] = await prisma.$queryRaw`
    SELECT count(*)::int AS "sesudahTanpaBaris" FROM "Voyage" v
    WHERE v."createdAt" >= ${BATAS}
      AND NOT EXISTS (SELECT 1 FROM "VoyageVessel" vv WHERE vv."voyageId" = v.id AND vv."vesselId" = v."vesselId")`
  console.log(`     (info) voyage dibuat SESUDAH migrasi tanpa baris (fixture mentah, ditangani pembaca toleran) = ${sesudahTanpaBaris}`)
  const [{ ganda }] = await prisma.$queryRaw`
    SELECT count(*)::int AS ganda FROM (
      SELECT "voyageId", "vesselId" FROM "VoyageVessel" GROUP BY 1, 2 HAVING count(*) > 1) g`
  const [{ salahKapal }] = await prisma.$queryRaw`
    SELECT count(*)::int AS "salahKapal" FROM "VoyageVessel" vv JOIN "Voyage" v ON v.id = vv."voyageId"
    WHERE vv.id LIKE 'vvbf\_%' AND vv."vesselId" <> v."vesselId"`
  console.log(`     voyage pra-migrasi = ${voyage}, baris backfill = ${backfill}, voyage pra-migrasi tanpa baris kapal utama = ${tanpaBaris}, pasangan ganda = ${ganda}`)
  cek('setiap voyage yang ada saat migrasi punya baris untuk kapal utamanya (Voyage.vesselId)', tanpaBaris === 0)
  cek('jumlah baris backfill = jumlah voyage pra-migrasi (satu per voyage, tak ada yang terlewat)', backfill === voyage, `${backfill} = ${voyage}`)
  cek('baris backfill menunjuk kapal utama yang SAMA persis (identitas bisnis tak berubah)', salahKapal === 0)
  cek('tidak ada pasangan (voyage, kapal) ganda', ganda === 0)

  const vv = await prisma.voyageVessel.findFirst({ where: { voyage: { tenantId: tA.id } } })
  if (vv) {
    let galat = null
    try {
      await prisma.voyageVessel.create({ data: { voyageId: vv.voyageId, vesselId: vv.vesselId } })
    } catch (e) {
      galat = e
    }
    cek('DB menolak kapal yang sama dua kali pada voyage yang sama (P2002)', galat instanceof Prisma.PrismaClientKnownRequestError && galat.code === 'P2002')
  } else {
    cek('ada baris VoyageVessel di tenant uji untuk menguji kendala unik', false)
  }

  // Penghapusan tenant (offboarding K188, delete-tenant.mjs) wajib tetap bekerja
  // untuk tenant yang punya voyage dengan kapal utama + kapal terkait.
  const tHapus = await prisma.tenant.create({
    data: { companyName: `${TAG}Tenant Hapus`, plan: 'TRIAL', modulesEnabled: ['finance'], trialEndsAt: new Date(Date.now() + 86_400_000) },
  })
  const kUtama = await prisma.vessel.create({ data: { tenantId: tHapus.id, name: `${TAG}Tug Tenant Hapus` } })
  const kBarge = await prisma.vessel.create({ data: { tenantId: tHapus.id, name: `${TAG}Barge Tenant Hapus` } })
  await prisma.voyage.create({
    data: {
      tenantId: tHapus.id,
      voyageNumber: `${TAG}HAPUS-1`,
      vesselId: kUtama.id,
      vessels: { create: [{ vesselId: kUtama.id, role: 'TUG', sortOrder: 0 }, { vesselId: kBarge.id, role: 'BARGE', sortOrder: 1 }] },
    },
  })
  let galatHapus = null
  try {
    await prisma.tenant.delete({ where: { id: tHapus.id } })
  } catch (e) {
    galatHapus = e
  }
  const sisaAnak = await prisma.voyageVessel.count({ where: { vesselId: { in: [kUtama.id, kBarge.id] } } })
  cek('tenant dengan voyage (tug utama + barge) tetap bisa dihapus lewat cascade (K188)',
    galatHapus === null && sisaAnak === 0,
    galatHapus ? String(galatHapus.message).split('\n').filter(Boolean).slice(-1)[0] : `sisa baris anak ${sisaAnak}`)
}

// ------------------------------------------------------------------ 4. HTTP

async function bagianHttp(tA, tB, dibuat) {
  console.log('\n4) API lewat sesi login sungguhan')
  try {
    await fetch(`${BASE_URL}/api/auth/csrf`)
  } catch {
    cek(`dev server bisa dihubungi di ${BASE_URL}`, false, 'jalankan `npm run dev` lalu ulangi')
    return
  }

  const sandi = await bcrypt.hash(SANDI, 10)
  const buatUser = async (tenantId, kunci, role) => {
    const u = await prisma.user.create({
      data: { tenantId, email: `${EMAIL}${kunci}@uji.local`, name: `${TAG}${role}`, password: sandi, role },
    })
    dibuat.userIds.push(u.id)
    return u
  }
  const uAdmin = await buatUser(tA.id, 'admin', 'ADMIN')
  const uOper = await buatUser(tA.id, 'oper', 'OPERATOR')
  const uViewer = await buatUser(tA.id, 'viewer', 'VIEWER')
  const uAdminB = await buatUser(tB.id, 'adminb', 'ADMIN')

  const kapal = async (tenantId, nama, vesselType) => {
    const v = await prisma.vessel.create({ data: { tenantId, name: `${TAG}${nama}`, vesselType } })
    dibuat.vesselIds.push(v.id)
    return v
  }
  const tug = await kapal(tA.id, 'Tug Uji', 'TugBoat')
  const barge = await kapal(tA.id, 'Barge Uji', 'Oil Barge')
  const tanker = await kapal(tA.id, 'Tanker Uji', 'Oil Tanker')
  const pengganti = await kapal(tA.id, 'Tug Pengganti', 'TugBoat')
  const kapalB = await kapal(tB.id, 'Kapal Tenant B', 'TugBoat')

  const sAdmin = await login(uAdmin.email)
  const sOper = await login(uOper.email)
  const sViewer = await login(uViewer.email)
  const sAdminB = await login(uAdminB.email)

  // --- voyage kapal tunggal ---
  const buatTanker = await panggil(sOper, 'POST', '/api/voyages', { vesselId: tanker.id })
  const vTanker = buatTanker.json?.voyage
  if (vTanker) dibuat.voyageIds.push(vTanker.id)
  cek('voyage kapal tunggal dibuat seperti biasa (201)', buatTanker.status === 201 && !!vTanker, `HTTP ${buatTanker.status}`)
  if (vTanker) {
    const baris = await prisma.voyageVessel.findMany({ where: { voyageId: vTanker.id } })
    cek('voyage baru langsung punya SATU baris kapal utama (atomik)', baris.length === 1 && baris[0].vesselId === tanker.id && baris[0].role === null)
    const detail = await panggil(sOper, 'GET', `/api/voyages/${vTanker.id}`)
    cek('GET voyage tetap memuat vesselId & vessel lama (kontrak lama utuh)',
      detail.status === 200 && detail.json?.vesselId === tanker.id && detail.json?.vessel?.name === tanker.name)
    cek('GET voyage menambahkan `vessels` secara aditif', Array.isArray(detail.json?.vessels) && detail.json.vessels.length === 1)
    const daftarList = await panggil(sOper, 'GET', `/api/voyages?vesselId=${tanker.id}`)
    cek('daftar voyage (filter vesselId lama) tetap bekerja', daftarList.status === 200 && daftarList.json.some((v) => v.id === vTanker.id && v.vessel?.id === tanker.id))
  }

  // --- tug + barge ---
  const buatTug = await panggil(sOper, 'POST', '/api/voyages', { vesselId: tug.id })
  const vTug = buatTug.json?.voyage
  if (vTug) dibuat.voyageIds.push(vTug.id)
  if (!vTug) {
    cek('voyage tug dibuat', false, `HTTP ${buatTug.status} ${buatTug.teks.slice(0, 120)}`)
    return
  }

  const put = await panggil(sOper, 'PUT', `/api/voyages/${vTug.id}/vessels`, {
    vessels: [{ vesselId: tug.id, role: 'TUG' }, { vesselId: barge.id, role: 'BARGE' }],
  })
  cek('OPERATOR menetapkan tug (TUG) + barge (BARGE) pada satu voyage (200)', put.status === 200, `HTTP ${put.status} ${put.teks.slice(0, 120)}`)
  const g1 = await panggil(sOper, 'GET', `/api/voyages/${vTug.id}/vessels`)
  cek('GET: urutan & peran sesuai (tug utama TUG, barge terkait BARGE)',
    g1.status === 200 && g1.json.length === 2 &&
    g1.json[0].vesselId === tug.id && g1.json[0].role === 'TUG' && g1.json[0].isPrimary === true &&
    g1.json[1].vesselId === barge.id && g1.json[1].role === 'BARGE' && g1.json[1].isPrimary === false)

  await panggil(sOper, 'PUT', `/api/voyages/${vTug.id}/vessels`, {
    vessels: [{ vesselId: barge.id, role: 'BARGE' }, { vesselId: tug.id, role: 'TUG' }],
  })
  const g2 = await panggil(sOper, 'GET', `/api/voyages/${vTug.id}/vessels`)
  const g3 = await panggil(sOper, 'GET', `/api/voyages/${vTug.id}/vessels`)
  cek('urutan deterministik mengikuti urutan simpan (barge, tug) & stabil antar-baca',
    g2.json?.[0]?.vesselId === barge.id && g2.json?.[1]?.vesselId === tug.id && JSON.stringify(g2.json) === JSON.stringify(g3.json))
  const vTugDetail = await panggil(sOper, 'GET', `/api/voyages/${vTug.id}`)
  cek('kapal utama voyage tetap tug (Voyage.vesselId tak berubah oleh urutan)', vTugDetail.json?.vesselId === tug.id)

  const auditKapal = await prisma.auditLog.findFirst({
    where: { tableName: 'Voyage', recordId: vTug.id, newValue: { path: ['peristiwa'], equals: 'UBAH_KAPAL_VOYAGE' } },
    orderBy: { createdAt: 'desc' },
  })
  cek('perubahan daftar kapal tercatat di AuditLog', !!auditKapal && Array.isArray(auditKapal.newValue?.kapal))

  cek('PUT kapal ganda → 400', (await panggil(sOper, 'PUT', `/api/voyages/${vTug.id}/vessels`, { vessels: [{ vesselId: tug.id }, { vesselId: tug.id }] })).status === 400)
  cek('PUT tanpa kapal utama → 400', (await panggil(sOper, 'PUT', `/api/voyages/${vTug.id}/vessels`, { vessels: [{ vesselId: barge.id, role: 'BARGE' }] })).status === 400)
  cek('PUT peran PRIMARY → 400', (await panggil(sOper, 'PUT', `/api/voyages/${vTug.id}/vessels`, { vessels: [{ vesselId: tug.id, role: 'PRIMARY' }] })).status === 400)
  cek('PUT kapal milik tenant lain → 404', (await panggil(sOper, 'PUT', `/api/voyages/${vTug.id}/vessels`, { vessels: [{ vesselId: tug.id }, { vesselId: kapalB.id }] })).status === 404)
  cek('VIEWER tidak bisa mengubah kapal voyage (403)', (await panggil(sViewer, 'PUT', `/api/voyages/${vTug.id}/vessels`, { vessels: [{ vesselId: tug.id }] })).status === 403)
  cek('VIEWER tetap bisa membaca kapal voyage (200)', (await panggil(sViewer, 'GET', `/api/voyages/${vTug.id}/vessels`)).status === 200)
  cek('tanpa login → 401', (await panggil(buatSesi(), 'GET', `/api/voyages/${vTug.id}/vessels`)).status === 401)
  cek('ADMIN tenant lain tidak bisa membaca kapal voyage tenant ini (404)', (await panggil(sAdminB, 'GET', `/api/voyages/${vTug.id}/vessels`)).status === 404)
  const barisSetelahTolak = await prisma.voyageVessel.count({ where: { voyageId: vTug.id } })
  cek('penolakan tidak mengubah daftar tersimpan (tetap 2 baris)', barisSetelahTolak === 2)

  const hapusBarge = await panggil(sAdmin, 'DELETE', `/api/vessels/${barge.id}`)
  const bargeMasih = await prisma.vessel.count({ where: { id: barge.id } })
  const tautanMasih = await prisma.voyageVessel.count({ where: { voyageId: vTug.id, vesselId: barge.id } })
  cek('barge yang masih terpasang (kapal terkait) tidak bisa dihapus: 409, kapal & tautannya utuh',
    hapusBarge.status === 409 && bargeMasih === 1 && tautanMasih === 1, `HTTP ${hapusBarge.status}`)
  const hapusUtama = await panggil(sAdmin, 'DELETE', `/api/vessels/${tug.id}`)
  cek('kapal utama voyage tidak bisa dihapus (409)', hapusUtama.status === 409 && (await prisma.vessel.count({ where: { id: tug.id } })) === 1, `HTTP ${hapusUtama.status}`)

  // --- ganti kapal utama lewat Particulars ---
  const gantiUtama = await panggil(sAdmin, 'PATCH', `/api/voyages/${vTug.id}`, { vesselId: pengganti.id, status: 'PLANNED' })
  const barisGanti = await prisma.voyageVessel.findMany({ where: { voyageId: vTug.id }, orderBy: { sortOrder: 'asc' } })
  cek('ganti kapal utama → baris kapal utama lama digantikan (peran TUG dipertahankan), barge tetap',
    gantiUtama.status === 200 && barisGanti.length === 2 &&
    barisGanti.some((b) => b.vesselId === pengganti.id && b.role === 'TUG') &&
    barisGanti.some((b) => b.vesselId === barge.id && b.role === 'BARGE') &&
    !barisGanti.some((b) => b.vesselId === tug.id),
    `HTTP ${gantiUtama.status}`)
  const g4 = await panggil(sAdmin, 'GET', `/api/voyages/${vTug.id}/vessels`)
  cek('invarian: tepat satu isPrimary, dan itu Voyage.vesselId', g4.json?.filter((r) => r.isPrimary).length === 1 && g4.json.find((r) => r.isPrimary)?.vesselId === pengganti.id)

  // --- jejak tanggal ---
  const saringTanggal = { tableName: 'Voyage', recordId: vTug.id, newValue: { path: ['peristiwa'], equals: 'UBAH_TANGGAL' } }
  await panggil(sAdmin, 'PATCH', `/api/voyages/${vTug.id}`, { vesselId: pengganti.id, status: 'PLANNED', eta: '2026-09-20' })
  const n0 = await prisma.auditLog.count({ where: saringTanggal })
  await panggil(sAdmin, 'PATCH', `/api/voyages/${vTug.id}`, { vesselId: pengganti.id, status: 'PLANNED', eta: '2026-09-21', etd: '2026-09-25' })
  const n1 = await prisma.auditLog.count({ where: saringTanggal })
  const aTgl = await prisma.auditLog.findFirst({ where: saringTanggal, orderBy: { createdAt: 'desc' } })
  cek('ETA 20→21 & ETD kosong→25 menulis SATU baris audit terstruktur',
    n1 === n0 + 1 && aTgl?.oldValue?.eta === '2026-09-20' && aTgl?.newValue?.eta === '2026-09-21' &&
    aTgl?.oldValue?.etd === null && aTgl?.newValue?.etd === '2026-09-25' &&
    JSON.stringify(aTgl?.newValue?.medan) === JSON.stringify(['eta', 'etd']),
    `+${n1 - n0} baris`)
  await panggil(sAdmin, 'PATCH', `/api/voyages/${vTug.id}`, { vesselId: pengganti.id, status: 'PLANNED', eta: '2026-09-21', etd: '2026-09-25', notes: 'catatan saja' })
  const n2 = await prisma.auditLog.count({ where: saringTanggal })
  cek('penyuntingan tanpa perubahan tanggal → tidak ada baris jejak tanggal baru', n2 === n1)
  const disimpan = await prisma.voyage.findFirst({ where: { id: vTug.id }, select: { eta: true } })
  cek('ETA tetap disimpan sebagai tanggal (00:00 UTC), tanpa jam karangan', disimpan?.eta?.toISOString() === '2026-09-21T00:00:00.000Z')
  const tl = await panggil(sAdmin, 'GET', `/api/voyages/${vTug.id}/timeline`)
  const judulTl = JSON.stringify(tl.json ?? {})
  cek('timeline tetap 200 & tidak menampilkan jejak tanggal sebagai perubahan status', tl.status === 200 && !judulTl.includes('UBAH_TANGGAL'), `HTTP ${tl.status}`)

  // --- voyage lama tanpa baris (dibuat langsung lewat Prisma, seperti skrip lama) ---
  const lama = await prisma.voyage.create({
    data: { tenantId: tA.id, voyageNumber: `${TAG}LAMA-${Date.now()}`, vesselId: tanker.id },
  })
  dibuat.voyageIds.push(lama.id)
  const gLama = await panggil(sAdmin, 'GET', `/api/voyages/${lama.id}/vessels`)
  cek('voyage lama tanpa baris tetap menampilkan kapal utamanya (pembaca toleran, id null)',
    gLama.status === 200 && gLama.json.length === 1 && gLama.json[0].isPrimary && gLama.json[0].id === null && gLama.json[0].vesselId === tanker.id)
  const dLama = await panggil(sAdmin, 'GET', `/api/voyages/${lama.id}`)
  cek('voyage lama tetap me-resolve vesselId & vessel seperti sebelumnya', dLama.status === 200 && dLama.json?.vesselId === tanker.id && dLama.json?.vessel?.id === tanker.id)
  await panggil(sAdmin, 'PATCH', `/api/voyages/${lama.id}`, { vesselId: tanker.id, status: 'PLANNED' })
  const sembuh = await prisma.voyageVessel.findMany({ where: { voyageId: lama.id } })
  cek('menyunting voyage lama menyembuhkan barisnya (1 baris kapal utama)', sembuh.length === 1 && sembuh[0].vesselId === tanker.id)
}

// ------------------------------------------------------------------ bersih-bersih

async function bersihkan(dibuat) {
  const voyages = await prisma.voyage.findMany({
    where: { OR: [{ id: { in: dibuat.voyageIds } }, { voyageNumber: { startsWith: TAG } }] },
    select: { id: true },
  })
  const vIds = Array.from(new Set([...dibuat.voyageIds, ...voyages.map((v) => v.id)]))
  const kapal = await prisma.vessel.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })
  const kIds = Array.from(new Set([...dibuat.vesselIds, ...kapal.map((k) => k.id)]))
  if (vIds.length) {
    await prisma.task.deleteMany({ where: { voyageId: { in: vIds } } })
    await prisma.auditLog.deleteMany({ where: { recordId: { in: vIds } } })
    await prisma.voyage.deleteMany({ where: { id: { in: vIds } } }) // VoyageVessel ikut terhapus (CASCADE)
  }
  await prisma.auditLog.deleteMany({ where: { tableName: 'Vessel', recordId: { in: kIds } } })
  await prisma.vessel.deleteMany({ where: { id: { in: kIds } } })
  if (dibuat.userIds.length) {
    await prisma.usageEvent.deleteMany({ where: { userId: { in: dibuat.userIds } } })
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } })
  // Tenant uji penghapusan: bila cascade gagal (regresi), bongkar manual supaya DB dev tetap bersih.
  for (const t of await prisma.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })) {
    await prisma.voyage.deleteMany({ where: { tenantId: t.id } })
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => undefined)
  }
}

async function main() {
  const tA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } } })
  const tB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!tA || !tB) throw new Error('Tenant Tribuana / Verifikasi tidak ditemukan di DB dev.')

  const dibuat = { voyageIds: [], vesselIds: [], userIds: [] }
  try {
    bagianSumber()
    bagianMurni()
    await bagianDb(tA)
    await bagianHttp(tA, tB, dibuat)
  } finally {
    await bersihkan(dibuat)
    const sisaV = await prisma.voyage.count({ where: { voyageNumber: { startsWith: TAG } } })
    const sisaK = await prisma.vessel.count({ where: { name: { startsWith: TAG } } })
    const sisaU = await prisma.user.count({ where: { email: { startsWith: EMAIL } } })
    console.log(`\n  (bersih-bersih: sisa voyage uji ${sisaV}, kapal uji ${sisaK}, user uji ${sisaU})`)
  }

  console.log('\n==============================================')
  if (gagal === 0) console.log(`✅ SEMUA LULUS (${lulus} pemeriksaan)`)
  else console.log(`❌ ${gagal} GAGAL, ${lulus} lulus`)
  process.exitCode = gagal === 0 ? 0 : 1
}

main()
  .catch((e) => {
    console.error('❌ Uji berhenti karena galat:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
