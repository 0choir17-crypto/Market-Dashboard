'use client'

import { useEffect, useState } from 'react'
import { MarketConditions } from '@/types/market'
import {
  BREADTH_HOT,
  BREADTH_LOOKBACK,
  BREADTH_MID,
  BREADTH_WEAK,
  fetchBreadthHistory,
  type BreadthHistoryPoint,
  type BreadthMetric,
  type BreadthState,
} from '@/lib/breadthState'
import Modal from '@/components/shared/Modal'
import BreadthPanel from './BreadthPanel'
import BreadthHistoryChart from './BreadthHistoryChart'
import { RangeBar } from './IndexDetailModal'
import { CardButton, SignalPill } from './trendAtoms'

// Market Breadth の判定カード。指数カードの横（4 枚目）に置き、3 本の割合は縦に並べる。
// クリックで詳細（割合 3 本の推移 + 騰落・騰落レシオ・新高値安値）を開く。

const DELTA_NOTE = `${BREADTH_LOOKBACK} 営業日前との差（ポイント）`

function Delta({ d }: { d: number | null }) {
  if (d == null) return <span className="text-[var(--text-muted)]">—</span>
  return (
    <span style={{ color: d > 0 ? 'var(--positive)' : d < 0 ? 'var(--negative)' : 'var(--text-muted)' }}>
      {d > 0 ? '↑' : d < 0 ? '↓' : ''}
      {Math.abs(d).toFixed(1)}
    </span>
  )
}

/** 0〜100% のバー。30 / 50 / 70 に目盛りを打ち、どの区分にいるかを位置で読ませる */
function LevelBar({ value, primary }: { value: number | null; primary: boolean }) {
  const v = Math.min(Math.max(value ?? 0, 0), 100)
  return (
    <div className="relative h-1.5 w-full rounded-full bg-[var(--bg-primary)] overflow-hidden">
      {value != null && (
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${v}%`, backgroundColor: primary ? 'var(--text-secondary)' : 'var(--border-strong)' }}
        />
      )}
      {[BREADTH_WEAK, BREADTH_MID, BREADTH_HOT].map((t) => (
        <div key={t} className="absolute top-0 h-1.5 w-px bg-[var(--bg-card)]" style={{ left: `${t}%` }} />
      ))}
    </div>
  )
}

function MetricRow({ label, m, primary = false }: { label: string; m: BreadthMetric; primary?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
        <span className={`font-sans ${primary ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
          {label}
          {primary && <span className="ml-1 text-caption font-normal text-[var(--text-muted)]">判定</span>}
        </span>
        <span>
          <span className={primary ? 'text-title font-medium text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}>
            {m.value != null ? `${m.value.toFixed(1)}%` : '—'}
          </span>
          <span className="ml-2 text-caption" title={DELTA_NOTE}>
            <Delta d={m.delta} />
          </span>
        </span>
      </div>
      <div className="mt-1">
        <LevelBar value={m.value} primary={primary} />
      </div>
    </div>
  )
}

const HISTORY_RANGES = [
  { key: '6m', label: '6M', days: 183 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 1095 },
] as const
type HistoryRange = (typeof HISTORY_RANGES)[number]['key']

function BreadthDetailModal({
  state,
  market,
  endDate,
  onClose,
}: {
  state: BreadthState
  market: MarketConditions | null
  endDate?: string
  onClose: () => void
}) {
  const [range, setRange] = useState<HistoryRange>('1y')
  const [points, setPoints] = useState<BreadthHistoryPoint[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const days = HISTORY_RANGES.find((r) => r.key === range)!.days
    fetchBreadthHistory(days, endDate).then((res) => {
      if (!cancelled) setPoints(res.points)
    })
    return () => {
      cancelled = true
    }
  }, [range, endDate])

  return (
    <Modal open onClose={onClose} title="Market Breadth" size="xl">
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          {state.signal && <SignalPill signal={state.signal} label={state.label} />}
          <p className="text-caption text-[var(--text-muted)]">
            50日線の目安: {BREADTH_HOT}% 以上 = 広範な強さ（伸び切り注意）/ {BREADTH_MID}〜{BREADTH_HOT}% = 健全 /{' '}
            {BREADTH_WEAK}〜{BREADTH_MID}% = まちまち / {BREADTH_WEAK}% 未満 = 弱い・売られすぎ（底の保証ではない）
          </p>
        </div>

        <div>
          <p className="text-small font-medium text-[var(--text-primary)] mb-2">移動平均より上にある銘柄の割合</p>
          {points ? (
            <BreadthHistoryChart points={points} />
          ) : (
            <div className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)] h-[320px]">
              読み込み中…
            </div>
          )}
          <div className="mt-2">
            <RangeBar ranges={[...HISTORY_RANGES]} value={range} onChange={setRange} />
          </div>
        </div>

        {market && <BreadthPanel market={market} />}
      </div>
    </Modal>
  )
}

export default function BreadthStateCard({
  state,
  error,
  market,
  endDate,
}: {
  state: BreadthState | null
  error: string | null
  market: MarketConditions | null
  endDate?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <CardButton onClick={() => setOpen(true)} label="Market Breadth" className="p-5">
        <h3 className="text-small font-medium text-[var(--text-primary)]">Market Breadth</h3>
        {error ? (
          <p className="mt-3 text-small text-[var(--sem-weak-fg)]">取得エラー: {error}</p>
        ) : !state ? (
          <p className="mt-3 text-small text-[var(--text-muted)]">読み込み中…</p>
        ) : (
          <>
            <div className="mt-3">
              {state.signal ? (
                <SignalPill signal={state.signal} label={state.label} />
              ) : (
                <p className="text-small text-[var(--text-muted)]">{state.label}</p>
              )}
            </div>
            <p className="mt-3 text-caption text-[var(--text-muted)]">
              移動平均より上にある銘柄の割合（右は {BREADTH_LOOKBACK} 日差）
            </p>
            <div className="mt-2 space-y-3 text-small">
              <MetricRow label="20日線" m={state.sma20} />
              <MetricRow label="50日線" m={state.sma50} primary />
              <MetricRow label="150日線" m={state.sma150} />
            </div>
          </>
        )}
      </CardButton>
      {open && state && (
        <BreadthDetailModal state={state} market={market} endDate={endDate} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
