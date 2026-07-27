'use client'

import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  IChartApi,
  createChart,
} from 'lightweight-charts'
import type { OhlcvBar } from '@/types/chart'
import { ema, toSeries, type SeriesPoint } from '@/lib/indicators'
import { monthlyTickMarkFormatter } from '@/components/market/TimeSeriesChart'

const UP = '#16a34a'
const DOWN = '#dc2626'

// EMA 期間と色は 21EMA Cockpit+（TradingView）の指定に合わせる。
export const MA_CONFIG: { length: number; color: string; label: string }[] = [
  { length: 10, color: '#eab308', label: 'EMA10' }, // ゴールド/イエロー
  { length: 21, color: '#a855f7', label: 'EMA21' }, // パープル
  { length: 75, color: '#3b82f6', label: 'EMA75' }, // ブルー
  { length: 150, color: '#22c55e', label: 'EMA150' }, // グリーン
]

export function MaLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 flex-wrap text-[11px] ${className}`}>
      {MA_CONFIG.map((m) => (
        <span key={m.length} className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-[2px] rounded-full"
            style={{ backgroundColor: m.color }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
        </span>
      ))}
    </div>
  )
}

export type MetricOverlay = {
  points: SeriesPoint[]
  label: string
  color: string
}

type Props = {
  bars: OhlcvBar[]
  /** 0-100 のスコア系指標をローソク足の下部に重ねる（任意） */
  metric?: MetricOverlay | null
  height?: number
}

export default function SectorCandleChart({ bars, metric, height = 300 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || bars.length === 0) return

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.10)' },
        horzLines: { color: 'rgba(148,163,184,0.10)' },
      },
      timeScale: {
        timeVisible: false,
        borderColor: '#cbd5e1',
        tickMarkFormatter: monthlyTickMarkFormatter,
      },
      rightPriceScale: {
        borderColor: '#cbd5e1',
        // 指標オーバーレイを置くときは価格を上寄せして描画域を分ける
        scaleMargins: metric ? { top: 0.05, bottom: 0.34 } : { top: 0.08, bottom: 0.08 },
      },
      crosshair: { mode: 1 },
      autoSize: true,
    })

    const closes = bars.map((b) => b.close)
    // MA は candlestick の背後に来るよう先に追加する
    for (const m of MA_CONFIG) {
      const line = chart.addSeries(LineSeries, {
        color: m.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: m.label,
      })
      line.setData(toSeries(bars, ema(closes, m.length)))
    }

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
    })
    candle.setData(
      bars.map((b) => ({
        time: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    // 指標オーバーレイ: 0-100 固定の独立スケールで下部 30% に描く
    if (metric && metric.points.length > 0) {
      const metricSeries = chart.addSeries(LineSeries, {
        color: metric.color,
        lineWidth: 2,
        priceScaleId: 'metric',
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: metric.label,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
        }),
      })
      metricSeries.setData(metric.points)
      chart.priceScale('metric').applyOptions({
        scaleMargins: { top: 0.7, bottom: 0 },
      })
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [bars, metric, height])

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        指数データがありません
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-md border border-[var(--border)] bg-white"
      style={{ height, minHeight: height }}
    />
  )
}
