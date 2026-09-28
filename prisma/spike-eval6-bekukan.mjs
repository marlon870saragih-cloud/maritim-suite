// PRD-005 Eval-6 — PEMBEKU manifes (Step G). Menulis prisma/spike-eval6-beku.json HANYA bila semua pemeriksaan luring lulus:
// kandidat identik, identitas prompt/rute, integritas GT paket, tumpang-tindih. Tanpa jaringan, tanpa DB, tanpa model.
//
//   node prisma/spike-eval6-bekukan.mjs            → cetak manifes kandidat + temuan (tidak menulis)
//   node prisma/spike-eval6-bekukan.mjs --tulis    → tulis manifes bila semua lulus

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as R from './spike-eval6-runner.mjs'
import * as K from './spike-eval5-kandidat.mjs'
import * as K2 from './spike-kandidat-pasca-eval5.mjs'
import * as DS from './spike-eval6-dataset.mjs'
import * as D from './fixtures/spike-intake/eval6-blind-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const X = jiti(join(AKAR, 'src/lib/ai/vessel-call-extract.ts'))
const MC = jiti(join(AKAR, 'src/lib/ai/model-capabilities.ts'))

const galat = []
galat.push(...K2.verifikasiKandidat(), ...K.verifikasiIdentitasRute({ X, MC }))
const data = D.muatDataEval6()
const hari = new Date()
const kasus = D.bangunKasusEval6(hari, data)
const integ = DS.periksaIntegritasPaket(data, kasus)
const tumpang = DS.periksaTumpangTindih(kasus, { korpus: DS.korpusTerlihatEval6(hari) })
galat.push(...integ.temuan.map((x) => `GT:${x.kasus}:${x.aturan}`), ...tumpang.temuan.map((x) => `TUMPANG:${x.kasus}:${x.aturan}`))
// prasyarat regresi Eval-5 (EXPOSED — REGRESSION ONLY) + H20/H18/E09
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const reg = R.prasyaratRegresi({ P, hariIni: hari, NORM_VALIDASI: { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }, NORM_SKOR: { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign } })
console.log(`regresi Eval-5: ${reg.eval5.slot} slot (tak lulus: ${reg.eval5.tidakLulus.join(',') || '-'})`)
galat.push(...reg.galat)
const a = R.buktiAnggaranEval6()
if (!a.terbukti) galat.push(...a.galat)
const m = R.hitungManifesEval6()
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
