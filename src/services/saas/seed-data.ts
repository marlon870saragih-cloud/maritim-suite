// Data & logika penyemaian awal tenant (K153, Fase 8b) — SATU-SATUNYA sumber
// kebenaran, dipakai baik oleh skrip CLI (prisma/seed-v2.mjs, jalan manual
// atau lintas-tenant) MAUPUN oleh onboarding wizard (onboarding.service.ts,
// satu tenant lewat systemContext(tenantId)) saat pendaftaran baru. K153:
// "Tidak ada skrip penyemaian kedua" — array di bawah ini definisi TUNGGAL.
//
// Diimpor lewat path RELATIF (bukan alias `@/...`) dan TANPA impor dari
// tenant-guard/tenant-db/context — supaya berkas ini tetap bisa diimpor
// langsung oleh Node (`prisma/seed-v2.mjs`, cetakan pola tenant-guard.ts/
// portal-guard.ts K11/K51), maupun dari dalam aplikasi Next.js.
//
// IDEMPOTEN — aman dipanggil berulang. TIDAK PERNAH MENIMPA baris yang
// sudah ada (begitu operator mengisi tarif resmi, memanggil ulang tidak
// akan menghapusnya).
//
// K153 — baris BARU yang dibuat penyemaian diberi label "CONTOH — " di
// depan nama tampilannya (Currency/Port/ServiceCatalog tidak punya kolom
// dataOrigin — itu provenance Fase 6a untuk data OPERASIONAL/AI, bukan
// master data acuan). Baris LAMA yang sudah ada (mis. Tribuana, di-seed
// sebelum label ini ditambahkan) TIDAK tersentuh — pengecekan idempoten
// hanya membuat baris kalau belum ada sama sekali.
//
// ⚠️ TARIF DI SINI ADALAH ANGKA CONTOH, BUKAN TARIF RESMI.

const CONTOH = 'CONTOH — '

export const CURRENCIES = [
  { code: 'IDR', name: 'Rupiah', symbol: 'Rp', decimals: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
] as const

export const PORTS = [
  {
    unlocode: 'IDSRI',
    name: 'Samarinda',
    country: 'ID',
    timezone: 'Asia/Makassar',
    portAuthority: 'KSOP Kelas I Samarinda',
    pilotRequired: true,
    tugRequired: true,
    workingHours: '24 jam',
  },
  {
    unlocode: 'IDBPN',
    name: 'Balikpapan',
    country: 'ID',
    timezone: 'Asia/Makassar',
    portAuthority: 'KSOP Kelas I Balikpapan',
    pilotRequired: true,
    tugRequired: true,
    workingHours: '24 jam',
  },
  {
    unlocode: 'SGSIN',
    name: 'Singapore',
    country: 'SG',
    timezone: 'Asia/Singapore',
    portAuthority: 'Maritime and Port Authority of Singapore (MPA)',
    pilotRequired: true,
    tugRequired: true,
    workingHours: '24 jam',
  },
] as const

// Seksi A–D mengikuti tata letak EPDA yang sudah dipakai app A, supaya PDF
// lama tetap cocok. rate = angka CONTOH (IDR). null = memang tidak
// bertarif (diketik operator, mis. Cash to Master).
export const SERVICES = [
  // --- A: Port Authority & Government Charges ---
  { code: 'LIGHT_DUES', name: 'Light Dues (Uang Rambu)', cat: 'PORT_CHARGES', calc: 'PER_GT_PER_CALL', unit: 'GT', sec: 'A', rate: 250 },
  { code: 'PORT_DUES', name: 'Port Dues (Labuh)', cat: 'PORT_CHARGES', calc: 'PER_GT_PER_CALL', unit: 'GT', sec: 'A', rate: 120 },
  { code: 'WHARFAGE', name: 'Wharfage (Tambat/Dermaga)', cat: 'PORT_CHARGES', calc: 'PER_GT_PER_DAY', unit: 'GT/hari', sec: 'A', rate: 65 },
  { code: 'ANCHORAGE', name: 'Anchorage (Labuh Jangkar)', cat: 'PORT_CHARGES', calc: 'PER_GT_PER_DAY', unit: 'GT/hari', sec: 'A', rate: 45 },

  // --- B: Pilotage, Towage & Mooring ---
  { code: 'PILOTAGE', name: 'Pilotage (Jasa Pandu)', cat: 'MARINE_SERVICES', calc: 'PER_GT_PER_CALL', unit: 'GT', sec: 'B', rate: 175, minCharge: 2_500_000 },
  { code: 'TOWAGE', name: 'Towage (Jasa Tunda)', cat: 'MARINE_SERVICES', calc: 'PER_UNIT', unit: 'tug/jam', sec: 'B', rate: 4_500_000 },
  { code: 'MOORING', name: 'Mooring/Unmooring (Ikat/Lepas Tali)', cat: 'MARINE_SERVICES', calc: 'PER_GT_PER_CALL', unit: 'GT', sec: 'B', rate: 90 },
  { code: 'LAUNCH_BOAT', name: 'Launch Boat (Kapal Motor)', cat: 'MARINE_SERVICES', calc: 'PER_UNIT', unit: 'trip', sec: 'B', rate: 1_500_000 },

  // --- C: Clearance & Documentation ---
  { code: 'CUSTOMS', name: 'Customs Clearance (Bea Cukai)', cat: 'GOVERNMENT', calc: 'FLAT', unit: 'call', sec: 'C', rate: 1_000_000 },
  { code: 'IMMIGRATION', name: 'Immigration (Imigrasi)', cat: 'GOVERNMENT', calc: 'FLAT', unit: 'call', sec: 'C', rate: 750_000 },
  { code: 'QUARANTINE', name: 'Health Quarantine (Karantina)', cat: 'GOVERNMENT', calc: 'FLAT', unit: 'call', sec: 'C', rate: 1_000_000 },
  { code: 'HARBOUR_MASTER', name: 'Harbour Master / SPB (Syahbandar)', cat: 'GOVERNMENT', calc: 'FLAT', unit: 'call', sec: 'C', rate: 1_500_000 },
  { code: 'DOCUMENTATION', name: 'Documentation & Materai', cat: 'GOVERNMENT', calc: 'FLAT', unit: 'call', sec: 'C', rate: 500_000 },

  // --- D: Agency & Disbursements ---
  { code: 'AGENCY_FEE', name: 'Agency Fee', cat: 'AGENCY', calc: 'PERCENTAGE', unit: '%', sec: 'D', rate: 2.5, taxable: true, taxPct: 11 },
  { code: 'COMMUNICATION', name: 'Communication & Postage', cat: 'AGENCY', calc: 'FLAT', unit: 'call', sec: 'D', rate: 750_000 },
  { code: 'TRANSPORT', name: 'Transportation (Lokal)', cat: 'AGENCY', calc: 'FLAT', unit: 'call', sec: 'D', rate: 1_500_000 },
  { code: 'FRESH_WATER', name: 'Fresh Water Supply (Air Tawar)', cat: 'HUSBANDRY', calc: 'PER_TON', unit: 'ton', sec: 'D', rate: 125_000 },
  { code: 'GARBAGE', name: 'Garbage Removal (Sampah)', cat: 'HUSBANDRY', calc: 'FLAT', unit: 'call', sec: 'D', rate: 2_000_000 },
  { code: 'CREW_CHANGE', name: 'Crew Change Handling', cat: 'HUSBANDRY', calc: 'PER_UNIT', unit: 'orang', sec: 'D', rate: 1_500_000 },
  { code: 'CTM', name: 'Cash to Master (CTM)', cat: 'HUSBANDRY', calc: 'MANUAL', unit: 'lump', sec: 'D', rate: null },
  { code: 'MISC', name: 'Miscellaneous / Contingency', cat: 'OTHER', calc: 'MANUAL', unit: 'lump', sec: 'D', rate: null },
] as const

/** Bentuk minimal klien Prisma yang dibutuhkan — cocok dengan PrismaClient
 * mentah (dipakai seed-v2.mjs) MAUPUN forTenant(ctx) (dipakai onboarding
 * service, K153: "dipanggil lewat systemContext(tenantId)"). Diketik longgar
 * sengaja: dua sumber pemanggil punya tipe TypeScript yang berbeda persis
 * (klien biasa vs klien ber-extends), dan keduanya structurally cocok di sini.
 *
 * SENGAJA `findFirst`, bukan `findUnique` — tenant-guard.ts (K11) melarang
 * `findUnique()` sama sekali lewat `forTenant(ctx)` (Prisma tidak menyaring
 * selector unik dengan filter tambahan), jadi memakainya di sini akan gagal
 * total saat dipanggil dari onboarding service meski lancar dari seed-v2.mjs
 * (klien mentah). `findFirst({ where: { tenantId, ... } })` jalan di keduanya. */
type DbSeed = {
  currency: {
    findFirst(args: unknown): Promise<{ id: string } | null>
    create(args: unknown): Promise<unknown>
  }
  port: {
    findFirst(args: unknown): Promise<{ id: string } | null>
    create(args: unknown): Promise<unknown>
  }
  serviceCatalog: {
    findFirst(args: unknown): Promise<{ id: string } | null>
    create(args: unknown): Promise<{ id: string }>
  }
  serviceRate: {
    findFirst(args: unknown): Promise<{ id: string } | null>
    create(args: unknown): Promise<unknown>
  }
}

export type HasilSeed = { currency: number; port: number; service: number; rate: number }

export async function seedTenant(db: DbSeed, tenantId: string): Promise<HasilSeed> {
  const hasil: HasilSeed = { currency: 0, port: 0, service: 0, rate: 0 }

  for (const c of CURRENCIES) {
    const ada = await db.currency.findFirst({ where: { tenantId, code: c.code } })
    if (ada) continue
    await db.currency.create({ data: { tenantId, code: c.code, name: CONTOH + c.name, symbol: c.symbol, decimals: c.decimals } })
    hasil.currency++
  }

  for (const p of PORTS) {
    const ada = await db.port.findFirst({ where: { tenantId, unlocode: p.unlocode } })
    if (ada) continue
    await db.port.create({
      data: {
        tenantId,
        unlocode: p.unlocode,
        name: CONTOH + p.name,
        country: p.country,
        timezone: p.timezone,
        portAuthority: p.portAuthority,
        pilotRequired: p.pilotRequired,
        tugRequired: p.tugRequired,
        workingHours: p.workingHours,
      },
    })
    hasil.port++
  }

  for (const [i, s] of Array.from(SERVICES).map((v, idx) => [idx, v] as const)) {
    let svc = await db.serviceCatalog.findFirst({ where: { tenantId, serviceCode: s.code } })
    if (!svc) {
      svc = await db.serviceCatalog.create({
        data: {
          tenantId,
          serviceCode: s.code,
          serviceName: CONTOH + s.name,
          category: s.cat,
          calcMethod: s.calc,
          defaultUnit: s.unit,
          defaultCurrency: 'IDR',
          taxable: 'taxable' in s ? s.taxable : false,
          taxPct: 'taxPct' in s ? s.taxPct : null,
          sectionLetter: s.sec,
          displayOrder: (i + 1) * 10,
        },
      })
      hasil.service++
    }

    // Tarif hanya dibuat bila jasa ini BELUM punya tarif sama sekali — supaya
    // tarif resmi yang sudah diisi operator tidak pernah tertimpa.
    if (s.rate == null) continue
    const adaTarif = await db.serviceRate.findFirst({ where: { serviceId: svc.id } })
    if (adaTarif) continue
    await db.serviceRate.create({
      data: {
        tenantId,
        serviceId: svc.id,
        portId: null,
        rate: s.rate,
        currency: 'IDR',
        minCharge: 'minCharge' in s ? s.minCharge : null,
      },
    })
    hasil.rate++
  }

  return hasil
}
