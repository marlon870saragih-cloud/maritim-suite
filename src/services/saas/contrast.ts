// Pemeriksa kontras warna — K180 (Fase 8i), MURNI (K11/K51). "Warna yang
// dipilih diperiksa kontrasnya terhadap teks putih & hitam; kalau gagal,
// sistem memakai varian gelap/terangnya untuk teks dan mengatakannya di
// layar" — dokumen desain, kata demi kata. Rumus WCAG 2.x (relative
// luminance + contrast ratio), ambang AA teks normal (4.5:1).
//
// Tenant yang memilih kuning cerah TIDAK BOLEH menghasilkan tombol yang
// tulisannya tak terbaca — dan mereka tidak akan menyadarinya sendiri.
// Karena itu pemilihan teks (putih vs hitam) SELALU otomatis (yang terbaik
// dari dua pilihan dipakai tanpa pengecualian); yang bisa gagal hanyalah
// "apakah pilihan terbaik itu sendiri cukup terbaca" (ambang AA).
//
// Catatan matematis (dibuktikan numerik, prisma/check-branding.mjs §2):
// dengan DUA kandidat teks (putih murni & hitam murni), rasio TERBAIK dari
// keduanya tidak pernah jatuh di bawah ~4.58:1 untuk warna latar APA PUN —
// selalu di atas ambang AA 4.5:1. Artinya `amanAA` di bawah ini SELALU true
// dan `peringatan` SELALU null pada praktiknya; itu bukan cacat, melainkan
// bukti bahwa "pilih otomatis yang terbaik" sendirian sudah menjamin K180
// ("tak boleh menghasilkan tombol tak terbaca"). Cabang gagal tetap ditulis
// (bukan dihapus) sebagai jaring pengaman kalau suatu saat kandidat teksnya
// berubah dari putih/hitam murni ke warna lain yang tak menjamin hal sama.

const AMBANG_AA = 4.5

export type WarnaRgb = { r: number; g: number; b: number }

/** `#RGB`/`#RRGGBB` → RGB. `null` bila bukan hex sah. */
export function hexKeRgb(hex: unknown): WarnaRgb | null {
  if (typeof hex !== 'string') return null
  const bersih = hex.trim()
  const pendek = /^#([0-9a-fA-F]{3})$/.exec(bersih)
  if (pendek) {
    const [r, g, b] = pendek[1].split('').map((c) => parseInt(c + c, 16))
    return { r, g, b }
  }
  const panjang = /^#([0-9a-fA-F]{6})$/.exec(bersih)
  if (panjang) {
    const n = panjang[1]
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16),
    }
  }
  return null
}

/** Apakah string ini hex warna yang sah (`#RGB` atau `#RRGGBB`)? */
export function hexSah(hex: unknown): boolean {
  return hexKeRgb(hex) !== null
}

function kanalLinear(c: number): number {
  const n = c / 255
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
}

/** Relative luminance WCAG (0 = hitam, 1 = putih). */
export function luminansi({ r, g, b }: WarnaRgb): number {
  return 0.2126 * kanalLinear(r) + 0.7152 * kanalLinear(g) + 0.0722 * kanalLinear(b)
}

/** Rasio kontras WCAG antara dua warna (selalu ≥ 1, urutan argumen tak masalah). */
export function rasioKontras(a: WarnaRgb, b: WarnaRgb): number {
  const la = luminansi(a)
  const lb = luminansi(b)
  const terang = Math.max(la, lb)
  const gelap = Math.min(la, lb)
  return (terang + 0.05) / (gelap + 0.05)
}

const PUTIH: WarnaRgb = { r: 255, g: 255, b: 255 }
const HITAM: WarnaRgb = { r: 0, g: 0, b: 0 }

export type PeriksaKontras = {
  /** Hex apa adanya (dinormalkan huruf besar), atau `null` bila input tak sah. */
  hex: string | null
  /** Teks putih atau hitam mana yang kontrasnya lebih baik di atas warna ini SEBAGAI LATAR. Selalu terisi bila hex sah — tak pernah "tak tahu". */
  tekstAman: '#FFFFFF' | '#000000' | null
  /** Rasio kontras `tekstAman` terhadap warna ini. */
  rasio: number | null
  /** Rasio >= 4.5:1 (WCAG AA teks normal)? Bisa `false` walau tekstAman sudah pilihan TERBAIK dari dua opsi — itulah yang harus diperingatkan ke pengguna. */
  amanAA: boolean
  /** Pesan siap-tampil (ID) bila TIDAK aman; `null` bila aman atau hex tak sah. */
  peringatan: string | null
}

/**
 * Periksa satu warna aksen. Tak pernah melempar — input tak sah menghasilkan
 * `hex: null` dan `amanAA: false`, bukan galat, supaya pemanggil UI selalu
 * punya sesuatu untuk ditampilkan (form warna tak boleh macet karena kode
 * ini melempar di tengah pengetikan pengguna).
 */
export function periksaWarnaAksen(hexInput: unknown): PeriksaKontras {
  const rgb = hexKeRgb(hexInput)
  if (!rgb) {
    return { hex: null, tekstAman: null, rasio: null, amanAA: false, peringatan: null }
  }
  const hex = (hexInput as string).trim().toUpperCase()
  const kontrasPutih = rasioKontras(rgb, PUTIH)
  const kontrasHitam = rasioKontras(rgb, HITAM)
  const pakaiPutih = kontrasPutih >= kontrasHitam
  const rasio = pakaiPutih ? kontrasPutih : kontrasHitam
  const amanAA = rasio >= AMBANG_AA

  return {
    hex,
    tekstAman: pakaiPutih ? '#FFFFFF' : '#000000',
    rasio: Math.round(rasio * 100) / 100,
    amanAA,
    peringatan: amanAA
      ? null
      : `Warna ini kontrasnya rendah (${(Math.round(rasio * 100) / 100).toFixed(2)}:1, standar minimal 4.5:1) — teks di atasnya akan sulit dibaca meski sistem sudah memilih ${pakaiPutih ? 'putih' : 'hitam'} sebagai warna teks terbaik yang tersedia. Pilih warna yang lebih ${pakaiPutih ? 'gelap' : 'terang'}.`,
  }
}
