'use client'

import { Trade } from '@/types/trades'

type Props = {
  trades: Trade[]
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'default' | 'warning' | 'muted' }) {
  const valueClass =
    tone === 'warning' ? 'text-amber-600' :
    tone === 'muted'   ? 'text-gray-400' :
    'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function TradeSummary({ trades }: Props) {
  const closed = trades.filter(t => t.status === 'closed')
  const open = trades.filter(t => t.status === 'open')

  if (closed.length === 0 && open.length === 0) return null

  const wins = closed.filter(t => t.result === 'WIN')
  const losses = closed.filter(t => t.result === 'LOSS')
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0
  const avgPnl = closed.length > 0
    ? closed.reduce((sum, t) => sum + (t.pnl_pct ?? 0), 0) / closed.length
    : 0
  const grossProfit = wins.reduce((sum, t) => sum + (t.pnl_pct ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl_pct ?? 0), 0))
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const unreviewedCount = closed.filter(t => !t.reviewed_at).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      <StatCard
        label="Total"
        value={`${closed.length} trades`}
        sub={open.length > 0 ? `+ ${open.length} open` : undefined}
      />
      <StatCard
        label="Win Rate"
        value={closed.length > 0 ? `${winRate.toFixed(1)}%` : '—'}
        sub={closed.length > 0 ? `${wins.length}W / ${losses.length}L` : undefined}
      />
      <StatCard
        label="Avg PnL"
        value={closed.length > 0 ? `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%` : '—'}
      />
      <StatCard
        label="PF"
        value={closed.length > 0 ? (pf === Infinity ? '∞' : pf.toFixed(2)) : '—'}
      />
      <StatCard
        label="🔍 Unreviewed"
        value={closed.length > 0 ? `${unreviewedCount}` : '—'}
        tone={unreviewedCount > 0 ? 'warning' : 'muted'}
      />
    </div>
  )
}
