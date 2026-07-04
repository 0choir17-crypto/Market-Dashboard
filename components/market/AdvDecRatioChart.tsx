'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchAdvDecRatioTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'

export function AdvDecRatioChart({ height = 180 }: { height?: number }) {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  // 過去スナップショット選択時はその日以前のみ描画（ヘッダーの数値と揃える）。
  // 最新選択時は endDate なし = 従来どおり全期間。
  const endDate = isLatest ? undefined : selectedDate

  useEffect(() => {
    let cancelled = false
    fetchAdvDecRatioTimeSeries(180, endDate).then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  // inline 配列だと毎レンダーで identity が変わりチャートが無駄に更新されるため memoize
  const horizontalLines = useMemo(
    () => [
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
    ],
    [],
  )

  if (loading || data.length === 0) return null

  return (
    <div className="mt-3">
      <TimeSeriesChart
        data={data}
        color="#8b5cf6"
        name="10D"
        height={height}
        horizontalLines={horizontalLines}
      />
    </div>
  )
}
