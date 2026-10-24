'use client'

import { useEffect, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { MarketConditions } from '@/types/market'
import {
  BREADTH_HOT,
  BREADTH_LOOKBACK,
  BREADTH_MID,
  BREADTH_WEAK,
  fetchBreadthState,
  type BreadthMetric,
  type BreadthState,
} from '@/lib/breadthState'
import BreadthPanel from './BreadthPanel'
import { SIGNAL_STYLE } from './trendAtoms'

// Market Breadth の判定カード（横長 1 枚）。地合い（3 指数）の直下に置く。
// 従来の 4 枚（騰落・騰落レシオ・新高値安値・SMA 上割合）は「詳細」に畳む。

const DELTA_NOTE = `${BREADTH_LOOKBACK} 営業日前との差（ポイント）`

function Delta({ d }: { d: number | null }) {
  if (d == null) return <span className="text-[var(--text-muted)]">—</span>
  return (
    <span style={{ color: d > 0 ? 'var(--positive)' : d < 0 ? 'var(--negative)' : 'var(--text-muted)' }}>
      {d > 0 ? '+' : ''}
      {d.toFixed(1)}
    </span>
  )
}

/** 0〜100% のバー。30 / 50 / 70 に目盛りを打ち、どの区分にいるかを位置で読ませる */
function LevelBar({ value }: { value: number | null }) {
  const v = Math.min(Math.max(value ?? 0, 0), 100)
  return (
    <div className="relative h-2 w-full rounded-full bg-[var(--bg-primary)] overflow-hidden">
      {value != null && (
        <div className="h-2 rounded-full bg-[var(--text-secondary)]" style={{ width: `${v}%` }} />
      )}
      {[BREADTH_WEAK, BREADTH_MID, BREADTH_HOT].map((t) => (
        <div
          key={t}
          className="absolute top-0 h-2 w-px bg-[var(--border-strong)]"
          style={{ left: `${t}%` }}
        />
      ))}
    </div>
  )
}

function MetricBlock({
  label,
  sub,
  m,
  primary = false,
  note,
}: {
  label: string
  sub: string
  m: BreadthMetric
  primary?: boolean
  note?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-small ${primary ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {label}
          <span className="ml-1.5 text-caption text-[var(--text-muted)]">{sub}</span>
        </span>
        <span className="font-mono tabular-nums">
          <span className={primary ? 'text-title font-medium text-[var(--text-primary)]' : 'text-small font-medium text-[var(--text-primary)]'}>
            {m.value != null ? `${m.value.toFixed(1)}%` : '—'}
          </span>
          <span className="ml-2 text-caption" title={DELTA_NOTE}>
            <Delta d={m.delta} />
          </span>
        </span>
      </div>
      <div className="mt-1.5">
        <LevelBar value={m.value} />
      </div>
      {note && <p className="text-caption text-[var(--text-muted)] mt-1">{note}</p>}
    </div>
  )
}

export default function BreadthStateCard({ market }: { market: MarketConditions | null }) {
  const { selectedDate, isLatest } = useDate()
  const [state, setState] = useState<BreadthState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  const endDate = isLatest ? undefined : selectedDate || undefined

  useEffect(() => {
    let cancelled = false
    fetchBreadthState(endDate).then((res) => {
      if (cancelled) return
      setState(res.state)
      setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  const sig = state?.signal ? SIGNAL_STYLE[state.signal] : null

  return (
    <section>
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-small font-medium text-[var(--text-primary)]">Market Breadth</h2>
            {sig && state && (
              <span
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-small"
                style={{ backgroundColor: sig.bg, borderColor: sig.bd, color: sig.fg }}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sig.fg }} />
                <span className="font-medium">{sig.name}</span>
                {state.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-caption text-[var(--text-muted)]">
              移動平均より上にある銘柄の割合・右は {BREADTH_LOOKBACK} 日差
            </span>
            <button
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
              className="text-caption px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            >
              {showDetail ? '▾ 詳細を閉じる' : '▸ 詳細'}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-small text-[var(--sem-weak-fg)]">Breadth 取得エラー: {error}</p>
        ) : !state ? (
          <p className="mt-3 text-small text-[var(--text-muted)]">読み込み中…</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
              <MetricBlock
                label="20日線"
                sub="短期"
                m={state.sma20}
                note={state.sma20.value == null ? 'バッチ側で列を追加中（未供給）' : undefined}
              />
              <MetricBlock label="50日線" sub="中期・判定に使う" m={state.sma50} primary />
              <MetricBlock label="200日線" sub="長期" m={state.sma200} />
            </div>
            <p className="mt-3 text-caption text-[var(--text-muted)]">
              50日線の目安: {BREADTH_HOT}% 以上 = 広範な強さ（伸び切り注意）/ {BREADTH_MID}〜{BREADTH_HOT}% = 健全 /{' '}
              {BREADTH_WEAK}〜{BREADTH_MID}% = まちまち / {BREADTH_WEAK}% 未満 = 弱い・売られすぎ（底の保証ではない）
            </p>
          </>
        )}
      </div>

      {showDetail && market && (
        <div className="mt-4">
          <BreadthPanel market={market} />
        </div>
      )}
    </section>
  )
}
