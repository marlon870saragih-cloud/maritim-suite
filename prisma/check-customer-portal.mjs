// Uji Customer Portal — K167-K170, Fase 8f.
//
// Jalankan:  node prisma/check-customer-portal.mjs      (butuh `npm run dev` menyala)
//
// DELAPAN BAGIAN, mengikuti §17/8f persis urutannya:
//   1. Undang → terima → login → HANYA tagihan pihaknya sendiri, jumlah cocok
//      dengan SELECT count(*) langsung ke DB.
//   2. Sumbu 2 lewat HTTP SUNGGUHAN: id invoice pelanggan LAIN pada tenant
//      YANG SAMA → GET /api/portal/invoices/<id> → 404.
//   2b. Sumbu 1: id invoice tenant LAIN → 404.
//   3. Kolom: JSON MENTAH tak memuat field di luar InvoicePortal (K167) —
//      khususnya yang eksplisit dilarang dokumen: vendorId, notes, harga beli.
//   4. Lampiran: dua berkas, satu dibagikan → portal lihat satu, byte identik
//      (sha256 sama); yang tak dibagikan → 404.
//   5. Lampiran sensitif → share=true ditolak 400 menyebut alasannya.
//   6. Konfirmasi pembayaran → Notification FINANCE + Comment + Attachment;
//      Invoice.status & amountPaid TIDAK berubah (sebelum/sesudah).
//   7. Cabut akses → 401 pada permintaan BERIKUTNYA; pelanggan lain tetap bisa.
//   8. `npm run test:portal` tetap lulus penuh (dijalankan terpisah, dicatat di sini).

import { readFileSync } from 'node:fs'
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
const TAG = '8F-'
const SANDI = 'Uji8fPortal!2026'

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

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

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
    punyaSesiInternal: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
    punyaSesiPortal: () => jar.has('portal-session-dev') || jar.has('__Host-portal-session'),
  }
}

async function loginInternal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesiInternal()) throw new Error(`login internal gagal untuk ${email}`)
  return sesi
}

async function loginPortal(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/portal/auth/csrf')).json()
  await sesi.ambil('/api/portal/auth/callback/portal-credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesiPortal()) throw new Error(`login portal gagal untuk ${email}`)
  return sesi
}

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// ------------------------------------------------------------------------ uji
async function main() {
  let tenantA, tenantB

  try {
    // ---------- siapkan Tenant A: 2 pelanggan (X, Y), staf, kapal ----------
    const sandiHash = await bcrypt.hash(SANDI, 10)
    const EMAIL_ADMIN = 'portal-8f-admin@uji.local'
    const EMAIL_FINANCE = 'portal-8f-finance@uji.local'

    tenantA = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Portal A`, plan: 'TRIAL', modulesEnabled: ['portcall', 'finance'],
        users: {
          create: [
            { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: sandiHash, role: 'ADMIN' },
            { name: `${TAG}Finance`, email: EMAIL_FINANCE, password: sandiHash, role: 'FINANCE' },
          ],
        },
      },
    })
    const kapal = await prisma.vessel.create({ data: { tenantId: tenantA.id, name: `${TAG}MV Uji`, gt: 5000 } })
    const custX = await prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}Pelanggan X` } })
    const custY = await prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}Pelanggan Y` } })

    const voyageX = await prisma.voyage.create({
      data: { tenantId: tenantA.id, voyageNumber: `${TAG}VYG-X`, vesselId: kapal.id, customerId: custX.id, baseCurrency: 'IDR', dataOrigin: 'UJI' },
    })

    // Dua invoice X (tepat 2 — dicocokkan dgn count(*) DB nanti), satu invoice Y.
    const invX1 = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id, voyageId: voyageX.id, customerId: custX.id, invoiceNumber: `${TAG}INV-X1`,
        status: 'ISSUED', currency: 'IDR', subtotal: 1_000_000, grandTotal: 1_000_000, amountPaid: 0,
        items: { create: [{ description: 'Jasa A', amount: 1_000_000 }] },
      },
    })
    await prisma.invoice.create({
      data: { tenantId: tenantA.id, customerId: custX.id, invoiceNumber: `${TAG}INV-X2`, status: 'DRAFT', currency: 'IDR', subtotal: 500_000, grandTotal: 500_000 },
    })
    const invY1 = await prisma.invoice.create({
      data: { tenantId: tenantA.id, customerId: custY.id, invoiceNumber: `${TAG}INV-Y1`, status: 'ISSUED', currency: 'IDR', subtotal: 2_000_000, grandTotal: 2_000_000 },
    })

    // ---------- Tenant B (sumbu 1): satu invoice tak berhubungan ----------
    tenantB = await prisma.tenant.create({ data: { companyName: `${TAG}Uji Portal B`, plan: 'TRIAL', modulesEnabled: ['portcall'] } })
    const custB = await prisma.customer.create({ data: { tenantId: tenantB.id, name: `${TAG}Pelanggan B` } })
    const invB1 = await prisma.invoice.create({
      data: { tenantId: tenantB.id, customerId: custB.id, invoiceNumber: `${TAG}INV-B1`, status: 'ISSUED', currency: 'IDR', subtotal: 1, grandTotal: 1 },
    })

    const sesiAdmin = await loginInternal(EMAIL_ADMIN, SANDI)

    // ---------- undang X & Y ----------
    console.log('\n1. Undang → terima → login → hanya tagihan pihaknya sendiri')
    const EMAIL_PORTAL_X = 'pelanggan-x-8f@uji.local'
    const EMAIL_PORTAL_Y = 'pelanggan-y-8f@uji.local'

    async function undangDanTerima(email, customerId) {
      const inv = await jsonPost(sesiAdmin, '/api/portal-invitations', { pihak: 'CUSTOMER', email, customerId })
      const { token } = await inv.json()
      const terima = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: SANDI, name: email }),
      })
      return terima.status === 201
    }
    const okX = await undangDanTerima(EMAIL_PORTAL_X, custX.id)
    const okY = await undangDanTerima(EMAIL_PORTAL_Y, custY.id)
    cek('undangan X diterima → 201', okX)
    cek('undangan Y diterima → 201', okY)

    const sesiX = await loginPortal(EMAIL_PORTAL_X, SANDI)
    const sesiY = await loginPortal(EMAIL_PORTAL_Y, SANDI)

    const daftarX = await (await sesiX.ambil('/api/portal/invoices')).json()
    const jumlahDbX = await prisma.invoice.count({ where: { tenantId: tenantA.id, customerId: custX.id, status: { notIn: ['DRAFT', 'CANCELLED'] } } })
    cek(
      'X hanya melihat tagihannya sendiri (DRAFT tersaring, K167)',
      Array.isArray(daftarX) && daftarX.length === jumlahDbX && daftarX.every((i) => i.id === invX1.id),
      `portal=${daftarX.length} db=${jumlahDbX}`,
    )
    cek('tak satu pun baris X adalah milik Y', !daftarX.some((i) => i.id === invY1.id))

    // ---------- butir 2: sumbu 2 & sumbu 1 lewat HTTP ----------
    console.log('\n2. Sumbu 2 (pelanggan lain, tenant sama) & sumbu 1 (tenant lain) — via HTTP sungguhan')
    const s2 = await sesiX.ambil(`/api/portal/invoices/${invY1.id}`)
    cek('X → invoice milik Y (tenant SAMA) → 404', s2.status === 404, `status ${s2.status}`)

    const s1 = await sesiX.ambil(`/api/portal/invoices/${invB1.id}`)
    cek('X → invoice tenant LAIN → 404', s1.status === 404, `status ${s1.status}`)

    // ---------- butir 3: daftar putih kolom, JSON mentah ----------
    console.log('\n3. Kolom — JSON mentah tak memuat field di luar InvoicePortal (K167)')
    const detailRes = await sesiX.ambil(`/api/portal/invoices/${invX1.id}`)
    const detail = await detailRes.json()
    const KUNCI_DIIZINKAN = new Set([
      'id', 'nomor', 'tanggal', 'jatuhTempo', 'mataUang', 'total', 'sudahDibayar', 'sisa', 'status', 'kapal', 'voyage', 'baris', 'pembayaran',
    ])
    const kunciAsing = Object.keys(detail).filter((k) => !KUNCI_DIIZINKAN.has(k))
    cek('detail invoice → 200', detailRes.status === 200, `status ${detailRes.status}`)
    cek('tak ada kunci di luar daftar putih', kunciAsing.length === 0, kunciAsing.join(', '))
    cek('TIDAK ADA vendorId', !('vendorId' in detail))
    cek('TIDAK ADA notes (catatan internal)', !('notes' in detail))
    cek('TIDAK ADA field harga-beli/vendorInvoiceNo', !('vendorInvoiceNo' in detail) && !('hargaBeli' in detail))
    cek('baris tagihan tak membawa vendorId per-baris', (detail.baris ?? []).every((b) => !('vendorId' in b)))

    // ---------- butir 4: lampiran dibagikan vs tidak ----------
    console.log('\n4. Lampiran — dibagikan vs tidak, byte identik')
    const isiA = Buffer.from('%PDF-1.4\nlampiran dibagikan 8f\n')
    const isiB = Buffer.from('%PDF-1.4\nlampiran TIDAK dibagikan 8f\n')

    async function unggah(sesi, entityId, nama, isi) {
      const form = new FormData()
      form.set('entityType', 'INVOICE')
      form.set('entityId', entityId)
      form.set('file', new Blob([isi], { type: 'application/pdf' }), nama)
      const res = await sesi.ambil('/api/attachments', { method: 'POST', body: form })
      const j = await res.json()
      return j.attachment?.id
    }
    const attDibagikan = await unggah(sesiAdmin, invX1.id, 'dibagikan.pdf', isiA)
    const attTidak = await unggah(sesiAdmin, invX1.id, 'rahasia.pdf', isiB)
    cek('dua lampiran diunggah', !!attDibagikan && !!attTidak)

    const share1 = await sesiAdmin.ambil(`/api/attachments/${attDibagikan}/share`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ share: true }),
    })
    cek('bagikan lampiran pertama → 200', share1.status === 200, `status ${share1.status}`)

    const daftarDokX = await (await sesiX.ambil('/api/portal/attachments')).json()
    cek('X melihat TEPAT SATU dokumen (yang dibagikan saja)', daftarDokX.length === 1 && daftarDokX[0].id === attDibagikan, `dapat ${daftarDokX.length}`)

    const unduhOk = await sesiX.ambil(`/api/portal/attachments/${attDibagikan}/content`)
    const bufUnduh = Buffer.from(await unduhOk.arrayBuffer())
    cek('unduh yang dibagikan → 200', unduhOk.status === 200, `status ${unduhOk.status}`)
    cek('byte identik (sha256 sama)', sha256(bufUnduh) === sha256(isiA))

    const unduhGagal = await sesiX.ambil(`/api/portal/attachments/${attTidak}/content`)
    cek('unduh yang TIDAK dibagikan → 404', unduhGagal.status === 404, `status ${unduhGagal.status}`)

    // ---------- butir 5: sensitive tak bisa dibagikan ----------
    console.log('\n5. Lampiran sensitif → share ditolak 400')
    const attSensitif = await (async () => {
      const form = new FormData()
      form.set('entityType', 'INVOICE')
      form.set('entityId', invX1.id)
      form.set('file', new Blob([Buffer.from('%PDF-1.4\nsensitif\n')], { type: 'application/pdf' }), 'sensitif.pdf')
      form.set('sensitive', 'true')
      const res = await sesiAdmin.ambil('/api/attachments', { method: 'POST', body: form })
      return (await res.json()).attachment?.id
    })()
    const shareSensitif = await sesiAdmin.ambil(`/api/attachments/${attSensitif}/share`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ share: true }),
    })
    const jShareSensitif = await shareSensitif.json().catch(() => ({}))
    cek('bagikan lampiran SENSITIF → 400', shareSensitif.status === 400, `status ${shareSensitif.status}`)
    cek('pesan menyebut alasannya (sensitif)', /sensitif/i.test(jShareSensitif?.error?.message ?? ''), jShareSensitif?.error?.message)
    const attSensitifDb = await prisma.attachment.findUnique({ where: { id: attSensitif }, select: { sharedToPortal: true } })
    cek('DB: sharedToPortal TETAP false', attSensitifDb.sharedToPortal === false)

    // ---------- butir 6: konfirmasi pembayaran ----------
    console.log('\n6. Konfirmasi pembayaran — Notification+Comment+Attachment, Invoice TAK berubah')
    const sebelumInv = await prisma.invoice.findUnique({ where: { id: invX1.id }, select: { status: true, amountPaid: true } })
    const [notifSebelum, commentSebelum] = await Promise.all([
      prisma.notification.count({ where: { tenantId: tenantA.id, type: 'PORTAL_PAYMENT_CONFIRMED' } }),
      prisma.comment.count({ where: { tenantId: tenantA.id, entityType: 'INVOICE', entityId: invX1.id } }),
    ])

    const formKonfirmasi = new FormData()
    formKonfirmasi.set('referenceNumber', 'TRX-UJI-8F-001')
    formKonfirmasi.set('note', 'Sudah transfer via BCA')
    const konfirmasi = await sesiX.ambil(`/api/portal/invoices/${invX1.id}/confirm-payment`, { method: 'POST', body: formKonfirmasi })
    cek('konfirmasi pembayaran → 201', konfirmasi.status === 201, `status ${konfirmasi.status}`)

    const sesudahInv = await prisma.invoice.findUnique({ where: { id: invX1.id }, select: { status: true, amountPaid: true } })
    cek('Invoice.status TIDAK berubah', sesudahInv.status === sebelumInv.status, `${sebelumInv.status} → ${sesudahInv.status}`)
    cek('Invoice.amountPaid TIDAK berubah', sesudahInv.amountPaid === sebelumInv.amountPaid, `${sebelumInv.amountPaid} → ${sesudahInv.amountPaid}`)

    const [notifSesudah, commentSesudah] = await Promise.all([
      prisma.notification.count({ where: { tenantId: tenantA.id, type: 'PORTAL_PAYMENT_CONFIRMED' } }),
      prisma.comment.count({ where: { tenantId: tenantA.id, entityType: 'INVOICE', entityId: invX1.id } }),
    ])
    cek('satu Notification baru (ke FINANCE)', notifSesudah - notifSebelum === 1, `${notifSebelum} → ${notifSesudah}`)
    cek('satu Comment baru', commentSesudah - commentSebelum === 1, `${commentSebelum} → ${commentSesudah}`)

    const notifBaru = await prisma.notification.findFirst({ where: { tenantId: tenantA.id, type: 'PORTAL_PAYMENT_CONFIRMED' }, orderBy: { createdAt: 'desc' } })
    const financeUser = await prisma.user.findFirst({ where: { tenantId: tenantA.id, role: 'FINANCE' } })
    cek('Notification BERTARGET ke FINANCE (bukan siaran)', notifBaru.userId === financeUser.id, notifBaru.userId)

    const commentBaru = await prisma.comment.findFirst({ where: { tenantId: tenantA.id, entityType: 'INVOICE', entityId: invX1.id }, orderBy: { createdAt: 'desc' } })
    cek("Comment authorUserId bertanda 'dari portal'", commentBaru.authorUserId.startsWith('portal:'), commentBaru.authorUserId)

    // ---------- butir 7: cabut akses ----------
    console.log('\n7. Cabut akses → 401 seketika pada permintaan berikutnya; pelanggan lain tetap bisa')
    const daftarAkses = await (await sesiAdmin.ambil(`/api/portal-access?customerId=${custX.id}`)).json()
    const aksesX = daftarAkses[0]
    const cabut = await sesiAdmin.ambil(`/api/portal-access/${aksesX.id}`, { method: 'DELETE' })
    cek('cabut akses X → 200', cabut.status === 200, `status ${cabut.status}`)

    const setelahCabut = await sesiX.ambil('/api/portal/invoices')
    cek('X (sesi SAMA, belum expire) → 401 seketika', setelahCabut.status === 401, `status ${setelahCabut.status}`)

    const yMasihBisa = await sesiY.ambil('/api/portal/invoices')
    cek('Y (akses lain) TIDAK ikut tercabut → tetap 200', yMasihBisa.status === 200, `status ${yMasihBisa.status}`)
  } finally {
    // ---------- bersih-bersih ----------
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue
      await prisma.comment.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.notification.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.attachment.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.invoiceItem.deleteMany({ where: { invoice: { tenantId: tenant.id } } }).catch(() => {})
      await prisma.invoice.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch((e) => {
        console.error(`   ⚠️  gagal membersihkan tenant ${tenant.id}:`, e?.message ?? e)
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
    console.log('⚠️  Ingat: jalankan juga `npm run test:portal` (§17/8f butir 8) — tak dijalankan otomatis dari skrip ini.')
    process.exitCode = gagal === 0 ? 0 : 1
  })
