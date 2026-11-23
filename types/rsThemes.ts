// RS Themes — 強い銘柄 (RS 上位 約 2%) がどのテーマグループに集まっているか。
// 配信: jquants-scanner scripts/daily/rs_themes.py → rs_themes / rs_themes_members

export type RsPeriod = 21 | 63

export const PERIODS: { key: RsPeriod; label: string }[] = [
  { key: 21, label: '21d' },
  { key: 63, label: '63d' },
]

/** ヒートマップに出す営業日数 (≒ 直近 6 か月)。データは約 1 年分ある。 */
export const HEATMAP_DAYS = 126

/** Theme Momentum の比較対象 (並んだ行の n 個前)。 */
export const MOMENTUM_LAGS = [5, 20] as const

/**
 * 21d vs 63d の区切り (割合の差, pt)。
 * (21 日の n_stocks ÷ n_total − 63 日の n_stocks ÷ n_total) × 100 が
 * +この値以上で Emerging、−この値以下で Fading。
 */
export const DIVERGENCE_PT = 5

/** テーマが付いていない銘柄の集まり。表示はするが、増減の並びと Emerging / Fading の判定からは外す。 */
export const OTHER_GROUP = 'その他'

/** rs_themes: テーマグループ × 日 × 期間。0 件のグループも行がある。 */
export type RsThemeRow = {
  date: string
  period: RsPeriod
  theme_group: string
  group_order: number
  n_stocks: number
  n_total: number
}

/** rs_themes_members: 銘柄 × 日 × 期間。 */
export type RsThemeMember = {
  date: string
  period: RsPeriod
  code: string
  co_name: string | null
  rs: number | null
  ret_pct: number | null
  turnover_oku: number | null
  theme_groups: string[] | null
  theme1: string | null
  theme2: string | null
  theme3: string | null
}

/** 1 期間ぶんの格子。dates は昇順、groups は group_order 順。 */
export type ThemeGrid = {
  dates: string[]
  groups: { name: string; order: number }[]
  /** key = `${group}|${date}` */
  cells: Map<string, number>
  /** date → n_total */
  totals: Map<string, number>
}
