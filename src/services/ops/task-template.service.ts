// TaskTemplate + instansiasi checklist (K93/K95, §3) — sisi DATABASE.
//
// Dua hal tinggal di berkas yang sama, dan itu keputusan:
//   1. CRUD `TaskTemplate` + `TaskTemplateItem` (master data, ADMIN saja — K98).
//   2. `terapkanChecklist()` — melahirkan Task dari butir template (K95).
// Keduanya satu berkas karena instansiasi TIDAK BISA dijelaskan tanpa bentuk
// template, dan memisahnya berarti dua berkas yang selalu dibuka bersamaan.
// Yang TIDAK ada di sini: aturan memilih template (task-template-match.ts, murni)
// dan aturan menghitung tenggat (task-schedule.ts, murni). Berkas ini memanggil
// keduanya; ia tidak pernah memutuskan sendiri.
//
// Pola item bersarang (ganti-seluruhnya saat update) meniru
// master/service-template.service.ts yang sudah ada — template itu kecil,
// kliennya selalu mengirim daftar lengkap, dan patch parsial per baris anak
// hanya menambah permukaan tanpa menambah kemampuan.

import type { TaskPriority, TaskTemplate, TaskTemplateItem } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { bool, int, pilihan, str, wajib } from '../input'
import { pastikanLanggananAktif } from '../subscription'
import { catatAudit, type Jejak } from '../finance/audit'
import { getPort } from '../master/port.service'
import {
  pilihTemplate,
  type KandidatTemplate,
  type PeringatanTemplate,
} from './task-template-match'
import { hitungDueAt, jangkarDikenal } from './task-schedule'
import { LANGKAH_URUTAN } from './board-order'
import { PRIORITAS_TUGAS, jangkarVoyage, urutanBerikutnya } from './task.service'

export type TaskTemplateWithItems = TaskTemplate & { items: TaskTemplateItem[] }

/** K98 — mengelola checklist = master data, dan master data hanya ADMIN. */
const PERAN_KELOLA_TEMPLATE = ['ADMIN'] as const

/**
 * Membaca template bukan mengelolanya: pintu manual K95 ("Terapkan checklist")
 * dipakai OPERATOR/MANAJER_OPERASI, dan mereka harus bisa melihat daftar pilihan.
 * VIEWER/DIREKTUR/PENYUSUN_BIAYA/FINANCE tidak — mereka tak punya pintu yang
 * membutuhkannya.
 */
const PERAN_BACA_TEMPLATE = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'] as const

const INCLUDE_ITEMS = { items: { orderBy: { displayOrder: 'asc' as const } } }

// -------------------------------------------------------------------- masukan

type ItemInput = {
  title: string
  description: string | null
  category: string | null
  anchor: string
  offsetHours: number
  slaHours: number | null
  defaultRole: string | null
  priority: TaskPriority
  displayOrder: number
}

function bacaItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw)) return []
  return raw.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>
    const anchor = str(o.anchor) ?? 'ETA'
    if (!jangkarDikenal(anchor)) {
      throw validation(
        `Jangkar "${anchor}" pada baris ${i + 1} tidak dikenal. ` +
          `Pilihan: ETA, ETB, ETC, ETD, ATA, VOYAGE_CREATED, MANUAL.`,
      )
    }
    return {
      title: wajib(str(o.title), `Judul butir pada baris ${i + 1}`),
      description: str(o.description),
      category: str(o.category),
      anchor,
      offsetHours: int(o.offsetHours) ?? 0,
      slaHours: int(o.slaHours),
      defaultRole: str(o.defaultRole),
      priority: pilihan(o.priority, PRIORITAS_TUGAS, `Prioritas baris ${i + 1}`, 'NORMAL'),
      displayOrder: int(o.displayOrder) ?? i,
    }
  })
}

function bacaScalar(body: Record<string, unknown>) {
  return {
    name: wajib(str(body.name), 'Nama checklist'),
    portId: str(body.portId),
    agencyType: str(body.agencyType),
    vesselType: str(body.vesselType),
    isDefault: bool(body.isDefault),
    isActive: bool(body.isActive, true),
  }
}

// ------------------------------------------------------------------ pembacaan

export async function listTaskTemplates(
  ctx: TenantContext,
  opts: { termasukNonAktif?: boolean; portId?: string | null } = {},
): Promise<TaskTemplateWithItems[]> {
  requireRole(ctx, ...PERAN_BACA_TEMPLATE)
  return forTenant(ctx).taskTemplate.findMany({
    where: {
      deletedAt: null,
      ...(opts.termasukNonAktif ? {} : { isActive: true }),
      ...(opts.portId ? { portId: opts.portId } : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: INCLUDE_ITEMS,
  })
}

export async function getTaskTemplate(
  ctx: TenantContext,
  id: string,
): Promise<TaskTemplateWithItems> {
  requireRole(ctx, ...PERAN_BACA_TEMPLATE)
  const tpl = await forTenant(ctx).taskTemplate.findFirst({
    where: { id, deletedAt: null },
    include: INCLUDE_ITEMS,
  })
  if (!tpl) throw notFound('Checklist')
  return tpl
}

// ------------------------------------------------------------------ penulisan

export async function createTaskTemplate(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<TaskTemplateWithItems> {
  requireRole(ctx, ...PERAN_KELOLA_TEMPLATE)
  const data = bacaScalar(body)
  const items = bacaItems(body.items)
  if (items.length === 0) throw validation('Checklist harus punya minimal 1 butir.')
  if (data.portId) await getPort(ctx, data.portId)

  const tpl = await forTenant(ctx).taskTemplate.create({
    data: { ...data, tenantId: ctx.tenantId, items: { create: items } },
  })
  return getTaskTemplate(ctx, tpl.id)
}

/**
 * Ganti isi template, termasuk SELURUH daftar butirnya.
 *
 * ⚠️ K95 — ini TIDAK menyentuh tugas yang sudah terlanjur lahir dari butir lama.
 * Butir lama dihapus dan butir baru punya id baru, jadi `Task.sourceTemplateItemId`
 * milik tugas lama menunjuk butir yang sudah tidak ada — dan memang begitu
 * seharusnya: itu kolom PENANDA ASAL (semangat snapshot K5), bukan FK, dan
 * skema sengaja tidak memberinya relasi. Kunjungan yang sedang berjalan tidak
 * boleh berubah di bawah kaki operator karena checklist pelabuhan diperbarui.
 *
 * Akibat yang disengaja dan perlu diketahui: menerapkan template yang butirnya
 * sudah diganti pada voyage yang sama akan melahirkan tugas BARU (id butirnya
 * berbeda), bukan memperbarui yang lama.
 */
export async function updateTaskTemplate(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<TaskTemplateWithItems> {
  requireRole(ctx, ...PERAN_KELOLA_TEMPLATE)
  await getTaskTemplate(ctx, id)

  const data = bacaScalar(body)
  const items = bacaItems(body.items)
  if (items.length === 0) throw validation('Checklist harus punya minimal 1 butir.')
  if (data.portId) await getPort(ctx, data.portId)

  const db = forTenant(ctx)
  await db.$transaction([
    db.taskTemplate.updateMany({ where: { id, deletedAt: null }, data }),
    // Model anak (K44): tanpa tenantId, diakses lewat induk yang SUDAH terbukti
    // milik tenant ini di getTaskTemplate() di atas.
    db.taskTemplateItem.deleteMany({ where: { templateId: id } }),
    db.taskTemplateItem.createMany({ data: items.map((it) => ({ templateId: id, ...it })) }),
  ])
  return getTaskTemplate(ctx, id)
}

/**
 * Hapus = SOFT delete (aturan #4), berbeda dari ServiceTemplate yang boleh
 * hard-delete. Alasannya K95: tugas yang lahir dari template ini menyimpan
 * `sourceTemplateItemId`, jadi templatenya adalah jejak asal pekerjaan yang
 * sedang berjalan. Menghapusnya keras berarti kehilangan jawaban atas
 * "checklist mana yang melahirkan tugas ini".
 *
 * K95 juga menegaskan: menghapus template TIDAK menyentuh tugas yang lahir
 * darinya. Karena itu berkas ini tidak menghitung tugas lebih dulu dan tidak
 * pernah menolak penghapusan.
 */
export async function removeTaskTemplate(ctx: TenantContext, id: string): Promise<void> {
  requireRole(ctx, ...PERAN_KELOLA_TEMPLATE)
  const hasil = await forTenant(ctx).taskTemplate.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (hasil.count === 0) throw notFound('Checklist')
}

// -------------------------------------------------------- instansiasi (K95)

export type HasilTerapkanChecklist = {
  voyageId: string
  template: { id: string; name: string } | null
  dibuat: number
  sudahAda: number
  peringatan: readonly PeringatanTemplate[]
  /** Kalimat siap tampil — bentuk yang K95 minta dilaporkan ke pengguna. */
  pesan: string
}

const HASIL_KOSONG = (
  voyageId: string,
  peringatan: readonly PeringatanTemplate[],
  pesan: string,
): HasilTerapkanChecklist => ({ voyageId, template: null, dibuat: 0, sudahAda: 0, peringatan, pesan })

/** Kandidat untuk fungsi murni — bentuknya persis `KandidatTemplate` (K93). */
async function kandidatTemplate(ctx: TenantContext): Promise<KandidatTemplate[]> {
  return forTenant(ctx).taskTemplate.findMany({
    select: {
      id: true,
      name: true,
      portId: true,
      agencyType: true,
      vesselType: true,
      isDefault: true,
      isActive: true,
      deletedAt: true,
      updatedAt: true,
    },
  })
}

/**
 * K95 — lahirkan satu `Task` per butir template pada satu voyage.
 *
 * ⚠️ IDEMPOTENSINYA DITEGAKKAN DATABASE, BUKAN APLIKASI. `createMany({
 * skipDuplicates: true })` bersandar pada `@@unique([voyageId,
 * sourceTemplateItemId])` (K90). Pemeriksaan aplikasi ("sudah ada belum?")
 * sengaja TIDAK dipakai: ia punya jendela balapan antara SELECT dan INSERT, dan
 * dua klik cepat pada tombol "Terapkan checklist" adalah cara paling wajar
 * melewatinya. Yang dilaporkan ke pengguna: "7 dibuat, 3 sudah ada".
 *
 * Tugas yang sudah di-SOFT DELETE tetap dihitung "sudah ada" — barisnya masih
 * di tabel, jadi unique-nya masih menahan. Itu benar: template adalah bibit,
 * bukan penguasa (K95), dan ia tidak boleh menghidupkan kembali pekerjaan yang
 * sengaja dibuang orang.
 */
export async function terapkanChecklist(
  ctx: TenantContext,
  voyageId: string,
  opts: { templateId?: string | null; otomatis?: boolean; jejak?: Jejak } = {},
): Promise<HasilTerapkanChecklist> {
  const db = forTenant(ctx)

  const voyage = await db.voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    select: {
      id: true,
      voyageNumber: true,
      portId: true,
      agencyType: true,
      vessel: { select: { vesselType: true } },
    },
  })
  if (!voyage) throw notFound('Voyage')

  // --- pilih template -------------------------------------------------------
  let template: TaskTemplateWithItems | null = null
  let peringatan: readonly PeringatanTemplate[] = []

  if (opts.templateId) {
    // Pintu manual: operator MENYEBUT templatenya. Template non-aktif pun boleh
    // dipakai di sini — ia disebut dengan sengaja, dan `isActive` adalah pagar
    // untuk pemilihan OTOMATIS (lihat lolosSaringanTemplate di K93).
    template = await getTaskTemplate(ctx, opts.templateId)
  } else {
    const hasil = pilihTemplate(await kandidatTemplate(ctx), {
      portId: voyage.portId,
      agencyType: voyage.agencyType,
      vesselType: voyage.vessel?.vesselType ?? null,
    })
    peringatan = hasil.peringatan
    if (!hasil.terpilih) {
      // K95 pintu 1: tak ada yang cocok BUKAN galat.
      return HASIL_KOSONG(voyageId, peringatan, 'Tidak ada checklist yang cocok — tidak ada tugas dibuat.')
    }
    template = await getTaskTemplate(ctx, hasil.terpilih.id)
  }

  if (template.items.length === 0) {
    return HASIL_KOSONG(voyageId, peringatan, `Checklist "${template.name}" belum punya butir.`)
  }

  // --- lahirkan tugas -------------------------------------------------------
  const jangkar = await jangkarVoyage(ctx, voyageId)
  const dasarUrutan = await urutanBerikutnya(ctx, voyageId, 'TODO')
  const butir = [...template.items].sort((a, b) => a.displayOrder - b.displayOrder)

  const hasil = await db.task.createMany({
    data: butir.map((it, i) => ({
      tenantId: ctx.tenantId,
      voyageId,
      title: it.title,
      description: it.description,
      category: it.category,
      priority: it.priority,
      status: 'TODO' as const,
      createdByUserId: ctx.userId,
      // Urutan papan mewarisi displayOrder template — checklist yang urutannya
      // sudah dipikirkan tidak boleh tampil acak di kolom Kanban.
      boardOrder: dasarUrutan + i * LANGKAH_URUTAN,
      anchor: it.anchor,
      offsetHours: it.offsetHours,
      // K94 — tenggat dihitung dari jangkar voyage SEKARANG, lalu disimpan; ia
      // tetap ikut bergerak nanti lewat sinkronkanJadwalTugas().
      dueAt: hitungDueAt(it.anchor, it.offsetHours, jangkar),
      dueAtManual: false,
      slaHours: it.slaHours,
      sourceTemplateItemId: it.id,
    })),
    skipDuplicates: true,
  })

  const dibuat = hasil.count
  const sudahAda = butir.length - dibuat

  if (dibuat > 0) {
    await catatAudit(
      ctx,
      {
        tableName: 'Voyage',
        recordId: voyageId,
        action: 'UPDATE',
        newValue: {
          peristiwa: 'TERAPKAN_CHECKLIST',
          voyageNumber: voyage.voyageNumber,
          templateId: template.id,
          templateName: template.name,
          otomatis: opts.otomatis === true,
          dibuat,
          sudahAda,
        },
      },
      opts.jejak ?? {},
    )
  }

  return {
    voyageId,
    template: { id: template.id, name: template.name },
    dibuat,
    sudahAda,
    peringatan,
    pesan: `${dibuat} tugas dibuat, ${sudahAda} sudah ada.`,
  }
}

/**
 * Pintu MANUAL K95 — "Terapkan checklist" dari Voyage Workspace.
 *
 * Digerbangi peran (menerapkan checklist = membuat tugas, K98) dan langganan
 * (K33), berbeda dari pintu otomatis di bawah yang menumpang izin `createVoyage`.
 */
export async function terapkanChecklistManual(
  ctx: TenantContext,
  voyageId: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<HasilTerapkanChecklist> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'MANAJER_OPERASI')
  await pastikanLanggananAktif(ctx)
  return terapkanChecklist(ctx, voyageId, { templateId: str(body.templateId), jejak })
}

/**
 * Pintu OTOMATIS K95 — dipanggil `createVoyage()` sesudah voyage lahir.
 *
 * Tiga sifat yang wajib dipertahankan:
 *   1. Hanya berjalan bila voyage punya `portId` (syarat eksplisit K95 pintu 1).
 *   2. Tidak ada template yang cocok → tidak terjadi apa-apa, TANPA galat.
 *   3. Gagal apa pun → voyage-nya TETAP lahir. Kegagalan menempelkan checklist
 *      tidak boleh menggagalkan pembuatan kunjungan kapal; ia dicatat ke konsol
 *      dan berhenti di situ (semangat K96: tugas tidak pernah menghalangi).
 */
export async function instansiasiOtomatisChecklist(
  ctx: TenantContext,
  voyage: { id: string; portId: string | null },
  jejak: Jejak = {},
): Promise<HasilTerapkanChecklist | null> {
  if (!voyage.portId) return null
  try {
    return await terapkanChecklist(ctx, voyage.id, { otomatis: true, jejak })
  } catch (e) {
    console.error('[task-template] instansiasi otomatis checklist gagal:', e)
    return null
  }
}
