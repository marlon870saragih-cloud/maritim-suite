// Uji helper gate lingkup WA-2a (prisma/wa2a-lingkup.mjs) — keputusan owner G-D1..G-D4.
//
// Jalankan: node prisma/check-wa2a-lingkup.mjs   (tanpa DB/jaringan; hanya git + berkas)
//
// Lapis:
//   R. repo nyata — manifest sah, rekaman H kelima fase, blob I-2 = blob tree HEAD & tanpa atribut pengubah isi,
//      pemindai I-1 tidak hampa (menemukan perujuk modul WA-1 yang diketahui).
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
cek('I-1 repo nyata: perujuk service WA-2 = daftar manifest (kosong)', Object.keys(L.perujukTransitif(AKAR, M.i1.akar, M.i1.sasaran).perujuk).join() === M.i1.diizinkan.join())
const sp = L.ekstrakSpecifier("// import a from '@/x'\n/* from '@/y' */ const s = \"from '@/z'\"; import b from './b'; export * from '../c'; const d = await import('@/d'); require('e'); import('@/' + n); obj.import('f'); Array.from('g')")
cek('ekstrakSpecifier: komentar/string biasa diabaikan; from/import()/require literal terbaca; import() non-literal dihitung', sp.spec.join() === './b,../c,@/d,e' && sp.dinamis === 1, `${sp.spec.join()} | dinamis=${sp.dinamis}`)

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
    m2.i1.diizinkan = ['src/app/api/uji-wa2/route.ts']
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
} finally {
  rmSync(TMP, { recursive: true, force: true })
}

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
