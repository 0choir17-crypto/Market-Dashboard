'use client'

import { useMemo, useState } from 'react'
import { Trade } from '@/types/trades'
import { isWin, isLoss, isBreakeven } from '@/lib/tradeResult'
import { formatYen, formatPct, pnlColorClass } from '@/lib/format'

type Props = {
  trades: Trade[]
}

type Mode = 'month' | 'year'

type Bucket = {
  key: string
  trades: number
  wins: number
  losses: number
  breakevens: number
  pnl: number
}

function bucketKey(date: string, mode: Mode): string {
  // date is YYYY-MM-DD; take YYYY-MM or YYYY
  return mode === 'month' ? date.slice(0, 7) : date.slice(0, 4)
}

export default function PeriodPerformance({ trades }: Props) {
  const [mode, setMode] = useState<Mode>('month')

  const buckets = useMemo<Bucket[]>(() => {
    const closed = trades.filter(t => t.status === 'closed' && t.exit_date)
    const map = new Map<string, Bucket>()
    for (const t of closed) {
      const key = bucketKey(t.exit_date as string, mode)
      const b = map.get(key) ?? { key, trades: 0, wins: 0, losses: 0, breakevens: 0, pnl: 0 }
      b.trades += 1
      if (isWin(t)) b.wins += 1
      else if (isLoss(t)) b.losses += 1
      else if (isBreakeven(t)) b.breakevens += 1
      b.pnl += t.pnl ?? 0
      map.set(key, b)
    }
    return [...map.values()].sort((a, b) => (b.key > a.key ? 1 : -1))
  }, [trades, mode])

  if (buckets.length === 0) return null

  const maxAbsPnl = Math.max(1, ...buckets.map(b => Math.abs(b.pnl)))

  return (
    <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-small font-medium text-[var(--text-primary)]">
          Period Performance
          <span className="ml-2 text-caption font-normal text-[var(--text-muted)]">
            {mode === 'month' ? '月別' : '年別'}成績
          </span>
        </h3>
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-caption">
          {(['month', 'year'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                mode === m
                  ? 'bg-[var(--sem-focus-fg)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              {m === 'month' ? '月別' : '年別'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="bg-[var(--bg-card-hover)] border-b border-[var(--border-subtle)]">
              <th className="px-3 py-2 text-left text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                {mode === 'month' ? '月' : '年'}
              </th>
              <th className="px-3 py-2 text-right text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Trades
              </th>
              <th className="px-3 py-2 text-right text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                W / L
              </th>
              <th className="px-3 py-2 text-right text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                Win Rate
              </th>
              <th className="px-3 py-2 text-right text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                PnL
              </th>
              <th className="px-3 py-2 text-left text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)] w-1/3">
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const decided = b.wins + b.losses
              const wr = decided > 0 ? (b.wins / decided) * 100 : 0
              const pnlPositive = b.pnl >= 0
              const barWidthPct = (Math.abs(b.pnl) / maxAbsPnl) * 100
              return (
                <tr key={b.key} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]">
                  <td className="px-3 py-2 font-mono font-medium text-[var(--text-primary)]">
                    {b.key}
                  </td>
                  <td className="px-3 py-2 text-right num">{b.trades}</td>
                  <td className="px-3 py-2 text-right num text-caption">
                    <span className="text-[var(--positive)]">{b.wins}</span>
                    <span className="text-[var(--text-muted)] mx-0.5">/</span>
                    <span className="text-[var(--negative)]">{b.losses}</span>
                    {b.breakevens > 0 && (
                      <>
                        <span className="text-[var(--text-muted)] mx-0.5">/</span>
                        <span className="text-[var(--text-secondary)]" title="BREAKEVEN">{b.breakevens}</span>
                      </>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right num"
                    style={{
                      color: wr >= 50 ? 'var(--positive)' : 'var(--negative)',
                    }}
                  >
                    {formatPct(wr, { digits: 1 })}
                  </td>
                  <td
                    className={`px-3 py-2 text-right num font-medium ${pnlColorClass(b.pnl)}`}
                  >
                    {formatYen(b.pnl, { sign: true })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative h-3 w-full">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--sem-idle-bd)]" />
                      <div
                        className="absolute top-0.5 bottom-0.5 rounded"
                        style={{
                          backgroundColor: pnlPositive ? 'var(--positive)' : 'var(--negative)',
                          width: `${barWidthPct / 2}%`,
                          left: pnlPositive ? '50%' : `${50 - barWidthPct / 2}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
