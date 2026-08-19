// Pembatas laju & kunci sementara — checklist go-live (K185), bukan fitur ber-
// nomor K: tak ada keputusan produk di sini, murni eksekusi keamanan.
//
// Kenapa ini yang dikerjakan LEBIH DULU dari butir checklist go-live lainnya:
// "titik paling murah untuk diserang" — login tanpa pembatas percobaan adalah
// pintu credential-stuffing, dan pendaftaran publik tanpa batas per-IP adalah
// pabrik tenant sampah. Keduanya nol biaya infrastruktur untuk ditutup (murni
// baris DB + hitungan), beda dari butir lain (Sentry, CI/CD, deploy) yang
// menunggu keputusan akun/infra.
//
// SATU MESIN, kebijakan berlainan — pola sama quota.ts/quota.service.ts
// (⭐ pola rujukan K51): `hitungDalamJendela()` di sini tidak tahu apa pun
// tentang login atau pendaftaran; arti tiap `kind` hidup di pembungkusnya
// (pastikanBolehLogin, pastikanBolehDaftar, dst).
//
// ⚠️ BUKAN pengganti kuota panggilan AI (K156, quota.service.ts). Keduanya
// menjawab pertanyaan berbeda: kuota menjawab "berapa banyak TENANT ini boleh
// pakai sebulan" (soal harga/paket, P49 belum dijawab, hari ini nol biaya
// secara sengaja) — mesin di sini menjawab "seberapa CEPAT satu aktor boleh
// memukul endpoint ini" (soal penyalahgunaan, tak menunggu keputusan harga
// apa pun). Menyatukan keduanya jadi satu aturan akan mengulang tepat
// kesalahan yang K51 dibangun untuk dicegah: dua tafsir atas satu pertanyaan.
//
// SecurityEvent SENGAJA bukan model bertenant — lihat catatan skema. Ditulis
// lewat `prisma` mentah, bukan `forTenant()`.

import { prisma } from '@/lib/prisma'

/**
 * IP dari header NextAuth `authorize(credentials, req)` — `req.headers` di
 * sana bentuknya `Record<string, any>` MENTAH (bukan `Headers` bertipe seperti
 * `Request` biasa, jadi `jejakDari()` di services/http.ts tak bisa dipakai
 * ulang di sini apa adanya). Nilai bisa string tunggal atau larik.
 */
export function ipDariHeaderNextAuth(headers: Record<string, unknown> | undefined): string | null {
  const ambil = (k: string): string | null => {
    const v = headers?.[k]
    if (typeof v === 'string') return v
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
    return null
  }
  const maju = ambil('x-forwarded-for')
  return maju?.split(',')[0]?.trim() || ambil('x-real-ip')
}

export type JenisPeristiwa = 'LOGIN_FAIL_INTERNAL' | 'LOGIN_FAIL_PORTAL' | 'REGISTER' | 'AI_CALL'

/** Catat satu peristiwa. Dipanggil HANYA untuk yang relevan bagi laju (lihat pembungkus). */
export async function catatPeristiwa(kind: JenisPeristiwa, identifier: string, ip: string | null): Promise<void> {
  try {
    await prisma.securityEvent.create({ data: { kind, identifier: identifier.toLowerCase(), ip } })
  } catch (e) {
    // Menelan galatnya sendiri — pola sama notify()/catatPemakaian(): gagal
    // mencatat telemetri keamanan tak boleh menggagalkan login/pendaftaran
    // yang sedang berjalan. Kalau pencatatan mati, pembatasnya ikut mati
    // TERBUKA (fail-open) — dicatat sebagai batas sadar di bawah, bukan bug.
    console.error('[rate-limit] gagal mencatat peristiwa (ditelan):', kind, e)
  }
}

/**
 * Hitung peristiwa dalam jendela waktu untuk SATU identifier. Sebelum
 * menghitung, baris identifier ini yang SUDAH LEWAT jendela dihapus lebih
 * dulu — itulah yang membuat tabel `SecurityEvent` tak pernah tumbuh tak
 * terbatas tanpa job pembersih terpisah (lihat catatan skema).
 */
async function hitungDalamJendela(kind: JenisPeristiwa, identifier: string, jendelaMs: number): Promise<number> {
  const sejak = new Date(Date.now() - jendelaMs)
  const id = identifier.toLowerCase()
  await prisma.securityEvent.deleteMany({ where: { kind, identifier: id, createdAt: { lt: sejak } } }).catch(() => undefined)
  return prisma.securityEvent.count({ where: { kind, identifier: id, createdAt: { gte: sejak } } })
}

const MENIT = 60_000
const JAM = 60 * MENIT

// ---------------------------------------------------------------- login

/** 5 gagal login BERUNTUN dalam 15 menit → identifier ini diblokir sisa jendela. */
const AMBANG_LOGIN_GAGAL = 5
const JENDELA_LOGIN = 15 * MENIT

export type HasilCekLogin = { diblokir: boolean; sisaMenit: number }

/**
 * Diperiksa SEBELUM membandingkan kata sandi (authorize()) — supaya identifier
 * yang terblokir tak sempat membebani bcrypt.compare() (bcrypt sengaja lambat;
 * itu argumen tambahan untuk gagal cepat di sini). `email` diperiksa APA
 * ADANYA, termasuk yang tak pernah terdaftar — enumerasi akun (mencoba banyak
 * email untuk melihat mana yang "ada") mengikuti jendela yang sama.
 */
export async function cekBolehLogin(kind: 'LOGIN_FAIL_INTERNAL' | 'LOGIN_FAIL_PORTAL', email: string): Promise<HasilCekLogin> {
  const n = await hitungDalamJendela(kind, email, JENDELA_LOGIN)
  return { diblokir: n >= AMBANG_LOGIN_GAGAL, sisaMenit: Math.ceil(JENDELA_LOGIN / MENIT) }
}

/** Dipanggil HANYA saat kata sandi/kredensial terbukti SALAH — login sukses tak menulis apa pun. */
export async function catatLoginGagal(
  kind: 'LOGIN_FAIL_INTERNAL' | 'LOGIN_FAIL_PORTAL',
  email: string,
  ip: string | null,
): Promise<void> {
  await catatPeristiwa(kind, email, ip)
}

// ------------------------------------------------------------ pendaftaran

/** K185 (§1.5, "batas laju pendaftaran per IP per jam"): 5 pendaftaran per IP per jam. */
const AMBANG_DAFTAR = 5
const JENDELA_DAFTAR = JAM

export async function cekBolehDaftar(ip: string): Promise<{ diblokir: boolean }> {
  const n = await hitungDalamJendela('REGISTER', ip, JENDELA_DAFTAR)
  return { diblokir: n >= AMBANG_DAFTAR }
}

export async function catatPendaftaran(ip: string): Promise<void> {
  await catatPeristiwa('REGISTER', ip, ip)
}

// --------------------------------------------------------- panggilan AI

/** Jaring pengaman penyalahgunaan — BUKAN kuota K156. 30 panggilan/5 menit per pengguna. */
const AMBANG_AI = 30
const JENDELA_AI = 5 * MENIT

export async function cekBolehPanggilAi(userId: string): Promise<{ diblokir: boolean }> {
  const n = await hitungDalamJendela('AI_CALL', userId, JENDELA_AI)
  return { diblokir: n >= AMBANG_AI }
}

export async function catatPanggilanAi(userId: string): Promise<void> {
  await catatPeristiwa('AI_CALL', userId, null)
}
