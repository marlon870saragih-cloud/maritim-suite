// Pembangun `KonteksAI` — lapisan DB (Fase 6f · K76).
// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md §5.
//
// Berkas ini menjawab satu pertanyaan saja: "apa yang boleh diketahui model
// tentang entitas yang sedang dibuka pengguna?" — dan menjawabnya dengan
// PROYEKSI BERDAFTAR-PUTIH ke bentuk `KonteksAI` (murni, 6b), bukan dengan
// menyalin objek Prisma apa adanya.
//
// ⚠️ K76/1 — TIDAK ADA SATU PUN QUERY DI SINI. Seluruh data diambil lewat
// service yang SAMA dengan yang dipakai UI (`getVoyage`, `getDisbursementDetail`,
// `getInvoiceDetail`, `variancePasangan`). Akibatnya hak akses & pagar tenant
// ikut otomatis: entitas milik tenant lain jatuh ke NOT_FOUND yang sama persis
// dengan yang dilihat UI, tanpa satu baris kode izin baru. Membangun konteks
// lewat query sendiri berarti membangun sistem izin kedua yang pasti akan
// menyimpang dari yang pertama — dan menyimpangnya baru ketahuan saat sudah
// bocor. Karena itu `forTenant` sengaja TIDAK diimpor di berkas ini, dan
// `prisma/check-ai-guardrail.mjs` memeriksa ketiadaannya secara statis.
//
// ⚠️ K76/2 — daftar putih, bukan daftar hitam. Yang tidak disebut `KonteksAI`
// tidak pernah terkirim: email principal/customer, `npwp`, alamat, id internal,
// dan apa pun milik tenant lain. Pemetaan di bawah ditulis field-per-field
// justru supaya kolom baru di skema TIDAK ikut terkirim diam-diam besok.
//
// ⚠️ K76/4 — dibangun ULANG setiap pemanggilan. Tak ada cache di berkas ini dan
// tak boleh ada: jawaban asisten harus mencerminkan layar saat ini, dan konteks
// basi yang terlihat segar adalah bentuk kebohongan yang paling sulit dilacak.
//
// Yang BUKAN tugas berkas ini: menyusun prompt dan memanggil model. Itu milik
// `src/lib/ai/assistant-context.ts` (tanpa DB, K52) dan route `/api/ai/context/*`
// yang mengorkestrasi keduanya. Berkas ini tidak tahu apa itu OpenRouter.

import type { TenantContext } from '../context'
import { validation } from '../errors'
import { pastikanLanggananAktif } from '../subscription'
import { pastikanKuota } from '../saas/quota.service'
import { getVoyage, type VoyageDetail } from '../master/voyage.service'
import { getDisbursementDetail } from '../finance/disbursement.service'
import { getInvoiceDetail } from '../finance/invoice.service'
import { variancePasangan } from '../finance/fda.service'
import { prediksiUntukDisbursement } from './prediction.service'
import { anomaliUntukDisbursement } from './anomaly.service'
import { listComments } from '../ops/comment.service'
import {
  potongKonteks,
  type BarisKonteks,
  type JenisKonteks,
  type KonteksAI,
} from './konteks'

export type OpsiKonteks = {
  bahasa?: 'id' | 'en'
  /** Anggaran karakter (K76/3). Bawaan `ANGGARAN_KARAKTER_BAWAAN` dari konteks.ts. */
  anggaranKarakter?: number
  /**
   * Sertakan `prediksi` / `anomali` pada konteks DISBURSEMENT.
   *
   * Bawaannya MATI, dan itu keputusan sadar (K54 "rem biaya"): kedua field itu
   * masing-masing menjalankan ulang seluruh mesin 6c/6e — query grounding
   * bertingkat, katalog tarif, kurs, populasi kunjungan serupa — sementara
   * K76/4 mewajibkan konteks dibangun ULANG untuk SETIAP pertanyaan. Menyalakan
   * keduanya secara bawaan berarti setiap kalimat yang diketik operator membayar
   * ongkos dua fitur yang mungkin tak ada hubungannya dengan pertanyaannya.
   *
   * Karena itu ia dijadikan pilihan pemanggil (route meneruskannya dari body),
   * bukan dihapus: pertanyaan seperti "apa yang perlu saya periksa di dokumen
   * ini?" memang butuh anomali, dan saat dibutuhkan ia WAJIB datang dari
   * `anomaliUntukDisbursement()`/`prediksiUntukDisbursement()` yang sudah ada —
   * tak ada hitungan kedua yang bisa berbeda dari panel di layar.
   */
  sertakanPrediksi?: boolean
  sertakanAnomali?: boolean
}

const JENIS: readonly JenisKonteks[] = ['VOYAGE', 'DISBURSEMENT', 'INVOICE']

// ------------------------------------------------------------------- pembantu

/** Tanggal → 'YYYY-MM-DD'. `null` tetap `null` — jangan pernah menebak tanggal. */
function tgl(nilai: Date | null | undefined): string | null {
  if (!nilai) return null
  const ms = nilai.getTime()
  if (!Number.isFinite(ms)) return null
  return nilai.toISOString().slice(0, 10)
}

/** Angka yang tak terhingga/NaN dilaporkan `null`, bukan diteruskan sebagai angka palsu. */
function angka(nilai: number | null | undefined): number | null {
  return typeof nilai === 'number' && Number.isFinite(nilai) ? nilai : null
}

/** Buang field bernilai `null` supaya anggaran karakter tak habis untuk ketiadaan. */
function rapikan(fakta: Record<string, string | number | null>): Record<string, string | number | null> {
  const hasil: Record<string, string | number | null> = {}
  for (const [k, v] of Object.entries(fakta)) {
    if (v === null || v === '') continue
    hasil[k] = v
  }
  return hasil
}

// -------------------------------------------------------------------- VOYAGE

function ringkasVoyage(v: VoyageDetail): string {
  const kapal = v.vessel?.name ?? 'kapal tak diketahui'
  const pelabuhan = v.port?.name ?? 'pelabuhan belum ditentukan'
  const waktu = tgl(v.eta) ?? tgl(v.etb) ?? tgl(v.ata) ?? null
  return (
    `Voyage ${v.voyageNumber}: ${kapal} di ${pelabuhan}, status ${v.status}` +
    (waktu ? `, ETA/ETB ${waktu}` : '') +
    '.'
  )
}

async function konteksVoyage(ctx: TenantContext, id: string): Promise<KonteksAI> {
  const v = await getVoyage(ctx, id)

  return {
    jenis: 'VOYAGE',
    ringkas: ringkasVoyage(v),
    fakta: rapikan({
      voyageNumber: v.voyageNumber,
      status: v.status,
      agencyType: v.agencyType,
      kapal: v.vessel?.name ?? null,
      imo: v.vessel?.imoNumber ?? null,
      jenisKapal: v.vessel?.vesselType ?? null,
      gt: angka(v.vessel?.gt ?? null),
      loa: angka(v.vessel?.loa ?? null),
      pelabuhan: v.port?.name ?? null,
      unlocode: v.port?.unlocode ?? null,
      principal: v.principal?.name ?? null,
      customer: v.customer?.name ?? null,
      eta: tgl(v.eta),
      etb: tgl(v.etb),
      etc: tgl(v.etc),
      etd: tgl(v.etd),
      ata: tgl(v.ata),
      atb: tgl(v.atb),
      atd: tgl(v.atd),
      baseCurrency: v.baseCurrency,
      // Voyage TIDAK punya baris uang sendiri — itu milik disbursement-nya
      // (K60). Yang boleh diketahui model cuma BERAPA BANYAK dokumennya, supaya
      // ia bisa mengarahkan pengguna, bukan mengarang isinya.
      jumlahDokumenFinansial: v._count.disbursements,
      jumlahInvoice: v._count.invoices,
      jumlahDokumen: v._count.documents,
      jumlahKargo: v.cargoes.length,
      jumlahPortCall: v.portCalls.length,
      // Teks bebas milik pengguna. IKUT dikirim (asisten memang harus bisa
      // membacanya), dan justru karena itu prompt K53 wajib: isi kolom ini
      // adalah tempat paling murah bagi siapa pun untuk menitipkan "perintah"
      // ke model. Lihat `promptTanya()` di src/lib/ai/assistant-context.ts.
      catatan: v.notes,
    }),
  }
}

// -------------------------------------------------------------- DISBURSEMENT

/** K76/2 — pemetaan EKSPLISIT, bukan salinan objek Prisma. */
function barisDisbursement(items: {
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  amountBase: number
}[]): BarisKonteks[] {
  return items.map((it) => ({
    deskripsi: it.description,
    qty: angka(it.quantity) ?? 0,
    unit: it.unit,
    harga: angka(it.unitPrice) ?? 0,
    // `amountBase` (bukan `amount`): satu dokumen boleh punya baris bermata uang
    // berbeda, dan hanya nilai dalam mata uang dasar yang bisa dibandingkan —
    // sekaligus kunci pengurutan pemotongan K76/3.
    jumlah: angka(it.amountBase) ?? 0,
  }))
}

/**
 * Ringkasan variance FDA vs EPDA (K46), lewat `variancePasangan()` yang SUDAH
 * ADA. Dibungkus try/catch: FDA tanpa EPDA asal melempar VALIDATION, dan itu
 * bukan galat di sini — cuma "tak ada yang dibandingkan".
 */
async function varianceRingkas(
  ctx: TenantContext,
  disbursementId: string,
  mataUang: string,
): Promise<KonteksAI['variance']> {
  try {
    const hasil = await variancePasangan(ctx, disbursementId)
    const r = hasil.ringkasan
    const pct = r.variancePct === null ? null : Math.round(r.variancePct * 10) / 10
    return {
      ringkasan:
        `EPDA ${r.epdaBase} ${mataUang} vs FDA ${r.fdaBase} ${mataUang}, ` +
        `selisih ${r.varianceBase} ${mataUang}` +
        (pct === null ? '' : ` (${pct}%)`) +
        `. Baris: ${r.jumlah.SAMA} sama, ${r.jumlah.BERUBAH} berubah, ` +
        `${r.jumlah.TAK_DIANGGARKAN} tak dianggarkan, ${r.jumlah.TIDAK_TEREALISASI} tidak terealisasi.`,
      // Lima teratas saja — `hasil.baris` sudah urut |varianceBase| menurun (K46).
      barisTeratas: hasil.baris
        .slice(0, 5)
        .map((b) => `${b.description}: ${b.epdaBase} → ${b.fdaBase} (${b.varianceBase})`),
    }
  } catch {
    return undefined
  }
}

async function konteksDisbursement(
  ctx: TenantContext,
  id: string,
  opsi: OpsiKonteks,
): Promise<KonteksAI> {
  const d = await getDisbursementDetail(ctx, id)
  // Nama kapal & pelabuhan tidak ada di dokumen; diambil lewat pintu yang sama
  // dengan UI (K76/1) — bukan lewat include ekstra di query sendiri.
  const v = await getVoyage(ctx, d.voyageId)

  const konteks: KonteksAI = {
    jenis: 'DISBURSEMENT',
    ringkas:
      `${d.kind} ${d.docNumber} (versi ${d.version}, status ${d.status}) untuk voyage ` +
      `${v.voyageNumber} — ${v.vessel?.name ?? 'kapal tak diketahui'} di ` +
      `${v.port?.name ?? 'pelabuhan belum ditentukan'}.`,
    fakta: rapikan({
      docNumber: d.docNumber,
      kind: d.kind,
      status: d.status,
      versi: d.version,
      catatanRevisi: d.revisionNote,
      baseCurrency: d.baseCurrency,
      agencyPct: angka(d.agencyPct),
      issuedAt: tgl(d.issuedAt),
      validUntil: tgl(d.validUntil),
      advanceReceived: angka(d.advanceReceived),
      jumlahBaris: d.items.length,
      voyageNumber: v.voyageNumber,
      kapal: v.vessel?.name ?? null,
      gt: angka(v.vessel?.gt ?? null),
      pelabuhan: v.port?.name ?? null,
      eta: tgl(v.eta),
      etb: tgl(v.etb),
      etd: tgl(v.etd),
      catatan: d.notes,
      catatanVoyage: v.notes,
    }),
    baris: barisDisbursement(d.items),
    total: {
      subtotal: d.hitung.subtotal,
      agency: d.hitung.agencyAmount,
      pajak: d.hitung.taxAmount,
      grandTotal: d.hitung.grandTotal,
      mataUang: d.baseCurrency,
    },
    warning: d.warnings.map((w) => ({ kode: w.kode, pesan: w.pesan })),
  }

  if (d.kind === 'FDA') {
    const variance = await varianceRingkas(ctx, d.id, d.baseCurrency)
    if (variance) konteks.variance = variance
  }

  if (opsi.sertakanPrediksi) {
    const prediksi = await prediksiUntukDisbursement(ctx, d.id, { bahasa: opsi.bahasa })
    konteks.prediksi = prediksi.map((p) => ({
      serviceCode: p.serviceCode,
      median: p.unitPrice?.median ?? p.unitPriceKatalog ?? 0,
      tier: p.tier,
      nNyata: p.dasar.nNyata,
    }))
  }

  if (opsi.sertakanAnomali) {
    const hasil = await anomaliUntukDisbursement(ctx, d.id, { bahasa: opsi.bahasa })
    konteks.anomali = hasil.anomali.map((a) => ({ kode: a.kode, pesan: a.pesan }))
  }

  return konteks
}

// ------------------------------------------------------------------- INVOICE

async function konteksInvoice(ctx: TenantContext, id: string): Promise<KonteksAI> {
  const inv = await getInvoiceDetail(ctx, id)

  return {
    jenis: 'INVOICE',
    ringkas:
      `Invoice ${inv.invoiceNumber} (status ${inv.status}) untuk ` +
      `${inv.customer?.name ?? 'pelanggan tak diketahui'}, tanggal ${tgl(inv.invoiceDate) ?? '-'}` +
      (tgl(inv.dueDate) ? `, jatuh tempo ${tgl(inv.dueDate)}` : '') +
      '.',
    fakta: rapikan({
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      // Nama saja. `customer` dari service memang membawa `npwp`/`address`,
      // dan tidak satu pun ikut ke sini — inilah gunanya pemetaan eksplisit.
      customer: inv.customer?.name ?? null,
      invoiceDate: tgl(inv.invoiceDate),
      dueDate: tgl(inv.dueDate),
      currency: inv.currency,
      amountPaid: angka(inv.amountPaid),
      outstanding: angka(inv.outstanding),
      jumlahBaris: inv.items.length,
      jumlahPembayaran: inv.payments.length,
      catatan: inv.notes,
    }),
    baris: inv.items.map((it) => ({
      deskripsi: it.description,
      qty: angka(it.quantity) ?? 0,
      unit: it.unit,
      harga: angka(it.unitPrice) ?? 0,
      jumlah: angka(it.amount) ?? 0,
    })),
    total: {
      subtotal: inv.subtotal,
      // Invoice tak punya komponen agency tersendiri (K47: ia mewarisi angka
      // FDA yang SUDAH memuatnya). Ditulis 0 apa adanya — bukan disembunyikan,
      // supaya bentuk `TotalKonteks` tetap satu untuk semua jenis.
      agency: 0,
      pajak: inv.taxAmount,
      grandTotal: inv.grandTotal,
      mataUang: inv.currency,
    },
  }
}

// ------------------------------------------------------------------ komentar

const MAKS_KOMENTAR = 10
const BATAS_KARAKTER_KOMENTAR = 500

/**
 * K129 — komentar (Catatan) entitas ini, lewat `listComments()` yang SAMA
 * dengan CommentPanel.tsx (K76/1: satu pintu, satu pagar K85 ikut otomatis).
 * 10 TERBARU, masing-masing `isi` dipotong 500 karakter. Komentar yang sudah
 * dihapus (`deleted`) dilewati — badan aslinya sudah diganti server dengan
 * penanda "komentar dihapus", tak ada nilai informasi untuk model.
 */
async function komentarUntukKonteks(
  ctx: TenantContext,
  jenis: JenisKonteks,
  id: string,
): Promise<KonteksAI['komentar']> {
  const semua = await listComments(ctx, jenis, id)
  const nyata = semua.filter((c) => !c.deleted)
  const terbaru = nyata.slice(-MAKS_KOMENTAR)
  if (terbaru.length === 0) return undefined

  return terbaru.map((c) => ({
    penulis: c.authorName ?? '—',
    waktu: c.createdAt.toISOString(),
    isi:
      c.body.length > BATAS_KARAKTER_KOMENTAR
        ? `${c.body.slice(0, BATAS_KARAKTER_KOMENTAR)}…`
        : c.body,
  }))
}

// ---------------------------------------------------------------------- inti

/**
 * Bangun `KonteksAI` untuk satu entitas yang sedang dibuka pengguna.
 *
 * `id` yang tak ada, milik tenant lain, atau bukan `jenis` yang diminta semuanya
 * jatuh ke NOT_FOUND — bukan karena diperiksa di sini, tapi karena pintunya
 * memang service yang sama dengan UI (K76/1). Meminta konteks VOYAGE dengan id
 * sebuah disbursement berarti `getVoyage()` tak menemukan apa pun, dan itu
 * jawaban yang benar.
 */
export async function bangunKonteks(
  ctx: TenantContext,
  jenis: JenisKonteks,
  id: string,
  opsi: OpsiKonteks = {},
): Promise<KonteksAI> {
  // K54/K33 — gerbang paling awal, sebelum satu query pun dibayar.
  await pastikanLanggananAktif(ctx)
  // Fase 8c / K156 — kuota panggilan AI, BERSEBELAHAN dengan gerbang langganan
  // di atas (K33). Dua pagar berdiri sendiri: langganan habis tetap menolak
  // meski kuota longgar, dan sebaliknya.
  await pastikanKuota(ctx, 'PANGGILAN_AI')

  if (!JENIS.includes(jenis)) {
    throw validation(`Jenis konteks tidak dikenal: ${String(jenis)}.`)
  }
  if (typeof id !== 'string' || id.trim() === '') {
    throw validation('id entitas wajib diisi.')
  }

  const bahasa = opsi.bahasa ?? 'id'
  const mentah =
    jenis === 'VOYAGE'
      ? await konteksVoyage(ctx, id)
      : jenis === 'DISBURSEMENT'
        ? await konteksDisbursement(ctx, id, { ...opsi, bahasa })
        : await konteksInvoice(ctx, id)

  // K129 — komentar entitas ini, sesudah bentuk pokoknya siap (butuh id yang
  // sudah terbukti sah lewat konteksVoyage/Disbursement/Invoice di atas —
  // meski di sini id yang sama dipakai lagi, listComments() membuktikan
  // kepemilikannya sendiri lewat pastikanEntitasMilikTenant, K85).
  const komentar = await komentarUntukKonteks(ctx, jenis, id)
  if (komentar) mentah.komentar = komentar

  // K76/3 — pemotongan deterministik + catatan, lewat modul murni 6b.
  return potongKonteks(mentah, { anggaranKarakter: opsi.anggaranKarakter, bahasa })
}
