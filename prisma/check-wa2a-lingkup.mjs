// Uji helper gate lingkup WA-2a (prisma/wa2a-lingkup.mjs) — keputusan owner G-D1..G-D4.
//
// Jalankan: node prisma/check-wa2a-lingkup.mjs   (tanpa DB/jaringan; hanya git + berkas)
//
// Lapis:
//   R. repo nyata — manifest sah, rekaman H kelima fase, blob I-2 = blob tree HEAD & tanpa atribut pengubah isi,
//      pemindai I-1 tidak hampa (menemukan perujuk modul WA-1 yang diketahui); perujuk WA-2 = 10 route API 2a-G
//      yang disetujui owner (daftar LITERAL di uji ini, bukan diturunkan dari pemindai atau manifest).
//   S. skenario pada CLONE SEMENTARA (git clone --shared ke direktori tmp; repo kerja tidak disentuh):
//      kontrol positif (P-xx) dan negatif (N-xx) — committed/staged/unstaged/untracked, hapus, rename,
//      impor langsung/transitif, ref & riwayat hilang, manifest/basis tidak sah, mode fase, pengecualian,
//      mutasi helper, mode bukti.

import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as L from './wa2a-lingkup.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
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
const bagian = (j) => console.log(`\n${j}`)
const salin = (o) => JSON.parse(JSON.stringify(o))

const { m: M, galat } = L.muatManifest(AKAR)

// ============================================================================ R
bagian('[R] Repo nyata')
cek('manifest sah', galat.length === 0, galat.join('; ') || L.JALUR_MANIFEST)
if (!M) {
  console.log(`\n❌ ADA YANG GAGAL — lulus ${lulus}, gagal ${gagal}`)
  process.exit(1)
}
const idFase = Object.keys(M.fase)
cek('manifest mencatat F1, F2, F3, PR26, F4 dengan 49 berkas', idFase.join() === 'F1,F2,F3,PR26,F4' && idFase.reduce((n, k) => n + M.fase[k].berkas.length, 0) === 49, idFase.map((k) => `${k}:${M.fase[k].berkas.length}`).join(' '))
for (const id of idFase) {
  const h = L.periksaRekaman(AKAR, id, M.fase[id])
  cek(`H ${id}: rekaman lulus pada repo nyata`, h.every((x) => x.ok), h.filter((x) => !x.ok).map((x) => `${x.nama}: ${x.detail}`).join('; '))
}
const i2 = Object.keys(M.i2)
cek('I-2: setiap blob manifest = `git hash-object` berkas = blob tree HEAD (aturan Git)', i2.every((p) => L.blobBerkas(AKAR, p) === M.i2[p] && L.blobDiTree(AKAR, 'HEAD', p) === M.i2[p]), `${i2.length} berkas`)
const attr = L.git(AKAR, ['check-attr', 'text', 'eol', 'filter', 'diff', 'crlf', '--', ...i2])
cek('I-2: berkas beku tanpa atribut .gitattributes yang mengubah isi (text/eol/filter unspecified)', attr.split('\n').filter(Boolean).every((l) => / unspecified$/.test(l)), `${attr.split('\n').filter(Boolean).length} atribut diperiksa`)
const auto = L.git(AKAR, ['config', '--get', 'core.autocrlf'], { boleh: true })?.trim() ?? null
console.log(`  ℹ️  core.autocrlf=${auto ?? '(tidak diset)'} — hash-object menerapkan konversi yang sama dengan git add`)
const kom = L.perujukTransitif(AKAR, M.i1.akar, 'src/services/communication/').perujuk
cek('I-1 tidak hampa: pemindai yang sama menemukan perujuk modul WA-1 yang diketahui (route & halaman Komunikasi)', ['src/app/api/automation/communications/candidates/route.ts', 'src/app/(app)/automation/communications/page.tsx', 'src/app/(app)/layout.tsx'].every((f) => kom[f]) && Object.keys(kom).length >= 18, `${Object.keys(kom).length} perujuk transitif WA-1`)
// X-1 tahap API 2a-G (keputusan owner): TEPAT sepuluh route API; tanpa halaman/komponen UI. Daftar ditulis ulang
// di sini supaya ekspektasi tidak diambil dari pemindai yang diuji maupun dari manifest yang diperiksa.
const R2G = 'src/app/api/automation/client-messages/'
const DISETUJUI_I1 = ['route.ts', 'candidates/signals/route.ts', 'candidates/contacts/route.ts', '[id]/route.ts', '[id]/history/route.ts', '[id]/preview/route.ts', '[id]/request-approval/route.ts', '[id]/cancel/route.ts', 'approvals/[id]/approve/route.ts', 'approvals/[id]/reject/route.ts'].map((r) => R2G + r).sort()
const IZIN_G = [...DISETUJUI_I1, 'src/services/whatsapp/wa-message-read.service.ts', 'src/services/whatsapp/wa2-access.ts', 'prisma/check-wa2a-g-static.mjs', 'prisma/check-wa2a-g-api.mjs', 'prisma/check-wa2a-g-prod.mjs', 'prisma/check-wa2a-lingkup.mjs', 'prisma/wa2a-lingkup-manifest.json', 'docs/whatsapp/WA-2a-G-EVIDENCE.md', 'docs/TAH-CURRENT-CHECKPOINT.md'].sort()
const JANGKAR_G = ['prisma/check-wa2a-g-api.mjs', 'src/services/whatsapp/wa-message-read.service.ts']
const perujukNyata = Object.keys(L.perujukTransitif(AKAR, M.i1.akar, M.i1.sasaran).perujuk).sort()
cek('I-1 repo nyata: perujuk service WA-2 = PERSIS 10 route API 2a-G yang disetujui (literal; tanpa halaman/komponen)', perujukNyata.join() === DISETUJUI_I1.join() && DISETUJUI_I1.length === 10, perujukNyata.filter((f) => !DISETUJUI_I1.includes(f)).concat(DISETUJUI_I1.filter((f) => !perujukNyata.includes(f)).map((f) => `hilang: ${f}`)).join(', ') || `${perujukNyata.length} perujuk`)
cek('X-1 manifest: i1.diizinkan = 10 route literal; faseAktif hanya G dengan izin 19 path persis dan jangkar read service + uji API', [...M.i1.diizinkan].sort().join() === DISETUJUI_I1.join() && Object.keys(M.faseAktif).join() === 'G' && [...M.faseAktif.G.izin].sort().join() === IZIN_G.join() && IZIN_G.length === 19 && [...M.faseAktif.G.jangkar].sort().join() === JANGKAR_G.join())
const sp = L.ekstrakSpecifier("// import a from '@/x'\n/* from '@/y' */ const s = \"from '@/z'\"; import b from './b'; export * from '../c'; const d = await import('@/d'); require('e'); import('@/' + n); obj.import('f'); Array.from('g')")
cek('ekstrakSpecifier: komentar/string biasa diabaikan; from/import()/require literal terbaca; import() non-literal dihitung', sp.spec.join() === './b,../c,@/d,e' && sp.dinamis === 1, `${sp.spec.join()} | dinamis=${sp.dinamis}`)

// Temuan review #1 (PR #29): segmen route dinamis Next.js adalah path LITERAL, bukan glob. Manifest SINTETIS
// (fase G tidak diaktifkan di manifest produksi).
const PID = 'src/app/api/automation/client-messages/[id]/route.ts'
const sintetis = (izin, jangkar, diizinkan) => Object.assign(salin(M), { faseAktif: { G: { izin, jangkar } }, i1: { ...M.i1, diizinkan } })
cek('T1: path literal `[id]` dan `[...slug]` diterima di faseAktif.izin/jangkar dan i1.diizinkan (manifest sintetis)', L.validasiManifest(sintetis([PID, 'src/app/x/[...slug]/page.tsx'], [PID], [PID])).length === 0, L.validasiManifest(sintetis([PID], [PID], [PID])).join('; '))
const TIDAK_AMAN = ['src/app/*/route.ts', 'src/app/?.ts', 'src/app/{a,b}.ts', 'src/app/../x.ts', '../x.ts', './x.ts', '/abs/x.ts', 'src//x.ts', 'src\\x.ts', 'src/x\u0000.ts', '']
cek('T1: path wildcard / traversal / absolut / segmen kosong / backslash / kontrol tetap ditolak', TIDAK_AMAN.every((p) => L.validasiManifest(sintetis([p], [p], [])).length > 0 && L.validasiManifest(sintetis([PID], [PID], [p])).length > 0), `${TIDAK_AMAN.length} path`)
{
  const m2 = sintetis([PID], [PID], [])
  const cocok = L.periksaModeFase(m2, { WA2A_FASE: 'G' }, [PID]).hasil.every((h) => h.ok)
  const lain = L.periksaModeFase(m2, { WA2A_FASE: 'G' }, ['src/app/api/automation/client-messages/123/route.ts', PID]).hasil
  const id2 = L.periksaModeFase(m2, { WA2A_FASE: 'G' }, ['src/app/api/automation/client-messages/[id2]/route.ts', PID]).hasil
  cek('T1: `[id]` hanya cocok dengan string persis — `123/route.ts` dan `[id2]/route.ts` di luar allowlist', cocok && lain.some((h) => !h.ok && h.nama.includes('allowlist')) && id2.some((h) => !h.ok && h.nama.includes('allowlist')))
}
const awalanBuruk = salin(M)
awalanBuruk.pGlobal.awalan = [...M.pGlobal.awalan, 'src/../x/']
cek('T1: awalan pGlobal dengan traversal ditolak', L.validasiManifest(awalanBuruk).length > 0)

// ============================================================================ S
bagian('[S] Skenario pada clone sementara')
const TMP = mkdtempSync(join(tmpdir(), 'wa2a-lingkup-'))
const K = join(TMP, 'klon')
const gk = (args, cwd = K) => execFileSync('git', ['-c', 'user.name=uji-lingkup', '-c', 'user.email=uji@contoh.invalid', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const tulis = (rel, isi) => {
  mkdirSync(dirname(join(K, rel)), { recursive: true })
  writeFileSync(join(K, rel), isi)
}
const ubahBerkas = (rel, f) => writeFileSync(join(K, rel), f(readFileSync(join(K, rel), 'utf8')))
let H0
const pulih = () => {
  gk(['reset', '-q', '--hard', H0])
  gk(['clean', '-qfdx'])
  gk(['update-ref', 'refs/remotes/origin/main', H0])
}
const nilai = (env = {}, manifest = M, fase = ['F4'], akar = K) => L.lapisLingkup(akar, { fase, env, manifest })
const gagalPada = (r, kata) => r.hasil.some((h) => !h.ok && h.nama.includes(kata))
const semuaOk = (r) => r.hasil.every((h) => h.ok)
const ringkas = (r) => r.hasil.filter((h) => !h.ok).map((h) => `${h.nama.slice(0, 48)}…: ${h.detail ?? ''}`).join(' | ').slice(0, 300) || 'semua lulus'
const skenario = (id, nama, fn) => {
  pulih()
  try {
    const [ok, detail] = fn()
    cek(`${id} ${nama}`, ok, detail)
  } catch (e) {
    cek(`${id} ${nama}`, false, `galat: ${e.message.split('\n')[0]}`)
  }
}

try {
  gk(['clone', '-q', '--shared', AKAR, K], TMP)
  H0 = gk(['rev-parse', 'HEAD']).trim()
  console.log(`  ℹ️  klon sementara di ${TMP} pada ${H0.slice(0, 12)} (origin/main klon = HEAD klon)`)
  const W = 'src/services/whatsapp/'

  // ------------------------------------------------------------------ positif
  skenario('P-01', 'kontrol positif: klon bersih — semua lapis lulus, perubahan kosong', () => {
    const r = nilai()
    return [semuaOk(r) && r.perubahan.semua.length === 0, ringkas(r)]
  })
  skenario('P-02', 'kontrol positif: branch dokumentasi (2 dokumen ter-commit) lulus', () => {
    gk(['switch', '-q', '-c', 'uji-docs'])
    appendFileSync(join(K, 'docs/TAH-CURRENT-CHECKPOINT.md'), '\nuji\n')
    appendFileSync(join(K, 'docs/whatsapp/WA-2a-NEXT-PHASE-DRAFT.md'), '\nuji\n')
    gk(['commit', '-qam', 'uji docs'])
    const r = nilai()
    gk(['switch', '-q', '--detach', H0])
    gk(['branch', '-qD', 'uji-docs'])
    return [semuaOk(r) && r.perubahan.semua.length === 2, `${r.perubahan.semua.join(', ')} | ${ringkas(r)}`]
  })
  skenario('P-03', 'kontrol positif: komentar & string yang menyerupai impor WA-2 tidak dihitung', () => {
    tulis('src/app/uji-wa2/page.tsx', "// import { x } from '@/services/whatsapp/wa2-gate'\n/* export * from '../../services/whatsapp/wa-phone' */\nconst teks = \"import y from '@/services/whatsapp/wa-template'\"\nconst t2 = `require('@/services/whatsapp/wa2-gate')`\nexport default function P() { return teks + t2 }\n")
    const r = nilai()
    return [semuaOk(r), ringkas(r)]
  })
  skenario('P-04', 'kontrol positif: berkas tambah-saja hanya ditambah baris → lulus', () => {
    appendFileSync(join(K, `${W}wa2-policy.ts`), '\nexport const UJI_TAMBAH = 1\n')
    const r = nilai()
    return [semuaOk(r), ringkas(r)]
  })
  skenario('P-05', 'kontrol positif: pengecualian tuple (basis, path, blob akhir) yang tepat → lulus', () => {
    const p = 'prisma/check-wa2a-template.mjs'
    appendFileSync(join(K, p), '\n// uji pengecualian\n')
    const m2 = salin(M)
    m2.pengecualian = [{ basis: H0, path: p, blob: L.blobBerkas(K, p) }]
    const r = nilai({}, m2)
    return [semuaOk(r), ringkas(r)]
  })
  skenario('P-06', 'kontrol positif: mode fase dengan allowlist + jangkar terpenuhi → lulus', () => {
    const m2 = salin(M)
    m2.faseAktif = { UJI: { izin: ['docs/uji-fase.md'], jangkar: ['docs/uji-fase.md'] } }
    tulis('docs/uji-fase.md', 'uji\n')
    const r = nilai({ WA2A_FASE: 'UJI' }, m2)
    return [semuaOk(r) && r.hasil.some((h) => h.nama.startsWith('P-fase UJI')), ringkas(r)]
  })
  skenario('P-07', 'kontrol positif: perujuk yang tercantum di i1.diizinkan (mekanisme X-1) → lulus', () => {
    tulis('src/app/api/uji-wa2/route.ts', "import { samarkanNomor } from '@/services/whatsapp/wa-phone'\nexport const GET = () => samarkanNomor('')\n")
    const m2 = salin(M)
    m2.i1.diizinkan = [...DISETUJUI_I1, 'src/app/api/uji-wa2/route.ts']
    const r = nilai({}, m2)
    return [semuaOk(r), ringkas(r)]
  })
  skenario('P-08', 'kontrol positif: mode bukti pada working tree bersih → lulus dan mencetak HEAD', () => {
    const r = nilai({ WA2A_BUKTI: '1' })
    return [semuaOk(r) && r.info.some((i) => i.includes(`HEAD=${H0}`)), r.info.find((i) => i.startsWith('bukti:'))?.slice(0, 120) ?? ringkas(r)]
  })
  skenario('P-09', 'kontrol positif: CRLF + `*.ts text` di .gitattributes → hash-object menormalkan, I-2 tetap cocok', () => {
    ubahBerkas(`${W}wa2-gate.ts`, (s) => s.replace(/\n/g, '\r\n'))
    tulis('.gitattributes', `${readFileSync(join(K, '.gitattributes'), 'utf8')}*.ts text\n`)
    const r = nilai()
    return [!gagalPada(r, 'I-2') && L.blobBerkas(K, `${W}wa2-gate.ts`) === M.i2[`${W}wa2-gate.ts`], ringkas(r)]
  })

  // ------------------------------------------------------------------ negatif
  skenario('N-01', 'unstaged: edit wa2-gate.ts → I-2 dan P-global gagal', () => {
    appendFileSync(join(K, `${W}wa2-gate.ts`), '\n// ubah\n')
    const r = nilai()
    return [gagalPada(r, 'I-2') && gagalPada(r, 'P-global: tidak ada berkas beku'), ringkas(r)]
  })
  skenario('N-02', 'staged: edit wa-template.ts lalu git add → I-2 dan P-global gagal', () => {
    appendFileSync(join(K, `${W}wa-template.ts`), '\n// ubah\n')
    gk(['add', `${W}wa-template.ts`])
    const r = nilai()
    return [gagalPada(r, 'I-2') && gagalPada(r, 'P-global: tidak ada berkas beku'), ringkas(r)]
  })
  skenario('N-03', 'committed: edit wa-access-resolver.ts lalu commit → P-global (via basis) dan I-2 gagal', () => {
    appendFileSync(join(K, `${W}wa-access-resolver.ts`), '\n// ubah\n')
    gk(['commit', '-qam', 'ubah resolver'])
    const r = nilai()
    return [gagalPada(r, 'I-2') && gagalPada(r, 'P-global: tidak ada berkas beku') && r.perubahan.berubah.includes(`${W}wa-access-resolver.ts`), ringkas(r)]
  })
  skenario('N-04', 'untracked: berkas baru di src/services/communication/ → P-global gagal', () => {
    tulis('src/services/communication/uji-baru.ts', 'export const x = 1\n')
    const r = nilai()
    return [gagalPada(r, 'P-global: tidak ada berkas beku') && !gagalPada(r, 'I-2'), ringkas(r)]
  })
  skenario('N-05', 'hapus (git rm) wa-freshness.ts → P-global dan I-2 gagal', () => {
    gk(['rm', '-q', `${W}wa-freshness.ts`])
    const r = nilai()
    return [gagalPada(r, 'I-2') && gagalPada(r, 'P-global: tidak ada berkas beku'), ringkas(r)]
  })
  skenario('N-06', 'hapus tanpa stage: uji beku check-wa2a-schema.mjs dihapus dari disk → P-global gagal', () => {
    unlinkSync(join(K, 'prisma/check-wa2a-schema.mjs'))
    const r = nilai()
    return [gagalPada(r, 'P-global: tidak ada berkas beku') && r.perubahan.berubah.includes('prisma/check-wa2a-schema.mjs'), ringkas(r)]
  })
  skenario('N-07', 'rename (git mv) wa-contact.service.ts → path lama tetap terdeteksi (--no-renames)', () => {
    gk(['mv', `${W}wa-contact.service.ts`, `${W}wa-kontak.service.ts`])
    const r = nilai()
    return [gagalPada(r, 'P-global: tidak ada berkas beku') && r.perubahan.semua.includes(`${W}wa-contact.service.ts`) && r.perubahan.semua.includes(`${W}wa-kontak.service.ts`), ringkas(r)]
  })
  skenario('N-08', 'tambah-saja dilanggar: baris pertama wa-lock.ts dihapus → gagal', () => {
    ubahBerkas(`${W}wa-lock.ts`, (s) => s.slice(s.indexOf('\n') + 1))
    const r = nilai()
    return [gagalPada(r, 'tambah-saja'), ringkas(r)]
  })
  skenario('N-09', 'impor langsung (alias @/) dari route baru → I-1 gagal', () => {
    tulis('src/app/api/uji-wa2/route.ts', "import { samarkanNomor } from '@/services/whatsapp/wa-phone'\nexport const GET = () => samarkanNomor('')\n")
    const r = nilai()
    return [gagalPada(r, 'I-1'), ringkas(r)]
  })
  skenario('N-10', 'impor langsung relatif dari komponen → I-1 gagal', () => {
    tulis('src/components/UjiWa2.tsx', "import type { X } from '../services/whatsapp/wa-phone'\nexport const y: X | null = null\n")
    const r = nilai()
    return [gagalPada(r, 'I-1'), ringkas(r)]
  })
  skenario('N-11', 'impor TRANSITIF lewat perantara src/lib (export … from) → I-1 gagal, rantai dicatat', () => {
    tulis('src/lib/uji-perantara.ts', "export { samarkanNomor } from '@/services/whatsapp/wa-phone'\n")
    tulis('src/app/uji-wa2/page.tsx', "import { samarkanNomor } from '@/lib/uji-perantara'\nexport default function P() { return samarkanNomor('') }\n")
    const r = nilai()
    const d = r.hasil.find((h) => h.nama.startsWith('I-1'))?.detail ?? ''
    return [gagalPada(r, 'I-1') && d.includes('src/app/uji-wa2/page.tsx → src/lib/uji-perantara.ts → src/services/whatsapp/wa-phone.ts'), d]
  })
  skenario('N-12', 'import() dinamis literal → I-1 gagal', () => {
    tulis('src/app/uji-wa2/page.tsx', "export default async function P() { const m = await import('@/services/whatsapp/wa-phone'); return m }\n")
    const r = nilai()
    return [gagalPada(r, 'I-1'), ringkas(r)]
  })
  skenario('N-13', 'ref origin/main hilang → basis GAGAL TERTUTUP', () => {
    gk(['update-ref', '-d', 'refs/remotes/origin/main'])
    const r = nilai()
    return [gagalPada(r, 'basis perubahan'), ringkas(r)]
  })
  skenario('N-14', 'riwayat hilang (clone --depth 1) → rekaman H gagal "tidak tersedia"', () => {
    const D = join(TMP, 'dangkal')
    rmSync(D, { recursive: true, force: true })
    gk(['clone', '-q', '--depth', '1', '--no-local', pathToFileURL(AKAR).href, D], TMP)
    const r = nilai({}, M, ['F1', 'F4'], D)
    rmSync(D, { recursive: true, force: true })
    return [r.hasil.filter((h) => h.nama.startsWith('H ')).every((h) => !h.ok && /tidak tersedia/.test(h.detail)), ringkas(r)]
  })
  skenario('N-15a', 'manifest tidak valid: JSON rusak → muatManifest melaporkan galat', () => {
    tulis('uji-manifest.json', '{ "versi": 1, ')
    const g = L.muatManifest(K, 'uji-manifest.json').galat
    return [g.length > 0 && /tidak dapat dibaca/.test(g[0]), g[0]]
  })
  skenario('N-15b', 'manifest tidak valid: SHA pendek / path berpola / pengecualian berfield lebih → validasi gagal', () => {
    const a = salin(M)
    a.fase.F4.merge = '5e58237'
    const b = salin(M)
    b.pGlobal.persis.push('prisma/check-*.mjs')
    const c = salin(M)
    c.pengecualian = [{ basis: H0, path: 'prisma/x.mjs', blob: '0'.repeat(40), izin: 'semua' }]
    const r = [a, b, c].map((x) => nilai({}, x))
    return [r.every((x) => gagalPada(x, 'manifest lingkup sah')), r.map((x) => x.hasil[0].detail).join(' | ').slice(0, 250)]
  })
  skenario('N-15c', 'manifest dirusak: satu path dihapus dari rekaman F4 → H gagal (tidak sama persis)', () => {
    const m2 = salin(M)
    m2.fase.F4.berkas = m2.fase.F4.berkas.filter((f) => f !== 'prisma/check-voyage-event-api.mjs')
    const r = nilai({}, m2)
    return [gagalPada(r, 'SAMA PERSIS'), ringkas(r)]
  })
  skenario('N-15d', 'fase baru di manifest dengan commit bukan merge (induk tidak cocok) → H gagal', () => {
    const m2 = salin(M)
    const f1 = M.fase.F1
    m2.fase.FX = { pr: 99, merge: f1.kepala, basis: f1.basis, kepala: f1.kepala, berkas: f1.berkas }
    const r = nilai({}, m2, ['FX'])
    return [gagalPada(r, 'H FX') , ringkas(r)]
  })
  skenario('N-16', 'basis tidak sah: SHA pendek, SHA tidak ada, commit bukan leluhur HEAD → gagal', () => {
    const yatim = gk(['commit-tree', `${H0}^{tree}`, '-m', 'yatim']).trim()
    const r = ['abc123', '0'.repeat(40), yatim].map((b) => nilai({ WA2A_BASIS: b }))
    return [r.every((x) => gagalPada(x, 'basis perubahan')), r.map((x) => x.hasil.find((h) => h.nama.includes('basis perubahan')).detail).join(' | ')]
  })
  skenario('N-17a', 'mode fase: WA2A_FASE fase merged (F4) / id tak dikenal → gagal', () => {
    const r = ['F4', 'TIDAK_ADA'].map((id) => nilai({ WA2A_FASE: id }))
    return [r.every((x) => gagalPada(x, 'P-fase')), r.map((x) => x.hasil.find((h) => h.nama.startsWith('P-fase')).detail).join(' | ')]
  })
  skenario('N-17b', 'mode fase: jangkar tidak ada di perubahan → gagal', () => {
    const m2 = salin(M)
    m2.faseAktif = { UJI: { izin: ['docs/uji-fase.md', 'docs/lain.md'], jangkar: ['docs/uji-fase.md'] } }
    tulis('docs/lain.md', 'x\n')
    const r = nilai({ WA2A_FASE: 'UJI' }, m2)
    return [gagalPada(r, 'jangkar'), ringkas(r)]
  })
  skenario('N-17c', 'mode fase: path di luar allowlist → gagal', () => {
    const m2 = salin(M)
    m2.faseAktif = { UJI: { izin: ['docs/uji-fase.md'], jangkar: ['docs/uji-fase.md'] } }
    tulis('docs/uji-fase.md', 'x\n')
    tulis('docs/di-luar.md', 'x\n')
    const r = nilai({ WA2A_FASE: 'UJI' }, m2)
    return [gagalPada(r, 'allowlist'), ringkas(r)]
  })
  skenario('N-18a', 'pengecualian dengan basis salah → P-global gagal', () => {
    const p = 'prisma/check-wa2a-template.mjs'
    appendFileSync(join(K, p), '\n// uji\n')
    const m2 = salin(M)
    m2.pengecualian = [{ basis: M.fase.F4.merge, path: p, blob: L.blobBerkas(K, p) }]
    const r = nilai({}, m2)
    return [gagalPada(r, 'P-global: tidak ada berkas beku'), ringkas(r)]
  })
  skenario('N-18b', 'pengecualian dengan blob salah / berkas diubah lagi sesudah tuple dicatat → P-global gagal', () => {
    const p = 'prisma/check-wa2a-template.mjs'
    appendFileSync(join(K, p), '\n// uji\n')
    const m2 = salin(M)
    m2.pengecualian = [{ basis: H0, path: p, blob: L.blobBerkas(K, p) }]
    appendFileSync(join(K, p), '// diubah lagi\n')
    const r = nilai({}, m2)
    return [gagalPada(r, 'P-global: tidak ada berkas beku'), ringkas(r)]
  })
  {
    // N-19: mutan helper ditulis ke tmp (repo kerja tidak diubah) lalu dijalankan pada klon.
    const asli = readFileSync(join(AKAR, L.JALUR_HELPER), 'utf8')
    const pola = '  if (ke) args.push(ke)\n  return baris(git(akar, args)).sort()'
    const jm = join(TMP, 'mutan', 'wa2a-lingkup.mjs')
    mkdirSync(dirname(jm), { recursive: true })
    writeFileSync(jm, asli.replace(pola, '  if (ke) args.push(ke)\n  return []'))
    const Mut = await import(pathToFileURL(jm).href)
    pulih()
    const r = Mut.lapisLingkup(K, { fase: idFase, env: {}, manifest: M })
    cek('N-19 mutasi helper: daftarDiff selalu [] → setiap rekaman H gagal "SAMA PERSIS" (P tidak bisa lulus hampa tanpa ketahuan)', asli.includes(pola) && idFase.every((id) => r.hasil.some((h) => h.nama.startsWith(`H ${id}`) && h.nama.includes('SAMA PERSIS') && !h.ok)), ringkas(r))
  }
  skenario('N-20', 'mode bukti pada working tree kotor / nilai tidak sah → gagal', () => {
    tulis('docs/kotor.md', 'x\n')
    const r1 = nilai({ WA2A_BUKTI: '1' })
    pulih()
    const r2 = nilai({ WA2A_BUKTI: 'ya' })
    return [gagalPada(r1, 'mode bukti') && gagalPada(r2, 'mode bukti'), `${r1.hasil.find((h) => h.nama.startsWith('mode bukti')).detail} | ${r2.hasil.find((h) => h.nama.startsWith('mode bukti')).detail}`]
  })
  skenario('N-21', 'run lulus, lalu perubahan ilegal di-commit → run ulang gagal', () => {
    const r1 = nilai()
    appendFileSync(join(K, `${W}wa-message.service.ts`), '\n// ilegal\n')
    gk(['commit', '-qam', 'ilegal'])
    const r2 = nilai()
    return [semuaOk(r1) && gagalPada(r2, 'P-global: tidak ada berkas beku') && gagalPada(r2, 'I-2'), ringkas(r2)]
  })
  skenario('N-22', 'CRLF TANPA atribut normalisasi → blob berbeda, I-2 gagal (hash mengikuti aturan Git)', () => {
    ubahBerkas(`${W}wa2-gate.ts`, (s) => s.replace(/\n/g, '\r\n'))
    const r = nilai()
    return [gagalPada(r, 'I-2'), ringkas(r)]
  })
  skenario('N-23', 'uji WA-2a lama (check-wa2a-access-db.mjs) diubah tanpa pengecualian → P-global gagal', () => {
    appendFileSync(join(K, 'prisma/check-wa2a-access-db.mjs'), '\n// lemahkan\n')
    const r = nilai()
    return [gagalPada(r, 'P-global: tidak ada berkas beku'), ringkas(r)]
  })

  // ------------------------------------------------------------------ temuan review PR #29
  // Path sintetis (bukan route nyata 2a-G) supaya fixture tidak menimpa berkas yang sudah ada.
  const RUTE_ID = 'src/app/api/uji-sintetis/[id]/route.ts'
  const isiRute = "import { samarkanNomor } from '@/services/whatsapp/wa-phone'\nexport const GET = () => Response.json(samarkanNomor(''))\n"
  const mG = () => Object.assign(salin(M), { faseAktif: { G: { izin: [RUTE_ID], jangkar: [RUTE_ID] } }, i1: { ...M.i1, diizinkan: [...DISETUJUI_I1, RUTE_ID] } })
  skenario('P-10', 'T1: berkas route literal `[id]` + manifest sintetis (faseAktif.G, i1.diizinkan) → semua lapis lulus', () => {
    tulis(RUTE_ID, isiRute)
    const r = nilai({ WA2A_FASE: 'G' }, mG())
    return [semuaOk(r) && r.perubahan.semua.join() === RUTE_ID, ringkas(r)]
  })
  skenario('N-24', 'T1: route `abc/route.ts` dengan manifest `[id]` → allowlist, jangkar, dan I-1 gagal (`[id]` bukan wildcard)', () => {
    tulis('src/app/api/uji-sintetis/abc/route.ts', isiRute)
    const r = nilai({ WA2A_FASE: 'G' }, mG())
    return [gagalPada(r, 'allowlist') && gagalPada(r, 'jangkar') && gagalPada(r, 'I-1'), ringkas(r)]
  })
  const siklus = (urutanA, nama = ['a', 'b']) => {
    const [x, y] = nama
    tulis(`src/app/${x}/route.ts`, `import '../../lib/${x}'\n`)
    tulis(`src/app/${y}/route.ts`, `import '../../lib/${y}'\n`)
    tulis(`src/lib/${y}.ts`, `import './${x}'\n`)
    tulis(`src/lib/${x}.ts`, urutanA === 'siklus-dulu' ? `import './${y}'\nimport '../services/whatsapp/wa2-gate'\n` : `import '../services/whatsapp/wa2-gate'\nimport './${y}'\n`)
    return Object.keys(L.perujukTransitif(K, M.i1.akar, M.i1.sasaran).perujuk).sort()
  }
  skenario('N-25a', 'T2: reproduksi siklus (a.ts impor ./b dulu) → KEDUA route ditemukan, I-1 gagal', () => {
    const d = siklus('siklus-dulu')
    const r = nilai()
    return [d.join() === 'src/app/a/route.ts,src/app/b/route.ts' && gagalPada(r, 'I-1'), d.join(', ')]
  })
  skenario('P-11', 'T2: variasi urutan impor dan urutan pemindaian (nama dibalik) → himpunan sama', () => {
    const v1 = siklus('siklus-dulu')
    pulih()
    const v2 = siklus('wa2-dulu')
    pulih()
    const v3 = siklus('siklus-dulu', ['z', 'b']).map((f) => f.replace('/z/', '/a/')).sort()
    pulih()
    const v4 = siklus('siklus-dulu', ['b', 'a']).sort()
    return [[v2, v3, v4].every((v) => v.join() === v1.join()) && v1.length === 2, `${v1.join()} | ${v2.join()} | ${v3.join()} | ${v4.join()}`]
  })
  skenario('N-25b', 'T2: hanya route A diizinkan → route B tetap membuat I-1 gagal', () => {
    siklus('siklus-dulu')
    const m2 = salin(M)
    m2.i1.diizinkan = [...DISETUJUI_I1, 'src/app/a/route.ts']
    const r = nilai({}, m2)
    const d = r.hasil.find((h) => h.nama.startsWith('I-1'))?.detail ?? ''
    return [gagalPada(r, 'I-1') && d.includes('src/app/b/route.ts') && !d.includes('tak disetujui: src/app/a/') && !d.includes(`tak disetujui: ${R2G}`) && (d.match(/tak disetujui:/g) ?? []).length === 1, d]
  })
  skenario('P-12', 'T2: siklus tanpa jalur ke WA-2 → tanpa temuan palsu', () => {
    tulis('src/app/c/route.ts', "import '../../lib/c'\n")
    tulis('src/lib/c.ts', "import './d'\nimport './c'\n")
    tulis('src/lib/d.ts', "import './c'\n")
    const r = nilai()
    return [semuaOk(r), ringkas(r)]
  })
  skenario('P-13', 'T2: penelusuran selalu berhenti — impor diri, siklus dua arah, cincin 300 berkas (proses anak, batas 60 dtk)', () => {
    tulis('src/lib/diri.ts', "import './diri'\n")
    for (let n = 0; n < 300; n++) tulis(`src/lib/cincin/c${n}.ts`, `import './c${(n + 1) % 300}'\nimport '../diri'\n`)
    tulis('src/app/cincin/page.tsx', "import '../../lib/cincin/c0'\n")
    tulis('src/app/cincin2/page.tsx', "import '../../lib/cincin/c150'\nimport '../../lib/cincin/c0'\n")
    const kode = `const L = await import(${JSON.stringify(pathToFileURL(join(AKAR, L.JALUR_HELPER)).href)}); const r = L.perujukTransitif(${JSON.stringify(K)}, ['src/app', 'src/components'], 'src/services/whatsapp/'); console.log(JSON.stringify(Object.keys(r.perujuk)))`
    const t0 = Date.now()
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', kode], { encoding: 'utf8', timeout: 60_000 })
    return [JSON.parse(out).length === 0, `selesai ${Date.now() - t0} ms; temuan ${out.trim()}`]
  })
  const HELPER = L.JALUR_HELPER
  skenario('N-26a', 'T3: perubahan helper tanpa pengecualian → P-global gagal', () => {
    appendFileSync(join(K, HELPER), '\n// lemahkan helper\n')
    const r = nilai()
    return [gagalPada(r, 'P-global: tidak ada berkas beku') && r.hasil.find((h) => h.nama.startsWith('P-global: tidak ada')).detail.includes(HELPER), ringkas(r)]
  })
  skenario('N-26b', 'T3: tuple helper dengan basis salah atau blob salah → P-global gagal', () => {
    appendFileSync(join(K, HELPER), '\n// ubah helper\n')
    const blob = L.blobBerkas(K, HELPER)
    const a = salin(M)
    a.pengecualian = [{ basis: M.fase.F4.merge, path: HELPER, blob }]
    const b = salin(M)
    b.pengecualian = [{ basis: H0, path: HELPER, blob: L.blobBerkas(K, 'prisma/check-wa2a-template.mjs') }]
    return [gagalPada(nilai({}, a), 'P-global: tidak ada berkas beku') && gagalPada(nilai({}, b), 'P-global: tidak ada berkas beku'), 'basis F4 / blob berkas lain']
  })
  skenario('P-14', 'T3: tuple helper tepat (basis, path, blob akhir) pada basis yang sesuai → lulus', () => {
    appendFileSync(join(K, HELPER), '\n// ubah helper\n')
    const m2 = salin(M)
    m2.pengecualian = [{ basis: H0, path: HELPER, blob: L.blobBerkas(K, HELPER) }]
    const r = nilai({}, m2)
    return [semuaOk(r), ringkas(r)]
  })
  skenario('N-26c', 'T3: simulasi merge lalu basis berubah → tuple lama tidak mengizinkan perubahan helper berikutnya', () => {
    gk(['switch', '-q', '-c', 'uji-merge'])
    appendFileSync(join(K, HELPER), '\n// ubah helper tahap 1\n')
    const tuple = { basis: H0, path: HELPER, blob: L.blobBerkas(K, HELPER) }
    const m2 = salin(M)
    m2.pengecualian = [tuple]
    const sebelum = semuaOk(nilai({}, m2))
    gk(['commit', '-qam', 'ubah helper tahap 1'])
    const H1 = gk(['rev-parse', 'HEAD']).trim()
    gk(['update-ref', 'refs/remotes/origin/main', H1])
    const sesudahMerge = semuaOk(nilai({}, m2))
    appendFileSync(join(K, HELPER), '// ubah helper tahap 2\n')
    const r = nilai({}, m2)
    const m3 = salin(M)
    m3.pengecualian = [{ ...tuple, blob: L.blobBerkas(K, HELPER) }]
    const r3 = nilai({}, m3)
    gk(['reset', '-q', '--hard', H1])
    gk(['switch', '-q', '--detach', H0])
    gk(['branch', '-qD', 'uji-merge'])
    return [sebelum && sesudahMerge && gagalPada(r, 'P-global: tidak ada berkas beku') && gagalPada(r3, 'P-global: tidak ada berkas beku'), `sebelum merge lulus=${sebelum}; main pasca-merge bersih lulus=${sesudahMerge}; ubah lagi: tuple lama → ${ringkas(r).slice(0, 80)}; blob baru + basis lama → gagal=${gagalPada(r3, 'P-global')}`]
  })
} finally {
  rmSync(TMP, { recursive: true, force: true })
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
