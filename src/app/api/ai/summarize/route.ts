// Fase 6g / K80 — Document Summary. Dua sumber, satu endpoint, dibedakan lewat
// Content-Type:
//
//   application/json   { jenis, id, bahasa? }        → ringkas dokumen SISTEM
//   multipart/form-data { file }                      → ringkas BERKAS unggahan
//
// Balasan: { ok, summary, sumber: 'sistem'|'berkas', ditolak?, angkaTakDikenal? }
//
// K80 — STATELESS: jalur berkas tidak pernah menulis apa pun ke penyimpanan;
// bytes-nya dibaca, dikirim ke model, lalu dibuang begitu respons ini selesai.
// Tak ada tabel/direktori baru dibuat untuk permintaan ini.

import { withTenant } from '@/services/http'
import { validation } from '@/services/errors'
import { str, wajib } from '@/services/input'
import { pastikanLanggananAktif } from '@/services/subscription'
import { bangunKonteks } from '@/services/ai/konteks.service'
import { type JenisKonteks } from '@/services/ai/konteks'
import { periksaNarasi } from '@/services/ai/narasi-guard'
import { uploadAttachment } from '@/services/ops/attachment.service'
import type { TenantContext } from '@/services/context'
import { promptRingkasBerkas, promptRingkasSistem } from '@/lib/ai/summary'
import { flattenWorkbook } from '@/lib/ai/vessel-extract'
import {
  chatCompletion,
  firstMessageText,
  PDF_NATIVE_PLUGIN,
  type ChatMessage,
} from '@/lib/ai/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JENIS: readonly JenisKonteks[] = ['VOYAGE', 'DISBURSEMENT', 'INVOICE']
const BAHASA = ['id', 'en'] as const
const MAX_BYTES = 10 * 1024 * 1024

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

async function ringkasSistem(
  ctx: Parameters<typeof bangunKonteks>[0],
  jenisMentah: unknown,
  idMentah: unknown,
  bahasa: 'id' | 'en',
) {
  const jenis = str(jenisMentah)
  if (!jenis || !JENIS.includes(jenis as JenisKonteks)) throw validation('Jenis konteks tidak dikenal.')
  const id = wajib(str(idMentah), 'id entitas')

  const konteks = await bangunKonteks(ctx, jenis as JenisKonteks, id, { bahasa })
  const resp = await chatCompletion({ messages: promptRingkasSistem(konteks, bahasa), temperature: 0.2 })
  const teks = firstMessageText(resp)
  if (!teks) throw new Error('Model tidak memberi ringkasan.')

  const periksa = periksaNarasi(teks, konteks)
  return Response.json({
    ok: true,
    sumber: 'sistem',
    summary: teks,
    ditolak: !periksa.diterima,
    angkaTakDikenal: periksa.angkaTakDikenal,
  })
}

async function ringkasBerkas(ctx: TenantContext, req: Request, bahasa: 'id' | 'en') {
  let file: File | null = null
  let form: FormData
  try {
    form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    throw validation('Unggahan tidak terbaca.')
  }
  if (!file) throw validation('Berkas belum dipilih.')
  if (file.size === 0) throw validation('Berkas kosong.')
  if (file.size > MAX_BYTES) throw validation('Berkas terlalu besar (maksimal 10 MB).')

  const kind = classify(file.name, file.type)
  if (kind === 'xls-lama') throw validation('Format .xls lama belum didukung — simpan ulang sebagai .xlsx')
  if (!kind) throw validation('Hanya berkas PDF, Excel (.xlsx/.xlsm), teks/CSV, atau gambar (JPG/PNG/WEBP).')

  const ab = await file.arrayBuffer()

  let messages: ChatMessage[]
  let plugins: typeof PDF_NATIVE_PLUGIN | undefined

  if (kind === 'pdf') {
    const content: ChatMessage['content'] = [
      { type: 'file', file: { filename: file.name, file_data: `data:application/pdf;base64,${Buffer.from(ab).toString('base64')}` } },
    ]
    messages = promptRingkasBerkas(content, bahasa)
    plugins = PDF_NATIVE_PLUGIN
  } else if (kind === 'image') {
    const mime = imageMime(file.name, file.type)
    const content: ChatMessage['content'] = [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${Buffer.from(ab).toString('base64')}` } },
    ]
    messages = promptRingkasBerkas(content, bahasa)
  } else if (kind === 'workbook') {
    const sheet = await flattenWorkbook(ab)
    if (!sheet.trim()) throw validation('Berkas Excel kosong / tidak ada data yang bisa dibaca.')
    messages = promptRingkasBerkas(sheet, bahasa)
  } else {
    const text = Buffer.from(ab).toString('utf8').slice(0, 24_000)
    if (!text.trim()) throw validation('Berkas kosong / tidak ada data yang bisa dibaca.')
    messages = promptRingkasBerkas(text, bahasa)
  }

  let resp
  try {
    resp = await chatCompletion({ messages, temperature: 0.2, plugins })
  } catch (e) {
    // Sama seperti vessel-extract.ts: engine `native` bergantung dukungan model —
    // kalau ditolak, coba ulang tanpa plugin sebelum menyerah.
    const msg = e instanceof Error ? e.message.toLowerCase() : ''
    if (plugins && /plugin|engine|native|file/.test(msg)) {
      resp = await chatCompletion({ messages, temperature: 0.2 })
    } else {
      throw e
    }
  }
  const teks = firstMessageText(resp)
  if (!teks) throw new Error('Model tidak memberi ringkasan.')

  // K111 — revisi K80: berkas boleh disimpan ke lampiran, OPSIONAL dan
  // BAWAAN MATI (checkbox di SummaryDialog, tak dicentang kalau tak
  // disentuh). Diproses SESUDAH ringkasan berhasil, dan kegagalannya TIDAK
  // menggagalkan ringkasan yang sudah didapat — checkbox ini cuma
  // menambahkan efek samping opsional di atas hasil yang sudah sah.
  let lampiran: { ok: boolean; id?: string; error?: string } | undefined
  const simpan = str(form.get('simpanLampiran')) === 'true'
  if (simpan) {
    const entityType = form.get('entityType')
    const entityId = form.get('entityId')
    try {
      const hasil = await uploadAttachment(ctx, {
        entityType,
        entityId,
        fileName: file.name,
        mimeType: file.type || null,
        isi: Buffer.from(ab),
        kind: 'GENERAL',
        note: 'Diringkas AI (Document Summary)',
      })
      lampiran = { ok: true, id: hasil.attachment.id }
    } catch (e) {
      lampiran = { ok: false, error: e instanceof Error ? e.message : 'Gagal menyimpan lampiran.' }
    }
  }

  // K80/2 — TIDAK diperiksa periksaNarasi(): tak ada payload sistem untuk
  // dibandingkan, ini murni pembacaan dokumen pihak ketiga. UI menandai
  // sumber 'berkas' secara visual berbeda dari 'sistem'.
  return Response.json({ ok: true, sumber: 'berkas', summary: teks, lampiran })
}

export const POST = withTenant(async (ctx, req) => {
  await pastikanLanggananAktif(ctx)

  const contentType = req.headers.get('content-type') ?? ''
  const bahasaQ = new URL(req.url).searchParams.get('bahasa')
  const bahasa = (BAHASA as readonly string[]).includes(bahasaQ ?? '') ? (bahasaQ as 'id' | 'en') : 'id'

  if (contentType.includes('multipart/form-data')) {
    return ringkasBerkas(ctx, req, bahasa)
  }

  const body = await req.json().catch(() => ({}))
  return ringkasSistem(ctx, (body as Record<string, unknown>).jenis, (body as Record<string, unknown>).id, bahasa)
})
