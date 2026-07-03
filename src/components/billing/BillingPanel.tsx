'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Lock, Loader2, Copy, MessageCircle } from 'lucide-react'
import { BILLING_PLANS, BILLING_MODULES, planNeedsChoice, type BillingModule } from '@/lib/billing/plans'

// Snap.js menyuntik window.snap saat script termuat.
declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        opts?: {
          onSuccess?: (r: unknown) => void
          onPending?: (r: unknown) => void
          onError?: (r: unknown) => void
          onClose?: () => void
        },
      ) => void
    }
  }
}

const PLAN_ORDER = ['m1', 'm2', 'all'] as const

type Lang = 'id' | 'en'

const T = {
  id: {
    heading: 'Berlangganan',
    sub: 'Bayar sekali untuk 30 hari. Perpanjang manual sebelum masa aktif habis.',
    perMonth: '/bulan',
    portCallPlus: (n: number) => `Port Call + pilih ${n} modul`,
    allModules: 'Semua modul aktif',
    modulesHeading: 'Modul paket',
    mandatoryNote: 'Port Call Manager selalu termasuk di setiap paket.',
    required: 'Wajib',
    pickN: (n: number, sel: number) => `Pilih ${n} modul pilihan (${sel}/${n})`,
    pickDone: (n: number) => `Modul terpilih (${n}/${n})`,
    pay: 'Bayar sekarang',
    processing: 'Memproses…',
    chooseFirst: 'Pilih paket dulu',
    successBody: 'Langganan aktif setelah pembayaran terkonfirmasi. Halaman akan menyegarkan status.',
    pendingBody: 'Pembayaran menunggu. Selesaikan sesuai instruksi Midtrans; status diperbarui otomatis.',
    errorBody: 'Pembayaran gagal atau dibatalkan. Silakan coba lagi.',
    notReady: 'Pembayaran belum siap (script Midtrans belum termuat). Muat ulang halaman.',
    orDivider: 'atau bayar manual',
    manualHeading: 'Transfer bank manual',
    manualDesc: 'Transfer sesuai harga paket, lalu kirim bukti pembayaran via WhatsApp untuk aktivasi.',
    bankLabel: 'Bank',
    accountLabel: 'No. Rekening',
    holderLabel: 'Atas nama',
    copy: 'Salin',
    copied: 'Tersalin',
    waBtn: 'Kirim bukti via WhatsApp',
    waMsg: (plan: string, price: string) =>
      `Halo Maritime Suite, saya sudah transfer untuk paket ${plan} (${price}/bulan) via Bank Mandiri. Berikut bukti pembayaran saya.`,
    waMsgGeneric: 'Halo Maritime Suite, saya ingin berlangganan via transfer bank manual. Mohon informasinya.',
  },
  en: {
    heading: 'Subscribe',
    sub: 'Pay once for 30 days. Renew manually before it expires.',
    perMonth: '/month',
    portCallPlus: (n: number) => `Port Call + pick ${n} module${n > 1 ? 's' : ''}`,
    allModules: 'All modules active',
    modulesHeading: 'Plan modules',
    mandatoryNote: 'Port Call Manager is always included in every plan.',
    required: 'Required',
    pickN: (n: number, sel: number) => `Pick ${n} module${n > 1 ? 's' : ''} (${sel}/${n})`,
    pickDone: (n: number) => `Modules selected (${n}/${n})`,
    pay: 'Pay now',
    processing: 'Processing…',
    chooseFirst: 'Choose a plan first',
    successBody: 'Your subscription activates once the payment is confirmed. This page will refresh the status.',
    pendingBody: 'Payment pending. Complete it per Midtrans instructions; status updates automatically.',
    errorBody: 'Payment failed or was cancelled. Please try again.',
    notReady: 'Payment not ready (Midtrans script not loaded). Reload the page.',
    orDivider: 'or pay manually',
    manualHeading: 'Manual bank transfer',
    manualDesc: 'Transfer the plan amount, then send your payment proof via WhatsApp for activation.',
    bankLabel: 'Bank',
    accountLabel: 'Account no.',
    holderLabel: 'Account name',
    copy: 'Copy',
    copied: 'Copied',
    waBtn: 'Send proof via WhatsApp',
    waMsg: (plan: string, price: string) =>
      `Hello Maritime Suite, I have transferred for the ${plan} plan (${price}/month) via Bank Mandiri. Here is my payment proof.`,
    waMsgGeneric: 'Hello Maritime Suite, I would like to subscribe via manual bank transfer. Please advise.',
  },
} as const

function formatIDR(n: number) {
  return 'Rp ' + n.toLocaleString('id-ID')
}

// Rekening transfer manual.
const BANK_NAME = 'Bank Mandiri'
const BANK_ACCOUNT = '148-00-68812000'
const BANK_HOLDER = 'PT Tribuana Solusi Maritim'
const WA_NUMBER = '6282154950193' // 0821-5495-0193

export function BillingPanel({ lang }: { lang: Lang }) {
  const t = T[lang]
  const router = useRouter()
  const [planId, setPlanId] = useState<string | null>(null)
  const [modules, setModules] = useState<BillingModule[]>([]) // hanya modul PILIHAN (tanpa Port Call)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'pending' | 'err'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function copyAccount() {
    navigator.clipboard?.writeText(BANK_ACCOUNT).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      },
      () => {},
    )
  }

  const plan = planId ? BILLING_PLANS[planId] : null
  const needsChoice = plan ? planNeedsChoice(plan) : false

  const canPay = useMemo(() => {
    if (!plan) return false
    if (!needsChoice) return true
    return modules.length === plan.choiceCount
  }, [plan, needsChoice, modules])

  // Link WhatsApp dgn pesan otomatis sesuai paket yang dipilih (bila ada).
  const waHref = (() => {
    const label = plan ? (lang === 'id' ? plan.labelId : plan.labelEn) : ''
    const msg = plan ? t.waMsg(label, formatIDR(plan.priceIDR)) : t.waMsgGeneric
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`
  })()

  function selectPlan(id: string) {
    setPlanId(id)
    setModules([]) // reset pilihan modul saat ganti paket
    setNotice(null)
  }

  function toggleModule(id: BillingModule) {
    if (!plan) return
    setModules((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id)
      if (prev.length >= plan.choiceCount) return prev // kuota pilihan penuh
      return [...prev, id]
    })
  }

  async function pay() {
    if (!plan || !canPay || loading) return
    if (typeof window === 'undefined' || !window.snap) {
      setNotice({ kind: 'err', text: t.notReady })
      return
    }
    setLoading(true)
    setNotice(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, modules: needsChoice ? modules : undefined }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        setNotice({ kind: 'err', text: msg || t.errorBody })
        setLoading(false)
        return
      }
      const { token } = (await res.json()) as { token: string }
      window.snap.pay(token, {
        onSuccess: () => {
          setNotice({ kind: 'ok', text: t.successBody })
          setTimeout(() => router.refresh(), 1500)
        },
        onPending: () => setNotice({ kind: 'pending', text: t.pendingBody }),
        onError: () => setNotice({ kind: 'err', text: t.errorBody }),
        onClose: () => setLoading(false),
      })
    } catch {
      setNotice({ kind: 'err', text: t.errorBody })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-5">
      <div>
        <h3 className="font-display text-lg text-white">{t.heading}</h3>
        <p className="text-text-secondary text-xs">{t.sub}</p>
      </div>

      {/* Paket */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLAN_ORDER.map((id) => {
          const p = BILLING_PLANS[id]
          const active = planId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectPlan(id)}
              className={`text-left rounded-lg border p-4 transition-colors ${
                active
                  ? 'border-accent-blue bg-accent-blue/10'
                  : 'border-card-border hover:border-accent-blue/50'
              }`}
            >
              <p className="text-white font-display text-base">{lang === 'id' ? p.labelId : p.labelEn}</p>
              <p className="mt-1 font-mono text-white text-lg">
                {formatIDR(p.priceIDR)}
                <span className="text-text-secondary text-xs">{t.perMonth}</span>
              </p>
              <p className="mt-1 text-[11px] text-text-secondary">
                {planNeedsChoice(p) ? t.portCallPlus(p.choiceCount) : t.allModules}
              </p>
            </button>
          )
        })}
      </div>

      {/* Pilih modul */}
      {plan && (
        <div>
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">
            {t.modulesHeading}
          </p>
          <p className="text-[11px] text-text-secondary mb-2">{t.mandatoryNote}</p>
          {needsChoice && (
            <p className="text-[11px] text-accent-teal mb-2">
              {modules.length === plan.choiceCount
                ? t.pickDone(plan.choiceCount)
                : t.pickN(plan.choiceCount, modules.length)}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BILLING_MODULES.map((m) => {
              if (m.mandatory) {
                // Modul wajib — selalu termasuk, tak bisa di-uncheck.
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-md border border-accent-teal/40 bg-accent-teal/5 px-3 py-2 text-sm text-white"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-sm border border-accent-teal bg-accent-teal text-black">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="flex-1">{lang === 'id' ? m.labelId : m.labelEn}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-accent-teal uppercase tracking-wider font-mono">
                      <Lock className="h-3 w-3" />
                      {t.required}
                    </span>
                  </div>
                )
              }
              const checked = modules.includes(m.id)
              const forcedAll = !needsChoice // paket "semua" → semua ikut, tampil tercentang & terkunci
              const isOn = checked || forcedAll
              const full = needsChoice && modules.length >= plan.choiceCount && !checked
              const disabled = forcedAll || full
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleModule(m.id)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    isOn
                      ? 'border-accent-teal bg-accent-teal/10 text-white'
                      : full
                        ? 'border-card-border text-text-secondary/50 cursor-not-allowed'
                        : 'border-card-border text-text-secondary hover:border-accent-teal/50'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
                      isOn ? 'border-accent-teal bg-accent-teal text-black' : 'border-text-secondary/40'
                    }`}
                  >
                    {isOn && <Check className="h-3 w-3" />}
                  </span>
                  {lang === 'id' ? m.labelId : m.labelEn}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {notice && (
        <p
          className={`text-sm rounded-md px-3 py-2 ${
            notice.kind === 'ok'
              ? 'bg-status-success/10 text-status-success'
              : notice.kind === 'pending'
                ? 'bg-status-warning/10 text-status-warning'
                : 'bg-status-danger/10 text-status-danger'
          }`}
        >
          {notice.text}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={!canPay || loading}
        className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                   transition-colors hover:bg-accent-blue/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!plan ? t.chooseFirst : loading ? t.processing : `${t.pay} · ${formatIDR(plan.priceIDR)}`}
      </button>

      {/* Pembayaran manual (transfer bank) */}
      <div className="flex items-center gap-3 pt-1">
        <span className="h-px flex-1 bg-card-border" />
        <span className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.orDivider}</span>
        <span className="h-px flex-1 bg-card-border" />
      </div>

      <div className="rounded-lg border border-card-border bg-surface-tertiary/40 p-4 space-y-3">
        <div>
          <h4 className="text-white font-display text-base">{t.manualHeading}</h4>
          <p className="text-text-secondary text-xs">{t.manualDesc}</p>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-secondary">{t.bankLabel}</dt>
            <dd className="text-white">{BANK_NAME}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-secondary">{t.accountLabel}</dt>
            <dd className="flex items-center gap-2">
              <span className="text-white font-mono">{BANK_ACCOUNT}</span>
              <button
                type="button"
                onClick={copyAccount}
                className="inline-flex items-center gap-1 rounded border border-card-border px-1.5 py-0.5 text-[11px]
                           text-text-secondary hover:text-white hover:border-accent-teal/50 transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-accent-teal" /> : <Copy className="h-3 w-3" />}
                {copied ? t.copied : t.copy}
              </button>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-secondary">{t.holderLabel}</dt>
            <dd className="text-white text-right">{BANK_HOLDER}</dd>
          </div>
        </dl>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-status-success px-4 py-2 text-sm font-medium text-white
                     transition-colors hover:bg-status-success/90"
        >
          <MessageCircle className="h-4 w-4" />
          {t.waBtn}
        </a>
      </div>
    </div>
  )
}
