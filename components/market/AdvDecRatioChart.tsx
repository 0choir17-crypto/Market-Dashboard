'use client'

import { useEffect, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchAdvDecRatioTimeSeries } from '@/lib/marketChartData'

export function AdvDecRatioChart({ height = 180 }: { height?: number }) {
  const [data, setData] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchAdvDecRatioTimeSeries(180).then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || data.length === 0) return null

  return (
    <div className="mt-3">
      <TimeSeriesChart
        data={data}
        color="#8b5cf6"
        name="10D"
        height={height}
        horizontalLines={[
          {
            price: 120,
            color: 'rgba(239, 68, 68, 0.5)',
            title: 'Overbought',
            lineStyle: LineStyle.Dashed,
          },
          {
            price: 70,
            color: 'rgba(16, 185, 129, 0.5)',
            title: 'Oversold',
            lineStyle: LineStyle.Dashed,
          },
          {
            price: 100,
            color: 'rgba(148, 163, 184, 0.4)',
            title: '',
            lineStyle: LineStyle.Dotted,
          },
        ]}
      />
    </div>
  )
}
