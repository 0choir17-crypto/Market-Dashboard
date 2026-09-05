'use client'

// Watchlist Journal の 3 セクション（現在の状態 / 今日の差分 / 見逃しボード）で
// 共有する小物。旧 /watchlist の ScreenTagBadge に相当する部品群。

import { stateTone } from '@/types/watchlistJournal'
import { toneVars } from '@/types/semantic'
import { formatPct, formatYen } from '@/lib/format'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'

/**
 * 状態のラベル。
 *
 * バッジ（塗り + 枠）はやめてテキストにした。Current State は既に state で
 * グループ化されており、その中の全行に同じ色のバッジを置くのは同じ情報の
 * 二重描画になる。重みは色ではなく行左端のレール（`READY` のみ）で表す。
 */
export function StateLabel({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-[var(--sem-idle-fg)]">—</span>
  return (
    <span className="text-caption tracking-wide text-[var(--text-secondary)]">{state}</span>
  )
}

/** 語彙の色を面として使う数少ない場所（鮮度バッジなど）向けのインラインスタイル。 */
export function toneStyle(state: string | null | undefined) {
  const t = toneVars(stateTone(state))
  return { backgroundColor: t.bg, color: t.fg, border: `0.5px solid ${t.bd}` }
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
        className="text-[var(--sem-idle-fg)]"
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
          className="inline-block px-1.5 py-0.5 rounded text-caption bg-[var(--sem-idle-bg)] text-[var(--sem-idle-fg)] whitespace-nowrap"
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
