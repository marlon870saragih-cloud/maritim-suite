// Tipe data untuk SPK (Surat Penunjukan Kerja / Sub-Agency Appointment).
// Dokumen penunjukan — TIDAK ada perhitungan uang. Satu-satunya angka (GT/NRT,
// tanggal) adalah partikular yang diketik operator, bukan dihitung & bukan dari AI.
// Identitas perusahaan (kop + penanda tangan) diambil dari Tenant (DB), bukan hardcode.

import type { EpdaTenant } from './epda-data'

export type SpkScopeItem = {
  text: string // baris lingkup pekerjaan
  detail?: string // sub-keterangan abu (opsional)
}

export type SpkData = {
  tenant: EpdaTenant
  // Meta dokumen
  docNumber: string // mis. "001/TSM/SPK/VI/2026"
  issuedAt: string // tanggal terbit, mis. "29 Jun 2026"
  validity: string // "Berlaku", mis. "Sesuai jadwal kapal"
  appointmentType: string // "Sifat Penunjukan", mis. "Penunjukan Sub-Agen"
  // Para pihak
  toContact: string // KEPADA — nama kontak penerima, mis. "Pak Hardi"
  toCompany: string // PERUSAHAAN — perusahaan yang ditunjuk (sub-agen)
  toRole: string // PERAN — mis. "Sub-Agent / Handling Agent"
  toCity: string // KOTA — mis. "Balikpapan"
  principal: string // PRINCIPAL — mis. "Soechi Lines, Jakarta"
  // Partikular kapal
  vesselName: string
  gtNrt: string
  cargo: string
  loadingDate: string
  loadPort: string
  dischPort: string
  // Isi
  scopeItems: SpkScopeItem[] // Lingkup Pekerjaan Sub-Agen (bernomor)
  terms: string[] // Ketentuan (bernomor)
  // Penanda tangan pihak penunjuk (default dari tenant, bisa di-override)
  approvedByName: string
  approvedByTitle: string
}

// Paragraf pembuka — di-render dengan nama perusahaan diturunkan otomatis
// (penunjuk = tenant.companyName). Disediakan sebagai fungsi agar tidak ada
// nama perusahaan yang ter-hardcode di template.
export function spkIntro(d: SpkData, mainAgent: string): string {
  return (
    `Dengan hormat, sehubungan dengan kegiatan keagenan kapal di pelabuhan, dengan ini ${mainAgent} ` +
    `selaku Main Agent menunjuk ${d.toCompany} sebagai ${d.toRole} untuk menangani pelayanan keagenan ` +
    `kapal berikut:`
  )
}

// ====== DATA CONTOH (replika SPK_TSM_MT_Soechi_Asia_XXIX) — untuk verifikasi format ======
export const SAMPLE_SPK: SpkData = {
  tenant: {
    companyName: 'PT Tribuana Solusi Maritim',
    companyTagline: 'Shipping Agency · Liquid Cargo',
    companyAddress: 'Jl. Abdul Azis Samad No. 59B, Samarinda, Kalimantan Timur 75112',
    companyPhone: '+62 541 2226588',
    companyEmail: 'adm@tribuanagency.co.id',
    signerName: 'Marlon Saragih',
    signerTitle: 'Branch Manager',
  },
  docNumber: '001/TSM/SPK/VI/2026',
  issuedAt: '29 Jun 2026',
  validity: 'Sesuai jadwal kapal',
  appointmentType: 'Penunjukan Sub-Agen',
  toContact: 'Pak Hardi',
  toCompany: 'PT Perusahaan Pelayaran Samudera Karana Line',
  toRole: 'Sub-Agent / Handling Agent',
  toCity: 'Balikpapan',
  principal: 'Soechi Lines, Jakarta',
  vesselName: 'MT Soechi Asia XXIX',
  gtNrt: '3,868',
  cargo: 'Biodiesel B40 · ± 6,000 MT',
  loadingDate: '30 Jun 2026',
  loadPort: 'KGTE, Balikpapan',
  dischPort: 'Morowali (IDMOW)',
  scopeItems: [
    {
      text: 'Pengurusan clearance in/out kapal di pelabuhan muat (KSOP/Syahbandar).',
      detail: 'Termasuk SPB, dokumen kedatangan & keberangkatan.',
    },
    { text: 'Koordinasi dengan KSOP, Karantina, Imigrasi, Bea Cukai & instansi terkait.' },
    { text: 'Pelayanan keagenan selama kapal di pelabuhan muat, koordinasi sandar/labuh & kegiatan loading.' },
    { text: 'Pelaporan posisi kapal (vessel movement / port log) secara berkala kepada Main Agent.' },
    { text: 'Pengurusan kebutuhan kapal (husbandry) sesuai permintaan & persetujuan Main Agent.' },
  ],
  terms: [
    'Biaya keagenan (disbursement) dibuatkan dalam bentuk PDA/FDA dan disampaikan kepada Main Agent untuk persetujuan.',
    'Pembayaran dilakukan sesuai kesepakatan kedua belah pihak setelah dokumen pendukung lengkap.',
    'Sub-Agent wajib menjaga komunikasi dan menyampaikan setiap perkembangan kondisi kapal secara cepat & akurat.',
  ],
  approvedByName: 'Marlon Saragih',
  approvedByTitle: 'Branch Manager',
}
