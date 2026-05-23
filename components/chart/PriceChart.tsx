'use client'

import { useEffect, useRef } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  IChartApi,
  LineSeries,
  createChart,
} from 'lightweight-charts'
import type { OhlcvBar, StructurePivotPhase } from '@/types/chart'
import { ema, sma, toSeries } from '@/lib/indicators'
import { drawStructurePivot } from '@/lib/structurePivotDraw'

interface Props {
  bars: OhlcvBar[]
  structurePivotPhases?: StructurePivotPhase[]
  height?: number
}

const CHART_BG = '#ffffff'
const UP = '#16a34a'
const DOWN = '#dc2626'
const VOL_UP = 'rgba(22, 163, 74, 0.45)'
const VOL_DOWN = 'rgba(220, 38, 38, 0.45)'
const CLOUD_PURPLE = 'rgba(139, 92, 246, 0.18)'
const SMA10_COLOR = '#fbbf24'
const EMA21_COLOR = '#9c9c9c'
const SMA50_COLOR = '#faa1a4'

export default function PriceChart({
  bars,
  structurePivotPhases,
  height = 540,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || bars.length === 0) return

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: '#475569',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.10)' },
        horzLines: { color: 'rgba(148,163,184,0.10)' },
      },
      timeScale: {
        timeVisible: false,
        borderColor: '#cbd5e1',
        rightOffset: 6,
      },
      rightPriceScale: {
        borderColor: '#cbd5e1',
        scaleMargins: { top: 0.06, bottom: 0.28 },
      },
      crosshair: { mode: 1 },
      autoSize: true,
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

    /* ---- MA Cloud: AreaSeries(EMA21 high) + AreaSeries(EMA21 low, bg mask) */
    const ema21Hi = ema(bars.map(b => b.high), 21)
    const ema21Lo = ema(bars.map(b => b.low), 21)
    const ema21HiPts = toSeries(bars, ema21Hi)
    const ema21LoPts = toSeries(bars, ema21Lo)

    const cloudHi = chart.addSeries(AreaSeries, {
      lineColor: 'rgba(0,0,0,0)',
      topColor: CLOUD_PURPLE,
      bottomColor: CLOUD_PURPLE,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    cloudHi.setData(ema21HiPts)

    const cloudLoMask = chart.addSeries(AreaSeries, {
      lineColor: 'rgba(0,0,0,0)',
      topColor: CHART_BG,
      bottomColor: CHART_BG,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    cloudLoMask.setData(ema21LoPts)

    /* ---- MAs: SMA10, EMA21, SMA50 */
    const closes = bars.map(b => b.close)
    const sma10 = sma(closes, 10)
    const ema21 = ema(closes, 21)
    const sma50 = sma(closes, 50)

    const sma10Series = chart.addSeries(LineSeries, {
      color: SMA10_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: 'SMA10',
    })
    sma10Series.setData(toSeries(bars, sma10))

    const ema21Series = chart.addSeries(LineSeries, {
      color: EMA21_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: 'EMA21',
    })
    ema21Series.setData(toSeries(bars, ema21))

    const sma50Series = chart.addSeries(LineSeries, {
      color: SMA50_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: 'SMA50',
    })
    sma50Series.setData(toSeries(bars, sma50))

    /* ---- Candlestick */
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
    })
    candleSeries.setData(
      bars.map(b => ({
        time: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    /* ---- Volume histogram on a separate (overlay) price scale */
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    volSeries.setData(
      bars.map((b, i) => {
        const prevClose = i === 0 ? b.open : bars[i - 1].close
        const up = b.close >= prevClose
        return {
          time: b.date,
          value: b.volume,
          color: up ? VOL_UP : VOL_DOWN,
        }
      }),
    )

    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })

    /* ---- Structure Pivot overlay (current phase Pivot line + price label) */
    drawStructurePivot(chart, candleSeries, structurePivotPhases, {
      clipBefore: bars[0]?.date,
    })

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
  }, [bars, height, structurePivotPhases])

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-md text-sm text-slate-400"
        style={{ height }}
      >
        OHLCV データがありません
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
