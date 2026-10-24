'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/shared/Modal'
import TvChart from '@/components/chart/TvChart'
import type { MaLength } from '@/components/sectors33/SectorCandleChart'
import { MarketConditions } from '@/types/market'
import type { IndexKey } from '@/lib/indexTrendFetch'
import {
  DEFAULT_INDEX_RANGE,
  INDEX_RANGES,
  fetchIndexChartData,
  type IndexChartData,
  type IndexRangeKey,
} from '@/lib/indexChartFetch'
import type { TrendState } from '@/lib/trendState'
import { CloseVs, EmaChain, SignalPill, Slopes } from './trendAtoms'

// 指数カードの詳細。判定の材料 + 期間リターン + TradingView 風チャート。

const MA_LENGTHS: MaLength[] = [9, 21, 50, 150]

/** 期間ボタンの並び（TradingView の下部バーと同じく左下に置く） */
export function RangeBar<K extends string>({
  ranges,
  value,
  onChange,
}: {
  ranges: { key: K; label: string }[]
  value: K
  onChange: (k: K) => void
}) {
  return (
    <div className="flex gap-1 text-caption">
      {ranges.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={`px-2.5 py-1 rounded-md font-medium ${
            value === r.key
              ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

function Change({ label, value }: { label: string; value: number | null | undefined }) {
  const ok = value != null && Number.isFinite(value)
  return (
    <div className="flex flex-col">
      <span className="text-caption text-[var(--text-muted)]">{label}</span>
      <span
        className="font-mono tabular-nums text-small font-medium"
        style={{ color: !ok ? 'var(--text-muted)' : value >= 0 ? 'var(--positive)' : 'var(--negative)' }}
      >
        {ok ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
      </span>
    </div>
  )
}

export default function IndexDetailModal({
  index,
  label,
  state,
  market,
  endDate,
  onClose,
}: {
  index: IndexKey
  label: string
  state: TrendState | null
  market: MarketConditions | null
  endDate?: string
  onClose: () => void
}) {
  const [range, setRange] = useState<IndexRangeKey>(DEFAULT_INDEX_RANGE)
  const [data, setData] = useState<IndexChartData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchIndexChartData(index, range, endDate).then((res) => {
      if (!cancelled) setData(res)
    })
    return () => {
      cancelled = true
    }
  }, [index, range, endDate])

  // 期間リターン・52 週高値までの距離は market_conditions の *_chg_* 列（3 指数とも同じ命名）
  const col = (suffix: string) => (market ? (market as unknown as Record<string, number | null>)[`${index}_${suffix}`] : null)

  return (
    <Modal open onClose={onClose} title={label} size="xl">
      <div className="p-6 space-y-4">
        {state && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-small">
            <SignalPill signal={state.signal} label={state.label} />
            <Slopes state={state} />
            <EmaChain state={state} />
            <div className="flex gap-4 text-caption">
              <CloseVs state={state} label="週足EMA9" value={state.weeklyEma9} />
              <CloseVs state={state} label="EMA50" value={state.ema50} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-6">
          <Change label="1W" value={col('chg_1w')} />
          <Change label="1M" value={col('chg_1m')} />
          <Change label="YTD" value={col('chg_ytd')} />
          <Change label="1Y" value={col('chg_1y')} />
          <Change label="To 52W High" value={col('pct_52wh')} />
        </div>

        {data?.error ? (
          <div className="rounded-md bg-[var(--sem-weak-bg)] text-small text-[var(--sem-weak-fg)] p-4">
            チャート取得エラー: {data.error}
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)] h-[520px]">
            読み込み中…
          </div>
        ) : (
          <TvChart
            title={label}
            bars={data.bars}
            volumes={data.volumes}
            volumeLabel="市場出来高"
            lineOnly={data.lineOnly}
            maLengths={MA_LENGTHS}
            visibleBars={data.visibleBars || undefined}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeBar ranges={INDEX_RANGES} value={range} onChange={setRange} />
          <p className="text-caption text-[var(--text-muted)]">
            {data?.lineOnly ? '終値しか無いため線で表示。' : ''}
            出来高は東証の個別株（ETF/ETN/JDR/REIT を除く）を全銘柄合算した市場出来高で、指数の出来高ではない
          </p>
        </div>
      </div>
    </Modal>
  )
}
