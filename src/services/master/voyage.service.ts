// Pola meniru port.service.ts (⭐ MODUL RUJUKAN) — lihat docs/POLA-SERVICE-LAYER.md.
// Fase 2: Voyage = hub (1 voyage = folder digital: PortCall, Cargo, Disbursement,
// Invoice, dokumen). Modul ini baru CRUD + penomoran; Voyage Workspace (UI yang
// menyatukan semuanya) dibangun terpisah di atas service ini.

import type {
  Cargo, Customer, Port, PortCall, Principal, Vessel, Voyage, VoyageStatus,
} from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, notFound } from '../errors'
import { pilihan, str, tanggal, wajib } from '../input'
import { stempelAsal } from '../ai/origin.service'
// Fase 7c — dua kait tugas. Keduanya ADITIF: bentuk kembalian, pagar peran, dan
// perilaku createVoyage/updateVoyage untuk pemanggil yang tak menyentuh tanggal
// tidak berubah sedikit pun.
import { instansiasiOtomatisChecklist } from '../ops/task-template.service'
import { sinkronkanJadwalTugas, tanggalJangkarBerubah } from '../ops/task-schedule.service'
// Fase 7g — Timeline (K131) butuh perubahan status voyage TERCATAT di
// AuditLog, persis pola Disbursement/Invoice (services/finance/audit.ts sudah
// dipakai lintas-domain sejak Fase 7b/7c, bukan hal baru di sini).
import { catatAudit } from '../finance/audit'

const STATUSES: readonly VoyageStatus[] = [
  'PLANNED', 'CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING', 'COMPLETED', 'DEPARTED', 'CLOSED', 'CANCELLED',
]

export type VoyageListRow = Voyage & {
  vessel: Pick<Vessel, 'id' | 'name' | 'imoNumber'> | null
  principal: Pick<Principal, 'id' | 'name'> | null
  customer: Pick<Customer, 'id' | 'name'> | null
  port: Pick<Port, 'id' | 'name' | 'unlocode'> | null
}

export type VoyageDetail = Voyage & {
  vessel: Vessel | null
  principal: Principal | null
  customer: Customer | null
  port: Port | null
  cargoes: Cargo[]
  portCalls: PortCall[]
  /** Cuma jumlah: panel finansial Workspace masih placeholder sampai Fase 3/4. */
  _count: { disbursements: number; invoices: number; documents: number }
}

export type VoyageInput = ReturnType<typeof bacaInput>

function bacaInput(body: Record<string, unknown>) {
  return {
    vesselId: wajib(str(body.vesselId), 'Kapal'),
    principalId: str(body.principalId),
    customerId: str(body.customerId),
    portId: str(body.portId),
    agencyType: str(body.agencyType),
    status: pilihan(body.status, STATUSES, 'Status', 'PLANNED'),
    eta: tanggal(body.eta),
    etb: tanggal(body.etb),
    etc: tanggal(body.etc),
    etd: tanggal(body.etd),
    ata: tanggal(body.ata),
    atb: tanggal(body.atb),
    atd: tanggal(body.atd),
    baseCurrency: str(body.baseCurrency)?.toUpperCase() ?? 'IDR',
    notes: str(body.notes),
  }
}

/** vesselId wajib, principalId/customerId/portId opsional — semua diverifikasi milik tenant ini. */
async function pastikanRelasiMilikTenant(
  ctx: TenantContext,
  data: Pick<VoyageInput, 'vesselId' | 'principalId' | 'customerId' | 'portId'>,
): Promise<void> {
  const db = forTenant(ctx)
  const vessel = await db.vessel.findFirst({ where: { id: data.vesselId }, select: { id: true } })
  if (!vessel) throw notFound('Kapal')
  if (data.principalId) {
    const p = await db.principal.findFirst({ where: { id: data.principalId }, select: { id: true } })
    if (!p) throw notFound('Principal')
  }
  if (data.customerId) {
    const c = await db.customer.findFirst({ where: { id: data.customerId, deletedAt: null }, select: { id: true } })
    if (!c) throw notFound('Customer')
  }
  if (data.portId) {
    const port = await db.port.findFirst({ where: { id: data.portId, deletedAt: null }, select: { id: true } })
    if (!port) throw notFound('Pelabuhan')
  }
}

/**
 * Nomor voyage berikutnya: VYG-YYYY-NNNNNN, berurutan per tenant per tahun
 * (tahun = saat voyage dibuat). Pola sama dengan `prisma/backfill-v2.mjs`.
 * Tanpa unique-constraint/lock — risiko tabrakan diterima sejalan dengan
 * penomoran dokumen (`lib/doc-number.ts`): app dipakai satu operator sekaligus.
 */
async function nextVoyageNumber(ctx: TenantContext): Promise<string> {
  const db = forTenant(ctx)
  const year = new Date().getFullYear()
  const prefix = `VYG-${year}-`
  const terakhir = await db.voyage.findFirst({
    where: { voyageNumber: { startsWith: prefix } },
    orderBy: { voyageNumber: 'desc' },
    select: { voyageNumber: true },
  })
  const seq = terakhir ? Number(terakhir.voyageNumber.slice(prefix.length)) : 0
  return `${prefix}${String(seq + 1).padStart(6, '0')}`
}

export async function listVoyages(
  ctx: TenantContext,
  opts: { status?: VoyageStatus | null; vesselId?: string | null; cari?: string | null } = {},
): Promise<VoyageListRow[]> {
  const db = forTenant(ctx)
  const cari = opts.cari?.trim()
  return db.voyage.findMany({
    where: {
      deletedAt: null,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.vesselId ? { vesselId: opts.vesselId } : {}),
      ...(cari ? { voyageNumber: { contains: cari, mode: 'insensitive' } } : {}),
    },
    include: {
      vessel: { select: { id: true, name: true, imoNumber: true } },
      principal: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      port: { select: { id: true, name: true, unlocode: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getVoyage(ctx: TenantContext, id: string): Promise<VoyageDetail> {
  const db = forTenant(ctx)
  const voyage = await db.voyage.findFirst({
    where: { id, deletedAt: null },
    include: {
      vessel: true,
      principal: true,
      customer: true,
      port: true,
      cargoes: { orderBy: { createdAt: 'asc' } },
      portCalls: { orderBy: [{ eta: 'asc' }, { createdAt: 'asc' }] },
      _count: { select: { disbursements: true, invoices: true, documents: true } },
    },
  })
  if (!voyage) throw notFound('Voyage')
  return voyage
}

export async function createVoyage(ctx: TenantContext, body: Record<string, unknown>): Promise<Voyage> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanRelasiMilikTenant(ctx, data)
  const voyageNumber = await nextVoyageNumber(ctx)

  // Fase 6a / K56 — cap asal ditempel SAAT baris dibuat (snapshot), bukan
  // disimpulkan saat query. Satu baris; artinya seluruhnya di ai/provenance.ts.
  const dataOrigin = await stempelAsal(ctx)

  const voyage = await db.voyage.create({
    data: { ...data, dataOrigin, voyageNumber, tenantId: ctx.tenantId },
  })

  // K95 pintu 1 — checklist otomatis, SEKALI, saat voyage lahir dan hanya bila
  // pelabuhannya sudah diketahui. Tidak ada template yang cocok → tidak terjadi
  // apa-apa, tanpa galat. Kegagalan apa pun di dalamnya ditelan di sana (lihat
  // instansiasiOtomatisChecklist): voyage yang sudah lahir tidak boleh dibatalkan
  // gara-gara checklist, dan pemanggil lama tetap menerima baris Voyage yang sama.
  await instansiasiOtomatisChecklist(ctx, voyage)

  return voyage
}

export async function updateVoyage(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<Voyage> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const db = forTenant(ctx)
  const data = bacaInput(body)

  await pastikanRelasiMilikTenant(ctx, data)

  // K94 — tanggal SEBELUM disunting, dibaca lebih dulu supaya bisa dibandingkan
  // sesudahnya. Satu query tambahan, dan ia membeli hal yang tak bisa dibeli
  // dengan cara lain: kepastian bahwa pergeseran jadwal hanya berjalan saat
  // tanggal MEMANG berubah. Tanpa perbandingan ini, mengganti catatan atau
  // customer akan menerbitkan baris audit "jadwal tugas digeser" yang bohong.
  const sebelum = await db.voyage.findFirst({
    where: { id, deletedAt: null },
    select: { eta: true, etb: true, etc: true, etd: true, ata: true },
  })
  if (!sebelum) throw notFound('Voyage')

  // voyageNumber TIDAK ikut diubah — nomor sekali terbit dipertahankan (dipakai
  // di PDF/rujukan lain), sejalan prinsip snapshot K5.
  const hasil = await db.voyage.updateMany({ where: { id, deletedAt: null }, data })
  if (hasil.count === 0) throw notFound('Voyage')

  // K94 — SATU tempat yang menggerakkan tenggat tugas: di sini, sesudah
  // perubahan tanggal tersimpan. Bukan trigger database, bukan job terjadwal.
  // Kegagalannya sengaja TIDAK menggagalkan penyuntingan voyage: voyage adalah
  // tulang punggung aplikasi dan urusan tugas tidak boleh menghentikannya (K96).
  if (tanggalJangkarBerubah(sebelum, data)) {
    try {
      await sinkronkanJadwalTugas(ctx, id)
    } catch (e) {
      console.error('[voyage] sinkronisasi jadwal tugas gagal:', e)
    }
  }

  return getVoyage(ctx, id)
}

/** Hapus = soft delete. Ditolak bila sudah punya aktivitas — pakai status CANCELLED, bukan hapus. */
export async function removeVoyage(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const db = forTenant(ctx)

  const [portCallCount, cargoCount, disbCount, invoiceCount, docCount, taskCount] = await Promise.all([
    db.portCall.count({ where: { voyageId: id } }),
    db.cargo.count({ where: { voyageId: id } }),
    db.disbursement.count({ where: { voyageId: id } }),
    db.invoice.count({ where: { voyageId: id } }),
    db.maritimeDocument.count({ where: { voyageId: id } }),
    // Fase 7c — Task ikut dihitung sebagai aktivitas (§18/7c butir 12: "tetapkan
    // satu"). Yang DIPILIH: menolak, persis pola yang sudah berlaku di sini,
    // bukan ikut men-soft-delete tugasnya.
    //
    // Alasannya: satu voyage ber-checklist memuat pekerjaan yang mungkin sudah
    // dikerjakan orang (`completedAt` terisi, dan itulah bahan SLA K100). Menghapus
    // voyage-nya diam-diam akan menguburkan penilaian pekerjaan itu tanpa ada
    // yang menyadarinya; menolak dengan pesan jelas membuat operator memilih
    // sadar antara CANCELLED (yang mempertahankan semuanya) atau menghapus
    // tugasnya lebih dulu. Ini BUKAN pelanggaran K96 — K96 melarang tugas
    // memblokir TRANSISI STATUS Voyage/Disbursement/Invoice, dan penghapusan
    // bukan transisi status; setVoyageStatus() sengaja tidak disentuh sama sekali.
    db.task.count({ where: { voyageId: id, deletedAt: null } }),
  ])
  const dipakai = portCallCount + cargoCount + disbCount + invoiceCount + docCount + taskCount
  if (dipakai > 0) {
    throw conflict(
      `Voyage ini sudah punya ${dipakai} aktivitas (port call/cargo/disbursement/invoice/dokumen/tugas). Ubah status ke CANCELLED, jangan dihapus.`,
    )
  }

  const hasil = await db.voyage.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), status: 'CANCELLED' },
  })
  if (hasil.count === 0) throw notFound('Voyage')
}

/** Ganti status saja — dipisah dari update() supaya transisi lifecycle tak perlu kirim ulang semua field. */
export async function setVoyageStatus(
  ctx: TenantContext,
  id: string,
  status: string,
): Promise<Voyage> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  const nilai = pilihan(status, STATUSES, 'Status')
  const db = forTenant(ctx)

  const lama = await db.voyage.findFirst({ where: { id, deletedAt: null }, select: { status: true } })
  if (!lama) throw notFound('Voyage')

  const hasil = await db.voyage.updateMany({ where: { id, deletedAt: null }, data: { status: nilai } })
  if (hasil.count === 0) throw notFound('Voyage')

  // K131 — sumber TIMELINE "perubahan status". Ditulis hanya saat statusnya
  // BENAR berubah (bukan PATCH dengan nilai sama), sama semangatnya dengan
  // pengecekan tanggalJangkarBerubah() di updateVoyage() di bawah.
  if (lama.status !== nilai) {
    await catatAudit(ctx, {
      tableName: 'Voyage',
      recordId: id,
      action: 'UPDATE',
      oldValue: { status: lama.status },
      newValue: { status: nilai },
    })
  }

  return getVoyage(ctx, id)
}
