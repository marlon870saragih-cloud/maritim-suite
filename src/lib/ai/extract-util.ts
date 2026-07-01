// Helper bersama untuk ekstraktor dokumen: jalankan satu tool-call & kembalikan JSON.
// Plus catatan pengaman uang yang dipakai di semua system prompt dokumen uang.

import { chatCompletion, firstToolArguments, type ToolDef } from './openrouter'

export const MONEY_GUARD =
  'ATURAN KERAS: JANGAN menulis angka uang/tarif/harga satuan/jumlah rupiah apa pun. ' +
  'Itu diisi operator manusia; mesin yang menghitung total. Anda hanya mengisi BAHASA (pihak, ' +
  'referensi, deskripsi). Jangan mengarang nomor dokumen, tanggal, atau angka yang tidak disebut pengguna.'

/** Jalankan ekstraksi via tool-call terpaksa; kembalikan objek JSON hasil parse. */
export async function runToolExtraction(opts: {
  system: string
  tool: ToolDef
  instruction: string
}): Promise<unknown> {
  const resp = await chatCompletion({
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.instruction },
    ],
    tools: [opts.tool],
    toolChoice: { type: 'function', function: { name: opts.tool.function.name } },
  })
  const args = firstToolArguments(resp)
  if (!args) throw new Error('AI tidak mengembalikan data')
  return JSON.parse(args)
}

/** Salin hanya field string non-kosong dari sumber ke target (buang kosong). */
export function pickStrings<T extends object>(src: Record<string, unknown>, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) {
    const v = src[k as string]
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k as string] = v.trim()
  }
  return out
}

/**
 * Paksa field partikular yang TIDAK diisi AI menjadi string kosong, agar saat
 * disimpan tidak jatuh ke nilai contoh (sample) di mergeData. Boilerplate yang
 * tak masuk daftar `keys` dibiarkan absen → tetap pakai default form.
 */
export function blankMissing<T extends object>(out: Partial<T>, keys: (keyof T)[]): Partial<T> {
  for (const k of keys) {
    if (out[k] === undefined) (out as Record<string, unknown>)[k as string] = ''
  }
  return out
}
