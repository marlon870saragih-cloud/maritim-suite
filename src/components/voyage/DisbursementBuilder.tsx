'use client'

// Builder EPDA/FDA — §12 (K49) docs/FASE-3-EPDA-ENGINE.md. Halaman sendiri
// (bukan dialog): tabelnya lebar, operator akan lama di sini.
//
// Total TIDAK dihitung ulang di klien (lihat DisbursementLineTable) — server
// menghitung ulang & menulis amount/amountBase/subtotal/grandTotal setiap kali
// item berubah (hitungUlang di disbursement.service.ts), dan respons itulah
// yang menggantikan seluruh state lokal. "Nilai server yang menang" (K11)
// jadi bukan sekadar aturan tie-break, tapi satu-satunya sumber di sini.
//
// Tombol status SENGAJA dibatasi ke yang generik (Ajukan Review/Tarik
// Kembali/Batalkan) — APPROVED/SENT/REVISED/FINAL butuh alur approval/revisi/
// FDA yang baru dibangun di 3e-3g. Menampilkannya sekarang berarti "menyetujui"
// tanpa jejak approval (P1/P2 belum terjawab) — salah arah, bukan sekadar
// belum selesai.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  Copy,
  Download,
  GitCompare,
  Loader2,
  Pencil,
  Plus,
  Scale,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { adaWarningPemblokir, type CalcWarning } from '@/services/finance/calc-engine'
import { DisbursementLineTable, type LineItem } from './DisbursementLineTable'
import { ServicePickerDialog } from './ServicePickerDialog'
import { RevisionDialog } from './RevisionDialog'
import { ApprovalPanel, type ApprovalRow } from './ApprovalPanel'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addCatalog: 'Tambah Jasa', addTemplate: 'Dari Template', downloadPdf: 'Unduh PDF',
    status: 'Status', version: 'Versi', baseCurrency: 'Mata Uang Dasar', agencyPct: 'Agency Fee (%)',
    validUntil: 'Berlaku Sampai', notes: 'Catatan', edit: 'Ubah', save: 'Simpan', cancel: 'Batal',
    subtotal: 'Subtotal', agencyAmount: 'Agency Fee', taxAmount: 'Pajak', grandTotal: 'Total',
    warningsTitle: 'Peringatan', noWarnings: 'Tidak ada peringatan.',
    confirmCancel: 'Batalkan dokumen ini? Status menjadi CANCELLED (data tidak dihapus).',
    confirmRemoveItem: 'Hapus baris ini?',
    blockedSubmit: 'Beresi peringatan di atas dulu sebelum mengajukan review.',
    errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    readOnlyNote: 'Dokumen ini tidak lagi bisa diubah pada status sekarang.',
    createRevision: 'Buat Revisi', compareV1: 'Bandingkan dengan v1', viewVariance: 'Lihat Variance',
  },
  en: {
    addCatalog: 'Add Service', addTemplate: 'From Template', downloadPdf: 'Download PDF',
    status: 'Status', version: 'Version', baseCurrency: 'Base Currency', agencyPct: 'Agency Fee (%)',
    validUntil: 'Valid Until', notes: 'Notes', edit: 'Edit', save: 'Save', cancel: 'Cancel',
    subtotal: 'Subtotal', agencyAmount: 'Agency Fee', taxAmount: 'Tax', grandTotal: 'Grand Total',
    warningsTitle: 'Warnings', noWarnings: 'No warnings.',
    confirmCancel: 'Cancel this document? Status becomes CANCELLED (no data is deleted).',
    confirmRemoveItem: 'Delete this line?',
    blockedSubmit: 'Resolve the warnings above before submitting for review.',
    errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
    readOnlyNote: 'This document can no longer be edited at its current status.',
    createRevision: 'Create Revision', compareV1: 'Compare with v1', viewVariance: 'View Variance',
  },
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  PENDING_REVIEW: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  APPROVED: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
  SENT: 'bg-status-success/12 text-status-success border-status-success/30',
  REVISION_REQUESTED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  REVISED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  FINAL: 'bg-status-success/12 text-status-success border-status-success/30',
  CLOSED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CANCELLED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

/** 3c hanya menawarkan target status ini — sisanya menunggu 3e-3g (lihat catatan berkas). */
const TARGET_LABEL: Record<Lang, Record<string, string>> = {
  id: { PENDING_REVIEW: 'Ajukan Review', DRAFT: 'Tarik Kembali ke Draft', CANCELLED: 'Batalkan' },
  en: { PENDING_REVIEW: 'Submit for Review', DRAFT: 'Pull Back to Draft', CANCELLED: 'Cancel' },
}
const TARGET_ICON: Record<string, typeof Send> = { PENDING_REVIEW: Send, DRAFT: Undo2, CANCELLED: XCircle }
const GENERIC_TARGETS = ['PENDING_REVIEW', 'DRAFT', 'CANCELLED']

export type BuilderDisbursement = {
  id: string
  docNumber: string
  kind: string
  status: string
  version: number
  baseCurrency: string
  agencyPct: number
  validUntil: string | Date | null
  notes: string | null
  hitung: { subtotal: number; agencyAmount: number; taxAmount: number; grandTotal: number }
  warnings: CalcWarning[]
  transisiTersedia: readonly string[]
  bolehUbahItem: boolean
  bolehRevisi: boolean
  approvals: ApprovalRow[]
  levelTarget: number | null
  bolehMemutuskanSekarang: boolean
  items: LineItem[]
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'
const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const toDateInput = (d: string | Date | null) => {
  if (!d) return ''
  const v = new Date(d)
  return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
}

export function DisbursementBuilder({ disb: initial, voyageId }: { disb: BuilderDisbursement; voyageId: string }) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const [disb, setDisb] = useState(initial)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<'catalog' | 'template'>('catalog')
  const [itemBusyId, setItemBusyId] = useState<string | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [editingHeader, setEditingHeader] = useState(false)
  const [headerForm, setHeaderForm] = useState({ agencyPct: '', validUntil: '', notes: '' })
  const [headerBusy, setHeaderBusy] = useState(false)
  const [revisionOpen, setRevisionOpen] = useState(false)
  // Terpisah dari `disb`: respons mutasi item/status/header (`body.disbursement`)
  // tidak membawa field ini (bukan bagian DisbursementDetail — cuma dihitung di
  // page.tsx via statusApprovalUntukUi). Menyimpannya di `disb` akan membuatnya
  // hilang diam-diam setelah mutasi APA PUN yang tak terkait approval. Disegarkan
  // eksplisit tiap kali status berubah (lihat refreshApprovalInfo).
  const [approvalInfo, setApprovalInfo] = useState({
    approvals: initial.approvals,
    levelTarget: initial.levelTarget,
    bolehMemutuskanSekarang: initial.bolehMemutuskanSekarang,
  })
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState('')
  const [error, setError] = useState('')
  const rowRefs: Record<string, HTMLElement | null> = {}

  const editable = disb.bolehUbahItem

  async function refetch() {
    const res = await fetch(`/api/disbursements/${disb.id}`)
    if (res.ok) setDisb(await res.json())
    router.refresh()
  }

  async function handleMutation(fn: () => Promise<Response>, busySetter?: (v: boolean) => void) {
    setError('')
    busySetter?.(true)
    try {
      const res = await fn()
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return false
      }
      const body = await res.json()
      if (body.disbursement) setDisb(body.disbursement)
      router.refresh()
      return true
    } catch {
      setError(t.errConn)
      return false
    } finally {
      busySetter?.(false)
    }
  }

  function pickService(serviceId: string) {
    handleMutation(
      () =>
        fetch(`/api/disbursements/${disb.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId }),
        }),
      setAddBusy,
    ).then((ok) => ok && setPickerOpen(false))
  }

  function pickTemplate(templateId: string) {
    handleMutation(
      () => fetch(`/api/disbursements/${disb.id}/items?template=${templateId}`, { method: 'POST' }),
      setAddBusy,
    ).then((ok) => ok && setPickerOpen(false))
  }

  function removeItem(itemId: string) {
    if (!confirm(t.confirmRemoveItem)) return
    setItemBusyId(itemId)
    fetch(`/api/disbursements/${disb.id}/items/${itemId}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error?.message ?? t.errSave)
          return
        }
        await refetch()
      })
      .catch(() => setError(t.errConn))
      .finally(() => setItemBusyId(null))
  }

  function patchItem(itemId: string, patch: Record<string, unknown>) {
    setItemBusyId(itemId)
    fetch(`/api/disbursements/${disb.id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          setError(body?.error?.message ?? t.errSave)
          return
        }
        await refetch()
      })
      .catch(() => setError(t.errConn))
      .finally(() => setItemBusyId(null))
  }

  function openEditHeader() {
    setHeaderForm({
      agencyPct: String(disb.agencyPct),
      validUntil: toDateInput(disb.validUntil),
      notes: disb.notes ?? '',
    })
    setEditingHeader(true)
  }

  async function saveHeader() {
    const ok = await handleMutation(
      () =>
        fetch(`/api/disbursements/${disb.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(headerForm),
        }),
      setHeaderBusy,
    )
    if (ok) setEditingHeader(false)
  }

  function changeStatus(target: string) {
    if (target === 'CANCELLED' && !confirm(t.confirmCancel)) return
    handleMutation(
      () =>
        fetch(`/api/disbursements/${disb.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: target }),
        }),
      setStatusBusy,
    ).then((ok) => {
      if (ok) refreshApprovalInfo()
    })
  }

  async function refreshApprovalInfo() {
    const res = await fetch(`/api/disbursements/${disb.id}/approvals`)
    if (res.ok) setApprovalInfo(await res.json())
  }

  async function decideApproval(decision: 'APPROVED' | 'REJECTED' | 'REQUEST_REVISION', note: string) {
    setApprovalBusy(decision)
    setApprovalError('')
    try {
      const res = await fetch(`/api/disbursements/${disb.id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: note || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setApprovalError(body?.error?.message ?? t.errSave)
        return
      }
      const body = await res.json()
      if (body.disbursement) setDisb(body.disbursement)
      await refreshApprovalInfo()
      router.refresh()
    } catch {
      setApprovalError(t.errConn)
    } finally {
      setApprovalBusy(null)
    }
  }

  function jumpToWarning(itemId?: string | null) {
    if (!itemId) return
    rowRefs[itemId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const blocked = adaWarningPemblokir(disb.warnings)
  const availableTargets = disb.transisiTersedia.filter((s) => GENERIC_TARGETS.includes(s))

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-lg text-white">
              {disb.docNumber}
              {disb.version > 1 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-accent-blue/40 bg-accent-blue/10 text-accent-blue align-middle">
                  v{disb.version}
                </span>
              )}
            </p>
            <span
              className={cn(
                'inline-flex mt-1.5 text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                STATUS_COLOR[disb.status] ?? STATUS_COLOR.DRAFT,
              )}
            >
              {disb.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {disb.version > 1 && (
              <Link
                href={`/voyages/${voyageId}/disbursements/${disb.id}/compare`}
                className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <GitCompare className="w-3.5 h-3.5" /> {t.compareV1}
              </Link>
            )}
            {disb.kind === 'FDA' && (
              <Link
                href={`/voyages/${voyageId}/disbursements/${disb.id}/variance`}
                className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <Scale className="w-3.5 h-3.5" /> {t.viewVariance}
              </Link>
            )}
            {disb.bolehRevisi && (
              <button
                type="button"
                onClick={() => setRevisionOpen(true)}
                className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> {t.createRevision}
              </button>
            )}
            <a
              href={`/api/disbursements/${disb.id}/pdf?download=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> {t.downloadPdf}
            </a>
            {editable && !editingHeader && (
              <button
                type="button"
                onClick={openEditHeader}
                className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> {t.edit}
              </button>
            )}
          </div>
        </div>

        {editingHeader ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t.agencyPct}</label>
              <input
                type="number"
                value={headerForm.agencyPct}
                onChange={(e) => setHeaderForm((p) => ({ ...p, agencyPct: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.validUntil}</label>
              <input
                type="date"
                value={headerForm.validUntil}
                onChange={(e) => setHeaderForm((p) => ({ ...p, validUntil: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="col-span-3">
              <label className={labelCls}>{t.notes}</label>
              <input
                value={headerForm.notes}
                onChange={(e) => setHeaderForm((p) => ({ ...p, notes: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="col-span-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingHeader(false)}
                disabled={headerBusy}
                className="px-3.5 py-1.5 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={saveHeader}
                disabled={headerBusy}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {headerBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t.save}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className={labelCls}>{t.baseCurrency}</p>
              <p className="text-text-primary font-mono">{disb.baseCurrency}</p>
            </div>
            <div>
              <p className={labelCls}>{t.agencyPct}</p>
              <p className="text-text-primary font-mono">{disb.agencyPct}%</p>
            </div>
            <div>
              <p className={labelCls}>{t.validUntil}</p>
              <p className="text-text-primary">{disb.validUntil ? toDateInput(disb.validUntil) : '—'}</p>
            </div>
            <div>
              <p className={labelCls}>{t.notes}</p>
              <p className="text-text-primary">{disb.notes ?? '—'}</p>
            </div>
          </div>
        )}

        {!editable && (
          <p className="text-text-secondary text-xs bg-surface/40 border border-card-border/60 rounded px-3 py-2">
            {t.readOnlyNote}
          </p>
        )}
      </section>

      {/* Warnings */}
      {disb.warnings.length > 0 && (
        <section className="bg-accent-amber/5 border border-accent-amber/25 rounded-lg p-4">
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent-amber mb-2">
            {t.warningsTitle} ({disb.warnings.length})
          </p>
          <ul className="space-y-1.5">
            {disb.warnings.map((w, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => jumpToWarning(w.itemId)}
                  disabled={!w.itemId}
                  className="flex items-start gap-1.5 text-xs text-text-primary text-left hover:text-accent-amber transition-colors disabled:cursor-default"
                >
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-accent-amber" />
                  {w.pesan}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add doors */}
      {editable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPickerTab('catalog')
              setPickerOpen(true)
            }}
            className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> {t.addCatalog}
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerTab('template')
              setPickerOpen(true)
            }}
            className="inline-flex items-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/50 hover:bg-surface-tertiary rounded px-3.5 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> {t.addTemplate}
          </button>
        </div>
      )}

      {/* Line table */}
      <DisbursementLineTable
        items={disb.items}
        warnings={disb.warnings}
        baseCurrency={disb.baseCurrency}
        editable={editable}
        busyId={itemBusyId}
        onQuantityChange={(id, v) => patchItem(id, { quantity: v === '' ? 0 : Number(v) })}
        onUnitPriceChange={(id, v) => patchItem(id, { unitPrice: v === '' ? 0 : Number(v) })}
        onRemove={removeItem}
        onJumpTarget={(id, el) => {
          rowRefs[id] = el
        }}
      />

      {/* Totals */}
      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>{t.subtotal}</span>
            <span className="font-mono">{fmt(disb.hitung.subtotal)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>
              {t.agencyAmount} ({disb.agencyPct}%)
            </span>
            <span className="font-mono">{fmt(disb.hitung.agencyAmount)}</span>
          </div>
          {disb.hitung.taxAmount > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>{t.taxAmount}</span>
              <span className="font-mono">{fmt(disb.hitung.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-text-primary font-display text-base pt-1.5 border-t border-card-border">
            <span>{t.grandTotal}</span>
            <span className="font-mono">
              {disb.baseCurrency} {fmt(disb.hitung.grandTotal)}
            </span>
          </div>
        </div>
      </section>

      {error && (
        <p className="text-status-danger text-sm bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Status actions — hanya target generik, lihat catatan di kepala berkas */}
      {availableTargets.length > 0 && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {availableTargets.includes('PENDING_REVIEW') && blocked && (
            <p className="text-text-secondary text-xs">{t.blockedSubmit}</p>
          )}
          {availableTargets.map((target) => {
            const Icon = TARGET_ICON[target]
            const isSubmit = target === 'PENDING_REVIEW'
            const disabledBySubmit = isSubmit && blocked
            return (
              <button
                key={target}
                type="button"
                onClick={() => changeStatus(target)}
                disabled={statusBusy || disabledBySubmit}
                title={disabledBySubmit ? t.blockedSubmit : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  target === 'CANCELLED'
                    ? 'border border-status-danger/40 text-status-danger hover:bg-status-danger/10'
                    : 'bg-accent-blue hover:bg-primary text-[#231a06]',
                )}
              >
                {statusBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                {TARGET_LABEL[lang]?.[target] ?? target}
              </button>
            )
          })}
        </div>
      )}

      <ApprovalPanel
        approvals={approvalInfo.approvals}
        levelTarget={approvalInfo.levelTarget}
        bolehMemutuskanSekarang={disb.status === 'PENDING_REVIEW' && approvalInfo.bolehMemutuskanSekarang}
        busy={approvalBusy}
        error={approvalError}
        onDecide={decideApproval}
      />

      <ServicePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        defaultTab={pickerTab}
        onPickService={pickService}
        onPickTemplate={pickTemplate}
        busy={addBusy}
      />

      <RevisionDialog
        open={revisionOpen}
        onOpenChange={setRevisionOpen}
        disbursementId={disb.id}
        onCreated={(newId) => router.push(`/voyages/${voyageId}/disbursements/${newId}`)}
      />
    </div>
  )
}
