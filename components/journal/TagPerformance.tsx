'use client'

import { Fragment, useMemo } from 'react'
import type { Trade } from '@/types/trades'
import {
  CATEGORY_LABELS,
  REVIEW_TAGS,
  type ReviewTag,
  type ReviewTagCategory,
} from '@/lib/reviewTags'
import { isWin, isLoss, profitFactor, winRate } from '@/lib/tradeResult'
import { formatYen, formatPct, pnlColorClass } from '@/lib/format'

type Props = {
  trades: Trade[]
}

type TagRow = {
  tag: ReviewTag
  trades: Trade[]
  count: number
  wins: number
  losses: number
  wr: number | null
  avgPct: number | null
  pnl: number
  pf: number | null
}

const CATEGORY_ORDER: ReviewTagCategory[] = ['entry', 'exit', 'external']

// 勝率パレット: green at >=55, neutral 45–55, red below.
function wrStyleColor(wr: number | null): string {
  if (wr == null) return 'var(--text-muted)'
  if (wr >= 55) return 'var(--positive)'
  if (wr >= 45) return 'var(--text-secondary)'
  return 'var(--negative)'
}

function pfStyleColor(pf: number | null): string | undefined {
  if (pf == null) return 'var(--text-muted)'
  if (pf === Infinity || pf >= 1.5) return 'var(--positive)'
  if (pf >= 1) return undefined
  return 'var(--negative)'
}

export default function TagPerformance({ trades }: Props) {
  const closed = useMemo(
    () => trades.filter(t => t.status === 'closed'),
    [trades],
  )

  const reviewedCount = useMemo(
    () => closed.filter(t => t.reviewed_at != null).length,
    [closed],
  )

  const rowsByCategory = useMemo(() => {
    const result: Record<ReviewTagCategory, TagRow[]> = {
      entry: [],
      exit: [],
      external: [],
    }
    for (const tag of REVIEW_TAGS) {
      const tagged = closed.filter(t => (t.review_tags ?? []).includes(tag.id))
      if (tagged.length === 0) continue
      const wins = tagged.filter(isWin).length
      const losses = tagged.filter(isLoss).length
      const pnl = tagged.reduce((s, t) => s + (t.pnl ?? 0), 0)
      const avgPct = tagged.length > 0
        ? tagged.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / tagged.length
        : null
      result[tag.category].push({
        tag,
        trades: tagged,
        count: tagged.length,
        wins,
        losses,
        wr: winRate(tagged),
        avgPct,
        pnl,
        pf: profitFactor(tagged),
      })
    }
    return result
  }, [closed])

  const allRows = useMemo(
    () => CATEGORY_ORDER.flatMap(c => rowsByCategory[c]),
    [rowsByCategory],
  )

  const maxAbsPnl = useMemo(
    () => Math.max(1, ...allRows.map(r => Math.abs(r.pnl))),
    [allRows],
  )

  if (closed.length === 0 || allRows.length === 0) {
    return (
      <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Tag Performance
            <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
              振り返りタグ別成績
            </span>
          </h3>
          <span className="text-xs text-[var(--text-muted)]">reviewed: {reviewedCount}</span>
        </div>
        <div className="p-6 text-center text-sm text-[var(--text-muted)]">
          振り返りタグが付いた CLOSED トレードがまだありません。
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Tag Performance
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
            振り返りタグ別成績
          </span>
        </h3>
        <span className="text-xs text-[var(--text-muted)]">reviewed: {reviewedCount}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg-card-hover)] border-b border-[var(--border-subtle)]">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Tag</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Trades</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">W·L</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Win Rate</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Avg%</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">PnL</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">PF</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)] w-1/4">
                Distribution
              </th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map(cat => {
              const rows = rowsByCategory[cat]
              if (rows.length === 0) return null
              return (
                <Fragment key={cat}>
                  <tr className="bg-[var(--bg-card-hover)]/60">
                    <td
                      colSpan={8}
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                    >
                      {CATEGORY_LABELS[cat]}
                    </td>
                  </tr>
                  {rows.map(r => {
                    const pnlPositive = r.pnl >= 0
                    const barWidthPct = (Math.abs(r.pnl) / maxAbsPnl) * 100
                    return (
                      <tr
                        key={r.tag.id}
                        className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]"
                      >
                        <td
                          className="px-3 py-2 text-[var(--text-primary)]"
                          title={r.tag.description}
                        >
                          {r.tag.label}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          <span className="text-[var(--positive)]">{r.wins}</span>
                          <span className="text-[var(--text-muted)] mx-0.5">/</span>
                          <span className="text-[var(--negative)]">{r.losses}</span>
                        </td>
                        <td
                          className="px-3 py-2 text-right font-mono"
                          style={{ color: wrStyleColor(r.wr) }}
                        >
                          {r.wr != null ? formatPct(r.wr, { digits: 1 }) : '—'}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-mono"
                          style={{
                            color: r.avgPct == null
                              ? 'var(--text-muted)'
                              : r.avgPct >= 0 ? 'var(--positive)' : 'var(--negative)',
                          }}
                        >
                          {formatPct(r.avgPct, { digits: 1, sign: true })}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono font-semibold ${pnlColorClass(r.pnl)}`}
                        >
                          {formatYen(r.pnl, { sign: true })}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-mono"
                          style={{ color: pfStyleColor(r.pf) }}
                        >
                          {r.pf == null ? '—' : r.pf === Infinity ? '∞' : r.pf.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative h-3 w-full">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--sem-idle-bd)]" />
                            <div
                              className="absolute top-0.5 bottom-0.5 rounded"
                              style={{
                                backgroundColor: pnlPositive ? '#10b981' : '#ef4444',
                                width: `${barWidthPct / 2}%`,
                                left: pnlPositive ? '50%' : `${50 - barWidthPct / 2}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
        ※ 1 トレードに複数タグが付くため、各行の Trades 合計は CLOSED 総数と一致しません。
        勝率は breakeven を母数から除外。
      </p>
    </div>
  )
}
