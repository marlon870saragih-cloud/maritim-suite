// Uji migrasi logo — K181, Fase 8i, §17/8i butir 1-5.
//
// Jalankan:  node prisma/check-logo-migration.mjs   (butuh `npm run dev` menyala
//                                                    HANYA untuk butir 4/PDF)
//
// Yang diuji SUNGGUHAN — skrip migrasi dipanggil sebagai PROSES ANAK
// (`node prisma/migrate-logo-to-attachment.mjs …`), bukan logikanya ditulis
// ulang di sini. Jadi yang lulus uji adalah berkas yang nanti benar-benar
// dijalankan orang, lengkap dengan CLI-nya.
//
// Urutan:
//   1. --dry-run: melaporkan jumlah & byte, jumlah baris Attachment SAMA
//      persis sebelum-sesudah (butir 1).
//   2. Jalan sungguhan: logoAttachmentId terisi, berkas ada di penyimpanan,
//      sha256 cocok hasil dekode base64, logoUrl MASIH UTUH (butir 2).
//   3. Jalan KEDUA kali: nol Attachment baru (butir 3, idempoten).
//   4. Kop PDF dokumen resmi TIDAK BERUBAH sebelum vs sesudah migrasi (butir 4
//      — pemeriksaan terpenting; migrasi yang mengubah dokumen resmi adalah
//      kegagalan meski datanya benar). Dibandingkan lewat piksel/teks/gambar
//      tertanam, BUKAN byte mentah — lihat prisma/pdf-fingerprint.py untuk
//      sebabnya (perender mengacak byte tiap kali walau data identik).
//   5. Tenant yang sengaja dilewati tetap memakai logoUrl (butir 5).
//   6. Tambahan di luar daftar, ditemukan saat membaca kode: logo SVG tak
//      boleh ikut (daftar putih K109 sengaja menolaknya) dan data URL rusak
//      harus dilewati dengan sebab yang disebutkan — bukan membuat skrip mati.

import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { penyimpananLokal } from '../src/services/ops/storage/local.ts'

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
const TAG = '8I2-'

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

const sha = (b) => createHash('sha256').update(b).digest('hex')

/** PNG 1×1 sungguhan (bukan byte acak) supaya isinya masuk akal sebagai logo. */
const PNG_A = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const PNG_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', 'utf8')

const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`

/** `process.execPath` + fileURLToPath — "node" & URL.pathname keduanya tak
 *  bisa diandalkan di Windows (PATH kosong di spawn; pathname ter-%20-kan). */
const AKAR = fileURLToPath(new URL('..', import.meta.url))
function jalankanMigrasi(args = []) {
  return execFileSync(process.execPath, ['prisma/migrate-logo-to-attachment.mjs', ...args], {
    cwd: AKAR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function buatTenant(nama, logoUrl) {
  return prisma.tenant.create({
    data: { companyName: `${TAG}${nama}`, logoUrl },
    select: { id: true, companyName: true, logoUrl: true },
  })
}

// ---------------------------------------------------------------- PDF (butir 4)

/** Sesi NextAuth internal — dipakai hanya untuk mengunduh PDF dokumen resmi. */
async function login(email, password) {
  const jar = new Map()
  const simpan = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';')
      const i = kv.indexOf('=')
      jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
    }
  }
  const kirim = (url, init = {}) =>
    fetch(url, {
      ...init,
      redirect: 'manual',
      headers: {
        ...(init.headers ?? {}),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
    }).then((r) => (simpan(r), r))

  const csrfRes = await kirim(`${BASE_URL}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  await kirim(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: BASE_URL }).toString(),
  })
  return { kirim, adaSesi: [...jar.keys()].some((k) => k.includes('session-token')) }
}

async function main() {
  const dibuat = []
  const sampah = []
  try {
    // ============ persiapan: tenant uji dengan berbagai bentuk logoUrl ============
    console.log('\n0. Menyiapkan tenant uji')
    const tA = await buatTenant('Migrasi A (PNG)', dataUrl('image/png', PNG_A))
    const tLewat = await buatTenant('Migrasi B (sengaja dilewati)', dataUrl('image/png', PNG_B))
    const tSvg = await buatTenant('Migrasi C (SVG, harus ditolak)', dataUrl('image/svg+xml', SVG))
    const tRusak = await buatTenant('Migrasi D (data URL rusak)', 'https://contoh.test/logo.png')
    const tKosong = await buatTenant('Migrasi E (tanpa logo)', null)
    dibuat.push(tA.id, tLewat.id, tSvg.id, tRusak.id, tKosong.id)
    cek('5 tenant uji dibuat', dibuat.length === 5)

    // ===================== 1. DRY RUN tidak menulis apa pun =====================
    console.log('\n1. --dry-run melaporkan tanpa menulis (butir 1)')
    const attSebelumDry = await prisma.attachment.count()
    const outDry = jalankanMigrasi(['--dry-run'])
    const attSesudahDry = await prisma.attachment.count()

    cek('baris Attachment identik sebelum-sesudah dry-run', attSebelumDry === attSesudahDry, `${attSebelumDry} → ${attSesudahDry}`)
    cek('dry-run menyebut dirinya DRY RUN', /DRY RUN/.test(outDry))
    cek('dry-run melaporkan jumlah tenant ber-logoUrl', /punya logoUrl\s*:\s*[1-9]/.test(outDry))
    cek('dry-run melaporkan total byte', /sesudah dekode/.test(outDry))
    cek('dry-run TIDAK mengisi logoAttachmentId', (await prisma.tenant.findUnique({ where: { id: tA.id }, select: { logoAttachmentId: true } }))?.logoAttachmentId === null)

    // ============ 2. Jalan sungguhan (tenant A saja — B sengaja dilewati) ============
    console.log('\n2. Jalan sungguhan → berkas + Attachment + pointer (butir 2)')
    const outA = jalankanMigrasi([`--tenant=${tA.id}`])
    cek('keluaran menyebut MENULIS SUNGGUHAN', /MENULIS SUNGGUHAN/.test(outA))

    const tAsesudah = await prisma.tenant.findUnique({
      where: { id: tA.id },
      select: { logoUrl: true, logoAttachmentId: true },
    })
    cek('logoAttachmentId terisi', !!tAsesudah?.logoAttachmentId, tAsesudah?.logoAttachmentId ?? '(null)')
    cek('logoUrl MASIH UTUH byte-per-byte (M6)', tAsesudah?.logoUrl === tA.logoUrl)

    const attA = await prisma.attachment.findUnique({ where: { id: tAsesudah.logoAttachmentId } })
    cek('Attachment kind=BRANDING', attA?.kind === 'BRANDING')
    cek('entityType/entityId menunjuk tenant sendiri', attA?.entityType === 'TENANT' && attA?.entityId === tA.id)
    cek('tenantId Attachment benar', attA?.tenantId === tA.id)
    cek('mimeType ikut terbawa', attA?.mimeType === 'image/png', attA?.mimeType)
    cek('uploadedByUserId sentinel (bukan manusia)', attA?.uploadedByUserId === 'system:migrate-logo-k181', attA?.uploadedByUserId)
    cek('sizeBytes = ukuran hasil dekode', attA?.sizeBytes === PNG_A.length, `${attA?.sizeBytes} vs ${PNG_A.length}`)
    cek('sha256 cocok hasil dekode base64 aslinya', attA?.sha256 === sha(PNG_A))

    const isiDisk = await penyimpananLokal.baca(attA.storageKey)
    cek('berkas ADA di penyimpanan & byte-nya identik', Buffer.compare(isiDisk, PNG_A) === 0, attA.storageKey)
    cek('storageKey berada di bawah folder tenant', attA.storageKey.startsWith(`${tA.id}/`))

    // ======================== 3. Idempoten (butir 3) ========================
    console.log('\n3. Jalan KEDUA kali → tak ada Attachment ganda (butir 3)')
    const attSebelumUlang = await prisma.attachment.count()
    const outUlang = jalankanMigrasi([`--tenant=${tA.id}`])
    const attSesudahUlang = await prisma.attachment.count()
    cek('nol Attachment baru pada jalan kedua', attSebelumUlang === attSesudahUlang, `${attSebelumUlang} → ${attSesudahUlang}`)
    cek('dilaporkan sebagai "sudah dimigrasi"', /sudah dimigrasi/.test(outUlang))
    const tAulang = await prisma.tenant.findUnique({ where: { id: tA.id }, select: { logoAttachmentId: true, logoUrl: true } })
    cek('pointer tak berubah', tAulang?.logoAttachmentId === tAsesudah.logoAttachmentId)
    cek('logoUrl tetap utuh sesudah jalan kedua', tAulang?.logoUrl === tA.logoUrl)

    // -- lapis 2: pointer sengaja dikosongkan, berkas & Attachment tetap ada --
    console.log('   lapis pemulihan (jalan yang pernah putus di tengah):')
    await prisma.tenant.update({ where: { id: tA.id }, data: { logoAttachmentId: null } })
    const attSebelumPulih = await prisma.attachment.count()
    const outPulih = jalankanMigrasi([`--tenant=${tA.id}`])
    const attSesudahPulih = await prisma.attachment.count()
    cek('Attachment sha256-sama DIPAKAI ULANG, bukan dibuat lagi', attSebelumPulih === attSesudahPulih, `${attSebelumPulih} → ${attSesudahPulih}`)
    cek('keluaran menyebut dipakai ulang', /dipakai ulang/.test(outPulih))
    const tApulih = await prisma.tenant.findUnique({ where: { id: tA.id }, select: { logoAttachmentId: true } })
    cek('pointer terisi kembali ke Attachment yang sama', tApulih?.logoAttachmentId === tAsesudah.logoAttachmentId)

    // ================= 5 & 6. Dilewati: sengaja, SVG, rusak =================
    console.log('\n5+6. Yang dilewati tetap jalan lewat logoUrl (butir 5) & tipe tak sah ditolak')
    const tLewatSesudah = await prisma.tenant.findUnique({
      where: { id: tLewat.id },
      select: { logoUrl: true, logoAttachmentId: true },
    })
    cek('tenant yang sengaja dilewati: logoAttachmentId masih null', tLewatSesudah?.logoAttachmentId === null)
    cek('tenant yang sengaja dilewati: logoUrl utuh → tetap tampil', tLewatSesudah?.logoUrl === tLewat.logoUrl)

    const outSemua = jalankanMigrasi(['--dry-run'])
    cek('SVG dilewati dengan sebab yang disebutkan (K109)', /SVG — sengaja di luar daftar putih K109/.test(outSemua))
    cek('data URL tak sah dilewati, skrip tidak mati', /bukan data URL/.test(outSemua))
    const tSvgSesudah = await prisma.tenant.findUnique({ where: { id: tSvg.id }, select: { logoAttachmentId: true, logoUrl: true } })
    cek('tenant SVG tak pernah dapat Attachment', tSvgSesudah?.logoAttachmentId === null)
    cek('tenant SVG tetap punya logoUrl (tak rusak)', tSvgSesudah?.logoUrl === tSvg.logoUrl)
    cek('tenant tanpa logo tak dihitung sebagai dilewati', /tanpa logoUrl\s*:\s*[1-9]/.test(outSemua))
    cek('SVG TIDAK ditambahkan ke daftar putih K109', !/'image\/svg\+xml'/.test(readFileSync(new URL('../src/services/ops/attachment.service.ts', import.meta.url), 'utf8')))

    // ================== 4. Kop PDF tak berubah (butir 4) ==================
    console.log('\n4. Kop PDF dokumen resmi tidak berubah sebelum vs sesudah (butir 4)')
    const TRIBUANA = 'cmqrpn1230002v7jkyex74epd'
    const tri = await prisma.tenant.findUnique({
      where: { id: TRIBUANA },
      select: { id: true, logoUrl: true, logoAttachmentId: true },
    })

    if (!tri?.logoUrl) {
      console.log('   ⏭️  dilewati: tenant Tribuana/logoUrl tak ada di DB ini.')
    } else {
      const disb = await prisma.disbursement.findFirst({
        where: { tenantId: TRIBUANA, deletedAt: null },
        select: { id: true, docNumber: true },
        orderBy: { createdAt: 'asc' },
      })
      const { kirim, adaSesi } = await login('adm@tribuanagency.co.id', 'DevTest123!')

      if (!disb || !adaSesi) {
        console.log(`   ⏭️  dilewati: ${!disb ? 'tak ada disbursement' : 'login dev gagal'} — butir 4 perlu dev server + data Tribuana.`)
      } else {
        const ambilPdf = async (nama) => {
          const r = await kirim(`${BASE_URL}/api/disbursements/${disb.id}/pdf`)
          if (!r.ok) throw new Error(`PDF ${r.status}`)
          const buf = Buffer.from(await r.arrayBuffer())
          const p = join(tmpdir(), `k181-${nama}-${process.pid}.pdf`)
          writeFileSync(p, buf)
          return { buf, path: p }
        }

        // Pastikan berangkat dari keadaan BELUM dimigrasi supaya perbandingannya berarti.
        if (tri.logoAttachmentId) {
          await prisma.tenant.update({ where: { id: TRIBUANA }, data: { logoAttachmentId: null } })
        }
        const pdfSebelum = await ambilPdf('sebelum')

        jalankanMigrasi([`--tenant=${TRIBUANA}`])
        const triSesudah = await prisma.tenant.findUnique({
          where: { id: TRIBUANA },
          select: { logoUrl: true, logoAttachmentId: true },
        })
        const pdfSesudah = await ambilPdf('sesudah')
        sampah.push(pdfSebelum.path, pdfSesudah.path)

        cek('Tribuana benar-benar termigrasi (bukan dilewati)', !!triSesudah?.logoAttachmentId)
        cek('logoUrl Tribuana utuh byte-per-byte', triSesudah?.logoUrl === tri.logoUrl)
        cek('PDF memang berisi (bukan 0 byte palsu)', pdfSebelum.buf.length > 5000, `${disb.docNumber}, ${pdfSebelum.buf.length} B`)

        // ⚠️ Byte mentah PDF SENGAJA tidak dibandingkan — @react-pdf/renderer
        // mengacak tag subset font & penomoran objek tiap render, jadi dua
        // render dari data yang SAMA PERSIS pun berbeda ribuan byte. Lihat
        // prisma/pdf-fingerprint.py. Yang dibandingkan: piksel, teks, dan
        // gambar tertanam — ketiganya terbukti stabil lintas render.
        const fp = JSON.parse(
          execFileSync('python', [join(AKAR, 'prisma', 'pdf-fingerprint.py'), pdfSebelum.path, pdfSesudah.path], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        )

        if (!fp.tersedia) {
          console.log(`   ⏭️  perbandingan visual dilewati: ${fp.sebab} (butir 4 butuh PyMuPDF).`)
        } else {
          cek('PDF punya halaman & jumlahnya sama', fp.a.halaman > 0 && fp.a.halaman === fp.b.halaman, `${fp.a.halaman} halaman`)
          cek(
            '🔑 PIKSEL tiap halaman IDENTIK sebelum vs sesudah migrasi',
            JSON.stringify(fp.a.piksel) === JSON.stringify(fp.b.piksel),
            `${fp.a.piksel[0].slice(0, 12)}…`,
          )
          cek('teks dokumen identik', fp.a.teks === fp.b.teks, `${fp.a.teks.slice(0, 12)}…`)
          cek('ada gambar tertanam (logo kop) untuk dibandingkan', fp.a.gambar.length > 0, `${fp.a.gambar.length} gambar`)
          cek(
            '🔑 byte LOGO tertanam di kop identik',
            JSON.stringify(fp.a.gambar) === JSON.stringify(fp.b.gambar),
            fp.a.gambar[0]?.slice(0, 12) + '…',
          )
        }
      }
    }
  } finally {
    console.log('\n  bersih-bersih data uji…')
    for (const p of sampah) rmSync(p, { force: true })
    const uji = await prisma.tenant.findMany({ where: { companyName: { startsWith: TAG } }, select: { id: true } })
    const ids = uji.map((t) => t.id)
    if (ids.length) {
      await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { logoAttachmentId: null } })
      await prisma.attachment.deleteMany({ where: { tenantId: { in: ids } } })
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
    }
    const sisa = await prisma.tenant.count({ where: { companyName: { startsWith: TAG } } })
    cek('nol data uji tersisa', sisa === 0)
  }

  console.log('\n' + '='.repeat(46))
  console.log(gagal === 0 ? `✅ SEMUA LULUS (${lulus} pemeriksaan)` : `❌ ${gagal} GAGAL, ${lulus} lulus`)
  console.log('='.repeat(46))
  if (gagal > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
