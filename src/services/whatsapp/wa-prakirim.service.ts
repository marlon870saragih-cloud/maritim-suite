// Revalidasi pra-kirim pesan klien — SG-05 A2 / P-2 (keputusan owner O-1..O-8, B-1..B-3).
//
// Menilai ulang pesan APPROVED tepat sebelum klaim pengiriman (F-II kelak). TANPA provider, TANPA Send, TANPA
// klaim: tidak menulis kunci sukses, tidak mengubah status eksekusi approval ke RUNNING, tidak membuka transaksi.
//   • Kontrak transaksi (K3): fungsi publik HANYA berjalan di transaksi tenant milik pemanggil
//     (`forTenant(ctx).$transaction`). Hasil LAYAK + token hanya sah di transaksi & tenant yang sama
//     (periksaTokenPraKirim). Token = bantuan dalam-proses (WeakMap per objek tx), BUKAN jaminan lintas proses;
//     jaminan DB tetap kunci baris FOR UPDATE + penjaga version. ELIGIBLE ≠ bukti satu klaim / exactly-once (P-3).
//   • Pemeriksaan: R1–R8 (SG-05-PENYELARASAN §4 P-2) + X-1..X-5 (paritas F4, O-7). Disusun dari helper F4 yang
//     sudah diekspor (O-1, K1-B) — urutan & kode alasan sama dengan revalidasiPesan F4; dijaga uji paritas.
//   • Urutan kunci (O-8): WaContact (SHARE) → WaConsentState (UPDATE) → grant/Voyage (SHARE, resolver) → bukti
//     (SHARE) → kandidat → TahApprovalRequest (FOR UPDATE) → WaClientMessage (FOR UPDATE). Pesan dikunci SESUDAH
//     approval (jalur batal mengunci approval lebih dulu). Jam keputusan diambil SESUDAH semua kunci.
//   • Hasil (O-2/O-3/O-6): LAYAK (tanpa mutasi) · DITAHAN → NEEDS_REVIEW · DIBLOKIR → BLOCKED (approval tertaut
//     dihentikan + audit, atomik di tx pemanggil) · KONFLIK (input basi / pesan bukan APPROVED / approval bukan
//     APPROVED+NOT_STARTED / berubah bersamaan — tanpa mutasi) · NOT_FOUND (galat, tanpa bocor) · relasi approval
//     rusak (galat, tanpa mutasi). Penahanan dikembalikan sebagai NILAI: pemanggil wajib commit; bila pemanggil
//     melempar, penahanan ikut rollback (tanpa klaim — gagal aman).
//   • TTL APPROVED tidak ditambahkan (O-4, T-2); verifikasi kontak, validUntil grant, freshness dinilai pada jam
//     akhir. Pelaku: konteks staf lewat gerbangWa2 (O-5; sistem ditolak gerbang).
// SQL mentah selalu menyaring "tenantId". Audit tanpa nomor utuh.

import { Prisma } from '@prisma/client'
import type { TenantContext } from '../context'
import { ServiceError, conflict, notFound, validation } from '../errors'
import { catatAudit } from '../finance/audit'
import { gerbangWa2 } from './wa2-gate'
import { kunciConsent, type TxMentah } from './wa-lock'
import { JENIS_APPROVAL_WA_KLIEN, cekBarisApprovalWaKlien, pencatatBuktiFreshness } from './wa-approval-def'
import { hentikanApprovalPesan, kunciApprovalPesan } from './wa-approval-stop'
import { PILIH_PESAN, sidikSnapshotKlien, verdictStabil } from './wa-message.service'
import { asalDataVoyage, nilaiFreshnessDb, periksaAkses, periksaKontak } from './wa-message-check'
import { kategoriWajibUntuk, syaratDataApproval, transisiPesanKlienSah } from './wa-message-policy'
import { jsonKanonikKomunikasi, kunciCandidate, muatCandidateDalamTx, revalidasiCandidate, type CandidateBaris, type TxWa1 } from './wa1-bridge'
import { ALASAN_FRESHNESS_BLOCKED, SUBJEK_APPROVAL_PESAN_KLIEN, TUJUAN_CONSENT_PESAN_KLIEN } from './wa2-policy'

const TABEL_PESAN = SUBJEK_APPROVAL_PESAN_KLIEN
const POLA_SIDIK = /^[0-9a-f]{64}$/

type Tx = TxWa1
type Pesan = Prisma.WaClientMessageGetPayload<{ select: typeof PILIH_PESAN }>

const PILIH_APPROVAL = {
  id: true, kind: true, actionRisk: true, requiredRoles: true, subjectType: true, subjectId: true, expiresAt: true, status: true,
  executionStatus: true, version: true, proposalHash: true, basisFingerprint: true,
} as const
type Approval = Prisma.TahApprovalRequestGetPayload<{ select: typeof PILIH_APPROVAL }>

export type InputPraKirim = { messageId: unknown; expectedVersion: unknown; expectedSnapshotFingerprint: unknown }

export type TokenPraKirim = {
  readonly tenantId: string
  readonly messageId: string
  readonly version: number
  readonly approvalRequestId: string
  readonly approvalVersion: number
  readonly dinilaiPada: string
}

export type AlasanKonflikPraKirim = 'INPUT_STALE' | 'MESSAGE_NOT_APPROVED' | 'APPROVAL_NOT_ELIGIBLE' | 'CONCURRENT_CHANGE'

export type HasilPraKirim =
  | { hasil: 'LAYAK'; messageId: string; token: TokenPraKirim }
  | { hasil: 'DITAHAN' | 'DIBLOKIR'; messageId: string; approvalRequestId: string; alasan: string }
  | { hasil: 'KONFLIK'; messageId: string; alasan: AlasanKonflikPraKirim }

const idSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > 64) throw validation(`${nama} tidak sah.`)
  return v
}
const sidikSah = (v: unknown, nama: string): string => {
  if (typeof v !== 'string' || !POLA_SIDIK.test(v)) throw validation(`${nama} tidak sah.`)
  return v
}
const versiSah = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) throw validation('expectedVersion tidak sah.')
  return v
}
const relasiRusak = (code: string) => new ServiceError('FORBIDDEN', 'Relasi approval pesan klien tidak dapat dipercaya.', { code })

const sidikDariKolom = (m: Pesan): string =>
  sidikSnapshotKlien({
    candidateId: m.candidateId, logicalMessageKey: m.logicalMessageKey, contactId: m.contactId, recipientE164Snapshot: m.recipientE164Snapshot,
    partyTypeSnapshot: m.partyTypeSnapshot, partyIdSnapshot: m.partyIdSnapshot, grantIdSnapshot: m.grantIdSnapshot, consentStateVersion: m.consentStateVersion,
    language: m.language, templateId: m.templateId, templateVersion: m.templateVersion, body: m.body, fields: m.fields, sourceFingerprint: m.sourceFingerprint,
    freshnessVerdict: m.freshnessVerdict, mode: m.mode,
  })

// ================================================================ token (dalam-proses, per objek tx)

const tokenPerTx = new WeakMap<object, Map<string, string>>()
const kanonToken = (t: TokenPraKirim): string =>
  JSON.stringify([t.tenantId, t.messageId, t.version, t.approvalRequestId, t.approvalVersion, t.dinilaiPada])

// ================================================================ revalidasi (paritas revalidasiPesan F4)

type HasilRevalidasi = { ok: true; c: CandidateBaris } | { ok: false; ke: 'NEEDS_REVIEW' | 'BLOCKED'; alasan: string }
const tahan = (alasan: string): HasilRevalidasi => ({ ok: false, ke: 'NEEDS_REVIEW', alasan })
const blokir = (alasan: string): HasilRevalidasi => ({ ok: false, ke: 'BLOCKED', alasan })

/** R3–R8 + X-1, X-2, X-4, X-5 pada jam `sekarang`. Urutan & kode alasan = revalidasiPesan F4. */
async function revalidasi(ctx: TenantContext, tx: Tx, m: Pesan, sekarang: Date): Promise<HasilRevalidasi> {
  const t = tx as unknown as TxMentah
  // X-1 sidik snapshot dari kolom + activeKey.
  if (sidikDariKolom(m) !== m.snapshotFingerprint || m.activeKey !== m.logicalMessageKey) return blokir('SNAPSHOT_MISMATCH')
  // R3 kontak ACTIVE + VERIFIED efektif (kunci kontak FOR SHARE).
  const pk = await periksaKontak(t, ctx, m.contactId, sekarang)
  if (!pk.ok) return tahan(pk.alasan)
  // R5 e164/party + X-2 bahasa = snapshot.
  if (pk.k.e164 !== m.recipientE164Snapshot || pk.k.partyType !== m.partyTypeSnapshot || pk.k.partyId !== m.partyIdSnapshot || pk.k.bahasa !== m.language) return tahan('CONTACT_INELIGIBLE')
  // R4 consent OPT_IN dengan versi snapshot (kunci consent FOR UPDATE).
  const consent = await kunciConsent(t, ctx.tenantId, m.contactId, TUJUAN_CONSENT_PESAN_KLIEN)
  if (consent.status !== 'OPT_IN') return tahan('CONSENT_NOT_GRANTED')
  if (consent.version !== m.consentStateVersion) return tahan('CONSENT_CHANGED')
  // R8 kandidat (sumber).
  const kategori = kategoriWajibUntuk(((m.fields ?? {}) as { keluarga?: string }).keluarga)
  const c = await muatCandidateDalamTx(tx, m.candidateId)
  if (!c || !kategori) return blokir('SOURCE_INVALID')
  // R6 grant snapshot + principal, R7 akses voyage lewat resolver (FOR SHARE).
  const akses = await periksaAkses(t, ctx, pk.k, c.voyageId, kategori, sekarang, m.grantIdSnapshot)
  if (!akses.ok) return tahan(akses.alasan)
  if (c.state !== 'ACTIVE') return blokir('CANDIDATE_BLOCKED')
  const rv = await revalidasiCandidate(tx, ctx, c)
  if (!rv.ok) return blokir('SOURCE_INVALID')
  if (rv.sourceFingerprint !== m.sourceFingerprint) return blokir('SOURCE_CHANGED')
  // X-4 freshness D6 + K7 + pencatat bukti.
  const freshness = await nilaiFreshnessDb(t, ctx, c, rv.fakta, sekarang)
  if (freshness.status !== 'LOLOS') {
    const a = freshness.alasan ?? 'FRESHNESS_EVIDENCE_MISSING'
    return (ALASAN_FRESHNESS_BLOCKED as readonly string[]).includes(a) ? blokir(a) : tahan(a)
  }
  // X-5 syarat asal data.
  const data = syaratDataApproval({ dataOrigin: await asalDataVoyage(t, ctx, c.voyageId), sumberTervalidasi: true, freshness })
  if (!data.ok) return blokir(data.alasan)
  if (jsonKanonikKomunikasi(verdictStabil(freshness)) !== jsonKanonikKomunikasi(verdictStabil(m.freshnessVerdict))) return tahan('EVIDENCE_CHANGED')
  const pencatat = pencatatBuktiFreshness(freshness.bukti)
  if (!pencatat) return tahan('FRESHNESS_EVIDENCE_MISSING')
  return { ok: true, c }
}

// ================================================================ kunci approval → pesan

type Terkunci = { ok: true } | { ok: false; alasan: AlasanKonflikPraKirim }

/** Kunci approval FOR UPDATE lalu pesan FOR UPDATE (urutan tetap, O-8); state/version harus sama dengan bacaan awal. */
async function kunciApprovalLaluPesan(ctx: TenantContext, tx: Tx, m: Pesan, a: Approval): Promise<Terkunci> {
  const t = tx as unknown as TxMentah
  const la = await kunciApprovalPesan(t, ctx.tenantId, a.id)
  if (!la) throw relasiRusak('APPROVAL_RELATION_INVALID')
  const lm = await t.$queryRaw<{ state: string; version: number; approvalRequestId: string | null }[]>(Prisma.sql`
    SELECT "state", "version", "approvalRequestId" FROM "WaClientMessage"
    WHERE "id" = ${m.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`)
  const p = lm[0]
  if (!p) throw notFound('Pesan klien')
  if (la.subjectType !== SUBJEK_APPROVAL_PESAN_KLIEN || la.subjectId !== m.id || p.approvalRequestId !== a.id) throw relasiRusak('APPROVAL_RELATION_INVALID')
  if (la.version !== a.version || la.status !== a.status || la.executionStatus !== a.executionStatus || p.state !== m.state || p.version !== m.version) {
    return { ok: false, alasan: 'CONCURRENT_CHANGE' }
  }
  return { ok: true }
}

/** Pesan → NEEDS_REVIEW/BLOCKED + approval tertaut dihentikan + audit (pola tahanPesan F4); kunci sudah dipegang. */
async function tahanPesan(ctx: TenantContext, tx: Tx, m: Pesan, a: Approval, ke: 'NEEDS_REVIEW' | 'BLOCKED', alasan: string, jam: Date): Promise<HasilPraKirim> {
  if (!transisiPesanKlienSah(m.state, ke)) throw conflict('Transisi pesan tidak sah.', { code: 'MESSAGE_TRANSITION_FORBIDDEN' })
  await hentikanApprovalPesan(ctx, tx, m.id, a.id, 'CANCELLED', alasan)
  const n = await tx.waClientMessage.updateMany({
    where: { id: m.id, tenantId: ctx.tenantId, state: m.state, version: m.version },
    data: ke === 'BLOCKED' ? { state: ke, reasonCode: alasan, activeKey: null, finalizedAt: jam, version: { increment: 1 } } : { state: ke, reasonCode: alasan, version: { increment: 1 } },
  })
  if (n.count !== 1) throw conflict('Data berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })
  await catatAudit(ctx, { tableName: TABEL_PESAN, recordId: m.id, action: 'UPDATE', oldValue: { state: m.state }, newValue: { peristiwa: 'WA2_PRAKIRIM_REVALIDASI_GAGAL', state: ke, alasan, approvalRequestId: a.id, dinilaiPada: jam.toISOString() } }, {}, tx)
  return { hasil: ke === 'BLOCKED' ? 'DIBLOKIR' : 'DITAHAN', messageId: m.id, approvalRequestId: a.id, alasan }
}

async function kunciLaluTahan(ctx: TenantContext, tx: Tx, m: Pesan, a: Approval, ke: 'NEEDS_REVIEW' | 'BLOCKED', alasan: string): Promise<HasilPraKirim> {
  const k = await kunciApprovalLaluPesan(ctx, tx, m, a)
  if (!k.ok) return { hasil: 'KONFLIK', messageId: m.id, alasan: k.alasan }
  return tahanPesan(ctx, tx, m, a, ke, alasan, new Date())
}

// ================================================================ publik

/**
 * Revalidasi pra-kirim di DALAM transaksi pemanggil (`tx` dari `forTenant(ctx).$transaction`). Tidak membuka
 * transaksi; tidak mengirim; tidak mengklaim. Hasil DITAHAN/DIBLOKIR sudah ditulis di `tx` — pemanggil wajib commit.
 */
export async function revalidasiPraKirimDalamTx(ctx: TenantContext, tx: Tx, input: InputPraKirim): Promise<HasilPraKirim> {
  gerbangWa2(ctx)
  const mid = idSah(input?.messageId, 'messageId')
  const versi = versiSah(input?.expectedVersion)
  const sidik = sidikSah(input?.expectedSnapshotFingerprint, 'expectedSnapshotFingerprint')

  // R1 — pesan di tenant ctx saja (tanpa membocorkan keberadaan di tenant lain).
  const m = await tx.waClientMessage.findFirst({ where: { id: mid, tenantId: ctx.tenantId }, select: PILIH_PESAN })
  if (!m) throw notFound('Pesan klien')
  // R2 — input basi / state (tanpa mutasi).
  if (m.version !== versi || m.snapshotFingerprint !== sidik) return { hasil: 'KONFLIK', messageId: m.id, alasan: 'INPUT_STALE' }
  if (m.state !== 'APPROVED') return { hasil: 'KONFLIK', messageId: m.id, alasan: 'MESSAGE_NOT_APPROVED' }
  // R2 — relasi approval harus terbukti (pesan → approval → subjek = pesan); selain itu gagal tertutup.
  if (!m.approvalRequestId) throw relasiRusak('APPROVAL_RELATION_INVALID')
  const a = await tx.tahApprovalRequest.findFirst({ where: { id: m.approvalRequestId, tenantId: ctx.tenantId }, select: PILIH_APPROVAL })
  if (!a || a.subjectType !== SUBJEK_APPROVAL_PESAN_KLIEN || a.subjectId !== m.id) throw relasiRusak('APPROVAL_RELATION_INVALID')
  if (!cekBarisApprovalWaKlien(a, JENIS_APPROVAL_WA_KLIEN).ok) throw relasiRusak('APPROVAL_POLICY_MISMATCH')
  // O-6 — hanya APPROVED + NOT_STARTED.
  if (a.status !== 'APPROVED' || a.executionStatus !== 'NOT_STARTED') return { hasil: 'KONFLIK', messageId: m.id, alasan: 'APPROVAL_NOT_ELIGIBLE' }
  // X-3 — proposal/basis approval = snapshot/sumber pesan (relasi terbukti → penghentian sah, pola F4).
  if (a.proposalHash !== m.snapshotFingerprint || a.basisFingerprint !== m.sourceFingerprint) return kunciLaluTahan(ctx, tx, m, a, 'BLOCKED', 'SNAPSHOT_MISMATCH')

  // Pemeriksaan awal (mengambil kunci kontak → consent → grant/voyage → bukti).
  const rv = await revalidasi(ctx, tx, m, new Date())
  if (!rv.ok) return kunciLaluTahan(ctx, tx, m, a, rv.ke, rv.alasan)
  await kunciCandidate(tx, rv.c)
  const k = await kunciApprovalLaluPesan(ctx, tx, m, a)
  if (!k.ok) return { hasil: 'KONFLIK', messageId: m.id, alasan: k.alasan }
  // Jam keputusan SESUDAH seluruh kunci; semua syarat berbasis waktu dinilai ulang dengan jam ini.
  const akhir = new Date()
  const rvAkhir = await revalidasi(ctx, tx, m, akhir)
  if (!rvAkhir.ok) return tahanPesan(ctx, tx, m, a, rvAkhir.ke, rvAkhir.alasan, akhir)

  const token: TokenPraKirim = Object.freeze({ tenantId: ctx.tenantId, messageId: m.id, version: m.version, approvalRequestId: a.id, approvalVersion: a.version, dinilaiPada: akhir.toISOString() })
  const peta = tokenPerTx.get(tx) ?? new Map<string, string>()
  peta.set(m.id, kanonToken(token))
  tokenPerTx.set(tx, peta)
  return { hasil: 'LAYAK', messageId: m.id, token }
}

/**
 * Token LAYAK sah hanya bila: konteks staf yang sama lolos gerbang, tenant token = tenant ctx, token diterbitkan
 * di objek `tx` ini, dan baris pesan/approval di `tx` masih APPROVED/NOT_STARTED dengan version token. Tanpa mutasi.
 */
export async function periksaTokenPraKirim(ctx: TenantContext, tx: Tx, token: TokenPraKirim): Promise<boolean> {
  gerbangWa2(ctx)
  if (!token || token.tenantId !== ctx.tenantId) return false
  if (tokenPerTx.get(tx)?.get(token.messageId) !== kanonToken(token)) return false
  const t = tx as unknown as TxMentah
  const m = await t.$queryRaw<{ state: string; version: number; approvalRequestId: string | null }[]>(Prisma.sql`
    SELECT "state", "version", "approvalRequestId" FROM "WaClientMessage" WHERE "id" = ${token.messageId} AND "tenantId" = ${ctx.tenantId}`)
  const a = await t.$queryRaw<{ status: string; executionStatus: string; version: number }[]>(Prisma.sql`
    SELECT "status", "executionStatus", "version" FROM "TahApprovalRequest" WHERE "id" = ${token.approvalRequestId} AND "tenantId" = ${ctx.tenantId}`)
  return (
    m[0]?.state === 'APPROVED' && m[0].version === token.version && m[0].approvalRequestId === token.approvalRequestId &&
    a[0]?.status === 'APPROVED' && a[0].executionStatus === 'NOT_STARTED' && a[0].version === token.approvalVersion
  )
}
