'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Lock, Loader2 } from 'lucide-react'
import { BILLING_PLANS, BILLING_MODULES, planNeedsChoice, type BillingModule } from '@/lib/billing/plans'

export interface AdminTenant {
  id: string
  companyName: string
}

const PLAN_ORDER = ['m1', 'm2', 'all'] as const

export function AdminActivate({ tenants }: { tenants: AdminTenant[] }) {
  const router = useRouter()
  const [tenantId, setTenantId] = useState('')
  const [planId, setPlanId] = useState<string>('m1')
  const [modules, setModules] = useState<BillingModule[]>([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const plan = BILLING_PLANS[planId]
  const needsChoice = planNeedsChoice(plan)
  const canSubmit = useMemo(() => {
    if (!tenantId) return false
    if (!needsChoice) return true
    return modules.length === plan.choiceCount
  }, [tenantId, needsChoice, modules, plan])

  function selectPlan(id: string) {
    setPlanId(id)
    setModules([])
    setMsg(null)
  }

  function toggleModule(id: BillingModule) {
    setModules((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id)
      if (prev.length >= plan.choiceCount) return prev
      return [...prev, id]
    })
  }

  async function activate() {
    if (!canSubmit || loading) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, planId, modules: needsChoice ? modules : undefined, days }),
      })
      if (!res.ok) {
        setMsg({ ok: false, text: (await res.text().catch(() => '')) || 'Gagal mengaktifkan.' })
        return
      }
      const j = (await res.json()) as { subscriptionEndsAt: string }
      const until = new Date(j.subscriptionEndsAt).toLocaleDateString('id-ID')
      setMsg({ ok: true, text: `Langganan aktif hingga ${until}.` })
      router.refresh()
    } catch {
      setMsg({ ok: false, text: 'Terjadi kesalahan jaringan.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg text-white">Aktifkan langganan manual</h3>
        <p className="text-text-secondary text-xs">
          Setelah verifikasi bukti transfer, pilih tenant + paket lalu aktifkan.
        </p>
      </div>

      <div>
        <label className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">Tenant</label>
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="mt-1 w-full rounded-md border border-card-border bg-surface-tertiary px-3 py-2 text-sm text-white"
        >
          <option value="">— Pilih tenant —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.companyName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PLAN_ORDER.map((id) => {
          const p = BILLING_PLANS[id]
          const active = planId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectPlan(id)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                active ? 'border-accent-blue bg-accent-blue/10 text-white' : 'border-card-border text-text-secondary hover:border-accent-blue/50'
              }`}
            >
              {p.labelId} · Rp {p.priceIDR.toLocaleString('id-ID')}
            </button>
          )
        })}
      </div>

      <div>
        <p className="text-[11px] text-text-secondary mb-2">Port Call Manager selalu termasuk.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BILLING_MODULES.map((m) => {
            if (m.mandatory) {
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-md border border-accent-teal/40 bg-accent-teal/5 px-3 py-2 text-sm text-white"
                >
                  <Lock className="h-3 w-3 text-accent-teal" />
                  {m.labelId}
                </div>
              )
            }
            const checked = modules.includes(m.id)
            const forcedAll = !needsChoice
            const isOn = checked || forcedAll
            const full = needsChoice && modules.length >= plan.choiceCount && !checked
            return (
              <button
                key={m.id}
                type="button"
                disabled={forcedAll || full}
                onClick={() => toggleModule(m.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  isOn ? 'border-accent-teal bg-accent-teal/10 text-white' : full ? 'border-card-border text-text-secondary/50 cursor-not-allowed' : 'border-card-border text-text-secondary hover:border-accent-teal/50'
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-sm border ${isOn ? 'border-accent-teal bg-accent-teal text-black' : 'border-text-secondary/40'}`}>
                  {isOn && <Check className="h-3 w-3" />}
                </span>
                {m.labelId}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">Durasi (hari)</label>
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))}
          className="w-24 rounded-md border border-card-border bg-surface-tertiary px-3 py-1.5 text-sm text-white"
        />
      </div>

      {msg && (
        <p className={`text-sm rounded-md px-3 py-2 ${msg.ok ? 'bg-status-success/10 text-status-success' : 'bg-status-danger/10 text-status-danger'}`}>
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={activate}
        disabled={!canSubmit || loading}
        className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Aktifkan langganan
      </button>
    </div>
  )
}
