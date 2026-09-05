/** @deprecated — trades テーブルに統合済み。Trade型を使用すること */
export type Position = {
  id: string
  ticker: string
  company_name: string | null
  sector: string | null
  entry_date: string
  entry_price: number
  shares: number
  cost_basis: number | null
  stop_price: number | null
  stop_21l: number | null
  init_risk_pct: number | null
  target_r: number | null
  memo: string | null
  status: 'open' | 'closed' | 'plan'
  created_at: string
  updated_at: string
}

/** @deprecated — trades テーブルに統合済み。Trade型を使用すること */
export type TradeHistory = {
  id: string
  ticker: string
  company_name: string | null
  entry_date: string | null
  exit_date: string | null
  entry_price: number | null
  exit_price: number | null
  shares: number | null
  stop_price: number | null
  target_r: number | null
  realized_pnl: number | null
  r_multiple: number | null
  exit_reason: string | null
  memo: string | null
  created_at: string
}

export type RiskSettings = {
  id: string
  account_capital: number | null
  risk_pct: number | null
  max_positions: number | null
  monthly_dd_limit: number | null
  quarterly_dd_limit: number | null
  annual_dd_limit: number | null
  month_start_capital: number | null
  monthly_pnl: number | null
  consec_losses: number | null
  memo: string | null
  updated_at: string
}
