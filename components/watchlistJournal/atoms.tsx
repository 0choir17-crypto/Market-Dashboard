'use client'

// Watchlist Journal の 3 セクション（現在の状態 / 今日の差分 / 見逃しボード）で
// 共有する小物。旧 /watchlist の ScreenTagBadge に相当する部品群。

import { stateColors } from '@/types/watchlistJournal'
import { formatPct } from '@/lib/format'

/** TradingView のセクション名（= 状態）バッジ。 */
export function StateBadge({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-gray-400 text-xs">—</span>
  const c = stateColors(state)
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {state}
    </span>
  )
}

/**
 * その日ヒットしていたスキャナー名。
 *
 * 空欄は「自力発見」と断定できない: ①どのスキャナーも拾えていなかった のほかに
 * ②その日スキャナーリストを TradingView に貼らなかった が混ざっていて区別できない。
 * ラベルを付けると誤解を招くので `—` に留める（集計もしない）。
 */
export function ScannerTags({ names }: { names: string[] | null | undefined }) {
  if (!names || names.length === 0) {
    return (
      <span
        className="text-gray-300"
        title="スキャナー名の記録なし（どのスキャナーも拾えていない場合と、その日リストを貼らなかった場合が区別できません）"
      >
        —
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {names.map(n => (
        <span
          key={n}
          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 whitespace-nowrap"
        >
          {n}
        </span>
      ))}
    </span>
  )
}

/**
 * 損益率セル。NULL は「0%」ではなく欠損として出す（§6）。
 * イベント当日は翌営業日がまだ来ていないため NULL になる。
 */
export function PctCell({
  value,
  digits = 1,
  title,
}: {
  value: number | null | undefined
  digits?: number
  title?: string
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="text-gray-300 font-mono tabular-nums" title={title ?? '未測定（翌営業日以降に計算されます）'}>
        —
      </span>
    )
  }
  const color =
    value > 0 ? 'text-[var(--positive)]' : value < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-secondary)]'
  return (
    <span className={`font-mono tabular-nums ${color}`} title={title}>
      {formatPct(value, { digits, sign: true })}
    </span>
  )
}

/** 単位付きの素の数値セル。NULL は欠損として出す。 */
export function NumCell({
  value,
  digits = 1,
  suffix = '',
  title,
}: {
  value: number | null | undefined
  digits?: number
  suffix?: string
  title?: string
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-gray-300 font-mono tabular-nums">—</span>
  }
  return (
    <span className="font-mono tabular-nums text-[var(--text-secondary)]" title={title}>
      {value.toFixed(digits)}
      {suffix}
    </span>
  )
}

/**
 * 銘柄セル。コードは `278A` のように英字を含むので文字列のまま扱う
 * （数値としてパース・ソートしない）。
 */
export function TickerCell({
  code,
  name,
}: {
  code: string
  name: string | null | undefined
}) {
  return (
    <div className="min-w-0">
      <span className="font-mono font-semibold text-[var(--text-primary)]">{code}</span>
      {name && (
        <span className="ml-2 text-xs text-[var(--text-muted)] truncate" title={name}>
          {name}
        </span>
      )}
    </div>
  )
}

/** 件数が少ないことを明示する注記。勝率・PF・期待値は出さない（§3.4）。 */
export function SampleSizeNote({ n, children }: { n: number; children?: React.ReactNode }) {
  return (
    <p className="text-[11px] text-[var(--text-muted)] mt-2">
      n={n} — 件数がまだ少ないため中央値のみ。勝率・PF・期待値は出しません
      {children}
    </p>
  )
}

/** 中央値。空配列と NULL 混在に耐える。 */
export function median(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid]
}
