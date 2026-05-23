// Structure Pivot Tab — types mirroring `daily_structure_pivot_screen` schema
// (Phase 2 / 0choir17-crypto/21-Cloudl-Database).

export type StructurePivotSignalType = 'SETUP_LONG' | 'HL_BREAK'

export type StructurePivotTier = 'S' | 'A' | 'B'

export type StructurePivotRow = {
  date: string
  code: string
  name: string | null
  sector_s33: string | null

  // Pivot 主軸
  signal_type: StructurePivotSignalType
  pivot_price: number | null
  pivot_curr: number | null
  break_dist_pct: number | null
  days_in_setup: number | null

  // VCP コンテキスト
  vcp_days_since: number | null
  vcp_hit_date: string | null
  vcp_within_21d: boolean | null

  // Cross-screen 状態
  daily_signals_screens: string | null
  daily_signals_last_hit: string | null
  daily_signals_days_since: number | null
  in_watchlist: boolean | null

  // 価格・指標
  close: number | null
  volume: number | null
  rvol: number | null
  adr_pct: number | null
  cockpit_rs: number | null
  vcs_score: number | null
  mc_v4: number | null
  regime: string | null

  // Quality tier
  is_premium: boolean | null
  is_standard: boolean | null
  quality_tier: StructurePivotTier

  // Phase 4 v1.4 — Screen B (Institutional accumulation)
  jq_institutional_pass: boolean | null
  jq_institutional_reason: StructurePivotReason | null
}

export type StructurePivotReasonOp =
  | '>='
  | '>'
  | '<='
  | '<'
  | 'in'
  | 'not_in_[0,thr-1]'

export type StructurePivotReasonItem = {
  passed: boolean
  value: number | string | null
  threshold: number | string | (number | string)[]
  op: StructurePivotReasonOp
}

export type StructurePivotReason = {
  eps_growth_yoy?: StructurePivotReasonItem
  revenue_growth_yoy?: StructurePivotReasonItem
  section_ft_buyweeks_4w?: StructurePivotReasonItem
  sector_rs_21d?: StructurePivotReasonItem
  sector_momentum?: StructurePivotReasonItem
  disc_guard?: StructurePivotReasonItem
}

export type StructurePivotSummary = {
  total: number
  by_tier: Record<StructurePivotTier, number>
  by_signal: Record<StructurePivotSignalType, number>
}

export type StructurePivotResponse = {
  date: string | null
  rows: StructurePivotRow[]
  summary: StructurePivotSummary
}

export type StructurePivotQuery = {
  date?: string
  tier?: StructurePivotTier | 'all'
  signal?: StructurePivotSignalType | 'all'
  institutionalOnly?: boolean
  limit?: number
}
