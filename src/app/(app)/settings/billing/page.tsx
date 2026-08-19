// Halaman Billing — dipisah dari hub /settings (Fase 8e / K155) supaya bisa
// digerbangi perannya sendiri: ADMIN & FINANCE saja, OPERATOR dkk. 403. Pola
// gerbang sama persis TeamPage (Fase 5g) — panggil fungsi ber-`requireRole`,
// tangkap FORBIDDEN, tampilkan layar tertutup.

import Script from 'next/script'
import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { ServiceError } from '@/services/errors'
import { listSubscriptionInvoices } from '@/services/saas/sub-invoice.service'
import { midtransIsProduction, midtransConfigured } from '@/lib/billing/midtrans'
import { duitkuConfigured } from '@/lib/billing/duitku'
import { pilihGerbang, type Gerbang } from '@/lib/billing/gateway'
import { GERBANG_BAWAAN } from '@/services/saas/commercial-policy'
import { forTenant } from '@/services/tenant-db'
import { BillingPanel } from '@/components/billing/BillingPanel'
import { QuotaMeter } from '@/components/billing/QuotaMeter'
import { SubscriptionInvoiceHistory } from '@/components/billing/SubscriptionInvoiceHistory'

export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  STARTER: '2 Modul',
  PRO: '3 Modul',
  FULL_SUITE: 'Semua Modul',
}

const PH: Record<Lang, { kicker: string; title: string; desc: string; denied: string; planNow: string; daysLeft: string; expired: string }> = {
  id: {
    kicker: 'Pengaturan', title: 'Langganan & Billing', desc: 'Paket, kuota, gerbang pembayaran, dan kuitansi.',
    denied: 'Halaman ini hanya untuk ADMIN dan FINANCE.',
    planNow: 'Paket Saat Ini', daysLeft: 'hari lagi', expired: 'sudah berakhir',
  },
  en: {
    kicker: 'Settings', title: 'Subscription & Billing', desc: 'Plan, quota, payment gateway, and receipts.',
    denied: 'This page is ADMIN and FINANCE only.',
    planNow: 'Current Plan', daysLeft: 'days left', expired: 'has expired',
  },
}

function daysLeftFrom(date: Date | null | undefined): number | null {
  if (!date) return null
  const end = new Date(date).getTime()
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000))
}

export default async function BillingPage() {
  const lang = getLang()
  const t = PH[lang]
  const ctx = await requireTenant()

  try {
    // Trigger pagar peran (K155) — sama pola TeamPage: satu panggilan ber-
    // requireRole memutuskan seluruh halaman sebelum data lain diambil.
    const invoices = await listSubscriptionInvoices(ctx)

    const tenant = await forTenant(ctx).tenant.findFirst({
      where: { id: ctx.tenantId },
      select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true, preferredGateway: true },
    })

    const plan = tenant?.plan ?? 'TRIAL'
    const planLabel = PLAN_LABEL[plan] ?? plan
    const daysLeft = plan === 'TRIAL' ? daysLeftFrom(tenant?.trialEndsAt) : daysLeftFrom(tenant?.subscriptionEndsAt)

    const snapUrl = midtransIsProduction
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js'
    const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? ''

    // K163 — gerbang tanpa kredensial tak muncul di layar sama sekali.
    const gerbangTersedia: Gerbang[] = [
      ...(midtransConfigured() ? (['MIDTRANS'] as const) : []),
      ...(duitkuConfigured() ? (['DUITKU'] as const) : []),
    ]
    const gerbangAwal = pilihGerbang(tenant?.preferredGateway, gerbangTersedia, GERBANG_BAWAAN)

    return (
      <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
        {clientKey && <Script src={snapUrl} data-client-key={clientKey} strategy="afterInteractive" />}

        <PageHeader kicker={t.kicker} title={t.title} description={t.desc} />

        <div className="bg-card-bg border border-card-border rounded-lg p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-0.5">{t.planNow}</p>
            <p className="text-white text-sm">
              {planLabel}
              {daysLeft !== null && (
                <>
                  {' · '}
                  {daysLeft > 0 ? (
                    <span className="text-status-warning">{daysLeft} {t.daysLeft}</span>
                  ) : (
                    <span className="text-status-danger">{t.expired}</span>
                  )}
                </>
              )}
            </p>
          </div>
          <span className="text-[10px] bg-accent-teal/12 text-accent-teal px-3 py-1 rounded-full border border-accent-teal/30 uppercase tracking-wider font-mono">
            {planLabel}
          </span>
        </div>

        {/* K156 — pengukur kuota di atas pemilih paket: "berapa yang sudah
            terpakai" adalah alasan orang membuka halaman ini. Tak tampil sama
            sekali selama batasnya null. */}
        <QuotaMeter lang={lang} />

        <BillingPanel lang={lang} gerbangTersedia={gerbangTersedia} gerbangAwal={gerbangAwal} />

        <SubscriptionInvoiceHistory lang={lang} invoices={invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          issuedAt: i.issuedAt.toISOString(),
          currency: i.currency,
          grandTotal: i.grandTotal,
        }))} />
      </div>
    )
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'FORBIDDEN') {
      return (
        <div className="p-margin-page max-w-[1200px] mx-auto space-y-6">
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
