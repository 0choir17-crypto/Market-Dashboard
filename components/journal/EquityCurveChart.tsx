'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Trade } from '@/types/trades'
import { formatYen } from '@/lib/format'

type Props = {
  trades: Trade[]
}

type Point = {
  date: string
  cumulative: number
  pnl: number
  ticker: string
}

function fmtAxis(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return v.toString()
}

export default function EquityCurveChart({ trades }: Props) {
  const data = useMemo<Point[]>(() => {
    const sorted = trades
      .filter(t => t.status === 'closed' && t.exit_date && t.pnl != null)
      .sort((a, b) => (a.exit_date ?? '').localeCompare(b.exit_date ?? ''))
    const points: Point[] = []
    let cum = 0
    for (const t of sorted) {
      cum += t.pnl ?? 0
      points.push({
        date: t.exit_date ?? '',
        cumulative: cum,
        pnl: t.pnl ?? 0,
        ticker: t.ticker,
      })
    }
    return points
  }, [trades])

  if (data.length < 2) {
    return (
      <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-6 text-center text-sm text-gray-400">
        資産推移チャートを表示するには 2 件以上のクローズ済みトレードが必要です。
      </div>
    )
  }

  const final = data[data.length - 1].cumulative
  const peak = Math.max(...data.map(d => d.cumulative))
  const trough = Math.min(...data.map(d => d.cumulative))
  // O(n) running-peak instead of the O(n²) slice-and-spread version.
  // 起点は 0（累積PnLはゼロから始まる）。-Infinity だと初回ピークが
  // 「最初のトレードの累積値」になり、開始直後に負け込んだ場合の
  // ドローダウンを過小表示してしまう。
  let runningPeak = 0
  let maxDrawdown = 0
  for (const d of data) {
    runningPeak = Math.max(runningPeak, d.cumulative)
    maxDrawdown = Math.min(maxDrawdown, d.cumulative - runningPeak)
  }

  const isUp = final >= 0
  const GREEN = '#10b981'
  const RED = '#ef4444'

  // Gradient offset for the 0 line: positions where y=0 sits inside the chart
  // (0 at top, 1 at bottom). When the curve never crosses 0, the gradient
  // collapses to a single color.
  const yMax = Math.max(0, peak)
  const yMin = Math.min(0, trough)
  const range = yMax - yMin
  const zeroOffset = range > 0 ? yMax / range : peak >= 0 ? 1 : 0

  return (
    <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Equity Curve <span className="text-xs font-normal text-gray-400">(累積 PnL)</span>
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
          <span>
            <span className="text-gray-500">Final: </span>
            <strong className={isUp ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
              {formatYen(final, { sign: true })}
            </strong>
          </span>
          <span>
            <span className="text-gray-500">Peak: </span>
            <strong className="text-gray-700">{formatYen(peak, { sign: true })}</strong>
          </span>
          <span>
            <span className="text-gray-500">Trough: </span>
            <strong className="text-gray-700">{formatYen(trough, { sign: true })}</strong>
          </span>
          <span>
            <span className="text-gray-500">Max DD: </span>
            <strong className="text-[var(--negative)]">{formatYen(maxDrawdown, { sign: true })}</strong>
          </span>
        </div>
      </div>
      <div className="h-64 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity={0.3} />
                <stop offset={`${zeroOffset * 100}%`} stopColor={GREEN} stopOpacity={0.02} />
                <stop offset={`${zeroOffset * 100}%`} stopColor={RED} stopOpacity={0.02} />
                <stop offset="100%" stopColor={RED} stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="equityStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} />
                <stop offset={`${zeroOffset * 100}%`} stopColor={GREEN} />
                <stop offset={`${zeroOffset * 100}%`} stopColor={RED} />
                <stop offset="100%" stopColor={RED} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#efe6cf" />
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickMargin={6}
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              width={48}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
              formatter={(value, name) => {
                const v = typeof value === 'number' ? value : Number(value)
                if (name === 'cumulative') return [formatYen(v, { sign: true }), '累積 PnL']
                return [String(value), String(name)]
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as Point | undefined
                if (!p) return label
                return `${p.date}  ${p.ticker}  ${formatYen(p.pnl, { sign: true })}`
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="url(#equityStroke)"
              strokeWidth={2}
              fill="url(#equityFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
