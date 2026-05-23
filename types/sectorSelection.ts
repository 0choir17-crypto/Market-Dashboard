// TOPIX-33 sector selection: composite score model
// Source table: sector_selection_s33  (PK: date + sector_name_s33)

export type SectorMomentum = 'leading' | 'neutral' | 'lagging'

export type SectorSelectionRow = {
  date: string
  sector_name_s33: string
  sector_code_s33: string | null

  composite_score: number | null
  composite_score_rank: number | null

  // 5 components (0-100)
  component_rs: number | null
  component_acc: number | null
  component_breadth: number | null
  component_flow: number | null
  component_short: number | null

  // Raw / contextual fields used in tooltip / future drilldown
  sector_rs_21d_s33: number | null
  sector_rs_63d_s33: number | null
  sector_rs_acc_s33: number | null
  sector_er_21d_s33: number | null
  sector_momentum_s33: SectorMomentum | null
  sector_pct_above_50ma_s33: number | null
  sector_pct_above_200ma_s33: number | null
  sector_pct_near_52w_high_s33: number | null
  sector_pct_vcs80_s33: number | null
  sector_pct_ma_stack_s33: number | null
  sector_pct_positive_momentum_s33: number | null
  sector_vcs_median_s33: number | null
  sector_inst_net_flow_s33: number | null
  sector_inst_net_flow_rank_s33: number | null
  sector_short_va_ratio_5d_s33: number | null
  sector_short_sell_ratio_bd_s33: number | null
  sector_stock_count_s33: number | null
  confidence_low: number | null
}

// Composite score weights (must mirror DB-side formula)
export const COMPONENT_WEIGHTS = {
  component_rs:       0.30,
  component_acc:      0.15,
  component_breadth:  0.25,
  component_flow:     0.15,
  component_short:    0.15,
} as const

export type ComponentKey = keyof typeof COMPONENT_WEIGHTS

export const COMPONENT_META: { key: ComponentKey; label: string; tooltip: string }[] = [
  { key: 'component_rs',       label: 'RS',      tooltip: 'RS21d 相対強度ランク (0-100)' },
  { key: 'component_acc',      label: 'Acc',     tooltip: 'RS加速度ランク (50=中立, 21d-63d)' },
  { key: 'component_breadth',  label: 'Brd',     tooltip: 'セクター内の上昇銘柄比率 (0-100)' },
  { key: 'component_flow',     label: 'Flow',    tooltip: '機関投資家ネット買いランク (0-100)' },
  { key: 'component_short',    label: 'Sht',     tooltip: '空売り過熱の逆 — 踏み上げ余地 (0-100)' },
]

export const MOMENTUM_CONFIG: Record<SectorMomentum, { label: string; color: string; bg: string; emoji: string }> = {
  leading: { label: 'leading', color: '#16a34a', bg: '#dcfce7', emoji: '🟢' },
  neutral: { label: 'neutral', color: '#6b7280', bg: '#f3f4f6', emoji: '⚪' },
  lagging: { label: 'lagging', color: '#dc2626', bg: '#fee2e2', emoji: '🔴' },
}

// Composite score heatmap: red (low) → yellow (mid) → green (high)
export function compositeColor(score: number | null | undefined): {
  bg: string
  text: string
} {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { bg: '#f3f4f6', text: '#9ca3af' }
  }
  if (score >= 60) return { bg: '#dcfce7', text: '#15803d' }
  if (score >= 30) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#b91c1c' }
}

// Per-component bar color (mini bars + drilldown)
export function componentColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '#e5e7eb'
  if (value >= 70) return '#22c55e'
  if (value >= 40) return '#eab308'
  return '#ef4444'
}
