'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
} from 'lightweight-charts'
import { Trade } from '@/types/trades'
import { fetchTradeChartData, ChartDataPoint } from '@/lib/chartData'

interface Props {
  trade: Trade
}

interface MarkerVisibility {
  entry: boolean
  mfe: boolean
  mae: boolean
  exit: boolean
}

export default function TradeChart({ trade }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  const [data, setData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState<MarkerVisibility>({
    entry: true,
    mfe: true,
    mae: true,
    exit: true,
  })

  // データ取得
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const exit = trade.exit_date ?? trade.entry_date
    fetchTradeChartData(trade.ticker, trade.entry_date, exit)
      .then(result => { if (!cancelled) { setData(result); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trade.ticker, trade.entry_date, trade.exit_date])

  // チャート初期化
  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    const chart = createChart(containerRef.current, {
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#475569',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.15)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.15)' },
      },
      timeScale: {
        timeVisible: false,
        borderColor: '#cbd5e1',
      },
      rightPriceScale: {
        borderColor: '#cbd5e1',
      },
      crosshair: { mode: 1 },
      autoSize: true,
    })

    const series = chart.addSeries(LineSeries, {
      color: '#2563eb',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    series.setData(data as { time: Time; value: number }[])

    const markersPlugin = createSeriesMarkers(series, [])

    chartRef.current = chart
    seriesRef.current = series
    markersRef.current = markersPlugin

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markersRef.current = null
    }
  }, [data])

  // マーカー更新
  useEffect(() => {
    if (!markersRef.current) return

    const markers: SeriesMarker<Time>[] = []

    if (visible.entry && trade.entry_date) {
      markers.push({
        time: trade.entry_date as Time,
        position: 'belowBar',
        color: '#3b82f6',
        shape: 'arrowUp',
        text: `Entry ¥${trade.entry_price?.toLocaleString() ?? ''}`,
      })
    }
    if (visible.mfe && trade.mfe_date && trade.mfe_pct != null) {
      markers.push({
        time: trade.mfe_date as Time,
        position: 'aboveBar',
        color: '#f59e0b',
        shape: 'circle',
        text: `MFE ${trade.mfe_pct >= 0 ? '+' : ''}${trade.mfe_pct.toFixed(1)}%`,
      })
    }
    if (visible.mae && trade.mae_date && trade.mae_pct != null) {
      markers.push({
        time: trade.mae_date as Time,
        position: 'belowBar',
        color: '#ef4444',
        shape: 'circle',
        text: `MAE ${trade.mae_pct.toFixed(1)}%`,
      })
    }
    if (visible.exit && trade.exit_date) {
      markers.push({
        time: trade.exit_date as Time,
        position: 'aboveBar',
        color: '#10b981',
        shape: 'arrowDown',
        text: `Exit ¥${trade.exit_price?.toLocaleString() ?? ''}`,
      })
    }

    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)))
    markersRef.current.setMarkers(markers)
  }, [visible, trade, data])

  if (!loading && data.length === 0) {
    return (
      <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
        📈 チャートデータなし（daily_signalsに該当期間のデータがありません）
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-2 text-xs">
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.entry}
            onChange={e => setVisible(v => ({ ...v, entry: e.target.checked }))}
            className="accent-blue-600"
          />
          <span className="text-blue-600 font-medium">📍 Entry</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.mfe}
            onChange={e => setVisible(v => ({ ...v, mfe: e.target.checked }))}
            className="accent-amber-500"
          />
          <span className="text-amber-600 font-medium">🔝 MFE</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.mae}
            onChange={e => setVisible(v => ({ ...v, mae: e.target.checked }))}
            className="accent-red-500"
          />
          <span className="text-red-600 font-medium">💥 MAE</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.exit}
            onChange={e => setVisible(v => ({ ...v, exit: e.target.checked }))}
            className="accent-emerald-500"
          />
          <span className="text-emerald-600 font-medium">📍 Exit</span>
        </label>
      </div>

      {loading ? (
        <div className="h-80 flex items-center justify-center bg-white border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-500">📈 チャート読み込み中...</div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full bg-white border border-gray-200 rounded-lg"
          style={{ height: 320 }}
        />
      )}
    </div>
  )
}
