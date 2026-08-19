// Hak subjek data UU PDP — K187 (Fase 8k). 🔴 Opus.
//
// Aplikasi ini menyimpan data pribadi orang: pengguna internal, kontak
// pelanggan & vendor, dan — sejak Fase 7 — DATA AWAK KAPAL (K125/K126: nama,
// kebangsaan, nomor dokumen, salinan paspor). Untuk data awak, TENANT adalah
// pengendali data dan MARITIME SUITE adalah pemroses. Pembagian itu menentukan
// siapa menjawab permintaan siapa; modul ini adalah jalur tenant menjawab
// permintaan yang datang kepadanya.
//
// ---------------------------------------------------------------------------
// ATURAN YANG MENENTUKAN APAKAH INI BERGUNA ATAU HIASAN (K187/1)
//
// **PENGHAPUSAN TIDAK PERNAH OTOMATIS.** Permintaan hapus atas data yang
// terikat dokumen keuangan (nama pada FDA yang sudah ditagihkan) bertabrakan
// dengan kewajiban penyimpanan dokumen. Sistem TIDAK BOLEH memutuskan mana
// yang menang. Ia mencatat, mengingatkan, dan MENUNJUKKAN DI MANA SAJA data
// itu muncul — manusia yang memutuskan. Sebentuk dengan K110 (berkas fisik tak
// pernah dihapus tanpa kebijakan retensi).
//
// Karena itu berkas ini TIDAK PUNYA SATU PUN fungsi yang menghapus baris.
// `jejakSubjek()` hanya MEMBACA dan menghitung. Kalau suatu saat ada yang
// menambahkan penghapusan otomatis di sini, ia sedang membatalkan K187/1 —
// dan uji `check-compliance.mjs` akan menangkapnya (ia menghitung baris
// sebelum & sesudah permintaan PENGHAPUSAN dibuat dan menuntut keduanya sama).
//
// Yang harus ditulis MANUSIA, bukan kode (P59, masih terbuka): kebijakan
// privasi, perjanjian pemrosesan data (DPA) antara Maritime Suite dan tenant,
// penanggung jawab perlindungan data, dan lama retensi. Modul ini menyiapkan
// JALURNYA; isinya kewajiban hukum yang tidak boleh ditebak mesin.

import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { pilihan, str } from '../input'
import { catatAudit, type Jejak } from '../finance/audit'

export const JENIS_PERMINTAAN = ['AKSES', 'KOREKSI', 'PENGHAPUSAN'] as const
export const STATUS_PERMINTAAN = ['BARU', 'DIPROSES', 'SELESAI', 'DITOLAK'] as const
export const KONTEKS_PERMINTAAN = ['CREW', 'PORTAL_USER', 'USER', 'LAINNYA'] as const

export type JenisPermintaan = (typeof JENIS_PERMINTAAN)[number]

const PANJANG_URAIAN_MAKS = 4000
const PANJANG_SUBJEK_MAKS = 200

/**
 * K187 tabel peran — "Mencatat & menangani DataRequest": ADMIN, OPERATOR,
 * MANAJER_OPERASI, DIREKTUR. Sengaja LEBIH LUAS dari ekspor (K186, ADMIN
 * saja): mencatat permintaan yang masuk adalah pekerjaan resepsionis, dan
 * permintaan yang tak tercatat karena orangnya tak punya hak adalah persis
 * kegagalan yang modul ini dibangun untuk mencegah.
 */
const PERAN_KELOLA = ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI', 'DIREKTUR'] as const

export type JejakSubjek = {
  tabel: string
  jumlah: number
  /** Contoh singkat supaya manusia bisa memastikan ia memang orang yang sama. */
  contoh: string[]
  /** true bila baris di tabel ini terikat dokumen keuangan/hukum (K187/1). */
  terikatDokumen: boolean
  catatan: string
}

/**
 * "Tunjukkan DI MANA SAJA data itu muncul" (K187/1) — inti increment ini.
 *
 * Pencarian sengaja berbasis TEKS BEBAS atas nama/surel, bukan relasi id:
 * pemohon adalah orang di luar yang menulis "saya Budi Santoso,
 * budi@contoh.co.id" — ia tidak tahu id apa pun, dan tidak seharusnya tahu.
 *
 * Hasilnya HITUNGAN + CONTOH, tak pernah dump lengkap: layar ini dibuka staf
 * untuk memutuskan, bukan untuk membaca data pribadi orang lain sepuasnya.
 */
export async function jejakSubjek(ctx: TenantContext, subjek: string): Promise<JejakSubjek[]> {
  requireRole(ctx, ...PERAN_KELOLA)
  const q = subjek.trim()
  if (q.length < 3) throw validation('Kata kunci subjek minimal 3 karakter.')

  const db = forTenant(ctx)
  const cari = { contains: q, mode: 'insensitive' as const }
  const hasil: JejakSubjek[] = []

  // ⚠️ `CrewChangeMember` (tempat nama & nomor dokumen awak sesungguhnya
  // disimpan) adalah model ANAK tanpa `tenantId` (K44) — ia TIDAK boleh
  // dikueri langsung, karena `forTenant()` tak punya kolom untuk menyaringnya
  // dan hasilnya akan lintas-tenant. Jalurnya lewat INDUK `CrewChange` yang
  // memang bertenant; penyaring tenant disuntikkan di induk, anak ikut aman.
  const [pengguna, kontakPelanggan, kontakVendor, portalUser, indukAwak] = await Promise.all([
    db.user.findMany({ where: { OR: [{ name: cari }, { email: cari }] }, select: { name: true, email: true }, take: 5 }),
    db.customer.findMany({ where: { OR: [{ name: cari }, { email: cari }, { contactPerson: cari }] }, select: { name: true }, take: 5 }),
    db.vendor.findMany({ where: { OR: [{ name: cari }, { email: cari }, { contactPerson: cari }] }, select: { name: true }, take: 5 }),
    db.portalUser.findMany({ where: { OR: [{ name: cari }, { email: cari }] }, select: { name: true, email: true }, take: 5 }),
    db.crewChange.findMany({
      where: { deletedAt: null, members: { some: { fullName: cari } } },
      select: { members: { where: { fullName: cari }, select: { fullName: true, rank: true } } },
      take: 20,
    }),
  ])

  const anggotaAwak = indukAwak.flatMap((c) => c.members)

  const [nPengguna, nPelanggan, nVendor, nPortal] = await Promise.all([
    db.user.count({ where: { OR: [{ name: cari }, { email: cari }] } }),
    db.customer.count({ where: { OR: [{ name: cari }, { email: cari }, { contactPerson: cari }] } }),
    db.vendor.count({ where: { OR: [{ name: cari }, { email: cari }, { contactPerson: cari }] } }),
    db.portalUser.count({ where: { OR: [{ name: cari }, { email: cari }] } }),
  ])
  const nAwak = anggotaAwak.length

  if (nPengguna > 0) {
    hasil.push({
      tabel: 'Pengguna internal (User)',
      jumlah: nPengguna,
      contoh: pengguna.map((u) => `${u.name} <${u.email}>`),
      terikatDokumen: true,
      catatan: 'Pengguna dinonaktifkan, tidak dihapus — id-nya melekat pada jejak audit & dokumen yang pernah dibuatnya.',
    })
  }
  if (nPelanggan > 0) {
    hasil.push({
      tabel: 'Kontak pelanggan (Customer)',
      jumlah: nPelanggan,
      contoh: kontakPelanggan.map((c) => c.name),
      terikatDokumen: true,
      catatan: 'Tertaut Invoice/Voyage yang sudah diterbitkan — terikat kewajiban penyimpanan dokumen.',
    })
  }
  if (nVendor > 0) {
    hasil.push({
      tabel: 'Kontak vendor (Vendor)',
      jumlah: nVendor,
      contoh: kontakVendor.map((v) => v.name),
      terikatDokumen: true,
      catatan: 'Tertaut PO/WO/tagihan vendor yang sudah diterbitkan.',
    })
  }
  if (nPortal > 0) {
    hasil.push({
      tabel: 'Pengguna portal (PortalUser)',
      jumlah: nPortal,
      contoh: portalUser.map((p) => `${p.name} <${p.email}>`),
      terikatDokumen: false,
      catatan: 'Akses portal bisa DICABUT seketika (revokedAt) tanpa menghapus riwayat dokumennya.',
    })
  }
  if (nAwak > 0) {
    hasil.push({
      tabel: 'Data awak kapal (CrewChangeMember)',
      jumlah: nAwak,
      contoh: anggotaAwak.slice(0, 5).map((a) => `${a.fullName}${a.rank ? ` (${a.rank})` : ''}`),
      terikatDokumen: true,
      catatan: 'K126: lampiran awak WAJIB sensitive, tak pernah masuk konteks AI, tak pernah dibagikan ke portal. Untuk data ini tenant = pengendali, Maritime Suite = pemroses.',
    })
  }

  return hasil
}

export type DataRequestRingkas = {
  id: string
  jenis: string
  subjek: string
  konteks: string | null
  uraian: string
  status: string
  hasil: string | null
  ditanganiUserId: string | null
  selesaiPada: string | null
  createdAt: string
}

const ringkas = (r: {
  id: string; jenis: string; subjek: string; konteks: string | null; uraian: string
  status: string; hasil: string | null; ditanganiUserId: string | null
  selesaiPada: Date | null; createdAt: Date
}): DataRequestRingkas => ({
  id: r.id,
  jenis: r.jenis,
  subjek: r.subjek,
  konteks: r.konteks,
  uraian: r.uraian,
  status: r.status,
  hasil: r.hasil,
  ditanganiUserId: r.ditanganiUserId,
  selesaiPada: r.selesaiPada?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
})

export async function listDataRequests(ctx: TenantContext): Promise<DataRequestRingkas[]> {
  requireRole(ctx, ...PERAN_KELOLA)
  const rows = await forTenant(ctx).dataRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return rows.map(ringkas)
}

export async function createDataRequest(
  ctx: TenantContext,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<{ permintaan: DataRequestRingkas; jejakSubjek: JejakSubjek[] }> {
  requireRole(ctx, ...PERAN_KELOLA)

  const jenis = pilihan(body.jenis, JENIS_PERMINTAAN, 'Jenis permintaan')
  const subjek = str(body.subjek)
  const uraian = str(body.uraian)
  const konteks = body.konteks === undefined || body.konteks === null || body.konteks === ''
    ? null
    : pilihan(body.konteks, KONTEKS_PERMINTAAN, 'Konteks')

  if (!subjek) throw validation('Subjek (nama/surel pemohon) wajib diisi.')
  if (subjek.length > PANJANG_SUBJEK_MAKS) throw validation(`Subjek maksimal ${PANJANG_SUBJEK_MAKS} karakter.`)
  if (!uraian) throw validation('Uraian permintaan wajib diisi.')
  if (uraian.length > PANJANG_URAIAN_MAKS) throw validation(`Uraian maksimal ${PANJANG_URAIAN_MAKS} karakter.`)

  const row = await forTenant(ctx).dataRequest.create({
    data: { tenantId: ctx.tenantId, jenis, subjek, konteks, uraian, status: 'BARU' },
  })

  await catatAudit(
    ctx,
    { tableName: 'DataRequest', recordId: row.id, action: 'CREATE', newValue: { jenis, konteks, status: 'BARU' } },
    jejak,
  )

  // K187/1 — jejak ditampilkan BERSAMA permintaannya, bukan menunggu staf
  // menekan tombol kedua: keputusan "boleh dihapus atau tidak" butuh peta ini,
  // dan peta yang harus dicari sendiri adalah peta yang tidak dibaca.
  // ⚠️ Tak satu baris pun dihapus di sini, apa pun `jenis`-nya (K187/1).
  return { permintaan: ringkas(row), jejakSubjek: await jejakSubjek(ctx, subjek) }
}

/**
 * Perpindahan status — SELALU oleh manusia (K187/1). Tak ada penjadwal, tak
 * ada aturan otomatis, dan tak ada jalur yang menghapus data sebagai efek
 * samping berpindah ke SELESAI.
 */
export async function updateDataRequest(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
  jejak: Jejak = {},
): Promise<DataRequestRingkas> {
  requireRole(ctx, ...PERAN_KELOLA)
  const db = forTenant(ctx)

  const lama = await db.dataRequest.findFirst({ where: { id } })
  if (!lama) throw notFound('Permintaan data')

  const status = body.status === undefined ? null : pilihan(body.status, STATUS_PERMINTAAN, 'Status')
  const hasil = 'hasil' in body ? str(body.hasil) : undefined

  const data: Record<string, unknown> = {}
  if (status) {
    data.status = status
    data.ditanganiUserId = ctx.userId
    // Tercatat selesai HANYA saat benar-benar masuk keadaan akhir.
    data.selesaiPada = status === 'SELESAI' || status === 'DITOLAK' ? new Date() : null
  }
  if (hasil !== undefined) data.hasil = hasil

  if (Object.keys(data).length === 0) throw validation('Tidak ada perubahan yang dikirim.')

  const n = await db.dataRequest.updateMany({ where: { id }, data })
  if (n.count === 0) throw notFound('Permintaan data')

  await catatAudit(
    ctx,
    {
      tableName: 'DataRequest',
      recordId: id,
      action: 'UPDATE',
      oldValue: { status: lama.status },
      newValue: { status: status ?? lama.status },
    },
    jejak,
  )

  const baru = await db.dataRequest.findFirst({ where: { id } })
  if (!baru) throw notFound('Permintaan data')
  return ringkas(baru)
}
