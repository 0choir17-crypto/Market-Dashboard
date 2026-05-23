'use client'

import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
  IChartApi,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'

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

export function TimeSeriesChart({
  data,
  secondaryData,
  color = '#10b981',
  secondaryColor = '#3b82f6',
  name,
  secondaryName,
  horizontalLines = [],
  height = 240,
  yMax,
  yMin,
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || data.length === 0) return

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
    mainSeries.setData(data)

    if (secondaryData && secondaryData.length > 0) {
      const secSeries = chart.addSeries(LineSeries, {
        color: secondaryColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: secondaryName,
      })
      secSeries.setData(secondaryData)
    }

    horizontalLines.forEach((line) => {
      mainSeries.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: line.lineStyle ?? LineStyle.Dashed,
        axisLabelVisible: line.axisLabelVisible ?? true,
        title: line.title ?? '',
      })
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

    chart.timeScale().fitContent()
    chartRef.current = chart

    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [
    data,
    secondaryData,
    color,
    secondaryColor,
    name,
    secondaryName,
    horizontalLines,
    height,
    yMax,
    yMin,
  ])

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-md text-sm text-slate-400"
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
