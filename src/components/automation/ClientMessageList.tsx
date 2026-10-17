'use client'

// Daftar Pesan Klien WhatsApp + panel buat draft — WA-2a 2a-G (T3).
// Sumber: GET /api/automation/client-messages, GET …/candidates/signals, GET …/candidates/contacts, POST … (draft).
// Kandidat hanya petunjuk: server menilai ulang seluruh prasyarat saat draft dibuat. Penerima selalu tersamar.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { btnCls, fmtWaktu } from './shared'
import {
  BelumDikirimBanner,
  LABEL_KELUARGA,
  LABEL_STATE,
  RUTE_PESAN_KLIEN,
  STATUS_PESAN,
  StateBadge,
  jelaskan,
  labelHasil,
  panggilApi,
  pesanGalat,
  type Halaman,
  type KandidatKontak,
  type KandidatSinyal,
  type RingkasanPesan,
} from './client-message-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    state: 'Status pesan', all: 'Semua', refresh: 'Muat ulang', more: 'Muat lebih banyak', loading: 'Memuat pesan klien…',
    empty: 'Belum ada pesan klien.', open: 'Buka', revision: 'revisi', created: 'Dibuat', approval: 'Approval', expires: 'berlaku s.d.',
    newDraft: 'Buat draft', closeDraft: 'Tutup panel draft', signals: '1. Pilih sinyal', contacts: '2. Pilih kontak', noSignals: 'Tidak ada sinyal kandidat (OPEN/ACKNOWLEDGED dengan jenis kejadian yang didukung).',
    noContacts: 'Tidak ada kontak aktif.', pickSignal: 'Pilih sinyal lebih dulu.', voyageFilter: 'Filter voyage (ID, opsional)', apply: 'Terapkan',
    eligible: 'Layak', notEligible: 'Tidak layak', create: 'Buat draft dari pilihan ini', hint: 'Kelayakan hanya petunjuk — server menilai ulang saat draft dibuat.',
    detected: 'Terdeteksi', candidateLoading: 'Memuat kandidat…', recipient: 'Penerima',
  },
  en: {
    state: 'Message state', all: 'All', refresh: 'Reload', more: 'Load more', loading: 'Loading client messages…',
    empty: 'No client messages yet.', open: 'Open', revision: 'revision', created: 'Created', approval: 'Approval', expires: 'valid until',
    newDraft: 'Create draft', closeDraft: 'Close draft panel', signals: '1. Choose a signal', contacts: '2. Choose a contact', noSignals: 'No candidate signals (OPEN/ACKNOWLEDGED with a supported event type).',
    noContacts: 'No active contacts.', pickSignal: 'Choose a signal first.', voyageFilter: 'Voyage filter (ID, optional)', apply: 'Apply',
    eligible: 'Eligible', notEligible: 'Not eligible', create: 'Create draft from this selection', hint: 'Eligibility is only a hint — the server re-checks when the draft is created.',
    detected: 'Detected', candidateLoading: 'Loading candidates…', recipient: 'Recipient',
  },
}

const selectCls =
  'bg-surface border border-border-muted rounded px-2.5 py-2 min-h-[36px] text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'
const btnUtama = cn(btnCls, 'bg-accent-blue hover:bg-primary text-[#231a06]')
const btnKedua = cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')

function PanelDraft({ lang, t }: { lang: Lang; t: Record<string, string> }) {
  const router = useRouter()
  const [voyage, setVoyage] = useState('')
  const [sinyal, setSinyal] = useState<KandidatSinyal[] | null>(null)
  const [pilihSinyal, setPilihSinyal] = useState('')
  const [kontak, setKontak] = useState<KandidatKontak[] | null>(null)
  const [pilihKontak, setPilihKontak] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const kunci = useRef(false)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState('')

  const muatSinyal = useCallback(async (v: string) => {
    setLoading(true)
    setError('')
    setPilihSinyal('')
    setKontak(null)
    const q = new URLSearchParams({ take: '20' })
    if (v.trim()) q.set('voyageId', v.trim())
    const r = await panggilApi<{ data: { items: KandidatSinyal[] } }>(`/candidates/signals?${q.toString()}`)
    if (r.ok) setSinyal(r.data.data.items)
    else setError(pesanGalat(r, lang))
    setLoading(false)
  }, [lang])

  useEffect(() => {
    void muatSinyal('')
  }, [muatSinyal])

  async function pilih(id: string) {
    setPilihSinyal(id)
    setPilihKontak('')
    setKontak(null)
    setError('')
    const r = await panggilApi<{ data: { items: KandidatKontak[] } }>(`/candidates/contacts?signalId=${encodeURIComponent(id)}`)
    if (r.ok) setKontak(r.data.data.items)
    else setError(pesanGalat(r, lang))
  }

  async function buat() {
    if (kunci.current || !pilihSinyal || !pilihKontak) return
    kunci.current = true
    setBusy(true)
    setError('')
    setHasil('')
    try {
      const r = await panggilApi<{ hasil: string; messageId: string }>('', 'POST', { signalId: pilihSinyal, contactId: pilihKontak })
      if (r.ok) {
        setHasil(labelHasil(r.data.hasil, lang))
        router.push(`${RUTE_PESAN_KLIEN}/${encodeURIComponent(r.data.messageId)}?hasil=${encodeURIComponent(r.data.hasil)}`)
        return
      }
      setError(pesanGalat(r, lang))
      // Status tidak pasti: muat ulang kandidat; staf memeriksa daftar sebelum mencoba lagi.
      if (r.tidakPasti) await muatSinyal(voyage)
    } finally {
      kunci.current = false
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-4" data-testid="panel-draft" aria-label={t.newDraft}>
      <p className="text-xs text-text-secondary">{t.hint}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void muatSinyal(voyage)
        }}
      >
        <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
          {t.voyageFilter}
          <input className={selectCls} value={voyage} onChange={(e) => setVoyage(e.target.value)} maxLength={64} data-testid="filter-voyage" />
        </label>
        <button type="submit" className={btnKedua} disabled={loading}>{t.apply}</button>
      </form>

      <div>
        <h3 className="text-sm font-medium text-text-primary mb-2">{t.signals}</h3>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.candidateLoading}</p>
        ) : sinyal && sinyal.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="sinyal-kosong">{t.noSignals}</p>
        ) : (
          <ul className="space-y-1" data-testid="daftar-sinyal">
            {(sinyal ?? []).map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                  <input type="radio" name="sinyal" value={s.id} checked={pilihSinyal === s.id} onChange={() => void pilih(s.id)} data-testid="opsi-sinyal" data-signal-id={s.id} />
                  <span>{LABEL_KELUARGA[lang][s.keluarga] ?? s.keluarga}</span>
                  <span className="text-[11px] font-mono text-text-secondary">{s.reviewState} · {t.detected} {fmtWaktu(s.detectedAt, lang)} · voyage {s.voyageId}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-text-primary mb-2">{t.contacts}</h3>
        {!pilihSinyal ? (
          <p className="text-sm text-text-secondary">{t.pickSignal}</p>
        ) : kontak === null ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.candidateLoading}</p>
        ) : kontak.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.noContacts}</p>
        ) : (
          <ul className="space-y-1" data-testid="daftar-kontak">
            {kontak.map((k) => (
              <li key={k.contactId}>
                <label className={cn('flex flex-wrap items-center gap-2 text-sm', k.layak ? 'text-text-primary cursor-pointer' : 'text-text-secondary')}>
                  <input type="radio" name="kontak" value={k.contactId} disabled={!k.layak} checked={pilihKontak === k.contactId} onChange={() => setPilihKontak(k.contactId)} data-testid="opsi-kontak" data-contact-id={k.contactId} data-layak={k.layak ? '1' : '0'} />
                  <span className="font-mono">{k.penerimaTersamar}</span>
                  <span className="text-[11px] font-mono">{k.partyType} · {k.bahasa}</span>
                  <span className={cn('text-[11px]', k.layak ? 'text-status-success' : 'text-status-danger')} data-testid="alasan-kontak">
                    {k.layak ? t.eligible : `${t.notEligible}: ${jelaskan(k.alasan, lang)}`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" className={btnUtama} disabled={busy || !pilihSinyal || !pilihKontak} onClick={() => void buat()} data-testid="tombol-buat-draft">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} {t.create}
      </button>
      {hasil && <p role="status" className="text-sm text-text-primary" data-testid="hasil-draft">{hasil}</p>}
      {error && <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger" data-testid="galat-draft">{error}</p>}
    </section>
  )
}

export function ClientMessageList() {
  const t = useT(STR)
  const { lang } = useLang()
  const [rows, setRows] = useState<RingkasanPesan[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [state, setState] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState(false)

  const load = useCallback(
    async (lanjut: string | null) => {
      setLoading(true)
      setError('')
      const q = new URLSearchParams({ take: '20' })
      if (state) q.set('state', state)
      if (lanjut) q.set('cursor', lanjut)
      const r = await panggilApi<{ data: Halaman<RingkasanPesan> }>(`?${q.toString()}`)
      if (r.ok) {
        setRows((lama) => (lanjut ? [...lama, ...r.data.data.items] : r.data.data.items))
        setCursor(r.data.data.nextCursor)
      } else {
        setError(pesanGalat(r, lang))
      }
      setLoading(false)
    },
    [state, lang],
  )

  useEffect(() => {
    void load(null)
  }, [load])

  return (
    <div className="space-y-4">
      <BelumDikirimBanner lang={lang} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
          {t.state}
          <select className={selectCls} value={state} onChange={(e) => setState(e.target.value)} data-testid="filter-state">
            <option value="">{t.all}</option>
            {STATUS_PESAN.map((s) => (
              <option key={s} value={s}>{LABEL_STATE[lang][s]}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void load(null)} disabled={loading} className={btnKedua}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
        <button type="button" onClick={() => setPanel((p) => !p)} className={btnUtama} aria-expanded={panel} data-testid="tombol-panel-draft">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {panel ? t.closeDraft : t.newDraft}
        </button>
      </div>

      {panel && <PanelDraft lang={lang} t={t} />}

      {error && (
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger" data-testid="galat-daftar">{error}</p>
      )}

      {loading && rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
      ) : rows.length === 0 && !error ? (
        <p className="rounded border border-dashed border-border-muted px-4 py-8 text-center text-sm text-text-secondary" data-testid="daftar-kosong">{t.empty}</p>
      ) : (
        <ul className="space-y-3" data-testid="daftar-pesan">
          {rows.map((m) => (
            <li key={m.id} className="rounded-lg border border-card-border bg-surface/30 p-4 min-w-0" data-testid="baris-pesan" data-message-id={m.id} data-state={m.state}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{LABEL_KELUARGA[lang][m.konteks.keluarga ?? ''] ?? m.konteks.keluarga ?? '—'}</span>
                <StateBadge state={m.state} lang={lang} />
                <span className="text-[11px] font-mono text-text-secondary">{t.revision} {m.revision}</span>
              </div>
              <p className="mt-2 text-[11px] font-mono text-text-secondary break-words">
                {`${t.recipient} ${m.penerimaTersamar} · ${m.partyType} · ${m.language} · ${t.created} ${fmtWaktu(m.createdAt, lang)}`}
                {m.approval ? ` · ${t.approval} ${m.approval.status}${m.approval.expiresAt ? ` (${t.expires} ${fmtWaktu(m.approval.expiresAt, lang)})` : ''}` : ''}
              </p>
              {m.reasonCode && <p className="mt-1 text-xs text-text-secondary">{jelaskan(m.reasonCode, lang)}</p>}
              <Link href={`${RUTE_PESAN_KLIEN}/${encodeURIComponent(m.id)}`} className={cn(btnUtama, 'mt-3')} data-testid="buka-pesan">{t.open}</Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button type="button" onClick={() => void load(cursor)} disabled={loading} className={btnKedua} data-testid="muat-lebih">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} {t.more}
        </button>
      )}
    </div>
  )
}
