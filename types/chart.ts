export type OhlcvBar = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// One LL-HL setup phase, derived from chart_ohlcv_cache via:
//   GROUP BY struct_long_phase_start_date
// (See spec in 21-Cloudl-Database backend for exact column names.)
export type StructurePivotPhase = {
  phase_start_date: string         // active=true になった bar (winning length 切替時も新 phase)
  phase_end_date: string           // 同 phase の最終 active bar (= MAX(date))
  curr_pivot_price: number         // HL price (long)
  prev_pivot_price: number | null  // LL price (long) — Phase 初期は null
  curr_pivot_date: string | null   // HL 確定 bar (Pine: curr_idx)
  prev_pivot_date: string | null   // LL 確定 bar (Pine: prev_idx)
  break_val: number                // pivot break 水準
  length: number                   // 採用 length
  broke_at: string | null          // HL_BREAK 当日 (= struct_long_just_broke の bar) / null=未ブレイク
}

// Per-bar counter trend value (struct_long_counter_trend_val). Null bars create
// gaps in the continuous LineSeries.
export type CounterTrendBar = {
  date: string
  value: number | null
}

export type ChartApiResponse = {
  code: string
  ohlcv: OhlcvBar[]
  structurePivotPhases?: StructurePivotPhase[] | null
  counterTrend?: CounterTrendBar[] | null
  // future overlay slots — currently null but kept for forward-compat
  cockpit_rs?: { date: string; value: number }[] | null
  mc_v4?: { date: string; value: number }[] | null
}
