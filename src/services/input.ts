// Pembaca field dari body request. Menggantikan parser yang selama ini ditulis
// ulang di tiap modul (mis. lib/vessels.ts) agar semua modul Fase 1 seragam.
//
// Aturan tetap: string kosong dianggap "tidak diisi" → null, bukan "".
// Alasannya kolom opsional di DB bertipe nullable; menyimpan "" membuat query
// `IS NULL` meleset dan laporan jadi salah hitung.

import { validation } from './errors'

export const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

export const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const int = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : Math.trunc(n)
}

export const bool = (v: unknown, bawaan = false): boolean => {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 1 || v === '1') return true
  if (v === 'false' || v === 0 || v === '0') return false
  return bawaan
}

export const tanggal = (v: unknown): Date | null => {
  const s = str(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Wajib diisi. Melempar VALIDATION dengan nama field yang jelas bagi pengguna. */
export function wajib(nilai: string | null, namaField: string): string {
  if (!nilai) throw validation(`${namaField} wajib diisi.`)
  return nilai
}

/** Nilai harus salah satu dari daftar (dipakai untuk kolom enum). */
export function pilihan<T extends string>(
  v: unknown,
  daftar: readonly T[],
  namaField: string,
  bawaan?: T,
): T {
  const s = str(v)
  if (!s) {
    if (bawaan !== undefined) return bawaan
    throw validation(`${namaField} wajib diisi.`)
  }
  if (!daftar.includes(s as T)) {
    throw validation(`${namaField} tidak sah. Pilihan: ${daftar.join(', ')}.`)
  }
  return s as T
}
