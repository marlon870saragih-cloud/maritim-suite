// Uji pagar struktural AI Layer — K52 (tak ada tool AI yang menulis DB) dan
// K76/2 (daftar putih konteks). Fase 6f.
//
// Jalankan:  node prisma/check-ai-guardrail.mjs   (atau: npm run test:ai-guard)
//
// Kenapa ada, dan kenapa bentuknya membaca SUMBER alih-alih menjalankan sesuatu:
// K52 bukan aturan tentang perilaku runtime, ia aturan tentang BENTUK KODE.
// "AI tidak boleh menulis ke database" yang hanya ditegakkan lewat kehati-hatian
// akan bertahan persis sampai seseorang menambahkan satu impor demi kenyamanan,
// dan pelanggarannya TIDAK menerbitkan gejala apa pun — tak ada yang gagal, tak
// ada yang lambat, tak ada galat. Satu-satunya cara menangkapnya adalah membaca
// sumbernya, sama seperti `check-tenant-guard.mjs` membandingkan TENANT_MODELS
// dengan schema.prisma alih-alih menunggu kebocoran terlihat.
//
// TIDAK menyentuh database dan TIDAK butuh server berjalan.

import { readFileSync, readdirSync } from 'node:fs'

let lulus = 0
let gagal = 0

function cek(nama, syarat, keterangan = '') {
  if (syarat) {
    lulus++
    console.log(`  ✅ ${nama}`)
  } else {
    gagal++
    console.log(`  ❌ ${nama}${keterangan ? ` — ${keterangan}` : ''}`)
  }
}

const baca = (relatif) => readFileSync(new URL(`../${relatif}`, import.meta.url), 'utf8')

/**
 * Baris impor saja, komentar dibuang. Komentar di berkas-berkas ini MENYEBUT
 * nama modul terlarang (justru untuk menjelaskan larangannya), jadi memeriksa
 * teks mentah akan menerbitkan kegagalan palsu — dan pemeriksaan yang berbunyi
 * saat semuanya benar akan dimatikan orang dalam seminggu.
 */
function barisImpor(sumber) {
  return sumber
    .split('\n')
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .filter((b) => /^\s*import\b|^\s*export\s+.*\bfrom\b|require\s*\(/.test(b))
}

/** Spesifikasi modul yang TERLARANG diimpor dari `src/lib/ai/**` (K52). */
const TERLARANG = [
  { pola: /['"][^'"]*tenant-db['"]/, nama: 'services/tenant-db' },
  { pola: /['"][^'"]*lib\/prisma['"]/, nama: 'lib/prisma' },
  { pola: /['"]@prisma\/client['"]/, nama: '@prisma/client (nilai)', hanyaNilai: true },
  { pola: /['"][^'"]*\.service['"]/, nama: '*.service' },
]

// Berkas BARU di increment ini (6f). Sisanya di src/lib/ai/ ikut diperiksa juga
// — lihat bagian 2 — karena K52 berbunyi "src/lib/ai/**", bukan "berkas baru".
const BERKAS_6F = ['src/lib/ai/assistant-context.ts', 'src/lib/ai/explain.ts']

console.log('Uji pagar AI Layer (K52 + K76/2) — membaca sumber, bukan menunggu gejala\n')

// ---------------------------------------------------------------- bagian 1
console.log('1. K52 — berkas 6f di src/lib/ai/ tak menyentuh database')

for (const berkas of BERKAS_6F) {
  const impor = barisImpor(baca(berkas))
  for (const { pola, nama, hanyaNilai } of TERLARANG) {
    const melanggar = impor.filter((b) => {
      if (!pola.test(b)) return false
      // `import type { X } from '@prisma/client'` tidak menyeret apa pun ke
      // runtime; yang dilarang adalah impor NILAI-nya (sejalan K51).
      if (hanyaNilai && /^\s*import\s+type\b/.test(b)) return false
      return true
    })
    cek(
      `${berkas} tidak mengimpor ${nama}`,
      melanggar.length === 0,
      melanggar.map((b) => b.trim()).join(' | '),
    )
  }

  // Impor dari lapisan service SAMA SEKALI hanya boleh `import type` — tipe
  // dihapus saat kompilasi, jadi tak ada jalur nilai yang bisa terbentuk.
  const keServices = impor.filter((b) => /['"]@\/services\//.test(b))
  const bukanTipe = keServices.filter((b) => !/^\s*import\s+type\b/.test(b))
  cek(
    `${berkas} — semua impor dari @/services/ ber-'import type'`,
    bukanTipe.length === 0,
    bukanTipe.map((b) => b.trim()).join(' | '),
  )
}

// ---------------------------------------------------------------- bagian 2
console.log('\n2. K52 — SELURUH src/lib/ai/ (bukan cuma berkas 6f)')

const semuaLibAi = readdirSync(new URL('../src/lib/ai/', import.meta.url))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `src/lib/ai/${f}`)

const pelanggar = []
for (const berkas of semuaLibAi) {
  const impor = barisImpor(baca(berkas))
  for (const { pola, nama, hanyaNilai } of TERLARANG) {
    for (const b of impor) {
      if (!pola.test(b)) continue
      if (hanyaNilai && /^\s*import\s+type\b/.test(b)) continue
      pelanggar.push(`${berkas}: ${nama} → ${b.trim()}`)
    }
  }
}
cek(
  `${semuaLibAi.length} berkas di src/lib/ai/ bebas impor terlarang`,
  pelanggar.length === 0,
  pelanggar.join(' | '),
)

// ---------------------------------------------------------------- bagian 3
console.log('\n3. K76/1 — konteks.service.ts membangun lewat service UI, bukan query sendiri')

const konteksService = baca('src/services/ai/konteks.service.ts')
const konteksImpor = barisImpor(konteksService)
const konteksKode = konteksService
  .split('\n')
  .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
  .join('\n')

cek(
  'tidak mengimpor tenant-db (tak ada satu pun query langsung)',
  !konteksImpor.some((b) => /['"][^'"]*tenant-db['"]/.test(b)),
)
cek('tidak memakai forTenant(', !/\bforTenant\s*\(/.test(konteksKode))
cek('tidak memakai prisma. sebagai model akar', !/\bprisma\s*\./.test(konteksKode))
for (const pintu of ['getVoyage', 'getDisbursementDetail', 'getInvoiceDetail']) {
  cek(`memakai ${pintu}() sebagai pintu masuk`, new RegExp(`\\b${pintu}\\s*\\(`).test(konteksKode))
}

// ---------------------------------------------------------------- bagian 4
console.log('\n4. K76/2 — daftar putih KonteksAI tak bertambah field yang bisa membocorkan')

const konteksMurni = baca('src/services/ai/konteks.ts')
// KOMENTAR DIBUANG DULU. Kepala berkas konteks.ts memang MENYEBUT 'email' dan
// 'npwp' — justru untuk menuliskan bahwa keduanya tak pernah terkirim. Yang
// diperiksa adalah KODE-nya (bentuk tipe), bukan penjelasannya.
const konteksKodeMurni = konteksMurni
  .split('\n')
  .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
  .join('\n')

// Kata kunci yang TIDAK BOLEH muncul di kode modul bentuk konteks. Bukan daftar
// hitam pengganti daftar putih — daftar putihnya adalah tipe itu sendiri; ini
// jaring untuk kelalaian yang paling mungkin terjadi: "tambah satu field kecil
// saja supaya asisten bisa menyebut alamat/NPWP-nya".
const KATA_BOCOR = ['email', 'npwp', 'bankAccount', 'bankName', 'password', 'taxId', 'creditLimit']
for (const kata of KATA_BOCOR) {
  const ada = new RegExp(kata, 'i').test(konteksKodeMurni)
  cek(`kode konteks.ts tak memuat kata '${kata}'`, !ada)
}

// Bentuk tipe KonteksAI tetap persis K76 (kunci yang boleh ada, tak lebih).
const blokTipe = /export type KonteksAI = \{([\s\S]*?)^\}/m.exec(konteksMurni)
cek('tipe KonteksAI ditemukan', blokTipe !== null)
if (blokTipe) {
  const kunci = Array.from(blokTipe[1].matchAll(/^\s{2}(\w+)\??:/gm)).map((m) => m[1])
  const DIIZINKAN = [
    'jenis', 'ringkas', 'fakta', 'baris', 'total', 'warning',
    'variance', 'prediksi', 'anomali', 'catatanPemotongan',
  ]
  const asing = kunci.filter((k) => !DIIZINKAN.includes(k))
  cek('tak ada field baru di KonteksAI', asing.length === 0, asing.join(', '))
}

// ---------------------------------------------------------------- bagian 5
console.log('\n5. K52 + K67 — route asisten: tak menulis DB, dan penjaganya terpasang')

const ROUTE = {
  ask: 'src/app/api/ai/context/ask/route.ts',
  suggest: 'src/app/api/ai/context/suggest/route.ts',
  explain: 'src/app/api/ai/explain/route.ts',
}

for (const [nama, berkas] of Object.entries(ROUTE)) {
  const kode = baca(berkas)
    .split('\n')
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join('\n')

  const tulis = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.exec(kode)
  cek(`${nama}: tak ada create/update/upsert/delete`, tulis === null, tulis?.[0] ?? '')
  cek(`${nama}: tak memakai forTenant(`, !/\bforTenant\s*\(/.test(kode))
  cek(`${nama}: memanggil periksaNarasi() (K67)`, /\bperiksaNarasi\s*\(/.test(kode))
}

// Tool usulan tak boleh punya field yang bisa ditafsirkan sebagai perintah tulis.
const asisten = baca('src/lib/ai/assistant-context.ts')
const blokTool = /export function toolSaran\(([\s\S]*?)^\}/m.exec(asisten)
cek('toolSaran() ditemukan', blokTool !== null)
if (blokTool) {
  const KATA_AKSI = ['aksi', 'action', 'simpan', 'save', 'commit', 'execute', 'apply']
  const ada = KATA_AKSI.filter((k) => new RegExp(`['"]${k}['"]`, 'i').test(blokTool[1]))
  cek('skema tool usulan tak punya field aksi/simpan (K52, K77 kemampuan 3 tidak ada)',
    ada.length === 0, ada.join(', '))
}

// ---------------------------------------------------------------------- akhir
console.log('\n==============================================')
if (gagal === 0) console.log(`✅ SEMUA LULUS (${lulus} pemeriksaan)`)
else console.log(`❌ ${gagal} GAGAL dari ${lulus + gagal} pemeriksaan`)
process.exitCode = gagal === 0 ? 0 : 1
