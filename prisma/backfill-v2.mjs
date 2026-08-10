// Backfill v2 (Fase 0 / M3–M4): data lama → struktur voyage-centric.
//
//   M3  Setiap PortCall lama dibuatkan satu Voyage induk, lalu ditautkan.
//   M4  MaritimeDocument lama ditautkan ke Voyage lewat portCallId yang ada.
//
// Jalankan dari folder project:
//   node prisma/backfill-v2.mjs --dry-run   → hanya menampilkan rencana
//   node prisma/backfill-v2.mjs             → menerapkan
//
// SIFAT SKRIP INI:
// - IDEMPOTEN — baris yang sudah punya voyageId dilewati, jadi aman diulang.
// - ADITIF — tidak ada data lama yang diubah nilainya atau dihapus; hanya
//   mengisi kolom tautan yang sebelumnya kosong.
// - KONSERVATIF pada pelabuhan: kalau nama pelabuhan di data lama tidak cocok
//   dengan Master Port, tautan dibiarkan KOSONG. Lebih baik kosong daripada
//   salah tunjuk. Jalankan `node prisma/seed-v2.mjs` lebih dulu agar Master
//   Port sudah terisi.

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
const DRY = process.argv.includes('--dry-run')

/** PortCallStatus (lama) → VoyageStatus (baru). */
const STATUS = {
  UPCOMING: 'PLANNED',
  IN_PORT: 'ARRIVED',
  DEPARTED: 'DEPARTED',
  CANCELLED: 'CANCELLED',
}

/** "6000" / "6,000" / "6.000 MT" → 6000 ; yang tak terbaca → null. */
function parseQty(raw) {
  if (raw == null) return null
  const m = String(raw).replace(/[.,](?=\d{3}\b)/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** Nomor voyage berikutnya: VYG-YYYY-NNNNNN, berurutan per tenant per tahun. */
async function nextVoyageNumber(tenantId, year, dipakai) {
  const prefix = `VYG-${year}-`
  const terakhir = await prisma.voyage.findFirst({
    where: { tenantId, voyageNumber: { startsWith: prefix } },
    orderBy: { voyageNumber: 'desc' },
    select: { voyageNumber: true },
  })
  let seq = terakhir ? Number(terakhir.voyageNumber.slice(prefix.length)) : 0
  // `dipakai` menampung nomor yang sudah dijatah dalam sesi ini (mode dry-run
  // tidak menulis ke DB, jadi query di atas tidak akan melihatnya).
  let kandidat
  do {
    seq++
    kandidat = `${prefix}${String(seq).padStart(6, '0')}`
  } while (dipakai.has(kandidat))
  dipakai.add(kandidat)
  return kandidat
}

/** Cocokkan teks pelabuhan lama ke Master Port. Ragu = null. */
function cocokkanPort(teks, daftarPort) {
  if (!teks) return null
  const t = teks.trim().toLowerCase()
  const persis = daftarPort.find((p) => p.name.toLowerCase() === t || p.unlocode?.toLowerCase() === t)
  if (persis) return persis
  // Cocok sebagian, hanya bila TEPAT SATU pelabuhan yang cocok (hindari tebakan).
  const sebagian = daftarPort.filter(
    (p) => t.includes(p.name.toLowerCase()) || (p.unlocode && t.includes(p.unlocode.toLowerCase())),
  )
  return sebagian.length === 1 ? sebagian[0] : null
}

async function main() {
  console.log(DRY ? '=== MODE PRATINJAU (tidak menulis apa pun) ===\n' : '=== MENERAPKAN BACKFILL ===\n')

  // ---------- M3: PortCall → Voyage ----------
  const portCalls = await prisma.portCall.findMany({
    where: { voyageId: null },
    include: { vessel: true, principal: true },
    orderBy: { createdAt: 'asc' },
  })

  const sudah = await prisma.portCall.count({ where: { voyageId: { not: null } } })
  console.log(`M3 — PortCall tanpa Voyage: ${portCalls.length} (sudah tertaut sebelumnya: ${sudah})`)

  const portPerTenant = new Map()
  const dipakai = new Set()
  let dibuat = 0
  let cargoDibuat = 0
  let portTakCocok = 0

  for (const pc of portCalls) {
    if (!portPerTenant.has(pc.tenantId)) {
      portPerTenant.set(
        pc.tenantId,
        await prisma.port.findMany({ where: { tenantId: pc.tenantId, deletedAt: null } }),
      )
    }
    const port = cocokkanPort(pc.port, portPerTenant.get(pc.tenantId))
    if (!port) portTakCocok++

    const tanggal = pc.ata ?? pc.eta ?? pc.createdAt
    const nomor = await nextVoyageNumber(pc.tenantId, tanggal.getFullYear(), dipakai)
    const qty = parseQty(pc.cargoQty)

    console.log(
      `  ${nomor}  ${pc.vessel?.name ?? '(kapal ?)'} @ ${pc.port}` +
        `  [${pc.status} → ${STATUS[pc.status] ?? 'PLANNED'}]` +
        `  port: ${port ? port.unlocode : '— tidak cocok, dikosongkan'}` +
        (pc.cargo ? `  kargo: ${pc.cargo}${qty != null ? ` ${qty} ${pc.cargoUnit ?? ''}`.trimEnd() : ''}` : ''),
    )

    if (DRY) {
      dibuat++
      if (pc.cargo) cargoDibuat++
      continue
    }

    await prisma.$transaction(async (tx) => {
      const voyage = await tx.voyage.create({
        data: {
          tenantId: pc.tenantId,
          voyageNumber: nomor,
          vesselId: pc.vesselId,
          principalId: pc.principalId,
          portId: port?.id ?? null,
          status: STATUS[pc.status] ?? 'PLANNED',
          eta: pc.eta,
          etd: pc.etd,
          ata: pc.ata,
          atd: pc.atd,
          notes: pc.notes,
          // Voyage dibuat dari data lama; jejak asalnya disimpan agar bisa ditelusuri.
          baseCurrency: 'IDR',
        },
      })

      if (pc.cargo) {
        await tx.cargo.create({
          data: {
            voyageId: voyage.id,
            cargoName: pc.cargo,
            quantity: qty,
            unit: pc.cargoUnit,
          },
        })
      }

      await tx.portCall.update({
        where: { id: pc.id },
        data: { voyageId: voyage.id, portRefId: port?.id ?? pc.portRefId ?? null },
      })
    })

    dibuat++
    if (pc.cargo) cargoDibuat++
  }

  // ---------- M4: MaritimeDocument → Voyage (lewat portCallId) ----------
  const docTertaut = await prisma.maritimeDocument.count({
    where: { voyageId: null, portCallId: { not: null } },
  })
  const docYatim = await prisma.maritimeDocument.count({ where: { portCallId: null } })

  console.log(`\nM4 — Dokumen yang bisa ditautkan lewat portCallId: ${docTertaut}`)
  let docDiupdate = 0
  if (docTertaut > 0 && !DRY) {
    const docs = await prisma.maritimeDocument.findMany({
      where: { voyageId: null, portCallId: { not: null } },
      include: { portCall: { select: { voyageId: true } } },
    })
    for (const d of docs) {
      if (!d.portCall?.voyageId) continue
      await prisma.maritimeDocument.update({
        where: { id: d.id },
        data: { voyageId: d.portCall.voyageId },
      })
      docDiupdate++
    }
  }

  // ---------- Ringkasan ----------
  console.log('\n=== RINGKASAN ===')
  console.log(`  Voyage ${DRY ? 'akan dibuat' : 'dibuat'}      : ${dibuat}`)
  console.log(`  Cargo  ${DRY ? 'akan dibuat' : 'dibuat'}      : ${cargoDibuat}`)
  console.log(`  Dokumen ${DRY ? 'akan ditautkan' : 'ditautkan'}   : ${DRY ? docTertaut : docDiupdate}`)
  if (portTakCocok > 0) {
    console.log(`  ⚠️  Pelabuhan tak cocok      : ${portTakCocok} (tautan dikosongkan, isi manual di Master Data)`)
  }
  if (docYatim > 0) {
    console.log(
      `\n  ℹ️  ${docYatim} dokumen lama TIDAK punya portCallId sama sekali, jadi tidak ada\n` +
        `      jalur yang bisa dipercaya untuk menautkannya ke Voyage. Dokumen itu tetap\n` +
        `      utuh dan terbaca sebagai arsip (sesuai strategi M6). Menebak dari kolom\n` +
        `      teks "port" sengaja TIDAK dilakukan — isinya campur aduk (ada nama\n` +
        `      perusahaan dan nomor dokumen di sana), jadi tebakan akan menciptakan\n` +
        `      relasi palsu yang lebih berbahaya daripada tautan kosong.`,
    )
  }
  if (DRY) console.log('\nPratinjau saja — belum ada yang ditulis. Jalankan tanpa --dry-run untuk menerapkan.')
}

main()
  .catch((e) => {
    console.error('❌ Backfill gagal:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
