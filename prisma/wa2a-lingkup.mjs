// Gate lingkup WA-2a — tiga lapis terpisah (keputusan owner G-D1..G-D4, 16 Okt 2026).
//
//   I — invarian kode SEKARANG (tanpa diff):
//       I-1 perujuk service WA-2 dari src/app & src/components (resolusi impor TRANSITIF) = PERSIS daftar disetujui;
//       I-2 berkas beku = blob Git tercatat (`git hash-object`, mengikuti .gitattributes / filter Git).
//   H — rekaman lingkup historis: diff `merge^1 → merge^2` setiap fase merged SAMA PERSIS dengan manifest.
//   P — perubahan berjalan: working tree (ter-commit sejak basis + staged + unstaged + untracked, --no-renames)
//       terhadap basis = merge-base(HEAD, origin/main) — GAGAL TERTUTUP bila basis tak dapat ditentukan.
//       P-global: denylist berkas beku + aturan tambah-saja; pengecualian HANYA tuple (basis, path, blob akhir).
//       P-fase: allowlist persis + jangkar, hanya bila WA2A_FASE dinyatakan eksplisit.
//
// Data (fase, hash, daftar, pengecualian) ada di prisma/wa2a-lingkup-manifest.json. Modul ini tidak membaca
// process.env sendiri: pemanggil meneruskan `env`. Tidak ada DB, jaringan, atau tulis berkas.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

export const JALUR_MANIFEST = 'prisma/wa2a-lingkup-manifest.json'
export const JALUR_HELPER = 'prisma/wa2a-lingkup.mjs'
const SHA40 = /^[0-9a-f]{40}$/
const EKSTENSI = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

export function git(akar, args, { boleh = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: akar, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    if (boleh) return null
    throw e
  }
}
const baris = (t) => (t ?? '').split('\n').filter(Boolean)
const samaHimpunan = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

/** SATU-SATUNYA fungsi diff nama berkas, dipakai lapis H dan P (mutasi yang mengosongkannya menggagalkan H). */
export function daftarDiff(akar, dari, ke = null) {
  const args = ['diff', '--no-renames', '--name-only', dari]
  if (ke) args.push(ke)
  return baris(git(akar, args)).sort()
}

export const daftarUntracked = (akar) => baris(git(akar, ['ls-files', '--others', '--exclude-standard'])).sort()

/** Blob Git isi working tree (filter/eol .gitattributes diterapkan seperti `git add`); null bila bukan berkas. */
export function blobBerkas(akar, rel) {
  const abs = join(akar, rel)
  if (!existsSync(abs) || !statSync(abs).isFile()) return null
  return git(akar, ['hash-object', '--', rel]).trim()
}

export const blobDiTree = (akar, rev, rel) => (git(akar, ['ls-tree', rev, '--', rel], { boleh: true }) ?? '').trim().split(/\s+/)[2] ?? null

const adaCommit = (akar, sha) => SHA40.test(sha ?? '') && git(akar, ['cat-file', '-e', `${sha}^{commit}`], { boleh: true }) !== null
/**
 * Path relatif PERSIS (dibandingkan sebagai string, tidak pernah diekspansi sebagai glob). Segmen route dinamis
 * Next.js seperti `[id]` / `[...slug]` adalah nama berkas literal dan diterima. Ditolak: wildcard `*` `?` `{` `}`,
 * path absolut, backslash, karakter kontrol, segmen kosong, `.` atau `..` (traversal).
 */
const tanpaPola = (p) =>
  typeof p === 'string' && p !== '' && !/[*?{}\\\x00-\x1f]/.test(p) && !p.startsWith('/') && p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
const daftarSah = (a, { kosongBoleh = true } = {}) => Array.isArray(a) && (kosongBoleh || a.length > 0) && a.every(tanpaPola) && new Set(a).size === a.length

// ============================================================================ manifest

export function validasiManifest(m) {
  const g = []
  if (!m || typeof m !== 'object') return ['manifest bukan objek']
  if (m.versi !== 1) g.push('versi harus 1')
  if (!m.fase || typeof m.fase !== 'object' || Object.keys(m.fase).length === 0) g.push('fase kosong')
  for (const [id, f] of Object.entries(m.fase ?? {})) {
    if (!Number.isInteger(f?.pr)) g.push(`fase ${id}: pr bukan bilangan bulat`)
    for (const k of ['merge', 'basis', 'kepala']) if (!SHA40.test(f?.[k] ?? '')) g.push(`fase ${id}: ${k} bukan SHA 40-hex`)
    if (!daftarSah(f?.berkas, { kosongBoleh: false })) g.push(`fase ${id}: berkas kosong/bukan path persis/duplikat`)
    else if (f.berkas.join('\n') !== [...f.berkas].sort().join('\n')) g.push(`fase ${id}: berkas tidak terurut`)
  }
  for (const [id, a] of Object.entries(m.faseAktif ?? {})) {
    if (m.fase?.[id]) g.push(`faseAktif ${id}: id sama dengan fase merged`)
    if (!daftarSah(a?.izin, { kosongBoleh: false }) || !daftarSah(a?.jangkar, { kosongBoleh: false })) g.push(`faseAktif ${id}: izin/jangkar kosong atau bukan path persis`)
    else if (!a.jangkar.every((p) => a.izin.includes(p))) g.push(`faseAktif ${id}: jangkar di luar izin`)
  }
  const i1 = m.i1
  if (!i1 || !daftarSah(i1.akar, { kosongBoleh: false }) || typeof i1.sasaran !== 'string' || !i1.sasaran.endsWith('/') || !tanpaPola(i1.sasaran.slice(0, -1)) || !daftarSah(i1.diizinkan)) g.push('i1 tidak sah')
  if (!m.i2 || typeof m.i2 !== 'object' || Object.keys(m.i2).length === 0) g.push('i2 kosong')
  for (const [p, b] of Object.entries(m.i2 ?? {})) if (!tanpaPola(p) || !SHA40.test(b ?? '')) g.push(`i2 ${p}: path/blob tidak sah`)
  const pg = m.pGlobal
  if (!pg || !daftarSah(pg.persis) || !daftarSah(pg.tambahSaja) || !Array.isArray(pg.awalan) || !pg.awalan.every((a) => typeof a === 'string' && a.length > 0 && !/[*?{}\\]/.test(a) && !a.startsWith('/') && !a.split('/').some((seg) => seg === '.' || seg === '..'))) g.push('pGlobal tidak sah')
  if (!Array.isArray(m.pengecualian)) g.push('pengecualian bukan array')
  for (const e of m.pengecualian ?? []) if (!SHA40.test(e?.basis ?? '') || !tanpaPola(e?.path) || !SHA40.test(e?.blob ?? '') || Object.keys(e).length !== 3) g.push(`pengecualian ${e?.path}: harus tepat {basis, path, blob}`)
  return g
}

export function muatManifest(akar, rel = JALUR_MANIFEST) {
  let m
  try {
    m = JSON.parse(readFileSync(join(akar, rel), 'utf8'))
  } catch (e) {
    return { m: null, galat: [`manifest tidak dapat dibaca/diurai: ${e.message}`] }
  }
  return { m, galat: validasiManifest(m) }
}

// ============================================================================ H

export function periksaRekaman(akar, id, f) {
  const nm = (s) => `H ${id} (PR #${f?.pr}): ${s}`
  if (!f) return [{ nama: `H ${id}: tercatat di manifest`, ok: false, detail: 'fase tidak ada di manifest' }]
  const hilang = ['merge', 'basis', 'kepala'].filter((k) => !adaCommit(akar, f[k]))
  if (hilang.length) return [{ nama: nm('commit tercatat tersedia'), ok: false, detail: `riwayat tidak tersedia (${hilang.join(', ')}) — clone dangkal/terpotong? GAGAL TERTUTUP` }]
  const p1 = git(akar, ['rev-parse', `${f.merge}^1`], { boleh: true })?.trim()
  const p2 = git(akar, ['rev-parse', '--verify', '--quiet', `${f.merge}^2`], { boleh: true })?.trim()
  const hasil = [{ nama: nm('merge = commit merge dengan induk basis & kepala tercatat'), ok: p1 === f.basis && p2 === f.kepala, detail: `^1=${p1?.slice(0, 12) ?? '-'} ^2=${p2?.slice(0, 12) ?? 'TIDAK ADA'}` }]
  const t = (r) => git(akar, ['rev-parse', `${r}^{tree}`]).trim()
  hasil.push({ nama: nm('tree merge = tree kepala (merge tanpa perubahan tambahan)'), ok: t(f.merge) === t(f.kepala) })
  const d = daftarDiff(akar, f.basis, f.kepala)
  const lebih = d.filter((x) => !f.berkas.includes(x))
  const kurang = f.berkas.filter((x) => !d.includes(x))
  hasil.push({ nama: nm('diff basis→kepala SAMA PERSIS dengan manifest (tidak kosong)'), ok: d.length > 0 && lebih.length === 0 && kurang.length === 0, detail: `${d.length} berkas${lebih.length ? `; lebih: ${lebih.join(', ')}` : ''}${kurang.length ? `; kurang: ${kurang.join(', ')}` : ''}` })
  return hasil
}

// ============================================================================ P

export function tentukanBasis(akar, env = {}) {
  const head = git(akar, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { boleh: true })?.trim()
  if (!head) return { ok: false, alasan: 'HEAD tidak ada' }
  if (env.WA2A_BASIS !== undefined && env.WA2A_BASIS !== '') {
    const b = env.WA2A_BASIS
    if (!SHA40.test(b)) return { ok: false, alasan: `WA2A_BASIS harus SHA 40-hex (diberikan "${b}")` }
    if (!adaCommit(akar, b)) return { ok: false, alasan: `WA2A_BASIS ${b} bukan commit yang tersedia` }
    if (git(akar, ['merge-base', '--is-ancestor', b, head], { boleh: true }) === null) return { ok: false, alasan: `WA2A_BASIS ${b.slice(0, 12)} bukan leluhur HEAD` }
    return { ok: true, sha: b, sumber: 'WA2A_BASIS', head }
  }
  const om = git(akar, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}'], { boleh: true })?.trim()
  if (!om) return { ok: false, alasan: 'ref refs/remotes/origin/main tidak ada (jalankan `git fetch origin main`)' }
  const mb = git(akar, ['merge-base', 'HEAD', om], { boleh: true })?.trim()
  if (!mb) return { ok: false, alasan: 'merge-base(HEAD, origin/main) tidak ditemukan' }
  return { ok: true, sha: mb, sumber: `merge-base(HEAD, origin/main=${om.slice(0, 12)})`, head, originMain: om }
}

/** Perubahan working tree terhadap basis: ter-commit + staged + unstaged (termasuk hapus; rename = hapus + tambah) + untracked. */
export function himpunanPerubahan(akar, basis) {
  const berubah = daftarDiff(akar, basis)
  const untracked = daftarUntracked(akar)
  return { berubah, untracked, semua: [...new Set([...berubah, ...untracked])].sort() }
}

export const pengecualianCocok = (m, basis, rel, akar) => {
  const b = blobBerkas(akar, rel)
  return b !== null && (m.pengecualian ?? []).some((e) => e.basis === basis && e.path === rel && e.blob === b)
}

export const terlarangGlobal = (m, rel) => m.pGlobal.awalan.some((a) => rel.startsWith(a)) || m.pGlobal.persis.includes(rel) || Object.hasOwn(m.i2, rel)

export function periksaPGlobal(akar, m, basis, semua) {
  const sentuh = semua.filter((f) => terlarangGlobal(m, f))
  const bocor = sentuh.filter((f) => !pengecualianCocok(m, basis, f, akar))
  const hasil = [{ nama: 'P-global: tidak ada berkas beku berubah/baru/terhapus di luar pengecualian (basis, path, blob)', ok: bocor.length === 0, detail: bocor.join(', ') || `${semua.length} berkas berubah; ${sentuh.length} beku, semuanya berpengecualian sah` }]
  const tambahBocor = []
  for (const f of m.pGlobal.tambahSaja) {
    if (!semua.includes(f) || pengecualianCocok(m, basis, f, akar)) continue
    if (!existsSync(join(akar, f))) { tambahBocor.push(`${f} (terhapus)`); continue }
    const d = git(akar, ['diff', '--no-renames', '-U0', basis, '--', f])
    if (/^-(?!--)/m.test(d)) tambahBocor.push(f)
  }
  hasil.push({ nama: 'P-global: berkas tambah-saja tidak kehilangan baris terhadap basis', ok: tambahBocor.length === 0, detail: tambahBocor.join(', ') || m.pGlobal.tambahSaja.join(', ') })
  return hasil
}

// ============================================================================ I-1 (impor transitif)

/**
 * Buang komentar dan isi string, KECUALI string yang menjadi specifier impor (sesudah `from`, `import`,
 * `import(`, `require(`). Mengembalikan specifier literal dan jumlah `import(`/`require(` non-literal (tak terselesaikan).
 * Batas: tidak mem-parse regex literal (`/'/` dapat mengacaukan), template `${}` dalam specifier dihitung
 * dinamis, pemuatan lewat fs/eval/alias non-tsconfig tidak terdeteksi.
 */
export function ekstrakSpecifier(src) {
  const spec = []
  let dinamis = 0
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2)
      i = j < 0 ? n : j + 2
      out += ' '
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++
        else if (c !== '`' && src[j] === '\n') break
        j++
      }
      const isi = src.slice(i + 1, j)
      const sebelum = out.slice(-40)
      const panggil = /(?:^|[^\w$.])(?:import|require)\s*\(\s*$/.test(sebelum)
      if (panggil || /(?:^|[^\w$.])(?:from|import)\s*$/.test(sebelum)) {
        let k = j + 1
        while (k < n && /\s/.test(src[k])) k++
        // import('@/' + x) / require(a + b) = specifier terhitung, bukan literal utuh.
        const literalUtuh = !panggil || src[k] === ')' || src[k] === ','
        if ((c === '`' && isi.includes('${')) || !literalUtuh) dinamis++
        else spec.push(isi)
      }
      out += `${c}${c}`
      i = j + 1
      continue
    }
    out += c
    i++
  }
  dinamis += [...out.matchAll(/(?:^|[^\w$.])import\s*\(\s*(?!['"`])/g)].length
  return { spec, dinamis }
}

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

function jelajahSrc(akar, rel = 'src', hasil = []) {
  const abs = join(akar, rel)
  if (!existsSync(abs)) return hasil
  for (const d of readdirSync(abs, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name.startsWith('.')) continue
    const p = `${rel}/${d.name}`
    if (d.isDirectory()) jelajahSrc(akar, p, hasil)
    else if (EKSTENSI.some((e) => d.name.endsWith(e))) hasil.push(p)
  }
  return hasil
}

/**
 * Berkas di bawah `akarPindai` yang mencapai `sasaran` lewat impor langsung atau perantara.
 * Keterjangkauan dihitung sekali dengan BFS mundur dari sasaran pada grafik impor (aman untuk siklus, tidak
 * bergantung pada urutan impor atau urutan pemindaian); rantai = jalur terpendek, tetangga diurutkan
 * (deterministik). Setiap simpul dikunjungi paling banyak sekali per BFS, sehingga penelusuran selalu berhenti.
 */
export function perujukTransitif(akar, akarPindai, sasaran) {
  const berkas = jelajahSrc(akar).sort()
  const keluar = new Map()
  let dinamis = 0
  for (const f of berkas) {
    const e = ekstrakSpecifier(readFileSync(join(akar, f), 'utf8'))
    if (akarPindai.some((a) => f.startsWith(`${a}/`))) dinamis += e.dinamis
    keluar.set(f, [...new Set(e.spec.map((s) => selesaikan(akar, f, s)).filter(Boolean))].sort())
  }
  const kena = (f) => f.startsWith(sasaran)
  const masuk = new Map()
  for (const [f, tujuan] of keluar) for (const g of tujuan) (masuk.get(g) ?? masuk.set(g, []).get(g)).push(f)
  const jangkau = new Set()
  const antre = [...new Set([...berkas, ...masuk.keys()])].filter(kena)
  for (const t of antre) jangkau.add(t)
  for (let i = 0; i < antre.length; i++) {
    for (const f of masuk.get(antre[i]) ?? []) {
      if (!jangkau.has(f)) {
        jangkau.add(f)
        antre.push(f)
      }
    }
  }
  const rantaiTerpendek = (awal) => {
    const asal = new Map([[awal, null]])
    const q = [awal]
    for (let i = 0; i < q.length; i++) {
      const f = q[i]
      if (kena(f)) {
        const jalur = []
        for (let x = f; x !== null; x = asal.get(x)) jalur.unshift(x)
        return jalur
      }
      for (const g of keluar.get(f) ?? []) {
        if (jangkau.has(g) && !asal.has(g)) {
          asal.set(g, f)
          q.push(g)
        }
      }
    }
    return null
  }
  const perujuk = {}
  for (const f of berkas.filter((x) => akarPindai.some((a) => x.startsWith(`${a}/`)) && !kena(x) && jangkau.has(x))) perujuk[f] = rantaiTerpendek(f)
  return { perujuk, dinamis, dipindai: berkas.length }
}

// ============================================================================ lapis gabungan

export function periksaModeFase(m, env, semua) {
  const id = env.WA2A_FASE
  if (id === undefined || id === '') return { hasil: [], info: 'mode bawaan: lingkup fase aktif TIDAK diklaim (set WA2A_FASE=<id> untuk bukti PR fase)' }
  if (m.fase[id]) return { hasil: [{ nama: `P-fase ${id}: fase aktif`, ok: false, detail: 'fase sudah tercatat merged di manifest H' }] }
  const a = (m.faseAktif ?? {})[id]
  if (!a) return { hasil: [{ nama: `P-fase ${id}: fase aktif`, ok: false, detail: 'id tidak dikenal di faseAktif manifest' }] }
  const luar = semua.filter((p) => !a.izin.includes(p))
  const hilang = a.jangkar.filter((p) => !semua.includes(p))
  return {
    hasil: [
      { nama: `P-fase ${id}: semua perubahan di dalam allowlist persis`, ok: luar.length === 0, detail: luar.join(', ') || `${semua.length} berkas` },
      { nama: `P-fase ${id}: berkas jangkar ada di perubahan`, ok: hilang.length === 0, detail: hilang.join(', ') || a.jangkar.join(', ') },
    ],
  }
}

/**
 * Jalankan I/H/P. `fase` = id fase merged yang rekaman H-nya diperiksa uji pemanggil.
 * Mengembalikan { hasil: [{nama, ok, detail}], info: [string], manifest, basis, perubahan }.
 */
export function lapisLingkup(akar, { fase = [], env = {}, manifest = null } = {}) {
  const hasil = []
  const info = []
  const mm = manifest ? { m: manifest, galat: validasiManifest(manifest) } : muatManifest(akar)
  hasil.push({ nama: 'manifest lingkup sah (skema, SHA 40-hex, path persis tanpa pola)', ok: mm.galat.length === 0, detail: mm.galat.join('; ') || JALUR_MANIFEST })
  if (mm.galat.length) return { hasil, info, manifest: null }
  const m = mm.m
  for (const id of fase) hasil.push(...periksaRekaman(akar, id, m.fase[id]))

  const b = tentukanBasis(akar, env)
  hasil.push({ nama: 'P: basis perubahan berjalan ditentukan (gagal tertutup)', ok: b.ok, detail: b.ok ? `${b.sha.slice(0, 12)} — ${b.sumber}` : b.alasan })
  let perubahan = null
  if (b.ok) {
    perubahan = himpunanPerubahan(akar, b.sha)
    hasil.push(...periksaPGlobal(akar, m, b.sha, perubahan.semua))
    const mf = periksaModeFase(m, env, perubahan.semua)
    hasil.push(...mf.hasil)
    if (mf.info) info.push(mf.info)
  }

  const t = perujukTransitif(akar, m.i1.akar, m.i1.sasaran)
  const ditemukan = Object.keys(t.perujuk).sort()
  const liar = ditemukan.filter((f) => !m.i1.diizinkan.includes(f))
  const hilang = m.i1.diizinkan.filter((f) => !ditemukan.includes(f))
  hasil.push({ nama: `I-1: perujuk ${m.i1.sasaran} dari ${m.i1.akar.join(' & ')} (langsung/transitif) = PERSIS daftar disetujui`, ok: liar.length === 0 && hilang.length === 0, detail: [...liar.map((f) => `tak disetujui: ${t.perujuk[f].join(' → ')}`), ...hilang.map((f) => `disetujui tapi tak merujuk: ${f}`)].join('; ') || `${ditemukan.length} perujuk; ${t.dipindai} berkas src dipindai` })
  if (t.dinamis) info.push(`I-1: ${t.dinamis} import()/require() non-literal di ${m.i1.akar.join('/')} — tidak dapat diselesaikan statis`)

  const beda = Object.entries(m.i2).filter(([p, h]) => blobBerkas(akar, p) !== h).map(([p]) => `${p}${existsSync(join(akar, p)) ? '' : ' (hilang)'}`)
  hasil.push({ nama: `I-2: ${Object.keys(m.i2).length} berkas beku = blob Git tercatat`, ok: beda.length === 0, detail: beda.join(', ') || 'semua cocok' })

  const bukti = env.WA2A_BUKTI
  if (bukti !== undefined && bukti !== '') {
    const kotor = baris(git(akar, ['status', '--porcelain=v1', '--untracked-files=all']))
    hasil.push({ nama: 'mode bukti: WA2A_BUKTI=1 dan working tree bersih', ok: bukti === '1' && kotor.length === 0, detail: bukti !== '1' ? `nilai tidak sah "${bukti}"` : kotor.length ? `${kotor.length} entri: ${kotor.slice(0, 5).join(' | ')}` : 'bersih' })
    info.push(`bukti: HEAD=${b.head ?? '-'} basis=${b.sha ?? '-'} origin/main=${b.originMain ?? '-'} helper=${blobBerkas(akar, JALUR_HELPER)} manifest=${blobBerkas(akar, JALUR_MANIFEST)}`)
  }
  return { hasil, info, manifest: m, basis: b, perubahan }
}

export const cocokHimpunan = samaHimpunan
