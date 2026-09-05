'use client'

import { useEffect, useState } from 'react'
import { MarketConditions } from '@/types/market'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchGateScoreTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'

type GateState = NonNullable<MarketConditions['gate_state']>

const GATE_CONFIG: Record<GateState, { label: string; jp: string; color: string; note: string }> = {
  attack: {
    label: 'ATTACK',
    jp: '攻める',
    color: '#1a9850',
    note: '主導株が新高値を更新中。期待値・勝率が最も高い局面。厚めに張る。',
  },
  normal: {
    label: 'NORMAL',
    jp: '普通',
    color: '#f1c40f',
    note: 'TOPIX は SMA50 の上だが主導株は平常。通常運用。',
  },
  rest: {
    label: 'REST',
    jp: '休む',
    color: '#e24b4a',
    note: 'TOPIX が SMA50 の下＝弱気相場。ブレイクはだましやすい。新規は見送り/極小。',
  },
}

const FALLBACK = { color: '#9ca3af', label: '—', jp: '—', note: 'データがありません。' }

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

function fmtSigned(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return '—'
  const s = v.toFixed(decimals)
  return v >= 0 ? `+${s}` : s
}

// ── Semi-circle gauge for gate_score (0-100) ────────────────────────────────
function ScoreGauge({ score, color }: { score: number | null; color: string }) {
  const cx = 100
  const cy = 100
  const r = 80
  const strokeWidth = 14
  const pct = isNum(score) ? Math.max(0, Math.min(100, score)) : 0

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const polarToXY = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  })

  const startAngle = 180
  const endAngle = startAngle + (pct / 100) * 180
  const start = polarToXY(startAngle)
  const end = polarToXY(endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  const bgStart = polarToXY(180)
  const bgEnd = polarToXY(360)

  return (
    <svg viewBox="0 0 200 120" width="100%" height="130" style={{ display: 'block' }}>
      <path
        d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`}
        fill="none"
        stroke="#e6e8eb"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {pct > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fontSize="26"
        fontWeight="700"
        fill={color}
        fontFamily="var(--font-mono, monospace)"
      >
        {isNum(score) ? Number(score).toFixed(1) : '—'}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize="11"
        fill="#9ca3af"
        fontFamily="var(--font-mono, monospace)"
      >
        gate_score / 100
      </text>
    </svg>
  )
}

// ── Optional mini trend of gate_score ───────────────────────────────────────
function GateTrend({ height = 120 }: { height?: number }) {
  const { selectedDate } = useDate()
  const [data, setData] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    setLoading(true)
    fetchGateScoreTimeSeries(120, selectedDate).then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-xs text-[var(--text-muted)]"
        style={{ height }}
      >
        読み込み中…
      </div>
    )
  }

  return (
    <TimeSeriesChart
      data={data}
      color="#639922"
      name="gate_score"
      height={height}
      yMin={0}
      yMax={100}
    />
  )
}

export default function EntryGateCard({ market }: { market: MarketConditions | null }) {
  const state = market?.gate_state ?? null
  const cfg = state ? GATE_CONFIG[state] : FALLBACK
  const aboveSma50 = market?.topix_above_sma50

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Entry Gate <span className="font-normal text-[var(--text-muted)]">— エントリー可否</span>
        </p>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          pctile {fmt(market?.gate_score_pctile, 0)}% (上位25%=ATTACK)
        </span>
      </div>

      {/* Big state badge */}
      <div className="flex flex-col items-center">
        <span
          className="px-6 py-2 rounded-xl text-2xl font-extrabold tracking-wide"
          style={{
            backgroundColor: cfg.color + '1a',
            color: cfg.color,
            border: `2px solid ${cfg.color}`,
          }}
        >
          {cfg.label}
        </span>
        <span className="mt-1.5 text-sm font-semibold" style={{ color: cfg.color }}>
          {cfg.jp}
        </span>
      </div>

      {/* gate_score gauge */}
      <div className="mt-2">
        <ScoreGauge score={market?.gate_score ?? null} color={cfg.color} />
        <p className="text-center text-[11px] font-mono text-[var(--text-muted)] -mt-2">
          パーセンタイル 上位 {fmt(market?.gate_score_pctile, 0)}%
        </p>
      </div>

      {/* 大枠インジケータ: TOPIX vs SMA50 */}
      <div
        className="mt-4 flex items-center justify-between px-4 py-2.5 rounded-lg border"
        style={{
          borderColor: aboveSma50 == null ? 'var(--border)' : aboveSma50 ? '#63992240' : '#e24b4a40',
          backgroundColor: aboveSma50 == null ? '#f8fafc' : aboveSma50 ? '#63992212' : '#e24b4a12',
        }}
      >
        <span className="text-sm text-[var(--text-secondary)] font-medium">TOPIX vs SMA50（大枠の門）</span>
        <span
          className="text-sm font-bold"
          style={{ color: aboveSma50 == null ? '#9ca3af' : aboveSma50 ? '#639922' : '#e24b4a' }}
        >
          {aboveSma50 == null ? '—' : aboveSma50 ? '▲ 上' : '▼ 下'}
        </span>
      </div>

      {/* One-line explanation */}
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{cfg.note}</p>

      {/* Sub details */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-baseline justify-between border-b border-dashed border-[var(--border)] py-0.5">
          <span className="text-[var(--text-secondary)]">主導株の新高値広がり</span>
          <span className="font-mono tabular-nums text-[var(--text-primary)]">{fmt(market?.leader_strength, 1)}</span>
        </div>
        <div className="flex items-baseline justify-between border-b border-dashed border-[var(--border)] py-0.5">
          <span className="text-[var(--text-secondary)]">TOPIX EMA21 傾き%</span>
          <span className="font-mono tabular-nums text-[var(--text-primary)]">{fmtSigned(market?.gate_ema21_slope, 2)}</span>
        </div>
      </div>

      {/* Optional trend */}
      <hr className="my-4 border-[var(--border)]" />
      <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
        gate_score <span className="font-normal text-[var(--text-muted)]">— 直近 120 営業日</span>
      </p>
      <GateTrend height={140} />
    </div>
  )
}
