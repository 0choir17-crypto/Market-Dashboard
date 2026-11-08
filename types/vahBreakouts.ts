// VAH Breakouts（Volume Profile の VAH を終値で上抜けた日）— Daily Watch のテーブル。
// Source table: public.vah_breakouts  (PK: date + code, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) `scripts/daily/scan_vah_breakout.py`（本番 run_daily Step1k, 2026-10-24 新設）が
//   毎晩、直近10営業日ぶんを消して入れ直す（冪等）。
//
// 2026-11-08 に TradingView Pine「Volume Profile JP v9」(v3.25) の 3 種のシグナルへ置き換え（signal / r_atr 列を追加）:
//   signal = 'base'   ▲ベース: 起点から 5 本以上たって終値が「起点〜前日の VAH」を上抜けた最初の日（失敗後の再ブレイクも）。
//                     cross_n = 何回目のブレイクか（1 = 初回）。
//            'prev'   ▲前日VAH: 前日終値 <= 起点〜前々日の VAH かつ 当日終値 > 起点〜前日の VAH（base の日を除く）。cross_n は null。
//            'switch' ◆切替直後: 出来高急増で起点が切り替わってから 5 本以内に、前の期間の VAH を下から上抜けた最初の日。cross_n は null。
//   r_atr  = (終値 − vah) ÷ 前日の ATR14（チャートの R と同じ）。
//   vah = 抜けた線 / poc・val・period_start・period_bars = その線の期間 / prev_vah = その 1 つ前の期間の VAH。
//   設定: 短期平均5本が基準平均(30本)の1.5倍で局面入り・1.0倍未満で終わる / 80分割 / VA 80% / 配当調整なし。
//   ※ 11/08 より前の行（V35 = 全上抜け、cross_n = 同じ期間で何回目の上抜けか）は signal / r_atr が null。
//
// ⚠️ 位置づけ（配信側で検証済み・承知の上で採用。2016-01〜2026-11、線を損切りの売買）:
//   v9 合計で旧 V35 比ほぼ差なし（d_R +0.014）。◆ は 2 件/日・+0.042 だが 2023〜25 は負。
//   → スコア / ランク付けはしない。「毎朝チャートを開く銘柄を機械的に絞り込んだリスト」。最終判断は手動。
//
// ユニバース（このテーブルに載っている時点で全て充足）:
//   個別株のみ / 売買代金20日平均 1億円以上 / 出来高20日平均 10万株以上 / ADR%₂₀ ≥ 2.0 / 終値の EMA150 が20営業日前より上 / 終値 > EMA150
//   TOB・MBO で上場廃止に向かう銘柄は除外。

export type VahBreakoutRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  close: number | null // 上抜け日の終値
  signal: 'base' | 'prev' | 'switch' | null // v9 のシグナルの種類（11/08 より前の行は null）
  vah: number | null // 抜けた線（その期間の VAH）
  poc: number | null
  val: number | null
  breakout_pct: number | null // 100 × (終値 / VAH − 1)
  r_atr: number | null // (終値 − vah) ÷ 前日 ATR14（11/08 より前の行は null）
  cross_n: number | null // base: 何回目のブレイクか（1 = 初回）/ prev・switch: null / 旧行: 同じ期間で何回目の上抜けか
  period_start: string | null // 期間の起点（出来高の多い局面の始まり）
  period_bars: number | null // 起点 〜 前日 の本数
  prev_vah: number | null // 抜けた線の 1 つ前の期間の VAH。無ければ null
  vah_vs_prev: 'above' | 'below' | null // 抜けた線が prev_vah より上か（以下なら below）
  adr_pct: number | null
  turnover_oku: number | null // 売買代金20日平均（億円）
  dist_from_high_pct: number | null
}
