// Uji Kepatuhan — K186/K187/K188, Fase 8k, §17/8k butir 1-9.
//
// Jalankan:  node prisma/check-compliance.mjs   (butuh `npm run dev` menyala)
//
// Urutan (nomor = butir §17/8k):
//   1. Minta ekspor → Notification saat siap; berkas terbuka; jumlah baris per
//      sheet cocok `count()` DB untuk tenant itu (≥5 tabel diperiksa).
//   2. Ekspor TIDAK memuat satu baris pun milik tenant lain — data pancingan
//      ditaruh di tenant B, dicari di seluruh isi bundel tenant A.
//   3. Ekspor kedua selagi yang pertama berjalan → ditolak pesan jelas.
//   4. Berkas ber-expiresAt; DIREKTUR mengunduh → 403.
//   5. DataRequest PENGHAPUSAN → menampilkan di mana data muncul, TAK
//      menghapus apa pun; status berpindah hanya karena manusia.
//   6. Status backup > 48 jam → perluPerhatian true (waktu dimundurkan).
//   7. delete-tenant.mjs --dry-run → melapor tanpa menulis; baris global
//      sebelum-sesudah identik.
//   8. Jalan sungguhan pada tenant UJI → barisnya hilang, tenant lain tak
//      berubah satu baris pun, dan BERKAS FISIK masih ada di disk (K110).
//   9. Tak ada endpoint HTTP mana pun yang bisa menghapus tenant.

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { PrismaClient } from '@prisma/client'
import { direktoriUnggahan } from '../src/services/ops/storage/local.ts'

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
const AKAR = fileURLToPath(new URL('..', import.meta.url))
const TAG = '8K-'
const SANDI = 'UjiKepatuhan123!'
const PANCINGAN = '8K-PANCINGAN-TENANT-B-JANGAN-SAMPAI-BOCOR'

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

function buatSesi() {
  const jar = new Map()
  const simpanCookie = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [p] = c.split(';')
      const i = p.indexOf('=')
      if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim())
    }
  }
  const header = () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  return {
    async ambil(path, init = {}) {
      const res = await fetch(`${BASE_URL}${path}`, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: header() } })
      simpanCookie(res)
      return res
    },
  }
}

async function login(email, password) {
  const sesi = buatSesi()
  const { csrfToken } = await (await sesi.ambil('/api/auth/csrf')).json()
  await sesi.ambil('/api/auth/callback/credentials', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
  })
  return sesi
}

const jsonPost = (sesi, path, body) =>
  sesi.ambil(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

const jalankanSkrip = (args) =>
  execFileSync(process.execPath, args, { cwd: AKAR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let tenantA, tenantB
  try {
    // ======================= 0. Persiapan =======================
    console.log('\n0. Menyiapkan dua tenant + data nyata')
    const hash = await bcrypt.hash(SANDI, 10)
    const EMAIL_ADMIN = `${TAG.toLowerCase()}admin@uji.local`
    const EMAIL_DIREKTUR = `${TAG.toLowerCase()}direktur@uji.local`

    tenantA = await prisma.tenant.create({
      data: {
        companyName: `${TAG}Uji Kepatuhan A`, plan: 'TRIAL',
        modulesEnabled: ['portcall', 'finance', 'procurement'],
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
        users: {
          create: [
            { name: `${TAG}Admin`, email: EMAIL_ADMIN, password: hash, role: 'ADMIN' },
            { name: `${TAG}Direktur`, email: EMAIL_DIREKTUR, password: hash, role: 'DIREKTUR' },
          ],
        },
      },
    })
    const kapal = await prisma.vessel.create({ data: { tenantId: tenantA.id, name: `${TAG}MV Ekspor`, gt: 4200 } })
    await prisma.currency.create({ data: { tenantId: tenantA.id, code: 'IDR', decimals: 2 } })
    await prisma.customer.create({ data: { tenantId: tenantA.id, name: `${TAG}Pelanggan Satu`, email: 'satu@uji.local' } })
    await prisma.vendor.create({ data: { tenantId: tenantA.id, name: `${TAG}Vendor Satu` } })
    await prisma.port.create({ data: { tenantId: tenantA.id, name: `${TAG}Pelabuhan`, unlocode: 'IDXXA' } })

    const sesiAdmin = await login(EMAIL_ADMIN, SANDI)
    const sesiDirektur = await login(EMAIL_DIREKTUR, SANDI)
    const vRes = await jsonPost(sesiAdmin, '/api/voyages', { vesselId: kapal.id, baseCurrency: 'IDR' })
    cek('voyage tenant A dibuat', vRes.status < 300, `status ${vRes.status}`)

    // Tenant B + data PANCINGAN yang harus TIDAK PERNAH muncul di ekspor A.
    tenantB = await prisma.tenant.create({
      data: { companyName: `${TAG}Uji Kepatuhan B`, plan: 'TRIAL', modulesEnabled: ['portcall'] },
    })
    await prisma.customer.create({ data: { tenantId: tenantB.id, name: PANCINGAN, email: 'pancingan@uji.local' } })
    await prisma.vendor.create({ data: { tenantId: tenantB.id, name: `${PANCINGAN}-VENDOR` } })

    // Satu lampiran nyata milik A — untuk membuktikan berkas fisik ikut bundel
    // (butir 1) DAN tetap ada di disk sesudah penghapusan (butir 8).
    const formLogo = new FormData()
    formLogo.set('file', new Blob([Buffer.from('\x89PNG\r\n\x1a\n' + 'x'.repeat(64))], { type: 'image/png' }), 'logo-uji.png')
    const upLogo = await sesiAdmin.ambil('/api/settings/branding/logo', { method: 'POST', body: formLogo })
    cek('satu lampiran nyata diunggah untuk tenant A', upLogo.status === 201, `status ${upLogo.status}`)

    // ================== 1. Ekspor & kecocokan jumlah baris ==================
    console.log('\n1. Minta ekspor → berkas jadi; jumlah baris per sheet cocok DB (butir 1)')
    const mulai = await jsonPost(sesiAdmin, '/api/settings/export')
    cek('POST /api/settings/export → 202 (tak menunggu di browser)', mulai.status === 202, `status ${mulai.status}`)

    // ============ 3. Ekspor kedua selagi berjalan → ditolak ============
    // Dijalankan SEGERA, selagi yang pertama masih BERJALAN.
    const kedua = await jsonPost(sesiAdmin, '/api/settings/export')
    cek('ekspor KEDUA selagi berjalan → 409 (butir 3)', kedua.status === 409, `status ${kedua.status}`)
    const pesanKedua = (await kedua.json().catch(() => ({})))?.error?.message ?? ''
    cek('penolakan menjelaskan sebabnya', /sedang berjalan|notifikasi/i.test(pesanKedua), pesanKedua.slice(0, 60))

    // Tunggu job latar selesai.
    let job = null
    for (let i = 0; i < 40; i++) {
      await tunggu(500)
      const daftar = await (await sesiAdmin.ambil('/api/settings/export')).json()
      job = Array.isArray(daftar) ? daftar[0] : null
      if (job && job.status !== 'BERJALAN') break
    }
    cek('ekspor selesai (bukan GAGAL)', job?.status === 'SELESAI', `${job?.status} ${job?.galat ?? ''}`)

    const notif = await prisma.notification.findFirst({
      where: { tenantId: tenantA.id, type: 'EXPORT_READY' }, orderBy: { createdAt: 'desc' },
    })
    cek('Notification EXPORT_READY terbit saat siap', !!notif, notif?.title)
    cek('notifikasi BERTARGET peminta, bukan siaran', !!notif?.userId)

    const unduh = await sesiAdmin.ambil(`/api/settings/export/${job.id}/download`)
    cek('ADMIN mengunduh → 200', unduh.status === 200, `status ${unduh.status}`)
    cek('dikirim sebagai unduhan (K108)', /attachment;/.test(unduh.headers.get('content-disposition') ?? ''))
    cek('nosniff dipasang', unduh.headers.get('x-content-type-options') === 'nosniff')
    const bundelBuf = Buffer.from(await unduh.arrayBuffer())
    cek('bundel berisi (bukan 0 byte)', bundelBuf.length > 1000, `${bundelBuf.length} B`)

    const zip = await JSZip.loadAsync(bundelBuf)
    const namaBerkas = Object.keys(zip.files)
    cek('bundel memuat data.xlsx', namaBerkas.includes('data.xlsx'))
    cek('bundel memuat data.json', namaBerkas.includes('data.json'))
    cek('bundel memuat BACA-SAYA.txt (manifes)', namaBerkas.includes('BACA-SAYA.txt'))
    cek('bundel memuat folder lampiran/ berisi berkas', namaBerkas.some((n) => n.startsWith('lampiran/') && !n.endsWith('/')))

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await zip.file('data.xlsx').async('nodebuffer'))

    // Butir 1 inti — cocokkan jumlah baris ≥5 tabel dengan count() DB.
    const TABEL_DICEK = [
      ['Voyage', () => prisma.voyage.count({ where: { tenantId: tenantA.id } })],
      ['Customer', () => prisma.customer.count({ where: { tenantId: tenantA.id } })],
      ['Vendor', () => prisma.vendor.count({ where: { tenantId: tenantA.id } })],
      ['Vessel', () => prisma.vessel.count({ where: { tenantId: tenantA.id } })],
      ['Port', () => prisma.port.count({ where: { tenantId: tenantA.id } })],
      ['User', () => prisma.user.count({ where: { tenantId: tenantA.id } })],
      // Bundel ekspor SENGAJA tak memuat bundel ekspor sebelumnya (kalau tidak,
      // tiap ekspor menelan yang lama & ukurannya berlipat) — jadi pembandingnya
      // jumlah lampiran NON-EXPORT, bukan seluruh baris Attachment.
      ['Attachment', () => prisma.attachment.count({ where: { tenantId: tenantA.id, kind: { not: 'EXPORT' } } })],
    ]
    for (const [nama, hitung] of TABEL_DICEK) {
      const ws = wb.getWorksheet(nama)
      const diDb = await hitung()
      // rowCount termasuk baris kepala; tabel kosong ditulis '(tidak ada data)'.
      const diSheet = ws ? Math.max(0, ws.rowCount - 1) : -1
      cek(`sheet ${nama}: ${diSheet} baris = count() DB ${diDb}`, diSheet === diDb)
    }

    const jsonStr = await zip.file('data.json').async('string')
    const dataJson = JSON.parse(jsonStr)
    cek('data.json memuat _meta.tenantId benar', dataJson._meta?.tenantId === tenantA.id)
    cek('data.json memuat blok data per tabel', typeof dataJson.data === 'object' && !!dataJson.data.Voyage)

    // ============ 2. Tak ada satu baris pun milik tenant lain ============
    console.log('\n2. Bundel tidak memuat data tenant lain (butir 2)')
    const seluruhTeks = jsonStr + (await zip.file('BACA-SAYA.txt').async('string'))
    cek('PANCINGAN tenant B TIDAK ada di data.json/manifes', !seluruhTeks.includes(PANCINGAN))
    cek('tenantId tenant B TIDAK muncul di data.json', !jsonStr.includes(tenantB.id))
    // Cari juga di seluruh sel spreadsheet — bukan hanya JSON.
    let adaDiXlsx = false
    wb.eachSheet((ws) => ws.eachRow((row) => {
      row.eachCell((c) => { if (String(c.value ?? '').includes(PANCINGAN)) adaDiXlsx = true })
    }))
    cek('PANCINGAN tenant B TIDAK ada di satu sel pun data.xlsx', !adaDiXlsx)

    // ============ 4. expiresAt + DIREKTUR ditolak ============
    console.log('\n4. Berkas ber-expiresAt; DIREKTUR ditolak (butir 4)')
    const att = await prisma.attachment.findFirst({ where: { tenantId: tenantA.id, kind: 'EXPORT' } })
    cek('Attachment ekspor ber-kind EXPORT', att?.kind === 'EXPORT')
    cek('ber-expiresAt terisi', att?.expiresAt instanceof Date, att?.expiresAt?.toISOString().slice(0, 10))
    cek('ditandai sensitive (tak bisa dibagikan ke portal, K170/2)', att?.sensitive === true)
    const unduhDirektur = await sesiDirektur.ambil(`/api/settings/export/${job.id}/download`)
    cek('DIREKTUR mengunduh → 403 (K186: menyalin keluar = tindakan)', unduhDirektur.status === 403, `status ${unduhDirektur.status}`)
    const mintaDirektur = await jsonPost(sesiDirektur, '/api/settings/export')
    cek('DIREKTUR meminta ekspor → 403', mintaDirektur.status === 403, `status ${mintaDirektur.status}`)

    // ============ 5. DataRequest PENGHAPUSAN tak menghapus apa pun ============
    console.log('\n5. PENGHAPUSAN menunjukkan jejak & TIDAK menghapus (butir 5, K187/1)')
    const barisSebelum = {
      customer: await prisma.customer.count({ where: { tenantId: tenantA.id } }),
      user: await prisma.user.count({ where: { tenantId: tenantA.id } }),
      vendor: await prisma.vendor.count({ where: { tenantId: tenantA.id } }),
    }
    const drRes = await jsonPost(sesiAdmin, '/api/settings/data-requests', {
      jenis: 'PENGHAPUSAN', subjek: `${TAG}Pelanggan Satu`, konteks: 'LAINNYA',
      uraian: 'Pemohon meminta seluruh datanya dihapus.',
    })
    const drBody = await drRes.json()
    cek('POST data-requests → 201', drRes.status === 201, `status ${drRes.status}`)
    cek('jejakSubjek dikembalikan bersama permintaan', Array.isArray(drBody.jejakSubjek))
    cek('jejak menemukan pelanggan itu', drBody.jejakSubjek.some((j) => /Customer/i.test(j.tabel)), JSON.stringify(drBody.jejakSubjek?.map((j) => `${j.tabel}:${j.jumlah}`)))
    cek('jejak menandai keterikatan dokumen', drBody.jejakSubjek.some((j) => j.terikatDokumen === true))
    const barisSesudah = {
      customer: await prisma.customer.count({ where: { tenantId: tenantA.id } }),
      user: await prisma.user.count({ where: { tenantId: tenantA.id } }),
      vendor: await prisma.vendor.count({ where: { tenantId: tenantA.id } }),
    }
    cek('🔑 TAK SATU BARIS PUN terhapus oleh permintaan PENGHAPUSAN',
      JSON.stringify(barisSebelum) === JSON.stringify(barisSesudah),
      `${JSON.stringify(barisSebelum)} vs ${JSON.stringify(barisSesudah)}`)
    cek('status awal BARU (bukan langsung SELESAI)', drBody.permintaan?.status === 'BARU')

    const drPatch = await sesiAdmin.ambil(`/api/settings/data-requests/${drBody.permintaan.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'DITOLAK', hasil: 'Terikat dokumen keuangan yang wajib disimpan.' }),
    })
    cek('status berpindah karena MANUSIA → 200', drPatch.status === 200, `status ${drPatch.status}`)
    const drSesudah = await prisma.dataRequest.findFirst({ where: { id: drBody.permintaan.id } })
    cek('ditanganiUserId & selesaiPada terisi', !!drSesudah?.ditanganiUserId && !!drSesudah?.selesaiPada)
    cek('perpindahan status tetap tak menghapus baris',
      (await prisma.customer.count({ where: { tenantId: tenantA.id } })) === barisSebelum.customer)

    // ============ 6. Backup > 48 jam → perlu perhatian ============
    console.log('\n6. Status backup basi → perluPerhatian (butir 6)')
    const TOKEN = process.env.JOB_RUNNER_TOKEN ?? ''
    if (TOKEN.length < 16) {
      console.log('   ⏭️  dilewati: JOB_RUNNER_TOKEN belum diisi di .env.')
    } else {
      const segar = await fetch(`${BASE_URL}/api/jobs/run?job=backup-status&berhasil=true&ukuranBytes=356515840`, {
        method: 'POST', headers: { 'x-job-token': TOKEN },
      })
      cek('job backup-status → 200', segar.status === 200, `status ${segar.status}`)
      const stSegar = await (await sesiAdmin.ambil('/api/settings/backup-status')).json()
      cek('backup baru → perluPerhatian false', stSegar.perluPerhatian === false, `usia ${stSegar.usiaJam}h`)
      cek('ukuran tercatat', stSegar.ukuranBytes === 356515840)

      // Mundurkan 72 jam — melewati ambang 48.
      await prisma.systemConfig.update({
        where: { id: 'singleton' },
        data: { backupTerakhirPada: new Date(Date.now() - 72 * 3_600_000) },
      })
      const stBasi = await (await sesiAdmin.ambil('/api/settings/backup-status')).json()
      cek('🔑 backup 72 jam → perluPerhatian TRUE (kartu merah)', stBasi.perluPerhatian === true, `usia ${stBasi.usiaJam}h`)

      // Backup GAGAL harus merah walau baru saja.
      await fetch(`${BASE_URL}/api/jobs/run?job=backup-status&berhasil=false&pesan=uji+gagal`, {
        method: 'POST', headers: { 'x-job-token': TOKEN },
      })
      const stGagal = await (await sesiAdmin.ambil('/api/settings/backup-status')).json()
      cek('backup GAGAL walau baru → perluPerhatian TRUE', stGagal.perluPerhatian === true && stGagal.berhasil === false)

      const opGagal = await fetch(`${BASE_URL}/api/jobs/run?job=backup-status`, { method: 'POST', headers: { 'x-job-token': 'salah-token-sekali' } })
      cek('job tanpa token sah → 401', opGagal.status === 401, `status ${opGagal.status}`)
    }

    // ============ 9. Tak ada endpoint penghapus tenant ============
    console.log('\n9. Tak ada endpoint HTTP yang bisa menghapus tenant (butir 9)')
    let temuan = ''
    try {
      temuan = execFileSync('grep', ['-rn', '-e', 'tenant\\.delete', '-e', 'deleteTenant', 'src/app/'], { cwd: AKAR, encoding: 'utf8' })
    } catch (e) {
      temuan = e.stdout ?? '' // grep exit 1 = tak ada match = hasil yang diharapkan
    }
    cek('🔑 nihil `tenant.delete`/`deleteTenant` di seluruh src/app/', temuan.trim() === '', temuan.trim().slice(0, 200))

    // ============ 7 & 8. delete-tenant.mjs ============
    console.log('\n7. delete-tenant.mjs --dry-run melapor tanpa menulis (butir 7)')
    const totalGlobalSebelum = await prisma.$queryRawUnsafe(
      'SELECT (SELECT COUNT(*) FROM "Voyage") + (SELECT COUNT(*) FROM "Customer") + (SELECT COUNT(*) FROM "Vendor") + (SELECT COUNT(*) FROM "User") + (SELECT COUNT(*) FROM "Attachment") AS n',
    )
    const nSebelum = Number(totalGlobalSebelum[0].n)

    const outDry = jalankanSkrip(['prisma/delete-tenant.mjs', `--tenant=${tenantB.id}`, '--dry-run'])
    cek('dry-run menyebut dirinya DRY RUN', /DRY RUN/.test(outDry))
    // Nama model dicetak sesuai properti klien Prisma (camelCase: `customer`).
    cek('dry-run melaporkan baris per tabel', /customer|vendor/i.test(outDry))
    cek('dry-run menyebut berkas fisik TIDAK ikut terhapus (K110)', /BERKAS FISIKNYA TIDAK|berkas fisik/i.test(outDry))
    const nSesudahDry = Number((await prisma.$queryRawUnsafe(
      'SELECT (SELECT COUNT(*) FROM "Voyage") + (SELECT COUNT(*) FROM "Customer") + (SELECT COUNT(*) FROM "Vendor") + (SELECT COUNT(*) FROM "User") + (SELECT COUNT(*) FROM "Attachment") AS n',
    ))[0].n)
    cek('🔑 baris global identik sebelum-sesudah dry-run', nSebelum === nSesudahDry, `${nSebelum} → ${nSesudahDry}`)
    cek('tenant B masih ada sesudah dry-run', !!(await prisma.tenant.findUnique({ where: { id: tenantB.id } })))

    console.log('\n8. Jalan sungguhan pada tenant UJI (butir 8)')
    // Konfirmasi salah → menolak.
    let outSalah = ''
    try {
      outSalah = jalankanSkrip(['prisma/delete-tenant.mjs', `--tenant=${tenantB.id}`, '--konfirmasi=nama-yang-salah'])
    } catch (e) {
      outSalah = (e.stdout ?? '') + (e.stderr ?? '')
    }
    cek('konfirmasi salah → DIBATALKAN, tenant tetap ada', /DIBATALKAN/.test(outSalah) && !!(await prisma.tenant.findUnique({ where: { id: tenantB.id } })))

    const aSebelum = {
      voyage: await prisma.voyage.count({ where: { tenantId: tenantA.id } }),
      customer: await prisma.customer.count({ where: { tenantId: tenantA.id } }),
      user: await prisma.user.count({ where: { tenantId: tenantA.id } }),
      attachment: await prisma.attachment.count({ where: { tenantId: tenantA.id } }),
    }
    const berkasA = await prisma.attachment.findFirst({ where: { tenantId: tenantA.id, kind: 'BRANDING' } })
    const pathBerkasA = `${direktoriUnggahan()}\\${berkasA.storageKey.replace(/\//g, '\\')}`
    const berkasB = await prisma.attachment.findMany({ where: { tenantId: tenantB.id }, select: { storageKey: true } })

    const outHapus = jalankanSkrip(['prisma/delete-tenant.mjs', `--tenant=${tenantB.id}`, `--konfirmasi=${TAG}Uji Kepatuhan B`])
    cek('penghapusan sungguhan dilaporkan berhasil', /terhapus/i.test(outHapus))
    cek('🔑 tenant B hilang dari DB', !(await prisma.tenant.findUnique({ where: { id: tenantB.id } })))
    cek('baris tenant B hilang (Customer)', (await prisma.customer.count({ where: { tenantId: tenantB.id } })) === 0)

    const aSesudah = {
      voyage: await prisma.voyage.count({ where: { tenantId: tenantA.id } }),
      customer: await prisma.customer.count({ where: { tenantId: tenantA.id } }),
      user: await prisma.user.count({ where: { tenantId: tenantA.id } }),
      attachment: await prisma.attachment.count({ where: { tenantId: tenantA.id } }),
    }
    cek('🔑 tenant A TAK BERUBAH satu baris pun',
      JSON.stringify(aSebelum) === JSON.stringify(aSesudah),
      `${JSON.stringify(aSebelum)} vs ${JSON.stringify(aSesudah)}`)
    cek('🔑 berkas fisik tenant A masih ada di disk', existsSync(pathBerkasA), pathBerkasA.slice(-40))
    if (berkasB.length > 0) {
      const pB = `${direktoriUnggahan()}\\${berkasB[0].storageKey.replace(/\//g, '\\')}`
      cek('berkas fisik tenant TERHAPUS pun masih di disk (K110)', existsSync(pB), pB.slice(-40))
    } else {
      console.log('   (tenant B tak punya lampiran — pemeriksaan berkas fisiknya dilewati)')
    }
    tenantB = null // sudah terhapus, jangan dibersihkan lagi
  } finally {
    console.log('\n  bersih-bersih data uji…')
    for (const t of [tenantA, tenantB]) {
      if (!t) continue
      await prisma.tenant.delete({ where: { id: t.id } }).catch(() => undefined)
    }
    // SystemConfig singleton dikembalikan ke keadaan "belum pernah backup"
    // supaya uji ini tak meninggalkan kartu merah palsu di dev.
    await prisma.systemConfig.deleteMany({ where: { id: 'singleton' } }).catch(() => undefined)
    const sisa = await prisma.tenant.count({ where: { companyName: { startsWith: TAG } } })
    cek('nol data uji tersisa', sisa === 0)
  }

  console.log('\n' + '='.repeat(52))
  console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
  console.log('='.repeat(52))
  if (gagal > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
