// CRUD header Disbursement + mesin status + hitung ulang total.
// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
//
// Semua rumus & aturan transisi dipanggil dari modul MURNI 3a (calc-engine.ts,
// totals.ts, disbursement-status.ts). Tak ada aritmatika uang maupun tabel
// transisi kedua di berkas ini — kalau ada, salah satunya akan basi.

import type {
  Cargo,
  Disbursement,
  DisbursementItem,
  DisbursementKind,
  DisbursementStatus,
  Vessel,
  Voyage,
} from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { conflict, notFound, validation } from '../errors'
import { num, pilihan, str, tanggal, wajib } from '../input'
import { forTenant } from '../tenant-db'
import { pastikanLanggananAktif } from '../subscription'
import {
  bulatkan,
  hitungBaris,
  usulKuantitas,
  warningPemblokir,
  type CalcWarning,
  type KonteksVoyage,
  type Pelanggaran,
} from './calc-engine'
import { hitungTotal, type BarisTotal, type HasilBarisTotal, type OpsiTotal } from './totals'
import {
  bolehRevisi,
  bolehTransisiUntukKind,
  bolehUbahItem,
  butuhSyaratSubmit,
  transisiTersedia,
} from './disbursement-status'
import { KODE_AGENCY_FEE, type VoyageUntukAutofill } from './autofill.service'
import { nextDisbursementNumber } from './disbursement-number'
import { catatAudit, type Jejak } from './audit'
import { notify } from '../notification.service'
import { stempelAsal } from '../ai/origin.service'
// Fase 8j — pemakaian (K183/K184).
import { catatPemakaian } from '../saas/usage.service'

const KINDS: readonly DisbursementKind[] = ['EPDA', 'FPDA', 'FDA']

const STATUSES: readonly DisbursementStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'SENT',
  'REVISION_REQUESTED',
  'REVISED',
  'FINAL',
  'CLOSED',
  'CANCELLED',
]

export type DisbursementWithItems = Disbursement & { items: DisbursementItem[] }

export type RingkasanHitung = {
  subtotal: number
  basisPersen: number
  perSeksi: Record<string, number>
  agencyAmount: number
  taxAmount: number
  grandTotal: number
}

export type DisbursementDetail = DisbursementWithItems & {
  hitung: RingkasanHitung
  /** Tidak disimpan — diturunkan ulang setiap kali diminta (K12/K13). */
  warnings: CalcWarning[]
  pelanggaran: Pelanggaran[]
  transisiTersedia: readonly DisbursementStatus[]
  bolehUbahItem: boolean
  /** K37 — hanya SENT. Satu sumber di disbursement-status.ts, dipakai UI utk tombol "Buat Revisi". */
  bolehRevisi: boolean
}

const ITEM_ORDER = [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }]

// ------------------------------------------------------------------- pembacaan

export async function muatVoyage(
  ctx: TenantContext,
  voyageId: string,
): Promise<VoyageUntukAutofill> {
  const voyage = await forTenant(ctx).voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    include: { vessel: true, cargoes: true },
  })
  if (!voyage) throw notFound('Voyage')
  return voyage as Voyage & { vessel: Vessel | null; cargoes: Cargo[] }
}

/**
 * Pintu masuk WAJIB untuk semua akses item (K44 aturan 1). Baris milik tenant lain
 * jatuh ke NOT_FOUND karena `forTenant` menyuntikkan tenantId ke `where` —
 * `DisbursementItem` sendiri TIDAK dijaga guard (model anak), jadi pagar
 * satu-satunya adalah lewat induk ini.
 */
export async function getDisbursement(
  ctx: TenantContext,
  id: string,
): Promise<DisbursementWithItems> {
  const disb = await forTenant(ctx).disbursement.findFirst({
    where: { id, deletedAt: null },
    include: { items: { orderBy: ITEM_ORDER } },
  })
  if (!disb) throw notFound('Disbursement')
  return disb
}

export async function listDisbursements(ctx: TenantContext, voyageId: string) {
  await muatVoyage(ctx, voyageId)
  return forTenant(ctx).disbursement.findMany({
    where: { voyageId, deletedAt: null },
    orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    include: { _count: { select: { items: true } } },
  })
}

// -------------------------------------------------------------- bahan hitungan

/** `Currency.decimals` per kode. Mata uang tak terdaftar → VALIDATION, bukan asal 2 (K23). */
async function petaDesimal(ctx: TenantContext): Promise<Map<string, number>> {
  const rows = await forTenant(ctx).currency.findMany({ select: { code: true, decimals: true } })
  return new Map(rows.map((r) => [r.code.toUpperCase(), r.decimals]))
}

/**
 * Tarif pajak atas `agencyAmount` (K22). Dibaca DARI DATA — tak ada angka 11 atau
 * 12 di dalam kode. Hasilnya ikut ter-snapshot lewat kolom `Disbursement.taxAmount`
 * yang ditulis setiap kali dokumen dihitung ulang.
 */
async function pajakAgency(ctx: TenantContext): Promise<number | null> {
  const svc = await forTenant(ctx).serviceCatalog.findFirst({
    where: { serviceCode: KODE_AGENCY_FEE, deletedAt: null },
    select: { taxable: true, taxPct: true },
  })
  return svc?.taxable ? svc.taxPct : null
}

async function bahanHitung(
  ctx: TenantContext,
  disb: DisbursementWithItems,
): Promise<{ baris: BarisTotal[]; opsi: OpsiTotal }> {
  const desimal = await petaDesimal(ctx)
  const decimalsBase = desimal.get(disb.baseCurrency.toUpperCase())
  if (decimalsBase === undefined) {
    throw validation(
      `Mata uang dasar ${disb.baseCurrency} belum terdaftar di Master › Mata Uang (jumlah desimalnya tak diketahui).`,
    )
  }

  const baris: BarisTotal[] = disb.items.map((it) => ({
    calcMethod: it.calcMethod,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    minCharge: it.minCharge,
    decimals: desimal.get(it.currency.toUpperCase()) ?? null,
    exchangeRate: it.exchangeRate,
    decimalsBase,
    taxable: it.taxable,
    taxPct: it.taxPct,
    sectionLetter: it.sectionLetter,
    itemId: it.id,
  }))

  return {
    baris,
    opsi: { agencyPct: disb.agencyPct, decimalsBase, agencyTaxPct: await pajakAgency(ctx) },
  }
}

const KONTEKS_KOSONG: KonteksVoyage = {
  gt: null,
  nrt: null,
  etmal: null,
  calls: 1,
  cargoTon: null,
  basisPersen: 0,
}

/**
 * Warning pemblokir yang diturunkan ULANG dari kolom tersimpan (K12 + K16-2).
 *
 * Warning autofill (tarif/GT/etmal/ton hilang) lahir saat baris DIBUAT dan tak
 * punya kolom penyimpanan — padahal pagar submit (K34) harus tetap bekerja lama
 * sesudah request itu selesai. Karena itu kondisinya dibaca ulang dari kolom yang
 * memang ada:
 *   - `quantity = 0` → konteks voyage yang dibutuhkan `calcMethod` ini hilang,
 *   - `unitPrice = 0` pada baris non-MANUAL → tarifnya belum ada (K14: MANUAL
 *     memang tidak pernah di-autofill, jadi ia tidak pernah "kehilangan tarif").
 *
 * "Metode mana butuh GT/etmal/ton" TIDAK didaftar ulang di sini: daftarnya dibaca
 * dari mesin dengan menjalankan `usulKuantitas()` atas konteks kosong, supaya
 * pengetahuan itu tetap hanya hidup di calc-engine.ts.
 */
function warningDokumen(
  items: readonly DisbursementItem[],
  baris: readonly HasilBarisTotal[],
): CalcWarning[] {
  const warnings: CalcWarning[] = []

  items.forEach((it, i) => {
    // Baris PERCENTAGE kuantitasnya fungsi dari baris lain, jadi yang dinilai
    // adalah hasil hitungan, bukan nilai tersimpan.
    const quantity = baris[i]?.quantity ?? it.quantity

    if (quantity === 0) {
      for (const w of usulKuantitas(it.calcMethod, KONTEKS_KOSONG).warnings) {
        warnings.push({ ...w, itemId: it.id })
      }
    }
    if (it.unitPrice === 0 && it.calcMethod !== 'MANUAL') {
      warnings.push({
        kode: 'TARIF_TIDAK_ADA',
        pesan: `Tarif untuk "${it.description}" masih 0 — isi di Master › Tarif atau isi harga satuan pada baris ini.`,
        itemId: it.id,
      })
    }
  })

  return warnings
}

function ringkas(hasil: ReturnType<typeof hitungTotal>): RingkasanHitung {
  return {
    subtotal: hasil.subtotal,
    basisPersen: hasil.basisPersen,
    perSeksi: hasil.perSeksi,
    agencyAmount: hasil.agencyAmount,
    taxAmount: hasil.taxAmount,
    grandTotal: hasil.grandTotal,
  }
}

/**
 * Hitung ulang + SIMPAN (dipakai setiap kali item/agencyPct berubah).
 *
 * Nilai server yang menang (K11): apa pun yang dikirim klien sebagai `amount`
 * diabaikan — `amount`/`amountBase`/`taxAmount` selalu ditulis dari hasil mesin.
 * `quantity` juga ditulis balik untuk baris PERCENTAGE supaya invarian K13 utuh.
 */
export async function hitungUlang(
  ctx: TenantContext,
  id: string,
): Promise<{ disb: DisbursementWithItems; hitung: RingkasanHitung; warnings: CalcWarning[] }> {
  const disb = await getDisbursement(ctx, id)
  const { baris, opsi } = await bahanHitung(ctx, disb)
  const hasil = hitungTotal(baris, opsi, { hitungBaris, bulatkan })

  if (hasil.pelanggaran.length > 0) {
    throw validation(hasil.pelanggaran[0].pesan, { pelanggaran: hasil.pelanggaran })
  }

  const db = forTenant(ctx)

  for (let i = 0; i < disb.items.length; i++) {
    const item = disb.items[i]
    const r = hasil.baris[i]
    const sama =
      r.amount === item.amount &&
      r.amountBase === item.amountBase &&
      (r.taxAmount ?? null) === (item.taxAmount ?? null) &&
      r.quantity === item.quantity
    if (sama) continue
    // K44 aturan 2: disbursementId SELALU ikut di where, walau id sudah diketahui.
    await db.disbursementItem.updateMany({
      where: { id: item.id, disbursementId: disb.id },
      data: {
        quantity: r.quantity,
        amount: r.amount,
        amountBase: r.amountBase,
        taxAmount: r.taxAmount,
      },
    })
  }

  await db.disbursement.updateMany({
    where: { id: disb.id },
    data: {
      subtotal: hasil.subtotal,
      agencyAmount: hasil.agencyAmount,
      taxAmount: hasil.taxAmount,
      grandTotal: hasil.grandTotal,
    },
  })

  return {
    disb,
    hitung: ringkas(hasil),
    warnings: [...hasil.warnings, ...warningDokumen(disb.items, hasil.baris)],
  }
}

/**
 * Bentuk lengkap untuk API. Sengaja TIDAK menulis apa pun: sebuah GET tak boleh
 * mengubah data, dan dokumen yang datanya bermasalah harus tetap bisa DIBACA
 * supaya operator bisa memperbaikinya (karena itu `pelanggaran` dikembalikan,
 * bukan dilempar).
 */
export async function getDisbursementDetail(
  ctx: TenantContext,
  id: string,
): Promise<DisbursementDetail> {
  const disb = await getDisbursement(ctx, id)
  const { baris, opsi } = await bahanHitung(ctx, disb)
  const hasil = hitungTotal(baris, opsi, { hitungBaris, bulatkan })

  return {
    ...disb,
    hitung: ringkas(hasil),
    warnings: [...hasil.warnings, ...warningDokumen(disb.items, hasil.baris)],
    pelanggaran: hasil.pelanggaran,
    transisiTersedia: transisiTersedia(disb.kind, disb.status),
    bolehUbahItem: bolehUbahItem(disb.status),
    bolehRevisi: bolehRevisi(disb.status),
  }
}

/** Basis lintasan 1 (K20) dari baris yang SUDAH tersimpan — bekal autofill baris persen baru. */
export function basisPersenTersimpan(disb: DisbursementWithItems): number {
  return disb.items.reduce(
    (jml, it) => (it.calcMethod === 'PERCENTAGE' ? jml : jml + it.amountBase),
    0,
  )
}

/** K36 — satu fungsi, satu tempat. CONFLICT (bukan FORBIDDEN): ini soal keadaan dokumen, bukan hak pengguna. */
export function pastikanBolehUbah(disb: Pick<Disbursement, 'status'>): void {
  if (bolehUbahItem(disb.status)) return
  throw conflict(
    `Dokumen ber-status ${disb.status} tidak bisa diubah. Buat revisi (versi baru) atau minta revisi.`,
  )
}

// ----------------------------------------------------------------------- tulis

export async function createDisbursement(
  ctx: TenantContext,
  voyageId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  // K33 — extension lama hanya menjaga maritimeDocument.create; tanpa baris ini
  // tenant yang langganannya habis tetap bisa menerbitkan EPDA.
  await pastikanLanggananAktif(ctx)

  const db = forTenant(ctx)
  const voyage = await muatVoyage(ctx, voyageId)
  const kind = pilihan(body.kind, KINDS, 'Jenis dokumen', 'EPDA')

  const tenant = await db.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { defaultAgencyPct: true },
  })

  const agencyPct = num(body.agencyPct) ?? tenant?.defaultAgencyPct ?? 2.5
  if (agencyPct < 0) throw validation('Persentase agency fee tidak boleh negatif.')

  const docNumber = await nextDisbursementNumber(ctx, kind)

  // Fase 6a / K56 — cap asal ditempel SAAT baris dibuat (snapshot). Asal
  // EFEKTIF dokumen ini tetap dibatasi asal voyage induknya (K58) saat dibaca;
  // yang disimpan di sini adalah asal dokumennya sendiri.
  const dataOrigin = await stempelAsal(ctx)

  const dibuat = await db.disbursement.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId,
      kind,
      docNumber,
      dataOrigin,
      // K31 — diwarisi Voyage, lalu dibekukan begitu ada item.
      baseCurrency: voyage.baseCurrency,
      agencyPct,
      status: 'DRAFT',
      validUntil: tanggal(body.validUntil),
      notes: str(body.notes),
      advanceReceived: num(body.advanceReceived),
    },
  })

  // K37 — V1: rootId = id dirinya sendiri. Diisi eksplisit (bukan dibiarkan null)
  // supaya query rumpun revisi nanti tak butuh OR.
  await db.disbursement.updateMany({ where: { id: dibuat.id }, data: { rootId: dibuat.id } })

  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: dibuat.id,
      action: 'CREATE',
      newValue: { docNumber, kind, voyageId, baseCurrency: dibuat.baseCurrency, agencyPct },
    },
    jejak,
  )

  return getDisbursementDetail(ctx, dibuat.id)
}

type PatchHeader = {
  notes?: string | null
  validUntil?: Date | null
  revisionNote?: string | null
  advanceReceived?: number | null
  agencyPct?: number
  baseCurrency?: string
}

/** Header ringan + `agencyPct` (K36). Hanya field yang benar-benar dikirim yang disentuh. */
export async function updateDisbursement(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const disb = await getDisbursement(ctx, id)
  pastikanBolehUbah(disb)

  const data: PatchHeader = {}
  const lama: Record<string, unknown> = {}

  if ('notes' in body) {
    data.notes = str(body.notes)
    lama.notes = disb.notes
  }
  if ('validUntil' in body) {
    data.validUntil = tanggal(body.validUntil)
    lama.validUntil = disb.validUntil
  }
  if ('revisionNote' in body) {
    data.revisionNote = str(body.revisionNote)
    lama.revisionNote = disb.revisionNote
  }
  if ('advanceReceived' in body) {
    data.advanceReceived = num(body.advanceReceived)
    lama.advanceReceived = disb.advanceReceived
  }
  if ('agencyPct' in body) {
    const pct = num(body.agencyPct)
    if (pct === null || pct < 0) throw validation('Persentase agency fee harus angka ≥ 0.')
    data.agencyPct = pct
    lama.agencyPct = disb.agencyPct
  }
  if ('baseCurrency' in body) {
    // K31 — sesudah ada item, mengubahnya berarti menghitung ulang seluruh
    // snapshot, yaitu membuang alasan adanya snapshot. Buat dokumen baru.
    if (disb.status !== 'DRAFT' || disb.items.length > 0) {
      throw conflict(
        'Mata uang dasar hanya bisa diubah selagi dokumen DRAFT dan belum punya baris. Buat dokumen baru bila mata uang dasarnya salah.',
      )
    }
    data.baseCurrency = wajib(str(body.baseCurrency), 'Mata uang dasar').toUpperCase()
    lama.baseCurrency = disb.baseCurrency
  }

  if (Object.keys(data).length === 0) return getDisbursementDetail(ctx, id)

  const hasil = await forTenant(ctx).disbursement.updateMany({ where: { id }, data })
  if (hasil.count === 0) throw notFound('Disbursement')

  await catatAudit(
    ctx,
    { tableName: 'Disbursement', recordId: id, action: 'UPDATE', oldValue: lama, newValue: data },
    jejak,
  )

  // agencyPct & baseCurrency menyentuh uang → total wajib disegarkan.
  await hitungUlang(ctx, id)
  return getDisbursementDetail(ctx, id)
}

/**
 * Hapus = soft delete (aturan #4 POLA-SERVICE-LAYER.md), dan hanya untuk DRAFT
 * yang belum pernah punya item — semangatnya sama dengan `removeVoyage()`.
 * `CANCELLED` ≠ hapus (K34): dokumen yang sudah punya isi dibatalkan, bukan dihapus.
 */
export async function removeDisbursement(
  ctx: TenantContext,
  id: string,
  jejak: Jejak = {},
): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const disb = await getDisbursement(ctx, id)

  if (disb.status !== 'DRAFT') {
    throw conflict(
      `Hanya dokumen DRAFT yang bisa dihapus. Dokumen ber-status ${disb.status} dibatalkan lewat status CANCELLED.`,
    )
  }
  if (disb.items.length > 0) {
    throw conflict(
      `Dokumen ini sudah punya ${disb.items.length} baris biaya. Ubah statusnya ke CANCELLED, jangan dihapus.`,
    )
  }

  const hasil = await forTenant(ctx).disbursement.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
  if (hasil.count === 0) throw notFound('Disbursement')

  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: id,
      action: 'DELETE',
      oldValue: { status: disb.status, docNumber: disb.docNumber },
    },
    jejak,
  )
}

/**
 * Transisi status (K34/K35). Tabel transisinya ada di `disbursement-status.ts` —
 * apa pun yang tak tercantum di sana ditolak di sini.
 */
export async function setDisbursementStatus(
  ctx: TenantContext,
  id: string,
  tujuan: unknown,
  jejak: Jejak = {},
): Promise<DisbursementDetail> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'PENYUSUN_BIAYA')
  const ke = pilihan(tujuan, STATUSES, 'Status tujuan')
  const disb = await getDisbursement(ctx, id)

  // Fase 5e — celah ditemukan saat merumuskan role: graf K34 (disbursement-status.ts)
  // TEKNIS mengizinkan PENDING_REVIEW → APPROVED lewat endpoint status generik
  // ini, padahal UI sengaja menyembunyikannya (DisbursementBuilder.tsx
  // GENERIC_TARGETS) — APPROVED cuma boleh lewat proses approval berjenjang
  // (putuskanApproval() di approval.service.ts, digerbangi bolehMemutuskan()).
  // Tanpa baris ini, siapa pun ber-requireRole di sini (kini termasuk
  // PENYUSUN_BIAYA) bisa menyetujui dokumennya sendiri tanpa jejak Approval.
  if (ke === 'APPROVED') {
    throw conflict('Transisi ke APPROVED hanya lewat proses approval, bukan endpoint status ini.')
  }

  if (!bolehTransisiUntukKind(disb.kind, disb.status, ke)) {
    throw conflict(
      `Transisi ${disb.status} → ${ke} tidak diizinkan untuk ${disb.kind}. Yang tersedia: ` +
        `${transisiTersedia(disb.kind, disb.status).join(', ') || '(tidak ada — status terminal)'}.`,
    )
  }

  // K33 — gating dipasang pada yang MENAIKKAN status. Membatalkan dokumen tetap
  // boleh walau langganan habis: menahannya hanya menyandera data operator.
  if (ke !== 'CANCELLED') await pastikanLanggananAktif(ctx)

  if (butuhSyaratSubmit(disb.status, ke)) {
    if (disb.items.length === 0) {
      throw validation('Dokumen belum punya satu pun baris biaya — tak ada yang bisa direview.')
    }
    const { hitung, warnings } = await hitungUlang(ctx, id)
    const pemblokir = warningPemblokir(warnings)
    if (pemblokir.length > 0) {
      throw validation(
        `Masih ada ${pemblokir.length} peringatan pemblokir yang harus dibereskan lebih dulu: ` +
          `${pemblokir.map((w) => w.kode).join(', ')}.`,
        { warnings: pemblokir },
      )
    }
    if (!(hitung.grandTotal > 0)) {
      throw validation('Total dokumen masih 0 — periksa kuantitas dan harga satuan tiap baris.')
    }
  }

  // K34 — "tarik kembali" hanya selagi belum ada keputusan approval atas versi ini.
  if (disb.status === 'PENDING_REVIEW' && ke === 'DRAFT') {
    const sudahDinilai = await forTenant(ctx).approval.count({
      where: { entityType: 'DISBURSEMENT', entityId: id },
    })
    if (sudahDinilai > 0) {
      throw conflict(
        'Sudah ada keputusan approval pada versi ini — tidak bisa ditarik kembali. Minta revisi saja.',
      )
    }
  }

  // K47 — satu-satunya hal yang berkas ini tahu soal Invoice (docs/FASE-3-EPDA-ENGINE.md
  // §10): FDA yang sudah dipakai membuat Invoice AKTIF (belum lunas/batal) tak boleh
  // berpindah status lagi — TANPA impor modul invoice, cukup count() langsung ke tabel
  // Invoice supaya arah ketergantungan Fase 4 → Fase 3 tetap satu arah. Begitu Invoice-nya
  // PAID atau CANCELLED, FDA ini boleh ditutup lagi (mis. FINAL → CLOSED).
  if (disb.status === 'FINAL') {
    const invoiceAktif = await forTenant(ctx).invoice.count({
      where: { sourceDisbursementId: id, deletedAt: null, status: { notIn: ['PAID', 'CANCELLED'] } },
    })
    if (invoiceAktif > 0) {
      throw conflict(
        'FDA ini sudah dipakai membuat Invoice yang belum lunas/batal — selesaikan atau batalkan Invoice-nya dulu sebelum mengubah status dokumen ini.',
      )
    }
  }

  const hasil = await forTenant(ctx).disbursement.updateMany({
    where: { id, deletedAt: null },
    data: { status: ke },
  })
  if (hasil.count === 0) throw notFound('Disbursement')

  // Setiap transisi menulis satu baris AuditLog — K42 memakai jejak ini untuk
  // mengetahui kapan ronde approval terakhir di-reset.
  await catatAudit(
    ctx,
    {
      tableName: 'Disbursement',
      recordId: id,
      action: 'UPDATE',
      oldValue: { status: disb.status },
      newValue: { status: ke },
    },
    jejak,
  )

  if (ke === 'PENDING_REVIEW') {
    await notify(ctx, {
      type: 'APPROVAL_PENDING',
      title: `${disb.docNumber} diajukan untuk review`,
      entityType: 'DISBURSEMENT',
      entityId: id,
      href: `/voyages/${disb.voyageId}/disbursements/${id}`,
    })
  }

  // Fase 8j / K183 — "dikirim ke principal" adalah nilai inti EPDA/FDA;
  // EPDA dan FDA berbagi satu nama peristiwa (kind di meta) karena keduanya
  // model Disbursement yang sama, hanya bedanya kind.
  if (ke === 'SENT') {
    await catatPemakaian(ctx, 'DISBURSEMENT_SENT', { kind: disb.kind })
  }

  return getDisbursementDetail(ctx, id)
}
