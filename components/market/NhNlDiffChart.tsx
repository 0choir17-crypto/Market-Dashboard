'use client'

import { useEffect, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchNhNlDiffTimeSeries } from '@/lib/marketChartData'

export function NhNlDiffChart({ height = 180 }: { height?: number }) {
  const [data, setData] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchNhNlDiffTimeSeries(180).then((result) => {
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
        color="#f59e0b"
        name="NH-NL"
        height={height}
        horizontalLines={[
          {
            price: 0,
            color: 'rgba(148, 163, 184, 0.6)',
            title: '0',
            lineStyle: LineStyle.Solid,
          },
        ]}
      />
    </div>
  )
}
