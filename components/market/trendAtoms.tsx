'use client'

// 地合い判定カード（指数 / 業種）で共通に使う表示部品。
// 色だけでは理由が読めないので、信号には必ず判定の言葉を添える。
// 上下は文字ではなく ↑ / ↓ で、位置関係は「値の大きい順に > でつないだ並び」で一発で読ませる。

import { SLOPE_LOOKBACK, type TrendSignal, type TrendState } from '@/lib/trendState'
import type { SectorTrend } from '@/lib/sectorTrendFetch'
import { TValue } from '@/components/sectors33/SelfStrength'

export const SIGNAL_STYLE: Record<TrendSignal, { bg: string; fg: string; bd: string; name: string }> = {
  green: { bg: 'var(--sem-strong-bg)', fg: 'var(--sem-strong-fg)', bd: 'var(--sem-strong-bd)', name: '緑' },
  yellow: { bg: 'var(--sem-watch-bg)', fg: 'var(--sem-watch-fg)', bd: 'var(--sem-watch-bd)', name: '黄' },
  red: { bg: 'var(--sem-weak-bg)', fg: 'var(--sem-weak-fg)', bd: 'var(--sem-weak-bd)', name: '赤' },
}

/** 並べ替え用。緑 → 黄 → 赤 */
export const SIGNAL_ORDER: Record<TrendSignal, number> = { green: 0, yellow: 1, red: 2 }

export const SLOPE_NOTE = `EMA の向き = 今日の EMA と ${SLOPE_LOOKBACK} 営業日前の EMA の比較`

export function fmtLevel(v: number): string {
  return v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 信号（色 + 言葉） */
export function SignalPill({ signal, label, compact = false }: { signal: TrendSignal; label: string; compact?: boolean }) {
  const sig = SIGNAL_STYLE[signal]
  return (
    <div
      className={`flex items-center gap-2 rounded-md border ${compact ? 'px-2 py-1 text-caption' : 'px-3 py-1.5 text-small'}`}
      style={{ backgroundColor: sig.bg, borderColor: sig.bd, color: sig.fg }}
    >
      <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sig.fg }} />
      <span className="font-medium">{sig.name}</span>
      <span className="truncate">{label}</span>
    </div>
  )
}

/** ↑ / ↓（上 = 緑、下 = 赤） */
export function Arrow({ up }: { up: boolean }) {
  return (
    <span className="font-medium" style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}>
      {up ? '↑' : '↓'}
    </span>
  )
}

/** 「EMA9 ↑　EMA21 ↓」— EMA の向き */
export function Slopes({ state }: { state: TrendState }) {
  return (
    <div className="flex items-baseline gap-4 font-mono tabular-nums" title={SLOPE_NOTE}>
      <span>
        <span className="text-[var(--text-muted)]">EMA9</span> <Arrow up={state.ema9Up} />
      </span>
      <span>
        <span className="text-[var(--text-muted)]">EMA21</span> <Arrow up={state.ema21Up} />
      </span>
    </div>
  )
}

/**
 * 「終値 3,012.34 > EMA9 2,990.12 > EMA21 2,950.55」— 値の大きい順に > でつなぐ。
 * 並びそのものが状態（緑 = 終値 > EMA9 > EMA21）なので、数値を比べなくても読める。
 */
export function Chain({ items }: { items: { label: string; value: number; main?: boolean }[] }) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-mono tabular-nums">
      {sorted.map((it, i) => (
        <span key={it.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
          {i > 0 && <span className="text-[var(--text-muted)]">&gt;</span>}
          <span className={it.main ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}>
            {it.label} {fmtLevel(it.value)}
          </span>
        </span>
      ))}
    </div>
  )
}

/** 終値・EMA9・EMA21 の並び */
export function EmaChain({ state }: { state: TrendState }) {
  return (
    <Chain
      items={[
        { label: '終値', value: state.close, main: true },
        { label: 'EMA9', value: state.ema9 },
        { label: 'EMA21', value: state.ema21 },
      ]}
    />
  )
}

/** 「終値 > 週足EMA9」のような 2 項の比較。値が無ければ null を返す */
export function CloseVs({ state, label, value }: { state: TrendState; label: string; value: number | null }) {
  if (value == null) return null
  const above = state.close > value
  return (
    <span className="font-mono whitespace-nowrap">
      <span className="text-[var(--text-secondary)]">終値</span>{' '}
      <span className="font-medium" style={{ color: above ? 'var(--positive)' : 'var(--negative)' }}>
        {above ? '>' : '<'}
      </span>{' '}
      <span className="text-[var(--text-secondary)]">{label}</span>
    </span>
  )
}

/** クリックで詳細を開くカードの外枠 */
export function CardButton({
  onClick,
  label,
  className = '',
  style,
  children,
}: {
  onClick: () => void
  label: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} の詳細を開く`}
      className={`card flex flex-col justify-start items-stretch text-left w-full transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] cursor-pointer ${className}`}
      style={style}
    >
      {children}
    </button>
  )
}

/** 業種の自力 t21 / t63 */
export function SelfRow({ s }: { s: SectorTrend }) {
  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-2 text-caption">
      <div className="flex justify-between gap-1">
        <span className="text-[var(--text-muted)]">自力 t21</span>
        <TValue v={s.selfT21} strong />
      </div>
      <div className="flex justify-between gap-1">
        <span className="text-[var(--text-muted)]">t63</span>
        <TValue v={s.selfT63} />
      </div>
    </div>
  )
}
