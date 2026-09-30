// PRD-005 Eval-5 — PEMBEKU manifes (Step G). Menulis prisma/spike-eval5-beku.json HANYA bila semua pemeriksaan luring lulus:
// kandidat identik, identitas prompt/rute, integritas GT paket, tumpang-tindih. Tanpa jaringan, tanpa DB, tanpa model.
//
//   node prisma/spike-eval5-bekukan.mjs            → cetak manifes kandidat + temuan (tidak menulis)
//   node prisma/spike-eval5-bekukan.mjs --tulis    → tulis manifes bila semua lulus

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as R from './spike-eval5-runner.mjs'
import * as K from './spike-eval5-kandidat.mjs'
import * as DS from './spike-eval5-dataset.mjs'
import * as D from './fixtures/spike-intake/eval5-blind-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const X = jiti(join(AKAR, 'src/lib/ai/vessel-call-extract.ts'))
const MC = jiti(join(AKAR, 'src/lib/ai/model-capabilities.ts'))

const galat = []
galat.push(...K.verifikasiKandidat(), ...K.verifikasiIdentitasRute({ X, MC }))
const data = D.muatDataEval5()
const hari = new Date()
const kasus = D.bangunKasusEval5(hari, data)
const integ = DS.periksaIntegritasPaket(data, kasus)
const tumpang = DS.periksaTumpangTindih(kasus, { korpus: DS.korpusTerlihatEval5(hari) })
galat.push(...integ.temuan.map((x) => `GT:${x.kasus}:${x.aturan}`), ...tumpang.temuan.map((x) => `TUMPANG:${x.kasus}:${x.aturan}`))
const a = R.buktiAnggaranEval5()
if (!a.terbukti) galat.push(...a.galat)
const m = R.hitungManifesEval5()
console.log(JSON.stringify({ ...m, berkas: undefined, jumlahBerkas: Object.keys(m.berkas).length }, null, 2))
console.log(`sidik manifes: ${R.sidikManifes(m)}`)
if (galat.length) {
  console.log(`❌ TIDAK DIBEKUKAN — ${galat.length} temuan:\n  ${galat.join('\n  ')}`)
  process.exit(1)
}
if (process.argv.includes('--tulis')) {
  writeFileSync(R.JALUR_MANIFES_BEKU, `${JSON.stringify(m, null, 2)}\n`)
  console.log(`✅ manifes ditulis: ${R.JALUR_MANIFES_BEKU}`)
} else console.log('✅ semua pemeriksaan lulus (pakai --tulis untuk menulis manifes)')
