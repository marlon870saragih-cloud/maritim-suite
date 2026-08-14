// Fase 6h / K81 — Perluasan ekstraksi: Customer/Vendor/Port (bagian 1) + Tarif (bagian 2, K82).
//
//   POST multipart { target: 'customer'|'vendor'|'port'|'tarif', file }
//        → { items: [{ draft, existing }] }                        (customer/vendor/port)
//        → { items: [{ draft, serviceMatch, portMatch, currentRate }] }  (tarif)
//
// TIDAK menulis ke database — untuk SEMUA target, termasuk tarif: hanya
// mengembalikan draft (bisa banyak baris, K81 catatan kepala
// `extract-target.ts`) + kecocokan/diff untuk dipratinjau. Penyimpanan
// customer/vendor/port lewat POST/PATCH /api/customers|vendors|ports yang
// sudah ada (pola sama `vessel-import/route.ts`); penyimpanan tarif lewat
// `api/ai/rate-import/route.ts` TERPISAH (K82: perlu AuditLog+nama berkas,
// endpoint /api/service-rates generik tak punya itu).
//
// Kecocokan baris dicek DI SINI (bukan di lib/ai/*, yang tak boleh sentuh DB):
// Customer/Vendor cocok NAMA (case-insensitive, trim); Port cocok UN/LOCODE
// dulu (kalau draft punya nilainya), baru jatuh ke nama — locode lebih bisa
// diandalkan sebagai kunci daripada nama dagang yang sering beda-beda tipis.
// Tarif (K82) cocok JASA lewat serviceCode lalu serviceName (TIDAK membuat
// jasa baru — baris tak dikenal ditandai `serviceMatch: null`, UI mengarahkan
// ke Master › Jasa) + pelabuhan lewat locode/nama (kosong = tarif umum, tanpa
// portId) — lalu tarif TERBARU untuk pasangan jasa+pelabuhan itu diambil
// sebagai `currentRate` supaya UI bisa menampilkan diff lama→baru.

import { withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { listCustomers } from '@/services/master/customer.service'
import { listVendors } from '@/services/master/vendor.service'
import { listPorts } from '@/services/master/port.service'
import { listServiceCatalog } from '@/services/master/service-catalog.service'
import { listServiceRates } from '@/services/master/service-rate.service'
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
import { RATE_TARGET, type RateField } from '@/lib/ai/rate-extract'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024
const TARGETS = ['customer', 'vendor', 'port', 'tarif'] as const
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
    if (target === 'port') {
      const [drafts, existingList] = await Promise.all([ekstrak<PortField>(PORT_TARGET), listPorts(ctx, { termasukNonAktif: true })])
      const items = drafts.map((draft) => {
        const byLocode = draft.unlocode
          ? existingList.find((p) => p.unlocode && norm(p.unlocode) === norm(draft.unlocode!))
          : undefined
        const byName = draft.name ? existingList.find((p) => norm(p.name) === norm(draft.name!)) : undefined
        return { draft, existing: byLocode ?? byName ?? null }
      })
      return Response.json({ items })
    }

    // tarif (K82) — TIDAK menulis DB di sini juga; hanya mencocokkan jasa/pelabuhan
    // & mengambil tarif terkini untuk diff. Penyimpanan lewat api/ai/rate-import.
    const [drafts, services, ports] = await Promise.all([
      ekstrak<RateField>(RATE_TARGET),
      listServiceCatalog(ctx, { termasukNonAktif: true }),
      listPorts(ctx, { termasukNonAktif: true }),
    ])

    const items = await Promise.all(
      drafts.map(async (draft) => {
        // Urutan kecocokan, dari paling ketat: (1) serviceCode persis, (2)
        // serviceName persis, (3) mengandung — dokumen tarif jarang menulis
        // ULANG nama lengkap katalog persis sama (mis. dokumen bilang
        // "Pilotage", katalog "Pilotage (Jasa Pandu)"). (3) tetap AMAN karena
        // K82 tak pernah membuat jasa baru dari kecocokan ini — ia cuma
        // menentukan ADA/TIDAKNYA baris "tarif lama" untuk dibandingkan;
        // operator tetap melihat serviceName hasil match & MEMILIH centang
        // sendiri sebelum apa pun tersimpan (K82/2).
        const namaDraf = draft.serviceName ? norm(draft.serviceName) : ''
        const serviceMatch =
          (draft.serviceCode ? services.find((s) => norm(s.serviceCode) === norm(draft.serviceCode!)) : undefined) ??
          (namaDraf ? services.find((s) => norm(s.serviceName) === namaDraf) : undefined) ??
          (namaDraf ? services.find((s) => norm(s.serviceName).includes(namaDraf) || namaDraf.includes(norm(s.serviceName))) : undefined) ??
          null

        const portMatch =
          (draft.portUnlocode ? ports.find((p) => p.unlocode && norm(p.unlocode) === norm(draft.portUnlocode!)) : undefined) ??
          (draft.portName ? ports.find((p) => norm(p.name) === norm(draft.portName!)) : undefined) ??
          null

        // K82/1 hanya bermakna kalau jasanya dikenali — jasa tak dikenal tak
        // punya "tarif lama" untuk dibandingkan sama sekali (baris ditolak di
        // UI, diarahkan ke Master › Jasa dulu).
        let currentRate: { rate: number; currency: string; effectiveFrom: string; minCharge: number | null } | null = null
        if (serviceMatch) {
          const rates = await listServiceRates(ctx, { serviceId: serviceMatch.id, portId: portMatch?.id ?? null })
          // listServiceRates sudah urut effectiveFrom desc (service-rate.service.ts) —
          // baris pertama = tarif TERBARU untuk pasangan jasa+pelabuhan ini.
          const terbaru = rates[0]
          if (terbaru) {
            currentRate = {
              rate: terbaru.rate,
              currency: terbaru.currency,
              effectiveFrom: terbaru.effectiveFrom.toISOString().slice(0, 10),
              minCharge: terbaru.minCharge,
            }
          }
        }

        return {
          draft,
          serviceMatch: serviceMatch ? { id: serviceMatch.id, serviceCode: serviceMatch.serviceCode, serviceName: serviceMatch.serviceName } : null,
          portMatch: portMatch ? { id: portMatch.id, name: portMatch.name } : null,
          currentRate,
        }
      }),
    )
    return Response.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal membaca berkas'
    throw validation(msg)
  }
})
