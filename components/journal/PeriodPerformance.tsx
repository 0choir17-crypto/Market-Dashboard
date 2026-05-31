'use client'

import { useMemo, useState } from 'react'
import { Trade } from '@/types/trades'
import { isWin, isLoss, isBreakeven } from '@/lib/tradeResult'

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

function fmtYen(v: number): string {
  const sign = v >= 0 ? '+' : '-'
  return `${sign}¥${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`
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
    <div className="mb-6 bg-white rounded-xl border border-[#e8eaed] shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f0f2f4]">
        <h3 className="text-sm font-semibold text-gray-700">
          Period Performance
          <span className="ml-2 text-xs font-normal text-gray-400">
            {mode === 'month' ? '月別' : '年別'}成績
          </span>
        </h3>
        <div className="inline-flex rounded-lg border border-[#e8eaed] p-0.5 text-xs">
          {(['month', 'year'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                mode === m
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {m === 'month' ? '月別' : '年別'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[#f0f2f4]">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">
                {mode === 'month' ? '月' : '年'}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">
                Trades
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">
                W / L
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">
                Win Rate
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">
                PnL
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500 w-1/3">
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
                <tr key={b.key} className="border-b border-[#f0f2f4] hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono font-semibold text-gray-700">
                    {b.key}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{b.trades}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    <span className="text-emerald-600">{b.wins}</span>
                    <span className="text-gray-400 mx-0.5">/</span>
                    <span className="text-red-600">{b.losses}</span>
                    {b.breakevens > 0 && (
                      <>
                        <span className="text-gray-400 mx-0.5">/</span>
                        <span className="text-gray-500" title="BREAKEVEN">{b.breakevens}</span>
                      </>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono"
                    style={{
                      color: wr >= 50 ? 'var(--positive)' : 'var(--negative)',
                    }}
                  >
                    {wr.toFixed(1)}%
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono font-semibold"
                    style={{
                      color: pnlPositive ? 'var(--positive)' : 'var(--negative)',
                    }}
                  >
                    {fmtYen(b.pnl)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative h-3 w-full">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
                      <div
                        className="absolute top-0.5 bottom-0.5 rounded"
                        style={{
                          backgroundColor: pnlPositive ? '#10b981' : '#ef4444',
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
