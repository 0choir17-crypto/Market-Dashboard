'use client'

import { useEffect, useRef, useState } from 'react'
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { BREADTH_SERIES, CHART, GRID_LINE, REF_LINE } from '@/lib/chartColors'
import { monthlyTickMarkFormatter } from './TimeSeriesChart'
import {
  BREADTH_HOT,
  BREADTH_MID,
  BREADTH_WEAK,
  type BreadthHistoryPoint,
} from '@/lib/breadthState'

// 移動平均より上にある銘柄の割合 3 本（20 / 50 / 150 日線）の推移。
// 凡例は TradingView と同じく左上に置き、カーソル位置の日の値に切り替える。

const LINES = [
  { key: 'sma20', label: '20日線', color: BREADTH_SERIES.sma20, width: 1 },
  { key: 'sma50', label: '50日線', color: BREADTH_SERIES.sma50, width: 2 },
  { key: 'sma150', label: '150日線', color: BREADTH_SERIES.sma150, width: 1 },
] as const

export default function BreadthHistoryChart({
  points,
  height = 320,
}: {
  points: BreadthHistoryPoint[]
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || points.length === 0) return
    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: CHART.textSecondary,
        attributionLogo: false,
      },
      // 十字線の日付ラベルを「2026-07-31」の形にする（既定は「31 Jul '26」）
      localization: { locale: 'ja-JP', dateFormat: 'yyyy-MM-dd' },
      grid: { vertLines: { color: GRID_LINE }, horzLines: { color: GRID_LINE } },
      timeScale: { borderColor: CHART.borderStrong, tickMarkFormatter: monthlyTickMarkFormatter },
      rightPriceScale: { borderColor: CHART.borderStrong, scaleMargins: { top: 0.14, bottom: 0.04 } },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    })
    LINES.forEach((l, li) => {
      const s = chart.addSeries(LineSeries, {
        color: l.color,
        lineWidth: l.width,
        priceLineVisible: false,
        lastValueVisible: true,
        // 縦軸は 0〜100% に固定（区分の位置が日によって動かないように）
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      })
      // 欠損日は WhitespaceData にして番号（logical）を日付と揃えておく
      s.setData(
        points.map((p) => (p[l.key] == null ? { time: p.date } : { time: p.date, value: p[l.key] as number })),
      )
      if (li === 1) {
        for (const t of [BREADTH_WEAK, BREADTH_MID, BREADTH_HOT]) {
          s.createPriceLine({ price: t, color: REF_LINE, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '' })
        }
      }
    })
    chart.subscribeCrosshairMove((param) => {
      if (param.logical == null || param.point == null) return setHover(null)
      const i = Math.round(param.logical)
      setHover(i >= 0 && i < points.length ? i : null)
    })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [points, height])

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)]" style={{ height }}>
        データがありません
      </div>
    )
  }

  const p = points[hover ?? points.length - 1]
  return (
    <div className="relative w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)]" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute left-3 top-2 z-10 pointer-events-none flex flex-wrap gap-x-4 text-caption font-mono tabular-nums">
        <span className="text-[var(--text-muted)]">{p.date}</span>
        {LINES.map((l) => (
          <span key={l.key}>
            <span className="text-[var(--text-muted)] font-sans">{l.label}</span>{' '}
            <span style={{ color: l.color }}>{p[l.key] == null ? '—' : `${(p[l.key] as number).toFixed(1)}%`}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
