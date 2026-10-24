'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/shared/Modal'
import TickerCell from '@/components/shared/TickerCell'
import LineHistoryChart from '@/components/chart/LineHistoryChart'
import { TIERS } from '@/types/liquidLeaders'
import { BREADTH_SERIES } from '@/lib/chartColors'
import {
  FADE_BAD,
  FADE_OK,
  LEADER_LOOKBACK,
  SHRINK_BAD,
  fetchLeaderCountHistory,
  type CountDelta,
  type LeaderCountPoint,
  type LeaderRow,
  type TierLeaderState,
} from '@/lib/leaderState'
import { HISTORY_RANGES, type HistoryRange } from './BreadthStateCard'
import { RangeBar } from './IndexDetailModal'
import { CardButton, SignalPill } from './trendAtoms'

// 主導株（Liquid Leaders）の判定カード。段（大型 / 中小）ごとに 1 枚。
// クリックで詳細（件数の推移 + 外れた・入った・失速した銘柄の一覧）を開く。

const DELTA_NOTE = `${LEADER_LOOKBACK} 営業日前との差`
const FADE_NOTE = 't63 の一覧にいる（3 か月強い）のに t21 の一覧にはいない（直近 1 か月が弱い）銘柄の割合'

function Diff({ d, invert = false, unit = '' }: { d: number | null; invert?: boolean; unit?: string }) {
  if (d == null) return <span className="text-[var(--text-muted)]">—</span>
  const good = invert ? d < 0 : d > 0
  const bad = invert ? d > 0 : d < 0
  return (
    <span style={{ color: good ? 'var(--positive)' : bad ? 'var(--negative)' : 'var(--text-muted)' }}>
      {d > 0 ? '↑' : d < 0 ? '↓' : '±'}
      {Math.abs(d).toFixed(unit ? 1 : 0)}
      {unit}
    </span>
  )
}

function Line({ label, title, value, diff }: { label: string; title?: string; value: string; diff: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2" title={title}>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono tabular-nums">
        <span className="text-[var(--text-primary)] font-medium">{value}</span>
        <span className="ml-2 text-caption">{diff}</span>
      </span>
    </div>
  )
}

const countDiff = (c: CountDelta) => (c.prev == null ? null : c.now - c.prev)

const COUNT_LINES = [
  { key: 't21', label: 't21 の一覧', color: BREADTH_SERIES.sma50, width: 2 },
  { key: 't63', label: 't63 の一覧', color: BREADTH_SERIES.sma150 },
] as const
const fmtCount = (v: number) => `${v.toFixed(0)} 件`

function LeaderList({ title, note, rows }: { title: string; note: string; rows: LeaderRow[] }) {
  const sorted = [...rows].sort((a, b) => (b.t63 ?? -Infinity) - (a.t63 ?? -Infinity))
  return (
    <div>
      <p className="text-small font-medium text-[var(--text-primary)]">
        {title} <span className="font-mono text-[var(--text-muted)]">{rows.length}</span>
      </p>
      <p className="text-caption text-[var(--text-muted)] mb-2">{note}</p>
      {sorted.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)]">なし</p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-small">
            <thead className="sticky top-0 bg-[var(--bg-card-hover)] text-caption text-[var(--text-muted)]">
              <tr>
                <th className="text-left font-medium px-2 py-1">Code / Name</th>
                <th className="text-left font-medium px-2 py-1">Sector</th>
                <th className="text-right font-medium px-2 py-1">t21</th>
                <th className="text-right font-medium px-2 py-1">t63</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.code} className="border-t border-[var(--border)]">
                  <td className="px-2 py-1 max-w-[180px]">
                    <TickerCell code={r.code} name={r.co_name} />
                  </td>
                  <td className="px-2 py-1 text-caption text-[var(--text-secondary)] truncate max-w-[110px]">{r.sector_s33 ?? '—'}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{r.t21?.toFixed(2) ?? '—'}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{r.t63?.toFixed(2) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LeaderDetailModal({
  state,
  label,
  date,
  prevDate,
  endDate,
  onClose,
}: {
  state: TierLeaderState
  label: string
  date: string | null
  prevDate: string | null
  endDate?: string
  onClose: () => void
}) {
  const [range, setRange] = useState<HistoryRange>('6m')
  const [points, setPoints] = useState<LeaderCountPoint[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const days = HISTORY_RANGES.find((r) => r.key === range)!.days
    fetchLeaderCountHistory(state.tier, days, endDate).then((res) => {
      if (!cancelled) setPoints(res.points)
    })
    return () => {
      cancelled = true
    }
  }, [state.tier, range, endDate])

  return (
    <Modal open onClose={onClose} title={label} size="xl">
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <SignalPill signal={state.signal} label={state.label} />
          <p className="text-caption text-[var(--text-muted)]">
            緑 = t21 の件数が {LEADER_LOOKBACK} 日前以上・入った ≥ 外れた・失速 &lt; {FADE_OK}% / 赤 = 失速 ≥ {FADE_BAD}%、または t21 の件数が {SHRINK_BAD}% 以上減り外れた &gt; 入った / 黄 = それ以外。
            比較は {prevDate ?? '—'} → {date ?? '—'}
          </p>
        </div>

        <div>
          <p className="text-small font-medium text-[var(--text-primary)] mb-2">一覧の件数</p>
          {points ? (
            <LineHistoryChart points={points} lines={COUNT_LINES} format={fmtCount} />
          ) : (
            <div className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)] h-[320px]">
              読み込み中…
            </div>
          )}
          <div className="mt-2">
            <RangeBar ranges={[...HISTORY_RANGES]} value={range} onChange={setRange} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <LeaderList title="外れた" note={`${LEADER_LOOKBACK} 日の間に t21 の一覧から外れた（t は ${LEADER_LOOKBACK} 日前の値）`} rows={state.exited} />
          <LeaderList title="入った" note={`${LEADER_LOOKBACK} 日の間に t21 の一覧に入った`} rows={state.entered} />
          <LeaderList title="失速" note={FADE_NOTE} rows={state.faded} />
        </div>

        <p className="text-caption">
          <Link href="/leaders" className="text-[var(--accent)] hover:underline">
            Liquid Leaders の画面を開く →
          </Link>
        </p>
      </div>
    </Modal>
  )
}

export default function LeaderStateCard({
  state,
  date,
  prevDate,
  error,
  endDate,
  tier,
}: {
  state: TierLeaderState | null
  date: string | null
  prevDate: string | null
  error: string | null
  endDate?: string
  tier: 'large' | 'mid'
}) {
  const [open, setOpen] = useState(false)
  const def = TIERS.find((t) => t.key === tier)!
  const label = `Leaders ${def.label}`

  return (
    <>
      <CardButton onClick={() => setOpen(true)} label={label} className="p-5">
        <h3 className="text-small font-medium text-[var(--text-primary)]" title={def.hint}>
          {label}
        </h3>
        {error ? (
          <p className="mt-3 text-small text-[var(--sem-weak-fg)]">取得エラー: {error}</p>
        ) : !state ? (
          <p className="mt-3 text-small text-[var(--text-muted)]">読み込み中…</p>
        ) : (
          <>
            <div className="mt-3">
              <SignalPill signal={state.signal} label={state.label} />
            </div>
            <p className="mt-3 text-caption text-[var(--text-muted)]">右は {LEADER_LOOKBACK} 日差</p>
            <div className="mt-1 space-y-1.5 text-small">
              <Line label="t21 の一覧" title={DELTA_NOTE} value={`${state.t21.now}`} diff={<Diff d={countDiff(state.t21)} />} />
              <Line label="t63 の一覧" title={DELTA_NOTE} value={`${state.t63.now}`} diff={<Diff d={countDiff(state.t63)} />} />
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[var(--text-muted)]">5日の出入り</span>
                <span className="font-mono tabular-nums">
                  <span className="text-[var(--positive)]">入 {state.entered.length}</span>
                  <span className="text-[var(--text-muted)]"> / </span>
                  <span className="text-[var(--negative)]">出 {state.exited.length}</span>
                </span>
              </div>
              <Line
                label="失速"
                title={FADE_NOTE}
                value={state.fadePct == null ? '—' : `${state.fadePct.toFixed(0)}%`}
                diff={
                  <Diff
                    d={state.fadePct != null && state.fadePctPrev != null ? state.fadePct - state.fadePctPrev : null}
                    invert
                    unit="pt"
                  />
                }
              />
            </div>
          </>
        )}
      </CardButton>
      {open && state && (
        <LeaderDetailModal
          state={state}
          label={label}
          date={date}
          prevDate={prevDate}
          endDate={endDate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
