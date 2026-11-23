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

/** Leader Ribbon: その日の最多の n_stocks がこれ未満なら「主役なし」(灰色)。 */
export const RIBBON_MIN_LEADER = 3

/** Theme Lines: 表示期間に 21d も 63d も一度もこの件数以上にならなかったテーマは Minor themes に畳む。 */
export const MINOR_THEME_MAX = 5

/**
 * Heatmap の色の段階 (21d / 63d 共通)。各段の下限の件数。
 * 0 = 無色 / 1〜2 = ごく薄い灰色 / 3〜5 / 6〜10 / 11〜20 / 21 以上 で段階的に濃く。
 */
export const HEAT_STEPS: { min: number; label: string; color: string }[] = [
  { min: 1, label: '1–2', color: 'var(--heat-gray)' },
  { min: 3, label: '3–5', color: 'var(--heat-g-1)' },
  { min: 6, label: '6–10', color: 'var(--heat-g-2)' },
  { min: 11, label: '11–20', color: 'var(--heat-g-3)' },
  { min: 21, label: '21+', color: 'var(--heat-g-4)' },
]

/**
 * テーマグループごとの固定の色 (Leader Ribbon / Theme Lines / 凡例で共通)。「その他」は使わない。
 * 16 色は色覚の違いで見分けきれない組がある (8 色が上限) ので、色だけに頼らず
 * 凡例・グラフの見出し・ツールチップでテーマ名を必ず出す。
 */
export const THEME_COLORS: Record<string, string> = {
  '半導体・電子': '#2a78d6',
  'セキュリティ': '#eb6834',
  'ソフト・IT': '#6250d6',
  '防衛・宇宙・造船': '#00909e',
  'エネルギー・電力': '#eda100',
  '素材': '#b0651a',
  '機械・ロボット': '#1baf7a',
  '自動車': '#e34948',
  '建設・不動産': '#7a8a00',
  '金融・商社': '#2b55b8',
  'ゲーム・IP': '#e87ba4',
  '外食・食品・日用品': '#008300',
  '小売・レジャー': '#b8336a',
  '医薬・医療': '#18a3c4',
  '人材・サービス': '#b07ad9',
  '物流・海運': '#a1458f',
}
/** 「その他」と、表にない名前に使う色。 */
export const OTHER_COLOR = '#8a9099'
/** Leader Ribbon の「主役なし」。 */
export const NO_LEADER_COLOR = '#dfe2e6'

export function themeColor(group: string): string {
  return THEME_COLORS[group] ?? OTHER_COLOR
}

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
