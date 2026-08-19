// Migrasi SEKALI-JALAN: Tenant.logoUrl (data URL base64) → berkas + Attachment
// (kind='BRANDING') → Tenant.logoAttachmentId.  K181, Fase 8i.  🔴 Opus (§6b
// sinyal 3: migrasi data pada tabel yang dipakai).
//
// Jalankan:
//   node prisma/migrate-logo-to-attachment.mjs --dry-run     ← WAJIB dulu
//   node prisma/migrate-logo-to-attachment.mjs
//   node prisma/migrate-logo-to-attachment.mjs --tenant=<id> [--dry-run]
//
// ---------------------------------------------------------------------------
// HUTANG YANG DIBAYAR DI SINI
//
// `logoUrl` menyimpan data URL base64 di kolom teks (`api/auth/register`
// menerima sampai 2,5 MB). Itu SUDAH menyebabkan satu bug produksi nyata:
// lihat komentar di `src/lib/auth.ts` — logoUrl dibuang dari sesi karena
// kalau ikut, cookie JWT membengkak & kena batas header HTTP/2 proxy →
// login gagal (ERR_HTTP2_PROTOCOL_ERROR). Fase 7 sudah membangun tempat yang
// benar (K106/K107); skrip ini memindahkannya ke sana.
//
// ---------------------------------------------------------------------------
// TIGA JANJI YANG TIDAK BOLEH DILANGGAR
//
// 1. `logoUrl` TIDAK PERNAH dihapus/diubah (M6 — jalur lama tidak dimatikan
//    pada saat yang sama dengan jalur baru dinyalakan). Tenant yang belum
//    dimigrasi tetap bekerja apa adanya lewat cadangan itu. Skrip ini bahkan
//    MEMBUKTIKANNYA: nilai logoUrl dibaca ulang sesudah tulis dan dibandingkan
//    byte-per-byte dengan yang sebelum (lihat `pastikanLogoUrlUtuh`).
//
// 2. **Kop PDF tidak berubah sedikit pun.** `src/lib/pdf/base.tsx` (Letterhead)
//    membaca `tenant.logoUrl` SAJA — tidak pernah `logoAttachmentId`. Selama
//    janji 1 dipegang, dokumen resmi (EPDA/FDA/Invoice/SPK/SOF) mustahil
//    berubah. Ini pemeriksaan terpenting di §17/8i butir 4 dan diuji sungguhan
//    dengan membandingkan sha256 PDF sebelum vs sesudah di
//    `prisma/check-logo-migration.mjs`.
//
// 3. **Idempoten.** Dijalankan dua kali tidak melahirkan Attachment kedua —
//    dijaga dua lapis (lihat `KENAPA DUA LAPIS` di bawah).
//
// ---------------------------------------------------------------------------
// KENAPA DUA LAPIS IDEMPOTENSI
//
// Lapis 1 (biasa): `logoAttachmentId` sudah terisi → lewati.
// Lapis 2 (pemulihan): kalau jalannya pernah PUTUS di tengah — berkas &
// Attachment sudah lahir tapi `logoAttachmentId` belum sempat terisi — lapis 1
// tak menolong dan jalan ulang akan membuat Attachment KEDUA yang yatim.
// Karena itu sebelum membuat yang baru, skrip mencari Attachment BRANDING
// milik tenant ini yang sha256-nya SAMA dengan isi logoUrl sekarang; kalau
// ketemu, ia dipakai ulang (hanya pointernya diisi), bukan dibuat lagi.
//
// Urutan tulis sengaja: berkas DULU, baru satu transaksi {create Attachment +
// isi pointer}. Kalau putus di antaranya yang tersisa cuma berkas yatim di
// disk (tak berbahaya, tak dirujuk siapa pun) — bukan baris DB yang menunjuk
// berkas yang tidak ada.
//
// ---------------------------------------------------------------------------
// TIPE BERKAS: KENAPA SVG DILEWATI, BUKAN DIIZINKAN
//
// `PATCH /api/tenant` menerima logoUrl ber-mime svg+xml, TAPI daftar putih
// K109 (`TIPE_DITERIMA` di services/ops/attachment.service.ts) SENGAJA tidak
// memuat SVG — alasannya tertulis di sana: SVG membawa script. Jadi ada tenant
// yang logonya sah sebagai data URL tapi TIDAK BOLEH menjadi Attachment.
//
// Yang TIDAK dilakukan skrip ini: melebarkan daftar putih K109 diam-diam demi
// membuat migrasi "100% sukses". Angka 100% bukan tujuan; keputusan keamanan
// yang sudah diambil sadar lebih penting daripada laporan yang rapi. Tenant
// begitu DILEWATI dan disebut namanya di laporan, dan ia tetap bekerja lewat
// cadangan `logoUrl` (janji 1) — tak ada yang rusak baginya.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import {
  buatStorageKey,
  buatTokenBerkas,
  penyimpananLokal,
  sha256,
  direktoriUnggahan,
} from '../src/services/ops/storage/local.ts'

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

const argv = process.argv.slice(2)
const DRY_RUN = argv.includes('--dry-run')
const HANYA_TENANT = (argv.find((a) => a.startsWith('--tenant=')) ?? '').slice('--tenant='.length) || null

/** K109 — batas ukuran per berkas, disalin dari attachment.service.ts (lihat pagar drift di bawah). */
const BATAS_UKURAN_BYTE = 20 * 1024 * 1024

/**
 * Mime data-URL yang boleh dimigrasi → ekstensi berkas.
 *
 * Ini IRISAN antara "yang diterima logoUrl" dan "yang diterima K109", bukan
 * daftar merdeka — lihat catatan SVG di kepala berkas. `image/jpg` (bukan mime
 * sah, tapi diloloskan regex di api/tenant/route.ts) dinormalkan ke image/jpeg.
 */
const MIGRASI_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}
const ALIAS_MIME = { 'image/jpg': 'image/jpeg' }

/**
 * Pagar anti-drift: buktikan setiap mime di atas MEMANG masih ada di daftar
 * putih K109 yang sesungguhnya. Kalau suatu saat seseorang mencabut webp dari
 * TIPE_DITERIMA demi keamanan, skrip ini harus BERHENTI — bukan diam-diam
 * terus menulis berkas berjenis yang sudah dilarang.
 *
 * Dibaca dari SUMBER (bukan diimpor) karena attachment.service.ts memakai
 * impor relatif tanpa ekstensi yang tak bisa di-resolve Node dari .mjs — pola
 * "pemeriksaan statis baca-sumber" yang sama sudah dipakai sejak uji K11 (3a).
 */
function pastikanDaftarPutihSelaras() {
  const src = readFileSync(new URL('../src/services/ops/attachment.service.ts', import.meta.url), 'utf8')
  const blok = /export const TIPE_DITERIMA[^{]*\{([\s\S]*?)\n\}/.exec(src)
  if (!blok) {
    throw new Error('[K181] TIPE_DITERIMA tak terbaca dari attachment.service.ts — bentuk sumbernya berubah. Periksa manual sebelum melanjutkan.')
  }
  const adaDiK109 = new Set([...blok[1].matchAll(/'([a-z0-9.+/-]+)'\s*:/g)].map((m) => m[1]))
  if (adaDiK109.size === 0) {
    throw new Error('[K181] daftar putih K109 terbaca kosong — parsing gagal, berhenti.')
  }
  for (const mime of Object.keys(MIGRASI_MIME)) {
    if (!adaDiK109.has(mime)) {
      throw new Error(`[K181] "${mime}" TIDAK ada lagi di daftar putih K109 (TIPE_DITERIMA). Migrasi dihentikan — jangan tulis berkas berjenis yang sudah dilarang.`)
    }
  }
  return adaDiK109
}

/** Pecah data URL. Mengembalikan {isi,mime} atau {alasan} kalau tak layak. */
function bacaDataUrl(logoUrl) {
  const m = /^data:([^;,]+)((?:;[^,]*)*),/.exec(logoUrl)
  if (!m) return { alasan: 'bukan data URL (mungkin tautan eksternal) — tak bisa dipindah' }
  if (!/;base64/i.test(m[2] ?? '')) return { alasan: 'data URL tapi bukan base64' }

  const mimeMentah = m[1].toLowerCase().trim()
  const mime = ALIAS_MIME[mimeMentah] ?? mimeMentah
  const ext = MIGRASI_MIME[mime]
  if (!ext) {
    return {
      alasan:
        mime === 'image/svg+xml'
          ? 'SVG — sengaja di luar daftar putih K109 (membawa script); tetap dipakai lewat cadangan logoUrl'
          : `mime "${mime}" tak ada di daftar putih K109`,
    }
  }

  const b64 = logoUrl.slice(m[0].length)
  let isi
  try {
    isi = Buffer.from(b64, 'base64')
  } catch {
    return { alasan: 'base64 gagal didekode' }
  }
  // Buffer.from() tak pernah melempar untuk base64 rusak — ia diam-diam
  // membuang karakter tak sah. Jadi kekosongan hasil yang jadi buktinya.
  if (isi.length === 0) return { alasan: 'base64 kosong/rusak (hasil dekode 0 byte)' }
  if (isi.length > BATAS_UKURAN_BYTE) return { alasan: `hasil dekode ${isi.length} byte melewati batas K109 ${BATAS_UKURAN_BYTE}` }

  return { isi, mime, ext }
}

/** Janji 1 — dibuktikan, bukan diasumsikan. */
async function pastikanLogoUrlUtuh(tenantId, sebelum) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true } })
  if (t?.logoUrl !== sebelum) {
    throw new Error(`[K181] PELANGGARAN M6: logoUrl tenant ${tenantId} berubah saat migrasi. Ini tak boleh terjadi — periksa segera.`)
  }
}

function fmtByte(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`
}

async function main() {
  const k109 = pastikanDaftarPutihSelaras()

  console.log('='.repeat(62))
  console.log(`Migrasi logo → Attachment (K181)${DRY_RUN ? '  —  🔍 DRY RUN, tak menulis apa pun' : '  —  ✍️  MENULIS SUNGGUHAN'}`)
  console.log(`Direktori unggahan : ${direktoriUnggahan()}`)
  console.log(`Daftar putih K109  : ${k109.size} mime; yang dimigrasi: ${Object.keys(MIGRASI_MIME).join(', ')}`)
  if (HANYA_TENANT) console.log(`Dibatasi ke tenant : ${HANYA_TENANT}`)
  console.log('='.repeat(62))

  const tenants = await prisma.tenant.findMany({
    where: HANYA_TENANT ? { id: HANYA_TENANT } : {},
    select: { id: true, companyName: true, logoUrl: true, logoAttachmentId: true },
    orderBy: { createdAt: 'asc' },
  })

  const attachmentSebelum = await prisma.attachment.count()

  let punyaLogo = 0
  let totalByte = 0
  let dimigrasi = 0
  let dipakaiUlang = 0
  let sudah = 0
  let tanpaLogo = 0
  const dilewati = []

  for (const t of tenants) {
    const label = `${t.companyName} [${t.id}]`

    if (!t.logoUrl) {
      tanpaLogo++
      continue
    }
    punyaLogo++

    // Didekode SEBELUM percabangan supaya "total byte" pada laporan mencakup
    // SEMUA tenant ber-logoUrl — termasuk yang sudah dimigrasi — dan bukan
    // hanya yang tersentuh kali ini. Angka laporan harus menjawab pertanyaan
    // "berapa banyak base64 yang masih ada di kolom teks", bukan "berapa yang
    // kebetulan diproses jalan ini".
    const hasil = bacaDataUrl(t.logoUrl)
    if (hasil.isi) totalByte += hasil.isi.length

    if (t.logoAttachmentId) {
      sudah++
      console.log(`  ⏭️  ${label}\n      sudah dimigrasi (logoAttachmentId=${t.logoAttachmentId})`)
      continue
    }

    if (hasil.alasan) {
      dilewati.push({ label, alasan: hasil.alasan })
      console.log(`  ⚠️  ${label}\n      DILEWATI: ${hasil.alasan}`)
      continue
    }

    const { isi, mime, ext } = hasil
    const hash = sha256(isi)

    if (DRY_RUN) {
      console.log(`  ○  ${label}\n      akan dipindah: ${mime} ${fmtByte(isi.length)} (base64 ${t.logoUrl.length} char) sha256=${hash.slice(0, 12)}…`)
      continue
    }

    // Lapis 2 idempotensi — lihat "KENAPA DUA LAPIS" di kepala berkas.
    const pulih = await prisma.attachment.findFirst({
      where: { tenantId: t.id, kind: 'BRANDING', sha256: hash, deletedAt: null },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: 'desc' },
    })

    if (pulih) {
      await prisma.tenant.update({ where: { id: t.id }, data: { logoAttachmentId: pulih.id } })
      await pastikanLogoUrlUtuh(t.id, t.logoUrl)
      dipakaiUlang++
      console.log(`  ♻️  ${label}\n      Attachment sha256-sama sudah ada (sisa jalan yang terputus) → dipakai ulang: ${pulih.id}`)
      continue
    }

    const storageKey = buatStorageKey(t.id, buatTokenBerkas(), ext)
    await penyimpananLokal.simpan(storageKey, isi, mime)

    // Transaksi INTERAKTIF (bukan array): pointer butuh id Attachment yang baru
    // lahir di dalamnya, jadi keduanya harus berbagi satu `tx`. Kalau pengisian
    // pointer gagal, pembuatan Attachment ikut batal (rollback) — tak pernah
    // ada Attachment yatim yang tak ditunjuk siapa pun.
    const att = await prisma.$transaction(async (tx) => {
      const a = await tx.attachment.create({
        data: {
          tenantId: t.id,
          entityType: 'TENANT',
          entityId: t.id, // Tenant.id ADALAH tenantId — sama seperti branding.service.ts
          fileName: `logo${ext}`,
          mimeType: mime,
          sizeBytes: isi.length,
          sha256: hash,
          storageKey,
          kind: 'BRANDING',
          // Tak ada manusia yang menekan tombol di sini. Pola sentinel yang
          // sama dipakai jejak portal (`portal:<id>`, K144/4) & systemContext().
          uploadedByUserId: 'system:migrate-logo-k181',
        },
      })
      await tx.tenant.update({ where: { id: t.id }, data: { logoAttachmentId: a.id } })
      return a
    })

    await pastikanLogoUrlUtuh(t.id, t.logoUrl)

    dimigrasi++
    console.log(`  ✅ ${label}\n      ${mime} ${fmtByte(isi.length)} → ${storageKey}\n      Attachment ${att.id}  sha256=${hash.slice(0, 12)}…  logoUrl TETAP UTUH`)
  }

  const attachmentSesudah = await prisma.attachment.count()

  console.log('='.repeat(62))
  console.log(`Tenant diperiksa        : ${tenants.length}`)
  console.log(`  tanpa logoUrl         : ${tanpaLogo}`)
  console.log(`  punya logoUrl         : ${punyaLogo}  (total ${fmtByte(totalByte)} sesudah dekode)`)
  console.log(`  sudah dimigrasi       : ${sudah}`)
  console.log(`  ${DRY_RUN ? 'akan dipindah       ' : 'dipindah            '}  : ${DRY_RUN ? punyaLogo - sudah - dilewati.length : dimigrasi}`)
  if (dipakaiUlang) console.log(`  dipakai ulang (pulih) : ${dipakaiUlang}`)
  console.log(`  dilewati              : ${dilewati.length}`)
  for (const d of dilewati) console.log(`      • ${d.label} — ${d.alasan}`)
  console.log(`Baris Attachment        : ${attachmentSebelum} → ${attachmentSesudah}`)

  if (DRY_RUN) {
    if (attachmentSesudah !== attachmentSebelum) {
      throw new Error('[K181] DRY RUN menulis sesuatu — ini bug serius, laporkan.')
    }
    console.log('\n🔍 DRY RUN selesai — nol baris ditulis (terbukti, bukan diklaim).')
    console.log('   Jalankan tanpa --dry-run untuk menerapkannya.')
  } else {
    console.log('\n✍️  Selesai. `logoUrl` sengaja TIDAK dikosongkan (M6 — tetap jadi cadangan).')
  }
  console.log('='.repeat(62))
}

main()
  .catch((e) => {
    console.error('\n❌ GAGAL:', e.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
