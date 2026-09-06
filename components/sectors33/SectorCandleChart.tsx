'use client'

import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  IChartApi,
  createChart,
} from 'lightweight-charts'
import type { OhlcvBar, VolumeBar } from '@/types/chart'
import { ema, toSeries, type SeriesPoint } from '@/lib/indicators'
import { cssVar } from '@/lib/cssVar'
import { monthlyTickMarkFormatter } from '@/components/market/TimeSeriesChart'
import { formatShares, formatVolumeRatio } from '@/lib/format'
import {
  VOLUME_COLORS,
  VOLUME_HEAVY_RATIO,
  VOLUME_SURGE_RATIO,
  volumeBarColor,
} from '@/lib/volume'
import { CHART, EMA_COLORS, GRID_LINE, emaLineColor } from '@/lib/chartColors'


// 期間と色は TradingView 側のチャート設定に合わせる。
// 線は 30% 不透明（emaLineColor）で引き、凡例の文字だけ原色を使う。
// 50 は 75 から変更した。移動平均は bars から都度計算しているので、
// 期間を変えるだけで別途データを取りに行く必要はない。
export const MA_CONFIG: { length: 10 | 21 | 50 | 150; color: string; label: string }[] = [
  { length: 10, color: EMA_COLORS[10], label: 'EMA10' },
  { length: 21, color: EMA_COLORS[21], label: 'EMA21' },
  { length: 50, color: EMA_COLORS[50], label: 'EMA50' },
  { length: 150, color: EMA_COLORS[150], label: 'EMA150' },
]

// チャート内の細い線だけでは EMA の色が判別しづらいため、
// セクションヘッダー直下に置く独立した凡例ストリップとして見せる。
export function MaLegend({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-3 flex-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-card-hover)] px-3 py-1.5 ${className}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        EMA
      </span>
      {MA_CONFIG.map((m) => (
        <span key={m.length} className="flex items-center gap-1.5">
          <span
            className="inline-block w-6 h-[3px] rounded-full"
            style={{ backgroundColor: emaLineColor(m.length) }}
          />
          <span className="text-xs font-semibold font-mono" style={{ color: m.color }}>
            {m.length}
          </span>
        </span>
      ))}
    </div>
  )
}

// 出来高バーの色の意味（平常比）を示す凡例。チャート内では色しか読めないため、
// 出来高バーを出す画面のヘッダーに置く。
export function VolumeLegend({ className = '' }: { className?: string }) {
  const items = [
    { color: VOLUME_COLORS.normal, label: `平常比 <${VOLUME_HEAVY_RATIO}` },
    { color: VOLUME_COLORS.heavy, label: `≥${VOLUME_HEAVY_RATIO}` },
    { color: VOLUME_COLORS.surge, label: `≥${VOLUME_SURGE_RATIO}` },
  ]
  return (
    <div
      className={`inline-flex items-center gap-3 flex-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-card-hover)] px-3 py-1.5 ${className}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        出来高
      </span>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-[2px]"
            style={{ backgroundColor: it.color }}
          />
          <span className="text-xs font-mono text-[var(--text-secondary)]">{it.label}</span>
        </span>
      ))}
    </div>
  )
}

export type MetricOverlay = {
  points: SeriesPoint[]
  color: string
}

type Props = {
  bars: OhlcvBar[]
  /** 0-100 のスコア系指標をローソク足の下部に重ねる（任意） */
  metric?: MetricOverlay | null
  /**
   * 出来高バー（株）。渡すとローソク足の下部にヒストグラムを描き、
   * 平常比 (出来高 / 20日平均) で色分けする。
   */
  volumes?: VolumeBar[] | null
  /** 出来高バッジのラベル。例: 「市場出来高」「業種出来高」 */
  volumeLabel?: string
  height?: number
  /**
   * 初期表示する足数。EMA150 の助走ぶんを含めて bars を渡し、
   * ここで直近 N 本だけを表示する（助走部分は画面外に置く）。
   * 省略時は全期間を表示。
   */
  visibleBars?: number
}

export default function SectorCandleChart({
  bars,
  metric,
  volumes,
  volumeLabel = '出来高',
  height = 300,
  visibleBars,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const hasVolume = !!volumes && volumes.length > 0
  const latestVolume = hasVolume ? volumes[volumes.length - 1] : null

  useEffect(() => {
    const container = containerRef.current
    if (!container || bars.length === 0) return

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
        // 指標オーバーレイ / 出来高を置くときは価格を上寄せして描画域を分ける
        scaleMargins:
          metric && hasVolume
            ? { top: 0.04, bottom: 0.46 }
            : metric
              ? { top: 0.05, bottom: 0.34 }
              : hasVolume
                ? { top: 0.06, bottom: 0.26 }
                : { top: 0.08, bottom: 0.08 },
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

    const closes = bars.map((b) => b.close)
    // MA は candlestick の背後に来るよう先に追加する。
    // title を付けると価格軸に EMA10/21/50/150 のバッジが積み上がって
    // 値動きを隠すため付けない（色の対応はヘッダーの MaLegend で示す）。
    for (const m of MA_CONFIG) {
      const line = chart.addSeries(LineSeries, {
        color: emaLineColor(m.length),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      line.setData(toSeries(bars, ema(closes, m.length)))
    }

    // ローソク足は白黒（TradingView 側の設定に合わせる）。陽線は白抜き、
    // 陰線は塗り、枠とヒゲはどちらも黒。値動きの向きは実体の塗りで読む。
    // 色は globals.css の --candle-* が持ち、canvas 用に実値へ解決して渡す。
    const up = cssVar('--candle-up', CHART.candleUp)
    const down = cssVar('--candle-down', CHART.candleDown)
    const edge = cssVar('--candle-line', CHART.candleLine)
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: edge,
      borderDownColor: edge,
      wickUpColor: edge,
      wickDownColor: edge,
      priceLineVisible: false,
    })
    candle.setData(
      bars.map((b) => ({
        time: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    // 出来高: 独立スケールで最下部に描く。色は平常比 (出来高/20日平均)。
    // 生の株数は株価水準の違う銘柄の合算なので、バーの高さより色（平常比）で読む。
    if (volumes && volumes.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: 'volume' },
      })
      volumeSeries.setData(
        volumes.map((v) => ({
          time: v.date,
          value: v.volume,
          color: volumeBarColor(v.ratio),
        })),
      )
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      })
    }

    // 指標オーバーレイ: 0-100 固定の独立スケールで下部 30% に描く
    if (metric && metric.points.length > 0) {
      // 現在値はチャート下のセルに出ているので、軸バッジは出さない。
      const metricSeries = chart.addSeries(LineSeries, {
        color: metric.color,
        lineWidth: 2,
        priceScaleId: 'metric',
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
        }),
      })
      metricSeries.setData(metric.points)
      // 出来高バーと重ならないよう、出来高があるときは 1 段上に寄せる
      chart.priceScale('metric').applyOptions({
        scaleMargins: hasVolume ? { top: 0.58, bottom: 0.22 } : { top: 0.7, bottom: 0 },
      })
    }

    // 助走ぶんを画面外に置き、直近 visibleBars 本だけを表示する。
    // EMA は全期間で計算済みなので、表示範囲の左端から EMA150 が引かれる。
    if (visibleBars && bars.length > visibleBars) {
      chart
        .timeScale()
        .setVisibleLogicalRange({ from: bars.length - visibleBars, to: bars.length - 1 })
    } else {
      chart.timeScale().fitContent()
    }
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
  }, [bars, metric, volumes, hasVolume, height, visibleBars])

  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        指数データがありません
      </div>
    )
  }

  return (
    <div
      className="relative w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)]"
      style={{ height, minHeight: height }}
    >
      <div ref={containerRef} className="w-full h-full" />

      {/* 出来高の現在値。チャートにはツールチップが無く、バーは色でしか読めないため
          最新日の実数と平常比をバッジで出す。 */}
      {latestVolume && (
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] font-mono tabular-nums pointer-events-none">
          <span
            className="inline-block w-2 h-2 rounded-[2px]"
            style={{ backgroundColor: volumeBarColor(latestVolume.ratio) }}
          />
          <span className="text-[var(--text-muted)]">{volumeLabel}</span>
          <span className="text-[var(--text-secondary)] font-semibold">
            {formatShares(latestVolume.volume)}
          </span>
          <span
            className="font-semibold"
            style={{
              color:
                (latestVolume.ratio ?? 0) >= VOLUME_HEAVY_RATIO
                  ? volumeBarColor(latestVolume.ratio)
                  : 'var(--text-muted)',
            }}
          >
            平常比 {formatVolumeRatio(latestVolume.ratio)}
          </span>
        </div>
      )}
    </div>
  )
}
