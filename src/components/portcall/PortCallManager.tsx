'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Ship, Anchor, FileText, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PORTCALL_STATUS, STATUS_LABEL, type PortCallStatusStr } from '@/lib/portcalls'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const DOC_LINKS = [
  { path: '/finance/epda/baru', label: 'EPDA — Estimasi (proforma)' },
  { path: '/finance/fpda/baru', label: 'FPDA — Final disbursement' },
  { path: '/finance/invoice/baru', label: 'Invoice — Tagihan jasa' },
  { path: '/finance/bdn/baru', label: 'BDN — Bunker delivery note' },
  { path: '/dokumen/new/FAL_1', label: 'General Declaration — FAL 1' },
  { path: '/dokumen/new/NOR', label: 'NOR — Notice of Readiness' },
  { path: '/dokumen/new/SOF', label: 'SOF — Statement of Facts' },
  { path: '/dokumen/new/FAL_5', label: 'Crew List — FAL 5' },
  { path: '/dokumen/new/FAL_3', label: "Ship's Stores — FAL 3" },
] as const

export type VesselOption = {
  id: string
  name: string
  imoNumber: string | null
  flag: string | null
  vesselType: string | null
  gt: number | null
  nrt: number | null
  loa: number | null
  maxDraft: number | null
}
export type PrincipalOption = { id: string; name: string }

export type PortCallRow = {
  id: string
  vesselId: string
  principalId: string | null
  port: string
  portCode: string | null
  eta: string | null
  etd: string | null
  cargo: string | null
  cargoQty: string | null
  cargoUnit: string | null
  status: PortCallStatusStr
  notes: string | null
  vessel: { id: string; name: string } | null
  principal: { id: string; name: string } | null
}

type FormState = Record<string, string>

const FIELD_KEYS = [
  'vesselId', 'principalId', 'port', 'portCode', 'eta', 'etd',
  'cargo', 'cargoQty', 'cargoUnit', 'status', 'notes',
] as const

const emptyForm = (): FormState => ({
  vesselId: '', principalId: '', port: '', portCode: '', eta: '', etd: '',
  cargo: '', cargoQty: '', cargoUnit: '', status: 'UPCOMING', notes: '',
})

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'))

const STATUS_CLS: Record<PortCallStatusStr, string> = {
  UPCOMING: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  IN_PORT: 'bg-accent-teal/10 text-accent-teal border-accent-teal/20',
  DEPARTED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CANCELLED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function PortCallManager({
  portCalls,
  vessels,
  principals,
}: {
  portCalls: PortCallRow[]
  vessels: VesselOption[]
  principals: PrincipalOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PortCallRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const noVessels = vessels.length === 0

  // Kapal terpilih → partikular auto tampil (inti "isi sekali").
  const selectedVessel = useMemo(
    () => vessels.find((v) => v.id === form.vesselId) ?? null,
    [vessels, form.vesselId]
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }
  function openEdit(pc: PortCallRow) {
    setEditing(pc)
    setForm({
      vesselId: pc.vesselId,
      principalId: pc.principalId ?? '',
      port: pc.port,
      portCode: pc.portCode ?? '',
      eta: toDateInput(pc.eta),
      etd: toDateInput(pc.etd),
      cargo: pc.cargo ?? '',
      cargoQty: pc.cargoQty ?? '',
      cargoUnit: pc.cargoUnit ?? '',
      status: pc.status,
      notes: pc.notes ?? '',
    })
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.vesselId) return setError('Kapal wajib dipilih.')
    if (!form.port.trim()) return setError('Pelabuhan wajib diisi.')
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/portcalls/${editing.id}` : '/api/portcalls', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError((await res.text()) || 'Gagal menyimpan.')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(pc: PortCallRow) {
    if (!confirm(`Hapus port call ${pc.vessel?.name ?? ''} di ${pc.port}?`)) return
    setDeletingId(pc.id)
    try {
      const res = await fetch(`/api/portcalls/${pc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert((await res.text()) || 'Gagal menghapus.')
        return
      }
      router.refresh()
    } catch {
      alert('Gagal terhubung ke server.')
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
          disabled={noVessels}
          title={noVessels ? 'Tambah kapal dulu di Database Kapal' : undefined}
          className="inline-flex items-center gap-2 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Buat Port Call
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {portCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Anchor className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">Belum ada port call</p>
              <p className="text-text-secondary text-xs mt-1 max-w-sm">
                {noVessels
                  ? 'Tambah data kapal dulu di Database Kapal, lalu buat port call — partikular kapal akan terisi otomatis.'
                  : 'Buat port call: pilih kapal & principal sekali, partikular kapal terisi otomatis untuk semua dokumen.'}
              </p>
            </div>
            {noVessels ? (
              <Link
                href="/settings/vessels"
                className="inline-flex items-center gap-2 mt-1 border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                <Ship className="w-4 h-4" /> Ke Database Kapal
              </Link>
            ) : (
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 mt-1 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Buat Port Call
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">Kapal</th>
                  <th className="px-5 py-3 font-medium">Principal</th>
                  <th className="px-5 py-3 font-medium">Port</th>
                  <th className="px-5 py-3 font-medium">ETA</th>
                  <th className="px-5 py-3 font-medium">ETD</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {portCalls.map((pc, i) => (
                  <tr
                    key={pc.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < portCalls.length - 1 && 'border-b border-card-border/50'
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{pc.vessel?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{pc.principal?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">
                      {pc.port}
                      {pc.portCode ? <span className="text-text-secondary/50"> ({pc.portCode})</span> : null}
                    </td>
                    <td className="px-5 py-4 font-mono text-text-primary">{fmtDate(pc.eta)}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{fmtDate(pc.etd)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 rounded text-xs font-mono border uppercase tracking-wider',
                          STATUS_CLS[pc.status]
                        )}
                      >
                        {STATUS_LABEL[pc.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title="Buat dokumen dari port call ini"
                              className="inline-flex items-center gap-1 rounded border border-border-muted px-2 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" /> Dokumen
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs">
                              Buat dari {pc.vessel?.name ?? 'port call'}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {DOC_LINKS.map((d) => (
                              <DropdownMenuItem
                                key={d.path}
                                onClick={() => router.push(`${d.path}?portcall=${pc.id}`)}
                                className="cursor-pointer text-sm"
                              >
                                {d.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          type="button"
                          onClick={() => openEdit(pc)}
                          title="Ubah"
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(pc)}
                          disabled={deletingId === pc.id}
                          title="Hapus"
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === pc.id ? (
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
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-white">
              {editing ? 'Ubah Port Call' : 'Buat Port Call'}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Pilih kapal &amp; principal sekali — partikular kapal otomatis dipakai untuk semua dokumen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Kapal <span className="text-status-danger">*</span>
              </label>
              <select
                name="vesselId"
                value={form.vesselId}
                onChange={(e) => set('vesselId', e.target.value)}
                className={inputCls}
              >
                <option value="" className="bg-surface">— pilih kapal —</option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id} className="bg-surface text-text-primary">
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Principal</label>
              <select
                name="principalId"
                value={form.principalId}
                onChange={(e) => set('principalId', e.target.value)}
                className={inputCls}
              >
                <option value="" className="bg-surface">— tanpa principal —</option>
                {principals.map((p) => (
                  <option key={p.id} value={p.id} className="bg-surface text-text-primary">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Partikular kapal otomatis — bukti "isi sekali, dipakai di mana-mana" */}
          {selectedVessel && (
            <div className="rounded-md border border-accent-blue/30 bg-accent-blue/5 px-3 py-2.5">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue mb-1.5">
                Partikular kapal (otomatis)
              </p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-text-secondary">
                <span>IMO: <span className="text-text-primary">{selectedVessel.imoNumber ?? '—'}</span></span>
                <span>Bendera: <span className="text-text-primary">{selectedVessel.flag ?? '—'}</span></span>
                <span>Tipe: <span className="text-text-primary">{selectedVessel.vesselType ?? '—'}</span></span>
                <span>GT: <span className="text-text-primary">{num(selectedVessel.gt)}</span></span>
                <span>NRT: <span className="text-text-primary">{num(selectedVessel.nrt)}</span></span>
                <span>LOA: <span className="text-text-primary">{num(selectedVessel.loa)}</span> · Draft: <span className="text-text-primary">{num(selectedVessel.maxDraft)}</span></span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Pelabuhan <span className="text-status-danger">*</span>
              </label>
              <input
                name="port"
                value={form.port}
                onChange={(e) => set('port', e.target.value)}
                placeholder="Tanjung Priok"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Kode Port (UN/LOCODE)</label>
              <input
                name="portCode"
                value={form.portCode}
                onChange={(e) => set('portCode', e.target.value)}
                placeholder="IDTPP"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>ETA</label>
              <input name="eta" type="date" value={form.eta} onChange={(e) => set('eta', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>ETD</label>
              <input name="etd" type="date" value={form.etd} onChange={(e) => set('etd', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Kargo</label>
              <input
                name="cargo"
                value={form.cargo}
                onChange={(e) => set('cargo', e.target.value)}
                placeholder="Coal / CPO / Container"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Jumlah</label>
                <input
                  name="cargoQty"
                  value={form.cargoQty}
                  onChange={(e) => set('cargoQty', e.target.value)}
                  placeholder="50000"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Satuan</label>
                <input
                  name="cargoUnit"
                  value={form.cargoUnit}
                  onChange={(e) => set('cargoUnit', e.target.value)}
                  placeholder="MT"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                name="status"
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className={inputCls}
              >
                {PORTCALL_STATUS.map((s) => (
                  <option key={s} value={s} className="bg-surface text-text-primary">
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Catatan</label>
              <input
                name="notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Catatan operasional (opsional)"
                className={inputCls}
              />
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
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-[#2E86DE] hover:bg-accent-blue text-white transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Simpan Perubahan' : 'Buat Port Call'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
