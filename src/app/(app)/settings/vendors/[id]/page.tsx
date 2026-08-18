// Halaman detail Vendor (Fase 7f) — shell server: ambil vendor, sisanya
// interaktif di VendorDetail (client). Baru sebatas Dokumen (Attachment) +
// Catatan (Comment); tab Pekerjaan/Kinerja (K113-K116, doc §5) menyusul di
// 7i/7j begitu WorkOrder/VendorScore ada — tidak dibuat sebagai placeholder
// kosong sekarang (M6: modul baru, bukan kerangka untuk fitur yang belum ada).

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { getLang, type Lang } from '@/lib/i18n-server'
import { requireTenant } from '@/services/context'
import { getVendor } from '@/services/master/vendor.service'
import { ServiceError } from '@/services/errors'
import { VendorDetail } from '@/components/settings/VendorDetail'

export const dynamic = 'force-dynamic'

const PH: Record<Lang, { kicker: string; back: string }> = {
  id: { kicker: 'Vendor', back: 'Kembali ke daftar vendor' },
  en: { kicker: 'Vendor', back: 'Back to vendor list' },
}

export default async function VendorDetailPage({ params }: { params: { id: string } }) {
  const t = PH[getLang()]
  const ctx = await requireTenant()

  let vendor
  try {
    vendor = await getVendor(ctx, params.id)
  } catch (e) {
    if (e instanceof ServiceError && e.code === 'NOT_FOUND') notFound()
    throw e
  }

  return (
    <div className="p-margin-page max-w-[1000px] mx-auto space-y-6">
      <Link
        href="/settings/vendors"
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent-blue transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
      </Link>

      <PageHeader kicker={t.kicker} title={vendor.name} description={vendor.vendorType ?? ''} />

      <VendorDetail vendor={vendor} />
    </div>
  )
}
