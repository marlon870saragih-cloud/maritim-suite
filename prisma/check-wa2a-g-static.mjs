// Uji statis + murni WA-2a 2a-G (T1–T2) — API lokal pesan klien /api/automation/client-messages.
//
// Jalankan: node prisma/check-wa2a-g-static.mjs   (tanpa DB; uji HTTP: check-wa2a-g-api.mjs, produksi: check-wa2a-g-prod.mjs)
//           WA2A_FASE=G WA2A_BUKTI=1 node prisma/check-wa2a-g-static.mjs   (bukti lingkup PR 2a-G, tree bersih)
//
// Lapis:
//   R. route — PERSIS 10 berkas & metode yang disetujui; tipis (withTenant, tanpa tenantId/prisma/forTenant/env/
//      model WA-2a/TAH/WA-1); POST: gerbangWa2(ctx) pernyataan PERTAMA, sebelum jsonBodyKetat; GET tanpa body.
//   B. layanan baca — gerbang di setiap ekspor, read-only (tanpa tulis/SQL mentah/audit/env/jaringan/console),
//      nomor hanya lewat samarkanNomor, field internal tidak dipilih.
//   A. wa2-access & gerbang service baca (murni, tanpa DB) — allowlist/peran/sistem/flag/produksi.
//   N. tanpa Send — tidak ada route kirim, successKey, provider, webhook.
//   L. lingkup (prisma/wa2a-lingkup.mjs) — I/H/P + allowlist X-1 PERSIS (literal di sini, independen dari manifest).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { lapisLingkup } from './wa2a-lingkup.mjs'

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
const tanpaKomentar = (s) => s.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/[^\n]*/g, '$1')

const R = 'src/app/api/automation/client-messages/'
const RUTE = {
  [`${R}route.ts`]: ['GET', 'POST'],
  [`${R}candidates/signals/route.ts`]: ['GET'],
  [`${R}candidates/contacts/route.ts`]: ['GET'],
  [`${R}[id]/route.ts`]: ['GET'],
  [`${R}[id]/history/route.ts`]: ['GET'],
  [`${R}[id]/preview/route.ts`]: ['POST'],
  [`${R}[id]/request-approval/route.ts`]: ['POST'],
  [`${R}[id]/cancel/route.ts`]: ['POST'],
  [`${R}approvals/[id]/approve/route.ts`]: ['POST'],
  [`${R}approvals/[id]/reject/route.ts`]: ['POST'],
}
const SVC = 'src/services/whatsapp/wa-message-read.service.ts'
const AKSES = 'src/services/whatsapp/wa2-access.ts'
const IZIN_G = [
  'docs/TAH-CURRENT-CHECKPOINT.md', 'docs/whatsapp/WA-2a-G-EVIDENCE.md', 'prisma/check-wa2a-g-api.mjs', 'prisma/check-wa2a-g-prod.mjs',
  'prisma/check-wa2a-g-static.mjs', 'prisma/check-wa2a-lingkup.mjs', 'prisma/wa2a-lingkup-manifest.json', ...Object.keys(RUTE), SVC, AKSES,
].sort()

// ============================================================================ R
bagian('[R] Route API — persis, tipis, gerbang sebelum body')
function jelajah(dir) {
  const abs = join(AKAR, dir)
  let out = []
  for (const n of readdirSync(abs)) {
    const p = join(abs, n)
    if (statSync(p).isDirectory()) out = out.concat(jelajah(relative(AKAR, p)))
    else out.push(relative(AKAR, p).split('\\').join('/'))
  }
  return out
}
const ada = jelajah(R).sort()
cek('PERSIS 10 berkas route di bawah client-messages (tanpa berkas lain)', ada.join() === Object.keys(RUTE).sort().join(), `${ada.length} berkas`)

const IMPOR_BOLEH = new Set(['@/services/http', '@/services/whatsapp/wa2-gate', '@/services/whatsapp/wa-message.service', '@/services/whatsapp/wa-message-approval.service', '@/services/whatsapp/wa-message-read.service'])
const LARANG = [
  ['tenantId', /\btenantId\b/], ['prisma/@prisma', /prisma/i], ['forTenant', /forTenant/], ['process.env', /process\.env/],
  ['TAH (TahApprovalRequest/services/tah)', /TahApprovalRequest|tahApprovalRequest|services\/tah/], ['WA-1 (services/communication)', /services\/communication/],
  ['model WA-2a', /\.(waContact|waConsentState|waConsentEvent|waPrincipalAccessGrant|waPrincipalAccessGrantVoyage|waClientMessage|voyageScheduleConfirmation)\b|\bWa(Contact|ConsentState|ConsentEvent|PrincipalAccessGrant|ClientMessage)\b|VoyageScheduleConfirmation/],
  ['userId/role dari klien', /\b(userId|role|system)\s*:/], ['fetch/jaringan', /\bfetch\(|node:(http|https|net|tls|dns)/], ['console', /console\./],
  ['Send/kirim', /\bsend\w*\(|kirim\w*\(|successKey/i], ['getServerSession langsung', /getServerSession/],
]
const SERVICE_DIPANGGIL = {
  [`${R}route.ts`]: ['daftarPesanKlien', 'buatDraftPesanKlien'],
  [`${R}candidates/signals/route.ts`]: ['kandidatSinyalPesanKlien'],
  [`${R}candidates/contacts/route.ts`]: ['kandidatKontakPesanKlien'],
  [`${R}[id]/route.ts`]: ['detailPesanKlien'],
  [`${R}[id]/history/route.ts`]: ['riwayatPesanKlien'],
  [`${R}[id]/preview/route.ts`]: ['pratinjauPesanKlien'],
  [`${R}[id]/request-approval/route.ts`]: ['mintaApprovalPesanKlien'],
  [`${R}[id]/cancel/route.ts`]: ['batalkanPesanKlien'],
  [`${R}approvals/[id]/approve/route.ts`]: ['setujuiPesanKlien'],
  [`${R}approvals/[id]/reject/route.ts`]: ['tolakPesanKlien'],
}
/** Ambil badan handler `export const METODE = withTenant(async (...) => { ... })` (pencocokan kurung). */
function badanHandler(src, metode) {
  const i = src.search(new RegExp(`export const ${metode} = withTenant\\(async \\(`))
  if (i < 0) return null
  const buka = src.indexOf('{', src.indexOf('=>', i))
  let d = 0
  for (let j = buka; j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}' && --d === 0) return src.slice(buka + 1, j)
  }
  return null
}
for (const [rel, metode] of Object.entries(RUTE)) {
  const pendek = rel.slice(R.length) || 'route.ts'
  let src
  try {
    src = tanpaKomentar(baca(rel))
  } catch {
    cek(`${pendek}: ada`, false)
    continue
  }
  const impor = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
  const luar = impor.filter((s) => !IMPOR_BOLEH.has(s))
  cek(`${pendek}: impor hanya http/wa2-gate/service WA-2a (F3/F4/baca)`, luar.length === 0 && impor.includes('@/services/http'), luar.join(', ') || impor.length + ' impor')
  const ekspor = [...src.matchAll(/export\s+(?:const|function|async function)\s+(\w+)/g)].map((m) => m[1]).sort()
  cek(`${pendek}: ekspor PERSIS runtime, dynamic, ${metode.join('/')}`, ekspor.join() === ['dynamic', 'runtime', ...metode].sort().join(), ekspor.join())
  cek(`${pendek}: runtime nodejs + force-dynamic`, /export const runtime = 'nodejs'/.test(src) && /export const dynamic = 'force-dynamic'/.test(src))
  const kena = LARANG.filter(([, re]) => re.test(src)).map(([n]) => n)
  cek(`${pendek}: tanpa ${LARANG.map(([n]) => n).length} pola terlarang (tenant/peran dari sesi via withTenant)`, kena.length === 0, kena.join(', '))
  cek(`${pendek}: memanggil service yang disetujui (${SERVICE_DIPANGGIL[rel].join(', ')})`, SERVICE_DIPANGGIL[rel].every((f) => new RegExp(`\\b${f}\\(ctx,`).test(src)))
  for (const m of metode) {
    const b = badanHandler(src, m)
    if (m === 'GET') {
      cek(`${pendek} GET: tanpa pembacaan body (json/text/jsonBody*)`, b !== null && !/jsonBody|req\.(json|text|formData|arrayBuffer|body)\b/.test(b))
    } else {
      const k = b?.trim() ?? ''
      cek(`${pendek} POST: pernyataan PERTAMA = gerbangWa2(ctx)`, /^gerbangWa2\(ctx\)\s*\n/.test(k))
      const ig = k.indexOf('gerbangWa2(ctx)')
      const ib = k.indexOf('jsonBodyKetat(req)')
      cek(`${pendek} POST: jsonBodyKetat (CSRF + JSON + 16 KiB) tepat sekali, SESUDAH gerbang`, ig === 0 && ib > ig && k.split('jsonBodyKetat(').length === 2 && !/req\.(json|text)\b/.test(k))
      cek(`${pendek} POST: balasan = { ok: true, ...hasil service } (field \`hasil\` utuh)`, /return Response\.json\(\{ ok: true, \.\.\.h \}\)/.test(k))
    }
  }
}

// ============================================================================ B
bagian('[B] Layanan baca — gerbang, read-only, field allowlist')
const svc = tanpaKomentar(baca(SVC))
const eksporSvc = [...svc.matchAll(/export async function (\w+)\(([\s\S]*?)\)\s*:[\s\S]*?\{\n\s*([^\n]*)/g)].map((m) => [m[1], m[3].trim()])
cek('ekspor fungsi: daftar, detail, riwayat, kandidat sinyal & kontak', eksporSvc.map(([n]) => n).sort().join() === ['daftarPesanKlien', 'detailPesanKlien', 'kandidatKontakPesanKlien', 'kandidatSinyalPesanKlien', 'riwayatPesanKlien'].join())
for (const [n, pertama] of eksporSvc) cek(`${n}: pernyataan PERTAMA = gerbangWa2(ctx)`, pertama === 'gerbangWa2(ctx)', pertama)
const LARANG_SVC = [
  ['tulis Prisma', /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/], ['SQL mentah', /\$(queryRaw|executeRaw)/], ['process.env', /process\.env/],
  ['jaringan', /\bfetch\(|node:(http|https|net|tls|dns)|axios/], ['console', /console\./], ['WA-1/TAH langsung', /services\/(communication|tah)/],
  ['Send/successKey', /successKey|\bsend\w*\(/i], ['penulis audit', /catatAudit|auditLog\.create/],
]
const kenaSvc = LARANG_SVC.filter(([, re]) => re.test(svc)).map(([n]) => n)
cek('read-only: tanpa tulis/SQL mentah/env/jaringan/console/audit/Send', kenaSvc.length === 0, kenaSvc.join(', '))
cek('satu jalur baca: transaksi REPEATABLE READ via forTenant(ctx)', /forTenant\(ctx\)\.\$transaction\([\s\S]*?RepeatableRead/.test(svc) && (svc.match(/forTenant\(/g) ?? []).length === 1)
const nomorMentah = [...svc.matchAll(/(recipientE164Snapshot|\.e164)\b/g)].filter((m) => {
  const sebelum = svc.slice(Math.max(0, m.index - 16), m.index)
  const sesudah = svc.slice(m.index + m[0].length, m.index + m[0].length + 7)
  return !/samarkanNomor\([mc]\.?$/.test(sebelum) && !/^\s*:\s*true/.test(sesudah)
})
cek('nomor penerima HANYA keluar lewat samarkanNomor (selain di select)', nomorMentah.length === 0, `${nomorMentah.length} pemakaian mentah`)
const pilih = [...svc.matchAll(/select:\s*(\{[^}]*\}|PILIH_\w+)/g)].map((m) => m[1]).join(' ') + (svc.match(/const PILIH_PESAN = \{[\s\S]*?\} as const/)?.[0] ?? '') + (svc.match(/const PILIH_DETAIL = \{[\s\S]*?\} as const/)?.[0] ?? '')
const INTERNAL = ['logicalMessageKey', 'activeKey', 'successKey', 'sourceFingerprint', 'consentStateVersion', 'grantId', 'idempotencyKey', 'basisFingerprint', 'proposal']
const terpilih = INTERNAL.filter((f) => new RegExp(`\\b${f}\\s*:\\s*true`).test(pilih))
cek('field internal tidak dipilih (logicalMessageKey/activeKey/successKey/sourceFingerprint/consentStateVersion/grant/idempotency/basis/proposal)', terpilih.length === 0, terpilih.join(', '))
cek('fields pesan disaring allowlist MEDAN_FIELDS (tanpa recipient/grant/sumber)', /const MEDAN_FIELDS = \[[^\]]*\]/.test(svc) && !/MEDAN_FIELDS = \[[^\]]*(recipient|e164|grant|source|consent)/i.test(svc) && /fields: fieldsDiizinkan\(m\.fields\)/.test(svc))
cek('label pengiriman tetap "BELUM DIKIRIM" di detail', /LABEL_PENGIRIMAN = 'BELUM DIKIRIM/.test(svc) && /labelPengiriman: LABEL_PENGIRIMAN/.test(svc))
const badanSinyal = svc.slice(svc.indexOf('export async function kandidatSinyalPesanKlien'), svc.indexOf('export async function kandidatKontakPesanKlien'))
const qSinyal = badanSinyal.match(/tx\.monitoringSignal\.findMany\(\{([\s\S]*?)\n\s*\}\)/)?.[1] ?? ''
cek('kandidat sinyal: reviewState disaring DI QUERY (where, sebelum take) dengan STATUS_SINYAL_LAYAK', /where:[^\n]*reviewState: \{ in: \[\.\.\.STATUS_SINYAL_LAYAK\] \}/.test(qSinyal) && qSinyal.indexOf('reviewState: { in:') < qSinyal.indexOf('take:'), qSinyal.split('\n')[1]?.trim() ?? 'query tak ditemukan')
cek('kandidat sinyal: filter voyage, klasifikasi kejadian, urutan stabil, dan batas jumlah tetap (tenant via forTenant, dicek di atas)', /\.\.\.\(voyageId \? \{ voyageId \} : \{\}\)/.test(qSinyal) && /orderBy: \[\{ detectedAt: 'desc' \}, \{ id: 'desc' \}\]/.test(qSinyal) && /take: Math\.min\(take \* 5, 250\)/.test(qSinyal) && /klasifikasiSinyal\(s as unknown as SinyalMasuk\)/.test(badanSinyal) && /kategoriWajibUntuk\(k\.nilai\.keluarga\)/.test(badanSinyal) && /if \(items\.length === take\) break/.test(badanSinyal))
cek('kelayakan kontak memakai pemeriksaan F3/F4 yang sama (periksaKontak/periksaAkses) + consent OPT_IN', /periksaKontak\(t, ctx,/.test(svc) && /periksaAkses\(t, ctx,/.test(svc) && /'OPT_IN'/.test(svc))
cek('aksi SETUJUI/TOLAK hanya bila otorisasi checker F4 lolos (petunjuk; service tetap menilai ulang)', /otorisasiCheckerBuktiWaKlien\(/.test(svc) && /if \(oto\.ok\) aksi\.push\('SETUJUI', 'TOLAK'\)/.test(svc))
cek('impor WA-1 hanya lewat ./wa1-bridge', ![...svc.matchAll(/from\s+'([^']+)'/g)].some((m) => /communication|tah/.test(m[1])) && /from '\.\/wa1-bridge'/.test(svc))
const akses = tanpaKomentar(baca(AKSES))
cek('wa2-access.ts: hanya membungkus gerbangWa2 (tanpa env/DB)', /gerbangWa2\(ctx\)/.test(akses) && !/process\.env|prisma|forTenant/.test(akses) && /instanceof ServiceError\) return false/.test(akses))

// ============================================================================ A
bagian('[A] Murni — wa2-access & gerbang layanan baca (tanpa DB)')
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const asli = { ...process.env }
const atur = (e) => {
  for (const k of ['NODE_ENV', 'WA2_CLIENT_FOUNDATION_ENABLED', 'AUTOMATION_MONITORING_ENABLED', 'AUTOMATION_TENANT_IDS']) delete process.env[k]
  Object.assign(process.env, e)
}
const ENV_OK = { NODE_ENV: 'test', WA2_CLIENT_FOUNDATION_ENABLED: 'true', AUTOMATION_MONITORING_ENABLED: 'true', AUTOMATION_TENANT_IDS: 'wa2gstatictenantaaaa01' }
const ctx = (ubah = {}) => ({ tenantId: 'wa2gstatictenantaaaa01', userId: 'u-1', role: 'ADMIN', ...ubah })
const AK = jiti(`../${AKSES}`)
const RS = jiti(`../${SVC}`)
const kasus = [
  ['semua syarat terpenuhi (ADMIN)', ENV_OK, ctx(), true],
  ['MANAJER_OPERASI', ENV_OK, ctx({ role: 'MANAJER_OPERASI' }), true],
  ['peran OPERATOR', ENV_OK, ctx({ role: 'OPERATOR' }), false],
  ['peran DIREKTUR', ENV_OK, ctx({ role: 'DIREKTUR' }), false],
  ['tenant di luar allowlist', ENV_OK, ctx({ tenantId: 'wa2gstatictenantxxxx09' }), false],
  ['Automation mati', { ...ENV_OK, AUTOMATION_MONITORING_ENABLED: 'false' }, ctx(), false],
  ['konteks sistem', ENV_OK, ctx({ system: true }), false],
  ['flag WA-2 mati', { ...ENV_OK, WA2_CLIENT_FOUNDATION_ENABLED: 'false' }, ctx(), false],
  ['flag WA-2 "TRUE" (bukan persis "true")', { ...ENV_OK, WA2_CLIENT_FOUNDATION_ENABLED: 'TRUE' }, ctx(), false],
  ['NODE_ENV=production + flag true', { ...ENV_OK, NODE_ENV: 'production' }, ctx(), false],
]
for (const [nama, e, c, harap] of kasus) {
  atur(e)
  cek(`bolehAksesWa2: ${nama} → ${harap}`, AK.bolehAksesWa2(c) === harap)
}
const kodeDari = async (fn) => {
  try {
    await fn()
    return 'OK'
  } catch (e) {
    return `${e?.code ?? 'ERR'}${/WA2_(DISABLED|ENV_NOT_ALLOWED)/.exec(String(e?.message))?.[0] ? ':' + /WA2_(DISABLED|ENV_NOT_ALLOWED)/.exec(String(e?.message))[0] : ''}`
  }
}
const pemanggil = [
  ['daftarPesanKlien', (c) => RS.daftarPesanKlien(c, {})],
  ['detailPesanKlien', (c) => RS.detailPesanKlien(c, { messageId: 'm' })],
  ['riwayatPesanKlien', (c) => RS.riwayatPesanKlien(c, { messageId: 'm' })],
  ['kandidatSinyalPesanKlien', (c) => RS.kandidatSinyalPesanKlien(c, {})],
  ['kandidatKontakPesanKlien', (c) => RS.kandidatKontakPesanKlien(c, { signalId: 's' })],
]
for (const [nama, e, c, harap] of [
  ['produksi', { ...ENV_OK, NODE_ENV: 'production' }, ctx(), 'FORBIDDEN:WA2_ENV_NOT_ALLOWED'],
  ['flag mati', { ...ENV_OK, WA2_CLIENT_FOUNDATION_ENABLED: 'false' }, ctx(), 'FORBIDDEN:WA2_DISABLED'],
  ['OPERATOR', ENV_OK, ctx({ role: 'OPERATOR' }), 'FORBIDDEN'],
  ['luar allowlist', ENV_OK, ctx({ tenantId: 'wa2gstatictenantxxxx09' }), 'NOT_FOUND'],
]) {
  atur(e)
  const hasil = []
  for (const [n, f] of pemanggil) hasil.push([n, await kodeDari(() => f(c))])
  cek(`layanan baca: ${nama} → ${harap} di kelima fungsi (sebelum DB disentuh)`, hasil.every(([, h]) => h === harap), hasil.filter(([, h]) => h !== harap).map(([n, h]) => `${n}=${h}`).join(', '))
}
atur(ENV_OK)
const val = [
  ['state tak dikenal', () => RS.daftarPesanKlien(ctx(), { state: 'SENT' })],
  ['take 0', () => RS.daftarPesanKlien(ctx(), { take: 0 })],
  ['take 51', () => RS.daftarPesanKlien(ctx(), { take: 51 })],
  ['take teks', () => RS.daftarPesanKlien(ctx(), { take: '5' })],
  ['messageId kosong', () => RS.detailPesanKlien(ctx(), { messageId: '' })],
  ['messageId > 64', () => RS.detailPesanKlien(ctx(), { messageId: 'x'.repeat(65) })],
  ['riwayat take 101', () => RS.riwayatPesanKlien(ctx(), { messageId: 'm', take: 101 })],
  ['signalId hilang', () => RS.kandidatKontakPesanKlien(ctx(), {})],
]
for (const [n, f] of val) cek(`validasi masukan (tanpa DB): ${n} → VALIDATION`, (await kodeDari(f)) === 'VALIDATION')
// D-13: status sinyal layak di layanan baca = kebijakan Prepare WA-1 (kelayakanSinyal), dicek atas fungsi asli.
const CP = jiti('../src/services/communication/comm-policy.ts')
const layakSvc = RS.STATUS_SINYAL_LAYAK ?? []
const semuaStatus = ['OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'EXPIRED', 'BARU_TAK_DIKENAL', '']
cek('STATUS_SINYAL_LAYAK = PERSIS status yang lolos kelayakanSinyal (OPEN, ACKNOWLEDGED)', layakSvc.length === 2 && semuaStatus.every((x) => CP.kelayakanSinyal(x).ok === layakSvc.includes(x)), JSON.stringify(layakSvc))
for (const k of Object.keys(process.env)) if (!(k in asli)) delete process.env[k]
Object.assign(process.env, asli)

// ============================================================================ N
bagian('[N] Tanpa Send / provider / webhook / LLM')
const semuaBaru = [...Object.keys(RUTE), SVC, AKSES].map((r) => tanpaKomentar(baca(r))).join('\n')
cek('tidak ada path route kirim/send/webhook/dispatch', !Object.keys(RUTE).some((p) => /send|kirim|webhook|dispatch|execute/i.test(p)))
cek('kode baru tanpa successKey / provider / webhook / LLM', !/successKey|provider|webhook|anthropic|openai|llm|graph\.facebook/i.test(semuaBaru))
cek('tidak ada direktori route lain di bawah /api/automation yang menyentuh client-messages', jelajah('src/app/api/automation').filter((p) => /client-message/i.test(p) && !p.startsWith(R)).length === 0)

// ============================================================================ L
bagian('[L] Lingkup (prisma/wa2a-lingkup.mjs) — I/H/P + allowlist X-1')
const L = lapisLingkup(AKAR, { fase: [], env: process.env })
for (const i of L.info) console.log(`  ℹ️  ${i}`)
for (const h of L.hasil) cek(h.nama, h.ok, h.detail)
const m = L.manifest
cek('X-1: manifest i1.diizinkan = PERSIS 10 route di atas (literal)', JSON.stringify(m?.i1?.diizinkan ?? []) === JSON.stringify(Object.keys(RUTE).sort()))
cek('X-1: manifest faseAktif.G.izin = PERSIS 19 path disetujui (literal)', JSON.stringify(m?.faseAktif?.G?.izin ?? []) === JSON.stringify(IZIN_G), `${m?.faseAktif?.G?.izin?.length ?? 0} path`)
cek('X-1: jangkar G = layanan baca + uji API', JSON.stringify(m?.faseAktif?.G?.jangkar ?? []) === JSON.stringify(['prisma/check-wa2a-g-api.mjs', SVC]))
cek('X-1: tanpa halaman/komponen UI di allowlist G', !IZIN_G.some((p) => /^src\/components\/|^src\/app\/(?!api\/)/.test(p)))

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
