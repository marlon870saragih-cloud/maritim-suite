// Uji STATIS + MURNI WA-2a Step 2F (F3) — evaluator freshness D6, pemilihan grant (D-GRANT), adapter WA-1,
// urutan kunci & gerbang service draft/preview/konfirmasi, serta bukti WA-1 & resolver tidak berubah kriterianya.
// Tanpa DB/jaringan.
//
// Jalankan: node prisma/check-wa2a-message-f3.mjs

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
const F = jiti('../src/services/whatsapp/wa-freshness.ts')
const M = jiti('../src/services/whatsapp/wa-message-policy.ts')
const tanpaKomentar = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const sha = (s) => createHash('sha256').update(s).digest('hex')
const JAM = 3_600_000
const T0 = new Date('2026-10-11T08:00:00.000Z')
const lalu = (ms) => new Date(T0.getTime() - ms)
const KODE = [...K.KODE_ALASAN_WA2F3, 'FRESHNESS_RULE_MISSING']

// ============================================================================ F1
bagian('[F1] D6-A jadwal — konfirmasi staf ≤ 12 jam')
const kf = (ubah = {}) => ({ id: 'k1', field: 'eta', nilai: '2026-10-15', confirmedAt: lalu(JAM), confirmedByUserId: 'u-konf', invalidatedAt: null, ...ubah })
const jd = (ubah = {}) => ({ perubahan: [{ medan: 'eta', baru: '2026-10-15' }], nilaiVoyageKini: { eta: '2026-10-15', etd: '2026-10-17' }, sumberDicatatPada: lalu(2 * JAM), konfirmasi: [kf()], sekarang: T0, ...ubah })
const vj = (ubah) => F.nilaiFreshnessJadwal(jd(ubah))
const ok = vj()
cek('bukti sah → LOLOS D6A, maksJam 12, bukti konfirmasi + pencatat', ok.status === 'LOLOS' && ok.aturan === 'D6A_KONFIRMASI_STAF' && ok.maksJam === 12 && ok.alasan === null && ok.bukti.konfirmasi[0].id === 'k1' && ok.bukti.konfirmasi[0].confirmedByUserId === 'u-konf')
cek('BATAS: umur tepat 12 jam → LOLOS', vj({ konfirmasi: [kf({ confirmedAt: lalu(12 * JAM) })], sumberDicatatPada: lalu(13 * JAM) }).status === 'LOLOS')
cek('BATAS: umur 12 jam + 1 ms → CONFIRMATION_EXPIRED', vj({ konfirmasi: [kf({ confirmedAt: lalu(12 * JAM + 1) })], sumberDicatatPada: lalu(13 * JAM) }).alasan === 'CONFIRMATION_EXPIRED')
cek('BATAS: konfirmasi = waktu AuditLog sumber → LOLOS', vj({ sumberDicatatPada: lalu(JAM) }).status === 'LOLOS')
cek('BATAS: konfirmasi 1 ms sebelum AuditLog sumber → CONFIRMATION_BEFORE_SOURCE', vj({ sumberDicatatPada: new Date(lalu(JAM).getTime() + 1) }).alasan === 'CONFIRMATION_BEFORE_SOURCE')
cek('BATAS: konfirmasi = sekarang → LOLOS; sekarang + 1 ms → CONFIRMATION_IN_FUTURE', vj({ konfirmasi: [kf({ confirmedAt: T0 })] }).status === 'LOLOS' && vj({ konfirmasi: [kf({ confirmedAt: new Date(T0.getTime() + 1) })] }).alasan === 'CONFIRMATION_IN_FUTURE')
cek('tanpa konfirmasi → CONFIRMATION_MISSING; konfirmasi medan lain (etd) tak dihitung', vj({ konfirmasi: [] }).alasan === 'CONFIRMATION_MISSING' && vj({ konfirmasi: [kf({ field: 'etd' })] }).alasan === 'CONFIRMATION_MISSING')
cek('hanya konfirmasi diinvalidasi → CONFIRMATION_INVALIDATED', vj({ konfirmasi: [kf({ invalidatedAt: lalu(1) })] }).alasan === 'CONFIRMATION_INVALIDATED')
cek('nilai konfirmasi ≠ nilai baru → CONFIRMATION_VALUE_MISMATCH', vj({ konfirmasi: [kf({ nilai: '2026-10-16' })] }).alasan === 'CONFIRMATION_VALUE_MISMATCH')
cek('nilai voyage terkini ≠ nilai baru (sumber berubah) → SOURCE_CHANGED', vj({ nilaiVoyageKini: { eta: '2026-10-19', etd: null } }).alasan === 'SOURCE_CHANGED')
cek('ETA & ETD berubah: salah satu tanpa konfirmasi → CONFIRMATION_MISSING; keduanya ada → LOLOS (2 bukti)', vj({ perubahan: [{ medan: 'eta', baru: '2026-10-15' }, { medan: 'etd', baru: '2026-10-17' }] }).alasan === 'CONFIRMATION_MISSING' && vj({ perubahan: [{ medan: 'eta', baru: '2026-10-15' }, { medan: 'etd', baru: '2026-10-17' }], konfirmasi: [kf(), kf({ id: 'k2', field: 'etd', nilai: '2026-10-17' })] }).bukti.konfirmasi.length === 2)
const banyak = vj({ konfirmasi: [kf({ id: 'k9', confirmedAt: lalu(3 * JAM), }), kf({ id: 'k5', confirmedAt: lalu(JAM / 2) }), kf({ id: 'k3', confirmedAt: lalu(JAM / 2) })], sumberDicatatPada: lalu(4 * JAM) })
cek('beberapa konfirmasi sah → yang TERBARU; seri → id terkecil (deterministik)', banyak.bukti.konfirmasi[0].id === 'k3')
cek('campuran: diinvalidasi diabaikan, yang aktif & cocok dipakai', vj({ konfirmasi: [kf({ id: 'kx', invalidatedAt: lalu(1), confirmedAt: lalu(10) }), kf({ id: 'ky' })] }).bukti.konfirmasi[0].id === 'ky')
cek('input tidak sah (jam rusak / tanpa perubahan / medan asing / konfirmasi bukan larik) → FRESHNESS_EVIDENCE_MISSING', [{ sekarang: new Date('x') }, { perubahan: [] }, { perubahan: [{ medan: 'etb', baru: '2026-10-15' }] }, { konfirmasi: null }, { sumberDicatatPada: null }].every((u) => vj(u).alasan === 'FRESHNESS_EVIDENCE_MISSING'))

bagian('[F2] D6-B milestone — VoyageEvent MANUAL ≤ 24 jam, tanpa ganda')
const pe = (ubah = {}) => ({ id: 'e1', voyageId: 'v1', eventCode: 'ALL_FAST', occurredAt: lalu(2 * JAM), source: 'MANUAL', deletedAt: null, portCallId: null, recordedByUserId: 'u-catat', ...ubah })
const vm = (ubah = {}, keluarga = 'ALL_FAST') => F.nilaiFreshnessMilestone({ keluarga, peristiwa: pe(ubah.p), peristiwaAktifLain: ubah.lain ?? [], sekarang: ubah.sekarang ?? T0 })
const okm = vm()
cek('bukti sah → LOLOS D6B, maksJam 24, bukti pencatat', okm.status === 'LOLOS' && okm.aturan === 'D6B_MANUAL' && okm.maksJam === 24 && okm.bukti.eventId === 'e1' && okm.bukti.recordedByUserId === 'u-catat')
cek('BATAS: tepat 24 jam → LOLOS; 24 jam + 1 ms → EVENT_TOO_OLD', vm({ p: { occurredAt: lalu(24 * JAM) } }).status === 'LOLOS' && vm({ p: { occurredAt: lalu(24 * JAM + 1) } }).alasan === 'EVENT_TOO_OLD')
cek('BATAS: kejadian = sekarang → LOLOS; sekarang + 1 ms → EVENT_IN_FUTURE', vm({ p: { occurredAt: T0 } }).status === 'LOLOS' && vm({ p: { occurredAt: new Date(T0.getTime() + 1) } }).alasan === 'EVENT_IN_FUTURE')
cek('sumber IMPORT / SYSTEM → EVENT_SOURCE_NOT_MANUAL', ['IMPORT', 'SYSTEM', 'manual'].every((s) => vm({ p: { source: s } }).alasan === 'EVENT_SOURCE_NOT_MANUAL'))
cek('dihapus → EVENT_DELETED; kode ≠ keluarga → EVENT_NOT_ALLOWED', vm({ p: { deletedAt: lalu(1) } }).alasan === 'EVENT_DELETED' && vm({ p: { eventCode: 'EOSP' } }).alasan === 'EVENT_NOT_ALLOWED')
cek('GANDA: kode sama, port call null = null → EVENT_DUPLICATE', vm({ lain: [{ id: 'e2', eventCode: 'ALL_FAST', portCallId: null }] }).alasan === 'EVENT_DUPLICATE')
cek('GANDA: kode sama, port call sama → EVENT_DUPLICATE', vm({ p: { portCallId: 'pc1' }, lain: [{ id: 'e2', eventCode: 'ALL_FAST', portCallId: 'pc1' }] }).alasan === 'EVENT_DUPLICATE')
cek('BUKAN ganda: port call berbeda / null vs terisi / kode berbeda / dirinya sendiri', vm({ p: { portCallId: 'pc1' }, lain: [{ id: 'e2', eventCode: 'ALL_FAST', portCallId: 'pc2' }] }).status === 'LOLOS' && vm({ lain: [{ id: 'e2', eventCode: 'ALL_FAST', portCallId: 'pc1' }] }).status === 'LOLOS' && vm({ lain: [{ id: 'e2', eventCode: 'SAILED', portCallId: null }] }).status === 'LOLOS' && vm({ lain: [{ id: 'e1', eventCode: 'ALL_FAST', portCallId: null }] }).status === 'LOLOS')
cek('keluarga jadwal/tak dikenal di evaluator milestone → FRESHNESS_RULE_MISSING; tanpa peristiwa → FRESHNESS_EVIDENCE_MISSING', vm({}, 'SCHEDULE_CHANGE').alasan === 'FRESHNESS_RULE_MISSING' && vm({}, 'NOR').alasan === 'FRESHNESS_RULE_MISSING' && F.nilaiFreshnessMilestone({ keluarga: 'EOSP', peristiwa: null, peristiwaAktifLain: [], sekarang: T0 }).alasan === 'FRESHNESS_EVIDENCE_MISSING')
const semuaVerdict = [ok, okm, vj({ konfirmasi: [] }), vm({ p: { source: 'IMPORT' } })]
cek('verdict dapat diserialisasi JSON; kode ⊆ KODE_ALASAN_WA2F3 ∪ FRESHNESS_RULE_MISSING', semuaVerdict.every((v) => JSON.stringify(JSON.parse(JSON.stringify(v))) === JSON.stringify(v) && (v.alasan === null || KODE.includes(v.alasan))))
cek('ambang hanya dari konstanta wa2-policy (tanpa angka jam tertulis di evaluator)', !/\b(12|24)\s*\*|\b(43200000|86400000)\b/.test(tanpaKomentar(baca('src/services/whatsapp/wa-freshness.ts'))) && K.MAKS_JAM_KONFIRMASI_JADWAL === 12 && K.MAKS_JAM_MILESTONE_PROAKTIF === 24)

// ============================================================================ G
bagian('[G] D-GRANT — pemilihan grant snapshot')
const g = (id, kategori, jamLagi) => ({ grantId: id, kategori, validUntil: new Date(T0.getTime() + jamLagi * JAM).toISOString() })
const daftar = [g('g-b', ['MILESTONE'], 100), g('g-a', ['MILESTONE', 'STATUS'], 500), g('g-c', ['STATUS'], 900)]
const p1 = M.pilihGrantUntukPesan(daftar, 'MILESTONE', T0)
cek('masa berlaku terpanjang di antara grant BERKATEGORI (bukan grant pertama, bukan grant salah kategori)', p1.ok && p1.grantId === 'g-a' && p1.kandidat.join() === 'g-a,g-b' && p1.aturan === K.ATURAN_PILIH_GRANT)
cek('urutan input tidak berpengaruh (50 acakan → hasil sama)', Array.from({ length: 50 }, () => M.pilihGrantUntukPesan([...daftar].sort(() => Math.random() - 0.5), 'MILESTONE', T0).grantId).every((x) => x === 'g-a'))
cek('masa berlaku sama → grantId terkecil', M.pilihGrantUntukPesan([g('g-z', ['MILESTONE'], 50), g('g-m', ['MILESTONE'], 50)], 'MILESTONE', T0).grantId === 'g-m')
cek('tanpa kategori wajib → CATEGORY_NOT_GRANTED', M.pilihGrantUntukPesan([g('g-c', ['STATUS'], 900)], 'MILESTONE', T0).alasan === 'CATEGORY_NOT_GRANTED')
cek('berkategori tetapi kedaluwarsa (validUntil ≤ sekarang) → GRANT_NOT_ELIGIBLE', M.pilihGrantUntukPesan([g('g-x', ['MILESTONE'], 0), g('g-y', ['MILESTONE'], -1)], 'MILESTONE', T0).alasan === 'GRANT_NOT_ELIGIBLE')
cek('kosong / bukan larik / jam rusak → ditolak', M.pilihGrantUntukPesan([], 'MILESTONE', T0).ok === false && M.pilihGrantUntukPesan(null, 'MILESTONE', T0).ok === false && M.pilihGrantUntukPesan(daftar, 'MILESTONE', new Date('x')).ok === false)
cek('kategori wajib: jadwal → SCHEDULE_ESTIMATE (termasuk nilai lama); milestone → MILESTONE; tak dikenal → null', M.kategoriWajibUntuk('SCHEDULE_CHANGE') === 'SCHEDULE_ESTIMATE' && ['EOSP', 'ALL_FAST', 'SAILED'].every((k) => M.kategoriWajibUntuk(k) === 'MILESTONE') && M.kategoriWajibUntuk('X') === null)

// ============================================================================ S
bagian('[S1] Adapter WA-1 & tanpa duplikasi')
const bridge = tanpaKomentar(baca('src/services/whatsapp/wa1-bridge.ts'))
const impBridge = [...bridge.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]).sort()
cek('adapter hanya meneruskan 3 modul WA-1 (alias @/ — terdeteksi uji beku perujuk)', impBridge.join() === ['@/services/communication/comm-hash', '@/services/communication/comm-policy', '@/services/communication/communication.service'].join())
cek('adapter: hanya ekspor ulang (tanpa logika), tanpa gerbang/flag WA-1, tanpa approval/Send/template/blokir', /^\s*(export \{[\s\S]*?\} from '[^']+'\s*)+$/.test(bridge) && !/process\.env|gerbang|tahApproval|Send|renderPesan|TEMPLATE|blokirCandidate|hentikanApproval/.test(bridge))
const dirWa = join(AKAR, 'src/services/whatsapp')
const berkasWa = readdirSync(dirWa).filter((f) => f.endsWith('.ts'))
cek('tak ada berkas WA-2 yang menyebut nama tabel komunikasi WA-1 (pagar check-comm-schema)', berkasWa.every((f) => !/communicationCandidate|communicationMessage|communicationAttempt/.test(readFileSync(join(dirWa, f), 'utf8'))), berkasWa.filter((f) => /communicationCandidate|communicationMessage|communicationAttempt/.test(readFileSync(join(dirWa, f), 'utf8'))).join())
cek('tak ada pembuat TahApprovalRequest di WA-2 (approval = F4)', berkasWa.every((f) => !/tahApprovalRequest\.create/.test(readFileSync(join(dirWa, f), 'utf8'))))
const svcWa1 = baca('src/services/communication/communication.service.ts')
const svcWa1Main = execFileSync('git', ['show', 'main:src/services/communication/communication.service.ts'], { cwd: AKAR, encoding: 'utf8' })
const potong = (s, awal) => s.slice(s.indexOf(awal), s.indexOf('\n}\n', s.indexOf(awal)) + 2)
cek('WA-1: badan siapkanCandidate IDENTIK dengan main (gerbang WA-1 tetap di jalur WA-1)', sha(potong(svcWa1, 'export async function siapkanCandidate(')) === sha(potong(svcWa1Main, 'export async function siapkanCandidate(')))
cek('WA-1: badan siapkanDalamTx IDENTIK dengan main (hanya kata `export` ditambahkan)', sha(potong(svcWa1, 'export async function siapkanDalamTx(').replace(/^export /, '')) === sha(potong(svcWa1Main, 'async function siapkanDalamTx(')))
cek('WA-1: process.env tetap hanya di gerbang WA-1 (sekali)', [...svcWa1.matchAll(/process\.env/g)].length === 1)
const res = baca('src/services/whatsapp/wa-access-resolver.ts')
const resMain = execFileSync('git', ['show', 'main:src/services/whatsapp/wa-access-resolver.ts'], { cwd: AKAR, encoding: 'utf8' })
const klausa = (s) => [...s.matchAll(/(FROM "[\s\S]*?FOR SHARE(?: OF g, v)?)`/g)].map((m) => m[1])
cek('D-GRANT: kriteria akses resolver (FROM … WHERE … FOR SHARE) IDENTIK dengan main — hanya kolom SELECT ditambah', klausa(res).join('\n') === klausa(resMain).join('\n') && klausa(res).length === 4)

bagian('[S2] Service draft/preview/konfirmasi — gerbang, urutan kunci, audit')
const ms = tanpaKomentar(baca('src/services/whatsapp/wa-message.service.ts'))
const kj = tanpaKomentar(baca('src/services/whatsapp/wa-schedule-confirmation.service.ts'))
const pertama = (src) => {
  const b = src.split('\n')
  return b.map((l, i) => (/^export async function \w+\(/.test(l) ? { nama: l.match(/function (\w+)/)[1], p: (b.slice(i + 1).find((x) => x.trim() !== '') ?? '').trim() } : null)).filter(Boolean)
}
const pub = pertama(ms)
cek('fungsi publik draft & preview diawali gerbangWa2(ctx)', pub.length === 2 && pub.every((f) => f.p === 'gerbangWa2(ctx)'), pub.map((f) => f.nama).join(','))
cek('fungsi publik konfirmasi diawali pemeriksaan pencatat (gerbang + peran)', pertama(kj).every((f) => f.p === 'pastikanPencatat(ctx)') && /gerbangWa2\(ctx\)\s*\n\s*if \(!\(PERAN_PENCATAT_KONFIRMASI_JADWAL/.test(kj))
const d = ms.slice(ms.indexOf('async function draftDalamTx'), ms.indexOf('export type HasilPratinjauPesanKlien'))
const urutan = ['klasifikasiSinyal(', 'periksaKontak(', 'kunciConsent(', 'periksaAkses(', 'siapkanCandidateDalamTx(', 'revalidasiCandidate(', 'nilaiFreshnessDb(', 'syaratDataApproval(', 'renderPesanKlien(', 'kunciCandidate(', 'waClientMessage.create(']
const pos = urutan.map((x) => d.indexOf(x))
cek('draft: kontak → consent → akses/grant SEBELUM Prepare; freshness & syarat data sebelum render; kunci kandidat sebelum tulis pesan', pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), urutan.map((x, i) => `${x}${pos[i]}`).join(' '))
cek('draft: penolakan dengan throw (rollback utuh, termasuk tulisan Prepare)', !/return \{ hasil: 'DITOLAK/.test(d) && /throw tolak\('SOURCE_INVALID'/.test(d) && /throw tolak\(freshness\.alasan/.test(d))
cek('jalur WA-2 TIDAK pernah memblokir kandidat WA-1 (tanpa blokirCandidate)', !/blokirCandidate/.test(ms))
cek('audit WA-2 tanpa nomor utuh & tanpa body', [...ms.matchAll(/catatAudit\([\s\S]*?\}, \{\}, tx\)/g)].every((m) => !/e164|recipientE164|\bbody\b|pesan\.body/.test(m[0])))
cek('audit WA-2 tidak ditulis ke tabel kandidat WA-1 (riwayat WA-1 membaca tabel itu)', !/tableName: 'CommunicationCandidate'/.test(ms))
const pv = ms.slice(ms.indexOf('export async function pratinjauPesanKlien'))
cek('preview: sidik sodoran, sidik dihitung ulang, kontak, consent+versi, akses+grant snapshot, kandidat, sumber, freshness — semuanya diperiksa', ['sodoran !== m.snapshotFingerprint', 'sidikSnapshotKlien(', 'periksaKontak(', 'consent.version !== m.consentStateVersion', 'periksaAkses(t, ctx, pk.k, c.voyageId, kategori, sekarang, m.grantIdSnapshot)', "c.state !== 'ACTIVE'", 'revalidasiCandidate(', 'rv.sourceFingerprint !== m.sourceFingerprint', 'nilaiFreshnessDb('].every((x) => pv.includes(x)))
const catat = kj.slice(kj.indexOf('export async function catatKonfirmasiJadwal'), kj.indexOf('export type HasilInvalidasiKonfirmasi'))
cek('konfirmasi: Voyage dikunci FOR UPDATE (serialisasi), jam diambil SESUDAH kunci, nilai = voyage terkini', /kunciVoyage\(t, ctx\.tenantId, vid, 'UPDATE'\)/.test(catat) && catat.indexOf("kunciVoyage(t, ctx.tenantId, vid, 'UPDATE')") < catat.indexOf('const sekarang = new Date()') && /kunciTanggal\(v\[medan\]\) !== nilai/.test(catat))
cek('SQL mentah F3 selalu bersaring "tenantId" & berparameter (fragmen klausa kunci saja dikecualikan)', [ms, kj].every((src) => [...src.matchAll(/Prisma\.sql`([\s\S]*?)`/g)].every((m) => /^FOR (UPDATE|SHARE)$/.test(m[1].trim()) || /"tenantId" = \$\{(ctx\.)?tenantId\}/.test(m[1]))) && !/\$queryRawUnsafe|\$executeRawUnsafe/.test(ms + kj))
const F3SRC = ['wa-message.service.ts', 'wa-schedule-confirmation.service.ts', 'wa-freshness.ts', 'wa1-bridge.ts'].map((f) => tanpaKomentar(readFileSync(join(dirWa, f), 'utf8'))).join('\n')
cek('tanpa process.env / LLM / jaringan / console di modul F3', !/process\.env|openrouter|lib\/ai|anthropic|fetch\(|node:(http|https|net|tls|dns)|console\./.test(F3SRC))

bagian('[S3] Lingkup F3')
const berubah = execFileSync('git', ['diff', '--name-only', 'main'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const baru = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const BOLEH = new Set([
  'src/services/communication/communication.service.ts', 'src/services/whatsapp/wa1-bridge.ts', 'src/services/whatsapp/wa2-policy.ts', 'src/services/whatsapp/wa-message-policy.ts',
  'src/services/whatsapp/wa-freshness.ts', 'src/services/whatsapp/wa-access-resolver.ts', 'src/services/whatsapp/wa-schedule-confirmation.service.ts', 'src/services/whatsapp/wa-message.service.ts',
  'prisma/check-comm-policy.mjs', 'prisma/check-wa2a-contact.mjs', 'prisma/check-wa2a-access.mjs', 'prisma/check-wa2a-message-policy.mjs', 'prisma/check-wa2a-template.mjs',
  'prisma/check-wa2a-message-f3.mjs', 'prisma/check-wa2a-message-f3-db.mjs', 'docs/whatsapp/WA-2a-F3-EVIDENCE.md',
])
const semua = [...new Set([...berubah, ...baru])]
cek('hanya berkas F3 yang disetujui (path persis) yang berubah/baru', semua.every((f) => BOLEH.has(f)), semua.filter((f) => !BOLEH.has(f)).join(', ') || `${semua.length} berkas`)
cek('tanpa migrasi / schema / rollback / V3 / TAH / template v1 / service 2a-C', !semua.some((f) => /^prisma\/(migrations|rollback)\/|^prisma\/schema\.prisma$|^src\/services\/(tah|intake)\/|wa-template\.ts$|wa-(contact|consent)\.service\.ts$|wa2-gate\.ts$|wa-lock\.ts$/.test(f)))
const diffPol = execFileSync('git', ['diff', 'main', '--', 'src/services/whatsapp/wa2-policy.ts'], { cwd: AKAR, encoding: 'utf8' })
cek('wa2-policy.ts hanya ditambah', !/^-(?!--)/m.test(diffPol))

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
