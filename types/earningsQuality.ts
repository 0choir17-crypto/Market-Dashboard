// Earnings Quality: 決算品質スキャナー結果
// Source table: earnings_quality
// PK: (date, code, cur_per_type)
//
// score3 = s_div + s_eps + s_sales + s_guide   (v2: 3軸 → 4軸, 0-7 → 0-9)
//   s_div   (0/2/3): +2 if div_change_pct > 0, +1 more if >= 10
//   s_eps   (0/1/2): +1 if eps_yoy_pct > 0, +1 if eps_qoq_pct > 0
//   s_sales (0/1/2): +1 if sales_yoy_pct > 0, +1 if sales_qoq_pct > 0
//   s_guide (0/1/2): 通期予想修正 (fop_rev_pct)
//
// Q1 は前 Q 同 FY が無く QoQ 計算不能 (s_eps / s_sales が各 1 点頭打ち)
//   → 構造的最大 = 7 (本来 9)。UI では Q1 を "7/7" 表記で誤解防止
//
// rank_in_day / pct_rank_in_day は v2 から「日 × Q グループ (1Q / 2Q3Q)」単位。
//   同じ日に rank_in_day = 1 の行が 2 行存在する。

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
  s_guide: number | null   // 0/1/2 通期予想修正軸 (v2 で追加 — 旧行は NULL)
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

// Structural maxima (v2: 4軸化で 7 → 9)
export const SCORE3_MAX = 9
export const SCORE3_MAX_Q1 = 7   // 1Q は QoQ 2軸が構造的に NULL

// 色の境界 (0-9 スケール): 満点 / 強 7-8 / 中 4-6 / 弱 0-3
export const SCORE3_STRONG = 7
export const SCORE3_MID = 4

// 集中日 (events_in_day >= 100) → 検証で Top の質が高い
export const PEAK_DAY_THRESHOLD = 100

// 当日 Q別 Top 1% → 検証で end_per_risk 1.131 / +20%到達 28.9% (⭐)
export const TOP_1PCT_THRESHOLD = 1.0

export function maxScoreFor(curPerType: CurPerType): number {
  return curPerType === '1Q' ? SCORE3_MAX_Q1 : SCORE3_MAX
}

// ランキングの粒度: rank_in_day / pct_rank_in_day は日 × この Q グループ単位
export type QGroup = '1Q' | '2Q3Q'

export function qGroupOf(curPerType: CurPerType): QGroup {
  return curPerType === '1Q' ? '1Q' : '2Q3Q'
}

// score3 バッジ色: 満点=濃緑, 7-8=緑, 4-6=黄, 0-3=灰
// 1Q は max=7 のため 7 が満点扱いになり「強」帯は構造的に発生しない。
export function score3Color(
  score: number | null | undefined,
  curPerType?: CurPerType,
): { bg: string; text: string; border: string } {
  if (score == null || !Number.isFinite(score)) {
    return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' }
  }
  const max = curPerType ? maxScoreFor(curPerType) : SCORE3_MAX
  if (score >= max) return { bg: '#86efac', text: '#14532d', border: '#16a34a' }
  if (score >= SCORE3_STRONG) return { bg: '#dcfce7', text: '#15803d', border: '#86efac' }
  if (score >= SCORE3_MID) return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
  return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
}

// ── スコア内訳 (Score バッジのツールチップ用) ────────────────────────────
// 軸ごとの最大: s_div 3 / s_eps 2 / s_sales 2 / s_guide 2 = 9
// 1Q は QoQ が無いため s_eps / s_sales が各 1 点頭打ち → 3+1+1+2 = 7
export function score3Breakdown(row: EarningsQualityRow): string {
  const isQ1 = row.cur_per_type === '1Q'
  const qoqMax = isQ1 ? 1 : 2
  const part = (label: string, v: number | null | undefined, max: number) =>
    `${label} ${v == null || !Number.isFinite(v) ? '—' : v}/${max}`
  return [
    part('配当', row.s_div, 3),
    part('EPS', row.s_eps, qoqMax),
    part('売上', row.s_sales, qoqMax),
    part('予想', row.s_guide, 2),
  ].join(' ・ ')
}

// ── 旧スコア行 (v2 バックフィル前) の判定 ────────────────────────────────
// 供給側を再実行するまで過去分は旧 0-7 スコアのまま残る。s_guide が NULL の行が
// それ。select('*') 取得なので、Supabase 側の ALTER TABLE 未実行だと s_guide の
// キー自体が存在しない → 「全行が旧スコア」と誤検知しないよう区別する。
export type ScoreDataState = 'ok' | 'mixed' | 'legacy' | 'column-missing'

export function isLegacyScoreRow(row: EarningsQualityRow): boolean {
  return 's_guide' in row && row.s_guide == null
}

export function classifyScoreData(rows: EarningsQualityRow[]): {
  state: ScoreDataState
  legacyCount: number
} {
  if (rows.length === 0) return { state: 'ok', legacyCount: 0 }
  if (!rows.some(r => 's_guide' in r)) {
    return { state: 'column-missing', legacyCount: rows.length }
  }
  const legacyCount = rows.filter(isLegacyScoreRow).length
  if (legacyCount === 0) return { state: 'ok', legacyCount }
  return { state: legacyCount === rows.length ? 'legacy' : 'mixed', legacyCount }
}

// +%/-%/0 の色: 増配・YoY・QoQ・OP修正 共通
export function pctColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '#9ca3af'
  if (v >= 10) return '#15803d'
  if (v > 0) return '#16a34a'
  if (v < 0) return '#dc2626'
  return '#6b7280'
}

// 開示時刻が引け後 (15:30 以降) → 翌営業日 D+1 寄り対象
// 東証現物の大引けは 2024-11-05 から 15:30 (それ以前は 15:00)
export function isAfterClose(discTime: string | null): boolean {
  if (!discTime) return false
  const m = /^(\d{1,2}):(\d{2})/.exec(discTime)
  if (!m) return false
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  return h > 15 || (h === 15 && min >= 30)
}

// ── 鮮度判定 ─────────────────────────────────────────────────────────────
// 決算開示は時期偏重 (8月=1Q ピーク, 11月=2Q, 2月=3Q, 5月=本決算)。
// 本スキャナーは 1Q-3Q のみ → 6月・9月・12月・3月は閑散期で新規開示ほぼ無し。
// earnings_quality テーブルは「直近開示日」のデータが残るため、ユーザーが
// 「今日のデータ」と誤読しないよう、鮮度バッジで明示する。

// 閑散期月 (1Q-3Q スキャナー視点): 3 / 6 / 9 / 12 月 (0-indexed: 2,5,8,11)
const QUIET_MONTHS = [2, 5, 8, 11] as const

export function isQuietMonth(d: Date = new Date()): boolean {
  return (QUIET_MONTHS as readonly number[]).includes(d.getMonth())
}

// ISO 'YYYY-MM-DD' → ローカル深夜の Date
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
}

// 営業日差 (土日のみスキップ。祝日は近似で考慮しない)。
// from < to で正、同日は 0、from > to は負。
export function businessDaysBetween(fromIso: string, to: Date = new Date()): number {
  const from = parseIsoDate(fromIso)
  if (!from) return 0
  const toMid = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  if (from.getTime() === toMid.getTime()) return 0
  const forward = from.getTime() < toMid.getTime()
  const [start, end] = forward ? [from, toMid] : [toMid, from]
  let count = 0
  const cur = new Date(start)
  while (cur.getTime() < end.getTime()) {
    cur.setDate(cur.getDate() + 1)
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return forward ? count : -count
}

export type FreshnessLevel = 'live' | 'fresh' | 'stale' | 'old'

export type Freshness = {
  level: FreshnessLevel
  bdays: number       // 営業日差 (from latestDate to today)
  inQuietMonth: boolean
  label: string
  hint: string
  bg: string
  text: string
  border: string
  icon: string
}

export function classifyFreshness(latestIso: string, now: Date = new Date()): Freshness {
  const bdays = businessDaysBetween(latestIso, now)
  const inQuietMonth = isQuietMonth(now)

  if (bdays <= 0) {
    return {
      level: 'live',
      bdays: 0,
      inQuietMonth,
      label: '本日 (LIVE)',
      hint: '本日の開示データ',
      bg: '#dcfce7',
      text: '#15803d',
      border: '#86efac',
      icon: '🟢',
    }
  }
  if (bdays === 1) {
    return {
      level: 'fresh',
      bdays,
      inQuietMonth,
      label: '1営業日前',
      hint: '前営業日の開示データ',
      bg: '#dcfce7',
      text: '#15803d',
      border: '#86efac',
      icon: '🟢',
    }
  }
  if (bdays <= 5) {
    return {
      level: 'stale',
      bdays,
      inQuietMonth,
      label: `${bdays}営業日前`,
      hint: '開示が無い日が続いています',
      bg: '#fef3c7',
      text: '#92400e',
      border: '#fde68a',
      icon: '🟡',
    }
  }
  return {
    level: 'old',
    bdays,
    inQuietMonth,
    label: `${bdays}営業日前`,
    hint: inQuietMonth
      ? '決算閑散期 (3/6/9/12 月) のため新規開示が無い時期です'
      : '長期間新規開示がありません — データ供給を確認してください',
    bg: '#fee2e2',
    text: '#b91c1c',
    border: '#fecaca',
    icon: '🔴',
  }
}
