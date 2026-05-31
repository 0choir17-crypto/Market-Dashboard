import { supabase } from '@/lib/supabase'
import { SectorSelectionRow } from '@/types/sectorSelection'

export type LatestSelection = {
  latestDate: string | null
  rows: SectorSelectionRow[]
}

// Fetch the latest available business day's full ranking.
// Strategy: pull the most recent ~50 rows ordered by date desc, then slice to the max date.
// (Avoids a second roundtrip for MAX(date).)
//
// We use `select('*')` rather than an explicit column list so the query is
// resilient to供給側 (jquants-scanner) のスキーマ増減: 退役した列 (component_flow /
// sector_inst_net_flow_*) が DROP されても select 全体が落ちない。欠損列は
// undefined となり、表示側の null ガードで `--` になる。
export async function fetchLatestSectorSelection(): Promise<LatestSelection> {
  const { data, error } = await supabase
    .from('sector_selection_s33')
    .select('*')
    .order('date', { ascending: false })
    .order('composite_score', { ascending: false, nullsFirst: false })
    .limit(50)

  if (error || !data || data.length === 0) {
    if (error) console.error('[sector_selection_s33]', error)
    return { latestDate: null, rows: [] }
  }

  const rows = data as unknown as SectorSelectionRow[]
  const latestDate = rows[0].date
  return {
    latestDate,
    rows: rows.filter(r => r.date === latestDate),
  }
}
