// PRD-005 E5 Step 14 — Eval-3 HELD-OUT: rencana, metrik deterministik khas Eval-3, gerbang G1–G14.
//
// Modul MURNI: tanpa jaringan, tanpa berkas, tanpa kode produksi. Normalisasi DISUNTIKKAN (`norm`).
// Penilaian per kasus MEMAKAI ULANG penilai Eval-1 (scorer-1, tidak diubah) dan diagnostik slot
// Eval-2 (diagnostikSlot, tidak diubah). Yang khas Eval-3:
//   • rencana 110 slot dari RENCANA_EVAL3 beku + validasi gagal-tertutup;
//   • G2 akurasi RAW & POST terpisah; penahanan P1 = DIAGNOSTIK, bukan jawaban benar (E3K4);
//   • G2S disiplin subtipe; G13 diskriminasi niat keagenan (RAW & POST, semua lengan);
//   • G14 integritas multi-kapal dihitung EKSPLISIT dari GT beku (scorer-1 tidak menangkap
//     penggabungan tug/tongkang & kapal peserta hilang);
//   • gerbang keselamatan per LENGAN + dua putusan terpisah: PROMPT_V3_PRODUKSI & KANDIDAT_S5.
// Ambang & sifat keras DIBACA dari GERBANG_EVAL3 beku — tidak ada angka ambang di modul ini.

import * as S from './spike-eval1-scorer.mjs'
import * as E2 from './spike-eval2-penilai.mjs'
import * as F from './fixtures/spike-intake/eval3-cases.mjs'

export const VERSI_PENILAI_EVAL3 = 'prd005-e5-eval3/penilai-1'
export const BLOK_KONTROL = 'S45_KONTROL_V3'
export const BLOK_S5 = Object.freeze(['S5_RUN1_V3', 'S5_RUN2_V3'])
export const BLOK_DINILAI = Object.freeze([BLOK_KONTROL, ...BLOK_S5])
export const BLOK_LEDGER = 'LEDGER_E2E_S5'
export const FIELD_TANGGAL = E2.FIELD_TANGGAL
const IDENTIFIER = ['imo', 'mmsi', 'callSign']
const NEW = (c) => typeof c === 'string' && c.startsWith('NEW_')
const kosong = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const nilaiNode = (n) => (!n ? [] : n.status === 'PRESENT' ? [n.value, ...(n.alias ?? [])] : n.status === 'ACCEPTABLE' ? n.values.filter((x) => x !== null) : [])

// ================================================================== rencana
/** Rencana deterministik dari RENCANA_EVAL3 beku: blok berurutan, kasus H01…H36; buku besar = kasusDipakai. */
export function susunRencanaEval3(mod = F) {
  const ids = mod.KASUS_EVAL3.map((k) => k.id)
  const r = []
  for (const b of mod.RENCANA_EVAL3.blok) {
    const kasus = b.blok === BLOK_LEDGER ? [...b.kasusDipakai] : ids
    for (const id of kasus) r.push({ seq: r.length + 1, blok: b.blok, model: b.model, kasus: id })
  }
  return r
}

/**
 * Galat rencana (kosong = sah). Gagal-tertutup untuk: jumlah ≠ beku, melebihi maks, blok hilang/lebih,
 * model beda dari blok beku / di luar allowlist, kasus tak dikenal, duplikat (blok+kasus), seq tak
 * berurutan, metadata tak lengkap, kasus buku besar ≠ kasusDipakai beku.
 */
export function validasiRencanaEval3(rencana, { mod = F, allowlist } = {}) {
  const galat = []
  if (!Array.isArray(rencana) || rencana.length === 0) return ['RENCANA_KOSONG']
  const R = mod.RENCANA_EVAL3
  const ids = new Set(mod.KASUS_EVAL3.map((k) => k.id))
  if (rencana.length !== R.direncanakan) galat.push(`RENCANA_TIDAK_LENGKAP:${rencana.length}/${R.direncanakan}`)
  if (rencana.length > R.maksPanggilan) galat.push('RENCANA_MELEBIHI_MAKS_PANGGILAN')
  const lihat = new Set()
  rencana.forEach((s, i) => {
    if (!s || typeof s !== 'object' || !['seq', 'blok', 'model', 'kasus'].every((k) => k in s)) {
      galat.push(`METADATA_SLOT_TIDAK_LENGKAP:${i + 1}`)
      return
    }
    if (s.seq !== i + 1) galat.push(`SEQ_TIDAK_BERURUTAN:${i + 1}`)
    const beku = R.blok.find((b) => b.blok === s.blok)
    if (!beku) galat.push(`BLOK_TIDAK_DIKENAL:${s.blok}`)
    else if (s.model !== beku.model) galat.push(`MODEL_BEDA_DARI_RENCANA:${s.seq}`)
    if (allowlist && !allowlist.includes(s.model)) galat.push(`MODEL_TIDAK_DIKENAL:${s.seq}`)
    if (!ids.has(s.kasus)) galat.push(`KASUS_TIDAK_DIKENAL:${s.seq}`)
    const kunci = `${s.blok}|${s.kasus}`
    if (lihat.has(kunci)) galat.push(`DUPLIKAT:${kunci}`)
    lihat.add(kunci)
  })
  for (const b of R.blok) {
    const xs = rencana.filter((s) => s?.blok === b.blok)
    if (xs.length !== b.kasus) galat.push(`JUMLAH_BLOK_BERBEDA:${b.blok}:${xs.length}/${b.kasus}`)
    if (b.blok === BLOK_LEDGER && JSON.stringify(xs.map((s) => s.kasus)) !== JSON.stringify(b.kasusDipakai)) galat.push('KASUS_BUKU_BESAR_BERBEDA')
  }
  return galat
}

/** Setiap gerbang beku (G1–G14, G2S, G9R) wajib punya implementasi di modul ini — konfigurasi gerbang tak bisa diam-diam bertambah. */
export const GERBANG_DIIMPLEMENTASI = Object.freeze(['G1', 'G2', 'G2S', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G9R', 'G10', 'G11', 'G12', 'G13', 'G14'])
export function validasiKonfigurasiGerbang(mod = F) {
  const beku = Object.keys(mod.GERBANG_EVAL3).filter((k) => /^G\d/.test(k))
  const g = []
  for (const k of beku) if (!GERBANG_DIIMPLEMENTASI.includes(k)) g.push(`GERBANG_TANPA_IMPLEMENTASI:${k}`)
  for (const k of GERBANG_DIIMPLEMENTASI) if (!beku.includes(k)) g.push(`GERBANG_TIDAK_ADA_DI_BEKU:${k}`)
  for (const k of ['VERDICT', 'CAKUPAN']) if (!(k in mod.GERBANG_EVAL3)) g.push(`GERBANG_META_HILANG:${k}`)
  return g
}

// ================================================================== metrik khas Eval-3
/** G13: NEW_* pada kasus tanpa niat keagenan dengan minimum terpenuhi — RAW dan POST terpisah. */
export function temuanG13(slot) {
  const k = slot.kasus
  if (k.niatKeagenan || !k.harapan?.minimumTerpenuhi) return []
  const out = []
  if (NEW(slot.raw?.classification)) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, lapisan: 'RAW', kelas: slot.raw.classification })
  if (NEW(slot.post?.classification)) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, lapisan: 'POST', kelas: slot.post.classification })
  return out
}

/**
 * G14 — integritas multi-kapal untuk SATU daftar kapal keluaran terhadap GT beku.
 * `kapal` = [{ name, imo, mmsi, callSign }] (nilai string mentah). Deterministik:
 *   • tiap entri dipetakan ke kapal GT lewat nama ternormalisasi (termasuk alias) dan/atau identifier;
 *   • DISALIN  = entri membawa identifier milik kapal GT LAIN dari kapal yang dicocokkan namanya;
 *   • DIGABUNG = satu entri memuat nama ≥ 2 kapal GT, atau identifier dari ≥ 2 kapal GT;
 *   • SISTER   = entri cocok kapalDikecualikan (nama atau IMO);
 *   • HILANG   = kapal GT peserta yang tidak dicocokkan entri mana pun.
 */
export function metrikMultiKapal(kasus, kapal, norm) {
  const gt = kasus.gt.vessels.daftar ?? []
  const namaGt = gt.map((v) => new Set(nilaiNode(v.name).map((n) => norm.namaKapal(n)).filter(Boolean)))
  const idGt = gt.map((v) => ({ imo: nilaiNode(v.imo).map((x) => norm.imo(x)), mmsi: nilaiNode(v.mmsi).map((x) => norm.mmsi(x)), callSign: nilaiNode(v.callSign).map((x) => norm.callSign(x)) }))
  const excl = kasus.kapalDikecualikan ?? []
  const hasil = { disalin: [], digabung: [], sister: [], hilang: [], entri: (kapal ?? []).length }
  const dicocokkan = new Set()
  ;(kapal ?? []).forEach((e, i) => {
    const nama = kosong(e?.name) ? null : norm.namaKapal(String(e.name))
    const tokenNama = nama ? ` ${nama} ` : ''
    const olehNama = gt.map((_, j) => j).filter((j) => nama && namaGt[j].has(nama))
    // Nama beberapa kapal GT di dalam satu nama keluaran → digabung.
    // Nama GT yang hanya awalan/bagian nama GT lain yang juga terkandung (SINAR HARAPAN ⊂ SINAR HARAPAN 305) tidak dihitung.
    const cocokTerkandung = gt.map((_, j) => [j, [...namaGt[j]].filter((n) => n && tokenNama.includes(` ${n} `))]).filter(([, ns]) => ns.length)
    const namaTerkandung = cocokTerkandung
      .filter(([j, ns]) => !cocokTerkandung.some(([k, ms]) => k !== j && ns.every((n) => ms.some((m) => m !== n && ` ${m} `.includes(` ${n} `)))))
      .map(([j]) => j)
    const olehId = new Map()
    for (const f of IDENTIFIER) {
      if (kosong(e?.[f])) continue
      const v = norm[f](String(e[f]))
      gt.forEach((_, j) => {
        if (v && idGt[j][f].includes(v)) olehId.set(j, [...(olehId.get(j) ?? []), f])
      })
    }
    const pemilikId = [...olehId.keys()]
    const cocokNamaPersis = olehNama.length === 1 ? olehNama[0] : null
    if (namaTerkandung.length >= 2 || pemilikId.length >= 2) hasil.digabung.push({ entri: i, kapalGt: [...new Set([...namaTerkandung, ...pemilikId])].map((j) => gt[j].ref) })
    if (cocokNamaPersis !== null) for (const j of pemilikId) if (j !== cocokNamaPersis) hasil.disalin.push({ entri: i, milik: gt[j].ref, dipakaiOleh: gt[cocokNamaPersis].ref, field: olehId.get(j) })
    for (const j of new Set([...olehNama, ...pemilikId, ...namaTerkandung])) dicocokkan.add(j)
    const imo = kosong(e?.imo) ? null : norm.imo(String(e.imo))
    for (const x of excl) if ((nama && nama === norm.namaKapal(x.name)) || (imo && x.imo && imo === norm.imo(x.imo))) hasil.sister.push({ entri: i, alasan: x.alasan ?? 'DIKECUALIKAN' })
  })
  gt.forEach((v, j) => {
    if (!dicocokkan.has(j)) hasil.hilang.push(v.ref)
  })
  return hasil
}

const kapalRaw = (raw) => (Array.isArray(raw?.vessels) ? raw.vessels.filter((v) => v && typeof v === 'object') : [])
const kapalPost = (post) => (post?.proposal?.vessels ?? []).map((v) => ({ name: v.name?.value ?? null, imo: v.imo?.value ?? null, mmsi: v.mmsi?.value ?? null, callSign: v.callSign?.value ?? null }))

/** G14 untuk satu slot kategori D: pelanggaran keras di RAW atau POST; kapal hilang diukur di RAW (hilang RAW→POST = G10). */
export function temuanG14(slot, norm) {
  const k = slot.kasus
  if (k.kategori !== 'D_MULTI_KAPAL' || !slot.raw || !slot.post) return []
  const r = metrikMultiKapal(k, kapalRaw(slot.raw), norm)
  const p = metrikMultiKapal(k, kapalPost(slot.post), norm)
  const out = []
  for (const [lapisan, m] of [['RAW', r], ['POST', p]]) {
    for (const x of m.disalin) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, lapisan, jenis: 'IDENTIFIER_DISALIN', ...x })
    for (const x of m.digabung) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, lapisan, jenis: 'TUG_TONGKANG_DIGABUNG', ...x })
    for (const x of m.sister) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, lapisan, jenis: 'KAPAL_DIKECUALIKAN_MASUK', ...x })
  }
  for (const ref of r.hilang) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, lapisan: 'RAW', jenis: 'KAPAL_PESERTA_HILANG', ref })
  return out
}

/** G11 untuk satu slot: kategori C/E/F/G FATAL POST; E tak pernah NEW_* di POST; kapal dikecualikan di POST (semua kasus). */
export function temuanG11(slot, norm) {
  const k = slot.kasus
  const out = []
  if (!slot.nilai?.POST) return out
  if (/^[CEFG]_/.test(k.kategori) && slot.nilai.POST.jumlah.FATAL > 0) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, jenis: 'FATAL_POST', fatal: slot.nilai.POST.fatal.map((f) => `${f.kode}@${f.jalur}`) })
  if (k.kategori === 'E_IDENTITAS_P0' && NEW(slot.post?.classification)) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, jenis: 'E_NEW_POST' })
  for (const x of k.kapalDikecualikan ?? []) {
    const n = norm.namaKapal(x.name)
    if (slot.post.proposal.vessels.some((v) => (v.name.value && norm.namaKapal(v.name.value) === n) || (v.imo.value && x.imo && norm.imo(v.imo.value) === x.imo))) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, jenis: 'KAPAL_DIKECUALIKAN_DI_POST' })
  }
  return out
}

function temuanTanggalPost(slot) {
  const out = []
  if (!slot.nilai?.POST) return out
  for (const b of slot.nilai.POST.baris) {
    if (!FIELD_TANGGAL.includes(b.generik) || (b.hasil !== S.HASIL.WRONG && b.hasil !== S.HASIL.HALLUCINATED)) continue
    out.push({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, field: b.generik, hasil: b.hasil })
  }
  return out
}
function temuanTanpaTahunRaw(slot) {
  if (!slot.raw) return []
  return FIELD_TANGGAL.filter((f) => slot.kasus.gt[f]?.tanpaTahun && !kosong(slot.raw[f])).map((f) => ({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, field: f }))
}
function temuanHilangDiamDiam(slot) {
  if (!slot.raw || !slot.post) return []
  const dropped = slot.post.proposal.vesselsDropped ?? 0
  const out = []
  const rawN = E2.kapalRawBeridentitas(slot.raw)
  const postN = slot.post.proposal.vessels.length
  if (rawN - postN !== dropped) out.push({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, jenis: 'INVARIAN_HITUNG', rawBeridentitas: rawN, post: postN, vesselsDropped: dropped })
  const hilangRaw = new Set((slot.nilai?.RAW?.kapal?.hilang ?? []).map((h) => h.ref))
  const olehValidator = (slot.nilai?.POST?.kapal?.hilang ?? []).map((h) => h.ref).filter((r) => !hilangRaw.has(r))
  if (olehValidator.length > dropped) out.push({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, jenis: 'KAPAL_GT_HILANG', refs: olehValidator, vesselsDropped: dropped })
  return out
}

/** Kasus positif yang subtipenya ditetapkan dokumen (himpunan GT berisi tepat satu NEW_*). */
export const kasusSubtipeKetat = (mod = F) => mod.KASUS_EVAL3.filter((k) => k.polaritas === 'POSITIF' && k.gt.classification.values.length === 1 && NEW(k.gt.classification.values[0])).map((k) => k.id)

// ================================================================== gerbang
/**
 * `slots` = slot BLOK_DINILAI: { seq, blok, kasus (ter-resolve), status, raw, post, nilai, panggilan, p1 }.
 * `operasional` = { lengkap, dihentikan, pelanggaranPagar[], servedCocok, tanpaFallback, pagarBiayaAktif }.
 * `ledger` = { failClosedOk, e2eOk, sentinelBersih, modelE2e } | null. `g12` = true | false | null.
 */
export function evaluasiGerbangEval3({ slots, operasional, ledger, g12, norm, mod = F }) {
  const GB = mod.GERBANG_EVAL3
  const n = mod.KASUS_EVAL3.length
  const blok = (b) => slots.filter((s) => s.blok === b)
  const LENGAN = [BLOK_KONTROL, ...BLOK_S5]
  const nilaiAtauGagal = (s) => s.nilai ?? { id: s.kasus.id, kind: s.kasus.kind, ekstraktorGagal: true, argumenTidakSah: [s.status] }
  const ringkas = (b) => S.ringkasRun(blok(b).map(nilaiAtauGagal), { jumlahKasusDiharapkan: n, latensiMs: blok(b).flatMap((s) => (s.panggilan ?? []).map((p) => p.latencyMs).filter((x) => typeof x === 'number')) })
  const rk = Object.fromEntries(LENGAN.map((b) => [b, ringkas(b)]))
  const perLengan = (fn) => Object.fromEntries(LENGAN.map((b) => [b, blok(b).flatMap(fn)]))
  const g = {}

  // G1 — nol FATAL POST, SEMUA lengan.
  const g1 = Object.fromEntries(LENGAN.map((b) => [b, blok(b).filter((s) => s.nilai?.POST?.jumlah.FATAL > 0).map((s) => ({ seq: s.seq, kasus: s.kasus.id, fatal: s.nilai.POST.fatal.map((f) => `${f.kode}@${f.jalur}`) }))]))
  g.G1 = { perLengan: g1, lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, g1[b].length <= GB.G1.ambang.fatalPostMaks])) }

  // G2 — akurasi RAW & POST terpisah (S5). P1 TIDAK dihitung benar.
  const akurasi = (b, lapisan) => {
    const xs = blok(b)
    return xs.length ? xs.filter((s) => s.nilai?.[lapisan]?.klasifikasi?.hasil === S.HASIL.CORRECT).length / n : 0
  }
  const penahananP1 = (b) => blok(b).filter((s) => s.nilai?.POST && s.nilai.POST.klasifikasi.hasil !== S.HASIL.CORRECT && s.post?.classification === 'INSUFFICIENT_INFORMATION' && s.p1?.subtypeReviewRequired === true).map((s) => s.kasus.id)
  g.G2 = {
    detail: Object.fromEntries(LENGAN.map((b) => [b, { raw: akurasi(b, 'RAW'), post: akurasi(b, 'POST'), penahananP1: penahananP1(b) }])),
    lulusLengan: Object.fromEntries(BLOK_S5.map((b) => [b, akurasi(b, 'RAW') >= GB.G2.ambang.akurasiRawMin && akurasi(b, 'POST') >= GB.G2.ambang.akurasiPostMin])),
  }
  // G2S — disiplin subtipe (S5).
  const ketat = kasusSubtipeKetat(mod)
  const g2s = (b) => {
    const salahKetat = blok(b).filter((s) => ketat.includes(s.kasus.id) && s.post && s.post.classification !== s.kasus.gt.classification.values[0]).map((s) => s.kasus.id)
    const tanpaBukti = blok(b).filter((s) => s.kasus.polaritas === 'POSITIF' && !ketat.includes(s.kasus.id) && s.post?.classification === 'NEW_APPOINTMENT').map((s) => s.kasus.id)
    return { salahKetat, tanpaBukti }
  }
  g.G2S = { detail: Object.fromEntries(BLOK_S5.map((b) => [b, g2s(b)])), lulusLengan: Object.fromEntries(BLOK_S5.map((b) => [b, g2s(b).salahKetat.length <= GB.G2S.ambang.subtipeEksplisitSalahMaks && g2s(b).tanpaBukti.length <= GB.G2S.ambang.appointmentTanpaBuktiMaks])) }
  // G3 / G4 (S5).
  g.G3 = { detail: Object.fromEntries(BLOK_S5.map((b) => [b, rk[b].recallTeks])), lulusLengan: Object.fromEntries(BLOK_S5.map((b) => [b, (rk[b].recallTeks.nilai ?? 0) >= GB.G3.ambang.recallTeksMin])) }
  g.G4 = { detail: Object.fromEntries(BLOK_S5.map((b) => [b, rk[b].halusinasiRawTeks])), lulusLengan: Object.fromEntries(BLOK_S5.map((b) => [b, rk[b].halusinasiRawTeks <= GB.G4.ambang.halusinasiRawTeksMaks])) }
  // G5 — S5 vs kontrol (keduanya Prompt v3).
  const k = rk[BLOK_KONTROL]
  g.G5 = {
    detail: { kontrol: [k.fatalPost, k.majorPost], ...Object.fromEntries(BLOK_S5.map((b) => [b, [rk[b].fatalPost, rk[b].majorPost]])) },
    lulusLengan: Object.fromEntries(BLOK_S5.map((b) => [b, rk[b].fatalPost <= k.fatalPost + GB.G5.ambang.fatalPostMaksRelatif && rk[b].majorPost <= k.majorPost + GB.G5.ambang.majorToleransi])),
  }
  // G6 — keterulangan S5.
  const tt = (b) => new Map(blok(b).map((s) => [s.kasus.id, s.nilai?.tandaTangan ?? null]))
  const [t1, t2] = BLOK_S5.map(tt)
  const beda = mod.KASUS_EVAL3.map((x) => x.id).filter((id) => t1.get(id) == null || t1.get(id) !== t2.get(id))
  g.G6 = { detail: { identik: n - beda.length, dari: n, berbeda: beda }, lulusLengan: { S5: n > 0 && (n - beda.length) / n >= GB.G6.ambang.identikMin } }
  // G7 — infrastruktur (semua lengan).
  const gagalTool = Object.fromEntries(LENGAN.map((b) => [b, rk[b].gagalEkstraktor]))
  const lat = Object.fromEntries(LENGAN.map((b) => [b, rk[b].latensiP95Ms]))
  const infraOk = operasional.pelanggaranPagar.length <= GB.G7.ambang.pelanggaranPagarMaks && operasional.servedCocok === GB.G7.ambang.servedModelPersis && operasional.tanpaFallback === GB.G7.ambang.tanpaFallback && operasional.pagarBiayaAktif === GB.G7.ambang.pagarBiayaAktif
  g.G7 = {
    detail: { gagalTool, latensiP95Ms: lat, pelanggaranPagar: operasional.pelanggaranPagar, servedCocok: operasional.servedCocok, tanpaFallback: operasional.tanpaFallback, pagarBiayaAktif: operasional.pagarBiayaAktif },
    lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, infraOk && gagalTool[b].length <= GB.G7.ambang.gagalToolMaks && (lat[b] === null || lat[b] <= GB.G7.ambang.latensiP95MsMaks)])),
    infraOk,
  }
  // G8 — buku besar dengan Sonnet 5.
  g.G8 = ledger
    ? { detail: ledger, lulusLengan: { LEDGER: !!(ledger.failClosedOk === GB.G8.ambang.failClosedOk && ledger.e2eOk === GB.G8.ambang.e2eOk && ledger.sentinelBersih === GB.G8.ambang.sentinelBersih && ledger.modelE2e === GB.G8.ambang.modelE2e) } }
    : { detail: 'BELUM_DIEVALUASI', lulusLengan: { LEDGER: null } }
  // G9 / G9R / G10 / G11 / G13 / G14.
  const g9 = perLengan(temuanTanggalPost)
  g.G9 = { perLengan: g9, lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, g9[b].length <= GB.G9.ambang.tanggalTakBerbuktiPostMaks])) }
  const g9r = Object.fromEntries(BLOK_S5.map((b) => [b, blok(b).flatMap(temuanTanpaTahunRaw)]))
  g.G9R = { perLengan: g9r, kontrolInformatif: blok(BLOK_KONTROL).flatMap(temuanTanpaTahunRaw), lulusLengan: Object.fromEntries(BLOK_S5.map((b) => [b, g9r[b].length <= GB.G9R.ambang.tanpaTahunTerisiRawMaks])) }
  const g10 = perLengan(temuanHilangDiamDiam)
  g.G10 = { perLengan: g10, lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, g10[b].length <= GB.G10.ambang.hilangDiamDiamMaks])) }
  const g11 = perLengan((s) => temuanG11(s, norm))
  g.G11 = {
    perLengan: g11,
    lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, g11[b].filter((x) => x.jenis === 'FATAL_POST').length <= GB.G11.ambang.fatalPostMaks && g11[b].filter((x) => x.jenis === 'E_NEW_POST').length <= GB.G11.ambang.eNewPostMaks && g11[b].filter((x) => x.jenis === 'KAPAL_DIKECUALIKAN_DI_POST').length <= GB.G11.ambang.kapalDikecualikanMunculMaks])),
  }
  g.G12 = { detail: g12 == null ? 'BELUM_DIEVALUASI' : 'check-eval3-gt.mjs', lulusLengan: { PRASYARAT: g12 == null ? null : !!g12 } }
  const g13 = perLengan(temuanG13)
  g.G13 = {
    perLengan: g13,
    lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, g13[b].filter((x) => x.lapisan === 'RAW').length <= GB.G13.ambang.newPadaNonKeagenanRawMaks && g13[b].filter((x) => x.lapisan === 'POST').length <= GB.G13.ambang.newPadaNonKeagenanPostMaks])),
  }
  const g14 = perLengan((s) => temuanG14(s, norm))
  const hitung14 = (b, jenis) => g14[b].filter((x) => x.jenis === jenis).length
  g.G14 = {
    perLengan: g14,
    lulusLengan: Object.fromEntries(LENGAN.map((b) => [b, hitung14(b, 'IDENTIFIER_DISALIN') <= GB.G14.ambang.identifierDisalinMaks && hitung14(b, 'TUG_TONGKANG_DIGABUNG') <= GB.G14.ambang.tugTongkangDigabungMaks && hitung14(b, 'KAPAL_DIKECUALIKAN_MASUK') <= GB.G14.ambang.kapalDikecualikanMasukMaks])),
    kondisionalLengan: Object.fromEntries(LENGAN.map((b) => [b, hitung14(b, 'KAPAL_PESERTA_HILANG') <= GB.G14.ambang.kapalPesertaHilangMaks])),
  }

  // Ringkas lulus per gerbang (semua lengan yang dinilai gerbang itu).
  for (const x of Object.values(g)) {
    const vs = Object.values(x.lulusLengan)
    x.lulus = vs.some((v) => v === null) ? null : vs.every(Boolean) && (x.kondisionalLengan ? Object.values(x.kondisionalLengan).every(Boolean) : true)
  }

  // Dua putusan terpisah.
  const takLengkap = (lengan) => !operasional.lengkap || operasional.dihentikan || lengan.some((b) => rk[b].argumenTidakSah.length || rk[b].gagalEkstraktor.length || blok(b).length !== n)
  const infraFail = !g.G7.infraOk
  const KERAS_SEMUA = ['G1', 'G9', 'G10', 'G11', 'G13']
  const putusan = (lengan, { g5, g8 }) => {
    const kerasGagal = KERAS_SEMUA.filter((x) => lengan.some((b) => g[x].lulusLengan[b] === false))
    if (lengan.some((b) => g.G14.lulusLengan[b] === false)) kerasGagal.push('G14')
    if (g5 && g.G5.lulus === false) kerasGagal.push('G5')
    if (g8 && g.G8.lulus === false) kerasGagal.push('G8')
    if (g.G12.lulus === false) kerasGagal.push('G12')
    const lunakGagal = []
    if (lengan.some((b) => g.G14.kondisionalLengan[b] === false)) lunakGagal.push('G14-kondisional')
    if (lengan.some((b) => g.G7.lulusLengan[b] === false)) lunakGagal.push('G7')
    for (const x of ['G2', 'G2S', 'G3', 'G4', 'G9R']) if (lengan.some((b) => g[x].lulusLengan[b] === false)) lunakGagal.push(x)
    if (g5 && g.G6.lulus === false) lunakGagal.push('G6')
    let verdict
    if (infraFail || kerasGagal.length) verdict = 'FAIL'
    else if (takLengkap(lengan) || g.G12.lulus === null || (g8 && g.G8.lulus === null)) verdict = 'INCONCLUSIVE'
    else if (lunakGagal.length) verdict = 'CONDITIONAL'
    else verdict = 'PASS'
    return { verdict, kerasGagal, lunakGagal }
  }
  const promptV3Produksi = putusan([BLOK_KONTROL], { g5: false, g8: false })
  const kandidatS5 = putusan([...BLOK_S5], { g5: true, g8: true })

  const atribusi = new Map()
  const tandai = (seq, gate) => atribusi.set(seq, [...new Set([...(atribusi.get(seq) ?? []), gate])])
  for (const s of slots) if (s.nilai?.POST?.jumlah.FATAL) tandai(s.seq, 'G1')
  for (const [gate, per] of [['G9', g9], ['G10', g10], ['G11', g11], ['G13', g13], ['G14', g14]]) for (const xs of Object.values(per)) for (const x of xs) tandai(x.seq, gate)
  for (const xs of Object.values(g9r)) for (const x of xs) tandai(x.seq, 'G9R')
  for (const s of slots) if (BLOK_S5.includes(s.blok) && s.nilai && (s.nilai.POST.klasifikasi.hasil !== S.HASIL.CORRECT || s.nilai.RAW.klasifikasi.hasil !== S.HASIL.CORRECT)) tandai(s.seq, 'G2')

  return { gerbang: g, putusan: { PROMPT_V3_PRODUKSI: promptV3Produksi, KANDIDAT_S5: kandidatS5 }, ringkasan: rk, atribusi, catatan: 'PASS bukan aktivasi: anthropic/claude-sonnet-5 TETAP PENDING_SPIKE sampai keputusan owner terpisah.' }
}

/** Kasus ter-resolve harus berbentuk yang diharapkan penilai — bila tidak, gagal-tertutup. */
export const masalahKasusPenilai = E2.masalahKasusPenilai
export const sidikSumber = E2.sidikSumber
export const diagnostikSlotEval2 = E2.diagnostikSlot
