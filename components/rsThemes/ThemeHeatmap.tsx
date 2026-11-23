'use client'

// Theme Heatmap — テーマグループ × 日。濃さ = そのグループに入る銘柄数 (n_stocks)。
// 21 日と 63 日を上下 2 枚に並べ、横軸と色の尺度を揃えて比べられるようにする。
// 各格子の上に、その日の対象銘柄数 (n_total) の小さな棒を置く (全体が少ない日と区別するため)。
//
// 1 銘柄は最大 3 グループで数えるので、列の合計は n_total と合わない。積み上げにはしない。

import { Fragment, useMemo, useState } from 'react'
import { HoverReadout, monthTicks } from '@/components/leaders/heatmapUi'
import { HEATMAP_DAYS, PERIODS, type RsPeriod, type ThemeGrid } from '@/types/rsThemes'

type Hover = { period: RsPeriod; group: string; date: string }

/** 0 は無色。1 以上は --heat-g-3 を件数に比例した濃さで混ぜる (最小 12%)。 */
function cellColor(n: number, max: number): string | undefined {
  if (!(n > 0) || max <= 0) return undefined
  const pct = Math.round(12 + 88 * Math.min(n / max, 1))
  return `color-mix(in srgb, var(--heat-g-3) ${pct}%, transparent)`
}

export default function ThemeHeatmap({ grids }: { grids: Record<RsPeriod, ThemeGrid> }) {
  const [hover, setHover] = useState<Hover | null>(null)

  // 両期間で共通の尺度
  const { maxN, maxTotal } = useMemo(() => {
    let maxN = 0
    let maxTotal = 0
    for (const p of PERIODS) {
      const g = grids[p.key]
      const keep = new Set(g.dates.slice(-HEATMAP_DAYS))
      for (const [k, v] of g.cells) if (keep.has(k.slice(k.indexOf('|') + 1))) maxN = Math.max(maxN, v)
      for (const [d, v] of g.totals) if (keep.has(d)) maxTotal = Math.max(maxTotal, v)
    }
    return { maxN, maxTotal }
  }, [grids])

  const hv = hover ? grids[hover.period] : null
  const hoverN = hv && hover ? hv.cells.get(`${hover.group}|${hover.date}`) : undefined
  const hoverTotal = hv && hover ? hv.totals.get(hover.date) : undefined

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="mb-3">
        <h2 className="text-small font-medium text-[var(--text-primary)]">Theme Heatmap</h2>
        <p className="text-caption text-[var(--text-secondary)] mt-0.5">
          濃いほど、そのテーマの強い銘柄が多い（直近 {HEATMAP_DAYS} 営業日）。上の灰色の棒はその日の対象銘柄数。
          1 銘柄が最大 3 グループで数えられるので、縦に足しても対象銘柄数にはならない。
        </p>
      </div>

      <HoverReadout placeholder="Hover a cell to see date / group / stocks / total">
        {hover && (
          <>
            <span className="text-[var(--text-primary)] font-medium">{hover.group}</span>
            {'　'}{hover.period}d{'　'}{hover.date}
            {hover.group !== '' && <>{'　'}Stocks {hoverN ?? 0}</>}
            {'　'}Total {hoverTotal ?? 0}
          </>
        )}
      </HoverReadout>

      <div className="space-y-5" onMouseLeave={() => setHover(null)}>
        {PERIODS.map(p => (
          <Grid
            key={p.key}
            period={p.key}
            label={`${p.label}（RS ${p.key} 日）`}
            grid={grids[p.key]}
            maxN={maxN}
            maxTotal={maxTotal}
            hover={hover}
            onHover={setHover}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-caption text-[var(--text-secondary)]">
        <span className="text-[var(--text-muted)]">Stocks:</span>
        <span className="num">0</span>
        <span
          className="inline-block w-3 h-3 rounded-sm"
          style={{ boxShadow: 'inset 0 0 0 0.5px var(--heat-grid)' }}
        />
        <span className="num">1</span>
        <span
          className="inline-block w-24 h-3 rounded-sm"
          style={{
            background: `linear-gradient(to right, ${cellColor(1, maxN) ?? 'transparent'}, var(--heat-g-3))`,
          }}
        />
        <span className="num">{maxN}</span>
      </div>
    </section>
  )
}

function Grid({
  period,
  label,
  grid,
  maxN,
  maxTotal,
  hover,
  onHover,
}: {
  period: RsPeriod
  label: string
  grid: ThemeGrid
  maxN: number
  maxTotal: number
  hover: Hover | null
  onHover: (h: Hover) => void
}) {
  const dates = useMemo(() => grid.dates.slice(-HEATMAP_DAYS), [grid.dates])
  const ticks = useMemo(() => monthTicks(dates), [dates])
  const n = Math.max(dates.length, 1)
  const gridCols = `9rem repeat(${n}, minmax(4px, 1fr))`

  if (dates.length === 0) {
    return <p className="text-caption text-[var(--text-muted)] py-4 text-center">No data ({label})</p>
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-px" style={{ gridTemplateColumns: gridCols, minWidth: `calc(9rem + ${n * 5}px)` }}>
        <div className="text-caption font-medium text-[var(--text-primary)] leading-5" style={{ gridColumn: `span ${n + 1}` }}>
          {label}
        </div>

        {/* n_total の棒 */}
        <div className="text-caption text-right pr-2 text-[var(--text-muted)] leading-[22px]">Total</div>
        {dates.map(d => {
          const t = grid.totals.get(d) ?? 0
          const isHover = hover?.period === period && hover.date === d
          return (
            <div
              key={d}
              className="h-[22px] flex items-end"
              onMouseEnter={() => onHover({ period, group: '', date: d })}
            >
              <div
                className="w-full rounded-t-[1px]"
                style={{
                  height: `${maxTotal > 0 ? Math.max((t / maxTotal) * 100, t > 0 ? 6 : 0) : 0}%`,
                  backgroundColor: isHover ? 'var(--text-secondary)' : 'var(--border-strong)',
                }}
              />
            </div>
          )
        })}

        {/* 月の見出し */}
        <div />
        {dates.map((d, i) => (
          <div key={d} className="h-4 text-caption text-[var(--text-muted)] whitespace-nowrap overflow-visible">
            {ticks[i]}
          </div>
        ))}

        {grid.groups.map(g => {
          const activeRow = hover?.period === period && hover.group === g.name
          return (
            <Fragment key={g.name}>
              <div
                className={`text-caption text-right pr-2 truncate leading-[14px] ${
                  activeRow ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
                }`}
                title={g.name}
              >
                {g.name}
              </div>
              {dates.map(d => {
                const v = grid.cells.get(`${g.name}|${d}`) ?? 0
                const bg = cellColor(v, maxN)
                const isHover = activeRow && hover?.date === d
                return (
                  <div
                    key={d}
                    onMouseEnter={() => onHover({ period, group: g.name, date: d })}
                    className="h-[14px] rounded-[2px]"
                    style={{
                      backgroundColor: bg ?? 'transparent',
                      boxShadow: isHover
                        ? 'inset 0 0 0 1px var(--text-secondary)'
                        : bg
                          ? undefined
                          : 'inset 0 0 0 0.5px var(--heat-grid)',
                    }}
                  />
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
