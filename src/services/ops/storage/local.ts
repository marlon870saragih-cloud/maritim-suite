// Adapter penyimpanan berkas — bawaan disk lokal (K107).
//
// Antarmuka `PenyimpananBerkas` sengaja hanya tiga metode. Fase 8 PASTI
// memindahkan ini ke object storage (disk lokal tidak selamat dari deploy ulang
// di platform mana pun), dan dengan adapter pemindahan itu = satu berkas baru +
// satu skrip salin, bukan menyentuh setiap pemanggil.
//
// Kenapa BUKAN kolom Bytes di Postgres: backup membengkak dari megabyte ke
// gigabyte, setiap `SELECT *` yang ceroboh menarik berkas, dan Prisma memuat
// seluruhnya ke memori.

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path'

export type PenyimpananBerkas = {
  simpan(kunci: string, isi: Buffer, mime: string): Promise<void>
  baca(kunci: string): Promise<Buffer>
  hapus(kunci: string): Promise<void>
}

/** Direktori unggahan. Env `UPLOAD_DIR`, bawaan `./.uploads` (masuk .gitignore). */
export function direktoriUnggahan(): string {
  const dari = process.env.UPLOAD_DIR?.trim() || './.uploads'
  return isAbsolute(dari) ? normalize(dari) : resolve(process.cwd(), dari)
}

/**
 * Ubah kunci logis jadi path absolut, sambil MEMBUKTIKAN hasilnya masih di
 * dalam direktori unggahan.
 *
 * Ini lapis kedua. Lapis pertama ada di attachment.service.ts (normalisasi nama
 * berkas + kunci yang seluruh bagiannya dibangkitkan sistem). Dua lapis dipakai
 * karena harga kesalahannya — menulis/membaca berkas sembarang di disk server —
 * jauh lebih besar daripada harga satu pemeriksaan tambahan.
 */
function pathDariKunci(kunci: string): string {
  if (!kunci || kunci.includes('\0')) throw new Error('[storage] kunci tidak sah.')
  const akar = direktoriUnggahan()
  const penuh = resolve(akar, normalize(kunci))
  // `sep` di belakang akar penting: tanpa itu, "/data/uploads-lain" lolos
  // pemeriksaan terhadap akar "/data/uploads".
  if (penuh !== akar && !penuh.startsWith(akar + sep)) {
    throw new Error(`[storage] kunci "${kunci}" keluar dari direktori unggahan — ditolak.`)
  }
  return penuh
}

export const penyimpananLokal: PenyimpananBerkas = {
  async simpan(kunci, isi) {
    const path = pathDariKunci(kunci)
    await mkdir(dirname(path), { recursive: true })
    // `wx` — gagal bila berkas sudah ada. Kunci memuat cuid, jadi tabrakan
    // berarti ada yang salah dengan pembangkit kunci; lebih baik gagal keras
    // daripada diam-diam menimpa lampiran orang lain.
    await writeFile(path, isi, { flag: 'wx' })
  },

  async baca(kunci) {
    return readFile(pathDariKunci(kunci))
  },

  /**
   * ⚠️ K110 — TIDAK ADA jalur kode Fase 7 yang memanggil ini. Hapus lampiran =
   * soft delete; berkas fisik dipertahankan sampai kebijakan retensi ada (P36).
   * Metodenya tetap disediakan karena ia bagian dari antarmuka yang harus
   * dipenuhi adapter object storage nanti — bukan karena ia dipakai sekarang.
   */
  async hapus(kunci) {
    await unlink(pathDariKunci(kunci)).catch(() => undefined)
  },
}

/**
 * ⚠️ PENYIMPANGAN dari K107, ditulis sadar (bukan kelalaian).
 *
 * K107 menyebut kunci `${tenantId}/${YYYY}/${MM}/${cuid}${ext}` dengan alasan
 * eksplisit: *"memuat cuid supaya tak bisa ditebak"*. Repo ini tidak punya
 * pustaka cuid yang bisa dipanggil dari kode (Prisma membangkitkannya sendiri
 * di dalam `@default(cuid())` dan tidak mengekspornya), dan menambah dependensi
 * baru hanya untuk ini tidak sepadan.
 *
 * Yang dipakai sebagai gantinya: token acak kriptografis 128-bit. Ia memenuhi
 * sifat yang K107 minta — bahkan lebih kuat, karena cuid mengandung timestamp &
 * penghitung yang sebagian bisa diterka, sedangkan ini tidak.
 *
 * Konsekuensi yang disengaja: nama berkas di disk BUKAN `Attachment.id`. Itu
 * justru menguntungkan — bocornya sebuah id lampiran tidak memberi tahu apa pun
 * tentang letak berkasnya. `Attachment.id` tetap cuid biasa lewat
 * `@default(cuid())`, jadi tidak ada model yang menyimpang polanya.
 */
export const buatTokenBerkas = (): string => randomBytes(16).toString('hex')

/** Kunci: `${tenantId}/${YYYY}/${MM}/${token}${ext}` (K107, lihat catatan di atas). */
export function buatStorageKey(
  tenantId: string,
  token: string,
  ext: string,
  saat = new Date(),
): string {
  const tahun = saat.getUTCFullYear()
  const bulan = String(saat.getUTCMonth() + 1).padStart(2, '0')
  // tenantId memuat identitas pemilik supaya salah tenant terlihat bahkan saat
  // memeriksa berkas dengan mata; token membuat kunci tak bisa ditebak.
  return `${tenantId}/${tahun}/${bulan}/${token}${ext}`
}

export const sha256 = (isi: Buffer): string => createHash('sha256').update(isi).digest('hex')
