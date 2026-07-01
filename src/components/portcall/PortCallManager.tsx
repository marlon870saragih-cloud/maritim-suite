'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Ship, Anchor, FileText, ChevronDown, ChevronRight, Eye, Download, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PORTCALL_STATUS, STATUS_LABEL, type PortCallStatusStr } from '@/lib/portcalls'
import type { LinkedDoc } from '@/lib/documents'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    tipNoVessel: 'Tambah kapal dulu di Database Kapal', tipAi: 'Buat Port Call dari instruksi bahasa dengan AI',
    btnAi: 'Buat dengan AI', btnCreate: 'Buat Port Call',
    emptyTitle: 'Belum ada port call',
    emptyNoVessel: 'Tambah data kapal dulu di Database Kapal, lalu buat port call — partikular kapal akan terisi otomatis.',
    emptyHasVessel: 'Buat port call: pilih kapal & principal sekali, partikular kapal terisi otomatis untuk semua dokumen.',
    toVesselDb: 'Ke Database Kapal', thVessel: 'Kapal', thAction: 'Aksi',
    tipViewDocs: 'Lihat dokumen terkait', tipNoDocs: 'Belum ada dokumen', tipMakeDocs: 'Buat dokumen dari port call ini',
    docsBtn: 'Dokumen', makeFromPre: 'Buat dari', tipEdit: 'Ubah', tipDelete: 'Hapus', tipViewPdf: 'Lihat PDF', tipDlPdf: 'Unduh PDF',
    editTitle: 'Ubah Port Call', dialogDesc: 'Pilih kapal & principal sekali — partikular kapal otomatis dipakai untuk semua dokumen.',
    aiTitle: 'Isi dengan AI', aiPlaceholder: 'mis. "MT Soechi Asia dari Soechi Lines tiba di Samarinda 5 Juli, muat MGO 6000 KL"',
    aiOk: 'Form terisi dari AI — silakan review ✓', aiFailGeneric: 'Gagal', aiFailProc: 'Gagal memproses dengan AI', aiFailAdd: 'Gagal menambah ke master data',
    pendVesselPre: 'Kapal “', pendVesselPost: '” belum ada — tambah ke master data', pendPrincPre: 'Principal “', pendPrincPost: '” belum ada — tambah',
    addedVesselPre: 'Kapal "', addedVesselPost: '" ditambahkan ke master data & dipilih ✓ (lengkapi IMO/GT di Database Kapal nanti)',
    addedPrincPre: 'Principal "', addedPrincPost: '" ditambahkan & dipilih ✓',
    fVessel: 'Kapal', selVessel: '— pilih kapal —', selNoPrincipal: '— tanpa principal —',
    particularsTitle: 'Partikular kapal (otomatis)', pFlag: 'Bendera', pType: 'Tipe',
    fPort: 'Pelabuhan', fPortCode: 'Kode Port (UN/LOCODE)', fCargo: 'Kargo', fQty: 'Jumlah', fUnit: 'Satuan', fNotes: 'Catatan', phNotes: 'Catatan operasional (opsional)',
    errVesselReq: 'Kapal wajib dipilih.', errPortReq: 'Pelabuhan wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus port call ', confirmMid: ' di ', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
    st_UPCOMING: 'Akan Datang', st_IN_PORT: 'Di Pelabuhan', st_DEPARTED: 'Berangkat', st_CANCELLED: 'Dibatalkan',
  },
  en: {
    tipNoVessel: 'Add a vessel first in Vessel Database', tipAi: 'Create a Port Call from a plain-language instruction with AI',
    btnAi: 'Create with AI', btnCreate: 'Create Port Call',
    emptyTitle: 'No port calls yet',
    emptyNoVessel: 'Add a vessel first in Vessel Database, then create a port call — vessel particulars fill in automatically.',
    emptyHasVessel: 'Create a port call: pick the vessel & principal once, vessel particulars auto-fill for all documents.',
    toVesselDb: 'Go to Vessel Database', thVessel: 'Vessel', thAction: 'Action',
    tipViewDocs: 'View related documents', tipNoDocs: 'No documents yet', tipMakeDocs: 'Create documents from this port call',
    docsBtn: 'Documents', makeFromPre: 'Create from', tipEdit: 'Edit', tipDelete: 'Delete', tipViewPdf: 'View PDF', tipDlPdf: 'Download PDF',
    editTitle: 'Edit Port Call', dialogDesc: 'Pick the vessel & principal once — vessel particulars auto-apply to all documents.',
    aiTitle: 'Fill with AI', aiPlaceholder: 'e.g. "MT Soechi Asia from Soechi Lines arrives Samarinda Jul 5, loading MGO 6000 KL"',
    aiOk: 'Fields filled by AI — please review ✓', aiFailGeneric: 'Failed', aiFailProc: 'Failed to process with AI', aiFailAdd: 'Failed to add to master data',
    pendVesselPre: 'Vessel “', pendVesselPost: '” not found — add to master data', pendPrincPre: 'Principal “', pendPrincPost: '” not found — add',
    addedVesselPre: 'Vessel "', addedVesselPost: '" added to master data & selected ✓ (complete IMO/GT in Vessel Database later)',
    addedPrincPre: 'Principal "', addedPrincPost: '" added & selected ✓',
    fVessel: 'Vessel', selVessel: '— select vessel —', selNoPrincipal: '— no principal —',
    particularsTitle: 'Vessel particulars (auto)', pFlag: 'Flag', pType: 'Type',
    fPort: 'Port', fPortCode: 'Port Code (UN/LOCODE)', fCargo: 'Cargo', fQty: 'Quantity', fUnit: 'Unit', fNotes: 'Notes', phNotes: 'Operational notes (optional)',
    errVesselReq: 'A vessel must be selected.', errPortReq: 'Port is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete port call ', confirmMid: ' at ', cancel: 'Cancel', saveChanges: 'Save changes',
    st_UPCOMING: 'Upcoming', st_IN_PORT: 'In Port', st_DEPARTED: 'Departed', st_CANCELLED: 'Cancelled',
  },
}
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
  { path: '/dokumen/new/BUNKER_REQUISITION', label: 'Bunker Requisition' },
  { path: '/finance/bdn/baru', label: 'BDN — Bunker delivery note' },
  { path: '/dokumen/new/FAL_1', label: 'General Declaration — FAL 1' },
  { path: '/dokumen/new/NOR', label: 'NOR — Notice of Readiness' },
  { path: '/dokumen/new/SOF', label: 'SOF — Statement of Facts' },
  { path: '/dokumen/new/ARRIVAL_REPORT', label: 'Arrival Report' },
  { path: '/dokumen/new/DEPARTURE_REPORT', label: 'Departure Report' },
  { path: '/dokumen/new/DAMAGE_REPORT', label: 'Damage / Survey Report' },
  { path: '/dokumen/new/ULLAGE_REPORT', label: 'Ullage Report' },
  { path: '/dokumen/new/LETTER_OF_PROTEST', label: 'Letter of Protest' },
  { path: '/dokumen/new/NOTE_OF_PROTEST', label: 'Note of Protest (Sea Protest)' },
  { path: '/dokumen/new/CREW_CHANGE_NOTICE', label: 'Crew Change Notice' },
  { path: '/dokumen/new/PORT_CALL_SUMMARY', label: 'Port Call Summary' },
  { path: '/dokumen/new/TIME_SHEET', label: 'Time Sheet (Laytime)' },
  { path: '/dokumen/new/FAL_5', label: 'Crew List — FAL 5' },
  { path: '/dokumen/new/FAL_3', label: "Ship's Stores — FAL 3" },
  { path: '/dokumen/new/FAL_2', label: 'Cargo Declaration — FAL 2' },
  { path: '/dokumen/new/AGENCY_APPOINTMENT', label: 'Agency Appointment' },
  { path: '/finance/spk/baru', label: 'SPK — Surat Penunjukan Sub-Agen' },
  { path: '/dokumen/new/LETTER_OF_INDEMNITY', label: 'Letter of Indemnity' },
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
  documents: LinkedDoc[]
}

type FormState = Record<string, string>

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
  const t = useT(STR)
  const stLabel = (s: PortCallStatusStr) => t['st_' + s] ?? STATUS_LABEL[s]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PortCallRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [aiErr, setAiErr] = useState('')
  // Master data yang ditambahkan via AI dalam sesi ini (digabung ke dropdown).
  const [extraVessels, setExtraVessels] = useState<VesselOption[]>([])
  const [extraPrincipals, setExtraPrincipals] = useState<PrincipalOption[]>([])
  // Nama yang AI sebut tapi belum ada di master data → tawarkan "Tambah".
  const [pendingVessel, setPendingVessel] = useState('')
  const [pendingPrincipal, setPendingPrincipal] = useState('')
  const [addingMaster, setAddingMaster] = useState<'vessel' | 'principal' | null>(null)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const allVessels = useMemo(() => [...vessels, ...extraVessels], [vessels, extraVessels])
  const allPrincipals = useMemo(() => [...principals, ...extraPrincipals], [principals, extraPrincipals])
  const noVessels = allVessels.length === 0

  // Kapal terpilih → partikular auto tampil (inti "isi sekali").
  const selectedVessel = useMemo(
    () => allVessels.find((v) => v.id === form.vesselId) ?? null,
    [allVessels, form.vesselId]
  )

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setAiText('')
    setAiNote('')
    setAiErr('')
    setPendingVessel('')
    setPendingPrincipal('')
    setOpen(true)
  }

  // Pintu ngobrol: AI mengisi form Port Call dari instruksi + cocokkan kapal/principal
  // ke master data (jadi ID). Hasilnya untuk Anda review sebelum simpan.
  async function runAi() {
    if (!aiText.trim()) return
    setAiBusy(true)
    setAiErr('')
    setAiNote('')
    try {
      const res = await fetch('/api/ai/portcall/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiText }),
      })
      if (!res.ok) throw new Error((await res.text()) || t.aiFailGeneric)
      const { form: f, match } = (await res.json()) as {
        form: Record<string, string>
        match: { vessel: { name: string; matched: boolean }; principal: { name: string; matched: boolean } }
      }
      setForm((p) => ({ ...p, ...f, status: p.status || 'UPCOMING' }))
      // Nama yang tak cocok → tawarkan tambah ke master data (lihat tombol di bawah).
      setPendingVessel(match.vessel.name && !match.vessel.matched ? match.vessel.name : '')
      setPendingPrincipal(match.principal.name && !match.principal.matched ? match.principal.name : '')
      setAiNote(t.aiOk)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : t.aiFailProc)
    } finally {
      setAiBusy(false)
    }
  }

  // Tambah kapal/principal yang AI sebut tapi belum ada → buat record + pilih di form.
  async function addMaster(kind: 'vessel' | 'principal') {
    const name = kind === 'vessel' ? pendingVessel : pendingPrincipal
    if (!name) return
    setAddingMaster(kind)
    setAiErr('')
    try {
      const res = await fetch(kind === 'vessel' ? '/api/vessels' : '/api/principals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error((await res.text()) || t.aiFailGeneric)
      const json = (await res.json()) as { vessel?: VesselOption; principal?: PrincipalOption }
      if (kind === 'vessel' && json.vessel) {
        setExtraVessels((p) => [...p, json.vessel!])
        setForm((p) => ({ ...p, vesselId: json.vessel!.id }))
        setPendingVessel('')
        setAiNote(`${t.addedVesselPre}${name}${t.addedVesselPost}`)
      } else if (kind === 'principal' && json.principal) {
        setExtraPrincipals((p) => [...p, json.principal!])
        setForm((p) => ({ ...p, principalId: json.principal!.id }))
        setPendingPrincipal('')
        setAiNote(`${t.addedPrincPre}${name}${t.addedPrincPost}`)
      }
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : t.aiFailAdd)
    } finally {
      setAddingMaster(null)
    }
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
    if (!form.vesselId) return setError(t.errVesselReq)
    if (!form.port.trim()) return setError(t.errPortReq)
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/portcalls/${editing.id}` : '/api/portcalls', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError((await res.text()) || t.errSave)
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

  async function remove(pc: PortCallRow) {
    if (!confirm(`${t.confirmPre}${pc.vessel?.name ?? ''}${t.confirmMid}${pc.port}?`)) return
    setDeletingId(pc.id)
    try {
      const res = await fetch(`/api/portcalls/${pc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert((await res.text()) || t.errDelete)
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
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={openAdd}
          disabled={noVessels}
          title={noVessels ? t.tipNoVessel : t.tipAi}
          className="inline-flex items-center gap-2 bg-accent-purple/15 border border-accent-purple/40 hover:bg-accent-purple/25 text-white rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 text-accent-purple" /> {t.btnAi}
        </button>
        <button
          type="button"
          onClick={openAdd}
          disabled={noVessels}
          title={noVessels ? t.tipNoVessel : undefined}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> {t.btnCreate}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {portCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Anchor className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
              <p className="text-text-secondary text-xs mt-1 max-w-sm">
                {noVessels ? t.emptyNoVessel : t.emptyHasVessel}
              </p>
            </div>
            {noVessels ? (
              <Link
                href="/settings/vessels"
                className="inline-flex items-center gap-2 mt-1 border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                <Ship className="w-4 h-4" /> {t.toVesselDb}
              </Link>
            ) : (
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 mt-1 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> {t.btnCreate}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">{t.thVessel}</th>
                  <th className="px-5 py-3 font-medium">Principal</th>
                  <th className="px-5 py-3 font-medium">Port</th>
                  <th className="px-5 py-3 font-medium">ETA</th>
                  <th className="px-5 py-3 font-medium">ETD</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {portCalls.map((pc, i) => (
                  <Fragment key={pc.id}>
                  <tr
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      expandedId !== pc.id && i < portCalls.length - 1 && 'border-b border-card-border/50'
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">
                      <button
                        type="button"
                        onClick={() => setExpandedId((id) => (id === pc.id ? null : pc.id))}
                        title={pc.documents.length ? t.tipViewDocs : t.tipNoDocs}
                        className="inline-flex items-center gap-2 text-left hover:text-accent-blue transition-colors"
                      >
                        {pc.documents.length > 0 ? (
                          <ChevronRight
                            className={cn('w-4 h-4 shrink-0 text-text-secondary transition-transform', expandedId === pc.id && 'rotate-90 text-accent-blue')}
                          />
                        ) : (
                          <span className="w-4 h-4 shrink-0" />
                        )}
                        <span>{pc.vessel?.name ?? '—'}</span>
                        {pc.documents.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 text-[10px] font-mono">
                            <FileText className="w-3 h-3" /> {pc.documents.length}
                          </span>
                        )}
                      </button>
                    </td>
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
                        {stLabel(pc.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title={t.tipMakeDocs}
                              className="inline-flex items-center gap-1 rounded border border-border-muted px-2 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" /> {t.docsBtn}
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs">
                              {t.makeFromPre} {pc.vessel?.name ?? 'port call'}
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
                          title={t.tipEdit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(pc)}
                          disabled={deletingId === pc.id}
                          title={t.tipDelete}
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
                  {expandedId === pc.id && pc.documents.length > 0 && (
                    <tr className={cn(i < portCalls.length - 1 && 'border-b border-card-border/50')}>
                      <td colSpan={7} className="px-5 pb-4 pt-0 bg-surface/30">
                        <div className="rounded-md border border-card-border/60 divide-y divide-card-border/40">
                          {pc.documents.map((d) => (
                            <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                              <span className="font-mono text-[10px] uppercase tracking-wider text-accent-blue w-36 shrink-0">{d.label}</span>
                              <span className="text-text-primary truncate flex-1">{d.docNumber}</span>
                              <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">{d.status}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                {d.viewHref && (
                                  <a href={d.viewHref} target="_blank" rel="noopener noreferrer" title={t.tipViewPdf}
                                    className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors">
                                    <Eye className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {d.viewHref && (
                                  <a href={`${d.viewHref}&download=1`} title={t.tipDlPdf}
                                    className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors">
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {d.editHref && (
                                  <Link href={d.editHref} title={t.tipEdit}
                                    className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
              {editing ? t.editTitle : t.btnCreate}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              {t.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <section className="rounded-md border border-accent-purple/30 bg-accent-purple/5 px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-accent-purple" />
                <span className="text-sm font-medium text-white">{t.aiTitle}</span>
                <span className="text-[9px] font-mono uppercase tracking-wider text-accent-purple/70 ml-auto">
                  Haiku · OpenRouter
                </span>
              </div>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={2}
                placeholder={t.aiPlaceholder}
                className={inputCls + ' resize-none'}
              />
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={runAi}
                  disabled={aiBusy || !aiText.trim()}
                  className="inline-flex items-center gap-1.5 bg-accent-purple/90 hover:bg-accent-purple text-white
                             rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {t.aiTitle}
                </button>
                {aiNote && <span className="text-[11px] text-text-secondary">{aiNote}</span>}
                {aiErr && <span className="text-[11px] text-status-danger">{aiErr}</span>}
              </div>

              {(pendingVessel || pendingPrincipal) && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {pendingVessel && (
                    <button
                      type="button"
                      onClick={() => addMaster('vessel')}
                      disabled={addingMaster !== null}
                      className="inline-flex items-center gap-1.5 border border-accent-amber/40 text-accent-amber
                                 hover:bg-accent-amber/10 rounded px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50"
                    >
                      {addingMaster === 'vessel' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      {t.pendVesselPre}{pendingVessel}{t.pendVesselPost}
                    </button>
                  )}
                  {pendingPrincipal && (
                    <button
                      type="button"
                      onClick={() => addMaster('principal')}
                      disabled={addingMaster !== null}
                      className="inline-flex items-center gap-1.5 border border-accent-amber/40 text-accent-amber
                                 hover:bg-accent-amber/10 rounded px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50"
                    >
                      {addingMaster === 'principal' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      {t.pendPrincPre}{pendingPrincipal}{t.pendPrincPost}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {t.fVessel} <span className="text-status-danger">*</span>
              </label>
              <select
                name="vesselId"
                value={form.vesselId}
                onChange={(e) => set('vesselId', e.target.value)}
                className={inputCls}
              >
                <option value="" className="bg-surface">{t.selVessel}</option>
                {allVessels.map((v) => (
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
                <option value="" className="bg-surface">{t.selNoPrincipal}</option>
                {allPrincipals.map((p) => (
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
                {t.particularsTitle}
              </p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-text-secondary">
                <span>IMO: <span className="text-text-primary">{selectedVessel.imoNumber ?? '—'}</span></span>
                <span>{t.pFlag}: <span className="text-text-primary">{selectedVessel.flag ?? '—'}</span></span>
                <span>{t.pType}: <span className="text-text-primary">{selectedVessel.vesselType ?? '—'}</span></span>
                <span>GT: <span className="text-text-primary">{num(selectedVessel.gt)}</span></span>
                <span>NRT: <span className="text-text-primary">{num(selectedVessel.nrt)}</span></span>
                <span>LOA: <span className="text-text-primary">{num(selectedVessel.loa)}</span> · Draft: <span className="text-text-primary">{num(selectedVessel.maxDraft)}</span></span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {t.fPort} <span className="text-status-danger">*</span>
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
              <label className={labelCls}>{t.fPortCode}</label>
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
              <label className={labelCls}>{t.fCargo}</label>
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
                <label className={labelCls}>{t.fQty}</label>
                <input
                  name="cargoQty"
                  value={form.cargoQty}
                  onChange={(e) => set('cargoQty', e.target.value)}
                  placeholder="50000"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t.fUnit}</label>
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
                    {stLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t.fNotes}</label>
              <input
                name="notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder={t.phNotes}
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
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? t.saveChanges : t.btnCreate}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
