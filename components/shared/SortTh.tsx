'use client'

// ソート可能な列見出し — プロジェクト唯一の定義。
//
// 以前は Sectors / Earnings / Leaders に同じものが 3 つあり、パディングと
// hint の有無だけが違っていた。差分をプロパティに寄せて 1 箇所に統合する。
//
// 表示規則（DESIGN_DIRECTION.md）:
//   - サイズは caption（11px）、ウェイトは 400 / 500 のみ
//   - ソート中の列だけ --sem-focus-fg。それ以外はミュート
//   - ホバーは背景色の変化のみ（移動・影の変化は置かない）

import type { ReactNode } from 'react'
import Tooltip from '@/components/shared/Tooltip'

export type SortDirection = 'asc' | 'desc'

type Props<K extends string> = {
  label: ReactNode
  /** ホバーで出す説明。文字列のときだけ Tooltip でくるむ。 */
  tooltip?: string
  /** ラベルの右に添える補足（並び替え対象ではない列内の中身の説明など）。 */
  hint?: ReactNode
  sortKey: K
  currentKey: K
  currentDir: SortDirection
  onSort: (k: K) => void
  align?: 'left' | 'right' | 'center'
  /** 表ごとの詰め方。既定は行高 32px に合わせた tight。 */
  density?: 'tight' | 'roomy'
  className?: string
}

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const

export default function SortTh<K extends string>({
  label,
  tooltip,
  hint,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  density = 'tight',
  className = '',
}: Props<K>) {
  const active = currentKey === sortKey
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${density === 'tight' ? 'px-2.5 py-2' : 'px-3 py-2.5'} text-caption tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-[var(--bg-card-hover)] ${
        ALIGN[align]
      } ${active ? 'text-[var(--sem-focus-fg)]' : 'text-[var(--text-muted)]'} ${className}`}
    >
      {tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : label}
      {hint}
      <span className="opacity-50">{indicator}</span>
    </th>
  )
}

/**
 * ソートの共通規則。
 *
 * NULL は昇順・降順のどちらでも **末尾** に置く。欠損を最小値として先頭に
 * 並べると、まだ測れていない行が上位に居座って読めなくなるため。
 * 文字列は localeCompare（銘柄コードは `278A` のように英字を含むので
 * 数値としてパースしない）。
 */
export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: SortDirection,
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  const c =
    typeof a === 'string' || typeof b === 'string'
      ? String(a).localeCompare(String(b))
      : a - b
  return dir === 'asc' ? c : -c
}
