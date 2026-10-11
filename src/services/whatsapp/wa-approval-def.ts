// Definisi approval EKSTERNAL pesan klien — WA-2a Step 2F (F1). MURNI: tanpa DB, jaringan, process.env.
//
// Keputusan D1 (owner): memakai TahApprovalRequest + kebijakan TAH yang BEKU (tah-policy.ts) — tanpa
// kerangka approval kedua. Definisi SENGAJA di luar JENIS_APPROVAL_TAH & JENIS_APPROVAL_WA_FAKE
// (registry.ts tidak diubah), bertipe literal TERTUTUP: setiap medan hanya punya satu nilai sah.
//   • kelas EXTERNAL_COMMUNICATION, setujuSendiri false (D9 beku: kelas eksternal tak boleh setuju-sendiri)
//   • TTL tepat 2 jam (keputusan owner 2a-F), non-produksi, tak bisa disunting
//   • checker: ADMIN / MANAJER_OPERASI; pembuat draft DAN peminta approval bukan checker;
//     staf yang hanya mempratinjau BOLEH menjadi checker (keputusan owner 2a-F)
// Setiap invarian diperiksa ulang saat jalan dengan validasiRegistry & jenisBolehDiLingkungan beku.
// Kind, kelas, peran, subjek, dan kedaluwarsa HANYA diturunkan dari definisi ini — tak pernah dari input.

import { PERAN_AUTOMATION } from '../automation/gate'
import { JENIS_APPROVAL_TAH, JENIS_APPROVAL_WA_FAKE } from '../tah/registry'
import {
  bolehMemutuskan,
  jenisBolehDiLingkungan,
  kelasRisikoSah,
  setujuSendiriEfektif,
  sudahKedaluwarsa,
  validasiRegistry,
  type DefinisiApprovalData,
  type PemutusCalon,
} from '../tah/tah-policy'
import { JENIS_APPROVAL_PESAN_KLIEN, SUBJEK_APPROVAL_PESAN_KLIEN, TTL_APPROVAL_PESAN_KLIEN_JAM, type KodeAlasanWa2f } from './wa2-policy'

export type DefinisiApprovalWaKlien = {
  readonly kind: 'CLIENT_WA_UPDATE'
  readonly risiko: 'EXTERNAL_COMMUNICATION'
  readonly peranWajib: readonly ['ADMIN', 'MANAJER_OPERASI']
  readonly setujuSendiri: false
  readonly kedaluwarsaJam: 2
  readonly bisaDiedit: false
  readonly hanyaNonProduksi: true
}

export const JENIS_APPROVAL_WA_KLIEN: DefinisiApprovalWaKlien = Object.freeze({
  kind: 'CLIENT_WA_UPDATE',
  risiko: 'EXTERNAL_COMMUNICATION',
  peranWajib: Object.freeze(['ADMIN', 'MANAJER_OPERASI'] as const),
  setujuSendiri: false,
  kedaluwarsaJam: 2,
  bisaDiedit: false,
  hanyaNonProduksi: true,
} as const)

const MS_PER_JAM = 3_600_000

export type HasilApprovalWa2f<T> = { ok: true; nilai: T } | { ok: false; alasan: KodeAlasanWa2f }
const tolak = (alasan: KodeAlasanWa2f): { ok: false; alasan: KodeAlasanWa2f } => ({ ok: false, alasan })

/**
 * Definisi yang sudah diperiksa. Invarian menyimpang (mis. objek dimutasi) → Error (gagal tertutup,
 * bukan hasil bisnis). Lingkungan produksi → APPROVAL_ENV_NOT_ALLOWED. `nodeEnv` disuntikkan:
 * process.env hanya dibaca di gerbang WA-2.
 */
export function jenisWaKlien(nodeEnv: string | undefined): HasilApprovalWa2f<DefinisiApprovalWaKlien> {
  const j = JENIS_APPROVAL_WA_KLIEN
  const galat = validasiRegistry([], [j as unknown as DefinisiApprovalData], PERAN_AUTOMATION)
  if (galat.length > 0) throw new Error(`[wa2f] definisi approval tidak sah: ${galat.join('; ')}`)
  const peran = [...j.peranWajib]
  const sah =
    Object.isFrozen(j) &&
    Object.isFrozen(j.peranWajib) &&
    j.kind === JENIS_APPROVAL_PESAN_KLIEN &&
    j.risiko === 'EXTERNAL_COMMUNICATION' &&
    kelasRisikoSah(j.risiko) &&
    j.setujuSendiri === false &&
    setujuSendiriEfektif(j.risiko, j.setujuSendiri) === false &&
    j.kedaluwarsaJam === TTL_APPROVAL_PESAN_KLIEN_JAM &&
    peran.join() === 'ADMIN,MANAJER_OPERASI' &&
    peran.every((r) => (PERAN_AUTOMATION as readonly string[]).includes(r)) &&
    j.bisaDiedit === false &&
    j.hanyaNonProduksi === true &&
    !JENIS_APPROVAL_TAH.some((k) => k.kind === j.kind) &&
    (JENIS_APPROVAL_WA_FAKE.kind as string) !== j.kind
  if (!sah) throw new Error('[wa2f] definisi CLIENT_WA_UPDATE menyimpang dari keputusan owner.')
  if (!jenisBolehDiLingkungan(j, nodeEnv)) return tolak('APPROVAL_ENV_NOT_ALLOWED')
  return { ok: true, nilai: j }
}

export type TurunanApprovalWaKlien = {
  kind: 'CLIENT_WA_UPDATE'
  actionRisk: 'EXTERNAL_COMMUNICATION'
  requiredRoles: string[]
  subjectType: typeof SUBJEK_APPROVAL_PESAN_KLIEN
  expiresAt: Date
}

/**
 * Medan TahApprovalRequest yang diturunkan dari definisi. HANYA menerima definisi terperiksa dan jam
 * server — tak ada parameter input pengguna, jadi kind/kelas/peran/subjek/kedaluwarsa tak bisa disodorkan.
 */
export function turunanApprovalWaKlien(j: DefinisiApprovalWaKlien, sekarang: Date): TurunanApprovalWaKlien {
  if (j !== JENIS_APPROVAL_WA_KLIEN) throw new Error('[wa2f] turunan approval hanya dari definisi CLIENT_WA_UPDATE.')
  if (!(sekarang instanceof Date) || Number.isNaN(sekarang.getTime())) throw new Error('[wa2f] waktu tidak sah.')
  return {
    kind: j.kind,
    actionRisk: j.risiko,
    requiredRoles: [...j.peranWajib],
    subjectType: SUBJEK_APPROVAL_PESAN_KLIEN,
    expiresAt: new Date(sekarang.getTime() + j.kedaluwarsaJam * MS_PER_JAM),
  }
}

export type BarisApprovalWaKlien = {
  kind: string
  actionRisk: string
  requiredRoles: readonly string[]
  subjectType: string | null
  subjectId: string | null
  expiresAt: Date | null
}

const samaHimpunan = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()

/** Baris approval harus PERSIS turunan definisi; menyimpang (mis. disunting langsung di DB) → APPROVAL_POLICY_MISMATCH. */
export function cekBarisApprovalWaKlien(a: BarisApprovalWaKlien, j: DefinisiApprovalWaKlien): HasilApprovalWa2f<null> {
  if (
    a?.kind !== j.kind ||
    a.actionRisk !== j.risiko ||
    !Array.isArray(a.requiredRoles) ||
    !samaHimpunan(a.requiredRoles, j.peranWajib) ||
    a.subjectType !== SUBJEK_APPROVAL_PESAN_KLIEN ||
    typeof a.subjectId !== 'string' ||
    a.subjectId === '' ||
    !(a.expiresAt instanceof Date) ||
    Number.isNaN(a.expiresAt.getTime())
  ) {
    return tolak('APPROVAL_POLICY_MISMATCH')
  }
  return { ok: true, nilai: null }
}

/** PENDING yang sudah lewat expiresAt → kedaluwarsa (kebijakan beku sudahKedaluwarsa: batas ≤ sekarang). */
export function approvalWaKlienKedaluwarsa(a: { status: string; expiresAt: Date }, sekarang: Date): boolean {
  return sudahKedaluwarsa(a.status, a.expiresAt, sekarang)
}

export type CalonCheckerWaKlien = {
  pemutus: PemutusCalon
  /** TahApprovalRequest.originatorUserId = staf yang MEMINTA approval. */
  peminta: string | null
  /** WaClientMessage.createdByUserId = staf yang membuat draft. */
  pembuatDraft: string | null
}

/**
 * Maker-checker pesan klien. Urutan: kebijakan TAH beku (konteks sistem → peran → setuju-sendiri
 * peminta) lalu aturan 2a-F: pembuat draft bukan checker. Staf yang hanya mempratinjau tidak dicek.
 * Peminta/pembuat tidak diketahui → APPROVAL_POLICY_MISMATCH (gagal tertutup).
 */
export function otorisasiCheckerWaKlien(c: CalonCheckerWaKlien, j: DefinisiApprovalWaKlien): HasilApprovalWa2f<null> {
  if (typeof c?.peminta !== 'string' || c.peminta === '' || typeof c.pembuatDraft !== 'string' || c.pembuatDraft === '') {
    return tolak('APPROVAL_POLICY_MISMATCH')
  }
  const h = bolehMemutuskan({
    pemutus: c.pemutus,
    peranWajib: j.peranWajib,
    kelas: j.risiko,
    setujuSendiriJenis: j.setujuSendiri,
    originatorUserId: c.peminta,
  })
  if (!h.boleh) return tolak(h.kode)
  if (c.pemutus.userId === c.pembuatDraft) return tolak('CHECKER_IS_MAKER')
  return { ok: true, nilai: null }
}
