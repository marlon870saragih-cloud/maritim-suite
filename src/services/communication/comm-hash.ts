// JSON kanonik + sidik jari WA-1 (Step 2A). Satu-satunya impor: node:crypto.
//
// SENGAJA salinan lokal, bukan impor dari services/intake/intake-policy.ts:
// berkas intake dipakai sebagai sidik rilis produksi, jadi modul komunikasi tidak
// boleh terkait dengannya. Semantik sama (kunci objek terurut, `undefined`
// dibuang) — PostgreSQL JSONB menyusun ulang kunci, jadi perbandingan WAJIB lewat
// bentuk kanonik. Tambahan: nilai yang tak punya bentuk JSON stabil (bilangan
// tak hingga/NaN, BigInt, fungsi, Date) DITOLAK alih-alih diam-diam diubah.

import { createHash } from 'node:crypto'

export function jsonKanonikKomunikasi(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : jsonKanonikKomunikasi(x))).join(',')}]`
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return JSON.stringify(v)
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError('Bilangan tak hingga/NaN tidak punya bentuk kanonik.')
      return JSON.stringify(v)
    case 'object': {
      if (v instanceof Date) throw new TypeError('Date harus diubah ke ISO lebih dulu.')
      const o = v as Record<string, unknown>
      return `{${Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${jsonKanonikKomunikasi(o[k])}`)
        .join(',')}}`
    }
    default:
      throw new TypeError(`Tipe ${typeof v} tidak punya bentuk kanonik.`)
  }
}

/** sha256 hex atas JSON kanonik, berawalan domain supaya sidik antarjenis tak bisa tertukar. */
export function sidikJariKomunikasi(domain: 'WA1_SOURCE' | 'WA1_SNAPSHOT', v: unknown): string {
  return createHash('sha256').update(`${domain}\n`).update(jsonKanonikKomunikasi(v), 'utf8').digest('hex')
}
