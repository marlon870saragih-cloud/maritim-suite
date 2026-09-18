// Uji identitas kapal (IMO/MMSI/call sign/provenans) & pagar peran mutasi kapal — PRD-002 Step 2.
//
// Jalankan:  node prisma/check-vessel-identity.mjs      (bagian 3 butuh `npm run dev` menyala)
//            BASE_URL=http://localhost:3001 node prisma/check-vessel-identity.mjs
//
// Tiga lapis, karena satu lapis membuktikan lebih sedikit daripada kelihatannya:
//   1. MURNI  — src/lib/vessels.ts diimpor langsung (berkas tanpa impor, Node 24
//               mengurai TypeScript sendiri): objek yang PERSIS SAMA dengan yang
//               dipakai route & komponen.
//   2. DB     — unique (tenantId, mmsi) di PostgreSQL, bukan cuma cek aplikasi.
//   3. HTTP   — kode status & pagar peran lewat sesi login SUNGGUHAN (401/403/409),
//               yang hanya ada di jalur lengkapnya.
//
// Skrip ini MENULIS ke database dev. Semua barisnya bertanda `P2S2-VI-` / email
// `p2s2-vi-*` dan dihapus lagi di akhir, termasuk saat gagal di tengah.
// Nilai MMSI uji memakai awalan 999 (bukan kode negara nyata) — TIDAK ada data kapal pilot.

import { readFileSync } from 'node:fs'
import { PrismaClient, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import {
  PERAN_UBAH_KAPAL,
  SUMBER_MMSI,
  SUMBER_MMSI_TERVERIFIKASI,
  hitungVerifikasiMmsi,
  identitasKapal,
  imoCheckDigitSah,
  mmsiSah,
  normalisasiCallSign,
  normalisasiImo,
  normalisasiMmsi,
} from '../src/lib/vessels.ts'

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
const SANDI = 'UjiP2s2Kapal!2026'
const TAG = 'P2S2-VI-'
const EMAIL = 'p2s2-vi-'

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
    /* balasan teks polos */
  }
  return { status: res.status, teks, json }
}

// ------------------------------------------------------------------ 1. MURNI

function bagianMurni() {
  console.log('\n1) Normalisasi & validasi (modul murni src/lib/vessels.ts)')

  cek('MMSI null → null', normalisasiMmsi(null) === null)
  cek('MMSI kosong/spasi → null', normalisasiMmsi('') === null && normalisasiMmsi('   ') === null)
  cek('MMSI "999 000 001" dinormalisasi → "999000001"', normalisasiMmsi('999 000 001') === '999000001')
  cek('MMSI "999.000-001" dinormalisasi → "999000001"', normalisasiMmsi('999.000-001') === '999000001')
  cek('MMSI 9 digit sah', mmsiSah('999000001'))
  cek('MMSI 8 digit (terlalu pendek) ditolak', !mmsiSah('99900000'))
  cek('MMSI 10 digit (terlalu panjang) ditolak', !mmsiSah('9990000011'))
  cek('MMSI berhuruf ditolak — huruf tidak dibuang diam-diam', normalisasiMmsi('99900000A') === '99900000A' && !mmsiSah('99900000A'))

  const tanpaMmsi = identitasKapal({ name: 'x' }, null)
  cek('body tanpa kunci mmsi → data TIDAK memuat mmsi (tak diubah)', !('mmsi' in tanpaMmsi.data) && tanpaMmsi.errors.length === 0)
  const mmsiKosong = identitasKapal({ mmsi: '', mmsiSource: 'COMPANY_DOCUMENT' }, null)
  cek('mmsi kosong → null, sumber & verifikasi ikut null, tanpa galat',
    mmsiKosong.data.mmsi === null && mmsiKosong.data.mmsiSource === null && mmsiKosong.data.mmsiVerifiedAt === null && mmsiKosong.errors.length === 0)
  cek('identitas: MMSI 8 digit → galat', identitasKapal({ mmsi: '99900000', mmsiSource: 'COMPANY_DOCUMENT' }, null).errors.length === 1)
  cek('identitas: MMSI 10 digit → galat', identitasKapal({ mmsi: '9990000011', mmsiSource: 'COMPANY_DOCUMENT' }, null).errors.length === 1)
  cek('identitas: MMSI non-angka → galat', identitasKapal({ mmsi: 'ABC000001', mmsiSource: 'COMPANY_DOCUMENT' }, null).errors.length === 1)
  cek('identitas: MMSI tanpa sumber → galat', identitasKapal({ mmsi: '999000001' }, null).errors.some((e) => e.includes('Sumber')))
  cek('identitas: sumber tak dikenal → galat', identitasKapal({ mmsi: '999000001', mmsiSource: 'TEBAKAN' }, null).errors.length === 1)
  cek('identitas: sumber huruf kecil dinormalisasi', identitasKapal({ mmsi: '999000001', mmsiSource: 'company_document' }, null).data.mmsiSource === 'COMPANY_DOCUMENT')

  const t0 = new Date('2026-09-14T03:00:00.000Z')
  const t1 = new Date('2026-09-20T03:00:00.000Z')
  const publik = identitasKapal({ mmsi: '999000001', mmsiSource: 'PUBLIC_TRACKING' }, null, t0)
  cek('PUBLIC_TRACKING → tidak terverifikasi (verifiedAt null)', publik.errors.length === 0 && publik.data.mmsiVerifiedAt === null)
  const principal = identitasKapal({ mmsi: '999000001', mmsiSource: 'PRINCIPAL_CONFIRMATION' }, null, t0)
  cek('PRINCIPAL_CONFIRMATION → terverifikasi dengan waktu', principal.data.mmsiVerifiedAt?.getTime() === t0.getTime())
  cek('simpan ulang tanpa perubahan → tanggal verifikasi lama DIPERTAHANKAN',
    hitungVerifikasiMmsi({ mmsi: '999000001', mmsiSource: 'PRINCIPAL_CONFIRMATION', mmsiVerifiedAt: t0 }, '999000001', 'PRINCIPAL_CONFIRMATION', t1)?.getTime() === t0.getTime())
  cek('MMSI berubah → diverifikasi ulang pada waktu baru',
    hitungVerifikasiMmsi({ mmsi: '999000001', mmsiSource: 'PRINCIPAL_CONFIRMATION', mmsiVerifiedAt: t0 }, '999000002', 'PRINCIPAL_CONFIRMATION', t1)?.getTime() === t1.getTime())
  cek('turun ke PUBLIC_TRACKING → verifikasi dihapus',
    hitungVerifikasiMmsi({ mmsi: '999000001', mmsiSource: 'COMPANY_DOCUMENT', mmsiVerifiedAt: t0 }, '999000001', 'PUBLIC_TRACKING', t1) === null)
  cek('sumber hanya disebut tanpa kunci mmsi → memakai MMSI lama',
    identitasKapal({ mmsiSource: 'COMPANY_DOCUMENT' }, { mmsi: '999000001', mmsiSource: 'PUBLIC_TRACKING', mmsiVerifiedAt: null }, t1).data.mmsi === '999000001')
  cek('daftar sumber: 4 nilai, hanya PUBLIC_TRACKING yang belum terverifikasi',
    SUMBER_MMSI.length === 4 && !SUMBER_MMSI_TERVERIFIKASI.includes('PUBLIC_TRACKING') && SUMBER_MMSI_TERVERIFIKASI.length === 3)

  cek('IMO check digit contoh baku 9074729 sah', imoCheckDigitSah('9074729'))
  cek('IMO check digit 9074728 tidak sah', !imoCheckDigitSah('9074728'))
  cek('IMO "IMO 9074729" dinormalisasi', normalisasiImo('IMO 9074729') === '9074729')
  cek('IMO "0"/"IMO 0" → null (kapal tanpa IMO)', normalisasiImo('0') === null && normalisasiImo('IMO 0') === null)
  const imoSalah = identitasKapal({ imoNumber: '9074728' }, null)
  cek('IMO check digit gagal → PERINGATAN, bukan galat', imoSalah.errors.length === 0 && imoSalah.warnings.length === 1)
  const imoLama = identitasKapal({ imoNumber: 'ABC-12' }, null)
  cek('IMO lama format bebas → peringatan saja, tetap bisa disimpan', imoLama.errors.length === 0 && imoLama.warnings.length === 1 && imoLama.data.imoNumber === 'ABC-12')
  cek('kapal tanpa IMO & tanpa MMSI → sah tanpa catatan', (() => { const r = identitasKapal({ imoNumber: '', mmsi: '' }, null); return r.errors.length === 0 && r.warnings.length === 0 })())

  cek('call sign "ybxx 12" → "YBXX12"', normalisasiCallSign('ybxx 12') === 'YBXX12')
  cek('call sign kosong → null (tidak wajib)', normalisasiCallSign('') === null)

  cek('D1: peran penulis kapal = ADMIN & OPERATOR saja', JSON.stringify(PERAN_UBAH_KAPAL) === JSON.stringify(['ADMIN', 'OPERATOR']))
}

// ------------------------------------------------------------------ 2. DB

async function bagianDb(tA, tB, dibuat) {
  console.log('\n2) Kendala database (unique tenantId + mmsi)')
  const catat = (v) => { dibuat.vesselIds.add(v.id); return v }

  const m = '999000101'
  catat(await prisma.vessel.create({ data: { tenantId: tA.id, name: `${TAG}DB A1`, mmsi: m, mmsiSource: 'COMPANY_DOCUMENT' } }))
  let galat = null
  try {
    catat(await prisma.vessel.create({ data: { tenantId: tA.id, name: `${TAG}DB A2`, mmsi: m, mmsiSource: 'COMPANY_DOCUMENT' } }))
  } catch (e) {
    galat = e
  }
  cek('MMSI ganda dalam tenant yang sama ditolak DB (P2002)', galat instanceof Prisma.PrismaClientKnownRequestError && galat.code === 'P2002')

  let galatB = null
  try {
    catat(await prisma.vessel.create({ data: { tenantId: tB.id, name: `${TAG}DB B1`, mmsi: m, mmsiSource: 'COMPANY_DOCUMENT' } }))
  } catch (e) {
    galatB = e
  }
  cek('MMSI yang sama di tenant LAIN diizinkan (tiap tenant memiliki baris kapalnya sendiri)', galatB === null)

  let galatNull = null
  try {
    catat(await prisma.vessel.create({ data: { tenantId: tA.id, name: `${TAG}DB tanpa MMSI 1` } }))
    catat(await prisma.vessel.create({ data: { tenantId: tA.id, name: `${TAG}DB tanpa MMSI 2` } }))
  } catch (e) {
    galatNull = e
  }
  cek('banyak kapal tanpa MMSI dalam satu tenant diizinkan', galatNull === null)

  // Kedua pemeriksaan di bawah dulunya memindai SELURUH tabel kapal dan menuntut
  // nol MMSI. Itu sah tepat sesudah migrasi, tetapi sekarang kapal demo/pilot yang
  // sah (mis. tug+barge PRD-004) sudah punya MMSI yang diisi LEWAT APLIKASI —
  // sehingga pemeriksaan lama menghukum data yang benar. Properti yang sebenarnya
  // ingin dijaga adalah "migrasi hanya menambah kolom NULL dan tidak mengarang
  // nilai", dan itu diuji di bawah tanpa bergantung pada isi DB dev.

  // (a) Kapal yang MMSI-nya memang tak pernah diisi: ketiga kolom baru harus NULL.
  const kapalTanpaMmsi = await prisma.vessel.findMany({
    where: { NOT: { name: { startsWith: TAG } }, mmsi: null },
    select: { id: true, mmsiSource: true, mmsiVerifiedAt: true },
  })
  cek('kapal tanpa MMSI: kolom identitas baru seluruhnya null (migrasi tidak mengarang data)',
    kapalTanpaMmsi.every((v) => v.mmsiSource === null && v.mmsiVerifiedAt === null), `${kapalTanpaMmsi.length} kapal`)

  // (b) `identitasKapal()` MENOLAK MMSI tanpa sumber ("Sumber MMSI wajib dipilih
  // bila MMSI diisi"), jadi baris ber-MMSI tetapi bersumber NULL mustahil lahir
  // dari aplikasi — persis wujud yang akan ditinggalkan backfill migrasi.
  const mmsiTanpaSumber = await prisma.vessel.count({
    where: { NOT: { name: { startsWith: TAG } }, mmsi: { not: null }, mmsiSource: null },
  })
  cek('tak ada MMSI tanpa sumber di luar uji (jejak khas backfill migrasi)', mmsiTanpaSumber === 0, `${mmsiTanpaSumber} kapal`)

  // (c) Kapal uji sendiri: dibuat tanpa MMSI → ketiga kolom baru NULL.
  const kapalUjiTanpaMmsi = await prisma.vessel.findMany({
    where: { name: { startsWith: `${TAG}DB tanpa MMSI` } },
    select: { mmsi: true, mmsiSource: true, mmsiVerifiedAt: true },
  })
  cek('kapal uji tanpa MMSI: ketiga kolom baru null',
    kapalUjiTanpaMmsi.length >= 2 && kapalUjiTanpaMmsi.every((v) => v.mmsi === null && v.mmsiSource === null && v.mmsiVerifiedAt === null),
    `${kapalUjiTanpaMmsi.length} kapal uji`)
}

// ------------------------------------------------------------------ 3. HTTP

async function bagianHttp(tA, tB, dibuat) {
  console.log('\n3) API /api/vessels lewat sesi login sungguhan')
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

  const target = await prisma.vessel.create({ data: { tenantId: tA.id, name: `${TAG}Target`, imoNumber: 'IMO 12345' } })
  dibuat.vesselIds.add(target.id)

  const anonim = buatSesi()
  cek('tanpa login: GET → 401', (await panggil(anonim, 'GET', '/api/vessels')).status === 401)
  cek('tanpa login: POST → 401', (await panggil(anonim, 'POST', '/api/vessels', { name: `${TAG}Anonim` })).status === 401)
  cek('tanpa login: PATCH → 401', (await panggil(anonim, 'PATCH', `/api/vessels/${target.id}`, { name: 'x' })).status === 401)
  cek('tanpa login: DELETE → 401', (await panggil(anonim, 'DELETE', `/api/vessels/${target.id}`)).status === 401)

  const sViewer = await login(uViewer.email)
  const sAdmin = await login(uAdmin.email)
  const sOper = await login(uOper.email)
  const sAdminB = await login(uAdminB.email)

  // --- VIEWER ---
  const g = await panggil(sViewer, 'GET', '/api/vessels')
  cek('VIEWER tetap boleh MEMBACA daftar kapal (GET 200)', g.status === 200 && Array.isArray(g.json))
  const jumlahSebelum = await prisma.vessel.count({ where: { tenantId: tA.id } })
  const vp = await panggil(sViewer, 'POST', '/api/vessels', { name: `${TAG}Viewer Buat` })
  const jumlahSesudah = await prisma.vessel.count({ where: { tenantId: tA.id } })
  cek('VIEWER tidak bisa MEMBUAT kapal (403, baris tidak bertambah)', vp.status === 403 && jumlahSebelum === jumlahSesudah, `HTTP ${vp.status}`)
  const vpa = await panggil(sViewer, 'PATCH', `/api/vessels/${target.id}`, { name: `${TAG}Viewer Ubah` })
  const setelahPatch = await prisma.vessel.findFirst({ where: { id: target.id } })
  cek('VIEWER tidak bisa MENGUBAH kapal (403, nama tetap)', vpa.status === 403 && setelahPatch?.name === target.name, `HTTP ${vpa.status}`)
  const vd = await panggil(sViewer, 'DELETE', `/api/vessels/${target.id}`)
  const masihAda = await prisma.vessel.count({ where: { id: target.id } })
  cek('VIEWER tidak bisa MENGHAPUS kapal (403, baris masih ada)', vd.status === 403 && masihAda === 1, `HTTP ${vd.status}`)

  // --- ADMIN ---
  const buat = await panggil(sAdmin, 'POST', '/api/vessels', {
    name: `${TAG}Admin Buat`, imoNumber: 'IMO 9074729', callSign: 'yb 99', mmsi: '999 000 201', mmsiSource: 'PRINCIPAL_CONFIRMATION',
  })
  const idBuat = buat.json?.vessel?.id
  if (idBuat) dibuat.vesselIds.add(idBuat)
  cek('ADMIN membuat kapal (200) dengan MMSI/IMO/call sign ternormalisasi',
    buat.status === 200 && buat.json?.vessel?.mmsi === '999000201' && buat.json?.vessel?.imoNumber === '9074729' && buat.json?.vessel?.callSign === 'YB99',
    `HTTP ${buat.status}`)
  cek('kapal dari sumber terverifikasi punya mmsiVerifiedAt', !!buat.json?.vessel?.mmsiVerifiedAt)
  cek('respons POST tetap memuat { ok, vessel } (kompatibel) + warnings', buat.json?.ok === true && Array.isArray(buat.json?.warnings))
  const auditBuat = idBuat ? await prisma.auditLog.findFirst({ where: { tableName: 'Vessel', recordId: idBuat, action: 'CREATE' } }) : null
  cek('pembuatan kapal tercatat di AuditLog dengan MMSI & sumbernya', auditBuat?.newValue?.mmsi === '999000201' && auditBuat?.newValue?.mmsiSource === 'PRINCIPAL_CONFIRMATION')

  cek('ADMIN: MMSI 8 digit → 400', (await panggil(sAdmin, 'POST', '/api/vessels', { name: `${TAG}Salah 1`, mmsi: '99900020', mmsiSource: 'COMPANY_DOCUMENT' })).status === 400)
  cek('ADMIN: MMSI 10 digit → 400', (await panggil(sAdmin, 'POST', '/api/vessels', { name: `${TAG}Salah 2`, mmsi: '9990002011', mmsiSource: 'COMPANY_DOCUMENT' })).status === 400)
  cek('ADMIN: MMSI berhuruf → 400', (await panggil(sAdmin, 'POST', '/api/vessels', { name: `${TAG}Salah 3`, mmsi: '99900020A', mmsiSource: 'COMPANY_DOCUMENT' })).status === 400)
  cek('ADMIN: MMSI tanpa sumber → 400', (await panggil(sAdmin, 'POST', '/api/vessels', { name: `${TAG}Salah 4`, mmsi: '999000202' })).status === 400)
  const ganda = await panggil(sAdmin, 'POST', '/api/vessels', { name: `${TAG}Ganda`, mmsi: '999000201', mmsiSource: 'COMPANY_DOCUMENT' })
  cek('ADMIN: MMSI ganda dalam perusahaan → 409 menyebut kapal pemegangnya', ganda.status === 409 && ganda.teks.includes(`${TAG}Admin Buat`), `HTTP ${ganda.status}`)
  const jumlahSalah = await prisma.vessel.count({ where: { name: { in: [`${TAG}Salah 1`, `${TAG}Salah 2`, `${TAG}Salah 3`, `${TAG}Salah 4`, `${TAG}Ganda`] } } })
  cek('tak satu pun kapal tidak sah ikut tersimpan', jumlahSalah === 0)

  if (idBuat) {
    const sebelum = await prisma.vessel.findFirst({ where: { id: idBuat } })
    // Klien lama (mis. tombol tambah kapal di Port Call Manager) tak mengirim kunci mmsi.
    const tanpa = await panggil(sAdmin, 'PATCH', `/api/vessels/${idBuat}`, { name: `${TAG}Admin Buat`, imoNumber: '9074729' })
    const s1 = await prisma.vessel.findFirst({ where: { id: idBuat } })
    cek('PATCH tanpa kunci mmsi TIDAK menghapus MMSI tersimpan', tanpa.status === 200 && s1?.mmsi === '999000201' && s1?.mmsiSource === 'PRINCIPAL_CONFIRMATION')
    cek('simpan ulang tanpa perubahan MMSI → tanggal verifikasi tidak bergeser', s1?.mmsiVerifiedAt?.getTime() === sebelum?.mmsiVerifiedAt?.getTime())

    const auditSebelum = await prisma.auditLog.count({ where: { tableName: 'Vessel', recordId: idBuat, action: 'UPDATE' } })
    const turun = await panggil(sAdmin, 'PATCH', `/api/vessels/${idBuat}`, {
      name: `${TAG}Admin Buat`, imoNumber: '9074729', mmsi: '999000201', mmsiSource: 'PUBLIC_TRACKING',
    })
    const s2 = await prisma.vessel.findFirst({ where: { id: idBuat } })
    cek('sumber diturunkan ke PUBLIC_TRACKING → verifikasi dihapus', turun.status === 200 && s2?.mmsiVerifiedAt === null)
    const auditUbah = await prisma.auditLog.findFirst({
      where: { tableName: 'Vessel', recordId: idBuat, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
    })
    const auditSesudah = await prisma.auditLog.count({ where: { tableName: 'Vessel', recordId: idBuat, action: 'UPDATE' } })
    cek('perubahan sumber MMSI tercatat di AuditLog (lama → baru)',
      auditSesudah === auditSebelum + 1 && auditUbah?.oldValue?.mmsiSource === 'PRINCIPAL_CONFIRMATION' && auditUbah?.newValue?.mmsiSource === 'PUBLIC_TRACKING')

    const peringatan = await panggil(sAdmin, 'PATCH', `/api/vessels/${idBuat}`, { name: `${TAG}Admin Buat`, imoNumber: '9074728' })
    cek('IMO check digit gagal → 200 dengan warnings (tidak memblokir)', peringatan.status === 200 && peringatan.json?.warnings?.length === 1)
  }

  const legacy = await panggil(sAdmin, 'PATCH', `/api/vessels/${target.id}`, { name: `${TAG}Target`, imoNumber: 'IMO 12345' })
  cek('kapal lama dengan IMO format lama tetap bisa disimpan (200 + peringatan, bukan 400)', legacy.status === 200, `HTTP ${legacy.status}`)

  const lintas = await panggil(sAdminB, 'PATCH', `/api/vessels/${target.id}`, { name: `${TAG}Dibajak` })
  cek('ADMIN tenant lain tidak bisa mengubah kapal tenant ini (404)', lintas.status === 404, `HTTP ${lintas.status}`)
  const lintasHapus = await panggil(sAdminB, 'DELETE', `/api/vessels/${target.id}`)
  cek('ADMIN tenant lain tidak bisa menghapus kapal tenant ini (404)', lintasHapus.status === 404, `HTTP ${lintasHapus.status}`)
  const gB = await panggil(sAdminB, 'GET', '/api/vessels')
  cek('GET tenant lain tidak memuat kapal tenant ini', gB.status === 200 && !gB.json.some((v) => v.id === target.id))

  // --- OPERATOR ---
  const ob = await panggil(sOper, 'POST', '/api/vessels', { name: `${TAG}Operator Buat` })
  const idOper = ob.json?.vessel?.id
  if (idOper) dibuat.vesselIds.add(idOper)
  cek('OPERATOR membuat kapal (200)', ob.status === 200 && !!idOper, `HTTP ${ob.status}`)
  cek('OPERATOR mengubah kapal (200)', idOper ? (await panggil(sOper, 'PATCH', `/api/vessels/${idOper}`, { name: `${TAG}Operator Ubah`, mmsi: '999000301', mmsiSource: 'COMPANY_DOCUMENT' })).status === 200 : false)
  cek('OPERATOR menghapus kapal (200)', idOper ? (await panggil(sOper, 'DELETE', `/api/vessels/${idOper}`)).status === 200 : false)
  const auditHapus = idOper ? await prisma.auditLog.findFirst({ where: { tableName: 'Vessel', recordId: idOper, action: 'DELETE' } }) : null
  cek('penghapusan kapal tercatat di AuditLog', auditHapus?.oldValue?.mmsi === '999000301')

  // --- ADMIN DELETE ---
  if (idBuat) {
    cek('ADMIN menghapus kapal (200)', (await panggil(sAdmin, 'DELETE', `/api/vessels/${idBuat}`)).status === 200)
  }
}

// ------------------------------------------------------------------ bersih-bersih

async function bersihkan(dibuat) {
  const ids = Array.from(dibuat.vesselIds)
  const berTag = await prisma.vessel.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })
  const semua = Array.from(new Set([...ids, ...berTag.map((v) => v.id)]))
  await prisma.auditLog.deleteMany({ where: { tableName: 'Vessel', recordId: { in: semua } } })
  await prisma.vessel.deleteMany({ where: { id: { in: semua } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL } } })
}

async function main() {
  const tA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } } })
  const tB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!tA || !tB) throw new Error('Tenant Tribuana / Verifikasi tidak ditemukan di DB dev.')

  const dibuat = { vesselIds: new Set(), userIds: [] }
  try {
    bagianMurni()
    await bagianDb(tA, tB, dibuat)
    await bagianHttp(tA, tB, dibuat)
  } finally {
    await bersihkan(dibuat)
    const sisa = await prisma.vessel.count({ where: { name: { startsWith: TAG } } })
    const sisaUser = await prisma.user.count({ where: { email: { startsWith: EMAIL } } })
    console.log(`\n  (bersih-bersih: sisa kapal uji ${sisa}, sisa user uji ${sisaUser})`)
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
