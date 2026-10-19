import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import type {
  CurrentRowWithFirstWatch,
  MissedRow,
  WatchlistCurrentRow,
  WatchlistEvent,
} from '@/types/watchlistJournal'

const EVENTS_TABLE = 'watchlist_events'
const CURRENT_TABLE = 'watchlist_current'

export type WatchlistJournalSnapshot = {
  /** watchlist_current の全行（毎晩 delete-all → insert で作り直される）。 */
  current: CurrentRowWithFirstWatch[]
  /** 最終スナップショット時刻（生存確認用・UTC 文字列）。 */
  lastTs: string | null
  /** 見逃し（Watch list に入れたが HOLD に至らないまま落とした）イベント。 */
  missed: MissedRow[]
  error: string | null
}

export const EMPTY_SNAPSHOT: WatchlistJournalSnapshot = {
  current: [],
  lastTs: null,
  missed: [],
  error: null,
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

/** 最初のスナップショット。これに含まれる enter は記録開始前からリストに居た銘柄。 */
async function fetchFirstSnapshotId(): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select('snapshot_id')
    .order('ts', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`[${EVENTS_TABLE}] first snapshot`, error)
    return { id: null, error: `${EVENTS_TABLE}: ${error.message}` }
  }
  return { id: (data?.snapshot_id as string | undefined) ?? null, error: null }
}

type WatchEntry = Pick<WatchlistEvent, 'snapshot_id' | 'code' | 'date' | 'from_list'>

/**
 * code ごとに「初めて Watch list に入った日」。
 *
 * 入り口は enter（新規）と Holdings → Watch list の move の 2 通りがあるので、
 * to_list が Watch list で from_list が Watch list 以外のイベントを全部拾い、
 * 最も古い date を取る。再エントリーしても初回の日のまま。
 *
 * 最初のスナップショットで入った銘柄は、記録開始前から既にリストに居たもので
 * 本当の日付は分からない。開始日を入れると「その日に拾った」と誤読されるので
 * null（表示は —）にする。後で落として入れ直しても、初回が不明なので null のまま。
 */
function buildFirstWatchDate(
  entries: WatchEntry[],
  firstSnapshotId: string | null,
): Map<string, string | null> {
  const first = new Map<string, { date: string; unknown: boolean }>()
  for (const e of entries) {
    if (!e.code || !e.date || e.from_list === 'Watch list') continue
    const unknown = firstSnapshotId !== null && e.snapshot_id === firstSnapshotId
    const prev = first.get(e.code)
    if (prev === undefined || e.date < prev.date || (e.date === prev.date && unknown)) {
      first.set(e.code, { date: e.date, unknown })
    }
  }
  return new Map([...first].map(([code, f]) => [code, f.unknown ? null : f.date]))
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

export async function fetchWatchlistJournal(): Promise<WatchlistJournalSnapshot> {
  const errors: string[] = []

  const [currentRes, lastTsRes, exitsRes, holdsRes, entriesRes, firstSnapRes] = await Promise.all([
    // 現在の状態（メイン）。行数は数十なのでページング不要だが、
    // 将来の増加に備えて安定順序を付けておく。
    supabase.from(CURRENT_TABLE).select('*').order('days', { ascending: false }).order('code'),
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
    // Watch list に入った履歴（初めて入った日を出すため）。
    fetchAllPaged<WatchEntry>((from, to) =>
      supabase
        .from(EVENTS_TABLE)
        .select('snapshot_id, code, date, from_list')
        .eq('to_list', 'Watch list')
        // PK (snapshot_id, code) で安定順序を作る — ページの重複・取りこぼしを防ぐ
        .order('snapshot_id')
        .order('code')
        .range(from, to),
    ),
    fetchFirstSnapshotId(),
  ])

  if (currentRes.error) {
    console.error(`[${CURRENT_TABLE}] fetch`, currentRes.error)
    errors.push(`${CURRENT_TABLE}: ${currentRes.error.message}`)
  }
  if (lastTsRes.error) errors.push(lastTsRes.error)
  if (exitsRes.error) errors.push(`${EVENTS_TABLE} (exit): ${exitsRes.error}`)
  if (holdsRes.error) errors.push(`${EVENTS_TABLE} (hold): ${holdsRes.error}`)
  if (entriesRes.error) errors.push(`${EVENTS_TABLE} (watch entry): ${entriesRes.error}`)
  if (firstSnapRes.error) errors.push(firstSnapRes.error)

  const firstWatch = buildFirstWatchDate(entriesRes.rows, firstSnapRes.id)
  const firstWatchOf = (code: string) => firstWatch.get(code) ?? null

  return {
    current: ((currentRes.data ?? []) as WatchlistCurrentRow[]).map(r => ({
      ...r,
      first_watch_date: firstWatchOf(r.code),
    })),
    lastTs: lastTsRes.ts,
    missed: buildMissed(exitsRes.rows, holdsRes.rows).map(r => ({
      ...r,
      first_watch_date: firstWatchOf(r.code),
    })),
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
