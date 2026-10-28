'use client'

// RS Leaders の札とツールチップ (Sector Board / Pullback Board 共通)。
// 札はクリックで TradingView のチャートを新しいタブで開く。
// 札の濃さ = 全体RS (95〜99 濃 / 90〜94 中 / 80〜89 薄)。

import { useCallback, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { tradingViewUrl } from '@/lib/tickerLinks'
import { rsTier, spreadLabel, type RsLeader } from '@/types/rsLeaders'

export const TIER_STYLE: Record<1 | 2 | 3, CSSProperties> = {
  1: { backgroundColor: 'var(--rs-t1-bg)', color: 'var(--rs-t1-fg)' },
  2: { backgroundColor: 'var(--rs-t2-bg)', color: 'var(--rs-t2-fg)' },
  3: { backgroundColor: 'var(--rs-t3-bg)', color: 'var(--rs-t3-fg)' },
}

export type ChipTipState = { row: RsLeader; x: number; y: number } | null

/** 1 画面に 1 つの浮くツールチップ。札の onMove / onLeave に渡す。 */
export function useChipTip() {
  const [tip, setTip] = useState<ChipTipState>(null)
  const onMove = useCallback((row: RsLeader, e: MouseEvent) => setTip({ row, x: e.clientX, y: e.clientY }), [])
  const onLeave = useCallback(() => setTip(null), [])
  return { tip, onMove, onLeave }
}

export function RsChip({
  row,
  className = '',
  style,
  onMove,
  onLeave,
  children,
}: {
  row: RsLeader
  className?: string
  style?: CSSProperties
  onMove: (row: RsLeader, e: MouseEvent) => void
  onLeave: () => void
  children: ReactNode
}) {
  return (
    <a
      href={tradingViewUrl(row.code)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${row.code} ${row.co_name ?? ''} を TradingView で開く`}
      onMouseMove={e => onMove(row, e)}
      onMouseLeave={onLeave}
      className={`rounded px-1.5 py-0.5 text-small whitespace-nowrap hover:brightness-110 transition-[filter,opacity] ${className}`}
      style={{ ...TIER_STYLE[rsTier(row.rs_rating)], ...style }}
    >
      {children}
    </a>
  )
}

/** 3 行だけ: コードと銘柄名 / 業種 (順位) · 線の開き / RS · 業種RS · ADR */
export function ChipTooltip({ tip, sectorRank }: { tip: ChipTipState; sectorRank: Map<string, number> }) {
  if (!tip) return null
  const r = tip.row
  const rank = r.sector_code ? sectorRank.get(r.sector_code) : undefined
  const W = 300
  const left = typeof window !== 'undefined' ? Math.min(tip.x + 14, window.innerWidth - W - 8) : tip.x + 14
  const top = typeof window !== 'undefined' ? Math.min(tip.y + 14, window.innerHeight - 80) : tip.y + 14
  return (
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none rounded-md border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-card)] shadow-md px-2.5 py-2 text-caption leading-relaxed num"
      style={{ left, top, maxWidth: W }}
    >
      <div className="text-small font-medium text-[var(--text-primary)]">
        <span className="font-mono">{r.code}</span> {r.co_name ?? ''}
      </div>
      <div className="text-[var(--text-secondary)]">
        {r.sector_s33 ?? '—'} (Sector #{rank ?? '—'}/33) · MA spread{' '}
        {r.spread_21_50 !== null ? r.spread_21_50.toFixed(2) : '—'} ({spreadLabel(r.spread_21_50)})
      </div>
      <div className="text-[var(--text-secondary)]">
        RS <b className="text-[var(--text-primary)]">{r.rs_rating ?? '—'}</b> / Sector RS{' '}
        <b className="text-[var(--text-primary)]">{r.sector_rs ?? '—'}</b>
        {r.sector_ref_only ? ' (ref)' : ''} / ADR {r.adr_pct !== null ? r.adr_pct.toFixed(1) : '—'}%
      </div>
    </div>
  )
}

/** 凡例の色見本 (札の 3 段) */
export function TierLegend() {
  return (
    <>
      {([
        [1, 'RS 95–99'],
        [2, 'RS 90–94'],
        [3, 'RS 80–89'],
      ] as const).map(([t, label]) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={TIER_STYLE[t]} />
          <span className="num">{label}</span>
        </span>
      ))}
    </>
  )
}
