// Penyajian isi lampiran (K108).
//
// ⚠️ INI SATU-SATUNYA jalan keluar berkas lampiran dari sistem. Larangan yang
// menyertainya, dan alasannya:
//
//   - TIDAK ADA direktori unggahan di bawah `public/`. Next.js menyajikan
//     `public/` TANPA melewati satu baris pun kode kita — menaruh lampiran di
//     sana sama dengan menerbitkan seluruh dokumen keuangan pelanggan ke
//     internet, dan kesalahan itu tidak akan menghasilkan galat apa pun untuk
//     memberi tahu kita.
//   - TIDAK ADA URL yang memuat `storageKey`. Karena itu `storageKey` juga
//     tidak pernah ikut di respons daftar (lihat KOLOM_AMAN di service).
//   - `Content-Type` & nama berkas diambil dari BARIS DATABASE, bukan dari
//     tebakan atas ekstensi berkas di disk.

import { withTenant } from '@/services/http'
import { bacaIsiAttachment } from '@/services/ops/attachment.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

/**
 * Tipe yang, kalau suatu saat lolos ke daftar putih unggahan, TIDAK BOLEH
 * dirender di dalam origin aplikasi — ia bisa membawa script dan akan berjalan
 * dengan sesi pengguna. Daftar putih K109 saat ini memang sudah menolak
 * keduanya sejak di pintu masuk; pemeriksaan di sini adalah lapis kedua yang
 * tetap berlaku andai daftar itu kelak diperlonggar.
 */
const WAJIB_UNDUH = new Set(['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml'])

/** Header yang aman untuk berkas kiriman pengguna. */
function headerAman(mime: string, fileName: string, ukuran: number): Headers {
  const h = new Headers()
  h.set('Content-Type', mime)
  h.set('Content-Length', String(ukuran))

  // `inline` hanya untuk tipe yang aman dipandang langsung; sisanya diunduh.
  const disposisi = WAJIB_UNDUH.has(mime) ? 'attachment' : 'inline'
  // RFC 5987: nama ASCII sebagai cadangan + nama UTF-8 yang sudah di-encode.
  const asciiAman = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  h.set(
    'Content-Disposition',
    `${disposisi}; filename="${asciiAman}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  )

  // Menutup satu kelas serangan dengan harga nyaris nol: berkas tidak boleh
  // memuat apa pun dari luar, dan browser tidak boleh menebak-nebak tipenya
  // (tebakan itulah yang membuat berkas "gambar" berisi HTML bisa dieksekusi).
  h.set('Content-Security-Policy', "default-src 'none'; sandbox")
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('X-Frame-Options', 'DENY')
  h.set('Referrer-Policy', 'no-referrer')
  // Lampiran adalah data pelanggan — jangan sampai menetap di cache bersama.
  h.set('Cache-Control', 'private, no-store')
  return h
}

// GET /api/attachments/[id]/content
//   tanpa sesi        → 401 (withTenant)
//   sesi tenant lain  → 404 (forTenant + K85, bukan 403 — aturan #6)
//   sesi pemilik      → byte identik dengan yang diunggah
export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  const { row, isi } = await bacaIsiAttachment(ctx, params.id)
  return new Response(new Uint8Array(isi), {
    status: 200,
    headers: headerAman(row.mimeType, row.fileName, isi.length),
  })
})
