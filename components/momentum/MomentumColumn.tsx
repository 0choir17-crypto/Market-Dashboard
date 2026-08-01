'use client'

import { useMemo } from 'react'
import type { MomentumLeader, Horizon } from '@/types/momentumLeaders'
import { HORIZON_LABEL, momColor } from '@/types/momentumLeaders'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import RankMoveBadge from './RankMoveBadge'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

// dist_from_high_pct: 0 に近いほど高値圏（強）。−が大きいほど高値から離れている。
function distColor(v: number | null | undefined): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= -5) return 'var(--positive)'   // 高値圏
  if (v >= -15) return 'var(--text-primary)'
  return 'var(--text-secondary)'
}

// 短期/中期/長期の重複数で名前の背景色を変える: 2窓=黄 / 3窓=オレンジ。
function dupBg(count: number | undefined): string | undefined {
  if (count === undefined) return undefined
  if (count >= 3) return '#fdba74' // 3窓重複 = オレンジ (orange-300)
  if (count === 2) return '#fef08a' // 2窓重複 = 黄色 (yellow-200)
  return undefined
}

type Props = {
  horizon: Horizon
  rows: MomentumLeader[]
  query: string
  newOnly: boolean
  // code → 出現窓数（21/63/126 のうちいくつに登場したか）。重複強調に使う。
  dupCount: Map<string, number>
}

// 1 窓（21/63/126）の ranking 列。rank 昇順（=渡された順）でそのまま縦に並べる。
// 3 窓を横並びにして「同じ銘柄が別窓でどこにいるか」を縦に見比べる。
export default function MomentumColumn({ horizon, rows, query, newOnly, dupCount }: Props) {
  const label = HORIZON_LABEL[horizon]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (newOnly && r.rank_change !== null) return false
      if (!q) return true
      return (
        r.code.toLowerCase().includes(q) ||
        (r.co_name ?? '').toLowerCase().includes(q) ||
        (r.sector_s33 ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, query, newOnly])

  return (
    <section className="flex-1 min-w-[300px] bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm flex flex-col">
      {/* 列ヘッダー */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold text-[var(--text-primary)]">{label.title}</h2>
          <span className="text-[11px] text-[var(--text-muted)]">{label.note}</span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">
            <span className="font-mono">{filtered.length}</span>
            {filtered.length !== rows.length && <span className="font-mono">/{rows.length}</span>} 銘柄
          </span>
        </div>
      </div>

      {/* ランキング一覧（列内で独立スクロール） */}
      {filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0 ? 'データがありません' : '該当銘柄なし'}
        </div>
      ) : (
        <ol className="divide-y divide-[var(--border-subtle)] overflow-y-auto max-h-[72vh]">
          {filtered.map(r => (
            <li
              key={r.code}
              className={`px-3 py-2 flex items-center gap-2 hover:bg-[var(--bg-card-hover)] transition-colors ${
                r.rank_change === null ? 'bg-rose-50/40' : ''
              }`}
            >
              {/* rank + 変動 */}
              <div className="flex flex-col items-center w-9 flex-shrink-0">
                <span className="font-mono text-sm font-bold text-gray-800 tabular-nums leading-none">
                  {r.rank ?? '—'}
                </span>
                <span className="mt-0.5 leading-none">
                  <RankMoveBadge row={r} />
                </span>
              </div>

              {/* 銘柄 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <a
                    href={tradingViewUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs font-bold text-[var(--accent)] hover:underline flex-shrink-0"
                    title={`${r.code}（TradingView を開く）`}
                  >
                    {r.code}
                  </a>
                  {(() => {
                    const dup = dupCount.get(r.code)
                    const bg = dupBg(dup)
                    return (
                      <a
                        href={shikihoUrl(r.code)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs font-medium text-[var(--text-primary)] hover:underline truncate ${bg ? 'rounded px-1' : ''}`}
                        style={bg ? { backgroundColor: bg } : undefined}
                        title={
                          dup && dup >= 2
                            ? `${r.co_name ?? '—'}（四季報）｜${dup}窓で重複`
                            : `${r.co_name ?? '—'}（四季報を開く）`
                        }
                      >
                        {r.co_name ?? '—'}
                      </a>
                    )
                  })()}
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--text-secondary)] truncate" title={r.sector_s33 ?? ''}>
                  {r.sector_s33 ?? '—'}
                </div>
              </div>

              {/* 指標 */}
              <div className="flex-shrink-0 text-right w-24">
                <div
                  className="font-mono text-sm font-bold tabular-nums leading-tight"
                  style={{ color: momColor(r.mom_pct, horizon) }}
                  title="その窓の上昇率(%)"
                >
                  {fmtSignedPct(r.mom_pct, 0)}
                </div>
                <div className="flex items-center justify-end gap-1.5 text-[10px] leading-tight tabular-nums">
                  <span style={{ color: distColor(r.dist_from_high_pct) }} title="52週高値からの距離(%)。0に近いほど高値圏">
                    高値{fmt(r.dist_from_high_pct, 0)}
                  </span>
                  <span className="text-[var(--text-muted)]" title="平均日中変動率(%) = ボラの目安">
                    ADR{fmt(r.adr_pct, 1)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
