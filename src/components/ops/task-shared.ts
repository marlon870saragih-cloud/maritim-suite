// Konstanta & tipe UI dipakai bersama seluruh komponen Tugas (7d) — sama pola
// dengan voyage/voyage-status.ts: warna & urutan kolom harus SAMA di papan,
// daftar, dan dialog, jadi tinggal satu sumber.
//
// ⚠️ Yang TIDAK ada di sini: mesin transisi, penjadwalan, atau penilaian SLA.
// Itu semua diimpor LANGSUNG dari src/services/ops/*.ts murni oleh komponen
// yang butuh (K51) — berkas ini hanya label & warna presentasi.
//
// `TASK_STATUSES` (urutan lima kolom papan) BOLEH konstan di sini karena K91
// menegaskan kolom Kanban BUKAN data yang bisa dikonfigurasi — ia *adalah*
// kelima nilai TaskStatus, dalam urutan tetap. Yang TIDAK boleh konstan adalah
// GRAF transisi (status mana boleh pindah ke status mana) — itu selalu berasal
// dari `transisiTersediaTugas()` (task-status.ts) atau field `transisiTersedia`
// yang sudah dikirim API, tidak pernah ditulis ulang di sini.

import type { Role } from '@prisma/client'
import type { KeadaanSla } from '@/services/ops/sla'

export type TaskStatusStr = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
export type TaskPriorityStr = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

/** K91 — kolom papan, urutan tetap. */
export const TASK_STATUSES: readonly TaskStatusStr[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']

export const TASK_PRIORITIES: readonly TaskPriorityStr[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

/** Kategori yang disebut komentar K90/skema (`Task.category` String bebas — daftar ini hanya usulan UI). */
export const TASK_CATEGORIES: readonly string[] = [
  'PORT_CLEARANCE',
  'HUSBANDRY',
  'CREW',
  'FINANCE',
  'DOCUMENT',
  'VENDOR',
  'OTHER',
]

export const TASK_STATUS_COLOR: Record<TaskStatusStr, string> = {
  TODO: 'bg-surface-tertiary text-text-secondary border-border-muted',
  IN_PROGRESS: 'bg-accent-blue/12 text-accent-blue border-accent-blue/30',
  BLOCKED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  DONE: 'bg-status-success/12 text-status-success border-status-success/30',
  CANCELLED: 'bg-surface-tertiary text-text-secondary/50 border-border-muted',
}

export const TASK_PRIORITY_COLOR: Record<TaskPriorityStr, string> = {
  LOW: 'bg-surface-tertiary text-text-secondary border-border-muted',
  NORMAL: 'bg-accent-blue/10 text-accent-blue border-accent-blue/25',
  HIGH: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  URGENT: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

export const STATUS_LABEL_ID: Record<TaskStatusStr, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'Dikerjakan',
  BLOCKED: 'Macet',
  DONE: 'Selesai',
  CANCELLED: 'Dibatalkan',
}
export const STATUS_LABEL_EN: Record<TaskStatusStr, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
}

export const PRIORITY_LABEL_ID: Record<TaskPriorityStr, string> = {
  LOW: 'Rendah',
  NORMAL: 'Normal',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
}
export const PRIORITY_LABEL_EN: Record<TaskPriorityStr, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
}

export const CATEGORY_LABEL_ID: Record<string, string> = {
  PORT_CLEARANCE: 'Port Clearance',
  HUSBANDRY: 'Husbandry',
  CREW: 'Kru',
  FINANCE: 'Finansial',
  DOCUMENT: 'Dokumen',
  VENDOR: 'Vendor',
  OTHER: 'Lainnya',
}
export const CATEGORY_LABEL_EN: Record<string, string> = {
  PORT_CLEARANCE: 'Port Clearance',
  HUSBANDRY: 'Husbandry',
  CREW: 'Crew',
  FINANCE: 'Finance',
  DOCUMENT: 'Document',
  VENDOR: 'Vendor',
  OTHER: 'Other',
}

/** Bentuk baris tugas sebagaimana dikirim API (`TugasDenganSla` di task.service.ts, diserialisasi JSON). */
export type TaskRow = {
  id: string
  voyageId: string | null
  portCallId: string | null
  disbursementId: string | null
  vendorId: string | null
  title: string
  description: string | null
  category: string | null
  status: TaskStatusStr
  priority: TaskPriorityStr
  assigneeUserId: string | null
  createdByUserId: string
  boardOrder: number
  anchor: string | null
  offsetHours: number | null
  dueAt: string | null
  dueAtManual: boolean
  slaHours: number | null
  startedAt: string | null
  completedAt: string | null
  blockedReason: string | null
  sourceTemplateItemId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  sla: { keadaan: KeadaanSla; sisaJam: number | null; telatJam: number | null }
  /** §12/6 — daftar transisi yang boleh ditampilkan sebagai tombol; SUDAH disaring server (task-status.ts). */
  transisiTersedia: readonly TaskStatusStr[]
}

/**
 * K98 baris "Buat/ubah/hapus tugas" DAN satu-satunya kelompok peran yang boleh
 * `moveTaskOrder` (task.service.ts: `PERAN_KELOLA_TUGAS`). Duplikasi yang
 * disengaja untuk pertahanan-lapis-kedua di UI (dialog Tugas & drag-and-drop
 * papan) — BUKAN pelanggaran K51, yang melarang menduplikasi GRAF TRANSISI
 * status; ini tabel PERAN, bukan tabel transisi, dan server (task.service.ts)
 * tetap satu-satunya penegak sungguhan. Salah di sini paling buruk menampilkan
 * tombol yang lalu ditolak 403 server — bukan melewatkan pagar apa pun.
 */
export const CAN_MANAGE_TASKS: readonly Role[] = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI']

export type UserOption = { id: string; name: string }

/** Peta id→nama, dipakai menampilkan nama penanggung jawab tanpa menyentuh task.service.ts (lihat catatan 7d). */
export function namaPenanggungJawab(users: readonly UserOption[], userId: string | null): string | null {
  if (!userId) return null
  return users.find((u) => u.id === userId)?.name ?? null
}
