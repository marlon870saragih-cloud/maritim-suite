// Seed demo WA-2a 2a-G (UI pesan klien) — data SINTETIS untuk demo lokal di peramban.
//
//   WA2G_DEMO_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite node prisma/seed-wa2a-g-demo.mjs
//   WA2G_DEMO_DB_URL=… node prisma/seed-wa2a-g-demo.mjs --bersihkan     (hapus HANYA tenant demo di bawah)
//
// Pagar: DB WAJIB loopback (127.0.0.1/localhost/::1), tanpa parameter host, NODE_ENV≠production, DATABASE_URL/
// DIRECT_URL bila diset harus sama. Hanya tenant ber-id tetap ID_DEMO yang dibuat/dihapus; data lain tidak disentuh.
// Nomor pola +62996… (sintetis). Tidak ada pengiriman: alur WA-2a 2a-G berhenti di APPROVED.
//
// Jalankan server lokal dengan allowlist tenant demo, mis.:
//   AUTOMATION_MONITORING_ENABLED=true AUTOMATION_TENANT_IDS=wa2gdemotenantaaaaaa01 WA2_CLIENT_FOUNDATION_ENABLED=true \
//   NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=<acak> DATABASE_URL=$U DIRECT_URL=$U npx next dev
// lalu buka http://localhost:3000/automation/client-messages dan login dengan akun yang dicetak di akhir.

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const URL_DB = process.env.WA2G_DEMO_DB_URL
const BERSIHKAN = process.argv.includes('--bersihkan')
if (!URL_DB) {
  console.log('DILEWATI — WA2G_DEMO_DB_URL tidak diset (butuh PostgreSQL loopback).')
  process.exit(3)
}
const tolak = []
try {
  const u = new URL(URL_DB)
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname)) tolak.push('host bukan loopback')
  if ([...u.searchParams.keys()].some((k) => k.toLowerCase() === 'host')) tolak.push('memuat parameter host')
} catch {
  tolak.push('URL tidak terurai')
}
if ((process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production') tolak.push('NODE_ENV=production')
for (const n of ['DATABASE_URL', 'DIRECT_URL']) if (process.env[n] && process.env[n] !== URL_DB) tolak.push(`${n} menunjuk DB lain (ambigu)`)
if (tolak.length) {
  console.log(`❌ DITOLAK (DB tidak disentuh): ${tolak.join(' | ')}`)
  process.exit(1)
}
process.env.DATABASE_URL = URL_DB
process.env.DIRECT_URL = URL_DB
process.env.NODE_ENV = 'development'
process.env.WA2_CLIENT_FOUNDATION_ENABLED = 'true'
process.env.AUTOMATION_MONITORING_ENABLED = 'true'

const ID_DEMO = 'wa2gdemotenantaaaaaa01'
process.env.AUTOMATION_TENANT_IDS = ID_DEMO
const SANDI = 'DemoWa2g!2026'
const JAM = 3_600_000
const BUKTI = 'Dokumen penunjukan & konfirmasi telepon (demo sintetis).'

const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const { PrismaClient } = await import('@prisma/client')
const bcrypt = (await import('bcryptjs')).default
const adm = new PrismaClient({ datasources: { db: { url: URL_DB } } })

async function bersihkan() {
  await adm.tahApprovalRequest.deleteMany({ where: { tenantId: ID_DEMO } })
  await adm.auditLog.deleteMany({ where: { tenantId: ID_DEMO } })
  await adm.tenant.deleteMany({ where: { id: ID_DEMO } })
}

try {
  await bersihkan()
  if (BERSIHKAN) {
    console.log(`Tenant demo ${ID_DEMO} dihapus.`)
  } else {
    const KT = jiti('../src/services/whatsapp/wa-contact.service.ts')
    const CS = jiti('../src/services/whatsapp/wa-consent.service.ts')
    const GS = jiti('../src/services/whatsapp/wa-grant.service.ts')
    const KJ = jiti('../src/services/whatsapp/wa-schedule-confirmation.service.ts')
    const t = await adm.tenant.create({ data: { id: ID_DEMO, companyName: 'WA2G-DEMO PT Contoh Pelayaran (sintetis)', trialEndsAt: new Date(Date.now() + 30 * 24 * JAM) } })
    const C1 = await adm.customer.create({ data: { tenantId: t.id, name: 'WA2G-DEMO Customer Sintetis' } })
    const P1 = await adm.principal.create({ data: { tenantId: t.id, name: 'WA2G-DEMO Principal Sintetis' } })
    const kapal = await adm.vessel.create({ data: { tenantId: t.id, name: 'MV DEMO SINTETIS' } })
    const port = await adm.port.create({ data: { tenantId: t.id, name: 'Balikpapan', timezone: 'Asia/Makassar' } })
    const hash = await bcrypt.hash(SANDI, 10)
    const AKUN = [
      ['maker', 'ADMIN', 'Pembuat draft'],
      ['manajer', 'MANAJER_OPERASI', 'Pencatat konfirmasi ETA'],
      ['peminta', 'ADMIN', 'Pemberi pratinjau & peminta approval'],
      ['checker', 'MANAJER_OPERASI', 'Checker (penyetuju)'],
      ['operator', 'OPERATOR', 'Tanpa akses (peran tidak berhak)'],
    ]
    const ctx = {}
    for (const [k, role, ket] of AKUN) {
      const u = await adm.user.create({ data: { tenantId: t.id, email: `wa2g-demo-${k}@uji.local`, name: `Demo ${ket}`, password: hash, role, isActive: true } })
      ctx[k] = { tenantId: t.id, userId: u.id, role }
    }
    for (let i = 0; i < 2; i++) {
      const v = await adm.voyage.create({ data: { tenantId: t.id, vesselId: kapal.id, portId: port.id, voyageNumber: `DEMO-VYG-${i + 1}`, dataOrigin: 'NYATA', status: 'CONFIRMED', customerId: C1.id, principalId: P1.id, eta: new Date('2026-10-15T00:00:00Z'), etd: new Date('2026-10-17T00:00:00Z') } })
      const a = await adm.auditLog.create({ data: { tenantId: t.id, tableName: 'Voyage', recordId: v.id, action: 'UPDATE', oldValue: { peristiwa: 'UBAH_TANGGAL', eta: '2026-10-13' }, newValue: { peristiwa: 'UBAH_TANGGAL', medan: ['eta'], eta: '2026-10-15' }, createdAt: new Date(Date.now() - JAM) } })
      await adm.monitoringSignal.create({ data: { tenantId: t.id, voyageId: v.id, kind: 'ETA_CHANGED', severity: 'INFO', dedupeKey: `WA2G-DEMO-${i}`, sourceType: 'AUDIT_LOG', sourceRef: a.id, explanation: 'ETA berubah (demo sintetis)', recommendation: 'Kabari klien', after: { eta: '2026-10-15' } } })
      await KJ.catatKonfirmasiJadwal(ctx.manajer, v.id, { field: 'eta', nilai: '2026-10-15', sourceKind: 'MASTER_OR_SHIP', sourceNote: 'Noon report kapal (demo sintetis).' })
    }
    const kontak = async (nomor, optIn) => {
      const r = await KT.buatKontak(ctx.maker, { partyType: 'CUSTOMER', partyId: C1.id, nomor, displayName: 'PIC demo', language: 'ID' })
      await KT.verifikasiKontak(ctx.maker, r.contactId, { metode: 'DOCUMENT', bukti: BUKTI, berlakuSampai: GS.tambahBulan(new Date(), 6) })
      if (optIn) await CS.catatOptIn(ctx.maker, r.contactId, { kanal: 'EMAIL', bukti: BUKTI })
    }
    await kontak('+6299600000101', true)
    await kontak('+6299600000102', false)
    console.log(`Tenant demo ${ID_DEMO} siap (2 voyage + sinyal ETA terkonfirmasi, 1 kontak opt-in, 1 kontak tanpa opt-in).`)
    console.log(`Sandi semua akun: ${SANDI}`)
    for (const [k, role, ket] of AKUN) console.log(`  wa2g-demo-${k}@uji.local  (${role}) — ${ket}`)
  }
} catch (e) {
  console.log(`❌ Seed gagal: ${e?.message ?? e}`)
  process.exitCode = 1
} finally {
  await adm.$disconnect()
}
