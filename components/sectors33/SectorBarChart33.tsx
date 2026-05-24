'use client'

import { useMemo, useState } from 'react'
import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'

type Props = {
  history: SectorHistoryResponse
}

type SortKey = 'score' | 'delta'

function phaseColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#eab308'
  return '#ef4444'
}

function phaseBorder(score: number): string {
  if (score >= 70) return '#16a34a'
  if (score >= 40) return '#ca8a04'
  return '#dc2626'
}

type SectorSeries = {
  sector: string
  points: { date: string; v: number | null }[]
  latest: number | null
  delta21d: number | null
  rank: number | null
}

const CHART_H = 56

export default function SectorBarChart33({ history }: Props) {
  const { dates, bySector, sectorsRanked } = history
  const [sortKey, setSortKey] = useState<SortKey>('score')

  const seriesList: SectorSeries[] = useMemo(() => {
    return sectorsRanked.map(sector => {
      const series = bySector[sector] ?? {}
      const points = dates.map(d => ({ date: d, v: series[d]?.composite_score ?? null }))
      const lastIdx = (() => {
        for (let i = points.length - 1; i >= 0; i--) if (points[i].v != null) return i
        return -1
      })()
      const latest = lastIdx >= 0 ? (points[lastIdx].v as number) : null
      let delta21d: number | null = null
      if (lastIdx >= 21 && points[lastIdx - 21].v != null && latest != null) {
        delta21d = +(latest - (points[lastIdx - 21].v as number)).toFixed(1)
      } else if (lastIdx >= 1 && latest != null) {
        const firstValid = points.find(p => p.v != null)
        if (firstValid) delta21d = +(latest - (firstValid.v as number)).toFixed(1)
      }
      const rank = lastIdx >= 0 ? series[points[lastIdx].date]?.composite_score_rank ?? null : null
      return { sector, points, latest, delta21d, rank }
    })
  }, [sectorsRanked, bySector, dates])

  const sorted = useMemo(() => {
    const arr = [...seriesList]
    arr.sort((a, b) => {
      if (sortKey === 'delta') return (b.delta21d ?? -Infinity) - (a.delta21d ?? -Infinity)
      return (b.latest ?? -Infinity) - (a.latest ?? -Infinity)
    })
    return arr
  }, [seriesList, sortKey])

  if (seriesList.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">Bar chart 用データがありません</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-sm font-semibold text-gray-500 mr-auto">
          RS Bar Chart — 各セクター composite_score 推移（{dates.length} 営業日）
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">並び:</span>
          {(
            [
              { k: 'score', label: '現在スコア' },
              { k: 'delta', label: '21日変化(Δ)' },
            ] as { k: SortKey; label: string }[]
          ).map(o => (
            <button
              key={o.k}
              onClick={() => setSortKey(o.k)}
              className={`px-2 py-0.5 rounded border text-xs ${
                sortKey === o.k
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      >
        {sorted.map(card => {
          const borderColor = card.latest != null ? phaseBorder(card.latest) : '#d1d5db'
          const scoreColor = card.latest != null ? phaseColor(card.latest) : '#9ca3af'
          const validCount = card.points.filter(p => p.v != null).length
          const recentCutoff = card.points.length - 5

          return (
            <div
              key={card.sector}
              className="bg-white rounded-lg border border-[#e8eaed] shadow-sm px-3 py-2.5 flex flex-col gap-1.5"
              style={{ borderTop: `3px solid ${borderColor}` }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                  title={card.sector}
                >
                  {card.sector}
                </span>
                <span
                  className="text-sm font-bold font-mono tabular-nums ml-1 shrink-0"
                  style={{ color: scoreColor }}
                >
                  {card.latest != null ? card.latest.toFixed(0) : '--'}
                </span>
              </div>

              <div
                className="flex items-end gap-px"
                style={{ height: CHART_H }}
              >
                {card.points.map((p, i) => {
                  if (p.v == null) {
                    return (
                      <div
                        key={p.date}
                        className="flex-1"
                        style={{ height: 1, backgroundColor: '#f3f4f6' }}
                        title={`${p.date}: --`}
                      />
                    )
                  }
                  const h = (p.v / 100) * CHART_H
                  const isRecent = i >= recentCutoff
                  return (
                    <div
                      key={p.date}
                      className="flex-1 rounded-t-sm"
                      style={{
                        height: Math.max(h, 1),
                        backgroundColor: phaseColor(p.v),
                        opacity: isRecent ? 1 : 0.5,
                      }}
                      title={`${p.date}: ${p.v.toFixed(0)}`}
                    />
                  )
                })}
              </div>

              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {validCount}d
                  {card.rank != null && (
                    <span className="ml-1.5 text-gray-400">#{card.rank}</span>
                  )}
                </span>
                <span
                  className="text-[10px] font-mono font-semibold"
                  style={{
                    color:
                      card.delta21d == null
                        ? 'var(--text-muted)'
                        : card.delta21d > 0
                          ? '#16a34a'
                          : card.delta21d < 0
                            ? '#dc2626'
                            : 'var(--text-muted)',
                  }}
                >
                  {card.delta21d == null
                    ? '—'
                    : card.delta21d > 0
                      ? `▲${card.delta21d}pt`
                      : card.delta21d < 0
                        ? `▼${Math.abs(card.delta21d)}pt`
                        : '— 0pt'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-5 mt-3 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Leader (≥70)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#eab308' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Neutral (40–70)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Lagging (&lt;40)</span>
        </span>
      </div>
    </div>
  )
}
