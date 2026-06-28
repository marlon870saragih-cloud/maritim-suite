'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Scale, Wallet, Link2 } from 'lucide-react'

export type DisbDoc = {
  id: string
  docNumber: string
  vessel: string
  sections: { letter: string; title: string; amount: number }[]
  subtotal: number
  agency: number
  total: number
}
export type InvDoc = {
  id: string
  docNumber: string
  vessel: string
  subtotal: number
  agency: number
  vat: number
  total: number
}

const fmt = (n: number) => (n || 0).toLocaleString('en-US')
const signFmt = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))
const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 100) : Math.round((a / b) * 1000) / 10)

const selCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-text-secondary text-sm py-8 text-center">{children}</p>
}

export function ProfitVariance({
  epdas,
  fpdas,
  invoices,
}: {
  epdas: DisbDoc[]
  fpdas: DisbDoc[]
  invoices: InvDoc[]
}) {
  const [epdaId, setEpdaId] = useState(epdas[0]?.id ?? '')
  const [fpdaId, setFpdaId] = useState(fpdas[0]?.id ?? '')
  const [plFpdaId, setPlFpdaId] = useState(fpdas[0]?.id ?? '')
  const [invId, setInvId] = useState(invoices[0]?.id ?? '')

  const epda = epdas.find((d) => d.id === epdaId) ?? null
  const fpda = fpdas.find((d) => d.id === fpdaId) ?? null
  const plFpda = fpdas.find((d) => d.id === plFpdaId) ?? null
  const inv = invoices.find((d) => d.id === invId) ?? null

  // Auto-pasangkan dokumen sekapal: nama kapal dinormalkan (buang voyage "· V.118").
  const sameVessel = (a: string, b: string) =>
    !!a && !!b && a.split('·')[0].trim().toLowerCase() === b.split('·')[0].trim().toLowerCase()

  // EPDA dipilih → FPDA sekapal otomatis terpilih (untuk Variance).
  useEffect(() => {
    if (!epda) return
    const m = fpdas.find((f) => sameVessel(f.vessel, epda.vessel))
    if (m && m.id !== fpdaId) setFpdaId(m.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epdaId])

  // Invoice dipilih → FPDA sekapal otomatis terpilih (untuk P&L).
  useEffect(() => {
    if (!inv) return
    const m = fpdas.find((f) => sameVessel(f.vessel, inv.vessel))
    if (m && m.id !== plFpdaId) setPlFpdaId(m.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invId])

  // ===== Variance EPDA vs FPDA: gabung per huruf seksi =====
  const variance = useMemo(() => {
    if (!epda || !fpda) return null
    const letters = Array.from(
      new Set([...epda.sections.map((s) => s.letter), ...fpda.sections.map((s) => s.letter)]),
    ).sort()
    const rows = letters.map((L) => {
      const e = epda.sections.find((s) => s.letter === L)
      const f = fpda.sections.find((s) => s.letter === L)
      const est = e?.amount ?? 0
      const act = f?.amount ?? 0
      return { letter: L, title: f?.title ?? e?.title ?? '', est, act, delta: act - est }
    })
    const totals = {
      est: epda.subtotal,
      act: fpda.subtotal,
      delta: fpda.subtotal - epda.subtotal,
      estTotal: epda.total,
      actTotal: fpda.total,
      deltaTotal: fpda.total - epda.total,
    }
    return { rows, totals }
  }, [epda, fpda])

  // ===== P&L: pendapatan jasa (Invoice tanpa PPN) − biaya disbursement aktual (FPDA) =====
  const pl = useMemo(() => {
    if (!plFpda || !inv) return null
    const revenue = inv.subtotal + inv.agency // ditagih ke principal, di luar PPN
    const cost = plFpda.subtotal // disbursement aktual (pass-through)
    const grossProfit = revenue - cost
    const margin = revenue === 0 ? 0 : Math.round((grossProfit / revenue) * 1000) / 10
    return { revenue, cost, agencyFee: inv.agency, vat: inv.vat, grossProfit, margin }
  }, [plFpda, inv])

  return (
    <div className="space-y-6">
      {/* ====== VARIANCE ====== */}
      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="w-4 h-4 text-accent-blue" />
          <h2 className="font-display text-lg text-white">Variance — Estimasi vs Aktual</h2>
        </div>

        {epdas.length === 0 || fpdas.length === 0 ? (
          <Empty>Butuh minimal 1 EPDA dan 1 FPDA tersimpan untuk membandingkan.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls}>EPDA (estimasi)</label>
                <select className={selCls} value={epdaId} onChange={(e) => setEpdaId(e.target.value)}>
                  {epdas.map((d) => (
                    <option key={d.id} value={d.id} className="bg-surface">
                      {d.docNumber}{d.vessel ? ` · ${d.vessel}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${labelCls} flex items-center gap-1`}>FPDA (aktual) <Link2 className="w-3 h-3 text-accent-teal" /><span className="text-accent-teal/70 normal-case tracking-normal">auto sekapal</span></label>
                <select className={selCls} value={fpdaId} onChange={(e) => setFpdaId(e.target.value)}>
                  {fpdas.map((d) => (
                    <option key={d.id} value={d.id} className="bg-surface">
                      {d.docNumber}{d.vessel ? ` · ${d.vessel}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {variance && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-card-border text-[10px] font-mono uppercase tracking-wider text-text-secondary/70">
                      <th className="text-left px-3 py-2 font-medium">Seksi</th>
                      <th className="text-right px-3 py-2 font-medium">Estimasi (EPDA)</th>
                      <th className="text-right px-3 py-2 font-medium">Aktual (FPDA)</th>
                      <th className="text-right px-3 py-2 font-medium">Selisih</th>
                      <th className="text-right px-3 py-2 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variance.rows.map((r) => (
                      <tr key={r.letter} className="border-b border-card-border/50">
                        <td className="px-3 py-2 text-text-primary">
                          <span className="text-accent-amber font-mono mr-1.5">{r.letter}</span>
                          {r.title}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmt(r.est)}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-primary">{fmt(r.act)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${r.delta > 0 ? 'text-status-danger' : r.delta < 0 ? 'text-status-success' : 'text-text-secondary'}`}>
                          {signFmt(r.delta)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${r.delta > 0 ? 'text-status-danger' : r.delta < 0 ? 'text-status-success' : 'text-text-secondary'}`}>
                          {r.est ? `${signFmt(pct(r.delta, r.est))}%` : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-card-border font-medium">
                      <td className="px-3 py-2 text-text-primary">Subtotal disbursement</td>
                      <td className="px-3 py-2 text-right font-mono text-text-secondary">{fmt(variance.totals.est)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-primary">{fmt(variance.totals.act)}</td>
                      <td className={`px-3 py-2 text-right font-mono ${variance.totals.delta > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {signFmt(variance.totals.delta)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${variance.totals.delta > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {variance.totals.est ? `${signFmt(pct(variance.totals.delta, variance.totals.est))}%` : '—'}
                      </td>
                    </tr>
                    <tr className="bg-surface-tertiary/40">
                      <td className="px-3 py-2.5 text-white font-semibold">Total (termasuk agency)</td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-secondary">{fmt(variance.totals.estTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-white">{fmt(variance.totals.actTotal)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-semibold ${variance.totals.deltaTotal > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {signFmt(variance.totals.deltaTotal)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${variance.totals.deltaTotal > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {variance.totals.estTotal ? `${signFmt(pct(variance.totals.deltaTotal, variance.totals.estTotal))}%` : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-text-secondary/70 mt-2 flex items-center gap-1.5">
                  {variance.totals.deltaTotal > 0 ? (
                    <><TrendingUp className="w-3.5 h-3.5 text-status-danger" /> Aktual melebihi estimasi — perlu tagih selisih / revisi estimasi berikutnya.</>
                  ) : (
                    <><TrendingDown className="w-3.5 h-3.5 text-status-success" /> Aktual di bawah estimasi — ada sisa dana muka untuk dikembalikan / dialihkan.</>
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* ====== P&L ====== */}
      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-4 h-4 text-accent-teal" />
          <h2 className="font-display text-lg text-white">Laba (P&amp;L) — Pendapatan vs Biaya</h2>
        </div>

        {fpdas.length === 0 || invoices.length === 0 ? (
          <Empty>Butuh minimal 1 FPDA dan 1 Invoice tersimpan untuk menghitung laba.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls}>Invoice (pendapatan)</label>
                <select className={selCls} value={invId} onChange={(e) => setInvId(e.target.value)}>
                  {invoices.map((d) => (
                    <option key={d.id} value={d.id} className="bg-surface">
                      {d.docNumber}{d.vessel ? ` · ${d.vessel}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`${labelCls} flex items-center gap-1`}>FPDA (biaya aktual) <Link2 className="w-3 h-3 text-accent-teal" /><span className="text-accent-teal/70 normal-case tracking-normal">auto sekapal</span></label>
                <select className={selCls} value={plFpdaId} onChange={(e) => setPlFpdaId(e.target.value)}>
                  {fpdas.map((d) => (
                    <option key={d.id} value={d.id} className="bg-surface">
                      {d.docNumber}{d.vessel ? ` · ${d.vessel}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {pl && (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5 items-start">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-card-border/50">
                    <span className="text-text-secondary">Pendapatan jasa (Invoice, tanpa PPN)</span>
                    <span className="font-mono text-text-primary">{fmt(pl.revenue)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-card-border/50">
                    <span className="text-text-secondary">(−) Disbursement aktual (FPDA)</span>
                    <span className="font-mono text-status-danger">({fmt(pl.cost)})</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-text-secondary">Termasuk agency fee</span>
                    <span className="font-mono text-text-secondary">{fmt(pl.agencyFee)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-text-secondary/70 text-xs">PPN dipungut (diteruskan ke negara)</span>
                    <span className="font-mono text-text-secondary/70 text-xs">{fmt(pl.vat)}</span>
                  </div>
                </div>
                <div className={`rounded-lg p-4 border ${pl.grossProfit >= 0 ? 'bg-status-success/5 border-status-success/30' : 'bg-status-danger/5 border-status-danger/30'}`}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">Laba Kotor</p>
                  <p className={`font-display text-2xl mt-1 ${pl.grossProfit >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                    IDR {fmt(pl.grossProfit)}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Margin {pl.margin}% dari pendapatan</p>
                </div>
              </div>
            )}
            <p className="text-[11px] text-text-secondary/70 mt-4 leading-relaxed">
              Laba kotor = pendapatan jasa yang ditagih (subtotal + agency fee, di luar PPN) dikurangi disbursement
              aktual yang dibayarkan. Pilih FPDA &amp; Invoice untuk port call yang sama agar akurat.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
