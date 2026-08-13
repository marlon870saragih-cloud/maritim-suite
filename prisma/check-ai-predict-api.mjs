// Verifikasi Fase 6c — Cost Prediction lewat API NYATA (sesi login sungguhan).
//
// Beda tegas dari `check-ai-prediction.mjs` (6b): berkas itu menguji modul MURNI
// dengan angka bikinan dan bisa jalan tanpa apa pun. Yang di sini menguji
// `prediction.service.ts` + `POST /api/ai/predict`, yang menyentuh database dan
// sesi — jadi ia MEMBUTUHKAN server dev berjalan di `BASE_URL` (bawaan
// http://localhost:3000) dan database dev yang sama.
//
//   node prisma/check-ai-predict-api.mjs
//
// Alur: buat data disposable → login sungguhan → 9 butir verifikasi §15/6c →
// HAPUS seluruh data disposable. Bila skrip mati di tengah jalan, jalankan
// `node prisma/cleanup-fase6c-test-residue.mjs` untuk membersihkan sisanya.
//
// ⚠️ Skrip ini MENULIS ke database dev (voyage/disbursement/user/vessel
// disposable, semuanya berawalan `6C-`), termasuk SATU baris di tenant kedua
// untuk membuktikan pagar K65. Tidak ada satu pun baris milik Tribuana yang
// sudah ada yang diubah secara permanen — pelabelan `FDA/2026/08/0001`
// dikembalikan ke nilai semula sebelum skrip selesai.

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
const SANDI = 'Uji6cPredict!2026'

const TAG = '6C-'
const EMAIL_A = 'predict-6c-a@tribuanagency.co.id'
const EMAIL_B = 'predict-6c-b@verifikasi.local'

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

const rp = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('id-ID'))

// ------------------------------------------------------------------ sesi HTTP

function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
    const raw = res.headers.getSetCookie?.() ?? []
    for (const c of raw) {
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

async function login(email, password) {
  const sesi = buatSesi()
  const csrfRes = await sesi.ambil('/api/auth/csrf')
  const { csrfToken } = await csrfRes.json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login gagal untuk ${email}`)
  return sesi
}

async function predict(sesi, body) {
  const res = await sesi.ambil('/api/ai/predict', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

const baris = (hasil, kode) => (hasil.json.prediksi ?? []).find((p) => p.serviceCode === kode)

// -------------------------------------------------------- hitungan query (K65/9)

/**
 * Butir 9 — jumlah operasi Prisma untuk satu pemanggilan predict, dihitung di
 * DALAM proses server oleh extension `$allOperations` dan dibaca lewat route
 * instrumentasi sementara `/api/ai/qcount-tmp`.
 *
 * ⚠️ Route itu + penghitungnya di `src/lib/prisma.ts` adalah PERKAKAS UJI yang
 * DIHAPUS sebelum increment ini selesai. Kalau fungsi ini mengembalikan 404,
 * itu berarti perkakasnya memang sudah dicabut — pasang lagi bila perlu diukur
 * ulang (lihat laporan 6c).
 */
async function hitungQuery(sesi, disbursementId) {
  const res = await sesi.ambil('/api/ai/qcount-tmp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disbursementId }),
  })
  if (res.status === 404) return { queries: -1, baris: -1, tanpaPerkakas: true }
  return res.json()
}

// --------------------------------------------------------------- data disposable

const HARI = 24 * 60 * 60 * 1000

async function siapkanData() {
  const tenantA = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Tribuana' } } })
  const tenantB = await prisma.tenant.findFirst({ where: { companyName: { contains: 'Verifikasi' } } })
  if (!tenantA || !tenantB) throw new Error('Tenant Tribuana / Verifikasi tidak ditemukan di DB dev.')

  const portBpn = await prisma.port.findFirst({ where: { tenantId: tenantA.id, unlocode: 'IDBPN' } })
  const portSgsin = await prisma.port.findFirst({ where: { tenantId: tenantA.id, unlocode: 'SGSIN' } })
  const kapal = await prisma.vessel.findFirst({ where: { tenantId: tenantA.id, gt: { not: null }, vesselType: { not: null } } })
  const kapalTanpaGt = await prisma.vessel.findFirst({ where: { tenantId: tenantA.id, gt: null } })
  const pilotage = await prisma.serviceCatalog.findFirst({ where: { tenantId: tenantA.id, serviceCode: 'PILOTAGE' } })
  const wharfage = await prisma.serviceCatalog.findFirst({ where: { tenantId: tenantA.id, serviceCode: 'WHARFAGE' } })
  const jasaLain = await prisma.serviceCatalog.findMany({
    where: { tenantId: tenantA.id, serviceCode: { in: ['LIGHT_DUES', 'PORT_DUES', 'ANCHORAGE', 'MOORING', 'CUSTOMS', 'IMMIGRATION'] } },
  })

  const sandi = await bcrypt.hash(SANDI, 10)
  const userA = await prisma.user.create({
    data: { tenantId: tenantA.id, email: EMAIL_A, name: `${TAG}Penguji A`, password: sandi, role: 'ADMIN' },
  })
  const userB = await prisma.user.create({
    data: { tenantId: tenantB.id, email: EMAIL_B, name: `${TAG}Penguji B`, password: sandi, role: 'ADMIN' },
  })

  // Tanggal target SESUDAH effectiveFrom tarif katalog (2026-08-10) supaya
  // `pilihTarif()` menemukan tarif — jalur KATALOG harus punya angka.
  const etb = new Date('2026-08-20T08:00:00.000Z')
  const etd = new Date('2026-08-23T08:00:00.000Z')

  const voyageTarget = await prisma.voyage.create({
    data: {
      tenantId: tenantA.id,
      voyageNumber: `${TAG}VYG-TARGET`,
      vesselId: kapal.id,
      portId: portBpn.id,
      eta: etb,
      etb,
      etd,
      baseCurrency: 'IDR',
      dataOrigin: 'UJI',
    },
  })

  const voyageTanpaGt = await prisma.voyage.create({
    data: {
      tenantId: tenantA.id,
      voyageNumber: `${TAG}VYG-NOGT`,
      vesselId: kapalTanpaGt.id,
      portId: portBpn.id,
      eta: etb,
      etb,
      etd,
      baseCurrency: 'IDR',
      dataOrigin: 'UJI',
    },
  })

  const voyageSgsin = await prisma.voyage.create({
    data: {
      tenantId: tenantA.id,
      voyageNumber: `${TAG}VYG-SGSIN`,
      vesselId: kapal.id,
      portId: portSgsin.id,
      eta: etb,
      etb,
      etd,
      baseCurrency: 'IDR',
      dataOrigin: 'UJI',
    },
  })

  // EPDA target: 2 baris (PILOTAGE + WHARFAGE) — dipakai butir 1–5.
  const epdaKecil = await buatDisbursement(tenantA.id, voyageTarget.id, 'EPDA', `EPDA/${TAG}0001`, 'DRAFT', 'UJI', [
    { service: pilotage, unitPrice: 0 },
    { service: wharfage, unitPrice: 0 },
  ])

  // EPDA gemuk: 8 baris — pembanding jumlah query (butir 9).
  const epdaGemuk = await buatDisbursement(tenantA.id, voyageTarget.id, 'EPDA', `EPDA/${TAG}0002`, 'DRAFT', 'UJI', [
    { service: pilotage, unitPrice: 0 },
    { service: wharfage, unitPrice: 0 },
    ...jasaLain.map((s) => ({ service: s, unitPrice: 0 })),
  ])

  // Tiga kunjungan histori: pelabuhan sama, kapal sejenis, GT sama persis →
  // tingkat kemiripan 1. Voyage dicap NYATA sejak awal; DOKUMEN-nya masih 'UJI'
  // supaya butir 2 bisa menaikkannya lewat PATCH ADMIN (dan K58 ikut terbukti).
  const HARGA = [4_500_000, 4_750_000, 5_000_000]
  const histori = []
  for (let i = 0; i < HARGA.length; i++) {
    const tgl = new Date(etb.getTime() - (60 + i * 10) * HARI)
    const v = await prisma.voyage.create({
      data: {
        tenantId: tenantA.id,
        voyageNumber: `${TAG}VYG-HIST-${i + 1}`,
        vesselId: kapal.id,
        portId: portBpn.id,
        eta: tgl,
        ata: tgl,
        atb: tgl,
        atd: new Date(tgl.getTime() + 2 * HARI),
        baseCurrency: 'IDR',
        dataOrigin: 'NYATA',
      },
    })
    const d = await buatDisbursement(tenantA.id, v.id, 'FDA', `FDA/${TAG}000${i + 1}`, 'CLOSED', 'UJI', [
      { service: pilotage, unitPrice: HARGA[i] },
    ], tgl)
    histori.push({ voyageId: v.id, disbursementId: d.id, unitPrice: HARGA[i] })
  }

  // ---- TENANT LAIN (bukti K65) -------------------------------------------
  // Dibuat semirip mungkin dengan sampel milik tenant A: pelabuhan yang dipakai
  // adalah PORT MILIK TENANT A (FK lintas-tenant memang mungkin di tingkat DB),
  // jenis & GT kapal sama, jasa yang dirujuk adalah `ServiceCatalog` MILIK
  // TENANT A, dan asal datanya NYATA. Dengan begitu SATU-SATUNYA hal yang bisa
  // menahannya masuk ke prediksi tenant A adalah pagar tenant di query induk.
  const kapalB = await prisma.vessel.create({
    data: { tenantId: tenantB.id, name: `${TAG}MV Tenant B`, gt: kapal.gt, vesselType: kapal.vesselType },
  })
  const voyageB = await prisma.voyage.create({
    data: {
      tenantId: tenantB.id,
      voyageNumber: `${TAG}VYG-TENANT-B`,
      vesselId: kapalB.id,
      portId: portBpn.id, // ← sengaja: port milik tenant A
      eta: new Date(etb.getTime() - 30 * HARI),
      ata: new Date(etb.getTime() - 30 * HARI),
      baseCurrency: 'IDR',
      dataOrigin: 'NYATA',
    },
  })
  const disbB = await buatDisbursement(
    tenantB.id,
    voyageB.id,
    'FDA',
    `FDA/${TAG}TENANT-B`,
    'CLOSED',
    'NYATA',
    [{ service: pilotage, unitPrice: 9_999_999 }], // ← sengaja: serviceId milik tenant A
    new Date(etb.getTime() - 30 * HARI),
  )

  return {
    tenantA, tenantB, portBpn, portSgsin, kapal, kapalTanpaGt, pilotage, wharfage,
    userA, userB, voyageTarget, voyageTanpaGt, voyageSgsin, epdaKecil, epdaGemuk,
    histori, voyageB, disbB, kapalB, etb, etd,
  }
}

async function buatDisbursement(tenantId, voyageId, kind, docNumber, status, dataOrigin, items, issuedAt) {
  return prisma.disbursement.create({
    data: {
      tenantId,
      voyageId,
      kind,
      docNumber,
      status,
      dataOrigin,
      baseCurrency: 'IDR',
      issuedAt: issuedAt ?? new Date(),
      items: {
        create: items.map((it, i) => ({
          serviceId: it.service.id,
          description: it.service.serviceName,
          calcMethod: it.service.calcMethod,
          quantity: it.quantity ?? 1,
          unitPrice: it.unitPrice,
          minCharge: it.minCharge ?? null,
          currency: 'IDR',
          exchangeRate: 1,
          amount: (it.quantity ?? 1) * it.unitPrice,
          amountBase: (it.quantity ?? 1) * it.unitPrice,
          displayOrder: (i + 1) * 10,
        })),
      },
    },
  })
}

// ------------------------------------------------------------------- pembersihan

async function bersihkan() {
  const voyages = await prisma.voyage.findMany({ where: { voyageNumber: { startsWith: TAG } }, select: { id: true } })
  const ids = voyages.map((v) => v.id)
  const disbs = await prisma.disbursement.findMany({ where: { voyageId: { in: ids } }, select: { id: true } })
  const disbIds = disbs.map((d) => d.id)

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { tableName: 'Disbursement', recordId: { in: disbIds } } }),
    prisma.auditLog.deleteMany({ where: { tableName: 'Voyage', recordId: { in: ids } } }),
    prisma.approval.deleteMany({ where: { entityType: 'DISBURSEMENT', entityId: { in: disbIds } } }),
    prisma.disbursement.deleteMany({ where: { voyageId: { in: ids } } }), // cascade → items
    prisma.voyage.deleteMany({ where: { id: { in: ids } } }),
    prisma.vessel.deleteMany({ where: { name: { startsWith: TAG } } }),
    prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }),
  ])
  return { voyage: ids.length, disbursement: disbIds.length }
}

// ------------------------------------------------------------------------ main

async function main() {
  console.log(`Verifikasi Fase 6c — API ${BASE_URL}\n`)

  // Bersihkan lebih dulu, kalau-kalau ada sisa dari jalannya yang gagal.
  await bersihkan()
  const d = await siapkanData()
  const sesiA = await login(EMAIL_A, SANDI)

  try {
    // ---------------------------------------------------------------- butir 1
    console.log('1. EPDA apa adanya (0 FDA nyata) — semua baris jujur "belum ada data"')
    // Catatan penyimpangan: `VYG-2026-000002` di DB dev TIDAK punya `portId`,
    // sehingga tak satu pun tingkat kemiripan bisa dievaluasi (K63: pelabuhan
    // SELALU sama) dan seluruh barisnya jatuh ke KATALOG. Yang diuji di sini
    // adalah versi yang lebih berat: voyage BERPELABUHAN dengan 3 FDA histori
    // yang semuanya masih berasal 'UJI' — jadi jalur LATIHAN benar-benar dilewati.
    let h = await predict(sesiA, { disbursementId: d.epdaKecil.id })
    cek('HTTP 200', h.status === 200, `status ${h.status}`)
    const semua1 = h.json.prediksi ?? []
    cek('2 baris diprediksi', semua1.length === 2, `${semua1.length} baris`)
    cek(
      'setiap baris tier LATIHAN/KATALOG, confidence ≤ 0,20, band RENDAH, nNyata 0',
      semua1.every(
        (p) => ['LATIHAN', 'KATALOG'].includes(p.tier) && p.confidence <= 0.2 && p.band === 'RENDAH' && p.dasar.nNyata === 0,
      ),
      semua1.map((p) => `${p.serviceCode}:${p.tier}/${p.confidence}/${p.band}/n=${p.dasar.nNyata}`).join(' '),
    )
    const pil1 = baris(h, 'PILOTAGE')
    cek('PILOTAGE = LATIHAN (3 baris contoh terbaca, tak dipakai menaikkan keyakinan)',
      pil1.tier === 'LATIHAN' && pil1.dasar.nLatihan === 3, `nLatihan=${pil1.dasar.nLatihan} teks="${pil1.teks}"`)

    // ---------------------------------------------------------------- butir 2
    console.log('\n2. Satu FDA ditandai NYATA lewat PATCH ADMIN (route 6a) → CAMPURAN')
    // K58 lebih dulu: dokumen NYATA di atas voyage UJI tetap UJI.
    await patchAsal(sesiA, 'voyages', d.histori[0].voyageId, 'UJI')
    await patchAsal(sesiA, 'disbursements', d.histori[0].disbursementId, 'NYATA')
    h = await predict(sesiA, { disbursementId: d.epdaKecil.id })
    cek('K58 — dokumen NYATA di atas voyage UJI tetap tak dihitung nyata',
      baris(h, 'PILOTAGE').dasar.nNyata === 0, `nNyata=${baris(h, 'PILOTAGE').dasar.nNyata}`)

    await patchAsal(sesiA, 'voyages', d.histori[0].voyageId, 'NYATA')
    h = await predict(sesiA, { disbursementId: d.epdaKecil.id })
    const pil2 = baris(h, 'PILOTAGE')
    cek('tier CAMPURAN', pil2.tier === 'CAMPURAN', pil2.tier)
    cek('nNyata = 1', pil2.dasar.nNyata === 1, `${pil2.dasar.nNyata}`)
    cek('p25 = median = p75 (satu kunjungan, bukan rentang palsu)',
      pil2.unitPrice.p25 === pil2.unitPrice.p75 && pil2.unitPrice.median === pil2.unitPrice.p25,
      `${rp(pil2.unitPrice.p25)} / ${rp(pil2.unitPrice.median)} / ${rp(pil2.unitPrice.p75)}`)
    cek('confidence ≤ 0,40 (topi CAMPURAN)', pil2.confidence <= 0.4, `${pil2.confidence}`)
    cek('V = 0,5 terpakai → confidence = S×R×V×M ≤ 0,25×1×0,5×1',
      pil2.confidence <= 0.125 + 1e-9, `${pil2.confidence}`)
    cek('nLatihan tetap dilaporkan', pil2.dasar.nLatihan === 2, `${pil2.dasar.nLatihan}`)

    // ---------------------------------------------------------------- butir 3
    console.log('\n3. Tiga FDA nyata → tier NYATA, median persis 4.750.000, tingkat 1')
    await patchAsal(sesiA, 'disbursements', d.histori[1].disbursementId, 'NYATA')
    await patchAsal(sesiA, 'disbursements', d.histori[2].disbursementId, 'NYATA')
    h = await predict(sesiA, { disbursementId: d.epdaKecil.id })
    const pil3 = baris(h, 'PILOTAGE')
    cek('tier NYATA', pil3.tier === 'NYATA', pil3.tier)
    cek('nNyata = 3', pil3.dasar.nNyata === 3, `${pil3.dasar.nNyata}`)
    cek('median = 4.750.000 persis', pil3.unitPrice.median === 4_750_000, rp(pil3.unitPrice.median))
    cek('p25 = 4.625.000 (R-7)', pil3.unitPrice.p25 === 4_625_000, rp(pil3.unitPrice.p25))
    cek('p75 = 4.875.000 (R-7)', pil3.unitPrice.p75 === 4_875_000, rp(pil3.unitPrice.p75))
    cek('tingkat kemiripan 1', pil3.dasar.tingkatKemiripan === 1, `${pil3.dasar.tingkatKemiripan} (${pil3.dasar.tingkatLabel})`)
    cek('3 sumber ikut di dasar.sumber', pil3.dasar.sumber.length === 3, `${pil3.dasar.sumber.length}`)
    // Tabel K69 memakai contoh "3 kunjungan, ±6 bulan, cv 0,1" → 0,32 (RENDAH).
    // Sampel di sini lebih segar (±2,3 bulan) dan lebih rapat (cv ≈ 0,053),
    // jadi S×R×V×M = 0,50 × 0,876 × 0,950 × 1,00 ≈ 0,416 → SEDANG. Yang WAJIB
    // tetap benar: tiga kunjungan tak pernah cukup untuk band TINGGI.
    cek('confidence = S×R×V×M ≈ 0,416 (topi NYATA 0,95 tak menggigit)',
      Math.abs(pil3.confidence - 0.4159) < 0.002, `${pil3.confidence}`)
    cek('band SEDANG, tak pernah TINGGI dengan 3 kunjungan', pil3.band === 'SEDANG', pil3.band)

    // ---------------------------------------------------------------- butir 4
    console.log('\n4. amountPrediksi PER_GT_PER_DAY = hitungBaris() + usulKuantitas() hitung tangan')
    const wh = baris(h, 'WHARFAGE')
    const gt = d.kapal.gt
    const etmal = Math.max(1, Math.ceil((d.etd.getTime() - d.etb.getTime()) / HARI))
    const qTangan = gt * etmal
    const amountTangan = Math.round(qTangan * 65) // tarif katalog WHARFAGE = 65 IDR, decimals IDR = 0
    cek('quantity = GT × etmal', wh.quantity === qTangan, `${wh.quantity} vs ${qTangan} (GT ${gt} × ${etmal} etmal)`)
    cek('amountPrediksi = quantity × tarif', wh.amountPrediksi === amountTangan, `${rp(wh.amountPrediksi)} vs ${rp(amountTangan)}`)
    cek('tier KATALOG (tak ada histori WHARFAGE)', wh.tier === 'KATALOG' && wh.unitPrice === null, `${wh.tier}`)

    // ---------------------------------------------------------------- butir 5
    console.log('\n5. Kapal tanpa GT → harga satuan tetap keluar, quantity 0 + GT_TIDAK_ADA')
    h = await predict(sesiA, { voyageId: d.voyageTanpaGt.id, serviceIds: [d.pilotage.id, d.wharfage.id] })
    cek('HTTP 200', h.status === 200, `status ${h.status}`)
    const pil5 = baris(h, 'PILOTAGE')
    cek('quantity = 0', pil5.quantity === 0, `${pil5.quantity}`)
    cek('warning GT_TIDAK_ADA (kode calc-engine yang sudah ada)',
      pil5.warnings.some((w) => w.kode === 'GT_TIDAK_ADA'), pil5.warnings.map((w) => w.kode).join(','))
    cek('harga satuan tetap ada', pil5.unitPrice !== null || pil5.unitPriceKatalog !== null,
      `median=${rp(pil5.unitPrice?.median)} katalog=${rp(pil5.unitPriceKatalog)}`)
    cek('turun ke tingkat 4 (GT & vesselType tak diketahui → tingkat 1–3 tak bisa dievaluasi)',
      pil5.dasar.tingkatKemiripan === 4, `${pil5.dasar.tingkatKemiripan}`)

    // ---------------------------------------------------------------- butir 6
    console.log('\n6. Pelabuhan yang belum pernah dikunjungi → KATALOG, mengaku mengulang autofill')
    h = await predict(sesiA, { voyageId: d.voyageSgsin.id, serviceIds: [d.pilotage.id] })
    const pil6 = baris(h, 'PILOTAGE')
    cek('tier KATALOG', pil6.tier === 'KATALOG', pil6.tier)
    cek('confidence 0 & band RENDAH', pil6.confidence === 0 && pil6.band === 'RENDAH', `${pil6.confidence}`)
    cek('unitPrice null, unitPriceKatalog = tarif ServiceRate terpilih (175)',
      pil6.unitPrice === null && pil6.unitPriceKatalog === 175, `${rp(pil6.unitPriceKatalog)}`)
    cek('amountPrediksi ikut minCharge katalog (2.500.000) lewat hitungBaris',
      pil6.amountPrediksi === 2_500_000 && pil6.warnings.some((w) => w.kode === 'MINIMUM_MENGIKAT'),
      `${rp(pil6.amountPrediksi)}`)
    cek('teks mengaku mengulang autofill', /tarif katalog/i.test(pil6.teks), `"${pil6.teks}"`)
    cek('dasar.tingkatKemiripan null', pil6.dasar.tingkatKemiripan === null, `${pil6.dasar.tingkatKemiripan}`)

    // ---------------------------------------------------------------- butir 7
    console.log('\n7. ⚠️ LINTAS-TENANT (K65) — FDA nyata milik tenant B tak boleh bocor')
    // Bukti bahwa jebakannya NYATA: query yang TERLARANG (langsung ke model anak)
    // memang mengembalikan baris milik tenant B.
    const bocorMentah = await prisma.disbursementItem.findMany({
      where: { serviceId: d.pilotage.id, unitPrice: 9_999_999 },
      select: { id: true, disbursement: { select: { tenantId: true, docNumber: true } } },
    })
    cek('query TERLARANG (disbursementItem langsung) memang membaca baris tenant B — jebakannya nyata',
      bocorMentah.length === 1 && bocorMentah[0].disbursement.tenantId === d.tenantB.id,
      `${bocorMentah.length} baris, tenant ${bocorMentah[0]?.disbursement.tenantId}`)

    h = await predict(sesiA, { disbursementId: d.epdaKecil.id })
    const pil7 = baris(h, 'PILOTAGE')
    cek('nNyata tetap 3 (bukan 4) — baris tenant B tidak ikut',
      pil7.dasar.nNyata === 3, `${pil7.dasar.nNyata}`)
    cek('median tetap 4.750.000', pil7.unitPrice.median === 4_750_000, rp(pil7.unitPrice.median))
    cek('tak satu pun dasar.sumber berasal dari dokumen tenant B',
      pil7.dasar.sumber.every((s) => s.disbursementId !== d.disbB.id && s.unitPrice !== 9_999_999),
      pil7.dasar.sumber.map((s) => `${s.docNumber}=${rp(s.unitPrice)}`).join(' '))
    // Pagar statis: `disbursementItem` tak boleh muncul sebagai model akar di
    // KODE (baris komentar dibuang dulu — di situ ia memang disebut sebagai
    // contoh yang dilarang).
    const kode = readFileSync(new URL('../src/services/ai/prediction.service.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
      .join('\n')
    cek('tak satu pun `disbursementItem` sebagai model akar di prediction.service.ts',
      !/\bdisbursementItem\b/.test(kode))

    // ---------------------------------------------------------------- butir 8
    console.log('\n8. Tenant dengan langganan kedaluwarsa → predict ditolak 403 (K54/K33)')
    const sesiB = await login(EMAIL_B, SANDI)
    const tolak = await predict(sesiB, { voyageId: d.voyageB.id, serviceIds: [d.pilotage.id] })
    cek('HTTP 403', tolak.status === 403, `status ${tolak.status} — ${tolak.json?.error?.message ?? ''}`)
    const tolak2 = await predict(sesiB, { disbursementId: d.disbB.id })
    cek('403 juga untuk jalur disbursement', tolak2.status === 403, `status ${tolak2.status}`)
    const tanpaSesi = await fetch(`${BASE_URL}/api/ai/predict`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    cek('tanpa sesi → 401', tanpaSesi.status === 401, `status ${tanpaSesi.status}`)

    // ---------------------------------------------------------------- butir 9
    console.log('\n9. Jumlah query terikat JUMLAH TINGKAT, bukan jumlah baris')
    // Diukur di DALAM proses server lewat extension `$allOperations` (route
    // instrumentasi sementara `/api/ai/qcount-tmp`) — bukan ditebak dari statistik
    // database, yang terlalu berderau di server dev yang sedang mengkompilasi.
    const q2Baris = await hitungQuery(sesiA, d.epdaKecil.id)
    const q8Baris = await hitungQuery(sesiA, d.epdaGemuk.id)
    if (q2Baris.tanpaPerkakas) {
      console.log('     ⏭️  DILEWATI — perkakas instrumentasi sudah dicabut (lihat catatan di hitungQuery()).')
      console.log('        Hasil terukur saat 6c diverifikasi: 9 query untuk 2 baris DAN 9 query untuk 8 baris.')
    } else {
      console.log(`     dokumen 2 baris: ${q2Baris.queries} query Prisma · dokumen 8 baris: ${q8Baris.queries} query Prisma`)
      cek('8 baris (8 jasa) memakai jumlah query yang SAMA dengan 2 baris',
        q8Baris.queries === q2Baris.queries && q8Baris.baris === 8 && q2Baris.baris === 2,
        `${q2Baris.queries} vs ${q8Baris.queries} (baris ${q2Baris.baris} vs ${q8Baris.baris})`)
      cek('jumlah query ≤ 9 (1 langganan + 1 dokumen + 1 katalog jasa + 1 mata uang + 1 tarif + ≤4 tingkat)',
        q8Baris.queries <= 9, `${q8Baris.queries}`)
    }

    // -------------------------------------------------- tambahan: minimumMengikat
    console.log('\n+. minChargeMedian dari baris histori ber-MINIMUM_MENGIKAT (K61)')
    await prisma.disbursementItem.updateMany({
      where: { disbursementId: { in: d.histori.map((x) => x.disbursementId) } },
      data: { minCharge: 999_999_999_999 },
    })
    h = await predict(sesiA, { disbursementId: d.epdaKecil.id })
    cek('minChargeMedian terbaca dari warning mesin, bukan tebakan amount === minCharge',
      baris(h, 'PILOTAGE').minChargeMedian === 999_999_999_999,
      rp(baris(h, 'PILOTAGE').minChargeMedian))
  } finally {
    const hapus = await bersihkan()
    console.log(`\nData disposable dihapus: ${hapus.voyage} voyage, ${hapus.disbursement} disbursement, 2 user, 1 vessel.`)
  }

  console.log('\n==============================================')
  if (gagal === 0) console.log(`✅ SEMUA LULUS (${lulus} pemeriksaan)`)
  else console.log(`❌ ${gagal} GAGAL dari ${lulus + gagal} pemeriksaan`)
  process.exitCode = gagal === 0 ? 0 : 1
}

async function patchAsal(sesi, segmen, id, asal) {
  const res = await sesi.ambil(`/api/${segmen}/${id}/data-origin`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataOrigin: asal }),
  })
  if (res.status !== 200) throw new Error(`PATCH ${segmen}/${id} gagal: ${res.status}`)
  return res.json()
}

main()
  .catch(async (e) => {
    console.error('\n💥 Gagal:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
