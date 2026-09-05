import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import type { WatchlistCurrentRow, WatchlistEvent } from '@/types/watchlistJournal'

const EVENTS_TABLE = 'watchlist_events'
const CURRENT_TABLE = 'watchlist_current'

export type WatchlistJournalSnapshot = {
  /** watchlist_current の全行（毎晩 delete-all → insert で作り直される）。 */
  current: WatchlistCurrentRow[]
  /** イベント日の distinct 降順。土日祝を含むので営業日カレンダーは使わない。 */
  availableDates: string[]
  /** 選択中の日付（未指定なら最新イベント日）。 */
  selectedDate: string | null
  /** 選択日のイベント（ts 降順）。 */
  events: WatchlistEvent[]
  /** 最終スナップショット時刻（生存確認用・UTC 文字列）。 */
  lastTs: string | null
  /** 見逃し（Watch list に入れたが HOLD に至らないまま落とした）イベント。 */
  missed: WatchlistEvent[]
  error: string | null
}

export const EMPTY_SNAPSHOT: WatchlistJournalSnapshot = {
  current: [],
  availableDates: [],
  selectedDate: null,
  events: [],
  lastTs: null,
  missed: [],
  error: null,
}

/**
 * 日付セレクトの選択肢。
 *
 * `date` は土日祝を含む（§1）。DateContext / 営業日カレンダーで絞ると
 * 週末の記録が丸ごと消えるので、実データの distinct から作る。
 * 1 日のイベントは多くても数十件だが、日数が伸びれば 1000 行の壁に当たるため
 * distinct が maxDates 件集まるまでページングする。
 */
async function fetchAvailableDates(maxDates = 90): Promise<{ dates: string[]; error: string | null }> {
  const PAGE = 1000
  const seen = new Set<string>()
  const out: string[] = [] // date desc で走査するので降順のまま溜まる
  for (let from = 0; out.length < maxDates; from += PAGE) {
    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('date')
      .order('date', { ascending: false })
      .order('snapshot_id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error(`[${EVENTS_TABLE}] available dates`, error)
      return { dates: out, error: `${EVENTS_TABLE}: ${error.message}` }
    }
    if (!data || data.length === 0) break
    for (const row of data as { date: string }[]) {
      if (!row.date || seen.has(row.date)) continue
      seen.add(row.date)
      out.push(row.date)
      if (out.length >= maxDates) break
    }
    if (data.length < PAGE) break
  }
  return { dates: out, error: null }
}

/** 最終スナップショット時刻。記録パイプラインが黙って止まるのを検知するための生存確認。 */
async function fetchLastTs(): Promise<{ ts: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select('ts')
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`[${EVENTS_TABLE}] last ts`, error)
    return { ts: null, error: `${EVENTS_TABLE}: ${error.message}` }
  }
  return { ts: (data?.ts as string | undefined) ?? null, error: null }
}

/**
 * 見逃しボードの行を組み立てる。
 *
 * 「見逃し」= Watch list に入れたが、その時点でまだ買っていないまま落とした銘柄。
 * HOLD 判定は **その exit の date より前** に限る。全期間で判定すると
 * 「8 月に落として 10 月に買い直した銘柄」が board から消えてしまうが、
 * 8 月の判断はやはり見逃しで、むしろ「戻ってきた = 落とすべきでなかった」証拠になる。
 * 同一 code の exit は畳まず全件出す（1 回ごとが独立した判断）。
 *
 * PostgREST に NOT EXISTS が無いので 2 クエリに分ける。
 * ソートは max_ret_pct 降順だが、Postgres の DESC は NULL を先頭に置く（§6）。
 * イベント当日の exit は max_ret_pct が NULL で、これを弾くと
 * 「今日落とした銘柄」が翌日まで見えなくなるので、サーバ側では絞らずに
 * クライアントで NULL を末尾へ回す。
 */
function buildMissed(
  exits: WatchlistEvent[],
  holds: Pick<WatchlistEvent, 'code' | 'date'>[],
): WatchlistEvent[] {
  // code ごとに「最初に HOLD になった日」。判定は ts ではなく date で行う
  // （同じ日のうちに HOLD にして落とし直した、のような並びを取りこぼさない）。
  const firstHoldDate = new Map<string, string>()
  for (const h of holds) {
    if (!h.code || !h.date) continue
    const prev = firstHoldDate.get(h.code)
    if (prev === undefined || h.date < prev) firstHoldDate.set(h.code, h.date)
  }

  const missed = exits.filter(ev => {
    const held = firstHoldDate.get(ev.code)
    if (held === undefined) return true // 一度も HOLD になっていない
    return held >= ev.date // この exit の日より前には HOLD になっていない
  })

  // 「落とした後に伸びた順」。NULL（当日 exit で翌営業日がまだ来ていない）は末尾。
  return missed.sort((a, b) => {
    const av = a.max_ret_pct
    const bv = b.max_ret_pct
    if (av === null && bv === null) return b.date.localeCompare(a.date)
    if (av === null) return 1
    if (bv === null) return -1
    return bv - av
  })
}

export async function fetchWatchlistJournal(date?: string): Promise<WatchlistJournalSnapshot> {
  const errors: string[] = []

  const [currentRes, datesRes, lastTsRes, exitsRes, holdsRes] = await Promise.all([
    // 現在の状態（メイン）。行数は数十なのでページング不要だが、
    // 将来の増加に備えて安定順序を付けておく。
    supabase.from(CURRENT_TABLE).select('*').order('days', { ascending: false }).order('code'),
    fetchAvailableDates(),
    fetchLastTs(),
    // 見逃し候補: Watch list からの exit を全件。
    fetchAllPaged<WatchlistEvent>((from, to) =>
      supabase
        .from(EVENTS_TABLE)
        .select('*')
        .eq('event', 'exit')
        .eq('from_list', 'Watch list')
        // PK (snapshot_id, code) で安定順序を作る — ページの重複・取りこぼしを防ぐ
        .order('snapshot_id')
        .order('code')
        .range(from, to),
    ),
    // HOLD になった履歴（code と date だけあれば判定できる）。
    fetchAllPaged<Pick<WatchlistEvent, 'code' | 'date'>>((from, to) =>
      supabase
        .from(EVENTS_TABLE)
        .select('code, date')
        .eq('to_state', 'HOLD')
        // PK (snapshot_id, code) で安定順序を作る — ページの重複・取りこぼしを防ぐ
        .order('snapshot_id')
        .order('code')
        .range(from, to),
    ),
  ])

  if (currentRes.error) {
    console.error(`[${CURRENT_TABLE}] fetch`, currentRes.error)
    errors.push(`${CURRENT_TABLE}: ${currentRes.error.message}`)
  }
  if (datesRes.error) errors.push(datesRes.error)
  if (lastTsRes.error) errors.push(lastTsRes.error)
  if (exitsRes.error) errors.push(`${EVENTS_TABLE} (exit): ${exitsRes.error}`)
  if (holdsRes.error) errors.push(`${EVENTS_TABLE} (hold): ${holdsRes.error}`)

  const availableDates = datesRes.dates
  const selectedDate = date ?? availableDates[0] ?? null

  let events: WatchlistEvent[] = []
  if (selectedDate) {
    const { rows, error } = await fetchAllPaged<WatchlistEvent>((from, to) =>
      supabase
        .from(EVENTS_TABLE)
        .select('*')
        .eq('date', selectedDate)
        .order('ts', { ascending: false })
        .order('code')
        .range(from, to),
    )
    if (error) errors.push(`${EVENTS_TABLE} (${selectedDate}): ${error}`)
    events = rows
  }

  return {
    current: (currentRes.data ?? []) as WatchlistCurrentRow[],
    availableDates,
    selectedDate,
    events,
    lastTs: lastTsRes.ts,
    missed: buildMissed(exitsRes.rows, holdsRes.rows),
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
