// Seed SATU checklist CONTOH (K93 / P30, Fase 7c).
//
// Jalankan dari folder project:  node prisma/seed-task-template.mjs
//
// ⚠️ ISI CHECKLIST DI SINI ADALAH CONTOH, BUKAN PROSEDUR TRIBUANA.
//    P30 masih terbuka: daftar pekerjaan nyata satu kunjungan kapal di Samarinda
//    belum diberikan (Marlon memilih mulai dengan contoh — catatan konfirmasi
//    14 Ags 2026 di §18). Namanya diawali "CONTOH — " supaya provenance-nya
//    terbaca di layar tanpa perlu membuka dokumen ini, mengikuti semangat K59
//    dan konvensi yang sama dengan tarif contoh di seed-v2.mjs.
//
//    Yang benar dilakukan begitu checklist asli tiba: SUNTING template ini
//    (Master › Checklist), jangan buat template kedua. Menyunting butir tidak
//    menyentuh tugas yang sudah lahir (K95), jadi kunjungan yang sedang berjalan
//    aman.
//
// SIFAT SKRIP INI:
// - IDEMPOTEN — aman dijalankan berulang. Template yang sudah ada (dikenali dari
//   namanya) DILEWATI, tidak ditimpa. Begitu operator menyunting butirnya,
//   menjalankan ulang skrip ini tidak akan mengembalikannya ke contoh.
// - Diterapkan ke SEMUA tenant, sama seperti seed-v2.mjs.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

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

const NAMA_TEMPLATE = 'CONTOH — ganti dengan checklist Tribuana'

/** Pelabuhan yang dituju template contoh ini. null = berlaku semua pelabuhan. */
const UNLOCODE = 'IDSRI' // Samarinda

/**
 * Butir CONTOH. `offsetHours` negatif = sebelum jangkar (K93).
 *
 * Angka jamnya adalah TEBAKAN yang masuk akal, bukan kesepakatan — persis
 * sebabnya template ini berlabel CONTOH. `slaHours` sengaja null semuanya,
 * sejalan SLA_BAWAAN_PER_KATEGORI di sla-policy.ts (P32 belum dijawab):
 * menilai pekerjaan orang dengan target yang tak pernah disepakati siapa pun
 * lebih merusak daripada tidak menilai sama sekali.
 */
const BUTIR = [
  {
    title: 'CONTOH — Terima nominasi & konfirmasi ke principal',
    description: 'Balas nominasi, konfirmasi keagenan, catat kontak PIC principal.',
    category: 'DOCUMENT',
    anchor: 'VOYAGE_CREATED',
    offsetHours: 0,
    priority: 'HIGH',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Kirim pre-arrival information ke kapal',
    category: 'DOCUMENT',
    anchor: 'ETA',
    offsetHours: -72,
    priority: 'NORMAL',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Ajukan permohonan clearance ke syahbandar',
    description: 'Berkas: crew list, ship particular, last port clearance.',
    category: 'PORT_CLEARANCE',
    anchor: 'ETA',
    offsetHours: -24,
    priority: 'URGENT',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Pesan pandu & tunda',
    category: 'PORT_CLEARANCE',
    anchor: 'ETA',
    offsetHours: -12,
    priority: 'HIGH',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Susun EPDA dan kirim ke principal',
    category: 'FINANCE',
    anchor: 'ETA',
    offsetHours: -48,
    priority: 'HIGH',
    defaultRole: 'PENYUSUN_BIAYA',
  },
  {
    title: 'CONTOH — Konfirmasi kedatangan (ATA) & kirim arrival report',
    category: 'DOCUMENT',
    anchor: 'ATA',
    offsetHours: 2,
    priority: 'NORMAL',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Koordinasi sandar & mulai bongkar/muat',
    category: 'HUSBANDRY',
    anchor: 'ETB',
    offsetHours: 0,
    priority: 'NORMAL',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Urus kebutuhan kapal (bunker, air tawar, provision)',
    category: 'HUSBANDRY',
    anchor: 'ETB',
    offsetHours: 4,
    priority: 'LOW',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Kumpulkan kuitansi vendor & lampirkan ke FDA',
    category: 'FINANCE',
    anchor: 'ETD',
    offsetHours: -24,
    priority: 'HIGH',
    defaultRole: 'PENYUSUN_BIAYA',
  },
  {
    title: 'CONTOH — Urus port clearance keberangkatan',
    category: 'PORT_CLEARANCE',
    anchor: 'ETD',
    offsetHours: -6,
    priority: 'URGENT',
    defaultRole: 'OPERATOR',
  },
  {
    title: 'CONTOH — Terbitkan FDA final & tagihan ke principal',
    category: 'FINANCE',
    anchor: 'ETD',
    offsetHours: 48,
    priority: 'NORMAL',
    defaultRole: 'FINANCE',
  },
]

async function seedTenant(tenant) {
  const sudahAda = await prisma.taskTemplate.findFirst({
    where: { tenantId: tenant.id, name: NAMA_TEMPLATE },
    select: { id: true },
  })
  if (sudahAda) return { dibuat: 0, id: sudahAda.id }

  const port = await prisma.port.findFirst({
    where: { tenantId: tenant.id, unlocode: UNLOCODE, deletedAt: null },
    select: { id: true },
  })

  const tpl = await prisma.taskTemplate.create({
    data: {
      tenantId: tenant.id,
      name: NAMA_TEMPLATE,
      // Tanpa pelabuhan Samarinda di tenant ini, template tetap dibuat sebagai
      // template UMUM (portId null = cocok apa saja, skor 0 — K93). Melewatinya
      // sama sekali akan membuat tenant itu tak punya contoh untuk dicoba.
      portId: port?.id ?? null,
      agencyType: null,
      vesselType: null,
      isDefault: true,
      isActive: true,
      items: {
        create: BUTIR.map((b, i) => ({
          title: b.title,
          description: b.description ?? null,
          category: b.category,
          anchor: b.anchor,
          offsetHours: b.offsetHours,
          slaHours: null,
          defaultRole: b.defaultRole ?? null,
          priority: b.priority,
          displayOrder: i,
        })),
      },
    },
    select: { id: true },
  })
  return { dibuat: BUTIR.length, id: tpl.id }
}

async function main() {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } })
  if (tenants.length === 0) {
    console.log('⚠️  Tidak ada tenant — tidak ada yang di-seed.')
    return
  }

  console.log(`Seed checklist CONTOH untuk ${tenants.length} tenant\n`)
  for (const t of tenants) {
    const h = await seedTenant(t)
    console.log(
      `  ${t.companyName}\n` +
        (h.dibuat === 0
          ? `    (template "${NAMA_TEMPLATE}" sudah ada — tidak diubah)`
          : `    template dibuat, butir +${h.dibuat}  [${h.id}]`),
    )
  }

  console.log(
    `\n⚠️  Checklist "${NAMA_TEMPLATE}" berisi CONTOH, bukan prosedur Tribuana (P30).\n` +
      '    Sunting butirnya di Master › Checklist begitu daftar aslinya tersedia —\n' +
      '    menyunting template TIDAK mengubah tugas yang sudah terlanjur lahir (K95).',
  )
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
