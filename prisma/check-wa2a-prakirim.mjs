// Uji STATIS bentuk revalidasi pra-kirim — SG-05 A2 / P-2 (keputusan owner O-1..O-8; B-1..B-3).
//
// Jalankan: node prisma/check-wa2a-prakirim.mjs   (tanpa DB/jaringan; hanya membaca berkas)
//
// Sasaran: src/services/whatsapp/wa-prakirim.service.ts, diurai dengan AST TypeScript (devDependency repo).
// Lapis:
//   R. repo nyata — aturan A-1..A-13 harus lulus.
//   M. kontrol mutasi DI MEMORI (berkas repo tidak ditulis): setiap pelanggaran harus ditangkap PERSIS oleh aturan
//      sasaran; kontrol positif (asli, CRLF, sebutan di komentar) harus lulus; mutasi harus tetap bebas galat sintaks.
//
// Batas klaim: ini uji BENTUK satu berkas (AST, bukan call graph lintas modul, bukan bukti runtime). Perilaku DB,
// kunci, konkurensi, audit, dan paritas hasil dengan F4 dibuktikan di check-wa2a-prakirim-db.mjs. A-9 (paritas F4)
// membandingkan teks kondisi + urutan helper fungsi revalidasi A2 dengan revalidasiPesan F4 — kesamaan BENTUK,
// bukan bukti ekuivalensi semantik helper yang dipanggil. SG-05 tetap OPEN.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
let lulus = 0
let gagal = 0
function cek(nama, kondisi, detail = '') {
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
}
const bagian = (j) => console.log(`\n${j}`)
let ts
try {
  ts = createRequire(join(AKAR, 'package.json'))('typescript')
} catch {
  console.log('❌ typescript (devDependency repo) tidak dapat dimuat — jalankan `npm install` (gagal tertutup)')
  process.exit(1)
}

const SVC = 'src/services/whatsapp/wa-prakirim.service.ts'
const F4 = 'src/services/whatsapp/wa-message-approval.service.ts'
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8')
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const rata = (s) => s.replace(/\s+/g, ' ').trim()

// ============================================================================ konstanta (literal)
const EKSPOR_FUNGSI = ['periksaTokenPraKirim', 'revalidasiPraKirimDalamTx']
const IMPOR_SAH = [
  '../context', '../errors', '../finance/audit', './wa-approval-def', './wa-approval-stop', './wa-lock', './wa-message-check',
  './wa-message-policy', './wa-message.service', './wa1-bridge', './wa2-gate', './wa2-policy', '@prisma/client',
].sort()
// Identifier yang tidak boleh muncul (kode, bukan komentar): klaim/Send/provider/jaringan/env/log/hold massal WA-1.
const ID_TERLARANG = ['successKey', 'fetch', 'process', 'console', 'require', 'tahanPesanTertunda', 'tahanPesanGrant', 'hentikanApprovalTertaut', 'hentikanApprovalPesanDitahan', 'forTenant', 'prisma', 'communicationCandidate', 'communicationMessage', 'communicationAttempt', 'XMLHttpRequest', 'WebSocket']
const STR_TERLARANG = ['RUNNING', 'SUCCEEDED', 'FAILED', 'SENT', 'SENDING']
const PROP_TERLARANG = ['$transaction', '$executeRaw', '$executeRawUnsafe', '$queryRawUnsafe']
const METODE_TULIS = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']
// A-9: helper F4 yang urutannya wajib sama.
const HELPER_PARITAS = ['sidikDariKolom', 'periksaKontak', 'kunciConsent', 'kategoriWajibUntuk', 'muatCandidateDalamTx', 'periksaAkses', 'revalidasiCandidate', 'nilaiFreshnessDb', 'syaratDataApproval', 'asalDataVoyage', 'jsonKanonikKomunikasi', 'verdictStabil', 'pencatatBuktiFreshness', 'tahan', 'blokir']

// ============================================================================ utilitas AST
const urai = (nama, src) => ts.createSourceFile(nama, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
function jelajah(n, fn) {
  fn(n)
  ts.forEachChild(n, (c) => jelajah(c, fn))
}
const kumpul = (n, pred) => {
  const h = []
  jelajah(n, (x) => pred(x) && h.push(x))
  return h
}
const fungsi = (sf, nama) => sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === nama)
const namaPanggil = (c) => (ts.isIdentifier(c.expression) ? c.expression.text : ts.isPropertyAccessExpression(c.expression) ? c.expression.getText() : '<?>')
const panggilan = (n) => kumpul(n, ts.isCallExpression).map((c) => ({ nama: namaPanggil(c), pos: c.getStart(), node: c }))
const diekspor = (s) => s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
const prop = (obj, nama) => obj?.properties?.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name?.getText() === nama)
const argObjek = (c, i = 0) => (c.arguments[i] && ts.isObjectLiteralExpression(c.arguments[i]) ? c.arguments[i] : null)

// ============================================================================ aturan
function periksa(src, srcF4) {
  const h = []
  const catat = (id, nama, ok, detail = '') => h.push({ id, nama, ok: Boolean(ok), detail })
  const sf = urai('svc.ts', src)
  const sintaks = sf.parseDiagnostics ?? []
  catat('A-0', 'berkas sasaran bebas galat sintaks', sintaks.length === 0, sintaks.length ? ts.flattenDiagnosticMessageText(sintaks[0].messageText, ' ') : '')

  // A-1 ekspor nilai = dua fungsi publik; masing-masing diawali gerbangWa2(ctx).
  const eksporNilai = sf.statements.filter((s) => diekspor(s) && !ts.isTypeAliasDeclaration(s) && !ts.isInterfaceDeclaration(s))
  const namaEkspor = eksporNilai.map((s) => (ts.isFunctionDeclaration(s) ? s.name?.text : `<${ts.SyntaxKind[s.kind]}>`)).sort()
  const gerbangPertama = EKSPOR_FUNGSI.every((n) => {
    const f = fungsi(sf, n)
    const s0 = f?.body?.statements[0]
    return s0 && ts.isExpressionStatement(s0) && rata(s0.expression.getText()) === 'gerbangWa2(ctx)'
  })
  const tanpaEksporLain = !sf.statements.some((s) => ts.isExportDeclaration(s) || ts.isExportAssignment(s))
  catat('A-1', 'ekspor nilai = 2 fungsi publik, statement pertama masing-masing gerbangWa2(ctx) (O-5)', sama(namaEkspor, EKSPOR_FUNGSI) && gerbangPertama && tanpaEksporLain, `ekspor ${namaEkspor.join(',')}; gerbang ${gerbangPertama}`)

  // A-2 tanpa transaksi sendiri / SQL tulis mentah.
  const propDipakai = kumpul(sf, ts.isPropertyAccessExpression).map((p) => p.name.text).filter((n) => PROP_TERLARANG.includes(n))
  catat('A-2', 'tanpa $transaction / $executeRaw / *Unsafe (berjalan di tx pemanggil, K3)', propDipakai.length === 0, propDipakai.join(',') || 'nihil')

  // A-3 impor = allowlist persis (WA-1 hanya lewat wa1-bridge; tanpa node:/provider/jaringan).
  const impor = sf.statements.filter(ts.isImportDeclaration).map((s) => s.moduleSpecifier.text).sort()
  const imporDinamis = kumpul(sf, (n) => ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword).length
  catat('A-3', 'impor = allowlist persis; tanpa import() dinamis', sama(impor, IMPOR_SAH) && imporDinamis === 0, `impor ${impor.length}${sama(impor, IMPOR_SAH) ? '' : ` [${impor.filter((x) => !IMPOR_SAH.includes(x)).join(',')}]`}; dinamis ${imporDinamis}`)

  // A-4 identifier & string terlarang (komentar tidak dihitung).
  const idBuruk = [...new Set(kumpul(sf, ts.isIdentifier).map((i) => i.text).filter((t) => ID_TERLARANG.includes(t)))]
  const strBuruk = [...new Set(kumpul(sf, (n) => ts.isStringLiteralLike(n)).map((s) => s.text).filter((t) => STR_TERLARANG.includes(t)))]
  catat('A-4', 'tanpa successKey/RUNNING/FAILED/Send/fetch/env/log/hold-massal/akses WA-1 langsung', idBuruk.length === 0 && strBuruk.length === 0, [...idBuruk, ...strBuruk.map((s) => `'${s}'`)].join(',') || 'nihil')

  // A-5 tulis Prisma hanya tx.waClientMessage.updateMany (satu kali, di tahanPesan).
  const tulis = panggilan(sf).filter((c) => ts.isPropertyAccessExpression(c.node.expression) && METODE_TULIS.includes(c.node.expression.name.text))
  const tulisNama = tulis.map((c) => c.nama)
  const diTahan = tulis.every((c) => {
    let p = c.node.parent
    while (p && !ts.isFunctionDeclaration(p)) p = p.parent
    return p?.name?.text === 'tahanPesan'
  })
  catat('A-5', 'tulis Prisma = tepat satu tx.waClientMessage.updateMany di tahanPesan', sama(tulisNama, ['tx.waClientMessage.updateMany']) && diTahan, tulisNama.join(',') || 'nihil')

  // A-6 SQL mentah & kueri Prisma menyaring tenant.
  const sql = kumpul(sf, (n) => ts.isTaggedTemplateExpression(n) && n.tag.getText() === 'Prisma.sql')
  const sqlTenant = sql.every((t) => /"tenantId" = \$\{ctx\.tenantId\}/.test(t.template.getText()))
  const qr = panggilan(sf).filter((c) => /\.\$queryRaw$/.test(c.nama))
  const qrSql = qr.every((c) => c.node.arguments.length === 1 && ts.isTaggedTemplateExpression(c.node.arguments[0]) && c.node.arguments[0].tag.getText() === 'Prisma.sql')
  const kueri = panggilan(sf).filter((c) => /^tx\.\w+\.(findFirst|findMany|findUnique|updateMany|count)$/.test(c.nama))
  const kueriTenant = kueri.every((c) => {
    const w = prop(argObjek(c.node), 'where')
    return w && ts.isPropertyAssignment(w) && ts.isObjectLiteralExpression(w.initializer) && prop(w.initializer, 'tenantId')?.initializer?.getText() === 'ctx.tenantId'
  })
  catat('A-6', 'semua Prisma.sql memuat "tenantId" = ${ctx.tenantId}; $queryRaw hanya Prisma.sql; where Prisma memuat tenantId: ctx.tenantId', sql.length >= 3 && sqlTenant && qrSql && kueri.length >= 3 && kueriTenant, `sql ${sql.length} (${sqlTenant}); queryRaw ${qr.length} (${qrSql}); kueri ${kueri.length} (${kueriTenant})`)

  // A-7 update dijaga id + tenantId + state + version.
  const um = tulis.find((c) => c.nama === 'tx.waClientMessage.updateMany')
  const wUm = um && prop(argObjek(um.node), 'where')?.initializer
  const kunciUm = wUm && ts.isObjectLiteralExpression(wUm) ? wUm.properties.map((p) => p.name.getText()).sort() : []
  catat('A-7', 'updateMany pesan dijaga {id, tenantId, state, version}', sama(kunciUm, ['id', 'state', 'tenantId', 'version']), kunciUm.join(','))

  // A-8 urutan kunci (O-8) + jam akhir sesudah semua kunci.
  const utama = fungsi(sf, 'revalidasiPraKirimDalamTx')
  const urut = utama ? panggilan(utama).filter((c) => ['revalidasi', 'kunciCandidate', 'kunciApprovalLaluPesan'].includes(c.nama)) : []
  const urutNama = urut.map((c) => c.nama)
  const akhirDekl = utama ? kumpul(utama, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'akhir') : []
  const posAkhir = akhirDekl[0]?.getStart() ?? -1
  const akhirOk = akhirDekl.length === 1 && rata(akhirDekl[0].initializer?.getText() ?? '') === 'new Date()' && urut.length === 4 && posAkhir > urut[2].pos && posAkhir < urut[3].pos && urut[3].node.arguments[3]?.getText() === 'akhir'
  const kalp = fungsi(sf, 'kunciApprovalLaluPesan')
  const pk = kalp ? panggilan(kalp) : []
  const iA = pk.findIndex((c) => c.nama === 'kunciApprovalPesan')
  const iM = pk.findIndex((c) => /\.\$queryRaw$/.test(c.nama) && /FROM "WaClientMessage"[\s\S]*FOR UPDATE/.test(c.node.getText()))
  const klt = fungsi(sf, 'kunciLaluTahan')
  const pklt = klt ? panggilan(klt).map((c) => c.nama).filter((n) => ['kunciApprovalLaluPesan', 'tahanPesan'].includes(n)) : []
  catat(
    'A-8',
    'urutan: revalidasi (kontak→consent→grant/bukti) → kunciCandidate → approval FOR UPDATE → pesan FOR UPDATE → jam akhir → revalidasi(akhir)',
    sama(urutNama, ['revalidasi', 'kunciCandidate', 'kunciApprovalLaluPesan', 'revalidasi']) && akhirOk && iA >= 0 && iM > iA && sama(pklt, ['kunciApprovalLaluPesan', 'tahanPesan']),
    `${urutNama.join('→')}; akhir ${akhirOk}; approval@${iA} pesan@${iM}; kunciLaluTahan ${pklt.join('→')}`,
  )

  // A-9 paritas BENTUK dengan revalidasiPesan F4 (O-1/K1-B).
  const sfF4 = urai('f4.ts', srcF4)
  const bentuk = (f) => {
    if (!f) return null
    const kondisi = kumpul(f, ts.isIfStatement).map((s) => `${rata(s.expression.getText())} ⇒ ${rata(s.thenStatement.getText())}`)
    const helper = panggilan(f).map((c) => c.nama).filter((n) => HELPER_PARITAS.includes(n))
    return { kondisi, helper }
  }
  const bA = bentuk(fungsi(sf, 'revalidasi'))
  const bF = bentuk(fungsi(sfF4, 'revalidasiPesan'))
  const beda = bA && bF ? bA.kondisi.filter((k, i) => k !== bF.kondisi[i]).length + Math.abs(bA.kondisi.length - bF.kondisi.length) : -1
  catat('A-9', 'paritas bentuk revalidasi A2 = revalidasiPesan F4 (kondisi + kode alasan + urutan helper)', bA && bF && beda === 0 && sama(bA.helper, bF.helper) && bA.kondisi.length >= 12, bA && bF ? `kondisi ${bA.kondisi.length}/${bF.kondisi.length}, beda ${beda}; helper ${sama(bA.helper, bF.helper)}` : 'fungsi tidak ditemukan')

  // A-10 audit tanpa nomor/penerima.
  const audit = panggilan(sf).filter((c) => c.nama === 'catatAudit')
  const auditBersih = audit.every((c) => !/e164|recipient|nomor|phone|msisdn/i.test(c.node.getText()))
  catat('A-10', 'catatAudit tanpa nomor/penerima (e164/recipient/…)', audit.length >= 1 && auditBersih, `audit ${audit.length}; bersih ${auditBersih}`)

  // A-11 hold: transisi sah → hentikan approval → update pesan → audit (satu fungsi, tx sama).
  const tp = fungsi(sf, 'tahanPesan')
  const urutTp = tp ? panggilan(tp).map((c) => c.nama).filter((n) => ['transisiPesanKlienSah', 'hentikanApprovalPesan', 'tx.waClientMessage.updateMany', 'catatAudit'].includes(n)) : []
  const auditTx = audit.every((c) => c.node.arguments[3]?.getText() === 'tx')
  catat('A-11', 'tahanPesan: transisi → hentikanApprovalPesan → updateMany → catatAudit(…, tx)', sama(urutTp, ['transisiPesanKlienSah', 'hentikanApprovalPesan', 'tx.waClientMessage.updateMany', 'catatAudit']) && auditTx, urutTp.join('→'))

  // A-12 O-6 — hanya APPROVED + NOT_STARTED; pesan hanya APPROVED.
  const syarat = utama ? kumpul(utama, ts.isIfStatement).map((s) => rata(s.expression.getText())) : []
  catat('A-12', "kelayakan persis: a.status !== 'APPROVED' || a.executionStatus !== 'NOT_STARTED'; m.state !== 'APPROVED'", syarat.includes("a.status !== 'APPROVED' || a.executionStatus !== 'NOT_STARTED'") && syarat.includes("m.state !== 'APPROVED'"))

  // A-13 token: tenant ctx, registri per objek tx, baca ulang ber-tenant.
  const pt = fungsi(sf, 'periksaTokenPraKirim')
  const ptTeks = pt ? rata(pt.getText()) : ''
  const ptSyarat = pt ? kumpul(pt, ts.isIfStatement).map((s) => rata(s.expression.getText())) : []
  catat(
    'A-13',
    'periksaTokenPraKirim: tenant token = ctx.tenantId, registri tokenPerTx.get(tx), cek state/version pesan & approval',
    ptSyarat.includes('!token || token.tenantId !== ctx.tenantId') && ptSyarat.some((s) => s.startsWith('tokenPerTx.get(tx)?.get(token.messageId) !==')) &&
      ["m[0]?.state === 'APPROVED'", 'm[0].version === token.version', "a[0].executionStatus === 'NOT_STARTED'", 'a[0].version === token.approvalVersion'].every((x) => ptTeks.includes(x)),
  )
  return h
}

// ============================================================================ R
bagian('[R] Repo nyata')
const ASLI = baca(SVC)
const ASLI_F4 = baca(F4)
for (const x of periksa(ASLI, ASLI_F4)) cek(`${x.id} ${x.nama}`, x.ok, x.detail)

// ============================================================================ M
bagian('[M] Kontrol mutasi (di memori; berkas repo tidak ditulis)')
function ganti(src, dari, ke) {
  const i = src.indexOf(dari)
  if (i < 0) throw new Error(`pola tidak ada: ${dari.slice(0, 60)}`)
  if (src.indexOf(dari, i + 1) >= 0) throw new Error(`pola tidak unik: ${dari.slice(0, 60)}`)
  return src.slice(0, i) + ke + src.slice(i + dari.length)
}
function mutasi(id, nama, harap, fn, f4 = (s) => s) {
  try {
    const s = fn(ASLI)
    const sF4 = f4(ASLI_F4)
    if (s === ASLI && sF4 === ASLI_F4 && harap !== null) throw new Error('mutasi tidak mengubah berkas')
    const r = periksa(s, sF4)
    const gagalId = [...new Set(r.filter((x) => !x.ok).map((x) => x.id))]
    const harapan = [harap].flat()
    if (gagalId.includes('A-0') && !harapan.includes('A-0')) throw new Error(`mutasi merusak sintaks: ${r.find((x) => x.id === 'A-0').detail}`)
    if (harap === null) cek(`${id} (kontrol positif) ${nama}`, gagalId.length === 0, gagalId.length ? `gagal: ${gagalId.join(',')}` : 'semua aturan lulus')
    else cek(`${id} ${nama} → ditangkap ${harapan.join('+')} SAJA`, sama(gagalId, harapan), `aturan gagal: ${gagalId.join(',') || '(tidak ada)'}`)
  } catch (e) {
    cek(`${id} ${nama}`, false, `galat: ${e.message}`)
  }
}
const sisipAwal = (kepala, baris) => (s) => {
  const i = s.indexOf(kepala)
  if (i < 0 || s.indexOf(kepala, i + 1) >= 0) throw new Error(`kepala tidak unik/tidak ada: ${kepala}`)
  const k = s.indexOf('gerbangWa2(ctx)\n', i)
  if (k < 0) throw new Error('gerbang tidak ditemukan')
  const j = k + 'gerbangWa2(ctx)\n'.length
  return s.slice(0, j) + `  ${baris}\n` + s.slice(j)
}
const UTAMA = 'export async function revalidasiPraKirimDalamTx('
const TOKEN = 'export async function periksaTokenPraKirim('

mutasi('P-1', 'berkas asli', null, (s) => s)
mutasi('P-2', 'seluruh berkas CRLF (emulasi checkout Windows; BUKAN bukti suite Windows)', null, (s) => s.replace(/\r?\n/g, '\r\n'), (s) => s.replace(/\r?\n/g, '\r\n'))
mutasi('P-3', "token terlarang hanya di komentar (successKey, 'RUNNING', fetch, $transaction)", null, (s) => `${s}\n// successKey 'RUNNING' fetch() $transaction console process.env tahanPesanTertunda\n`)

mutasi('M-01', 'gerbangWa2 dihapus dari periksaTokenPraKirim', 'A-1', (s) => ganti(s, `${TOKEN}ctx: TenantContext, tx: Tx, token: TokenPraKirim): Promise<boolean> {\n  gerbangWa2(ctx)\n`, `${TOKEN}ctx: TenantContext, tx: Tx, token: TokenPraKirim): Promise<boolean> {\n`))
mutasi('M-02', 'gerbangWa2 dipindah sesudah validasi input', 'A-1', (s) => ganti(s, "  gerbangWa2(ctx)\n  const mid = idSah(input?.messageId, 'messageId')\n", "  const mid = idSah(input?.messageId, 'messageId')\n  gerbangWa2(ctx)\n"))
mutasi('M-03', 'ekspor fungsi tambahan (permukaan publik baru)', 'A-1', (s) => `${s}\nexport async function klaimPraKirim(ctx: TenantContext): Promise<void> {\n  gerbangWa2(ctx)\n}\n`)
mutasi('M-04', 'membuka transaksi sendiri', 'A-2', sisipAwal(UTAMA, 'await (tx as unknown as { $transaction: (f: () => Promise<void>) => Promise<void> }).$transaction(async () => {})'))
mutasi('M-05', '$executeRaw mentah', 'A-2', sisipAwal(UTAMA, 'await (tx as unknown as TxMentah).$executeRaw(Prisma.sql`SELECT 1 WHERE "tenantId" = ${ctx.tenantId}`)'))
mutasi('M-06', 'impor modul WA-1 langsung (bukan lewat bridge)', 'A-3', (s) => ganti(s, "import { gerbangWa2 } from './wa2-gate'\n", "import { gerbangWa2 } from './wa2-gate'\nimport '@/services/communication/communication-send.service'\n"))
mutasi('M-07', 'impor node:https (jaringan)', 'A-3', (s) => ganti(s, "import { gerbangWa2 } from './wa2-gate'\n", "import { gerbangWa2 } from './wa2-gate'\nimport 'node:https'\n"))
mutasi('M-08', 'import() dinamis provider', 'A-3', sisipAwal(UTAMA, "void import('./wa-provider')"))
mutasi('M-09', "string 'RUNNING' (klaim eksekusi)", 'A-4', sisipAwal(UTAMA, "void 'RUNNING'"))
mutasi('M-10', 'identifier successKey', 'A-4', sisipAwal(UTAMA, 'const successKey = mid; void successKey'))
mutasi('M-11', 'panggilan fetch (Send/provider)', 'A-4', sisipAwal(UTAMA, "void fetch('http://127.0.0.1/')"))
mutasi('M-12', 'console.log', 'A-4', sisipAwal(UTAMA, 'console.log(mid)'))
mutasi('M-13', 'process.env', 'A-4', sisipAwal(UTAMA, 'void process.env.NODE_ENV'))
mutasi('M-14', "status 'FAILED' diterima (retry ditunda ke F-II, O-6)", ['A-4', 'A-12'], (s) => ganti(s, "a.executionStatus !== 'NOT_STARTED')", "(a.executionStatus !== 'NOT_STARTED' && a.executionStatus !== 'FAILED'))"))
mutasi('M-15', 'tahApprovalRequest.update di luar hentikanApprovalPesan', 'A-5', sisipAwal(UTAMA, "await tx.tahApprovalRequest.update({ where: { id: mid }, data: { executionStatus: 'NOT_STARTED' } })"))
mutasi('M-16', 'raw SQL pesan tanpa tenantId', 'A-6', (s) => ganti(s, 'WHERE "id" = ${m.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE', 'WHERE "id" = ${m.id} FOR UPDATE'))
mutasi('M-17', 'findFirst approval tanpa tenantId', 'A-6', (s) => ganti(s, 'where: { id: m.approvalRequestId, tenantId: ctx.tenantId }', 'where: { id: m.approvalRequestId }'))
mutasi('M-18', 'updateMany tanpa penjaga version', 'A-7', (s) => ganti(s, 'where: { id: m.id, tenantId: ctx.tenantId, state: m.state, version: m.version }', 'where: { id: m.id, tenantId: ctx.tenantId, state: m.state }'))
mutasi('M-19', 'kunciCandidate sesudah kunci approval/pesan', 'A-8', (s) => ganti(s, '  await kunciCandidate(tx, rv.c)\n  const k = await kunciApprovalLaluPesan(ctx, tx, m, a)\n', '  const k = await kunciApprovalLaluPesan(ctx, tx, m, a)\n  await kunciCandidate(tx, rv.c)\n'))
mutasi('M-20', 'jam akhir diambil SEBELUM kunci', 'A-8', (s) => ganti(ganti(s, '  const akhir = new Date()\n', ''), '  await kunciCandidate(tx, rv.c)\n', '  const akhir = new Date()\n  await kunciCandidate(tx, rv.c)\n'))
mutasi('M-21', 'revalidasi akhir memakai jam lama', 'A-8', (s) => ganti(s, 'revalidasi(ctx, tx, m, akhir)', 'revalidasi(ctx, tx, m, new Date(akhir.getTime() - 1))'))
mutasi('M-22', 'pesan dikunci SEBELUM approval', 'A-8', (s) => {
  const kepala = '  const la = await kunciApprovalPesan(t, ctx.tenantId, a.id)\n  if (!la) throw relasiRusak(\'APPROVAL_RELATION_INVALID\')\n'
  const i = s.indexOf(kepala)
  const j = s.indexOf('  const p = lm[0]\n', i)
  if (i < 0 || j < 0) throw new Error('pola kunci tidak ada')
  return s.slice(0, i) + s.slice(i + kepala.length, j) + kepala + s.slice(j)
})
mutasi('M-23', 'kunciLaluTahan menahan tanpa mengunci approval/pesan', 'A-8', (s) => ganti(s, '  const k = await kunciApprovalLaluPesan(ctx, tx, m, a)\n  if (!k.ok) return { hasil: \'KONFLIK\', messageId: m.id, alasan: k.alasan }\n  return tahanPesan(', '  return tahanPesan('))
mutasi('M-24', 'paritas: kode alasan CONSENT_CHANGED diganti', 'A-9', (s) => ganti(s, "return tahan('CONSENT_CHANGED')", "return tahan('CONSENT_VERSION_DRIFT')"))
mutasi('M-25', 'paritas: pemeriksaan K7 (EVIDENCE_CHANGED) dihapus', 'A-9', (s) => ganti(s, "  if (jsonKanonikKomunikasi(verdictStabil(freshness)) !== jsonKanonikKomunikasi(verdictStabil(m.freshnessVerdict))) return tahan('EVIDENCE_CHANGED')\n", ''))
mutasi('M-26', 'paritas: consent diperiksa sebelum kontak', 'A-9', (s) => {
  const blokK = "  const pk = await periksaKontak(t, ctx, m.contactId, sekarang)\n  if (!pk.ok) return tahan(pk.alasan)\n"
  const blokC = "  const consent = await kunciConsent(t, ctx.tenantId, m.contactId, TUJUAN_CONSENT_PESAN_KLIEN)\n  if (consent.status !== 'OPT_IN') return tahan('CONSENT_NOT_GRANTED')\n  if (consent.version !== m.consentStateVersion) return tahan('CONSENT_CHANGED')\n"
  return ganti(ganti(s, blokC, ''), blokK, blokC + blokK)
})
mutasi('M-27', 'paritas: F4 berubah (A2 tertinggal) juga ditangkap', 'A-9', (s) => s, (f) => ganti(f, "if (!akses.ok) return tahan(akses.alasan)\n  if (c.state !== 'ACTIVE')", "if (!akses.ok) return tahan(akses.alasan)\n  if (c.voyageId === '') return blokir('SOURCE_INVALID')\n  if (c.state !== 'ACTIVE')"))
mutasi('M-28', 'audit memuat nomor penerima', 'A-10', (s) => ganti(s, 'approvalRequestId: a.id, dinilaiPada: jam.toISOString() }', 'approvalRequestId: a.id, dinilaiPada: jam.toISOString(), penerima: m.recipientE164Snapshot }'))
mutasi('M-29', 'tahanPesan: update pesan sebelum menghentikan approval', 'A-11', (s) => {
  const h = "  await hentikanApprovalPesan(ctx, tx, m.id, a.id, 'CANCELLED', alasan)\n"
  return ganti(ganti(s, h, ''), "  if (n.count !== 1) throw conflict('Data berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })\n", `  if (n.count !== 1) throw conflict('Data berubah bersamaan. Coba lagi.', { code: 'CONCURRENCY_CONFLICT' })\n${h}`)
})
mutasi('M-30', 'audit hold di luar tx pemanggil', 'A-11', (s) => ganti(s, 'dinilaiPada: jam.toISOString() } }, {}, tx)', 'dinilaiPada: jam.toISOString() } }, {})'))
mutasi('M-31', 'O-6: pesan non-APPROVED tidak lagi ditolak', 'A-12', (s) => ganti(s, "if (m.state !== 'APPROVED') return", "if (m.state === 'CANCELED') return"))
mutasi('M-32', 'token: pemeriksaan tenant dihapus', 'A-13', (s) => ganti(s, 'if (!token || token.tenantId !== ctx.tenantId) return false', 'if (!token) return false'))
mutasi('M-33', 'token: registri per-tx diabaikan', 'A-13', (s) => ganti(s, '  if (tokenPerTx.get(tx)?.get(token.messageId) !== kanonToken(token)) return false\n', ''))
mutasi('M-34', 'token: version approval tidak dibandingkan', 'A-13', (s) => ganti(s, ' && a[0].version === token.approvalVersion', ''))
mutasi('M-35', 'galat sintaks terdeteksi (bukan lolos diam-diam)', 'A-0', (s) => ganti(s, 'const TABEL_PESAN = SUBJEK_APPROVAL_PESAN_KLIEN\n', 'const TABEL_PESAN = = SUBJEK_APPROVAL_PESAN_KLIEN\n'))

console.log('\nℹ️  Cakupan: bentuk satu berkas (AST). Perilaku DB/kunci/konkurensi/paritas hasil → check-wa2a-prakirim-db.mjs. SG-05 tetap OPEN.')
console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
