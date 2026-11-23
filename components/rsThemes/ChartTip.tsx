'use client'

// 帯・折れ線の上に出す小さなツールチップ。親は position: relative にする。
// x は親の幅に対する位置 (0〜1)。右半分では左に出して、はみ出さないようにする。

import type { ReactNode } from 'react'

export default function ChartTip({ x, top = 0, children }: { x: number; top?: number; children: ReactNode }) {
  const right = x > 0.5
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-md border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-card)] px-2.5 py-1.5 text-caption text-[var(--text-secondary)] shadow-sm whitespace-nowrap num"
      style={{
        top,
        left: right ? undefined : `calc(${x * 100}% + 10px)`,
        right: right ? `calc(${(1 - x) * 100}% + 10px)` : undefined,
      }}
    >
      {children}
    </div>
  )
}

/** ツールチップの 1 行: 色見本 + テーマ名 + 値。 */
export function TipRow({ color, label, value }: { color?: string; label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {color && <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />}
      <span className="text-[var(--text-primary)]">{label}</span>
      <span className="ml-auto pl-3">{value}</span>
    </div>
  )
}

/** 月の目盛り: 先頭 (期間の始まり) のラベルが次の月とぶつかるほど近いときは、先頭を消す。 */
export function spaceTicks(ticks: (string | null)[], minGap = 0.08): (string | null)[] {
  const n = ticks.length
  const next = ticks.findIndex((t, i) => i > 0 && t)
  if (ticks[0] && next > 0 && next / n < minGap) return [null, ...ticks.slice(1)]
  return ticks
}
