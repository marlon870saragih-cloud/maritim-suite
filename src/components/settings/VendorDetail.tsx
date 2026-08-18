'use client'

// Detail Vendor (Fase 7f) — profil ringkas + Dokumen (Attachment) + Catatan
// (Comment). Bukan tab widget: cuma dua panel, jadi ditumpuk langsung (pola
// sama InvoiceDetail.tsx), bukan komponen tab yang baru berguna kalau ada
// tiga isian atau lebih.

import { useT, type Lang } from '@/lib/i18n'
import { AttachmentPanel } from '@/components/ops/AttachmentPanel'
import { CommentPanel } from '@/components/ops/CommentPanel'
import type { Vendor } from './VendorsManager'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    profile: 'Profil', fAddress: 'Alamat', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Telepon',
    fContact: 'Kontak Person', fPaymentTerm: 'Termin Bayar', days: 'hari',
  },
  en: {
    profile: 'Profile', fAddress: 'Address', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Phone',
    fContact: 'Contact Person', fPaymentTerm: 'Payment Term', days: 'days',
  },
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{label}</p>
      <p className="text-text-primary text-sm">{value}</p>
    </div>
  )
}

export function VendorDetail({ vendor }: { vendor: Vendor }) {
  const t = useT(STR)

  return (
    <div className="space-y-6">
      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3">{t.profile}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t.fAddress} value={vendor.address} />
          <Field label={t.fNpwp} value={vendor.npwp} />
          <Field label={t.fEmail} value={vendor.email} />
          <Field label={t.fPhone} value={vendor.phone} />
          <Field label={t.fContact} value={vendor.contactPerson} />
          <Field
            label={t.fPaymentTerm}
            value={vendor.paymentTermDays != null ? `${vendor.paymentTermDays} ${t.days}` : null}
          />
        </div>
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5 grid gap-6 md:grid-cols-2">
        <AttachmentPanel entityType="VENDOR" entityId={vendor.id} />
        <CommentPanel entityType="VENDOR" entityId={vendor.id} />
      </section>
    </div>
  )
}
