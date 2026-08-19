// Uji Product Analytics — K183/K184, Fase 8j.
//
// Jalankan:  node prisma/check-usage.mjs      (butuh `npm run dev` menyala)
//
// Urutan, mengikuti §17/8j:
//   1. VOYAGE_CREATED — satu baris ber-tenantId benar; pembuatan yang GAGAL
//      validasi tidak menghasilkan baris.
//   2. Menelan galatnya sendiri — INTI increment ini: usage.service.ts
//      ditambal sementara supaya PENULISANNYA gagal, lalu dibuktikan
//      createVoyage() TETAP berhasil (bukan try/catch tiruan di skrip uji —
//      try/catch ASLI di usage.service.ts yang diuji).
//   3. Sembilan peristiwa lain yang murah untuk dipicu lewat HTTP nyata:
//      DISBURSEMENT_SENT, INVOICE_ISSUED, AI_PREDICT_USED, PORTAL_LOGIN,
//      ONBOARDING_STEP_DONE, TASK_COMPLETED, REPORT_EXPORTED,
//      VENDOR_INVOICE_SUBMITTED.
//   4. meta tak memuat isi dokumen/nama pihak/nominal — diperiksa OTOMATIS
//      (pola regex) DAN dicetak untuk diperiksa manusia (K183 butir 3).
//   5. Ringkasan (/api/settings/usage) hanya menampilkan data tenant sendiri.
//   6. Tak ada layar di src/app/ yang membaca UsageEvent lintas-tenant (K184).
//
// SENGAJA TIDAK diuji lewat HTTP nyata di sini — AI_VESSEL_IMPORT_USED:
// hook-nya (route.ts) memanggil model AI sungguhan (biaya token + jaringan +
// nondeterministik), di luar anggaran skrip verifikasi otomatis. Diverifikasi
// lewat tsc + tinjauan kode (lihat catatan di kepala route.ts) — pola sama
// dengan migrate-logo-to-attachment.mjs yang menandai bagiannya sendiri
// "belum diuji" secara terbuka alih-alih berpura-pura sudah.

import { readFileSync, writeFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

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
const TAG = '8J-'
const SANDI = 'UjiPemakaian123!'

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

// ------------------------------------------------------------------- sesi

function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
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
      simpanCookie(res)
      return res
    },
  }
}

async function loginInternal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return sesi
}

async function loginPortal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/portal/auth/csrf')).json()
  await sesi.ambil('/api/portal/auth/callback/portal-credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return sesi
}

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// ---------------------------------------------------------- tambalan sumber

const BERKAS_USAGE = new URL('../src/services/saas/usage.service.ts', import.meta.url)
const PENANDA_ASLI = '    await forTenant(ctx).usageEvent.create({'
const PENANDA_TAMBAL =
  "    throw new Error('[uji K183 butir 2] sengaja gagal — harus tetap tak melempar ke pemanggil')\n" + PENANDA_ASLI

async function tungguKompilasiUlang(ms = 1400) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  let tenantA, tenantB
  let usageDitambal = false
  const asliUsage = readFileSync(BERKAS_USAGE, 'utf8')
  if (!asliUsage.includes(PENANDA_ASLI)) {
    throw new Error('usage.service.ts tidak dalam keadaan bersih (penanda create() tak ditemukan). Periksa `git diff`.')
  }

  try {
    // ==================== 0. Persiapan tenant + fixture ====================
    console.log('\n0. Menyiapkan tenant, kapal, vendor, admin')
    const sandiHash = await bcrypt.hash(SANDI, 10)
    const EMAIL_ADMIN = `${TAG.toLowerCase()}admin@uji.local`

    tenantA = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Pemakaian A`, plan: 'TRIAL',
        modulesEnabled: ['portcall', 'finance', 'procurement'],
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
        users: { create: { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: sandiHash, role: 'ADMIN' } },
      },
    })
    const admin = await prisma.user.findFirst({ where: { tenantId: tenantA.id, email: EMAIL_ADMIN } })
    const kapal = await prisma.vessel.create({ data: { tenantId: tenantA.id, name: `${TAG}MV Uji`, gt: 5000 } })
    const vendorX = await prisma.vendor.create({ data: { tenantId: tenantA.id, name: `${TAG}Vendor X` } })
    await prisma.currency.create({ data: { tenantId: tenantA.id, code: 'IDR', decimals: 2 } })

    tenantB = await prisma.tenant.create({ data: { companyName: `${TAG}Uji Pemakaian B`, plan: 'TRIAL', modulesEnabled: ['portcall'] } })

    const sesiAdmin = await loginInternal(EMAIL_ADMIN, SANDI)
    cek('login ADMIN tenant A berhasil', (await sesiAdmin.ambil('/api/onboarding')).status === 200)

    const hitung = () => prisma.usageEvent.count({ where: { tenantId: tenantA.id } })

    // ==================== 1. VOYAGE_CREATED ====================
    console.log('\n1. VOYAGE_CREATED — buat berhasil vs gagal validasi (butir 1)')
    const sebelumVoyage = await hitung()
    const gagalVoyage = await jsonPost(sesiAdmin, '/api/voyages', {}) // tanpa vesselId → validasi gagal
    cek('POST tanpa vesselId ditolak', gagalVoyage.status >= 400, `status ${gagalVoyage.status}`)
    cek('pembuatan yang GAGAL tak menghasilkan baris', (await hitung()) === sebelumVoyage)

    const voyageRes = await jsonPost(sesiAdmin, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    const { voyage } = await voyageRes.json()
    cek('POST voyage sah → 200/201', voyageRes.status < 300, `status ${voyageRes.status}`)
    const barisVoyage = await prisma.usageEvent.findFirst({
      where: { tenantId: tenantA.id, nama: 'VOYAGE_CREATED' },
      orderBy: { createdAt: 'desc' },
    })
    cek('tepat satu baris VOYAGE_CREATED baru', (await hitung()) === sebelumVoyage + 1, `${sebelumVoyage} → ${await hitung()}`)
    cek('baris ber-tenantId benar', barisVoyage?.tenantId === tenantA.id)
    cek('baris ber-userId = admin yang membuat', barisVoyage?.userId === admin.id, barisVoyage?.userId)

    // ==================== 2. Menelan galatnya sendiri ====================
    console.log('\n2. usage.service.ts ditambal supaya PENULISAN gagal — voyage tetap berhasil (butir 2, INTI)')
    writeFileSync(BERKAS_USAGE, asliUsage.replace(PENANDA_ASLI, PENANDA_TAMBAL))
    usageDitambal = true
    await tungguKompilasiUlang()

    const sebelumTambal = await hitung()
    const voyageResTambal = await jsonPost(sesiAdmin, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    cek(
      'POST voyage TETAP 200/201 meski catatPemakaian() dipaksa melempar',
      voyageResTambal.status < 300,
      `status ${voyageResTambal.status}`,
    )
    const { voyage: voyageTambal } = await voyageResTambal.json()
    cek('voyage sungguhan tercipta di DB', !!voyageTambal?.id)
    cek('NOL baris UsageEvent baru selagi ditambal (penulisan memang gagal, hanya tak melempar)', (await hitung()) === sebelumTambal)

    writeFileSync(BERKAS_USAGE, asliUsage)
    usageDitambal = false
    await tungguKompilasiUlang()
    const pulihRes = await jsonPost(sesiAdmin, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    cek('sesudah dipulihkan, POST voyage sah lagi', pulihRes.status < 300, `status ${pulihRes.status}`)
    cek('sesudah dipulihkan, baris UsageEvent tercatat lagi', (await hitung()) === sebelumTambal + 1)

    // ==================== 3a. DISBURSEMENT_SENT + AI_PREDICT_USED ====================
    console.log('\n3a. DISBURSEMENT_SENT & AI_PREDICT_USED')
    const disb = await prisma.disbursement.create({
      data: {
        tenantId: tenantA.id, voyageId: voyage.id, kind: 'EPDA', docNumber: `${TAG}EPDA-0001`,
        status: 'APPROVED', baseCurrency: 'IDR',
      },
    })
    await prisma.disbursement.update({ where: { id: disb.id }, data: { rootId: disb.id } })

    const sebelumPredict = await hitung()
    const predictRes = await jsonPost(sesiAdmin, '/api/ai/predict', { disbursementId: disb.id })
    cek('POST /api/ai/predict → 200', predictRes.status === 200, `status ${predictRes.status}`)
    const barisPredict = await prisma.usageEvent.findFirst({ where: { tenantId: tenantA.id, nama: 'AI_PREDICT_USED' }, orderBy: { createdAt: 'desc' } })
    cek('baris AI_PREDICT_USED baru', (await hitung()) === sebelumPredict + 1)
    cek('meta.jenis = disbursement', barisPredict?.meta?.jenis === 'disbursement', JSON.stringify(barisPredict?.meta))

    const sebelumSent = await hitung()
    const sentRes = await jsonPost(sesiAdmin, `/api/disbursements/${disb.id}/status`, { status: 'SENT' })
    cek('POST status→SENT → 200', sentRes.status === 200, `status ${sentRes.status}`)
    const barisSent = await prisma.usageEvent.findFirst({ where: { tenantId: tenantA.id, nama: 'DISBURSEMENT_SENT' }, orderBy: { createdAt: 'desc' } })
    cek('baris DISBURSEMENT_SENT baru', (await hitung()) === sebelumSent + 1)
    cek('meta.kind = EPDA', barisSent?.meta?.kind === 'EPDA', JSON.stringify(barisSent?.meta))

    // ==================== 3b. INVOICE_ISSUED ====================
    console.log('\n3b. INVOICE_ISSUED')
    const inv = await prisma.invoice.create({
      data: { tenantId: tenantA.id, invoiceNumber: `${TAG}INV-0001`, currency: 'IDR', status: 'DRAFT' },
    })
    const sebelumInv = await hitung()
    const invRes = await jsonPost(sesiAdmin, `/api/invoices/${inv.id}/status`, { status: 'ISSUED' })
    cek('POST status→ISSUED → 200', invRes.status === 200, `status ${invRes.status}`)
    cek('baris INVOICE_ISSUED baru', (await hitung()) === sebelumInv + 1)

    // ==================== 3c. ONBOARDING_STEP_DONE ====================
    console.log('\n3c. ONBOARDING_STEP_DONE')
    const sebelumOnb = await hitung()
    const onbRes = await jsonPost(sesiAdmin, '/api/onboarding/step', { langkah: 'PROFIL' })
    cek('POST onboarding/step → 200', onbRes.status === 200, `status ${onbRes.status}`)
    const barisOnb = await prisma.usageEvent.findFirst({ where: { tenantId: tenantA.id, nama: 'ONBOARDING_STEP_DONE' }, orderBy: { createdAt: 'desc' } })
    cek('baris ONBOARDING_STEP_DONE baru', (await hitung()) === sebelumOnb + 1)
    cek('meta.langkah = PROFIL', barisOnb?.meta?.langkah === 'PROFIL', JSON.stringify(barisOnb?.meta))

    // ==================== 3d. TASK_COMPLETED ====================
    console.log('\n3d. TASK_COMPLETED')
    const tugas = await prisma.task.create({
      data: { tenantId: tenantA.id, title: `${TAG}Tugas uji`, status: 'IN_PROGRESS', createdByUserId: admin.id, startedAt: new Date() },
    })
    const sebelumTugas = await hitung()
    const tugasRes = await jsonPost(sesiAdmin, `/api/tasks/${tugas.id}/status`, { status: 'DONE' })
    cek('POST task status→DONE → 200', tugasRes.status === 200, `status ${tugasRes.status}`)
    cek('baris TASK_COMPLETED baru', (await hitung()) === sebelumTugas + 1)

    // ==================== 3e. REPORT_EXPORTED ====================
    console.log('\n3e. REPORT_EXPORTED')
    const sebelumLap = await hitung()
    const lapRes = await sesiAdmin.ambil('/api/reports/voyage-register/xlsx')
    cek('GET voyage-register/xlsx → 200', lapRes.status === 200, `status ${lapRes.status}`)
    const barisLap = await prisma.usageEvent.findFirst({ where: { tenantId: tenantA.id, nama: 'REPORT_EXPORTED' }, orderBy: { createdAt: 'desc' } })
    cek('baris REPORT_EXPORTED baru', (await hitung()) === sebelumLap + 1)
    cek('meta.laporan = voyage-register', barisLap?.meta?.laporan === 'voyage-register')

    // ==================== 3f. PORTAL_LOGIN + VENDOR_INVOICE_SUBMITTED ====================
    console.log('\n3f. PORTAL_LOGIN & VENDOR_INVOICE_SUBMITTED')
    const EMAIL_PORTAL = `${TAG.toLowerCase()}vendor@uji.local`
    const inv2 = await jsonPost(sesiAdmin, '/api/portal-invitations', { pihak: 'VENDOR', email: EMAIL_PORTAL, vendorId: vendorX.id })
    const { token } = await inv2.json()
    await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: SANDI, name: EMAIL_PORTAL }),
    })

    const sebelumLogin = await hitung()
    const sesiVendor = await loginPortal(EMAIL_PORTAL, SANDI)
    const barisLogin = await prisma.usageEvent.findFirst({ where: { tenantId: tenantA.id, nama: 'PORTAL_LOGIN' }, orderBy: { createdAt: 'desc' } })
    cek('baris PORTAL_LOGIN baru', (await hitung()) === sebelumLogin + 1)
    cek('userId NULL untuk peristiwa portal (skema K183)', barisLogin?.userId === null, String(barisLogin?.userId))
    cek('tenantId tetap benar', barisLogin?.tenantId === tenantA.id)

    const sebelumSubmit = await hitung()
    const submitForm = new FormData()
    submitForm.set('invoiceNo', `${TAG}VINV-0001`)
    submitForm.set('invoiceDate', new Date().toISOString().slice(0, 10))
    submitForm.set('amount', '1500000')
    submitForm.set('file', new Blob([Buffer.from('%PDF-1.4 uji')], { type: 'application/pdf' }), 'tagihan.pdf')
    const submitRes = await sesiVendor.ambil('/api/portal/submissions', { method: 'POST', body: submitForm })
    cek('POST portal/submissions → 201', submitRes.status === 201, `status ${submitRes.status}`)
    cek('baris VENDOR_INVOICE_SUBMITTED baru', (await hitung()) === sebelumSubmit + 1)

    // ==================== 4. meta hygiene ====================
    console.log('\n4. meta tak memuat isi dokumen/nama pihak/nominal (butir 3, K183)')
    const semuaBaris = await prisma.usageEvent.findMany({
      where: { tenantId: tenantA.id }, orderBy: { createdAt: 'desc' }, take: 20,
    })
    console.log(`   ${semuaBaris.length} baris terakhir (untuk diperiksa mata manusia juga):`)
    let metaMencurigakan = 0
    // Pola kasar: angka >= 1000 (potensi nominal rupiah) atau string > 40
    // karakter (potensi nama/alamat/isi dokumen) di NILAI meta mana pun.
    for (const b of semuaBaris) {
      console.log(`     ${b.createdAt.toISOString()}  ${b.nama.padEnd(24)} meta=${JSON.stringify(b.meta)} userId=${b.userId ?? 'null'}`)
      if (b.meta && typeof b.meta === 'object') {
        for (const v of Object.values(b.meta)) {
          if (typeof v === 'number' && Math.abs(v) >= 1000) metaMencurigakan++
          if (typeof v === 'string' && v.length > 40) metaMencurigakan++
        }
      }
    }
    cek('tak ada nilai meta yang mirip nominal/isi bebas (heuristik)', metaMencurigakan === 0, `${metaMencurigakan} mencurigakan`)

    // ==================== 5. Isolasi ringkasan tenant ====================
    console.log('\n5. /api/settings/usage hanya menampilkan tenant sendiri (butir 5, K184)')
    // Tenant B membuat aktivitasnya SENDIRI supaya ada sesuatu yang BISA bocor.
    const EMAIL_ADMIN_B = `${TAG.toLowerCase()}admin-b@uji.local`
    await prisma.user.create({ data: { tenantId: tenantB.id, name: `${TAG}Admin B`, email: EMAIL_ADMIN_B, password: sandiHash, role: 'ADMIN' } })
    const kapalB = await prisma.vessel.create({ data: { tenantId: tenantB.id, name: `${TAG}MV Uji B`, gt: 3000 } })
    const sesiAdminB = await loginInternal(EMAIL_ADMIN_B, SANDI)
    await jsonPost(sesiAdminB, '/api/voyages', { vesselId: kapalB.id, baseCurrency: 'IDR' })

    const ringkasanA = await (await sesiAdmin.ambil('/api/settings/usage')).json()
    const barisVoyageA = ringkasanA.perPeristiwa.find((p) => p.nama === 'VOYAGE_CREATED')
    const jumlahVoyageANyata = await prisma.usageEvent.count({ where: { tenantId: tenantA.id, nama: 'VOYAGE_CREATED' } })
    cek(
      'ringkasan A.VOYAGE_CREATED = jumlah baris A sungguhan (tak ikut hitungan B)',
      barisVoyageA?.jumlah === jumlahVoyageANyata,
      `${barisVoyageA?.jumlah} vs ${jumlahVoyageANyata}`,
    )
    cek('ringkasan mencakup SEMUA 10 nama peristiwa (termasuk yang 0)', ringkasanA.perPeristiwa.length === 10, ringkasanA.perPeristiwa.length)

    // ==================== 6. Tak ada layar lintas-tenant (K184) ====================
    console.log('\n6. Grep src/app/ — tak ada layar yang membaca UsageEvent lintas-tenant (butir 6)')
    const { execFileSync } = await import('node:child_process')
    const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    let hasilGrep = ''
    try {
      hasilGrep = execFileSync('grep', ['-rl', 'usageEvent', 'src/app/'], { cwd: AKAR, encoding: 'utf8' })
    } catch (e) {
      hasilGrep = e.stdout ?? '' // grep exit 1 = tak ada match, itu HASIL yang diharapkan
    }
    const berkasDitemukan = hasilGrep.split('\n').filter(Boolean).map((p) => p.replace(/\\/g, '/'))
    const DIIZINKAN = new Set(['src/app/api/settings/usage/route.ts'])
    const takDiizinkan = berkasDitemukan.filter((p) => !DIIZINKAN.has(p))
    cek(
      'HANYA /api/settings/usage (baca-diri-sendiri) yang menyentuh usageEvent di src/app/',
      takDiizinkan.length === 0,
      takDiizinkan.join(', '),
    )
    console.log(`   (skrip Marlon ada di prisma/usage-report.mjs — di LUAR src/app/, dijalankan manual, bukan lewat sesi HTTP siapa pun.)`)
  } finally {
    if (usageDitambal) {
      writeFileSync(BERKAS_USAGE, asliUsage)
      console.log('\n  ↩️  usage.service.ts dipulihkan (jalur finally, sesudah galat).')
    }

    console.log('\n  bersih-bersih data uji…')
    for (const t of [tenantA, tenantB]) {
      if (!t) continue
      await prisma.usageEvent.deleteMany({ where: { tenantId: t.id } })
      await prisma.attachment.deleteMany({ where: { tenantId: t.id } })
      await prisma.vendorInvoiceSubmission.deleteMany({ where: { tenantId: t.id } })
      await prisma.portalAccess.deleteMany({ where: { tenantId: t.id } })
      await prisma.portalUser.deleteMany({ where: { tenantId: t.id } })
      await prisma.portalInvitation.deleteMany({ where: { tenantId: t.id } })
      await prisma.task.deleteMany({ where: { tenantId: t.id } })
      await prisma.invoice.deleteMany({ where: { tenantId: t.id } })
      await prisma.disbursement.deleteMany({ where: { tenantId: t.id } })
      await prisma.voyage.deleteMany({ where: { tenantId: t.id } })
      await prisma.vendor.deleteMany({ where: { tenantId: t.id } })
      await prisma.vessel.deleteMany({ where: { tenantId: t.id } })
      await prisma.currency.deleteMany({ where: { tenantId: t.id } })
      await prisma.user.deleteMany({ where: { tenantId: t.id } })
      await prisma.tenant.delete({ where: { id: t.id } })
    }
    const sisa = await prisma.tenant.count({ where: { companyName: { startsWith: TAG } } })
    cek('nol data uji tersisa', sisa === 0)
  }

  console.log('\n' + '='.repeat(50))
  console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
  console.log('⚠️  Ingat: AI_VESSEL_IMPORT_USED tak diuji lewat HTTP di sini (butuh panggilan AI sungguhan) — lihat catatan di kepala berkas ini.')
  console.log('='.repeat(50))
  if (gagal > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
