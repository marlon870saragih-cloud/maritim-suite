// PRD-005 Eval-4 prep — PAGAR IDENTITAS MODEL Sonnet 5 (luring, murni; BUKAN runner, tanpa jaringan).
//
// Keputusan owner: MODEL_SELECTION = SONNET_5, SONNET_4_5 = HISTORICAL_ONLY, EVAL4_MODEL_ARMS = SONNET_5_ONLY.
// Modul ini menyiapkan semantik gagal-tertutup untuk runner Eval-4 kelak:
//   EXPECTED_MODEL_ID  = identitas PERMINTAAN yang disetujui owner (slug di peta model repo).
//   ACTUAL_MODEL_ID    = identitas yang DILAYANI penyedia (meta.servedModel per panggilan).
//   EXPECTED_SERVED_MODEL_ID = identitas dilayani yang WAJIB. Diisi dari bukti probe identitas LIVE tunggal
//   yang disetujui owner (OpenRouter melaporkan served = anthropic/claude-sonnet-5; request id
//   gen-1790488413-03vR0qtSetkMQRFNvhu0). Cakupan bukti: tingkat OpenRouter saja; ID model internal upstream
//   TIDAK diverifikasi mandiri. kesiapanLiveEval4() TETAP menolak (lihat penghalang nyata di fungsinya).
// Beda / tak ada / ambigu → INCONCLUSIVE_MODEL_IDENTITY: BERHENTI, tanpa ulang, tanpa pengganti, tanpa fallback.
// Status registri Sonnet 5 (PENDING_SPIKE di model-capabilities.ts) TIDAK diubah oleh modul ini.

export const VERSI_PAGAR_MODEL_EVAL4 = 'prd005-e5-eval4/pagar-model-1'
export const EXPECTED_MODEL_ID = 'anthropic/claude-sonnet-5'
export const EXPECTED_SERVED_MODEL_ID = 'anthropic/claude-sonnet-5'
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
 * Gerbang lulus/gagal KUALITAS Eval-4 belum diimplementasikan di runner (spike-eval4-runner.mjs hanya
 * melaporkan metrik + regresi H20/H18, putusan terbaik MENUNGGU_GERBANG_OWNER). Selama false, kesiapan LIVE
 * mustahil — apa pun masukannya. Mengubahnya = keputusan owner + implementasi gerbang + uji.
 */
export const GERBANG_KUALITAS_EVAL4_DIIMPLEMENTASI = false

const SUMBER_GALAT_BATAS = /^(BATAS_|ULANGAN_|PLAFON_)/

export const JENIS_BUKTI_TRANSPORT = 'SONNET_5_TRANSPORT_CAPABILITY_PROVEN'
const bulatPositif = (v) => Number.isSafeInteger(v) && v > 0

/**
 * Galat bukti kapabilitas transport Sonnet 5 (kosong = sah). Bukti divalidasi ISINYA terhadap `harapan` yang
 * dihitung runner dari identitas beku SAAT INI (model, served, sidik bentuk+profil transport, hash Prompt v4,
 * nama tool paksa). Identitas/bentuk berubah → bukti tak lagi memenuhi gerbang.
 */
export function periksaBuktiTransport(bukti, harapan) {
  if (!bukti || typeof bukti !== 'object') return ['BUKTI_TIDAK_ADA']
  if (!harapan || typeof harapan !== 'object') return ['HARAPAN_TRANSPORT_TIDAK_ADA']
  const g = []
  if (bukti.jenis !== JENIS_BUKTI_TRANSPORT) g.push('JENIS_BERBEDA')
  if (bukti.requestedModel !== EXPECTED_MODEL_ID || bukti.requestedModel !== harapan.model) g.push('MODEL_DIMINTA_BERBEDA')
  if (bukti.servedModel !== EXPECTED_SERVED_MODEL_ID || bukti.servedModel !== harapan.served) g.push('MODEL_DILAYANI_BERBEDA')
  if (typeof bukti.providerRequestId !== 'string' || !/^gen-[A-Za-z0-9-]{6,}$/.test(bukti.providerRequestId)) g.push('REQUEST_ID_TIDAK_SAH')
  if (typeof bukti.provider !== 'string' || !bukti.provider.trim()) g.push('PROVIDER_TIDAK_ADA')
  if (bukti.panggilanModel !== 1) g.push('JUMLAH_PANGGILAN_BUKAN_1')
  if (bukti.httpStatus !== 200) g.push('HTTP_BUKAN_200')
  if (bukti.finishReason !== 'tool_calls') g.push('FINISH_REASON_BUKAN_TOOL_CALLS')
  if (bukti.toolCallTerpaksa !== true || typeof harapan.toolPaksa !== 'string' || bukti.toolPaksa !== harapan.toolPaksa) g.push('TOOL_PAKSA_BERBEDA')
  if (bukti.argumenTerurai !== true || bukti.argumenStrukturSah !== true) g.push('ARGUMEN_TIDAK_SAH')
  if (bukti.temperatureDikirim !== false) g.push('TEMPERATURE_DIKIRIM')
  if (bukti.fallbackDikirim !== false || bukti.providerOverrideDikirim !== false) g.push('FALLBACK_ATAU_OVERRIDE_DIKIRIM')
  if (typeof harapan.hashPromptV4 !== 'string' || bukti.hashPromptV4 !== harapan.hashPromptV4) g.push('HASH_PROMPT_V4_BERBEDA')
  if (typeof harapan.sidikBentukTransport !== 'string' || bukti.sidikBentukTransport !== harapan.sidikBentukTransport) g.push('SIDIK_BENTUK_TRANSPORT_BERBEDA')
  const u = bukti.pemakaian
  if (!(u && bulatPositif(u.input) && bulatPositif(u.output) && u.total === u.input + u.output)) g.push('PEMAKAIAN_TIDAK_SAH')
  if (!(typeof bukti.biayaUsd === 'number' && Number.isFinite(bukti.biayaUsd) && bukti.biayaUsd > 0 && bukti.biayaUsd <= (bukti.batasBiayaProbeUsd ?? 0))) g.push('BIAYA_TIDAK_SAH')
  return g
}

/**
 * Kesiapan run LIVE Eval-4 (gagal-tertutup): `siap` hanya true bila TIDAK ada satu pun penghalang. Penghalang
 * yang dilaporkan adalah keadaan NYATA, bukan penanda tetap:
 *   konfigOwner    — KONFIG_OWNER_EVAL4 runner (null = paket held-out, ulangan, batas & plafon belum dibekukan);
 *   galatKonfig    — hasil periksaKonfigOwner(konfigOwner) dari runner (wajib array; kosong = sah);
 *   buktiTransport — bukti LIVE terotorisasi bahwa BENTUK permintaan Eval-4 (Sonnet 5, TANPA temperature, tool paksa,
 *                    Prompt v4) diterima penyedia & menghasilkan tool call; divalidasi periksaBuktiTransport
 *                    terhadap harapanTransport (identitas beku saat ini). Bukti ini TIDAK mengubah registri
 *                    (Sonnet 5 tetap PENDING_SPIKE, kemampuan null) dan hanya menghapus penghalang transport;
 *   ambang kualitas — konfigOwner.ambangKualitas (belum ada) DAN implementasi gerbang di runner.
 * Otorisasi LIVE owner tetap gerbang terpisah (frasa); tidak ada sakelar di repo.
 */
export function kesiapanLiveEval4({ otorisasiOwnerLive = false, dilayani = EXPECTED_SERVED_MODEL_ID, konfigOwner = null, galatKonfig = null, buktiTransport = null, harapanTransport = null } = {}) {
  const alasan = []
  if (typeof dilayani !== 'string' || !dilayani) alasan.push('SERVED_BELUM_DIVERIFIKASI')
  if (konfigOwner === null || konfigOwner === undefined) alasan.push('KONFIG_OWNER_EVAL4_BELUM_DIBEKUKAN', 'PAKET_HELDOUT_BELUM_DIBEKUKAN', 'BATAS_BIAYA_BELUM_DIBEKUKAN')
  else if (!Array.isArray(galatKonfig)) alasan.push('KONFIG_OWNER_EVAL4_BELUM_DIPERIKSA')
  else {
    if (galatKonfig.some((g) => !SUMBER_GALAT_BATAS.test(g))) alasan.push('PAKET_HELDOUT_TIDAK_SAH')
    if (galatKonfig.some((g) => SUMBER_GALAT_BATAS.test(g))) alasan.push('BATAS_BIAYA_TIDAK_SAH')
  }
  if (!konfigOwner?.ambangKualitas) alasan.push('AMBANG_KUALITAS_BELUM_DIBEKUKAN')
  if (!GERBANG_KUALITAS_EVAL4_DIIMPLEMENTASI) alasan.push('GERBANG_KUALITAS_BELUM_DIIMPLEMENTASI_DI_RUNNER')
  if (periksaBuktiTransport(buktiTransport, harapanTransport).length) alasan.push('KAPABILITAS_TRANSPORT_S5_BELUM_DIBUKTIKAN')
  if (otorisasiOwnerLive !== true) alasan.push('OTORISASI_LIVE_OWNER_TIDAK_ADA')
  return { siap: alasan.length === 0, alasan }
}
