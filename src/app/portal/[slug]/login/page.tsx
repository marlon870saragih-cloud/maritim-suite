// Login portal BER-MEREK tenant (K182, Fase 8i) — dibaca PUBLIK lewat slug,
// SEBELUM ada sesi apa pun (server component, boleh memanggil service
// langsung — pola sama halaman Settings memanggil service, bukan fetch diri
// sendiri). Slug tak ketemu → 404 Next.js bawaan (K182/8: "404 rapi, bukan
// galat server"), bukan dialihkan diam-diam ke login generik — pengunjung
// yang salah ketik alamat portal harus TAHU alamatnya salah.

import { notFound } from 'next/navigation'
import { brandingPublikUntukSlug } from '@/services/portal/public-branding'
import { ServiceError } from '@/services/errors'
import { PortalLoginForm, type MerekPortal } from '@/components/portal/PortalLoginForm'

export const dynamic = 'force-dynamic'

type Ctx = { params: { slug: string } }

export default async function PortalSlugLoginPage({ params }: Ctx) {
  let merek: MerekPortal
  try {
    const b = await brandingPublikUntukSlug(params.slug)
    merek = {
      companyName: b.companyName,
      logoSrc: b.logoViaAttachment ? `/api/portal/branding/${params.slug}/logo` : b.logoDataUrl,
      accentColor: b.brandPrimaryColor,
      accentTextColor: b.tekstAksenAman,
    }
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }

  return <PortalLoginForm merek={merek} />
}
