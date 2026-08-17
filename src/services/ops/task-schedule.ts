// Penjadwalan tugas dari jangkar voyage — MURNI, tanpa impor nilai (K94, §3).
//
// ❌ MURNI. Sama seperti task-status.ts: `import type` saja, tanpa `new Date()`,
// tanpa ServiceError. `sekarang` tidak dibutuhkan di sini sama sekali — semua
// tanggal (jangkar, dueAt lama) masuk sebagai argumen, dan itulah yang membuat
// tabel K94 bisa dijadikan fixture emas dengan timestamp tetap.
//
// KENAPA `dueAt` DISIMPAN padahal turunan (menyimpang dari K39/K46/K66): pertanyaan
// terpenting fitur ini adalah "tugas apa yang jatuh tempo dalam 24 jam ke depan, di
// SELURUH voyage?" — dan itu wajib satu query ber-index. Menghitungnya saat query
// berarti memuat seluruh tugas beserta voyage-nya ke memori. Konsekuensinya:
// nilai simpanan itu bisa basi, dan berkas ini adalah satu-satunya tempat yang
// tahu kapan ia harus disegarkan.

import type { StatusTugas } from './task-status'

/**
 * Nilai `Task.anchor` / `TaskTemplateItem.anchor` yang dikenal.
 *
 * `MANUAL` sengaja jadi anggota, bukan diwakili `null` saja: ia berarti "operator
 * menetapkan tenggat sendiri" — sebuah keputusan yang tercatat — sedangkan `null`
 * berarti "belum ditentukan". Keduanya menghasilkan `dueAt = null`, tapi hanya
 * yang pertama yang bisa dibaca sebagai niat.
 */
export const JANGKAR_DIKENAL = [
  'ETA',
  'ETB',
  'ETC',
  'ETD',
  'ATA',
  'VOYAGE_CREATED',
  'MANUAL',
] as const

export type JenisJangkar = (typeof JANGKAR_DIKENAL)[number]

/**
 * Tanggal-tanggal voyage yang bisa jadi jangkar. Semuanya nullable karena
 * memang begitu keadaan datanya: voyage baru sering hanya punya ETA, dan `ATA`
 * baru ada sesudah kapal tiba.
 */
export type TanggalJangkar = {
  eta?: Date | null
  etb?: Date | null
  etc?: Date | null
  etd?: Date | null
  ata?: Date | null
  voyageCreatedAt?: Date | null
}

export const jangkarDikenal = (anchor: unknown): anchor is JenisJangkar =>
  typeof anchor === 'string' && (JANGKAR_DIKENAL as readonly string[]).includes(anchor)

/** Tanggal mana yang dipakai jangkar ini — `null` bila belum diisi atau bukan jangkar tanggal. */
export function tanggalJangkar(anchor: string | null | undefined, j: TanggalJangkar): Date | null {
  switch (anchor) {
    case 'ETA':
      return j.eta ?? null
    case 'ETB':
      return j.etb ?? null
    case 'ETC':
      return j.etc ?? null
    case 'ETD':
      return j.etd ?? null
    case 'ATA':
      return j.ata ?? null
    case 'VOYAGE_CREATED':
      return j.voyageCreatedAt ?? null
    default:
      // 'MANUAL', null, dan nilai tak dikenal — semuanya bukan jangkar tanggal.
      return null
  }
}

/**
 * K94 — `hitungDueAt(anchor, offsetHours, jangkar) → Date | null`.
 *
 * `offsetHours` negatif = SEBELUM jangkar. `-24` pada `ETA` berarti "24 jam
 * sebelum ETA" — bentuk yang bisa ditulis sekali di template dan tetap benar
 * saat ETA bergeser, tidak seperti tanggal absolut yang basi dalam hitungan jam.
 *
 * Mengembalikan `null` — bukan galat, bukan `NaN`, bukan Invalid Date — bila:
 *   - jangkarnya `MANUAL` / `null` / tak dikenal, atau
 *   - tanggal jangkarnya belum diisi (mis. ETA masih kosong).
 * Tenggat yang tak bisa dihitung adalah keadaan SAH dan sering, bukan kasus tepi
 * (K74): sebagian besar voyage lahir tanpa ETB/ETC.
 */
export function hitungDueAt(
  anchor: string | null | undefined,
  offsetHours: number | null | undefined,
  jangkar: TanggalJangkar,
): Date | null {
  const dasar = tanggalJangkar(anchor, jangkar)
  if (dasar === null) return null
  if (!(dasar instanceof Date) || Number.isNaN(dasar.getTime())) return null

  const offset = typeof offsetHours === 'number' && Number.isFinite(offsetHours) ? offsetHours : 0
  return new Date(dasar.getTime() + offset * 3_600_000)
}

// ---------------------------------------------------------------- pergerakan

/** Subset `Task` yang benar-benar dipakai memutuskan pergerakan jadwal. */
export type TugasUntukJadwal = {
  id: string
  status: StatusTugas
  anchor: string | null
  offsetHours: number | null
  dueAt: Date | null
  dueAtManual: boolean
}

/**
 * Kenapa tugas ini TIDAK bergeser — dieksplisitkan supaya `sinkronkanJadwalTugas`
 * (7c) bisa melaporkan alasannya, dan supaya tiap baris tabel K94 punya nama.
 */
export type AlasanTakBergeser =
  | 'DUE_AT_MANUAL' // baris 2 K94 — operator menetapkan sendiri
  | 'STATUS_SELESAI' // baris 3 K94 — DONE/CANCELLED
  | 'JANGKAR_MANUAL' // baris 4 K94 — anchor MANUAL atau null
  | 'TANGGAL_JANGKAR_KOSONG' // jangkarnya sah tapi tanggalnya belum diisi
  | 'TIDAK_BERUBAH' // hitungannya sama dengan dueAt yang tersimpan

export type KeputusanJadwal =
  | { geser: true; id: string; dueAtLama: Date | null; dueAtBaru: Date }
  | { geser: false; id: string; dueAtLama: Date | null; alasan: AlasanTakBergeser }

/**
 * K94 — status yang tenggatnya BEKU. "Tenggat masa lalu tak boleh berubah
 * sesudah pekerjaannya dinilai": kalau `dueAt` tugas `DONE` ikut bergeser saat
 * ETA mundur, tugas yang tadinya melanggar SLA berubah jadi tepat waktu tanpa
 * ada yang mengerjakan apa pun. `BLOCKED` TIDAK termasuk — ia masih pekerjaan
 * berjalan, hanya sedang macet.
 */
export const STATUS_JADWAL_BEKU: ReadonlySet<StatusTugas> = new Set<StatusTugas>([
  'DONE',
  'CANCELLED',
])

/**
 * Tabel K94, satu tugas. Urutan pemeriksaan adalah bagian dari aturannya:
 * `dueAtManual` menang atas segalanya ("tidak berubah, SELAMANYA"), lalu status
 * beku, lalu jenis jangkar.
 */
export function keputusanJadwalTugas(
  tugas: TugasUntukJadwal,
  jangkar: TanggalJangkar,
): KeputusanJadwal {
  const dueAtLama = tugas.dueAt ?? null

  if (tugas.dueAtManual) return { geser: false, id: tugas.id, dueAtLama, alasan: 'DUE_AT_MANUAL' }
  if (STATUS_JADWAL_BEKU.has(tugas.status))
    return { geser: false, id: tugas.id, dueAtLama, alasan: 'STATUS_SELESAI' }
  // 'MANUAL', null, dan nilai tak dikenal diperlakukan sama: tak ada tanggal
  // voyage yang bisa menggerakkannya. Nilai tak dikenal sengaja TIDAK melempar —
  // data lama yang anchor-nya aneh tidak boleh menggagalkan sinkronisasi
  // seluruh voyage; ia cukup diam di tempat.
  if (!jangkarDikenal(tugas.anchor) || tugas.anchor === 'MANUAL')
    return { geser: false, id: tugas.id, dueAtLama, alasan: 'JANGKAR_MANUAL' }

  const baru = hitungDueAt(tugas.anchor, tugas.offsetHours, jangkar)
  if (baru === null)
    return { geser: false, id: tugas.id, dueAtLama, alasan: 'TANGGAL_JANGKAR_KOSONG' }
  if (dueAtLama !== null && dueAtLama.getTime() === baru.getTime())
    return { geser: false, id: tugas.id, dueAtLama, alasan: 'TIDAK_BERUBAH' }

  return { geser: true, id: tugas.id, dueAtLama, dueAtBaru: baru }
}

/**
 * Rencana pergeseran untuk satu voyage. Mengembalikan SELURUH keputusan (yang
 * bergerak dan yang tidak) supaya pemanggil bisa melaporkan "12 diperiksa, 3
 * digeser" tanpa menghitung ulang — dan supaya uji bisa memeriksa alasan setiap
 * tugas yang TIDAK bergerak, bukan cuma menghitung yang bergerak.
 *
 * Yang menulis ke database tetap `sinkronkanJadwalTugas` (7c), di SATU tempat:
 * `updateVoyage()` sesudah tanggal berubah. Bukan trigger database, bukan job
 * terjadwal — keduanya membuat perubahan yang tak terlihat dari kode pemicunya.
 */
export function rencanaGeserJadwal(
  daftar: readonly TugasUntukJadwal[],
  jangkar: TanggalJangkar,
): {
  keputusan: readonly KeputusanJadwal[]
  perluDigeser: readonly { id: string; dueAt: Date }[]
} {
  const keputusan = daftar.map((t) => keputusanJadwalTugas(t, jangkar))
  const perluDigeser = keputusan
    .filter((k): k is Extract<KeputusanJadwal, { geser: true }> => k.geser)
    .map((k) => ({ id: k.id, dueAt: k.dueAtBaru }))
  return { keputusan, perluDigeser }
}
