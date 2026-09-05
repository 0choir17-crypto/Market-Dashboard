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
 * 状態の優先度（大きいほど上位）。昇格 / 降格の判定に使う。
 *
 * §1 の `READY > FOCUS > SECOND > OTHERS` に HOLD を最上位として足したもの。
 * READY → HOLD（実際に買った）が最も強い昇格になる。
 * SHORT は買い方向の軸に乗らないため優先度を持たせず（null）、
 * 出入りは「転換」として中立色で表示する。
 * INBOX は未仕分けなので最下位。SOLD は決済でラダーの外。
 */
const STATE_PRIORITY: Partial<Record<WatchState, number>> = {
  HOLD: 5,
  READY: 4,
  FOCUS: 3,
  SECOND: 2,
  OTHERS: 1,
  INBOX: 0,
}

export function statePriority(state: string | null | undefined): number | null {
  if (!state) return null
  return STATE_PRIORITY[state as WatchState] ?? null
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
  /** その日ヒットしていたスキャナー名（TradingView のセクション名）。空 = 自力発見。 */
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
  | 'promote'
  | 'demote'
  | 'buy'
  | 'sell'
  | 'short'
  | 'sort'
  | 'exit'
  | 'other'

/**
 * イベントを表示用に分類する。
 *
 * リスト跨ぎ（Watch list → Holdings）も優先度ラダーの一部として扱い、
 * READY → HOLD は最も強い昇格 = 'buy' になる。HOLD → SOLD は決済 = 'sell'
 * （※ §6 のとおりリストを動かした日であって約定日ではない。損益は trades が正本）。
 * SHORT の出入りは買い方向の軸に乗らないので 'short'、INBOX からの仕分けは 'sort'。
 */
export function classifyMove(ev: WatchlistEvent): MoveKind {
  if (ev.event === 'enter') return 'enter'
  if (ev.event === 'exit') return 'exit'

  if (ev.to_state === 'HOLD') return 'buy'
  if (ev.to_state === 'SOLD') return 'sell'
  if (ev.from_state === 'SHORT' || ev.to_state === 'SHORT') return 'short'
  if (ev.from_state === 'INBOX') return 'sort'

  const from = statePriority(ev.from_state)
  const to = statePriority(ev.to_state)
  if (from === null || to === null) return 'other'
  if (to > from) return 'promote'
  if (to < from) return 'demote'
  return 'other'
}

export const MOVE_LABEL: Record<MoveKind, string> = {
  enter: '新規',
  promote: '昇格',
  demote: '降格',
  buy: '買い',
  sell: '決済',
  short: '転換',
  sort: '仕分け',
  exit: '削除',
  other: '移動',
}

/** 差分行のラベル色。昇格系は緑、降格・削除は赤、中立はグレー。 */
export const MOVE_CLASS: Record<MoveKind, string> = {
  enter: 'bg-blue-50 text-blue-700 border-blue-200',
  promote: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  demote: 'bg-orange-50 text-orange-700 border-orange-200',
  buy: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
  sell: 'bg-slate-100 text-slate-600 border-slate-300',
  short: 'bg-rose-50 text-rose-700 border-rose-200',
  sort: 'bg-violet-50 text-violet-700 border-violet-200',
  exit: 'bg-red-50 text-red-700 border-red-200',
  other: 'bg-slate-50 text-slate-600 border-slate-200',
}

// ── 鮮度判定 ────────────────────────────────────────────────────────────────
// /earnings の classifyFreshness は「営業日ベース + 決算閑散期」の判定で、
// この画面には使えない: 記録は土日祝も走る (§1) ので、営業日で測ると
// 金曜夜にパイプラインが死んでも火曜まで緑のままになる。配色とバッジの形だけ
// 揃えて、こちらは実時間 (時間単位) で測る。
//
// 配信は毎日 23:30 の 1 回（+ 手動ショートカット）なので、24 時間以内に
// 1 回更新があれば正常。48 時間を超えたら 2 回連続で落ちている。

export type SnapshotFreshness = {
  level: 'live' | 'stale' | 'dead' | 'unknown'
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
      level: 'live',
      hours,
      label: `${Math.max(0, Math.floor(hours))} 時間前`,
      hint: '記録パイプラインは正常です（配信は毎日 23:30）',
      bg: '#dcfce7',
      text: '#15803d',
      border: '#86efac',
      icon: '🟢',
    }
  }
  if (hours < 48) {
    return {
      level: 'stale',
      hours,
      label: `${Math.floor(hours)} 時間前`,
      hint: '24 時間以上更新がありません — 23:30 の ingest が落ちた可能性があります',
      bg: '#fef3c7',
      text: '#92400e',
      border: '#fde68a',
      icon: '🟡',
    }
  }
  return {
    level: 'dead',
    hours,
    label: `${Math.floor(hours / 24)} 日前`,
    hint: '2 日以上更新がありません — WatchlistJournal-Ingest の状態を確認してください',
    bg: '#fee2e2',
    text: '#b91c1c',
    border: '#fecaca',
    icon: '🔴',
  }
}
