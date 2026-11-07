'use client'

// Liquid Leaders の札とツールチップ (Sector Board / Pullback Board 共通)。
//   塗り   = t63 の一覧にいる。数字 = t63。濃さ = 入る線 +1 以上 / 入る線以上 / 入る線未満 (出る線までの猶予で残っている)
//   枠だけ = t21 の一覧だけ。数字 = t21
//   ↑↓ = 5 営業日前からの t の増減 (±0.1 以上)。「新」= 5 営業日前は一覧にいなかった
//   T2.3× = Turnover 2.0× 以上 (商いが膨らんで入った銘柄。その後 3 か月の伸びは小さい傾向)
// 札はクリックで TradingView のチャートを新しいタブで開く。

import { useCallback, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { tradingViewUrl } from '@/lib/tickerLinks'
import { TIER_STYLE } from '@/components/rsLeaders/chipUi'
import { spreadLabel } from '@/types/rsLeaders'
import { TIERS, diffColor, fmtDiff, tDiff, type LiquidLeader, type LiquidPeriod, type TDiff } from '@/types/liquidLeaders'

/** 札に Turnover を出す下限 */
export const TURNOVER_MARK = 2.0

export type Prev = Map<string, LiquidLeader> | null | undefined

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null
}

export const OUTLINE: CSSProperties = {
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  boxShadow: 'inset 0 0 0 1px var(--rs-t2-bg)',
}

function chipStyle(r: LiquidLeader, enter: number): CSSProperties {
  if (r.in_t63 !== true) return OUTLINE
  const v = num(r.t63) ?? -Infinity
  return TIER_STYLE[v >= enter + 1 ? 1 : v >= enter ? 2 : 3]
}

// ↑0.3 / ↓0.2 / 新 (±0.1 未満は出さない)
function shortDiff(d: TDiff): string {
  if (d === 'new') return '新'
  if (typeof d !== 'number') return ''
  if (d >= 0.1) return `↑${d.toFixed(1)}`
  if (d <= -0.1) return `↓${Math.abs(d).toFixed(1)}`
  return ''
}

export type LiquidTipState = { row: LiquidLeader; x: number; y: number } | null

/** 1 画面に 1 つの浮くツールチップ。札の onMove / onLeave に渡す。 */
export function useLiquidTip() {
  const [tip, setTip] = useState<LiquidTipState>(null)
  const onMove = useCallback((row: LiquidLeader, e: MouseEvent) => setTip({ row, x: e.clientX, y: e.clientY }), [])
  const onLeave = useCallback(() => setTip(null), [])
  return { tip, onMove, onLeave }
}

/** 札の 1 行目: 銘柄名 · t · 5 日の増減 · Turnover の印 */
export function ChipHead({ row, prev }: { row: LiquidLeader; prev: Prev }) {
  const period: LiquidPeriod = row.in_t63 === true ? 't63' : 't21'
  const v = num(period === 't63' ? row.t63 : row.t21)
  const d = prev ? shortDiff(tDiff(v, prev.get(row.code), period)) : ''
  const turnover = num(row.va_trend)
  return (
    <>
      <span className="truncate min-w-0">{row.co_name ?? row.code}</span>
      <span className="flex-none">
        <b className="ml-1 font-medium num opacity-85">{v !== null ? v.toFixed(1) : '—'}</b>
        {d && <span className="ml-0.5 text-caption num opacity-85">{d}</span>}
        {turnover !== null && turnover >= TURNOVER_MARK && (
          <span className="ml-1 text-caption num opacity-75">T{turnover.toFixed(1)}×</span>
        )}
      </span>
    </>
  )
}

export function LiquidChip({
  row,
  enter,
  dim = false,
  className = '',
  onMove,
  onLeave,
  children,
}: {
  row: LiquidLeader
  /** その段の入る線 */
  enter: number
  dim?: boolean
  className?: string
  onMove: (row: LiquidLeader, e: MouseEvent) => void
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
      style={{ ...chipStyle(row, enter), opacity: dim ? 0.18 : undefined }}
    >
      {children}
    </a>
  )
}

/** 凡例の色見本 (塗り 3 段 + 枠だけ)。入る線は段ごと (大型 2.0 / 中小 1.5) */
export function LiquidLegend() {
  const lines = TIERS.map(t => `${t.label} ${t.enter.toFixed(1)}`).join(' / ')
  return (
    <>
      <span className="text-[var(--text-muted)]">入る線 = {lines}</span>
      {([
        [1, 't63 入る線 +1 以上'],
        [2, 't63 入る線〜+1'],
        [3, 't63 入る線未満（出る線までの猶予）'],
      ] as const).map(([t, label]) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={TIER_STYLE[t]} />
          <span className="num">{label}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm" style={OUTLINE} />
        <span>t21 の一覧だけ（数字 = t21）</span>
      </span>
      <span>↑↓ = 5 営業日前からの t の増減（±0.1 以上）· 新 = 5 営業日前は一覧にいない</span>
      <span>T2.3× = Turnover {TURNOVER_MARK.toFixed(1)}× 以上（商いが膨らんで入った銘柄）</span>
    </>
  )
}

function md(iso: string | null): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

export function LiquidTooltip({ tip, prev }: { tip: LiquidTipState; prev: Prev }) {
  if (!tip) return null
  const r = tip.row
  const W = 320
  const left = typeof window !== 'undefined' ? Math.min(tip.x + 14, window.innerWidth - W - 8) : tip.x + 14
  const top = typeof window !== 'undefined' ? Math.min(tip.y + 14, window.innerHeight - 110) : tip.y + 14
  const tv = (p: LiquidPeriod) => {
    const v = num(p === 't21' ? r.t21 : r.t63)
    const d = prev ? tDiff(v, prev.get(r.code), p) : null
    const inList = (p === 't21' ? r.in_t21 : r.in_t63) === true
    return (
      <>
        {p}{' '}
        <b className={inList ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] font-normal'}>
          {v !== null ? v.toFixed(2) : '—'}
        </b>{' '}
        <span style={{ color: diffColor(d) }}>({prev === undefined ? '…' : fmtDiff(d)})</span>
      </>
    )
  }
  const turnover = num(r.va_trend)
  const spread = num(r.spread_21_50)
  const adr = num(r.adr_pct)
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
        {r.sector_s33 ?? '—'} · MA spread {spread !== null ? spread.toFixed(2) : '—'} ({spreadLabel(spread)}) · ADR{' '}
        {adr !== null ? `${adr.toFixed(1)}%` : '—'}
      </div>
      <div className="text-[var(--text-secondary)]">
        {tv('t21')} / {tv('t63')}
      </div>
      <div className="text-[var(--text-secondary)]">
        Turnover {turnover !== null ? `${turnover.toFixed(2)}×` : '—'} · Since t21 {md(r.in_t21 ? r.t21_since : null)} · t63{' '}
        {md(r.in_t63 ? r.t63_since : null)}
      </div>
    </div>
  )
}
