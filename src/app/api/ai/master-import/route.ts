// Fase 6h bagian 1 / K81 — Perluasan ekstraksi: Customer/Vendor/Port.
//
//   POST multipart { target: 'customer'|'vendor'|'port', file } → { items: [{ draft, existing }] }
//
// TIDAK menulis ke database: hanya mengembalikan draft (bisa banyak baris,
// K81 catatan kepala `extract-target.ts`) + kecocokan dengan data yang sudah
// ada, per baris. Penyimpanan tetap lewat POST/PATCH /api/customers|vendors|ports
// yang sudah ada — pola sama persis `vessel-import/route.ts`.
//
// Kecocokan baris dicek DI SINI (bukan di lib/ai/*, yang tak boleh sentuh DB):
// Customer/Vendor cocok NAMA (case-insensitive, trim); Port cocok UN/LOCODE
// dulu (kalau draft punya nilainya), baru jatuh ke nama — locode lebih bisa
// diandalkan sebagai kunci daripada nama dagang yang sering beda-beda tipis.

import { withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { listCustomers } from '@/services/master/customer.service'
import { listVendors } from '@/services/master/vendor.service'
import { listPorts } from '@/services/master/port.service'
import {
  extractDraftListFromImage,
  extractDraftListFromPdf,
  extractDraftListFromText,
  extractDraftListFromWorkbook,
  type DraftBaris,
  type TargetEkstraksi,
} from '@/lib/ai/extract-target'
import { CUSTOMER_TARGET, type CustomerField } from '@/lib/ai/customer-extract'
import { VENDOR_TARGET, type VendorField } from '@/lib/ai/vendor-extract'
import { PORT_TARGET, type PortField } from '@/lib/ai/port-extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024
const TARGETS = ['customer', 'vendor', 'port'] as const
type Target = (typeof TARGETS)[number]

type Kind = 'pdf' | 'workbook' | 'text' | 'image'
const IMAGE_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function classify(name: string, mime: string): Kind | 'xls-lama' | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === 'xlsx' || ext === 'xlsm' || mime.includes('spreadsheetml')) return 'workbook'
  if (ext === 'xls') return 'xls-lama'
  if (ext === 'csv' || ext === 'txt' || mime === 'text/csv' || mime === 'text/plain') return 'text'
  if (ext in IMAGE_MIME || mime.startsWith('image/')) return 'image'
  return null
}
function imageMime(name: string, mime: string): string {
  if (mime.startsWith('image/')) return mime
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  return IMAGE_MIME[ext] ?? 'image/jpeg'
}

const norm = (s: string) => s.trim().toLowerCase()

export const POST = withTenant(async (ctx, req) => {
  let target: Target | null = null
  let file: File | null = null
  try {
    const form = await req.formData()
    const t = form.get('target')
    if (typeof t === 'string' && (TARGETS as readonly string[]).includes(t)) target = t as Target
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    throw validation('Unggahan tidak terbaca.')
  }
  if (!target) throw validation(`target wajib salah satu dari: ${TARGETS.join(', ')}.`)
  if (!file) throw validation('Berkas belum dipilih.')
  if (file.size === 0) throw validation('Berkas kosong.')
  if (file.size > MAX_BYTES) throw validation('Berkas terlalu besar (maksimal 10 MB).')

  const kind = classify(file.name, file.type)
  if (kind === 'xls-lama') throw validation('Format .xls lama belum didukung — simpan ulang sebagai .xlsx')
  if (!kind) throw validation('Hanya berkas PDF, Excel (.xlsx/.xlsm), CSV, atau gambar (JPG/PNG/WEBP).')

  const ab = await file.arrayBuffer()

  async function ekstrak<F extends string>(t: TargetEkstraksi<F>): Promise<DraftBaris<F>[]> {
    if (kind === 'pdf') return extractDraftListFromPdf(t, Buffer.from(ab), file!.name)
    if (kind === 'workbook') return extractDraftListFromWorkbook(t, ab)
    if (kind === 'image') return extractDraftListFromImage(t, Buffer.from(ab), imageMime(file!.name, file!.type))
    return extractDraftListFromText(t, Buffer.from(ab).toString('utf8'))
  }

  try {
    if (target === 'customer') {
      const [drafts, existingList] = await Promise.all([ekstrak<CustomerField>(CUSTOMER_TARGET), listCustomers(ctx, { termasukNonAktif: true })])
      const items = drafts.map((draft) => ({
        draft,
        existing: existingList.find((c) => draft.name && norm(c.name) === norm(draft.name)) ?? null,
      }))
      return Response.json({ items })
    }
    if (target === 'vendor') {
      const [drafts, existingList] = await Promise.all([ekstrak<VendorField>(VENDOR_TARGET), listVendors(ctx, { termasukNonAktif: true })])
      const items = drafts.map((draft) => ({
        draft,
        existing: existingList.find((v) => draft.name && norm(v.name) === norm(draft.name)) ?? null,
      }))
      return Response.json({ items })
    }
    // port
    const [drafts, existingList] = await Promise.all([ekstrak<PortField>(PORT_TARGET), listPorts(ctx, { termasukNonAktif: true })])
    const items = drafts.map((draft) => {
      const byLocode = draft.unlocode
        ? existingList.find((p) => p.unlocode && norm(p.unlocode) === norm(draft.unlocode!))
        : undefined
      const byName = draft.name ? existingList.find((p) => norm(p.name) === norm(draft.name!)) : undefined
      return { draft, existing: byLocode ?? byName ?? null }
    })
    return Response.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal membaca berkas'
    throw validation(msg)
  }
})
