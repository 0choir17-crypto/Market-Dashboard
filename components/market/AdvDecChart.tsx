'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineStyle } from 'lightweight-charts'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchAdvancePctTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'

// Advances と Declines の2本線は合計がほぼ一定で常に交差し見づらいため、
// 値上がり比率 (Adv%) の1本線 + 50% 基準線で Adv/Dec バランスの推移を表示する。
export function AdvDecChart({ height = 200 }: { height?: number }) {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  // 過去スナップショット選択時はその日以前のみ描画（ヘッダーの数値と揃える）。
  // 最新選択時は endDate なし = 従来どおり全期間。
  const endDate = isLatest ? undefined : selectedDate

  useEffect(() => {
    let cancelled = false
    fetchAdvancePctTimeSeries(180, endDate).then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  const horizontalLines = useMemo(
    () => [
      {
        price: 50,
        color: 'rgba(148, 163, 184, 0.6)',
        title: '50%',
        lineStyle: LineStyle.Dashed,
      },
    ],
    [],
  )

  if (loading || data.length === 0) return null

  return (
    <div className="mt-3">
      <TimeSeriesChart
        data={data}
        color="#10b981"
        name="Adv%"
        height={height}
        yMin={0}
        yMax={100}
        horizontalLines={horizontalLines}
      />
    </div>
  )
}
