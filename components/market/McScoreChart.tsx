'use client'

import { useEffect, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchMcScoreTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'

interface Props {
  height?: number
}

export function McScoreChart({ height = 240 }: Props) {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedDate) return
    let cancelled = false
    setLoading(true)
    fetchMcScoreTimeSeries(180, selectedDate).then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const latest = data.length > 0 ? data[data.length - 1].value : null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500">
          MC v4 Score — Last 180 days
        </h3>
        {latest !== null && (
          <span className="text-sm font-mono text-[var(--text-secondary)]">
            {isLatest ? 'Latest' : 'Selected'}: {latest.toFixed(1)}/100
          </span>
        )}
      </div>
      {loading ? (
        <div
          className="flex items-center justify-center bg-slate-50 rounded-md text-sm text-slate-400"
          style={{ height }}
        >
          Loading...
        </div>
      ) : (
        <TimeSeriesChart
          data={data}
          color="#10b981"
          name="MC v4"
          height={height}
          yMin={0}
          yMax={100}
          horizontalLines={[
            // regime 境界 (mc_v4_config.py: 80/60/40/20)
            {
              price: 80,
              color: 'rgba(99, 153, 34, 0.5)',
              title: 'Strong Bull 80',
              lineStyle: LineStyle.Dashed,
            },
            {
              price: 60,
              color: 'rgba(151, 196, 89, 0.4)',
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
            },
            {
              price: 40,
              color: 'rgba(180, 178, 169, 0.4)',
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
            },
            {
              price: 20,
              color: 'rgba(226, 75, 74, 0.5)',
              title: 'Strong Bear 20',
              lineStyle: LineStyle.Dashed,
            },
          ]}
        />
      )}
    </div>
  )
}
