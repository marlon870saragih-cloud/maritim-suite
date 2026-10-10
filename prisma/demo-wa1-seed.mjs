// Seed DEMO internal WA-1 (Step 2J) — data SINTETIS untuk demo owner di laptop (lokal, non-produksi).
//
// Membuat satu tenant demo, dua pengguna (ADMIN & MANAJER_OPERASI) dengan kata sandi ACAK yang dicetak sekali,
// satu kapal, satu pelabuhan (Asia/Makassar), dan sinyal monitoring: perubahan ETA, EOSP, ALL_FAST, SAILED
// (empat event pilot) + dua sinyal non-pilot (COMMENCED, VOYAGE_STATUS_CHANGED) untuk menunjukkan tombol
// "Siapkan Update Klien" hanya muncul pada event pilot. Penerima pesan tetap fixture TEST_FIXTURE bawaan kode.
//
//   DEMO_DB_URL=postgresql://…@127.0.0.1:5432/<db_lokal> node prisma/demo-wa1-seed.mjs          # buat/ulang
//   DEMO_DB_URL=… node prisma/demo-wa1-seed.mjs --hapus                                           # bersihkan
//
// Guard: DB WAJIB loopback; NODE_ENV=production ditolak. Tidak pernah menyentuh server/DB produksi.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const URL_DB = process.env.DEMO_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — DEMO_DB_URL wajib diset ke PostgreSQL LOKAL (loopback).')
  process.exit(3)
}
let host = ''
try {
  host = new URL(URL_DB).hostname
} catch {
  /* ditolak di bawah */
}
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host) || (process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
  console.log('❌ DITOLAK: DEMO_DB_URL harus loopback dan NODE_ENV bukan production. Tidak ada yang disentuh.')
  process.exit(1)
}

const ID_TENANT = 'wa1demotenant0000000001'
const db = new PrismaClient({ datasources: { db: { url: URL_DB } } })

async function hapus() {
  await db.tahApprovalRequest.deleteMany({ where: { tenantId: ID_TENANT } })
  await db.auditLog.deleteMany({ where: { tenantId: ID_TENANT } })
  await db.tenant.deleteMany({ where: { id: ID_TENANT } })
}

try {
  await hapus()
  if (process.argv.includes('--hapus')) {
    console.log('Data demo WA-1 dihapus.')
  } else {
    const sandi = randomBytes(9).toString('base64url')
    const hash = await bcrypt.hash(sandi, 10)
    const t = await db.tenant.create({ data: { id: ID_TENANT, companyName: 'DEMO WA-1 (Simulasi)' } })
    const users = [
      ['demo-admin@wa1.local', 'Demo Admin', 'ADMIN'],
      ['demo-manajer@wa1.local', 'Demo Manajer Operasi', 'MANAJER_OPERASI'],
    ]
    for (const [email, name, role] of users) await db.user.create({ data: { tenantId: t.id, email, name, password: hash, role, isActive: true } })
    const kapal = await db.vessel.create({ data: { tenantId: t.id, name: 'MT Demo Simulasi' } })
    const port = await db.port.create({ data: { tenantId: t.id, name: 'Pelabuhan Demo', timezone: 'Asia/Makassar' } })
    const jam = (h) => new Date(Date.now() - h * 3_600_000)
    const tgl = (hari) => new Date(Date.now() + hari * 86_400_000).toISOString().slice(0, 10)
    let n = 0
    const voyage = (ubah = {}) => db.voyage.create({ data: { tenantId: t.id, vesselId: kapal.id, portId: port.id, voyageNumber: `DEMO-WA1-${++n}`, ...ubah } })
    const sinyal = (v, data) => db.monitoringSignal.create({ data: { tenantId: t.id, voyageId: v.id, severity: 'INFO', dedupeKey: `demo-wa1-${n}-${data.kind}-${Math.random()}`, recommendation: 'Demo WA-1: tinjau lalu siapkan update klien (simulasi).', ...data } })

    // 1) Perubahan ETA (AuditLog UBAH_TANGGAL + sinyal ETA_CHANGED).
    const lama = tgl(3)
    const baru = tgl(5)
    const vEta = await voyage({ eta: new Date(`${baru}T00:00:00Z`) })
    const a = await db.auditLog.create({ data: { tenantId: t.id, tableName: 'Voyage', recordId: vEta.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: lama }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: baru } } })
    await sinyal(vEta, { kind: 'ETA_CHANGED', sourceType: 'AUDIT_LOG', sourceRef: a.id, after: { eta: baru }, explanation: `DEMO: ETA voyage ${vEta.voyageNumber} berubah ${lama} → ${baru}.` })
    // 2–4) Milestone pilot + 5) non-pilot COMMENCED.
    for (const [kode, h] of [['EOSP', 6], ['ALL_FAST', 4], ['SAILED', 2], ['COMMENCED', 3]]) {
      const v = await voyage()
      const e = await db.voyageEvent.create({ data: { tenantId: t.id, voyageId: v.id, eventCode: kode, occurredAt: jam(h), recordedByUserId: 'demo' } })
      await sinyal(v, { kind: 'OPERATIONAL_EVENT_RECORDED', sourceType: 'VOYAGE_EVENT', sourceRef: e.id, after: { eventCode: kode, occurredAt: e.occurredAt.toISOString() }, explanation: `DEMO: ${kode} voyage ${v.voyageNumber}${kode === 'COMMENCED' ? ' (bukan event pilot — tanpa tombol)' : ''}.` })
    }
    // 6) non-pilot: perubahan status voyage.
    const vSt = await voyage({ status: 'CONFIRMED' })
    await sinyal(vSt, { kind: 'VOYAGE_STATUS_CHANGED', sourceType: 'VOYAGE', sourceRef: vSt.id, after: { status: 'CONFIRMED' }, explanation: `DEMO: status voyage ${vSt.voyageNumber} berubah (bukan event pilot — tanpa tombol).` })

    console.log('Data demo WA-1 dibuat (SINTETIS, lokal).')
    console.log(`  AUTOMATION_TENANT_IDS harus memuat: ${ID_TENANT}`)
    console.log('  Login (kata sandi acak, hanya dicetak sekali — simpan untuk sesi demo ini):')
    for (const [email, , role] of users) console.log(`    ${role.padEnd(16)} ${email}  /  ${sandi}`)
    console.log('  Buka /automation/alerts → klik "Siapkan Update Klien" pada sinyal DEMO.')
  }
} finally {
  await db.$disconnect()
}
