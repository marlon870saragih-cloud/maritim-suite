// Uji dua gerbang pembayaran — K158-K163, Fase 8d.
//
// Jalankan:  node prisma/check-billing.mjs      (bagian C butuh `npm run dev` menyala)
//
// KENAPA ADA. Fase 8d menambahkan gerbang KEDUA pada jalur yang menyentuh uang.
// Yang bisa rusak di sini tidak berbunyi saat rusak: langganan yang aktif tanpa
// pembayaran, pembayaran yang hilang tanpa langganan, atau callback satu gerbang
// yang menyalakan pesanan gerbang lain. Ketiganya baru ketahuan dari selisih
// rekening, berminggu-minggu kemudian.
//
// Callback di bagian C DITANDATANGANI SUNGGUHAN di skrip ini (MD5/SHA512 dari
// kunci di .env.local), bukan dipalsukan lewat celah uji. Artinya yang diuji
// adalah verifikator yang sama persis dengan yang dipakai produksi.
//
// TIGA BAGIAN:
//   A. MODUL MURNI — gateway.ts & subscription-calc.ts, tanpa DB/server.
//   B. STRUKTURAL — membaca kode untuk membuktikan K160 (algoritma dari PATH,
//      tak pernah dari isi permintaan) dan K163 (periksa-status memakai FUNGSI
//      YANG SAMA dengan callback, bukan salinan). §17/8d butir 12 memang
//      meminta ini dibuktikan "dengan membaca kode, bukan hanya hasilnya".
//   C. HTTP + DB — butir 2-9 & 11.

import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
// Keduanya MURNI — diimpor Node apa adanya (K11/K51).
import {
  AWALAN, GERBANG, buatOrderId, gerbangAlternatif, gerbangDariOrderId, pilihGerbang,
} from '../src/lib/billing/gateway.ts'
import { hitungAkhirLangganan } from '../src/services/saas/subscription-calc.ts'

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
const TAG = '8D-'
const HARI = 30
const HARI_MS = 86_400_000

const MERCHANT = process.env.DUITKU_MERCHANT_CODE ?? ''
const API_KEY = process.env.DUITKU_API_KEY ?? ''
const MT_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? ''

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

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const sha512 = (s) => crypto.createHash('sha512').update(s, 'utf8').digest('hex')

// --------------------------------------------------- callback yang ditandatangani

/** Callback Duitku, form-encoded, ditandatangani seperti Duitku sungguhan. */
async function kirimDuitku({ orderId, amount, resultCode = '00', merchantCode = MERCHANT, rusakTtd = false }) {
  const signature = md5(MERCHANT + String(amount) + orderId + API_KEY)
  const body = new URLSearchParams({
    merchantCode,
    amount: String(amount),
    merchantOrderId: orderId,
    resultCode,
    reference: `REF-${orderId}`,
    paymentCode: 'VC',
    signature: rusakTtd ? gantiSatuKarakter(signature) : signature,
  })
  const res = await fetch(`${BASE_URL}/api/billing/duitku/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return { status: res.status, teks: await res.text().catch(() => '') }
}

/** Notifikasi Midtrans, JSON, ditandatangani SHA512 seperti Midtrans sungguhan. */
async function kirimMidtrans({ orderId, amount, trxStatus = 'settlement', statusCode = '200', rusakTtd = false }) {
  const gross = `${amount}.00`
  const signature = sha512(orderId + statusCode + gross + MT_SERVER_KEY)
  const body = {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: gross,
    transaction_status: trxStatus,
    fraud_status: 'accept',
    transaction_id: `MT-${orderId}`,
    payment_type: 'bank_transfer',
    signature_key: rusakTtd ? gantiSatuKarakter(signature) : signature,
  }
  const res = await fetch(`${BASE_URL}/api/billing/notification`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, teks: await res.text().catch(() => '') }
}

function gantiSatuKarakter(s) {
  const i = s.length - 1
  const c = s[i] === 'a' ? 'b' : 'a'
  return s.slice(0, i) + c
}

// ------------------------------------------------------------------------ A
function bagianA() {
  console.log('\nA. Modul murni — gateway.ts & subscription-calc.ts')

  cek('awalan Midtrans SUB-MT-', AWALAN.MIDTRANS === 'SUB-MT-')
  cek('awalan Duitku SUB-DK-', AWALAN.DUITKU === 'SUB-DK-')
  cek('kedua awalan berbeda (syarat K159/1)', AWALAN.MIDTRANS !== AWALAN.DUITKU)

  const mt = buatOrderId('MIDTRANS', 'm1', 1_700_000_000_000, 'ab12')
  const dk = buatOrderId('DUITKU', 'm1', 1_700_000_000_000, 'ab12')
  cek('buatOrderId Midtrans berawalan benar', mt.startsWith('SUB-MT-'), mt)
  cek('buatOrderId Duitku berawalan benar', dk.startsWith('SUB-DK-'), dk)
  cek('argumen sama, gerbang beda → orderId BERBEDA', mt !== dk)
  cek('orderId hanya A-Z 0-9 - (aman di kedua gerbang)', /^[A-Za-z0-9-]+$/.test(dk))
  cek('panjang orderId wajar (<50, batas kedua gerbang)', dk.length < 50, `${dk.length} karakter`)

  cek('gerbangDariOrderId mengenali Midtrans', gerbangDariOrderId(mt) === 'MIDTRANS')
  cek('gerbangDariOrderId mengenali Duitku', gerbangDariOrderId(dk) === 'DUITKU')
  cek('orderId LAMA (tanpa awalan) → null, bukan tebakan', gerbangDariOrderId('SUB-m1-123-xy') === null)
  cek('bukan string → null', gerbangDariOrderId(null) === null)

  console.log('\n   pemilihan gerbang (K162)')
  cek('preferensi dipakai bila tersedia', pilihGerbang('DUITKU', ['MIDTRANS', 'DUITKU'], 'MIDTRANS') === 'DUITKU')
  cek('preferensi TAK tersedia → jatuh ke bawaan', pilihGerbang('DUITKU', ['MIDTRANS'], 'MIDTRANS') === 'MIDTRANS')
  cek('bawaan tak tersedia → gerbang pertama yang ada', pilihGerbang(null, ['DUITKU'], 'MIDTRANS') === 'DUITKU')
  cek('tak ada gerbang → null (layar tampilkan transfer manual)', pilihGerbang('DUITKU', [], 'MIDTRANS') === null)
  cek('preferensi sampah diabaikan', pilihGerbang('GOPAY-PALSU', ['MIDTRANS'], 'MIDTRANS') === 'MIDTRANS')
  cek('alternatif = gerbang yang lain', gerbangAlternatif('MIDTRANS', ['MIDTRANS', 'DUITKU']) === 'DUITKU')
  cek('tak ada alternatif bila cuma satu', gerbangAlternatif('MIDTRANS', ['MIDTRANS']) === null)

  console.log('\n   aritmetika langganan (K163) — dipakai KEDUA gerbang')
  const now = new Date('2026-08-19T00:00:00.000Z')
  const baru = hitungAkhirLangganan(now, null, HARI)
  cek('belum pernah berlangganan → now + 30 hari', baru.getTime() === now.getTime() + 30 * HARI_MS)

  const sisa10 = new Date(now.getTime() + 10 * HARI_MS)
  const perpanjang = hitungAkhirLangganan(now, sisa10, HARI)
  cek(
    'butir 9 — sisa 10 hari lalu bayar → 40 hari, BUKAN 30 (sisa tak hangus)',
    perpanjang.getTime() === now.getTime() + 40 * HARI_MS,
    `${Math.round((perpanjang.getTime() - now.getTime()) / HARI_MS)} hari`,
  )

  const lampau = new Date(now.getTime() - 5 * HARI_MS)
  cek('langganan sudah lewat → dihitung dari sekarang, bukan dari masa lalu',
    hitungAkhirLangganan(now, lampau, HARI).getTime() === now.getTime() + 30 * HARI_MS)
  cek('tanggal rusak → diperlakukan seperti null, tanpa lemparan',
    hitungAkhirLangganan(now, new Date('bukan-tanggal'), HARI).getTime() === now.getTime() + 30 * HARI_MS)
  cek('hari negatif TIDAK memendekkan langganan yang sudah berjalan',
    hitungAkhirLangganan(now, sisa10, -99).getTime() === sisa10.getTime())
  cek('hari NaN aman', Number.isFinite(hitungAkhirLangganan(now, null, Number.NaN).getTime()))

  // Penjaga: subscription-calc sengaja membiarkan `hari = 0` lewat, dan menyerahkan
  // pemeriksaan kewarasannya ke sini (lihat komentar bersihkanHari()).
  const teksPlans = readFileSync(new URL('../src/lib/billing/plans.ts', import.meta.url), 'utf8')
  const m = teksPlans.match(/SUBSCRIPTION_DAYS\s*=\s*(\d+)/)
  const hariNyata = m ? Number(m[1]) : NaN
  cek('SUBSCRIPTION_DAYS bilangan bulat positif', Number.isInteger(hariNyata) && hariNyata > 0, String(hariNyata))
  cek('GERBANG memuat tepat dua gerbang', GERBANG.length === 2, GERBANG.join(', '))
}

// ------------------------------------------------------------------------ B
function bagianB() {
  console.log('\nB. Struktural — K160 (algoritma dari PATH) & K163 (satu jalur aktivasi)')

  // Uji struktural harus mengukur KODE, bukan prosa. Tanpa ini, komentar yang
  // menjelaskan sebuah keputusan ("memakai hitungAkhirLangganan yang sama…")
  // ikut tertangkap pencarian teks dan membuat pemeriksaan berbohong ke DUA
  // arah: gagal palsu seperti di atas, dan — jauh lebih berbahaya — LULUS palsu
  // andai nama fungsinya cuma disebut di komentar sementara kodenya memanggil
  // yang lain.
  const tanpaKomentar = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const baca = (p) => tanpaKomentar(readFileSync(new URL(p, import.meta.url), 'utf8'))
  const duitkuRoute = baca('../src/app/api/billing/duitku/callback/route.ts')
  const midtransRoute = baca('../src/app/api/billing/notification/route.ts')
  const statusRoute = baca('../src/app/api/billing/status/route.ts')
  const aktivasi = baca('../src/services/saas/billing-activation.ts')

  cek('handler Duitku memakai verifikator Duitku', duitkuRoute.includes('verifikasiCallbackDuitku'))
  cek('handler Duitku TIDAK mengenal verifikator Midtrans', !duitkuRoute.includes('verifyNotificationSignature'))
  cek('handler Midtrans memakai verifikator Midtrans', midtransRoute.includes('verifyNotificationSignature'))
  cek('handler Midtrans TIDAK mengenal verifikator Duitku', !midtransRoute.includes('verifikasiCallbackDuitku'))
  cek('tak ada handler yang memilih algoritma dari isi permintaan',
    !/(gerbangDariOrderId|body\.gateway|n\.gateway)/.test(duitkuRoute + midtransRoute))

  cek('butir 12 — periksa-status memakai terapkanHasilPembayaran yang SAMA',
    statusRoute.includes('terapkanHasilPembayaran'))
  cek('periksa-status tidak menghitung tanggal sendiri',
    !statusRoute.includes('hitungAkhirLangganan') && !/SUBSCRIPTION_DAYS/.test(statusRoute))
  cek('kedua callback lewat terapkanHasilPembayaran',
    duitkuRoute.includes('terapkanHasilPembayaran') && midtransRoute.includes('terapkanHasilPembayaran'))
  cek('hanya SATU tempat yang menghitung akhir langganan',
    aktivasi.includes('hitungAkhirLangganan') &&
      !duitkuRoute.includes('hitungAkhirLangganan') &&
      !midtransRoute.includes('hitungAkhirLangganan'))
  cek('aktivasi mencari Payment dengan gateway, bukan orderId saja', aktivasi.includes('whereGerbang'))
  cek('jalur Midtrans tetap menerima baris lama (gateway null)', /gateway:\s*null/.test(aktivasi))
  cek('jalur Duitku KETAT (tak memaafkan gateway null)', /orderId,\s*gateway:\s*'DUITKU'/.test(aktivasi))
  cek('Payment & Tenant diperbarui dalam SATU transaksi', aktivasi.includes('$transaction'))

  // butir 10 — gerbang tanpa kredensial tak boleh bisa dipanggil MAUPUN terlihat.
  // Dibuktikan struktural, bukan dengan mengosongkan env pada server yang sedang
  // berjalan: mengutak-atik .env.local milik pengembang demi satu pemeriksaan
  // adalah cara mudah meninggalkan mesin orang dalam keadaan rusak.
  const dkCreate = baca('../src/app/api/billing/duitku/create/route.ts')
  const mtCreate = baca('../src/app/api/billing/checkout/route.ts')
  const picker = baca('../src/components/billing/GatewayPicker.tsx')
  // Fase 8e — panel pembayaran & pemilih gerbang pindah dari hub /settings ke
  // /settings/billing (K155, halaman tergerbang perannya sendiri).
  const settings = baca('../src/app/(app)/settings/billing/page.tsx')

  cek('butir 10 — create Duitku dijaga duitkuConfigured() → 503',
    dkCreate.includes('duitkuConfigured()') && dkCreate.includes('503'))
  cek('butir 10 — create Midtrans dijaga midtransConfigured() → 503',
    mtCreate.includes('midtransConfigured()') && mtCreate.includes('503'))
  cek('daftar gerbang tersedia dihitung dari kedua fungsi Configured()',
    settings.includes('midtransConfigured()') && settings.includes('duitkuConfigured()'))
  cek('pemilih gerbang menghilang bila pilihannya kurang dari dua',
    /tersedia\.length\s*<\s*2/.test(picker) && picker.includes('return null'))

  // Kunci gerbang tak boleh pernah sampai ke browser.
  cek('kunci Duitku tak pernah dikirim ke klien',
    !dkCreate.includes('DUITKU_API_KEY') && !picker.includes('DUITKU_API_KEY') && !settings.includes('DUITKU_API_KEY'))
}

// ------------------------------------------------------------------------ C
async function bagianC() {
  console.log('\nC. Callback sungguhan lewat HTTP (§17/8d butir 2-9, 11)')

  if (!MERCHANT || !API_KEY) throw new Error('DUITKU_MERCHANT_CODE / DUITKU_API_KEY kosong di .env.local')
  if (!MT_SERVER_KEY) throw new Error('MIDTRANS_SERVER_KEY kosong di .env.local')

  let tenantId
  try {
    const tenant = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Gerbang`,
        plan: 'TRIAL',
        modulesEnabled: ['portcall'],
      },
    })
    tenantId = tenant.id

    const AMOUNT = 250_000
    const buatPesanan = async (gerbang) => {
      const orderId = buatOrderId(gerbang, 'm1', Date.now(), Math.random().toString(36).slice(2, 6))
      await prisma.payment.create({
        data: {
          orderId, tenantId, planId: 'm1', plan: 'STARTER',
          amount: AMOUNT, modules: ['portcall', 'finance'], status: 'PENDING', gateway: gerbang,
        },
      })
      return orderId
    }
    const bacaPesanan = (orderId) => prisma.payment.findFirst({ where: { orderId } })
    const bacaTenant = () => prisma.tenant.findUnique({ where: { id: tenantId } })

    // ---------- butir 2: tanda tangan Duitku ----------
    console.log('\n  butir 2 — tanda tangan Duitku')
    const dkRusak = await buatPesanan('DUITKU')
    const sblm = await bacaTenant()
    const r1 = await kirimDuitku({ orderId: dkRusak, amount: AMOUNT, rusakTtd: true })
    const ssdh = await bacaTenant()
    const pRusak = await bacaPesanan(dkRusak)
    cek('tanda tangan diubah SATU karakter → 403', r1.status === 403, `status ${r1.status}`)
    cek('Payment TIDAK berubah', pRusak.status === 'PENDING')
    cek('Tenant.subscriptionEndsAt TIDAK berubah',
      String(sblm.subscriptionEndsAt) === String(ssdh.subscriptionEndsAt))

    const dkSah = await buatPesanan('DUITKU')
    const r2 = await kirimDuitku({ orderId: dkSah, amount: AMOUNT })
    const pSah = await bacaPesanan(dkSah)
    const tSah = await bacaTenant()
    cek('tanda tangan sah → 200', r2.status === 200, `status ${r2.status}`)
    cek('Payment jadi PAID', pSah.status === 'PAID', pSah.status)
    cek('langganan aktif ±30 hari',
      Math.abs(tSah.subscriptionEndsAt.getTime() - (Date.now() + 30 * HARI_MS)) < 5 * 60_000,
      tSah.subscriptionEndsAt?.toISOString())
    cek('gatewayRef & payMethod tercatat', !!pSah.gatewayRef && !!pSah.payMethod, `${pSah.gatewayRef} / ${pSah.payMethod}`)
    // butir 11
    cek('butir 11 — preferredGateway diingat sesudah berhasil', tSah.preferredGateway === 'DUITKU', String(tSah.preferredGateway))

    // ---------- butir 6: pemutaran ulang ----------
    console.log('\n  butir 6 — pemutaran ulang 5× (tanda tangan Duitku tanpa nonce)')
    const akhirSebelumUlang = tSah.subscriptionEndsAt.getTime()
    for (let i = 0; i < 5; i++) await kirimDuitku({ orderId: dkSah, amount: AMOUNT })
    const tUlang = await bacaTenant()
    cek('5× callback lunas yang SAMA PERSIS → langganan TIDAK bertambah',
      tUlang.subscriptionEndsAt.getTime() === akhirSebelumUlang,
      `${new Date(akhirSebelumUlang).toISOString()} → ${tUlang.subscriptionEndsAt.toISOString()}`)

    // ---------- butir 5: merchantCode asing ----------
    console.log('\n  butir 5 — merchantCode bukan milik kita')
    const dkAsing = await buatPesanan('DUITKU')
    const r3 = await kirimDuitku({ orderId: dkAsing, amount: AMOUNT, merchantCode: 'DXXXXX' })
    cek('merchantCode asing → 403', r3.status === 403, `status ${r3.status}`)
    cek('Payment tetap PENDING', (await bacaPesanan(dkAsing)).status === 'PENDING')

    // ---------- butir 7: nominal ----------
    console.log('\n  butir 7 — nominal tidak cocok (KEDUA gerbang)')
    const dkNominal = await buatPesanan('DUITKU')
    const r4 = await kirimDuitku({ orderId: dkNominal, amount: 1000 })
    cek('Duitku, nominal salah (bertanda tangan sah) → 400', r4.status === 400, `status ${r4.status}`)
    cek('Duitku, tak ada aktivasi', (await bacaPesanan(dkNominal)).status === 'PENDING')

    const mtNominal = await buatPesanan('MIDTRANS')
    const r5 = await kirimMidtrans({ orderId: mtNominal, amount: 1000 })
    cek('Midtrans, nominal salah (bertanda tangan sah) → 400', r5.status === 400, `status ${r5.status}`)
    cek('Midtrans, tak ada aktivasi', (await bacaPesanan(mtNominal)).status === 'PENDING')

    // ---------- butir 8: resultCode ----------
    console.log('\n  butir 8 — resultCode bukan sumber kebenaran')
    const dkPending = await buatPesanan('DUITKU')
    const r6 = await kirimDuitku({ orderId: dkPending, amount: AMOUNT, resultCode: '01' })
    const pPending = await bacaPesanan(dkPending)
    cek("resultCode '01' bertanda tangan sah → 200", r6.status === 200, `status ${r6.status}`)
    cek('tidak diaktifkan (tetap PENDING)', pPending.status === 'PENDING', pPending.status)

    // ---------- butir 4: TABRAKAN RUANG NAMA (pemeriksaan inti) ----------
    console.log('\n  butir 4 — tabrakan ruang nama antar-gerbang (PEMERIKSAAN INTI K159)')
    const mtKorban = await buatPesanan('MIDTRANS')
    const tSebelum = (await bacaTenant()).subscriptionEndsAt.getTime()
    const serang1 = await kirimDuitku({ orderId: mtKorban, amount: AMOUNT })
    const mtSesudah = await bacaPesanan(mtKorban)
    cek('callback Duitku SAH dengan orderId milik MIDTRANS → diabaikan (200)',
      serang1.status === 200 && /ignored/.test(serang1.teks), `status ${serang1.status} ${serang1.teks.slice(0, 40)}`)
    cek('pesanan Midtrans TIDAK berubah', mtSesudah.status === 'PENDING', mtSesudah.status)
    cek('langganan TIDAK diperpanjang', (await bacaTenant()).subscriptionEndsAt.getTime() === tSebelum)

    const dkKorban = await buatPesanan('DUITKU')
    const serang2 = await kirimMidtrans({ orderId: dkKorban, amount: AMOUNT })
    const dkSesudah = await bacaPesanan(dkKorban)
    cek('arah sebaliknya — callback Midtrans SAH dengan orderId milik DUITKU → diabaikan',
      serang2.status === 200 && /ignored/.test(serang2.teks), `status ${serang2.status}`)
    cek('pesanan Duitku TIDAK berubah', dkSesudah.status === 'PENDING', dkSesudah.status)

    // ---------- butir 3 + 9: Midtrans masih benar, & perpanjangan identik ----------
    console.log('\n  butir 3 & 9 — jalur Midtrans tak regresi, perpanjangan identik di kedua gerbang')
    // Setel sisa TEPAT 10 hari, lalu bayar lewat masing-masing gerbang dan bandingkan.
    const patok = new Date(Date.now() + 10 * HARI_MS)

    await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionEndsAt: patok } })
    const mtBayar = await buatPesanan('MIDTRANS')
    const r7 = await kirimMidtrans({ orderId: mtBayar, amount: AMOUNT })
    const akhirMt = (await bacaTenant()).subscriptionEndsAt.getTime()
    cek('butir 3 — callback Midtrans sah → 200', r7.status === 200, `status ${r7.status}`)
    cek('Payment Midtrans jadi PAID', (await bacaPesanan(mtBayar)).status === 'PAID')

    await prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionEndsAt: patok } })
    const dkBayar = await buatPesanan('DUITKU')
    await kirimDuitku({ orderId: dkBayar, amount: AMOUNT })
    const akhirDk = (await bacaTenant()).subscriptionEndsAt.getTime()

    cek('perpanjangan Midtrans = sisa 10 + 30 = 40 hari',
      Math.abs(akhirMt - (patok.getTime() + 30 * HARI_MS)) < 60_000,
      `${Math.round((akhirMt - Date.now()) / HARI_MS)} hari dari sekarang`)
    cek('perpanjangan Duitku IDENTIK dengan Midtrans (bukti subscription-calc dipakai berdua)',
      akhirMt === akhirDk, `${new Date(akhirMt).toISOString()} vs ${new Date(akhirDk).toISOString()}`)

    // ---------- butir 11: pesanan lama tetap PENDING ----------
    console.log('\n  butir 11 — satu pesanan = satu gerbang')
    const pesananLama = await prisma.payment.findMany({
      where: { tenantId, status: 'PENDING' },
      select: { orderId: true, gateway: true },
    })
    cek('pesanan lama yang tak dibayar TETAP PENDING, tak ikut aktif',
      pesananLama.length > 0, `${pesananLama.length} baris masih PENDING`)
    const semuaBerawalan = await prisma.payment.findMany({ where: { tenantId }, select: { orderId: true, gateway: true } })
    cek('setiap Payment berawalan sesuai gateway-nya (K159/1)',
      semuaBerawalan.every((p) => gerbangDariOrderId(p.orderId) === p.gateway),
      `${semuaBerawalan.length} baris diperiksa`)
  } finally {
    if (tenantId) {
      await prisma.payment.deleteMany({ where: { tenantId } }).catch(() => {})
      await prisma.tenant.delete({ where: { id: tenantId } }).catch((e) => {
        console.error('   ⚠️  gagal membersihkan tenant uji:', e?.message ?? e)
      })
    }
  }
}

async function main() {
  bagianA()
  bagianB()
  await bagianC()
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
