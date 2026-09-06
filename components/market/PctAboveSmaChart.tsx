'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchPctAboveSmaTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'
import { CHART, REF_LINE } from '@/lib/chartColors'

export function PctAboveSmaChart({ height = 180 }: { height?: number }) {
  const { selectedDate, isLatest } = useDate()
  const [sma50Data, setSma50Data] = useState<TimeSeriesPoint[]>([])
  const [sma200Data, setSma200Data] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  // 過去スナップショット選択時はその日以前のみ描画（ヘッダーの数値と揃える）。
  // 最新選択時は endDate なし = 従来どおり全期間。
  const endDate = isLatest ? undefined : selectedDate

  useEffect(() => {
    let cancelled = false
    fetchPctAboveSmaTimeSeries(180, endDate).then((result) => {
      if (cancelled) return
      setSma50Data(result.sma50)
      setSma200Data(result.sma200)
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
        price: 50,
        color: REF_LINE,
        title: '50%',
        lineStyle: LineStyle.Dashed,
      },
    ],
    [],
  )

  if (loading || sma50Data.length === 0) return null

  return (
    <div className="mt-3">
      <TimeSeriesChart
        data={sma50Data}
        secondaryData={sma200Data}
        color={CHART.negative}
        secondaryColor={CHART.positive}
        name="SMA50"
        secondaryName="SMA200"
        height={height}
        yMin={0}
        yMax={100}
        horizontalLines={horizontalLines}
      />
    </div>
  )
}
