// Kosongkan objek data contoh untuk state awal form → dokumen BARU tampil bersih
// (tanpa "sisa angka"/data contoh). Aturan: string → ''; array → []; objek →
// rekursif; angka & boolean (default konfigurasi seperti agency %, PPN %) tetap.
// Data contoh asli tetap utuh untuk tombol "Lihat contoh".
export function blankSample<T>(s: T): T {
  if (Array.isArray(s)) return [] as unknown as T
  if (s && typeof s === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) out[k] = blankSample(v)
    return out as T
  }
  if (typeof s === 'string') return '' as unknown as T
  return s
}
