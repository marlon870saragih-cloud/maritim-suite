// Kalender (K134-K135, Fase 7h) — TAMPILAN atas enam sumber tanggal yang
// sudah ada, TIDAK ADA tabel CalendarEvent. Sejalan timeline.service.ts
// (K131): turunan dihitung saat diminta, bukan disimpan.
//
// K133 — hak lihat mengikuti hak lihat entitas sumbernya: PENYUSUN_BIAYA
// tidak melihat butir Invoice, disaring total (bukan baris terkunci).

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { validation } from '../errors'
import { nilaiSla, type KeadaanSla } from './sla'
import { AMBANG_MENDEKATI_JAM } from './sla-policy'

export type JenisKalender =
  | 'VOYAGE_ARRIVAL'
  | 'VOYAGE_BERTH'
  | 'VOYAGE_DEPARTURE'
  | 'TASK_DUE'
  | 'CREW_CHANGE'
  | 'WORK_ORDER_START'
  | 'WORK_ORDER_END'
  | 'INVOICE_DUE'
  | 'ATTACHMENT_EXPIRE'

export type ButirKalender = {
  tanggal: string // ISO
  jenis: JenisKalender
  judul: string
  href: string | null
  /** Hanya diisi untuk TASK_DUE — dasar pengelompokan warna (K100). */
  sla: KeadaanSla | null
}

const MAKS_RENTANG_HARI = 120

export async function getKalender(
  ctx: TenantContext,
  from: unknown,
  to: unknown,
): Promise<ButirKalender[]> {
  const dari = new Date(String(from))
  const sampai = new Date(String(to))
  if (Number.isNaN(dari.getTime()) || Number.isNaN(sampai.getTime())) {
    throw validation('Parameter from/to wajib tanggal yang sah (YYYY-MM-DD).')
  }
  if (sampai.getTime() < dari.getTime()) throw validation('Parameter to harus sesudah from.')
  const rentangHari = (sampai.getTime() - dari.getTime()) / 86_400_000
  if (rentangHari > MAKS_RENTANG_HARI) {
    throw validation(`Rentang tanggal terlalu lebar (maksimal ${MAKS_RENTANG_HARI} hari).`)
  }

  const db = forTenant(ctx)
  const bolehInvoice = ctx.role !== 'PENYUSUN_BIAYA'
  const sekarang = new Date()

  const [voyages, tasks, crewChanges, workOrders, invoices, attachments] = await Promise.all([
    db.voyage.findMany({
      where: {
        deletedAt: null,
        OR: [
          { eta: { gte: dari, lte: sampai } }, { ata: { gte: dari, lte: sampai } },
          { etb: { gte: dari, lte: sampai } }, { atb: { gte: dari, lte: sampai } },
          { etd: { gte: dari, lte: sampai } }, { atd: { gte: dari, lte: sampai } },
        ],
      },
      select: { id: true, voyageNumber: true, eta: true, ata: true, etb: true, atb: true, etd: true, atd: true },
    }),
    db.task.findMany({
      where: { deletedAt: null, dueAt: { gte: dari, lte: sampai } },
      select: { id: true, title: true, dueAt: true, completedAt: true, slaHours: true, voyageId: true },
    }),
    db.crewChange.findMany({
      where: { deletedAt: null, plannedDate: { gte: dari, lte: sampai } },
      select: { id: true, voyageId: true, plannedDate: true },
    }),
    db.workOrder.findMany({
      where: {
        deletedAt: null,
        OR: [{ plannedStart: { gte: dari, lte: sampai } }, { plannedEnd: { gte: dari, lte: sampai } }],
      },
      select: { id: true, voyageId: true, woNumber: true, plannedStart: true, plannedEnd: true },
    }),
    bolehInvoice
      ? db.invoice.findMany({
          where: { deletedAt: null, dueDate: { gte: dari, lte: sampai } },
          select: { id: true, voyageId: true, invoiceNumber: true, dueDate: true },
        })
      : Promise.resolve([]),
    db.attachment.findMany({
      where: { deletedAt: null, expiresAt: { gte: dari, lte: sampai } },
      select: { id: true, entityType: true, entityId: true, fileName: true, expiresAt: true },
    }),
  ])

  const butir: ButirKalender[] = []

  // K134 — actual (ata/atb/atd) MENANG atas estimasi begitu sudah terisi;
  // menampilkan keduanya sekaligus untuk kunjungan yang sama akan
  // menggandakan tampilan tanpa menambah informasi (yang aktual SUDAH
  // menjawab pertanyaan yang tadinya dijawab estimasi).
  for (const v of voyages) {
    const arr = v.ata ?? v.eta
    if (arr && arr >= dari && arr <= sampai) {
      butir.push({
        tanggal: arr.toISOString(), jenis: 'VOYAGE_ARRIVAL',
        judul: `${v.voyageNumber} — ${v.ata ? 'ATA' : 'ETA'}`,
        href: `/voyages/${v.id}`, sla: null,
      })
    }
    const brt = v.atb ?? v.etb
    if (brt && brt >= dari && brt <= sampai) {
      butir.push({
        tanggal: brt.toISOString(), jenis: 'VOYAGE_BERTH',
        judul: `${v.voyageNumber} — ${v.atb ? 'ATB' : 'ETB'}`,
        href: `/voyages/${v.id}`, sla: null,
      })
    }
    const dep = v.atd ?? v.etd
    if (dep && dep >= dari && dep <= sampai) {
      butir.push({
        tanggal: dep.toISOString(), jenis: 'VOYAGE_DEPARTURE',
        judul: `${v.voyageNumber} — ${v.atd ? 'ATD' : 'ETD'}`,
        href: `/voyages/${v.id}`, sla: null,
      })
    }
  }

  for (const t of tasks) {
    if (!t.dueAt) continue
    const sla = nilaiSla({
      dueAt: t.dueAt, completedAt: t.completedAt, slaHours: t.slaHours,
      sekarang, ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
    })
    butir.push({
      tanggal: t.dueAt.toISOString(), jenis: 'TASK_DUE', judul: t.title,
      // K134 alinea terakhir — acara bebas (voyageId null) tetap muncul, cuma tanpa href voyage.
      href: t.voyageId ? `/voyages/${t.voyageId}` : null,
      sla: sla.keadaan,
    })
  }

  for (const c of crewChanges) {
    if (!c.plannedDate) continue
    butir.push({
      tanggal: c.plannedDate.toISOString(), jenis: 'CREW_CHANGE', judul: 'Crew change',
      href: `/voyages/${c.voyageId}`, sla: null,
    })
  }

  for (const w of workOrders) {
    if (w.plannedStart && w.plannedStart >= dari && w.plannedStart <= sampai) {
      butir.push({
        tanggal: w.plannedStart.toISOString(), jenis: 'WORK_ORDER_START', judul: `${w.woNumber} — mulai`,
        href: `/voyages/${w.voyageId}`, sla: null,
      })
    }
    if (w.plannedEnd && w.plannedEnd >= dari && w.plannedEnd <= sampai) {
      butir.push({
        tanggal: w.plannedEnd.toISOString(), jenis: 'WORK_ORDER_END', judul: `${w.woNumber} — selesai`,
        href: `/voyages/${w.voyageId}`, sla: null,
      })
    }
  }

  for (const inv of invoices) {
    if (!inv.dueDate) continue
    butir.push({
      tanggal: inv.dueDate.toISOString(), jenis: 'INVOICE_DUE', judul: `Invoice ${inv.invoiceNumber} jatuh tempo`,
      href: inv.voyageId ? `/voyages/${inv.voyageId}/invoices/${inv.id}` : null, sla: null,
    })
  }

  for (const a of attachments) {
    if (!a.expiresAt) continue
    butir.push({
      tanggal: a.expiresAt.toISOString(), jenis: 'ATTACHMENT_EXPIRE', judul: `Kedaluwarsa: ${a.fileName}`,
      href: `/api/attachments/${a.id}/content`, sla: null,
    })
  }

  return butir.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
}
