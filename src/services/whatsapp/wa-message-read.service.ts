// WA-2a 2a-G (T1) — layanan BACA pesan klien untuk API lokal: daftar, detail, riwayat, kandidat sinyal & kontak.
//
// Aturan:
//   • READ-ONLY: tanpa create/update/delete/upsert dan tanpa audit. Satu transaksi REPEATABLE READ per panggilan.
//   • gerbangWa2(ctx) pernyataan pertama setiap fungsi publik (allowlist Automation → NOT_FOUND; peran
//     ADMIN/MANAJER_OPERASI → FORBIDDEN; konteks sistem, flag OFF, dan produksi → FORBIDDEN).
//   • Tenant HANYA dari ctx; semua bacaan lewat forTenant(ctx). Id tenant lain = NOT_FOUND.
//   • Field allowlist (preflight §6.7): nomor selalu tersamar; tidak ada logicalMessageKey/activeKey/successKey,
//     sourceFingerprint, grant, consentStateVersion, ID pencatat bukti, maupun nilai audit mentah.
//   • Kelayakan kandidat kontak memakai pemeriksaan F3/F4 yang sama (periksaKontak/periksaAkses) — hanya
//     petunjuk; buatDraftPesanKlien tetap menilai ulang di transaksinya. aksiTersedia juga hanya petunjuk.

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { notFound, validation } from '../errors'
import { forTenant } from '../tenant-db'
import { gerbangWa2 } from './wa2-gate'
import { STATUS_PESAN_KLIEN, SUBJEK_APPROVAL_PESAN_KLIEN, TUJUAN_CONSENT_PESAN_KLIEN } from './wa2-policy'
import { kategoriWajibUntuk, transisiPesanKlienSah } from './wa-message-policy'
import { JENIS_APPROVAL_WA_KLIEN, otorisasiCheckerBuktiWaKlien, pencatatBuktiFreshness } from './wa-approval-def'
import { periksaAkses, periksaKontak } from './wa-message-check'
import { samarkanNomor } from './wa-phone'
import { klasifikasiSinyal, muatCandidateDalamTx, type SinyalMasuk, type TxWa1 } from './wa1-bridge'
import type { TxMentah } from './wa-lock'

const TABEL_PESAN = SUBJEK_APPROVAL_PESAN_KLIEN
const TABEL_APPROVAL = 'TahApprovalRequest'
export const LABEL_PENGIRIMAN = 'BELUM DIKIRIM — tidak ada pengiriman pada fase ini'
/**
 * D-13 / OD-12 — status review sinyal yang boleh di-Prepare (cermin kelayakanSinyal WA-1; kesetaraan dikunci
 * check-wa2a-g-static.mjs atas fungsi asli). Hanya petunjuk daftar: buatDraftPesanKlien tetap menilai ulang
 * seluruh prasyarat, termasuk kelayakan grup sinyal.
 */
export const STATUS_SINYAL_LAYAK = ['OPEN', 'ACKNOWLEDGED'] as const
const MEDAN_FIELDS = ['keluarga', 'kategoriWajib', 'vesselName', 'voyageNumber', 'portName', 'perubahan', 'occurredAt', 'timezone', 'eventLocalTime'] as const

// ================================================================ bentuk hasil

export type RingkasanPesanKlien = {
  id: string
  revision: number
  state: string
  reasonCode: string | null
  language: string
  templateId: string
  templateVersion: number
  partyType: string
  penerimaTersamar: string
  konteks: { voyageId: string | null; keluarga: string | null }
  approval: { id: string; status: string; expiresAt: string | null } | null
  createdAt: string
  updatedAt: string
  finalizedAt: string | null
}

export type AksiPesanKlien = 'PRATINJAU' | 'MINTA_APPROVAL' | 'SETUJUI' | 'TOLAK' | 'BATALKAN' | 'BUAT_REVISI'

export type DetailPesanKlien = Omit<RingkasanPesanKlien, 'konteks' | 'approval'> & {
  body: string
  fields: Record<string, unknown>
  snapshotFingerprint: string
  freshness: { status: string | null; aturan: string | null; buktiRingkas: Record<string, string>[] }
  konteks: { voyageId: string | null; keluarga: string | null; signalIds: string[] }
  approval: { id: string; status: string; proposalHash: string; expiresAt: string | null; decidedAt: string | null } | null
  previewedAt: string | null
  approvedAt: string | null
  aksiTersedia: AksiPesanKlien[]
  labelPengiriman: string
}

export type PeristiwaPesanKlien = {
  id: string
  waktu: string
  objek: 'PESAN' | 'APPROVAL'
  peristiwa: string | null
  stateDari: string | null
  stateKe: string | null
  alasan: string | null
  aktor: { userId: string | null; nama: string | null }
}

// ================================================================ validasi

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}
const opsionalId = (v: unknown, nama: string): string | null => (v === undefined || v === null ? null : idSah(v, nama))
function takeSah(v: unknown, bawaan: number, maks: number): number {
  if (v === undefined || v === null) return bawaan
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > maks) throw validation(`take harus bilangan bulat 1–${maks}.`)
  return v
}
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)
const objek = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const teks = (v: unknown): string | null => (typeof v === 'string' ? v : null)

type Tx = Prisma.TransactionClient
const baca = <T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  forTenant(ctx).$transaction((tx) => fn(tx as unknown as Tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })

const PILIH_PESAN = {
  id: true, candidateId: true, revision: true, state: true, reasonCode: true, language: true, templateId: true, templateVersion: true,
  partyTypeSnapshot: true, recipientE164Snapshot: true, approvalRequestId: true, createdAt: true, updatedAt: true, finalizedAt: true,
} as const
const PILIH_DETAIL = {
  ...PILIH_PESAN, body: true, fields: true, snapshotFingerprint: true, freshnessVerdict: true, previewedAt: true,
  approvedAt: true, createdByUserId: true,
} as const

type BarisPesan = Prisma.WaClientMessageGetPayload<{ select: typeof PILIH_PESAN }>

async function konteksKandidat(tx: Tx, candidateId: string) {
  const c = await muatCandidateDalamTx(tx as unknown as TxWa1, candidateId)
  return c ? { voyageId: c.voyageId, keluarga: c.family, signalIds: [...c.signalIds] } : { voyageId: null, keluarga: null, signalIds: [] as string[] }
}

const ringkas = (m: BarisPesan, konteks: { voyageId: string | null; keluarga: string | null }, a: { id: string; status: string; expiresAt: Date | null } | null): RingkasanPesanKlien => ({
  id: m.id,
  revision: m.revision,
  state: m.state,
  reasonCode: m.reasonCode,
  language: m.language,
  templateId: m.templateId,
  templateVersion: m.templateVersion,
  partyType: m.partyTypeSnapshot,
  penerimaTersamar: samarkanNomor(m.recipientE164Snapshot),
  konteks,
  approval: a ? { id: a.id, status: a.status, expiresAt: iso(a.expiresAt) } : null,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
  finalizedAt: iso(m.finalizedAt),
})

// ================================================================ daftar

export async function daftarPesanKlien(
  ctx: TenantContext,
  input: { state?: unknown; take?: unknown; cursor?: unknown } = {},
): Promise<{ items: RingkasanPesanKlien[]; nextCursor: string | null }> {
  gerbangWa2(ctx)
  if (input.state !== undefined && input.state !== null && !(STATUS_PESAN_KLIEN as readonly unknown[]).includes(input.state)) {
    throw validation(`state harus salah satu dari ${STATUS_PESAN_KLIEN.join(', ')}.`)
  }
  const state = (input.state ?? null) as string | null
  const take = takeSah(input.take, 20, 50)
  const cursor = opsionalId(input.cursor, 'cursor')
  return baca(ctx, async (tx) => {
    let setelah: Prisma.WaClientMessageWhereInput = {}
    if (cursor) {
      const k = await tx.waClientMessage.findFirst({ where: { id: cursor }, select: { id: true, createdAt: true } })
      if (!k) throw notFound('Kursor pesan klien')
      setelah = { OR: [{ createdAt: { lt: k.createdAt } }, { createdAt: k.createdAt, id: { lt: k.id } }] }
    }
    const rows = await tx.waClientMessage.findMany({
      where: { ...(state ? { state } : {}), ...setelah },
      select: PILIH_PESAN,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    })
    const halaman = rows.slice(0, take)
    const aid = halaman.map((m) => m.approvalRequestId).filter((x): x is string => typeof x === 'string')
    const ap = aid.length ? await tx.tahApprovalRequest.findMany({ where: { id: { in: aid } }, select: { id: true, status: true, expiresAt: true } }) : []
    const peta = new Map(ap.map((a) => [a.id, a]))
    const items: RingkasanPesanKlien[] = []
    for (const m of halaman) {
      const k = await konteksKandidat(tx, m.candidateId)
      items.push(ringkas(m, { voyageId: k.voyageId, keluarga: k.keluarga }, m.approvalRequestId ? peta.get(m.approvalRequestId) ?? null : null))
    }
    return { items, nextCursor: rows.length > take ? halaman[halaman.length - 1].id : null }
  })
}

// ================================================================ detail

function buktiRingkas(verdict: unknown): Record<string, string>[] {
  const b = objek(objek(verdict)?.bukti)
  if (!b) return []
  if (Array.isArray(b.konfirmasi)) {
    return b.konfirmasi.flatMap((x) => {
      const o = objek(x)
      return o && teks(o.medan) && teks(o.confirmedAt) ? [{ jenis: 'KONFIRMASI_JADWAL', medan: o.medan as string, dicatatPada: o.confirmedAt as string }] : []
    })
  }
  return teks(b.occurredAt) ? [{ jenis: 'MILESTONE', terjadiPada: b.occurredAt as string }] : []
}

function fieldsDiizinkan(v: unknown): Record<string, unknown> {
  const o = objek(v) ?? {}
  return Object.fromEntries(MEDAN_FIELDS.filter((k) => Object.hasOwn(o, k)).map((k) => [k, o[k]]))
}

export async function detailPesanKlien(ctx: TenantContext, input: { messageId: unknown }): Promise<DetailPesanKlien> {
  gerbangWa2(ctx)
  const mid = idSah(input?.messageId, 'messageId')
  return baca(ctx, async (tx) => {
    const m = await tx.waClientMessage.findFirst({ where: { id: mid }, select: PILIH_DETAIL })
    if (!m) throw notFound('Pesan klien')
    const a = m.approvalRequestId
      ? await tx.tahApprovalRequest.findFirst({ where: { id: m.approvalRequestId }, select: { id: true, status: true, proposalHash: true, expiresAt: true, decidedAt: true, originatorUserId: true } })
      : null
    const k = await konteksKandidat(tx, m.candidateId)
    const sekarang = new Date()
    const aksi: AksiPesanKlien[] = []
    if (m.state === 'DRAFT') aksi.push('PRATINJAU')
    if (m.state === 'PREVIEWED' && m.approvalRequestId === null) aksi.push('MINTA_APPROVAL')
    if (m.state === 'PENDING_APPROVAL' && a?.status === 'PENDING' && a.expiresAt && a.expiresAt > sekarang) {
      const v = objek(m.freshnessVerdict)
      const oto = otorisasiCheckerBuktiWaKlien(
        { pemutus: { userId: ctx.userId, role: ctx.role, system: ctx.system === true }, peminta: a.originatorUserId, pembuatDraft: m.createdByUserId, pencatatBukti: pencatatBuktiFreshness(v?.bukti) ?? [] },
        JENIS_APPROVAL_WA_KLIEN,
      )
      if (oto.ok) aksi.push('SETUJUI', 'TOLAK')
    }
    if (transisiPesanKlienSah(m.state, 'CANCELED')) aksi.push('BATALKAN')
    aksi.push('BUAT_REVISI')
    const v = objek(m.freshnessVerdict)
    const r = ringkas(m, { voyageId: k.voyageId, keluarga: k.keluarga }, null)
    return {
      ...r,
      body: m.body,
      fields: fieldsDiizinkan(m.fields),
      snapshotFingerprint: m.snapshotFingerprint,
      freshness: { status: teks(v?.status), aturan: teks(v?.aturan), buktiRingkas: buktiRingkas(v) },
      konteks: k,
      approval: a ? { id: a.id, status: a.status, proposalHash: a.proposalHash, expiresAt: iso(a.expiresAt), decidedAt: iso(a.decidedAt) } : null,
      previewedAt: iso(m.previewedAt),
      approvedAt: iso(m.approvedAt),
      aksiTersedia: aksi,
      labelPengiriman: LABEL_PENGIRIMAN,
    }
  })
}

// ================================================================ riwayat

export async function riwayatPesanKlien(
  ctx: TenantContext,
  input: { messageId: unknown; take?: unknown; cursor?: unknown },
): Promise<{ items: PeristiwaPesanKlien[]; nextCursor: string | null }> {
  gerbangWa2(ctx)
  const mid = idSah(input?.messageId, 'messageId')
  const take = takeSah(input?.take, 50, 100)
  const cursor = opsionalId(input?.cursor, 'cursor')
  return baca(ctx, async (tx) => {
    const m = await tx.waClientMessage.findFirst({ where: { id: mid }, select: { id: true, approvalRequestId: true } })
    if (!m) throw notFound('Pesan klien')
    const sasaran: Prisma.AuditLogWhereInput = {
      OR: [
        { tableName: TABEL_PESAN, recordId: m.id },
        ...(m.approvalRequestId ? [{ tableName: TABEL_APPROVAL, recordId: m.approvalRequestId }] : []),
      ],
    }
    let setelah: Prisma.AuditLogWhereInput = {}
    if (cursor) {
      const k = await tx.auditLog.findFirst({ where: { AND: [sasaran, { id: cursor }] }, select: { id: true, createdAt: true } })
      if (!k) throw notFound('Kursor riwayat')
      setelah = { OR: [{ createdAt: { lt: k.createdAt } }, { createdAt: k.createdAt, id: { lt: k.id } }] }
    }
    const rows = await tx.auditLog.findMany({
      where: { AND: [sasaran, setelah] },
      select: { id: true, tableName: true, oldValue: true, newValue: true, userId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    })
    const halaman = rows.slice(0, take)
    const uid = Array.from(new Set(halaman.map((r) => r.userId).filter((x): x is string => typeof x === 'string')))
    const pengguna = uid.length ? await tx.user.findMany({ where: { id: { in: uid } }, select: { id: true, name: true } }) : []
    const nama = new Map(pengguna.map((u) => [u.id, u.name]))
    const items = halaman.map((r): PeristiwaPesanKlien => {
      const lama = objek(r.oldValue)
      const baru = objek(r.newValue)
      return {
        id: r.id,
        waktu: r.createdAt.toISOString(),
        objek: r.tableName === TABEL_APPROVAL ? 'APPROVAL' : 'PESAN',
        peristiwa: teks(baru?.peristiwa),
        stateDari: teks(lama?.state) ?? teks(lama?.status),
        stateKe: teks(baru?.state) ?? teks(baru?.status),
        alasan: teks(baru?.alasan),
        aktor: { userId: r.userId, nama: r.userId ? nama.get(r.userId) ?? null : null },
      }
    })
    return { items, nextCursor: rows.length > take ? halaman[halaman.length - 1].id : null }
  })
}

// ================================================================ kandidat

export async function kandidatSinyalPesanKlien(
  ctx: TenantContext,
  input: { voyageId?: unknown; take?: unknown } = {},
): Promise<{ items: { id: string; voyageId: string; keluarga: string; kind: string; reviewState: string; detectedAt: string }[] }> {
  gerbangWa2(ctx)
  const voyageId = opsionalId(input.voyageId, 'voyageId')
  const take = takeSah(input.take, 20, 50)
  return baca(ctx, async (tx) => {
    const rows = await tx.monitoringSignal.findMany({
      // Status disaring di query (sebelum take) agar sinyal DISMISSED/EXPIRED tidak memakan jendela pemindaian.
      where: { reviewState: { in: [...STATUS_SINYAL_LAYAK] }, ...(voyageId ? { voyageId } : {}) },
      select: { id: true, tenantId: true, voyageId: true, kind: true, sourceType: true, sourceRef: true, reviewState: true, after: true, detectedAt: true },
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(take * 5, 250),
    })
    const items = []
    for (const s of rows) {
      const k = klasifikasiSinyal(s as unknown as SinyalMasuk)
      if (!k.ok || !kategoriWajibUntuk(k.nilai.keluarga)) continue
      items.push({ id: s.id, voyageId: s.voyageId, keluarga: k.nilai.keluarga as string, kind: s.kind, reviewState: s.reviewState, detectedAt: s.detectedAt.toISOString() })
      if (items.length === take) break
    }
    return { items }
  })
}

export async function kandidatKontakPesanKlien(
  ctx: TenantContext,
  input: { signalId: unknown },
): Promise<{ voyageId: string; keluarga: string; items: { contactId: string; penerimaTersamar: string; partyType: string; bahasa: string; layak: boolean; alasan: string | null }[] }> {
  gerbangWa2(ctx)
  const sid = idSah(input?.signalId, 'signalId')
  return baca(ctx, async (tx) => {
    const t = tx as unknown as TxMentah
    const s = await tx.monitoringSignal.findFirst({ where: { id: sid }, select: { id: true, tenantId: true, voyageId: true, kind: true, sourceType: true, sourceRef: true, reviewState: true, after: true } })
    if (!s) throw notFound('Sinyal')
    const kls = klasifikasiSinyal(s as unknown as SinyalMasuk)
    const kategori = kls.ok ? kategoriWajibUntuk(kls.nilai.keluarga) : null
    if (!kls.ok || !kategori) throw validation('Sinyal tidak dapat dipakai untuk pesan klien.', { code: 'EVENT_NOT_ALLOWED' })
    const kontak = await tx.waContact.findMany({ where: { status: 'ACTIVE' }, select: { id: true, e164: true, partyType: true, language: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200 })
    const sekarang = new Date()
    const items = []
    for (const c of kontak) {
      let alasan: string | null = null
      const pk = await periksaKontak(t, ctx, c.id, sekarang)
      if (!pk.ok) alasan = pk.alasan
      else {
        const cs = await tx.waConsentState.findFirst({ where: { contactId: c.id, purpose: TUJUAN_CONSENT_PESAN_KLIEN }, select: { status: true } })
        if (cs?.status !== 'OPT_IN') alasan = 'CONSENT_NOT_GRANTED'
        else {
          const ak = await periksaAkses(t, ctx, pk.k, s.voyageId, kategori, sekarang)
          if (!ak.ok) alasan = ak.alasan
        }
      }
      items.push({ contactId: c.id, penerimaTersamar: samarkanNomor(c.e164), partyType: c.partyType, bahasa: c.language, layak: alasan === null, alasan })
    }
    return { voyageId: s.voyageId, keluarga: kls.nilai.keluarga as string, items }
  })
}
