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
import { CHART, GRID_LINE, SERIES } from '@/lib/chartColors'

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
  color = SERIES.primary,
  secondaryColor = SERIES.secondary,
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
        textColor: CHART.textSecondary,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID_LINE },
        horzLines: { color: GRID_LINE },
      },
      timeScale: {
        timeVisible: false,
        borderColor: CHART.borderStrong,
        tickMarkFormatter: monthlyTickMarkFormatter,
      },
      rightPriceScale: {
        borderColor: CHART.borderStrong,
      },
      crosshair: { mode: 1 },
      autoSize: true,
      // ページを下にスクロールしたときにチャートが拡大縮小しないよう
      // ホイール操作は無効化する（ドラッグ/ピンチでの操作は残す）。
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
    })

    // title / lastValue を出すと価格軸にバッジが積み上がって値動きを隠すため、
    // 系列の識別はチャート上の HTML 凡例（下の Legend）に任せる。
    const mainSeries = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
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
          lastValueVisible: false,
        })
      } else {
        secSeriesRef.current.applyOptions({ color: secondaryColor })
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
        // 軸バッジ（120.00 / 70.00 …）は積み上がって邪魔なので既定で出さない。
        // 閾値はチャート内の線とその title で読める。
        axisLabelVisible: line.axisLabelVisible ?? false,
        title: line.title ?? '',
      }),
    )

    chart.timeScale().fitContent()
  }, [handles, data, secondaryData, secondaryColor, secondaryName, horizontalLines])

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-small text-[var(--text-muted)]"
        style={{ height }}
      >
        データがありません
      </div>
    )
  }

  const hasSecondary = Boolean(secondaryData && secondaryData.length > 0)

  return (
    <div>
      {/* 系列凡例: 価格軸のバッジを廃したぶん、色の対応をここで示す */}
      {(name || (hasSecondary && secondaryName)) && (
        <div className="flex items-center gap-3 flex-wrap text-caption mb-1">
          {name && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3.5 h-[2px] rounded-full"
                style={{ backgroundColor: color }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
            </span>
          )}
          {hasSecondary && secondaryName && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3.5 h-[2px] rounded-full"
                style={{ backgroundColor: secondaryColor }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>{secondaryName}</span>
            </span>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full rounded-md"
        style={{ height, minHeight: height }}
      />
    </div>
  )
}
