// PRD-005 Eval-8 — PEMBEKU manifes (Step G). Menulis prisma/spike-eval8-beku.json HANYA bila semua pemeriksaan luring lulus:
// kandidat identik, identitas prompt/rute, integritas GT paket, tumpang-tindih. Tanpa jaringan, tanpa DB, tanpa model.
//
//   node prisma/spike-eval8-bekukan.mjs            → cetak manifes kandidat + temuan (tidak menulis)
//   node prisma/spike-eval8-bekukan.mjs --tulis    → tulis manifes bila semua lulus

import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as R from './spike-eval8-runner.mjs'
import * as K from './spike-eval5-kandidat.mjs'
import * as KV3 from './spike-kandidat-v3.mjs'
import * as DS from './spike-eval8-dataset.mjs'
import * as D from './fixtures/spike-intake/eval8-blind-cases.mjs'

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const jiti = require('jiti')(fileURLToPath(import.meta.url), { alias: { '@': join(AKAR, 'src') }, interopDefault: true })
const X = jiti(join(AKAR, 'src/lib/ai/vessel-call-extract.ts'))
const MC = jiti(join(AKAR, 'src/lib/ai/model-capabilities.ts'))

const galat = []
galat.push(...KV3.verifikasiKandidat())
// Spike eval-only (sama dengan runner): identitas rute diperiksa dengan entri Sonnet 5 aktif DI MEMORI, lalu dipulihkan.
const spk = R.aktifkanSpikeEval(MC)
galat.push(...spk.galat)
try {
  galat.push(...K.verifikasiIdentitasRute({ X, MC }))
} finally {
  spk.pulihkan()
}
if (MC.cariEntriModel('anthropic/claude-sonnet-5')?.status !== 'PENDING_SPIKE') galat.push('SPIKE_TIDAK_DIPULIHKAN')
const data = D.muatDataEval8()
const hari = new Date()
const kasus = D.bangunKasusEval8(hari, data)
const integ = DS.periksaIntegritasPaket(data, kasus)
const tumpang = DS.periksaTumpangTindih(kasus, { korpus: DS.korpusTerlihatEval8(hari) })
galat.push(...integ.temuan.map((x) => `GT:${x.kasus}:${x.aturan}`), ...tumpang.temuan.map((x) => `TUMPANG:${x.kasus}:${x.aturan}`))
// prasyarat regresi Eval-5 & Eval-6 (EXPOSED — REGRESSION ONLY) + H20/H18/E09 pada validator V3 beku
const P = jiti(join(AKAR, 'src/services/intake/intake-policy.ts'))
const V = jiti(join(AKAR, 'src/lib/vessels.ts'))
const reg = R.prasyaratRegresi({ P, hariIni: hari, NORM_VALIDASI: { imo: V.normalisasiImo, imoSah: V.imoCheckDigitSah, mmsi: V.normalisasiMmsi, mmsiSah: V.mmsiSah, callSign: V.normalisasiCallSign }, NORM_SKOR: { namaKapal: P.normalisasiNamaKapal, namaPort: P.normalisasiNamaPort, namaPihak: P.normalisasiNamaPihak, unlocode: P.normalisasiUnlocode, imo: V.normalisasiImo, mmsi: V.normalisasiMmsi, callSign: V.normalisasiCallSign } })
console.log(`regresi Eval-5: ${reg.eval5.slot} slot (tak lulus: ${reg.eval5.tidakLulus.join(',') || '-'}); regresi Eval-6: ${reg.eval6.slot} slot (tak lulus: ${reg.eval6.tidakLulus.join(',') || '-'}); regresi Eval-7: ${reg.eval7.slot} slot (tak lulus: ${reg.eval7.tidakLulus.join(',') || '-'})`)
galat.push(...reg.galat)
const a = R.buktiAnggaranEval8()
if (!a.terbukti) galat.push(...a.galat)
const m = R.hitungManifesEval8()
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
