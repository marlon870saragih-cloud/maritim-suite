'use client'

// Global Search (Fase 5f) — command palette: Ctrl+K/⌘K dari mana saja, atau
// klik tombol di TopBar. Navigasi cepat ke Voyage/EPDA-FPDA-FDA/Invoice by
// nomor atau nama kapal. Debounce 250ms, panah↑↓ + Enter, Esc menutup.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FileText, Receipt, Route, Loader2, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    trigger: 'Cari…', placeholder: 'Cari voyage, EPDA/FDA, invoice, atau nama kapal…',
    empty: 'Ketik minimal 2 huruf untuk mencari.', noResult: 'Tidak ada hasil untuk', hint: 'untuk pilih',
    typeVoyage: 'Voyage', typeDisbursement: 'Dokumen', typeInvoice: 'Invoice',
  },
  en: {
    trigger: 'Search…', placeholder: 'Search voyage, EPDA/FDA, invoice, or vessel name…',
    empty: 'Type at least 2 letters to search.', noResult: 'No results for', hint: 'to select',
    typeVoyage: 'Voyage', typeDisbursement: 'Document', typeInvoice: 'Invoice',
  },
}

type ResultType = 'VOYAGE' | 'DISBURSEMENT' | 'INVOICE'
type SearchResult = { type: ResultType; id: string; label: string; sublabel: string; href: string }

const TYPE_ICON: Record<ResultType, typeof Route> = { VOYAGE: Route, DISBURSEMENT: FileText, INVOICE: Receipt }

export function GlobalSearchModal() {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActive(0)
  }, [])

  // Ctrl+K / ⌘K global — tapi jangan curi fokus kalau sedang mengetik di field lain
  // biasa (input/textarea non-search), kecuali kombinasi modifier memang ditekan.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && open) {
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      setBusy(false)
      return
    }
    setBusy(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        if (res.ok) {
          const body = await res.json()
          setResults(body.results)
          setActive(0)
        }
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function go(r: SearchResult) {
    close()
    router.push(r.href)
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active])
    }
  }

  const typeLabel: Record<ResultType, string> = { VOYAGE: t.typeVoyage, DISBURSEMENT: t.typeDisbursement, INVOICE: t.typeInvoice }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 text-text-secondary hover:text-accent-blue transition-colors border border-border-muted rounded px-2.5 py-1.5 text-xs"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-[11px]">{t.trigger}</span>
        <span className="font-mono text-[9px] px-1 py-0.5 rounded border border-border-muted text-text-secondary/70">Ctrl K</span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.trigger}
        className="md:hidden hover:text-accent-blue transition-colors p-1 text-text-secondary"
      >
        <Search className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-[1px]" onClick={close}>
          <div
            className="w-full max-w-xl bg-surface-secondary border border-card-border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-card-border">
              {busy ? <Loader2 className="w-4 h-4 animate-spin text-text-secondary shrink-0" /> : <Search className="w-4 h-4 text-text-secondary shrink-0" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={t.placeholder}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none"
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="text-text-secondary text-xs px-4 py-6 text-center">{t.empty}</p>
              ) : !busy && results.length === 0 ? (
                <p className="text-text-secondary text-xs px-4 py-6 text-center">{t.noResult} "{query}"</p>
              ) : (
                <ul>
                  {results.map((r, i) => {
                    const Icon = TYPE_ICON[r.type]
                    return (
                      <li key={`${r.type}-${r.id}`}>
                        <button
                          type="button"
                          onClick={() => go(r)}
                          onMouseEnter={() => setActive(i)}
                          className={cn(
                            'w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-card-border/30 last:border-0 transition-colors',
                            i === active ? 'bg-accent-blue/10' : 'hover:bg-surface-tertiary/50',
                          )}
                        >
                          <Icon className={cn('w-4 h-4 shrink-0', i === active ? 'text-accent-blue' : 'text-text-secondary')} />
                          <div className="min-w-0 flex-1">
                            <p className="text-text-primary text-sm font-mono truncate">{r.label}</p>
                            <p className="text-text-secondary text-[11px] truncate">{r.sublabel}</p>
                          </div>
                          <span className="text-[9px] font-mono uppercase tracking-wider text-text-secondary/60 shrink-0">{typeLabel[r.type]}</span>
                          {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-accent-blue shrink-0" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
