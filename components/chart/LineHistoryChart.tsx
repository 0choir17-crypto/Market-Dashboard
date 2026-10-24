'use client'

import { useEffect, useRef, useState } from 'react'
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { CHART, GRID_LINE, REF_LINE } from '@/lib/chartColors'
import { monthlyTickMarkFormatter } from '@/components/market/TimeSeriesChart'

// 複数本の推移を重ねる折れ線チャート（Breadth の割合・主導株の件数など）。
// 凡例は TradingView と同じく左上に置き、カーソル位置の日の値に切り替える。

export type HistoryLine<K extends string> = { key: K; label: string; color: string; width?: 1 | 2 }

type Point<K extends string> = { date: string } & Record<K, number | null>

export default function LineHistoryChart<K extends string>({
  points,
  lines,
  format,
  range,
  refLines = [],
  height = 320,
}: {
  points: Point<K>[]
  lines: readonly HistoryLine<K>[]
  /** 凡例の値の書式 */
  format: (v: number) => string
  /** 縦軸の固定範囲。省略時はデータに合わせる */
  range?: [number, number]
  /** 点線の基準線（しきい値など） */
  refLines?: number[]
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
      // ページ / モーダルをスクロールしたときにチャートが拡大縮小しないよう
      // ホイール操作は無効化する（ドラッグ/ピンチでの操作は残す）。
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
    })
    lines.forEach((l, li) => {
      const s = chart.addSeries(LineSeries, {
        color: l.color,
        lineWidth: l.width ?? 1,
        priceLineVisible: false,
        lastValueVisible: true,
        ...(range
          ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: range[0], maxValue: range[1] } }) }
          : {}),
      })
      // 欠損日は WhitespaceData にして番号（logical）を日付と揃えておく
      s.setData(points.map((p) => (p[l.key] == null ? { time: p.date } : { time: p.date, value: p[l.key] as number })))
      if (li === 0) {
        for (const t of refLines) {
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
  }, [points, lines, range, refLines, height])

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
        {lines.map((l) => (
          <span key={l.key}>
            <span className="text-[var(--text-muted)] font-sans">{l.label}</span>{' '}
            <span style={{ color: l.color }}>{p[l.key] == null ? '—' : format(p[l.key] as number)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
