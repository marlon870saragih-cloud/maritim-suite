// Task Management (K90–K99, §3) — sisi DATABASE.
//
// Enam aturan POLA-SERVICE-LAYER.md §5 berlaku penuh. Yang khas berkas ini:
//
// ⚠️ TIDAK ADA SATU PUN ATURAN TRANSISI, TANGGAL, ATAU URUTAN DI SINI.
//    Semuanya sudah tinggal di modul murni Fase 7b dan berkas ini MEMANGGILNYA:
//      - `bolehTransisiTugas()` / `efekTransisiTugas()`  → task-status.ts   (K91/K99)
//      - `hitungDueAt()`                                 → task-schedule.ts (K94)
//      - `hitungPenempatan()` / `normalisasiKolom()`     → board-order.ts   (K92)
//      - `nilaiSla()` + `AMBANG_MENDEKATI_JAM`           → sla.ts/sla-policy.ts (K100)
//    Menulis ulang salah satunya di sini — sekecil `if (status === 'DONE')` untuk
//    memutuskan sesuatu — berarti punya dua tafsir atas aturan yang sama, dan
//    itulah kelas bug yang seluruh 7b dibangun untuk mencegahnya.
//
// Yang MEMANG milik berkas ini dan bukan milik modul murni: K98 (peran +
// kepemilikan tugas). Modul murni hanya tahu PERAN pelaku; ia tidak tahu siapa
// ditugaskan ke apa — itu pertanyaan database. Lihat catatan penutup
// bolehTransisiTugas() di task-status.ts, yang menyerahkannya ke berkas ini.
//
// ⚠️ BUKAN K85. Task memakai empat FK sungguhan (K90), bukan entityType/entityId,
//    jadi `ownership.service.ts` TIDAK dipakai di sini — pasangan FK + tenant
//    guard sudah menjamin apa yang dijamin pagar polimorfik itu. Yang tetap wajib:
//    setiap id relasi yang datang dari klien dibuktikan dulu milik tenant ini.

import type { Prisma, Task, TaskPriority, TaskStatus } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { conflict, forbidden, notFound, validation } from '../errors'
import { int, pilihan, str, tanggal, wajib } from '../input'
import { pastikanLanggananAktif } from '../subscription'
import { catatAudit, type Jejak } from '../finance/audit'
import {
  bolehTransisiTugas,
  efekTransisiTugas,
  transisiTersediaTugas,
  type AlasanTolakTransisi,
  type HasilTransisiTugas,
} from './task-status'
import { hitungDueAt, jangkarDikenal, type TanggalJangkar } from './task-schedule'
import {
  hitungPenempatan,
  normalisasiKolom,
  urutanDiBawah,
  urutkanKolom,
  LANGKAH_URUTAN,
  type KartuPapan,
} from './board-order'
import { nilaiSla, type HasilSla } from './sla'
import { AMBANG_MENDEKATI_JAM, slaBawaanKategori } from './sla-policy'
// Fase 8j — pemakaian (K183/K184).
import { catatPemakaian } from '../saas/usage.service'

// ------------------------------------------------------------------ kebijakan

export const STATUS_TUGAS: readonly TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'CANCELLED',
]

export const PRIORITAS_TUGAS: readonly TaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

/**
 * K98 baris "Buat / ubah / hapus tugas". PENYUSUN_BIAYA, FINANCE, VIEWER, dan
 * DIREKTUR sengaja tidak termasuk: dua yang pertama boleh MENGERJAKAN tugas yang
 * ditugaskan kepada mereka (lihat bolehUbahStatus), bukan membuatnya.
 */
const PERAN_KELOLA_TUGAS = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'] as const

/** K98 — dua peran yang boleh mengubah status tugas SIAPA PUN. */
const PERAN_STATUS_ORANG_LAIN = ['ADMIN', 'MANAJER_OPERASI'] as const

/**
 * K98 — peran yang boleh mengubah status tugas MILIK SENDIRI saja. VIEWER dan
 * DIREKTUR tidak ada di sini maupun di atas: keduanya lihat-saja.
 */
const PERAN_STATUS_SENDIRI = ['OPERATOR', 'PENYUSUN_BIAYA', 'FINANCE'] as const

// -------------------------------------------------------------------- bentuk

export type TugasDenganSla = Task & { sla: HasilSla; transisiTersedia: readonly TaskStatus[] }

/**
 * K100 — keadaan SLA DIHITUNG saat menyajikan, tidak pernah disimpan. Murah
 * (dua kolom + satu pengurangan) dan selalu benar; kolom simpanan akan selalu
 * basi kecuali ada job yang menulis ribuan baris tiap jam.
 */
function denganSla(t: Task, ctx: TenantContext, sekarang: Date): TugasDenganSla {
  return {
    ...t,
    sla: nilaiSla({
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      slaHours: t.slaHours,
      sekarang,
      ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
    }),
    // §12/6 — daftar tombol berasal dari mesin status, tidak pernah di-hard-code
    // di komponen (7d). Pagar kepemilikan K98 tetap diperiksa ulang saat ditekan.
    transisiTersedia: transisiTersediaTugas(t.status, ctx.role),
  }
}

// -------------------------------------------------------------------- masukan

function bacaAnchor(v: unknown): string | null {
  const a = str(v)
  if (a === null) return null
  if (!jangkarDikenal(a)) {
    throw validation(
      `Jangkar "${a}" tidak dikenal. Pilihan: ETA, ETB, ETC, ETD, ATA, VOYAGE_CREATED, MANUAL.`,
    )
  }
  return a
}

function bacaInput(body: Record<string, unknown>) {
  return {
    title: wajib(str(body.title), 'Judul tugas'),
    description: str(body.description),
    category: str(body.category),
    priority: pilihan(body.priority, PRIORITAS_TUGAS, 'Prioritas', 'NORMAL'),
    portCallId: str(body.portCallId),
    disbursementId: str(body.disbursementId),
    vendorId: str(body.vendorId),
    assigneeUserId: str(body.assigneeUserId),
    anchor: bacaAnchor(body.anchor),
    offsetHours: int(body.offsetHours),
    dueAt: tanggal(body.dueAt),
    slaHours: int(body.slaHours),
  }
}

type InputTugas = ReturnType<typeof bacaInput>

/**
 * Setiap id relasi yang datang dari klien dibuktikan milik tenant ini. Tenant
 * guard sudah menyaring BACAAN, tapi `create` menerima apa pun yang diketik
 * pemanggil: tanpa pemeriksaan ini, `vendorId` milik tenant lain akan tersimpan
 * rapi di baris tugas kita (FK-nya sah — Postgres tak tahu soal tenant).
 * Milik tenant lain dilaporkan NOT_FOUND, bukan FORBIDDEN (aturan #6).
 */
async function pastikanRelasiMilikTenant(
  ctx: TenantContext,
  data: Pick<InputTugas, 'portCallId' | 'disbursementId' | 'vendorId'> & { voyageId?: string | null },
): Promise<void> {
  const db = forTenant(ctx)
  if (data.voyageId) {
    const v = await db.voyage.findFirst({ where: { id: data.voyageId, deletedAt: null }, select: { id: true } })
    if (!v) throw notFound('Voyage')
  }
  if (data.portCallId) {
    const pc = await db.portCall.findFirst({ where: { id: data.portCallId }, select: { id: true } })
    if (!pc) throw notFound('Port call')
  }
  if (data.disbursementId) {
    const d = await db.disbursement.findFirst({
      where: { id: data.disbursementId, deletedAt: null },
      select: { id: true },
    })
    if (!d) throw notFound('Disbursement')
  }
  if (data.vendorId) {
    const v = await db.vendor.findFirst({ where: { id: data.vendorId, deletedAt: null }, select: { id: true } })
    if (!v) throw notFound('Vendor')
  }
}

/** Penanggung jawab wajib pengguna AKTIF di tenant ini (K97: satu orang, bukan daftar). */
async function pastikanPenanggungJawabSah(ctx: TenantContext, userId: string): Promise<void> {
  const u = await forTenant(ctx).user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true },
  })
  if (!u) throw notFound('Pengguna')
}

/**
 * K98 — "Menugaskan / memindah penanggung jawab": ADMIN & MANAJER_OPERASI ke
 * siapa saja, OPERATOR **ke diri sendiri saja**.
 *
 * Alasannya keputusan, bukan tabel: mengambil pekerjaan berbeda dari membebankan
 * pekerjaan ke orang lain; yang kedua wewenang koordinasi. Kalau kelak terlalu
 * kaku untuk tim sekecil Tribuana → P31, satu baris di sini.
 */
function pastikanBolehMenugaskan(ctx: TenantContext, target: string | null): void {
  if (ctx.system) return
  requireRole(ctx, ...PERAN_KELOLA_TUGAS)
  if (ctx.role !== 'OPERATOR') return
  if (target !== null && target !== ctx.userId) {
    throw forbidden('OPERATOR hanya bisa menugaskan tugas kepada diri sendiri.')
  }
}

/**
 * K98 — dua baris tabel peran yang tidak bisa diwakili `requireRole` sendirian:
 * "ubah status tugas milik sendiri" vs "ubah status tugas orang lain".
 *
 * Yang tidak tertulis di tabel dan diputuskan di sini: tugas TANPA penanggung
 * jawab. OPERATOR boleh menyentuhnya — ia memang boleh membuat tugas dan menarik
 * tugas ke dirinya sendiri, jadi menolaknya cuma menambah satu klik tanpa menahan
 * apa pun. PENYUSUN_BIAYA/FINANCE tidak boleh: mereka tak punya hak buat maupun
 * hak tugaskan, sehingga tugas tanpa penanggung jawab pasti bukan milik mereka.
 */
function pastikanBolehUbahStatus(ctx: TenantContext, tugas: Task): void {
  if (ctx.system) return

  if ((PERAN_STATUS_ORANG_LAIN as readonly string[]).includes(ctx.role)) return

  if (!(PERAN_STATUS_SENDIRI as readonly string[]).includes(ctx.role)) {
    throw forbidden('Peran Anda tidak berhak mengubah status tugas.')
  }

  if (tugas.assigneeUserId === ctx.userId) return
  if (tugas.assigneeUserId === null && ctx.role === 'OPERATOR') return

  throw forbidden('Anda hanya bisa mengubah status tugas yang ditugaskan kepada Anda.')
}

/** Terjemahan penolakan mesin murni → kode HTTP yang benar. */
const KODE_TOLAK: Readonly<Record<AlasanTolakTransisi, 'CONFLICT' | 'VALIDATION' | 'FORBIDDEN'>> = {
  TRANSISI_TAK_SAH: 'CONFLICT',
  BLOKIR_TANPA_ALASAN: 'VALIDATION',
  // Penolakan karena PERAN adalah 403, bukan 409: busurnya ada, orangnya yang
  // tidak berhak. Membedakan keduanya membuat pesan di layar bisa benar.
  BUKA_KEMBALI_PERAN: 'FORBIDDEN',
  BUKA_KEMBALI_KEDALUWARSA: 'CONFLICT',
  BUKA_KEMBALI_TANPA_COMPLETED_AT: 'CONFLICT',
}

function lemparTolakTransisi(h: Extract<HasilTransisiTugas, { boleh: false }>): never {
  const kode = KODE_TOLAK[h.alasan]
  if (kode === 'FORBIDDEN') throw forbidden(h.pesan)
  if (kode === 'VALIDATION') throw validation(h.pesan, { alasan: h.alasan })
  throw conflict(h.pesan)
}

// ------------------------------------------------------------------ pembacaan

/** Jangkar voyage untuk `hitungDueAt`. Voyage null (tugas kantor, K83) → semua null. */
export async function jangkarVoyage(
  ctx: TenantContext,
  voyageId: string | null,
): Promise<TanggalJangkar> {
  if (!voyageId) return {}
  const v = await forTenant(ctx).voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    select: { eta: true, etb: true, etc: true, etd: true, ata: true, createdAt: true },
  })
  if (!v) throw notFound('Voyage')
  return { eta: v.eta, etb: v.etb, etc: v.etc, etd: v.etd, ata: v.ata, voyageCreatedAt: v.createdAt }
}

async function ambilTugas(ctx: TenantContext, id: string): Promise<Task> {
  const t = await forTenant(ctx).task.findFirst({ where: { id, deletedAt: null } })
  if (!t) throw notFound('Tugas')
  return t
}

export async function getTask(ctx: TenantContext, id: string): Promise<TugasDenganSla> {
  return denganSla(await ambilTugas(ctx, id), ctx, new Date())
}

export type FilterTugas = {
  voyageId?: string | null
  /** Satu atau beberapa status, dipisah koma di query string. */
  status?: string | null
  /** `me` / id pengguna / `none` (belum ada penanggung jawab). */
  assignee?: string | null
  /** `lewat` (sudah lewat tenggat) | `24j` | `7h` — semuanya mengecualikan yang selesai. */
  due?: string | null
  category?: string | null
  cari?: string | null
  /** Sertakan DONE/CANCELLED. Papan Kanban butuh keduanya; daftar "tugas saya" tidak. */
  termasukSelesai?: boolean
  batas?: number | null
}

const BATAS_BAWAAN = 200
const BATAS_MAKS = 1000

/**
 * Daftar tugas lintas-voyage (papan & daftar). Pengurutannya papan: kolom
 * (status) lalu `boardOrder` — sama dengan yang dipakai 7d, supaya tampilan
 * daftar dan papan tidak pernah menyajikan dua urutan berbeda untuk data sama.
 */
export async function listTasks(
  ctx: TenantContext,
  f: FilterTugas = {},
): Promise<TugasDenganSla[]> {
  const db = forTenant(ctx)
  const sekarang = new Date()

  const status = (f.status ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => pilihan(s, STATUS_TUGAS, 'Status'))

  const where: Prisma.TaskWhereInput = { deletedAt: null }

  if (f.voyageId) where.voyageId = f.voyageId
  if (status.length > 0) where.status = { in: status }
  else if (!f.termasukSelesai) where.status = { notIn: ['DONE', 'CANCELLED'] }

  if (f.assignee === 'me') where.assigneeUserId = ctx.userId
  else if (f.assignee === 'none') where.assigneeUserId = null
  else if (f.assignee) where.assigneeUserId = f.assignee

  if (f.category) where.category = f.category
  if (f.cari) where.title = { contains: f.cari.trim(), mode: 'insensitive' }

  if (f.due) {
    // Tenggat SELALU dinilai dari kolom `dueAt` yang tersimpan — inilah satu
    // query ber-index yang jadi alasan K94 menyimpan turunan ini sama sekali.
    const batasAtas =
      f.due === 'lewat'
        ? sekarang
        : f.due === '24j'
          ? new Date(sekarang.getTime() + 24 * 3_600_000)
          : f.due === '7h'
            ? new Date(sekarang.getTime() + 7 * 24 * 3_600_000)
            : null
    if (batasAtas === null) {
      throw validation('Penyaring tenggat tidak sah. Pilihan: lewat, 24j, 7h.')
    }
    where.dueAt = { not: null, lte: batasAtas }
    where.completedAt = null
  }

  const batas = Math.min(Math.max(f.batas ?? BATAS_BAWAAN, 1), BATAS_MAKS)

  const rows = await db.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { boardOrder: 'asc' }, { createdAt: 'asc' }],
    take: batas,
  })
  return rows.map((t) => denganSla(t, ctx, sekarang))
}

// ------------------------------------------------------------------ penulisan

/** Kolom papan = pasangan (voyageId, status). Kanban tak punya tabel (K91). */
function whereKolom(voyageId: string | null, status: TaskStatus): Prisma.TaskWhereInput {
  return { voyageId, status, deletedAt: null }
}

/** Nilai `boardOrder` untuk kartu baru: paling bawah kolomnya (K92). */
export async function urutanBerikutnya(
  ctx: TenantContext,
  voyageId: string | null,
  status: TaskStatus = 'TODO',
): Promise<number> {
  const agg = await forTenant(ctx).task.aggregate({
    where: whereKolom(voyageId, status),
    _max: { boardOrder: true },
  })
  const maks = agg._max.boardOrder
  return maks === null || maks === undefined ? LANGKAH_URUTAN : urutanDiBawah(maks)
}

/**
 * K94 — `dueAt` saat tugas LAHIR atau saat jangkarnya disunting.
 *
 * Aturannya satu kalimat: tenggat yang DIKETIK operator selalu menang dan
 * membekukan tugas itu dari pergeseran jangkar (`dueAtManual = true`); tenggat
 * yang berasal dari jangkar dihitung `hitungDueAt()` dan tetap ikut bergerak.
 */
function tetapkanDueAt(
  data: Pick<InputTugas, 'anchor' | 'offsetHours' | 'dueAt'>,
  jangkar: TanggalJangkar,
): { dueAt: Date | null; dueAtManual: boolean } {
  if (data.dueAt !== null) return { dueAt: data.dueAt, dueAtManual: true }
  return { dueAt: hitungDueAt(data.anchor, data.offsetHours, jangkar), dueAtManual: false }
}

export async function createTask(
  ctx: TenantContext,
  body: Record<string, unknown>,
  opts: { voyageId?: string | null; jejak?: Jejak } = {},
): Promise<TugasDenganSla> {
  requireRole(ctx, ...PERAN_KELOLA_TUGAS)
  // K33 — pembuatan data baru digerbangi langganan, sama seperti Disbursement
  // dan Invoice. Membaca & menyelesaikan tugas lama tetap boleh saat langganan
  // habis: menahannya hanya menyandera pekerjaan operator, bukan menagih.
  await pastikanLanggananAktif(ctx)

  const db = forTenant(ctx)
  const data = bacaInput(body)
  // voyageId dari route menang atas body — route `/voyages/[id]/tasks` sudah
  // menyatakan voyage-nya, dan body yang menyebut voyage lain adalah kekeliruan.
  const voyageId = opts.voyageId ?? str(body.voyageId)

  await pastikanRelasiMilikTenant(ctx, { ...data, voyageId })
  if (data.assigneeUserId) {
    pastikanBolehMenugaskan(ctx, data.assigneeUserId)
    await pastikanPenanggungJawabSah(ctx, data.assigneeUserId)
  }

  const jangkar = await jangkarVoyage(ctx, voyageId)
  const jadwal = tetapkanDueAt(data, jangkar)

  const tugas = await db.task.create({
    data: {
      tenantId: ctx.tenantId,
      voyageId,
      portCallId: data.portCallId,
      disbursementId: data.disbursementId,
      vendorId: data.vendorId,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: 'TODO',
      assigneeUserId: data.assigneeUserId,
      createdByUserId: ctx.userId,
      boardOrder: await urutanBerikutnya(ctx, voyageId, 'TODO'),
      anchor: data.anchor,
      offsetHours: data.offsetHours,
      dueAt: jadwal.dueAt,
      dueAtManual: jadwal.dueAtManual,
      // P32 belum dijawab, jadi bawaannya `null` — dan itu diambil dari SATU
      // tempat (sla-policy.ts), bukan ditulis ulang di sini.
      slaHours: data.slaHours ?? slaBawaanKategori(data.category),
    },
  })

  return denganSla(tugas, ctx, new Date())
}

/**
 * Sunting isi tugas — BUKAN statusnya (itu `changeTaskStatus`, yang lewat mesin
 * K91) dan bukan urutannya (itu `moveTaskOrder`, yang lewat K92). Pemisahan ini
 * sama dengan `updateVoyage` vs `setVoyageStatus` yang sudah ada.
 */
export async function updateTask(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<TugasDenganSla> {
  requireRole(ctx, ...PERAN_KELOLA_TUGAS)
  const lama = await ambilTugas(ctx, id)

  if (body.status !== undefined) {
    throw validation('Status tugas diubah lewat POST /api/tasks/[id]/status, bukan PATCH.')
  }
  if (body.boardOrder !== undefined) {
    throw validation('Urutan papan diubah lewat POST /api/tasks/[id]/order, bukan PATCH.')
  }

  const data = bacaInput(body)
  await pastikanRelasiMilikTenant(ctx, data)
  if (data.assigneeUserId !== lama.assigneeUserId) {
    pastikanBolehMenugaskan(ctx, data.assigneeUserId)
    if (data.assigneeUserId) await pastikanPenanggungJawabSah(ctx, data.assigneeUserId)
  }

  const jangkar = await jangkarVoyage(ctx, lama.voyageId)
  const jadwal = tetapkanDueAt(data, jangkar)

  const hasil = await forTenant(ctx).task.updateMany({
    where: { id, deletedAt: null },
    data: {
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      portCallId: data.portCallId,
      disbursementId: data.disbursementId,
      vendorId: data.vendorId,
      assigneeUserId: data.assigneeUserId,
      anchor: data.anchor,
      offsetHours: data.offsetHours,
      dueAt: jadwal.dueAt,
      dueAtManual: jadwal.dueAtManual,
      slaHours: data.slaHours,
    },
  })
  if (hasil.count === 0) throw notFound('Tugas')
  return getTask(ctx, id)
}

/** Hapus = soft delete (aturan #4). Tugas yang dihapus tidak menghalangi apa pun (K96). */
export async function removeTask(ctx: TenantContext, id: string, jejak: Jejak = {}): Promise<void> {
  requireRole(ctx, ...PERAN_KELOLA_TUGAS)
  const tugas = await ambilTugas(ctx, id)

  const hasil = await forTenant(ctx).task.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Tugas')

  await catatAudit(
    ctx,
    {
      tableName: 'Task',
      recordId: id,
      action: 'DELETE',
      oldValue: { title: tugas.title, status: tugas.status, voyageId: tugas.voyageId },
    },
    jejak,
  )
}

/**
 * K91 + K98 + K99 — satu-satunya jalan mengubah status tugas.
 *
 * Urutannya disengaja: pagar KEPEMILIKAN (K98, hanya bisa dijawab database) dulu,
 * baru mesin transisi murni (K91). Kalau dibalik, seorang FINANCE yang mencoba
 * menutup tugas orang lain akan mendapat pesan "TODO tidak bisa langsung DONE"
 * — benar secara teknis, menyesatkan secara manusia.
 */
export async function changeTaskStatus(
  ctx: TenantContext,
  id: string,
  keMentah: unknown,
  opts: { blockedReason?: unknown; jejak?: Jejak } = {},
): Promise<TugasDenganSla> {
  const tugas = await ambilTugas(ctx, id)
  pastikanBolehUbahStatus(ctx, tugas)

  const ke = pilihan(keMentah, STATUS_TUGAS, 'Status tujuan')
  const blockedReason = str(opts.blockedReason)
  const sekarang = new Date()

  const izin = bolehTransisiTugas({
    dari: tugas.status,
    ke,
    peran: ctx.role,
    blockedReason,
    completedAt: tugas.completedAt,
    sekarang,
  })
  if (!izin.boleh) lemparTolakTransisi(izin)

  // K99 — kapan startedAt/completedAt/blockedReason bergerak diputuskan di SATU
  // tempat (task-status.ts). Patch-nya ditulis dalam UPDATE yang sama dengan
  // statusnya, jadi tak pernah ada baris DONE tanpa completedAt di antara dua query.
  const patch = efekTransisiTugas({
    dari: tugas.status,
    ke,
    startedAt: tugas.startedAt,
    blockedReason,
    sekarang,
  })

  const hasil = await forTenant(ctx).task.updateMany({
    where: { id, deletedAt: null },
    data: { status: ke, ...patch },
  })
  if (hasil.count === 0) throw notFound('Tugas')

  // K91 mewajibkan jejak untuk "buka kembali"; ditulis untuk SETIAP transisi
  // supaya tidak ada dua jalur audit yang harus dijaga tetap sama.
  await catatAudit(
    ctx,
    {
      tableName: 'Task',
      recordId: id,
      action: 'UPDATE',
      oldValue: { status: tugas.status, completedAt: tugas.completedAt },
      newValue: {
        status: ke,
        ...patch,
        bukaKembali: tugas.status === 'DONE' && ke === 'IN_PROGRESS',
      },
    },
    opts.jejak ?? {},
  )

  // Fase 8j / K183 — dicatat setiap kali tugas MENDARAT di DONE (termasuk
  // sesudah dibuka kembali lalu diselesaikan lagi — repetisi genuine, bukan
  // dobel-hitung yang perlu dijaga).
  if (ke === 'DONE') {
    await catatPemakaian(ctx, 'TASK_COMPLETED')
  }

  return getTask(ctx, id)
}

/** K97/K98 — satu penanggung jawab, dan siapa yang boleh menunjuknya. */
export async function assignTask(
  ctx: TenantContext,
  id: string,
  assigneeUserId: unknown,
  jejak: Jejak = {},
): Promise<TugasDenganSla> {
  const tugas = await ambilTugas(ctx, id)
  const target = str(assigneeUserId)

  // Melepas tugas: OPERATOR hanya boleh melepas tugasnya SENDIRI. Melepas tugas
  // orang lain adalah memindahkan beban kerja, yaitu wewenang koordinasi yang
  // sama dengan menugaskan.
  if (target === null && ctx.role === 'OPERATOR' && !ctx.system) {
    requireRole(ctx, ...PERAN_KELOLA_TUGAS)
    if (tugas.assigneeUserId !== null && tugas.assigneeUserId !== ctx.userId) {
      throw forbidden('OPERATOR hanya bisa melepas tugas yang ditugaskan kepada dirinya sendiri.')
    }
  } else {
    pastikanBolehMenugaskan(ctx, target)
  }

  if (target !== null) await pastikanPenanggungJawabSah(ctx, target)

  const hasil = await forTenant(ctx).task.updateMany({
    where: { id, deletedAt: null },
    data: { assigneeUserId: target },
  })
  if (hasil.count === 0) throw notFound('Tugas')

  await catatAudit(
    ctx,
    {
      tableName: 'Task',
      recordId: id,
      action: 'UPDATE',
      oldValue: { assigneeUserId: tugas.assigneeUserId },
      newValue: { assigneeUserId: target },
    },
    jejak,
  )

  return getTask(ctx, id)
}

export type HasilPindahUrutan = {
  tugas: TugasDenganSla
  boardOrder: number
  /** Berapa baris LAIN yang ikut ditulis — 0 pada pergeseran normal (K92). */
  dinormalisasi: number
}

/**
 * K92 — pindahkan satu kartu ke posisi `indeksTujuan` dalam kolomnya.
 *
 * Menulis SATU baris. Itu bukan optimasi kecil melainkan alasan `boardOrder`
 * bertipe Float: dengan Int, satu tarikan mouse menulis ulang puluhan baris dan
 * dua orang yang menggeser bersamaan saling menimpa TANPA galat.
 *
 * Satu-satunya keadaan yang menyentuh banyak baris adalah normalisasi malas —
 * langka (butuh ~50 sisipan berturut-turut di celah yang sama), terbatas pada
 * SATU kolom, dan dilaporkan terbuka lewat `dinormalisasi`.
 */
export async function moveTaskOrder(
  ctx: TenantContext,
  id: string,
  indeksTujuan: unknown,
): Promise<HasilPindahUrutan> {
  requireRole(ctx, ...PERAN_KELOLA_TUGAS)
  const tugas = await ambilTugas(ctx, id)

  const indeks = int(indeksTujuan)
  if (indeks === null) throw validation('indeksTujuan wajib diisi (0 = paling atas).')

  const db = forTenant(ctx)

  // Kolom TANPA kartu yang sedang dipindah: indeks tujuan yang dikirim UI selalu
  // berarti posisi di antara kartu-kartu lain, bukan di antara termasuk dirinya.
  const lain = (await db.task.findMany({
    where: { ...whereKolom(tugas.voyageId, tugas.status), id: { not: id } },
    select: { id: true, boardOrder: true },
  })) as KartuPapan[]

  const kolom = urutkanKolom(lain)
  const penempatan = hitungPenempatan(kolom, indeks)

  const hasil = await db.task.updateMany({
    where: { id, deletedAt: null },
    data: { boardOrder: penempatan.boardOrder },
  })
  if (hasil.count === 0) throw notFound('Tugas')

  let dinormalisasi = 0
  if (penempatan.butuhNormalisasi) {
    const semua = (await db.task.findMany({
      where: whereKolom(tugas.voyageId, tugas.status),
      select: { id: true, boardOrder: true },
    })) as KartuPapan[]
    const perubahan = normalisasiKolom(urutkanKolom(semua))
    if (perubahan.length > 0) {
      await db.$transaction(
        perubahan.map((p) =>
          db.task.updateMany({ where: { id: p.id, deletedAt: null }, data: { boardOrder: p.boardOrder } }),
        ),
      )
      dinormalisasi = perubahan.length
    }
  }

  const segar = await ambilTugas(ctx, id)
  return { tugas: denganSla(segar, ctx, new Date()), boardOrder: segar.boardOrder, dinormalisasi }
}
