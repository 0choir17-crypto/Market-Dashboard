'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchAdvDecRatioTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'
import { CHART, REF_LINE, SERIES, withAlpha } from '@/lib/chartColors'

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
        color: withAlpha(CHART.negative, 0.5),
        title: 'Overbought',
        lineStyle: LineStyle.Dashed,
      },
      {
        price: 70,
        color: withAlpha(CHART.positive, 0.5),
        title: 'Oversold',
        lineStyle: LineStyle.Dashed,
      },
      {
        price: 100,
        color: REF_LINE,
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
        color={SERIES.secondary}
        name="10D"
        height={height}
        horizontalLines={horizontalLines}
      />
    </div>
  )
}
