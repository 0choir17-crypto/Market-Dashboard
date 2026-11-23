'use client'

// Theme Lines の「Heatmap」表示。テーマグループ × 日、色 = n_stocks の段階 (HEAT_STEPS、21d / 63d 共通)。
// 21 日と 63 日を上下 2 枚に並べ、各格子の上にその日の対象銘柄数 (n_total) の小さな棒を置く。
// 1 銘柄は最大 3 グループで数えるので、列の合計は n_total と合わない。積み上げにはしない。

import { Fragment, useMemo, useState } from 'react'
import { HoverReadout, Swatch, monthTicks } from '@/components/leaders/heatmapUi'
import { spaceTicks } from './ChartTip'
import { HEAT_STEPS, PERIODS, type RsPeriod, type ThemeGrid } from '@/types/rsThemes'

type Hover = { period: RsPeriod; group: string; date: string }

function cellColor(n: number): string | undefined {
  let c: string | undefined
  for (const s of HEAT_STEPS) if (n >= s.min) c = s.color
  return c
}

export default function ThemeHeatmap({ grids }: { grids: Record<RsPeriod, ThemeGrid> }) {
  const [hover, setHover] = useState<Hover | null>(null)

  const maxTotal = useMemo(() => {
    let m = 0
    for (const p of PERIODS) for (const v of grids[p.key].totals.values()) m = Math.max(m, v)
    return m
  }, [grids])

  const hv = hover ? grids[hover.period] : null
  const hoverN = hv && hover ? hv.cells.get(`${hover.group}|${hover.date}`) : undefined
  const hoverTotal = hv && hover ? hv.totals.get(hover.date) : undefined

  return (
    <div>
      <HoverReadout placeholder="Hover a cell to see date / theme / stocks / total">
        {hover && (
          <>
            <span className="text-[var(--text-primary)] font-medium">{hover.group || 'Total'}</span>
            {'　'}{hover.period}d{'　'}{hover.date}
            {hover.group !== '' && <>{'　'}Stocks {hoverN ?? 0}</>}
            {'　'}Total {hoverTotal ?? 0}
          </>
        )}
      </HoverReadout>

      <div className="space-y-5" onMouseLeave={() => setHover(null)}>
        {PERIODS.map(p => (
          <Grid key={p.key} period={p.key} label={p.label} grid={grids[p.key]} maxTotal={maxTotal} hover={hover} onHover={setHover} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-caption text-[var(--text-secondary)]">
        <span className="text-[var(--text-muted)]">Stocks:</span>
        <Swatch color="transparent" label="0" />
        {HEAT_STEPS.map(s => (
          <Swatch key={s.min} color={s.color} label={s.label} />
        ))}
      </div>
    </div>
  )
}

function Grid({
  period,
  label,
  grid,
  maxTotal,
  hover,
  onHover,
}: {
  period: RsPeriod
  label: string
  grid: ThemeGrid
  maxTotal: number
  hover: Hover | null
  onHover: (h: Hover) => void
}) {
  const dates = grid.dates
  const ticks = useMemo(() => spaceTicks(monthTicks(dates)), [dates])
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
            <div key={d} className="h-[22px] flex items-end" onMouseEnter={() => onHover({ period, group: '', date: d })}>
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
                const bg = cellColor(grid.cells.get(`${g.name}|${d}`) ?? 0)
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
