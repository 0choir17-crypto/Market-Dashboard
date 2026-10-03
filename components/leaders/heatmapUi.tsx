'use client'

// 業種 × 週ヒートマップの部品。
// 色は緑 1 色相 (--heat-g-1〜3) の 3 段の濃淡だけ。塗りのバッジは使わない。

import type { ReactNode } from 'react'

/** 濃淡 3 段 (緑 1 色相)。[薄 / 中 / 濃]。両ヒートマップ共通。 */
export const GREEN = ['var(--heat-g-1)', 'var(--heat-g-2)', 'var(--heat-g-3)']

/** 小さな切り替え (段 / 期間 / 並び)。選択中は枠と文字色だけで示す。 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border-[0.5px] border-[var(--border-strong)] overflow-hidden">
      {options.map(o => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`text-caption px-2 py-0.5 transition-colors ${
              on
                ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-medium'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** 凡例の色見本。 */
export function Swatch({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ backgroundColor: color, boxShadow: 'inset 0 0 0 0.5px var(--heat-grid)' }}
      />
      <span className="num">{label}</span>
    </span>
  )
}

/** マスにマウスを乗せたときの読み出し行 (高さ固定でレイアウトを揺らさない)。 */
export function HoverReadout({ children, placeholder }: { children: ReactNode; placeholder: string }) {
  return (
    <div className="h-5 text-caption text-[var(--text-secondary)] num truncate">
      {children ?? <span className="text-[var(--text-muted)]">{placeholder}</span>}
    </div>
  )
}

/** 列見出し用: 月が変わる列にだけ 'M月' (年が変わる列は 'YY/M') を返す。 */
export function monthTicks(isoDates: string[]): (string | null)[] {
  let prev = ''
  return isoDates.map(iso => {
    const ym = iso.slice(0, 7)
    if (ym === prev) return null
    const first = prev === ''
    const yearChanged = prev !== '' && prev.slice(0, 4) !== iso.slice(0, 4)
    prev = ym
    const m = parseInt(iso.slice(5, 7), 10)
    return first || yearChanged ? `${iso.slice(2, 4)}/${m}` : `${m}月`
  })
}
