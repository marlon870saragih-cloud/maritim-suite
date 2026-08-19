// Kesalahan berjenjang untuk service layer v2.
//
// Service TIDAK boleh tahu soal HTTP. Ia melempar ServiceError; pembungkus route
// (services/http.ts) yang menerjemahkannya jadi status + JSON. Dengan begitu satu
// service bisa dipakai dari route API, server action, maupun skrip CLI.

export type ServiceErrorCode =
  | 'UNAUTHORIZED' // belum login
  | 'FORBIDDEN' // login, tapi tidak berhak
  | 'NOT_FOUND' // tidak ada — ATAU milik tenant lain (sengaja disamarkan, lihat catatan)
  | 'VALIDATION' // input tidak sah
  | 'CONFLICT' // bentrok dengan data lain (mis. kode ganda, masih dipakai)
  | 'RATE_LIMITED' // batas laju terlampaui (K172/4, Fase 8g) — coba lagi nanti

const STATUS: Record<ServiceErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
}

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ServiceError'
  }

  get status(): number {
    return STATUS[this.code]
  }
}

export const unauthorized = (pesan = 'Silakan masuk terlebih dahulu.') =>
  new ServiceError('UNAUTHORIZED', pesan)

export const forbidden = (pesan = 'Anda tidak berhak melakukan tindakan ini.') =>
  new ServiceError('FORBIDDEN', pesan)

/**
 * Catatan keamanan: data milik tenant lain juga dilaporkan NOT_FOUND, bukan
 * FORBIDDEN. Membedakan keduanya membocorkan keberadaan data — penyerang bisa
 * menebak id sampai mendapat 403 dan tahu bahwa data itu ada.
 */
export const notFound = (apa = 'Data') => new ServiceError('NOT_FOUND', `${apa} tidak ditemukan.`)

export const validation = (pesan: string, details?: unknown) =>
  new ServiceError('VALIDATION', pesan, details)

export const conflict = (pesan: string) => new ServiceError('CONFLICT', pesan)

export const rateLimited = (pesan: string) => new ServiceError('RATE_LIMITED', pesan)
