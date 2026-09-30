// Gerbang Automation Hub — logika murni, TANPA impor (PRD-002 Step 5B).
//
// Automation Hub PRIVAT untuk PT Tribuana Solusi Maritim. Aktif hanya bila:
//   1. AUTOMATION_MONITORING_ENABLED bernilai persis "true", DAN
//   2. tenantId pemanggil ada di AUTOMATION_TENANT_IDS (daftar id dipisah koma).
//
// Dicocokkan lewat tenantId yang TAK BISA DIUBAH — tidak pernah lewat nama
// perusahaan. Produksi punya dua tenant bernama hampir sama ("PT Tribuana
// Solusi Maritim" dan "PT Tribuana Solusi  Maritim"); nama bukan identitas.
//
// GAGAL TERTUTUP: flag selain "true", daftar kosong, atau SATU entri yang tidak
// berbentuk id → seluruh gerbang mati. Konfigurasi setengah benar lebih
// berbahaya daripada konfigurasi yang jelas-jelas salah.
//
// Tanpa impor supaya bisa diuji langsung oleh Node (prisma/check-automation-policy.mjs).

export type AlasanNonaktif = 'NONAKTIF' | 'FLAG_TIDAK_SAH' | 'ALLOWLIST_KOSONG' | 'ALLOWLIST_TIDAK_SAH'

export type KonfigurasiAutomation = {
  aktif: boolean
  tenantIds: ReadonlySet<string>
  alasan: AlasanNonaktif | null
}

/** Bentuk id tenant (cuid): huruf kecil + angka. */
const POLA_ID_TENANT = /^[a-z0-9]{20,40}$/

const MATI = (alasan: AlasanNonaktif): KonfigurasiAutomation => ({ aktif: false, tenantIds: new Set(), alasan })

export function bacaKonfigurasiAutomation(env: Readonly<Record<string, string | undefined>>): KonfigurasiAutomation {
  const flag = (env.AUTOMATION_MONITORING_ENABLED ?? '').trim()
  if (flag === '' || flag === 'false') return MATI('NONAKTIF')
  if (flag !== 'true') return MATI('FLAG_TIDAK_SAH')

  const entri = (env.AUTOMATION_TENANT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (entri.length === 0) return MATI('ALLOWLIST_KOSONG')
  if (entri.some((id) => !POLA_ID_TENANT.test(id))) return MATI('ALLOWLIST_TIDAK_SAH')

  return { aktif: true, tenantIds: new Set(entri), alasan: null }
}

export function tenantBolehAutomation(k: KonfigurasiAutomation, tenantId: string | null | undefined): boolean {
  return k.aktif && typeof tenantId === 'string' && k.tenantIds.has(tenantId)
}

/** D6 — peninjau internal pilot. */
export const PERAN_AUTOMATION = ['ADMIN', 'MANAJER_OPERASI'] as const

export function peranBolehAutomation(role: string | null | undefined): boolean {
  return typeof role === 'string' && (PERAN_AUTOMATION as readonly string[]).includes(role)
}
