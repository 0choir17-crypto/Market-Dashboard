'use client'

import { useMemo, useState } from 'react'
import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'

type Props = {
  history: SectorHistoryResponse
}

type SortKey = 'score' | 'delta' | 'name' | 'rank'

type Card = {
  sector: string
  points: { date: string; v: number | null }[]
  latest: number | null
  first: number | null
  delta: number | null
  rank: number | null
}

const W = 140
const H = 38
const PAD_X = 4
const PAD_Y = 4

function lineColor(latest: number | null, delta: number | null): string {
  // Color by trajectory: strong + improving = green, weakening = amber, weak = red.
  if (latest == null) return '#9ca3af'
  if (latest >= 60) return delta != null && delta < -5 ? '#f59e0b' : '#16a34a'
  if (latest >= 35) return delta != null && delta > 5 ? '#2563eb' : '#9ca3af'
  return delta != null && delta > 5 ? '#2563eb' : '#dc2626'
}

export default function SectorSparklineGrid33({ history }: Props) {
  const { dates, bySector, sectorsRanked } = history
  const [sortKey, setSortKey] = useState<SortKey>('score')

  const cards: Card[] = useMemo(() => {
    return sectorsRanked.map(sector => {
      const series = bySector[sector] ?? {}
      const points = dates.map(d => ({ date: d, v: series[d]?.composite_score ?? null }))
      const firstIdx = points.findIndex(p => p.v != null)
      const lastIdx = (() => {
        for (let i = points.length - 1; i >= 0; i--) if (points[i].v != null) return i
        return -1
      })()
      const first = firstIdx >= 0 ? points[firstIdx].v : null
      const latest = lastIdx >= 0 ? points[lastIdx].v : null
      const delta = first != null && latest != null ? latest - first : null
      const rank = lastIdx >= 0 ? series[points[lastIdx].date]?.composite_score_rank ?? null : null
      return { sector, points, latest, first, delta, rank }
    })
  }, [sectorsRanked, bySector, dates])

  const sorted = useMemo(() => {
    const arr = [...cards]
    arr.sort((a, b) => {
      if (sortKey === 'name') return a.sector.localeCompare(b.sector, 'ja')
      if (sortKey === 'rank') return (a.rank ?? 999) - (b.rank ?? 999)
      if (sortKey === 'delta') return (b.delta ?? -Infinity) - (a.delta ?? -Infinity)
      return (b.latest ?? -Infinity) - (a.latest ?? -Infinity)
    })
    return arr
  }, [cards, sortKey])

  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">Sparkline 用データがありません</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-sm font-semibold text-gray-500 mr-auto">
          Sparkline Grid — 各セクター composite_score 推移（{dates.length} 営業日）
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">並び:</span>
          {(
            [
              { k: 'score', label: '現在スコア' },
              { k: 'delta', label: '変化(Δ)' },
              { k: 'rank', label: 'ランク' },
              { k: 'name', label: '名前' },
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {sorted.map(card => (
          <SparkCard key={card.sector} card={card} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-gray-500 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#16a34a' }} />
          強(≥60)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#2563eb' }} />
          改善中
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#f59e0b' }} />
          失速
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#dc2626' }} />
          弱(&lt;35)
        </span>
      </div>
    </div>
  )
}

function SparkCard({ card }: { card: Card }) {
  const validPoints = card.points.filter(p => p.v != null) as { date: string; v: number }[]
  if (validPoints.length < 2) {
    return (
      <div className="border border-[#e8eaed] rounded-lg p-2 text-xs text-gray-400">
        <div className="font-medium text-gray-700 truncate">{card.sector}</div>
        <div className="mt-1">データ不足</div>
      </div>
    )
  }

  // Y range: clamp to seen min/max with a small pad, but anchor to 0–100 conceptually.
  let yMin = Math.min(...validPoints.map(p => p.v))
  let yMax = Math.max(...validPoints.map(p => p.v))
  if (yMax - yMin < 10) {
    const mid = (yMax + yMin) / 2
    yMin = Math.max(0, mid - 5)
    yMax = Math.min(100, mid + 5)
  } else {
    yMin = Math.max(0, yMin - 4)
    yMax = Math.min(100, yMax + 4)
  }

  const innerW = W - 2 * PAD_X
  const innerH = H - 2 * PAD_Y
  const sx = (i: number) =>
    PAD_X + (i / Math.max(1, card.points.length - 1)) * innerW
  const sy = (v: number) =>
    PAD_Y + (1 - (v - yMin) / Math.max(0.001, yMax - yMin)) * innerH

  // Build polyline, breaking on null
  const segments: { x: number; y: number }[][] = []
  let cur: { x: number; y: number }[] = []
  card.points.forEach((p, i) => {
    if (p.v == null) {
      if (cur.length) segments.push(cur)
      cur = []
    } else {
      cur.push({ x: sx(i), y: sy(p.v) })
    }
  })
  if (cur.length) segments.push(cur)

  const stroke = lineColor(card.latest, card.delta)
  const deltaColor = card.delta == null ? '#9ca3af' : card.delta >= 0 ? '#16a34a' : '#dc2626'

  const lastIdx = (() => {
    for (let i = card.points.length - 1; i >= 0; i--) if (card.points[i].v != null) return i
    return -1
  })()
  const lastX = lastIdx >= 0 ? sx(lastIdx) : null
  const lastY = lastIdx >= 0 ? sy(card.points[lastIdx].v as number) : null

  // Midline at 50 (neutral reference)
  const midY = sy(50)

  return (
    <div className="border border-[#e8eaed] rounded-lg p-2 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-700 truncate" title={card.sector}>
          {card.sector}
        </span>
        <span className="text-[10px] font-mono text-gray-400">
          {card.rank != null ? `#${card.rank}` : ''}
        </span>
      </div>
      <svg width={W} height={H} className="block my-1">
        {midY > PAD_Y && midY < H - PAD_Y && (
          <line
            x1={PAD_X}
            y1={midY}
            x2={W - PAD_X}
            y2={midY}
            stroke="#e5e7eb"
            strokeDasharray="2 3"
          />
        )}
        {segments.map((seg, i) => (
          <polyline
            key={i}
            points={seg.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {lastX != null && lastY != null && (
          <circle cx={lastX} cy={lastY} r={2.4} fill={stroke} stroke="#fff" strokeWidth={1} />
        )}
      </svg>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-mono font-semibold text-gray-800">
          {card.latest != null ? card.latest.toFixed(0) : '--'}
        </span>
        <span className="font-mono" style={{ color: deltaColor }}>
          {card.delta == null
            ? '--'
            : `${card.delta >= 0 ? '+' : ''}${card.delta.toFixed(1)}`}
        </span>
      </div>
    </div>
  )
}
