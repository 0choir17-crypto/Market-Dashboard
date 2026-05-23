export type VcpRegime =
  | 'strong_bull'
  | 'bull'
  | 'neutral'
  | 'bear'
  | 'strong_bear'
  | string

export type DailyVcpScreen = {
  date: string
  code: string

  name: string | null
  sector_s33: string | null

  // Tier 1
  close: number | null
  vcs_score: number | null
  vcs_days_tight: number | null
  cockpit_rs: number | null
  adr_pct: number | null
  turnover_50d_oku: number | null

  // Tier 2
  dist_sma50: number | null
  dist_sma200: number | null
  ma_stack: number | null

  // Tier 3
  daily_pct: number | null
  weekly_pct: number | null
  monthly_pct: number | null
  volume: number | null
  rvol: number | null
  pct_from_20d_high: number | null
  high_52w_pct: number | null

  // Tier 4
  regime: VcpRegime | null
  mc_v4: number | null

  inserted_at?: string | null
}
