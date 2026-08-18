// Skor vendor (K113-K114, Fase 7j) — MURNI (K11/K51). Sejalan K66 (prediksi
// tak disimpan) dan K74 (aturan berbasis histori mati sendiri saat n<3 DAN
// MENGATAKANNYA): dihitung SAAT DIMINTA, tak pernah disimpan — skor tersimpan
// akan basi begitu satu dokumen ditutup, dan skor basi yang tampak seperti
// data adalah sumber salah baca klasik, di sini akibatnya bukan cuma salah
// baca tapi salah pilih rekanan.

export const AMBANG_SKOR = 3

/** K113 — bobot skor gabungan, dikurung SATU konstanta bernama (titik sentuh P38). */
export const BOBOT_SKOR_GABUNGAN = {
  ketepatanWaktu: 0.4,
  ketepatanHarga: 0.3,
  penyelesaianTugas: 0.15,
  penilaianManual: 0.15,
} as const

export type TierSkor = 'CUKUP_DATA' | 'DATA_TIPIS' | 'BELUM_ADA_DATA'

export type MetrikSkor = { nilai: number | null; n: number }

export type SkorVendor = {
  vendorId: string
  periode: { dari: string; sampai: string }
  metrik: {
    ketepatanWaktu: MetrikSkor
    ketepatanHarga: MetrikSkor
    penyelesaianTugas: MetrikSkor
    penilaianManual: MetrikSkor
  }
  skorGabungan: number | null
  tier: TierSkor
  catatan: { id: string; en: string }
}

/** Bahan mentah satu metrik — WAJIB sudah disaring dataOrigin (K55-K59) oleh pemanggil (jalur DB). */
export type BahanMetrik = {
  /** true/false per unit sampel (mis. WO selesai tepat waktu?), dipetakan jadi persen. */
  booleanSamples?: readonly boolean[]
  /** Sampel numerik langsung (mis. skor 1-5), dirata-rata apa adanya. */
  numericSamples?: readonly number[]
}

function nilaiMetrik(bahan: BahanMetrik): MetrikSkor {
  if (bahan.booleanSamples) {
    const n = bahan.booleanSamples.length
    if (n < AMBANG_SKOR) return { nilai: null, n }
    const persen = (bahan.booleanSamples.filter(Boolean).length / n) * 100
    return { nilai: Math.round(persen * 10) / 10, n }
  }
  const samples = bahan.numericSamples ?? []
  const n = samples.length
  if (n < AMBANG_SKOR) return { nilai: null, n }
  const rata = samples.reduce((s, x) => s + x, 0) / n
  return { nilai: Math.round(rata * 100) / 100, n }
}

/**
 * K113 — pintu masuk MURNI: pemanggil (vendor-score.service.ts) sudah
 * menyaring dataOrigin & tenant, sudah menyusun sampel per metrik; fungsi ini
 * cuma menilai ambang + menghitung gabungan + menyusun kalimat wajib (K70).
 */
export function hitungSkorVendor(
  vendorId: string,
  periode: { dari: Date; sampai: Date },
  bahan: {
    ketepatanWaktu: BahanMetrik
    ketepatanHarga: BahanMetrik
    penyelesaianTugas: BahanMetrik
    penilaianManual: BahanMetrik
  },
  jumlahWo: number,
  jumlahTugas: number,
): SkorVendor {
  const metrik = {
    ketepatanWaktu: nilaiMetrik(bahan.ketepatanWaktu),
    ketepatanHarga: nilaiMetrik(bahan.ketepatanHarga),
    penyelesaianTugas: nilaiMetrik(bahan.penyelesaianTugas),
    penilaianManual: nilaiMetrik(bahan.penilaianManual),
  }

  const entriesAda = Object.entries(metrik).filter(([, m]) => m.nilai !== null) as [
    keyof typeof BOBOT_SKOR_GABUNGAN,
    MetrikSkor,
  ][]

  let skorGabungan: number | null = null
  if (entriesAda.length > 0) {
    // K113 — bobot dinormalkan ulang atas metrik yang ADA (bukan dibagi
    // bobot penuh): vendor yang cuma punya data ketepatan waktu tak boleh
    // skornya dikempiskan seolah dua metrik lain bernilai 0.
    //
    // `penilaianManual.nilai` sengaja DIBIARKAN dalam skala 1-5 apa adanya
    // (itu yang tampil di panel — rata-rata bintang, bukan persen) sementara
    // tiga metrik lain sudah 0-100. Menggabungkan keduanya tanpa menyamakan
    // skala akan membuat skor gabungan runtuh tiap kali penilaian manual ikut
    // (3 dari skala 1-5, bukan 60 dari skala 0-100) — jadi disamakan skalanya
    // KHUSUS di sini, titik penggabungan, bukan di nilai yang ditampilkan.
    const SKALA_PENILAIAN_MANUAL = 5
    const nilaiUntukGabungan = (k: keyof typeof BOBOT_SKOR_GABUNGAN, nilai: number): number =>
      k === 'penilaianManual' ? (nilai / SKALA_PENILAIAN_MANUAL) * 100 : nilai
    const totalBobot = entriesAda.reduce((s, [k]) => s + BOBOT_SKOR_GABUNGAN[k], 0)
    const jumlah = entriesAda.reduce(
      (s, [k, m]) => s + BOBOT_SKOR_GABUNGAN[k] * nilaiUntukGabungan(k, m.nilai as number),
      0,
    )
    skorGabungan = Math.round((jumlah / totalBobot) * 100) / 100
  }

  // K113/K74 — tier BUKAN "semua empat metrik lolos ambang" (itu akan membuat
  // vendor dengan satu metrik kuat tampak sama kosongnya dengan vendor tanpa
  // data sama sekali). CUKUP_DATA berarti ADA sekurangnya satu metrik yang
  // sungguh lolos ambang (`entriesAda`); DATA_TIPIS berarti ada sampel yang
  // masuk tapi belum satu pun metrik lolos; BELUM_ADA_DATA berarti nol
  // sampel di keempat metrik sama sekali.
  const totalSampel = Object.values(metrik).reduce((s, m) => s + m.n, 0)
  const tier: TierSkor = entriesAda.length > 0 ? 'CUKUP_DATA' : totalSampel > 0 ? 'DATA_TIPIS' : 'BELUM_ADA_DATA'

  const catatan =
    tier === 'BELUM_ADA_DATA'
      ? {
          id: `Belum ada cukup pekerjaan tercatat untuk vendor ini (${jumlahWo} work order, ${jumlahTugas} tugas).`,
          en: `Not enough recorded work for this vendor yet (${jumlahWo} work orders, ${jumlahTugas} tasks).`,
        }
      : tier === 'DATA_TIPIS'
        ? {
            id: `Sebagian metrik belum cukup sampel (minimal ${AMBANG_SKOR}) — skor dihitung dari metrik yang tersedia saja.`,
            en: `Some metrics don't have enough samples yet (minimum ${AMBANG_SKOR}) — score is computed only from what's available.`,
          }
        : {
            id: 'Skor dihitung dari data historis nyata voyage/pekerjaan vendor ini.',
            en: "Score computed from this vendor's real historical voyage/work data.",
          }

  return {
    vendorId,
    periode: { dari: periode.dari.toISOString().slice(0, 10), sampai: periode.sampai.toISOString().slice(0, 10) },
    metrik,
    skorGabungan,
    tier,
    catatan,
  }
}
