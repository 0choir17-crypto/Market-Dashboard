'use client'

import { Trade } from '@/types/trades'
import Tooltip from '@/components/shared/Tooltip'

type Props = {
  trades: Trade[]
}

function fmtYen(v: number | null | undefined): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : '-'
  return `${sign}¥${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`
}

function holdDays(entry: string | null, exit: string | null): number | null {
  if (!entry || !exit) return null
  const ms = new Date(exit).getTime() - new Date(entry).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round(ms / 86400000))
}

function isWin(t: Trade): boolean {
  if (t.result === 'WIN') return true
  if (t.result === 'LOSS') return false
  // Fallback: imported trades may have no `result` but a real pnl.
  return (t.pnl ?? 0) > 0
}

function isLoss(t: Trade): boolean {
  if (t.result === 'LOSS') return true
  if (t.result === 'WIN') return false
  return (t.pnl ?? 0) < 0
}

function Stat({
  label,
  value,
  sub,
  color,
  tooltip,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  tooltip?: string
}) {
  const labelEl = tooltip ? (
    <Tooltip content={tooltip}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </Tooltip>
  ) : (
    <span className="text-xs font-medium text-gray-500">{label}</span>
  )
  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm px-4 py-3">
      <div className="mb-1">{labelEl}</div>
      <p
        className="text-lg font-bold font-mono leading-tight"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function JournalStats({ trades }: Props) {
  const open = trades.filter(t => t.status === 'open')
  const closed = trades.filter(t => t.status === 'closed')
  if (closed.length === 0 && open.length === 0) return null

  const wins = closed.filter(isWin)
  const losses = closed.filter(isLoss)
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : null
  const avgPnlPct = closed.length > 0
    ? closed.reduce((sum, t) => sum + (t.pnl_pct ?? 0), 0) / closed.length
    : null
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0)

  const grossProfit = wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0))
  const pf = grossLoss > 0
    ? grossProfit / grossLoss
    : grossProfit > 0 ? Infinity : null

  const holds = closed
    .map(t => holdDays(t.entry_date, t.exit_date))
    .filter((d): d is number => d != null)
  const avgHold = holds.length > 0
    ? holds.reduce((a, b) => a + b, 0) / holds.length
    : null

  const maxWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl ?? 0)) : null
  const maxLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl ?? 0)) : null

  const unreviewedCount = closed.filter(t => !t.reviewed_at).length

  const pnlColor = totalPnl >= 0 ? 'var(--positive)' : 'var(--negative)'
  const wrColor =
    winRate == null ? undefined : winRate >= 50 ? 'var(--positive)' : 'var(--negative)'
  const pfColor =
    pf == null ? undefined : pf >= 1.5 ? 'var(--positive)' : pf >= 1 ? undefined : 'var(--negative)'

  return (
    <div className="mb-6 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat
          label="Total"
          value={`${closed.length} trades`}
          sub={open.length > 0 ? `+ ${open.length} open` : undefined}
        />
        <Stat
          label="Win Rate"
          value={winRate != null ? `${winRate.toFixed(1)}%` : '—'}
          sub={`${wins.length}W / ${losses.length}L`}
          color={wrColor}
        />
        <Stat
          label="Total PnL"
          value={fmtYen(totalPnl)}
          sub={avgPnlPct != null
            ? `Avg ${avgPnlPct >= 0 ? '+' : ''}${avgPnlPct.toFixed(2)}%`
            : undefined}
          color={pnlColor}
        />
        <Stat
          label="Profit Factor"
          tooltip="総利益 ÷ 総損失 (絶対値)。1 を超えれば期待値プラス。1.5 以上で健全、2 以上で優秀。例: PF=1.5 → 1 円損するごとに 1.5 円稼いでいる。"
          value={
            pf == null ? '—' : pf === Infinity ? '∞' : pf.toFixed(2)
          }
          color={pfColor}
        />
        <Stat
          label="🔍 Unreviewed"
          value={`${unreviewedCount}`}
          color={unreviewedCount > 0 ? 'var(--warning, #d97706)' : 'var(--text-muted)'}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <Stat
          label="Avg Hold"
          value={avgHold != null ? `${avgHold.toFixed(1)}日` : '—'}
        />
        <Stat
          label="Max Win"
          value={maxWin != null ? fmtYen(maxWin) : '—'}
          color={maxWin != null ? 'var(--positive)' : undefined}
        />
        <Stat
          label="Max Loss"
          value={maxLoss != null ? fmtYen(maxLoss) : '—'}
          color={maxLoss != null ? 'var(--negative)' : undefined}
        />
        <Stat
          label="Open"
          value={`${open.length}`}
        />
      </div>
    </div>
  )
}
