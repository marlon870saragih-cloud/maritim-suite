// Peta entitas yang boleh dituju mekanisme polimorfik Fase 7 (K84/K85).
//
// ❌ MURNI — berkas ini TIDAK mengimpor apa pun (tidak Prisma, tidak service
// lain), persis dengan alasan yang sama seperti tenant-guard.ts:
//   1. Ini bagian keamanan; makin sedikit yang terbawa, makin mudah diperiksa.
//   2. Tanpa impor, Node bisa menjalankannya langsung pada
//      prisma/check-owner-guard.mjs — sehingga uji memakai peta yang PERSIS SAMA
//      dengan yang dipakai aplikasi, bukan tiruannya (K11/K51).
//
// Yang DB-nya disentuh adalah PEMANGGILNYA (ownership.service.ts). Berkas ini
// hanya menjawab dua pertanyaan yang tak butuh database:
//   - apakah entityType ini dikenal? (daftar putih)
//   - kalau ya, model Prisma mana yang harus diperiksa?

/**
 * ⚠️ DAFTAR PUTIH, BUKAN DAFTAR HITAM.
 *
 * Perbedaannya menentukan apakah pagar ini berguna: daftar hitam meloloskan
 * apa pun yang lupa disebut, dan entitas baru akan otomatis "didukung" tanpa
 * seorang pun memutuskannya. Daftar putih memaksa penambahan entitas jadi
 * tindakan sadar — satu baris di sini, yang terlihat di code review.
 *
 * `lewat: 'langsung'` berarti modelnya sendiri punya tenantId, sehingga
 * forTenant(ctx) sudah cukup untuk membuktikan kepemilikan. Kalau kelak ada
 * entitas yang kepemilikannya harus dibuktikan lewat induk (model anak, K44),
 * ia butuh nilai `lewat` yang lain — dan penanganannya ditulis sadar di
 * ownership.service.ts, bukan diselundupkan sebagai kasus khusus di sini.
 */
export const ENTITAS_DIDUKUNG = {
  VOYAGE: { model: 'voyage', lewat: 'langsung' },
  DISBURSEMENT: { model: 'disbursement', lewat: 'langsung' },
  INVOICE: { model: 'invoice', lewat: 'langsung' },
  PORT_CALL: { model: 'portCall', lewat: 'langsung' },
  TASK: { model: 'task', lewat: 'langsung' },
  VENDOR: { model: 'vendor', lewat: 'langsung' },
  PURCHASE_ORDER: { model: 'purchaseOrder', lewat: 'langsung' },
  WORK_ORDER: { model: 'workOrder', lewat: 'langsung' },
  CREW_CHANGE: { model: 'crewChange', lewat: 'langsung' },
  PORT_PLAYBOOK: { model: 'portPlaybook', lewat: 'langsung' },
  VESSEL: { model: 'vessel', lewat: 'langsung' },
} as const

export type EntityType = keyof typeof ENTITAS_DIDUKUNG
export type BentukEntitas = (typeof ENTITAS_DIDUKUNG)[EntityType]

/** Daftar nama entitas yang sah — dipakai untuk pesan galat yang menolong. */
export const DAFTAR_ENTITAS: readonly string[] = Object.keys(ENTITAS_DIDUKUNG)

/**
 * Semua model di peta di atas WAJIB juga terdaftar di TENANT_MODELS
 * (services/tenant-guard.ts) — kalau tidak, forTenant() tidak menyaringnya dan
 * pemeriksaan kepemilikan jadi teater belaka. Nama di sini huruf kecil di depan
 * (nama properti klien Prisma); TENANT_MODELS memakai nama model (huruf besar).
 * Diekspor supaya check-owner-guard.mjs bisa membuktikan keduanya sejalan.
 */
export const MODEL_PRISMA_ENTITAS: readonly string[] = Object.values(ENTITAS_DIDUKUNG).map(
  (e) => e.model,
)

/** Nama model Prisma → nama model schema (untuk dicocokkan dengan TENANT_MODELS). */
export const namaModelSchema = (modelPrisma: string): string =>
  modelPrisma.charAt(0).toUpperCase() + modelPrisma.slice(1)

/**
 * ⚠️ Ditulis TANPA "parameter property" (`constructor(readonly kode: ...)`)
 * dengan sengaja: penghapus-tipe bawaan Node menolak sintaks itu
 * (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX), dan berkas ini WAJIB tetap bisa diimpor
 * langsung oleh prisma/check-owner-guard.mjs — itulah yang membuat uji memakai
 * peta yang sama dengan aplikasi, bukan tiruannya (K11/K51). Bandingkan dengan
 * ServiceError di services/errors.ts, yang boleh memakainya karena tidak pernah
 * diimpor uji .mjs.
 */
export class OwnerGuardError extends Error {
  kode: 'VALIDATION'

  constructor(kode: 'VALIDATION', pesan: string) {
    super(pesan)
    this.name = 'OwnerGuardError'
    this.kode = kode
  }
}

/** Apakah entityType ini ada di daftar putih? */
export function entitasDidukung(entityType: unknown): entityType is EntityType {
  return typeof entityType === 'string' && Object.prototype.hasOwnProperty.call(ENTITAS_DIDUKUNG, entityType)
}

/**
 * Periksa bentuk (entityType, entityId) TANPA menyentuh database.
 *
 * Aturan 1 K85: entityType yang tidak ada di peta → VALIDATION, bukan
 * diteruskan. Sengaja melempar OwnerGuardError dan bukan ServiceError supaya
 * berkas ini tetap bebas impor; ownership.service.ts yang menerjemahkannya.
 *
 * `hasOwnProperty` dipakai (bukan `entityType in ENTITAS_DIDUKUNG`) supaya
 * nilai seperti 'constructor', 'toString', atau '__proto__' — yang ADA di
 * rantai prototipe setiap objek — tidak ikut lolos sebagai entitas sah.
 */
export function periksaBentukEntitas(
  entityType: unknown,
  entityId: unknown,
): { entityType: EntityType; entityId: string; bentuk: BentukEntitas } {
  if (typeof entityType !== 'string' || entityType.trim() === '') {
    throw new OwnerGuardError('VALIDATION', 'entityType wajib diisi.')
  }
  if (!entitasDidukung(entityType)) {
    throw new OwnerGuardError(
      'VALIDATION',
      `entityType "${entityType}" tidak didukung. Pilihan: ${DAFTAR_ENTITAS.join(', ')}.`,
    )
  }
  if (typeof entityId !== 'string' || entityId.trim() === '') {
    throw new OwnerGuardError('VALIDATION', 'entityId wajib diisi.')
  }
  return {
    entityType,
    entityId: entityId.trim(),
    bentuk: ENTITAS_DIDUKUNG[entityType],
  }
}
