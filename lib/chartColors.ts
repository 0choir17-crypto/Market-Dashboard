// チャートに渡す色の実値。
//
// ここだけが生の 16 進を持つ。SVG の presentation attribute（stroke="..." /
// fill="..."）と、canvas に描くライブラリ（lightweight-charts / Recharts）の
// 引数は `var()` を解釈しないため、トークンをそのまま渡せない。
// DOM の style / className に入れる色は var() が効くので、ここを使わずに
// `var(--sem-...)` を直接書くこと。
//
// 値は app/globals.css の同名トークンと一致させる。globals.css を変えたら
// この表も直す（対応はコメントで示す）。

/** globals.css のトークンと 1:1 で対応する値。 */
export const CHART = {
  border: '#e6e8eb', // --border
  borderStrong: '#d1d5db', // --border-strong
  borderSubtle: '#f0f1f3', // --border-subtle
  ground: '#f6f7f9', // --bg-primary
  card: '#ffffff', // --bg-card
  textPrimary: '#1a1d23', // --text-primary
  textSecondary: '#6b7280', // --text-secondary
  textMuted: '#9ca3af', // --text-muted
  positive: '#16a34a', // --positive
  negative: '#dc2626', // --negative
  strongFg: '#15803d', // --sem-strong-fg
  strongBg: '#dcfce7', // --sem-strong-bg
  strongBd: '#86efac', // --sem-strong-bd
  watchFg: '#92400e', // --sem-watch-fg
  watchBg: '#fef3c7', // --sem-watch-bg
  weakFg: '#b91c1c', // --sem-weak-fg
  weakBg: '#fee2e2', // --sem-weak-bg
  idleFg: '#71717a', // --sem-idle-fg
  focusFg: '#1d4ed8', // --sem-focus-fg
  focusBg: '#eff6ff', // --sem-focus-bg
  candleUp: '#ffffff', // --candle-up
  candleDown: '#3c3f45', // --candle-down
  candleLine: '#131722', // --candle-line
} as const

/** 罫線が薄すぎて消える背景の上で使うグリッド線。 */
export const GRID_LINE = 'rgba(148,163,184,0.10)'

/**
 * 連続量のためのグリーンランプ（ヒートマップ）。
 * 意味語彙は「段階」を持たない（strong と ok の 2 段しかない）ので、
 * 濃淡で量を表すヒートマップだけはここに専用の 5 段を置く。
 */
export const GREEN_RAMP = ['#dcfce7', '#86efac', '#22c55e', '#16a34a', '#15803d'] as const

/**
 * レジーム判定の 5 段（強気 → 弱気）。意味語彙は段階を持たないので、
 * 発散スケールが要るここだけ実値の並びとして持つ。ScoreGauge は
 * この値に透明度を継ぎ足す（color + '1a'）ので var() は使えない。
 */
export const REGIME_RAMP = {
  strongBull: CHART.strongFg,
  bull: CHART.positive,
  neutral: CHART.textMuted,
  bear: CHART.negative,
  strongBear: CHART.weakFg,
} as const

/** 出来高の平常比。surge = 警戒、heavy = 注目。 */
export const VOLUME_TONE = {
  surge: CHART.watchFg,
  heavy: CHART.focusFg,
} as const

/**
 * 時系列の線 1 本ごとの色。系列の区別のためだけに使い、意味は持たせない。
 * 意味を持つ色（損益・状態）は CHART の方から取ること。
 */
export const SERIES = {
  primary: CHART.positive,
  secondary: CHART.focusFg,
  alt: CHART.watchFg,
} as const

/**
 * 移動平均線の色。TradingView 側のチャート設定と同じ値にしている。
 * 意味を表す色ではないので意味語彙には寄せない。
 */
export const EMA_COLORS = {
  10: '#00bcd4', // シアン
  21: '#2962ff', // ブルー
  50: '#673ab7', // ディープパープル
  150: '#f23645', // レッド
} as const

/** 移動平均線の不透明度。値動きを隠さないよう TradingView 側と同じ 30%。 */
export const EMA_ALPHA = 0.3

/** #rrggbb → rgba()。チャートライブラリは 8 桁 16 進を受けないものがあるため展開する。 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** チャートに引く実際の線の色（30% 不透明）。凡例の文字色には使わない。 */
export function emaLineColor(length: keyof typeof EMA_COLORS): string {
  return withAlpha(EMA_COLORS[length], EMA_ALPHA)
}

/**
 * チャートに重ねる 5 指標の色。系列を見分けるためだけの分類スケールで、
 * 意味は持たない（意味を持つ色は CHART から取る）。意味語彙の 7 語は
 * それぞれ意味に結び付いているので、分類のために流用しない。
 */
export const OVERLAY_SERIES = {
  composite: '#0ea5e9',
  rs: '#6366f1',
  acc: '#ec4899',
  breadth: '#14b8a6',
  short: '#f97316',
} as const
