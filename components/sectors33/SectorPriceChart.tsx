'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  IChartApi,
  createChart,
} from 'lightweight-charts'
import type { OhlcvBar } from '@/types/chart'
import { ema, toSeries } from '@/lib/indicators'
import { monthlyTickMarkFormatter } from '@/components/market/TimeSeriesChart'
import { fetchSectorPriceHistory } from '@/lib/sectorPriceFetch'

const UP = '#16a34a'
const DOWN = '#dc2626'

// EMA 期間と色は 21EMA Cockpit+（TradingView）の指定に合わせる。
const MA_CONFIG: { length: number; color: string; label: string }[] = [
  { length: 10, color: '#eab308', label: 'EMA10' }, // ゴールド/イエロー
  { length: 21, color: '#a855f7', label: 'EMA21' }, // パープル
  { length: 75, color: '#3b82f6', label: 'EMA75' }, // ブルー
  { length: 150, color: '#22c55e', label: 'EMA150' }, // グリーン
]

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap text-[11px] mb-1.5">
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

function Chart({ bars, height }: { bars: OhlcvBar[]; height: number }) {
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
      rightPriceScale: { borderColor: '#cbd5e1' },
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
  }, [bars, height])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-md border border-[var(--border)] bg-white"
      style={{ height, minHeight: height }}
    />
  )
}

export default function SectorPriceChart({
  sector,
  height = 320,
}: {
  sector: string
  height?: number
}) {
  const [bars, setBars] = useState<OhlcvBar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSectorPriceHistory(sector).then((res) => {
      if (cancelled) return
      setBars(res.bars)
      setError(res.error)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [sector])

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        指数チャート読み込み中…
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-red-50 rounded-md text-sm text-red-700 px-4 text-center"
        style={{ height }}
      >
        指数チャート取得エラー: {error}
      </div>
    )
  }

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        この業種の指数データがありません（直近150営業日のみ対応）
      </div>
    )
  }

  return (
    <div>
      <Legend />
      <Chart bars={bars} height={height} />
    </div>
  )
}
