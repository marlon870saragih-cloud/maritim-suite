import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { identitasKapal, vesselFields } from '@/lib/vessels'
import { balasanMmsiGanda, gerbangUbahKapal, konteksKapal, potretIdentitas } from '@/lib/vessel-api'
import { catatAudit } from '@/services/finance/audit'
import { jejakDari } from '@/services/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KOLOM_IDENTITAS = {
  name: true,
  imoNumber: true,
  callSign: true,
  mmsi: true,
  mmsiSource: true,
  mmsiVerifiedAt: true,
} as const

// PATCH /api/vessels/:id → ubah data kapal (ter-scope tenant). PRD-002 Step 2 / D1: hanya ADMIN & OPERATOR.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await konteksKapal()
  if (ctx instanceof Response) return ctx
  const ditolak = gerbangUbahKapal(ctx)
  if (ditolak) return ditolak

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data = vesselFields(body)
  if (!data.name) return new Response('Nama kapal wajib diisi', { status: 400 })

  const sebelum = await prisma.vessel.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: KOLOM_IDENTITAS,
  })
  if (!sebelum) return new Response('Not found', { status: 404 })

  const identitas = identitasKapal(body, sebelum)
  if (identitas.errors.length) return new Response(identitas.errors.join(' '), { status: 400 })

  let upd
  try {
    upd = await prisma.vessel.updateMany({
      where: { id: params.id, tenantId: ctx.tenantId },
      data: { ...data, ...identitas.data },
    })
  } catch (e) {
    const ganda = await balasanMmsiGanda(e, ctx.tenantId, identitas.data.mmsi, params.id)
    if (ganda) return ganda
    throw e
  }
  if (upd.count === 0) return new Response('Not found', { status: 404 })

  // Jejak audit hanya bila identitas pencocokan kapal BENAR berubah (bukan tiap simpan partikular).
  const sesudah = await prisma.vessel.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: KOLOM_IDENTITAS,
  })
  if (sesudah) {
    const lama = potretIdentitas(sebelum)
    const baru = potretIdentitas(sesudah)
    if (JSON.stringify(lama) !== JSON.stringify(baru)) {
      await catatAudit(
        ctx,
        { tableName: 'Vessel', recordId: params.id, action: 'UPDATE', oldValue: lama, newValue: baru },
        jejakDari(req),
      )
    }
  }

  // `warnings` ditambahkan (aditif) — bentuk `{ ok: true }` lama tetap ada.
  return Response.json({ ok: true, warnings: identitas.warnings })
}

// DELETE /api/vessels/:id → hapus kapal (ter-scope tenant). PRD-002 Step 2 / D1: hanya ADMIN & OPERATOR.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await konteksKapal()
  if (ctx instanceof Response) return ctx
  const ditolak = gerbangUbahKapal(ctx)
  if (ditolak) return ditolak

  const sebelum = await prisma.vessel.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: KOLOM_IDENTITAS,
  })
  if (!sebelum) return new Response('Not found', { status: 404 })

  // PRD-002 Step 2 — kapal yang dipakai voyage (sebagai kapal UTAMA maupun kapal TERKAIT)
  // ditolak DI SINI. FK VoyageVessel.vessel sengaja CASCADE di database supaya penghapusan
  // tenant (K188) bekerja, jadi database tidak lagi menolak kapal yang hanya terpasang
  // sebagai kapal terkait. Voyage yang di-soft-delete ikut dihitung (tetap riwayat).
  const dipakaiVoyage = await prisma.voyage.count({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ vesselId: params.id }, { vessels: { some: { vesselId: params.id } } }],
    },
  })
  if (dipakaiVoyage > 0) {
    return new Response('Kapal masih dipakai di voyage, port call, atau dokumen — tidak bisa dihapus.', {
      status: 409,
    })
  }

  try {
    const del = await prisma.vessel.deleteMany({
      where: { id: params.id, tenantId: ctx.tenantId },
    })
    if (del.count === 0) return new Response('Not found', { status: 404 })
  } catch (e) {
    // FK RESTRICT: kapal masih dipakai di port call, dokumen, atau (lewat Voyage.vesselId) voyage —
    // jaring pengaman database bila pemeriksaan voyage di atas terlewati oleh penulisan bersamaan.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return new Response('Kapal masih dipakai di voyage, port call, atau dokumen — tidak bisa dihapus.', {
        status: 409,
      })
    }
    throw e
  }

  await catatAudit(
    ctx,
    { tableName: 'Vessel', recordId: params.id, action: 'DELETE', oldValue: potretIdentitas(sebelum) },
    jejakDari(req),
  )
  return Response.json({ ok: true })
}
