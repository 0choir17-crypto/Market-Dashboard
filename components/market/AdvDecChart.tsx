'use client'

import { useEffect, useState } from 'react'
import { TimeSeriesChart, type TimeSeriesPoint } from './TimeSeriesChart'
import { fetchAdvancesDeclinesTimeSeries } from '@/lib/marketChartData'
import { useDate } from '@/contexts/DateContext'

export function AdvDecChart({ height = 200 }: { height?: number }) {
  const { selectedDate, isLatest } = useDate()
  const [advances, setAdvances] = useState<TimeSeriesPoint[]>([])
  const [declines, setDeclines] = useState<TimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(true)

  // 過去スナップショット選択時はその日以前のみ描画（ヘッダーの数値と揃える）。
  // 最新選択時は endDate なし = 従来どおり全期間。
  const endDate = isLatest ? undefined : selectedDate

  useEffect(() => {
    let cancelled = false
    fetchAdvancesDeclinesTimeSeries(180, endDate).then((result) => {
      if (cancelled) return
      setAdvances(result.advances)
      setDeclines(result.declines)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  if (loading || advances.length === 0) return null

  return (
    <div className="mt-3">
      <TimeSeriesChart
        data={advances}
        secondaryData={declines}
        color="#10b981"
        secondaryColor="#ef4444"
        name="Adv"
        secondaryName="Dec"
        height={height}
      />
    </div>
  )
}
