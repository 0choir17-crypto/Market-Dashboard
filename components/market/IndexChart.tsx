'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  LineSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts'
import { supabase } from '@/lib/supabase'

type Prefix = 'topix' | 'nikkei' | 'growth'

interface Props {
  prefix: Prefix
  displayName?: string
  height?: number
  lookbackDays?: number
}

interface PricePoint {
  time: string
  value: number
}

export function IndexChart({ prefix, displayName, height = 260, lookbackDays = 180 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  const [data, setData] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const priceCol = `${prefix}_price`
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - lookbackDays)
    const startStr = startDate.toISOString().slice(0, 10)

    supabase
      .from('market_conditions')
      .select(`date, ${priceCol}`)
      .gte('date', startStr)
      .order('date', { ascending: true })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return
        if (err || !rows) {
          setError(err?.message ?? 'データ取得失敗')
          setLoading(false)
          return
        }
        const points = (rows as unknown as Record<string, unknown>[])
          .filter((r) => r[priceCol] != null)
          .map((r) => ({
            time: r.date as string,
            value: Number(r[priceCol]),
          }))
          .filter((p) => Number.isFinite(p.value))
        setData(points)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [prefix, lookbackDays])

  useEffect(() => {
    const container = containerRef.current
    if (!container || data.length === 0) return

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.12)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.12)' },
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
      color: '#10b981',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })
    series.setData(data)
    chart.timeScale().fitContent()

    chartRef.current = chart
    seriesRef.current = series

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
      seriesRef.current = null
    }
  }, [data, height])

  if (error) {
    return (
      <div
        className="p-4 bg-red-50 rounded-md text-sm text-red-700 flex items-center"
        style={{ height }}
      >
        チャートデータ取得エラー: {error}
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-md"
        style={{ height }}
      >
        <div className="text-sm text-slate-400">読み込み中...</div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-md text-sm text-slate-400"
        style={{ height }}
      >
        {displayName ?? prefix} のデータがありません
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full rounded-md"
      style={{ height, minHeight: height }}
    />
  )
}
