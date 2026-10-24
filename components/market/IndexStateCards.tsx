'use client'

import { useEffect, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { MarketConditions } from '@/types/market'
import { fetchIndexTrends, INDEXES, type IndexKey, type IndexTrendResult } from '@/lib/indexTrendFetch'
import { fetchBreadthState, type BreadthState } from '@/lib/breadthState'
import type { TrendState } from '@/lib/trendState'
import BreadthStateCard from './BreadthStateCard'
import LeaderStateCard from './LeaderStateCard'
import { fetchLeaderState, type LeaderStateResult } from '@/lib/leaderState'
import IndexDetailModal from './IndexDetailModal'
import { CardButton, CloseVs, EmaChain, SignalPill, Slopes } from './trendAtoms'

// Market Regime: 3 指数（TOPIX / 日経225 / グロース250）+ Market Breadth + 主導株（大型 / 中小）の 6 枚。
// 広い画面では横 1 列、通常の PC 幅では 3 枚 × 2 段（上 = 指数、下 = 参加度と主導株）。
// 指数の判定は日足 EMA9 / EMA21 の位置と向き。カードをクリックすると詳細を開く。

function IndexCard({ label, state, onOpen }: { label: string; state: TrendState | null; onOpen: () => void }) {
  return (
    <CardButton onClick={onOpen} label={label} className="p-5">
      <h3 className="text-small font-medium text-[var(--text-primary)]">{label}</h3>
      {!state ? (
        <p className="text-caption text-[var(--text-muted)] mt-3">データが足りません</p>
      ) : (
        <>
          <div className="mt-3">
            <SignalPill signal={state.signal} label={state.label} />
          </div>
          <div className="mt-4 space-y-2 text-small">
            <Slopes state={state} />
            <EmaChain state={state} />
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-1 text-caption">
            <CloseVs state={state} label="週足EMA9" value={state.weeklyEma9} />
            <CloseVs state={state} label="EMA50" value={state.ema50} />
          </div>
        </>
      )}
    </CardButton>
  )
}

export default function IndexStateCards({ market }: { market: MarketConditions | null }) {
  const { selectedDate, isLatest } = useDate()
  const [result, setResult] = useState<IndexTrendResult | null>(null)
  const [breadth, setBreadth] = useState<{ state: BreadthState | null; error: string | null } | null>(null)
  const [leaders, setLeaders] = useState<LeaderStateResult | null>(null)
  const [openIndex, setOpenIndex] = useState<IndexKey | null>(null)

  // 過去スナップショット選択時はその日以前のデータで判定する
  const endDate = isLatest ? undefined : selectedDate || undefined

  useEffect(() => {
    let cancelled = false
    fetchIndexTrends(endDate).then((res) => {
      if (!cancelled) setResult(res)
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
          指数の EMA9 / EMA21・市場の参加度・主導株。カードをクリックで詳細
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
          market={market}
          endDate={endDate}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  )
}
