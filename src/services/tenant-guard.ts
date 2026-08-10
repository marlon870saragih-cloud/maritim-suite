// Aturan pemagaran tenant — logika murni, TANPA satu pun impor.
//
// Sengaja dipisah dari tenant-db.ts (yang menyambungkannya ke klien Prisma app)
// karena dua alasan:
//   1. Ini bagian paling kritis untuk keamanan; makin sedikit yang ikut terbawa,
//      makin mudah dibaca dan diperiksa.
//   2. Tanpa impor, berkas ini bisa dijalankan langsung oleh Node pada uji
//      prisma/check-tenant-guard.mjs — sehingga uji memakai objek extension yang
//      PERSIS SAMA dengan yang dipakai aplikasi, bukan tiruannya.

/**
 * Model yang punya kolom tenantId. Model anak (Cargo, DisbursementItem,
 * InvoiceItem, ServiceTemplateItem) sengaja TIDAK ada di sini — isolasinya
 * diwarisi dari induk lewat relasi + onDelete: Cascade (keputusan #4 di
 * docs/FASE-0-SKEMA-v2.md §7). Akses model anak WAJIB lewat induknya.
 *
 * ⚠️ Menambah model bertenant baru di schema.prisma? Tambahkan namanya di sini.
 *    `node prisma/check-tenant-guard.mjs` akan GAGAL kalau daftar ini ketinggalan.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'Payment',
  'User',
  'Vessel',
  'Principal',
  'PortCall',
  'MaritimeDocument',
  'Port',
  'Customer',
  'Vendor',
  'Currency',
  'ExchangeRate',
  'ServiceCatalog',
  'ServiceRate',
  'ServiceTemplate',
  'Voyage',
  'Disbursement',
  'Invoice',
  'InvoicePayment',
  'Approval',
  'AuditLog',
])

/** Operasi yang aman disaring lewat `where`. */
const SARING_WHERE: ReadonlySet<string> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
])

/** Operasi yang tenantId-nya disuntikkan ke `data`. */
const ISI_DATA: ReadonlySet<string> = new Set(['create', 'createMany', 'createManyAndReturn'])

/**
 * Operasi yang TIDAK bisa dijamin aman: Prisma mewajibkan selector unik, jadi
 * tenantId tak bisa ikut menyaring. Dilarang, dengan usulan penggantinya.
 *
 * Ini bukan gaya baru — kode app A yang sudah ada memang sudah memakai
 * updateMany/deleteMany berpagar tenantId (lihat api/vessels/[id]/route.ts).
 * Di sini kebiasaan itu tinggal diwajibkan.
 */
const DILARANG: Readonly<Record<string, string>> = {
  findUnique: 'findFirst({ where: { id, ... } })',
  findUniqueOrThrow: 'findFirstOrThrow({ where: { id, ... } })',
  update: 'updateMany({ where: { id } }) lalu periksa count === 0 → notFound()',
  delete: 'deleteMany({ where: { id } }) lalu periksa count === 0 → notFound()',
  upsert: 'findFirst() dulu, lalu create() atau updateMany()',
}

export class TenantGuardError extends Error {
  constructor(pesan: string) {
    super(`[tenant-guard] ${pesan}`)
    this.name = 'TenantGuardError'
  }
}

type Args = Record<string, unknown>

/**
 * Terapkan pagar pada satu pemanggilan. Mengembalikan args yang sudah disunting,
 * atau melempar bila operasinya tak bisa diamankan.
 *
 * Diekspor terpisah supaya bisa diuji tanpa menyentuh database sama sekali.
 */
export function guardArgs(model: string, operation: string, args: Args, tenantId: string): Args {
  if (!TENANT_MODELS.has(model)) return args

  const usul = DILARANG[operation]
  if (usul) {
    throw new TenantGuardError(
      `${model}.${operation}() tidak bisa dipagari tenant — Prisma mewajibkan selector ` +
        `unik sehingga tenantId tak ikut tersaring. Pakai ${usul} sebagai gantinya.`,
    )
  }

  const a: Args = { ...(args ?? {}) }

  if (SARING_WHERE.has(operation)) {
    // tenantId ditulis SESUDAH where pemanggil → nilai konteks selalu menang,
    // meski pemanggil sengaja menyodorkan tenantId lain.
    a.where = { ...((a.where as object) ?? {}), tenantId }
    return a
  }

  if (ISI_DATA.has(operation)) {
    const data = a.data
    a.data = Array.isArray(data)
      ? data.map((d) => ({ ...(d as object), tenantId }))
      : { ...((data as object) ?? {}), tenantId }
    return a
  }

  // Operasi tak dikenal (versi Prisma baru?) — tolak, jangan diam-diam lolos.
  throw new TenantGuardError(
    `Operasi "${operation}" pada ${model} belum dikenali guard. ` +
      `Tambahkan ke SARING_WHERE / ISI_DATA / DILARANG di services/tenant-guard.ts.`,
  )
}

/**
 * Definisi extension Prisma yang mengunci semua query pada satu tenant.
 * Berupa objek biasa, jadi bisa dipasang ke klien Prisma mana pun —
 * aplikasi memakainya lewat forTenant(), uji memakainya langsung.
 */
export function tenantGuardExtension(tenantId: string) {
  return {
    name: 'tenant-guard',
    query: {
      $allModels: {
        $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string
          operation: string
          args: Args
          query: (a: Args) => Promise<unknown>
        }) {
          return query(guardArgs(model, operation, args, tenantId))
        },
      },
    },
  }
}
