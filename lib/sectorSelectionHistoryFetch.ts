import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'

export type SectorHistoryRow = {
  date: string
  sector_name_s33: string
  composite_score: number | null
  composite_score_rank: number | null
  // RRG 軸: component_rs = RS ランク (0-100), component_acc = RS加速度ランク (50=中立)。
  // sector_rs_acc_s33 は 0.xx 単位の生の加速度 (0-100 でも 50 中立でもない) なので RRG には使わない。
  component_rs: number | null
  component_acc: number | null
  sector_rs_acc_s33: number | null
}

export type SectorHistoryResponse = {
  // Sorted ascending (oldest → newest), at most `days` entries.
  dates: string[]
  // sector_name → date → row (sparse: missing days are omitted)
  bySector: Record<string, Record<string, SectorHistoryRow>>
  // Convenience: list of unique sector names (sorted by composite_score on the latest date, desc)
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
  // select('*') で退役/改名された列があっても落ちないようにする (sector_rs_acc_s33 等)。
  const { rows: dataRows, error } = await fetchAllPaged<Record<string, unknown>>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('*')
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

  // Rank sectors by latest composite_score (desc) for stable display order.
  const latestDate = targetDates[0]
  const sectorsRanked = Object.keys(bySector).sort((a, b) => {
    const av = bySector[a][latestDate]?.composite_score ?? -Infinity
    const bv = bySector[b][latestDate]?.composite_score ?? -Infinity
    return bv - av
  })

  return {
    dates: [...targetDates].reverse(), // ascending
    bySector,
    sectorsRanked,
    error: null,
  }
}
