// Batas antarmuka sumber posisi kapal eksternal — logika murni, TANPA impor
// (PRD-002 Step 5B; bentuk mengikuti K175 docs/FASE-8-SAAS-COMMERCIAL.md).
//
// `penyediaTidakAda`: tanpa panggilan jaringan, tanpa API key, tanpa data
// posisi buatan. Ketiadaan penyedia adalah keadaan SAH dan TIDAK membuat
// pemantauan internal dianggap tidak sehat. Sejak PRD-003 Step 4 penyedia
// sungguhan dipilih lewat services/ais (registry + AIS_PROVIDER); berkas ini
// tetap menjadi bentuk status bawaan "tanpa penyedia".

export type PosisiKapal = {
  mmsi: string | null
  imo: string | null
  lat: number
  lon: number
  sog: number | null
  cog: number | null
  /** Waktu POSISI (bukan waktu pengambilan). */
  waktu: Date
  sumber: string
}

export type PenyediaPosisiKapal = {
  nama: string
  terkonfigurasi: boolean
  posisiKapal(id: { mmsi?: string; imo?: string }): Promise<PosisiKapal | null>
}

export const penyediaTidakAda: PenyediaPosisiKapal = {
  nama: 'NONE',
  terkonfigurasi: false,
  async posisiKapal() {
    return null
  },
}

export type StatusPenyedia = {
  terkonfigurasi: boolean
  nama: string | null
  pesan: string
}

export function statusPenyedia(p: PenyediaPosisiKapal = penyediaTidakAda): StatusPenyedia {
  return p.terkonfigurasi
    ? { terkonfigurasi: true, nama: p.nama, pesan: `Sumber posisi: ${p.nama}.` }
    : {
        terkonfigurasi: false,
        nama: null,
        pesan: 'Sumber posisi kapal eksternal belum dikonfigurasi. Pemantauan internal tetap berjalan.',
      }
}
