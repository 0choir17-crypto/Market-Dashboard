'use client'

import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
  TickMarkType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  type Time,
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'

// 月ラベルを毎月表示させるための共通フォーマッタ。
// lightweight-charts のデフォルトは横幅が狭いと月を間引く（2ヶ月ごと等）ため、
// Month ティックを「M月」、年境界を「YYYY年」、日は「M/D」で明示的に整形する。
export function monthlyTickMarkFormatter(
  time: Time,
  tickMarkType: TickMarkType,
): string {
  let year: number
  let month: number
  let day: number
  if (typeof time === 'object' && time !== null && 'year' in time) {
    year = time.year
    month = time.month
    day = time.day
  } else {
    const dt = new Date(time as string)
    year = dt.getUTCFullYear()
    month = dt.getUTCMonth() + 1
    day = dt.getUTCDate()
  }
  switch (tickMarkType) {
    case TickMarkType.Year:
      return `${year}年`
    case TickMarkType.Month:
      return `${month}月`
    default:
      return `${month}/${day}`
  }
}

export interface TimeSeriesPoint {
  time: string
  value: number
}

export interface HorizontalLine {
  price: number
  color: string
  title?: string
  lineStyle?: LineStyle
  axisLabelVisible?: boolean
}

export interface TimeSeriesChartProps {
  data: TimeSeriesPoint[]
  secondaryData?: TimeSeriesPoint[]
  color?: string
  secondaryColor?: string
  name?: string
  secondaryName?: string
  horizontalLines?: HorizontalLine[]
  height?: number
  yMax?: number
  yMin?: number
}

// デフォルト引数に [] リテラルを使うと毎レンダーで identity が変わり
// 下の setData effect が無駄に走るため、モジュール定数を使う
const NO_LINES: HorizontalLine[] = []

type ChartHandles = {
  chart: IChartApi
  mainSeries: ISeriesApi<'Line'>
}

export function TimeSeriesChart({
  data,
  secondaryData,
  color = '#10b981',
  secondaryColor = '#3b82f6',
  name,
  secondaryName,
  horizontalLines = NO_LINES,
  height = 240,
  yMax,
  yMin,
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [handles, setHandles] = useState<ChartHandles | null>(null)
  const secSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  const hasData = data.length > 0

  // チャート生成: マウント時とスタイル系 props 変更時のみ。
  // data 変更でチャートを作り直すとパン/ズームが失われるため分離している。
  useEffect(() => {
    const container = containerRef.current
    if (!container || !hasData) return

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
        tickMarkFormatter: monthlyTickMarkFormatter,
      },
      rightPriceScale: {
        borderColor: '#cbd5e1',
      },
      crosshair: { mode: 1 },
      autoSize: true,
    })

    const mainSeries = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: name,
    })

    if (yMax !== undefined && yMin !== undefined) {
      const yMinFixed = yMin
      const yMaxFixed = yMax
      mainSeries.applyOptions({
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: yMinFixed, maxValue: yMaxFixed },
        }),
      })
    }

    setHandles({ chart, mainSeries })

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      secSeriesRef.current = null
      priceLinesRef.current = []
      setHandles(null)
    }
  }, [hasData, color, name, height, yMin, yMax])

  // データ・水平線の反映: 既存チャートに setData するだけで作り直さない
  useEffect(() => {
    if (!handles) return
    const { chart, mainSeries } = handles

    mainSeries.setData(data)

    if (secondaryData && secondaryData.length > 0) {
      if (!secSeriesRef.current) {
        secSeriesRef.current = chart.addSeries(LineSeries, {
          color: secondaryColor,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: secondaryName,
        })
      } else {
        secSeriesRef.current.applyOptions({
          color: secondaryColor,
          title: secondaryName,
        })
      }
      secSeriesRef.current.setData(secondaryData)
    } else if (secSeriesRef.current) {
      chart.removeSeries(secSeriesRef.current)
      secSeriesRef.current = null
    }

    priceLinesRef.current.forEach((line) => mainSeries.removePriceLine(line))
    priceLinesRef.current = horizontalLines.map((line) =>
      mainSeries.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: line.lineStyle ?? LineStyle.Dashed,
        axisLabelVisible: line.axisLabelVisible ?? true,
        title: line.title ?? '',
      }),
    )

    chart.timeScale().fitContent()
  }, [handles, data, secondaryData, secondaryColor, secondaryName, horizontalLines])

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        データがありません
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
