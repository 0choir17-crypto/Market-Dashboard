'use client'

import { Trade } from '@/types/trades'

type Props = {
  history: Trade[]
}

function fmt(v: number | null | undefined, d = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function holdDays(entry: string | null, exit: string | null): number | null {
  if (!entry || !exit) return null
  const d = (new Date(exit).getTime() - new Date(entry).getTime()) / 86400000
  return Math.round(d)
}

export default function HistoryStats({ history }: Props) {
  const trades = history.filter(h => h.pnl != null)
  const wins = trades.filter(h => (h.r_multiple ?? 0) >= 0)
  const losses = trades.filter(h => (h.r_multiple ?? 0) < 0)
  const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : null
  const totalPnl = trades.reduce((sum, h) => sum + (h.pnl ?? 0), 0)
  const avgR = trades.length > 0
    ? trades.reduce((sum, h) => sum + (h.r_multiple ?? 0), 0) / trades.length
    : null
  const grossWin = wins.reduce((sum, h) => sum + (h.pnl ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, h) => sum + (h.pnl ?? 0), 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null
  const holdDaysAll = trades.map(h => holdDays(h.entry_date, h.exit_date)).filter((d): d is number => d != null)
  const avgHoldDays = holdDaysAll.length > 0 ? holdDaysAll.reduce((a, b) => a + b, 0) / holdDaysAll.length : null
  const maxWin = wins.length > 0 ? Math.max(...wins.map(h => h.pnl ?? 0)) : null
  const maxLoss = losses.length > 0 ? Math.min(...losses.map(h => h.pnl ?? 0)) : null

  if (trades.length === 0) return null

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Win Rate', value: winRate != null ? `${winRate.toFixed(1)}%` : '—', color: winRate != null && winRate >= 50 ? 'text-green-600' : 'text-red-500' },
          { label: 'Avg R', value: avgR != null ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—', color: avgR != null && avgR >= 0 ? 'text-green-600' : 'text-red-500' },
          { label: 'Profit Factor', value: profitFactor != null ? profitFactor.toFixed(2) : '—', color: profitFactor != null && profitFactor >= 1.5 ? 'text-green-600' : 'text-gray-700' },
          { label: 'Total PnL', value: trades.length > 0 ? `${totalPnl >= 0 ? '+' : ''}¥${fmt(totalPnl)}` : '—', color: totalPnl >= 0 ? 'text-green-600' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e8eaed] shadow-sm px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: 'Trades', value: String(trades.length) },
          { label: 'Wins', value: String(wins.length) },
          { label: 'Losses', value: String(losses.length) },
          { label: 'Avg Hold', value: avgHoldDays != null ? `${avgHoldDays.toFixed(1)}d` : '—' },
          { label: 'Max Win', value: maxWin != null ? `+¥${fmt(maxWin)}` : '—' },
          { label: 'Max Loss', value: maxLoss != null ? `¥${fmt(maxLoss)}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e8eaed] shadow-sm px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-sm font-semibold text-gray-700 font-mono">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
