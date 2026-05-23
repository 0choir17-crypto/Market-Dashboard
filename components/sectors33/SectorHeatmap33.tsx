'use client'

import { useMemo, useState } from 'react'
import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'

type Props = {
  history: SectorHistoryResponse
}

type Metric = 'composite' | 'rank'

// Smooth red→yellow→green gradient for composite_score (0..100).
function compositeColor(v: number | null): { bg: string; fg: string } {
  if (v == null || !Number.isFinite(v)) return { bg: '#f3f4f6', fg: '#9ca3af' }
  const t = Math.max(0, Math.min(100, v)) / 100
  // 0 → red (#dc2626), 0.5 → amber (#f59e0b), 1 → green (#16a34a)
  let r: number, g: number, b: number
  if (t < 0.5) {
    const k = t / 0.5
    r = Math.round(220 + (245 - 220) * k)
    g = Math.round(38 + (158 - 38) * k)
    b = Math.round(38 + (11 - 38) * k)
  } else {
    const k = (t - 0.5) / 0.5
    r = Math.round(245 + (22 - 245) * k)
    g = Math.round(158 + (163 - 158) * k)
    b = Math.round(11 + (74 - 11) * k)
  }
  // Soften by blending toward white for legibility of numerals
  const bg = `rgb(${Math.round(r * 0.6 + 255 * 0.4)}, ${Math.round(g * 0.6 + 255 * 0.4)}, ${Math.round(b * 0.6 + 255 * 0.4)})`
  const fg = t < 0.35 ? '#7f1d1d' : t > 0.7 ? '#14532d' : '#78350f'
  return { bg, fg }
}

// Rank coloring: 1=best (green) → 33=worst (red). Inverted scale.
function rankColor(rank: number | null, max: number): { bg: string; fg: string } {
  if (rank == null) return { bg: '#f3f4f6', fg: '#9ca3af' }
  const t = 1 - Math.max(0, Math.min(max - 1, rank - 1)) / Math.max(1, max - 1)
  return compositeColor(t * 100)
}

function shortDate(d: string): string {
  // 'YYYY-MM-DD' → 'MM/DD'
  return d.slice(5).replace('-', '/')
}

export default function SectorHeatmap33({ history }: Props) {
  const { dates, bySector, sectorsRanked } = history
  const [metric, setMetric] = useState<Metric>('composite')

  const sectors = useMemo(() => sectorsRanked, [sectorsRanked])
  const maxRank = sectors.length

  if (sectors.length === 0 || dates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">Heatmap 用データがありません</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-sm font-semibold text-gray-500 mr-auto">
          Heatmap — Sector × {dates.length} 営業日（行=現在のスコア順）
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">指標:</span>
          {(['composite', 'rank'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 py-0.5 rounded border text-xs ${
                metric === m
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m === 'composite' ? 'Composite' : 'Rank'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 px-2 py-1 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-[#e8eaed]">
                Sector
              </th>
              {dates.map(d => (
                <th
                  key={d}
                  className="px-1 py-1 text-center font-mono text-[10px] text-gray-400 border-b border-[#e8eaed]"
                  style={{ minWidth: 38 }}
                >
                  {shortDate(d)}
                </th>
              ))}
              <th className="px-2 py-1 text-right font-semibold text-gray-500 whitespace-nowrap border-b border-[#e8eaed]">
                Δ
              </th>
            </tr>
          </thead>
          <tbody>
            {sectors.map(sector => {
              const series = bySector[sector] ?? {}
              const first = (() => {
                for (const d of dates) {
                  const v = series[d]?.composite_score
                  if (v != null) return v
                }
                return null
              })()
              const last = (() => {
                for (let i = dates.length - 1; i >= 0; i--) {
                  const v = series[dates[i]]?.composite_score
                  if (v != null) return v
                }
                return null
              })()
              const delta = first != null && last != null ? last - first : null
              return (
                <tr key={sector} className="hover:bg-blue-50/30">
                  <td className="sticky left-0 bg-white z-10 px-2 py-1 whitespace-nowrap text-gray-800 font-medium border-r border-[#e8eaed]">
                    {sector}
                  </td>
                  {dates.map(d => {
                    const row = series[d]
                    const val =
                      metric === 'composite'
                        ? row?.composite_score ?? null
                        : row?.composite_score_rank ?? null
                    const display = val == null ? '' : metric === 'composite' ? val.toFixed(0) : val.toString()
                    const { bg, fg } =
                      metric === 'composite'
                        ? compositeColor(val)
                        : rankColor(val, maxRank)
                    const title =
                      row == null
                        ? `${sector} — ${d}: 欠損`
                        : `${sector} — ${d}\nScore: ${row.composite_score?.toFixed(1) ?? '--'} (Rank ${row.composite_score_rank ?? '--'})`
                    return (
                      <td
                        key={d}
                        title={title}
                        className="text-center font-mono tabular-nums"
                        style={{
                          backgroundColor: bg,
                          color: fg,
                          padding: '4px 2px',
                          minWidth: 38,
                          borderTop: '1px solid #fff',
                          borderBottom: '1px solid #fff',
                          fontSize: 10.5,
                          fontWeight: 600,
                        }}
                      >
                        {display}
                      </td>
                    )
                  })}
                  <td
                    className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap"
                    style={{
                      color: delta == null ? '#9ca3af' : delta >= 0 ? '#16a34a' : '#dc2626',
                      fontWeight: 600,
                    }}
                  >
                    {delta == null ? '--' : `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-gray-500">
        <span>低</span>
        <span
          className="inline-block h-2 rounded"
          style={{
            width: 180,
            background:
              'linear-gradient(to right, rgb(228,129,129), rgb(249,196,107), rgb(133,189,121))',
          }}
        />
        <span>高</span>
        <span className="text-gray-400 ml-2">Δ = 期間始 → 末の composite 変化</span>
      </div>
    </div>
  )
}
