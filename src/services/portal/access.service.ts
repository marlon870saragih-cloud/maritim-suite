// Penerimaan undangan & pengelolaan akses portal (K166/K168, Fase 8a).
//
// `acceptPortalInvitation` SENGAJA TIDAK menerima TenantContext — penerima
// belum punya sesi apa pun (ia belum jadi siapa-siapa sampai baris ini
// selesai). Begitu tenantId undangan diketahui, sisanya lewat
// `systemContext(tenantId)` — pola yang sama dipakai penyemaian tenant baru
// (K153) dan skrip CLI, bukan jalan pintas baru.

import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { systemContext, requireRole, type TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation, conflict } from '../errors'
import { str, wajib } from '../input'
import { normalisasiEmailPortal } from './email'

type Pihak = 'CUSTOMER' | 'VENDOR'

/** K170 tabel peran (Customer) / K173 (Vendor) — "Mencabut akses portal". */
const PERAN_CABUT: Readonly<Record<Pihak, readonly Role[]>> = {
  CUSTOMER: ['ADMIN', 'MANAJER_OPERASI', 'FINANCE'],
  VENDOR: ['ADMIN', 'OPERATOR', 'MANAJER_OPERASI'],
}

const PANJANG_SANDI_MIN = 8

/**
 * K168 — terima undangan: pasang kata sandi sendiri, `PortalUser` +
 * `PortalAccess` lahir (atau HIDUP KEMBALI) saat ini, bukan saat diundang.
 *
 * Compare-and-swap pada `acceptedAt` (updateMany + cek count, aturan #4
 * POLA-SERVICE-LAYER.md) memastikan token yang dipakai DUA KALI bersamaan
 * hanya memenangkan SATU permintaan — K150 butir 9.
 *
 * ---------------------------------------------------------------------------
 * C1.4 — KENAPA SELURUHNYA SATU TRANSAKSI
 *
 * Sebelum perbaikan ini, `acceptedAt` ditulis LEBIH DULU dan sendirian. Kalau
 * langkah mana pun sesudahnya gagal, undangan tetap tertandai terpakai padahal
 * tak ada `PortalUser` maupun `PortalAccess` yang lahir — dan
 * `cancelPortalInvitation()` menolak menghapus undangan yang sudah diterima,
 * jadi barisnya pun tak bisa dibersihkan lewat aplikasi. Token hangus, undangan
 * baru gagal dengan cara yang sama persis: buntu, bukan sekadar galat.
 *
 * Membungkusnya jadi satu transaksi mengubah SEMUA kegagalan pada jalur ini —
 * yang sudah dikenal maupun yang belum — dari "token hangus" jadi "coba lagi".
 * Itu sebabnya transaksinya dipasang lebih dulu, sebelum cabang-cabang di bawah:
 * cabang memperbaiki kegagalan yang kita tahu, transaksi memperbaiki sisanya.
 *
 * ---------------------------------------------------------------------------
 * C1.4 — IDENTITAS, BUKAN BARIS
 *
 * Pencarian `PortalUser` SENGAJA tidak lagi menyaring `deletedAt: null`. Baris
 * yang dihapus lembut tetap identitas logis yang SAMA — dan yang lebih menentukan,
 * kendala `PortalUser_tenantId_email_key` memang tidak mengenal penghapusan
 * lembut. Pencarian yang menyaringnya berarti bertanya "adakah orang ini?"
 * dengan aturan yang berbeda dari aturan yang dipakai database untuk menjawab
 * "boleh tidak saya membuatnya?" — dua aturan berbeda atas satu pertanyaan,
 * dan celah di antaranyalah cacat C1.4 yang sesungguhnya.
 *
 * `PortalUser.id` DIPERTAHANKAN pada pemulihan, tidak pernah diganti baris baru.
 * `VendorInvoiceSubmission.submittedByPortalUserId` dan `AuditLog.userId`
 * (berawalan `portal:`) menunjuk id itu sebagai TEKS BIASA tanpa foreign key —
 * mengganti id berarti memecah riwayat satu orang jadi dua, diam-diam, tanpa
 * satu pun galat database.
 */
export async function acceptPortalInvitation(
  token: string,
  body: Record<string, unknown>,
): Promise<{ portalUserId: string; accessId: string; pihak: Pihak; email: string }> {
  if (!token || typeof token !== 'string') throw validation('Token undangan wajib disertakan.')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const invAwal = await prisma.portalInvitation.findFirst({ where: { tokenHash } })
  if (!invAwal) throw notFound('Undangan')
  if (invAwal.expiresAt < new Date()) throw validation('Undangan sudah kedaluwarsa. Minta undangan baru dari keagenan Anda.')

  const password = wajib(str(body.password), 'Kata sandi')
  if (password.length < PANJANG_SANDI_MIN) {
    throw validation(`Kata sandi minimal ${PANJANG_SANDI_MIN} karakter.`)
  }

  // Dikanonikkan lagi di sini, bukan dipercaya dari baris undangan: undangan
  // yang dibuat SEBELUM C1.4 masih menyimpan surel apa adanya, dan baris itu
  // masih berlaku sampai tujuh hari sesudah perbaikan ini terpasang.
  const email = normalisasiEmailPortal(invAwal.email)

  // `null` bila penerima tidak mengisi nama — dibedakan dari "mengisi nama",
  // karena pada pemulihan keduanya berbeda arti (lihat cabang PULIHKAN).
  const namaDiberikan = str(body.name)

  // bcrypt DI LUAR transaksi — sengaja. Ia menahan CPU ~100 ms; menjalankannya
  // di dalam transaksi berarti memegang baris undangan yang terkunci selama
  // itu, tepat pada baris yang dipakai compare-and-swap untuk menyerialkan
  // penerimaan bersamaan. Nilainya tidak bergantung pada apa pun di dalam
  // transaksi, jadi tak ada alasan ia ada di sana.
  const hash = await bcrypt.hash(password, 10)

  const ctx = systemContext(invAwal.tenantId)
  const db = forTenant(ctx)

  return db.$transaction(async (tx) => {
    // 1 — PAKAI TOKENNYA. Tetap compare-and-swap (K150/9): dua permintaan
    // bersamaan, yang kedua memperbarui 0 baris. Bedanya dengan sebelumnya
    // hanya satu, dan itu yang penting: kini ia bisa dibatalkan.
    const ditandai = await tx.portalInvitation.updateMany({
      where: { id: invAwal.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    })
    if (ditandai.count === 0) throw conflict('Undangan ini sudah pernah dipakai.')

    // 2 — IDENTITAS. Tanpa saringan `deletedAt` (lihat catatan berkas).
    const adaSebelumnya = await tx.portalUser.findFirst({ where: { email } })

    let portalUserId: string
    // Apakah undangan ini menemukan identitas yang MEMANG sudah hidup? Dipakai
    // di langkah 3: hanya kombinasi "identitas sudah aktif" DAN "akses sudah
    // hidup" yang benar-benar tak menyisakan pekerjaan apa pun. Kalau
    // identitasnya baru saja dipulihkan, penerimaan ini berguna — akunnya
    // dihidupkan dan kata sandinya dipasang — meski baris aksesnya kebetulan
    // tak pernah ikut dicabut.
    let identitasSudahAktif = false

    if (!adaSebelumnya) {
      // BUAT — belum pernah ada orang ini di tenant ini.
      const baru = await tx.portalUser.create({
        data: {
          tenantId: invAwal.tenantId,
          email,
          password: hash,
          name: namaDiberikan ?? email,
          passwordSetAt: new Date(),
        },
      })
      portalUserId = baru.id
    } else if (adaSebelumnya.deletedAt !== null || !adaSebelumnya.isActive) {
      // PULIHKAN — baris yang SAMA hidup kembali.
      //
      // Kata sandi WAJIB ditimpa. Baris yang dihapus lembut masih menyimpan
      // hash lamanya; membersihkan `deletedAt` tanpa menyentuh `password`
      // diam-diam mengaktifkan kembali kredensial pemegang lama — termasuk
      // siapa pun yang sempat mengetahuinya sebelum akun dimatikan. Pemulihan
      // di sini KARENA ITU selalu setel-ulang kredensial: yang memegang tautan
      // undangan baru sajalah yang menentukan kata sandinya.
      //
      // `update` dilarang tenant-guard (butuh selektor unik yang tak bisa
      // ikut disaring tenantId) — `updateMany` + cek count adalah penggantinya
      // yang diwajibkan, dan kebetulan juga pola yang benar di sini.
      const dipulihkan = await tx.portalUser.updateMany({
        where: { id: adaSebelumnya.id },
        data: {
          isActive: true,
          deletedAt: null,
          password: hash,
          passwordSetAt: new Date(),
          // Nama hanya ditimpa bila penerima benar-benar mengisinya. Tanpa
          // pagar ini, penerima yang mengosongkan kolom nama akan menimpa
          // nama tersimpan yang sudah benar dengan alamat surelnya sendiri.
          ...(namaDiberikan ? { name: namaDiberikan } : {}),
        },
      })
      if (dipulihkan.count === 0) throw notFound('Pengguna portal')
      portalUserId = adaSebelumnya.id
    } else {
      // PAKAI ULANG — identitas aktif yang diberi akses ke pihak TAMBAHAN.
      //
      // Kata sandinya TIDAK disentuh, dan `passwordSetAt` tidak digeser. Orang
      // ini sudah punya kredensial yang dipakainya sekarang; diundang mewakili
      // pihak kedua bukan alasan untuk mengeluarkannya dari sesi yang sedang
      // berjalan. Beda dari cabang PULIHKAN di atas justru karena di sana
      // akunnya memang sedang mati — tak ada kredensial hidup untuk dijaga.
      identitasSudahAktif = true
      portalUserId = adaSebelumnya.id
    }

    // 3 — AKSES. Cari-dulu-baru-tulis, bukan create() buta.
    //
    // Kendala `PortalAccess_portalUserId_pihak_customerId_vendorId_key` TIDAK
    // bisa diandalkan menahan duplikat di sini: `customerId`/`vendorId` selalu
    // salah satunya NULL, dan indeks unik Postgres menganggap dua NULL sebagai
    // BERBEDA (NULLS DISTINCT, bawaan). Baris akses kembar karena itu lolos
    // tanpa galat sama sekali — kalau tidak dicari lebih dulu, tak ada yang
    // pernah memberi tahu.
    const aksesAda = await tx.portalAccess.findFirst({
      where: {
        portalUserId,
        pihak: invAwal.pihak,
        customerId: invAwal.customerId,
        vendorId: invAwal.vendorId,
      },
    })

    let accessId: string

    if (!aksesAda) {
      const akses = await tx.portalAccess.create({
        data: {
          tenantId: invAwal.tenantId,
          portalUserId,
          pihak: invAwal.pihak,
          customerId: invAwal.customerId,
          vendorId: invAwal.vendorId,
        },
      })
      accessId = akses.id
    } else if (aksesAda.revokedAt !== null) {
      // HIDUPKAN KEMBALI baris yang sama — `createdAt` dan id-nya bertahan,
      // jadi "sejak kapan pihak ini punya akses" tetap terbaca apa adanya
      // alih-alih tampak baru dibuat hari ini.
      const dihidupkan = await tx.portalAccess.updateMany({
        where: { id: aksesAda.id, revokedAt: { not: null } },
        data: { revokedAt: null },
      })
      if (dihidupkan.count === 0) throw conflict('Akses portal ini baru saja berubah. Coba lagi.')
      accessId = aksesAda.id
    } else if (!identitasSudahAktif) {
      // Aksesnya memang sudah hidup, tapi identitasnya baru saja DIPULIHKAN —
      // undangan ini tetap ada gunanya (akun dinyalakan, kata sandi dipasang).
      // Baris aksesnya tinggal dipakai apa adanya; tak ada yang perlu diubah.
      accessId = aksesAda.id
    } else {
      // Identitas SUDAH aktif dan aksesnya SUDAH hidup — undangan ini tak
      // punya pekerjaan tersisa sama sekali. Syaratnya sengaja sama persis
      // dengan pagar di `inviteToPortal()`; normalnya undangan seperti ini
      // tak pernah terbit. Cabang ini untuk undangan yang dibuat SEBELUM pagar
      // itu ada, atau yang aksesnya diberikan lewat jalur lain sesudah
      // undangan terbit.
      //
      // Dipilih KONFLIK, bukan sukses idempoten: penerimaan ini seharusnya
      // memasang kata sandi baru, dan pada identitas aktif cabang PAKAI ULANG
      // sengaja tidak melakukannya. Melaporkan sukses berarti mengaku sudah
      // memasang kata sandi yang tak pernah dipasang — orangnya lalu mencoba
      // masuk dengan sandi yang baru saja ia ketik dan ditolak, tanpa petunjuk
      // apa pun. Konflik di sini mengembalikan urusannya ke staf, dan karena
      // melempar berarti transaksi batal, tokennya tetap utuh untuk dipakai
      // sesudah keadaannya dibereskan.
      throw conflict('Pengguna portal ini sudah memiliki akses aktif ke pihak tersebut.')
    }

    return { portalUserId, accessId, pihak: invAwal.pihak as Pihak, email }
  })
}

export type PortalAccessDetail = {
  id: string
  portalUserId: string
  /** String polos apa adanya dari DB (K166: bukan enum DB) — bukan union sengaja. */
  pihak: string
  customerId: string | null
  vendorId: string | null
  createdAt: Date
  revokedAt: Date | null
}

/** K170 — "Melihat siapa saja yang punya akses portal" terbuka untuk semua peran internal. */
export async function listPortalAccess(
  ctx: TenantContext,
  f: { customerId?: string | null; vendorId?: string | null } = {},
): Promise<PortalAccessDetail[]> {
  return forTenant(ctx).portalAccess.findMany({
    where: {
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * K168 — cabut akses = mengisi `revokedAt`. Sesi yang sedang berjalan mati
 * pada permintaan BERIKUTNYA (bukan seketika di tengah permintaan yang
 * sudah terlanjur jalan) — `requirePortal()` (K149) membaca ulang baris ini
 * SETIAP permintaan portal, tidak pernah mempercayai isi token saja.
 */
export async function revokePortalAccess(ctx: TenantContext, id: string): Promise<void> {
  const db = forTenant(ctx)
  const akses = await db.portalAccess.findFirst({ where: { id } })
  if (!akses) throw notFound('Akses portal')
  requireRole(ctx, ...PERAN_CABUT[akses.pihak as Pihak])

  if (akses.revokedAt) return // sudah dicabut — idempoten, bukan galat

  const hasil = await db.portalAccess.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Akses portal')
}
