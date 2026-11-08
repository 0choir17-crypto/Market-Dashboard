'use client'

import { useEffect, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { INDEX_EXT_R_NOTE, MarketConditions, indexExtR, type ExtValues } from '@/types/market'
import { fetchIndexExtRecent, fetchIndexTrends, INDEXES, type ExtHist, type IndexExtRecent, type IndexKey, type IndexTrendResult } from '@/lib/indexTrendFetch'
import { fetchBreadthState, type BreadthState } from '@/lib/breadthState'
import type { TrendState } from '@/lib/trendState'
import BreadthStateCard from './BreadthStateCard'
import LeaderStateCard from './LeaderStateCard'
import { fetchLeaderState, type LeaderStateResult } from '@/lib/leaderState'
import IndexDetailModal from './IndexDetailModal'
import { CardButton, ExtRGrid, RSparklines, SignalPill, fmtLevel } from './trendAtoms'

// Market Regime: 3 指数（TOPIX / 日経225 / グロース250）+ Market Breadth + 主導株（大型 / 中小）の 6 枚。
// 広い画面では横 1 列、通常の PC 幅では 3 枚 × 2 段（上 = 指数、下 = 参加度と主導株）。
// 自分の成績（My Trades）はこの上の列に別に置く（app/page.tsx）。
// 指数の判定は日足 EMA9 / EMA21 の位置と向き。カードには判定と、終値と EMA9 / 21 / 50 の距離（R）だけを出す
// R はバッチ側の値（market_conditions の *_ext_ema*。日付ピッカーで選んだ日の行）をそのまま表示する。
// （株価の位置は R で読めるので、EMA の向き・並びはカードに出さない。詳細モーダルには残す）。
// カードをクリックすると詳細を開く。

function IndexCard({
  label,
  state,
  ext,
  extDiff,
  hist,
  onOpen,
}: {
  label: string
  state: TrendState | null
  ext: ExtValues
  /** 5 営業日前からの変化 */
  extDiff: ExtValues | null
  /** EMA9 / 21 / 50 距離（R）の直近 20 営業日 */
  hist: ExtHist | null
  onOpen: () => void
}) {
  return (
    <CardButton onClick={onOpen} label={label} className="p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-small font-medium text-[var(--text-primary)]">{label}</h3>
        {state && <span className="num text-small text-[var(--text-secondary)]">{fmtLevel(state.close)}</span>}
      </div>
      {!state ? (
        <p className="text-caption text-[var(--text-muted)] mt-3">データが足りません</p>
      ) : (
        <div className="mt-3">
          <SignalPill signal={state.signal} label={state.label} />
        </div>
      )}
      <RSparklines
        series={[
          { label: '9', points: hist?.h9 ?? [] },
          { label: '21', points: hist?.h21 ?? [] },
          { label: '50', points: hist?.h50 ?? [] },
        ]}
        height={72}
        className="mt-4"
      />
      <ExtRGrid
        ema9={ext.v9}
        ema21={ext.v21}
        ema50={ext.v50}
        diff9={extDiff?.v9}
        diff21={extDiff?.v21}
        diff50={extDiff?.v50}
        note={INDEX_EXT_R_NOTE}
        large
        className="mt-3 pt-3 border-t border-[var(--border)]"
      />
    </CardButton>
  )
}

export default function IndexStateCards({ market }: { market: MarketConditions | null }) {
  const { selectedDate, isLatest } = useDate()
  const [result, setResult] = useState<IndexTrendResult | null>(null)
  const [breadth, setBreadth] = useState<{ state: BreadthState | null; error: string | null } | null>(null)
  const [leaders, setLeaders] = useState<LeaderStateResult | null>(null)
  const [openIndex, setOpenIndex] = useState<IndexKey | null>(null)
  const [extRecent, setExtRecent] = useState<IndexExtRecent | null>(null)

  // 過去スナップショット選択時はその日以前のデータで判定する
  const endDate = isLatest ? undefined : selectedDate || undefined

  useEffect(() => {
    let cancelled = false
    fetchIndexTrends(endDate).then((res) => {
      if (!cancelled) setResult(res)
    })
    fetchIndexExtRecent(endDate).then((res) => {
      if (!cancelled) setExtRecent(res)
    })
    fetchBreadthState(endDate).then((res) => {
      if (!cancelled) setBreadth(res)
    })
    fetchLeaderState(endDate).then((res) => {
      if (!cancelled) setLeaders(res)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  const opened = INDEXES.find((i) => i.key === openIndex)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-title font-medium text-[var(--text-primary)]">Market Regime</h2>
        <span className="text-caption text-[var(--text-muted)]">
          指数の EMA9 / EMA21 判定と EMA からの距離（R）・市場の参加度・主導株。カードをクリックで詳細
        </span>
      </div>
      {result?.error && (
        <div className="card p-4 mb-4 text-small text-[var(--sem-weak-fg)]">指数データ取得エラー: {result.error}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {INDEXES.map((idx) =>
          result ? (
            <IndexCard
              key={idx.key}
              label={idx.label}
              state={result.states[idx.key]}
              ext={indexExtR(market, idx.key)}
              extDiff={extRecent?.diffs[idx.key] ?? null}
              hist={extRecent?.hist[idx.key] ?? null}
              onOpen={() => setOpenIndex(idx.key)}
            />
          ) : (
            <div key={idx.key} className="card p-5 text-small text-[var(--text-muted)]">
              {idx.label} 読み込み中…
            </div>
          ),
        )}
        <BreadthStateCard
          state={breadth?.state ?? null}
          error={breadth?.error ?? null}
          market={market}
          endDate={endDate}
        />
        {(['large', 'mid'] as const).map((tier) => (
          <LeaderStateCard
            key={tier}
            tier={tier}
            state={leaders?.tiers[tier] ?? null}
            date={leaders?.date ?? null}
            prevDate={leaders?.prevDate ?? null}
            error={leaders?.error ?? null}
            endDate={endDate}
          />
        ))}
      </div>

      {opened && (
        <IndexDetailModal
          index={opened.key}
          label={opened.label}
          state={result?.states[opened.key] ?? null}
          extDiff={extRecent?.diffs[opened.key] ?? null}
          market={market}
          endDate={endDate}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  )
}
