// Uji kuitansi langganan — K164/K165/K155, Fase 8e.
//
// Jalankan:  node prisma/check-sub-invoice.mjs      (butuh `npm run dev` menyala)
//
// LIMA BAGIAN, sesuai §17/8e:
//   1. Satu pembayaran lunas → tepat satu SubscriptionInvoice, nomor 0001;
//      bayar lagi → 0002 (K32).
//   2. Callback lunas diputar ulang 5× (K161/3) → tak lahir kuitansi kedua.
//   3. PDF diunduh SUNGGUHAN + disimpan ke scratchpad — dibuka dengan Read
//      tool (di luar skrip ini) untuk membuktikan kop Maritime Suite, bukan
//      nama tenant uji. Satu Invoice keagenan NYATA ikut diunduh untuk
//      dibandingkan berdampingan.
//   4. FINANCE mengunduh → 200; FINANCE checkout → 403; OPERATOR membuka
//      /settings/billing → teks "denied", bukan panel pembayaran.
//   5. Add-on: baris tambahan pada pesanan yang sama + Tenant.addonsEnabled
//      bertambah saat lunas — DITAMBAL SEMENTARA (satu addon diberi harga),
//      pola sama check-quota.mjs, dipulihkan di `finally`.
//   6. Nol baris baru di Invoice/InvoicePayment/laporan Outstanding (K1.3).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import crypto from 'node:crypto'
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
const TAG = '8E-'
const SANDI = 'Uji8eKuitansi!2026'
const MT_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY ?? ''
const SCRATCH = process.env.SCRATCHPAD_DIR
  ?? 'C:/Users/LENOVO/AppData/Local/Temp/claude/D--rapikan-04-DEVELOPMENT-DAN-AI-CLAUDE-CODE-landing-umkm-toko-kue/2f8c68d1-4df4-42ba-9357-0577edf0c334/scratchpad'

const BERKAS_POLICY = new URL('../src/services/saas/commercial-policy.ts', import.meta.url)
const PENANDA_ASLI = "{ id: 'training', labelId: 'Pelatihan tim', labelEn: 'Team training', priceIDR: null },"
const PENANDA_TAMBAL = "{ id: 'training', labelId: 'Pelatihan tim', labelEn: 'Team training', priceIDR: 50000 },"

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

const sha512 = (s) => crypto.createHash('sha512').update(s, 'utf8').digest('hex')

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
  const header = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: header() } })
      simpanCookie(res)
      return res
    },
    punyaSesi: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
  }
}

async function login(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login gagal untuk ${email}`)
  return sesi
}

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function kirimMidtransPaid(orderId, amount) {
  const gross = `${amount}.00`
  const statusCode = '200'
  const signature = sha512(orderId + statusCode + gross + MT_SERVER_KEY)
  const body = {
    order_id: orderId, status_code: statusCode, gross_amount: gross,
    transaction_status: 'settlement', fraud_status: 'accept',
    transaction_id: `MT-${orderId}`, payment_type: 'bank_transfer', signature_key: signature,
  }
  const res = await fetch(`${BASE_URL}/api/billing/notification`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return res.status
}

// ------------------------------------------------------------------------ uji
async function main() {
  if (!MT_SERVER_KEY) throw new Error('MIDTRANS_SERVER_KEY kosong di .env.local')

  const asli = readFileSync(BERKAS_POLICY, 'utf8')
  if (!asli.includes(PENANDA_ASLI)) {
    throw new Error('commercial-policy.ts tidak dalam keadaan bersih (penanda add-on "training" tak ditemukan).')
  }

  let tenantId
  let sudahDitambal = false

  try {
    const sandiHash = await bcrypt.hash(SANDI, 10)
    const EMAIL_ADMIN = 'kuitansi-8e-admin@uji.local'
    const EMAIL_FINANCE = 'kuitansi-8e-finance@uji.local'
    const EMAIL_OPERATOR = 'kuitansi-8e-operator@uji.local'

    const tenant = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Kuitansi`, plan: 'TRIAL',
        modulesEnabled: ['portcall'],
        users: {
          create: [
            { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: sandiHash, role: 'ADMIN' },
            { name: `${TAG}Finance`, email: EMAIL_FINANCE, password: sandiHash, role: 'FINANCE' },
            { name: `${TAG}Operator`, email: EMAIL_OPERATOR, password: sandiHash, role: 'OPERATOR' },
          ],
        },
      },
    })
    tenantId = tenant.id

    const sesiAdmin = await login(EMAIL_ADMIN, SANDI)
    const sesiFinance = await login(EMAIL_FINANCE, SANDI)
    const sesiOperator = await login(EMAIL_OPERATOR, SANDI)

    // ---------- tambal katalog add-on ----------
    console.log('\n  menambal commercial-policy.ts sementara (add-on "training" = Rp 50.000)…')
    writeFileSync(BERKAS_POLICY, asli.replace(PENANDA_ASLI, PENANDA_TAMBAL))
    sudahDitambal = true

    // ---------- baseline Invoice/InvoicePayment (butir 6) ----------
    const [invBefore, payBefore] = await Promise.all([
      prisma.invoice.count({ where: { tenantId } }),
      prisma.invoicePayment.count({ where: { tenantId } }),
    ])

    // ---------- butir 1 + 5: checkout dgn add-on, bayar, satu kuitansi ----------
    // Probe DIRANGKAP dgn "tunggu hot-reload": panggilan checkout SUNGGUHAN
    // dgn add-on ini yang jadi bukti kebijakan tambalan sudah aktif (400 =
    // belum ke-reload / add-on masih dianggap "belum dijual", coba lagi).
    console.log('\n  butir 1 & 5 — checkout dgn add-on → satu kuitansi, dua baris, Tenant.addonsEnabled')
    let co1
    let j1
    for (let i = 0; i < 40; i++) {
      co1 = await jsonPost(sesiAdmin, '/api/billing/checkout', { planId: 'm1', modules: ['finance'], addons: ['training'] })
      j1 = await co1.json()
      if (co1.status === 200) break
      await new Promise((res) => setTimeout(res, 1500))
    }
    cek('dev server memuat ulang kebijakan add-on yang ditambal', co1.status === 200, `status akhir ${co1.status}`)
    if (co1.status !== 200) throw new Error('kebijakan tambalan tak pernah aktif — apakah `npm run dev` menyala?')

    const st1 = await kirimMidtransPaid(j1.orderId, 250_000 + 50_000)
    cek('callback lunas → 200', st1 === 200, `status ${st1}`)

    const inv1 = await prisma.subscriptionInvoice.findMany({ where: { tenantId }, include: { items: true }, orderBy: { issuedAt: 'asc' } })
    cek('tepat SATU SubscriptionInvoice lahir', inv1.length === 1, `dapat ${inv1.length}`)
    cek('nomor berakhiran 0001', /\/0001$/.test(inv1[0]?.invoiceNumber ?? ''), inv1[0]?.invoiceNumber)
    cek('dua baris: paket + add-on', inv1[0]?.items.length === 2, `dapat ${inv1[0]?.items.length}`)
    cek('baris add-on menyebut "training"/Pelatihan', inv1[0]?.items.some((it) => /pelatihan/i.test(it.description)), inv1[0]?.items.map((i) => i.description).join(' | '))
    cek('grandTotal = 300.000 (250rb paket + 50rb add-on)', inv1[0]?.grandTotal === 300_000, String(inv1[0]?.grandTotal))
    cek('taxAmount = 0 (P64: tanpa PPN)', inv1[0]?.taxAmount === 0)

    const tSetelahBayar = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { addonsEnabled: true } })
    cek('Tenant.addonsEnabled memuat "training"', tSetelahBayar.addonsEnabled.includes('training'), JSON.stringify(tSetelahBayar.addonsEnabled))

    // ---------- butir 2: putar ulang 5× ----------
    console.log('\n  butir 2 — callback lunas yang SAMA diputar ulang 5× → tak ada kuitansi kedua')
    for (let i = 0; i < 5; i++) await kirimMidtransPaid(j1.orderId, 300_000)
    const invSetelahUlang = await prisma.subscriptionInvoice.count({ where: { tenantId } })
    cek('jumlah SubscriptionInvoice TETAP satu', invSetelahUlang === 1, `dapat ${invSetelahUlang}`)

    // ---------- butir 1 (lanjutan): bayar lagi → 0002, TANPA add-on kali ini ----------
    console.log('\n  butir 1 (lanjutan) — bayar lagi (tanpa add-on) → nomor 0002')
    const co2 = await jsonPost(sesiAdmin, '/api/billing/checkout', { planId: 'm1', modules: ['finance'] })
    const j2 = await co2.json()
    await kirimMidtransPaid(j2.orderId, 250_000)
    const inv2 = await prisma.subscriptionInvoice.findMany({ where: { tenantId }, orderBy: { issuedAt: 'asc' } })
    cek('sekarang ada DUA SubscriptionInvoice', inv2.length === 2, `dapat ${inv2.length}`)
    cek('yang kedua berakhiran 0002', /\/0002$/.test(inv2[1]?.invoiceNumber ?? ''), inv2[1]?.invoiceNumber)

    const tSetelahRenewal = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { addonsEnabled: true } })
    cek(
      'butir 5 — add-on TIDAK diikutkan di perpanjangan → addonsEnabled kosong ("habis bersamaan")',
      tSetelahRenewal.addonsEnabled.length === 0,
      JSON.stringify(tSetelahRenewal.addonsEnabled),
    )

    // ---------- butir 6: nol dampak ke Invoice/InvoicePayment keagenan ----------
    console.log('\n  butir 6 — nol baris baru di Invoice/InvoicePayment (K1.3)')
    const [invAfter, payAfter] = await Promise.all([
      prisma.invoice.count({ where: { tenantId } }),
      prisma.invoicePayment.count({ where: { tenantId } }),
    ])
    cek('Invoice tenant uji tetap 0', invBefore === 0 && invAfter === 0, `${invBefore} → ${invAfter}`)
    cek('InvoicePayment tenant uji tetap 0', payBefore === 0 && payAfter === 0, `${payBefore} → ${payAfter}`)

    // ---------- butir 4: peran ----------
    console.log('\n  butir 4 — FINANCE unduh boleh, checkout 403; OPERATOR halaman Billing 403')
    const listFinance = await sesiFinance.ambil('/api/billing/invoices')
    cek('FINANCE — GET /api/billing/invoices → 200', listFinance.status === 200, `status ${listFinance.status}`)
    const rowsFinance = await listFinance.json()
    const idKuitansi = rowsFinance[0]?.id
    cek('FINANCE melihat kuitansi yang sama', !!idKuitansi)

    const pdfFinance = await sesiFinance.ambil(`/api/billing/invoices/${idKuitansi}/pdf`)
    cek('FINANCE — unduh PDF → 200', pdfFinance.status === 200, `status ${pdfFinance.status}`)
    cek('PDF Content-Type benar', (pdfFinance.headers.get('content-type') || '').includes('application/pdf'))

    const checkoutFinance = await jsonPost(sesiFinance, '/api/billing/checkout', { planId: 'm1', modules: ['finance'] })
    cek('FINANCE — POST checkout → 403', checkoutFinance.status === 403, `status ${checkoutFinance.status}`)

    const statusFinance = await jsonPost(sesiFinance, '/api/billing/status', { orderId: j1.orderId })
    cek('FINANCE — POST status → 403', statusFinance.status === 403, `status ${statusFinance.status}`)

    const listOperator = await sesiOperator.ambil('/api/billing/invoices')
    cek('OPERATOR — GET /api/billing/invoices → 403', listOperator.status === 403, `status ${listOperator.status}`)

    const halamanOperator = await sesiOperator.ambil('/settings/billing')
    const teksOperator = await halamanOperator.text()
    cek(
      'OPERATOR — halaman /settings/billing menampilkan teks TERTUTUP',
      /hanya untuk ADMIN dan FINANCE|ADMIN and FINANCE only/i.test(teksOperator),
    )
    cek(
      'OPERATOR — halaman TIDAK menampilkan panel pembayaran',
      !/Pay via|Bayar lewat|Pay now|Bayar sekarang/i.test(teksOperator),
    )

    const halamanAdmin = await sesiAdmin.ambil('/settings/billing')
    const teksAdmin = await halamanAdmin.text()
    cek('ADMIN — halaman /settings/billing TERBUKA (kendali positif)', halamanAdmin.status === 200 && /Bayar lewat|Pay via/i.test(teksAdmin))

    // ---------- butir 3: unduh PDF sungguhan utk pemeriksaan visual ----------
    console.log('\n  butir 3 — unduh PDF sungguhan (diperiksa visual sesudah skrip ini)')
    mkdirSync(SCRATCH, { recursive: true })
    const pdfBuf = Buffer.from(await (await sesiAdmin.ambil(`/api/billing/invoices/${idKuitansi}/pdf?download=1`)).arrayBuffer())
    const pathKuitansi = `${SCRATCH}/8e-kuitansi-langganan.pdf`
    writeFileSync(pathKuitansi, pdfBuf)
    cek('PDF kuitansi tersimpan & bukan kosong', pdfBuf.length > 1000, `${pdfBuf.length} bytes → ${pathKuitansi}`)

    const invoiceAsli = await prisma.invoice.findFirst({ where: { tenant: { companyName: { contains: 'Tribuana' } } }, select: { id: true, tenantId: true } })
    if (invoiceAsli) {
      const sesiTribuana = await login('adm@tribuanagency.co.id', 'DevTest123!')
      const pdfAsliBuf = Buffer.from(await (await sesiTribuana.ambil(`/api/invoices/${invoiceAsli.id}/pdf?download=1`)).arrayBuffer())
      const pathAsli = `${SCRATCH}/8e-invoice-keagenan-pembanding.pdf`
      writeFileSync(pathAsli, pdfAsliBuf)
      cek('PDF Invoice keagenan pembanding tersimpan', pdfAsliBuf.length > 1000, `${pdfAsliBuf.length} bytes → ${pathAsli}`)
    } else {
      console.log('  ⚠️  tak ada Invoice Tribuana utk dibandingkan — lewati (bukan kegagalan)')
    }
  } finally {
    if (sudahDitambal) {
      writeFileSync(BERKAS_POLICY, asli)
      const pulih = readFileSync(BERKAS_POLICY, 'utf8') === asli
      console.log(pulih ? '\n  ↩️  commercial-policy.ts dipulihkan.' : '\n  ⚠️  GAGAL memulihkan commercial-policy.ts — periksa git diff!')
      if (!pulih) gagal++
    }
    if (tenantId) {
      await prisma.subscriptionInvoiceItem.deleteMany({ where: { subscriptionInvoice: { tenantId } } }).catch(() => {})
      await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } }).catch(() => {})
      await prisma.payment.deleteMany({ where: { tenantId } }).catch(() => {})
      await prisma.tenant.delete({ where: { id: tenantId } }).catch((e) => {
        console.error('   ⚠️  gagal membersihkan tenant uji:', e?.message ?? e)
      })
    }
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
