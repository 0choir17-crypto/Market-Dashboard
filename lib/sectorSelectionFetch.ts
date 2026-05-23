import { supabase } from '@/lib/supabase'
import { SectorSelectionRow } from '@/types/sectorSelection'

const SELECT_COLS = `
  date, sector_name_s33, sector_code_s33,
  composite_score, composite_score_rank,
  component_rs, component_acc, component_breadth, component_flow, component_short,
  sector_rs_21d_s33, sector_rs_63d_s33, sector_rs_acc_s33, sector_er_21d_s33,
  sector_momentum_s33,
  sector_pct_above_50ma_s33, sector_pct_above_200ma_s33, sector_pct_near_52w_high_s33,
  sector_pct_vcs80_s33, sector_pct_ma_stack_s33, sector_pct_positive_momentum_s33,
  sector_vcs_median_s33,
  sector_inst_net_flow_s33, sector_inst_net_flow_rank_s33,
  sector_short_va_ratio_5d_s33, sector_short_sell_ratio_bd_s33,
  sector_stock_count_s33, confidence_low
`

export type LatestSelection = {
  latestDate: string | null
  rows: SectorSelectionRow[]
}

// Fetch the latest available business day's full ranking.
// Strategy: pull the most recent ~50 rows ordered by date desc, then slice to the max date.
// (Avoids a second roundtrip for MAX(date).)
export async function fetchLatestSectorSelection(): Promise<LatestSelection> {
  const { data, error } = await supabase
    .from('sector_selection_s33')
    .select(SELECT_COLS)
    .order('date', { ascending: false })
    .order('composite_score', { ascending: false, nullsFirst: false })
    .limit(50)

  if (error || !data || data.length === 0) {
    return { latestDate: null, rows: [] }
  }

  const rows = data as unknown as SectorSelectionRow[]
  const latestDate = rows[0].date
  return {
    latestDate,
    rows: rows.filter(r => r.date === latestDate),
  }
}
