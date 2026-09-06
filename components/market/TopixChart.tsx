'use client'

import { useEffect, useState } from 'react'
import { MarketConditions } from '@/types/market'
import { useDate } from '@/contexts/DateContext'
// ローソク足 + EMA + 出来高バーの描画器は業種チャートと共通のものを使う。
import CandleChart, { MaLegend, VolumeLegend } from '@/components/sectors33/SectorCandleChart'
import {
  fetchTopixChartData,
  DEFAULT_TOPIX_RANGE,
  TOPIX_RANGES,
  type TopixChartData,
  type TopixRangeKey,
} from '@/lib/topixChartFetch'
import { formatShares, formatVolumeRatio } from '@/lib/format'
import { VOLUME_HEAVY_RATIO, volumeBarColor } from '@/lib/volume'
import Tooltip from '@/components/shared/Tooltip'

type Props = {
  /** ヘッダー数値に使う選択日の行（ページ側で取得済みのものを渡す） */
  market: MarketConditions | null
  height?: number
}

const EMPTY: TopixChartData = { bars: [], volumes: [], visibleBars: 0, error: null }

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmtIndex(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 2 }) : '—'
}

function ChangePill({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[var(--text-muted)]">{label}</span>
      {isNum(value) ? (
        <span
          className="font-mono text-small font-medium tabular-nums"
          style={{ color: value >= 0 ? 'var(--positive)' : 'var(--negative)' }}
        >
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)}%
        </span>
      ) : (
        <span className="text-[var(--text-muted)]">—</span>
      )}
    </div>
  )
}

function SmaBadge({ above, label }: { above: boolean | null | undefined; label: string }) {
  if (above === null || above === undefined) {
    return (
      <span className="px-1.5 py-0.5 rounded text-caption bg-[var(--bg-primary)] text-[var(--text-muted)]">
        {label} N/A
      </span>
    )
  }
  return (
    <span
      className="px-1.5 py-0.5 rounded text-caption font-medium"
      style={
        above
          ? { backgroundColor: 'var(--positive-bg)', color: 'var(--positive)' }
          : { backgroundColor: 'var(--negative-bg)', color: 'var(--negative)' }
      }
    >
      {label} {above ? '↑' : '↓'}
    </span>
  )
}

/**
 * TOPIX のローソク足 + 市場出来高。
 *
 * ⚠️ 出来高は TOPIX 指数のものではない（指数に出来高は存在しない）。
 *    個別株の出来高を全銘柄合算した値なので、ラベルは「市場出来高」とする。
 */
export default function TopixChart({ market, height = 380 }: Props) {
  const { selectedDate, isLatest } = useDate()
  const [range, setRange] = useState<TopixRangeKey>(DEFAULT_TOPIX_RANGE)
  const [data, setData] = useState<TopixChartData>(EMPTY)
  const [loading, setLoading] = useState(true)

  // 過去スナップショット選択時はその日以前のみ描画（カードの数値と揃える）
  const endDate = isLatest ? undefined : selectedDate || undefined

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTopixChartData(range, endDate).then((res) => {
      if (cancelled) return
      setData(res)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [range, endDate])

  const pct52wh = market?.topix_pct_52wh

  // 出来高の平常比 = market_volume / market_volume_ma20。1.0 が平常。
  const volume = market?.market_volume
  const volumeMa20 = market?.market_volume_ma20
  const volumeRatio =
    isNum(volume) && isNum(volumeMa20) && volumeMa20 > 0 ? volume / volumeMa20 : null

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-title font-medium text-[var(--text-primary)]">TOPIX</h2>
          <p className="text-caption text-[var(--text-muted)] mt-0.5">
            東証株価指数（指数ポイント）と市場出来高
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <MaLegend />
          <VolumeLegend />
          <div className="flex gap-1">
            <SmaBadge above={market?.topix_above_sma50} label="SMA50" />
            <SmaBadge above={market?.topix_above_sma200} label="SMA200" />
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* 左: 数値（既存の TOPIX 系カラム） */}
        <div className="flex-shrink-0 lg:w-[220px]">
          <div className="text-title font-medium font-mono tabular-nums text-[var(--text-primary)]">
            {fmtIndex(market?.topix_price)}
          </div>
          <p className="text-caption text-[var(--text-muted)] mb-4">指数ポイント（終値）</p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-small">
            <ChangePill label="1W" value={market?.topix_chg_1w} />
            <ChangePill label="1M" value={market?.topix_chg_1m} />
            <ChangePill label="YTD" value={market?.topix_chg_ytd} />
            <ChangePill label="1Y" value={market?.topix_chg_1y} />
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border)] text-caption flex justify-between">
            <span className="text-[var(--text-muted)]">To 52W High</span>
            <span className="font-mono font-medium tabular-nums text-[var(--text-secondary)]">
              {isNum(pct52wh) ? `${pct52wh.toFixed(2)}%` : '—'}
            </span>
          </div>

          {/* 市場出来高 — TOPIX 指数の出来高ではないので名前を分けて示す */}
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <Tooltip content="個別株（ETF/ETN/JDR/REIT を除く）の出来高を全銘柄合算した値。TOPIX 指数そのものに出来高データは存在しない。">
              <p className="text-caption text-[var(--text-muted)] uppercase tracking-wide">
                市場出来高（東証・個別株）
              </p>
            </Tooltip>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-mono text-title font-medium tabular-nums text-[var(--text-primary)]">
                {formatShares(volume)}
              </span>
              <span
                className="font-mono text-small font-medium tabular-nums"
                style={{
                  color:
                    (volumeRatio ?? 0) >= VOLUME_HEAVY_RATIO
                      ? volumeBarColor(volumeRatio)
                      : 'var(--text-muted)',
                }}
              >
                平常比 {formatVolumeRatio(volumeRatio)}
              </span>
            </div>
            <p className="text-caption text-[var(--text-muted)] mt-0.5">
              20日平均 {formatShares(volumeMa20)}
            </p>
          </div>
        </div>

        {/* 右: ローソク足 + 出来高 */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-end mb-2">
            <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-caption">
              {TOPIX_RANGES.map((r, i) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1 font-medium ${
                    range === r.key
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                  } ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {data.error ? (
            <div
              className="flex items-center justify-center rounded-md bg-[var(--sem-weak-bg)] text-small text-[var(--sem-weak-fg)] px-4 text-center"
              style={{ height }}
            >
              TOPIX チャート取得エラー: {data.error}
            </div>
          ) : loading && data.bars.length === 0 ? (
            <div
              className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)]"
              style={{ height }}
            >
              読み込み中…
            </div>
          ) : (
            <CandleChart
              bars={data.bars}
              volumes={data.volumes}
              volumeLabel="市場出来高"
              height={height}
              visibleBars={data.visibleBars || undefined}
            />
          )}
        </div>
      </div>
    </div>
  )
}
