import { supabase } from './supabase'

export interface ChartDataPoint {
  time: string  // YYYY-MM-DD
  value: number
}

function shiftMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * 保有期間 ±1ヶ月の終値データを取得。
 * daily_signals は (code, date, screen_name) で重複しうるため (code, date) ユニーク化する。
 */
export async function fetchTradeChartData(
  ticker: string,
  entryDate: string,
  exitDate: string,
): Promise<ChartDataPoint[]> {
  const rangeStart = shiftMonths(entryDate, -1)
  const rangeEnd = shiftMonths(exitDate, 1)

  const { data, error } = await supabase
    .from('daily_signals')
    .select('date, close')
    .eq('code', ticker)
    .gte('date', rangeStart)
    .lte('date', rangeEnd)
    .order('date', { ascending: true })

  if (error || !data) return []

  const byDate = new Map<string, number>()
  for (const row of data as { date: string; close: number | null }[]) {
    if (row.close == null) continue
    if (!byDate.has(row.date)) byDate.set(row.date, row.close)
  }

  return Array.from(byDate.entries())
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time.localeCompare(b.time))
}
