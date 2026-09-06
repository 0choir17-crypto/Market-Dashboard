import type { SemanticTone } from '@/types/semantic'
// Watchlist Journal — TradingView の操作記録。
//
// 旧 `watchlist` テーブル（ダッシュボードへの手入力）は 0 行のまま 2026-09-05 に
// drop された。銘柄選定は TradingView 上で行い、Chrome 拡張が 30 分おきに
// スナップショットを撮って差分から遷移イベントを復元し、Supabase に配信する。
// この画面は「その記録を読むだけ」で、追加・編集・削除は一切できない
// （Supabase 側にも write policy を付けていない）。

/** TradingView のセクション = 銘柄の状態。 */
export type WatchState =
  | 'HOLD'
  | 'SOLD'
  | 'READY'
  | 'FOCUS'
  | 'SECOND'
  | 'SHORT'
  | 'OTHERS'
  | 'INBOX'

export type WatchEventType = 'enter' | 'move' | 'exit'

/** §3.1 の表示順。ここに無い状態（想定外の値）は末尾に回す。 */
export const STATE_ORDER: WatchState[] = [
  'HOLD',
  'READY',
  'FOCUS',
  'SECOND',
  'SHORT',
  'OTHERS',
  'INBOX',
  'SOLD',
]

export function stateOrderIndex(state: string | null | undefined): number {
  const i = STATE_ORDER.indexOf((state ?? '') as WatchState)
  return i < 0 ? STATE_ORDER.length : i
}

/**
 * `watchlist_events` の 1 行 = 1 イベント。PK は (snapshot_id, code)。
 * 指標列は「そのイベントが起きた日」の値で以後不変。
 * 「その後の値動き」7 列（last_date 以降）だけ毎晩更新される。
 */
export type WatchlistEvent = {
  snapshot_id: string
  code: string
  /** 撮影時刻。timestamptz なので API からは UTC で返る — 表示は必ず JST に変換する。 */
  ts: string
  /** イベント日（JST）。ts が 06 時未満なら前日に寄せてある。土日祝を含む。 */
  date: string
  ticker: string
  event: WatchEventType
  /** 移動前の状態。enter では null。 */
  from_state: string | null
  /** 移動後の状態。exit では null。 */
  to_state: string | null
  /** `Watch list` / `Holdings` のみ（汚染期のデータは配信時に正規化済み）。 */
  from_list: string | null
  /** 同上。exit では null。 */
  to_list: string | null
  /** 直前の状態に居た暦日数。enter では null。 */
  dwell_days: number | null
  /** 指標を引いた営業日。土日イベントなら金曜。 */
  ind_date: string | null
  co_name: string | null
  sector_s33: string | null
  /** イベント日の終値。値動きの基準。 */
  close_adj: number | null
  mcap_oku: number | null
  adr_pct_20: number | null
  turnover_oku: number | null
  volume_ratio: number | null
  rs_vs_topix_avg: number | null
  dist_from_high_pct: number | null
  sma_150_slope_20d: number | null
  ext_r: number | null
  return_63d: number | null
  /**
   * その日ヒットしていたスキャナー名（TradingView のセクション名）。
   * 空の意味は 2 つ（どのスキャナーも拾えていない / その日リストを貼らなかった）で
   * 区別できないため、「自力発見 N 件」のような集計はしない。
   */
  scanner_names: string[] | null
  last_date: string | null
  last_close: number | null
  bars_since: number | null
  /** (last_close / close_adj − 1) × 100。イベント当日はまだ null。 */
  ret_since_pct: number | null
  max_ret_pct: number | null
  min_ret_pct: number | null
  measured_at: string | null

  // ── 21EMA 系リスク列（2026-09-05 追加）─────────────────────────────────
  // TradingView で常時表示しているインジケーター（Cockpit BT10 / ADR×ATR）と
  // 同じ値。画面とダッシュボードで数字が食い違わないようにするためのもの。
  // 円建て 4 列は Pine の呼値丸めを掛けていない生値なので TV 表示と数円ずれる。
  // 検算は % で行う（小数第 2 位まで一致する）。
  /** ta.atr(14)（Wilder RMA）。 */
  atr_14: number | null
  /** (close − ema(close,21)) / atr_14。Cockpit BT10 では 1.5 以下が緑。 */
  ext_ema21: number | null
  /** (close − ema(low,21)) / atr_14。 */
  ext_ema21_low: number | null
  /** close − ema(close,21)（円）。 */
  dist_ema21_yen: number | null
  /** close − ema(low,21)（円）= **1R**。安値 21EMA にストップを置いたときの値幅。 */
  dist_ema21_low_yen: number | null
  /** dist_ema21_yen × 2（円）。 */
  rr2_ema21_yen: number | null
  /** dist_ema21_low_yen × 2（円）= 利確目標までの値幅。 */
  rr2_ema21_low_yen: number | null
}

/**
 * `watchlist_current` の 1 行 = 1 銘柄。PK は code。
 * 毎晩 delete-all → insert で作り直す。指標は「今日の値」
 * （watchlist_events はイベント日の値）。
 */
export type WatchlistCurrentRow = {
  code: string
  snapshot_date: string | null
  ticker: string | null
  co_name: string | null
  sector_s33: string | null
  state: string | null
  list_name: string | null
  /** そのセクションに入った日。 */
  since: string | null
  /** since からの暦日数。 */
  days: number | null
  /** since の日の終値。 */
  close_at_since: number | null
  close_adj: number | null
  /** 入ってから何 % 動いたか。 */
  ret_since_pct: number | null
  mcap_oku: number | null
  adr_pct_20: number | null
  turnover_oku: number | null
  rs_vs_topix_avg: number | null
  dist_from_high_pct: number | null
  sma_150_slope_20d: number | null
  ext_r: number | null
  scanner_names: string[] | null
  updated_at: string | null

  // ── 21EMA 系リスク列（2026-09-05 追加）─────────────────────────────────
  // TradingView で常時表示しているインジケーター（Cockpit BT10 / ADR×ATR）と
  // 同じ値。画面とダッシュボードで数字が食い違わないようにするためのもの。
  // 円建て 4 列は Pine の呼値丸めを掛けていない生値なので TV 表示と数円ずれる。
  // 検算は % で行う（小数第 2 位まで一致する）。
  /** ta.atr(14)（Wilder RMA）。 */
  atr_14: number | null
  /** (close − ema(close,21)) / atr_14。Cockpit BT10 では 1.5 以下が緑。 */
  ext_ema21: number | null
  /** (close − ema(low,21)) / atr_14。 */
  ext_ema21_low: number | null
  /** close − ema(close,21)（円）。 */
  dist_ema21_yen: number | null
  /** close − ema(low,21)（円）= **1R**。安値 21EMA にストップを置いたときの値幅。 */
  dist_ema21_low_yen: number | null
  /** dist_ema21_yen × 2（円）。 */
  rr2_ema21_yen: number | null
  /** dist_ema21_low_yen × 2（円）= 利確目標までの値幅。 */
  rr2_ema21_low_yen: number | null
}

// ── 鮮度判定 ────────────────────────────────────────────────────────────────
// /earnings の classifyFreshness は「営業日ベース + 決算閑散期」の判定で、
// この画面には使えない: 記録は土日祝も走る (§1) ので、営業日で測ると
// 金曜夜にパイプラインが死んでも火曜まで緑のままになる。配色とバッジの形だけ
// 揃えて、こちらは実時間 (時間単位) で測る。
//
// 文言は「異常」と断定しない。拡張は TradingView を開いた時にしか撮らないので、
// 旅行等で TV を開かない日が続けば正常でも古くなる。事実（N 時間更新されていない）
// だけを書き、原因の候補を hint に添える。

export type SnapshotFreshness = {
  /** ok: 24h 以内 / aging: 24-48h / old: 48h 超 / unknown: 記録なし。 */
  level: 'ok' | 'aging' | 'old' | 'unknown'
  /** 最終スナップショットからの経過時間（時間）。不明なら null。 */
  hours: number | null
  label: string
  hint: string
  /**
   * 表示の語彙。`ok` は **無色**（idle）にする — 正常が目立たない状態を作ることが、
   * 異常の発見を速くする。aging で初めて警戒、old で弱い。
   */
  tone: SemanticTone
}

export function classifySnapshotFreshness(
  lastTs: string | null,
  now: Date = new Date(),
): SnapshotFreshness {
  if (!lastTs) {
    return {
      level: 'unknown',
      hours: null,
      label: '記録なし',
      hint: 'watchlist_events にイベントがありません',
      tone: 'idle',
    }
  }

  const hours = (now.getTime() - new Date(lastTs).getTime()) / 3_600_000

  if (hours < 24) {
    return {
      level: 'ok',
      hours,
      label: `${Math.max(0, Math.floor(hours))} 時間前`,
      hint: '直近 24 時間以内に記録されています',
      tone: 'idle',
    }
  }
  if (hours < 48) {
    return {
      level: 'aging',
      hours,
      label: `${Math.floor(hours)} 時間更新なし`,
      hint:
        '丸 1 日撮れていません。拡張は TradingView を開いた時にしか撮らないため、' +
        'TV を開かなかった日はこうなります',
      tone: 'watch',
    }
  }
  return {
    level: 'old',
    hours,
    label: `${Math.floor(hours / 24)} 日更新なし`,
    hint:
      '48 時間以上更新されていません。TradingView を開いていないだけの場合もありますが、' +
      '拡張または ingest が停止している可能性があります',
    tone: 'weak',
  }
}

// ── 1R 乖離% と 8% ルール ───────────────────────────────────────────────────
// 乖離% は列に無い。close_adj が同じ行にあるので 1 行で出せるため保存していない。
// 8% 以上は 1R が大きすぎて RR2:1 が成立せず、新基準ではエントリー対象外
// （docs/win_criteria_rr2_ema21low.md。events 全体の 37% が該当する）。
// ただし画面側では色も印も付けない — しきい値の判断は数値を見て手で行う。

/**
 * 1R（安値 21EMA までの値幅）が終値の何 % か。
 * TradingView が括弧で併記している % と小数第 2 位まで一致する。
 */
export function riskPct(
  distEma21LowYen: number | null | undefined,
  close: number | null | undefined,
): number | null {
  if (distEma21LowYen == null || close == null || !close) return null
  if (!Number.isFinite(distEma21LowYen) || !Number.isFinite(close)) return null
  return (100 * distEma21LowYen) / close
}
