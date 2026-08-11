'use client'

// Slot Fase 3 (EPDA Engine) & Fase 4 (FDA + Invoice). Sengaja TIDAK ada aksi:
// belum ada satu pun jalur kode yang membuat Disbursement/Invoice bertaut voyage
// (generator /finance/* lama masih menulis MaritimeDocument via PortCall), dan
// rumus/multi-currency EPDA baru dirancang di Fase 3 — lihat docs/ROADMAP-v2.md §6b.
// Panel ini hanya memastikan arsitektur informasi Workspace sudah punya tempatnya.

import { FileText, Receipt, Wallet } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    note: 'Belum ada disbursement/invoice — dibangun di Fase 3/4.',
    disb: 'Disbursement (EPDA/FPDA/FDA)', disbDesc: 'Estimasi & realisasi biaya pelabuhan.',
    inv: 'Invoice', invDesc: 'Tagihan jasa ke customer.',
    doc: 'Dokumen', docDesc: 'Dokumen yang tertaut ke voyage ini.',
    count: 'baris',
  },
  en: {
    note: 'No disbursement/invoice yet — coming in Phase 3/4.',
    disb: 'Disbursement (EPDA/FPDA/FDA)', disbDesc: 'Estimated & actual port costs.',
    inv: 'Invoice', invDesc: 'Service billing to the customer.',
    doc: 'Documents', docDesc: 'Documents linked to this voyage.',
    count: 'rows',
  },
}

export type VoyageFinanceCounts = { disbursements: number; invoices: number; documents: number }

export function VoyageFinancePanel({ counts }: { counts: VoyageFinanceCounts }) {
  const t = useT(STR)

  const cards = [
    { key: 'disb', icon: Wallet, title: t.disb, desc: t.disbDesc, n: counts.disbursements },
    { key: 'inv', icon: Receipt, title: t.inv, desc: t.invDesc, n: counts.invoices },
    { key: 'doc', icon: FileText, title: t.doc, desc: t.docDesc, n: counts.documents },
  ]

  return (
    <div className="space-y-3">
      <p className="text-text-secondary text-xs bg-surface/40 border border-card-border/60 rounded px-3 py-2">
        {t.note}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.key} className="rounded-md border border-card-border/60 bg-surface/30 px-3.5 py-3">
            <div className="flex items-center gap-2 text-text-secondary">
              <c.icon className="w-4 h-4" />
              <p className="text-[10px] font-mono uppercase tracking-wider">{c.title}</p>
            </div>
            <p className="mt-2 font-display text-xl text-[#C8DCF8]">
              {c.n} <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.count}</span>
            </p>
            <p className="text-text-secondary text-xs mt-1">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
