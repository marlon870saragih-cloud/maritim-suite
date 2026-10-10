// Uji STATIS + MURNI WA-2a Step 2C (kontak & consent) — tanpa DB, tanpa jaringan.
//
// Jalankan: node prisma/check-wa2a-contact.mjs
//
// Lapis:
//   P1. normalisasi E.164 & penyamaran nomor (tabel kasus).
//   P2. gerbang WA-2a (flag, produksi) & masa berlaku verifikasi (gagal tertutup).
//   S1. bentuk kode: satu pembaca process.env, SQL mentah selalu menyaring tenantId, tanpa data
//       voyage/kapal, tanpa impor WA-1/TAH/Validator/AI/jaringan, tanpa console.*.
//   S2. lingkup: berkas beku tidak berubah terhadap main.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const PH = jiti('../src/services/whatsapp/wa-phone.ts')
const G = jiti('../src/services/whatsapp/wa2-gate.ts')
const K = jiti('../src/services/whatsapp/wa2-policy.ts')
const C = jiti('../src/services/whatsapp/wa-contact.service.ts')

// ============================================================================ P1
bagian('[P1] Normalisasi E.164 & penyamaran (AC-2C-02)')
const n = (v) => PH.normalisasiE164(v)
const sama = ['081234567890', '+6281234567890', '6281234567890', '+62 812-3456-7890', '0062 812 3456 7890', '(0812) 3456.7890', ' 0812 3456 7890 ']
cek('variasi penulisan nomor Indonesia → E.164 yang sama', sama.every((v) => n(v).ok && n(v).e164 === '+6281234567890'), JSON.stringify(sama.map((v) => n(v).e164 ?? n(v).alasan)))
cek('nomor luar negeri internasional diterima apa adanya', n('+44 7911 123456').ok && n('+44 7911 123456').e164 === '+447911123456')
const tolak = ['', '   ', '123', '12345678', 'TEST_FIXTURE_WA_001', '+6208123456789', 'abc0812345678', '+62812345678901234567', '0', '+0812345678', null, undefined, 6281234567890, '0812345678901234567890123456789012']
cek('input tidak sah / pengenal fixture / "+620…" / angka bukan string → PHONE_INVALID', tolak.every((v) => !n(v).ok && n(v).alasan === 'PHONE_INVALID'), JSON.stringify(tolak.filter((v) => n(v).ok)))
const s1 = PH.samarkanNomor('+6281234567890')
const s2 = PH.samarkanNomor('+628123456')
cek('samaran: kode negara + 4 digit terakhir, panjang tetap, digit tengah tak terlihat', s1 === '+62••••7890' && s2.length === s1.length && !s1.includes('8123456'))
cek('samaran input tak sah → samaran penuh', PH.samarkanNomor('abc') === '+••••••••' && PH.samarkanNomor(undefined) === '+••••••••')

// ============================================================================ P2
bagian('[P2] Gerbang WA-2a & masa verifikasi (AC-2C-01, AC-2C-05)')
const g = (env) => G.bacaKonfigurasiWa2(env)
cek('bawaan (env kosong) → mati WA2_DISABLED', !g({}).aktif && g({}).alasan === 'WA2_DISABLED')
cek('flag bukan persis "true" → mati', ['TRUE', '1', 'yes', 'false', ' True'].every((v) => !g({ [K.FLAG_WA2]: v }).aktif))
cek('flag "true" + development → aktif', g({ [K.FLAG_WA2]: 'true', NODE_ENV: 'development' }).aktif)
cek('NODE_ENV=production (varian apa pun) → WA2_ENV_NOT_ALLOWED walau flag "true"', ['production', 'Production', ' PRODUCTION '].every((e) => g({ [K.FLAG_WA2]: 'true', NODE_ENV: e }).alasan === 'WA2_ENV_NOT_ALLOWED'))
const t0 = new Date('2026-10-10T00:00:00.000Z')
cek('batas masa verifikasi = +12 bulan kalender', C.batasMasaVerifikasi(t0).toISOString() === '2027-10-10T00:00:00.000Z')
const sv = (st, exp) => C.statusVerifikasiEfektif({ verificationStatus: st, verificationExpiresAt: exp }, t0)
cek('status efektif: VERIFIED + kedaluwarsa masa depan → VERIFIED', sv('VERIFIED', new Date('2026-10-10T00:00:01Z')) === 'VERIFIED')
cek('status efektif: tepat di batas / lewat → EXPIRED (gagal tertutup)', sv('VERIFIED', t0) === 'EXPIRED' && sv('VERIFIED', new Date('2026-01-01Z')) === 'EXPIRED')
cek('status efektif: VERIFIED tanpa tanggal / tanggal rusak → EXPIRED', sv('VERIFIED', null) === 'EXPIRED' && sv('VERIFIED', new Date('x')) === 'EXPIRED')
cek('status efektif: UNVERIFIED / status asing → UNVERIFIED', sv('UNVERIFIED', new Date('2030-01-01Z')) === 'UNVERIFIED' && sv('verified', new Date('2030-01-01Z')) === 'UNVERIFIED')
cek('C-2: lima alasan pencabutan dini terdaftar', K.ALASAN_CABUT_VERIFIKASI.join() === 'PIC_CHANGED_COMPANY,RELATIONSHIP_ENDED,AUTHORITY_CHANGED,REVOKED_BY_AUTHORIZED_PARTY,EVIDENCE_INVALID')
cek('re-opt-in: STAFF_RECORDED BUKAN kanal sah', !K.KANAL_REOPTIN_SAH.includes('STAFF_RECORDED') && K.KANAL_REOPTIN_SAH.every((k) => K.KANAL_CONSENT.includes(k)))
cek('status pesan yang ditahan = non-terminal sebelum kirim', K.STATUS_PESAN_DAPAT_DITAHAN.join() === 'DRAFT,PREVIEWED,PENDING_APPROVAL,APPROVED' && K.STATUS_PESAN_DAPAT_DITAHAN.every((s) => K.STATUS_PESAN_KLIEN.includes(s)))

// ============================================================================ S1
bagian('[S1] Bentuk kode service')
const BERKAS = ['wa2-gate.ts', 'wa-phone.ts', 'wa-db-error.ts', 'wa-lock.ts', 'wa-contact.service.ts', 'wa-consent.service.ts'].map((f) => `src/services/whatsapp/${f}`)
const isi = Object.fromEntries(BERKAS.map((f) => [f, baca(f)]))
const tanpaKomentar = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const envPer = Object.fromEntries(BERKAS.map((f) => [f, [...tanpaKomentar(isi[f]).matchAll(/process\.env/g)].length]))
cek('process.env dibaca HANYA sekali, di wa2-gate.ts (gerbangWa2)', Object.entries(envPer).every(([f, c]) => (f.endsWith('wa2-gate.ts') ? c === 1 : c === 0)) && /bacaKonfigurasiWa2\(process\.env\)/.test(isi['src/services/whatsapp/wa2-gate.ts']), JSON.stringify(envPer))
cek('wa-phone.ts murni (tanpa impor)', !/^\s*import\s/m.test(tanpaKomentar(isi['src/services/whatsapp/wa-phone.ts'])))
const svc = ['src/services/whatsapp/wa-contact.service.ts', 'src/services/whatsapp/wa-consent.service.ts']
const pertamaSetelahSignature = (src) => {
  const baris = src.split('\n')
  const hasil = []
  baris.forEach((l, i) => {
    if (/^export async function \w+\(/.test(l)) hasil.push({ nama: l.match(/function (\w+)/)[1], pertama: (baris.slice(i + 1).find((x) => x.trim() !== '') ?? '').trim() })
  })
  return hasil
}
const fungsiPublik = svc.flatMap((f) => pertamaSetelahSignature(isi[f]))
cek('SETIAP fungsi publik service (10) diawali gerbangWa2(ctx)', fungsiPublik.length === 10 && fungsiPublik.every((x) => x.pertama === 'gerbangWa2(ctx)'), fungsiPublik.map((x) => `${x.nama}:${x.pertama.slice(0, 18)}`).join(' '))
const SEMUA = tanpaKomentar(BERKAS.map((f) => isi[f]).join('\n'))
cek('AC-2C-12: tidak ada akses model voyage/kapal/port/event/AIS', !/\.(voyage|vessel|port|voyageEvent|aisObservation|monitoringSignal)\.|"Voyage"|"Vessel"/.test(SEMUA))
cek('tanpa impor WA-1 / TAH / intake / AI / jaringan', !/from '\.\.\/(communication|tah|intake)\/|lib\/ai|openrouter|anthropic|fetch\(|node:https?|node:net/.test(SEMUA))
cek('tanpa console.* (nomor/bukti tak dapat bocor lewat log service)', !/console\./.test(SEMUA))
const raw = [...tanpaKomentar(isi['src/services/whatsapp/wa-lock.ts']).matchAll(/\$(queryRaw|executeRaw)[^`]*`([\s\S]*?)`\)/g)]
cek('SQL mentah (wa-lock) selalu menyaring "tenantId" & memakai parameter (Prisma.sql)', raw.length >= 5 && raw.every((m) => /"tenantId"\s*=\s*\$\{tenantId\}|\$\{tenantId\}, \$\{contactId\}/.test(m[2])) && !/\$queryRawUnsafe|\$executeRawUnsafe/.test(SEMUA), `${raw.length} pernyataan`)
cek('urutan kunci terdokumentasi: WaContact → WaConsentState → WaPrincipalAccessGrant → WaClientMessage', /WaContact → WaConsentState → WaPrincipalAccessGrant → WaClientMessage/.test(isi['src/services/whatsapp/wa-lock.ts']))
cek('galat DB dipetakan tanpa teks mentah (tidak meneruskan e.message)', !/conflict\([^)]*message|validation\([^)]*message/.test(isi['src/services/whatsapp/wa-db-error.ts']))
cek('AuditLog tidak memuat bukti/nomor utuh (hanya samaran & sidik)', svc.every((f) => [...isi[f].matchAll(/catatAudit\([\s\S]*?\}, \{\}, tx\)/g)].every((m) => !/bukti[,}]|evidence|e164[,}]|nomor\.e164[,}]|catatan[,}]|alasan: alasan|sidikAlasan: alasan/.test(m[0].replace(/sidikBukti\([^)]*\)|sidikBukti: sidik\w*\([^)]*\)|samarkanNomor\([^)]*\)/g, '')))))

// ============================================================================ S2
bagian('[S2] Lingkup Step 2C')
const berubah = execFileSync('git', ['diff', '--name-only', 'main'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const baru = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: AKAR, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const BEKU = [/^src\/services\/communication\//, /^src\/services\/tah\//, /^src\/services\/intake\//, /^docs\/whatsapp\/PRD-WA-1\.md$/, /^prisma\/check-(comm|tah|validator)/, /^prisma\/migrations\//, /^prisma\/schema\.prisma$/, /^prisma\/rollback\//]
cek('tidak ada perubahan WA-1 / TAH / Validator V3 / schema / migrasi', [...berubah, ...baru].every((f) => !BEKU.some((r) => r.test(f))), [...berubah, ...baru].join(', '))

console.log(`\n${gagal === 0 ? '✅ SEMUA LULUS' : '❌ ADA YANG GAGAL'} — lulus ${lulus}, gagal ${gagal}`)
process.exit(gagal === 0 ? 0 : 1)
