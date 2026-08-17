// Pemicu pekerjaan berjadwal — POST /api/jobs/run?job=reminders (K88).
//
// ⚠️ SATU-SATUNYA route di repo ini yang TIDAK memakai sesi NextAuth, dan itu
//    justru maksudnya: pemanggilnya nanti adalah PENJADWAL (cron Vercel/Railway,
//    systemd timer, Task Scheduler Windows), yang tidak punya browser, tidak
//    punya cookie, dan tidak akan pernah bisa login. Karena itu ia TIDAK memakai
//    withTenant() — bukan kelalaian.
//
// Akibatnya route ini juga tidak memakai TenantContext dari sesi: job-nya sendiri
// yang membuat `systemContext(tenantId)` satu per tenant (reminder-job.ts).
//
// Gerbangnya satu: header `x-job-token` yang dibandingkan KONSTAN-WAKTU dengan
// `JOB_RUNNER_TOKEN` di env — pola yang sama dengan verifyNotificationSignature()
// di lib/billing/midtrans.ts, termasuk pemeriksaan panjang lebih dulu (
// crypto.timingSafeEqual MELEMPAR bila panjang bufernya beda, jadi memanggilnya
// tanpa penjagaan itu justru mengubah timing attack jadi 500).
//
// Yang SENGAJA tidak diterima route ini: parameter waktu. `reminder-job.ts`
// memang bisa disuntik `sekarang` (untuk uji), tapi tidak lewat HTTP — penjadwal
// luar tidak boleh bisa menggeser jam job dan menerbitkan ulang seluruh
// pengingat kemarin. Lihat OpsiJalanPengingat.

import crypto from 'node:crypto'
import {
  jalankanPengingatUntukSemuaTenant,
  type HasilJalanPengingat,
} from '@/services/ops/reminder-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Panjang minimum token yang dianggap serius. Env kosong = endpoint tertutup. */
const PANJANG_TOKEN_MINIMUM = 16

/**
 * Daftar job. Sengaja sebuah peta, bukan `if (job === 'reminders')`: K88 sudah
 * menyebut `?job=reminders|sla|vendor-docs`, jadi jenis kedua akan datang.
 * Menambahnya nanti = satu baris di sini, bukan merombak route.
 *
 * Tiap job wajib idempoten (K88) — endpoint ini tidak punya kunci antrean, dan
 * dua penjadwal yang kelewat rajin harus tetap menghasilkan data yang sama.
 */
const JOB: Readonly<Record<string, () => Promise<HasilJalanPengingat[]>>> = {
  reminders: () => jalankanPengingatUntukSemuaTenant(),
}

const JOB_BAWAAN = 'reminders'

function galat(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status })
}

/**
 * Bandingkan token secara konstan-waktu. Semua jalan yang gagal menghasilkan
 * respons 401 yang SAMA — tak ada yang membedakan "token salah" dari "env belum
 * diisi", karena membedakannya memberi tahu penyerang bahwa endpoint ini hidup
 * tapi belum dikonfigurasi.
 */
function tokenSah(req: Request): boolean {
  const diharapkan = process.env.JOB_RUNNER_TOKEN ?? ''
  if (diharapkan.length < PANJANG_TOKEN_MINIMUM) return false

  const diberikan = req.headers.get('x-job-token') ?? ''
  const a = Buffer.from(diharapkan, 'utf8')
  const b = Buffer.from(diberikan, 'utf8')
  // Panjang diperiksa DULU: timingSafeEqual melempar pada buffer beda panjang.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: Request): Promise<Response> {
  if (!tokenSah(req)) {
    return galat('UNAUTHORIZED', 'Token pekerjaan tidak sah.', 401)
  }

  const job = new URL(req.url).searchParams.get('job')?.trim() || JOB_BAWAAN
  const jalankan = Object.prototype.hasOwnProperty.call(JOB, job) ? JOB[job] : undefined
  if (!jalankan) {
    return galat(
      'VALIDATION',
      `Job "${job}" tidak dikenal. Yang tersedia: ${Object.keys(JOB).join(', ')}.`,
      400,
    )
  }

  const mulai = Date.now()
  try {
    const hasil = await jalankan()
    return Response.json({
      job,
      dijalankanPada: new Date().toISOString(),
      durasiMs: Date.now() - mulai,
      // Ringkasan seluruh tenant, supaya kartu hasil di layar tidak perlu
      // menjumlah sendiri. Rinciannya tetap per tenant di `hasil`.
      total: {
        dibuat: hasil.reduce((s, h) => s + h.dibuat, 0),
        dilewati: hasil.reduce((s, h) => s + h.dilewati, 0),
        dibatasi: hasil.reduce((s, h) => s + h.dibatasi, 0),
      },
      hasil,
    })
  } catch (e) {
    // Job berjalan tanpa manusia: galatnya dicatat lengkap di server, dan
    // klien hanya menerima kabar bahwa ia gagal (pola http.ts).
    console.error('[api/jobs/run] job gagal:', e)
    return galat('INTERNAL', 'Job gagal dijalankan. Periksa log server.', 500)
  }
}
