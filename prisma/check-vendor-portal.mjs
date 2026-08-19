// Uji Vendor Portal — K171-K173, Fase 8g.
//
// Jalankan:  node prisma/check-vendor-portal.mjs      (butuh `npm run dev` menyala)
//
// SEMBILAN BAGIAN, mengikuti §17/8g persis urutannya:
//   1. Vendor hanya melihat PO/WO ber-vendorId miliknya; DRAFT/PENDING_APPROVAL/
//      APPROVED (PO) & DRAFT (WO) tersaring — hanya SENT/ISSUED ke atas tampil.
//   2. JSON mentah tak memuat harga jual, VendorRating/skor, atau vendor lain.
//   3. Unggah tagihan ~1MB PDF → SUBMITTED + Attachment sha256 cocok; entityType
//      dihapus sementara dari ENTITAS_DIDUKUNG → unggahan ditolak (K85 masih menjaga).
//   4. Unggah berkas SAMA dua kali → diberi tahu, TIDAK ditolak (K172/5).
//   5. Batas laju terlampaui → 429; hari lain (backdate) boleh lagi.
//   6. K172/1 — pemeriksaan inti: GET picker TIDAK membuat baris; POST item
//      DENGAN vendorInvoiceSubmissionId → baris lahir DAN linkedDisbursementItemId terisi.
//   7. Selisih nominal (vendor vs WorkOrder.agreedAmount) tersedia di picker, tak menolak.
//   8. K173 — konfirmasi selesai → Comment+Notification; WorkOrder.status/actualEnd TETAP.
//   9. Lintas-tenant: vendor bernama sama di tenant B tetap tak terlihat vendor A.

import { readFileSync, writeFileSync } from 'node:fs'
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
const TAG = '8G-'
const SANDI = 'Uji8gVendorPortal!2026'

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
const jsonPatch = (sesi, path, body) =>
  sesi.ambil(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function kirimUsulan(sesi, { invoiceNo, invoiceDate, amount, currency, note, purchaseOrderId, workOrderId }, isi, namaBerkas) {
  const form = new FormData()
  form.set('invoiceNo', invoiceNo)
  form.set('invoiceDate', invoiceDate)
  form.set('amount', String(amount))
  if (currency) form.set('currency', currency)
  if (note) form.set('note', note)
  if (purchaseOrderId) form.set('purchaseOrderId', purchaseOrderId)
  if (workOrderId) form.set('workOrderId', workOrderId)
  form.set('file', new Blob([isi], { type: 'application/pdf' }), namaBerkas)
  return sesi.ambil('/api/portal/submissions', { method: 'POST', body: form })
}

// -------------------------------------------------------------- berkas patch
const BERKAS_OWNER_GUARD = new URL('../src/services/ops/owner-guard.ts', import.meta.url)
const PENANDA_OWNER_ASLI = "  VENDOR_INVOICE_SUBMISSION: { model: 'vendorInvoiceSubmission', lewat: 'langsung' },\n"
const BERKAS_POLICY = new URL('../src/services/saas/commercial-policy.ts', import.meta.url)
const PENANDA_POLICY_ASLI = 'export const BATAS_KIRIMAN_VENDOR_PER_HARI: number | null = null'
const PENANDA_POLICY_TAMBAL = 'export const BATAS_KIRIMAN_VENDOR_PER_HARI: number | null = 2'

// ------------------------------------------------------------------------ uji
async function main() {
  let tenantA, tenantB
  let ownerGuardDitambal = false
  let policyDitambal = false
  const asliOwnerGuard = readFileSync(BERKAS_OWNER_GUARD, 'utf8')
  const asliPolicy = readFileSync(BERKAS_POLICY, 'utf8')
  if (!asliOwnerGuard.includes(PENANDA_OWNER_ASLI.trim())) {
    throw new Error('owner-guard.ts tidak dalam keadaan bersih (penanda VENDOR_INVOICE_SUBMISSION tak ditemukan).')
  }
  if (!asliPolicy.includes(PENANDA_POLICY_ASLI)) {
    throw new Error('commercial-policy.ts tidak dalam keadaan bersih (penanda BATAS_KIRIMAN_VENDOR_PER_HARI tak ditemukan). Periksa `git diff`.')
  }

  try {
    // ---------- Tenant A: admin, kapal, voyage, vendor X ----------
    const sandiHash = await bcrypt.hash(SANDI, 10)
    const EMAIL_ADMIN = 'vendor-portal-8g-admin@uji.local'

    tenantA = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Vendor Portal A`, plan: 'TRIAL', modulesEnabled: ['portcall', 'finance', 'procurement'],
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000), // PO/WO create() menggerbangi K33 — trial harus aktif
        users: { create: { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: sandiHash, role: 'ADMIN' } },
      },
    })
    const kapal = await prisma.vessel.create({ data: { tenantId: tenantA.id, name: `${TAG}MV Uji`, gt: 5000 } })
    const vendorX = await prisma.vendor.create({ data: { tenantId: tenantA.id, name: `${TAG}Vendor X` } })
    await prisma.currency.create({ data: { tenantId: tenantA.id, code: 'IDR', decimals: 2 } })

    const sesiAdmin = await loginInternal(EMAIL_ADMIN, SANDI)
    const voyageRes = await jsonPost(sesiAdmin, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    const { voyage } = await voyageRes.json()

    // ---------- PO1 (DRAFT — harus TERSEMBUNYI) & PO2 (SENT — harus TAMPIL) ----------
    async function buatPo() {
      const r = await jsonPost(sesiAdmin, '/api/purchase-orders', { kind: 'PO', vendorId: vendorX.id, voyageId: voyage.id, deliveryTo: 'Gudang Samarinda' })
      const { po } = await r.json()
      await jsonPost(sesiAdmin, `/api/purchase-orders/${po.id}/items`, { description: 'Sparepart', quantity: 2, unit: 'pcs', unitPrice: 500000 })
      return po
    }
    const po1 = await buatPo() // tetap DRAFT
    const po2raw = await buatPo()
    await jsonPatch(sesiAdmin, `/api/purchase-orders/${po2raw.id}/status`, { status: 'PENDING_APPROVAL' })
    await jsonPost(sesiAdmin, `/api/purchase-orders/${po2raw.id}/approvals`, { decision: 'APPROVED' })
    await jsonPatch(sesiAdmin, `/api/purchase-orders/${po2raw.id}/status`, { status: 'SENT' })
    const po2 = po2raw

    // ---------- WO1 (DRAFT — harus TERSEMBUNYI) & WO2 (ISSUED — harus TAMPIL) ----------
    async function buatWo(agreedAmount) {
      const r = await jsonPost(sesiAdmin, '/api/work-orders', {
        voyageId: voyage.id, vendorId: vendorX.id, scope: `${TAG}Pandu kapal`, agreedAmount, currency: 'IDR',
      })
      return (await r.json()).wo
    }
    const wo1 = await buatWo(1_000_000) // tetap DRAFT
    const wo2raw = await buatWo(10_000_000)
    await jsonPatch(sesiAdmin, `/api/work-orders/${wo2raw.id}/status`, { status: 'ISSUED' })
    const wo2 = wo2raw

    // ---------- Tenant B: vendor BERNAMA SAMA, satu PO SENT (untuk sumbu 1) ----------
    tenantB = await prisma.tenant.create({ data: { companyName: `${TAG}Uji Vendor Portal B`, plan: 'TRIAL', modulesEnabled: ['portcall', 'procurement'] } })
    const EMAIL_ADMIN_B = 'vendor-portal-8g-admin-b@uji.local'
    await prisma.user.create({ data: { tenantId: tenantB.id, name: `${TAG}Admin B`, email: EMAIL_ADMIN_B, password: sandiHash, role: 'ADMIN' } })
    const vendorBSamaNama = await prisma.vendor.create({ data: { tenantId: tenantB.id, name: `${TAG}Vendor X` } }) // NAMA SAMA, tenant beda
    const sesiAdminB = await loginInternal(EMAIL_ADMIN_B, SANDI)
    const adminB = await prisma.user.findFirst({ where: { tenantId: tenantB.id, email: EMAIL_ADMIN_B } })
    const poB = await prisma.purchaseOrder.create({
      data: {
        tenantId: tenantB.id, vendorId: vendorBSamaNama.id, kind: 'PO', docNumber: `${TAG}PO-B`,
        status: 'SENT', currency: 'IDR', grandTotal: 999, createdByUserId: adminB.id,
      },
    })
    void sesiAdminB // dipakai hanya untuk memastikan sesi B valid; tak ada aksi lanjut

    // ---------- undang & login vendor X ----------
    const EMAIL_PORTAL_X = 'vendor-x-8g@uji.local'
    const inv = await jsonPost(sesiAdmin, '/api/portal-invitations', { pihak: 'VENDOR', email: EMAIL_PORTAL_X, vendorId: vendorX.id })
    const { token } = await inv.json()
    const terima = await fetch(`${BASE_URL}/api/portal/accept-invitation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: SANDI, name: EMAIL_PORTAL_X }),
    })
    cek('undangan vendor X diterima → 201', terima.status === 201, `status ${terima.status}`)
    const sesiVendorX = await loginPortal(EMAIL_PORTAL_X, SANDI)

    // ================= 1. Hanya PO/WO ber-vendorId miliknya, status tersaring =================
    console.log('\n1. Vendor hanya melihat PO/WO miliknya — DRAFT tersaring (K171)')
    const daftarPo = await (await sesiVendorX.ambil('/api/portal/purchase-orders')).json()
    cek('PO2 (SENT) tampil', Array.isArray(daftarPo) && daftarPo.some((p) => p.id === po2.id))
    cek('PO1 (DRAFT) TIDAK tampil', !daftarPo.some((p) => p.id === po1.id))

    const daftarWo = await (await sesiVendorX.ambil('/api/portal/work-orders')).json()
    cek('WO2 (ISSUED) tampil', Array.isArray(daftarWo) && daftarWo.some((w) => w.id === wo2.id))
    cek('WO1 (DRAFT) TIDAK tampil', !daftarWo.some((w) => w.id === wo1.id))

    const po1Detail = await sesiVendorX.ambil(`/api/portal/purchase-orders/${po1.id}`)
    cek('detail PO1 (DRAFT) lewat id langsung → 404', po1Detail.status === 404, `status ${po1Detail.status}`)

    // ================= 2. Kolom — JSON mentah tak memuat harga jual/skor/vendor lain =================
    console.log('\n2. Kolom — JSON mentah tak memuat harga jual/skor vendor/vendor lain')
    const detailPo2Res = await sesiVendorX.ambil(`/api/portal/purchase-orders/${po2.id}`)
    const detailPo2 = await detailPo2Res.json()
    const KUNCI_PO = new Set(['id', 'nomor', 'tanggal', 'status', 'mataUang', 'total', 'jatuhTempo', 'kirimKe', 'kapal', 'voyage', 'baris'])
    const kunciAsingPo = Object.keys(detailPo2).filter((k) => !KUNCI_PO.has(k))
    cek('detail PO2 → 200', detailPo2Res.status === 200, `status ${detailPo2Res.status}`)
    cek('tak ada kunci di luar daftar putih (PO)', kunciAsingPo.length === 0, kunciAsingPo.join(', '))

    const detailWo2Res = await sesiVendorX.ambil(`/api/portal/work-orders/${wo2.id}`)
    const detailWo2 = await detailWo2Res.json()
    const KUNCI_WO = new Set(['id', 'nomor', 'lingkup', 'status', 'mataUang', 'nilaiKesepakatan', 'jadwalMulai', 'jadwalSelesai', 'kapal', 'pelabuhan', 'voyage'])
    const kunciAsingWo = Object.keys(detailWo2).filter((k) => !KUNCI_WO.has(k))
    cek('detail WO2 → 200', detailWo2Res.status === 200, `status ${detailWo2Res.status}`)
    cek('tak ada kunci di luar daftar putih (WO)', kunciAsingWo.length === 0, kunciAsingWo.join(', '))
    cek('TIDAK ADA vendorRating/skor/harga jual pada WO', !('vendorRating' in detailWo2) && !('skor' in detailWo2) && !('hargaJual' in detailWo2))

    // ================= 3. Unggah tagihan ~1MB → SUBMITTED + Attachment; K85 masih menjaga =================
    console.log('\n3. Unggah tagihan ~1MB PDF → SUBMITTED + Attachment; entityType dihapus sementara → ditolak')
    const isi1MB = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024 * 1024, 0x41)])
    const kirim1 = await kirimUsulan(
      sesiVendorX,
      { invoiceNo: `${TAG}INV-01`, invoiceDate: '2026-08-01', amount: 12_000_000, workOrderId: wo2.id },
      isi1MB,
      'tagihan-01.pdf',
    )
    const j1 = await kirim1.json()
    cek('unggah tagihan pertama → 201', kirim1.status === 201, `status ${kirim1.status}`)
    cek('status SUBMITTED', j1.status === 'SUBMITTED', j1.status)

    const submisi1Db = await prisma.vendorInvoiceSubmission.findUnique({ where: { id: j1.submissionId } })
    cek('baris VendorInvoiceSubmission tersimpan, vendorId benar', submisi1Db?.vendorId === vendorX.id)
    const attSubmisi1 = await prisma.attachment.findFirst({ where: { entityType: 'VENDOR_INVOICE_SUBMISSION', entityId: j1.submissionId } })
    cek('Attachment ber-entityType VENDOR_INVOICE_SUBMISSION tersimpan', !!attSubmisi1)
    cek('sha256 Attachment cocok dengan berkas terkirim', attSubmisi1?.sha256 === sha256(isi1MB))

    console.log('  menambal owner-guard.ts sementara (VENDOR_INVOICE_SUBMISSION dihapus dari ENTITAS_DIDUKUNG)…')
    writeFileSync(BERKAS_OWNER_GUARD, asliOwnerGuard.replace(PENANDA_OWNER_ASLI, ''))
    ownerGuardDitambal = true

    let tolakStatus
    for (let i = 0; i < 40; i++) {
      const r = await kirimUsulan(sesiVendorX, { invoiceNo: `${TAG}PROBE-${i}`, invoiceDate: '2026-08-01', amount: 1 }, Buffer.from('%PDF-1.4\nprobe\n'), 'probe.pdf')
      tolakStatus = r.status
      if (r.status === 400) break
      await sleep(1500)
    }
    cek('dev server memuat ulang owner-guard.ts tambalan (entityType ditolak 400)', tolakStatus === 400, `status akhir ${tolakStatus}`)
    if (tolakStatus !== 400) throw new Error('tambalan owner-guard.ts tak pernah aktif — apakah `npm run dev` menyala?')

    writeFileSync(BERKAS_OWNER_GUARD, asliOwnerGuard)
    ownerGuardDitambal = false
    let pulihStatus
    for (let i = 0; i < 40; i++) {
      const r = await kirimUsulan(sesiVendorX, { invoiceNo: `${TAG}PEMULIHAN`, invoiceDate: '2026-08-01', amount: 1 }, Buffer.from('%PDF-1.4\npemulihan\n'), 'pemulihan.pdf')
      pulihStatus = r.status
      if (r.status === 201) break
      await sleep(1500)
    }
    cek('owner-guard.ts pulih (unggahan diterima lagi)', pulihStatus === 201, `status akhir ${pulihStatus}`)

    // ================= 4. Unggah berkas SAMA dua kali → diberi tahu, tidak ditolak =================
    console.log('\n4. Unggah berkas SAMA dua kali → diberi tahu "sudah pernah dikirim", tidak ditolak (K172/5)')
    const kirimUlang = await kirimUsulan(
      sesiVendorX,
      { invoiceNo: `${TAG}INV-01-DUP`, invoiceDate: '2026-08-01', amount: 12_000_000 },
      isi1MB, // BYTE SAMA dengan unggahan pertama
      'tagihan-01-salinan.pdf',
    )
    const jUlang = await kirimUlang.json()
    cek('unggahan kedua dengan berkas sama → 201 (tidak ditolak)', kirimUlang.status === 201, `status ${kirimUlang.status}`)
    cek('respons menandai duplikat', !!jUlang.unggahan?.duplikat, JSON.stringify(jUlang.unggahan?.duplikat))

    // ================= 5. Batas laju → 429; hari lain boleh lagi =================
    console.log('\n5. Batas laju terlampaui → 429; backdate ke "kemarin" → boleh lagi')
    console.log('  menambal commercial-policy.ts sementara (BATAS_KIRIMAN_VENDOR_PER_HARI=2)…')
    writeFileSync(BERKAS_POLICY, asliPolicy.replace(PENANDA_POLICY_ASLI, PENANDA_POLICY_TAMBAL))
    policyDitambal = true

    let status429
    let pesan429
    for (let i = 0; i < 40; i++) {
      const r = await kirimUsulan(sesiVendorX, { invoiceNo: `${TAG}LAJU-${i}`, invoiceDate: '2026-08-01', amount: 1 }, Buffer.from('%PDF-1.4\nlaju\n'), `laju-${i}.pdf`)
      status429 = r.status
      if (r.status === 429) {
        pesan429 = (await r.json().catch(() => null))?.error?.message
        break
      }
      await sleep(1500)
    }
    cek('dev server memuat ulang batas laju tambalan (429 muncul)', status429 === 429, `status akhir ${status429}`)
    if (status429 !== 429) throw new Error('tambalan commercial-policy.ts tak pernah aktif — apakah `npm run dev` menyala?')
    cek('pesan 429 menyebut batasnya', /batas/i.test(pesan429 ?? ''), pesan429)

    // backdate SEMUA submission vendor X hari ini ke "kemarin" → hari baru, boleh lagi
    const kemarin = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await prisma.vendorInvoiceSubmission.updateMany({ where: { vendorId: vendorX.id }, data: { createdAt: kemarin } })
    const bolehLagi = await kirimUsulan(sesiVendorX, { invoiceNo: `${TAG}HARI-BARU`, invoiceDate: '2026-08-02', amount: 1 }, Buffer.from('%PDF-1.4\nharibaru\n'), 'hari-baru.pdf')
    cek('sesudah backdate ke hari lain → boleh kirim lagi (201)', bolehLagi.status === 201, `status ${bolehLagi.status}`)

    writeFileSync(BERKAS_POLICY, asliPolicy)
    policyDitambal = false

    // ================= 6/7. Ambil dari tagihan vendor di builder FDA — inti K172/1, selisih K172/3 =================
    console.log('\n6/7. "Ambil dari tagihan vendor" — GET picker tak menulis apa pun; POST item MENAUTKAN; selisih tampil')
    const disbRes = await jsonPost(sesiAdmin, `/api/voyages/${voyage.id}/disbursements`, { kind: 'EPDA' })
    const { disbursement } = await disbRes.json()
    const itemCountSebelumPicker = await prisma.disbursementItem.count({ where: { disbursementId: disbursement.id } })

    const usulanWo2 = await kirimUsulan(
      sesiVendorX,
      { invoiceNo: `${TAG}INV-WO2`, invoiceDate: '2026-08-03', amount: 12_000_000, workOrderId: wo2.id },
      Buffer.from('%PDF-1.4\ntagihan wo2\n'),
      'tagihan-wo2.pdf',
    )
    const jUsulanWo2 = await usulanWo2.json()
    cek('tagihan terkait WO2 terkirim (12jt vs kesepakatan 10jt)', usulanWo2.status === 201, `status ${usulanWo2.status}`)

    const picker = await (await sesiAdmin.ambil(`/api/voyages/${voyage.id}/vendor-submissions`)).json()
    const dipicker = picker.find((s) => s.id === jUsulanWo2.submissionId)
    cek('GET picker tak membuat DisbursementItem apa pun', (await prisma.disbursementItem.count({ where: { disbursementId: disbursement.id } })) === itemCountSebelumPicker)
    cek('usulan WO2 muncul di picker (belum dipakai)', !!dipicker)
    cek('picker menyertakan workOrderAgreedAmount (K172/3, selisih)', dipicker?.workOrderAgreedAmount === 10_000_000, String(dipicker?.workOrderAgreedAmount))
    cek('selisih vendor(12jt) vs kesepakatan(10jt) = 2jt', dipicker && Math.abs(dipicker.amount - dipicker.workOrderAgreedAmount) === 2_000_000)

    const simpanItem = await jsonPost(sesiAdmin, `/api/disbursements/${disbursement.id}/items`, {
      description: `Tagihan vendor ${jUsulanWo2.submissionId}`, quantity: 1, unitPrice: dipicker.amount, vendorId: vendorX.id,
      vendorInvoiceSubmissionId: jUsulanWo2.submissionId,
    })
    const jSimpanItem = await simpanItem.json()
    cek('simpan baris dari tagihan vendor → 201', simpanItem.status === 201, `status ${simpanItem.status}`)
    cek('DisbursementItem lahir (jumlah +1)', (await prisma.disbursementItem.count({ where: { disbursementId: disbursement.id } })) === itemCountSebelumPicker + 1)

    const submisiSesudahLink = await prisma.vendorInvoiceSubmission.findUnique({ where: { id: jUsulanWo2.submissionId } })
    cek('linkedDisbursementItemId terisi', !!submisiSesudahLink?.linkedDisbursementItemId)
    cek('status berubah jadi ACCEPTED', submisiSesudahLink?.status === 'ACCEPTED', submisiSesudahLink?.status)

    const pickerSesudah = await (await sesiAdmin.ambil(`/api/voyages/${voyage.id}/vendor-submissions`)).json()
    cek('usulan yang sudah dipakai HILANG dari picker', !pickerSesudah.some((s) => s.id === jUsulanWo2.submissionId))

    const tautanGanda = await jsonPost(sesiAdmin, `/api/disbursements/${disbursement.id}/items`, {
      description: 'Coba tautkan lagi', quantity: 1, unitPrice: 1, vendorInvoiceSubmissionId: jUsulanWo2.submissionId,
    })
    cek('menautkan usulan yang SAMA dua kali → 409 (tak bisa dipakai dua kali)', tautanGanda.status === 409, `status ${tautanGanda.status}`)
    cek(
      'tautan gagal → SATU transaksi, item yatim TIDAK ikut lahir',
      (await prisma.disbursementItem.count({ where: { disbursementId: disbursement.id } })) === itemCountSebelumPicker + 1,
    )

    // ================= 8. K173 — konfirmasi selesai, status/actualEnd TETAP =================
    console.log('\n8. Konfirmasi "pekerjaan selesai" (K173) → Comment+Notification; status/actualEnd TETAP')
    const woSebelum = await prisma.workOrder.findUnique({ where: { id: wo2.id }, select: { status: true, actualEnd: true } })
    const [notifSebelum, commentSebelum] = await Promise.all([
      prisma.notification.count({ where: { tenantId: tenantA.id, type: 'VENDOR_WORK_CONFIRMED' } }),
      prisma.comment.count({ where: { tenantId: tenantA.id, entityType: 'WORK_ORDER', entityId: wo2.id } }),
    ])
    const konfirmasi = await jsonPost(sesiVendorX, `/api/portal/work-orders/${wo2.id}/confirm`, { note: 'Sudah kami kerjakan sesuai SPK.' })
    cek('konfirmasi selesai → 201', konfirmasi.status === 201, `status ${konfirmasi.status}`)

    const woSesudah = await prisma.workOrder.findUnique({ where: { id: wo2.id }, select: { status: true, actualEnd: true } })
    cek('WorkOrder.status TIDAK berubah', woSesudah.status === woSebelum.status, `${woSebelum.status} → ${woSesudah.status}`)
    cek('WorkOrder.actualEnd TIDAK berubah', woSesudah.actualEnd === woSebelum.actualEnd, `${woSebelum.actualEnd} → ${woSesudah.actualEnd}`)

    const [notifSesudah, commentSesudah] = await Promise.all([
      prisma.notification.count({ where: { tenantId: tenantA.id, type: 'VENDOR_WORK_CONFIRMED' } }),
      prisma.comment.count({ where: { tenantId: tenantA.id, entityType: 'WORK_ORDER', entityId: wo2.id } }),
    ])
    cek('satu Notification baru', notifSesudah - notifSebelum === 1, `${notifSebelum} → ${notifSesudah}`)
    cek('satu Comment baru', commentSesudah - commentSebelum === 1, `${commentSebelum} → ${commentSesudah}`)

    const notifBaru = await prisma.notification.findFirst({ where: { tenantId: tenantA.id, type: 'VENDOR_WORK_CONFIRMED' }, orderBy: { createdAt: 'desc' } })
    const adminUser = await prisma.user.findFirst({ where: { tenantId: tenantA.id, email: EMAIL_ADMIN } })
    cek('Notification BERTARGET ke pembuat WO (bukan siaran)', notifBaru?.userId === adminUser?.id, notifBaru?.userId)

    // ================= 9. Lintas-tenant =================
    console.log('\n9. Lintas-tenant — vendor bernama sama di tenant B tetap tak terlihat')
    const s1 = await sesiVendorX.ambil(`/api/portal/purchase-orders/${poB.id}`)
    cek('X → PO tenant LAIN (vendor bernama sama) → 404', s1.status === 404, `status ${s1.status}`)
    const daftarPoAkhir = await (await sesiVendorX.ambil('/api/portal/purchase-orders')).json()
    cek('daftar PO X tak memuat PO tenant B', !daftarPoAkhir.some((p) => p.id === poB.id))
  } finally {
    // ---------- pulihkan berkas yang ditambal, kalau proses berhenti di tengah ----------
    if (ownerGuardDitambal) {
      writeFileSync(BERKAS_OWNER_GUARD, asliOwnerGuard)
      console.log('\n  ↩️  owner-guard.ts dipulihkan (jalur finally).')
    }
    if (policyDitambal) {
      writeFileSync(BERKAS_POLICY, asliPolicy)
      console.log('  ↩️  commercial-policy.ts dipulihkan (jalur finally).')
    }
    const pulihOwnerGuard = readFileSync(BERKAS_OWNER_GUARD, 'utf8') === asliOwnerGuard
    const pulihPolicy = readFileSync(BERKAS_POLICY, 'utf8') === asliPolicy
    console.log(pulihOwnerGuard ? '  ↩️  owner-guard.ts terkonfirmasi bersih.' : '  ⚠️  GAGAL memulihkan owner-guard.ts — periksa git diff!')
    console.log(pulihPolicy ? '  ↩️  commercial-policy.ts terkonfirmasi bersih.' : '  ⚠️  GAGAL memulihkan commercial-policy.ts — periksa git diff!')

    // ---------- bersih-bersih data uji ----------
    console.log('\n  bersih-bersih data uji…')
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue
      await prisma.comment.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.notification.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.attachment.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.vendorInvoiceSubmission.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.disbursementItem.deleteMany({ where: { disbursement: { tenantId: tenant.id } } }).catch(() => {})
      await prisma.disbursement.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId: tenant.id } } }).catch(() => {})
      await prisma.purchaseOrder.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
      await prisma.workOrder.deleteMany({ where: { tenantId: tenant.id } }).catch(() => {})
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
    process.exitCode = gagal === 0 ? 0 : 1
  })
