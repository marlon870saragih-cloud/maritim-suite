// PRD-005 Eval-4 prep — CLI pemeriksa konsistensi GT ↔ teks sumber (luring, BACA-SAJA).
//
// Jalankan SEBELUM membekukan GT baru / sebelum run LIVE apa pun:
//   node prisma/check-gt-source-consistency.mjs                 → kasus regresi Eval-4 (wajib lulus; exit 1 bila ada GAGAL)
//   node prisma/check-gt-source-consistency.mjs --laporan-historis → laporkan temuan Eval-1/2/3 (bukti historis; exit 0)
// Tidak pernah mengubah fixture; temuan historis diserahkan ke owner, bukan diperbaiki otomatis.

import * as G from './spike-gt-konsistensi.mjs'

const HARI = new Date('2026-09-26T00:00:00Z')
const cetak = (judul, r) => {
  console.log(`\n${judul} — ${r.lulus ? 'LULUS' : 'GAGAL'} (${r.gagal.length} GAGAL, ${r.temuan.length - r.gagal.length} INFO)`)
  for (const t of r.temuan) console.log(`  ${t.tingkat === 'GAGAL' ? '❌' : 'ℹ️ '} ${t.kasus} ${t.aturan} ${JSON.stringify(t.detail)}`)
}

if (process.argv.includes('--laporan-historis')) {
  for (const [nama, berkas, bangun] of [
    ['Eval-1', 'eval1-cases.mjs', 'bangunKasusEval1'],
    ['Eval-2', 'eval2-cases.mjs', 'bangunKasusEval2'],
    ['Eval-3', 'eval3-cases.mjs', 'bangunKasusEval3'],
  ]) {
    const F = await import(`./fixtures/spike-intake/${berkas}`)
    cetak(`${nama} (historis, beku — tidak diubah)`, G.periksaKonsistensiGtSumber(F[bangun](HARI)))
  }
  process.exit(0)
}
const R = await import('./fixtures/spike-intake/eval4-regresi-muatan.mjs')
const r = G.periksaKonsistensiGtSumber(R.KASUS_REGRESI_MUATAN)
cetak(`Regresi muatan Eval-4 (${R.VERSI_REGRESI_MUATAN}, ${G.VERSI_PEMERIKSA_GT})`, r)
process.exit(r.lulus ? 0 : 1)
