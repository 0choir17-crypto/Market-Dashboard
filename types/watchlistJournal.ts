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

/** TradingView 側のリスト名。汚染期のデータは配信時に正規化済みで、この 2 つしか現れない。 */
export type WatchListName = 'Watch list' | 'Holdings'

/**
 * 昇格 / 降格を測るラダー（大きいほど上位）。**Watch list 内の 5 状態だけ**が乗る。
 *
 * 配信側 `config.yaml` の `state_priority`
 * （`HOLD > READY > FOCUS > SECOND > SHORT > OTHERS > INBOX > SOLD`）とは別物なので
 * 混同しないこと。あちらは「同じ銘柄が複数リストに居たときどちらを採るか」の
 * 解決順で、そのまま大小比較に使うと `HOLD → SOLD` が「降格」、
 * `OTHERS → SHORT` が「昇格」になって意味を取り違える。
 *
 * HOLD / SOLD はラダーに載せない（買い・売りとして先に分類する）。
 * SHORT は空売り候補で別の軸なので、絡む move は中立扱いにする。
 */
const LADDER: Partial<Record<WatchState, number>> = {
  READY: 4,
  FOCUS: 3,
  SECOND: 2,
  OTHERS: 1,
  INBOX: 0,
}

function ladderRank(state: string | null | undefined): number | null {
  if (!state) return null
  return LADDER[state as WatchState] ?? null
}

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

/** 状態バッジの配色。旧 ScreenTagBadge の置き換え先。 */
export function stateColors(state: string | null | undefined): {
  bg: string
  text: string
  border: string
} {
  switch (state) {
    case 'HOLD':
      return { bg: '#dcfce7', text: '#15803d', border: '#86efac' }
    case 'READY':
      return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' }
    case 'FOCUS':
      return { bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc' }
    case 'SECOND':
      return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
    case 'SHORT':
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' }
    case 'OTHERS':
      return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
    case 'INBOX':
      return { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' }
    case 'SOLD':
      return { bg: '#f8fafc', text: '#94a3b8', border: '#e2e8f0' }
    default:
      return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' }
  }
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
  from_list: string | null
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
}

/** §3.2 の差分表示で使うイベントの分類。 */
export type MoveKind =
  | 'enter'
  | 'exit'
  /** 買った — この画面で最重要のイベント。 */
  | 'buy'
  /** 売った。 */
  | 'sell'
  | 'promote'
  | 'demote'
  /** 区分変更（中立）— SHORT が絡む move、SOLD → OTHERS など、ラダーに乗らない移動。 */
  | 'reclass'

/**
 * イベントを表示用に分類する（§3.2 の 4 分類 + enter / exit）。
 *
 * 単一の優先度で大小比較すると `HOLD → SOLD` が「降格」になってしまうので、
 * 買い・売りを先に確定させ、残りのうち **両端が Watch list 内の 5 状態に収まるもの**
 * だけをラダーで比較する。それ以外（SHORT が絡む / SOLD → OTHERS 等）は中立。
 */
export function classifyMove(ev: WatchlistEvent): MoveKind {
  if (ev.event === 'enter') return 'enter'
  if (ev.event === 'exit') return 'exit'

  // 買った — READY → HOLD など、Holdings に入った瞬間
  if (ev.to_state === 'HOLD') return 'buy'
  // 売った — HOLD からの SOLD だけ。FOCUS → SOLD のような移動は区分変更に落とす
  if (ev.from_state === 'HOLD' && ev.to_state === 'SOLD') return 'sell'

  const from = ladderRank(ev.from_state)
  const to = ladderRank(ev.to_state)
  if (from === null || to === null) return 'reclass'
  if (to > from) return 'promote'
  if (to < from) return 'demote'
  return 'reclass'
}

export const MOVE_LABEL: Record<MoveKind, string> = {
  enter: '新規',
  exit: '削除',
  buy: '買った',
  sell: '売った',
  promote: '昇格',
  demote: '降格',
  reclass: '区分変更',
}

/**
 * 差分行のラベル色。既存のバッジ様式（パステル背景 + 枠線）に揃える。
 * 「買った」はこの画面で最重要のイベントなので、昇格（emerald-50）より彩度を上げた
 * emerald-100 + font-bold で区別する。区分変更は昇降と取り違えないよう中立色。
 */
export const MOVE_CLASS: Record<MoveKind, string> = {
  enter: 'bg-blue-50 text-blue-700 border-blue-200',
  exit: 'bg-red-50 text-red-700 border-red-200',
  buy: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
  sell: 'bg-slate-100 text-slate-700 border-slate-300',
  promote: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  demote: 'bg-orange-50 text-orange-700 border-orange-200',
  reclass: 'bg-slate-50 text-slate-500 border-slate-200',
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
  bg: string
  text: string
  border: string
  icon: string
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
      bg: '#f8fafc',
      text: '#64748b',
      border: '#e2e8f0',
      icon: '⚪',
    }
  }

  const hours = (now.getTime() - new Date(lastTs).getTime()) / 3_600_000

  if (hours < 24) {
    return {
      level: 'ok',
      hours,
      label: `${Math.max(0, Math.floor(hours))} 時間前`,
      hint: '直近 24 時間以内に記録されています',
      bg: '#dcfce7',
      text: '#15803d',
      border: '#86efac',
      icon: '🟢',
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
      bg: '#fef3c7',
      text: '#92400e',
      border: '#fde68a',
      icon: '🟡',
    }
  }
  return {
    level: 'old',
    hours,
    label: `${Math.floor(hours / 24)} 日更新なし`,
    hint:
      '48 時間以上更新されていません。TradingView を開いていないだけの場合もありますが、' +
      '拡張または ingest が停止している可能性があります',
    bg: '#fee2e2',
    text: '#b91c1c',
    border: '#fecaca',
    icon: '🔴',
  }
}
