'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Loader2, Send, ArrowRight, Pencil, HelpCircle, FileText } from 'lucide-react'

const inputCls =
  'w-full bg-surface border border-border-muted rounded-lg px-3.5 py-3 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-purple focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-purple/40 transition-colors resize-none'

const EXAMPLES = [
  'Buatkan SPK penunjukan Karana Line (Pak Hardi, Balikpapan) untuk MT Soechi Asia, muat KGTE Balikpapan bongkar Morowali, cargo B40 6000 MT.',
  'Buatkan invoice tagihan ke Soechi Lines untuk MT Soechi Asia di Samarinda, rincian: jasa pandu & tunda, clearance, dan agency fee. Ref FDA/2026/06/0142.',
]

// Label ramah untuk field yang sering muncul (fallback: humanize otomatis).
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
  terms: 'Ketentuan', approvedByName: 'Penanda tangan',
}
const SKIP = new Set(['sections', 'rows'])

function humanize(k: string) {
  return LABELS[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

// Ringkas draft → daftar {label, value} hanya untuk field yang BENAR diisi AI
// (string non-kosong, angka non-nol, array berisi). Angka 0 = placeholder uang → disembunyikan.
function summarize(draft: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  for (const [k, v] of Object.entries(draft)) {
    if (SKIP.has(k) || v == null) continue
    if (typeof v === 'string') {
      if (v.trim()) rows.push({ label: humanize(k), value: v })
    } else if (typeof v === 'number') {
      if (v) rows.push({ label: humanize(k), value: String(v) })
    } else if (Array.isArray(v) && v.length) {
      rows.push({ label: humanize(k), value: `${v.length} item` })
    }
  }
  return rows
}

type Doc = { api: string; editHref: string; label: string; draft: Record<string, unknown> }
type ApiResult =
  | { kind: 'doc'; api: string; editHref: string; label: string; draft: Record<string, unknown> }
  | { kind: 'clarify'; question: string }

export default function AsistenPage() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<null | 'analyze' | 'confirm'>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [clarify, setClarify] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')

  async function analyze() {
    const instruction = text.trim()
    if (!instruction) return
    setBusy('analyze')
    setErr('')
    setClarify('')
    setDoc(null)
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      })
      if (!res.ok) throw new Error((await res.text()) || 'Gagal')
      const r = (await res.json()) as ApiResult
      if (r.kind === 'clarify') setClarify(r.question)
      else setDoc({ api: r.api, editHref: r.editHref, label: r.label, draft: r.draft })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memproses')
    } finally {
      setBusy(null)
    }
  }

  async function confirm() {
    if (!doc) return
    setBusy('confirm')
    setErr('')
    try {
      setStatus('Menyiapkan dokumen…')
      const save = await fetch(`/api/documents/${doc.api}?save=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc.draft),
      })
      if (!save.ok) throw new Error('Gagal menyiapkan dokumen')
      const { id } = (await save.json()) as { id: string }
      setStatus('Membuka form untuk Anda review…')
      router.push(`${doc.editHref}?id=${id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyiapkan')
      setBusy(null)
      setStatus('')
    }
  }

  const fields = doc ? summarize(doc.draft) : []

  return (
    <div className="p-margin-page max-w-[820px] mx-auto">
      <Link
        href="/finance"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Finance
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5 text-accent-purple" />
        <h1 className="font-display text-2xl text-white">Asisten Dokumen</h1>
        <span className="text-[10px] font-mono uppercase tracking-wider text-accent-purple/70 ml-1">Haiku · OpenRouter</span>
      </div>
      <p className="text-text-secondary text-sm mb-6">
        Ceritakan dokumen yang Anda butuhkan. AI menentukan jenisnya &amp; mengisi field, lalu menampilkan
        ringkasan untuk Anda konfirmasi. AI hanya mengisi bahasa — angka uang dihitung mesin.
      </p>

      <section className="bg-card-bg border border-accent-purple/30 rounded-lg p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          disabled={busy !== null}
          placeholder="mis. Buatkan SPK penunjukan sub-agen untuk kapal MT … di pelabuhan …"
          className={inputCls + ' disabled:opacity-60'}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={analyze}
            disabled={busy !== null || !text.trim()}
            className="inline-flex items-center gap-2 bg-accent-purple/90 hover:bg-accent-purple text-white
                       rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy === 'analyze' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {doc || clarify ? 'Analisa Ulang' : 'Analisa'}
          </button>
          {err && <span className="text-xs text-status-danger">{err}</span>}
        </div>
      </section>

      {/* AI bertanya balik bila ambigu */}
      {clarify && (
        <section className="mt-4 bg-accent-amber/5 border border-accent-amber/40 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <HelpCircle className="w-4 h-4 text-accent-amber" />
            <h2 className="font-display text-base text-white">AI butuh kejelasan</h2>
          </div>
          <p className="text-text-primary text-sm">{clarify}</p>
          <p className="text-text-secondary text-xs mt-2">
            Tambahkan jawabannya pada kotak instruksi di atas, lalu tekan <strong>Analisa Ulang</strong>.
          </p>
        </section>
      )}

      {/* Pratinjau & konfirmasi */}
      {doc && (
        <section className="mt-4 bg-card-bg border border-accent-teal/30 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-accent-teal" />
            <h2 className="font-display text-base text-white">Akan dibuat: {doc.label}</h2>
          </div>
          <p className="text-text-secondary text-xs mb-4">Yang berhasil AI isi dari permintaan Anda:</p>

          {fields.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-4">
              {fields.map((f, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-text-secondary min-w-[110px]">{f.label}</span>
                  <span className="text-text-primary flex-1">{f.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary text-sm mb-4">
              Belum ada field spesifik yang terisi — Anda bisa langsung lengkapi di form.
            </p>
          )}

          <div className="rounded-md bg-surface/60 border border-border-muted px-3 py-2 mb-4">
            <p className="text-[11px] text-text-secondary/80">
              Field lain (termasuk angka uang &amp; yang tak Anda sebut) dikosongkan untuk Anda lengkapi di
              form. Total dihitung otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={confirm}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-accent-teal/90 hover:bg-accent-teal text-white
                         rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {busy === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Buka form &amp; lengkapi
            </button>
            <button
              type="button"
              onClick={() => setDoc(null)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 border border-border-muted text-text-secondary
                         hover:text-white hover:border-accent-blue/60 rounded-lg px-4 py-2.5 text-sm font-medium
                         transition-colors disabled:opacity-50"
            >
              <Pencil className="w-4 h-4" />
              Ubah instruksi
            </button>
            {status && <span className="text-xs text-accent-teal">{status}</span>}
          </div>
        </section>
      )}

      {/* Contoh */}
      {!doc && !clarify && (
        <div className="mt-6">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary/60 mb-2">Contoh</p>
          <div className="space-y-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setText(ex)}
                disabled={busy !== null}
                className="block w-full text-left bg-card-bg border border-card-border rounded-md px-4 py-2.5
                           text-xs text-text-secondary hover:text-text-primary hover:border-accent-purple/40
                           transition-colors disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-text-secondary/70 leading-relaxed">
        Dokumen yang didukung (29) — <span className="text-text-primary">Finance:</span> SPK · EPDA · FPDA ·
        Invoice · Kwitansi · Nota Debit · Nota Kredit · PR · PO · BDN · SOA. <span className="text-text-primary">Maritim:</span>{' '}
        NOR · SOF · Arrival/Departure Report · Crew List · GenDec · Cargo Decl · Ship&apos;s Stores · Agency
        Appointment · Letter of Protest · Note of Protest · Letter of Indemnity · Crew Change · Time Sheet ·
        Bunker Req · Damage · Ullage · Port Call Summary. Angka uang/teknis dikosongkan — Anda lengkapi, total dihitung otomatis.
      </p>
    </div>
  )
}
