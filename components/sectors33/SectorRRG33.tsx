'use client'

import { useMemo, useState } from 'react'
import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'
import { CHART } from '@/lib/chartColors'
import { SELF_T63_CAUTION } from '@/types/sectorSelection'

// 業種の RRG。横 = self_t63 (3 か月の自力) / 縦 = self_t21 (直近 1 か月の自力)。どちらも t 値で 0 が中立。
//   右上 Leading   = 3 か月も直近も強い
//   右下 Weakening = 3 か月は強いが直近は弱い (失速)
//   左下 Lagging   = どちらも弱い
//   左上 Improving = 3 か月は弱いが直近は強い (回復)
// 横 −1 の点線 = 注意の線 (self_t63 ≤ −1)。

type Props = {
  history: SectorHistoryResponse
}

type DotPoint = {
  sector: string
  x: number
  y: number
  date: string
}

type Trail = {
  sector: string
  points: DotPoint[]
}

const PAD = 36
const W_INNER_MIN = 480
const H = 460
const CENTER = 0

function quadrantOf(x: number, y: number): 'leading' | 'weakening' | 'lagging' | 'improving' {
  if (x >= CENTER && y >= CENTER) return 'leading'
  if (x >= CENTER && y < CENTER) return 'weakening'
  if (x < CENTER && y < CENTER) return 'lagging'
  return 'improving'
}

const QUAD_COLOR: Record<string, string> = {
  leading: CHART.positive,
  weakening: CHART.watchFg,
  lagging: CHART.negative,
  improving: CHART.focusFg,
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
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity

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
      const x = latest.self_t63
      const y = latest.self_t21
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
      dots.push({ sector, x, y, date: latestDate })
      xMin = Math.min(xMin, x)
      xMax = Math.max(xMax, x)
      yMin = Math.min(yMin, y)
      yMax = Math.max(yMax, y)

      if (trailSet.has(sector)) {
        const pts: DotPoint[] = []
        for (const d of trailDates) {
          const r = bySector[sector]?.[d]
          if (!r || r.self_t63 == null || r.self_t21 == null) continue
          pts.push({ sector, x: r.self_t63, y: r.self_t21, date: d })
        }
        if (pts.length >= 2) trails.push({ sector, points: pts })
      }
    }

    // 0 を中心に上下左右を同じ幅にする (象限が均等に見えるように。注意の線 −1 も必ず入る)
    for (const t of trails) for (const p of t.points) {
      xMin = Math.min(xMin, p.x)
      xMax = Math.max(xMax, p.x)
      yMin = Math.min(yMin, p.y)
      yMax = Math.max(yMax, p.y)
    }
    const halfRange = Math.max(
      Math.abs(xMin - CENTER),
      Math.abs(xMax - CENTER),
      Math.abs(yMin - CENTER),
      Math.abs(yMax - CENTER),
      2,
    )
    const half = Math.ceil((halfRange + 0.3) * 2) / 2
    const xRange: [number, number] = [CENTER - half, CENTER + half]
    const yRange: [number, number] = [CENTER - half, CENTER + half]

    return { dots, trails, xRange, yRange }
  }, [bySector, sectorsRanked, latestDate, showTrailFor, dates, trailLen])

  if (dots.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-small">RRG 表示用のデータが不足しています</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <p className="text-small font-medium text-[var(--text-primary)] mr-auto">
          Sector RRG{' '}
          <span className="font-normal text-[var(--text-muted)]">
            — 横: self_t63（3 か月の自力）/ 縦: self_t21（直近 1 か月）· 0 = 中立 · 点線 = 注意の線（self_t63 ≤ {SELF_T63_CAUTION}）· 軌跡=<span className="font-mono">{trailLen}</span>営業日
          </span>
        </p>
        <div className="flex items-center gap-1 text-caption">
          <span className="text-[var(--text-muted)]">Trail:</span>
          {(['top6', 'top12', 'all', 'none'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setShowTrailFor(opt)}
              className={`px-2 py-0.5 rounded border text-caption ${
                showTrailFor === opt
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] font-medium'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              {opt === 'top6' ? '上位6' : opt === 'top12' ? '上位12' : opt === 'all' ? '全て' : 'なし'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-caption">
          <span className="text-[var(--text-muted)]">期間:</span>
          {([5, 10, 21] as const).map(n => (
            <button
              key={n}
              onClick={() => setTrailLen(n)}
              className={`px-2 py-0.5 rounded border text-caption ${
                trailLen === n
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] font-medium'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
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
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-caption">
        <Legend label="Leading (t63 + / t21 +)" color={QUAD_COLOR.leading} />
        <Legend label="Improving (t63 − / t21 +) 回復" color={QUAD_COLOR.improving} />
        <Legend label="Weakening (t63 + / t21 −) 失速" color={QUAD_COLOR.weakening} />
        <Legend label="Lagging (t63 − / t21 −)" color={QUAD_COLOR.lagging} />
      </div>
    </div>
  )
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
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
        <rect x={cx} y={PAD} width={innerW + PAD - cx} height={cy - PAD} fill={CHART.strongBg} opacity={0.18} />
        <rect x={PAD} y={PAD} width={cx - PAD} height={cy - PAD} fill={CHART.focusBg} opacity={0.18} />
        <rect x={cx} y={cy} width={innerW + PAD - cx} height={H - PAD - cy} fill={CHART.watchBg} opacity={0.18} />
        <rect x={PAD} y={cy} width={cx - PAD} height={H - PAD - cy} fill={CHART.weakBg} opacity={0.18} />

        {/* Crosshair */}
        <line x1={cx} y1={PAD} x2={cx} y2={H - PAD} stroke={CHART.textMuted} strokeDasharray="4 4" />
        <line x1={PAD} y1={cy} x2={innerW + PAD} y2={cy} stroke={CHART.textMuted} strokeDasharray="4 4" />

        {/* 注意の線 self_t63 = −1 */}
        {SELF_T63_CAUTION > xRange[0] && (
          <g>
            <line x1={sx(SELF_T63_CAUTION)} y1={PAD} x2={sx(SELF_T63_CAUTION)} y2={H - PAD} stroke={CHART.watchFg} strokeDasharray="2 3" />
            <text x={sx(SELF_T63_CAUTION) - 4} y={PAD + 30} fontSize={10} textAnchor="end" fill={CHART.watchFg}>
              注意 ≤ {SELF_T63_CAUTION}
            </text>
          </g>
        )}

        {/* Axes ticks */}
        {[xRange[0], CENTER, xRange[1]].map(v => (
          <g key={`xt-${v}`}>
            <text x={sx(v)} y={H - PAD + 16} fontSize={10} textAnchor="middle" fill={CHART.textMuted}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {[yRange[0], CENTER, yRange[1]].map(v => (
          <g key={`yt-${v}`}>
            <text x={PAD - 8} y={sy(v) + 3} fontSize={10} textAnchor="end" fill={CHART.textMuted}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={innerW + PAD - 4} y={cy - 6} fontSize={10} textAnchor="end" fill={CHART.textSecondary}>
          self_t63 →
        </text>
        <text x={cx + 6} y={PAD - 10} fontSize={10} fill={CHART.textSecondary}>
          self_t21 ↑
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
                stroke={CHART.card}
                strokeWidth={1.4}
              />
              <text
                x={sx(d.x) + 8}
                y={sy(d.y) + 3}
                fontSize={10}
                fill={dim ? CHART.textMuted : CHART.textPrimary}
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
