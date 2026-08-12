'use client'

// Manajemen Tim (Fase 5g) — ADMIN-only. Tanpa mailer di repo: "Tambah
// Anggota" langsung membuat akun + password, ADMIN menyampaikannya sendiri
// ke orangnya (bukan alur undangan email).

import { useState } from 'react'
import { UserPlus, Loader2, Ban, CheckCircle2, KeyRound } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'

const ROLES = ['ADMIN', 'OPERATOR', 'FINANCE', 'VIEWER', 'MANAJER_OPERASI', 'PENYUSUN_BIAYA', 'DIREKTUR'] as const

const ROLE_LABEL: Record<Lang, Record<string, string>> = {
  id: {
    ADMIN: 'Administrator', OPERATOR: 'Operator', FINANCE: 'Finance', VIEWER: 'Viewer',
    MANAJER_OPERASI: 'Manajer Operasi', PENYUSUN_BIAYA: 'Penyusun Biaya', DIREKTUR: 'Direktur',
  },
  en: {
    ADMIN: 'Administrator', OPERATOR: 'Operator', FINANCE: 'Finance', VIEWER: 'Viewer',
    MANAJER_OPERASI: 'Operations Manager', PENYUSUN_BIAYA: 'Cost Compiler', DIREKTUR: 'Director',
  },
}

const STR: Record<Lang, Record<string, string>> = {
  id: {
    add: 'Tambah Anggota', title: 'Tambah Anggota Tim',
    desc: 'Buat akun baru — belum ada alur undang-via-email, sampaikan password ini sendiri ke orangnya.',
    name: 'Nama', email: 'Email', password: 'Password', role: 'Peran',
    save: 'Simpan', cancel: 'Batal', thName: 'Nama', thEmail: 'Email', thRole: 'Peran', thStatus: 'Status', thAction: 'Aksi',
    active: 'Aktif', inactive: 'Nonaktif', deactivate: 'Nonaktifkan', activate: 'Aktifkan',
    resetPw: 'Reset Password', resetPwTitle: 'Reset Password', resetPwDesc: 'Password baru untuk',
    confirmDeactivate: 'Nonaktifkan pengguna ini? Mereka tak bisa login lagi sampai diaktifkan ulang.',
    errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', you: '(Anda)',
    passwordHint: 'Minimal 8 karakter',
  },
  en: {
    add: 'Add Member', title: 'Add Team Member',
    desc: 'Create a new account — no invite-by-email flow yet, share this password with them yourself.',
    name: 'Name', email: 'Email', password: 'Password', role: 'Role',
    save: 'Save', cancel: 'Cancel', thName: 'Name', thEmail: 'Email', thRole: 'Role', thStatus: 'Status', thAction: 'Action',
    active: 'Active', inactive: 'Inactive', deactivate: 'Deactivate', activate: 'Activate',
    resetPw: 'Reset Password', resetPwTitle: 'Reset Password', resetPwDesc: 'New password for',
    confirmDeactivate: 'Deactivate this user? They will not be able to log in until reactivated.',
    errSave: 'Failed to save.', errConn: 'Failed to connect to server.', you: '(You)',
    passwordHint: 'At least 8 characters',
  },
}

export type TeamMember = {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  createdAt: string
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function TeamManager({ members: initial, currentUserId }: { members: TeamMember[]; currentUserId: string }) {
  const t = useT(STR)
  const [members, setMembers] = useState(initial)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', password: genPassword(), role: 'OPERATOR' })
  const [addBusy, setAddBusy] = useState(false)

  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  function openAdd() {
    setAddForm({ name: '', email: '', password: genPassword(), role: 'OPERATOR' })
    setError('')
    setAddOpen(true)
  }

  async function submitAdd() {
    setAddBusy(true)
    setError('')
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      const body = await res.json()
      setMembers((prev) => [...prev, body.member])
      setAddOpen(false)
    } catch {
      setError(t.errConn)
    } finally {
      setAddBusy(false)
    }
  }

  async function patchMember(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      const body = await res.json()
      setMembers((prev) => prev.map((m) => (m.id === id ? body.member : m)))
    } catch {
      setError(t.errConn)
    } finally {
      setBusyId(null)
    }
  }

  function toggleActive(m: TeamMember) {
    if (m.isActive && !confirm(t.confirmDeactivate)) return
    patchMember(m.id, { isActive: !m.isActive })
  }

  function openReset(m: TeamMember) {
    setResetTarget(m)
    setResetPassword(genPassword())
    setError('')
  }

  async function submitReset() {
    if (!resetTarget) return
    setResetBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/team/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setResetTarget(null)
    } catch {
      setError(t.errConn)
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" /> {t.add}
        </button>
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>
      )}

      <div className="overflow-x-auto border border-card-border/60 rounded-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
              <th className="px-4 py-2.5 font-medium">{t.thName}</th>
              <th className="px-4 py-2.5 font-medium">{t.thEmail}</th>
              <th className="px-4 py-2.5 font-medium">{t.thRole}</th>
              <th className="px-4 py-2.5 font-medium">{t.thStatus}</th>
              <th className="px-4 py-2.5 font-medium text-right">{t.thAction}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {members.map((m, i) => (
              <tr key={m.id} className={cn('hover:bg-surface-tertiary/30 transition-colors', i < members.length - 1 && 'border-b border-card-border/50')}>
                <td className="px-4 py-3 text-text-primary">
                  {m.name} {m.id === currentUserId && <span className="text-text-secondary text-xs">{t.you}</span>}
                </td>
                <td className="px-4 py-3 text-text-secondary font-mono text-xs">{m.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={m.role}
                    onChange={(e) => patchMember(m.id, { role: e.target.value })}
                    disabled={busyId === m.id}
                    className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL.id[r]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                    m.isActive ? 'bg-status-success/10 text-status-success border-status-success/30' : 'bg-status-danger/10 text-status-danger border-status-danger/30')}>
                    {m.isActive ? t.active : t.inactive}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openReset(m)}
                      title={t.resetPw}
                      className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {m.id !== currentUserId && (
                      <button
                        type="button"
                        onClick={() => toggleActive(m)}
                        disabled={busyId === m.id}
                        title={m.isActive ? t.deactivate : t.activate}
                        className={cn(
                          'p-1.5 rounded transition-colors disabled:opacity-50',
                          m.isActive ? 'text-status-danger hover:bg-status-danger/10' : 'text-status-success hover:bg-status-success/10',
                        )}
                      >
                        {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : m.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => !addBusy && setAddOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-accent-blue" /> {t.title}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>{t.name}</label>
              <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.email}</label>
              <input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.password}</label>
              <input value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} className={inputCls + ' font-mono'} />
              <p className="text-[10px] text-text-secondary mt-1">{t.passwordHint}</p>
            </div>
            <div>
              <label className={labelCls}>{t.role}</label>
              <select
                value={addForm.role}
                onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                className={inputCls}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL.id[r]}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAddOpen(false)} disabled={addBusy} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
              {t.cancel}
            </button>
            <button type="button" onClick={submitAdd} disabled={addBusy} className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50">
              {addBusy && <Loader2 className="w-4 h-4 animate-spin" />} {t.save}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !resetBusy && !o && setResetTarget(null)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent-blue" /> {t.resetPwTitle}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">{t.resetPwDesc} {resetTarget?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>{t.password}</label>
              <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className={inputCls + ' font-mono'} />
              <p className="text-[10px] text-text-secondary mt-1">{t.passwordHint}</p>
            </div>
            {error && <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setResetTarget(null)} disabled={resetBusy} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
              {t.cancel}
            </button>
            <button type="button" onClick={submitReset} disabled={resetBusy} className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50">
              {resetBusy && <Loader2 className="w-4 h-4 animate-spin" />} {t.save}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
