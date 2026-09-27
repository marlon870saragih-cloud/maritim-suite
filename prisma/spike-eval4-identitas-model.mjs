// PRD-005 Eval-4 prep — PAGAR IDENTITAS MODEL Sonnet 5 (luring, murni; BUKAN runner, tanpa jaringan).
//
// Keputusan owner: MODEL_SELECTION = SONNET_5, SONNET_4_5 = HISTORICAL_ONLY, EVAL4_MODEL_ARMS = SONNET_5_ONLY.
// Modul ini menyiapkan semantik gagal-tertutup untuk runner Eval-4 kelak:
//   EXPECTED_MODEL_ID  = identitas PERMINTAAN yang disetujui owner (slug di peta model repo).
//   ACTUAL_MODEL_ID    = identitas yang DILAYANI penyedia (meta.servedModel per panggilan).
//   EXPECTED_SERVED_MODEL_ID = identitas dilayani yang WAJIB — SENGAJA null: belum diverifikasi, TIDAK
//   boleh ditebak. Selama null, opsiEkstraktorEval4() dan kesiapanLiveEval4() MENOLAK (run LIVE mustahil).
// Beda / tak ada / ambigu → INCONCLUSIVE_MODEL_IDENTITY: BERHENTI, tanpa ulang, tanpa pengganti, tanpa fallback.
// Status registri Sonnet 5 (PENDING_SPIKE di model-capabilities.ts) TIDAK diubah oleh modul ini.

export const VERSI_PAGAR_MODEL_EVAL4 = 'prd005-e5-eval4/pagar-model-1'
export const EXPECTED_MODEL_ID = 'anthropic/claude-sonnet-5'
export const EXPECTED_SERVED_MODEL_ID = null
export const INCONCLUSIVE_MODEL_IDENTITY = 'INCONCLUSIVE_MODEL_IDENTITY'
/** Model historis — tak boleh diminta atau dilayani di Eval-4 dalam bentuk apa pun. */
export const MODEL_HISTORIS = Object.freeze(['anthropic/claude-sonnet-4.5'])

const slugSah = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9.:-]{0,79}$/.test(s)

/**
 * Opsi buatEkstraktorOpenRouter untuk Eval-4. MELEMPAR bila identitas diminta/dilayani tidak tersedia
 * persis — sehingga jalur Eval-4 tak pernah jatuh ke model bawaan klien (SPK_MODEL = Sonnet 4.5).
 */
export function opsiEkstraktorEval4({ diminta = EXPECTED_MODEL_ID, dilayani = EXPECTED_SERVED_MODEL_ID } = {}) {
  if (!slugSah(diminta)) throw new Error(`${INCONCLUSIVE_MODEL_IDENTITY}:EXPECTED_MODEL_ID_TIDAK_ADA`)
  if (diminta !== EXPECTED_MODEL_ID || MODEL_HISTORIS.includes(diminta)) throw new Error(`${INCONCLUSIVE_MODEL_IDENTITY}:BUKAN_MODEL_OWNER`)
  if (typeof dilayani !== 'string' || dilayani.trim() === '') throw new Error(`${INCONCLUSIVE_MODEL_IDENTITY}:SERVED_BELUM_DIVERIFIKASI`)
  if (MODEL_HISTORIS.includes(dilayani)) throw new Error(`${INCONCLUSIVE_MODEL_IDENTITY}:SERVED_MODEL_HISTORIS`)
  return Object.freeze({ modelWajib: diminta, servedWajib: dilayani })
}

/** Satu panggilan: identitas diminta & dilayani. `harapan.dilayani` wajib string terverifikasi. */
export function periksaIdentitasModel({ diminta, dilayani }, harapan = { diminta: EXPECTED_MODEL_ID, dilayani: EXPECTED_SERVED_MODEL_ID }) {
  const tolak = (alasan) => ({ ok: false, status: INCONCLUSIVE_MODEL_IDENTITY, alasan, berhenti: true, ulang: false, pengganti: null })
  if (typeof harapan.dilayani !== 'string' || !harapan.dilayani) return tolak('SERVED_BELUM_DIVERIFIKASI')
  if (typeof diminta !== 'string' || !diminta) return tolak('DIMINTA_TIDAK_ADA')
  if (diminta !== harapan.diminta) return tolak('DIMINTA_BERBEDA')
  if (typeof dilayani !== 'string' || !dilayani.trim()) return tolak('DILAYANI_TIDAK_ADA')
  if (dilayani !== dilayani.trim() || /[,;|\s]/.test(dilayani)) return tolak('DILAYANI_AMBIGU')
  if (MODEL_HISTORIS.includes(dilayani)) return tolak('DILAYANI_MODEL_HISTORIS')
  if (dilayani !== harapan.dilayani) return tolak('DILAYANI_BERBEDA')
  return { ok: true, status: 'OK' }
}

/** Badan permintaan HTTP ke penyedia (sebelum dikirim): model wajib persis, tanpa larik/rute/izin fallback. */
export function periksaBadanPermintaanEval4(body, diminta = EXPECTED_MODEL_ID) {
  const galat = []
  if (!body || typeof body !== 'object') return ['BADAN_TIDAK_SAH']
  if (typeof body.model !== 'string' || !body.model) galat.push('MODEL_TIDAK_ADA')
  else if (body.model !== diminta) galat.push(MODEL_HISTORIS.includes(body.model) ? 'MODEL_HISTORIS_DIMINTA' : 'MODEL_BERBEDA')
  if (Array.isArray(body.models) || body.route !== undefined) galat.push('FALLBACK_DIMINTA')
  if (body.provider && body.provider.allow_fallbacks !== undefined && body.provider.allow_fallbacks !== false) galat.push('FALLBACK_DIMINTA')
  return galat
}

/**
 * Kesiapan run LIVE Eval-4. Di commit ini SELALU tidak siap: identitas dilayani belum diverifikasi dan
 * otorisasi LIVE owner adalah gerbang terpisah (tidak ada sakelar di repo).
 */
export function kesiapanLiveEval4({ otorisasiOwnerLive = false, dilayani = EXPECTED_SERVED_MODEL_ID } = {}) {
  const alasan = []
  if (typeof dilayani !== 'string' || !dilayani) alasan.push('SERVED_BELUM_DIVERIFIKASI')
  if (otorisasiOwnerLive !== true) alasan.push('OTORISASI_LIVE_OWNER_TIDAK_ADA')
  alasan.push('RUNNER_EVAL4_BELUM_DIBANGUN')
  return { siap: false, alasan }
}
