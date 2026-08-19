// Laporan pemakaian LINTAS-TENANT untuk Marlon — K184, Fase 8j.
//
// SENGAJA satu skrip `.mjs`, BUKAN layar di aplikasi. §10/K184: "Membangun
// layar lintas-tenant di dalam aplikasi berarti membuat satu jalur kode yang
// sengaja melewati seluruh isolasi §3 — dan jalur seperti itu, sekali ada,
// akan dipakai untuk hal lain." `systemContext()` sendiri menolak mode
// "lihat semua tenant" (context.ts); skrip inilah SATU-SATUNYA tempat
// pengecualian itu ada, dan ia di luar aplikasi, butuh akses database
// langsung + dijalankan manual — bukan lewat sesi HTTP siapa pun.
//
// Jalankan:  node prisma/usage-report.mjs
//            node prisma/usage-report.mjs --hari=7    (jendela lebih pendek)
//
// Menjawab EMPAT pertanyaan K184:
//   1. Fitur mana dipakai — peringkat pemakaian per peristiwa, lintas tenant.
//   2. Fitur mana TAK PERNAH disentuh — baris bernilai 0 di antara SEMUA
//      NAMA_PERISTIWA yang terdaftar (bukan hanya yang kebetulan punya baris).
//   3. Di langkah mana onboarding paling sering berhenti — distribusi
//      ONBOARDING_STEP_DONE per langkah, dibandingkan LANGKAH_ONBOARDING.
//   4. Tenant mana mulai sepi sebelum langganannya habis — tenant BERBAYAR
//      (bukan TRIAL) tanpa satu pun UsageEvent 14 hari terakhir.
//
// Tidak menulis apa pun ke database — baca-saja.

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

// Disalin dari services/saas/usage.service.ts / onboarding.service.ts —
// TIDAK diimpor (skrip .mjs tak bisa mengimpor modul TS yang bergantung pada
// alias `@/...`, pola sudah dikenal sejak check-tenant-guard.mjs). Kalau
// daftar di sana berubah, laporan ini harus disalin ulang secara sadar,
// bukan diam-diam ikut basi.
const NAMA_PERISTIWA = [
  'VOYAGE_CREATED',
  'DISBURSEMENT_SENT',
  'INVOICE_ISSUED',
  'AI_PREDICT_USED',
  'AI_VESSEL_IMPORT_USED',
  'PORTAL_LOGIN',
  'ONBOARDING_STEP_DONE',
  'TASK_COMPLETED',
  'REPORT_EXPORTED',
  'VENDOR_INVOICE_SUBMITTED',
]
const LANGKAH_ONBOARDING = ['PROFIL', 'MATA_UANG', 'PELABUHAN', 'KATALOG_JASA', 'UNDANG_REKAN', 'KAPAL_PERTAMA']

const argHari = process.argv.find((a) => a.startsWith('--hari='))
const JENDELA_HARI = argHari ? Number(argHari.slice('--hari='.length)) : 30
const AMBANG_SEPI_HARI = 14

function garis(c = '─', n = 62) {
  return c.repeat(n)
}

async function main() {
  const sejak = new Date(Date.now() - JENDELA_HARI * 24 * 60 * 60 * 1000)
  const sejakSepi = new Date(Date.now() - AMBANG_SEPI_HARI * 24 * 60 * 60 * 1000)

  console.log(garis('='))
  console.log(`Laporan pemakaian lintas-tenant — jendela ${JENDELA_HARI} hari (K184)`)
  console.log(garis('='))

  // ============= 1 & 2. Fitur dipakai vs tak pernah disentuh =============
  const perPeristiwa = await prisma.usageEvent.groupBy({
    by: ['nama'],
    where: { createdAt: { gte: sejak } },
    _count: { _all: true },
  })
  const peta = new Map(perPeristiwa.map((r) => [r.nama, r._count._all]))

  console.log(`\n1+2. Pemakaian per fitur (semua tenant digabung, ${JENDELA_HARI} hari terakhir)`)
  const diurutkan = [...NAMA_PERISTIWA].sort((a, b) => (peta.get(b) ?? 0) - (peta.get(a) ?? 0))
  for (const nama of diurutkan) {
    const n = peta.get(nama) ?? 0
    const tanda = n === 0 ? ' ⚠️  TAK PERNAH DISENTUH' : ''
    console.log(`   ${String(n).padStart(5)}  ${nama}${tanda}`)
  }
  // Peristiwa yang MUNCUL di data tapi TAK ADA di daftar tertutup — sinyal
  // kode & laporan sudah tak sinkron (mis. nama baru ditambah di service tapi
  // lupa disalin ke sini).
  const takDikenal = perPeristiwa.map((r) => r.nama).filter((n) => !NAMA_PERISTIWA.includes(n))
  if (takDikenal.length > 0) {
    console.log(`\n   ⚠️  Peristiwa TAK DIKENAL laporan ini (salin ulang NAMA_PERISTIWA?): ${takDikenal.join(', ')}`)
  }

  // ========================= 3. Onboarding stall =========================
  console.log('\n3. Onboarding — di langkah mana paling sering berhenti')
  const tenants = await prisma.tenant.findMany({
    select: { id: true, companyName: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, onboardingState: true },
    orderBy: { createdAt: 'asc' },
  })

  const perLangkah = new Map(LANGKAH_ONBOARDING.map((l) => [l, 0]))
  let dilewati = 0
  let semuaSelesai = 0
  for (const t of tenants) {
    const state = t.onboardingState && typeof t.onboardingState === 'object' ? t.onboardingState : {}
    if (state.dilewati) {
      dilewati++
      continue
    }
    const selesai = new Set(Array.isArray(state.selesai) ? state.selesai : [])
    if (LANGKAH_ONBOARDING.every((l) => selesai.has(l))) {
      semuaSelesai++
      continue
    }
    // Langkah TERAKHIR yang sudah selesai sebelum tenant ini berhenti —
    // itulah titik pemberhentian, bukan langkah pertama yang belum selesai
    // (yang bisa jadi memang belum sempat dicoba, bukan "macet" di situ).
    let terakhir = null
    for (const l of LANGKAH_ONBOARDING) if (selesai.has(l)) terakhir = l
    const kunci = terakhir ?? '(belum mulai)'
    perLangkah.set(kunci, (perLangkah.get(kunci) ?? 0) + 1)
  }
  for (const [langkah, n] of perLangkah) {
    if (n > 0) console.log(`   ${String(n).padStart(3)} tenant berhenti sesudah: ${langkah}`)
  }
  console.log(`   ${semuaSelesai} tenant menyelesaikan semua langkah, ${dilewati} melewati wizard sepenuhnya.`)

  // ================= 4. Tenant mulai sepi sebelum langganan habis =================
  console.log(`\n4. Tenant BERBAYAR tanpa aktivitas ${AMBANG_SEPI_HARI} hari terakhir (sinyal churn dini)`)
  const aktivitasTerakhir = await prisma.usageEvent.groupBy({
    by: ['tenantId'],
    _max: { createdAt: true },
  })
  const petaAktivitas = new Map(aktivitasTerakhir.map((r) => [r.tenantId, r._max.createdAt]))

  const berbayarSepi = tenants.filter((t) => {
    if (t.plan === 'TRIAL') return false
    const terakhir = petaAktivitas.get(t.id)
    return !terakhir || terakhir < sejakSepi
  })
  if (berbayarSepi.length === 0) {
    console.log('   Tidak ada — semua tenant berbayar masih aktif.')
  } else {
    for (const t of berbayarSepi) {
      const terakhir = petaAktivitas.get(t.id)
      console.log(
        `   ⚠️  ${t.companyName} [${t.id}] — plan ${t.plan}, aktivitas terakhir: ${terakhir ? terakhir.toISOString().slice(0, 10) : 'TAK PERNAH'}`,
      )
    }
  }

  console.log('\n' + garis('='))
  console.log(`${tenants.length} tenant diperiksa. Dibaca-saja — tak ada yang ditulis.`)
  console.log(garis('='))
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
