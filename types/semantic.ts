// 意味語彙 — 全ページ共通の色の層。
//
// 色そのものではなく「意味」に名前を付け、実際の値は globals.css の `--sem-*`
// が持つ。装飾・分類・見た目の変化のために色を使わない（設計原則 1）。
//
// 語彙を 7 つに固定することで、同じ意味に 2 つ以上の色が当たる状態を防ぐ。
// 各画面が独自に「良い状態の緑」を定義していた結果、緑が 4 種類・琥珀が
// 3 通りの意味を持っていたのがこれ以前の状態。
//
// 損益（--positive / --negative）はこの語彙から独立している。数値の符号に
// 付く色であり、状態を表す色ではないため。この 2 色が画面上で最も速く目に
// 入る状態を保つことが、色を減らす最大の目的。

export type SemanticTone =
  /** 強い・良い・保有中 — HOLD、機関買い継続、スコア上位 */
  | 'strong'
  /** 通常・許容範囲 — 通常上昇、スコア中上位 */
  | 'ok'
  /** 警戒・要注意 — 出来高警戒、鮮度 aging。琥珀はこの一語だけを指す */
  | 'watch'
  /** 弱い・悪い — SHORT、出来高枯渇、鮮度 old */
  | 'weak'
  /** 未評価・未整理・無彩色 — OTHERS、INBOX、SECOND、欠損 */
  | 'idle'
  /** 済み・対象外 — SOLD */
  | 'archive'
  /** 注目・選択中 — READY、リンク、ソート中の列 */
  | 'focus'

/** 語彙 → CSS 変数。生の 16 進を持たないので、配色の変更は globals.css だけで済む。 */
export function toneVars(tone: SemanticTone): { bg: string; fg: string; bd: string } {
  return {
    bg: `var(--sem-${tone}-bg)`,
    fg: `var(--sem-${tone}-fg)`,
    bd: `var(--sem-${tone}-bd)`,
  }
}

/** インラインスタイルとして使う場合のショートカット（面 + 文字 + 0.5px 罫線）。 */
export function toneStyle(tone: SemanticTone) {
  const t = toneVars(tone)
  return { backgroundColor: t.bg, color: t.fg, border: `0.5px solid ${t.bd}` }
}
