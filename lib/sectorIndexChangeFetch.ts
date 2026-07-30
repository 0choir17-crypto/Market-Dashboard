import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'

const TABLE = 'sector_selection_s33'

/**
 * 業種指数の騰落率（1日 / 1カ月 / 半年 / 1年前比）。
 *
 * 営業日オフセットで比較する（1カ月=21営業日, 半年=126営業日, 1年=252営業日）。
 * sector_selection_s33 は 1業種1日1行なので、日付リストの N 番目 = N営業日前。
 */
export const CHANGE_PERIODS = [
  { key: '1d', label: '1日', short: '1D', tradingDays: 1 },
  { key: '1m', label: '1カ月', short: '1M', tradingDays: 21 },
  { key: '6m', label: '半年', short: '6M', tradingDays: 126 },
  { key: '1y', label: '1年', short: '1Y', tradingDays: 252 },
] as const

export type ChangePeriodKey = (typeof CHANGE_PERIODS)[number]['key']

export type SectorChange = {
  /** 騰落率（倍率−1。0.067 = +6.7%）。比較日の終値が無ければ null */
  pct: number | null
  /** 実際に比較に使った過去日（表示のツールチップ用） */
  fromDate: string | null
}

export type SectorIndexChangeEntry = {
  /** 基準（最新）終値とその日付 */
  baseDate: string | null
  baseClose: number | null
  changes: Record<ChangePeriodKey, SectorChange>
}

export type SectorIndexChangeResponse = {
  /** sector_name_s33 → 騰落率 */
  bySector: Record<string, SectorIndexChangeEntry>
  error: string | null
}

/**
 * 目標オフセットの終値が NULL（＝指数カラムが埋まっていない日）だったときに
 * 代わりに見にいく近傍オフセット。近い日を優先する。
 */
const NEIGHBOR_OFFSETS = [0, 1, -1, 2, -2, 3, -3]

const MAX_TRADING_DAYS = CHANGE_PERIODS[CHANGE_PERIODS.length - 1].tradingDays

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function emptyChanges(): Record<ChangePeriodKey, SectorChange> {
  return {
    '1d': { pct: null, fromDate: null },
    '1m': { pct: null, fromDate: null },
    '6m': { pct: null, fromDate: null },
    '1y': { pct: null, fromDate: null },
  }
}

/**
 * 全業種の「1日 / 1カ月 / 半年 / 1年」騰落率をまとめて取得する。
 *
 * 252営業日ぶんの全行（33業種 × 252日 ≈ 8,300 行）を読むのは無駄なので、
 * ①日付リストだけを引いて必要な営業日を決め、②その数日ぶんの行だけを取る。
 * リクエストは 2 回で済む。
 *
 * 指数の生カラム (sector_index_close_s33) は過去ぶんが NULL のことがあるため、
 * 比較日の終値が取れない期間は pct=null（表示側で「—」）になる。
 *
 * @param referenceSector 営業日リストの算出に使う代表業種。1業種1日1行なので
 *   どれでもよい。渡さない場合は全業種ぶんの日付を読むことになる。
 */
export async function fetchSectorIndexChanges(
  referenceSector?: string,
): Promise<SectorIndexChangeResponse> {
  // Phase 1: 直近 252 営業日の日付リスト（新しい順）。
  // 代表業種があれば 1日1行なので 1 リクエストで足りる。無い場合は 33業種ぶんが
  // 混ざり Supabase の 1000 行上限に当たるので、安定順序でページングする。
  const DATE_ROWS = MAX_TRADING_DAYS + 8
  let dateRows: { date: string }[]
  if (referenceSector) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('date')
      .eq('sector_name_s33', referenceSector)
      .order('date', { ascending: false })
      .limit(DATE_ROWS)
    if (error) {
      console.error('[sector_selection_s33 change/dates]', error)
      return { bySector: {}, error: error.message }
    }
    dateRows = (data ?? []) as { date: string }[]
  } else {
    const { rows, error } = await fetchAllPaged<{ date: string }>(
      (from, to) =>
        supabase
          .from(TABLE)
          .select('date')
          .order('date', { ascending: false })
          .order('sector_name_s33', { ascending: true })
          .range(from, to),
      DATE_ROWS * 40, // 33業種 + 余裕
    )
    if (error) {
      console.error('[sector_selection_s33 change/dates]', error)
      return { bySector: {}, error }
    }
    dateRows = rows
  }

  const dates = [...new Set(dateRows.map(r => r.date))]
    .sort((a, b) => (a > b ? -1 : 1))
    .slice(0, DATE_ROWS)
  if (dates.length === 0) return { bySector: {}, error: null }

  // Phase 2: 基準日と各期間の候補日だけを取得する。
  // 基準日が最新日からずれる場合があるので、期間側は近傍を少し広めに拾う。
  const wantedIdx = new Set<number>()
  const maxShift = Math.max(...NEIGHBOR_OFFSETS)
  for (const off of NEIGHBOR_OFFSETS) {
    if (off >= 0 && off < dates.length) wantedIdx.add(off) // 基準日の近傍
  }
  for (const p of CHANGE_PERIODS) {
    for (const off of NEIGHBOR_OFFSETS) {
      for (const shift of [0, maxShift]) {
        const i = p.tradingDays + off + shift
        if (i >= 0 && i < dates.length) wantedIdx.add(i)
      }
    }
  }
  const wantedDates = [...wantedIdx].sort((a, b) => a - b).map(i => dates[i])

  // 候補日 × 33業種は Supabase の 1000 行上限を超えうるのでページングする。
  const { rows: closeRows, error } = await fetchAllPaged<Record<string, unknown>>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('date, sector_name_s33, sector_index_close_s33')
        .in('date', wantedDates)
        .order('date', { ascending: true })
        .order('sector_name_s33', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: Record<string, unknown>[] | null
        error: { message: string } | null
      }>,
  )

  if (error) {
    console.error('[sector_selection_s33 change]', error)
    return { bySector: {}, error }
  }

  // sector → date → close
  const closeBySector: Record<string, Record<string, number>> = {}
  for (const r of closeRows) {
    const sector = r.sector_name_s33 as string | null
    const date = r.date as string | null
    const close = num(r.sector_index_close_s33)
    if (!sector || !date || close === null) continue
    if (!closeBySector[sector]) closeBySector[sector] = {}
    closeBySector[sector][date] = close
  }

  return { bySector: buildChanges(dates, closeBySector), error: null }
}

/**
 * 終値テーブルから騰落率を組み立てる純関数（取得と分離してテストしやすくする）。
 *
 * @param dates 営業日（新しい順）。index N = N営業日前。
 * @param closeBySector sector → date → 業種指数終値（欠損日は未登録）
 */
export function buildChanges(
  dates: string[],
  closeBySector: Record<string, Record<string, number>>,
): Record<string, SectorIndexChangeEntry> {
  const bySector: Record<string, SectorIndexChangeEntry> = {}
  for (const [sector, byDate] of Object.entries(closeBySector)) {
    // 基準日: 最新の営業日から近い順に、終値が入っている日を探す
    let baseIdx = -1
    for (const off of NEIGHBOR_OFFSETS) {
      if (off < 0 || off >= dates.length) continue
      if (byDate[dates[off]] !== undefined) {
        baseIdx = off
        break
      }
    }
    const baseDate = baseIdx >= 0 ? dates[baseIdx] : null
    const baseClose = baseDate !== null ? byDate[baseDate] : null

    const changes = emptyChanges()
    if (baseClose !== null && baseClose > 0) {
      for (const p of CHANGE_PERIODS) {
        for (const off of NEIGHBOR_OFFSETS) {
          const i = baseIdx + p.tradingDays + off
          if (i <= baseIdx || i >= dates.length) continue
          const past = byDate[dates[i]]
          if (past === undefined || past <= 0) continue
          changes[p.key] = { pct: baseClose / past - 1, fromDate: dates[i] }
          break
        }
      }
    }

    bySector[sector] = { baseDate, baseClose, changes }
  }
  return bySector
}
