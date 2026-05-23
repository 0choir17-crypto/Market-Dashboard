export interface Trade {
  id: number
  ticker: string
  company_name: string | null
  screen_name: string | null
  entry_date: string
  entry_price: number
  shares: number
  exit_date: string | null
  exit_price: number | null
  pnl: number | null
  pnl_pct: number | null
  result: 'WIN' | 'LOSS' | null
  mc_score: number | null
  mc_regime: string | null
  // 'v3' (0-21) or 'v4' (0-100). Default 'v3' for legacy rows captured before
  // the v4 cutover (2026-04-26). New trades default to 'v4'.
  mc_score_version?: 'v3' | 'v4' | null
  memo: string | null
  status: 'plan' | 'open' | 'closed'
  created_at: string
  updated_at: string

  // Portfolio統合用
  sector_s33: string | null
  stop_price: number | null
  stop_21l: number | null
  cost_basis: number | null
  init_risk_pct: number | null
  target_r: number | null
  exit_reason: string | null
  r_multiple: number | null

  // シグナルスナップショット
  signal_price: number | null
  rs_at_entry: number | null
  rvol_at_entry: number | null
  adr_at_entry: number | null
  dist_ema21_at_entry: number | null
  stop_pct_at_entry: number | null
  mc_met_at_entry: boolean | null
  mc_condition_at_entry: string | null

  // 振り返り (bigger P1)
  review_tags?: string[]
  lesson_learned?: string | null
  entry_reason?: string | null
  reviewed_at?: string | null

  // MFE / MAE (P2)
  mfe_price?: number | null
  mfe_date?: string | null
  mfe_pct?: number | null
  mae_price?: number | null
  mae_date?: string | null
  mae_pct?: number | null
}
