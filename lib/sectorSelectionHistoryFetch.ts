import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import { bySelfT63 } from '@/types/sectorSelection'

export type SectorHistoryRow = {
  date: string
  sector_name_s33: string
  // 業種の自力の t 値。RRG の軸 (横 self_t63 / 縦 self_t21) と 5 営業日前との差に使う
  self_t21: number | null
  self_t63: number | null
}

export type SectorHistoryResponse = {
  // Sorted ascending (oldest → newest), at most `days` entries.
  dates: string[]
  // sector_name → date → row (sparse: missing days are omitted)
  bySector: Record<string, Record<string, SectorHistoryRow>>
  // Convenience: list of unique sector names (sorted by self_t63 on the latest date, desc / null last)
  sectorsRanked: string[]
  // Fetch failure message (null on success). Optional so existing callers'
  // initial-state literals keep compiling; the fetcher always sets it.
  error?: string | null
}

const TABLE = 'sector_selection_s33'

// Fetch the most recent N business days for all 33 sectors.
// We pull enough rows to cover ~N business days (N * 33 + margin) and then
// trim to the unique latest N dates server-side. Two-phase to avoid pulling
// excess history when N is small.
export async function fetchSectorSelectionHistory(
  days = 21,
): Promise<SectorHistoryResponse> {
  // Phase 1: discover the latest N unique dates. Supabase caps every response
  // at 1000 rows (~30 days × 33 sectors), so page with a stable total order
  // (date desc, sector asc) until the row budget covers N days.
  const { rows: dateRows, error: dateErr } = await fetchAllPaged<{ date: string }>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('date')
        .order('date', { ascending: false })
        .order('sector_name_s33', { ascending: true })
        .range(from, to),
    days * 40, // 33 sectors + cushion
  )

  if (dateErr || dateRows.length === 0) {
    if (dateErr) console.error('[sector_selection_s33 history/dates]', dateErr)
    return { dates: [], bySector: {}, sectorsRanked: [], error: dateErr }
  }

  const uniqueDates = [...new Set(dateRows.map(r => r.date))]
  uniqueDates.sort((a, b) => (a > b ? -1 : 1))
  const targetDates = uniqueDates.slice(0, days)
  if (targetDates.length === 0) {
    return { dates: [], bySector: {}, sectorsRanked: [], error: null }
  }
  const minDate = targetDates[targetDates.length - 1]

  // Phase 2: pull all rows in that date range. 63 days × 33 sectors ≈ 2079 行
  // なので、こちらも安定順序 (date asc, sector asc) で全件ページングする。
  // 使う列だけを読む (旧スコアの列は後日 DROP されるので名指ししない)。
  const { rows: dataRows, error } = await fetchAllPaged<Record<string, unknown>>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('date, sector_name_s33, self_t21, self_t63')
        .gte('date', minDate)
        .order('date', { ascending: true })
        .order('sector_name_s33', { ascending: true })
        .range(from, to),
  )

  if (error) {
    console.error('[sector_selection_s33 history]', error)
    return { dates: [], bySector: {}, sectorsRanked: [], error }
  }

  const rows = dataRows as unknown as SectorHistoryRow[]
  const bySector: Record<string, Record<string, SectorHistoryRow>> = {}
  for (const r of rows) {
    if (!r.sector_name_s33) continue
    if (!bySector[r.sector_name_s33]) bySector[r.sector_name_s33] = {}
    bySector[r.sector_name_s33][r.date] = r
  }

  // 最新日の self_t63 の高い順 (null は最後)
  const latestDate = targetDates[0]
  const sectorsRanked = Object.keys(bySector).sort((a, b) =>
    bySelfT63(
      { self_t63: bySector[a][latestDate]?.self_t63 ?? null },
      { self_t63: bySector[b][latestDate]?.self_t63 ?? null },
    ),
  )

  return {
    dates: [...targetDates].reverse(), // ascending
    bySector,
    sectorsRanked,
    error: null,
  }
}

/** 最新日 − N 営業日前の差 (self_t63 / self_t21)。どちらかが null の期間は入れない */
export type SelfDiff = { t63?: number; t21?: number }

/**
 * sector_name → 最新日の self_t63 / self_t21 − N 営業日前の値。
 * 日付は履歴にある営業日で数える。
 */
export function selfDiffs(
  history: SectorHistoryResponse,
  days = 5,
): Record<string, SelfDiff> {
  const { dates, bySector } = history
  const out: Record<string, SelfDiff> = {}
  if (dates.length <= days) return out
  const now = dates[dates.length - 1]
  const then = dates[dates.length - 1 - days]
  const fin = (v: number | null | undefined): v is number =>
    v !== null && v !== undefined && Number.isFinite(v)
  for (const [sector, byDate] of Object.entries(bySector)) {
    const a = byDate[now]
    const b = byDate[then]
    const d: SelfDiff = {}
    if (fin(a?.self_t63) && fin(b?.self_t63)) d.t63 = a.self_t63 - b.self_t63
    if (fin(a?.self_t21) && fin(b?.self_t21)) d.t21 = a.self_t21 - b.self_t21
    out[sector] = d
  }
  return out
}
