'use client'

// Theme Momentum — グループごとの今日の割合 (n_stocks ÷ n_total × 100) と、5 / 20 営業日前からの割合の増減 (pt)。
// n_total は日によって 18〜64 と大きく動くので、件数の増減だと全体が増えた日にどのテーマも一斉に増えて見える。
// 件数 (今日の n_stocks と件数の増減) は割合の横に小さく添える。
// rs_themes は営業日の行だけが入っているので、「並んだ行の 5 個前・20 個前」と比べる。
// 「その他」(テーマなし) は表示だけして、並び替えに関わらず一番下に置く。

import { useMemo, useState } from 'react'
import { Segmented } from '@/components/leaders/heatmapUi'
import SortTh, { compareValues, type SortDirection } from '@/components/shared/SortTh'
import { MOMENTUM_LAGS, OTHER_GROUP, PERIODS, type RsPeriod, type ThemeGrid } from '@/types/rsThemes'

type SortKey = 'group' | 'today' | 'd5' | 'd20'

type Change = { pt: number; n: number } | null

type Row = { group: string; order: number; todayPct: number; todayN: number; d5: Change; d20: Change }

function at(grid: ThemeGrid, group: string, idx: number): { n: number; pct: number } {
  const d = grid.dates[idx]
  const n = grid.cells.get(`${group}|${d}`) ?? 0
  const t = grid.totals.get(d) ?? 0
  return { n, pct: t > 0 ? (n / t) * 100 : 0 }
}

function change(grid: ThemeGrid, group: string, lag: number): Change {
  const i = grid.dates.length - 1
  if (i - lag < 0) return null
  const now = at(grid, group, i)
  const then = at(grid, group, i - lag)
  return { pt: now.pct - then.pct, n: now.n - then.n }
}

const sign = (v: number, digits = 0) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`

function ChangeCell({ v }: { v: Change }) {
  if (v == null) return <span className="text-[var(--sem-idle-fg)]">—</span>
  const r = Math.round(v.pt * 10) / 10
  const cls = r > 0 ? 'text-[var(--positive)]' : r < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-muted)]'
  return (
    <span className="num whitespace-nowrap">
      <span className={cls}>{sign(r, 1)}</span>
      <span className="ml-1.5 text-caption text-[var(--text-muted)]">({sign(v.n)})</span>
    </span>
  )
}

export default function ThemeMomentum({ grids }: { grids: Record<RsPeriod, ThemeGrid> }) {
  const [period, setPeriod] = useState<RsPeriod>(21)
  const [sortKey, setSortKey] = useState<SortKey>('d5')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  const grid = grids[period]
  const [lag5, lag20] = MOMENTUM_LAGS

  const rows = useMemo(() => {
    const i = grid.dates.length - 1
    const out: Row[] = grid.groups.map(g => {
      const now = i >= 0 ? at(grid, g.name, i) : { n: 0, pct: 0 }
      return {
        group: g.name,
        order: g.order,
        todayPct: now.pct,
        todayN: now.n,
        d5: change(grid, g.name, lag5),
        d20: change(grid, g.name, lag20),
      }
    })
    const val = (r: Row) =>
      sortKey === 'group' ? r.order : sortKey === 'today' ? r.todayPct : (r[sortKey]?.pt ?? null)
    return out.sort((a, b) => {
      const ao = a.group === OTHER_GROUP
      const bo = b.group === OTHER_GROUP
      if (ao !== bo) return ao ? 1 : -1
      return compareValues(val(a), val(b), sortDir) || a.order - b.order
    })
  }, [grid, sortKey, sortDir, lag5, lag20])

  const total = grid.totals.get(grid.dates[grid.dates.length - 1] ?? '') ?? 0

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'group' ? 'asc' : 'desc')
    }
  }

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-small font-medium text-[var(--text-primary)]">Theme Momentum</h2>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">
            対象銘柄数に対する割合と、{lag5} / {lag20} 営業日前からの割合の増減（pt）。括弧内は件数。今日の対象銘柄数{' '}
            <span className="num">{total}</span>
          </p>
          <p className="text-caption text-[var(--text-muted)] mt-0.5">
            1 銘柄が複数のテーマに入るため、割合の合計は 100% になりません。
          </p>
        </div>
        <Segmented
          label="Period"
          value={String(period)}
          onChange={v => setPeriod(Number(v) as RsPeriod)}
          options={PERIODS.map(p => ({ key: String(p.key), label: p.label }))}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b-[0.5px] border-[var(--border)]">
              <SortTh label="Theme" sortKey="group" currentKey={sortKey} currentDir={sortDir} onSort={onSort} align="left" />
              <SortTh label="Today %" tooltip="今日の割合（n_stocks ÷ n_total × 100）。括弧内は銘柄数" sortKey="today" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortTh label={`Δ${lag5}d (pt)`} tooltip={`${lag5} 営業日前からの割合の増減（pt）。括弧内は銘柄数の増減`} sortKey="d5" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortTh label={`Δ${lag20}d (pt)`} tooltip={`${lag20} 営業日前からの割合の増減（pt）。括弧内は銘柄数の増減`} sortKey="d20" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.group} className="border-b-[0.5px] border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)]">
                <td className={`px-2.5 py-2 ${r.group === OTHER_GROUP ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                  {r.group}
                </td>
                <td className="px-2.5 py-2 text-right num whitespace-nowrap">
                  <span className="text-[var(--text-primary)]">{r.todayPct.toFixed(1)}</span>
                  <span className="ml-1.5 text-caption text-[var(--text-muted)]">({r.todayN})</span>
                </td>
                <td className="px-2.5 py-2 text-right"><ChangeCell v={r.d5} /></td>
                <td className="px-2.5 py-2 text-right"><ChangeCell v={r.d20} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
