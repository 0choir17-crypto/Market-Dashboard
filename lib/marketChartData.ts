import { supabase } from './supabase'
import type { TimeSeriesPoint } from '@/components/market/TimeSeriesChart'

const DEFAULT_LOOKBACK_DAYS = 180

function startDateStr(lookbackDays: number, endDate?: string): string {
  const d = endDate ? new Date(endDate) : new Date()
  d.setDate(d.getDate() - lookbackDays)
  return d.toISOString().slice(0, 10)
}

export async function fetchGateScoreTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
  endDate?: string,
): Promise<TimeSeriesPoint[]> {
  // Entry Gate スコア (0-100)。未集計の日付 (null) はチャートから除外。
  let query = supabase
    .from('market_conditions')
    .select('date, gate_score')
    .gte('date', startDateStr(lookbackDays, endDate))
    .order('date', { ascending: true })

  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data, error } = await query

  if (error || !data) return []

  // Number(null) === 0 の罠を避けるため null は事前に除外
  return (data as { date: string; gate_score: number | null }[])
    .filter((r) => r.gate_score != null)
    .map((r) => ({ time: r.date, value: Number(r.gate_score) }))
    .filter((p) => Number.isFinite(p.value))
}

export async function fetchAdvDecRatioTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
  endDate?: string,
): Promise<TimeSeriesPoint[]> {
  let query = supabase
    .from('market_conditions')
    .select('date, ad_ratio_10')
    .gte('date', startDateStr(lookbackDays, endDate))
    .order('date', { ascending: true })

  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data, error } = await query

  if (error || !data) return []

  // Number(null) === 0 になる罠を避けるため null は事前に除外
  return (data as { date: string; ad_ratio_10: number | null }[])
    .filter((r) => r.ad_ratio_10 != null)
    .map((r) => ({ time: r.date, value: Number(r.ad_ratio_10) }))
    .filter((p) => Number.isFinite(p.value))
}

export async function fetchAdvancesDeclinesTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
  endDate?: string,
): Promise<{ advances: TimeSeriesPoint[]; declines: TimeSeriesPoint[] }> {
  let query = supabase
    .from('market_conditions')
    .select('date, advances, declines')
    .gte('date', startDateStr(lookbackDays, endDate))
    .order('date', { ascending: true })

  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data, error } = await query

  if (error || !data) return { advances: [], declines: [] }

  const rows = data as {
    date: string
    advances: number | null
    declines: number | null
  }[]

  return {
    advances: rows
      .filter((r) => r.advances != null)
      .map((r) => ({ time: r.date, value: Number(r.advances) }))
      .filter((p) => Number.isFinite(p.value)),
    declines: rows
      .filter((r) => r.declines != null)
      .map((r) => ({ time: r.date, value: Number(r.declines) }))
      .filter((p) => Number.isFinite(p.value)),
  }
}

export async function fetchNhNlDiffTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
  endDate?: string,
): Promise<TimeSeriesPoint[]> {
  let query = supabase
    .from('market_conditions')
    .select('date, nh_nl_diff')
    .gte('date', startDateStr(lookbackDays, endDate))
    .order('date', { ascending: true })

  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data, error } = await query

  if (error || !data) return []

  return (data as { date: string; nh_nl_diff: number | null }[])
    .filter((r) => r.nh_nl_diff != null)
    .map((r) => ({ time: r.date, value: Number(r.nh_nl_diff) }))
    .filter((p) => Number.isFinite(p.value))
}

export async function fetchPctAboveSmaTimeSeries(
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
  endDate?: string,
): Promise<{ sma50: TimeSeriesPoint[]; sma200: TimeSeriesPoint[] }> {
  let query = supabase
    .from('market_conditions')
    .select('date, pct_above_sma50, pct_above_sma200')
    .gte('date', startDateStr(lookbackDays, endDate))
    .order('date', { ascending: true })

  if (endDate) {
    query = query.lte('date', endDate)
  }

  const { data, error } = await query

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
