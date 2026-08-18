// Skor vendor — lapisan DB (K113-K114, Fase 7j). Empat query metrik, SEMUA
// dimulai dari model bertenant (`forTenant(ctx).workOrder`/`task`/`vendorRating`)
// lalu disaring dataOrigin (K55-K59) di sini — `DisbursementItem` sendiri
// TIDAK dijaga tenant-guard (model anak, K44), tapi query-nya selalu masuk
// lewat `disbursementId`/`purchaseOrderId` milik baris yang SUDAH tersaring
// tenant, jadi K65 tetap berlaku persis seperti Fase 6.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound } from '../errors'
import { bacaAsal } from '../ai/provenance'
import { hitungSkorVendor, type SkorVendor, type BahanMetrik } from './vendor-score'

const HARI = 86_400_000
/** K113 — jendela histori yang dinilai. Tak ada P-jawaban soal panjangnya; 365 hari dipilih supaya musim kerja penuh tercakup. */
const PERIODE_HARI = 365

/** true hanya untuk voyage berasal 'NYATA' — sama predikat dengan K59 (Fase 6b), dipakai ulang lewat bacaAsal(), bukan ditulis ulang. */
function voyageNyata(dataOrigin: string | null): boolean {
  return bacaAsal(dataOrigin) === 'NYATA'
}

export async function skorVendor(ctx: TenantContext, vendorId: string): Promise<SkorVendor> {
  const db = forTenant(ctx)
  const vendor = await db.vendor.findFirst({ where: { id: vendorId, deletedAt: null }, select: { id: true } })
  if (!vendor) throw notFound('Vendor')

  const sampai = new Date()
  const dari = new Date(sampai.getTime() - PERIODE_HARI * HARI)

  // ------------------------------------------------------- ketepatan waktu (WO)
  const wo = await db.workOrder.findMany({
    where: { vendorId, deletedAt: null, actualEnd: { gte: dari, lte: sampai } },
    select: { plannedEnd: true, actualEnd: true, voyage: { select: { dataOrigin: true } } },
  })
  const woNyata = wo.filter((w) => voyageNyata(w.voyage.dataOrigin))
  // K114 — cuma WO yang punya plannedEnd bisa dinilai "tepat waktu"; tanpa
  // target, tak ada yang bisa dibandingkan (bukan 0 dan bukan otomatis lolos).
  const ketepatanWaktu: BahanMetrik = {
    booleanSamples: woNyata
      .filter((w) => w.plannedEnd && w.actualEnd)
      .map((w) => (w.actualEnd as Date).getTime() <= (w.plannedEnd as Date).getTime()),
  }

  // -------------------------------------------------- ketepatan harga (WO×FDA)
  const woHarga = await db.workOrder.findMany({
    where: { vendorId, deletedAt: null, agreedAmount: { not: null }, status: { in: ['COMPLETED', 'VERIFIED'] } },
    select: { agreedAmount: true, voyageId: true, voyage: { select: { dataOrigin: true } } },
  })
  const hargaSamples: number[] = []
  for (const w of woHarga) {
    if (!voyageNyata(w.voyage.dataOrigin) || !w.agreedAmount) continue
    // K114 — baris FDA vendorId sama & voyage sama. `DisbursementItem` model anak
    // (K44): akses lewat `disbursement.voyageId` yang sudah tersaring tenant di
    // atas (`forTenant(ctx).disbursement`), bukan query item langsung.
    const disb = await db.disbursement.findMany({
      where: { voyageId: w.voyageId, kind: 'FDA', deletedAt: null },
      select: { items: { where: { vendorId }, select: { amountBase: true } } },
    })
    const realisasi = disb.flatMap((d) => d.items).reduce((s, it) => s + it.amountBase, 0)
    if (realisasi <= 0) continue
    const akurasi = Math.max(0, 1 - Math.abs(realisasi - w.agreedAmount) / w.agreedAmount) * 100
    hargaSamples.push(akurasi)
  }
  const ketepatanHarga: BahanMetrik = { numericSamples: hargaSamples }

  // ------------------------------------------------------- penyelesaian tugas
  const tugas = await db.task.findMany({
    where: { vendorId, deletedAt: null, dueAt: { not: null }, completedAt: { gte: dari, lte: sampai } },
    select: { dueAt: true, completedAt: true, voyage: { select: { dataOrigin: true } } },
  })
  const tugasNyata = tugas.filter((t) => voyageNyata(t.voyage?.dataOrigin ?? null))
  const penyelesaianTugas: BahanMetrik = {
    booleanSamples: tugasNyata.map((t) => (t.completedAt as Date).getTime() <= (t.dueAt as Date).getTime()),
  }

  // ------------------------------------------------------------ penilaian manual
  const rating = await db.vendorRating.findMany({
    where: { vendorId, createdAt: { gte: dari, lte: sampai } },
    select: { score: true, voyageId: true },
  })
  // VendorRating tak wajib voyageId (bisa menilai vendor tanpa konteks satu
  // kunjungan spesifik) — baris tanpa voyageId dianggap NYATA (opini manusia
  // hari ini, bukan turunan data voyage), sejalan K57 hanya berlaku untuk
  // baris yang MEMANG membawa dataOrigin (Voyage/Disbursement).
  const voyageIds = Array.from(new Set(rating.map((r) => r.voyageId).filter((v): v is string => !!v)))
  const voyages = voyageIds.length
    ? await db.voyage.findMany({ where: { id: { in: voyageIds } }, select: { id: true, dataOrigin: true } })
    : []
  const originById = new Map(voyages.map((v) => [v.id, v.dataOrigin]))
  const ratingNyata = rating.filter((r) => !r.voyageId || voyageNyata(originById.get(r.voyageId) ?? null))
  const penilaianManual: BahanMetrik = { numericSamples: ratingNyata.map((r) => r.score) }

  return hitungSkorVendor(
    vendorId,
    { dari, sampai },
    { ketepatanWaktu, ketepatanHarga, penyelesaianTugas, penilaianManual },
    woNyata.length,
    tugasNyata.length,
  )
}
