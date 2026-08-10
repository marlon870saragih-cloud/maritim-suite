// Seed data awal v2 (Fase 0 / M5): Currency, Port, Service Catalog + tarif contoh.
//
// Jalankan dari folder project:  node prisma/seed-v2.mjs
//
// SIFAT SKRIP INI:
// - IDEMPOTEN — aman dijalankan berulang kali.
// - TIDAK PERNAH MENIMPA. Baris yang sudah ada dibiarkan apa adanya. Begitu
//   operator mengisi tarif resmi, menjalankan ulang skrip ini tidak akan
//   menghapusnya.
// - Diterapkan ke SEMUA tenant. Sengaja: kalau nanti UI tenant A menampilkan
//   pelabuhan milik tenant B, kebocoran isolasi langsung kelihatan saat Fase 1.
//
// ⚠️ TARIF DI SINI ADALAH ANGKA CONTOH, BUKAN TARIF RESMI. Dipakai supaya mesin
//    hitung (Fase 3) bisa diuji. WAJIB diganti tarif resmi pelabuhan sebelum
//    EPDA dikirim ke principal.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

// Muat DATABASE_URL dari .env / .env.local (script berdiri sendiri, bukan via Next.js).
for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* file tak ada — lewati */
  }
}

const prisma = new PrismaClient()

const CURRENCIES = [
  { code: 'IDR', name: 'Rupiah', symbol: 'Rp', decimals: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
]

const PORTS = [
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
]

// Seksi A–D mengikuti tata letak EPDA yang sudah dipakai app A, supaya PDF lama
// tetap cocok. Lihat docs/FASE-0-SKEMA-v2.md §K6 soal calcMethod berupa enum.
// `rate` = angka CONTOH (IDR). null = memang tidak bertarif (diketik operator).
const SERVICES = [
  // --- A: Port Authority & Government Charges ---
  { code: 'LIGHT_DUES',     name: 'Light Dues (Uang Rambu)',            cat: 'PORT_CHARGES',    calc: 'PER_GT_PER_CALL', unit: 'GT',     sec: 'A', rate: 250 },
  { code: 'PORT_DUES',      name: 'Port Dues (Labuh)',                  cat: 'PORT_CHARGES',    calc: 'PER_GT_PER_CALL', unit: 'GT',     sec: 'A', rate: 120 },
  { code: 'WHARFAGE',       name: 'Wharfage (Tambat/Dermaga)',          cat: 'PORT_CHARGES',    calc: 'PER_GT_PER_DAY',  unit: 'GT/hari', sec: 'A', rate: 65 },
  { code: 'ANCHORAGE',      name: 'Anchorage (Labuh Jangkar)',          cat: 'PORT_CHARGES',    calc: 'PER_GT_PER_DAY',  unit: 'GT/hari', sec: 'A', rate: 45 },

  // --- B: Pilotage, Towage & Mooring ---
  { code: 'PILOTAGE',       name: 'Pilotage (Jasa Pandu)',              cat: 'MARINE_SERVICES', calc: 'PER_GT_PER_CALL', unit: 'GT',     sec: 'B', rate: 175, minCharge: 2_500_000 },
  { code: 'TOWAGE',         name: 'Towage (Jasa Tunda)',                cat: 'MARINE_SERVICES', calc: 'PER_UNIT',        unit: 'tug/jam', sec: 'B', rate: 4_500_000 },
  { code: 'MOORING',        name: 'Mooring/Unmooring (Ikat/Lepas Tali)', cat: 'MARINE_SERVICES', calc: 'PER_GT_PER_CALL', unit: 'GT',     sec: 'B', rate: 90 },
  { code: 'LAUNCH_BOAT',    name: 'Launch Boat (Kapal Motor)',          cat: 'MARINE_SERVICES', calc: 'PER_UNIT',        unit: 'trip',   sec: 'B', rate: 1_500_000 },

  // --- C: Clearance & Documentation ---
  { code: 'CUSTOMS',        name: 'Customs Clearance (Bea Cukai)',      cat: 'GOVERNMENT',      calc: 'FLAT',            unit: 'call',   sec: 'C', rate: 1_000_000 },
  { code: 'IMMIGRATION',    name: 'Immigration (Imigrasi)',             cat: 'GOVERNMENT',      calc: 'FLAT',            unit: 'call',   sec: 'C', rate: 750_000 },
  { code: 'QUARANTINE',     name: 'Health Quarantine (Karantina)',      cat: 'GOVERNMENT',      calc: 'FLAT',            unit: 'call',   sec: 'C', rate: 1_000_000 },
  { code: 'HARBOUR_MASTER', name: 'Harbour Master / SPB (Syahbandar)',  cat: 'GOVERNMENT',      calc: 'FLAT',            unit: 'call',   sec: 'C', rate: 1_500_000 },
  { code: 'DOCUMENTATION',  name: 'Documentation & Materai',            cat: 'GOVERNMENT',      calc: 'FLAT',            unit: 'call',   sec: 'C', rate: 500_000 },

  // --- D: Agency & Disbursements ---
  { code: 'AGENCY_FEE',     name: 'Agency Fee',                         cat: 'AGENCY',          calc: 'PERCENTAGE',      unit: '%',      sec: 'D', rate: 2.5, taxable: true, taxPct: 11 },
  { code: 'COMMUNICATION',  name: 'Communication & Postage',            cat: 'AGENCY',          calc: 'FLAT',            unit: 'call',   sec: 'D', rate: 750_000 },
  { code: 'TRANSPORT',      name: 'Transportation (Lokal)',             cat: 'AGENCY',          calc: 'FLAT',            unit: 'call',   sec: 'D', rate: 1_500_000 },
  { code: 'FRESH_WATER',    name: 'Fresh Water Supply (Air Tawar)',     cat: 'HUSBANDRY',       calc: 'PER_TON',         unit: 'ton',    sec: 'D', rate: 125_000 },
  { code: 'GARBAGE',        name: 'Garbage Removal (Sampah)',           cat: 'HUSBANDRY',       calc: 'FLAT',            unit: 'call',   sec: 'D', rate: 2_000_000 },
  { code: 'CREW_CHANGE',    name: 'Crew Change Handling',               cat: 'HUSBANDRY',       calc: 'PER_UNIT',        unit: 'orang',  sec: 'D', rate: 1_500_000 },
  { code: 'CTM',            name: 'Cash to Master (CTM)',               cat: 'HUSBANDRY',       calc: 'MANUAL',          unit: 'lump',   sec: 'D', rate: null },
  { code: 'MISC',           name: 'Miscellaneous / Contingency',        cat: 'OTHER',           calc: 'MANUAL',          unit: 'lump',   sec: 'D', rate: null },
]

async function seedTenant(tenant) {
  const hasil = { currency: 0, port: 0, service: 0, rate: 0 }

  for (const c of CURRENCIES) {
    const ada = await prisma.currency.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: c.code } },
    })
    if (ada) continue
    await prisma.currency.create({ data: { tenantId: tenant.id, ...c } })
    hasil.currency++
  }

  for (const p of PORTS) {
    const ada = await prisma.port.findUnique({
      where: { tenantId_unlocode: { tenantId: tenant.id, unlocode: p.unlocode } },
    })
    if (ada) continue
    await prisma.port.create({ data: { tenantId: tenant.id, ...p } })
    hasil.port++
  }

  for (const [i, s] of SERVICES.entries()) {
    let svc = await prisma.serviceCatalog.findUnique({
      where: { tenantId_serviceCode: { tenantId: tenant.id, serviceCode: s.code } },
    })
    if (!svc) {
      svc = await prisma.serviceCatalog.create({
        data: {
          tenantId: tenant.id,
          serviceCode: s.code,
          serviceName: s.name,
          category: s.cat,
          calcMethod: s.calc,
          defaultUnit: s.unit,
          defaultCurrency: 'IDR',
          taxable: s.taxable ?? false,
          taxPct: s.taxPct ?? null,
          sectionLetter: s.sec,
          displayOrder: (i + 1) * 10,
        },
      })
      hasil.service++
    }

    // Tarif hanya dibuat bila jasa ini BELUM punya tarif sama sekali —
    // supaya tarif resmi yang sudah diisi operator tidak pernah tertimpa.
    if (s.rate == null) continue
    const adaTarif = await prisma.serviceRate.findFirst({ where: { serviceId: svc.id } })
    if (adaTarif) continue
    await prisma.serviceRate.create({
      data: {
        tenantId: tenant.id,
        serviceId: svc.id,
        portId: null, // null = berlaku umum; nanti dipersempit per pelabuhan
        rate: s.rate,
        currency: 'IDR',
        minCharge: s.minCharge ?? null,
      },
    })
    hasil.rate++
  }

  return hasil
}

async function main() {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } })
  if (tenants.length === 0) {
    console.log('⚠️  Tidak ada tenant — tidak ada yang di-seed.')
    return
  }

  console.log(`Seed data awal v2 untuk ${tenants.length} tenant\n`)
  for (const t of tenants) {
    const h = await seedTenant(t)
    const total = h.currency + h.port + h.service + h.rate
    console.log(
      `  ${t.companyName}\n` +
        `    mata uang +${h.currency}  pelabuhan +${h.port}  jasa +${h.service}  tarif +${h.rate}` +
        (total === 0 ? '   (sudah lengkap, tidak ada perubahan)' : ''),
    )
  }

  console.log(
    '\n⚠️  Tarif yang dibuat skrip ini adalah ANGKA CONTOH, bukan tarif resmi.\n' +
      '    Ganti dengan tarif pelabuhan yang berlaku sebelum EPDA dikirim ke principal.\n' +
      '    Menjalankan ulang skrip ini TIDAK akan menimpa tarif yang sudah Anda isi.',
  )
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
