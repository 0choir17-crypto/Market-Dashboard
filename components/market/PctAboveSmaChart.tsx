'use client'

import { useEffect, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchPctAboveSmaTimeSeries } from '@/lib/marketChartData'

export function PctAboveSmaChart({ height = 180 }: { height?: number }) {
  const [sma50Data, setSma50Data] = useState<TimeSeriesPoint[]>([])
  const [sma200Data, setSma200Data] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchPctAboveSmaTimeSeries(180).then((result) => {
      if (cancelled) return
      setSma50Data(result.sma50)
      setSma200Data(result.sma200)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || sma50Data.length === 0) return null

  return (
    <div className="mt-3">
      <TimeSeriesChart
        data={sma50Data}
        secondaryData={sma200Data}
        color="#ef4444"
        secondaryColor="#10b981"
        name="SMA50"
        secondaryName="SMA200"
        height={height}
        yMin={0}
        yMax={100}
        horizontalLines={[
          {
            price: 50,
            color: 'rgba(148, 163, 184, 0.5)',
            title: '50%',
            lineStyle: LineStyle.Dashed,
          },
        ]}
      />
    </div>
  )
}
