// Uji STATIS + MURNI WA-2a Step 2F (F1) — mesin status pesan klien, freshness gagal tertutup,
// syarat data, definisi approval CLIENT_WA_UPDATE, maker-checker. Tanpa DB/jaringan.
//
// Jalankan: node prisma/check-wa2a-message-policy.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')
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
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const K = jiti('../src/services/whatsapp/wa2-policy.ts')
const M = jiti('../src/services/whatsapp/wa-message-policy.ts')
const D = jiti('../src/services/whatsapp/wa-approval-def.ts')
const TAH = jiti('../src/services/tah/tah-policy.ts')
const REG = jiti('../src/services/tah/registry.ts')
const { PERAN_AUTOMATION } = jiti('../src/services/automation/gate.ts')
// Hanya untuk uji keselarasan kosakata (uji ini bukan kode aplikasi).
const WA1 = jiti('../src/services/communication/comm-policy.ts')

const tanpaKomentar = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const kodeLempar = (fn) => {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

// ============================================================================ P1
bagian('[P1] Mesin status WaClientMessage')
const S = [...K.STATUS_PESAN_KLIEN]
const HARAP = {
  DRAFT: ['PREVIEWED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  PREVIEWED: ['PENDING_APPROVAL', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  APPROVED: ['NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  NEEDS_REVIEW: ['BLOCKED', 'CANCELED'],
  EXPIRED: [],
  REJECTED: [],
  BLOCKED: [],
  CANCELED: [],
}
cek('tabel transisi mencakup PERSIS seluruh STATUS_PESAN_KLIEN', Object.keys(K.TRANSISI_PESAN_KLIEN).sort().join() === [...S].sort().join())
let matriksCocok = true
for (const dari of S) for (const ke of S) if (M.transisiPesanKlienSah(dari, ke) !== HARAP[dari].includes(ke)) matriksCocok = false
cek('matriks 9×9 transisi = spesifikasi F1 (setiap pasangan)', matriksCocok)
cek('tujuan transisi selalu status yang dikenal', Object.values(K.TRANSISI_PESAN_KLIEN).flat().every((s) => S.includes(s)))
cek('status terminal (EXPIRED/REJECTED/BLOCKED/CANCELED) tanpa transisi keluar', K.STATUS_PESAN_KLIEN_TERMINAL.every((s) => K.TRANSISI_PESAN_KLIEN[s].length === 0) && K.STATUS_PESAN_KLIEN_TERMINAL.every((s) => M.pesanKlienTerminal(s)))
cek('APPROVED & NEEDS_REVIEW BUKAN terminal (activeKey tetap dipegang)', !M.pesanKlienTerminal('APPROVED') && !M.pesanKlienTerminal('NEEDS_REVIEW') && !M.pesanKlienTerminal('DRAFT'))
cek('konsisten dengan penahanan 2a-C/2a-E: setiap STATUS_PESAN_DAPAT_DITAHAN → NEEDS_REVIEW sah', K.STATUS_PESAN_DAPAT_DITAHAN.every((s) => M.transisiPesanKlienSah(s, 'NEEDS_REVIEW')))
cek('STATUS_PESAN_DAPAT_DITAHAN = PERSIS status non-terminal selain NEEDS_REVIEW', [...K.STATUS_PESAN_DAPAT_DITAHAN].sort().join() === S.filter((s) => !M.pesanKlienTerminal(s) && s !== 'NEEDS_REVIEW').sort().join())
cek('tak ada transisi kembali ke DRAFT (snapshot immutable; pemulihan = revisi baru)', S.every((s) => !M.transisiPesanKlienSah(s, 'DRAFT')))
cek('APPROVED hanya dicapai dari PENDING_APPROVAL', S.filter((s) => M.transisiPesanKlienSah(s, 'APPROVED')).join() === 'PENDING_APPROVAL')
cek('PENDING_APPROVAL hanya dicapai dari PREVIEWED (preview wajib sebelum approval)', S.filter((s) => M.transisiPesanKlienSah(s, 'PENDING_APPROVAL')).join() === 'PREVIEWED')
cek('REJECTED & EXPIRED hanya dari PENDING_APPROVAL', ['REJECTED', 'EXPIRED'].every((t) => S.filter((s) => M.transisiPesanKlienSah(s, t)).join() === 'PENDING_APPROVAL'))
cek('tak ada state kirim di 2a-F (berhenti di APPROVED)', !S.some((s) => /SEND|SENT|QUEUED|DELIVER/.test(s)))
cek('status/tujuan tak dikenal atau bukan teks → tidak sah', !M.transisiPesanKlienSah('DRAFT', 'SENT') && !M.transisiPesanKlienSah('X', 'DRAFT') && !M.transisiPesanKlienSah(null, 'PREVIEWED') && !M.transisiPesanKlienSah('DRAFT', undefined) && !M.statusPesanKlienSah('draft'))
cek('periksaTransisiPesanKlien: sah → ok; terlarang → MESSAGE_TRANSITION_FORBIDDEN; tak dikenal → MESSAGE_STATE_INVALID',
  M.periksaTransisiPesanKlien('DRAFT', 'PREVIEWED').ok === true &&
  M.periksaTransisiPesanKlien('DRAFT', 'APPROVED').alasan === 'MESSAGE_TRANSITION_FORBIDDEN' &&
  M.periksaTransisiPesanKlien('DRAFT', 'FAKE_SENT').alasan === 'MESSAGE_STATE_INVALID')
cek('tabel transisi beku pada tipe (readonly) — tak ada mutasi di modul', !/TRANSISI_PESAN_KLIEN\[[^\]]+\]\s*=|\.push\(/.test(tanpaKomentar(baca('src/services/whatsapp/wa-message-policy.ts'))))

// ============================================================================ P2
bagian('[P2] Kode alasan')
const KODE = [...K.KODE_ALASAN_WA2F]
cek('kode alasan unik & berformat SCREAMING_SNAKE', new Set(KODE).size === KODE.length && KODE.every((k) => /^[A-Z][A-Z0-9_]+$/.test(k)))
const kodeTah = ['SYSTEM_CONTEXT_FORBIDDEN', 'ROLE_NOT_ALLOWED', 'SELF_APPROVAL_FORBIDDEN']
cek('kode otorisasi TAH beku tercakup (dipetakan apa adanya)', kodeTah.every((k) => KODE.includes(k)))

// ============================================================================ P3
bagian('[P3] Freshness — gagal tertutup tanpa aturan disetujui')
cek('ATURAN_FRESHNESS_DISETUJUI kosong & beku', Object.keys(K.ATURAN_FRESHNESS_DISETUJUI).length === 0 && Object.isFrozen(K.ATURAN_FRESHNESS_DISETUJUI))
cek('kosakata keluarga = kosakata pilot WA-1 (KELUARGA_EVENT)', [...K.KELUARGA_PESAN_KLIEN].join() === [...WA1.KELUARGA_EVENT].join())
cek('setiap keluarga punya medan waktu (ETA/ETD atau waktu milestone)', K.KELUARGA_PESAN_KLIEN.every((k) => K.MEDAN_WAKTU_PER_KELUARGA[k].length > 0) && K.MEDAN_WAKTU_PER_KELUARGA.SCHEDULE_CHANGE.join() === 'eta,etd')
const verdict = K.KELUARGA_PESAN_KLIEN.map((k) => M.penilaianFreshness(k))
cek('empat keluarga → GAGAL_TERTUTUP / FRESHNESS_RULE_MISSING / aturan null', verdict.every((v) => v.status === 'GAGAL_TERTUTUP' && v.alasan === 'FRESHNESS_RULE_MISSING' && v.aturan === null && v.versi === 1))
cek('keluarga tak dikenal / bukan teks → tetap GAGAL_TERTUTUP (tanpa medan)', ['NOR_TENDERED', '', null, 42].every((k) => { const v = M.penilaianFreshness(k); return v.status === 'GAGAL_TERTUTUP' && v.medan.length === 0 }))
cek('verdict dapat diserialisasi JSON (kolom freshnessVerdict NOT NULL) tanpa kehilangan medan', verdict.every((v) => JSON.stringify(JSON.parse(JSON.stringify(v))) === JSON.stringify(v)))
cek('kode verdict ⊆ KODE_ALASAN_WA2F', verdict.every((v) => KODE.includes(v.alasan)))
cek('tak ada ambang waktu/angka bawaan di modul freshness', !/\b\d+\s*\*\s*(60|3600|1000)|MENIT|JAM_MAKS|ambang\s*=/.test(tanpaKomentar(baca('src/services/whatsapp/wa-message-policy.ts'))))

// ============================================================================ P4
bagian('[P4] Syarat data — NYATA bukan satu-satunya verifikasi')
const lolosF = { status: 'LOLOS' }
cek('NYATA saja (tanpa revalidasi & freshness) → DITOLAK', M.syaratDataApproval({ dataOrigin: 'NYATA', sumberTervalidasi: undefined, freshness: null }).ok === false)
cek('NYATA + sumber tervalidasi + freshness GAGAL_TERTUTUP → FRESHNESS_RULE_MISSING', M.syaratDataApproval({ dataOrigin: 'NYATA', sumberTervalidasi: true, freshness: M.penilaianFreshness('EOSP') }).alasan === 'FRESHNESS_RULE_MISSING')
cek('NYATA + freshness LOLOS tanpa revalidasi sumber → SOURCE_NOT_REVALIDATED', M.syaratDataApproval({ dataOrigin: 'NYATA', sumberTervalidasi: false, freshness: lolosF }).alasan === 'SOURCE_NOT_REVALIDATED')
cek('SEED / UJI / NULL / teks lain → DATA_ORIGIN_INSUFFICIENT walau syarat lain terpenuhi', ['SEED', 'UJI', null, undefined, 'nyata'].every((o) => M.syaratDataApproval({ dataOrigin: o, sumberTervalidasi: true, freshness: lolosF }).alasan === 'DATA_ORIGIN_INSUFFICIENT'))
cek('sumberTervalidasi harus PERSIS true (bukan truthy)', M.syaratDataApproval({ dataOrigin: 'NYATA', sumberTervalidasi: 'true', freshness: lolosF }).alasan === 'SOURCE_NOT_REVALIDATED')
cek('ketiga syarat terpenuhi → ok (jalur ini tak tercapai selama tak ada aturan freshness disetujui)', M.syaratDataApproval({ dataOrigin: 'NYATA', sumberTervalidasi: true, freshness: lolosF }).ok === true && !verdict.some((v) => v.status === 'LOLOS'))

// ============================================================================ P5
bagian('[P5] Definisi approval CLIENT_WA_UPDATE')
const J = D.JENIS_APPROVAL_WA_KLIEN
cek('kind CLIENT_WA_UPDATE, EXTERNAL_COMMUNICATION, setujuSendiri false, TTL 2 jam, ADMIN+MANAJER_OPERASI, tak bisa disunting, non-produksi',
  J.kind === 'CLIENT_WA_UPDATE' && J.risiko === 'EXTERNAL_COMMUNICATION' && J.setujuSendiri === false && J.kedaluwarsaJam === 2 && J.peranWajib.join() === 'ADMIN,MANAJER_OPERASI' && J.bisaDiedit === false && J.hanyaNonProduksi === true)
cek('selaras konstanta wa2-policy (kind & TTL)', J.kind === K.JENIS_APPROVAL_PESAN_KLIEN && J.kedaluwarsaJam === K.TTL_APPROVAL_PESAN_KLIEN_JAM && K.TTL_APPROVAL_PESAN_KLIEN_JAM === 2)
cek('definisi & daftar peran beku; mutasi melempar TypeError', Object.isFrozen(J) && Object.isFrozen(J.peranWajib) && kodeLempar(() => { 'use strict'; J.setujuSendiri = true }) !== null && J.setujuSendiri === false && kodeLempar(() => J.peranWajib.push('OPERATOR')) !== null)
cek('validasiRegistry BEKU menerima definisi (0 galat)', TAH.validasiRegistry([], [J], PERAN_AUTOMATION).length === 0)
const ditolakReg = (nama, ubah, pola) => {
  const g = TAH.validasiRegistry([], [{ ...J, ...ubah }], PERAN_AUTOMATION)
  cek(`validasiRegistry BEKU menolak varian: ${nama}`, g.some((x) => pola.test(x)), g.join('; ') || '(tak ada galat)')
}
ditolakReg('setujuSendiri true (melonggarkan D9)', { setujuSendiri: true }, /lebih longgar/)
ditolakReg('TTL 0 jam', { kedaluwarsaJam: 0 }, /kedaluwarsaJam/)
ditolakReg('TTL 721 jam', { kedaluwarsaJam: 721 }, /kedaluwarsaJam/)
ditolakReg('TTL null (tanpa kedaluwarsa)', { kedaluwarsaJam: null }, /kedaluwarsaJam/)
ditolakReg('peran di luar Automation Hub', { peranWajib: ['ADMIN', 'OPERATOR'] }, /peranWajib/)
ditolakReg('kelas risiko asing', { risiko: 'SUPER_SAFE' }, /kelas risiko/)
cek('kebijakan beku: EXTERNAL_COMMUNICATION tak pernah boleh setuju-sendiri', TAH.SETUJU_SENDIRI_BAWAAN.EXTERNAL_COMMUNICATION === false && TAH.setujuSendiriEfektif('EXTERNAL_COMMUNICATION', true) === false)
cek('jenisBolehDiLingkungan BEKU: ditolak di production, boleh di development/test', !TAH.jenisBolehDiLingkungan(J, 'production') && TAH.jenisBolehDiLingkungan(J, 'development') && TAH.jenisBolehDiLingkungan(J, 'test'))
cek('jenisWaKlien(production) → APPROVAL_ENV_NOT_ALLOWED; test/development → definisi yang sama', D.jenisWaKlien('production').alasan === 'APPROVAL_ENV_NOT_ALLOWED' && D.jenisWaKlien('test').nilai === J && D.jenisWaKlien('development').nilai === J)
cek('registry TAH tetap utuh: JENIS_APPROVAL_TAH hanya TAH_DEV_NOOP; WA-1 tetap WA_INTERNAL_FAKE_TEST (dibaca, tidak diubah)', REG.JENIS_APPROVAL_TAH.map((j) => j.kind).join() === 'TAH_DEV_NOOP' && REG.JENIS_APPROVAL_WA_FAKE.kind === 'WA_INTERNAL_FAKE_TEST')
cek('kind tidak bertabrakan dengan registry TAH maupun definisi WA-1', !REG.JENIS_APPROVAL_TAH.some((j) => j.kind === J.kind) && REG.JENIS_APPROVAL_WA_FAKE.kind !== J.kind)

// ============================================================================ P6
bagian('[P6] Turunan approval — tidak berasal dari input pengguna')
const t0 = new Date('2026-10-11T08:00:00.000Z')
const tr = D.turunanApprovalWaKlien(J, t0)
cek('expiresAt = waktu permintaan + TEPAT 2 jam (7.200.000 ms)', tr.expiresAt.getTime() - t0.getTime() === 7_200_000)
cek('kind/actionRisk/requiredRoles/subjectType dari definisi', tr.kind === 'CLIENT_WA_UPDATE' && tr.actionRisk === 'EXTERNAL_COMMUNICATION' && tr.requiredRoles.join() === 'ADMIN,MANAJER_OPERASI' && tr.subjectType === 'WaClientMessage')
cek('signature hanya (definisi, jam server) — tanpa parameter input', D.turunanApprovalWaKlien.length === 2 && /export function turunanApprovalWaKlien\(j: DefinisiApprovalWaKlien, sekarang: Date\): TurunanApprovalWaKlien/.test(baca('src/services/whatsapp/wa-approval-def.ts')))
const jahat = { kind: 'TAH_DEV_NOOP', actionRisk: 'INTERNAL_WRITE', requiredRoles: ['OPERATOR'], expiresAt: new Date('2099-01-01'), subjectType: 'X' }
const trJahat = D.turunanApprovalWaKlien(J, t0, jahat)
cek('argumen tambahan bergaya input diabaikan sepenuhnya', JSON.stringify(trJahat) === JSON.stringify(tr))
cek('definisi tiruan (salinan objek, bahkan isi sama) DITOLAK — hanya objek definisi beku', kodeLempar(() => D.turunanApprovalWaKlien({ ...J }, t0)) !== null && kodeLempar(() => D.turunanApprovalWaKlien({ ...J, kedaluwarsaJam: 720 }, t0)) !== null)
cek('jam tidak sah → Error', kodeLempar(() => D.turunanApprovalWaKlien(J, new Date('x'))) !== null && kodeLempar(() => D.turunanApprovalWaKlien(J, '2026-10-11')) !== null)
cek('requiredRoles salinan (mutasi hasil tak mengubah definisi)', (() => { const x = D.turunanApprovalWaKlien(J, t0); x.requiredRoles.push('OPERATOR'); return J.peranWajib.length === 2 })())
const kodeDef = tanpaKomentar(baca('src/services/whatsapp/wa-approval-def.ts'))
cek('modul definisi tak membaca input/env: tanpa process.env, `input`, req/body', !/process\.env|\binput\b|\breq\b|\bbody\b/.test(kodeDef))

// ============================================================================ P7
bagian('[P7] Baris approval & kedaluwarsa')
const baris = { kind: 'CLIENT_WA_UPDATE', actionRisk: 'EXTERNAL_COMMUNICATION', requiredRoles: ['MANAJER_OPERASI', 'ADMIN'], subjectType: 'WaClientMessage', subjectId: 'm1', expiresAt: tr.expiresAt }
cek('baris turunan definisi → sah (urutan peran bebas)', D.cekBarisApprovalWaKlien(baris, J).ok === true)
const salah = [
  ['kind WA-1', { kind: 'WA_INTERNAL_FAKE_TEST' }],
  ['kind TAH', { kind: 'TAH_DEV_NOOP' }],
  ['kelas INTERNAL_WRITE', { actionRisk: 'INTERNAL_WRITE' }],
  ['peran ditambah OPERATOR', { requiredRoles: ['ADMIN', 'MANAJER_OPERASI', 'OPERATOR'] }],
  ['peran dikurangi', { requiredRoles: ['ADMIN'] }],
  ['subjek pesan WA-1', { subjectType: 'CommunicationMessage' }],
  ['subjectId kosong', { subjectId: '' }],
  ['subjectId null', { subjectId: null }],
  ['tanpa expiresAt (NULL-TTL)', { expiresAt: null }],
  ['expiresAt tidak sah', { expiresAt: new Date('x') }],
]
for (const [nama, ubah] of salah) cek(`baris menyimpang (${nama}) → APPROVAL_POLICY_MISMATCH`, D.cekBarisApprovalWaKlien({ ...baris, ...ubah }, J).alasan === 'APPROVAL_POLICY_MISMATCH')
const exp = tr.expiresAt
cek('PENDING tepat pada expiresAt → kedaluwarsa (batas ≤, kebijakan beku)', D.approvalWaKlienKedaluwarsa({ status: 'PENDING', expiresAt: exp }, new Date(exp.getTime())) === true)
cek('PENDING 1 ms sebelum expiresAt → belum kedaluwarsa', D.approvalWaKlienKedaluwarsa({ status: 'PENDING', expiresAt: exp }, new Date(exp.getTime() - 1)) === false)
cek('status final tidak dihitung kedaluwarsa (APPROVED tetap final)', D.approvalWaKlienKedaluwarsa({ status: 'APPROVED', expiresAt: exp }, new Date(exp.getTime() + 1)) === false)

// ============================================================================ P8
bagian('[P8] Maker-checker')
const ck = (pemutus, peminta = 'u-minta', pembuatDraft = 'u-buat') => D.otorisasiCheckerWaKlien({ pemutus, peminta, pembuatDraft }, J)
cek('checker ADMIN (bukan pembuat/peminta) → boleh', ck({ userId: 'u-cek', role: 'ADMIN' }).ok === true)
cek('checker MANAJER_OPERASI (bukan pembuat/peminta) → boleh', ck({ userId: 'u-cek', role: 'MANAJER_OPERASI' }).ok === true)
cek('peminta approval = checker → SELF_APPROVAL_FORBIDDEN (kebijakan TAH beku)', ck({ userId: 'u-minta', role: 'ADMIN' }).alasan === 'SELF_APPROVAL_FORBIDDEN')
cek('pembuat draft = checker → CHECKER_IS_MAKER', ck({ userId: 'u-buat', role: 'ADMIN' }).alasan === 'CHECKER_IS_MAKER')
cek('pembuat draft sekaligus peminta = checker → ditolak', ck({ userId: 'u-x', role: 'MANAJER_OPERASI' }, 'u-x', 'u-x').ok === false)
cek('staf yang hanya mempratinjau BOLEH menjadi checker (tak ada pemeriksaan previewer)', ck({ userId: 'u-pratinjau', role: 'ADMIN' }).ok === true && !/previewed|pratinjauOleh|previewer/i.test(kodeDef.slice(kodeDef.indexOf('export function otorisasiCheckerWaKlien'))))
cek('peran OPERATOR → ROLE_NOT_ALLOWED', ck({ userId: 'u-cek', role: 'OPERATOR' }).alasan === 'ROLE_NOT_ALLOWED')
cek('konteks sistem (meski ADMIN) → SYSTEM_CONTEXT_FORBIDDEN', ck({ userId: 'system', role: 'ADMIN', system: true }).alasan === 'SYSTEM_CONTEXT_FORBIDDEN')
cek('peminta atau pembuat tidak diketahui → APPROVAL_POLICY_MISMATCH (gagal tertutup)', [[null, 'u-buat'], ['u-minta', null], ['', 'u-buat'], ['u-minta', '']].every(([p, b]) => ck({ userId: 'u-cek', role: 'ADMIN' }, p, b).alasan === 'APPROVAL_POLICY_MISMATCH'))
cek('kode maker-checker ⊆ KODE_ALASAN_WA2F', ['SELF_APPROVAL_FORBIDDEN', 'CHECKER_IS_MAKER', 'ROLE_NOT_ALLOWED', 'SYSTEM_CONTEXT_FORBIDDEN', 'APPROVAL_POLICY_MISMATCH', 'APPROVAL_ENV_NOT_ALLOWED'].every((k) => KODE.includes(k)))
cek('urutan: kebijakan TAH beku (bolehMemutuskan) SEBELUM aturan pembuat draft', kodeDef.indexOf('bolehMemutuskan({') > 0 && kodeDef.indexOf('bolehMemutuskan({') < kodeDef.indexOf("tolak('CHECKER_IS_MAKER')"))

// ============================================================================ S1
bagian('[S1] Statis — modul F1 murni & tanpa ketergantungan WA-1')
const F1 = ['src/services/whatsapp/wa-message-policy.ts', 'src/services/whatsapp/wa-approval-def.ts']
const isiF1 = Object.fromEntries(F1.map((f) => [f, tanpaKomentar(baca(f))]))
cek('tanpa process.env / DB / jaringan / console di modul F1', F1.every((f) => !/process\.env|\$queryRaw|\$executeRaw|forTenant|@prisma\/client|fetch\(|node:(http|https|net|tls|dns)|console\./.test(isiF1[f])))
// Pemeriksaan berbasis RESOLUSI impor (termasuk impor relatif) — menutup celah regex teks.
const dirWa = join(AKAR, 'src/services/whatsapp')
const pengimporWa1 = []
for (const nama of readdirSync(dirWa).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const kode = tanpaKomentar(readFileSync(join(dirWa, nama), 'utf8'))
  for (const m of kode.matchAll(/\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)|\brequire\(\s*'([^']+)'\s*\)/g)) {
    const spec = m[1] ?? m[2] ?? m[3]
    const tujuan = spec.startsWith('@/') ? join(AKAR, 'src', spec.slice(2)) : spec.startsWith('.') ? resolve(dirWa, spec) : null
    if (tujuan && relative(AKAR, tujuan).split('\\').join('/').startsWith('src/services/communication')) pengimporWa1.push(`${nama} → ${spec}`)
  }
}
cek('F1: TIDAK ADA berkas src/services/whatsapp yang mengimpor modul WA-1 (resolusi impor, termasuk relatif)', pengimporWa1.length === 0, pengimporWa1.join(', '))
cek('impor modul F1 hanya: wa2-policy, tah-policy, registry TAH, gerbang Automation', F1.every((f) => [...isiF1[f].matchAll(/\bfrom\s+'([^']+)'/g)].every((m) => ['./wa2-policy', '../tah/tah-policy', '../tah/registry', '../automation/gate'].includes(m[1]))))
const pol = tanpaKomentar(baca('src/services/whatsapp/wa2-policy.ts'))
cek('wa2-policy.ts tetap DATA saja (tanpa impor, process.env, DB, jaringan)', !/^\s*import\s/m.test(pol) && !/process\.env|prisma|fetch\(/.test(pol))
cek('tanpa pembuat TahApprovalRequest / akses tabel di F1', F1.every((f) => !/tahApprovalRequest|waClientMessage|communicationCandidate|"WaClientMessage"/.test(isiF1[f])))

// ============================================================================ S2
bagian('[S2] Lingkup F1')
const berubah = execFileSync('git', ['diff', '--name-only', 'main'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const baru = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const BOLEH = new Set([
  'src/services/whatsapp/wa2-policy.ts',
  'src/services/whatsapp/wa-message-policy.ts',
  'src/services/whatsapp/wa-approval-def.ts',
  'prisma/check-wa2a-message-policy.mjs',
])
const semua = [...new Set([...berubah, ...baru])]
cek('hanya berkas F1 yang berubah/baru', semua.every((f) => BOLEH.has(f)), semua.join(', ') || '(bersih)')
const diffPolicy = execFileSync('git', ['diff', 'main', '--', 'src/services/whatsapp/wa2-policy.ts'], { cwd: AKAR, encoding: 'utf8' })
cek('wa2-policy.ts hanya ditambah (tanpa baris dihapus)', !/^-(?!--)/m.test(diffPolicy))

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
