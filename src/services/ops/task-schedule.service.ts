// Pergeseran jadwal tugas saat jangkar voyage bergerak (K94, §3) — sisi DATABASE.
//
// Pembagian kerjanya tegas dan tidak boleh kabur:
//   - task-schedule.ts (7b, MURNI)  → memutuskan tugas mana yang bergeser ke kapan.
//   - berkas ini (7c, DB)           → mengambil datanya, menerapkan keputusan itu,
//                                     menulis SATU baris AuditLog.
//
// Tidak ada satu pun perbandingan status, tanggal, atau `dueAtManual` di berkas
// ini. Semuanya milik `rencanaGeserJadwal()`. Kalau kelak muncul `if` yang
// menilai apakah sebuah tugas layak bergeser di sini, itu bug: tabel K94 punya
// EMPAT baris dan tafsir keduanya adalah cara termurah membuat dua di antaranya
// diam-diam berbeda.
//
// KENAPA SELURUH TUGAS VOYAGE DIAMBIL, BUKAN CUMA YANG "MUNGKIN BERGESER":
// menyaring `status notIn [DONE, CANCELLED] AND dueAtManual = false AND anchor
// IS NOT NULL` di SQL akan menyalin tabel K94 ke tempat kedua — persis yang
// dilarang di atas. Jumlah tugas per voyage adalah puluhan (satu checklist),
// bukan puluhan ribu, jadi menyerahkan keputusannya bulat-bulat ke fungsi murni
// tidak berbiaya nyata dan membuat laporan "12 diperiksa, 3 digeser" jujur.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { catatAudit, type Jejak } from '../finance/audit'
import {
  rencanaGeserJadwal,
  type KeputusanJadwal,
  type TanggalJangkar,
  type TugasUntukJadwal,
} from './task-schedule'

/** Kolom Task yang dibutuhkan fungsi murni — tak satu pun lebih. */
const KOLOM_JADWAL = {
  id: true,
  status: true,
  anchor: true,
  offsetHours: true,
  dueAt: true,
  dueAtManual: true,
} as const

export type HasilSinkronJadwal = {
  voyageId: string
  /** Berapa tugas yang dipertimbangkan (seluruh tugas hidup milik voyage ini). */
  diperiksa: number
  /** Berapa yang benar-benar berubah `dueAt`-nya. */
  digeser: number
  /** Keputusan lengkap per tugas — termasuk ALASAN yang tidak bergeser (K94). */
  rincian: readonly KeputusanJadwal[]
}

const KOSONG = (voyageId: string): HasilSinkronJadwal => ({
  voyageId,
  diperiksa: 0,
  digeser: 0,
  rincian: [],
})

/**
 * K94 — segarkan `dueAt` seluruh tugas satu voyage sesudah tanggalnya bergeser.
 *
 * Dipanggil dari SATU tempat: `updateVoyage()` sesudah perubahan tanggal
 * tersimpan. Bukan trigger database, bukan job terjadwal — keduanya membuat
 * perubahan yang tak terlihat dari kode yang memicunya.
 *
 * Voyage yang tak ditemukan (atau milik tenant lain — guard menyaringnya)
 * mengembalikan hasil kosong, BUKAN lemparan: pemanggilnya sudah membuktikan
 * voyage-nya ada, dan menggagalkan penyuntingan voyage karena urusan tugas
 * bertentangan dengan semangat K96.
 */
export async function sinkronkanJadwalTugas(
  ctx: TenantContext,
  voyageId: string,
  jejak: Jejak = {},
): Promise<HasilSinkronJadwal> {
  const db = forTenant(ctx)

  const voyage = await db.voyage.findFirst({
    where: { id: voyageId, deletedAt: null },
    select: {
      id: true,
      voyageNumber: true,
      eta: true,
      etb: true,
      etc: true,
      etd: true,
      ata: true,
      createdAt: true,
    },
  })
  if (!voyage) return KOSONG(voyageId)

  // `voyageCreatedAt` adalah jangkar sah (K93) untuk butir checklist yang tidak
  // bergantung tanggal kapal sama sekali — mis. "siapkan berkas keagenan".
  const jangkar: TanggalJangkar = {
    eta: voyage.eta,
    etb: voyage.etb,
    etc: voyage.etc,
    etd: voyage.etd,
    ata: voyage.ata,
    voyageCreatedAt: voyage.createdAt,
  }

  const tugas = (await db.task.findMany({
    where: { voyageId, deletedAt: null },
    select: KOLOM_JADWAL,
  })) as TugasUntukJadwal[]

  if (tugas.length === 0) return KOSONG(voyageId)

  const { keputusan, perluDigeser } = rencanaGeserJadwal(tugas, jangkar)

  if (perluDigeser.length === 0) {
    // Tidak ada yang bergerak → TIDAK menulis AuditLog. Penyuntingan voyage yang
    // tak menyentuh tugas apa pun tidak boleh meninggalkan jejak seolah-olah ia
    // menyentuh sesuatu; itu kebisingan yang membuat audit log berhenti dibaca.
    return { voyageId, diperiksa: tugas.length, digeser: 0, rincian: keputusan }
  }

  // Satu transaksi: pergeseran massal adalah SATU peristiwa, dan setengah
  // checklist yang bergeser lebih menyesatkan daripada tak satu pun bergeser.
  await db.$transaction(
    perluDigeser.map((p) =>
      db.task.updateMany({ where: { id: p.id, deletedAt: null }, data: { dueAt: p.dueAt } }),
    ),
  )

  // K94 — SATU baris AuditLog tingkat voyage, bukan satu per tugas. Yang dicatat
  // cukup untuk menjawab "kenapa tenggat saya berubah": jangkar barunya apa,
  // berapa yang ikut, dan tugas mana saja dari kapan ke kapan.
  await catatAudit(
    ctx,
    {
      tableName: 'Voyage',
      recordId: voyageId,
      action: 'UPDATE',
      newValue: {
        peristiwa: 'SINKRON_JADWAL_TUGAS',
        voyageNumber: voyage.voyageNumber,
        jangkar: {
          eta: voyage.eta?.toISOString() ?? null,
          etb: voyage.etb?.toISOString() ?? null,
          etc: voyage.etc?.toISOString() ?? null,
          etd: voyage.etd?.toISOString() ?? null,
          ata: voyage.ata?.toISOString() ?? null,
        },
        diperiksa: tugas.length,
        digeser: perluDigeser.length,
        tugas: keputusan
          .filter((k): k is Extract<KeputusanJadwal, { geser: true }> => k.geser)
          .slice(0, 50)
          .map((k) => ({
            id: k.id,
            dari: k.dueAtLama?.toISOString() ?? null,
            ke: k.dueAtBaru.toISOString(),
          })),
      },
    },
    jejak,
  )

  return {
    voyageId,
    diperiksa: tugas.length,
    digeser: perluDigeser.length,
    rincian: keputusan,
  }
}

/**
 * Apakah dua kumpulan tanggal jangkar berbeda? Dipakai `updateVoyage()` supaya
 * sinkronisasi hanya berjalan saat tanggal MEMANG berubah — penyuntingan catatan
 * atau ganti customer tidak boleh membangkitkan baris audit pergeseran jadwal.
 *
 * Tinggal di sini, bukan di voyage.service.ts, karena daftar jangkar adalah
 * pengetahuan modul jadwal: menambah jangkar baru kelak berarti menyunting satu
 * berkas ini, bukan berburu ke modul master.
 */
export const MEDAN_JANGKAR = ['eta', 'etb', 'etc', 'etd', 'ata'] as const

export type MedanJangkar = (typeof MEDAN_JANGKAR)[number]

const waktu = (d: Date | null | undefined): number | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null

export function tanggalJangkarBerubah(
  sebelum: Partial<Record<MedanJangkar, Date | null>>,
  sesudah: Partial<Record<MedanJangkar, Date | null>>,
): boolean {
  return MEDAN_JANGKAR.some((k) => waktu(sebelum[k]) !== waktu(sesudah[k]))
}
