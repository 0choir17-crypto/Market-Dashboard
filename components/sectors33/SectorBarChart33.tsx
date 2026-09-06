'use client'

import { useMemo, useState } from 'react'
import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'
import { compositeTone } from '@/types/sectorSelection'
import { toneVars } from '@/types/semantic'

type Props = {
  history: SectorHistoryResponse
}

type SortKey = 'score' | 'delta'

// 閾値は types/sectorSelection.ts の compositeTone (>=60 / >=30) に一元化。
// SectorSelectionTable のバッジ・ホットセクター判定 (>=60) と同じ段階になる。
// バーは濃い方（fg）で塗り、カードの輪郭は淡い方（bd）を使う。
function phaseColor(score: number): string {
  return toneVars(compositeTone(score)).fg
}

function phaseBorder(score: number): string {
  return toneVars(compositeTone(score)).bd
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
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-small">Bar Chart 用のデータがありません</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-small font-medium text-[var(--text-primary)] mr-auto">
          RS Bar Chart{' '}
          <span className="font-normal text-[var(--text-muted)]">
            — 各セクター composite_score 推移（<span className="font-mono">{dates.length}</span> 営業日）
          </span>
        </p>
        <div className="flex items-center gap-1 text-caption">
          <span className="text-[var(--text-muted)]">並び:</span>
          {(
            [
              { k: 'score', label: '現在スコア' },
              { k: 'delta', label: '21日変化(Δ)' },
            ] as { k: SortKey; label: string }[]
          ).map(o => (
            <button
              key={o.k}
              onClick={() => setSortKey(o.k)}
              className={`px-2 py-0.5 rounded border text-caption ${
                sortKey === o.k
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] font-medium'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
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
          const borderColor = card.latest != null ? phaseBorder(card.latest) : 'var(--border-strong)'
          const scoreColor = card.latest != null ? phaseColor(card.latest) : 'var(--text-muted)'
          const validCount = card.points.filter(p => p.v != null).length
          const recentCutoff = card.points.length - 5

          return (
            <div
              key={card.sector}
              className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] shadow-sm px-3 py-2.5 flex flex-col gap-1.5"
              style={{ borderTop: `3px solid ${borderColor}` }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-caption font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                  title={card.sector}
                >
                  {card.sector}
                </span>
                <span
                  className="text-small font-medium font-mono tabular-nums ml-1 shrink-0"
                  style={{ color: scoreColor }}
                >
                  {card.latest != null ? card.latest.toFixed(0) : '—'}
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
                        style={{ height: 1, backgroundColor: 'var(--border-subtle)' }}
                        title={`${p.date}: —`}
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
                  className="text-caption font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {validCount}d
                  {card.rank != null && (
                    <span className="ml-1.5 text-[var(--text-muted)]">#{card.rank}</span>
                  )}
                </span>
                <span
                  className="text-caption font-mono font-medium"
                  style={{
                    color:
                      card.delta21d == null
                        ? 'var(--text-muted)'
                        : card.delta21d > 0
                          ? 'var(--positive)'
                          : card.delta21d < 0
                            ? 'var(--negative)'
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

      <div className="flex items-center justify-center gap-5 mt-3 text-caption">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--sem-strong-fg)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Leader (≥60)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--sem-watch-fg)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Neutral (30–60)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: 'var(--sem-weak-fg)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Lagging (&lt;30)</span>
        </span>
      </div>
    </div>
  )
}
