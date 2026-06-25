import Link from 'next/link'
import { Lock, BarChart3, Check } from 'lucide-react'

const FEATURES = [
  'Pantau outstanding DA & invoice per principal',
  'Aging report (30/60/90 hari) otomatis',
  'Reminder jatuh tempo & rekap pembayaran',
]

export default function TrackerPage() {
  return (
    <div className="p-margin-page max-w-[1600px] mx-auto">
      <div className="max-w-lg mx-auto mt-12 bg-card-bg border border-card-border rounded-xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-surface-tertiary border border-border-muted flex items-center justify-center mx-auto mb-5">
          <Lock className="w-6 h-6 text-text-secondary" />
        </div>
        <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">
          Modul Terkunci
        </p>
        <h1 className="font-display text-2xl text-white mb-2 flex items-center justify-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent-blue" />
          DA &amp; Invoice Tracker
        </h1>
        <p className="text-text-secondary text-sm mb-6">
          Tersedia di paket <span className="text-accent-blue">Enterprise</span>. Aktifkan untuk
          melacak piutang keagenan secara menyeluruh.
        </p>

        <ul className="text-left space-y-2 mb-8">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-text-primary">
              <Check className="w-4 h-4 text-accent-teal flex-shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>

        <Link
          href="/settings"
          className="inline-flex items-center justify-center bg-[#2E86DE] hover:bg-accent-blue text-white
                     rounded px-6 py-2.5 text-sm font-medium transition-colors"
        >
          Upgrade ke Enterprise
        </Link>
      </div>
    </div>
  )
}
