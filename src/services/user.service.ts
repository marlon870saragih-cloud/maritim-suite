// Manajemen User/Tim (Fase 5g) — ditemukan sebagai celah saat merumuskan Roles
// 4→7 (Fase 5e): 3 role baru tak ada gunanya tanpa cara MENUGASKANNYA ke
// seseorang, dan aplikasi ini tak punya satu pun halaman untuk itu.
//
// Tanpa mailer di repo (dicatat sejak Fase 3 P10) — jadi bukan "undang lewat
// email", tapi ADMIN langsung membuat akun + password sementara, lalu
// menyampaikannya sendiri ke orangnya (WhatsApp/lisan). Wajar untuk tim kecil
// ship agency; bisa diperbarui jadi alur undangan sungguhan begitu ada mailer.

import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import type { TenantContext } from './context'
import { requireRole } from './context'
import { conflict, notFound, validation } from './errors'
import { str, wajib } from './input'
import { forTenant } from './tenant-db'

const ROLES: readonly Role[] = [
  'ADMIN', 'OPERATOR', 'FINANCE', 'VIEWER', 'MANAJER_OPERASI', 'PENYUSUN_BIAYA', 'DIREKTUR',
]

export type TeamMemberRow = {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  createdAt: Date
}

const SELECT = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } as const

export async function listTeam(ctx: TenantContext): Promise<TeamMemberRow[]> {
  requireRole(ctx, 'ADMIN')
  return forTenant(ctx).user.findMany({ where: {}, select: SELECT, orderBy: { createdAt: 'asc' } })
}

/** Jumlah ADMIN aktif tenant ini — dipakai menjaga selalu ada ≥1 (K-serupa: jangan sampai tenant terkunci total). */
async function jumlahAdminAktif(ctx: TenantContext, kecualiUserId?: string): Promise<number> {
  return forTenant(ctx).user.count({
    where: { role: 'ADMIN', isActive: true, ...(kecualiUserId ? { id: { not: kecualiUserId } } : {}) },
  })
}

export async function createTeamMember(
  ctx: TenantContext,
  body: Record<string, unknown>,
): Promise<TeamMemberRow> {
  requireRole(ctx, 'ADMIN')

  const email = wajib(str(body.email), 'Email').toLowerCase()
  const name = wajib(str(body.name), 'Nama')
  const password = str(body.password)
  const role = str(body.role)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validation('Format email tidak sah.')
  if (!password || password.length < 8) throw validation('Password minimal 8 karakter.')
  if (!role || !ROLES.includes(role as Role)) throw validation(`Peran tidak sah. Pilihan: ${ROLES.join(', ')}.`)

  // email unik GLOBAL (schema: User.email @unique lintas-tenant, bukan per-tenant).
  const existing = await forTenant(ctx).user.findFirst({ where: { email } })
  if (existing) throw conflict('Email ini sudah terdaftar (di tenant mana pun).')

  const hashed = await bcrypt.hash(password, 10)

  return forTenant(ctx).user.create({
    data: { email, name, password: hashed, role: role as Role, tenantId: ctx.tenantId },
    select: SELECT,
  })
}

type PatchTeamMember = { name?: string; role?: Role; isActive?: boolean }

export async function updateTeamMember(
  ctx: TenantContext,
  userId: string,
  body: Record<string, unknown>,
): Promise<TeamMemberRow> {
  requireRole(ctx, 'ADMIN')

  const target = await forTenant(ctx).user.findFirst({ where: { id: userId }, select: SELECT })
  if (!target) throw notFound('Pengguna')

  const data: PatchTeamMember = {}

  if ('name' in body) {
    data.name = wajib(str(body.name), 'Nama')
  }

  if ('role' in body) {
    const role = str(body.role)
    if (!role || !ROLES.includes(role as Role)) throw validation(`Peran tidak sah. Pilihan: ${ROLES.join(', ')}.`)
    // Jangan sampai ADMIN aktif terakhir diturunkan perannya sendiri — tenant terkunci total.
    if (target.role === 'ADMIN' && role !== 'ADMIN' && target.isActive) {
      const sisaAdmin = await jumlahAdminAktif(ctx, userId)
      if (sisaAdmin === 0) throw conflict('Tidak bisa — ini ADMIN aktif terakhir di tenant ini.')
    }
    data.role = role as Role
  }

  if ('isActive' in body) {
    const isActive = body.isActive === true
    if (!isActive && userId === ctx.userId) throw conflict('Tidak bisa menonaktifkan akun sendiri.')
    if (!isActive && target.role === 'ADMIN' && target.isActive) {
      const sisaAdmin = await jumlahAdminAktif(ctx, userId)
      if (sisaAdmin === 0) throw conflict('Tidak bisa — ini ADMIN aktif terakhir di tenant ini.')
    }
    data.isActive = isActive
  }

  if (Object.keys(data).length === 0) return target

  const hasil = await forTenant(ctx).user.updateMany({ where: { id: userId }, data })
  if (hasil.count === 0) throw notFound('Pengguna')

  const updated = await forTenant(ctx).user.findFirst({ where: { id: userId }, select: SELECT })
  if (!updated) throw notFound('Pengguna')
  return updated
}

export async function resetTeamMemberPassword(
  ctx: TenantContext,
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  requireRole(ctx, 'ADMIN')
  const password = str(body.password)
  if (!password || password.length < 8) throw validation('Password minimal 8 karakter.')

  const hashed = await bcrypt.hash(password, 10)
  const hasil = await forTenant(ctx).user.updateMany({ where: { id: userId }, data: { password: hashed } })
  if (hasil.count === 0) throw notFound('Pengguna')
}
