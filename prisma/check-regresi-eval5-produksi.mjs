// REGRESI Eval-5 lewat JALUR PRODUKSI NYATA untuk kandidat pasca-remediasi (BUKAN evaluasi held-out; BUKAN Eval-5).
// Paket Z01–Z40 = EXPOSED — REGRESSION ONLY. Stub = jawaban sempurna dari GT; 0 panggilan penyedia; DB loopback sekali pakai.
// Memakai runner Eval-5 BEKU apa adanya (tak diubah) dengan seam luring yang diizinkan: pembekuan Eval-5 dilewati
// (kandidat berubah secara sah) dan pemeriksa kandidat diganti identitas kandidat BARU (spike-kandidat-pasca-eval5).
//
//   EVAL5_DB_URL=postgresql://postgres@127.0.0.1:55432/maritime_suite env -u SPIKE_OPENROUTER_API_KEY node prisma/check-regresi-eval5-produksi.mjs
// Tanpa EVAL5_DB_URL → DILEWATI (kode 3).

import * as R from './spike-eval5-runner.mjs'
import * as R3 from './spike-eval3-runner.mjs'
import * as K2 from './spike-kandidat-pasca-eval5.mjs'

let lulus = 0
let gagal = 0
const cek = (nama, kondisi, detail = '') => {
  if (kondisi) lulus++
  else gagal++
  console.log(`  ${kondisi ? '✅' : '❌'} ${nama}${!kondisi && detail ? ` — ${detail}` : ''}`)
}
const URL_DB = process.env.EVAL5_DB_URL
if (!URL_DB) {
  console.log('DILEWATI — EVAL5_DB_URL tidak diset (butuh PostgreSQL loopback sekali pakai).')
  process.exit(3)
}
for (const n of ['SPIKE_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY', 'SPIKE_AUTHORIZED', 'TAH_INTAKE_MODEL', 'DATABASE_URL', 'DIRECT_URL']) if (process.env[n]) {
  console.log(`❌ DITOLAK: ${n} terset`)
  process.exit(1)
}
if (!R3.uraiDbLoopback(URL_DB).ok) {
  console.log('❌ DITOLAK: EVAL5_DB_URL bukan loopback')
  process.exit(1)
}
let fetchNyata = 0
globalThis.fetch = async () => {
  fetchNyata++
  throw new Error('JARINGAN_DILARANG')
}

console.log(`\nKandidat ${K2.ID_KANDIDAT} (sidik ${K2.sidikKandidat().slice(0, 16)}…) — regresi Eval-5 lewat submitIntake produksi`)
cek('K1 kandidat baru di disk identik dengan sidiknya; kandidat Eval-5 lama TIDAK cocok lagi (sah: validator berubah)', K2.verifikasiKandidat().length === 0 && (await import('./spike-eval5-kandidat.mjs')).verifikasiKandidat().join() === 'KANDIDAT_BERUBAH:src/services/intake/intake-policy.ts', JSON.stringify(K2.verifikasiKandidat()))
const l = await R.jalankanRunnerEval5({ mode: 'offline', env: { SPIKE_DATABASE_URL: URL_DB }, hariIni: new Date('2026-09-28T00:00:00Z'), bekuUji: () => [], kandidatUji: () => K2.verifikasiKandidat() })
const held = l.slot.filter((s) => s.blok === R.BLOK_HELDOUT)
const tak = [...new Set(held.filter((s) => !(s.status === 'OK' && s.klasifikasi.benarPost && s.penilai.POST.FATAL === 0 && s.penilai.POST.MAJOR === 0)).map((s) => s.kasus))]
console.log(`     held-out(regresi) lulus ${l.gerbang.G_LULUS_HELDOUT.lulusSlot}/80; tak lulus: ${tak.join(',') || '-'}; verdict gerbang (INFORMASI SAJA, bukan evaluasi) = ${l.verdict}`)
cek('K2 82/82 slot OK lewat jalur produksi; bukti jalur produksi 82/82', l.slot.length === 82 && l.slot.every((s) => s.status === 'OK') && l.buktiProduksi.lengkap === 82, JSON.stringify(l.buktiProduksi))
cek('K3 0 FATAL POST, 0 muatan tak berbukti, 0 identitas, 0 output tool', l.gerbang.G_FATAL_POST.nilai === 0 && l.gerbang.G_MUATAN_TAK_BERBUKTI_POST.nilai === 0 && l.gerbang.G_IDENTITAS.nilai === 0 && l.gerbang.G_OUTPUT_TOOL.nilai === 0)
cek('K4 regresi H20/H18 lulus di jalur produksi', l.regresiMuatan['RG-H20'].hasil === 'LULUS' && l.regresiMuatan['RG-H18'].hasil === 'LULUS')
cek('K5 78/80 slot held-out lulus; satu-satunya kasus tak lulus = Z17 (konservatif, keputusan owner 1)', l.gerbang.G_LULUS_HELDOUT.lulusSlot === 78 && JSON.stringify(tak) === '["Z17"]', `${l.gerbang.G_LULUS_HELDOUT.lulusSlot} ${tak}`)
cek('K6 konsistensi antar-ulangan POST terpenuhi; 0 cacat GT', l.gerbang.G_KONSISTENSI_ULANGAN.lulus === true && l.gerbang.G_CACAT_GT.nilai === 0)
cek('K7 sisa DB 0; privasi buku besar & laporan lulus; 0 panggilan nyata; 0 fetch', l.pembersihan.bersih === true && l.privasiBukuBesar.lulus && l.privasi.lulus && l.panggilanNyata === 0 && fetchNyata === 0)
console.log(`\n${gagal === 0 ? '✅' : '❌'} ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
