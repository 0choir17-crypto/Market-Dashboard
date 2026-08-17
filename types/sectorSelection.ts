// TOPIX-33 sector selection: composite score model
// Source table: sector_selection_s33  (PK: date + sector_name_s33)

export type SectorMomentum = 'leading' | 'neutral' | 'lagging'

export type SectorSelectionRow = {
  date: string
  sector_name_s33: string
  sector_code_s33: string | null

  composite_score: number | null
  composite_score_rank: number | null

  // 4 components (0-100) — Flow は GCS に S33 業種別データが無いため廃止 (今後 NULL)
  component_rs: number | null
  component_acc: number | null
  component_breadth: number | null
  component_short: number | null
  // retired: GCS に S33 業種別データが無いため廃止 (今後 NULL)
  component_flow: number | null

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

  // ── ② 業種別指数の生 OHLC + リターン（指数ポイント。出来高なし）───────────
  // 直近150営業日のみ非null。それ以前は NULL（表示側で「—」にする）。
  sector_index_open_s33?: number | null
  sector_index_high_s33?: number | null
  sector_index_low_s33?: number | null
  sector_index_close_s33?: number | null
  // 期間リターン（倍率−1。0.067 = +6.7%。表示は ×100 で%化）
  sector_index_ret_5d_s33?: number | null
  sector_index_ret_21d_s33?: number | null
  sector_index_ret_63d_s33?: number | null
  sector_index_ret_126d_s33?: number | null
  // TOPIX超過リターン（生値。既存 sector_rs_*d_s33 はこれをランク化したもの）
  sector_index_excess_5d_s33?: number | null
  sector_index_excess_21d_s33?: number | null
  sector_index_excess_63d_s33?: number | null
  sector_index_excess_126d_s33?: number | null

  // ── ③ 業種別空売りの生内訳（short_selling 由来）──────────────────────────
  sector_sell_ex_short_va_s33?: number | null   // 空売り以外の実注文 売り代金（円）
  sector_shrt_with_res_va_s33?: number | null   // 価格規制有りの空売り代金（円）
  sector_shrt_no_res_va_s33?: number | null     // 価格規制無しの空売り代金（円）
  sector_short_va_ratio_s33?: number | null     // 当日の空売り比率（0〜1。×100 で%化）

  // ── ④ 業種別出来高（2026-08-17 追加。単位は「株」）────────────────────────
  // 2008-05-07 以降ほぼ全行 non-null。唯一の欠損は 2020-10-01（東証システム障害で
  // 終日売買不成立）の33業種すべて。表示側は NULL を「—」にしてエラーにしないこと。
  // Σ33業種 = market_conditions.market_volume（母集団を揃えてあるため完全一致）。
  // ⚠️ 生の株数は低位株1銘柄に支配されるため業種間の勢い比較には使わない。
  //    比較には平常比 (sector_volume_s33 / sector_volume_ma20_s33) を使う。
  sector_volume_s33?: number | null
  sector_volume_ma20_s33?: number | null
}

// Composite score weights — 4 成分に再正規化 (Flow 廃止)。DB 側の計算と一致させること。
// composite_score = Σ(component × weight)
export const COMPONENT_WEIGHTS = {
  component_rs:       0.353,
  component_acc:      0.176,
  component_breadth:  0.294,
  component_short:    0.176,
} as const

export type ComponentKey = keyof typeof COMPONENT_WEIGHTS

export const COMPONENT_META: { key: ComponentKey; label: string; tooltip: string }[] = [
  { key: 'component_rs',       label: 'RS',      tooltip: 'RS21d 相対強度ランク (0-100)' },
  { key: 'component_acc',      label: 'Acc',     tooltip: 'RS加速度ランク (50=中立, 21d-63d)' },
  { key: 'component_breadth',  label: 'Brd',     tooltip: 'セクター内の上昇銘柄比率 (0-100)' },
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
