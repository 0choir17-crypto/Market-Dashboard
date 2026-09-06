'use client'

// Watchlist Journal の 2 セクション（Current State / Missed Board）で共有するセル。
// 表そのものの骨格（ソート・グループ・要約/詳細）は components/shared/DataTable.tsx。

import { formatPct, formatYen } from '@/lib/format'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'

/**
 * 損益率セル。NULL は「0%」ではなく欠損として出す（§6）。
 * イベント当日は翌営業日がまだ来ていないため NULL になる。
 */
export function PctCell({
  value,
  digits = 1,
  title,
  neutral = false,
}: {
  value: number | null | undefined
  digits?: number
  title?: string
  /** 損益ではない % に使う。1R % はほぼ常にプラスなので、緑にすると「良い数字」と誤読される。 */
  neutral?: boolean
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="num text-[var(--sem-idle-fg)]" title={title ?? '未測定（翌営業日以降に計算されます）'}>
        —
      </span>
    )
  }
  if (neutral) {
    return (
      <span className="num text-[var(--text-secondary)]" title={title}>
        {formatPct(value, { digits })}
      </span>
    )
  }
  const color =
    value > 0 ? 'text-[var(--positive)]' : value < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-secondary)]'
  return (
    <span className={`num ${color}`} title={title}>
      {formatPct(value, { digits, sign: true })}
    </span>
  )
}

/**
 * 円建てセル。
 *
 * Supabase には Pine の呼値丸めを掛けていない生値が入っており、TradingView の
 * 表示とは数円ずれる（+915 に対し 914.58 など）。整数に丸めて出し、厳密な
 * 突き合わせは % 側で行う（% は小数第 2 位まで TV と一致する）。
 */
export function YenCell({
  value,
  title,
}: {
  value: number | null | undefined
  title?: string
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="num text-[var(--sem-idle-fg)]">—</span>
  }
  return (
    <span className="num text-[var(--text-secondary)]" title={title}>
      {formatYen(value)}
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
    return <span className="num text-[var(--sem-idle-fg)]">—</span>
  }
  return (
    <span className="num text-[var(--text-secondary)]" title={title}>
      {value.toFixed(digits)}
      {suffix}
    </span>
  )
}

/**
 * 銘柄セル。プロジェクト共通のティッカークリック規約に従う（lib/tickerLinks.ts）:
 * コード → TradingView、銘柄名 → 四季報。
 * コードは `278A` のように英字を含むので文字列のまま扱う（数値としてパース・ソートしない）。
 */
export function TickerCell({
  code,
  name,
}: {
  code: string
  name: string | null | undefined
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <a
        href={tradingViewUrl(code)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline flex-shrink-0"
        title={`${code}（TradingView を開く）`}
      >
        {code}
      </a>
      <a
        href={shikihoUrl(code)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-small text-[var(--text-muted)] hover:text-[var(--sem-focus-fg)] hover:underline truncate min-w-0"
        title={`${name ?? '—'}（四季報を開く）`}
      >
        {name ?? '—'}
      </a>
    </div>
  )
}

/** 件数が少ないことを明示する注記。勝率・PF・期待値は出さない（§3.4）。 */
export function SampleSizeNote({ n, children }: { n: number; children?: React.ReactNode }) {
  return (
    <p className="text-caption text-[var(--text-muted)] mt-2">
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
