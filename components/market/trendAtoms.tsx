'use client'

// 地合い判定カード（指数 / 業種）で共通に使う表示部品。
// 色だけでは理由が読めないので、信号には必ず判定の言葉を添える。
// 上下は文字ではなく ↑ / ↓ で、位置関係は「値の大きい順に > でつないだ並び」で一発で読ませる。

import { Fragment, useId, useState } from 'react'
import { SLOPE_LOOKBACK, type TrendSignal, type TrendState } from '@/lib/trendState'
import type { SectorTrend } from '@/lib/sectorTrendFetch'
import { RDiff, RValue, TValue } from '@/components/sectors33/SelfStrength'
import { EXT_DIFF_DAYS, EXT_HIST_DAYS, EXT_R_NOTE, isNum, type ExtPoint } from '@/types/sectorSelection'

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

/** 1 本の線（RSparklines の中で使う）。目盛り・マウスの位置は親が持つ */
function SparkRow({
  points,
  scale,
  hover,
  height,
}: {
  points: (ExtPoint | null)[]
  scale: number
  hover: number | null
  height: number
}) {
  const clipId = useId()
  const N = points.length
  const W = 200
  const H = 100
  const x = (i: number) => ((i + 0.5) / N) * W
  const y = (v: number) => H / 2 - (Math.max(-scale, Math.min(scale, v)) / scale) * (H / 2)

  // 値が続いている区間ごとに線と面を作る（値の無い日で線を切る）
  const segments: { i: number; v: number }[][] = []
  let cur: { i: number; v: number }[] = []
  points.forEach((p, i) => {
    if (p && isNum(p.v)) cur.push({ i, v: p.v })
    else if (cur.length) {
      segments.push(cur)
      cur = []
    }
  })
  if (cur.length) segments.push(cur)
  const top = (seg: { i: number; v: number }[]) =>
    seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join('')
  const linePath = segments.map(top).join('')
  const areaPath = segments
    .map((seg) => `${top(seg)}L${x(seg[seg.length - 1].i).toFixed(2)},${H / 2}L${x(seg[0].i).toFixed(2)},${H / 2}Z`)
    .join('')

  // 点 = マウスの日、無ければ最終日
  const at = hover ?? N - 1
  const dot = points[at]
  const above = `${clipId}-up`
  const below = `${clipId}-dn`
  return (
    <div className="relative" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden>
        <defs>
          <clipPath id={above}>
            <rect x="0" y="0" width={W} height={H / 2} />
          </clipPath>
          <clipPath id={below}>
            <rect x="0" y={H / 2} width={W} height={H / 2} />
          </clipPath>
        </defs>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={areaPath} fill="var(--positive)" fillOpacity="0.18" clipPath={`url(#${above})`} />
        <path d={areaPath} fill="var(--negative)" fillOpacity="0.18" clipPath={`url(#${below})`} />
        <path d={linePath} fill="none" stroke="var(--positive)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${above})`} />
        <path d={linePath} fill="none" stroke="var(--negative)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${below})`} />
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* 点は SVG の外に置く（縦横比を崩して伸ばしても丸のまま） */}
      {dot && isNum(dot.v) && (
        <span
          aria-hidden
          className="absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-[var(--bg-card)]"
          style={{
            left: `${(x(at) / W) * 100}%`,
            top: `${(y(dot.v) / H) * 100}%`,
            backgroundColor: dot.v >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}
        />
      )}
    </div>
  )
}

/**
 * EMA 距離（R）の直近 20 営業日の推移を、EMA ごとに 1 本ずつ縦に並べた折れ線で。
 * 0 の線を挟んで、上は緑・下は赤で線と 0 の間を塗る。
 * 傾き（伸びている / 縮んでいる）と 0 をまたいだ日（終値が EMA を上抜け・下抜けした日）を読むためのもの。
 * 縦の目盛りは 1 枚のカードの中で共通（本どうしで離れ具合を比べられるように）:
 * ±max(2, 全部の線の最大の絶対値を切り上げ) R を右上に表示。
 * 足りない日は左を空ける（横の位置をカード間でそろえる）。マウスを乗せた日は全部の線で同じ日を指し、
 * 見出しに日付と各線の値を出す。
 */
export function RSparklines({
  series,
  rowHeight = 24,
  className = '',
}: {
  series: { label: string; points: ExtPoint[] }[]
  rowHeight?: number
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const N = EXT_HIST_DAYS
  const vals = series.flatMap((s) => s.points.map((p) => p.v)).filter(isNum)
  if (vals.length === 0) {
    return <p className={`text-caption text-[var(--text-muted)] ${className}`}>EMA 距離の推移: データなし</p>
  }
  const scale = Math.max(2, Math.ceil(Math.max(...vals.map(Math.abs))))
  const padded = series.map((s) => ({
    label: s.label,
    slots: [...Array(Math.max(0, N - s.points.length)).fill(null), ...s.points.slice(-N)] as (ExtPoint | null)[],
  }))
  // 日付は値のある最初の線から取る
  const dateAt = (i: number) => padded.map((s) => s.slots[i]?.date).find(Boolean)
  const hoverDate = hover != null ? dateAt(hover) : undefined

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-caption text-[var(--text-muted)] mb-1 whitespace-nowrap">
        <span className="num">{hoverDate ? hoverDate.slice(5) : `R 推移 ${N} 日`}</span>
        <span className="num flex gap-2">
          {hoverDate
            ? padded.map((s) => (
                <span key={s.label}>
                  {s.label} <RValue v={s.slots[hover!]?.v} />
                </span>
              ))
            : `±${scale}R`}
        </span>
      </div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 items-center">
          {padded.map((s) => (
            <Fragment key={s.label}>
              <span className="text-caption text-[var(--text-muted)] num w-4 text-right">{s.label}</span>
              <SparkRow points={s.slots} scale={scale} hover={hover} height={rowHeight} />
            </Fragment>
          ))}
        </div>
        {/* マウスの当たり判定（1 日 1 列）。ラベルの列を避けて線の上だけに置く */}
        <div className="absolute inset-y-0 right-0 flex" style={{ left: 'calc(1rem + 0.5rem)' }}>
          {Array.from({ length: N }, (_, i) => (
            <div key={i} className="flex-1 h-full" onMouseEnter={() => setHover(dateAt(i) ? i : null)} />
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
