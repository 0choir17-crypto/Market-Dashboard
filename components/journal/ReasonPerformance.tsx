'use client'

import { useMemo } from 'react'
import type { Trade } from '@/types/trades'
import { EXIT_REASONS } from '@/components/journal/CloseTradeModal'
import { isWin, isLoss, profitFactor, winRate } from '@/lib/tradeResult'
import { formatYen, formatPct, pnlColorClass } from '@/lib/format'

type Props = {
  trades: Trade[]
}

type ReasonRow = {
  reason: string
  trades: Trade[]
  count: number
  wins: number
  losses: number
  wr: number | null
  avgPct: number | null
  pnl: number
  pf: number | null
}

const UNSET_LABEL = '未設定'

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

function normalize(reason: string | null | undefined): string {
  if (reason == null) return UNSET_LABEL
  const trimmed = reason.trim()
  return trimmed === '' ? UNSET_LABEL : trimmed
}

export default function ReasonPerformance({ trades }: Props) {
  const closed = useMemo(
    () => trades.filter(t => t.status === 'closed'),
    [trades],
  )

  // Map reason → trades, in input order. Display order is defined below.
  const rows = useMemo<ReasonRow[]>(() => {
    if (closed.length === 0) return []
    const groups = new Map<string, Trade[]>()
    for (const t of closed) {
      const key = normalize(t.exit_reason)
      const arr = groups.get(key) ?? []
      arr.push(t)
      groups.set(key, arr)
    }

    // Display order: EXIT_REASONS first, then UNSET, then any unknown values.
    const known = new Set<string>([...EXIT_REASONS, UNSET_LABEL])
    const ordered: string[] = [
      ...EXIT_REASONS.filter(r => groups.has(r)),
      ...(groups.has(UNSET_LABEL) ? [UNSET_LABEL] : []),
      ...[...groups.keys()].filter(k => !known.has(k)).sort(),
    ]

    return ordered.map(key => {
      const ts = groups.get(key) ?? []
      const wins = ts.filter(isWin).length
      const losses = ts.filter(isLoss).length
      const pnl = ts.reduce((s, t) => s + (t.pnl ?? 0), 0)
      const avgPct = ts.length > 0
        ? ts.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / ts.length
        : null
      return {
        reason: key,
        trades: ts,
        count: ts.length,
        wins,
        losses,
        wr: winRate(ts),
        avgPct,
        pnl,
        pf: profitFactor(ts),
      }
    })
  }, [closed])

  const maxAbsPnl = useMemo(
    () => Math.max(1, ...rows.map(r => Math.abs(r.pnl))),
    [rows],
  )

  if (rows.length === 0) return null

  return (
    <div className="mb-6 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Exit Reason Performance
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
            手仕舞い理由別成績
          </span>
        </h3>
        <span className="text-xs text-[var(--text-muted)] font-mono">n={closed.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg-card-hover)] border-b border-[var(--border-subtle)]">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Reason</th>
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
            {rows.map(r => {
              const pnlPositive = r.pnl >= 0
              const barWidthPct = (Math.abs(r.pnl) / maxAbsPnl) * 100
              const muted = r.reason === UNSET_LABEL
              return (
                <tr
                  key={r.reason}
                  className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]"
                >
                  <td
                    className={`px-3 py-2 ${muted ? 'text-[var(--text-muted)] italic' : 'text-[var(--text-primary)] font-medium'}`}
                  >
                    {r.reason}
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
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
        ※ 各トレードは 1 理由のみで集計されるため Trades 合計 = CLOSED 総数。
        CSV import 分は exit_reason が無いため「未設定」に入る。
      </p>
    </div>
  )
}
