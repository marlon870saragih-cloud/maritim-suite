// Pembantu bersama route /api/vessels — PRD-002 Step 2.
//
// Route kapal sengaja TETAP berpola lama (sesi NextAuth mentah + balasan galat
// berupa TEKS POLOS), karena tiga klien yang sudah ada membaca pesan galatnya
// lewat `res.text()`: VesselsManager, VesselImportDialog, dan tombol "tambah
// kapal" di PortCallManager. Mengganti ke JSON withTenant() akan menampilkan
// JSON mentah di layar mereka. Yang ditambahkan hanya: pagar peran (D1),
// validasi identitas, 409 MMSI ganda, dan jejak audit.

import { Prisma, type Vessel } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PERAN_BUAT_KAPAL, PERAN_UBAH_KAPAL } from '@/lib/vessels'
import { requireRole, type TenantContext } from '@/services/context'
import { ServiceError } from '@/services/errors'

/** Konteks dari sesi, atau balasan 401 teks (perilaku lama dipertahankan). */
export async function konteksKapal(): Promise<TenantContext | Response> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  return { tenantId: session.user.tenantId, userId: session.user.id, role: session.user.role }
}

/** D1 — pagar peran lewat requireRole() yang sama dipakai seluruh service; 403 teks bila ditolak. */
export function gerbangUbahKapal(ctx: TenantContext): Response | null {
  try {
    requireRole(ctx, ...PERAN_UBAH_KAPAL)
    return null
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.message, { status: e.status })
    throw e
  }
}

/** PRD-004 Step 3 / D3 — pagar khusus POST (pembuatan). 403 teks bila ditolak. */
export function gerbangBuatKapal(ctx: TenantContext): Response | null {
  try {
    requireRole(ctx, ...PERAN_BUAT_KAPAL)
    return null
  } catch (e) {
    if (e instanceof ServiceError) return new Response(e.message, { status: e.status })
    throw e
  }
}

/** Unique (tenantId, mmsi) dilanggar → 409 yang menyebut kapal pemegang MMSI itu (hanya dalam tenant yang sama). */
export async function balasanMmsiGanda(
  e: unknown,
  tenantId: string,
  mmsi: string | null | undefined,
  kecualiVesselId?: string,
): Promise<Response | null> {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002' || !mmsi) return null
  const pemilik = await prisma.vessel.findFirst({
    where: { tenantId, mmsi, ...(kecualiVesselId ? { NOT: { id: kecualiVesselId } } : {}) },
    select: { name: true },
  })
  return new Response(
    `MMSI ${mmsi} sudah dipakai kapal lain di perusahaan ini${pemilik ? `: ${pemilik.name}` : ''}.`,
    { status: 409 },
  )
}

type Identitas = Pick<Vessel, 'name' | 'imoNumber' | 'callSign' | 'mmsi' | 'mmsiSource' | 'mmsiVerifiedAt'>

/** Potret identitas untuk AuditLog — tanpa ukuran/partikular lain yang tak berkaitan dengan pencocokan kapal. */
export function potretIdentitas(v: Identitas) {
  return {
    name: v.name,
    imoNumber: v.imoNumber,
    callSign: v.callSign,
    mmsi: v.mmsi,
    mmsiSource: v.mmsiSource,
    mmsiVerifiedAt: v.mmsiVerifiedAt ? v.mmsiVerifiedAt.toISOString() : null,
  }
}
