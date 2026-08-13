// Bentuk `KonteksAI` + pemotongan deterministik — MURNI, tanpa satu pun impor
// nilai (K51, mengikuti K11). Lihat docs/FASE-6-AI-LAYER.md §7/K76.
//
// `KonteksAI` adalah proyeksi **berdaftar-putih** dari entitas v2: yang tidak
// disebut di tipe ini tidak pernah terkirim ke model — termasuk email pengguna,
// `npwp`, data bank tenant, id internal selain yang perlu, dan apa pun milik
// tenant lain. Daftar putih, bukan daftar hitam: daftar hitam berarti setiap
// kolom baru di skema otomatis ikut terkirim sampai ada yang ingat melarangnya.
//
// Berkas ini HANYA memegang bentuk & pemotongannya. Yang membangun isinya adalah
// `konteks.service.ts` (6f) lewat service yang SAMA dengan yang dipakai UI —
// sehingga hak akses peran ikut otomatis (K76/1), dan tak ada sistem izin kedua.
//
// Kontrak K51: `import type` SAJA, tak melempar untuk kondisi domain, tak ada
// `new Date()`.

export type JenisKonteks = 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE'

export type BarisKonteks = {
  deskripsi: string
  qty: number
  unit: string | null
  harga: number
  jumlah: number
}

export type TotalKonteks = {
  subtotal: number
  agency: number
  pajak: number
  grandTotal: number
  mataUang: string
}

/** Bentuk persis K76, ditambah satu field pelaporan pemotongan (lihat `potongKonteks`). */
export type KonteksAI = {
  jenis: JenisKonteks
  /** 1–2 kalimat: kapal, pelabuhan, tanggal, status. */
  ringkas: string
  /** GT, ETA/ETB/ETD, etmal, base currency, dst. */
  fakta: Record<string, string | number | null>
  baris?: BarisKonteks[]
  total?: TotalKonteks
  warning?: { kode: string; pesan: string }[]
  variance?: { ringkasan: string; barisTeratas: string[] }
  prediksi?: { serviceCode: string; median: number; tier: string; nNyata: number }[]
  anomali?: { kode: string; pesan: string }[]
  /**
   * Diisi HANYA bila `baris` dipotong. K76/3 mewajibkan pemotongan dilaporkan di
   * DALAM konteks, bukan di log server: konteks yang terpotong diam-diam
   * menghasilkan jawaban yang percaya diri atas data yang tak lengkap, dan model
   * tak punya cara lain untuk tahu bahwa ia sedang melihat sebagian.
   */
  catatanPemotongan?: string
}

/** K76/3 — anggaran bawaan, supaya biaya per klik tak tergantung besarnya voyage (K54). */
export const ANGGARAN_KARAKTER_BAWAAN = 8000

/**
 * Ruang yang disisihkan untuk `catatanPemotongan` itu sendiri sebelum baris
 * dihitung. Tanpa ini, menambahkan catatan bisa mendorong payload melewati
 * anggaran yang baru saja dipenuhi — pagar yang membatalkan dirinya sendiri.
 */
const CADANGAN_CATATAN = 160

/**
 * Ukuran konteks. JSON dipakai sebagai PENGGARIS, bukan sebagai janji format
 * kawat: pemanggil bebas menyerialisasi dengan cara lain (mis. YAML ringkas),
 * dan anggaran di sini tetap jadi batas atas yang masuk akal karena JSON adalah
 * bentuk paling boros di antara yang mungkin dipakai.
 *
 * `JSON.stringify` adalah global bawaan, bukan impor — kontrak K51 tetap utuh.
 */
export function ukuranKonteks(konteks: KonteksAI): number {
  try {
    return JSON.stringify(konteks).length
  } catch {
    // Struktur bersiklus tak mungkin lolos ke sini lewat jalur normal (semua
    // field bertipe primitif), tapi mengembalikan Infinity lebih aman daripada
    // melempar: pemanggil akan memotong sampai habis, bukan gagal total.
    return Number.POSITIVE_INFINITY
  }
}

/** Nilai yang menentukan urutan pemotongan (K76/3: `|amountBase|` menurun). */
function bobot(baris: BarisKonteks): number {
  return Number.isFinite(baris.jumlah) ? Math.abs(baris.jumlah) : 0
}

/**
 * Urutan pemotongan yang deterministik: `|jumlah|` menurun, lalu `deskripsi`
 * menaik, lalu urutan asli. Dua kunci tambahan itu bukan kemewahan — tanpa
 * tie-break, dua baris bernilai sama bisa bertukar tempat antar pemanggilan
 * (implementasi `sort` boleh tidak stabil pada tipe non-array-primitif di masa
 * lalu), dan konteks yang berubah tanpa datanya berubah membuat jawaban asisten
 * ikut berubah tanpa sebab.
 */
function urutkanUntukPemotongan(baris: readonly BarisKonteks[]): BarisKonteks[] {
  return baris
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const selisih = bobot(y.b) - bobot(x.b)
      if (selisih !== 0) return selisih
      if (x.b.deskripsi !== y.b.deskripsi) return x.b.deskripsi < y.b.deskripsi ? -1 : 1
      return x.i - y.i
    })
    .map((x) => x.b)
}

export const CATATAN_PEMOTONGAN: Readonly<
  Record<'id' | 'en', (ditampilkan: number, total: number) => string>
> = {
  id: (ditampilkan, total) =>
    `${ditampilkan} dari ${total} baris ditampilkan, diurutkan dari nilai terbesar.`,
  en: (ditampilkan, total) =>
    `${ditampilkan} of ${total} lines shown, sorted by largest value first.`,
}

export type OpsiPemotongan = {
  anggaranKarakter?: number
  bahasa?: 'id' | 'en'
}

/**
 * K76/3 — potong `baris` sampai konteks muat anggaran, deterministik, dan
 * SELALU beri catatan bila ada yang dipotong.
 *
 * Perilaku yang disengaja:
 *   - Muat tanpa dipotong → objek dikembalikan APA ADANYA, urutan baris asli
 *     dipertahankan. Urutan dokumen punya arti bagi pembaca (seksi A/B/C), dan
 *     mengacaknya tanpa perlu adalah kerugian tanpa imbalan.
 *   - Tidak muat → baris diurutkan `|jumlah|` menurun lalu dipotong dari ekor.
 *     Yang dipertaruhkan saat memotong adalah baris mana yang PALING mungkin
 *     ditanyakan orang, dan itu selalu yang terbesar.
 *   - Bahkan tanpa satu baris pun konteks masih kelewat besar → semua baris
 *     dibuang dan catatannya tetap dipasang ("0 dari 40 baris ditampilkan").
 *     Membuang catatan demi memenuhi anggaran akan membuat model mengira ia
 *     melihat dokumen tanpa baris.
 *
 * Objek asli tidak pernah diubah (pemanggilnya adalah service yang memakai objek
 * yang sama untuk hal lain).
 */
export function potongKonteks(konteks: KonteksAI, opsi: OpsiPemotongan = {}): KonteksAI {
  const anggaran =
    Number.isFinite(opsi.anggaranKarakter) && (opsi.anggaranKarakter as number) > 0
      ? (opsi.anggaranKarakter as number)
      : ANGGARAN_KARAKTER_BAWAAN
  const bahasa = opsi.bahasa ?? 'id'

  const semua = konteks.baris ?? []
  if (semua.length === 0) return { ...konteks }
  if (ukuranKonteks(konteks) <= anggaran) return { ...konteks }

  const terurut = urutkanUntukPemotongan(semua)

  // Ukur dengan catatan sudah terpasang (dan cadangan tambahan), supaya jumlah
  // yang dilaporkan tidak pernah membuat hasilnya melewati anggaran.
  const muat = (jumlah: number): boolean => {
    const calon: KonteksAI = {
      ...konteks,
      baris: terurut.slice(0, jumlah),
      catatanPemotongan: CATATAN_PEMOTONGAN[bahasa](jumlah, semua.length),
    }
    return ukuranKonteks(calon) + CADANGAN_CATATAN <= anggaran
  }

  let dipakai = 0
  for (let n = semua.length; n >= 1; n--) {
    if (muat(n)) {
      dipakai = n
      break
    }
  }

  return {
    ...konteks,
    baris: terurut.slice(0, dipakai),
    catatanPemotongan: CATATAN_PEMOTONGAN[bahasa](dipakai, semua.length),
  }
}
