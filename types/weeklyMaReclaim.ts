// Weekly MA Reclaim（週足 4 本線: 9EMA・21EMA・30SMA・40SMA の最後の 1 本を終値で抜けた週）— Daily Watch の週次テーブル。
// Source table: public.weekly_ma_reclaim  (PK: date + code, anon SELECT 可)
// Pipeline: jquants-scanner (別リポ) `scripts/daily/scan_weekly_ma_reclaim.py`（本番 run_daily Step1m, 2026-11-09 新設）。
//   週次: 週の最後の営業日（金曜。金曜が祝日なら木曜）の夜に、その週の行を消して入れ直す（冪等）。それ以外の日は更新しない。
//   date = その週の最後の営業日。2026-08-14 〜 2026-11-06 の 13 週・751 行を投入済み（1 週あたり 20〜135 件、平均 約 58 件）。
//   値はすべて配信側で計算済み。ダッシュボード側で再計算しない（null は — 表示）。
//
// 載る条件（このテーブルに載っている時点で全て充足）:
//   週足（月〜金、分割調整後）の終値が 9EMA・21EMA・30SMA・40SMA の 4 本すべての上にあり、
//   前週は少なくとも 1 本の下にあった週（= 最後の 1 本を抜けた週）。線の並び・40SMA の向きは問わない。
//   9EMA を少し割って戻っただけの週も入る。
//   個別株 / 前週の最終営業日までの 10 日平均売買代金 5 億円以上 / 前週末の株価 200 円以上 / 前週末の時価総額 100 億円以上。
//   TOB・MBO で買われる側の銘柄は除外。
//
// ⚠️ 位置づけ（配信側で検証済み・承知の上で採用）:
//   スコアやランク付けはしない。並べ替えは中立な事実だけ。
//   「高値から深い」「時価総額が小さい」ほど 2 倍率は高かったが、色で良し悪しを示すことはしない。

export type DailyStage = 'Above 9EMA' | '9-21EMA' | '21-50EMA' | '50-150EMA' | 'Below 150EMA'

// グループの並び（TradingView のリスト「Weekly MA Reclaim」と同じ）
export const DAILY_STAGES: DailyStage[] = ['Above 9EMA', '9-21EMA', '21-50EMA', '50-150EMA', 'Below 150EMA']

export type WeeklyMaReclaimRow = {
  date: string // 週の最後の営業日
  code: string
  co_name: string | null
  market: string | null // プライム / スタンダード / グロース
  sector_s33: string | null
  close: number | null // 週の終値（分割調整後）
  w_ema9: number | null
  w_ema21: number | null
  w_sma30: number | null
  w_sma40: number | null
  d_w_ema9_pct: number | null // 100 × (終値 / 線 − 1)
  d_w_ema21_pct: number | null
  d_w_sma30_pct: number | null
  d_w_sma40_pct: number | null
  x_ema9_week: string | null // 終値でその線を上抜けた直近の週（その週の最後の取引日）
  x_ema21_week: string | null
  x_sma30_week: string | null
  x_sma40_week: string | null
  last_line: string | null // 最後に抜けた線。同じ週に複数なら「9EMA・21EMA・30SMA・40SMA」のように並ぶ
  n_crossed: number | null // その週に抜けた本数（1〜4）= 前週に下にいた線の本数
  sma40_up: boolean | null // 40SMA が前週より上
  vol_vs_ma10_pct: number | null // 週の出来高の 10 週平均比 %（平均はその週を含む）
  turnover10_pre_oku: number | null // 前週の最終営業日までの 10 日平均売買代金（億円）
  prev_close_raw: number | null // 前週の最終営業日の株価（円、分割調整なし）
  mcap_oku: number | null // 前週の最終営業日の時価総額（億円）
  dist_high_pct: number | null // 252 営業日の最高値からの距離 %（マイナス = 高値より下）
  adr_pct: number | null // ADR%（20日）
  d_ema9: number | null // 日足: (終値 − EMA) ÷ ATR14（rs_leaders と同じ計算）
  d_ema21: number | null
  d_ema50: number | null
  d_ema150: number | null
  daily_stage: DailyStage | null // 終値が上にいる最初の線（どれも下なら Below 150EMA）
}
