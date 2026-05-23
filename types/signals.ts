export type DailySignal = {
  date: string
  code: string
  company_name: string | null
  screen_name: string
  sector_s33: string | null
  close: number | null
  price_chg_1d: number | null
  price_chg_5d: number | null
  rs_composite: number | null
  rvol: number | null
  adr_pct: number | null
  dist_ema21_r: number | null
  dist_10wma_r: number | null
  dist_50sma_r: number | null
  high_52w_pct: number | null
  stop_pct: number | null
  hit_count: number | null
  // Cockpit RS / Mansfield RS / 需給
  cockpit_rs?: number | null
  mansfield_rs?: number | null
  short_interest_ratio?: number | null
  short_position_change?: number | null
  // MC Score ソフトフィルター
  mc_met?: boolean | null
  mc_condition?: string | null
  // MC Score v3
  mc_score?: number | null
  mc_score_v1?: number | null
  divergence_flag?: number | null
}
