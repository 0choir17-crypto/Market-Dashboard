'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Trade } from '@/types/trades'

type Props = {
  trades: Trade[]
}

type Point = {
  date: string
  cumulative: number
  pnl: number
  ticker: string
}

function fmtYen(v: number): string {
  const sign = v >= 0 ? '+' : '-'
  return `${sign}¥${Math.abs(Math.round(v)).toLocaleString('ja-JP')}`
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
      <div className="mb-6 bg-white rounded-xl border border-[#e8eaed] shadow-sm p-6 text-center text-sm text-gray-400">
        資産推移チャートを表示するには 2 件以上のクローズ済みトレードが必要です。
      </div>
    )
  }

  const final = data[data.length - 1].cumulative
  const peak = Math.max(...data.map(d => d.cumulative))
  const trough = Math.min(...data.map(d => d.cumulative))
  const maxDrawdown = data.reduce((dd, d, i) => {
    const peakSoFar = Math.max(...data.slice(0, i + 1).map(p => p.cumulative))
    const ddNow = d.cumulative - peakSoFar
    return Math.min(dd, ddNow)
  }, 0)

  const isUp = final >= 0
  const stroke = isUp ? '#10b981' : '#ef4444'
  const fill = isUp ? '#10b981' : '#ef4444'

  return (
    <div className="mb-6 bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Equity Curve <span className="text-xs font-normal text-gray-400">(累積 PnL)</span>
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
          <span>
            <span className="text-gray-500">Final: </span>
            <strong className={isUp ? 'text-emerald-600' : 'text-red-600'}>
              {fmtYen(final)}
            </strong>
          </span>
          <span>
            <span className="text-gray-500">Peak: </span>
            <strong className="text-gray-700">{fmtYen(peak)}</strong>
          </span>
          <span>
            <span className="text-gray-500">Trough: </span>
            <strong className="text-gray-700">{fmtYen(trough)}</strong>
          </span>
          <span>
            <span className="text-gray-500">Max DD: </span>
            <strong className="text-red-600">{fmtYen(maxDrawdown)}</strong>
          </span>
        </div>
      </div>
      <div className="h-64 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity={0.3} />
                <stop offset="100%" stopColor={fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f4" />
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
                border: '1px solid #e8eaed',
              }}
              formatter={(value, name) => {
                const v = typeof value === 'number' ? value : Number(value)
                if (name === 'cumulative') return [fmtYen(v), '累積 PnL']
                return [String(value), String(name)]
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as Point | undefined
                if (!p) return label
                return `${p.date}  ${p.ticker}  ${fmtYen(p.pnl)}`
              }}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={stroke}
              strokeWidth={2}
              fill="url(#equityFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
