'use client'

// Dua pintu penambahan baris (§12/2, K28): dari katalog satu-per-satu, atau
// dari sebuah ServiceTemplate sekali jalan. Satu dialog, dua tab — bukan dua
// dialog terpisah, supaya state pencarian/loading tak dobel.

import { useEffect, useState } from 'react'
import { Loader2, Search, LayoutList, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Tambah Baris', descCatalog: 'Cari jasa dari katalog — tarif & mata uang terisi otomatis.',
    descTemplate: 'Pilih template — semua baris jasanya masuk sekaligus.',
    tabCatalog: 'Dari Katalog', tabTemplate: 'Dari Template',
    search: 'Cari kode atau nama jasa…', empty: 'Tidak ada jasa yang cocok.',
    emptyTemplate: 'Belum ada template jasa. Buat di Settings › Katalog Jasa & Tarif.',
    loading: 'Memuat…', add: 'Tambah', use: 'Pakai Template',
    items: 'baris',
  },
  en: {
    title: 'Add Line', descCatalog: 'Search the service catalog — rate & currency auto-fill.',
    descTemplate: 'Pick a template — all its service lines are added at once.',
    tabCatalog: 'From Catalog', tabTemplate: 'From Template',
    search: 'Search service code or name…', empty: 'No matching service.',
    emptyTemplate: 'No service templates yet. Create one in Settings › Service Catalog & Rates.',
    loading: 'Loading…', add: 'Add', use: 'Use Template',
    items: 'items',
  },
}

type ServiceOption = { id: string; serviceCode: string; serviceName: string; category: string; calcMethod: string }
type TemplateOption = { id: string; name: string; portId: string | null; vesselType: string | null; items: { id: string }[] }

export function ServicePickerDialog({
  open, onOpenChange, defaultTab = 'catalog', onPickService, onPickTemplate, busy,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultTab?: 'catalog' | 'template'
  onPickService: (serviceId: string) => void
  onPickTemplate: (templateId: string) => void
  busy: boolean
}) {
  const t = useT(STR)
  const [tab, setTab] = useState<'catalog' | 'template'>(defaultTab)
  const [query, setQuery] = useState('')
  const [services, setServices] = useState<ServiceOption[] | null>(null)
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)

  useEffect(() => {
    if (!open) return
    setTab(defaultTab)
    setQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTab])

  useEffect(() => {
    if (!open || tab !== 'catalog') return
    const handle = setTimeout(() => {
      fetch(`/api/services?cari=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setServices)
        .catch(() => setServices([]))
    }, 200)
    return () => clearTimeout(handle)
  }, [open, tab, query])

  useEffect(() => {
    if (!open || tab !== 'template' || templates !== null) return
    fetch('/api/service-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [open, tab, templates])

  useEffect(() => {
    if (!open) setTemplates(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">
            {tab === 'catalog' ? t.descCatalog : t.descTemplate}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b border-card-border">
          <button
            type="button"
            onClick={() => setTab('catalog')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors',
              tab === 'catalog' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <ListChecks className="w-3.5 h-3.5" /> {t.tabCatalog}
          </button>
          <button
            type="button"
            onClick={() => setTab('template')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors',
              tab === 'template' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <LayoutList className="w-3.5 h-3.5" /> {t.tabTemplate}
          </button>
        </div>

        {tab === 'catalog' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/60" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.search}
                className="w-full bg-surface border border-border-muted rounded pl-8 pr-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
              />
            </div>
            {services === null ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
              </div>
            ) : services.length === 0 ? (
              <p className="text-text-secondary text-xs text-center py-8">{t.empty}</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-card-border/50 border border-card-border/60 rounded">
                {services.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPickService(s.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-surface-tertiary/50 transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm text-text-primary">{s.serviceName}</p>
                        <p className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                          {s.serviceCode} · {s.category} · {s.calcMethod}
                        </p>
                      </div>
                      {busy && <Loader2 className="w-4 h-4 animate-spin text-text-secondary flex-shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : templates === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-text-secondary text-xs text-center py-8">{t.emptyTemplate}</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto divide-y divide-card-border/50 border border-card-border/60 rounded">
            {templates.map((tpl) => (
              <li key={tpl.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPickTemplate(tpl.id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-surface-tertiary/50 transition-colors disabled:opacity-50 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm text-text-primary">{tpl.name}</p>
                    <p className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                      {tpl.items.length} {t.items}
                      {tpl.vesselType ? ` · ${tpl.vesselType}` : ''}
                    </p>
                  </div>
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-text-secondary flex-shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
