// Internal Notes (K128) — catatan pada entitas, BUKAN messenger.
//
// Bentuknya sengaja datar (tanpa thread): panel komentar pada satu dokumen
// adalah percakapan yang sudah punya konteks, dan konteksnya adalah dokumennya.
//
// Yang sengaja TIDAK ada: reaksi emoji, lampiran di dalam komentar, pratinjau
// tautan, pesan langsung antar-orang, saluran, realtime (K87). Lampiran punya
// tempatnya sendiri (K106) pada entitas yang sama, dan itu tempat yang lebih benar.

import type { Comment } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound, validation } from '../errors'
import { str, wajib } from '../input'
import { notify } from '../notification.service'
import type { EntityType } from './owner-guard'
import { pastikanEntitasMilikTenant } from './ownership.service'

/** Batas panjang satu komentar — menahan tempelan dokumen utuh ke panel catatan. */
export const BATAS_PANJANG_KOMENTAR = 5000

/** Baris yang sudah dihapus tetap tampil sebagai penanda (K128). */
export const TEKS_KOMENTAR_DIHAPUS = 'Komentar dihapus / Comment deleted'

export type CommentRow = {
  id: string
  body: string
  authorUserId: string
  authorName: string | null
  mentionedUserIds: string[]
  editedAt: Date | null
  createdAt: Date
  deleted: boolean
}

function keluaran(c: Comment): CommentRow {
  const dihapus = c.deletedAt !== null
  return {
    id: c.id,
    // Isi komentar yang dihapus TIDAK dikirim ke klien — yang tersisa hanya
    // jejak bahwa pernah ada komentar di sana (K128). Menyembunyikannya di CSS
    // saja akan tetap mengirim isinya lewat kabel.
    body: dihapus ? TEKS_KOMENTAR_DIHAPUS : c.body,
    authorUserId: c.authorUserId,
    authorName: c.authorName,
    mentionedUserIds: dihapus ? [] : c.mentionedUserIds,
    editedAt: c.editedAt,
    createdAt: c.createdAt,
    deleted: dihapus,
  }
}

/**
 * Daftar komentar satu entitas — termasuk yang sudah dihapus (sebagai penanda).
 * Kepemilikan entitas dibuktikan dulu (K85).
 */
export async function listComments(
  ctx: TenantContext,
  entityType: unknown,
  entityId: unknown,
): Promise<CommentRow[]> {
  const terbukti = await pastikanEntitasMilikTenant(ctx, entityType, entityId)
  const rows = await forTenant(ctx).comment.findMany({
    where: { entityType: terbukti.entityType, entityId: terbukti.entityId },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(keluaran)
}

/**
 * @sebut menyimpan userId (bukan mem-parsing nama saat menampilkan) — nama bisa
 * berubah, id tidak. Id yang disodorkan divalidasi terhadap User tenant ini:
 * tanpa itu, `mentionedUserIds` jadi jalan menyelundupkan id sembarang ke baris
 * database, dan notifikasi bertarget bisa diarahkan ke pengguna tenant lain.
 */
async function saringSebutan(ctx: TenantContext, mentah: unknown): Promise<{ id: string; name: string }[]> {
  if (!Array.isArray(mentah) || mentah.length === 0) return []
  const diminta = Array.from(
    new Set(mentah.filter((v): v is string => typeof v === 'string' && v.trim() !== '')),
  )
  if (diminta.length === 0) return []
  if (diminta.length > 20) throw validation('Terlalu banyak sebutan dalam satu komentar (maksimal 20).')

  // forTenant → hanya pengguna tenant ini yang bisa cocok.
  return forTenant(ctx).user.findMany({
    where: { id: { in: diminta }, isActive: true },
    select: { id: true, name: true },
  })
}

export async function createComment(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<CommentRow> {
  // VIEWER & DIREKTUR tidak berkomentar (K98) — keduanya peran baca.
  requireRole(ctx, 'ADMIN', 'OPERATOR', 'MANAJER_OPERASI', 'PENYUSUN_BIAYA', 'FINANCE')

  // K85 — dibuktikan SEBELUM satu baris pun ditulis.
  const terbukti = await pastikanEntitasMilikTenant(ctx, body.entityType, body.entityId)

  const isi = wajib(str(body.body), 'Isi komentar')
  if (isi.length > BATAS_PANJANG_KOMENTAR) {
    throw validation(`Komentar terlalu panjang (maksimal ${BATAS_PANJANG_KOMENTAR} karakter).`)
  }

  const disebut = await saringSebutan(ctx, body.mentionedUserIds)
  const penulis = await forTenant(ctx).user.findFirst({
    where: { id: ctx.userId },
    select: { name: true },
  })

  const c = await forTenant(ctx).comment.create({
    data: {
      tenantId: ctx.tenantId,
      entityType: terbukti.entityType,
      entityId: terbukti.entityId,
      body: isi,
      authorUserId: ctx.userId,
      // Disalin, pola Approval.userName — penulis bisa dinonaktifkan nanti dan
      // komentar lama harus tetap terbaca.
      authorName: penulis?.name ?? null,
      mentionedUserIds: disebut.map((u) => u.id),
    },
  })

  await terbitkanNotifikasiSebutan(ctx, c, disebut, penulis?.name ?? null)
  return keluaran(c)
}

/**
 * K86 — TIDAK ADA sistem notifikasi kedua. Sebutan menulis ke `Notification`
 * yang sudah ada, lewat notify() yang sudah ada (dan yang sengaja menelan
 * galatnya sendiri: gagal memberi tahu tak boleh membatalkan komentarnya).
 *
 * Bedanya dengan tiga notifikasi finance: ini BERTARGET (`userId` terisi),
 * bukan siaran. Itu perlu karena `Notification.readAt` satu nilai per baris —
 * siaran akan ditandai terbaca oleh siapa pun yang membacanya duluan, dan
 * sebutan yang ditujukan ke orang tertentu tidak boleh begitu (T5/K101).
 */
async function terbitkanNotifikasiSebutan(
  ctx: TenantContext,
  c: Comment,
  disebut: { id: string; name: string }[],
  namaPenulis: string | null,
): Promise<void> {
  for (const u of disebut) {
    if (u.id === ctx.userId) continue // menyebut diri sendiri tidak perlu diberitahukan
    await notify(ctx, {
      type: 'MENTION',
      userId: u.id,
      title: `${namaPenulis ?? 'Seseorang'} menyebut Anda dalam sebuah catatan`,
      message: c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
      // Aman di-cast: baris ini hanya bisa lahir lewat createComment(), yang
      // entityType-nya sudah melewati daftar putih ENTITAS_DIDUKUNG (K85).
      // Kesebelas nilainya memang ada di union entityType NewNotification.
      entityType: c.entityType as EntityType,
      entityId: c.entityId,
    })
  }
}

/** Sunting — penulis sendiri saja, dengan editedAt yang terlihat di layar. */
export async function updateComment(
  ctx: TenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<CommentRow> {
  const row = await ambilMilikSendiri(ctx, id)

  const isi = wajib(str(body.body), 'Isi komentar')
  if (isi.length > BATAS_PANJANG_KOMENTAR) {
    throw validation(`Komentar terlalu panjang (maksimal ${BATAS_PANJANG_KOMENTAR} karakter).`)
  }

  const disebut = await saringSebutan(ctx, body.mentionedUserIds ?? row.mentionedUserIds)

  const hasil = await forTenant(ctx).comment.updateMany({
    where: { id, authorUserId: ctx.userId, deletedAt: null },
    data: { body: isi, mentionedUserIds: disebut.map((u) => u.id), editedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Komentar')

  const segar = await forTenant(ctx).comment.findFirst({ where: { id } })
  if (!segar) throw notFound('Komentar')

  // Sebutan yang BARU muncul lewat suntingan tetap diberitahukan; yang sudah
  // ada sebelumnya tidak dikirimi ulang (memberi tahu dua kali untuk hal yang
  // sama adalah cara tercepat membuat lonceng diabaikan).
  const baru = disebut.filter((u) => !row.mentionedUserIds.includes(u.id))
  await terbitkanNotifikasiSebutan(ctx, segar, baru, row.authorName)

  return keluaran(segar)
}

/**
 * Hapus = soft delete; barisnya tetap tampil sebagai "komentar dihapus" (K128).
 * Komentar yang bisa lenyap tanpa jejak pada dokumen keuangan adalah masalah audit.
 */
export async function removeComment(ctx: TenantContext, id: string): Promise<void> {
  await ambilMilikSendiri(ctx, id)
  const hasil = await forTenant(ctx).comment.updateMany({
    where: { id, authorUserId: ctx.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (hasil.count === 0) throw notFound('Komentar')
}

/**
 * Sunting & hapus HANYA oleh penulisnya sendiri (K128) — ADMIN pun tidak,
 * karena mengubah kalimat orang lain atas namanya adalah hal yang berbeda dari
 * mengelola data. Komentar orang lain dilaporkan NOT_FOUND, bukan FORBIDDEN,
 * mengikuti aturan #6 POLA-SERVICE-LAYER.md.
 */
async function ambilMilikSendiri(ctx: TenantContext, id: string): Promise<Comment> {
  const row = await forTenant(ctx).comment.findFirst({ where: { id, deletedAt: null } })
  if (!row) throw notFound('Komentar')
  if (row.authorUserId !== ctx.userId) throw notFound('Komentar')
  await pastikanEntitasMilikTenant(ctx, row.entityType, row.entityId)
  return row
}
