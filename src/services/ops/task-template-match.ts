// Pemilihan TaskTemplate — MURNI, tanpa impor nilai (K93, §3).
//
// ❌ MURNI. Kandidat datang sebagai ARRAY dari task-template.service.ts (7c),
// bukan dari query di sini — persis pola rate-resolver.ts (K25), supaya bagian
// yang menentukan "checklist mana yang dipasang" bisa diuji dengan array bikinan
// tanpa database.
//
// KENAPA POLANYA SAMA PERSIS DENGAN K25 dan bukan pola baru: saring → skor →
// tie-break → jujur soal ambiguitas. Pelaksana yang sudah membaca rate-resolver
// tidak perlu belajar aturan kedua, dan bug yang sudah ditemukan di sana
// (pemilihan yang berubah saat urutan array berubah) tidak perlu ditemukan dua kali.

/** Bentuk kandidat = subset TaskTemplate yang benar-benar dipakai memilih. */
export type KandidatTemplate = {
  id: string
  name: string
  portId: string | null
  agencyType: string | null
  vesselType: string | null
  isDefault: boolean
  isActive: boolean
  deletedAt: Date | null
  updatedAt: Date
}

export type KonteksTemplate = {
  portId: string | null
  agencyType: string | null
  vesselType: string | null
}

export type KodePeringatanTemplate = 'TEMPLATE_TIDAK_ADA' | 'TEMPLATE_AMBIGU'

export type PeringatanTemplate = {
  kode: KodePeringatanTemplate
  pesan: string
  data?: Readonly<Record<string, string | number | null>>
}

export type HasilPilihTemplate = {
  terpilih: KandidatTemplate | null
  skor: number | null
  /** Kandidat yang lolos saringan, sudah terurut menang→kalah. */
  kandidatLolos: readonly KandidatTemplate[]
  peringatan: PeringatanTemplate[]
}

/**
 * Bobot spesifisitas K93 — angkanya sengaja identik dengan K25 (rate-resolver).
 * `4 > 2 + 1` disengaja: template khusus pelabuhan SELALU mengalahkan kombinasi
 * apa pun dari kecocokan lain, karena urutan pekerjaan itu memang ditentukan
 * pelabuhannya (instansi, syahbandar, kebiasaan setempat), sedangkan jenis
 * keagenan dan jenis kapal adalah pemodelan kita sendiri.
 */
export const BOBOT_PORT = 4
export const BOBOT_AGENCY_TYPE = 2
export const BOBOT_VESSEL_TYPE = 1

/**
 * `null` pada template berarti "cocok apa saja" — bernilai 0, TIDAK menggugurkan.
 * Yang menggugurkan hanyalah nilai yang terisi tapi berbeda: template khusus
 * Samarinda tidak boleh terpasang di Balikpapan hanya karena skornya kebetulan
 * tertinggi.
 */
export function lolosSaringanTemplate(k: KandidatTemplate, ctx: KonteksTemplate): boolean {
  if (!k.isActive) return false
  if (k.deletedAt !== null) return false
  if (k.portId !== null && k.portId !== ctx.portId) return false
  if (k.agencyType !== null && k.agencyType !== ctx.agencyType) return false
  if (k.vesselType !== null && k.vesselType !== ctx.vesselType) return false
  return true
}

export function skorTemplate(k: KandidatTemplate, ctx: KonteksTemplate): number {
  let skor = 0
  if (k.portId !== null && k.portId === ctx.portId) skor += BOBOT_PORT
  if (k.agencyType !== null && k.agencyType === ctx.agencyType) skor += BOBOT_AGENCY_TYPE
  if (k.vesselType !== null && k.vesselType === ctx.vesselType) skor += BOBOT_VESSEL_TYPE
  return skor
}

/**
 * Urutan menang K93: skor tertinggi → `isDefault` → `updatedAt` terbaru →
 * `id` terkecil.
 *
 * Rantai tie-break WAJIB diakhiri `id`: tanpa itu, `Array.prototype.sort` yang
 * mengembalikan 0 untuk dua kandidat setara membuat hasilnya bergantung pada
 * urutan masuk array — yaitu pada urutan baris yang dikembalikan Postgres, yang
 * tidak dijamin apa pun tanpa ORDER BY. Uji "acak arraynya, hasilnya harus sama"
 * sudah pernah menemukan bug nyata persis di titik ini pada `pilihTarif`.
 */
function bandingkan(a: KandidatTemplate, b: KandidatTemplate, ctx: KonteksTemplate): number {
  const ds = skorTemplate(b, ctx) - skorTemplate(a, ctx)
  if (ds !== 0) return ds
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
  const du = b.updatedAt.getTime() - a.updatedAt.getTime()
  if (du !== 0) return du
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function pilihTemplate(
  kandidat: readonly KandidatTemplate[],
  ctx: KonteksTemplate,
): HasilPilihTemplate {
  const peringatan: PeringatanTemplate[] = []
  const lolos = kandidat
    .filter((k) => lolosSaringanTemplate(k, ctx))
    .slice()
    .sort((a, b) => bandingkan(a, b, ctx))

  if (lolos.length === 0) {
    // K95 pintu 1: tak ada template yang cocok BUKAN galat. Voyage tetap lahir,
    // hanya tanpa checklist. Peringatan ini untuk dilaporkan, bukan untuk melempar.
    peringatan.push({
      kode: 'TEMPLATE_TIDAK_ADA',
      pesan: 'Tidak ada checklist yang cocok untuk pelabuhan/jenis keagenan ini.',
    })
    return { terpilih: null, skor: null, kandidatLolos: lolos, peringatan }
  }

  const menang = lolos[0]
  const kedua = lolos[1]

  // K93: memilih diam-diam di antara dua template yang sama-sama sah berarti
  // operator tidak pernah tahu bahwa checklist saingannya ada — dan menyalahkan
  // sistem saat butir yang ia harapkan tidak muncul.
  if (
    kedua &&
    skorTemplate(kedua, ctx) === skorTemplate(menang, ctx) &&
    kedua.isDefault === menang.isDefault &&
    kedua.updatedAt.getTime() === menang.updatedAt.getTime()
  ) {
    peringatan.push({
      kode: 'TEMPLATE_AMBIGU',
      pesan: '2 checklist bersaing dengan spesifisitas yang sama — periksa Master › Checklist.',
      data: { templateDipakai: menang.id, templatePesaing: kedua.id },
    })
  }

  return { terpilih: menang, skor: skorTemplate(menang, ctx), kandidatLolos: lolos, peringatan }
}

export const adaPeringatanTemplate = (
  hasil: HasilPilihTemplate,
  kode: KodePeringatanTemplate,
): boolean => hasil.peringatan.some((p) => p.kode === kode)
