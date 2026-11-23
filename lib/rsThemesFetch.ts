import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import {
  HEATMAP_DAYS,
  MOMENTUM_LAGS,
  PERIODS,
  type RsPeriod,
  type RsThemeMember,
  type RsThemeRow,
  type ThemeGrid,
} from '@/types/rsThemes'

export type RsThemesSnapshot = {
  /** rs_themes の max(date)。今日の日付は使わない (休日・夜の更新前にずれるため) */
  date: string | null
  grids: Record<RsPeriod, ThemeGrid>
  members: RsThemeMember[]
  error: string | null
}

// 1 日 34 行 (17 グループ × 2 期間)。ヒートマップと 20 営業日前の比較の両方に足りる日数だけ取る。
const DAYS = Math.max(HEATMAP_DAYS, Math.max(...MOMENTUM_LAGS) + 1)
const ROWS_PER_DAY = 34

function emptyGrid(): ThemeGrid {
  return { dates: [], groups: [], cells: new Map(), totals: new Map() }
}

function buildGrid(rows: RsThemeRow[], period: RsPeriod, dates: string[]): ThemeGrid {
  const g = emptyGrid()
  g.dates = dates
  const keep = new Set(dates)
  const groups = new Map<string, number>()
  for (const r of rows) {
    if (Number(r.period) !== period || !keep.has(r.date)) continue
    groups.set(r.theme_group, r.group_order)
    g.cells.set(`${r.theme_group}|${r.date}`, r.n_stocks ?? 0)
    g.totals.set(r.date, r.n_total ?? 0)
  }
  g.groups = [...groups].map(([name, order]) => ({ name, order })).sort((a, b) => a.order - b.order)
  return g
}

export async function fetchRsThemesSnapshot(): Promise<RsThemesSnapshot> {
  const empty: RsThemesSnapshot = {
    date: null,
    grids: { 21: emptyGrid(), 63: emptyGrid() },
    members: [],
    error: null,
  }

  const { rows, error } = await fetchAllPaged<RsThemeRow>(
    (from, to) =>
      supabase
        .from('rs_themes')
        .select('date, period, theme_group, group_order, n_stocks, n_total')
        .order('date', { ascending: false })
        .order('period', { ascending: true })
        .order('theme_group', { ascending: true })
        .range(from, to),
    DAYS * ROWS_PER_DAY,
  )
  if (error) console.error('[rs_themes]', error)
  if (rows.length === 0) return { ...empty, error }

  const latest = rows[0].date
  // 降順で来るので、重複を除いて先頭 DAYS 日を取り、昇順に直す
  const dates: string[] = []
  for (const r of rows) {
    if (dates[dates.length - 1] !== r.date) dates.push(r.date)
    if (dates.length > DAYS) break
  }
  const asc = dates.slice(0, DAYS).reverse()

  const { data: mem, error: memError } = await supabase
    .from('rs_themes_members')
    .select('date, period, code, co_name, rs, ret_pct, turnover_oku, theme_groups, theme1, theme2, theme3')
    .eq('date', latest)
    .order('period', { ascending: true })
    .order('code', { ascending: true })
  if (memError) console.error('[rs_themes_members]', memError)

  const grids = {} as Record<RsPeriod, ThemeGrid>
  for (const p of PERIODS) grids[p.key] = buildGrid(rows, p.key, asc)

  return {
    date: latest,
    grids,
    members: ((mem ?? []) as RsThemeMember[]).map(m => ({ ...m, period: Number(m.period) as RsPeriod })),
    error: error ?? memError?.message ?? null,
  }
}
