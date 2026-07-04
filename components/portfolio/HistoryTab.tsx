'use client'

import { Trade } from '@/types/trades'
import { formatYen, formatPct, formatR, pnlColorClass } from '@/lib/format'

type Props = {
  history: Trade[]
}

function fmt(v: number | null | undefined, d = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function PnlCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 font-mono text-xs">—</span>
  return (
    <span className={`font-mono text-xs font-semibold ${pnlColorClass(value)}`}>
      {formatYen(value, { sign: true })}
    </span>
  )
}

function RCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 font-mono text-xs">—</span>
  return (
    <span className={`font-mono text-xs font-bold ${pnlColorClass(value)}`}>
      {formatR(value)}
    </span>
  )
}

function ExitBadge({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-gray-400 text-xs">—</span>
  const colors: Record<string, string> = {
    '利確': 'bg-green-50 text-green-700 border-green-200',
    '損切': 'bg-red-50 text-red-600 border-red-200',
    'トレール損切': 'bg-orange-50 text-orange-700 border-orange-200',
    '目標達成': 'bg-blue-50 text-blue-700 border-blue-200',
  }
  const cls = colors[reason] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{reason}</span>
  )
}

function holdDays(entry: string | null, exit: string | null): number | null {
  if (!entry || !exit) return null
  const d = (new Date(exit).getTime() - new Date(entry).getTime()) / 86400000
  return Math.round(d)
}

export default function HistoryTab({ history }: Props) {
  // Statistics
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

  return (
    <div>
      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Win Rate', value: winRate != null ? formatPct(winRate, { digits: 1 }) : '—', color: winRate != null && winRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]' },
          { label: 'Avg R', value: formatR(avgR), color: avgR != null && avgR >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]' },
          { label: 'Profit Factor', value: profitFactor != null ? profitFactor.toFixed(2) : '—', color: profitFactor != null && profitFactor >= 1.5 ? 'text-[var(--positive)]' : 'text-gray-700' },
          { label: 'Total PnL', value: trades.length > 0 ? formatYen(totalPnl, { sign: true }) : '—', color: pnlColorClass(totalPnl) },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e8eaed] shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
            <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Trades', value: String(trades.length) },
          { label: 'Wins', value: String(wins.length) },
          { label: 'Losses', value: String(losses.length) },
          { label: 'Avg Hold', value: avgHoldDays != null ? `${avgHoldDays.toFixed(1)}d` : '—' },
          { label: 'Max Win', value: formatYen(maxWin, { sign: true }) },
          { label: 'Max Loss', value: formatYen(maxLoss, { sign: true }) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e8eaed] shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
            <p className="text-sm font-semibold text-gray-700 font-mono">{value}</p>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto hidden sm:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-t border-[#e8eaed]">
              {['Ticker','Name','Entry Date','Exit Date','Entry','Exit','Shares','PnL','R','Exit Reason','Memo'].map(h => (
                <th key={h} className={`px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide whitespace-nowrap ${h === 'Ticker' || h === 'Name' || h === 'Memo' ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.id} className={`border-b border-[#f0f2f4] hover:bg-[var(--bg-card-hover)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <a href={`https://jp.tradingview.com/chart/?symbol=TSE:${h.ticker}`} target="_blank" rel="noreferrer"
                     className="font-mono font-bold text-blue-600 hover:underline text-xs">{h.ticker}</a>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700">{h.company_name ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap text-gray-600">{h.entry_date ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap text-gray-600">{h.exit_date ?? '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{h.entry_price != null ? `¥${fmt(h.entry_price)}` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{h.exit_price != null ? `¥${fmt(h.exit_price)}` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(h.shares)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><PnlCell value={h.pnl} /></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><RCell value={h.r_multiple} /></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><ExitBadge reason={h.exit_reason} /></td>
                <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[120px]">
                  <span className="block truncate">{h.memo ?? '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">No trade history</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="block sm:hidden space-y-3">
        {history.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No trade history</p>}
        {history.map(h => (
          <div key={h.id} className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <a href={`https://jp.tradingview.com/chart/?symbol=TSE:${h.ticker}`} target="_blank" rel="noreferrer"
                   className="font-mono font-bold text-blue-600 text-sm">{h.ticker}</a>
                {h.company_name && <span className="ml-2 text-xs text-gray-600">{h.company_name}</span>}
              </div>
              <ExitBadge reason={h.exit_reason} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-2">
              <div><span className="text-gray-400 block">Entry</span><span className="font-mono">{h.entry_date ?? '—'}</span></div>
              <div><span className="text-gray-400 block">Exit</span><span className="font-mono">{h.exit_date ?? '—'}</span></div>
              <div><span className="text-gray-400 block">Shares</span><span className="font-mono">{fmt(h.shares)}</span></div>
              <div><span className="text-gray-400 block">Buy</span><span className="font-mono">{h.entry_price != null ? `¥${fmt(h.entry_price)}` : '—'}</span></div>
              <div><span className="text-gray-400 block">Sell</span><span className="font-mono">{h.exit_price != null ? `¥${fmt(h.exit_price)}` : '—'}</span></div>
              <div><span className="text-gray-400 block">R</span><RCell value={h.r_multiple} /></div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">PnL</span>
              <PnlCell value={h.pnl} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
