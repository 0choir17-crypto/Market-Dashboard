// TOPIX-33 業種テーブル。2026-10-03 に旧セクタースコア (composite_score と 4 成分・
// leading/neutral/lagging・RS/breadth 系の集計) をやめ、「業種の自力」に置き換えた。
// 旧列は新しく入れ直した全期間で null になり、後日テーブルから削除される (読まないこと)。
// Source table: sector_selection_s33  (PK: date + sector_name_s33)
// 生成元: scripts/daily/sector_selection_s33.py (別リポ)。DDL: sql/sector_selection_s33.sql
//
// 自力の列の窓はすべて「その日を含む直近 N 営業日」。対象銘柄 = 個別株のうち 60 日売買代金の
// 中央値で 1,000 位以内 (1,200 位より下で外れる)。所属が 5 社未満の業種日は n_stocks 以外が null。
// 自力の列は 2016-06-28 以降に値が入る。

export type SectorSelectionRow = {
  date: string
  sector_name_s33: string
  sector_code_s33: string | null

  // ── ① 業種の自力 (2026-10-03〜) ────────────────────────────────────────
  /** その日の業種の対象銘柄数 (売買代金 1,000 位以内)。少ない業種は値がぶれやすい */
  n_stocks?: number | null
  /** 業種の自力 (TOPIX につられた分を除いた強さ・配当込み) の直近 21 営業日の t 値 */
  self_t21?: number | null
  /** 同・直近 63 営業日。主の列。−1 以下 = 注意 (入る時期を遅らせる目安) */
  self_t63?: number | null
  /** 業種内の中央値の銘柄が業種指数より強いかの t 値 (21 日)。+ 中小型が強い / − 大型主導 */
  med_vs_idx_t21?: number | null
  /** 業種の代金シェア (21 日) がその業種の普段 (直近 250 営業日) より多いか (z 値)。+1 以上 = 資金が集まっている */
  va_share21_z250?: number | null
  /** 対象銘柄のうち直近 21 日の平均代金が 63 日平均の 1.2 倍を超える銘柄の割合 (%) */
  va21_vs63_up_pct?: number | null

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
  // TOPIX超過リターン（生値）
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

/** self_t63 がこの値以下の業種に注意の印を付ける */
export const SELF_T63_CAUTION = -1

/** 5 営業日前との差で上向き・下向きとみなす幅 (Liquid Leaders の 5d Δ と同じ) */
export const SELF_DIFF_STEP = 0.1

export function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

export function isCaution(r: Pick<SectorSelectionRow, 'self_t63'>): boolean {
  return isNum(r.self_t63) && r.self_t63 <= SELF_T63_CAUTION
}

/** self_t63 の高い順 (null は最後)。一覧・チャート・RRG の並びに共通で使う */
export function bySelfT63(
  a: Pick<SectorSelectionRow, 'self_t63'>,
  b: Pick<SectorSelectionRow, 'self_t63'>,
): number {
  return (isNum(b.self_t63) ? b.self_t63 : -Infinity) - (isNum(a.self_t63) ? a.self_t63 : -Infinity)
}

/** 符号付きの t 値表示 (+1.23 / −0.45 / ±0.00) */
export function fmtT(v: number | null | undefined): string {
  if (!isNum(v)) return '—'
  const r = Math.round(v * 100) / 100
  if (r === 0) return '±0.00'
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}`
}
