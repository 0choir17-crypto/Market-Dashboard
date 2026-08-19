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
// 構造的に満点が届かない Q が 2 つある (どちらも最大 7、本来は 9):
//   1Q — 前 Q 同 FY が無く QoQ 計算不能 → s_eps / s_sales が各 1 点頭打ち
//   FY — 通期本決算そのものなので修正すべき通期予想が無い → s_guide が常に 0
// UI では "7/7" 表記にして「9 点満点に届いていない」誤解を防ぐ。
//
// FY (通期本決算, 2026-08-19 配信開始) は同じ列を別の意味で使う:
//   div_change_pct      期末の配当上積み (実績年間配当 vs 同 FY 直近予想)
//   div_yoy_pct         実績年間配当の前期比      ← FY 専用
//   op_beat_pct         着地 beat (実績 OP vs 同 FY 直近予想) ← FY 専用
//   nx_op_growth_pct    翌期 OP 予想の伸び        ← FY 専用・スコア非対象
//   fop_rev_pct / progress_excess_pct は FY では常に NULL
//
// rank_in_day / pct_rank_in_day は「日 × Q グループ (1Q / 2Q3Q / FY)」単位。
//   最大点が 7 / 9 / 7 と揃わないため同一プールで percentile を取ると 1Q・FY が
//   恒常的に不利になる。結果、同じ日に rank_in_day = 1 の行が最大 3 行存在する。

export type CurPerType = '1Q' | '2Q' | '3Q' | 'FY' | string

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
  // *_yoy_pct は「単Q の前年同期比 %」(累計比ではない) / *_qoq_pct は「前期単Q比 %」
  eps_yoy_pct: number | null
  eps_qoq_pct: number | null
  sales_yoy_pct: number | null
  sales_qoq_pct: number | null
  fop_rev_pct: number | null          // FY は常に NULL (修正対象の通期予想が無い)
  progress_excess_pct: number | null  // FY は常に NULL (進捗という概念が無い)

  // ── FY 専用 (1Q-3Q は常に NULL) ────────────────────────────────────────
  div_yoy_pct: number | null       // 実績年間配当の前期比 %
  op_beat_pct: number | null       // 当期実績 OP ÷ 同 FY 直近予想 − 1 (着地 beat)
  nx_op_growth_pct: number | null  // 翌期 OP 予想 ÷ 当期実績 OP − 1 (スコア非対象)

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
// 1Q は QoQ 2軸が構造的に NULL、FY は s_guide が構造的に 0 → どちらも上限 7
export const SCORE3_MAX_CAPPED = 7

// 色の境界 (0-9 スケール): 満点 / 強 7-8 / 中 4-6 / 弱 0-3
export const SCORE3_STRONG = 7
export const SCORE3_MID = 4

// 集中日 (events_in_day >= 100) → 検証で Top の質が高い
export const PEAK_DAY_THRESHOLD = 100

// 当日 Q別 Top 1% → 検証で end_per_risk 1.131 / +20%到達 28.9% (⭐)
export const TOP_1PCT_THRESHOLD = 1.0

// 到達可能な最大点。1Q / FY は 7、2Q / 3Q は 9。
// 絶対値の閾値 (score3 >= 8 等) で絞ると 1Q と FY が全滅するので、必ずこの関数で
// 割った相対値 (score3 / max) で判定すること。
export function maxScoreFor(curPerType: CurPerType): number {
  return curPerType === '1Q' || curPerType === 'FY' ? SCORE3_MAX_CAPPED : SCORE3_MAX
}

// QoQ (前期単Q比) が計算できるか。1Q は前 Q 同 FY が無いので不能。
// (前 FY の 4Q と比較する案は供給側の検証でエッジゼロと判明し、意図的に未実装)
export function hasQoq(curPerType: CurPerType): boolean {
  return curPerType !== '1Q'
}

// 通期予想修正軸 (s_guide) が評価対象か。FY は本決算そのもので常に 0。
export function hasGuideAxis(curPerType: CurPerType): boolean {
  return curPerType !== 'FY'
}

// ランキングの粒度: rank_in_day / pct_rank_in_day は日 × この Q グループ単位。
// 上限点が違う 1Q / FY を 2Q3Q と同じプールに入れないため 3 群に分かれている。
export type QGroup = '1Q' | '2Q3Q' | 'FY'

export function qGroupOf(curPerType: CurPerType): QGroup {
  if (curPerType === '1Q') return '1Q'
  if (curPerType === 'FY') return 'FY'
  return '2Q3Q'
}

// 表示順・フィルタ順に使う Q の並び
export const CUR_PER_TYPES: readonly CurPerType[] = ['1Q', '2Q', '3Q', 'FY'] as const

// 期の新旧順序 (大きいほど新しい)。決算を延期していた企業が同日に 1Q〜FY を
// まとめて開示することがあり (PK が (date, code, cur_per_type) なので別行になる)、
// 「1 銘柄 1 行」に集約する際の代表選びに使う。未知の Q は 0 で最下位。
export function curPerTypeRank(curPerType: CurPerType): number {
  const i = CUR_PER_TYPES.indexOf(curPerType)
  return i < 0 ? 0 : i + 1
}

// score3 バッジ色: 満点=濃緑, 7-8=緑, 4-6=黄, 0-3=灰
// 1Q / FY は max=7 のため 7 が満点扱いになり「強」帯は構造的に発生しない。
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
//   1Q — QoQ が無いため s_eps / s_sales が各 1 点頭打ち → 3+1+1+2 = 7
//   FY — s_guide が構造的に 0 → 3+2+2+0 = 7
// 構造的に取れない軸は "0/2" ではなく "対象外" と出す (取り逃したように見せない)。
export function score3Breakdown(row: EarningsQualityRow): string {
  const qoqMax = hasQoq(row.cur_per_type) ? 2 : 1
  const part = (label: string, v: number | null | undefined, max: number) =>
    `${label} ${v == null || !Number.isFinite(v) ? '—' : v}/${max}`
  return [
    part(row.cur_per_type === 'FY' ? '配当上積み' : '配当', row.s_div, 3),
    part('EPS', row.s_eps, qoqMax),
    part('売上', row.s_sales, qoqMax),
    hasGuideAxis(row.cur_per_type) ? part('予想', row.s_guide, 2) : '予想 対象外 (FY)',
  ].join(' ・ ')
}

// ── 旧スコア行 (v2 バックフィル前) の判定 ────────────────────────────────
// 供給側を再実行するまで過去分は旧 0-7 スコアのまま残る。s_guide が NULL の行が
// それ。select('*') 取得なので、Supabase 側の ALTER TABLE 未実行だと s_guide の
// キー自体が存在しない → 「全行が旧スコア」と誤検知しないよう区別する。
export type ScoreDataState = 'ok' | 'mixed' | 'legacy' | 'column-missing'

export function isLegacyScoreRow(row: EarningsQualityRow): boolean {
  // FY は v2 より後 (2026-08-19) に配信開始なので旧スコアの FY 行は存在しない。
  // 供給側が FY の s_guide を 0 ではなく NULL で入れてきても誤検知しないよう除外。
  if (row.cur_per_type === 'FY') return false
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
// 決算開示は時期偏重 (5月=本決算/FY, 8月=1Q, 11月=2Q, 2月=3Q がピーク。3月期決算
// 企業基準)。2026-08-19 に FY が配信対象へ加わったので 5 月も対象月になった。
// それでもピークの翌月にあたる 3 / 6 / 9 / 12 月は新規開示がほぼ無い閑散期。
// earnings_quality テーブルは「直近開示日」のデータが残るため、ユーザーが
// 「今日のデータ」と誤読しないよう、鮮度バッジで明示する。

// 閑散期月: 3 / 6 / 9 / 12 月 (0-indexed: 2,5,8,11)
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
