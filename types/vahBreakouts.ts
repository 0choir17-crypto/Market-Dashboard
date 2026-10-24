// VAH Breakouts（Volume Profile の VAH を終値で上抜けた日）— Daily Watch のテーブル。
// Source table: public.vah_breakouts  (PK: date + code, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) `scripts/daily/scan_vah_breakout.py`（本番 run_daily Step1k, 2026-10-24 新設）が
//   毎晩、直近10営業日ぶんを冪等 upsert。過去行は書き換わらない（status の概念なし）。
//
// 検出条件:
//   ユーザー作の TradingView インジケーター「Volume Profile JP」（自動：出来高急増の起点）を日足で再現。
//   期間 = 出来高急増のまとまりの最初の日 〜 前日。その期間の価格帯別出来高から VAH / POC / VAL を作る。
//   前日までの足で作った VAH を、前日終値 <= VAH かつ 当日終値 > VAH で上抜けた日。
//   同じ期間の中で何回目の上抜けかが cross_n（1 = 初回。VAH 付近を行き来すると 2 回目以降が出る）。
//   価格はすべて配当調整後（TradingView の「配当調整」ON の表示と一致）。
//
// ⚠️ 位置づけ（配信側で検証済み・承知の上で採用）:
//   +2R 利確の版で同じユニバースの平均より +0.07〜0.09R（11年中7年プラス）、利確なしではほぼ 0。
//   初回か再上抜けか、今の VAH が前の期間の VAH より上か下かでは成績はほぼ変わらない。
//   → スコア / ランク付けはしない。「毎朝チャートを開く銘柄を機械的に絞り込んだリスト」。最終判断は手動。
//
// ユニバース（このテーブルに載っている時点で全て充足）:
//   個別株のみ / 売買代金20日平均 1億円以上 / ADR%₂₀ ≥ 2.0 / 終値の EMA150 が20営業日前より上 / 終値 > EMA150
//   TOB・MBO で上場廃止に向かう銘柄は除外。

export type VahBreakoutRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  close: number | null // 上抜け日の終値（配当調整後）
  vah: number | null // 現在の期間の VAH（前日まで）
  poc: number | null
  val: number | null
  breakout_pct: number | null // 100 × (終値 / VAH − 1)
  cross_n: number | null // 同じ期間の中で何回目の上抜けか（1 = 初回）
  period_start: string | null // 期間の起点（出来高急増のまとまりの最初の日）
  period_bars: number | null // 起点 〜 前日 の本数
  prev_vah: number | null // 1 個前の期間の VAH（TV の灰色の線）。無ければ null
  vah_vs_prev: 'above' | 'below' | null // 今の VAH が前の期間の VAH より上か（以下なら below）
  adr_pct: number | null
  turnover_oku: number | null // 売買代金20日平均（億円）
  dist_from_high_pct: number | null
}
