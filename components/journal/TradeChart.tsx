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
import { CHART, SERIES } from '@/lib/chartColors'

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
  const [fetchError, setFetchError] = useState(false)
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
    setFetchError(false)
    const exit = trade.exit_date ?? trade.entry_date
    fetchTradeChartData(trade.ticker, trade.entry_date, exit)
      .then(result => {
        if (!cancelled) {
          setData(result.rows)
          setFetchError(result.error != null)
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) { setFetchError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [trade.ticker, trade.entry_date, trade.exit_date])

  // チャート初期化
  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    const chart = createChart(containerRef.current, {
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: CHART.textSecondary,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.15)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.15)' },
      },
      timeScale: {
        timeVisible: false,
        borderColor: CHART.borderStrong,
      },
      rightPriceScale: {
        borderColor: CHART.borderStrong,
      },
      crosshair: { mode: 1 },
      autoSize: true,
    })

    const series = chart.addSeries(LineSeries, {
      color: SERIES.secondary,
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

    // daily_signals はスクリーンにヒットした日しか行が無いため、Entry/Exit 等の
    // 日付が系列に存在しないことがある（存在しない time のマーカーは描画されない）。
    // 直近の過去営業日（無ければ最初の未来日）にスナップして必ず表示する。
    // 表示テキストは実際の日付・価格のまま（数日のズレはレビュー用途では許容）。
    const snapTime = (target: string): string | null => {
      if (data.length === 0) return null
      let prev: string | null = null
      for (const p of data) {
        if (p.time === target) return target
        if (p.time < target) prev = p.time
        else break
      }
      return prev ?? data[0].time
    }

    const markers: SeriesMarker<Time>[] = []

    const entryTime = trade.entry_date ? snapTime(trade.entry_date) : null
    if (visible.entry && entryTime) {
      markers.push({
        time: entryTime as Time,
        position: 'belowBar',
        color: SERIES.secondary,
        shape: 'arrowUp',
        text: `Entry ¥${trade.entry_price?.toLocaleString() ?? ''}`,
      })
    }
    const mfeTime = trade.mfe_date ? snapTime(trade.mfe_date) : null
    if (visible.mfe && mfeTime && trade.mfe_pct != null) {
      markers.push({
        time: mfeTime as Time,
        position: 'aboveBar',
        color: CHART.watchFg,
        shape: 'circle',
        text: `MFE ${trade.mfe_pct >= 0 ? '+' : ''}${trade.mfe_pct.toFixed(1)}%`,
      })
    }
    const maeTime = trade.mae_date ? snapTime(trade.mae_date) : null
    if (visible.mae && maeTime && trade.mae_pct != null) {
      markers.push({
        time: maeTime as Time,
        position: 'belowBar',
        color: CHART.negative,
        shape: 'circle',
        text: `MAE ${trade.mae_pct.toFixed(1)}%`,
      })
    }
    const exitTime = trade.exit_date ? snapTime(trade.exit_date) : null
    if (visible.exit && exitTime) {
      markers.push({
        time: exitTime as Time,
        position: 'aboveBar',
        color: CHART.positive,
        shape: 'arrowDown',
        text: `Exit ¥${trade.exit_price?.toLocaleString() ?? ''}`,
      })
    }

    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)))
    markersRef.current.setMarkers(markers)
  }, [visible, trade, data])

  if (!loading && fetchError) {
    return (
      <div className="text-caption text-[var(--negative)] bg-[var(--sem-weak-bg)] border border-[var(--sem-weak-bd)] rounded-lg px-3 py-2">
        ⚠️ チャートの取得に失敗しました（通信エラー。再読み込みしてください）
      </div>
    )
  }

  if (!loading && data.length === 0) {
    return (
      <div className="text-caption text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2">
        📈 チャートデータなし（daily_signalsに該当期間のデータがありません）
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-2 text-caption">
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.entry}
            onChange={e => setVisible(v => ({ ...v, entry: e.target.checked }))}
            className="accent-[var(--sem-focus-fg)]"
          />
          <span className="text-[var(--sem-focus-fg)] font-medium">📍 Entry</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.mfe}
            onChange={e => setVisible(v => ({ ...v, mfe: e.target.checked }))}
            className="accent-[var(--sem-watch-fg)]"
          />
          <span className="text-[var(--sem-watch-fg)] font-medium">🔝 MFE</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.mae}
            onChange={e => setVisible(v => ({ ...v, mae: e.target.checked }))}
            className="accent-[var(--negative)]"
          />
          <span className="text-[var(--negative)] font-medium">💥 MAE</span>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={visible.exit}
            onChange={e => setVisible(v => ({ ...v, exit: e.target.checked }))}
            className="accent-[var(--positive)]"
          />
          <span className="text-[var(--positive)] font-medium">📍 Exit</span>
        </label>
      </div>

      {loading ? (
        <div className="h-80 flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] rounded-lg">
          <div className="text-small text-[var(--text-secondary)]">📈 チャート読み込み中…</div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
          style={{ height: 320 }}
        />
      )}
    </div>
  )
}
