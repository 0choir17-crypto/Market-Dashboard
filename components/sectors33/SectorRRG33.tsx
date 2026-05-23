'use client'

import { useMemo, useState } from 'react'
import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'

type Props = {
  history: SectorHistoryResponse
}

type DotPoint = {
  sector: string
  x: number
  y: number
  composite: number | null
  date: string
}

type Trail = {
  sector: string
  points: DotPoint[]
}

const PAD = 36
const W_INNER_MIN = 480
const H = 460
const CENTER = 50

function quadrantOf(x: number, y: number): 'leading' | 'weakening' | 'lagging' | 'improving' {
  if (x >= CENTER && y >= CENTER) return 'leading'
  if (x >= CENTER && y < CENTER) return 'weakening'
  if (x < CENTER && y < CENTER) return 'lagging'
  return 'improving'
}

const QUAD_COLOR: Record<string, string> = {
  leading: '#16a34a',
  weakening: '#f59e0b',
  lagging: '#dc2626',
  improving: '#2563eb',
}

export default function SectorRRG33({ history }: Props) {
  const { dates, bySector, sectorsRanked } = history
  const [showTrailFor, setShowTrailFor] = useState<'top6' | 'top12' | 'all' | 'none'>('top6')
  const [hovered, setHovered] = useState<string | null>(null)
  const [trailLen, setTrailLen] = useState<5 | 10 | 21>(10)

  const latestDate = dates[dates.length - 1]

  const { dots, trails, xRange, yRange } = useMemo(() => {
    const dots: DotPoint[] = []
    const trails: Trail[] = []
    let xMin = 100,
      xMax = 0,
      yMin = 100,
      yMax = 0

    const trailSet = new Set<string>(
      showTrailFor === 'all'
        ? sectorsRanked
        : showTrailFor === 'top12'
          ? sectorsRanked.slice(0, 12)
          : showTrailFor === 'top6'
            ? sectorsRanked.slice(0, 6)
            : [],
    )

    const trailDates = dates.slice(-trailLen)

    for (const sector of sectorsRanked) {
      const latest = bySector[sector]?.[latestDate]
      if (!latest) continue
      const x = latest.component_rs
      const y = latest.sector_rs_acc_s33
      if (x == null || y == null) continue
      dots.push({
        sector,
        x,
        y,
        composite: latest.composite_score,
        date: latestDate,
      })
      xMin = Math.min(xMin, x)
      xMax = Math.max(xMax, x)
      yMin = Math.min(yMin, y)
      yMax = Math.max(yMax, y)

      if (trailSet.has(sector)) {
        const pts: DotPoint[] = []
        for (const d of trailDates) {
          const r = bySector[sector]?.[d]
          if (!r || r.component_rs == null || r.sector_rs_acc_s33 == null) continue
          pts.push({
            sector,
            x: r.component_rs,
            y: r.sector_rs_acc_s33,
            composite: r.composite_score,
            date: d,
          })
        }
        if (pts.length >= 2) trails.push({ sector, points: pts })
      }
    }

    // Symmetric padding around center (50) so quadrants render evenly.
    const halfRange = Math.max(
      Math.abs(xMin - CENTER),
      Math.abs(xMax - CENTER),
      Math.abs(yMin - CENTER),
      Math.abs(yMax - CENTER),
      15,
    )
    const xRange: [number, number] = [Math.max(0, CENTER - halfRange - 5), Math.min(100, CENTER + halfRange + 5)]
    const yRange: [number, number] = [Math.max(0, CENTER - halfRange - 5), Math.min(100, CENTER + halfRange + 5)]

    return { dots, trails, xRange, yRange }
  }, [bySector, sectorsRanked, latestDate, showTrailFor, dates, trailLen])

  if (dots.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">RRG 表示用データが不足しています</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-sm font-semibold text-gray-500 mr-auto">
          Sector RRG — X: RS (0-100) / Y: RS加速 (50=中立) · 軌跡={trailLen}営業日
        </p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">Trail:</span>
          {(['top6', 'top12', 'all', 'none'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setShowTrailFor(opt)}
              className={`px-2 py-0.5 rounded border text-xs ${
                showTrailFor === opt
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {opt === 'top6' ? '上位6' : opt === 'top12' ? '上位12' : opt === 'all' ? '全て' : 'なし'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-400">期間:</span>
          {([5, 10, 21] as const).map(n => (
            <button
              key={n}
              onClick={() => setTrailLen(n)}
              className={`px-2 py-0.5 rounded border text-xs ${
                trailLen === n
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>
      <RRGCanvas
        dots={dots}
        trails={trails}
        xRange={xRange}
        yRange={yRange}
        hovered={hovered}
        onHover={setHovered}
      />
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px]">
        <Legend label="🟢 Leading (RS↑ / 加速↑)" color={QUAD_COLOR.leading} />
        <Legend label="🔵 Improving (RS↓ / 加速↑)" color={QUAD_COLOR.improving} />
        <Legend label="🟡 Weakening (RS↑ / 加速↓)" color={QUAD_COLOR.weakening} />
        <Legend label="🔴 Lagging (RS↓ / 加速↓)" color={QUAD_COLOR.lagging} />
      </div>
    </div>
  )
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-600">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function RRGCanvas({
  dots,
  trails,
  xRange,
  yRange,
  hovered,
  onHover,
}: {
  dots: DotPoint[]
  trails: Trail[]
  xRange: [number, number]
  yRange: [number, number]
  hovered: string | null
  onHover: (s: string | null) => void
}) {
  const innerW = Math.max(W_INNER_MIN, 720) - 2 * PAD
  const innerH = H - 2 * PAD
  const sx = (v: number) => PAD + ((v - xRange[0]) / (xRange[1] - xRange[0])) * innerW
  const sy = (v: number) => PAD + (1 - (v - yRange[0]) / (yRange[1] - yRange[0])) * innerH

  // Center crosshair coords
  const cx = sx(CENTER)
  const cy = sy(CENTER)

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${innerW + 2 * PAD} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        {/* Quadrant background tints */}
        <rect x={cx} y={PAD} width={innerW + PAD - cx} height={cy - PAD} fill="#dcfce7" opacity={0.18} />
        <rect x={PAD} y={PAD} width={cx - PAD} height={cy - PAD} fill="#dbeafe" opacity={0.18} />
        <rect x={cx} y={cy} width={innerW + PAD - cx} height={H - PAD - cy} fill="#fef3c7" opacity={0.18} />
        <rect x={PAD} y={cy} width={cx - PAD} height={H - PAD - cy} fill="#fee2e2" opacity={0.18} />

        {/* Crosshair */}
        <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke="#9ca3af" strokeDasharray="4 4" />
        <line x1={PAD} y1={cy} x2={innerW + PAD} y2={cy} stroke="#9ca3af" strokeDasharray="4 4" />

        {/* Axes ticks */}
        {[xRange[0], CENTER, xRange[1]].map(v => (
          <g key={`xt-${v}`}>
            <text x={sx(v)} y={H - PAD + 16} fontSize={10} textAnchor="middle" fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {[yRange[0], CENTER, yRange[1]].map(v => (
          <g key={`yt-${v}`}>
            <text x={PAD - 8} y={sy(v) + 3} fontSize={10} textAnchor="end" fill="#9ca3af">
              {v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={innerW + PAD - 4} y={cy - 6} fontSize={10} textAnchor="end" fill="#6b7280">
          RS →
        </text>
        <text x={cx + 6} y={PAD - 10} fontSize={10} fill="#6b7280">
          加速 ↑
        </text>

        {/* Quadrant labels */}
        <text x={innerW + PAD - 8} y={PAD + 14} fontSize={11} textAnchor="end" fill={QUAD_COLOR.leading} fontWeight={600}>
          Leading
        </text>
        <text x={PAD + 8} y={PAD + 14} fontSize={11} fill={QUAD_COLOR.improving} fontWeight={600}>
          Improving
        </text>
        <text x={innerW + PAD - 8} y={H - PAD - 6} fontSize={11} textAnchor="end" fill={QUAD_COLOR.weakening} fontWeight={600}>
          Weakening
        </text>
        <text x={PAD + 8} y={H - PAD - 6} fontSize={11} fill={QUAD_COLOR.lagging} fontWeight={600}>
          Lagging
        </text>

        {/* Trails */}
        {trails.map(t => {
          const isHover = hovered === t.sector
          const opacityBase = hovered && !isHover ? 0.15 : 0.55
          return (
            <g key={`trail-${t.sector}`}>
              <polyline
                points={t.points.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')}
                fill="none"
                stroke={QUAD_COLOR[quadrantOf(t.points[t.points.length - 1].x, t.points[t.points.length - 1].y)]}
                strokeWidth={isHover ? 2.2 : 1.5}
                strokeOpacity={opacityBase}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {t.points.slice(0, -1).map((p, i) => (
                <circle
                  key={`tp-${t.sector}-${i}`}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={1.6}
                  fill={QUAD_COLOR[quadrantOf(p.x, p.y)]}
                  opacity={opacityBase * 0.9}
                />
              ))}
            </g>
          )
        })}

        {/* Dots (latest) */}
        {dots.map(d => {
          const q = quadrantOf(d.x, d.y)
          const isHover = hovered === d.sector
          const dim = hovered && !isHover
          return (
            <g
              key={`dot-${d.sector}`}
              onMouseEnter={() => onHover(d.sector)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={sx(d.x)}
                cy={sy(d.y)}
                r={isHover ? 7 : 5}
                fill={QUAD_COLOR[q]}
                opacity={dim ? 0.25 : 0.9}
                stroke="#fff"
                strokeWidth={1.4}
              />
              <text
                x={sx(d.x) + 8}
                y={sy(d.y) + 3}
                fontSize={10}
                fill={dim ? '#9ca3af' : '#374151'}
                fontWeight={isHover ? 700 : 500}
                style={{ pointerEvents: 'none' }}
              >
                {d.sector}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
