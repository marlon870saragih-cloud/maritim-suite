// Status backup yang TERLIHAT — K186 (Fase 8k).
//
// Backup sendiri adalah pekerjaan operasional (`pg_dump` terjadwal + berkas
// unggahan) dan TIDAK didesain di sini. Yang didesain adalah ujungnya yang
// terlihat, karena **backup yang tak pernah dilihat siapa pun adalah backup
// yang tak pernah ketahuan rusak**.
//
// `SystemConfig` SENGAJA bukan model bertenant: status backup adalah urusan
// operator aplikasi (Marlon), bukan data tenant mana pun. Karena itu berkas
// ini memakai `prisma` MENTAH, bukan `forTenant()` — satu-satunya cara yang
// benar untuk tabel yang memang tak punya `tenantId`. Yang dijaga sebagai
// gantinya: penulisannya HANYA lewat job ber-token (K88), dan pembacaannya
// hanya mengembalikan ringkasan (waktu, berhasil/tidak, ukuran) — tak ada
// data tenant mana pun yang bisa bocor lewat jalur ini.
//
// **Uji pemulihan** adalah butir checklist go-live, BUKAN kode (K186): pulihkan
// ke database kosong, hitung baris, buka satu voyage. Backup yang belum pernah
// dipulihkan bukan backup, ia harapan. Modul ini tidak bisa dan tidak berpura-
// pura membuktikan hal itu.

import { prisma } from '@/lib/prisma'

/** K186 — "peringatan merah bila lebih dari 48 jam". */
export const AMBANG_PERINGATAN_JAM = 48

const ID_SINGLETON = 'singleton'

export type StatusBackup = {
  terakhirPada: string | null
  berhasil: boolean | null
  ukuranBytes: number | null
  pesan: string | null
  /** Jam sejak backup terakhir — null bila belum pernah ada. */
  usiaJam: number | null
  /**
   * true bila sudah waktunya khawatir: belum pernah ada backup, backup
   * terakhir GAGAL, atau usianya melewati ambang. Ketiganya dijadikan SATU
   * bendera karena di layar ketiganya menuntut tindakan yang sama.
   */
  perluPerhatian: boolean
  ambangJam: number
}

function ringkas(row: {
  backupTerakhirPada: Date | null
  backupBerhasil: boolean | null
  backupUkuranBytes: number | null
  backupPesan: string | null
} | null): StatusBackup {
  const terakhir = row?.backupTerakhirPada ?? null
  const usiaJam = terakhir ? (Date.now() - terakhir.getTime()) / 3_600_000 : null
  return {
    terakhirPada: terakhir?.toISOString() ?? null,
    berhasil: row?.backupBerhasil ?? null,
    ukuranBytes: row?.backupUkuranBytes ?? null,
    pesan: row?.backupPesan ?? null,
    usiaJam: usiaJam === null ? null : Math.round(usiaJam * 10) / 10,
    perluPerhatian: !terakhir || row?.backupBerhasil === false || (usiaJam ?? 0) > AMBANG_PERINGATAN_JAM,
    ambangJam: AMBANG_PERINGATAN_JAM,
  }
}

/**
 * Dibaca layar Settings › Kepatuhan. Sengaja TIDAK menerima TenantContext:
 * tak ada yang bisa dibedakan per tenant di sini, dan menerima ctx akan
 * memberi kesan palsu bahwa ada.
 *
 * Pagar perannya dipasang di ROUTE (ADMIN/DIREKTUR, K186 tabel peran) —
 * lihat api/settings/backup-status/route.ts.
 */
export async function statusBackup(): Promise<StatusBackup> {
  const row = await prisma.systemConfig.findUnique({ where: { id: ID_SINGLETON } })
  return ringkas(row)
}

export type LaporBackup = {
  berhasil: boolean
  ukuranBytes?: number | null
  pesan?: string | null
  /** Waktu backup — dipakai uji untuk memundurkan jam (§17/8k butir 6). */
  terakhirPada?: Date
}

/**
 * Dicatat oleh `POST /api/jobs/run?job=backup-status` (K88, ber-token).
 * Upsert pada satu baris: skrip backup di server memanggilnya setiap kali
 * selesai, berhasil maupun gagal — GAGAL justru yang paling penting tercatat,
 * karena itulah satu-satunya cara kartu merah bisa muncul sebelum ada yang
 * benar-benar butuh backup-nya.
 */
export async function catatHasilBackup(input: LaporBackup): Promise<StatusBackup> {
  const data = {
    backupTerakhirPada: input.terakhirPada ?? new Date(),
    backupBerhasil: input.berhasil,
    backupUkuranBytes: input.ukuranBytes ?? null,
    backupPesan: input.pesan ?? null,
  }
  const row = await prisma.systemConfig.upsert({
    where: { id: ID_SINGLETON },
    create: { id: ID_SINGLETON, ...data },
    update: data,
  })
  return ringkas(row)
}
