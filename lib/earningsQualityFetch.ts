import { supabase } from '@/lib/supabase'
import type { EarningsQualityRow } from '@/types/earningsQuality'

export type EarningsQualitySnapshot = {
  latestDate: string | null
  rows: EarningsQualityRow[]
  eventsInDay: number
  availableDates: string[]
  // fetch 失敗時のメッセージ (成功時は null)。既存の呼び出し元の useState 初期値
  // リテラルを壊さないよう optional (fetchEarningsQualitySnapshot は常にセットする)。
  error?: string | null
}

// 直近の開示日をひとつ取得。決算開示の無い日 (週末や非集中日) は飛ばし、
// 「直近の開示日」が返る。
async function fetchLatestDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from('earnings_quality')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[earnings_quality] latest date', error)
    return null
  }
  return (data?.date as string | undefined) ?? null
}

// 直近 maxDates 営業日ぶんの開示日 (重複除去, 降順) を返す。日付ピッカー用。
// 集中日は 1 日に数百行入るため、行数 limit だと数日分しかカバーできない
// (Supabase は 1 リクエスト 1000 行で打ち切る)。distinct な日付が maxDates 件
// 集まるまで安定順序 (date desc, code asc, cur_per_type asc = PK) で .range()
// ページングし、集まり次第打ち切る。
async function fetchAvailableDates(maxDates = 60): Promise<string[]> {
  const PAGE = 1000
  const seen = new Set<string>()
  const out: string[] = [] // date desc で走査するので降順のまま溜まる
  for (let from = 0; out.length < maxDates; from += PAGE) {
    const { data, error } = await supabase
      .from('earnings_quality')
      .select('date')
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .order('cur_per_type', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[earnings_quality] available dates', error)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data) {
      const d = r.date as string
      if (!seen.has(d)) {
        seen.add(d)
        out.push(d)
        if (out.length >= maxDates) break
      }
    }
    if (data.length < PAGE) break
  }
  return out
}

// 指定日 (省略時は最新) の earnings_quality を全件取得。
// select('*') でスキーマ増減耐性 (供給側で列が追加/削除されても落ちない)。
export async function fetchEarningsQualitySnapshot(
  date?: string,
): Promise<EarningsQualitySnapshot> {
  const [targetDate, availableDates] = await Promise.all([
    date ? Promise.resolve(date) : fetchLatestDate(),
    fetchAvailableDates(),
  ])

  if (!targetDate) {
    return { latestDate: null, rows: [], eventsInDay: 0, availableDates, error: null }
  }

  const { data, error } = await supabase
    .from('earnings_quality')
    .select('*')
    .eq('date', targetDate)
    .order('score3', { ascending: false })
    .order('rank_in_day', { ascending: true })

  if (error) {
    console.error('[earnings_quality] rows', error)
    return {
      latestDate: targetDate,
      rows: [],
      eventsInDay: 0,
      availableDates,
      error: error.message,
    }
  }

  const rows = (data ?? []) as EarningsQualityRow[]
  // events_in_day は同日同値が入っている想定なので、最初の行から取得
  const eventsInDay = rows[0]?.events_in_day ?? rows.length

  return { latestDate: targetDate, rows, eventsInDay, availableDates, error: null }
}

// 直近 N 件の集中日 (events_in_day >= threshold) を返す。footer 用。
export async function fetchPeakDays(
  threshold = 100,
  limit = 10,
): Promise<{ date: string; events_in_day: number }[]> {
  const { data, error } = await supabase
    .from('earnings_quality')
    .select('date, events_in_day')
    .gte('events_in_day', threshold)
    .order('date', { ascending: false })
    .limit(limit * 50)

  if (error || !data) {
    if (error) console.error('[earnings_quality] peak days', error)
    return []
  }

  const seen = new Set<string>()
  const out: { date: string; events_in_day: number }[] = []
  for (const r of data) {
    const d = r.date as string
    if (!seen.has(d)) {
      seen.add(d)
      out.push({ date: d, events_in_day: (r.events_in_day as number) ?? 0 })
      if (out.length >= limit) break
    }
  }
  return out
}
