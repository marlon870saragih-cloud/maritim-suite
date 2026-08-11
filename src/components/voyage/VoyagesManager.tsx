'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Ship, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import { VOYAGE_STATUS_COLOR, type VoyageStatusStr } from './voyage-status'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Buat Voyage',
    errVesselReq: 'Kapal wajib dipilih.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus voyage "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada voyage', emptyDesc: 'Voyage = folder digital 1 pelayaran (port call, cargo, EPDA/FDA, invoice terkumpul di sini).',
    thNumber: 'No. Voyage', thVessel: 'Kapal', thPrincipal: 'Principal', thPort: 'Pelabuhan', thStatus: 'Status', thEta: 'ETA', thAction: 'Aksi',
    dialogTitle: 'Buat Voyage Baru', dialogDesc: 'Nomor voyage diterbitkan otomatis (VYG-TAHUN-NNNNNN).',
    fVessel: 'Kapal', selVessel: '— pilih kapal —', fPrincipal: 'Principal', selNone: '— tanpa —',
    fCustomer: 'Customer (ditagih)', fPort: 'Pelabuhan', fAgencyType: 'Tipe Agency', fEta: 'ETA', fEtd: 'ETD', fNotes: 'Catatan',
    tipDelete: 'Hapus', cancel: 'Batal', save: 'Buat Voyage',
  },
  en: {
    addBtn: 'Create Voyage',
    errVesselReq: 'A vessel must be selected.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete voyage "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No voyages yet', emptyDesc: 'A voyage is a digital folder for one call — port call, cargo, EPDA/FDA, invoices all live here.',
    thNumber: 'Voyage No.', thVessel: 'Vessel', thPrincipal: 'Principal', thPort: 'Port', thStatus: 'Status', thEta: 'ETA', thAction: 'Action',
    dialogTitle: 'Create New Voyage', dialogDesc: 'Voyage number is issued automatically (VYG-YEAR-NNNNNN).',
    fVessel: 'Vessel', selVessel: '— select vessel —', fPrincipal: 'Principal', selNone: '— none —',
    fCustomer: 'Customer (billed)', fPort: 'Port', fAgencyType: 'Agency Type', fEta: 'ETA', fEtd: 'ETD', fNotes: 'Notes',
    tipDelete: 'Delete', cancel: 'Cancel', save: 'Create Voyage',
  },
}

export type VoyageRow = {
  id: string
  voyageNumber: string
  status: VoyageStatusStr
  eta: string | Date | null
  vessel: { id: string; name: string; imoNumber: string | null } | null
  principal: { id: string; name: string } | null
  customer: { id: string; name: string } | null
  port: { id: string; name: string; unlocode: string | null } | null
}

type Option = { id: string; name: string }

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function fmtDate(d: string | Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID')
}

export function VoyagesManager({
  voyages, vessels, principals, customers, ports,
}: {
  voyages: VoyageRow[]
  vessels: Option[]
  principals: Option[]
  customers: Option[]
  ports: Option[]
}) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [vesselId, setVesselId] = useState('')
  const [principalId, setPrincipalId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [portId, setPortId] = useState('')
  const [agencyType, setAgencyType] = useState('')
  const [eta, setEta] = useState('')
  const [etd, setEtd] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openAdd() {
    setVesselId(vessels[0]?.id ?? '')
    setPrincipalId('')
    setCustomerId('')
    setPortId('')
    setAgencyType('')
    setEta('')
    setEtd('')
    setNotes('')
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!vesselId) {
      setError(t.errVesselReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/voyages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vesselId, principalId, customerId, portId, agencyType, eta, etd, notes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      const { voyage } = await res.json()
      setOpen(false)
      router.push(`/voyages/${voyage.id}`)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function remove(v: VoyageRow, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`${t.confirmPre}${v.voyageNumber}${t.confirmPost}`)) return
    setDeletingId(v.id)
    try {
      const res = await fetch(`/api/voyages/${v.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error?.message ?? t.errDelete)
        return
      }
      router.refresh()
    } catch {
      alert(t.errConn)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          disabled={vessels.length === 0}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {t.addBtn}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {voyages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Ship className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
              <p className="text-text-secondary text-xs mt-1 max-w-md">{t.emptyDesc}</p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              disabled={vessels.length === 0}
              className="inline-flex items-center gap-2 mt-1 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> {t.addBtn}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">{t.thNumber}</th>
                  <th className="px-5 py-3 font-medium">{t.thVessel}</th>
                  <th className="px-5 py-3 font-medium">{t.thPrincipal}</th>
                  <th className="px-5 py-3 font-medium">{t.thPort}</th>
                  <th className="px-5 py-3 font-medium">{t.thStatus}</th>
                  <th className="px-5 py-3 font-medium">{t.thEta}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {voyages.map((v, i) => (
                  <tr
                    key={v.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < voyages.length - 1 && 'border-b border-card-border/50',
                    )}
                  >
                    <td className="px-5 py-4 font-mono text-text-primary">
                      <Link href={`/voyages/${v.id}`} className="hover:text-accent-blue hover:underline">
                        {v.voyageNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{v.vessel?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.principal?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.port?.name ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider', VOYAGE_STATUS_COLOR[v.status])}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{fmtDate(v.eta)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => remove(v, e)}
                          disabled={deletingId === v.id}
                          title={t.tipDelete}
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === v.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-white">{t.dialogTitle}</DialogTitle>
            <DialogDescription className="text-text-secondary">{t.dialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>
                {t.fVessel} <span className="text-status-danger">*</span>
              </label>
              <select value={vesselId} onChange={(e) => setVesselId(e.target.value)} className={inputCls}>
                <option value="">{t.selVessel}</option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fPrincipal}</label>
              <select value={principalId} onChange={(e) => setPrincipalId(e.target.value)} className={inputCls}>
                <option value="">{t.selNone}</option>
                {principals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fCustomer}</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
                <option value="">{t.selNone}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fPort}</label>
              <select value={portId} onChange={(e) => setPortId(e.target.value)} className={inputCls}>
                <option value="">{t.selNone}</option>
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fAgencyType}</label>
              <input value={agencyType} onChange={(e) => setAgencyType(e.target.value)} placeholder="FULL / PROTECTIVE / HUSBANDRY" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fEta}</label>
              <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fEtd}</label>
              <input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t.fNotes}</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
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
    </>
  )
}
