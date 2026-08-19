// Attachment Center (K106–K110). Membayar hutang yang Fase 6 tinggalkan di K80.
//
// Enam aturan POLA-SERVICE-LAYER.md §5 berlaku penuh, ditambah satu yang khas
// Fase 7: SETIAP jalur yang menyebut entityId wajib melewati
// pastikanEntitasMilikTenant() lebih dulu (K85).

import type { Attachment } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { bool, str, tanggal } from '../input'
import { pastikanEntitasMilikTenant } from './ownership.service'
// Fase 8c — kuota `penyimpananMB` (K156).
import { pastikanKuota } from '../saas/quota.service'
import {
  buatStorageKey,
  buatTokenBerkas,
  penyimpananLokal,
  sha256,
  type PenyimpananBerkas,
} from './storage/local'

// ----------------------------------------------------------------- kebijakan

/** K109 — batas ukuran interim 20 MB per berkas (P36). */
export const BATAS_UKURAN_BYTE = 20 * 1024 * 1024
export const BATAS_UKURAN_MB = 20

/** K109 — panjang maksimum nama berkas yang disimpan. */
export const BATAS_PANJANG_NAMA = 120

/**
 * ⚠️ DAFTAR PUTIH tipe berkas (K109) — bukan daftar hitam, alasan yang sama
 * dengan ENTITAS_DIDUKUNG: yang lupa disebut harus DITOLAK, bukan diloloskan.
 *
 * Yang sengaja TIDAK ada dan tidak boleh ditambahkan tanpa keputusan sadar:
 *   - .html/.svg — membawa script; kalaupun kelak masuk, K108 mewajibkannya
 *     selalu dikirim sebagai unduhan, tak pernah inline.
 *   - arsip (.zip/.rar) — menyembunyikan isinya dari SEMUA pemeriksaan.
 *   - .exe/.js — tak ada alasan sah melampirkannya pada dokumen keagenan.
 *
 * Pemindaian virus TIDAK ada di Fase 7 (butuh layanan eksternal) — dicatat
 * terbuka di sini, bukan diam-diam, dan diperbaiki di Fase 8 bersama deploy.
 */
export const TIPE_DITERIMA: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
}

const EKSTENSI_DITERIMA: readonly string[] = Object.values(TIPE_DITERIMA).flat()

const LABEL_TIPE = 'PDF, JPG, PNG, WebP, XLSX, XLS, CSV, DOCX, TXT'

export const JENIS_LAMPIRAN = [
  'RECEIPT',
  'RATE_SHEET',
  'CREW_DOC',
  'VENDOR_DOC',
  'CONTRACT',
  'GENERAL',
  // Fase 8i / K181 — logo tenant. Ditulis HANYA lewat branding.service.ts
  // (entityType='TENANT', entityId=ctx.tenantId selalu — lihat catatan di
  // sana), tak pernah lewat uploadAttachment() generik di berkas ini.
  'BRANDING',
  // Fase 8k / K186 — bundel ekspor mandiri (.zip). Ditulis HANYA lewat
  // export.service.ts, pola & alasan sama seperti 'BRANDING': pemiliknya
  // TENANT itu sendiri. Perhatikan .zip SENGAJA tetap di luar TIPE_DITERIMA
  // di atas — daftar putih itu menjaga jalur UNGGAH pihak luar, sedangkan
  // bundel ini dihasilkan sistem sendiri (lihat catatan panjang "KENAPA ZIP"
  // di export.service.ts).
  'EXPORT',
] as const

// ------------------------------------------------------------- normalisasi

/**
 * K109 — buang path, batasi karakter, potong 120 karakter.
 *
 * Nama seperti `../../etc/passwd` atau nama sepanjang 4 KB adalah cara termurah
 * merusak sistem berkas. Perlu ditegaskan: nama ini TIDAK PERNAH dipakai untuk
 * membentuk path di disk — storageKey seluruhnya dibangkitkan sistem
 * (tenantId/tahun/bulan/cuid+ext). Normalisasi di sini melindungi hal lain:
 * header Content-Disposition, tampilan layar, dan ekspor.
 */
export function normalkanNamaBerkas(nama: string | null | undefined): string {
  const mentah = (nama ?? '').replace(/\0/g, '')
  // Ambil segmen terakhir sesudah / maupun \ — menutup path gaya POSIX & Windows.
  const tanpaPath = mentah.split(/[/\\]/).pop() ?? ''
  const bersih = tanpaPath
    .replace(/[\u0000-\u001F\u007F]/g, '') // karakter kendali
    .replace(/[<>:"|?*]/g, '_') // terlarang di Windows
    .replace(/^\.+/, '') // ".." dan berkas tersembunyi → buang titik depan
    .trim()

  if (!bersih) return 'lampiran'
  if (bersih.length <= BATAS_PANJANG_NAMA) return bersih

  // Potong dari TENGAH nama, bukan dari ujung: ekstensi harus selamat, karena
  // ia yang dibaca manusia saat memutuskan mau membuka pakai apa.
  const titik = bersih.lastIndexOf('.')
  if (titik <= 0 || bersih.length - titik > 12) return bersih.slice(0, BATAS_PANJANG_NAMA)
  const ext = bersih.slice(titik)
  return bersih.slice(0, BATAS_PANJANG_NAMA - ext.length) + ext
}

/** Ekstensi (huruf kecil, dengan titik) dari nama yang SUDAH dinormalkan. */
function ekstensiDari(nama: string): string {
  const titik = nama.lastIndexOf('.')
  if (titik <= 0) return ''
  const ext = nama.slice(titik).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

/**
 * K109 — tipe & ukuran. Ditolak dengan pesan yang MENYEBUTKAN batasnya, supaya
 * operator tahu apa yang harus diperbaiki, bukan cuma bahwa ia gagal.
 */
export function periksaBerkas(namaAsli: string, mimeDilaporkan: string | null, ukuran: number) {
  const fileName = normalkanNamaBerkas(namaAsli)
  const ext = ekstensiDari(fileName)

  if (ukuran <= 0) throw validation('Berkas kosong — tidak ada yang bisa disimpan.')
  if (ukuran > BATAS_UKURAN_BYTE) {
    throw validation(
      `Ukuran berkas ${(ukuran / 1024 / 1024).toFixed(1)} MB melebihi batas ${BATAS_UKURAN_MB} MB per berkas.`,
    )
  }

  const mime = (mimeDilaporkan ?? '').split(';')[0].trim().toLowerCase()
  const mimeDikenal = Object.prototype.hasOwnProperty.call(TIPE_DITERIMA, mime)
  const extDikenal = ext !== '' && EKSTENSI_DITERIMA.includes(ext)

  // Keduanya harus lolos. MIME sendirian tak cukup (klien yang menentukannya,
  // jadi ia bisa berbohong); ekstensi sendirian juga tak cukup. Yang disimpan
  // ke DB adalah mime hasil daftar putih ini — bukan yang dilaporkan klien —
  // supaya K108 bisa menyajikan Content-Type dari baris DB dengan aman.
  if (!extDikenal) {
    throw validation(
      `Tipe berkas "${ext || 'tanpa ekstensi'}" tidak diterima. Yang diterima: ${LABEL_TIPE}. ` +
        `Arsip (.zip/.rar), .html, .svg, dan berkas program selalu ditolak.`,
    )
  }
  if (!mimeDikenal) {
    throw validation(
      `Tipe berkas "${mime || 'tidak dikenali'}" tidak diterima. Yang diterima: ${LABEL_TIPE}.`,
    )
  }
  if (!TIPE_DITERIMA[mime].includes(ext)) {
    throw validation(`Ekstensi "${ext}" tidak cocok dengan tipe berkas "${mime}".`)
  }

  return { fileName, ext, mimeType: mime }
}

// ---------------------------------------------------------------- pembacaan

/** Kolom yang aman dikirim ke klien — storageKey SENGAJA tidak pernah ikut (K108). */
const KOLOM_AMAN = {
  id: true,
  entityType: true,
  entityId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  kind: true,
  note: true,
  sensitive: true,
  expiresAt: true,
  uploadedByUserId: true,
  createdAt: true,
  // Fase 8f / K170 — perlu tampil di UI supaya tombol "Bagikan ke portal" tahu keadaannya sekarang.
  sharedToPortal: true,
  sharedAt: true,
} as const

export type AttachmentRingkas = {
  [K in keyof typeof KOLOM_AMAN]: Attachment[K & keyof Attachment]
}

/** Daftar lampiran satu entitas. Kepemilikan entitas dibuktikan dulu (K85). */
export async function listAttachments(
  ctx: TenantContext,
  entityType: unknown,
  entityId: unknown,
): Promise<AttachmentRingkas[]> {
  const terbukti = await pastikanEntitasMilikTenant(ctx, entityType, entityId)
  return forTenant(ctx).attachment.findMany({
    where: { entityType: terbukti.entityType, entityId: terbukti.entityId, deletedAt: null },
    select: KOLOM_AMAN,
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Satu lampiran, LENGKAP dengan storageKey — hanya untuk pemakaian internal
 * (route content). NOT_FOUND bila tak ada, sudah di-soft-delete, atau milik
 * tenant lain.
 */
export async function getAttachment(ctx: TenantContext, id: string): Promise<Attachment> {
  const row = await forTenant(ctx).attachment.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound('Lampiran')

  // Pemeriksaan kedua, dan bukan berlebihan: baris lampiran memang milik tenant
  // ini (guard sudah menjamin), tapi entitas yang ditunjuknya bisa saja bukan —
  // misalnya bila sebuah baris pernah lahir sebelum pagar ini ada. Membaca
  // lampiran yang menggantung pada entitas asing tetap tidak boleh.
  await pastikanEntitasMilikTenant(ctx, row.entityType, row.entityId)
  return row
}

/** Isi berkas + metadata untuk disajikan route content (K108). */
export async function bacaIsiAttachment(
  ctx: TenantContext,
  id: string,
  penyimpanan: PenyimpananBerkas = penyimpananLokal,
): Promise<{ row: Attachment; isi: Buffer }> {
  const row = await getAttachment(ctx, id)

  // K112 — lampiran ber-`sensitive` (mis. paspor awak) tidak boleh diunduh
  // PENYUSUN_BIAYA/FINANCE/VIEWER/DIREKTUR. DIREKTUR sengaja ikut ditolak:
  // "lihat-saja semua" di Fase 5e berarti angka & dokumen perusahaan, bukan
  // paspor awak kapal (P41).
  if (row.sensitive) requireRole(ctx, 'ADMIN', 'OPERATOR', 'MANAJER_OPERASI')

  const isi = await penyimpanan.baca(row.storageKey)
  return { row, isi }
}

// ---------------------------------------------------------------- penulisan

export type HasilUnggah = {
  attachment: AttachmentRingkas
  /** K109 — memberi tahu, TIDAK menolak. */
  duplikat: { id: string; fileName: string; createdAt: Date; entityType: string; entityId: string } | null
  catatan: string | null
}

/**
 * Unggah satu berkas (K106–K109).
 *
 * Urutannya disengaja dan tidak boleh ditukar:
 *   1. Kepemilikan entitas dibuktikan (K85) — SEBELUM apa pun ditulis.
 *   2. Bentuk berkas divalidasi.
 *   3. Berkas ditulis ke penyimpanan.
 *   4. Baris DB dibuat; kalau langkah ini gagal, berkas yatim ditinggalkan di
 *      disk — sengaja, karena K110 melarang jalur kode mana pun menghapus
 *      berkas fisik di Fase 7. Berkas tanpa baris DB tidak bisa diakses siapa
 *      pun (tak ada URL yang memuat storageKey), jadi ia sampah, bukan bocor.
 */
export async function uploadAttachment(
  ctx: TenantContext,
  input: {
    entityType: unknown
    entityId: unknown
    fileName: string
    mimeType: string | null
    isi: Buffer
    kind?: unknown
    note?: unknown
    sensitive?: unknown
    expiresAt?: unknown
  },
  penyimpanan: PenyimpananBerkas = penyimpananLokal,
): Promise<HasilUnggah> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'MANAJER_OPERASI', 'PENYUSUN_BIAYA', 'FINANCE')

  // 1 — K85. Ini panggilan yang membuat seluruh berkas ini aman; menghapusnya
  //     membuat uji lintas-tenant di check-owner-guard.mjs GAGAL (dan memang
  //     begitulah cara uji itu membuktikan dirinya nyata).
  const terbukti = await pastikanEntitasMilikTenant(ctx, input.entityType, input.entityId)

  // 2 — bentuk berkas.
  const { fileName, ext, mimeType } = periksaBerkas(input.fileName, input.mimeType, input.isi.length)
  const hash = sha256(input.isi)

  // 2b — Fase 8c / K156, kuota penyimpanan. SESUDAH periksaBerkas (berkas yang
  // memang cacat tetap dijawab 400) dan SEBELUM berkas ditulis ke penyimpanan.
  // Yang dinilai adalah pemakaian SEKARANG, bukan pemakaian + berkas ini:
  // menahan unggahan yang justru akan MELEWATI batas berarti menolak berkas
  // pertama yang kebetulan besar pada tenant yang masih 0% terpakai.
  await pastikanKuota(ctx, 'PENYIMPANAN')

  const kind = str(input.kind)
  if (kind && !JENIS_LAMPIRAN.includes(kind as (typeof JENIS_LAMPIRAN)[number])) {
    throw validation(`Jenis lampiran tidak sah. Pilihan: ${JENIS_LAMPIRAN.join(', ')}.`)
  }

  const db = forTenant(ctx)

  // K109 — deteksi unggahan ganda. MEMBERI TAHU, tidak menolak: berkas yang sama
  // memang sah dilampirkan ke dua dokumen berbeda, dan menolaknya akan membuat
  // operator mengakali sistem (mengganti nama berkas) alih-alih mengurungkan.
  const sudahAda = await db.attachment.findFirst({
    where: { sha256: hash, deletedAt: null },
    select: { id: true, fileName: true, createdAt: true, entityType: true, entityId: true },
    orderBy: { createdAt: 'asc' },
  })

  // 3 — tulis berkas. Kunci dibangun SELURUHNYA oleh sistem (tenantId dari
  //     konteks + tahun/bulan + token acak + ekstensi dari daftar putih); tak
  //     satu pun bagiannya berasal dari nama berkas kiriman pengguna, jadi
  //     tidak ada jalan bagi `../` untuk masuk ke path.
  const storageKey = buatStorageKey(ctx.tenantId, buatTokenBerkas(), ext)
  await penyimpanan.simpan(storageKey, input.isi, mimeType)

  // 4 — baris DB. tenantId ditulis eksplisit (TypeScript mewajibkannya pada
  //     create); guard tetap menimpanya dengan tenant dari konteks.
  const attachment = await db.attachment.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: terbukti.entityType,
      entityId: terbukti.entityId,
      fileName,
      mimeType,
      sizeBytes: input.isi.length,
      sha256: hash,
      storageKey,
      kind,
      note: str(input.note),
      sensitive: bool(input.sensitive, false),
      expiresAt: tanggal(input.expiresAt),
      uploadedByUserId: ctx.userId,
    },
    select: KOLOM_AMAN,
  })

  return {
    attachment,
    duplikat: sudahAda,
    catatan: sudahAda
      ? `Berkas serupa sudah dilampirkan sebelumnya sebagai "${sudahAda.fileName}" ` +
        `(${sudahAda.entityType}). Lampiran ini tetap disimpan.`
      : null,
  }
}

/**
 * K170 — bagikan/tarik satu lampiran dari Customer Portal.
 *
 * Dua pagar, dan keduanya WAJIB berdiri di kode, bukan disiplin operator:
 *   1. Peran: ADMIN/OPERATOR/MANAJER_OPERASI/FINANCE. Bukan PENYUSUN_BIAYA
 *      (K112 pola yang sama), bukan VIEWER/DIREKTUR (lihat-saja bukan berarti
 *      boleh mengekspos data ke luar tenant).
 *   2. `sensitive = true` → membagikan (`share = true`) DITOLAK dengan galat
 *      yang menyebut alasannya (K170/2, "pagar mesin, bukan disiplin"). Tak
 *      seorang pun — termasuk ADMIN — bisa memaksanya lewat jalur ini; kalau
 *      memang perlu, tandanya dicabut dulu secara SADAR di layar lampiran,
 *      dua tindakan bercatat, bukan satu (K170 tabel peran, catatan penutup).
 *      Menarik kembali (`share = false`) selalu diizinkan, termasuk untuk
 *      lampiran sensitif — itu arah yang MENUTUP akses, bukan membukanya.
 */
export async function shareAttachmentToPortal(
  ctx: TenantContext,
  id: string,
  share: boolean,
): Promise<AttachmentRingkas> {
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'MANAJER_OPERASI', 'FINANCE')

  const row = await getAttachment(ctx, id)
  if (share && row.sensitive) {
    throw validation('Lampiran sensitif tidak bisa dibagikan ke portal. Cabut tanda "sensitif" terlebih dulu bila memang perlu dibagikan.')
  }

  const hasil = await forTenant(ctx).attachment.updateMany({
    where: { id, deletedAt: null },
    data: share
      ? { sharedToPortal: true, sharedAt: new Date(), sharedByUserId: ctx.userId }
      : { sharedToPortal: false, sharedAt: null, sharedByUserId: null },
  })
  if (hasil.count === 0) throw notFound('Lampiran')

  return forTenant(ctx).attachment.findFirstOrThrow({ where: { id }, select: KOLOM_AMAN })
}

/**
 * K110 — hapus = SOFT DELETE. Berkas fisik TIDAK disentuh.
 *
 * Alasannya sama dengan aturan #4 POLA-SERVICE-LAYER.md: kuitansi yang dihapus
 * karena salah unggah, lalu ternyata dibutuhkan enam bulan kemudian saat
 * principal menyanggah tagihan, adalah skenario yang lebih mungkin daripada
 * kehabisan disk. Penghapusan fisik permanen adalah pekerjaan retensi (P36).
 *
 * Siapa yang boleh: pengunggah sendiri (≤ 24 jam) dan ADMIN (kapan saja).
 */
export async function removeAttachment(ctx: TenantContext, id: string): Promise<void> {
  const row = await getAttachment(ctx, id)

  const bolehSebagaiAdmin = ctx.system || ctx.role === 'ADMIN'
  if (!bolehSebagaiAdmin) {
    if (row.uploadedByUserId !== ctx.userId) {
      throw notFound('Lampiran') // bukan miliknya → jangan bocorkan keberadaannya
    }
    const umurJam = (Date.now() - row.createdAt.getTime()) / 36e5
    if (umurJam > 24) {
      throw validation(
        'Lampiran hanya bisa dihapus pengunggahnya dalam 24 jam pertama. Minta ADMIN untuk menghapusnya.',
      )
    }
  }

  const hasil = await forTenant(ctx).attachment.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Lampiran')
}
