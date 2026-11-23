'use client'

// Leader Ribbon — 各日・各期間で n_stocks が最も多いテーマグループの色で塗る帯。
// 主役がいつ切り替わったかを最初に見せる。
//   「その他」は判定に入れない / 最多が RIBBON_MIN_LEADER 未満なら主役なし (灰色) / 同数は group_order の小さい方

import { useMemo, useState } from 'react'
import { monthTicks } from '@/components/leaders/heatmapUi'
import ChartTip, { TipRow, spaceTicks } from './ChartTip'
import {
  NO_LEADER_COLOR,
  OTHER_GROUP,
  PERIODS,
  RIBBON_MIN_LEADER,
  themeColor,
  type RsPeriod,
  type ThemeGrid,
} from '@/types/rsThemes'

type Rank = { group: string; n: number } | null
type Day = { date: string; total: number; first: Rank; second: Rank; leader: string | null }

function rankDays(grid: ThemeGrid): Day[] {
  const groups = grid.groups.filter(g => g.name !== OTHER_GROUP) // group_order 順
  return grid.dates.map(date => {
    const ranked = groups
      .map(g => ({ group: g.name, order: g.order, n: grid.cells.get(`${g.name}|${date}`) ?? 0 }))
      .sort((a, b) => b.n - a.n || a.order - b.order)
    const first = ranked[0] ? { group: ranked[0].group, n: ranked[0].n } : null
    const second = ranked[1] ? { group: ranked[1].group, n: ranked[1].n } : null
    return {
      date,
      total: grid.totals.get(date) ?? 0,
      first,
      second,
      leader: first && first.n >= RIBBON_MIN_LEADER ? first.group : null,
    }
  })
}

export default function LeaderRibbon({ grids }: { grids: Record<RsPeriod, ThemeGrid> }) {
  const [hover, setHover] = useState<{ period: RsPeriod; i: number } | null>(null)

  const days = useMemo(() => {
    const out = {} as Record<RsPeriod, Day[]>
    for (const p of PERIODS) out[p.key] = rankDays(grids[p.key])
    return out
  }, [grids])

  const dates = grids[21].dates.length >= grids[63].dates.length ? grids[21].dates : grids[63].dates
  const ticks = useMemo(() => spaceTicks(monthTicks(dates)), [dates])
  const n = Math.max(dates.length, 1)

  // 凡例: 帯に一度でも出たテーマだけ (group_order 順)
  const legend = useMemo(() => {
    const seen = new Set<string>()
    for (const p of PERIODS) for (const d of days[p.key]) if (d.leader) seen.add(d.leader)
    return grids[21].groups.filter(g => seen.has(g.name)).map(g => g.name)
  }, [days, grids])

  const hd = hover ? days[hover.period][hover.i] : null

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <h2 className="text-small font-medium text-[var(--text-primary)]">Leader Ribbon</h2>
      <p className="text-caption text-[var(--text-secondary)] mt-0.5 mb-3">
        その日いちばん強い銘柄が多いテーマ。{RIBBON_MIN_LEADER} 銘柄未満の日は主役なし (灰色)。
      </p>

      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="grid gap-y-1" style={{ gridTemplateColumns: `2.5rem minmax(0, 1fr)` }}>
          {PERIODS.map(p => (
            <RibbonRow key={p.key} label={p.label} days={days[p.key]} ticks={ticks} n={n}
              hoverI={hover?.period === p.key ? hover.i : null}
              onHover={i => setHover({ period: p.key, i })} />
          ))}
          {/* 月の目盛り */}
          <div />
          <div className="relative h-4">
            {ticks.map((t, i) =>
              t ? (
                <span key={i} className="absolute text-caption text-[var(--text-muted)] whitespace-nowrap" style={{ left: `${(i / n) * 100}%` }}>
                  {t}
                </span>
              ) : null,
            )}
          </div>
        </div>

        {hover && hd && (
          <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: '2.5rem' }}>
          <ChartTip x={(hover.i + 0.5) / n} top={hover.period === 21 ? 28 : 54}>
            <div className="text-[var(--text-primary)] font-medium mb-0.5">
              {hd.date}　{hover.period}d
            </div>
            {hd.leader && hd.first ? (
              <TipRow color={themeColor(hd.first.group)} label={`Leader: ${hd.first.group}`} value={`${hd.first.n} / ${hd.total}`} />
            ) : (
              <TipRow color={NO_LEADER_COLOR} label="No leader" value={`max ${hd.first?.n ?? 0} / ${hd.total}`} />
            )}
            {hd.second && (
              <TipRow color={themeColor(hd.second.group)} label={`2nd: ${hd.second.group}`} value={hd.second.n} />
            )}
          </ChartTip>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-caption text-[var(--text-secondary)]">
        {legend.map(g => (
          <span key={g} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: themeColor(g) }} />
            {g}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: NO_LEADER_COLOR }} />
          No leader
        </span>
      </div>
    </section>
  )
}

function RibbonRow({
  label,
  days,
  ticks,
  n,
  hoverI,
  onHover,
}: {
  label: string
  days: Day[]
  ticks: (string | null)[]
  n: number
  hoverI: number | null
  onHover: (i: number) => void
}) {
  return (
    <>
      <div className="text-caption font-medium text-[var(--text-secondary)] leading-[22px]">{label}</div>
      <div className="flex h-[22px]">
        {days.map((d, i) => (
          <div
            key={d.date}
            onMouseEnter={() => onHover(i)}
            className="h-full relative"
            style={{
              width: `${100 / n}%`,
              backgroundColor: d.leader ? themeColor(d.leader) : NO_LEADER_COLOR,
              boxShadow: hoverI === i ? 'inset 0 0 0 1.5px var(--text-primary)' : undefined,
            }}
          >
            {/* 月の区切りの薄い縦線 */}
            {ticks[i] && i > 0 && <span className="absolute left-0 top-0 bottom-0 w-px bg-[var(--bg-card)] opacity-70" />}
          </div>
        ))}
      </div>
    </>
  )
}
