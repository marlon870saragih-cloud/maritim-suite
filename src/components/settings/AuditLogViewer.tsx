'use client'

// Audit Log (Fase 5) — daftar hanya-baca, filter tableName/action, detail
// oldValue/newValue bisa dibuka per baris. Tak ada tombol tulis apa pun di
// sini: audit log sendiri harusnya tak bisa diubah dari UI.

import { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import type { AuditLogRow } from '@/services/audit-log.service'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    filterTable: 'Tabel', filterAction: 'Aksi', all: 'Semua', reset: 'Reset',
    thTime: 'Waktu', thTable: 'Tabel', thRecord: 'ID Rekaman', thAction: 'Aksi', thUser: 'Pengguna', thIp: 'IP',
    detail: 'Detail', hide: 'Sembunyikan', before: 'Sebelum', after: 'Sesudah', empty: '(kosong)',
    noData: 'Belum ada jejak audit untuk filter ini.', errLoad: 'Gagal memuat.',
  },
  en: {
    filterTable: 'Table', filterAction: 'Action', all: 'All', reset: 'Reset',
    thTime: 'Time', thTable: 'Table', thRecord: 'Record ID', thAction: 'Action', thUser: 'User', thIp: 'IP',
    detail: 'Detail', hide: 'Hide', before: 'Before', after: 'After', empty: '(empty)',
    noData: 'No audit entries for this filter.', errLoad: 'Failed to load.',
  },
}

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'bg-status-success/12 text-status-success border-status-success/30',
  UPDATE: 'bg-accent-blue/12 text-accent-blue border-accent-blue/30',
  DELETE: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  APPROVE: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
}

const fmtTime = (d: string | Date) => new Date(d).toLocaleString('id-ID')

function ValueBlock({ label, value, empty }: { label: string; value: unknown; empty: string }) {
  const text = value === null || value === undefined ? empty : JSON.stringify(value, null, 2)
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-1">{label}</p>
      <pre className="text-[11px] font-mono text-text-primary bg-surface border border-border-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
        {text}
      </pre>
    </div>
  )
}

export function AuditLogViewer({
  initialRows,
  tables,
  actions,
}: {
  initialRows: AuditLogRow[]
  tables: string[]
  actions: string[]
}) {
  const t = useT(STR)
  const [rows, setRows] = useState(initialRows)
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function applyFilter(nextTable: string, nextAction: string) {
    setTableFilter(nextTable)
    setActionFilter(nextAction)
    setBusy(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (nextTable) params.set('tableName', nextTable)
      if (nextAction) params.set('action', nextAction)
      const res = await fetch(`/api/audit-log?${params.toString()}`)
      if (!res.ok) {
        setError(t.errLoad)
        return
      }
      setRows(await res.json())
    } catch {
      setError(t.errLoad)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.filterTable}</label>
          <select
            value={tableFilter}
            onChange={(e) => applyFilter(e.target.value, actionFilter)}
            className="bg-surface border border-border-muted rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
          >
            <option value="">{t.all}</option>
            {tables.map((tb) => (
              <option key={tb} value={tb}>{tb}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.filterAction}</label>
          <select
            value={actionFilter}
            onChange={(e) => applyFilter(tableFilter, e.target.value)}
            className="bg-surface border border-border-muted rounded px-2.5 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
          >
            <option value="">{t.all}</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {(tableFilter || actionFilter) && (
          <button
            type="button"
            onClick={() => applyFilter('', '')}
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-text-secondary hover:text-accent-blue transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t.reset}
          </button>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-text-secondary mt-4" />}
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
      )}

      {rows.length === 0 ? (
        <div className="bg-card-bg border border-card-border rounded-lg p-10 text-center">
          <p className="text-text-secondary text-sm">{t.noData}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-card-border/60 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-4 py-2.5 font-medium">{t.thTime}</th>
                <th className="px-4 py-2.5 font-medium">{t.thTable}</th>
                <th className="px-4 py-2.5 font-medium">{t.thRecord}</th>
                <th className="px-4 py-2.5 font-medium">{t.thAction}</th>
                <th className="px-4 py-2.5 font-medium">{t.thUser}</th>
                <th className="px-4 py-2.5 font-medium">{t.thIp}</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-card-border/50 hover:bg-surface-tertiary/30 transition-colors">
                    <td className="px-4 py-3 text-text-secondary font-mono whitespace-nowrap">{fmtTime(r.createdAt)}</td>
                    <td className="px-4 py-3 text-text-primary font-mono">{r.tableName}</td>
                    <td className="px-4 py-3 text-text-secondary font-mono text-xs truncate max-w-[140px]">{r.recordId}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider', ACTION_COLOR[r.action] ?? ACTION_COLOR.UPDATE)}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-primary">{r.userName ?? '—'}</td>
                    <td className="px-4 py-3 text-text-secondary font-mono text-xs">{r.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent-blue transition-colors"
                      >
                        {expanded === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {expanded === r.id ? t.hide : t.detail}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="border-b border-card-border/50 bg-surface-secondary/40">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex gap-3 flex-col sm:flex-row">
                          <ValueBlock label={t.before} value={r.oldValue} empty={t.empty} />
                          <ValueBlock label={t.after} value={r.newValue} empty={t.empty} />
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
    </div>
  )
}
