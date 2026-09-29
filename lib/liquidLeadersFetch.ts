import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import type { LiquidLeader } from '@/types/liquidLeaders'

const TABLE = 'liquid_leaders'

export type LiquidLeadersSnapshot = {
  date: string | null      // 表示対象の日付 (= 選択日 or 最新日)
  rows: LiquidLeader[]
  error?: string | null    // fetch 失敗時のメッセージ（空データと区別する）
}

// ── 日付ピッカー用: テーブルにある全営業日 (降順) ───────────────────────
// 表示中の日付とは無関係に、常に全履歴を返す。表示日で絞ると、過去日を選んだ
// 後のピッカーにその日より後の日付が出なくなる（旧 market_leaders 画面の不具合）。
// 1 日 40〜180 行 × 約 1 年 ≒ 2 万行。date だけを (date, code) の安定順序で
// ページングする（Supabase の 1 リクエスト 1000 行上限を取りこぼさないため）。
export async function fetchLiquidLeaderDates(): Promise<{ dates: string[]; error: string | null }> {
  const { rows, error } = await fetchAllPaged<{ date: string }>((from, to) =>
    supabase
      .from(TABLE)
      .select('date')
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .range(from, to),
  )
  if (error) console.error('[liquid_leaders dates]', error)
  const dates: string[] = []
  for (const r of rows) {
    if (dates[dates.length - 1] !== r.date) dates.push(r.date)
  }
  return { dates, error }
}

async function fetchLatestDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[liquid_leaders latest date]', error)
    return null
  }
  return (data?.date as string | undefined) ?? null
}

// 指定日 (省略時は最新) の一覧。1 日最大 ~180 行なので 1 リクエストで収まる。
export async function fetchLiquidLeadersSnapshot(date?: string): Promise<LiquidLeadersSnapshot> {
  const target = date ?? (await fetchLatestDate())
  if (!target) return { date: null, rows: [], error: null }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('date', target)
    .order('code', { ascending: true })
  if (error) console.error('[liquid_leaders snapshot]', error)
  return {
    date: target,
    rows: (data ?? []) as unknown as LiquidLeader[],
    error: error ? error.message : null,
  }
}
