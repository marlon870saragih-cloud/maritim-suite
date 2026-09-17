// Hash input Vessel Call Intake (PRD-004 Step 3, §20). Isi mentah TIDAK disimpan;
// hanya sidik jarinya, supaya permintaan yang sama tak diproses (dan ditagih AI) dua kali.
//
// Teks WAJIB sudah melewati normalisasiTeksSumber() (intake-policy.ts) oleh pemanggil,
// sehingga spasi/CRLF tak mengubah hash. Berkas: byte mentah.
// Hanya impor tipe (dihapus saat dijalankan Node) — bisa diuji langsung.

import { createHash } from 'node:crypto'
import type { JenisInput } from './intake-policy'

export function hashInput(jenis: JenisInput, isi: string | Uint8Array): string {
  const h = createHash('sha256').update(`${jenis}\n`)
  if (typeof isi === 'string') h.update(isi, 'utf8')
  else h.update(isi)
  return h.digest('hex')
}
