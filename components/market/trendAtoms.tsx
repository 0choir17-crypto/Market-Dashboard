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

/**
 * EMA9 / 21 / 50 距離（R）の直近 20 営業日の推移を、1 つの枠に重ねた折れ線で。
 * - EMA9 は主の線: 0 の線を挟んで上は緑・下は赤（線と 0 の間も薄く塗る）。
 * - EMA21 / 50 は灰の細い線（21 を濃く、50 を薄く）。右端に名前を付ける。
 * 線どうしの間隔 = EMA どうしの間隔（ATR 何本ぶん）。広がる = 加速 / 狭まる = 鈍化 / 交差 = EMA どうしの交差。
 * 縦の目盛りは ±max(2, 全部の線の最大の絶対値を切り上げ) R（右上に表示）。値の無い日は線を切る。
 * 足りない日は左を空ける（横の位置をカード間でそろえる）。マウスを乗せた日は縦の点線と、見出しに日付と各線の値。
 */
const OVERLAY_STYLE: Record<string, { stroke: string; width: number }> = {
  '21': { stroke: 'var(--text-secondary)', width: 1.25 },
  '50': { stroke: 'var(--text-muted)', width: 1.25 },
}

export function RSparklines({
  series,
  height = 64,
  className = '',
}: {
  /** 先頭が主の線（EMA9）。残りは灰の線 */
  series: { label: string; points: ExtPoint[] }[]
  height?: number
  className?: string
}) {
  const clipId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const N = EXT_HIST_DAYS
  const vals = series.flatMap((s) => s.points.map((p) => p.v)).filter(isNum)
  if (vals.length === 0) {
    return <p className={`text-caption text-[var(--text-muted)] ${className}`}>EMA 距離の推移: データなし</p>
  }
  const W = 200
  const H = 100
  const scale = Math.max(2, Math.ceil(Math.max(...vals.map(Math.abs))))
  const x = (i: number) => ((i + 0.5) / N) * W
  const y = (v: number) => H / 2 - (Math.max(-scale, Math.min(scale, v)) / scale) * (H / 2)
  const padded = series.map((s) => ({
    label: s.label,
    slots: [...Array(Math.max(0, N - s.points.length)).fill(null), ...s.points.slice(-N)] as (ExtPoint | null)[],
  }))
  const dateAt = (i: number) => padded.map((s) => s.slots[i]?.date).find(Boolean)
  const hoverDate = hover != null ? dateAt(hover) : undefined

  // 値が続いている区間ごとのパス（値の無い日で線を切る）
  const paths = (slots: (ExtPoint | null)[]) => {
    const segs: { i: number; v: number }[][] = []
    let cur: { i: number; v: number }[] = []
    slots.forEach((p, i) => {
      if (p && isNum(p.v)) cur.push({ i, v: p.v })
      else if (cur.length) {
        segs.push(cur)
        cur = []
      }
    })
    if (cur.length) segs.push(cur)
    const top = (seg: { i: number; v: number }[]) =>
      seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join('')
    return {
      line: segs.map(top).join(''),
      area: segs.map((seg) => `${top(seg)}L${x(seg[seg.length - 1].i).toFixed(2)},${H / 2}L${x(seg[0].i).toFixed(2)},${H / 2}Z`).join(''),
    }
  }
  const [main, ...rest] = padded
  const mainPath = paths(main.slots)
  const above = `${clipId}-up`
  const below = `${clipId}-dn`

  // 右端の名前: 各線の最後の値の高さに置き、近すぎるときは上下に押し広げる（最低 11px）
  const at = hover ?? N - 1
  const lastOf = (slots: (ExtPoint | null)[]) => {
    for (let i = slots.length - 1; i >= 0; i--) if (slots[i] && isNum(slots[i]!.v)) return slots[i]!.v as number
    return null
  }
  const labels = padded
    .map((s) => ({ label: s.label, v: lastOf(s.slots) }))
    .filter((l): l is { label: string; v: number } => l.v != null)
    .map((l) => ({ ...l, px: (y(l.v) / H) * height }))
    .sort((a, b) => a.px - b.px)
  for (let i = 1; i < labels.length; i++) labels[i].px = Math.max(labels[i].px, labels[i - 1].px + 11)
  const overflow = labels.length ? labels[labels.length - 1].px - (height - 5) : 0
  if (overflow > 0) labels.forEach((l) => (l.px -= overflow))

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
      <div className="flex gap-1.5">
        <div className="relative flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible"
            role="img"
            aria-label={`EMA ${series.map((s) => s.label).join(' / ')} 距離（R）の直近 ${N} 営業日の推移`}
          >
            <defs>
              <clipPath id={above}>
                <rect x="0" y="0" width={W} height={H / 2} />
              </clipPath>
              <clipPath id={below}>
                <rect x="0" y={H / 2} width={W} height={H / 2} />
              </clipPath>
            </defs>
            <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={mainPath.area} fill="var(--positive)" fillOpacity="0.15" clipPath={`url(#${above})`} />
            <path d={mainPath.area} fill="var(--negative)" fillOpacity="0.15" clipPath={`url(#${below})`} />
            {/* 灰の線は主の線の下に描く */}
            {[...rest].reverse().map((s) => (
              <path
                key={s.label}
                d={paths(s.slots).line}
                fill="none"
                stroke={OVERLAY_STYLE[s.label]?.stroke ?? 'var(--text-muted)'}
                strokeWidth={OVERLAY_STYLE[s.label]?.width ?? 1.25}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={mainPath.line} fill="none" stroke="var(--positive)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${above})`} />
            <path d={mainPath.line} fill="none" stroke="var(--negative)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${below})`} />
            {hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* 点は SVG の外に置く（縦横比を崩して伸ばしても丸のまま）。主の線は色、灰の線は灰 */}
          {padded.map((s, k) => {
            const p = s.slots[at]
            if (!p || !isNum(p.v)) return null
            const color = k === 0 ? (p.v >= 0 ? 'var(--positive)' : 'var(--negative)') : OVERLAY_STYLE[s.label]?.stroke ?? 'var(--text-muted)'
            return (
              <span
                key={s.label}
                aria-hidden
                className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-[var(--bg-card)] ${k === 0 ? 'w-1.5 h-1.5' : 'w-1 h-1'}`}
                style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(p.v) / H) * 100}%`, backgroundColor: color }}
              />
            )
          })}
          {/* マウスの当たり判定（1 日 1 列） */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: N }, (_, i) => (
              <div key={i} className="flex-1 h-full" onMouseEnter={() => setHover(dateAt(i) ? i : null)} />
            ))}
          </div>
        </div>
        {/* 右端の名前 */}
        <div className="relative w-4 text-caption num" style={{ height }} aria-hidden>
          {labels.map((l) => (
            <span
              key={l.label}
              className="absolute left-0 -translate-y-1/2 leading-none"
              style={{
                top: l.px,
                color:
                  l.label === main.label
                    ? l.v >= 0
                      ? 'var(--positive)'
                      : 'var(--negative)'
                    : OVERLAY_STYLE[l.label]?.stroke ?? 'var(--text-muted)',
                fontWeight: l.label === main.label ? 500 : 400,
              }}
            >
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
