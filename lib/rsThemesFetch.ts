import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import {
  HEATMAP_DAYS,
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

// 1 日 51 行 (17 グループ × 3 期間)。表示する日数だけ取る。
const DAYS = HEATMAP_DAYS
const ROWS_PER_DAY = 17 * PERIODS.length

// ── 取得した値の形をそろえる ─────────────────────────────────────────
// テーブルの型が変わっても (numeric が文字列で来る、text[] が "{a,b}" の文字列で来る、
// date が時刻つきで来るなど) 画面が落ちないよう、使う前にここで直す。
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function day(v: unknown): string {
  return String(v ?? '').slice(0, 10)
}

function str(v: unknown): string | null {
  return v == null || v === '' ? null : String(v)
}

function textArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(x => x != null && x !== '').map(String)
  if (typeof v === 'string') {
    const t = v.trim().replace(/^\{|\}$/g, '')
    return t ? t.split(',').map(x => x.trim().replace(/^"|"$/g, '')).filter(Boolean) : []
  }
  return []
}

function isPeriod(v: number | null): v is RsPeriod {
  return v === 21 || v === 63 || v === 126
}

function normRow(r: Record<string, unknown>): RsThemeRow | null {
  const period = num(r.period)
  if (!isPeriod(period)) return null
  return {
    date: day(r.date),
    period,
    theme_group: String(r.theme_group ?? ''),
    group_order: num(r.group_order) ?? 99,
    n_stocks: num(r.n_stocks) ?? 0,
    n_total: num(r.n_total) ?? 0,
  }
}

function normMember(m: Record<string, unknown>): RsThemeMember | null {
  const period = num(m.period)
  if (!isPeriod(period) || m.code == null) return null
  const groups = textArray(m.theme_groups)
  return {
    date: day(m.date),
    period,
    code: String(m.code),
    co_name: str(m.co_name),
    rs: num(m.rs),
    ret_pct: num(m.ret_pct),
    turnover_oku: num(m.turnover_oku),
    theme_groups: groups.length ? groups : ['その他'],
    theme1: str(m.theme1),
    theme2: str(m.theme2),
    theme3: str(m.theme3),
  }
}

function emptyGrid(): ThemeGrid {
  return { dates: [], groups: [], cells: new Map(), totals: new Map() }
}

function buildGrid(rows: RsThemeRow[], period: RsPeriod, dates: string[]): ThemeGrid {
  const g = emptyGrid()
  g.dates = dates
  const keep = new Set(dates)
  const groups = new Map<string, number>()
  for (const r of rows) {
    if (r.period !== period || !keep.has(r.date)) continue
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
    grids: { 21: emptyGrid(), 63: emptyGrid(), 126: emptyGrid() },
    members: [],
    error: null,
  }

  const { rows: raw, error } = await fetchAllPaged<Record<string, unknown>>(
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
  const rows = raw.map(normRow).filter((r): r is RsThemeRow => r !== null)
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
    .select('*')
    .eq('date', latest)
    .order('period', { ascending: true })
    .order('code', { ascending: true })
  if (memError) console.error('[rs_themes_members]', memError)

  const grids = {} as Record<RsPeriod, ThemeGrid>
  for (const p of PERIODS) grids[p.key] = buildGrid(rows, p.key, asc)

  return {
    date: latest,
    grids,
    members: ((mem ?? []) as Record<string, unknown>[]).map(normMember).filter((m): m is RsThemeMember => m !== null),
    error: error ?? memError?.message ?? null,
  }
}
