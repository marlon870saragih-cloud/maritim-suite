'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Loader2, ArrowUp, ArrowRight, HelpCircle, ShieldCheck, RotateCcw } from 'lucide-react'

const LABELS: Record<string, string> = {
  docNumber: 'No. dokumen', issuedAt: 'Tanggal', invoiceDate: 'Tanggal', noteDate: 'Tanggal',
  receiptDate: 'Tanggal', docDate: 'Tanggal', deliveryDate: 'Tanggal serah', statementDate: 'Tanggal',
  dueDate: 'Jatuh tempo', validity: 'Berlaku', appointmentType: 'Sifat', vesselName: 'Kapal',
  vesselVoyage: 'Kapal / voyage', principal: 'Principal', toContact: 'Kontak', toCompany: 'Perusahaan',
  toRole: 'Peran', toCity: 'Kota', toName: 'Pihak', billToName: 'Ditagih ke', receivedFrom: 'Dari',
  party: 'Pihak', supplier: 'Pemasok', cargo: 'Cargo', loadPort: 'Pel. muat', dischPort: 'Pel. bongkar',
  port: 'Pelabuhan', gtNrt: 'GT / NRT', imo: 'IMO', refDoc: 'Ref', refFda: 'Ref FDA', period: 'Periode',
  productGrade: 'Produk', forPayment: 'Untuk', reason: 'Alasan', neededBy: 'Dibutuhkan', loadingDate: 'Loading',
  deliveryTo: 'Kirim ke', place: 'Tempat', bargeName: 'Tongkang', lines: 'Baris', scopeItems: 'Lingkup kerja',
  terms: 'Ketentuan', approvedByName: 'Penanda tangan', events: 'Kronologi', crew: 'Awak', tanks: 'Tangki',
  items: 'Item', stores: 'Perbekalan', documents: 'Dokumen', rows: 'Baris',
}
const SKIP = new Set(['sections', 'rows'])

function humanize(k: string) {
  return LABELS[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

// Ringkas draft → daftar {label,value} untuk field yang BENAR diisi AI (angka 0 uang disembunyikan).
function summarize(draft: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  for (const [k, v] of Object.entries(draft)) {
    if (SKIP.has(k) || v == null) continue
    if (typeof v === 'string') {
      if (v.trim()) rows.push({ label: humanize(k), value: v })
    } else if (typeof v === 'number') {
      if (v) rows.push({ label: humanize(k), value: String(v) })
    } else if (Array.isArray(v) && v.length) {
      const filled = v.filter((it) => it && typeof it === 'object' && Object.values(it).some((x) => x !== '' && x !== 0 && x != null))
      if (filled.length) rows.push({ label: humanize(k), value: `${filled.length} baris` })
    }
  }
  return rows
}

type Doc = { api: string; editHref: string; label: string; draft: Record<string, unknown> }
type ApiResult =
  | { kind: 'doc'; api: string; editHref: string; label: string; draft: Record<string, unknown> }
  | { kind: 'clarify'; question: string }

type Msg =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'ai'; kind: 'text' | 'clarify' | 'error'; text: string }
  | { id: number; role: 'ai'; kind: 'doc'; doc: Doc }
  | { id: number; role: 'ai'; kind: 'typing' }

const GREETING = 'Halo Pak Marlon. Mau buat dokumen apa? Ceritakan seperti ngobrol — sebut kapal, kegiatan, dan pihaknya, sisanya saya yang rapikan.'
const CHIPS = [
  'Buatkan SPK sub-agen untuk kapal … di pelabuhan …',
  'Buatkan invoice keagenan ke … untuk kapal …',
  'Buat SOF kronologi kapal … di …',
  'Buat rekap Port Call Summary kapal …',
]

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

let nextId = 1
const mk = (m: DistributiveOmit<Msg, 'id'>): Msg => ({ ...m, id: nextId++ } as Msg)

export default function AsistenPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Msg[]>([mk({ role: 'ai', kind: 'text', text: GREETING })])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const onlyGreeting = messages.length === 1

  async function send(raw: string) {
    const instruction = raw.trim()
    if (!instruction || busy) return
    // Konteks percakapan: gabung semua giliran pengguna agar tindak lanjut ("ganti kotanya…")
    // ikut dipertimbangkan saat AI mendraf ulang.
    const priorUser = messages.filter((m): m is Extract<Msg, { role: 'user' }> => m.role === 'user').map((m) => m.text)
    const combined = [...priorUser, instruction].join('. ')
    // Bila AI sudah pernah bertanya di thread ini, jangan izinkan bertanya lagi →
    // dia wajib memilih dokumen (stop loop "ditanya terus").
    const allowClarify = !messages.some((m) => m.role === 'ai' && m.kind === 'clarify')

    setInput('')
    setMessages((p) => [...p, mk({ role: 'user', text: instruction }), mk({ role: 'ai', kind: 'typing' })])
    setBusy(true)
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: combined, allowClarify }),
      })
      const strip = (p: Msg[]) => p.filter((m) => m.role !== 'ai' || m.kind !== 'typing')
      if (!res.ok) {
        const msg = (await res.text()) || 'Maaf, gagal memproses. Coba perjelas permintaannya.'
        setMessages((p) => [...strip(p), mk({ role: 'ai', kind: 'error', text: msg })])
        return
      }
      const r = (await res.json()) as ApiResult
      if (r.kind === 'clarify') {
        setMessages((p) => [...strip(p), mk({ role: 'ai', kind: 'clarify', text: r.question })])
      } else {
        setMessages((p) => [...strip(p), mk({ role: 'ai', kind: 'doc', doc: { api: r.api, editHref: r.editHref, label: r.label, draft: r.draft } })])
      }
    } catch {
      setMessages((p) => [...p.filter((m) => m.role !== 'ai' || m.kind !== 'typing'), mk({ role: 'ai', kind: 'error', text: 'Gagal terhubung ke server. Coba lagi.' })])
    } finally {
      setBusy(false)
    }
  }

  async function openForm(doc: Doc, msgId: number) {
    if (opening !== null) return
    setOpening(msgId)
    try {
      const save = await fetch(`/api/documents/${doc.api}?save=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc.draft),
      })
      if (!save.ok) throw new Error()
      const { id } = (await save.json()) as { id: string }
      router.push(`${doc.editHref}?id=${id}`)
    } catch {
      setMessages((p) => [...p, mk({ role: 'ai', kind: 'error', text: 'Gagal menyiapkan dokumen. Coba lagi.' })])
      setOpening(null)
    }
  }

  function reset() {
    nextId = 1
    setMessages([mk({ role: 'ai', kind: 'text', text: GREETING })])
    setInput('')
    taRef.current?.focus()
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="p-margin-page max-w-[820px] mx-auto flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Link href="/finance" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Finance
        </Link>
        {!onlyGreeting && (
          <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-text-secondary hover:text-white text-xs transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
            Percakapan baru
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5 pb-3 border-b border-border-muted">
        <div className="w-9 h-9 rounded-full bg-accent-purple/15 border border-accent-purple/30 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-accent-purple" />
        </div>
        <div>
          <h1 className="font-display text-lg text-white leading-tight">Asisten Maritim</h1>
          <p className="text-text-secondary text-xs">Ketik biasa — saya rapikan jadi dokumen. Angka uang dihitung mesin.</p>
        </div>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[82%] bg-surface-tertiary border border-border-muted text-text-primary rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed">
                {m.text}
              </div>
            </div>
          ) : m.kind === 'typing' ? (
            <div key={m.id} className="flex justify-start">
              <div className="bg-accent-purple/10 border border-accent-purple/25 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-purple/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent-purple/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent-purple/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className={`max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed ${
                m.kind === 'error'
                  ? 'bg-status-danger/10 border border-status-danger/30 text-status-danger'
                  : m.kind === 'clarify'
                    ? 'bg-accent-amber/10 border border-accent-amber/30 text-text-primary'
                    : 'bg-accent-purple/10 border border-accent-purple/25 text-text-primary'
              }`}>
                {m.kind === 'clarify' && (
                  <span className="inline-flex items-center gap-1.5 text-accent-amber text-xs font-medium mb-1">
                    <HelpCircle className="w-3.5 h-3.5" /> Butuh sedikit kejelasan
                  </span>
                )}
                {m.kind === 'doc' ? <DocCard doc={m.doc} opening={opening === m.id} onOpen={() => openForm(m.doc, m.id)} /> : <p>{m.text}</p>}
              </div>
            </div>
          ),
        )}

        {onlyGreeting && (
          <div className="flex flex-col gap-2 pt-1">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setInput(c); taRef.current?.focus() }}
                className="text-left bg-card-bg border border-card-border rounded-lg px-3.5 py-2 text-xs text-text-secondary
                           hover:text-text-primary hover:border-accent-purple/40 transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border-muted pt-3">
        <div className="flex items-end gap-2 bg-surface border border-border-muted rounded-2xl px-3 py-2 focus-within:border-accent-purple/50 transition-colors">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            disabled={busy}
            placeholder="Balas atau minta perubahan… (Enter kirim, Shift+Enter baris baru)"
            className="flex-1 bg-transparent resize-none text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none py-1.5 max-h-32"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={busy || !input.trim()}
            aria-label="Kirim"
            className="w-9 h-9 rounded-full bg-accent-purple/90 hover:bg-accent-purple text-white flex items-center justify-center transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function DocCard({ doc, opening, onOpen }: { doc: Doc; opening: boolean; onOpen: () => void }) {
  const fields = summarize(doc.draft)
  return (
    <div>
      <p className="mb-2">Siap — <span className="font-medium text-white">{doc.label}</span>. Bagian teksnya sudah saya isikan:</p>
      <div className="bg-surface border border-border-muted rounded-lg p-3">
        {fields.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 mb-2">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-text-secondary min-w-[92px]">{f.label}</span>
                <span className="text-text-primary flex-1">{f.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-secondary text-xs mb-2">Belum ada field spesifik — Anda bisa lengkapi langsung di form.</p>
        )}
        <div className="flex items-center gap-1.5 bg-status-success/10 border border-status-success/25 rounded-md px-2.5 py-1.5 mt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-status-success flex-shrink-0" />
          <span className="text-[11px] text-status-success">Angka uang saya kosongkan — dihitung mesin, Anda tinggal cek.</span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={onOpen}
            disabled={opening}
            className="inline-flex items-center gap-1.5 bg-accent-teal/90 hover:bg-accent-teal text-white rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Buka form &amp; lengkapi
          </button>
          <span className="text-[11px] text-text-secondary">atau ketik perubahan di bawah</span>
        </div>
      </div>
    </div>
  )
}
