// Normalisasi & penyamaran nomor WhatsApp (Step 2C) — fungsi MURNI: tanpa impor, DB, jaringan, env.
//
// Konservatif: ragu → tolak. Nomor Indonesia ditulis lokal (08…) atau internasional (62… / +62…);
// pemisah umum (spasi, strip, titik, kurung) dibuang. Hasil akhir E.164: + diikuti 8–15 digit,
// digit pertama bukan 0. Pengenal fixture WA-1 (TEST_FIXTURE_WA_nnn) tidak pernah lolos (bukan angka).

const E164 = /^\+[1-9]\d{7,14}$/
const PEMISAH = /[\s\-.()]/g

export type HasilNomor = { ok: true; e164: string } | { ok: false; alasan: 'PHONE_INVALID' }

export function normalisasiE164(masukan: unknown): HasilNomor {
  if (typeof masukan !== 'string') return { ok: false, alasan: 'PHONE_INVALID' }
  const mentah = masukan.trim()
  if (mentah === '' || mentah.length > 32) return { ok: false, alasan: 'PHONE_INVALID' }
  const s = mentah.replace(PEMISAH, '')
  let kandidat: string
  if (/^\+\d+$/.test(s)) kandidat = s
  else if (/^00\d+$/.test(s)) kandidat = `+${s.slice(2)}`
  else if (/^0\d+$/.test(s)) kandidat = `+62${s.slice(1)}`
  else if (/^62\d+$/.test(s)) kandidat = `+${s}`
  else return { ok: false, alasan: 'PHONE_INVALID' }
  // Indonesia: setelah +62 tak boleh ada 0 (salah ketik "+6208…").
  if (kandidat.startsWith('+620')) return { ok: false, alasan: 'PHONE_INVALID' }
  return E164.test(kandidat) ? { ok: true, e164: kandidat } : { ok: false, alasan: 'PHONE_INVALID' }
}

/**
 * Samaran untuk log, audit, daftar, dan pesan galat: kode negara singkat + 4 digit terakhir,
 * panjang tetap (panjang asli tak bocor). Masukan tak sah → samaran penuh.
 */
export function samarkanNomor(e164: unknown): string {
  if (typeof e164 !== 'string' || !E164.test(e164)) return '+••••••••'
  return `${e164.slice(0, 3)}••••${e164.slice(-4)}`
}
