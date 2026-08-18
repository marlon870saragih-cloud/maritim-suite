// Pagar aplikasi portal (K148, Fase 8a) — logika murni, TANPA satu pun impor.
//
// KEBALIKAN tenant-guard.ts, dan bedanya bukan gaya (K148):
//   - Model yang TAK terdaftar di sini → MELEMPAR (fail-closed). tenant-guard
//     melewatkan model tak terdaftar tanpa disaring (fail-open) — aman di sana
//     karena hanya dipakai staf internal; berbahaya di sini karena yang di
//     seberang pagar ini bukan lagi rekan sekantor (K143/§3).
//   - Menyaring DUA sumbu sekaligus: tenantId (sumbu 1, sama seperti
//     tenant-guard) DAN kolom kunci pihak — customerId/vendorId (sumbu 2,
//     yang tenant-guard TIDAK PERNAH dirancang untuk menutupnya — lihat §3.2
//     dokumen desain).
//   - Operasi tulis default DITOLAK. Hanya `create`, dan hanya pada model yang
//     eksplisit terdaftar di MODEL_PORTAL_TULIS (K148/K172).
//
// Tanpa impor supaya bisa dijalankan langsung oleh Node pada
// prisma/check-portal-guard.mjs (K150) — uji memakai objek extension yang
// PERSIS SAMA dengan yang dipakai withPortal(), bukan tiruannya (K11/K51).

export type KunciPihak = { customer?: string; vendor?: string }

/**
 * ⚠️ DAFTAR PUTIH, BUKAN DAFTAR HITAM (K148). Model yang tidak disebut di sini
 * TIDAK BISA disentuh forPortal sama sekali. Menambah satu model = keputusan
 * sadar yang terlihat di code review — bukan sesuatu yang "kebetulan lolos".
 *
 * Model anak tanpa kolom pihak langsung (mis. InvoiceItem, PurchaseOrderItem —
 * model anak tanpa tenantId, K44) SENGAJA tidak di sini; ia hanya boleh ikut
 * lewat `include` dari induk yang sudah tersaring (K148, catatan penutup).
 */
export const MODEL_PORTAL: Readonly<Record<string, KunciPihak>> = {
  Invoice:                 { customer: 'customerId' },
  Voyage:                  { customer: 'customerId' },
  PurchaseOrder:           { vendor: 'vendorId' },
  WorkOrder:               { vendor: 'vendorId' },
  VendorInvoiceSubmission: { vendor: 'vendorId' },
}

/**
 * Model yang boleh DITULIS (create saja, tak pernah update/delete) dari
 * portal — K148: "hanya create pada dua model (K172)". Baru SATU terisi
 * sejauh 8a: VendorInvoiceSubmission (K172), satu-satunya jalur tulis pihak
 * luar yang sudah SEPENUHNYA dirancang. Model kedua (kemungkinan menyokong
 * alur konfirmasi pembayaran K169) menyusul saat 8f merancangnya konkret —
 * TIDAK ditebak di sini; menambahkan model tulis tanpa rancangan menyertai
 * adalah persis kelas kesalahan yang §3 dokumen desain berusaha dicegah.
 */
export const MODEL_PORTAL_TULIS: ReadonlySet<string> = new Set(['VendorInvoiceSubmission'])

const BACA: ReadonlySet<string> = new Set(['findFirst', 'findFirstOrThrow', 'findMany', 'count'])
const TULIS: ReadonlySet<string> = new Set(['create'])

export class PortalGuardError extends Error {
  constructor(pesan: string) {
    super(`[portal-guard] ${pesan}`)
    this.name = 'PortalGuardError'
  }
}

/** Bahan penyaring dua sumbu — dibangun withPortal() dari PortalContext, bukan dari input pemanggil. */
export type SesiPihak = {
  tenantId: string
  pihak: 'CUSTOMER' | 'VENDOR'
  pihakId: string
}

type Args = Record<string, unknown>

/**
 * Terapkan pagar pada satu pemanggilan. Mengembalikan args yang sudah
 * disunting, atau melempar bila model/operasinya tidak diizinkan.
 *
 * Diekspor terpisah supaya bisa diuji tanpa menyentuh database (pola sama
 * `guardArgs` di tenant-guard.ts).
 */
export function guardArgs(model: string, operation: string, args: Args, sesi: SesiPihak): Args {
  const kunci = MODEL_PORTAL[model]

  if (BACA.has(operation)) {
    if (!kunci) {
      throw new PortalGuardError(
        `${model} tidak terdaftar di MODEL_PORTAL — akses ditolak (fail-closed, K148). ` +
          `Model yang memang perlu dibuka ke portal ditambahkan sadar di services/portal/portal-guard.ts.`,
      )
    }
    const kolomPihak = sesi.pihak === 'CUSTOMER' ? kunci.customer : kunci.vendor
    if (!kolomPihak) {
      throw new PortalGuardError(
        `${model} tidak punya kunci untuk pihak ${sesi.pihak} — akses ditolak.`,
      )
    }
    const a: Args = { ...(args ?? {}) }
    // tenantId DAN kolom pihak ditulis SESUDAH where pemanggil → nilai sesi
    // selalu menang, persis pola tenant-guard.ts (sumbu 1 + sumbu 2 sekaligus).
    a.where = {
      ...((a.where as object) ?? {}),
      tenantId: sesi.tenantId,
      [kolomPihak]: sesi.pihakId,
    }
    return a
  }

  if (TULIS.has(operation)) {
    if (!MODEL_PORTAL_TULIS.has(model)) {
      throw new PortalGuardError(
        `${model}.create() tidak diizinkan dari portal — hanya model di ` +
          `MODEL_PORTAL_TULIS boleh ditulis pihak luar (K148).`,
      )
    }
    const data = args?.data
    if (Array.isArray(data)) {
      throw new PortalGuardError('createMany tidak diizinkan dari portal — satu baris per panggilan (K172).')
    }
    const kolomPihak = kunci ? (sesi.pihak === 'CUSTOMER' ? kunci.customer : kunci.vendor) : undefined
    const a: Args = { ...(args ?? {}) }
    // Sama seperti where di atas: tenantId DAN kunci pihak ditimpa nilai
    // sesi — pihak luar tak pernah bisa menulis atas nama pihak lain, meski
    // ia sengaja menyodorkan vendorId/customerId berbeda di body permintaan.
    a.data = {
      ...((data as object) ?? {}),
      tenantId: sesi.tenantId,
      ...(kolomPihak ? { [kolomPihak]: sesi.pihakId } : {}),
    }
    return a
  }

  // Termasuk findUnique/update/updateMany/delete/deleteMany/upsert — SEMUA
  // ditolak, bukan hanya yang tak bisa dipagari (beda sengaja dari
  // tenant-guard.ts: di sana sebagian operasi tulis diizinkan asal terpagari,
  // di sini operasi tulis default tertutup total kecuali create pada model
  // terdaftar, K148 baris "Operasi tulis").
  throw new PortalGuardError(
    `Operasi "${operation}" pada ${model} tidak diizinkan dari portal — hanya ` +
      `${Array.from(BACA).join('/')} dan create (pada model di MODEL_PORTAL_TULIS) yang diizinkan (K148).`,
  )
}

/**
 * Definisi extension Prisma yang mengunci semua query pada satu pihak di
 * satu tenant. Objek biasa, bisa dipasang ke klien Prisma mana pun —
 * aplikasi memakainya lewat forPortal(), uji memakainya langsung.
 */
export function portalGuardExtension(sesi: SesiPihak) {
  return {
    name: 'portal-guard',
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
          return query(guardArgs(model, operation, args, sesi))
        },
      },
    },
  }
}
