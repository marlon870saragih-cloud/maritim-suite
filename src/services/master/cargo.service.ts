// Pola meniru port.service.ts, dengan penyesuaian: Cargo adalah model ANAK
// (tak punya tenantId, lihat catatan di tenant-guard.ts) — isolasinya diwarisi
// dari Voyage induknya. Karena itu SETIAP fungsi di sini memverifikasi dulu
// bahwa voyageId benar milik tenant (lewat forTenant(ctx).voyage.findFirst),
// baru menyentuh baris Cargo. Tanpa langkah itu, id Cargo tenant lain bisa
// diakses lewat tebakan (cuma dipagari oleh keacakan cuid, bukan oleh guard).
//
// Tak ada deletedAt: Cargo bukan dirujuk sebagai snapshot di tempat lain
// (particular muatan disalin manual ke field teks dokumen saat dibuat), jadi
// hard delete aman.

import type { Cargo } from '@prisma/client'
import type { TenantContext } from '../context'
import { requireRole } from '../context'
import { forTenant } from '../tenant-db'
import { notFound } from '../errors'
import { num, pilihan, str, wajib } from '../input'

const OPERATIONS = ['LOAD', 'DISCHARGE'] as const

function bacaInput(body: Record<string, unknown>) {
  return {
    cargoName: wajib(str(body.cargoName), 'Nama muatan'),
    quantity: num(body.quantity),
    unit: str(body.unit),
    operation: body.operation ? pilihan(body.operation, OPERATIONS, 'Operasi') : null,
    shipper: str(body.shipper),
    consignee: str(body.consignee),
  }
}

async function pastikanVoyageMilikTenant(ctx: TenantContext, voyageId: string): Promise<void> {
  const db = forTenant(ctx)
  const voyage = await db.voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true } })
  if (!voyage) throw notFound('Voyage')
}

export async function listCargoes(ctx: TenantContext, voyageId: string): Promise<Cargo[]> {
  await pastikanVoyageMilikTenant(ctx, voyageId)
  const db = forTenant(ctx)
  return db.cargo.findMany({ where: { voyageId }, orderBy: { createdAt: 'asc' } })
}

export async function createCargo(
  ctx: TenantContext,
  voyageId: string,
  body: Record<string, unknown>,
): Promise<Cargo> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  await pastikanVoyageMilikTenant(ctx, voyageId)
  const db = forTenant(ctx)
  return db.cargo.create({ data: { ...bacaInput(body), voyageId } })
}

export async function updateCargo(
  ctx: TenantContext,
  voyageId: string,
  cargoId: string,
  body: Record<string, unknown>,
): Promise<Cargo> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  await pastikanVoyageMilikTenant(ctx, voyageId)
  const db = forTenant(ctx)
  // voyageId ikut jadi syarat where — cuma baris cargo milik voyage ini yang bisa kena.
  const hasil = await db.cargo.updateMany({ where: { id: cargoId, voyageId }, data: bacaInput(body) })
  if (hasil.count === 0) throw notFound('Cargo')
  const cargo = await db.cargo.findFirst({ where: { id: cargoId, voyageId } })
  if (!cargo) throw notFound('Cargo')
  return cargo
}

export async function removeCargo(ctx: TenantContext, voyageId: string, cargoId: string): Promise<void> {
  requireRole(ctx, 'ADMIN', 'OPERATOR')
  await pastikanVoyageMilikTenant(ctx, voyageId)
  const db = forTenant(ctx)
  const hasil = await db.cargo.deleteMany({ where: { id: cargoId, voyageId } })
  if (hasil.count === 0) throw notFound('Cargo')
}
