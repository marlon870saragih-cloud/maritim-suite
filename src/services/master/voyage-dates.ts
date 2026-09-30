// Tanggal voyage — logika murni, TANPA impor (PRD-002 Step 2 / D4).
//
// ETA/ETB/ETC/ETD/ATA/ATB/ATD bersemantik TANGGAL KALENDER, bukan jam: form
// Voyage memakai <input type="date">, services/input.ts `tanggal()` menyimpannya
// sebagai 00:00 UTC, dan UI menampilkannya dengan timeZone 'UTC'. Karena itu
// perbandingan & jejak audit di sini memakai kunci "YYYY-MM-DD" dari komponen
// UTC — tanpa konversi zona waktu. "ETA 20 Sep" berarti 20 Sep, di zona mana pun;
// ia TIDAK boleh ditafsirkan ulang sebagai "20 Sep 00:00 WITA".
//
// Tanpa impor supaya bisa diuji langsung oleh Node (prisma/check-voyage-vessels.mjs).

export const MEDAN_TANGGAL_VOYAGE = ['eta', 'etb', 'etc', 'etd', 'ata', 'atb', 'atd'] as const
export type MedanTanggalVoyage = (typeof MEDAN_TANGGAL_VOYAGE)[number]

type NilaiTanggal = Date | string | null | undefined

/** Kunci tanggal kalender "YYYY-MM-DD" (komponen UTC), atau null. */
export function kunciTanggal(d: NilaiTanggal): string | null {
  if (!d) return null
  const v = d instanceof Date ? d : new Date(d)
  return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
}

export type PerubahanTanggal = {
  medan: MedanTanggalVoyage[]
  lama: Partial<Record<MedanTanggalVoyage, string | null>>
  baru: Partial<Record<MedanTanggalVoyage, string | null>>
}

/**
 * Medan tanggal yang BENAR berubah pada tingkat tanggal kalender. `null` bila
 * tidak ada — penyuntingan catatan/customer tidak boleh menerbitkan jejak
 * "tanggal berubah" (semangat yang sama dengan tanggalJangkarBerubah, K94).
 */
export function perubahanTanggalVoyage(
  sebelum: Partial<Record<MedanTanggalVoyage, NilaiTanggal>>,
  sesudah: Partial<Record<MedanTanggalVoyage, NilaiTanggal>>,
): PerubahanTanggal | null {
  const hasil: PerubahanTanggal = { medan: [], lama: {}, baru: {} }
  for (const k of MEDAN_TANGGAL_VOYAGE) {
    const a = kunciTanggal(sebelum[k])
    const b = kunciTanggal(sesudah[k])
    if (a !== b) {
      hasil.medan.push(k)
      hasil.lama[k] = a
      hasil.baru[k] = b
    }
  }
  return hasil.medan.length ? hasil : null
}
