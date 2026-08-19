import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  extractVesselDraftFromImage,
  extractVesselDraftFromPdf,
  extractVesselDraftFromText,
  extractVesselDraftFromWorkbook,
  type VesselDraft,
} from '@/lib/ai/vessel-extract'
// Fase 8j — pemakaian (K183/K184). Rute ini memakai sesi NextAuth mentah
// (bukan withTenant/TenantContext), jadi ctx dibangun manual dari session.user
// yang sudah membawa id/tenantId/role — bentuknya persis TenantContext.
import { catatPemakaian } from '@/services/saas/usage.service'
// Checklist go-live / K185 — jaring pengaman penyalahgunaan (BUKAN kuota
// K156). Lihat catatan panjang di services/security/rate-limit.ts.
import { cekBolehPanggilAi, catatPanggilanAi } from '@/services/security/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

type Kind = 'pdf' | 'workbook' | 'csv' | 'image'

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

// Ekstensi dipakai sebagai penentu utama: mime dari browser tak konsisten untuk
// berkas Office (kadang application/octet-stream, kadang mime Excel lama).
function classify(name: string, mime: string): Kind | 'xls-lama' | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (ext === 'xlsx' || ext === 'xlsm') return 'workbook'
  if (ext === 'csv') return 'csv'
  if (ext === 'xls') return 'xls-lama'
  if (mime.includes('spreadsheetml')) return 'workbook'
  if (mime === 'text/csv') return 'csv'
  if (ext in IMAGE_MIME || mime.startsWith('image/')) return 'image'
  return null
}

/** Mime data URI untuk gambar — dari `mime` browser bila valid, jatuh ke ekstensi (kadang browser kirim octet-stream untuk foto yang diteruskan WhatsApp Web/desktop). */
function imageMime(name: string, mime: string): string {
  if (mime.startsWith('image/')) return mime
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  return IMAGE_MIME[ext] ?? 'image/jpeg'
}

const digits = (v: string | null) => (v ?? '').replace(/\D/g, '')

// POST /api/ai/vessel-import → upload PDF/Excel, AI ekstrak partikular kapal.
// TIDAK menulis ke database: hanya mengembalikan draft + kapal yang cocok IMO-nya.
// Penyimpanan tetap lewat POST/PATCH /api/vessels setelah pengguna mengonfirmasi.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  // Checklist go-live / K185 — diperiksa sebelum apa pun lain (berkas belum
  // dibaca, AI belum dipanggil).
  const { diblokir } = await cekBolehPanggilAi(session.user.id)
  if (diblokir) {
    return new Response('Terlalu banyak panggilan dalam waktu singkat. Tunggu beberapa menit sebelum mencoba lagi.', { status: 429 })
  }
  await catatPanggilanAi(session.user.id)

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    return new Response('Upload tidak terbaca', { status: 400 })
  }
  if (!file) return new Response('Berkas belum dipilih', { status: 400 })
  if (file.size === 0) return new Response('Berkas kosong', { status: 400 })
  if (file.size > MAX_BYTES) return new Response('Berkas terlalu besar (maksimal 10 MB)', { status: 413 })

  const kind = classify(file.name, file.type)
  if (kind === 'xls-lama') {
    return new Response('Format .xls lama belum didukung — simpan ulang sebagai .xlsx', { status: 415 })
  }
  if (!kind) return new Response('Hanya berkas PDF, Excel (.xlsx/.xlsm), CSV, atau gambar (JPG/PNG/WEBP)', { status: 415 })

  const ab = await file.arrayBuffer()

  let draft: VesselDraft
  try {
    draft =
      kind === 'pdf'
        ? await extractVesselDraftFromPdf(Buffer.from(ab), file.name)
        : kind === 'workbook'
          ? await extractVesselDraftFromWorkbook(ab)
          : kind === 'image'
            ? await extractVesselDraftFromImage(Buffer.from(ab), imageMime(file.name, file.type))
            : await extractVesselDraftFromText(Buffer.from(ab).toString('utf8'))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal membaca berkas'
    return new Response(msg, { status: 422 })
  }

  // Fase 8j / K183 — ekstraksi berhasil, sebelum pencocokan IMO (yang tak
  // mengubah apakah "fitur AI ini dipakai" sudah terjadi).
  await catatPemakaian(
    { tenantId: session.user.tenantId, userId: session.user.id, role: session.user.role },
    'AI_VESSEL_IMPORT_USED',
    { kind },
  )

  // Cocokkan IMO di aplikasi, bukan di query: nomor tersimpan bisa ber-format
  // ("IMO 9123456", "9123456 "), jadi dibandingkan setelah disaring jadi digit.
  // Master kapal per tenant kecil, jadi memuat semuanya masih murah.
  const imo = digits(draft.imoNumber ?? '')
  let existingVessel = null
  if (imo) {
    const rows = await prisma.vessel.findMany({
      where: { tenantId: session.user.tenantId, NOT: { imoNumber: null } },
      orderBy: { name: 'asc' },
    })
    existingVessel = rows.find((v) => digits(v.imoNumber) === imo) ?? null
  }

  return Response.json({ draft, existingVessel })
}
