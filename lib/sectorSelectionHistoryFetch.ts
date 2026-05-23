import { supabase } from '@/lib/supabase'

export type SectorHistoryRow = {
  date: string
  sector_name_s33: string
  composite_score: number | null
  composite_score_rank: number | null
  component_rs: number | null
  sector_rs_acc_s33: number | null
}

export type SectorHistoryResponse = {
  // Sorted ascending (oldest → newest), at most `days` entries.
  dates: string[]
  // sector_name → date → row (sparse: missing days are omitted)
  bySector: Record<string, Record<string, SectorHistoryRow>>
  // Convenience: list of unique sector names (sorted by composite_score on the latest date, desc)
  sectorsRanked: string[]
}

const TABLE = 'sector_selection_s33'
const COLS = `
  date, sector_name_s33,
  composite_score, composite_score_rank,
  component_rs, sector_rs_acc_s33
`

// Fetch the most recent N business days for all 33 sectors.
// We pull enough rows to cover ~N business days (N * 33 + margin) and then
// trim to the unique latest N dates server-side. Two-phase to avoid pulling
// excess history when N is small.
export async function fetchSectorSelectionHistory(
  days = 21,
): Promise<SectorHistoryResponse> {
  // Phase 1: discover the latest N unique dates.
  const { data: dateRows, error: dateErr } = await supabase
    .from(TABLE)
    .select('date')
    .order('date', { ascending: false })
    .limit(days * 40) // 33 sectors + cushion

  if (dateErr || !dateRows || dateRows.length === 0) {
    return { dates: [], bySector: {}, sectorsRanked: [] }
  }

  const uniqueDates = [...new Set(dateRows.map(r => r.date as string))]
  uniqueDates.sort((a, b) => (a > b ? -1 : 1))
  const targetDates = uniqueDates.slice(0, days)
  if (targetDates.length === 0) {
    return { dates: [], bySector: {}, sectorsRanked: [] }
  }
  const minDate = targetDates[targetDates.length - 1]

  // Phase 2: pull all rows in that date range.
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLS)
    .gte('date', minDate)
    .order('date', { ascending: true })

  if (error || !data) {
    return { dates: [], bySector: {}, sectorsRanked: [] }
  }

  const rows = data as unknown as SectorHistoryRow[]
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
  }
}
