'use client'

// Voyage Workspace — "folder digital" satu pelayaran. Satu halaman, tiga bagian:
// kontrol lifecycle, particulars (bisa diubah), lalu tab isi voyage (cargo,
// port call, finansial). UI baru: belum ada polanya di app A (lihat ROADMAP-v2 §6).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Anchor, Loader2, Pencil, Sparkles, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import { AssistantPanel } from '@/components/ai/AssistantPanel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  VOYAGE_LIFECYCLE,
  VOYAGE_STATUSES,
  VOYAGE_STATUS_COLOR,
  nextVoyageStatus,
  type VoyageStatusStr,
} from './voyage-status'
import { VoyageCargoPanel, type CargoRow } from './VoyageCargoPanel'
import { VoyagePortCallPanel, type VoyagePortCallRow } from './VoyagePortCallPanel'
import { VoyageFinancePanel, type VoyageFinanceCounts } from './VoyageFinancePanel'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    lifecycle: 'Tahapan', statusNow: 'Status sekarang', advance: 'Lanjut ke', jump: 'Ubah status',
    cancelled: 'Voyage ini dibatalkan. Ubah status untuk mengaktifkan kembali.',
    closed: 'Tahap terakhir — voyage sudah ditutup.',
    confirmCancel: 'Batalkan voyage ini? Status berubah ke CANCELLED (data tidak dihapus).',
    errStatus: 'Gagal mengubah status.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    errVesselReq: 'Kapal wajib dipilih.',
    particulars: 'Particulars', edit: 'Ubah',
    fVessel: 'Kapal', fImo: 'IMO', fPrincipal: 'Principal', fCustomer: 'Customer (ditagih)', fPort: 'Pelabuhan',
    fAgencyType: 'Tipe Agency', fCurrency: 'Mata Uang Dasar', fNotes: 'Catatan',
    fEta: 'ETA', fEtb: 'ETB', fEtc: 'ETC', fEtd: 'ETD', fAta: 'ATA', fAtb: 'ATB', fAtd: 'ATD',
    estimasi: 'Estimasi', aktual: 'Aktual',
    dialogTitle: 'Ubah Particulars Voyage',
    dialogDesc: 'Nomor voyage tidak bisa diubah — sudah dipakai sebagai rujukan di dokumen.',
    selVessel: '— pilih kapal —', selNone: '— tanpa —', cancel: 'Batal', save: 'Simpan Perubahan',
    tabCargo: 'Cargo', tabPortCall: 'Port Call', tabFinance: 'Finansial',
    assistant: 'Asisten',
  },
  en: {
    lifecycle: 'Stages', statusNow: 'Current status', advance: 'Advance to', jump: 'Change status',
    cancelled: 'This voyage is cancelled. Change the status to reactivate it.',
    closed: 'Final stage — this voyage is closed.',
    confirmCancel: 'Cancel this voyage? Status becomes CANCELLED (no data is deleted).',
    errStatus: 'Failed to change status.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
    errVesselReq: 'A vessel must be selected.',
    particulars: 'Particulars', edit: 'Edit',
    fVessel: 'Vessel', fImo: 'IMO', fPrincipal: 'Principal', fCustomer: 'Customer (billed)', fPort: 'Port',
    fAgencyType: 'Agency Type', fCurrency: 'Base Currency', fNotes: 'Notes',
    fEta: 'ETA', fEtb: 'ETB', fEtc: 'ETC', fEtd: 'ETD', fAta: 'ATA', fAtb: 'ATB', fAtd: 'ATD',
    estimasi: 'Estimated', aktual: 'Actual',
    dialogTitle: 'Edit Voyage Particulars',
    dialogDesc: 'The voyage number cannot be changed — it is already referenced by documents.',
    selVessel: '— select vessel —', selNone: '— none —', cancel: 'Cancel', save: 'Save changes',
    tabCargo: 'Cargo', tabPortCall: 'Port Calls', tabFinance: 'Financial',
    assistant: 'Assistant',
  },
}

export type WorkspaceVoyage = {
  id: string
  voyageNumber: string
  status: VoyageStatusStr
  vesselId: string
  principalId: string | null
  customerId: string | null
  portId: string | null
  agencyType: string | null
  baseCurrency: string
  notes: string | null
  eta: string | Date | null
  etb: string | Date | null
  etc: string | Date | null
  etd: string | Date | null
  ata: string | Date | null
  atb: string | Date | null
  atd: string | Date | null
  vessel: { id: string; name: string; imoNumber: string | null } | null
  principal: { id: string; name: string } | null
  customer: { id: string; name: string } | null
  port: { id: string; name: string; unlocode: string | null } | null
  cargoes: CargoRow[]
  portCalls: VoyagePortCallRow[]
}

type Option = { id: string; name: string }

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

const toDateInput = (d: string | Date | null) => {
  if (!d) return ''
  const v = new Date(d)
  return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
}
const fmtDate = (d: string | Date | null) => {
  if (!d) return '—'
  const v = new Date(d)
  return Number.isNaN(v.getTime())
    ? '—'
    : v.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const TABS = ['cargo', 'portcall', 'finance'] as const
type TabKey = (typeof TABS)[number]

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{label}</p>
      <p className="text-text-primary text-sm">{value}</p>
    </div>
  )
}

export function VoyageWorkspace({
  voyage, counts, vessels, principals, customers, ports,
}: {
  voyage: WorkspaceVoyage
  counts: VoyageFinanceCounts
  vessels: Option[]
  principals: Option[]
  customers: Option[]
  ports: Option[]
}) {
  const t = useT(STR)
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('cargo')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusErr, setStatusErr] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)

  const [form, setForm] = useState(() => particularsForm(voyage))
  const set = (k: keyof ReturnType<typeof particularsForm>, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const next = nextVoyageStatus(voyage.status)
  const curIdx = (VOYAGE_LIFECYCLE as readonly VoyageStatusStr[]).indexOf(voyage.status)

  async function changeStatus(target: string) {
    if (!target || target === voyage.status) return
    if (target === 'CANCELLED' && !confirm(t.confirmCancel)) return
    setStatusBusy(true)
    setStatusErr('')
    try {
      const res = await fetch(`/api/voyages/${voyage.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setStatusErr(body?.error?.message ?? t.errStatus)
        return
      }
      router.refresh()
    } catch {
      setStatusErr(t.errConn)
    } finally {
      setStatusBusy(false)
    }
  }

  function openEdit() {
    setForm(particularsForm(voyage))
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.vesselId) {
      setError(t.errVesselReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      // PATCH /api/voyages/:id membaca SELURUH field (voyage.service → bacaInput):
      // yang tidak dikirim menjadi null, dan `status` yang kosong jatuh ke default
      // PLANNED. Karena itu status sekarang ikut dikirim, bukan cuma field form.
      const res = await fetch(`/api/voyages/${voyage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status: voyage.status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  const tabLabel: Record<TabKey, string> = { cargo: t.tabCargo, portcall: t.tabPortCall, finance: t.tabFinance }
  const tabIcon = { cargo: Boxes, portcall: Anchor, finance: Wallet }
  const tabCount: Record<TabKey, number | null> = {
    cargo: voyage.cargoes.length,
    portcall: voyage.portCalls.length,
    finance: null,
  }

  return (
    <>
      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className={labelCls}>{t.statusNow}</p>
            <span
              className={cn(
                'inline-flex text-[11px] px-2.5 py-1 rounded-full border font-mono uppercase tracking-wider',
                VOYAGE_STATUS_COLOR[voyage.status],
              )}
            >
              {voyage.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> {t.assistant}
            </button>
            {next && (
              <button
                type="button"
                onClick={() => changeStatus(next)}
                disabled={statusBusy}
                className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {statusBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t.advance} {next}
              </button>
            )}
            <div>
              <label className="sr-only" htmlFor="voyage-status-jump">{t.jump}</label>
              <select
                id="voyage-status-jump"
                value={voyage.status}
                onChange={(e) => changeStatus(e.target.value)}
                disabled={statusBusy}
                title={t.jump}
                className={inputCls + ' py-1.5 text-xs font-mono'}
              >
                {VOYAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <p className={labelCls}>{t.lifecycle}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {VOYAGE_LIFECYCLE.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors',
                  voyage.status === s
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40'
                    : curIdx > -1 && i < curIdx
                      ? 'bg-status-success/8 text-status-success/80 border-status-success/25'
                      : 'bg-surface/40 text-text-secondary/60 border-card-border/60',
                )}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {voyage.status === 'CANCELLED' && (
          <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
            {t.cancelled}
          </p>
        )}
        {voyage.status === 'CLOSED' && (
          <p className="text-text-secondary text-xs bg-surface/40 border border-card-border/60 rounded px-3 py-2">
            {t.closed}
          </p>
        )}
        {statusErr && (
          <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
            {statusErr}
          </p>
        )}
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-white text-sm">{t.particulars}</h2>
          <button
            type="button"
            onClick={openEdit}
            className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> {t.edit}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label={t.fVessel} value={voyage.vessel?.name ?? '—'} />
          <Field label={t.fImo} value={voyage.vessel?.imoNumber ?? '—'} />
          <Field label={t.fPrincipal} value={voyage.principal?.name ?? '—'} />
          <Field label={t.fCustomer} value={voyage.customer?.name ?? '—'} />
          <Field
            label={t.fPort}
            value={
              voyage.port ? `${voyage.port.name}${voyage.port.unlocode ? ` (${voyage.port.unlocode})` : ''}` : '—'
            }
          />
          <Field label={t.fAgencyType} value={voyage.agencyType ?? '—'} />
          <Field label={t.fCurrency} value={voyage.baseCurrency} />
          <Field label={t.fNotes} value={voyage.notes ?? '—'} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-card-border/60 bg-surface/30 px-3.5 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-2">{t.estimasi}</p>
            <div className="grid grid-cols-4 gap-3">
              <Field label={t.fEta} value={fmtDate(voyage.eta)} />
              <Field label={t.fEtb} value={fmtDate(voyage.etb)} />
              <Field label={t.fEtc} value={fmtDate(voyage.etc)} />
              <Field label={t.fEtd} value={fmtDate(voyage.etd)} />
            </div>
          </div>
          <div className="rounded-md border border-card-border/60 bg-surface/30 px-3.5 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-2">{t.aktual}</p>
            <div className="grid grid-cols-4 gap-3">
              <Field label={t.fAta} value={fmtDate(voyage.ata)} />
              <Field label={t.fAtb} value={fmtDate(voyage.atb)} />
              <Field label={t.fAtd} value={fmtDate(voyage.atd)} />
              <div />
            </div>
          </div>
        </div>
      </section>

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
                {tabCount[k] !== null && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[9px] border',
                      on ? 'border-accent-blue/40 bg-accent-blue/10' : 'border-card-border text-text-secondary',
                    )}
                  >
                    {tabCount[k]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {tab === 'cargo' && <VoyageCargoPanel voyageId={voyage.id} cargoes={voyage.cargoes} />}
          {tab === 'portcall' && <VoyagePortCallPanel voyageId={voyage.id} portCalls={voyage.portCalls} />}
          {tab === 'finance' && <VoyageFinancePanel voyageId={voyage.id} counts={counts} portId={voyage.portId} />}
        </div>
      </section>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-white">{t.dialogTitle}</DialogTitle>
            <DialogDescription className="text-text-secondary">{t.dialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {t.fVessel} <span className="text-status-danger">*</span>
              </label>
              <select value={form.vesselId} onChange={(e) => set('vesselId', e.target.value)} className={inputCls}>
                <option value="">{t.selVessel}</option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fPrincipal}</label>
              <select value={form.principalId} onChange={(e) => set('principalId', e.target.value)} className={inputCls}>
                <option value="">{t.selNone}</option>
                {principals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fCustomer}</label>
              <select value={form.customerId} onChange={(e) => set('customerId', e.target.value)} className={inputCls}>
                <option value="">{t.selNone}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fPort}</label>
              <select value={form.portId} onChange={(e) => set('portId', e.target.value)} className={inputCls}>
                <option value="">{t.selNone}</option>
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fAgencyType}</label>
              <input
                value={form.agencyType}
                onChange={(e) => set('agencyType', e.target.value)}
                placeholder="FULL / PROTECTIVE / HUSBANDRY"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fCurrency}</label>
              <input
                value={form.baseCurrency}
                onChange={(e) => set('baseCurrency', e.target.value)}
                placeholder="IDR"
                className={inputCls}
              />
            </div>

            <div className="col-span-2 grid grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>{t.fEta}</label>
                <input type="date" value={form.eta} onChange={(e) => set('eta', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fEtb}</label>
                <input type="date" value={form.etb} onChange={(e) => set('etb', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fEtc}</label>
                <input type="date" value={form.etc} onChange={(e) => set('etc', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fEtd}</label>
                <input type="date" value={form.etd} onChange={(e) => set('etd', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fAta}</label>
                <input type="date" value={form.ata} onChange={(e) => set('ata', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fAtb}</label>
                <input type="date" value={form.atb} onChange={(e) => set('atb', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fAtd}</label>
                <input type="date" value={form.atd} onChange={(e) => set('atd', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div className="col-span-2">
              <label className={labelCls}>{t.fNotes}</label>
              <input value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} />
            </div>
          </div>

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.save}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AssistantPanel jenis="VOYAGE" entityId={voyage.id} open={assistantOpen} onOpenChange={setAssistantOpen} />
    </>
  )
}

function particularsForm(v: WorkspaceVoyage) {
  return {
    vesselId: v.vesselId,
    principalId: v.principalId ?? '',
    customerId: v.customerId ?? '',
    portId: v.portId ?? '',
    agencyType: v.agencyType ?? '',
    baseCurrency: v.baseCurrency,
    notes: v.notes ?? '',
    eta: toDateInput(v.eta),
    etb: toDateInput(v.etb),
    etc: toDateInput(v.etc),
    etd: toDateInput(v.etd),
    ata: toDateInput(v.ata),
    atb: toDateInput(v.atb),
    atd: toDateInput(v.atd),
  }
}
