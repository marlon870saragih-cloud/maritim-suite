// Pemicu manual "Jalankan pengingat sekarang" dari Settings (§15 poin 7, K88).
//
// BUKAN pintu baru ke reminder-job.ts — ia PROXY tipis ke POST /api/jobs/run
// yang sudah ada (Fase 7e backend, jobs/run/route.ts), dan itu disengaja:
//   1. Rute itu SATU-SATUNYA tempat yang tahu cara memanggil job (peta JOB{},
//      pembungkusan total{}/dijalankanPada/durasiMs). Menduplikasinya di sini
//      berarti dua tempat bisa membusuk berbeda dari `?job=sla|vendor-docs`
//      yang akan datang (lihat komentar JOB{} di jobs/run/route.ts).
//   2. Memanggilnya lewat HTTP — bukan mengimpor jalankanPengingatUntukSemuaTenant()
//      langsung — berarti tombol ini menguji JALUR YANG SAMA PERSIS dengan yang
//      dipakai penjadwal produksi nanti (cron/systemd/Task Scheduler), termasuk
//      gerbang token-nya. Kalau gerbang itu rusak, tombol Settings juga akan
//      gagal — sinyal yang berguna, bukan yang ingin disembunyikan.
//
// GERBANG GANDA (defense in depth), bukan salah satunya:
//   - Sesi + peran ADMIN (withTenant + requireRole di bawah) — pengguna biasa
//     tenant ini tidak boleh memicu job lewat UI-nya sendiri, walau /api/jobs/run
//     itu sendiri sama sekali tidak peduli sesi (ia gerbang token, K88).
//   - `JOB_RUNNER_TOKEN` dibaca DI SINI, di server, dan tidak pernah dikirim ke
//     body/response — browser hanya menerima hasil jalan (`{job, total, hasil}`),
//     tidak pernah tokennya. Lihat JobRunnerPanel.tsx untuk sisi klien.
//
// URL dasar: `NEXT_PUBLIC_APP_URL` — variabel yang SAMA dipakai
// billing/checkout/route.ts untuk membangun tautan balik Midtrans ke app ini
// sendiri. Bukan rahasia (ia publik lewat NEXT_PUBLIC_*), jadi aman dibaca di
// jalur server maupun client; di sini dipakai server-side saja karena route
// ini sendiri berjalan di server.

import { requireRole } from '@/services/context'
import { withTenant } from '@/services/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withTenant(async (ctx) => {
  // ServiceError('FORBIDDEN', ...) dilempar bila bukan ADMIN — withTenant()
  // menerjemahkannya jadi 403 JSON, pola yang sama dengan seluruh route lain.
  requireRole(ctx, 'ADMIN')

  const token = process.env.JOB_RUNNER_TOKEN ?? ''
  if (!token) {
    // Bukan kesalahan pengguna — server belum dikonfigurasi. Pesannya boleh
    // menyebut nama variabel env karena hanya ADMIN yang sampai baris ini.
    return Response.json(
      {
        error: {
          code: 'INTERNAL',
          message: 'JOB_RUNNER_TOKEN belum dikonfigurasi di server. Hubungi operator.',
        },
      },
      { status: 500 },
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/api/jobs/run?job=reminders`, {
      method: 'POST',
      headers: { 'x-job-token': token },
      cache: 'no-store',
    })
  } catch (e) {
    console.error('[api/jobs/run-reminders] gagal menghubungi /api/jobs/run:', e)
    return Response.json(
      { error: { code: 'INTERNAL', message: 'Gagal menghubungi job pengingat.' } },
      { status: 502 },
    )
  }

  const body = await upstream.json().catch(() => null)
  if (!upstream.ok || !body) {
    console.error('[api/jobs/run-reminders] /api/jobs/run membalas non-OK:', upstream.status, body)
    return Response.json(
      {
        error: {
          code: 'INTERNAL',
          message:
            body?.error?.message ?? `Job pengingat gagal dijalankan (status ${upstream.status}).`,
        },
      },
      { status: 502 },
    )
  }

  // Diteruskan apa adanya — bentuknya persis respons /api/jobs/run
  // ({ job, dijalankanPada, durasiMs, total, hasil }), tidak dihitung ulang.
  return Response.json(body)
})
