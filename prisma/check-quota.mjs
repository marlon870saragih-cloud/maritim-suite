// Uji mesin & pagar kuota — K146/K155/K156, Fase 8c.
//
// Jalankan:  node prisma/check-quota.mjs      (bagian C butuh `npm run dev` menyala)
//
// TIGA BAGIAN, sengaja berjenjang:
//   A. MESIN MURNI — tanpa DB, tanpa server. `quota.ts` diimpor Node langsung
//      (K11/K51). Ini yang membuktikan §17/8c butir 7: batas nol, batas null,
//      tepat-di-batas, lewat-batas, dan negatif (data rusak) semuanya ditangani
//      TANPA LEMPARAN.
//   B. KEBIJAKAN — struktural, juga tanpa DB. Membuktikan bawaan K146 (semua
//      `null`) dan MENJAGA jurang `PANGGILAN_AI` supaya tidak diam-diam menganga.
//   C. PAGAR SUNGGUHAN — HTTP + DB. Membuktikan bahwa mesin di bagian A benar-
//      benar TERPASANG di jalur pembuatan (butir 2-6).
//
// ⚠️ BAGIAN C MENAMBAL `commercial-policy.ts` UNTUK SEMENTARA, lalu
//    MEMULIHKANNYA di `finally`. Ini pola yang sama dengan check-portal-guard.mjs
//    (yang memasang lalu mencabut BYPASSRLS): satu-satunya cara membuktikan pagar
//    berbatas adalah dengan sungguh-sungguh memasang batasnya. Berkas dipulihkan
//    apa pun yang terjadi, dan skrip MENOLAK MULAI kalau berkasnya sudah tidak
//    dalam keadaan bersih.

import { readFileSync, writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
// Keduanya MURNI — bisa diimpor Node apa adanya, tanpa alias, tanpa Prisma.
import { nilaiKuota, KEADAAN_MENAHAN, KEADAAN_PERLU_PERINGATAN } from '../src/services/saas/quota.ts'
import {
  AMBANG_PERINGATAN_KUOTA,
  FIELD_KUOTA,
  JENIS_KUOTA,
  KUOTA_PER_PAKET,
  PEMAKAIAN_AI_TERCATAT,
  adaBatasTerpasang,
  kuotaUntukPaket,
} from '../src/services/saas/commercial-policy.ts'

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
const TAG = '8C-'
const SANDI = 'Uji8cKuota!2026'
const EMAIL_ADMIN = 'kuota-8c-admin@uji.local'
const EMAIL_2 = 'kuota-8c-dua@uji.local'
const EMAIL_3 = 'kuota-8c-tiga@uji.local'

const BERKAS_POLICY = new URL('../src/services/saas/commercial-policy.ts', import.meta.url)
const PENANDA_ASLI = '  m1: TANPA_BATAS,'
const PENANDA_TAMBAL =
  '  m1: { penggunaAktif: 2, voyagePerBulan: 3, penyimpananMB: null, panggilanAiPerBulan: null },'

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

/** Pembungkus: apa pun masukannya, memanggil nilaiKuota TIDAK BOLEH melempar. */
function nilai(terpakai, batas, ambang = AMBANG_PERINGATAN_KUOTA) {
  try {
    return nilaiKuota({ terpakai, batas, ambangPeringatan: ambang })
  } catch (e) {
    gagal++
    console.log(`  ❌ MELEMPAR untuk (terpakai=${terpakai}, batas=${batas}, ambang=${ambang}): ${e}`)
    return null
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

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Tunggu dev server selesai memuat ulang kebijakan yang baru ditambal. */
async function tungguKebijakanAktif(sesi, jenis, batasDiharapkan, batasWaktuMs = 60_000) {
  const mulai = Date.now()
  while (Date.now() - mulai < batasWaktuMs) {
    const res = await sesi.ambil('/api/quota')
    if (res.ok) {
      const rows = await res.json()
      const k = rows.find((r) => r.jenis === jenis)
      if (k && k.batas === batasDiharapkan) return true
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}

// ------------------------------------------------------------------------ uji
async function bagianA() {
  console.log('\nA. Mesin murni — §17/8c butir 7 (tanpa DB, tanpa server)')

  const takDibatasi = nilai(999, null)
  cek('batas null → TIDAK_DIBATASI', takDibatasi?.keadaan === 'TIDAK_DIBATASI', `dapat ${takDibatasi?.keadaan}`)
  cek('batas null → sisa & persen null (bukan 0 yang menyesatkan)', takDibatasi?.sisa === null && takDibatasi?.persen === null)

  const nolNol = nilai(0, 0)
  cek('batas 0 & terpakai 0 → HABIS (kebijakan sah, bukan data rusak)', nolNol?.keadaan === 'HABIS', `dapat ${nolNol?.keadaan}`)
  cek('batas 0 → persen 100, BUKAN NaN dari 0/0', nolNol?.persen === 100, `dapat ${nolNol?.persen}`)
  cek('batas 0 → sisa 0', nolNol?.sisa === 0)

  const tepat = nilai(25, 25)
  cek('tepat di batas (25/25) → HABIS', tepat?.keadaan === 'HABIS', `dapat ${tepat?.keadaan}`)
  cek('tepat di batas → sisa 0', tepat?.sisa === 0)

  const lewat = nilai(30, 25)
  cek('lewat batas (30/25) → HABIS', lewat?.keadaan === 'HABIS')
  cek('lewat batas → sisa DIJEPIT 0, bukan -5', lewat?.sisa === 0, `dapat ${lewat?.sisa}`)
  cek('lewat batas → persen boleh > 100 (jujur apa adanya)', lewat?.persen === 120, `dapat ${lewat?.persen}`)

  cek('79,9% → AMAN', nilai(799, 1000)?.keadaan === 'AMAN')
  cek('tepat 80% → MENDEKATI (ambang inklusif)', nilai(800, 1000)?.keadaan === 'MENDEKATI')
  const nyaris = nilai(9996, 10000)
  cek(
    '99,96% → MENDEKATI, BUKAN HABIS (pembulatan tak boleh menaikkan keadaan)',
    nyaris?.keadaan === 'MENDEKATI',
    `dapat ${nyaris?.keadaan} persen=${nyaris?.persen}`,
  )

  console.log('\n   data rusak — semuanya MEMBUKA, tak satu pun melempar')
  cek('terpakai negatif → dibaca 0 → AMAN', nilai(-5, 10)?.keadaan === 'AMAN', `dapat ${nilai(-5, 10)?.keadaan}`)
  cek('terpakai negatif → terpakai dilaporkan 0', nilai(-5, 10)?.terpakai === 0)
  cek('batas NEGATIF → TIDAK_DIBATASI (fail-open, bukan HABIS)', nilai(5, -10)?.keadaan === 'TIDAK_DIBATASI')
  cek('batas NaN → TIDAK_DIBATASI', nilai(5, Number.NaN)?.keadaan === 'TIDAK_DIBATASI')
  cek('batas Infinity → TIDAK_DIBATASI', nilai(5, Number.POSITIVE_INFINITY)?.keadaan === 'TIDAK_DIBATASI')
  cek('terpakai NaN → dibaca 0 → AMAN', nilai(Number.NaN, 10)?.keadaan === 'AMAN')
  cek('terpakai Infinity → dibaca 0 → AMAN', nilai(Number.POSITIVE_INFINITY, 10)?.keadaan === 'AMAN')
  cek('batas string (data rusak) → TIDAK_DIBATASI', nilai(5, '10')?.keadaan === 'TIDAK_DIBATASI')
  cek('batas undefined → TIDAK_DIBATASI', nilai(5, undefined)?.keadaan === 'TIDAK_DIBATASI')

  console.log('\n   ambang rusak — dijepit, tak pernah melempar')
  cek('ambang NaN → tidak memicu MENDEKATI dini (jatuh ke 1)', nilai(5, 10, Number.NaN)?.keadaan === 'AMAN')
  cek('ambang > 1 dijepit ke 1 → 90% tetap AMAN', nilai(9, 10, 5)?.keadaan === 'AMAN')
  cek('ambang < 0 dijepit ke 0 → 10% jadi MENDEKATI', nilai(1, 10, -3)?.keadaan === 'MENDEKATI')

  console.log('\n   himpunan keadaan')
  cek('KEADAAN_MENAHAN hanya HABIS (K156/1)', KEADAAN_MENAHAN.size === 1 && KEADAAN_MENAHAN.has('HABIS'))
  cek('AMAN tidak pernah menahan', !KEADAAN_MENAHAN.has('AMAN'))
  cek('TIDAK_DIBATASI tidak pernah menahan', !KEADAAN_MENAHAN.has('TIDAK_DIBATASI'))
  cek(
    'KEADAAN_PERLU_PERINGATAN memuat HABIS (lompatan 60%→120% tetap diberitahu)',
    KEADAAN_PERLU_PERINGATAN.has('HABIS') && KEADAAN_PERLU_PERINGATAN.has('MENDEKATI'),
  )
}

function bagianB() {
  console.log('\nB. Kebijakan — bawaan K146 & penjaga jurang PANGGILAN_AI')

  const semua = Object.entries(KUOTA_PER_PAKET)
  cek('KUOTA_PER_PAKET memuat ketiga paket', semua.length === 3, semua.map(([k]) => k).join(', '))

  const adaYangDiisi = semua.flatMap(([, k]) => Object.values(k)).some((v) => v !== null)
  cek('BAWAAN: semua batas null (P48/P49 belum dijawab)', !adaYangDiisi)

  for (const jenis of JENIS_KUOTA) {
    cek(`adaBatasTerpasang(${jenis}) false → nol query di jalur pembuatan`, adaBatasTerpasang(jenis) === false)
  }

  cek('FIELD_KUOTA menutupi seluruh JENIS_KUOTA', JENIS_KUOTA.every((j) => typeof FIELD_KUOTA[j] === 'string'))
  cek('paket tak dikenal → TANPA_BATAS, bukan lemparan / bukan nol', kuotaUntukPaket('paket-hantu').voyagePerBulan === null)
  cek("kuotaUntukPaket('__proto__') tak tertipu rantai prototipe", kuotaUntukPaket('__proto__').voyagePerBulan === null)
  cek('kuotaUntukPaket(null) aman', kuotaUntukPaket(null).penggunaAktif === null)
  cek('AMBANG_PERINGATAN_KUOTA rasio 0..1 (bukan 80)', AMBANG_PERINGATAN_KUOTA > 0 && AMBANG_PERINGATAN_KUOTA < 1)

  // ⚠️ PENJAGA JURANG. Hitungan PANGGILAN_AI membaca UsageEvent, yang belum ada
  // PENCATATNYA sampai 8j/K183. Batas AI yang diisi sebelum itu akan membaca 0
  // selamanya = rasa aman palsu pada pos biaya paling mahal. Begitu seseorang
  // mengisi angkanya, uji ini yang memberi tahu — bukan tagihan OpenRouter.
  const adaBatasAi = semua.some(([, k]) => k.panggilanAiPerBulan !== null)
  cek(
    'batas AI TIDAK diisi selama pencatat pemakaian belum ada (8j/K183)',
    !(adaBatasAi && !PEMAKAIAN_AI_TERCATAT),
    adaBatasAi && !PEMAKAIAN_AI_TERCATAT
      ? '⚠️ ADA paket yang membatasi panggilanAiPerBulan, tapi PEMAKAIAN_AI_TERCATAT masih false — kuota itu akan diam-diam membaca 0 dan tidak pernah menahan apa pun. Pasang catatPemakaian() (8j) lalu ubah penandanya jadi true.'
      : PEMAKAIAN_AI_TERCATAT
        ? 'pencatat sudah ada'
        : 'batas AI masih null — aman',
  )

  // Satu sumber angka: plans.ts tidak boleh mengetik ulang kuotanya.
  const teksPlans = readFileSync(new URL('../src/lib/billing/plans.ts', import.meta.url), 'utf8')
  cek('plans.ts membaca kuota lewat kuotaUntukPaket(), tidak mengetik ulang angkanya', teksPlans.includes('kuotaUntukPaket('))
  cek('plans.ts tak memuat angka kuota tertulis sendiri', !/penggunaAktif:\s*\d/.test(teksPlans))
}

async function bagianC() {
  console.log('\nC. Pagar sungguhan — HTTP + DB (§17/8c butir 1-6)')

  const asli = readFileSync(BERKAS_POLICY, 'utf8')
  if (!asli.includes(PENANDA_ASLI)) {
    throw new Error(
      'commercial-policy.ts tidak dalam keadaan bersih (penanda "m1: TANPA_BATAS," tak ditemukan). ' +
        'Kemungkinan jalan sebelumnya berhenti sebelum memulihkan berkas. Periksa `git diff` dulu.',
    )
  }

  let tenantId
  let sudahDitambal = false

  try {
    // ---------- siapkan tenant uji ----------
    const sandiHash = await bcrypt.hash(SANDI, 10)
    const tenant = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Kuota`,
        plan: 'STARTER', // → paket m1, yang akan ditambal
        modulesEnabled: ['finance', 'dokumen', 'portcall', 'tracker'],
        subscriptionEndsAt: new Date(Date.now() + 30 * 86_400_000),
        users: { create: { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: sandiHash, role: 'ADMIN' } },
      },
    })
    tenantId = tenant.id
    const kapal = await prisma.vessel.create({ data: { tenantId, name: `${TAG}MV Uji`, gt: 5000 } })

    const sesi = await login(EMAIL_ADMIN, SANDI)

    // ---------- butir 1: bawaan tidak mengubah apa pun ----------
    console.log('\n  butir 1 — bawaan (semua batas null) tak mengubah perilaku')
    const kuotaAwal = await (await sesi.ambil('/api/quota')).json()
    cek(
      'GET /api/quota → keempat jenis TIDAK_DIBATASI',
      Array.isArray(kuotaAwal) && kuotaAwal.length === 4 && kuotaAwal.every((k) => k.keadaan === 'TIDAK_DIBATASI'),
      Array.isArray(kuotaAwal) ? kuotaAwal.map((k) => `${k.jenis}=${k.keadaan}`).join(' ') : String(kuotaAwal),
    )
    const v0 = await jsonPost(sesi, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    cek('voyage bisa dibuat seperti biasa → 201', v0.status === 201, `status ${v0.status}`)
    await prisma.voyage.deleteMany({ where: { tenantId } }) // bersihkan agar hitungan bawah bersih

    // ---------- voyage BULAN LALU (bukti monthWindow) ----------
    const bulanLalu = new Date()
    bulanLalu.setMonth(bulanLalu.getMonth() - 1)
    for (const n of [1, 2]) {
      await prisma.voyage.create({
        data: {
          tenantId,
          voyageNumber: `${TAG}LAMA-${n}`,
          vesselId: kapal.id,
          baseCurrency: 'IDR',
          dataOrigin: 'UJI',
          createdAt: bulanLalu,
        },
      })
    }

    // ---------- tambal kebijakan ----------
    console.log('\n  menambal commercial-policy.ts sementara (voyagePerBulan=3, penggunaAktif=2)…')
    writeFileSync(BERKAS_POLICY, asli.replace(PENANDA_ASLI, PENANDA_TAMBAL))
    sudahDitambal = true

    const siap = await tungguKebijakanAktif(sesi, 'VOYAGE', 3)
    cek('dev server memuat ulang kebijakan yang ditambal', siap)
    if (!siap) throw new Error('kebijakan tambalan tak pernah aktif — apakah `npm run dev` menyala?')

    // ---------- butir 2: batas voyage ----------
    console.log('\n  butir 2 — voyage ke-4 ditolak 403, voyage bulan lalu tak ikut terhitung')
    const dibuat = []
    for (const n of [1, 2, 3]) {
      const r = await jsonPost(sesi, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
      const j = await r.json().catch(() => ({}))
      dibuat.push({ status: r.status, id: j?.voyage?.id })
    }
    cek(
      'tiga voyage pertama bulan ini → 201 (dua voyage BULAN LALU tidak memakan jatah)',
      dibuat.every((d) => d.status === 201),
      dibuat.map((d) => d.status).join(','),
    )

    const keempat = await jsonPost(sesi, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    const jKeempat = await keempat.json().catch(() => ({}))
    cek('voyage ke-4 → 403', keempat.status === 403, `status ${keempat.status}`)
    const pesan = jKeempat?.error?.message ?? ''
    cek('pesan menyebut angka batasnya (3)', /\b3\b/.test(pesan), pesan.slice(0, 120))
    cek('pesan menawarkan jalan keluar (naikkan paket)', /paket/i.test(pesan))
    const totalBulanIni = await prisma.voyage.count({
      where: { tenantId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    })
    cek('tepat 3 voyage bulan ini di DB — yang ke-4 tak pernah lahir', totalBulanIni === 3, `dapat ${totalBulanIni}`)

    // ---------- butir 3: data lama tetap terbuka ----------
    console.log('\n  butir 3 — saat HABIS, data lama tetap terbaca & tersunting')
    const idLama = dibuat[0].id
    const baca = await sesi.ambil(`/api/voyages/${idLama}`)
    cek('GET voyage lama → 200', baca.status === 200, `status ${baca.status}`)
    const daftar = await sesi.ambil('/api/voyages')
    cek('GET daftar voyage → 200 (tak ada yang disembunyikan)', daftar.status === 200)
    const sunting = await sesi.ambil(`/api/voyages/${idLama}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vesselId: kapal.id, baseCurrency: 'IDR', notes: 'disunting saat kuota HABIS' }),
    })
    cek('PATCH voyage lama → 200 (hanya PEMBUATAN yang ditahan, K156/1)', sunting.status === 200, `status ${sunting.status}`)

    // ---------- butir 5: kuota pengguna ----------
    console.log('\n  butir 5 — kuota kursi: nonaktifkan pengguna → kursinya bebas')
    const u2 = await jsonPost(sesi, '/api/team', { email: EMAIL_2, name: `${TAG}Dua`, password: SANDI, role: 'OPERATOR' })
    cek('pengguna ke-2 (batas 2) → 201', u2.status === 201, `status ${u2.status}`)
    const u3 = await jsonPost(sesi, '/api/team', { email: EMAIL_3, name: `${TAG}Tiga`, password: SANDI, role: 'OPERATOR' })
    cek('pengguna ke-3 → 403', u3.status === 403, `status ${u3.status}`)

    const barisU2 = await prisma.user.findFirst({ where: { tenantId, email: EMAIL_2 } })
    const nonaktif = await sesi.ambil(`/api/team/${barisU2.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    cek('nonaktifkan pengguna ke-2 → 200', nonaktif.status === 200, `status ${nonaktif.status}`)
    const u3b = await jsonPost(sesi, '/api/team', { email: EMAIL_3, name: `${TAG}Tiga`, password: SANDI, role: 'OPERATOR' })
    cek('pengguna ke-3 sesudah satu dinonaktifkan → 201 (yang dihitung PENGGUNA AKTIF)', u3b.status === 201, `status ${u3b.status}`)

    // ---------- butir 4: notifikasi, idempoten ----------
    console.log('\n  butir 4 — notifikasi ke ADMIN pada MENDEKATI/HABIS, idempoten per bulan')
    const token = process.env.JOB_RUNNER_TOKEN ?? ''
    if (token.length < 16) {
      cek('JOB_RUNNER_TOKEN tersedia untuk menjalankan job', false, 'env kosong — butir 4 dilewati')
    } else {
      const jalan1 = await fetch(`${BASE_URL}/api/jobs/run?job=reminders`, {
        method: 'POST',
        headers: { 'x-job-token': token },
      })
      cek('job pengingat jalan ke-1 → 200', jalan1.status === 200, `status ${jalan1.status}`)
      const n1 = await prisma.notification.count({ where: { tenantId, type: 'QUOTA_WARNING' } })
      cek('notifikasi QUOTA_WARNING terbit untuk tenant ini', n1 > 0, `dapat ${n1}`)

      const adminIds = (await prisma.user.findMany({ where: { tenantId, role: 'ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id)
      const semuaBertarget = await prisma.notification.findMany({
        where: { tenantId, type: 'QUOTA_WARNING' },
        select: { userId: true, dedupeKey: true },
      })
      cek(
        'semuanya BERTARGET ke ADMIN (bukan siaran userId=null)',
        semuaBertarget.every((n) => n.userId !== null && adminIds.includes(n.userId)),
      )
      cek('setiap notifikasi punya dedupeKey', semuaBertarget.every((n) => !!n.dedupeKey))

      const jalan2 = await fetch(`${BASE_URL}/api/jobs/run?job=reminders`, {
        method: 'POST',
        headers: { 'x-job-token': token },
      })
      cek('job pengingat jalan ke-2 → 200', jalan2.status === 200)
      const n2 = await prisma.notification.count({ where: { tenantId, type: 'QUOTA_WARNING' } })
      cek('jalan ke-2 di bulan yang sama TIDAK menambah baris (idempoten K101)', n2 === n1, `${n1} → ${n2}`)
    }

    // ---------- butir 6: dua pagar berdiri sendiri ----------
    console.log('\n  butir 6 — langganan habis tetap menolak meski kuota longgar')
    // PENYIMPANAN & PANGGILAN_AI sengaja dibiarkan null di tambalan → longgar.
    const kuotaSekarang = await (await sesi.ambil('/api/quota')).json()
    const ai = kuotaSekarang.find((k) => k.jenis === 'PANGGILAN_AI')
    cek('kuota PANGGILAN_AI memang masih longgar (TIDAK_DIBATASI)', ai?.keadaan === 'TIDAK_DIBATASI', `dapat ${ai?.keadaan}`)

    await prisma.tenant.updateMany({
      where: { id: tenantId },
      data: { subscriptionEndsAt: new Date(Date.now() - 86_400_000) },
    })
    const sesiHabis = await login(EMAIL_ADMIN, SANDI)
    const aiRes = await jsonPost(sesiHabis, '/api/ai/explain', { payload: { uji: true } })
    const aiJson = await aiRes.json().catch(() => ({}))
    cek('AI ditolak 403 meski kuota AI longgar', aiRes.status === 403, `status ${aiRes.status}`)
    cek(
      'penolakannya datang dari gerbang LANGGANAN (K33), bukan dari kuota',
      /langganan/i.test(aiJson?.error?.message ?? ''),
      (aiJson?.error?.message ?? '').slice(0, 100),
    )
  } finally {
    if (sudahDitambal) {
      writeFileSync(BERKAS_POLICY, asli)
      const pulih = readFileSync(BERKAS_POLICY, 'utf8') === asli
      console.log(pulih ? '\n  ↩️  commercial-policy.ts dipulihkan.' : '\n  ⚠️  GAGAL memulihkan commercial-policy.ts — periksa git diff!')
      if (!pulih) gagal++
    }
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch((e) => {
        console.error('   ⚠️  gagal membersihkan tenant uji:', e?.message ?? e)
      })
    }
  }
}

async function main() {
  await bagianA()
  bagianB()
  await bagianC()
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
