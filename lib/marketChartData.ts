import { supabase } from './supabase'
import type { TimeSeriesPoint } from '@/components/market/TimeSeriesChart'

const DEFAULT_LOOKBACK_DAYS = 180

function startDateStr(lookbackDays: number, endDate?: string): string {
  const d = endDate ? new Date(endDate) : new Date()
  d.setDate(d.getDate() - lookbackDays)
  return d.toISOString().slice(0, 10)
}

export async function fetchMcScoreTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
  endDate?: string,
): Promise<TimeSeriesPoint[]> {
  // MC v4 Score (0-100) のみ。v4 が未集計の日付はチャートから除外。
  let query = supabase
    .from('market_conditions')
    .select('date, mc_v4')
    .gte('date', startDateStr(lookbackDays, endDate))
    .order('date', { ascending: true })

  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data, error } = await query

  if (error || !data) return []

  return (data as { date: string; mc_v4: number | null }[])
    .map((r) => ({ time: r.date, value: r.mc_v4 != null ? Number(r.mc_v4) : Number.NaN }))
    .filter((p) => Number.isFinite(p.value))
}

export async function fetchAdvDecRatioTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<TimeSeriesPoint[]> {
  const { data, error } = await supabase
    .from('market_conditions')
    .select('date, ad_ratio_10')
    .gte('date', startDateStr(lookbackDays))
    .order('date', { ascending: true })

  if (error || !data) return []

  // Number(null) === 0 になる罠を避けるため null は事前に除外
  return (data as { date: string; ad_ratio_10: number | null }[])
    .filter((r) => r.ad_ratio_10 != null)
    .map((r) => ({ time: r.date, value: Number(r.ad_ratio_10) }))
    .filter((p) => Number.isFinite(p.value))
}

export async function fetchNhNlDiffTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<TimeSeriesPoint[]> {
  const { data, error } = await supabase
    .from('market_conditions')
    .select('date, nh_nl_diff')
    .gte('date', startDateStr(lookbackDays))
    .order('date', { ascending: true })

  if (error || !data) return []

  return (data as { date: string; nh_nl_diff: number | null }[])
    .filter((r) => r.nh_nl_diff != null)
    .map((r) => ({ time: r.date, value: Number(r.nh_nl_diff) }))
    .filter((p) => Number.isFinite(p.value))
}

export async function fetchPctAboveSmaTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<{ sma50: TimeSeriesPoint[]; sma200: TimeSeriesPoint[] }> {
  const { data, error } = await supabase
    .from('market_conditions')
    .select('date, pct_above_sma50, pct_above_sma200')
    .gte('date', startDateStr(lookbackDays))
    .order('date', { ascending: true })

  if (error || !data) return { sma50: [], sma200: [] }

  const rows = data as {
    date: string
    pct_above_sma50: number | null
    pct_above_sma200: number | null
  }[]

  return {
    sma50: rows
      .filter((r) => r.pct_above_sma50 != null)
      .map((r) => ({ time: r.date, value: Number(r.pct_above_sma50) }))
      .filter((p) => Number.isFinite(p.value)),
    sma200: rows
      .filter((r) => r.pct_above_sma200 != null)
      .map((r) => ({ time: r.date, value: Number(r.pct_above_sma200) }))
      .filter((p) => Number.isFinite(p.value)),
  }
}
