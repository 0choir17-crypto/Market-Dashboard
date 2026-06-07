// Earnings Quality: 決算品質スキャナー結果
// Source table: earnings_quality
// PK: (date, code, cur_per_type)
//
// score3 = s_div + s_eps + s_sales
//   s_div   (0/2/3): +2 if div_change_pct > 0, +1 more if >= 10
//   s_eps   (0/1/2): +1 if eps_yoy_pct > 0, +1 if eps_qoq_pct > 0
//   s_sales (0/1/2): +1 if sales_yoy_pct > 0, +1 if sales_qoq_pct > 0
//
// Q1 は前 Q 同 FY が無く QoQ 計算不能 → 構造的最大 = 5 (本来 7)
//   → UI では Q1 を "5/5" 表記で誤解防止

export type CurPerType = '1Q' | '2Q' | '3Q' | string

export type EarningsQualityRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  scale_cat: string | null
  mkt: string | null
  disc_time: string | null
  cur_per_type: CurPerType

  score3: number
  s_div: number
  s_eps: number
  s_sales: number
  verdict: string | null

  div_change_pct: number | null
  eps_yoy_pct: number | null
  eps_qoq_pct: number | null
  sales_yoy_pct: number | null
  sales_qoq_pct: number | null
  fop_rev_pct: number | null
  progress_excess_pct: number | null

  close: number | null
  turnover_oku: number | null
  above_sma200: boolean | null

  rank_in_day: number | null
  pct_rank_in_day: number | null
  events_in_day: number | null
  updated_at: string | null
}

// Structural maxima
export const SCORE3_MAX = 7
export const SCORE3_MAX_Q1 = 5

// 集中日 (events_in_day >= 100) → 検証で Top の質が高い
export const PEAK_DAY_THRESHOLD = 100

// 当日 Top 1% → 検証で end_per_risk 1.509 (⭐)
export const TOP_1PCT_THRESHOLD = 1.0

export function maxScoreFor(curPerType: CurPerType): number {
  return curPerType === '1Q' ? SCORE3_MAX_Q1 : SCORE3_MAX
}

// score3 バッジ色: 7=濃緑, 5-6=緑, 3-4=黄, 0-2=灰
export function score3Color(
  score: number | null | undefined,
  curPerType?: CurPerType,
): { bg: string; text: string; border: string } {
  if (score == null || !Number.isFinite(score)) {
    return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' }
  }
  const max = curPerType ? maxScoreFor(curPerType) : SCORE3_MAX
  // Q1 で 5 は 7 相当の評価
  if (score === max && max === SCORE3_MAX) {
    return { bg: '#86efac', text: '#14532d', border: '#16a34a' }
  }
  if (score === max && max === SCORE3_MAX_Q1) {
    return { bg: '#86efac', text: '#14532d', border: '#16a34a' }
  }
  if (score >= 5) return { bg: '#dcfce7', text: '#15803d', border: '#86efac' }
  if (score >= 3) return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
  return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
}

// +%/-%/0 の色: 増配・YoY・QoQ・OP修正 共通
export function pctColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '#9ca3af'
  if (v >= 10) return '#15803d'
  if (v > 0) return '#16a34a'
  if (v < 0) return '#dc2626'
  return '#6b7280'
}

// 開示時刻が引け後 (15:00 以降) → 翌営業日 D+1 寄り対象
export function isAfterClose(discTime: string | null): boolean {
  if (!discTime) return false
  const m = /^(\d{1,2}):(\d{2})/.exec(discTime)
  if (!m) return false
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  return h > 15 || (h === 15 && min >= 0)
}
