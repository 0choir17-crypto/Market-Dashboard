'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts'
import type { OhlcvBar, VolumeBar } from '@/types/chart'
import { ema, toSeries } from '@/lib/indicators'
import { cssVar } from '@/lib/cssVar'
import { monthlyTickMarkFormatter } from '@/components/market/TimeSeriesChart'
import { formatShares, formatVolumeRatio } from '@/lib/format'
import { VOLUME_HEAVY_RATIO, volumeBarColor } from '@/lib/volume'
import { CHART, EMA_COLORS, GRID_LINE, emaLineColor } from '@/lib/chartColors'
import type { MaLength } from '@/components/sectors33/SectorCandleChart'

// TradingView の画面構成に寄せた詳細チャート（モーダル用）。
// - 左上の凡例: 銘柄名・足種 / 始高安終と前日比 / EMA ごとの値 / 出来高。
//   カーソルを載せた足の値に切り替わり、外すと最新足に戻る
// - 右の価格軸に最新値のラベル、下段に出来高（平常比で色分け）
// - ドラッグで移動、ピンチ・軸のドラッグで拡大縮小。ホイールはスクロールに譲る（モーダルのスクロールで拡大縮小してしまうため）
// 足は白黒、EMA は TradingView と同じ色（docs/DESIGN_DIRECTION.md 3.6）。

type Props = {
  title: string
  bars: OhlcvBar[]
  volumes?: VolumeBar[] | null
  volumeLabel?: string
  /** true = 終値しか無い（ローソク足の代わりに終値の線で描く） */
  lineOnly?: boolean
  maLengths: MaLength[]
  /** 初期表示する足数（EMA の助走ぶんを画面外に置く） */
  visibleBars?: number
  height?: number
}

function fmtPrice(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TvChart({
  title,
  bars,
  volumes,
  volumeLabel = '出来高',
  lineOnly = false,
  maLengths,
  visibleBars,
  height = 520,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // カーソル位置の足の番号。null = 最新足
  const [hover, setHover] = useState<number | null>(null)

  const emas = useMemo(() => {
    const closes = bars.map((b) => b.close)
    return maLengths.map((len) => ({ len, values: ema(closes, len) }))
  }, [bars, maLengths])

  const volumeByDate = useMemo(() => new Map((volumes ?? []).map((v) => [v.date, v])), [volumes])

  useEffect(() => {
    const container = containerRef.current
    if (!container || bars.length === 0) return
    const hasVolume = !!volumes && volumes.length > 0

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: CHART.textSecondary,
        attributionLogo: false,
      },
      // 十字線の日付ラベルを「2026-07-31」の形にする（既定は「31 Jul '26」）
      localization: { locale: 'ja-JP', dateFormat: 'yyyy-MM-dd' },
      grid: { vertLines: { color: GRID_LINE }, horzLines: { color: GRID_LINE } },
      timeScale: {
        timeVisible: false,
        borderColor: CHART.borderStrong,
        tickMarkFormatter: monthlyTickMarkFormatter,
        rightOffset: 5,
      },
      rightPriceScale: {
        borderColor: CHART.borderStrong,
        scaleMargins: hasVolume ? { top: 0.12, bottom: 0.24 } : { top: 0.12, bottom: 0.06 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
      // ページ / モーダルをスクロールしたときにチャートが拡大縮小しないよう
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

    for (const { len, values } of emas) {
      const line = chart.addSeries(LineSeries, {
        color: emaLineColor(len),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      line.setData(toSeries(bars, values))
    }

    if (lineOnly) {
      const main = chart.addSeries(LineSeries, {
        color: cssVar('--candle-line', CHART.candleLine),
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      })
      main.setData(bars.map((b) => ({ time: b.date, value: b.close })))
    } else {
      const edge = cssVar('--candle-line', CHART.candleLine)
      const candle = chart.addSeries(CandlestickSeries, {
        upColor: cssVar('--candle-up', CHART.candleUp),
        downColor: cssVar('--candle-down', CHART.candleDown),
        borderUpColor: edge,
        borderDownColor: edge,
        wickUpColor: edge,
        wickDownColor: edge,
        priceLineVisible: true,
        lastValueVisible: true,
      })
      candle.setData(
        bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })),
      )
    }

    if (hasVolume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: 'volume' },
      })
      vol.setData(volumes!.map((v) => ({ time: v.date, value: v.volume, color: volumeBarColor(v.ratio) })))
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    }

    // 凡例はカーソル位置の足に追従させる。logical はデータの番号と一致する（先頭 0）
    chart.subscribeCrosshairMove((param) => {
      if (param.logical == null || param.point == null) {
        setHover(null)
        return
      }
      const i = Math.round(param.logical)
      setHover(i >= 0 && i < bars.length ? i : null)
    })

    if (visibleBars && bars.length > visibleBars) {
      chart.timeScale().setVisibleLogicalRange({ from: bars.length - visibleBars, to: bars.length + 4 })
    } else {
      chart.timeScale().fitContent()
    }

    return () => chart.remove()
  }, [bars, volumes, emas, lineOnly, visibleBars, height])

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)]"
        style={{ height }}
      >
        データがありません
      </div>
    )
  }

  const i = hover ?? bars.length - 1
  const bar = bars[i]
  const prev = i > 0 ? bars[i - 1] : null
  const chg = prev ? bar.close - prev.close : null
  const chgPct = prev && prev.close !== 0 ? (bar.close / prev.close - 1) * 100 : null
  const chgColor = chg == null ? 'var(--text-muted)' : chg >= 0 ? 'var(--positive)' : 'var(--negative)'
  const vol = volumeByDate.get(bar.date)

  return (
    <div className="relative w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)]" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* 凡例（TradingView の左上と同じ並び） */}
      <div className="absolute left-3 top-2 z-10 pointer-events-none space-y-0.5 text-caption font-mono tabular-nums">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-sans text-small font-medium text-[var(--text-primary)]">{title}</span>
          <span className="text-[var(--text-muted)]">1D</span>
          <span className="text-[var(--text-muted)]">{bar.date}</span>
          {lineOnly ? (
            <span>
              <span className="text-[var(--text-muted)]">C</span>{' '}
              <span style={{ color: chgColor }}>{fmtPrice(bar.close)}</span>
            </span>
          ) : (
            (['O', 'H', 'L', 'C'] as const).map((k) => (
              <span key={k}>
                <span className="text-[var(--text-muted)]">{k}</span>{' '}
                <span style={{ color: chgColor }}>
                  {fmtPrice(k === 'O' ? bar.open : k === 'H' ? bar.high : k === 'L' ? bar.low : bar.close)}
                </span>
              </span>
            ))
          )}
          {chg != null && chgPct != null && (
            <span style={{ color: chgColor }}>
              {chg >= 0 ? '+' : ''}
              {fmtPrice(chg)} ({chgPct >= 0 ? '+' : ''}
              {chgPct.toFixed(2)}%)
            </span>
          )}
        </div>
        {emas.map(({ len, values }) => (
          <div key={len}>
            <span className="text-[var(--text-muted)]">EMA {len}</span>{' '}
            <span style={{ color: EMA_COLORS[len] }}>{fmtPrice(values[i])}</span>
          </div>
        ))}
        {vol && (
          <div>
            <span className="text-[var(--text-muted)]">{volumeLabel}</span>{' '}
            <span className="text-[var(--text-secondary)]">{formatShares(vol.volume)}</span>{' '}
            <span
              style={{
                color: (vol.ratio ?? 0) >= VOLUME_HEAVY_RATIO ? volumeBarColor(vol.ratio) : 'var(--text-muted)',
              }}
            >
              平常比 {formatVolumeRatio(vol.ratio)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
