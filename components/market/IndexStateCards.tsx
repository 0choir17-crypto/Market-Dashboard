'use client'

import { useEffect, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchIndexTrends, INDEXES, type IndexTrendResult } from '@/lib/indexTrendFetch'
import type { TrendState } from '@/lib/trendState'
import { Position, Row, SIGNAL_STYLE, SLOPE_NOTE, Slope } from './trendAtoms'

// 地合いの判定カード（3 指数を横 1 列）。色だけでは理由が読めないので、
// 判定の材料（終値と EMA9 / EMA21 の位置、EMA の向き）を必ず並べて出す。

function OptionalPosition({ above }: { above: boolean | null }) {
  if (above === null) return <span className="text-[var(--text-muted)]">—</span>
  return <Position above={above} />
}

function IndexCard({ label, state }: { label: string; state: TrendState | null }) {
  if (!state) {
    return (
      <div className="card p-5">
        <h3 className="text-small font-medium text-[var(--text-primary)]">{label}</h3>
        <p className="text-caption text-[var(--text-muted)] mt-3">データが足りません</p>
      </div>
    )
  }
  const sig = SIGNAL_STYLE[state.signal]
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-small font-medium text-[var(--text-primary)]">{label}</h3>
        <span className="font-mono tabular-nums text-small text-[var(--text-secondary)]">
          {state.close.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
        </span>
      </div>

      <div
        className="mt-3 flex items-center gap-2 rounded-md border px-3 py-2"
        style={{ backgroundColor: sig.bg, borderColor: sig.bd, color: sig.fg }}
      >
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sig.fg }} />
        <span className="text-small font-medium">{sig.name}</span>
        <span className="text-small">{state.label}</span>
      </div>

      <div className="mt-4 space-y-1.5 text-small">
        <Row label="終値 vs EMA9">
          <Position above={state.close > state.ema9} dist={state.distEma9Pct} />
        </Row>
        <Row label="EMA9 の向き" title={SLOPE_NOTE}>
          <Slope up={state.ema9Up} />
        </Row>
        <Row label="終値 vs EMA21">
          <Position above={state.close > state.ema21} dist={state.distEma21Pct} />
        </Row>
        <Row label="EMA21 の向き" title={SLOPE_NOTE}>
          <Slope up={state.ema21Up} />
        </Row>
        <Row label="EMA9 vs EMA21">
          <span style={{ color: state.ema9 > state.ema21 ? 'var(--positive)' : 'var(--negative)' }}>
            {state.ema9 > state.ema21 ? '9 > 21' : '9 < 21'}
          </span>
        </Row>
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5 text-caption">
        <Row label="終値 vs 週足 EMA9">
          <OptionalPosition above={state.aboveWeeklyEma9} />
        </Row>
        <Row label="終値 vs EMA50">
          <OptionalPosition above={state.aboveEma50} />
        </Row>
      </div>
    </div>
  )
}

export default function IndexStateCards() {
  const { selectedDate, isLatest } = useDate()
  const [result, setResult] = useState<IndexTrendResult | null>(null)

  // 過去スナップショット選択時はその日以前のデータで判定する
  const endDate = isLatest ? undefined : selectedDate || undefined

  useEffect(() => {
    let cancelled = false
    fetchIndexTrends(endDate).then((res) => {
      if (!cancelled) setResult(res)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-title font-medium text-[var(--text-primary)]">地合い</h2>
        <span className="text-caption text-[var(--text-muted)]">日足 EMA9 / EMA21 の位置と向き</span>
      </div>
      {result?.error ? (
        <div className="card p-5 text-small text-[var(--sem-weak-fg)]">
          指数データ取得エラー: {result.error}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {INDEXES.map((idx) =>
            result ? (
              <IndexCard key={idx.key} label={idx.label} state={result.states[idx.key]} />
            ) : (
              <div key={idx.key} className="card p-5 text-small text-[var(--text-muted)]">
                {idx.label} 読み込み中…
              </div>
            ),
          )}
        </div>
      )}
    </section>
  )
}
