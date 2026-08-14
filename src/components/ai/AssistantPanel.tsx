'use client'

// Panel Asisten kontekstual (Fase 6g · K75–K77) — panel kanan, dibuka dari
// Voyage Workspace & builder Disbursement (§12/1-2 docs/FASE-6-AI-LAYER.md).
//
// Dua kemampuan (K77), dan yang ketiga sengaja TIDAK ADA:
//   1. Tanya-jawab   → POST /api/ai/context/ask
//   2. Usulkan catatan → POST /api/ai/context/suggest
//
// K52/K77-3 — kemampuan 2 di sini SENGAJA tidak "menerapkan" usulan langsung
// ke field form manapun (mis. header notes/revisionNote di DisbursementBuilder
// atau RevisionDialog). Field target itu hidup di komponen lain yang dibuka
// terpisah, dan menyambungkan "onApply" ke state komponen lain berarti panel
// ini perlu tahu bentuk form setiap pemanggil — kopling yang rapuh untuk
// manfaat kecil. Sebagai gantinya usulan ditampilkan sebagai teks siap-salin
// (tombol Salin): operator menempelkannya sendiri ke field yang dimaksud.
// Ini tetap memenuhi K52 ("tak tersimpan sampai manusia bertindak") — cuma
// lewat clipboard, bukan lewat pengikatan field otomatis.
//
// K54 — `sertakanPrediksi`/`sertakanAnomali` SENGAJA dimatikan (bawaan API)
// di sini: menyalakannya berarti tiap pertanyaan membayar ulang mesin 6c/6e
// penuh. Bisa ditambah jadi opsi nanti bila operator memintanya.

import { useState } from 'react'
import { Copy, Loader2, Send, Sparkles } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { JenisKonteks } from '@/services/ai/konteks'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Asisten', desc: 'Menjawab & mengusulkan catatan berdasarkan dokumen yang sedang dibuka — tidak mengubah atau menyimpan apa pun.',
    askTab: 'Tanya', suggestTab: 'Usulkan Catatan',
    askPlaceholder: 'mis. Baris mana yang paling besar? Kenapa total naik dari revisi sebelumnya?',
    askButton: 'Tanya', askEmpty: 'Belum ada pertanyaan.',
    suggestPlaceholder: 'mis. catatan revisi: ETD mundur 2 hari',
    suggestButton: 'Usulkan', suggestResultTitle: 'Usulan (belum tersimpan)',
    copy: 'Salin', copied: 'Tersalin', warnUnverified: 'Peringatan: ada angka yang tak cocok dengan dokumen — periksa ulang sebelum dipakai.',
    errAsk: 'Gagal mendapat jawaban.', errSuggest: 'Gagal mendapat usulan.', errConn: 'Gagal terhubung ke server.',
    rejected: 'Penjelasan tidak tersedia — angka pada penjelasan tidak cocok dengan data.',
  },
  en: {
    title: 'Assistant', desc: 'Answers questions & proposes note text from the document currently open — it never changes or saves anything.',
    askTab: 'Ask', suggestTab: 'Propose Note',
    askPlaceholder: 'e.g. Which line is the biggest? Why did the total go up from the previous revision?',
    askButton: 'Ask', askEmpty: 'No questions yet.',
    suggestPlaceholder: 'e.g. revision note: ETD slipped by 2 days',
    suggestButton: 'Propose', suggestResultTitle: 'Proposal (not saved)',
    copy: 'Copy', copied: 'Copied', warnUnverified: 'Warning: some figures do not match the document — double-check before use.',
    errAsk: 'Failed to get an answer.', errSuggest: 'Failed to get a proposal.', errConn: 'Failed to connect to server.',
    rejected: 'Explanation unavailable — the figures in the explanation do not match the data.',
  },
}

type Tab = 'ask' | 'suggest'

type Exchange = { pertanyaan: string; jawaban: string; ditolak: boolean }

const FIELD_CATATAN = 'catatan'

export function AssistantPanel({
  jenis,
  entityId,
  open,
  onOpenChange,
}: {
  jenis: JenisKonteks
  entityId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT(STR)
  const [tab, setTab] = useState<Tab>('ask')

  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [askBusy, setAskBusy] = useState(false)
  const [askError, setAskError] = useState('')

  const [instruction, setInstruction] = useState('')
  const [suggestion, setSuggestion] = useState<{ nilai: string; diterima: boolean } | null>(null)
  const [suggestBusy, setSuggestBusy] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [copied, setCopied] = useState(false)

  async function ask() {
    const q = question.trim()
    if (!q || askBusy) return
    setAskBusy(true)
    setAskError('')
    try {
      const res = await fetch('/api/ai/context/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis, id: entityId, question: q }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setAskError(body?.error?.message ?? t.errAsk)
        return
      }
      setExchanges((prev) => [...prev, { pertanyaan: q, jawaban: body.ditolak ? t.rejected : body.answer, ditolak: !!body.ditolak }])
      setQuestion('')
    } catch {
      setAskError(t.errConn)
    } finally {
      setAskBusy(false)
    }
  }

  async function suggest() {
    const instr = instruction.trim()
    if (!instr || suggestBusy) return
    setSuggestBusy(true)
    setSuggestError('')
    setSuggestion(null)
    setCopied(false)
    try {
      const res = await fetch('/api/ai/context/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis, id: entityId, instruction: instr, fields: [FIELD_CATATAN] }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setSuggestError(body?.error?.message ?? t.errSuggest)
        return
      }
      const usulan = (body.usulan ?? []).find((u: { field: string }) => u.field === FIELD_CATATAN)
      if (!usulan) {
        setSuggestError(t.errSuggest)
        return
      }
      setSuggestion({ nilai: usulan.nilai, diterima: usulan.diterima })
    } catch {
      setSuggestError(t.errConn)
    } finally {
      setSuggestBusy(false)
    }
  }

  function copySuggestion() {
    if (!suggestion) return
    navigator.clipboard?.writeText(suggestion.nilai).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-surface-secondary border-card-border text-text-primary w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> {t.title}
          </SheetTitle>
          <SheetDescription className="text-text-secondary text-xs">{t.desc}</SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 border-b border-border-muted pt-2">
          {(['ask', 'suggest'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === k
                  ? 'border-accent-blue text-white'
                  : 'border-transparent text-text-secondary hover:text-white'
              }`}
            >
              {k === 'ask' ? t.askTab : t.suggestTab}
            </button>
          ))}
        </div>

        {tab === 'ask' ? (
          <div className="flex flex-col flex-1 min-h-0 gap-3 pt-3">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {exchanges.length === 0 && <p className="text-text-secondary text-xs">{t.askEmpty}</p>}
              {exchanges.map((ex, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-xs text-accent-blue font-medium">{ex.pertanyaan}</p>
                  <p className={`text-sm ${ex.ditolak ? 'text-status-danger italic' : 'text-text-primary'}`}>{ex.jawaban}</p>
                </div>
              ))}
            </div>
            {askError && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{askError}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask()
                  }
                }}
                placeholder={t.askPlaceholder}
                rows={2}
                className="flex-1 bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 resize-none"
              />
              <button
                type="button"
                onClick={ask}
                disabled={askBusy || !question.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {askBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-3">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t.suggestPlaceholder}
              rows={2}
              className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 resize-none"
            />
            <button
              type="button"
              onClick={suggest}
              disabled={suggestBusy || !instruction.trim()}
              className="self-end inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {suggestBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t.suggestButton}
            </button>

            {suggestError && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{suggestError}</p>
            )}

            {suggestion && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.suggestResultTitle}</p>
                <p
                  className={`text-sm rounded border px-3 py-2 whitespace-pre-wrap ${
                    suggestion.diterima
                      ? 'border-border-muted bg-surface text-text-primary'
                      : 'border-status-danger/40 bg-status-danger/5 text-text-primary'
                  }`}
                >
                  {suggestion.nilai}
                </p>
                {!suggestion.diterima && <p className="text-status-danger text-xs">{t.warnUnverified}</p>}
                <button
                  type="button"
                  onClick={copySuggestion}
                  className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> {copied ? t.copied : t.copy}
                </button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
