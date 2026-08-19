// Uji onboarding wizard + penyemaian tenant baru — K151-K154, Fase 8b.
//
// Jalankan:  node prisma/check-onboarding.mjs     (butuh `npm run dev` menyala)
//
// Membuktikan §17/8b, keenam butir:
//   1. Daftar lewat /register → 3 mata uang, 3 pelabuhan, 21 jasa, semua
//      berlabel "CONTOH — ", Tenant.goLiveAt null (diperiksa di DB).
//   2. Voyage yang dibuat sesudahnya → dataOrigin = 'UJI' (K56 masih bekerja
//      lewat goLiveAt null).
//   3. Lewati semua langkah → aplikasi tetap dipakai penuh; onboardingState
//      mencatat "dilewati", bukan "selesai".
//   4. Selesaikan satu langkah, "muat ulang" (GET baru) → kemajuan bertahan.
//   5. OPERATOR membuka /onboarding → 200 (kartu tetap terlihat), tapi
//      403 pada ketiga endpoint yang mengubah state.
//   6. Jalankan penyemaian ulang dua kali → nol baris baru, idempoten.
//
// Menulis tenant BARU (bukan Tribuana/Verifikasi) — dihapus penuh di akhir
// lewat satu `tenant.delete()` (skema sudah `onDelete: Cascade` di semua
// relasi tenant, lihat schema.prisma).

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const TAG = '8B-'
const SANDI = 'Uji8bOnboarding!2026'
const EMAIL_ADMIN = 'onboarding-8b-admin@uji.local'
const EMAIL_OPERATOR = 'onboarding-8b-operator@uji.local'

let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus++
    console.log(`  ✅ ${nama}${detail ? ` — ${detail}` : ''}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${detail ? ` — ${detail}` : ''}`)
  }
}

// ------------------------------------------------------------------ sesi HTTP
function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pasangan] = c.split(';')
      const i = pasangan.indexOf('=')
      if (i > 0) jar.set(pasangan.slice(0, i).trim(), pasangan.slice(i + 1).trim())
    }
  }
  const header = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        redirect: 'manual',
        headers: { ...(init.headers ?? {}), cookie: header() },
      })
      simpanCookie(res)
      return res
    },
    punyaSesi: () => jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token'),
  }
}

async function login(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  if (!sesi.punyaSesi()) throw new Error(`login gagal untuk ${email}`)
  return sesi
}

async function daftar(sesi, body) {
  const res = await sesi.ambil('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

// -------------------------------------------------------------- data disposable
async function bersihkan(tenantId) {
  if (!tenantId) return
  await prisma.tenant.delete({ where: { id: tenantId } }).catch((e) => {
    console.error('   ⚠️  gagal membersihkan tenant uji:', e?.message ?? e)
  })
}

// ------------------------------------------------------------------------ uji
async function main() {
  let tenantId

  try {
    // ---------- 1. Daftar tenant baru, periksa penyemaian ----------
    console.log('\n1. Daftar tenant baru lewat /register → penyemaian otomatis')
    const anon = buatSesi()
    const daftarRes = await daftar(anon, {
      companyName: `${TAG}Uji Onboarding`,
      name: `${TAG}Admin`,
      email: EMAIL_ADMIN,
      password: SANDI,
    })
    cek('POST /register → 201', daftarRes.status === 201, `status ${daftarRes.status}`)
    tenantId = daftarRes.json?.tenantId
    cek('tenantId dikembalikan', typeof tenantId === 'string' && tenantId.length > 0)

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    cek('Tenant.goLiveAt null', tenant?.goLiveAt === null)

    const [currencies, ports, services, rates] = await Promise.all([
      prisma.currency.findMany({ where: { tenantId } }),
      prisma.port.findMany({ where: { tenantId } }),
      prisma.serviceCatalog.findMany({ where: { tenantId } }),
      prisma.serviceRate.findMany({ where: { tenantId } }),
    ])
    cek('3 mata uang tersemai', currencies.length === 3, `dapat ${currencies.length}`)
    cek('3 pelabuhan tersemai', ports.length === 3, `dapat ${ports.length}`)
    cek('21 jasa tersemai', services.length === 21, `dapat ${services.length}`)
    cek(
      'semua mata uang berlabel "CONTOH — "',
      currencies.every((c) => c.name.startsWith('CONTOH — ')),
    )
    cek(
      'semua pelabuhan berlabel "CONTOH — "',
      ports.every((p) => p.name.startsWith('CONTOH — ')),
    )
    cek(
      'semua jasa berlabel "CONTOH — "',
      services.every((s) => s.serviceName.startsWith('CONTOH — ')),
    )
    cek('tarif contoh ikut tersemai (19)', rates.length === 19, `dapat ${rates.length}`)

    const tenantOnboarding = tenant?.onboardingState
    cek(
      'onboardingState.diseedPada tercatat oleh seedTenantOnboarding',
      !!tenantOnboarding?.diseedPada,
    )

    // ---------- login ADMIN ----------
    const sesiAdmin = await login(EMAIL_ADMIN, SANDI)

    // ---------- 2. Voyage baru → dataOrigin UJI (K56 lewat goLiveAt null) ----------
    console.log("\n2. Voyage baru pada tenant ini → dataOrigin = 'UJI'")
    const kapal = await prisma.vessel.create({
      data: { tenantId, name: `${TAG}MV Uji`, gt: 5000 },
    })
    const voyageRes = await sesiAdmin.ambil('/api/voyages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vesselId: kapal.id, baseCurrency: 'IDR' }),
    })
    const voyageJson = await voyageRes.json().catch(() => ({}))
    cek('POST /api/voyages → 201', voyageRes.status === 201, `status ${voyageRes.status}`)
    cek(
      "voyage.dataOrigin === 'UJI'",
      voyageJson?.voyage?.dataOrigin === 'UJI',
      `dapat ${voyageJson?.voyage?.dataOrigin}`,
    )

    // ---------- 3. Lewati semua langkah ----------
    console.log('\n3. Lewati semua langkah → aplikasi tetap penuh dipakai; state "dilewati"')
    const skipRes = await sesiAdmin.ambil('/api/onboarding/skip', { method: 'POST' })
    const skipJson = await skipRes.json().catch(() => ({}))
    cek('POST /api/onboarding/skip → 200', skipRes.status === 200, `status ${skipRes.status}`)
    cek('status.dilewati === true', skipJson?.dilewati === true)
    cek(
      'tidak ada langkah yang ikut tercatat "selesai" gara-gara skip',
      skipJson?.langkah?.every((l) => l.selesai === false) ?? false,
    )
    const voyagesSetelahSkip = await sesiAdmin.ambil('/api/voyages')
    cek(
      'aplikasi tetap bisa dipakai penuh sesudah skip (GET /api/voyages → 200)',
      voyagesSetelahSkip.status === 200,
      `status ${voyagesSetelahSkip.status}`,
    )

    // ---------- 4. Selesaikan satu langkah, "muat ulang" ----------
    console.log('\n4. Selesaikan satu langkah, muat ulang → kemajuan bertahan (server, bukan localStorage)')
    const stepRes = await sesiAdmin.ambil('/api/onboarding/step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ langkah: 'PROFIL' }),
    })
    cek('POST /api/onboarding/step → 200', stepRes.status === 200, `status ${stepRes.status}`)

    // "muat ulang" = panggilan GET baru sama sekali, tanpa state klien.
    const reloadRes = await sesiAdmin.ambil('/api/onboarding')
    const reloadJson = await reloadRes.json().catch(() => ({}))
    const profil = reloadJson?.langkah?.find((l) => l.langkah === 'PROFIL')
    cek('sesudah "muat ulang" — PROFIL masih tercatat selesai', profil?.selesai === true)

    const tenantSetelah = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { onboardingState: true } })
    cek(
      'tersimpan di Tenant.onboardingState (server), bukan localStorage',
      Array.isArray(tenantSetelah?.onboardingState?.selesai) &&
        tenantSetelah.onboardingState.selesai.includes('PROFIL'),
    )

    // ---------- 5. OPERATOR ----------
    console.log('\n5. OPERATOR membuka /onboarding → 200 (kartu tetap terlihat), 403 pada langkah yang mengubah state')
    const sandiHash = await bcrypt.hash(SANDI, 10)
    await prisma.user.create({
      data: { tenantId, email: EMAIL_OPERATOR, name: `${TAG}Operator`, password: sandiHash, role: 'OPERATOR' },
    })
    const sesiOperator = await login(EMAIL_OPERATOR, SANDI)

    const opGet = await sesiOperator.ambil('/api/onboarding')
    cek('OPERATOR — GET /api/onboarding → 200 (melihat kartu ringkasan)', opGet.status === 200, `status ${opGet.status}`)

    const opStep = await sesiOperator.ambil('/api/onboarding/step', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ langkah: 'MATA_UANG' }),
    })
    cek('OPERATOR — POST /api/onboarding/step → 403', opStep.status === 403, `status ${opStep.status}`)

    const opSkip = await sesiOperator.ambil('/api/onboarding/skip', { method: 'POST' })
    cek('OPERATOR — POST /api/onboarding/skip → 403', opSkip.status === 403, `status ${opSkip.status}`)

    const opSeed = await sesiOperator.ambil('/api/onboarding/seed', { method: 'POST' })
    cek('OPERATOR — POST /api/onboarding/seed → 403', opSeed.status === 403, `status ${opSeed.status}`)

    // ---------- 6. Penyemaian ulang dua kali → idempoten ----------
    console.log('\n6. Jalankan penyemaian ulang dua kali → nol baris baru, idempoten')
    const seed1 = await sesiAdmin.ambil('/api/onboarding/seed', { method: 'POST' })
    const seed1Json = await seed1.json().catch(() => ({}))
    const total1 = (seed1Json.currency ?? -1) + (seed1Json.port ?? 0) + (seed1Json.service ?? 0) + (seed1Json.rate ?? 0)
    cek('panggilan ke-1 → 200, 0 baris baru (sudah ada)', seed1.status === 200 && total1 === 0, `status ${seed1.status} total baru=${total1}`)

    const seed2 = await sesiAdmin.ambil('/api/onboarding/seed', { method: 'POST' })
    const seed2Json = await seed2.json().catch(() => ({}))
    const total2 = (seed2Json.currency ?? -1) + (seed2Json.port ?? 0) + (seed2Json.service ?? 0) + (seed2Json.rate ?? 0)
    cek('panggilan ke-2 → 200, 0 baris baru (sudah ada)', seed2.status === 200 && total2 === 0, `status ${seed2.status} total baru=${total2}`)

    const [currenciesAkhir, portsAkhir, servicesAkhir, ratesAkhir] = await Promise.all([
      prisma.currency.count({ where: { tenantId } }),
      prisma.port.count({ where: { tenantId } }),
      prisma.serviceCatalog.count({ where: { tenantId } }),
      prisma.serviceRate.count({ where: { tenantId } }),
    ])
    cek(
      'tidak ada duplikat sesudah 2x penyemaian ulang',
      currenciesAkhir === 3 && portsAkhir === 3 && servicesAkhir === 21 && ratesAkhir === 19,
      `mata uang=${currenciesAkhir} pelabuhan=${portsAkhir} jasa=${servicesAkhir} tarif=${ratesAkhir}`,
    )
  } finally {
    await bersihkan(tenantId)
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Uji gagal dijalankan:', e)
    gagal++
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(`\n${'='.repeat(46)}`)
    console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
    process.exitCode = gagal === 0 ? 0 : 1
  })
