// Uji STATIS batas fixture WA-1 (SG-05, A1 — keputusan owner D-3; rancangan opsi A v2 §3).
//
// Jalankan: node prisma/check-sg05-batas-fixture.mjs   (tanpa DB/jaringan; hanya membaca berkas + git clone sementara)
//
// Tujuan SEMPIT: fixture penerima WA-1 (src/services/communication/comm-fixture.ts) tetap di zona WA-1 dan tidak
// dipakai jalur WA-2/provider. BUKAN bukti kebenaran penerima saat Send, BUKAN bukti revalidasi R1–R8, dan TIDAK
// menggantikan uji runtime. SG-05 tetap OPEN.
//
// Lapis:
//   R. repo nyata — P0 (gagal tertutup) + S-1..S-6 harus lulus.
//   M. kontrol mutasi pada CLONE SEMENTARA (git clone --shared ke direktori tmp; repo kerja tidak disentuh):
//      setiap pelanggaran harus ditangkap oleh ATURAN UJI INI (bukan hanya gate beku); kontrol positif harus lulus.
//
// Memakai ulang ekspor helper gate `prisma/wa2a-lingkup.mjs` (ekstrakSpecifier, perujukTransitif) TANPA mengubahnya,
// ditambah resolver kecil `@/` + relatif yang meniru `selesaikan` (tidak diekspor helper).
//
// Batas yang tidak didukung (tidak terdeteksi): pembacaan berkas via fs, berkas di luar src/, string rakitan atau
// terenkode, data dari DB/env, regex literal yang memuat tanda kutip (dapat mengacaukan penghapus komentar — batas
// yang sama dengan ekstrakSpecifier). S-4 adalah HEURISTIK TEKS atas satu berkas, bukan call graph (lihat S-4).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, posix, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { ekstrakSpecifier, perujukTransitif } from './wa2a-lingkup.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
}
const bagian = (j) => console.log(`\n${j}`)

// ============================================================================ konstanta (literal, bukan dari pemindai)
const EKSTENSI = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const FIX = 'src/services/communication/comm-fixture.ts'
const BRIDGE = 'src/services/whatsapp/wa1-bridge.ts'
const SVC = 'src/services/communication/communication.service.ts'
const KOM = 'src/services/communication/'
const ZONA_WA1 = ['src/services/communication/', 'src/app/(app)/automation/communications/', 'src/app/api/automation/communications/', 'src/components/automation/Communication']
const ZONA_WA2 = ['src/services/whatsapp/', 'src/app/api/automation/client-messages/', 'src/app/(app)/automation/client-messages/', 'src/components/automation/ClientMessageList.tsx', 'src/components/automation/ClientMessageWorkspace.tsx', 'src/components/automation/client-message-shared.tsx']
const diZona = (zona, f) => zona.some((z) => f.startsWith(z))

// S-1: perujuk langsung comm-fixture (keadaan main 23ec4e8).
const S1_HARAP = [
  'src/app/(app)/automation/communications/[id]/page.tsx',
  'src/services/communication/comm-fake-provider.ts',
  'src/services/communication/communication-send.service.ts',
  'src/services/communication/communication.service.ts',
]
// S-2: tepi langsung dari luar zona WA-1 ke modul WA-1.
const S2_HARAP = {
  'src/app/(app)/automation/alerts/page.tsx': ['src/services/communication/comm-access.ts'],
  'src/app/(app)/layout.tsx': ['src/services/communication/comm-access.ts'],
  'src/app/(app)/voyages/[id]/page.tsx': ['src/services/communication/comm-access.ts'],
  [BRIDGE]: ['src/services/communication/comm-hash.ts', 'src/services/communication/comm-policy.ts', SVC],
}
// S-3: nama ASLI (sebelum `as`) yang diteruskan bridge, per modul tujuan (wa1-bridge.ts:14–27).
const S3_HARAP = {
  [SVC]: ['CandidateBaris', 'HasilRevalidasiCandidate', 'HasilSiapkanCandidate', 'Tx', 'bisaDiulang', 'hentikanApprovalTertaut', 'kunciCandidate', 'muatCandidateDalamTx', 'revalidasiCandidate', 'siapkanDalamTx'],
  'src/services/communication/comm-policy.ts': ['KunciCandidate', 'SinyalMasuk', 'klasifikasiSinyal', 'teksKunciCandidate'],
  'src/services/communication/comm-hash.ts': ['jsonKanonikKomunikasi'],
}
const S3_DILARANG = ['buatRevisiPesan', 'revisiDalamTx', 'pilihPenerimaFixture', 'FIXTURE_PENERIMA']
// S-4: akar = fungsi (nilai, bukan tipe) yang diteruskan bridge dari communication.service.
const S4_AKAR = ['bisaDiulang', 'hentikanApprovalTertaut', 'kunciCandidate', 'muatCandidateDalamTx', 'revalidasiCandidate', 'siapkanDalamTx']
const S4_FIXTURE_LOKAL = ['buatRevisiPesan', 'revisiDalamTx']
// S-5: token fixture yang tidak boleh muncul di kode zona WA-2 (komentar dibuang, string dipertahankan).
const S5_TOKEN = ['TEST_FIXTURE', 'WA1_TEST_FIXTURE', 'recipientFixtureId', 'FIXTURE_PENERIMA', 'pilihPenerimaFixture', 'comm-fixture']

// ============================================================================ utilitas murni
function selesaikan(akar, dariRel, s) {
  let dasar
  if (s.startsWith('@/')) dasar = posix.normalize(`src/${s.slice(2)}`)
  else if (s.startsWith('./') || s.startsWith('../')) dasar = posix.normalize(posix.join(posix.dirname(dariRel), s))
  else return null
  for (const k of [dasar, ...EKSTENSI.map((e) => dasar + e), ...EKSTENSI.map((e) => `${dasar}/index${e}`)]) {
    const abs = join(akar, k)
    if (existsSync(abs) && statSync(abs).isFile()) return k
  }
  return dasar
}

function berkasSrc(akar, rel = 'src', hasil = []) {
  const abs = join(akar, rel)
  if (!existsSync(abs)) return hasil
  for (const d of readdirSync(abs, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name.startsWith('.')) continue
    const p = `${rel}/${d.name}`
    if (d.isDirectory()) berkasSrc(akar, p, hasil)
    else if (EKSTENSI.some((e) => d.name.endsWith(e))) hasil.push(p)
  }
  return hasil.sort()
}

/**
 * Buang komentar; string, template (termasuk `${}` bersarang) dan regex literal dipertahankan apa adanya.
 * Regex literal dikenali SEMPIT dari token sebelumnya: `/` sesudah awal berkas, salah satu `( , = : [ ! & | ? { } ; + - * % < > ~ ^`,
 * atau kata kunci (return, typeof, case, …); sesudah identifier/angka/`)`/`]` dianggap pembagian. Bentuk yang
 * keliru dikenali dapat mengacaukan penguraian; string/template/regex/komentar blok tak tertutup → galat
 * (pemanggil gagal tertutup).
 */
const KATA_SEBELUM_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'new', 'instanceof', 'yield', 'await', 'else', 'do'])
function tanpaKomentar(src) {
  let out = ''
  let i = 0
  const n = src.length
  const ekspr = [] // kedalaman kurung kurawal per `${` template yang sedang terbuka
  const pindaiTemplate = (j) => {
    // j = indeks sesudah backtick pembuka atau sesudah `}` penutup `${…}`; kembalikan indeks sesudah bagian yang dibaca.
    while (j < n) {
      if (src[j] === '\\') j += 2
      else if (src[j] === '`') return { j: j + 1, buka: false }
      else if (src[j] === '$' && src[j + 1] === '{') return { j: j + 2, buka: true }
      else j++
    }
    throw new Error('template tidak tertutup')
  }
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2)
      if (j < 0) throw new Error('komentar blok tidak tertutup')
      out += ' '
      i = j + 2
      continue
    }
    if (c === '/') {
      const sig = out.trimEnd().slice(-1)
      const kata = /([A-Za-z_$][\w$]*)\s*$/.exec(out)?.[1]
      // JSX: `</tag>` (sesudah `<`) dan `/>` (penutup elemen) bukan regex.
      const jsx = sig === '<' || d === '>'
      const regex = !jsx && (sig === '' || /[(,=:[!&|?{};+\-*%<>~^}]/.test(sig) || (kata !== undefined && /[\w$]/.test(sig) && KATA_SEBELUM_REGEX.has(kata)))
      if (regex) {
        let j = i + 1
        let kelas = false
        while (j < n) {
          const r = src[j]
          if (r === '\\') { j += 2; continue }
          if (r === '\n') throw new Error('regex literal tidak tertutup')
          if (kelas) { if (r === ']') kelas = false }
          else if (r === '[') kelas = true
          else if (r === '/') break
          j++
        }
        if (j >= n) throw new Error('regex literal tidak tertutup')
        j++
        while (j < n && /[a-z]/.test(src[j])) j++
        out += src.slice(i, j)
        i = j
        continue
      }
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++
        else if (src[j] === '\n') throw new Error(`string ${c} tidak tertutup`)
        j++
      }
      if (j >= n) throw new Error(`string ${c} tidak tertutup`)
      out += src.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (c === '`') {
      const t = pindaiTemplate(i + 1)
      out += src.slice(i, t.j)
      i = t.j
      if (t.buka) ekspr.push(0)
      continue
    }
    if (ekspr.length && c === '{') ekspr[ekspr.length - 1]++
    if (ekspr.length && c === '}') {
      if (ekspr[ekspr.length - 1] === 0) {
        ekspr.pop()
        const t = pindaiTemplate(i + 1)
        out += src.slice(i, t.j)
        i = t.j
        if (t.buka) ekspr.push(0)
        continue
      }
      ekspr[ekspr.length - 1]--
    }
    out += c
    i++
  }
  if (ekspr.length) throw new Error('ekspresi template tidak tertutup')
  return out
}

const baca = (akar, rel) => readFileSync(join(akar, rel), 'utf8')
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const targetLangsung = (akar, f) => [...new Set(ekstrakSpecifier(baca(akar, f)).spec.map((s) => selesaikan(akar, f, s)).filter(Boolean))].sort()

// ============================================================================ pemeriksaan (akar = repo atau clone)
function periksa(akar) {
  const h = []
  const catat = (id, nama, ok, detail = '') => h.push({ id, nama, ok, detail })
  const src = berkasSrc(akar)

  // ---------------------------------------------------------------- P0 (gagal tertutup)
  let paths = null
  try {
    paths = JSON.parse(baca(akar, 'tsconfig.json'))?.compilerOptions?.paths ?? null
  } catch (e) {
    paths = `galat: ${e.message}`
  }
  catat('P0-a', 'tsconfig paths = TEPAT {"@/*": ["./src/*"]} (alias lain tidak dapat diselesaikan)', sama(paths, { '@/*': ['./src/*'] }), JSON.stringify(paths))
  let dinamis = 0
  for (const f of src) dinamis += ekstrakSpecifier(baca(akar, f)).dinamis
  catat('P0-b', 'import()/require() NON-literal di src/ = 0', dinamis === 0, `${dinamis} dari ${src.length} berkas`)
  const wa2 = src.filter((f) => diZona(ZONA_WA2, f))
  const pemuatLain = []
  const takTerurai = []
  const kodeWa2 = {}
  for (const f of wa2) {
    try {
      kodeWa2[f] = tanpaKomentar(baca(akar, f))
      if (/\beval\s*\(|\bnew\s+Function\b|\bcreateRequire\b|(?:^|[^\w$.])require\s*\(/.test(kodeWa2[f])) pemuatLain.push(f)
    } catch (e) {
      takTerurai.push(`${f}: ${e.message}`)
    }
  }
  catat('P0-c', 'zona WA-2: tanpa eval / new Function / createRequire / require( ; semua berkas dapat diurai', pemuatLain.length === 0 && takTerurai.length === 0, [...pemuatLain, ...takTerurai].join(', ') || `${wa2.length} berkas`)
  const nc = readdirSync(akar).filter((x) => /^next\.config\./.test(x))
  const ncAlias = nc.filter((x) => /\balias\b|\bresolve\s*:|\bwebpack\b|\bturbopack\b/.test(tanpaKomentar(baca(akar, x))))
  catat('P0-d', 'next.config.* tanpa alias/resolve/webpack/turbopack (alias bundler tidak dapat diselesaikan)', ncAlias.length === 0, ncAlias.join(', ') || nc.join(', ') || 'tidak ada berkas')
  const hilang = [FIX, BRIDGE, SVC].filter((p) => !existsSync(join(akar, p)))
  catat('P0-e', 'berkas sasaran ada (comm-fixture, wa1-bridge, communication.service)', hilang.length === 0, hilang.join(', ') || 'ada')

  // ---------------------------------------------------------------- S-1
  const tepi = Object.fromEntries(src.map((f) => [f, targetLangsung(akar, f)]))
  const s1 = src.filter((f) => tepi[f].includes(FIX))
  catat('S-1', 'perujuk LANGSUNG comm-fixture = PERSIS 4 berkas zona WA-1 (alias/relatif/export-from/import() literal)', sama(s1, S1_HARAP), s1.filter((f) => !S1_HARAP.includes(f)).map((f) => `liar: ${f}`).concat(S1_HARAP.filter((f) => !s1.includes(f)).map((f) => `hilang: ${f}`)).join(', ') || `${s1.length} perujuk`)

  // ---------------------------------------------------------------- S-2
  const s2 = {}
  for (const f of src) {
    if (diZona(ZONA_WA1, f)) continue
    const t = tepi[f].filter((x) => x.startsWith(KOM))
    if (t.length) s2[f] = t
  }
  const s2Beda = [...new Set([...Object.keys(s2), ...Object.keys(S2_HARAP)])].sort().filter((f) => !sama(s2[f] ?? [], S2_HARAP[f] ?? [])).map((f) => `${f}: ${JSON.stringify(s2[f] ?? [])}`)
  catat('S-2', 'tepi langsung luar zona WA-1 → modul WA-1 = PERSIS daftar literal (bridge 3 modul; 3 halaman → comm-access)', s2Beda.length === 0, s2Beda.join('; ') || `${Object.keys(s2).length} berkas`)
  const tFix = perujukTransitif(akar, ['src'], FIX).perujuk
  const gerbang = [...new Set(Object.values(S2_HARAP).flat())].filter((t) => t !== SVC).sort()
  const gerbangKena = gerbang.filter((t) => tFix[t])
  catat('S-2', 'modul WA-1 yang dirujuk dari luar zona (selain communication.service via bridge) TIDAK menjangkau fixture', gerbangKena.length === 0, gerbangKena.map((t) => tFix[t].join(' → ')).join('; ') || gerbang.join(', '))

  // ---------------------------------------------------------------- S-3
  let s3ok = false
  let s3detail = ''
  const nilaiSvc = []
  try {
    const kode = tanpaKomentar(baca(akar, BRIDGE))
    const BENTUK = /^\s*(?:export\s+(?:type\s+)?\{[^}]*\}\s*from\s*'[^']+'\s*;?\s*)+$/
    if (!BENTUK.test(kode)) throw new Error('bukan murni `export { … } from` (ada export */default, impor, atau kode lokal)')
    const per = {}
    for (const m of kode.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const t = selesaikan(akar, BRIDGE, m[3]) ?? m[3]
      for (const e of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
        const tipe = Boolean(m[1]) || /^type\s/.test(e)
        const asli = e.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
        ;(per[t] ??= []).push(asli)
        if (t === SVC && !tipe) nilaiSvc.push(asli)
      }
    }
    for (const k of Object.keys(per)) per[k].sort()
    const dilarang = Object.values(per).flat().filter((x) => S3_DILARANG.includes(x))
    s3ok = sama(Object.keys(per).sort(), Object.keys(S3_HARAP).sort()) && Object.keys(S3_HARAP).every((k) => sama(per[k], S3_HARAP[k])) && dilarang.length === 0
    s3detail = dilarang.length ? `simbol fixture diteruskan: ${dilarang.join(', ')}` : s3ok ? `${Object.values(per).flat().length} nama, 3 modul` : JSON.stringify(per)
  } catch (e) {
    s3detail = `gagal tertutup: ${e.message}`
  }
  catat('S-3', 'wa1-bridge: hanya `export {…} from` 3 modul; 15 nama ASLI persis; tanpa simbol fixture', s3ok, s3detail)

  // ---------------------------------------------------------------- S-4 (HEURISTIK TEKS — klaim terbatas)
  // Atas SATU berkas (communication.service.ts): potong deklarasi tingkat-atas, telusuri identifier yang DISEBUT
  // mulai dari fungsi yang diteruskan bridge. Over-approximation (sebutan di string/komentar ikut dihitung).
  // BUKAN call graph: tidak memodelkan `this`, dispatch properti, binding yang di-reassign, callback dari pemanggil,
  // atau perilaku di dalam modul impor selain lewat himpunan R (modul yang menjangkau fixture).
  let s4ok = false
  let s4detail = ''
  try {
    const raw = baca(akar, SVC)
    const kode = tanpaKomentar(raw)
    if (/\beval\s*\(|\bnew\s+Function\b|import\s*\*\s*as\b|(?:^|[^\w$.])import\s*\(|(?:^|[^\w$.])require\s*\(/.test(kode)) throw new Error('memuat eval/new Function/import * as/import()/require()')
    const RE = /^(?:export\s+)?(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|type\s+([A-Za-z_$][\w$]*)|interface\s+([A-Za-z_$][\w$]*)|enum\s+([A-Za-z_$][\w$]*))/gm
    const pos = [...raw.matchAll(RE)].map((m) => ({ n: m.slice(1).find(Boolean), i: m.index }))
    if (pos.length === 0) throw new Error('tidak ada deklarasi tingkat-atas')
    const deklar = Object.create(null)
    for (let k = 0; k < pos.length; k++) deklar[pos[k].n] = raw.slice(pos[k].i, pos[k + 1]?.i ?? raw.length)
    const imporSemua = [...kode.matchAll(/^import\b/gm)].length
    const impor = Object.create(null)
    let terurai = 0
    for (const m of kode.matchAll(/^import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:from\s*)?'([^']+)'/gm)) {
      terurai++
      const t = selesaikan(akar, SVC, m[3]) ?? m[3]
      const nama = [m[1], ...(m[2] ?? '').split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim())].filter(Boolean)
      for (const n of nama) impor[n] = t
    }
    if (terurai !== imporSemua) throw new Error(`bentuk impor tak dikenal (${imporSemua - terurai} pernyataan)`)
    const akarHilang = S4_AKAR.filter((a) => !deklar[a])
    if (akarHilang.length) throw new Error(`akar tidak ditemukan sebagai deklarasi tingkat-atas: ${akarHilang.join(', ')}`)
    if (!sama([...nilaiSvc].sort(), [...S4_AKAR].sort())) throw new Error(`fungsi yang diteruskan bridge ≠ akar S-4: ${nilaiSvc.join(',')}`)
    const R = new Set([FIX, ...Object.keys(perujukTransitif(akar, ['src'], FIX).perujuk)])
    const kunjung = new Set()
    const q = [...S4_AKAR]
    const langgar = []
    while (q.length) {
      const n = q.shift()
      if (kunjung.has(n)) continue
      kunjung.add(n)
      for (const id of new Set(deklar[n].match(/[A-Za-z_$][\w$]*/g) ?? [])) {
        if (deklar[id] && !kunjung.has(id)) q.push(id)
        if (S4_FIXTURE_LOKAL.includes(id)) langgar.push(`${n} menyebut ${id}`)
        if (impor[id] && R.has(impor[id])) langgar.push(`${n} memakai ${id} dari ${impor[id]}`)
      }
    }
    s4ok = langgar.length === 0
    s4detail = langgar.join('; ') || `closure ${kunjung.size} deklarasi dari ${S4_AKAR.length} akar; |R| = ${R.size} modul`
  } catch (e) {
    s4detail = `gagal tertutup: ${e.message}`
  }
  catat('S-4', 'HEURISTIK TEKS: closure sebutan dari 6 fungsi bridge di communication.service tidak menyebut revisi fixture / impor dari modul yang menjangkau fixture', s4ok, s4detail)

  // ---------------------------------------------------------------- S-5
  const s5 = []
  for (const f of wa2) for (const t of S5_TOKEN) if (kodeWa2[f]?.includes(t)) s5.push(`${f}: ${t}`)
  catat('S-5', 'zona WA-2: tanpa token fixture di kode (komentar dibuang, string/template dipertahankan)', s5.length === 0 && takTerurai.length === 0, s5.join('; ') || (takTerurai.length ? 'ada berkas tak terurai (lihat P0-c)' : `${wa2.length} berkas`))

  // ---------------------------------------------------------------- S-6
  const tBridge = perujukTransitif(akar, ['src'], BRIDGE).perujuk
  const A = Object.keys(tFix).filter((f) => !diZona(ZONA_WA1, f)).sort()
  const s6 = A.filter((f) => {
    if (f === BRIDGE) return false
    const r = tFix[f]
    const lewat = r.some((x, k) => x === BRIDGE && r[k + 1] === SVC)
    return !tBridge[f] || !lewat
  })
  catat('S-6', 'setiap berkas luar zona WA-1 yang menjangkau fixture (modul) melakukannya LEWAT tepi wa1-bridge → communication.service', s6.length === 0, s6.map((f) => tFix[f].join(' → ')).join('; ') || `${A.length} berkas menjangkau fixture secara modul — semuanya lewat bridge (diketahui; simbol fixture tidak diteruskan: S-3/S-4)`)
  return h
}

// ============================================================================ R
bagian('[R] Repo nyata')
const hasilRepo = periksa(AKAR)
for (const x of hasilRepo) cek(`${x.id} ${x.nama}`, x.ok, x.detail)

// ============================================================================ M
bagian('[M] Kontrol mutasi pada clone sementara')
const TMP = mkdtempSync(join(tmpdir(), 'sg05-batas-'))
const PENANDA = join(TMP, '.sg05-batas-penanda')
const TOKEN = randomBytes(8).toString('hex')
writeFileSync(PENANDA, TOKEN)
const K = join(TMP, 'k')
const gk = (args, cwd = K) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
function pulih() {
  if (resolve(gk(['rev-parse', '--show-toplevel']).trim()) !== resolve(K)) throw new Error('clone tidak dikenali — berhenti')
  gk(['checkout', '-q', '--', '.'])
  gk(['clean', '-fdq'])
}
function ganti(rel, dari, ke) {
  const p = join(K, rel)
  const s = readFileSync(p, 'utf8')
  if (!s.includes(dari)) throw new Error(`mutasi tidak dapat diterapkan: pola tidak ada di ${rel}`)
  writeFileSync(p, s.replace(dari, ke))
}
const tambah = (rel, isi) => writeFileSync(join(K, rel), readFileSync(join(K, rel), 'utf8') + isi)
const baru = (rel, isi) => {
  execFileSync('mkdir', ['-p', posix.dirname(join(K, rel))])
  writeFileSync(join(K, rel), isi)
}
/** Sisipkan baris di awal badan fungsi tingkat-atas `nama` (sesudah `{` pertama di akhir baris tanda tangan). */
function sisipBadan(rel, kepala, baris) {
  const p = join(K, rel)
  const s = readFileSync(p, 'utf8')
  const i = s.indexOf(kepala)
  if (i < 0) throw new Error(`mutasi tidak dapat diterapkan: ${kepala} tidak ada`)
  const j = s.indexOf('{\n', i)
  writeFileSync(p, `${s.slice(0, j + 2)}  ${baris}\n${s.slice(j + 2)}`)
}
function mutasi(id, nama, harapGagal, fn) {
  try {
    pulih()
    fn()
    const r = periksa(K)
    const gagalId = [...new Set(r.filter((x) => !x.ok).map((x) => x.id))]
    if (harapGagal === null) cek(`${id} (kontrol positif) ${nama}`, gagalId.length === 0, gagalId.length ? `gagal: ${gagalId.join(',')}` : 'semua aturan lulus')
    else cek(`${id} ${nama} → ditangkap ${harapGagal}`, gagalId.includes(harapGagal), `aturan gagal: ${gagalId.join(',') || '(tidak ada)'}`)
  } catch (e) {
    cek(`${id} ${nama}`, false, `galat: ${e.message.split('\n')[0]}`)
  }
}

const WMS = 'src/services/whatsapp/wa-message.service.ts'
const IMP = (nama, s) => `\nimport { ${nama} } from '${s}'\n`
try {
  gk(['clone', '-q', '--shared', AKAR, K], TMP)
  console.log(`  ℹ️  clone sementara ${TMP} pada ${gk(['rev-parse', 'HEAD']).trim().slice(0, 12)} (HEAD ter-commit repo kerja)`)

  mutasi('P-01', 'clone bersih', null, () => {})
  mutasi('P-02', 'tambah dokumen saja', null, () => baru('docs/uji-sg05.md', '# uji\n'))

  mutasi('M1-1', 'impor alias comm-fixture di wa-message.service', 'S-1', () => tambah(WMS, IMP('FIXTURE_PENERIMA', '@/services/communication/comm-fixture')))
  mutasi('M1-2', 'impor relatif ../communication/comm-fixture di wa-message-check', 'S-1', () => tambah('src/services/whatsapp/wa-message-check.ts', IMP('pilihPenerimaFixture', '../communication/comm-fixture')))
  mutasi('M1-3', 'berkas WA-2 baru `export * from` comm-fixture', 'S-1', () => baru('src/services/whatsapp/wa-x.ts', "export * from '@/services/communication/comm-fixture'\n"))
  mutasi('M1-4', 'provider baru (luar zona) `await import()` literal comm-fixture', 'S-1', () => baru('src/services/kirim-wa/provider.ts', "export async function muat() { return await import('@/services/communication/comm-fixture') }\n"))
  mutasi('M1-5', 'import() non-literal', 'P0-b', () => baru('src/services/kirim-wa/dinamis.ts', "const n = 'x'\nexport const f = () => import('@/services/' + n)\n"))
  mutasi('M1-6', 'perujuk WA-1 yang tercatat hilang (daftar harus PERSIS, bukan subset)', 'S-1', () => ganti('src/app/(app)/automation/communications/[id]/page.tsx', "import { FIXTURE_PENERIMA } from '@/services/communication/comm-fixture'", 'const FIXTURE_PENERIMA: never[] = []'))

  mutasi('M2-1', 'WA-2 mengimpor communication-send.service langsung', 'S-2', () => tambah(WMS, IMP('kirimPesan', '@/services/communication/communication-send.service')))
  mutasi('M2-2', 'layout (app) mengimpor communication.service', 'S-2', () => tambah('src/app/(app)/layout.tsx', IMP('gerbang', '@/services/communication/communication.service')))
  mutasi('M2-3', 'bridge menambah modul communication-read.service', 'S-2', () => tambah(BRIDGE, "export { bacaPesan } from '@/services/communication/communication-read.service'\n"))
  mutasi('M2-4', 'modul gerbang comm-access menjangkau fixture', 'S-2', () => tambah('src/services/communication/comm-access.ts', "\nimport '@/services/communication/comm-fixture'\n"))

  mutasi('M3-1', 'bridge meneruskan buatRevisiPesan', 'S-3', () => ganti(BRIDGE, '  bisaDiulang as bisaDiulangWa1,', '  bisaDiulang as bisaDiulangWa1,\n  buatRevisiPesan,'))
  mutasi('M3-2', 'bridge meneruskan buatRevisiPesan dengan alias', 'S-3', () => ganti(BRIDGE, '  bisaDiulang as bisaDiulangWa1,', '  bisaDiulang as bisaDiulangWa1,\n  buatRevisiPesan as buatDraft,'))
  mutasi('M3-3', 'bridge `export *` dari communication.service', 'S-3', () => tambah(BRIDGE, "export * from '@/services/communication/communication.service'\n"))
  mutasi('M3-4', 'bridge memuat kode lokal pembungkus', 'S-3', () => tambah(BRIDGE, 'export const bungkus = () => 1\n'))

  mutasi('M4-1', 'kunciCandidate menyebut pilihPenerimaFixture', 'S-4', () => sisipBadan(SVC, 'export async function kunciCandidate(', "void pilihPenerimaFixture('M4-1')"))
  mutasi('M4-2', 'helper revalidasiSumber (bukan akar; terjangkau lewat rantai helper) menyebut pilihPenerimaFixture', 'S-4', () => sisipBadan(SVC, 'async function revalidasiSumber(', "void pilihPenerimaFixture('M4-2')"))
  mutasi('M4-3', 'revalidasiCandidate memakai impor dari communication-send.service', 'S-4', () => {
    ganti(SVC, "import { pilihPenerimaFixture } from './comm-fixture'", "import { pilihPenerimaFixture } from './comm-fixture'\nimport { __sg05 } from './communication-send.service'")
    sisipBadan(SVC, 'export async function revalidasiCandidate(', 'void __sg05')
  })
  mutasi('M4-4', 'akar siapkanDalamTx diganti nama (gagal tertutup)', 'S-4', () => ganti(SVC, 'export async function siapkanDalamTx(', 'export async function siapkanDalamTxLain('))
  mutasi('M4-5', 'sebutan fixture di fungsi yang TIDAK terjangkau (tandaiDipratinjau)', null, () => sisipBadan(SVC, 'export async function tandaiDipratinjau(', '// pilihPenerimaFixture disebut di komentar fungsi yang tidak diteruskan bridge'))

  mutasi('M5-1', "string 'WA1_TEST_FIXTURE_SUCCESS' di wa-message.service", 'S-5', () => tambah(WMS, "\nexport const __x = 'WA1_TEST_FIXTURE_SUCCESS'\n"))
  mutasi('M5-2', 'template literal TEST_FIXTURE_WA_${n} di komponen client-message', 'S-5', () => tambah('src/components/automation/client-message-shared.tsx', '\nexport const __t = (n: number) => `TEST_FIXTURE_WA_${n}`\n'))
  mutasi('M5-3', 'token fixture hanya di komentar', null, () => tambah(WMS, '\n// TEST_FIXTURE dan comm-fixture disebut di komentar saja\n'))

  mutasi('M6-1', 'layanan baru luar zona mengimpor communication-read.service (bukan lewat bridge)', 'S-6', () => baru('src/services/kirim-wa/baca.ts', "export { bacaPesan } from '@/services/communication/communication-read.service'\n"))
  mutasi('M6-2', 'berkas WA-2 baru mengimpor comm-fake-provider (rantai baru ke fixture)', 'S-6', () => baru('src/services/whatsapp/wa-x2.ts', "import type { SkenarioFake } from '@/services/communication/comm-fake-provider'\nexport type X = SkenarioFake\n"))
  mutasi('M6-3', 'berkas WA-2 mengimpor bridge DAN comm-fixture langsung (rantai terpendek bukan lewat bridge)', 'S-6', () => baru('src/services/whatsapp/wa-x3.ts', "import { kunciCandidate } from './wa1-bridge'\nimport { FIXTURE_PENERIMA } from '@/services/communication/comm-fixture'\nexport const y = [kunciCandidate, FIXTURE_PENERIMA]\n"))
} finally {
  const aman = resolve(TMP).startsWith(resolve(tmpdir()) + sep) && /^sg05-batas-[A-Za-z0-9]{6}$/.test(basename(TMP)) && existsSync(PENANDA) && readFileSync(PENANDA, 'utf8') === TOKEN
  if (aman) rmSync(TMP, { recursive: true, force: true })
  cek('folder sementara dibersihkan setelah identitas diverifikasi (lokasi tmp, nama sg05-batas-*, penanda acak cocok)', aman && !existsSync(TMP), aman ? TMP : `TIDAK dihapus (identitas tidak cocok): ${TMP}`)
}

console.log('\nℹ️  Cakupan: fixture WA-1 tidak dipakai jalur WA-2/provider di src/. Uji ini BUKAN bukti kebenaran penerima saat Send dan tidak menggantikan uji runtime. SG-05 tetap OPEN.')
console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
