// Timeline satu voyage (K131, Fase 7g) — delapan query kecil digabung &
// diurutkan saat diminta lewat timeline.ts (MURNI). TIDAK ADA tabel
// TimelineEntry: menyimpan salinan dari delapan sumber berarti delapan jalur
// tulis yang bisa lupa menulis (lihat kepala berkas ini di dokumen desain,
// §10/K131) — biaya sepuluh query kecil bisa diabaikan untuk satu voyage, dan
// hasilnya SELALU benar.
//
// K133 — hak lihat timeline mengikuti hak lihat voyage-nya, TANPA sistem izin
// baru: satu pengecualian eksplisit di desain (PENYUSUN_BIAYA tak boleh
// membuka Invoice) DISARING di sini — bukan ditampilkan sebagai baris
// terkunci (itu sendiri sudah membocorkan keberadaannya, aturan #6
// POLA-SERVICE-LAYER.md).
//
// ⚠️ Sumber STATUS dibaca LANGSUNG dari AuditLog di sini (bukan lewat
// audit-log.service.ts / listAuditLog()) dengan SENGAJA: listAuditLog()
// digerbangi ADMIN+DIREKTUR (Fase 5e — payload lengkapnya, oldValue/newValue
// apa adanya, memang konsumsi terbatas). Timeline harus terbuka untuk siapa
// pun yang boleh membuka voyage-nya (K133), jadi berkas ini membaca AuditLog
// TANPA gerbang peran itu, tapi HANYA MENGAMBIL field `status` dari
// newValue — tak pernah mengembalikan oldValue/newValue apa adanya ke
// klien. Ini bukan jalan pintas melewati Fase 5e; ini ekspos yang jauh lebih
// sempit dari apa yang listAuditLog() perlihatkan.

import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'
import { notFound } from '../errors'
import { listVoyageEvents } from './voyage-event.service'
import { LABEL_PERISTIWA, type KodePeristiwa } from './event-codes'
import { gabungkanTimeline, type ButirTimeline } from './timeline'

export type OpsiTimeline = { bahasa?: 'id' | 'en' }

const JUDUL: Readonly<Record<'id' | 'en', Record<string, (...a: string[]) => string>>> = {
  id: {
    voyageStatus: (s) => `Status voyage → ${s}`,
    disbStatus: (doc, s) => `${doc} → ${s}`,
    invStatus: (num, s) => `Invoice ${num} → ${s}`,
    taskCreated: (title) => `Tugas dibuat: ${title}`,
    taskDone: (title) => `Tugas selesai: ${title}`,
    disbCreated: (doc) => `Dokumen dibuat: ${doc}`,
    invCreated: (num) => `Invoice dibuat: ${num}`,
    comment: (snip) => `Catatan: ${snip}`,
    attachment: (name) => `Lampiran diunggah: ${name}`,
    email: (status, subj) => `Email (${status}): ${subj}`,
  },
  en: {
    voyageStatus: (s) => `Voyage status → ${s}`,
    disbStatus: (doc, s) => `${doc} → ${s}`,
    invStatus: (num, s) => `Invoice ${num} → ${s}`,
    taskCreated: (title) => `Task created: ${title}`,
    taskDone: (title) => `Task completed: ${title}`,
    disbCreated: (doc) => `Document created: ${doc}`,
    invCreated: (num) => `Invoice created: ${num}`,
    comment: (snip) => `Note: ${snip}`,
    attachment: (name) => `Attachment uploaded: ${name}`,
    email: (status, subj) => `Email (${status}): ${subj}`,
  },
}

const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export async function buildTimeline(
  ctx: TenantContext,
  voyageId: string,
  opsi: OpsiTimeline = {},
): Promise<ButirTimeline[]> {
  const bahasa = opsi.bahasa ?? 'id'
  const J = JUDUL[bahasa]
  const db = forTenant(ctx)

  const voyage = await db.voyage.findFirst({ where: { id: voyageId, deletedAt: null }, select: { id: true } })
  if (!voyage) throw notFound('Voyage')

  // K133 — satu-satunya pengecualian eksplisit di desain: PENYUSUN_BIAYA
  // tidak boleh membuka Invoice. Berlaku untuk SEMUA butir yang berasal dari
  // entitas Invoice (bukan cuma "invoice dibuat"/"status invoice") — komentar,
  // lampiran, dan email pada Invoice ikut disaring, sebab itulah artinya
  // "entitas yang tidak boleh ia buka".
  const bolehInvoice = ctx.role !== 'PENYUSUN_BIAYA'

  const [disbursements, invoices, tasks, events] = await Promise.all([
    db.disbursement.findMany({
      where: { voyageId, deletedAt: null },
      select: { id: true, docNumber: true, status: true, createdAt: true },
    }),
    db.invoice.findMany({
      where: { voyageId, deletedAt: null },
      select: { id: true, invoiceNumber: true, status: true, createdAt: true },
    }),
    db.task.findMany({
      where: { voyageId, deletedAt: null },
      select: { id: true, title: true, createdByUserId: true, assigneeUserId: true, createdAt: true, completedAt: true },
    }),
    listVoyageEvents(ctx, voyageId),
  ])

  const disbById = new Map(disbursements.map((d) => [d.id, d]))
  const invById = new Map(invoices.map((i) => [i.id, i]))

  // Entitas "anak" voyage ini — dasar bagi Comment/Attachment/EmailLog
  // (§15/1: "Lampiran — semua lampiran voyage & anak-anaknya dalam satu
  // daftar"; Timeline mengikuti cakupan yang sama).
  const entitasAnak: { type: 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE'; id: string }[] = [
    { type: 'VOYAGE', id: voyageId },
    ...disbursements.map((d) => ({ type: 'DISBURSEMENT' as const, id: d.id })),
    ...(bolehInvoice ? invoices.map((i) => ({ type: 'INVOICE' as const, id: i.id })) : []),
  ]
  const orEntitas = entitasAnak.map((e) => ({ entityType: e.type, entityId: e.id }))

  const [comments, attachments, emailLogs, auditRows] = await Promise.all([
    db.comment.findMany({
      where: { OR: orEntitas, deletedAt: null },
      select: { id: true, entityType: true, entityId: true, body: true, authorName: true, createdAt: true },
    }),
    db.attachment.findMany({
      where: { OR: orEntitas, deletedAt: null },
      select: { id: true, entityType: true, entityId: true, fileName: true, uploadedByUserId: true, createdAt: true },
    }),
    db.emailLog.findMany({
      where: { OR: orEntitas, deletedAt: null },
      select: { id: true, entityType: true, entityId: true, subject: true, status: true, recordedByUserId: true, createdAt: true },
    }),
    db.auditLog.findMany({
      where: {
        tableName: { in: ['Voyage', 'Disbursement', 'Invoice'] },
        recordId: { in: [voyageId, ...disbursements.map((d) => d.id), ...(bolehInvoice ? invoices.map((i) => i.id) : [])] },
        action: 'UPDATE',
      },
      select: { id: true, tableName: true, recordId: true, newValue: true, userId: true, createdAt: true },
    }),
  ])

  // Nama pengguna untuk aktor — satu query bertumpuk, pola sama audit-log.service.ts.
  const userIds = Array.from(
    new Set(
      [
        ...tasks.flatMap((t) => [t.createdByUserId, t.assigneeUserId]),
        ...attachments.map((a) => a.uploadedByUserId),
        ...emailLogs.map((e) => e.recordedByUserId),
        ...auditRows.map((a) => a.userId),
      ].filter((x): x is string => !!x),
    ),
  )
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const namaUser = new Map(users.map((u) => [u.id, u.name]))

  const hrefEntitas = (type: 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE', id: string): string | null =>
    type === 'DISBURSEMENT' ? `/voyages/${voyageId}/disbursements/${id}` : type === 'INVOICE' ? `/voyages/${voyageId}/invoices/${id}` : null

  const butirEvent: ButirTimeline[] = events.map((e) => ({
    waktu: e.occurredAt.toISOString(),
    sumber: 'EVENT',
    judul: LABEL_PERISTIWA[bahasa][e.eventCode as KodePeristiwa] ?? e.eventCode,
    detail: [e.description, e.remarks].filter(Boolean).join(' — ') || null,
    href: null,
    aktor: e.recordedByName,
  }))

  const butirStatus: ButirTimeline[] = auditRows
    .map((a): ButirTimeline | null => {
      const status =
        a.newValue && typeof a.newValue === 'object' && 'status' in a.newValue
          ? String((a.newValue as { status: unknown }).status)
          : null
      if (!status) return null // UPDATE header lain (mis. notes/agencyPct) — bukan perubahan status
      const aktor = a.userId ? (namaUser.get(a.userId) ?? null) : null
      if (a.tableName === 'Voyage') {
        return { waktu: a.createdAt.toISOString(), sumber: 'STATUS', judul: J.voyageStatus(status), detail: null, href: null, aktor }
      }
      if (a.tableName === 'Disbursement') {
        const d = disbById.get(a.recordId)
        if (!d) return null
        return {
          waktu: a.createdAt.toISOString(),
          sumber: 'STATUS',
          judul: J.disbStatus(d.docNumber, status),
          detail: null,
          href: hrefEntitas('DISBURSEMENT', d.id),
          aktor,
        }
      }
      const inv = invById.get(a.recordId)
      if (!inv) return null
      return {
        waktu: a.createdAt.toISOString(),
        sumber: 'STATUS',
        judul: J.invStatus(inv.invoiceNumber, status),
        detail: null,
        href: hrefEntitas('INVOICE', inv.id),
        aktor,
      }
    })
    .filter((b): b is ButirTimeline => b !== null)

  const butirTask: ButirTimeline[] = tasks.flatMap((t): ButirTimeline[] => {
    const dibuat: ButirTimeline = {
      waktu: t.createdAt.toISOString(),
      sumber: 'TASK',
      judul: J.taskCreated(t.title),
      detail: null,
      href: null,
      aktor: namaUser.get(t.createdByUserId) ?? null,
    }
    if (!t.completedAt) return [dibuat]
    const selesai: ButirTimeline = {
      waktu: t.completedAt.toISOString(),
      sumber: 'TASK',
      judul: J.taskDone(t.title),
      detail: null,
      href: null,
      aktor: (t.assigneeUserId && namaUser.get(t.assigneeUserId)) || (namaUser.get(t.createdByUserId) ?? null),
    }
    return [dibuat, selesai]
  })

  const butirDisb: ButirTimeline[] = disbursements.map((d) => ({
    waktu: d.createdAt.toISOString(),
    sumber: 'DISBURSEMENT',
    judul: J.disbCreated(d.docNumber),
    detail: null,
    href: hrefEntitas('DISBURSEMENT', d.id),
    aktor: null,
  }))

  const butirInv: ButirTimeline[] = bolehInvoice
    ? invoices.map((i) => ({
        waktu: i.createdAt.toISOString(),
        sumber: 'INVOICE',
        judul: J.invCreated(i.invoiceNumber),
        detail: null,
        href: hrefEntitas('INVOICE', i.id),
        aktor: null,
      }))
    : []

  const butirComment: ButirTimeline[] = comments.map((c) => ({
    waktu: c.createdAt.toISOString(),
    sumber: 'COMMENT',
    judul: J.comment(potong(c.body, 60)),
    detail: null,
    href: hrefEntitas(c.entityType as 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE', c.entityId),
    aktor: c.authorName,
  }))

  const butirAttachment: ButirTimeline[] = attachments.map((a) => ({
    waktu: a.createdAt.toISOString(),
    sumber: 'ATTACHMENT',
    judul: J.attachment(a.fileName),
    detail: null,
    href: `/api/attachments/${a.id}/content`,
    aktor: namaUser.get(a.uploadedByUserId) ?? null,
  }))

  const butirEmail: ButirTimeline[] = emailLogs.map((e) => ({
    waktu: e.createdAt.toISOString(),
    sumber: 'EMAIL',
    judul: J.email(e.status, e.subject),
    detail: null,
    href: hrefEntitas(e.entityType as 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE', e.entityId),
    aktor: namaUser.get(e.recordedByUserId) ?? null,
  }))

  return gabungkanTimeline(
    butirEvent,
    butirStatus,
    butirTask,
    butirDisb,
    butirInv,
    butirComment,
    butirAttachment,
    butirEmail,
  )
}
