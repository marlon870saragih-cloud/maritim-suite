// PRD-005 E5 Step 5 — Eval-2: rencana, penilaian berlapis, diagnostik RAW tersanitasi, gerbang.
//
// Modul MURNI: tanpa jaringan, tanpa berkas, tanpa kode produksi. Normalisasi intake DISUNTIKKAN
// lewat `norm` (sama seperti penilai Eval-1). Penilaian per kasus MEMAKAI ULANG penilai Eval-1
// (spike-eval1-scorer.mjs, tidak diubah); modul ini hanya menambah yang khas Eval-2:
//   • rencana 80 slot dari RENCANA_EVAL2 beku + validasi gagal-tertutup;
//   • gerbang G1–G12 + G9R — ambang & sifat keras/kondisional DIBACA dari GERBANG_EVAL2 beku;
//   • diagnostik RAW tersanitasi (tanpa nilai string identitas/pihak/kontak/dokumen).
//
// Lapisan per slot (tak pernah ditukar): A sumber · B respons penyedia (metadata) · C argumen tool
// RAW · D hasil validator · E proposal POST · F hasil penilai (RAW & POST terpisah) · G gerbang.

import { createHmac, createHash } from 'node:crypto'
import * as S from './spike-eval1-scorer.mjs'
import * as F from './fixtures/spike-intake/eval2-cases.mjs'

export const VERSI_PENILAI_EVAL2 = 'prd005-e5-eval2/penilai-1'
/** Kasus slot LEDGER_E2E (konfigurasi runner, bukan GT): satu kapal tunggal + satu multi-kapal. */
export const KASUS_LEDGER_EVAL2 = Object.freeze(['T03', 'T12'])
export const FIELD_TANGGAL = Object.freeze(['eta', 'etb', 'etc', 'etd', 'requestDate'])
const FIELD_IDENTITAS = ['name', 'imo', 'mmsi', 'callSign']
const MAKS_KAPAL_VALIDATOR = 10 // = MAKS_KAPAL_INTAKE (intake-policy)
const BLOK_DINILAI = ['S45_KONTROL', 'S5_RUN1', 'S5_RUN2']

// ================================================================== rencana
/** Rencana deterministik dari RENCANA_EVAL2 beku: blok berurutan, kasus berurutan T01…T26. */
export function susunRencanaEval2(mod = F) {
  const ids = mod.KASUS_EVAL2.map((k) => k.id)
  const r = []
  for (const b of mod.RENCANA_EVAL2.blok) {
    const kasus = b.blok === 'LEDGER_E2E' ? [...KASUS_LEDGER_EVAL2] : ids
    for (const id of kasus) r.push({ seq: r.length + 1, blok: b.blok, model: b.model, kasus: id })
  }
  return r
}

/**
 * Galat rencana (kosong = sah). Gagal-tertutup untuk: jumlah ≠ beku, melebihi maks, blok hilang/
 * lebih, model tak dikenal / beda dari blok beku, kasus tak dikenal, duplikat (blok+kasus), seq
 * tidak berurutan, metadata slot tak lengkap.
 */
export function validasiRencanaEval2(rencana, { mod = F, allowlist } = {}) {
  const galat = []
  if (!Array.isArray(rencana) || rencana.length === 0) return ['RENCANA_KOSONG']
  const R = mod.RENCANA_EVAL2
  const ids = new Set(mod.KASUS_EVAL2.map((k) => k.id))
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
    const n = rencana.filter((s) => s?.blok === b.blok).length
    if (n !== b.kasus) galat.push(`JUMLAH_BLOK_BERBEDA:${b.blok}:${n}/${b.kasus}`)
  }
  return galat
}

// ================================================================== diagnostik tersanitasi
/** Garam per laporan — TIDAK pernah ditulis. Sidik hanya bisa dibandingkan di dalam satu laporan. */
export const buatSidik = (garam) => (v) => (v === null || v === undefined || v === '' ? null : createHmac('sha256', garam).update(String(v)).digest('hex').slice(0, 12))
/** Bentuk karakter: huruf → A, angka → 9, spasi & tanda baca dipertahankan. */
export const bentuk = (v) => (v === null || v === undefined ? null : String(v).replace(/[A-Za-z]/g, 'A').replace(/[0-9]/g, '9').slice(0, 60))
const kosong = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const tanggalIso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null)
/** Nilai tanggal aman untuk laporan: ISO apa adanya (data sintetis, bukan PII), selain itu hanya bentuknya. */
const tanggalAman = (v) => (kosong(v) ? null : tanggalIso(v) ?? `BENTUK:${bentuk(v)}`)

/** Entri kapal RAW yang membawa identitas — cermin aturan hitung vesselsDropped di validator. */
export function kapalRawBeridentitas(raw) {
  const v = Array.isArray(raw?.vessels) ? raw.vessels.slice(0, MAKS_KAPAL_VALIDATOR) : []
  return v.filter((k) => k && typeof k === 'object' && FIELD_IDENTITAS.some((f) => !kosong(k[f]))).length
}

function ringkasTemuan(L) {
  if (!L) return null
  return { FATAL: L.jumlah.FATAL, MAJOR: L.jumlah.MAJOR, MINOR: L.jumlah.MINOR, fatal: L.fatal.map((f) => `${f.kode}@${f.jalur}`), halusinasiKritis: L.halusinasiKritis }
}

/**
 * Diagnostik satu slot, TANPA nilai string identitas / nama / pihak / kontak / isi dokumen.
 * Yang boleh apa adanya: klasifikasi (enum), jumlah, peran (enum), tanggal ISO (sintetis),
 * kuantitas & operasi muatan, flag validator, hasil penilai. Sisanya: sidik HMAC + bentuk.
 */
export function diagnostikSlot({ slot, kasus, raw, post, nilai, panggilan = [], garam, norm }) {
  const sidik = buatSidik(garam)
  const d = {
    seq: slot.seq,
    blok: slot.blok,
    run: slot.blok === 'S5_RUN2' ? 2 : 1,
    model: slot.model,
    kasus: kasus.id,
    kategori: kasus.kategori,
    polaritas: kasus.polaritas,
    adversarial: kasus.adversarial,
    status: slot.status,
    klasifikasi: { harap: kasus.gt.classification.values, raw: raw?.classification ?? null, post: post?.classification ?? null, alasanPost: post?.proposal?.classificationReason ?? null },
    kapal: null,
    tanggal: {},
    flags: {},
    temuan: { RAW: ringkasTemuan(nilai?.RAW), POST: ringkasTemuan(nilai?.POST) },
    panggilan: panggilan.map((p) => ({ http: p.http ?? null, httpStatus: p.httpStatus ?? null, servedModel: p.servedModel ?? null, latencyMs: p.latencyMs ?? null, promptTokens: p.promptTokens ?? null, completionTokens: p.completionTokens ?? null, biayaUsd: p.biayaUsd ?? null, finishReason: p.finishReason ?? null })),
    gerbang: [],
  }
  if (!raw || typeof raw !== 'object') return d
  const rawKapal = Array.isArray(raw.vessels) ? raw.vessels : []
  const postKapal = post?.proposal?.vessels ?? []
  const namaKe = (v) => (kosong(v) ? null : norm.namaKapal(String(v)) ?? String(v).toUpperCase())
  const bidang = (v, tipe) => {
    if (kosong(v)) return { ada: false }
    const s = String(v)
    const normal = tipe === 'name' ? namaKe(s) : s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    return { ada: true, sidik: sidik(normal), bentuk: bentuk(s), panjang: s.length, ...(tipe === 'name' ? { token: normal.split(' ').map(sidik) } : {}) }
  }
  d.kapal = {
    raw: rawKapal.length,
    rawBeridentitas: kapalRawBeridentitas(raw),
    post: postKapal.length,
    dropped: post?.proposal?.vesselsDropped ?? 0,
    rawEntri: rawKapal.slice(0, MAKS_KAPAL_VALIDATOR).map((k) => ({ role: typeof k?.role === 'string' ? k.role.slice(0, 10).toUpperCase() : null, ...Object.fromEntries(FIELD_IDENTITAS.map((f) => [f, bidang(k?.[f], f)])) })),
    postEntri: postKapal.map((k) => ({ role: k.role?.value ?? null, ...Object.fromEntries(FIELD_IDENTITAS.map((f) => [f, { ...bidang(k[f]?.value, f), flags: k[f]?.flags ?? [] }])) })),
    hilangRaw: nilai?.RAW?.kapal?.hilang?.map((h) => h.ref) ?? null,
    hilangPost: nilai?.POST?.kapal?.hilang?.map((h) => h.ref) ?? null,
  }
  for (const f of FIELD_TANGGAL) {
    const pf = post?.proposal?.[f]
    d.tanggal[f] = { gt: kasus.gt[f]?.status ?? null, tanpaTahun: !!kasus.gt[f]?.tanpaTahun, raw: tanggalAman(raw[f]), post: pf ? tanggalAman(pf.value) : null, flags: pf?.flags ?? [] }
  }
  for (const f of ['principalName', 'customerName', 'portName', 'portUnlocode']) {
    const pf = post?.proposal?.[f]
    if (pf && (pf.flags?.length || !kosong(raw[f]))) d.flags[f] = { raw: bidang(raw[f], f), postAda: !kosong(pf.value), flags: pf.flags ?? [] }
  }
  return d
}

// ================================================================== gerbang
/** Sifat keras/kondisional & ambang langsung dari GERBANG_EVAL2 beku. */
const G = (mod) => mod.GERBANG_EVAL2

function temuanTanggalPost(slot) {
  const out = []
  if (!slot.nilai?.POST) return out
  for (const b of slot.nilai.POST.baris) {
    if (!FIELD_TANGGAL.includes(b.generik)) continue
    if (b.hasil !== S.HASIL.WRONG && b.hasil !== S.HASIL.HALLUCINATED) continue
    const pf = slot.post?.proposal?.[b.generik]
    out.push({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, field: b.generik, hasil: b.hasil, raw: tanggalAman(slot.raw?.[b.generik]), post: tanggalAman(pf?.value), flags: pf?.flags ?? [], atribusi: 'VALIDATOR_LOLOS' })
  }
  return out
}

function temuanTanpaTahunRaw(slot) {
  if (!slot.raw) return []
  return FIELD_TANGGAL.filter((f) => slot.kasus.gt[f]?.tanpaTahun && !kosong(slot.raw[f])).map((f) => ({
    seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, field: f, raw: tanggalAman(slot.raw[f]), post: tanggalAman(slot.post?.proposal?.[f]?.value), flags: slot.post?.proposal?.[f]?.flags ?? [], atribusi: 'MODEL',
  }))
}

/** G10: kapal hilang RAW→POST yang TIDAK tercermin di vesselsDropped. */
function temuanHilangDiamDiam(slot) {
  if (!slot.raw || !slot.post) return []
  const dropped = slot.post.proposal.vesselsDropped ?? 0
  const out = []
  const rawN = kapalRawBeridentitas(slot.raw)
  const postN = slot.post.proposal.vessels.length
  if (rawN - postN !== dropped) out.push({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, jenis: 'INVARIAN_HITUNG', rawBeridentitas: rawN, post: postN, vesselsDropped: dropped })
  const hilangRaw = new Set((slot.nilai?.RAW?.kapal?.hilang ?? []).map((h) => h.ref))
  const hilangPost = (slot.nilai?.POST?.kapal?.hilang ?? []).map((h) => h.ref)
  const hilangOlehValidator = hilangPost.filter((r) => !hilangRaw.has(r))
  if (hilangOlehValidator.length > dropped) out.push({ seq: slot.seq, blok: slot.blok, kasus: slot.kasus.id, jenis: 'KAPAL_GT_HILANG', refs: hilangOlehValidator, vesselsDropped: dropped })
  return out
}

/** G11: kasus negatif/adversarial — FATAL POST atau kapal dikecualikan muncul di POST. */
function temuanNegatif(slot, norm) {
  const k = slot.kasus
  if (k.polaritas !== 'NEGATIF' && !k.adversarial) return []
  const out = []
  if (!slot.nilai?.POST) return out
  if (slot.nilai.POST.jumlah.FATAL > 0) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, jenis: 'FATAL_POST', fatal: slot.nilai.POST.fatal.map((f) => `${f.kode}@${f.jalur}`) })
  const excl = k.kapalDikecualikan ?? []
  for (const x of excl) {
    const n = norm.namaKapal(x.name)
    const muncul = slot.post.proposal.vessels.some((v) => (v.name.value && norm.namaKapal(v.name.value) === n) || (v.imo.value && norm.imo(v.imo.value) === x.imo))
    if (muncul) out.push({ seq: slot.seq, blok: slot.blok, kasus: k.id, jenis: 'KAPAL_DIKECUALIKAN_DI_POST', alasan: x.alasan })
  }
  return out
}

/**
 * Evaluasi gerbang Eval-2. `slots` = hasil slot BLOK_DINILAI: { seq, blok, kasus (ter-resolve),
 * status, raw, post, nilai, panggilan }. `operasional` = { lengkap, dihentikan, pelanggaranPagar[],
 * servedCocok, gagalTool[] }. `ledger` = { failClosedOk, e2eOk, sentinelBersih } | null.
 * `g12` = true | false | null (null = belum dievaluasi).
 */
export function evaluasiGerbangEval2({ slots, operasional, ledger, g12, norm, mod = F }) {
  const GB = G(mod)
  const perBlok = (b) => slots.filter((s) => s.blok === b)
  const ringkas = (b) => {
    const xs = perBlok(b)
    return S.ringkasRun(xs.map((s) => s.nilai ?? { id: s.kasus.id, kind: s.kasus.kind, ekstraktorGagal: true, argumenTidakSah: [s.status] }), {
      jumlahKasusDiharapkan: mod.KASUS_EVAL2.length,
      latensiMs: xs.flatMap((s) => (s.panggilan ?? []).map((p) => p.latencyMs).filter((x) => typeof x === 'number')),
    })
  }
  const k = ringkas('S45_KONTROL')
  const r1 = ringkas('S5_RUN1')
  const r2 = ringkas('S5_RUN2')
  const n = mod.KASUS_EVAL2.length
  const akurasi = (r) => (r.kasus ? r.klasifikasiBenar / r.kasus : 0)
  const g = {}
  g.G1 = { lulus: r1.fatalPost <= GB.G1.ambang.fatalPostMaks && r2.fatalPost <= GB.G1.ambang.fatalPostMaks, detail: [...r1.daftarFatalPost.map((x) => `run1 ${x}`), ...r2.daftarFatalPost.map((x) => `run2 ${x}`)] }
  g.G2 = {
    lulus: [r1, r2].every((r) => akurasi(r) >= GB.G2.ambang.akurasiMin && r.newPalsuNegatif.length <= GB.G2.ambang.newPalsuNegatifMaks),
    detail: { akurasiRun1: akurasi(r1), akurasiRun2: akurasi(r2), newPalsu: [...r1.newPalsuNegatif, ...r2.newPalsuNegatif] },
  }
  // G3: recall TEKS saja — recall PDF tak terdefinisi (0 kasus PDF, E2K7), BUKAN dianggap 0.
  g.G3 = { lulus: [r1, r2].every((r) => (r.recallTeks.nilai ?? 0) >= GB.G3.ambang.recallTeksMin), detail: { run1: r1.recallTeks, run2: r2.recallTeks, recallPdf: 'TIDAK_BERLAKU' } }
  g.G4 = { lulus: [r1, r2].every((r) => r.halusinasiRawTeks <= GB.G4.ambang.halusinasiRawTeksMaks), detail: { run1: r1.halusinasiRawTeks, run2: r2.halusinasiRawTeks } }
  g.G5 = {
    lulus: [r1, r2].every((r) => r.fatalPost <= k.fatalPost + GB.G5.ambang.fatalPostMaksRelatif && r.majorPost <= k.majorPost + GB.G5.ambang.majorToleransi),
    detail: { s5: [[r1.fatalPost, r1.majorPost], [r2.fatalPost, r2.majorPost]], s45: [k.fatalPost, k.majorPost] },
  }
  const tt = (b) => new Map(perBlok(b).map((s) => [s.kasus.id, s.nilai?.tandaTangan ?? null]))
  const t1 = tt('S5_RUN1')
  const t2 = tt('S5_RUN2')
  const beda = mod.KASUS_EVAL2.map((x) => x.id).filter((id) => t1.get(id) == null || t1.get(id) !== t2.get(id))
  g.G6 = { lulus: n > 0 && (n - beda.length) / n >= GB.G6.ambang.identikMin, detail: { identik: n - beda.length, dari: n, berbeda: beda } }
  const lat = [r1.latensiP95Ms, r2.latensiP95Ms].filter((x) => x !== null)
  const gagalTool = [...r1.gagalEkstraktor, ...r2.gagalEkstraktor]
  g.G7 = {
    lulus: gagalTool.length <= GB.G7.ambang.gagalToolMaks && lat.every((x) => x <= GB.G7.ambang.latensiP95MsMaks) && operasional.pelanggaranPagar.length <= GB.G7.ambang.pelanggaranPagarMaks && operasional.servedCocok === GB.G7.ambang.servedModelCocok,
    detail: { gagalTool, latensiP95Ms: lat, pelanggaranPagar: operasional.pelanggaranPagar, servedCocok: operasional.servedCocok },
  }
  g.G8 = ledger ? { lulus: !!(ledger.failClosedOk && ledger.e2eOk && ledger.sentinelBersih), detail: ledger } : { lulus: null, detail: 'BELUM_DIEVALUASI' }
  const g9 = slots.flatMap(temuanTanggalPost)
  g.G9 = { lulus: g9.length <= GB.G9.ambang.tanggalTakBerbuktiPostMaks, detail: g9 }
  const g9r = slots.filter((s) => s.blok !== 'S45_KONTROL').flatMap(temuanTanpaTahunRaw)
  g.G9R = { lulus: g9r.length <= GB.G9R.ambang.tanpaTahunTerisiRawMaks, detail: g9r, kontrolInformatif: slots.filter((s) => s.blok === 'S45_KONTROL').flatMap(temuanTanpaTahunRaw) }
  const g10 = slots.flatMap(temuanHilangDiamDiam)
  g.G10 = { lulus: g10.length <= GB.G10.ambang.hilangDiamDiamMaks, detail: g10 }
  const g11 = slots.flatMap((s) => temuanNegatif(s, norm))
  g.G11 = {
    lulus: g11.filter((x) => x.jenis === 'FATAL_POST').length <= GB.G11.ambang.fatalPostMaks && g11.filter((x) => x.jenis === 'KAPAL_DIKECUALIKAN_DI_POST').length <= GB.G11.ambang.kapalDikecualikanMunculMaks,
    detail: g11,
  }
  g.G12 = { lulus: g12 === null || g12 === undefined ? null : !!g12, detail: g12 == null ? 'BELUM_DIEVALUASI' : 'check-eval2-gt.mjs' }

  // Atribusi gerbang per slot (untuk diagnostik).
  const atribusi = new Map()
  const tandai = (seq, gate) => atribusi.set(seq, [...new Set([...(atribusi.get(seq) ?? []), gate])])
  for (const s of slots) if (s.nilai?.POST?.jumlah.FATAL && s.blok !== 'S45_KONTROL') tandai(s.seq, 'G1')
  for (const [gate, xs] of [['G9', g9], ['G9R', g9r], ['G10', g10], ['G11', g11]]) for (const x of xs) tandai(x.seq, gate)
  for (const s of slots) if (s.blok !== 'S45_KONTROL' && s.nilai?.POST?.klasifikasi.hasil !== S.HASIL.CORRECT && s.nilai) tandai(s.seq, 'G2')

  const keras = Object.keys(g).filter((x) => GB[x]?.keras)
  const gagal = Object.keys(g).filter((x) => g[x].lulus === false)
  const takLengkap = !operasional.lengkap || operasional.dihentikan || gagalTool.length > 0 || [k, r1, r2].some((r) => r.argumenTidakSah.length || r.gagalEkstraktor.length)
  let verdict
  if (operasional.pelanggaranPagar.length || !operasional.servedCocok || gagal.some((x) => keras.includes(x))) verdict = 'FAIL'
  else if (takLengkap || g.G8.lulus === null || g.G12.lulus === null) verdict = 'INCONCLUSIVE'
  else if (gagal.length) verdict = 'CONDITIONAL'
  else verdict = 'PASS'
  return { gerbang: g, gagal, keras, verdict, ringkasan: { S45_KONTROL: k, S5_RUN1: r1, S5_RUN2: r2 }, atribusi, catatan: 'PASS bukan aktivasi: anthropic/claude-sonnet-5 TETAP PENDING_SPIKE.' }
}

/** Kasus ter-resolve harus berbentuk yang diharapkan penilai — bila tidak, gagal-tertutup. */
export function masalahKasusPenilai(k) {
  const m = []
  if (!k || typeof k !== 'object') return ['KASUS_BUKAN_OBJEK']
  if (typeof k.id !== 'string') m.push('ID')
  if (k.kind !== 'TEXT') m.push('KIND')
  if (!k.gt || !Array.isArray(k.gt.classification?.values)) m.push('GT_KLASIFIKASI')
  if (!Array.isArray(k.gt?.vessels?.daftar)) m.push('GT_KAPAL')
  if (!Array.isArray(k.gt?.cargoes?.bentukDiterima)) m.push('GT_MUATAN')
  return m
}

/** Sidik isi dokumen (A): hanya hash & panjang, tak pernah teksnya. */
export const sidikSumber = (teks) => ({ sha256_12: createHash('sha256').update(teks).digest('hex').slice(0, 12), panjang: teks.length })

export { BLOK_DINILAI }
