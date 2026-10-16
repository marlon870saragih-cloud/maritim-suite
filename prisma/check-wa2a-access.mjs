// Uji STATIS + MURNI WA-2a Step 2E (grant principal, resolver, pembaca terbatas) — tanpa DB/jaringan.
//
// Jalankan: node prisma/check-wa2a-access.mjs

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, lapisLingkup, pengecualianCocok } from './wa2a-lingkup.mjs'
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
const GS = jiti('../src/services/whatsapp/wa-grant.service.ts')
const K = jiti('../src/services/whatsapp/wa2-policy.ts')

const tanpaKomentar = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const F = {
  resolver: 'src/services/whatsapp/wa-access-resolver.ts',
  view: 'src/services/whatsapp/wa-voyage-view.ts',
  grant: 'src/services/whatsapp/wa-grant.service.ts',
  lock: 'src/services/whatsapp/wa-lock.ts',
}
const isi = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, tanpaKomentar(baca(f))]))

// ============================================================================ P1
bagian('[P1] Murni — E-3 & kosakata')
const d = new Date('2026-10-10T08:00:00.000Z')
cek('tambahBulan(+12) = tanggal kalender +12 bulan', GS.tambahBulan(d, 12).toISOString() === '2027-10-10T08:00:00.000Z')
cek('E-3: maksimum 12 bulan', K.MAKS_BULAN_GRANT === 12)
cek('E-2: hanya NYATA', K.ASAL_DATA_SAH === 'NYATA')
cek('E-5: CANCELLED tertutup untuk semua; CLOSED+CANCELLED tertutup untuk principal', K.STATUS_VOYAGE_TERTUTUP_UNTUK_SEMUA.join() === 'CANCELLED' && K.STATUS_VOYAGE_TERTUTUP_UNTUK_PRINCIPAL.join() === 'CLOSED,CANCELLED')
cek('E-1: allowlist kolom per kategori = empat kategori grant', Object.keys(K.KOLOM_PER_KATEGORI).sort().join() === [...K.KATEGORI_DATA_GRANT].sort().join())

// ============================================================================ S1
bagian('[S1] Resolver — satu pintu, tanpa cache, tanpa input berbahaya')
cek('resolusiAkses(tx, tenantId, contactId, sekarang) — tanpa vesselId/customerId/principalId/teks pesan sebagai input', /export async function resolusiAkses\(tx: TxMentah, tenantId: string, contactId: string, sekarang: Date\)/.test(isi.resolver))
cek('tidak ada cache tingkat modul (Map/objek/let global) di resolver & pembaca', !/^(let|var) /m.test(isi.resolver + isi.view) && !/^const \w+ = new (Map|Set|WeakMap)/m.test(isi.resolver + isi.view))
cek('resolver mengunci kontak dulu (kunciKontak SHARE) sebelum query lain', isi.resolver.indexOf("kunciKontak(tx, tenantId, contactId, 'SHARE')") > 0 && isi.resolver.indexOf("kunciKontak(tx, tenantId, contactId, 'SHARE')") < isi.resolver.indexOf('FROM "Customer"'))
cek('resolver: semua query FOR SHARE & bersaring "tenantId"', [...isi.resolver.matchAll(/Prisma\.sql`([\s\S]*?)`/g)].every((m) => /FOR SHARE/.test(m[1]) && /"tenantId" = \$\{tenantId\}/.test(m[1])))
cek('resolver: jalur principal mensyaratkan grant ACTIVE milik kontak & principal, validUntil > sekarang, principalId voyage SAAT INI, NYATA, bukan CLOSED/CANCELLED', /g\."status" = 'ACTIVE'/.test(isi.resolver) && /g\."contactId" = \$\{k\.id\}/.test(isi.resolver) && /g\."validUntil" > \$\{sekarang\}/.test(isi.resolver) && /v\."principalId" = \$\{k\.principalId\}/.test(isi.resolver) && /NOT IN \('CLOSED', 'CANCELLED'\)/.test(isi.resolver) && /"dataOrigin" = \$\{ASAL_DATA_SAH\}/.test(isi.resolver))
cek("resolver: jalur customer mengecualikan CANCELLED (CLOSED tetap) & mensyaratkan Customer aktif", /"status" <> 'CANCELLED'/.test(isi.resolver) && /"isActive" = true AND "deletedAt" IS NULL/.test(isi.resolver))
cek('resolver tidak pernah memakai vesselId / kapal untuk akses', !/vessel/i.test(isi.resolver))
// F3 (D-GRANT disetujui owner): + identitas grant dasar akses (id, kategori, validUntil) — tetap TANPA data voyage/kontak.
cek('resolver mengembalikan ID voyage, kategori & identitas grant dasar akses SAJA', /akses: AksesVoyage\[\]/.test(isi.resolver) && /export type AksesVoyage = \{ voyageId: string; kategori: string\[\]; grants: GrantAkses\[\] \}/.test(baca(F.resolver)) && /export type GrantAkses = \{ grantId: string; kategori: string\[\]; validUntil: string \}/.test(baca(F.resolver)))

bagian('[S2] Pembaca terbatas (E-1)')
const selectView = (isi.view.match(/SELECT v\."id"[\s\S]*?FROM "Voyage"/) ?? [''])[0]
const kolomDipilih = [...selectView.matchAll(/v\."(\w+)"|ves\."(\w+)"|p\."(\w+)"/g)].map((m) => m[1] ?? m[2] ?? m[3])
cek('SELECT pembaca hanya kolom allowlist (identitas + status/jadwal) — tanpa notes/customer/principal/biaya', kolomDipilih.length > 0 && kolomDipilih.every((c) => ['id', 'voyageNumber', 'status', 'eta', 'etb', 'etd', 'ata', 'atb', 'atd', 'name', 'timezone'].includes(c)), kolomDipilih.join(','))
cek('pembaca memanggil ulang resolver di transaksi yang sama (tanpa cache)', /const r = await resolusiAkses\(tx, tenantId, contactId, sekarang\)/.test(isi.view))
cek('pembaca: kolom diisi HANYA bila kategorinya diizinkan', /boleh\.has\('STATUS'\)/.test(isi.view) && /boleh\.has\('SCHEDULE_ESTIMATE'\)/.test(isi.view) && /boleh\.has\('SCHEDULE_ACTUAL'\)/.test(isi.view) && /boleh\.has\('MILESTONE'\)/.test(isi.view))
cek('pembaca: ditolak → NOT_FOUND (tak membedakan tidak-ada vs tak-berhak)', /if \(!hasil\) throw notFound\('Voyage'\)/.test(isi.view))

bagian('[S3] Grant service')
const pertama = (src) => {
  const b = src.split('\n')
  return b.map((l, i) => (/^export async function \w+\(/.test(l) ? { nama: l.match(/function (\w+)/)[1], p: (b.slice(i + 1).find((x) => x.trim() !== '') ?? '').trim() } : null)).filter(Boolean)
}
const fnsSemua = [...pertama(baca(F.grant)), ...pertama(baca(F.view))]
const fns = fnsSemua.filter((f) => !f.nama.endsWith('DalamTx'))
cek('setiap fungsi publik (ber-ctx) grant/pembaca diawali gerbangWa2(ctx)', fns.length === 6 && fns.every((f) => f.p === 'gerbangWa2(ctx)'), fns.map((f) => f.nama).join(','))
cek('primitif *DalamTx (untuk 2a-F/WA-2c) WAJIB menerima tx & tenantId, tanpa ctx/gerbang sendiri', /export async function bacaFaktaDalamTx\(tx: TxMentah, tenantId: string, contactId: string, voyageId: string, sekarang: Date\)/.test(isi.view))
const bPutus = isi.grant.slice(isi.grant.indexOf('export async function putuskanGrant'), isi.grant.indexOf('export async function cabutGrant'))
const bCabut = isi.grant.slice(isi.grant.indexOf('export async function cabutGrant'), isi.grant.indexOf('export type StatusGrantEfektif'))
cek('urutan kunci putuskan/cabut: kontak (SHARE) SEBELUM grant (UPDATE)', [bPutus, bCabut].every((b) => b.indexOf('kunciKontak(') > 0 && b.indexOf('kunciKontak(') < b.indexOf('kunciGrant(')))
cek('putuskan: pengaju ≠ pemutus dicek service (selain CHECK DB)', /g\.requestedByUserId === ctx\.userId/.test(bPutus))
cek('putuskan SETUJU: kontak layak + cakupan sah dicek ulang di bawah kunci; tak layak → tanpa ubah state', /kontakLayak\(k, sekarang\)/.test(bPutus) && /voyageSah\(t, ctx\.tenantId, g\.principalId, cakupan\)/.test(bPutus) && /tolakTanpaUbah/.test(bPutus))
cek('E-3: validUntil dihitung dari waktu PERSETUJUAN, maksimum 12 bulan', /const batas = tambahBulan\(sekarang, MAKS_BULAN_GRANT\)/.test(bPutus))
cek('tanpa process.env / console / impor WA-1/TAH/AI/jaringan', !/process\.env|console\.|from '\.\.\/(communication|tah|intake)\/|lib\/ai|fetch\(/.test(isi.grant + isi.resolver + isi.view))
cek('wa-lock: kunciGrant FOR UPDATE + tahanPesanGrant bersaring tenantId', /FROM "WaPrincipalAccessGrant" WHERE "id" = \$\{grantId\} AND "tenantId" = \$\{tenantId\} FOR UPDATE/.test(isi.lock) && /WHERE "tenantId" = \$\{tenantId\} AND "grantIdSnapshot" = \$\{grantId\}/.test(isi.lock))

// Gate lingkup I/H/P (prisma/wa2a-lingkup.mjs, keputusan owner G-D2): basis = merge-base(HEAD, origin/main) GAGAL
// TERTUTUP, perubahan = ter-commit + staged + unstaged + untracked dengan --no-renames (rename = hapus + tambah).
// Pengecualian baris F3/F4 di bawah kini DIBUKTIKAN pada diff historis PR #25/#27 (H); perubahan berjalan pada
// berkas beku hanya boleh lewat tuple manifest (basis, path, blob) — bukan izin permanen.
bagian('[S4] Lingkup Step 2E — berkas beku (P), pengecualian historis (H), invarian (I)')
const L = lapisLingkup(AKAR, { fase: [], env: process.env })
for (const i of L.info) console.log(`  ℹ️  ${i}`)
for (const h of L.hasil) cek(h.nama, h.ok, h.detail)
const F3H = L.manifest?.fase?.F3
const F4H = L.manifest?.fase?.F4
const BEKU = [/^src\/services\/communication\//, /^src\/services\/tah\//, /^src\/services\/intake\//, /^docs\/whatsapp\/PRD-WA-1\.md$/, /^prisma\/check-(comm|tah|validator)/, /^prisma\/migrations\//, /^prisma\/schema\.prisma$/, /^prisma\/rollback\//, /^src\/services\/whatsapp\/wa-(contact|consent)\.service\.ts$/, /^src\/services\/whatsapp\/wa2-gate\.ts$/]
// WA-2a Step 2F F3 — pengecualian lingkup yang DISETUJUI owner (D2), per berkas & per BARIS, tanpa wildcard:
//   communication.service.ts: `export` pada siapkanDalamTx + fungsi baru muatCandidateDalamTx (+ dok);
//   check-comm-policy.mjs: allowlist perujuk +1 adapter WA-2 (src/services/whatsapp/wa1-bridge.ts).
// Berkas beku lain — atau baris lain di dua berkas ini — tetap DITOLAK.
const BARIS_F3 = {
  'src/services/communication/communication.service.ts': {
    hapus: ['async function siapkanDalamTx(ctx: TenantContext, tx: Tx, signalId: string): Promise<HasilSiapkanCandidate> {'],
    tambah: (b) => b === '' || b === '}' || (b.startsWith('/**') && b.endsWith('*/') && /WA-2/.test(b)) || [
      'export async function siapkanDalamTx(ctx: TenantContext, tx: Tx, signalId: string): Promise<HasilSiapkanCandidate> {',
      'export async function muatCandidateDalamTx(tx: Tx, candidateId: string): Promise<CandidateBaris | null> {',
      'return (await tx.communicationCandidate.findFirst({ where: { id: candidateId }, select: PILIH_CANDIDATE })) as CandidateBaris | null',
    ].includes(b),
  },
  'prisma/check-comm-policy.mjs': {
    hapus: ["cek('Step 2I: perujuk modul komunikasi di luar foldernya = PERSIS 11 route API + 5 berkas server UI + 2 komponen client', perujuk.sort().join() === [...harapRute, ...UI_SERVER, ...UI_CLIENT].sort().join(), perujuk.join(', '))"],
    tambah: (b) => b === "// WA-2a Step 2F F3 (pengecualian D2 disetujui owner): SATU adapter WA-2 tepat ini — bukan wildcard." || b === "const WA2_ADAPTER = ['src/services/whatsapp/wa1-bridge.ts']" ||
      b === "cek('Step 2I: perujuk modul komunikasi di luar foldernya = PERSIS 11 route API + 5 berkas server UI + 2 komponen client + 1 adapter WA-2', perujuk.sort().join() === [...harapRute, ...UI_SERVER, ...UI_CLIENT, ...WA2_ADAPTER].sort().join(), perujuk.join(', '))",
  },
}
const diffSesuaiF3 = (f, dari, ke) => {
  const a = BARIS_F3[f]
  if (!a) return false
  const d = git(AKAR, ['diff', '-U0', dari, ke, '--', f]).split('\n').filter((l) => /^[-+](?![-+]{2} )/.test(l))
  const hapus = d.filter((l) => l.startsWith('-')).map((l) => l.slice(1).trim())
  const tambah = d.filter((l) => l.startsWith('+')).map((l) => l.slice(1).trim())
  return hapus.join('\n') === a.hapus.join('\n') && tambah.length > 0 && tambah.every(a.tambah)
}
// WA-2a Step 2F F4 — pengecualian E5 yang DISETUJUI owner: per berkas & per BARIS PERSIS (tanpa trim, tanpa wildcard).
//   check-comm-policy.mjs: asersi pembuat TahApprovalRequest = WA-1 + service approval WA-2 (E1);
//   wa-contact/wa-consent.service.ts (K3): impor + panggilan hentikanApprovalPesanDitahan sebelum tahanPesanTertunda.
const BARIS_F4 = {
  "prisma/check-comm-policy.mjs": {
    hapus: ["  cek('Step 2D R1: SATU-SATUNYA pembuat TahApprovalRequest = service approval WA (tanpa jalur NULL-TTL umum)', pembuatApproval.join() === 'src/services/communication/communication-approval.service.ts', pembuatApproval.join())"],
    tambah: ["  // WA-2a Step 2F F4 (pengecualian E1 disetujui owner): + TEPAT satu pembuat WA-2 ber-TTL (CLIENT_WA_UPDATE) — bukan wildcard.", "  cek('Step 2D R1: pembuat TahApprovalRequest = PERSIS service approval WA-1 + service approval pesan klien WA-2 (F4)', pembuatApproval.sort().join() === ['src/services/communication/communication-approval.service.ts', 'src/services/whatsapp/wa-message-approval.service.ts'].join(), pembuatApproval.join())"],
  },
  "src/services/whatsapp/wa-contact.service.ts": {
    hapus: [],
    tambah: ["import { hentikanApprovalPesanDitahan } from './wa-approval-stop'", "      await hentikanApprovalPesanDitahan(ctx, tx, { contactId: id }, 'CONTACT_INELIGIBLE')", "      await hentikanApprovalPesanDitahan(ctx, tx, { contactId: id }, 'CONTACT_INELIGIBLE')"],
  },
  "src/services/whatsapp/wa-consent.service.ts": {
    hapus: [],
    tambah: ["import { hentikanApprovalPesanDitahan } from './wa-approval-stop'", "        await hentikanApprovalPesanDitahan(ctx, tx, { contactId: id }, 'CONSENT_NOT_GRANTED')", "      await hentikanApprovalPesanDitahan(ctx, tx, { contactId: id }, 'CONSENT_NOT_GRANTED')"],
  },
}
const diffSesuaiF4 = (f, dari, ke) => {
  const a = Object.hasOwn(BARIS_F4, f) ? BARIS_F4[f] : null
  if (!a) return false
  const isi = git(AKAR, ['diff', '--no-renames', '-U0', dari, ke, '--', f]).split('\n').filter((l) => /^[-+]/.test(l) && !/^(---|\+\+\+) (a\/|b\/|\/dev\/null)/.test(l))
  return isi.filter((l) => l.startsWith('-')).map((l) => l.slice(1)).join('\n') === a.hapus.join('\n') && isi.filter((l) => l.startsWith('+')).map((l) => l.slice(1)).join('\n') === a.tambah.join('\n')
}
const bekuDi = (daftar) => daftar.filter((f) => BEKU.some((r) => r.test(f))).sort()
const bekuF3 = bekuDi(F3H?.berkas ?? [])
const bekuF4 = bekuDi(F4H?.berkas ?? [])
cek('H F3: berkas beku pada diff PR #25 = PERSIS berkas pengecualian F3, berubah HANYA pada baris yang disetujui', F3H !== undefined && bekuF3.length > 0 && bekuF3.join() === Object.keys(BARIS_F3).sort().join() && bekuF3.every((f) => diffSesuaiF3(f, F3H.basis, F3H.kepala)), bekuF3.join(', '))
cek('H F4: berkas beku pada diff PR #27 = PERSIS berkas pengecualian F4, berubah HANYA pada baris yang disetujui', F4H !== undefined && bekuF4.length > 0 && bekuF4.join() === Object.keys(BARIS_F4).sort().join() && bekuF4.every((f) => diffSesuaiF4(f, F4H.basis, F4H.kepala)), bekuF4.join(', '))
const basisP = L.basis?.ok ? L.basis.sha : null
const bekuBerjalan = L.perubahan ? bekuDi(L.perubahan.semua) : null
cek('P: tidak ada perubahan WA-1 / TAH / Validator V3 / schema / migrasi / service kontak-consent 2a-C / gerbang terhadap basis (ter-commit, staged, unstaged, untracked, hapus, rename) di luar tuple pengecualian manifest', bekuBerjalan !== null && bekuBerjalan.every((f) => pengecualianCocok(L.manifest, basisP, f, AKAR)), bekuBerjalan === null ? 'basis tidak dapat ditentukan — GAGAL TERTUTUP' : bekuBerjalan.join(', ') || '(tanpa berkas beku)')
const lockDiff = basisP ? git(AKAR, ['diff', '--no-renames', basisP, '--', 'src/services/whatsapp/wa-lock.ts', 'src/services/whatsapp/wa2-policy.ts']) : null
cek('wa-lock.ts & wa2-policy.ts hanya ditambah terhadap basis (tanpa baris dihapus)', lockDiff !== null && !/^-(?!--)/m.test(lockDiff), lockDiff === null ? 'basis tidak dapat ditentukan — GAGAL TERTUTUP' : '')

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
