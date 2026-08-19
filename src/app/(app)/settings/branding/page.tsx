// Halaman Merek — dipisah dari hub /settings (Fase 8i / K180), digerbangi
// ADMIN saja. Pola gerbang sama persis BillingPage/TeamPage: panggil fungsi
// ber-`requireRole`, tangkap FORBIDDEN, tampilkan layar tertutup.

import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { ServiceError } from '@/services/errors'
import { getBranding } from '@/services/saas/branding.service'
import { BrandingSettings } from '@/components/saas/BrandingSettings'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; title: string; desc: string; denied: string }> = {
  id: {
    kicker: 'Pengaturan', title: 'Merek', desc: 'Logo, warna aksen, dan alamat portal.',
    denied: 'Halaman ini hanya untuk ADMIN.',
  },
  en: {
    kicker: 'Settings', title: 'Branding', desc: 'Logo, accent color, and portal address.',
    denied: 'This page is ADMIN only.',
  },
}

export default async function BrandingPage() {
  const lang = getLang()
  const t = PH[lang]
  const ctx = await requireTenant()

  try {
    // Trigger pagar peran (K180) — sama pola BillingPage/TeamPage.
    await getBranding(ctx)

    return (
      <div className="p-margin-page max-w-[900px] mx-auto space-y-6">
        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
        <BrandingSettings />
      </div>
    )
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'FORBIDDEN') {
      return (
        <div className="p-margin-page max-w-[900px] mx-auto space-y-6">
          <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />
          <div className="bg-card-bg border border-card-border rounded-lg p-10 text-center">
            <ShieldAlert className="w-8 h-8 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary text-sm">{t.denied}</p>
          </div>
        </div>
      )
    }
    throw e
  }
}
