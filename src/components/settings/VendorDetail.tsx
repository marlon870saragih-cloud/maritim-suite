'use client'

// Detail Vendor — Profil · Pekerjaan · Kinerja · Dokumen · Catatan (K116,
// Fase 7j). Lima tab: profil ringkas naik ke atas (selalu terlihat), sisanya
// jadi tab karena masing-masing sudah cukup berat (daftar PO/WO, skor+
// rating, attachment, comment) untuk berdiri sendiri — pola sama
// VoyageWorkspace.tsx, bukan grid tumpuk seperti versi 7f.

import { useState } from 'react'
import { Briefcase, MessageSquare, Paperclip, TrendingUp, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import { AttachmentPanel } from '@/components/ops/AttachmentPanel'
import { CommentPanel } from '@/components/ops/CommentPanel'
import { VendorWorkPanel } from '@/components/ops/VendorWorkPanel'
import { VendorPerformanceCard } from '@/components/ops/VendorPerformanceCard'
import type { Vendor } from './VendorsManager'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    profile: 'Profil', fAddress: 'Alamat', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Telepon',
    fContact: 'Kontak Person', fPaymentTerm: 'Termin Bayar', days: 'hari',
    tabProfile: 'Profil', tabWork: 'Pekerjaan', tabPerformance: 'Kinerja', tabDocs: 'Dokumen', tabNotes: 'Catatan',
  },
  en: {
    profile: 'Profile', fAddress: 'Address', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Phone',
    fContact: 'Contact Person', fPaymentTerm: 'Payment Term', days: 'days',
    tabProfile: 'Profile', tabWork: 'Work', tabPerformance: 'Performance', tabDocs: 'Documents', tabNotes: 'Notes',
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

const TABS = ['profile', 'work', 'performance', 'docs', 'notes'] as const
type TabKey = (typeof TABS)[number]

export function VendorDetail({ vendor }: { vendor: Vendor }) {
  const t = useT(STR)
  const [tab, setTab] = useState<TabKey>('profile')

  const tabLabel: Record<TabKey, string> = {
    profile: t.tabProfile, work: t.tabWork, performance: t.tabPerformance, docs: t.tabDocs, notes: t.tabNotes,
  }
  const tabIcon = { profile: User, work: Briefcase, performance: TrendingUp, docs: Paperclip, notes: MessageSquare }

  return (
    <section className="bg-card-bg border border-card-border rounded-lg">
      <div className="flex items-center gap-1 border-b border-card-border px-3">
        {TABS.map((k) => {
          const Icon = tabIcon[k]
          const on = tab === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-3 text-[11px] font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors',
                on
                  ? 'border-accent-blue text-accent-blue'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tabLabel[k]}
            </button>
          )
        })}
      </div>

      <div className="p-5">
        {tab === 'profile' && (
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
        )}
        {tab === 'work' && <VendorWorkPanel vendorId={vendor.id} />}
        {tab === 'performance' && <VendorPerformanceCard vendorId={vendor.id} />}
        {tab === 'docs' && <AttachmentPanel entityType="VENDOR" entityId={vendor.id} />}
        {tab === 'notes' && <CommentPanel entityType="VENDOR" entityId={vendor.id} />}
      </div>
    </section>
  )
}
