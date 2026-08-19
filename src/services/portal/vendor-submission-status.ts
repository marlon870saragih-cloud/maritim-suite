// Transisi status VendorInvoiceSubmission (K172, Fase 8g) — MURNI (K11/K51),
// cetakan disbursement-status.ts (K34-K36) seperti K91/K120/K121.
//
// `status` di schema.prisma memang `String` bukan enum Prisma (komentar model
// menyebutnya "cetakan disbursement-status.ts") — union di sini adalah sumber
// kebenarannya untuk TypeScript.
//
// ⚠️ Satu-satunya transisi yang benar-benar TERPASANG di 8g adalah
// SUBMITTED/UNDER_REVIEW → ACCEPTED, dan itu terjadi SATU tempat: operator
// menekan "Ambil dari tagihan vendor" di builder FDA lalu MENYIMPAN baris
// (disbursement-item.service.ts, lewat tautkanKeDisbursementItem()). Jalur
// UNDER_REVIEW/REJECTED manual (operator meninjau tanpa langsung memakainya)
// TIDAK punya layar sendiri di 8g — dokumen desain (§17/8g "Isi") tidak
// menyebutnya sebagai deliverable increment ini, hanya "VendorInvoiceSubmission
// + mesin status". Graf transisi tetap ditulis LENGKAP di sini (bukan hanya
// yang terpakai) supaya menambah layar tinjau-tolak nanti tidak perlu
// mendesain ulang mesin statusnya — persis alasan approval-policy.ts ditulis
// lengkap sebelum layar approvalnya ada.

export type VendorSubmissionStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED'

export const TRANSISI_SUBMISSION: Readonly<Record<VendorSubmissionStatus, readonly VendorSubmissionStatus[]>> = {
  SUBMITTED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: [],
}

export function bolehTransisiSubmission(dari: VendorSubmissionStatus, ke: VendorSubmissionStatus): boolean {
  return TRANSISI_SUBMISSION[dari].includes(ke)
}

export function transisiTersediaSubmission(status: VendorSubmissionStatus): readonly VendorSubmissionStatus[] {
  return TRANSISI_SUBMISSION[status]
}
