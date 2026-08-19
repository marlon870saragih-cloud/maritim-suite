import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { seedTenantOnboarding } from '@/services/saas/onboarding.service'
import { jejakDari } from '@/services/http'
// Checklist go-live / K185 — "batas laju pendaftaran per IP per jam" (§1.5
// dokumen desain), prasyarat membuka pendaftaran ke publik.
import { cekBolehDaftar, catatPendaftaran } from '@/services/security/rate-limit'

const schema = z.object({
  // Akun admin
  companyName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  // Profil perusahaan (opsional — dipakai sebagai kop semua dokumen)
  companyTagline: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  companyEmail: z.string().optional(),
  npwp: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankHolder: z.string().optional(),
  // Logo sebagai data URL (base64). Dibatasi agar tak membengkak.
  logoUrl: z.string().max(2_500_000).optional(),
})

const clean = (v?: string) => {
  const t = v?.trim()
  return t ? t : undefined
}

export async function POST(req: Request) {
  // Diperiksa PALING AWAL — sebelum membaca/mem-parse body sama sekali —
  // supaya IP yang sudah melewati batas tak sempat membebani apa pun.
  const { ipAddress } = jejakDari(req)
  const ip = ipAddress ?? 'tak-diketahui'
  const kunci = await cekBolehDaftar(ip)
  if (kunci.diblokir) {
    return NextResponse.json(
      { error: 'Terlalu banyak percobaan pendaftaran dari alamat ini. Coba lagi dalam satu jam.' },
      { status: 429 },
    )
  }
  await catatPendaftaran(ip)

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
  }

  const d = parsed.data

  const existing = await prisma.user.findUnique({ where: { email: d.email } })
  if (existing) {
    return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(d.password, 10)
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const tenant = await prisma.tenant.create({
    data: {
      companyName: d.companyName,
      companyTagline: clean(d.companyTagline),
      companyAddress: clean(d.companyAddress),
      companyPhone: clean(d.companyPhone),
      companyEmail: clean(d.companyEmail),
      npwp: clean(d.npwp),
      logoUrl: clean(d.logoUrl),
      bankName: clean(d.bankName),
      bankAccount: clean(d.bankAccount),
      bankHolder: clean(d.bankHolder),
      plan: 'TRIAL',
      // Trial: semua modul aktif selama 7 hari.
      modulesEnabled: ['finance', 'dokumen', 'portcall', 'tracker'],
      trialEndsAt,
      users: {
        create: {
          name: d.name,
          email: d.email,
          password: hashed,
          role: 'ADMIN',
        },
      },
    },
  })

  // K151/2 — penyemaian awal berjalan SEKALI, otomatis, segera setelah
  // tenant lahir (bukan menunggu operator memicu langkah wizard manapun).
  // Kegagalan di sini TIDAK BOLEH membatalkan pendaftaran yang sudah
  // berhasil — ditelan & dicatat, sejalan pola K95 pintu 1 (checklist
  // otomatis voyage): tenant yang sudah lahir tidak dibatalkan gara-gara
  // langkah pendukung yang bisa diulang manual nanti dari wizard.
  try {
    await seedTenantOnboarding(tenant.id)
  } catch (e) {
    console.error('[register] penyemaian awal gagal, tenant tetap dibuat:', e)
  }

  return NextResponse.json({ ok: true, tenantId: tenant.id }, { status: 201 })
}
