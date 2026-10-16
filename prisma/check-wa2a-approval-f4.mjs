// Uji statis + murni WA-2a Step 2F (F4) — approval eksternal pesan klien (berhenti di APPROVED, tanpa Send).
//
// Jalankan: node prisma/check-wa2a-approval-f4.mjs   (tanpa DB; uji DB: check-wa2a-approval-f4-db.mjs)
//
// Lapis:
//   P. murni — pencatat bukti, matriks maker-checker (K5), TTL tepat 2 jam, batas kedaluwarsa ±1 ms, pemetaan K2.
//   S1. bentuk service — gerbang di setiap fungsi publik, tanpa Send/provider/jaringan, definisi beku sebagai
//       satu-satunya sumber kind/kelas/peran/TTL, idempotensi WA2:, SQL ber-tenant, urutan approval → pesan.
//   S2. K1 — SEMUA jalur tulis VoyageEvent mengunci Voyage FOR NO KEY UPDATE dalam transaksi.
//   S3. K3 — setiap hold kontak/consent/grant menghentikan approval tertaut SEBELUM menahan pesan.
//   S4. lingkup — hanya berkas F4 (path persis); WA-1/TAH/V3/schema/migrasi tidak berubah.

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
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
const D = jiti('../src/services/whatsapp/wa-approval-def.ts')
const tanpaKomentar = (s) => s.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/[^\n]*/g, '$1')

// ============================================================================ P
bagian('[P] Murni — maker-checker atas bukti, TTL, kedaluwarsa, K2')
cek('pencatat bukti konfirmasi: unik & terurut', JSON.stringify(D.pencatatBuktiFreshness({ konfirmasi: [{ confirmedByUserId: 'u-b' }, { confirmedByUserId: 'u-a' }, { confirmedByUserId: 'u-b' }] })) === '["u-a","u-b"]')
cek('pencatat bukti milestone = recordedByUserId', JSON.stringify(D.pencatatBuktiFreshness({ eventId: 'e', occurredAt: 'x', recordedByUserId: 'u-r' })) === '["u-r"]')
cek('bukti kosong / rusak / tanpa pencatat → null (gagal tertutup)', [null, undefined, {}, { konfirmasi: [] }, { konfirmasi: [{}] }, { konfirmasi: [{ confirmedByUserId: '' }] }, { recordedByUserId: 7 }, 'teks'].every((b) => D.pencatatBuktiFreshness(b) === null))
const j = D.JENIS_APPROVAL_WA_KLIEN
const calon = (userId, ubah = {}) => ({ pemutus: { userId, role: 'ADMIN', system: false }, peminta: 'u-minta', pembuatDraft: 'u-draft', pencatatBukti: ['u-catat'], ...ubah })
const hasil = (c) => {
  const h = D.otorisasiCheckerBuktiWaKlien(c, j)
  return h.ok ? 'OK' : h.alasan
}
const matriks = [
  ['checker sah (ADMIN lain)', calon('u-cek'), 'OK'],
  ['checker sah (MANAJER_OPERASI)', { ...calon('u-cek'), pemutus: { userId: 'u-cek', role: 'MANAJER_OPERASI', system: false } }, 'OK'],
  ['pemberi preview boleh menjadi checker', calon('u-preview'), 'OK'],
  ['pembuat draft', calon('u-draft'), 'CHECKER_IS_MAKER'],
  ['peminta approval', calon('u-minta'), 'SELF_APPROVAL_FORBIDDEN'],
  ['pencatat konfirmasi/milestone', calon('u-catat'), 'CHECKER_IS_EVIDENCE_RECORDER'],
  ['salah satu dari beberapa pencatat ETA/ETD', calon('u-etd', { pencatatBukti: ['u-eta', 'u-etd'] }), 'CHECKER_IS_EVIDENCE_RECORDER'],
  ['peran OPERATOR', { ...calon('u-cek'), pemutus: { userId: 'u-cek', role: 'OPERATOR', system: false } }, 'ROLE_NOT_ALLOWED'],
  ['konteks sistem', { ...calon('u-cek'), pemutus: { userId: 'u-cek', role: 'ADMIN', system: true } }, 'SYSTEM_CONTEXT_FORBIDDEN'],
  ['pencatat tak diketahui (null)', calon('u-cek', { pencatatBukti: null }), 'APPROVAL_POLICY_MISMATCH'],
  ['pencatat kosong', calon('u-cek', { pencatatBukti: [] }), 'APPROVAL_POLICY_MISMATCH'],
  ['peminta tak diketahui', calon('u-cek', { peminta: null }), 'APPROVAL_POLICY_MISMATCH'],
  ['pembuat draft tak diketahui', calon('u-cek', { pembuatDraft: '' }), 'APPROVAL_POLICY_MISMATCH'],
]
for (const [nama, c, harap] of matriks) cek(`K5 matriks: ${nama} → ${harap}`, hasil(c) === harap, hasil(c))
const t0 = new Date('2026-10-11T08:00:00.000Z')
const tr = D.turunanApprovalWaKlien(j, t0)
cek('TTL approval TEPAT 2 jam dari jam server', tr.expiresAt.getTime() - t0.getTime() === 2 * 3_600_000 && tr.kind === 'CLIENT_WA_UPDATE' && tr.actionRisk === 'EXTERNAL_COMMUNICATION' && tr.requiredRoles.join() === 'ADMIN,MANAJER_OPERASI' && tr.subjectType === 'WaClientMessage')
const batas = tr.expiresAt
const kd = (ms, status = 'PENDING') => D.approvalWaKlienKedaluwarsa({ status, expiresAt: batas }, new Date(batas.getTime() + ms))
cek('kedaluwarsa: 1 ms SEBELUM batas → belum', kd(-1) === false)
cek('kedaluwarsa: TEPAT di batas → kedaluwarsa (≤, kebijakan beku)', kd(0) === true)
cek('kedaluwarsa: 1 ms SESUDAH batas → kedaluwarsa', kd(1) === true)
cek('kedaluwarsa hanya untuk PENDING (APPROVED tidak "kedaluwarsa")', kd(10, 'APPROVED') === false)
cek('K2: sumber berubah/terhapus/tidak sah & milestone ganda → BLOCKED', ['SOURCE_CHANGED', 'SOURCE_INVALID', 'EVENT_DELETED', 'EVENT_DUPLICATE'].every((a) => K.ALASAN_FRESHNESS_BLOCKED.includes(a)))
cek('K2: bukti invalid/kedaluwarsa/hilang TIDAK di daftar BLOCKED (→ NEEDS_REVIEW)', ['CONFIRMATION_EXPIRED', 'CONFIRMATION_INVALIDATED', 'CONFIRMATION_MISSING', 'CONFIRMATION_VALUE_MISMATCH', 'EVENT_TOO_OLD', 'EVENT_IN_FUTURE', 'FRESHNESS_EVIDENCE_MISSING'].every((a) => !K.ALASAN_FRESHNESS_BLOCKED.includes(a)))
cek('K4: peminta = ADMIN, MANAJER_OPERASI', K.PERAN_PEMINTA_APPROVAL_PESAN_KLIEN.join() === 'ADMIN,MANAJER_OPERASI')
cek('kode alasan F4 lengkap (EVIDENCE_CHANGED, CHECKER_IS_EVIDENCE_RECORDER, PROPOSAL_HASH_MISMATCH)', ['EVIDENCE_CHANGED', 'CHECKER_IS_EVIDENCE_RECORDER', 'PROPOSAL_HASH_MISMATCH', 'APPROVAL_LINK_MISMATCH'].every((k) => K.KODE_ALASAN_WA2F4.includes(k)))
cek('mesin status: PENDING_APPROVAL → APPROVED/REJECTED/EXPIRED; EXPIRED terminal (K11)', ['APPROVED', 'REJECTED', 'EXPIRED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'].every((s) => K.TRANSISI_PESAN_KLIEN.PENDING_APPROVAL.includes(s)) && K.TRANSISI_PESAN_KLIEN.EXPIRED.length === 0)

// ============================================================================ S1
bagian('[S1] Bentuk service approval')
const SVC = 'src/services/whatsapp/wa-message-approval.service.ts'
const STOP = 'src/services/whatsapp/wa-approval-stop.ts'
const CHK = 'src/services/whatsapp/wa-message-check.ts'
const svc = tanpaKomentar(baca(SVC))
const stop = tanpaKomentar(baca(STOP))
const chk = tanpaKomentar(baca(CHK))
const pertama = (src) => {
  const b = src.split('\n')
  return b.map((l, i) => (/^export async function \w+\(/.test(l) ? { nama: l.match(/function (\w+)/)[1], p: (b.slice(i + 1).find((x) => x.trim() !== '') ?? '').trim() } : null)).filter(Boolean)
}
const pub = pertama(svc)
cek('4 fungsi publik (minta, setujui, tolak, batalkan) — SEMUA diawali gerbangWa2(ctx)', pub.map((f) => f.nama).sort().join() === 'batalkanPesanKlien,mintaApprovalPesanKlien,setujuiPesanKlien,tolakPesanKlien' && pub.every((f) => f.p === 'gerbangWa2(ctx)'), pub.map((f) => `${f.nama}:${f.p.slice(0, 16)}`).join(' '))
cek('modul pendukung (stop, check) bukan titik masuk: tanpa fungsi publik non-tx (setiap ekspor async menerima tx)', [...stop.matchAll(/^export async function (\w+)\(([^)]*)/gm), ...chk.matchAll(/^export async function (\w+)(?:<T>)?\(([^)]*)/gm)].every((m) => /\btx\b|^fn: \($/.test(m[2])))
const SEMUA_F4 = svc + stop + chk
cek('TANPA Send / penyedia / jaringan / LLM / console (impor & pemanggilan)', !/fetch\(|node:(http|https|net|tls|dns)|openrouter|lib\/ai|anthropic|console\.|communication-send|kirimLewat|kirimPesan|penyedia|graph\.facebook|whatsapp-api/i.test(SEMUA_F4) && [...SEMUA_F4.matchAll(/from '([^']+)'/g)].every((m) => !/send|provider|penyedia|http/i.test(m[1])))
cek('TANPA penulisan successKey / state kirim / eksekusi selain NOT_STARTED', !/successKey|QUEUED|SENT\b|'RUNNING'|'SUCCEEDED'|executionClaimedAt|executedAt/.test(SEMUA_F4) && [...svc.matchAll(/data: \{[^}]*executionStatus: '(\w+)'/g)].map((m) => m[1]).join() === 'NOT_STARTED')
cek('process.env dibaca SEKALI di service (NODE_ENV untuk definisi beku), tidak di modul pendukung', (svc.match(/process\.env/g) ?? []).length === 1 && /jenisWaKlien\(process\.env\.NODE_ENV\)/.test(svc) && !/process\.env/.test(stop + chk))
cek('kind/kelas/peran/subjek/TTL HANYA dari turunan definisi (tanpa literal di service)', !/'CLIENT_WA_UPDATE'|'EXTERNAL_COMMUNICATION'|expiresAt: new Date|kedaluwarsaJam/.test(svc) && /kind: turunan\.kind/.test(svc) && /actionRisk: turunan\.actionRisk/.test(svc) && /requiredRoles: turunan\.requiredRoles/.test(svc) && /expiresAt: turunan\.expiresAt/.test(svc) && /subjectType: turunan\.subjectType/.test(svc))
cek('SATU pembuat TahApprovalRequest; idempotencyKey = AWALAN WA2: + messageId', (svc.match(/tahApprovalRequest\.create\(/g) ?? []).length === 1 && /`\$\{AWALAN_IDEMPOTENSI_APPROVAL_PESAN_KLIEN\}\$\{m\.id\}`/.test(svc) && K.AWALAN_IDEMPOTENSI_APPROVAL_PESAN_KLIEN === 'WA2:')
cek('proposalHash = sidik snapshot; basisFingerprint = sidik sumber; checker menyodorkan proposalHash', /proposalHash: m\.snapshotFingerprint/.test(svc) && /basisFingerprint: m\.sourceFingerprint/.test(svc) && /sodoran !== a\.proposalHash/.test(svc))
cek('usulan approval memakai nomor SAMARAN (tanpa nomor utuh)', (() => {
  const usulan = svc.slice(svc.indexOf('const proposal = {'), svc.indexOf('if (!jsonMuat(proposal'))
  return /recipientMasked: samarkanNomor\(m\.recipientE164Snapshot\)/.test(usulan) && (usulan.match(/recipientE164Snapshot/g) ?? []).length === 1 && !/e164/.test(usulan)
})())
cek('otorisasi checker (dengan pencatat bukti) SEBELUM mutasi apa pun di siapkanKeputusan', (() => {
  const f = svc.slice(svc.indexOf('async function siapkanKeputusan'), svc.indexOf('async function kunciUlang'))
  return /otorisasiCheckerBuktiWaKlien/.test(f) && !/updateMany|create\(|hentikan|catatAudit/.test(f)
})())
cek('K7: bukti evaluasi ulang dibandingkan dengan bukti snapshot → EVIDENCE_CHANGED', /verdictStabil\(freshness\)\) !== jsonKanonikKomunikasi\(verdictStabil\(m\.freshnessVerdict\)\)\) return tahan\('EVIDENCE_CHANGED'\)/.test(svc))
cek('K2: pemetaan freshness gagal memakai ALASAN_FRESHNESS_BLOCKED (selain itu NEEDS_REVIEW)', /ALASAN_FRESHNESS_BLOCKED as readonly string\[\]\)\.includes\(a\) \? blokir\(a\) : tahan\(a\)/.test(svc))
cek('penahanan pesan: approval DIHENTIKAN dulu baru pesan diubah (approval → pesan)', (() => {
  const f = svc.slice(svc.indexOf('async function tahanPesan'), svc.indexOf('// ================================================================ permintaan'))
  return f.indexOf('hentikanApprovalPesan') > -1 && f.indexOf('hentikanApprovalPesan') < f.indexOf('waClientMessage.updateMany')
})())
cek('keputusan: kunci kandidat → kunci approval → jam SESUDAH kunci → revalidasi penuh dengan jam itu → maker-checker → tulis approval → tulis pesan', (() => {
  const f = svc.slice(svc.indexOf('export async function setujuiPesanKlien'), svc.indexOf('export async function tolakPesanKlien'))
  const i = ['await kunciCandidate(tx, rv.c)', 'const k = await kunciUlang(ctx, tx, s)', 'const akhir = new Date()', 'const rvAkhir = await revalidasiPesan(ctx, tx, s.m, akhir)', 'otorisasiCheckerBuktiWaKlien', 'tahApprovalRequest.updateMany', 'waClientMessage.updateMany'].reduce((acc, x) => [...acc, f.indexOf(x, acc.length ? acc[acc.length - 1] + 1 : 0)], [])
  return i.every((x) => x > -1)
})())
cek('perbaikan #1: SEMUA syarat waktu (TTL + revalidasi penuh) memakai jam keputusan `akhir`; APPROVED tertulis dengan jam itu', (() => {
  const f = svc.slice(svc.indexOf('export async function setujuiPesanKlien'), svc.indexOf('export async function tolakPesanKlien'))
  return /approvalWaKlienKedaluwarsa\(\{ status: 'PENDING', expiresAt: s\.a\.expiresAt as Date \}, akhir\)/.test(f) && /revalidasiPesan\(ctx, tx, s\.m, akhir\)/.test(f) && /decidedAt: akhir/.test(f) && /approvedAt: akhir/.test(f) && f.indexOf('revalidasiPesan(ctx, tx, s.m, akhir)') < f.indexOf('tahApprovalRequest.updateMany')
})())
cek('temuan P2: tolak memeriksa TTL ulang dengan jam SESUDAH kunci approval dan memakai jam itu untuk semua timestamp', (() => {
  const f = svc.slice(svc.indexOf('export async function tolakPesanKlien'), svc.indexOf('export type HasilBatalPesanKlien'))
  const i = ['const k = await kunciUlang(ctx, tx, s)', 'const akhir = new Date()', "approvalWaKlienKedaluwarsa({ status: 'PENDING', expiresAt: s.a.expiresAt as Date }, akhir)) return kedaluwarsakan(ctx, tx, s, akhir)", 'tahApprovalRequest.updateMany', 'waClientMessage.updateMany'].reduce((acc, x) => [...acc, f.indexOf(x, acc.length ? acc[acc.length - 1] + 1 : 0)], [])
  return i.every((x) => x > -1) && /decidedAt: akhir, decisionNote: catatan, finalizedAt: akhir/.test(f) && /finalizedAt: akhir, version/.test(f.slice(f.indexOf('waClientMessage.updateMany'))) && !/(decidedAt|finalizedAt): sekarang/.test(f)
})())
cek('penghenti approval = hentikanApprovalTertaut WA-1 (lewat bridge), subjek diperiksa, baris dikunci FOR UPDATE', /from '\.\/wa1-bridge'/.test(stop) && /hentikanApprovalTertaut\(ctx, tx, a\.id, mode, alasan\)/.test(stop) && /a\.subjectType !== SUBJEK_APPROVAL_PESAN_KLIEN \|\| a\.subjectId !== messageId/.test(stop) && /FROM "TahApprovalRequest"\s+WHERE "id" = \$\{approvalRequestId\} AND "tenantId" = \$\{tenantId\} FOR UPDATE/.test(stop))
const rawSemua = [...SEMUA_F4.matchAll(/\$queryRaw(?:<[^>]*>)?\(Prisma\.sql`([\s\S]*?)`\)/g)].map((m) => m[1])
cek('SQL mentah F4 & modul pemeriksaan selalu menyaring "tenantId" (parameter Prisma.sql, tanpa Unsafe)', rawSemua.length >= 8 && rawSemua.every((q) => /"tenantId" = \$\{(ctx\.)?tenantId\}/.test(q)) && !/Unsafe/.test(SEMUA_F4), `${rawSemua.length} pernyataan`)
const bridge = tanpaKomentar(baca('src/services/whatsapp/wa1-bridge.ts'))
cek('bridge: tambahan TEPAT hentikanApprovalTertaut dari modul WA-1 yang sudah disetujui', /hentikanApprovalTertaut,/.test(bridge) && [...bridge.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort().join() === '@/services/communication/comm-hash,@/services/communication/comm-policy,@/services/communication/communication.service')
const msvc = tanpaKomentar(baca('src/services/whatsapp/wa-message.service.ts'))
cek('revisi: approval tertaut revisi lama dihentikan SUPERSEDED (tak lagi ditolak diam-diam)', /hentikanApprovalPesan\(ctx, tx, aktif\.id, aktif\.approvalRequestId, 'SUPERSEDED', 'REVISION_SUPERSEDED'\)/.test(msvc) && !/aktif\.approvalRequestId !== null/.test(msvc))
cek('milestone: Voyage dikunci FOR SHARE SEBELUM peristiwa dibaca (pasangan K1)', /SELECT "id" FROM "Voyage" WHERE "id" = \$\{c\.voyageId\} AND "tenantId" = \$\{ctx\.tenantId\} FOR SHARE`\)\s*\n\s*const ev = /.test(chk))

// ============================================================================ S2
bagian('[S2] K1 — semua jalur tulis VoyageEvent terkunci')
const semuaSrc = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter((f) => /\.(ts|tsx)$/.test(f))
const penulis = semuaSrc.filter((f) => /voyageEvent\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|(INSERT INTO|UPDATE|DELETE FROM)\s+"VoyageEvent"/.test(baca(f)))
cek('penulis VoyageEvent di src = PERSIS src/services/ops/voyage-event.service.ts', penulis.join() === 'src/services/ops/voyage-event.service.ts', penulis.join())
const ve = tanpaKomentar(baca('src/services/ops/voyage-event.service.ts'))
cek('kunci: Voyage FOR NO KEY UPDATE, ber-tenant, voyage tak terhapus', /SELECT "id" FROM "Voyage" WHERE "id" = \$\{voyageId\} AND "tenantId" = \$\{ctx\.tenantId\} AND "deletedAt" IS NULL FOR NO KEY UPDATE/.test(ve))
const tulis = [...ve.matchAll(/voyageEvent\.(create|updateMany)\(/g)]
cek('create & soft-delete: masing-masing di dalam $transaction, kunci Voyage DULU', tulis.length === 2 && tulis.every((m) => {
  const sebelum = ve.slice(0, m.index)
  const tx = sebelum.lastIndexOf('forTenant(ctx).$transaction(async (tx) => {')
  return tx > -1 && /^\s*await kunciVoyageUntukPeristiwa\(tx, ctx, voyageId\)\s*\n\s*return tx\.$/.test(sebelum.slice(tx + 'forTenant(ctx).$transaction(async (tx) => {'.length))
}))
cek('perilaku API: validasi & galat lama dipertahankan (peran, langganan, voyage, kode, waktu, port call)', /requireRole\(ctx, \.\.\.PERAN_KELOLA_PERISTIWA\)\s*\n\s*await pastikanLanggananAktif\(ctx\)\s*\n\s*await pastikanVoyageMilikTenant\(ctx, voyageId\)/.test(ve) && /throw notFound\('Peristiwa'\)/.test(ve) && /Kode peristiwa tidak dikenal/.test(ve) && /throw notFound\('Port call'\)/.test(ve))

// ============================================================================ S3
bagian('[S3] K3 — hold menghentikan approval tertaut')
const holdBerkas = { 'src/services/whatsapp/wa-contact.service.ts': ['tahanPesanTertunda', 2], 'src/services/whatsapp/wa-consent.service.ts': ['tahanPesanTertunda', 2], 'src/services/whatsapp/wa-grant.service.ts': ['tahanPesanGrant', 1] }
for (const [f, [fn, n]] of Object.entries(holdBerkas)) {
  const b = tanpaKomentar(baca(f)).split('\n')
  const panggil = b.map((l, i) => (l.includes(`await ${fn}(`) ? i : -1)).filter((i) => i >= 0)
  cek(`${f.split('/').pop()}: ${n} hold, masing-masing TEPAT didahului hentikanApprovalPesanDitahan`, panggil.length === n && panggil.every((i) => /^\s*await hentikanApprovalPesanDitahan\(ctx, tx, \{ (contactId: id|grantId: gid) \}, '[A-Z_]+'\)$/.test(b[i - 1])))
}
cek('tidak ada pemanggil hold lain di src (semua tercakup)', semuaSrc.filter((f) => /tahanPesan(Tertunda|Grant)\(/.test(baca(f)) && !f.endsWith('wa-lock.ts')).sort().join() === Object.keys(holdBerkas).sort().join())
cek('pemilih pesan hold = kriteria tahanPesan* (contactId / grantIdSnapshot), status PENDING_APPROVAL/APPROVED ber-approval', /"contactId" = \$\{kunci\.contactId\}/.test(stop) && /"grantIdSnapshot" = \$\{kunci\.grantId\}/.test(stop) && /"state" IN \('PENDING_APPROVAL', 'APPROVED'\)/.test(stop))

// ============================================================================ S4
bagian('[S4] Lingkup F4')
const berubah = execFileSync('git', ['diff', '--no-renames', '--name-only', 'main'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const baru = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const BOLEH = new Set([
  'src/services/whatsapp/wa-message-approval.service.ts', 'src/services/whatsapp/wa-approval-stop.ts', 'src/services/whatsapp/wa-message-check.ts',
  'src/services/whatsapp/wa-approval-def.ts', 'src/services/whatsapp/wa2-policy.ts', 'src/services/whatsapp/wa1-bridge.ts', 'src/services/whatsapp/wa-message.service.ts',
  'src/services/whatsapp/wa-contact.service.ts', 'src/services/whatsapp/wa-consent.service.ts', 'src/services/whatsapp/wa-grant.service.ts', 'src/services/ops/voyage-event.service.ts',
  'prisma/check-comm-policy.mjs', 'prisma/check-wa2a-contact.mjs', 'prisma/check-wa2a-access.mjs', 'prisma/check-wa2a-message-f3.mjs', 'prisma/check-wa2a-message-policy.mjs',
  'prisma/check-wa2a-template.mjs', 'prisma/check-wa2a-schema.mjs', 'prisma/check-wa2a-approval-f4.mjs', 'prisma/check-wa2a-approval-f4-db.mjs', 'docs/whatsapp/WA-2a-F4-EVIDENCE.md', 'prisma/check-voyage-event-api.mjs',
])
const semua = [...new Set([...berubah, ...baru])]
cek('hanya berkas F4 yang disetujui (path persis) yang berubah/baru', semua.every((f) => BOLEH.has(f)), semua.filter((f) => !BOLEH.has(f)).join(', ') || `${semua.length} berkas`)
cek('WA-1 (src/services/communication), TAH, intake, V3, schema, migrasi, rollback, template v1, gerbang & kunci 2C: TIDAK berubah', !semua.some((f) => /^src\/services\/(communication|tah|intake)\/|^prisma\/(migrations|rollback)\/|^prisma\/schema\.prisma$|check-validator|wa-template\.ts$|wa2-gate\.ts$|wa-lock\.ts$|wa-access-resolver\.ts$|wa-freshness\.ts$/.test(f)))
cek('tanpa route API / UI baru (F4 hanya service)', !semua.some((f) => /^src\/app\//.test(f)))
cek('wa2-policy.ts hanya ditambah (tanpa baris dihapus)', !/^-(?!--)/m.test(execFileSync('git', ['diff', 'main', '--', 'src/services/whatsapp/wa2-policy.ts'], { cwd: AKAR, encoding: 'utf8' })))
cek('relatif: pemindai lingkup bekerja (menemukan berkas F4)', semua.includes(SVC) && relative(AKAR, join(AKAR, SVC)) === SVC)
void readdirSync

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
