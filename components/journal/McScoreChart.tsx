'use client'

import { useMemo } from 'react'
import { Trade } from '@/types/trades'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'

type Props = {
  trades: Trade[]
}

// MCV4 (0-100) buckets。regime 境界 80/60/40/20 に合わせて 5 区分。
// v3 と v4 は別スコアリング系（因子・重み違い）なので混ぜずに v4 trade のみ集計。
const BUCKETS = [
  { label: '0-20',   min: 0,  max: 20  },  // strong_bear
  { label: '20-40',  min: 20, max: 40  },  // bear
  { label: '40-60',  min: 40, max: 60  },  // neutral
  { label: '60-80',  min: 60, max: 80  },  // bull
  { label: '80-100', min: 80, max: 101 },  // strong_bull (max=101 で 100 を含む)
]

const REGIME_ORDER = ['Strong Bull', 'Bull', 'Neutral', 'Bear', 'Strong Bear']

function getBarColor(wr: number): string {
  if (wr >= 70) return '#10b981'      // emerald-500
  if (wr >= 55) return '#34d399'      // emerald-400
  if (wr >= 45) return '#9ca3af'      // gray-400
  if (wr >= 30) return '#fb923c'      // orange-400
  return '#ef4444'                     // red-500
}

export default function McScoreChart({ trades }: Props) {
  const closed = useMemo(
    () => trades.filter(t => t.status === 'closed'),
    [trades]
  )

  // MCV4 trade のみ (mc_score_version='v4' & mc_score 非null)。
  // v3 (legacy, 2026-04-26 以前) はスコアリング系が違うため除外。
  const v4Closed = useMemo(
    () => closed.filter(t => t.mc_score_version === 'v4' && t.mc_score != null),
    [closed]
  )
  const v3ExcludedCount = closed.length - v4Closed.length

  // MCV4 帯別 WR データ
  const chartData = useMemo(() => {
    return BUCKETS.map(b => {
      const inBucket = v4Closed.filter(t => {
        const v = t.mc_score as number
        return v >= b.min && v < b.max
      })
      const bucketWins = inBucket.filter(t => t.result === 'WIN')
      const winRate = inBucket.length > 0 ? (bucketWins.length / inBucket.length) * 100 : 0
      return {
        label: b.label,
        winRate: Math.round(winRate * 10) / 10,
        count: inBucket.length,
      }
    })
  }, [v4Closed])

  // Regime別テーブルデータ (MCV4 trade のみ)
  const regimeData = useMemo(() => {
    return REGIME_ORDER.map(regime => {
      const inRegime = v4Closed.filter(t => t.mc_regime === regime)
      const wins = inRegime.filter(t => t.result === 'WIN')
      const losses = inRegime.filter(t => t.result === 'LOSS')
      const wr = inRegime.length > 0 ? (wins.length / inRegime.length) * 100 : 0
      const avgPnl = inRegime.length > 0
        ? inRegime.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / inRegime.length
        : 0
      const grossProfit = wins.reduce((s, t) => s + (t.pnl_pct ?? 0), 0)
      const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl_pct ?? 0), 0))
      const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
      return {
        regime,
        trades: inRegime.length,
        wins: wins.length,
        losses: losses.length,
        wr,
        avgPnl,
        pf,
      }
    }).filter(r => r.trades > 0)
  }, [v4Closed])

  if (closed.length === 0) return null

  return (
    <div className="space-y-6 mb-6">
      {/* MCV4 帯別WRチャート */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Win Rate by MCV4 Band</h3>
          <span className="text-xs text-gray-400">
            n={v4Closed.length} (MCV4 trades only{v3ExcludedCount > 0 ? `, v3 excluded: ${v3ExcludedCount}` : ''})
          </span>
        </div>
        {v4Closed.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">
            MCV4 trade がまだありません (v4 cutover: 2026-04-26)
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
            <Tooltip
              formatter={(value) => [`${value}%`, 'WR']}
              labelFormatter={(l) => `MCV4: ${l}`}
            />
            <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={getBarColor(entry.winRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

      {/* Regime別テーブル (MCV4 trade のみ) */}
      {regimeData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
            Performance by MCV4 Regime
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Regime</th>
                <th className="px-3 py-2 text-right">Trades</th>
                <th className="px-3 py-2 text-right">W</th>
                <th className="px-3 py-2 text-right">L</th>
                <th className="px-3 py-2 text-right">WR</th>
                <th className="px-3 py-2 text-right">Avg PnL</th>
                <th className="px-3 py-2 text-right">PF</th>
              </tr>
            </thead>
            <tbody>
              {regimeData.map(r => (
                <tr key={r.regime} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.regime}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{r.trades}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{r.wins}</td>
                  <td className="px-3 py-2 text-right text-red-600">{r.losses}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.wr.toFixed(1)}%</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.avgPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.avgPnl >= 0 ? '+' : ''}{r.avgPnl.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.pf === Infinity ? '∞' : r.pf.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
