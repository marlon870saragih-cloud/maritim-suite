import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

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

  return NextResponse.json({ ok: true, tenantId: tenant.id }, { status: 201 })
}
