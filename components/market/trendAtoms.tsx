'use client'

// 地合い判定カード（指数 / 業種）で共通に使う表示部品。
// 色だけでは理由が読めないので、信号には必ず判定の言葉を添える。
// 上下は文字ではなく ↑ / ↓ で、位置関係は「値の大きい順に > でつないだ並び」で一発で読ませる。

import { Fragment, useState } from 'react'
import { SLOPE_LOOKBACK, type EmaChartPoint, type TrendSignal, type TrendState } from '@/lib/trendState'
import type { SectorTrend } from '@/lib/sectorTrendFetch'
import { RDiff, RValue, TValue } from '@/components/sectors33/SelfStrength'
import { EXT_DIFF_DAYS, EXT_R_NOTE, isNum } from '@/types/sectorSelection'
import { CHART, EMA_COLORS } from '@/lib/chartColors'

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
 * 「終値 3,012.34 > EMA9 > EMA21」— 値の大きい順に > でつなぐ。
 * 並びそのものが状態（緑 = 終値 > EMA9 > EMA21）なので、EMA の値は出さない（main の値だけ出す）。
 */
export function Chain({ items }: { items: { label: string; value: number; main?: boolean }[] }) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-mono tabular-nums">
      {sorted.map((it, i) => (
        <span key={it.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
          {i > 0 && <span className="text-[var(--text-muted)]">&gt;</span>}
          <span className={it.main ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}>
            {it.label}
            {it.main && ` ${fmtLevel(it.value)}`}
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

/**
 * 業種の自力 t21 / t63 と、業種指数の終値と EMA9 / 21 / 50 の距離（R）。
 * 2 行を 1 つの表にして列をそろえ、左に詰める（カードが広くても間延びしないように）。
 *   自力   t21 +1.55   t63 +0.78
 *   距離   9   +0.3R (+0.1)   21  +0.7R (−0.2)   50 +1.0R (+0.0)  ← 括弧 = 5 営業日前からの変化
 */
export function SectorStats({ s }: { s: SectorTrend }) {
  const cell = (key: string, label: string, value: React.ReactNode, title?: string) => (
    <span key={key} className="flex items-baseline justify-between gap-1.5 whitespace-nowrap" title={title}>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="min-w-[3.25rem] text-right">{value}</span>
    </span>
  )
  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-[repeat(4,max-content)] gap-x-4 gap-y-1 items-baseline text-caption">
      <span className="text-[var(--text-muted)]">自力</span>
      {cell('t21', 't21', <TValue v={s.selfT21} strong />)}
      {cell('t63', 't63', <TValue v={s.selfT63} />)}
      <span />
      <span className="text-[var(--text-muted)]" title={EXT_R_NOTE}>距離</span>
      {cell('e9', '9', <><RValue v={s.extEma9} /> <RDiff diff={s.extEma9Diff} /></>, `${EXT_R_NOTE}。EMA9`)}
      {cell('e21', '21', <><RValue v={s.extEma21} strong /> <RDiff diff={s.extEma21Diff} /></>, `${EXT_R_NOTE}。EMA21`)}
      {cell('e50', '50', <><RValue v={s.extEma50} /> <RDiff diff={s.extEma50Diff} /></>, `${EXT_R_NOTE}。EMA50`)}
    </div>
  )
}

/**
 * 終値と EMA9 / 21 / 50 の距離（R）と、その横に 5 営業日前からの変化（括弧）。+ 緑 / − 赤。
 * 指数カード・業種カードで使う。株価の位置はこれで読むので、EMA の向き・並びはカードに出さない。
 *   large（指数カード）: 3 列。見出しの下に「+1.2R (+0.3)」
 *   既定（業種カード）: 狭いので 1 行 1 本。「EMA9  +1.2R  (+0.3)」を列をそろえて左に詰める
 */
export function ExtRGrid({
  ema9,
  ema21,
  ema50,
  diff9,
  diff21,
  diff50,
  large = false,
  note = EXT_R_NOTE,
  className = '',
}: {
  ema9: number | null | undefined
  ema21: number | null | undefined
  ema50: number | null | undefined
  /** 5 営業日前からの変化。無ければ「(—)」 */
  diff9?: number | null
  diff21?: number | null
  diff50?: number | null
  large?: boolean
  /** ホバーで出す説明（既定は業種の文言） */
  note?: string
  className?: string
}) {
  const items = [
    { label: 'EMA9', v: ema9, d: diff9 },
    { label: 'EMA21', v: ema21, d: diff21 },
    { label: 'EMA50', v: ema50, d: diff50 },
  ]
  const title = `${note}。括弧 = ${EXT_DIFF_DAYS} 営業日前からの変化`
  if (large) {
    return (
      <div className={`grid grid-cols-3 gap-2 ${className}`} title={title}>
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-caption text-[var(--text-muted)]">{it.label}</p>
            <p className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-lead">
                <RValue v={it.v} strong />
              </span>
              <RDiff diff={it.d} />
            </p>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div
      className={`grid grid-cols-[repeat(3,max-content)] gap-x-3 gap-y-0.5 items-baseline ${className}`}
      title={title}
    >
      {items.map((it) => (
        <Fragment key={it.label}>
          <span className="text-caption text-[var(--text-muted)]">{it.label}</span>
          <span className="text-small text-right">
            <RValue v={it.v} strong />
          </span>
          <span className="text-right">
            <RDiff diff={it.d} />
          </span>
        </Fragment>
      ))}
    </div>
  )
}

/**
 * 直近 60 営業日の終値と EMA9 / 21 / 50 を重ねた小さなチャート（指数カード・業種カード）。
 * 終値 = 太い濃い線、EMA は詳細チャート（TradingView）と同じ色の細い線で、右端に名前。
 * 縦軸は 60 日の終値・EMA の最小〜最大（目盛りは出さない。値の大きさは下の R で読む）。
 * マウスを乗せた日は縦の点線と、見出しに日付と終値・各 EMA の値（compact では日付と終値だけ）。
 */
const EMA_LINES = [
  { key: 'e9', label: '9', color: EMA_COLORS[9] },
  { key: 'e21', label: '21', color: EMA_COLORS[21] },
  { key: 'e50', label: '50', color: EMA_COLORS[50] },
] as const

export function EmaMiniChart({
  points,
  height = 72,
  compact = false,
  className = '',
}: {
  points: EmaChartPoint[]
  height?: number
  /** 狭いカード用。マウスを乗せたときの見出しを日付と終値だけにする */
  compact?: boolean
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) {
    return <p className={`text-caption text-[var(--text-muted)] ${className}`}>チャート: データなし</p>
  }
  const N = points.length
  const W = 200
  const H = 100
  const all = points.flatMap((p) => [p.close, p.e9, p.e21, p.e50]).filter(isNum)
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.06
  const x = (i: number) => ((i + 0.5) / N) * W
  const y = (v: number) => H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H

  const path = (get: (p: EmaChartPoint) => number | null) => {
    let d = ''
    let open = false
    points.forEach((p, i) => {
      const v = get(p)
      if (!isNum(v)) {
        open = false
        return
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`
      open = true
    })
    return d
  }

  // 右端の名前: 各 EMA の最終値の高さに置き、近すぎるときは上下に押し広げる（最低 11px）
  const last = points[N - 1]
  const labels = EMA_LINES.map((l) => ({ ...l, v: last[l.key] }))
    .filter((l): l is (typeof l & { v: number }) => isNum(l.v))
    .map((l) => ({ ...l, px: (y(l.v) / H) * height }))
    .sort((a, b) => a.px - b.px)
  for (let i = 1; i < labels.length; i++) labels[i].px = Math.max(labels[i].px, labels[i - 1].px + 11)
  const over = labels.length ? labels[labels.length - 1].px - (height - 5) : 0
  if (over > 0) labels.forEach((l) => (l.px -= over))

  const at = hover ?? N - 1
  const hp = hover != null ? points[hover] : null

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-caption text-[var(--text-muted)] mb-1 whitespace-nowrap">
        <span className="num">{hp ? hp.date.slice(5) : `${N} 日`}</span>
        {hp && (
          <span className="num flex gap-2 overflow-hidden">
            <span className="text-[var(--text-primary)]">{fmtLevel(hp.close)}</span>
            {!compact && EMA_LINES.map((l) => (
              <span key={l.key} style={{ color: l.color }}>
                {l.label} {isNum(hp[l.key]) ? fmtLevel(hp[l.key] as number) : '—'}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        <div className="relative flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible"
            role="img"
            aria-label={`直近 ${N} 営業日の終値と EMA9 / 21 / 50`}
          >
            {[...EMA_LINES].reverse().map((l) => (
              <path
                key={l.key}
                d={path((p) => p[l.key])}
                fill="none"
                stroke={l.color}
                strokeWidth="1.25"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={path((p) => p.close)}
              fill="none"
              stroke={CHART.textPrimary}
              strokeWidth="1.75"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke={CHART.textMuted} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* 終値の点（マウスの日、無ければ最終日）。SVG の外に置く（伸ばしても丸のまま） */}
          <span
            aria-hidden
            className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-[var(--bg-card)] bg-[var(--text-primary)]"
            style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(points[at].close) / H) * 100}%` }}
          />
          {/* マウスの当たり判定（1 日 1 列） */}
          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <div key={p.date} className="flex-1 h-full" onMouseEnter={() => setHover(i)} />
            ))}
          </div>
        </div>
        {/* 右端の名前 */}
        <div className="relative w-4 text-caption num" style={{ height }} aria-hidden>
          {labels.map((l) => (
            <span key={l.key} className="absolute left-0 -translate-y-1/2 leading-none" style={{ top: l.px, color: l.color }}>
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 判定の小さな札: ● 緑 上向き EMA9・21 の上 (RS Leaders / Liquid Leaders の Sector Board) */
export function TrendTag({ state, className = '' }: { state: TrendState; className?: string }) {
  const sig = SIGNAL_STYLE[state.signal]
  return (
    <span
      className={`justify-self-start inline-flex items-center gap-1 rounded border-[0.5px] px-1.5 my-0.5 text-caption ${className}`}
      style={{ backgroundColor: sig.bg, borderColor: sig.bd, color: sig.fg }}
    >
      <span aria-hidden className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sig.fg }} />
      <span className="font-medium">{sig.name}</span>
      <span>{state.label}</span>
    </span>
  )
}
