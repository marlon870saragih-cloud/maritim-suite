// JSON kanonik + sidik jari WA-1 (Step 2A). Satu-satunya impor: node:crypto.
//
// SENGAJA salinan lokal, bukan impor dari services/intake/intake-policy.ts:
// berkas intake dipakai sebagai sidik rilis produksi, jadi modul komunikasi tidak
// boleh terkait dengannya. Semantik sama (kunci objek terurut, `undefined`
// dibuang) — PostgreSQL JSONB menyusun ulang kunci, jadi perbandingan WAJIB lewat
// bentuk kanonik. Tambahan: nilai yang tak punya bentuk JSON stabil (bilangan
// tak hingga/NaN, BigInt, fungsi, Date) DITOLAK alih-alih diam-diam diubah.

import { createHash } from 'node:crypto'
import type { FaktaKanonikJadwal, FaktaKanonikMilestone, KunciCandidate } from './comm-policy'

export function jsonKanonikKomunikasi(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : jsonKanonikKomunikasi(x))).join(',')}]`
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return JSON.stringify(v)
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError('Bilangan tak hingga/NaN tidak punya bentuk kanonik.')
      return JSON.stringify(v)
    case 'object': {
      if (v instanceof Date) throw new TypeError('Date harus diubah ke ISO lebih dulu.')
      const o = v as Record<string, unknown>
      return `{${Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${jsonKanonikKomunikasi(o[k])}`)
        .join(',')}}`
    }
    default:
      throw new TypeError(`Tipe ${typeof v} tidak punya bentuk kanonik.`)
  }
}

/** sha256 hex atas JSON kanonik, berawalan domain supaya sidik antarjenis tak bisa tertukar. */
export function sidikJariKomunikasi(domain: 'WA1_SOURCE' | 'WA1_SNAPSHOT' | 'WA1_SEND' | 'WA1_FAKE_RECEIPT', v: unknown): string {
  return createHash('sha256').update(`${domain}\n`).update(jsonKanonikKomunikasi(v), 'utf8').digest('hex')
}

/**
 * WA-1 Step 2C — sidik SUMBER: hanya fakta yang membentuk MAKNA pesan (identitas
 * sumber + nilai yang dipakai template). SENGAJA tanpa status voyage, timestamp,
 * status sinyal (dicek terpisah), dan eventLocalTime (turunan occurredAt + zona;
 * body sudah dibekukan) — supaya approval tak basi karena perubahan tak relevan.
 */
export function sidikSumber(kunci: KunciCandidate, f: FaktaKanonikJadwal | FaktaKanonikMilestone): string {
  const dasar = {
    v: 1,
    tenantId: kunci.tenantId,
    voyageId: kunci.voyageId,
    sourceType: kunci.sourceType,
    sourceRef: kunci.sourceRef,
    keluarga: f.keluarga,
    vesselName: f.vesselName,
    voyageNumber: f.voyageNumber,
    portName: f.portName,
  }
  return f.keluarga === 'SCHEDULE_CHANGE'
    ? sidikJariKomunikasi('WA1_SOURCE', { ...dasar, perubahan: f.perubahan.map((p) => ({ medan: p.medan, lama: p.lama, baru: p.baru })) })
    : sidikJariKomunikasi('WA1_SOURCE', { ...dasar, occurredAt: f.occurredAt, timezone: f.timezone })
}

export type IsiSidikSnapshot = {
  sourceFingerprint: string
  teksKunciCandidate: string
  logicalMessageKey: string
  recipientFixtureId: string
  recipientIdentifier: string
  language: string
  templateId: string
  templateVersion: number
  body: string
  mode: string
}

/** WA-1 Step 2C — sidik SNAPSHOT: tepat isi yang kelak disetujui (= proposalHash di 2D). */
export function sidikSnapshot(s: IsiSidikSnapshot): string {
  return sidikJariKomunikasi('WA1_SNAPSHOT', { v: 1, ...s })
}

/**
 * WA-1 Step 2E (K3) — kunci idempotensi Send. requestKey disuplai pemanggil, tetapi yang
 * disimpan adalah sidik yang MENGIKATnya ke tenant, pesan, dan snapshot: requestKey yang sama
 * pada pesan/tenant/snapshot lain menghasilkan kunci lain (tak bisa di-replay lintas konteks).
 */
export function kunciIdempotensiSend(a: { tenantId: string; messageId: string; snapshotFingerprint: string; requestKey: string }): string {
  return sidikJariKomunikasi('WA1_SEND', { v: 1, tenantId: a.tenantId, messageId: a.messageId, snapshotFingerprint: a.snapshotFingerprint, requestKey: a.requestKey })
}

/** WA-1 Step 2E — dasar receipt `fake_…` yang deterministik (tanpa acak) per attempt. */
export function dasarReceiptFake(a: { idempotencyKey: string; attemptNo: number }): string {
  return sidikJariKomunikasi('WA1_FAKE_RECEIPT', { v: 1, idempotencyKey: a.idempotencyKey, attemptNo: a.attemptNo })
}
