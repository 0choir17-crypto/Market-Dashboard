import { supabase } from '@/lib/supabase'
import type { DailyVcpScreen } from '@/types/vcp'
import type { StructurePivotRow } from '@/types/structurePivot'
import type { DailySignal } from '@/types/signals'
import { fetchStructurePivot } from '@/lib/structurePivotFetch'

export type TodayMarket = {
  date: string
  market_regime: string | null
  breadth_regime: string | null
  scorecard_regime: string | null
  mc_v4: number | null
  mc_regime_v4: string | null
  mc_divergence_flag_v4: number | null
}

export type TodayResponse = {
  vcpDate: string | null
  pivotDate: string | null
  signalsDate: string | null
  vcp: DailyVcpScreen[]
  pivot: StructurePivotRow[]
  signals: DailySignal[]
  market: TodayMarket | null
  hotSectors: string[]
}

const VCP_COLUMNS = `
  date, code, name, sector_s33,
  close, vcs_score, vcs_days_tight, cockpit_rs, adr_pct, turnover_50d_oku,
  dist_sma50, dist_sma200, ma_stack,
  daily_pct, weekly_pct, monthly_pct, volume, rvol, pct_from_20d_high, high_52w_pct,
  regime, mc_v4
`

const SIGNAL_COLUMNS = `
  date, code, company_name, screen_name, sector_s33,
  price_chg_1d, price_chg_5d, rs_composite, rvol, adr_pct,
  dist_ema21_r, dist_10wma_r, dist_50sma_r,
  high_52w_pct, stop_pct, hit_count,
  cockpit_rs, mansfield_rs,
  short_interest_ratio, short_position_change,
  mc_met, mc_condition
`

async function fetchVcp(date: string | null): Promise<{ date: string | null; rows: DailyVcpScreen[] }> {
  let targetDate = date
  if (!targetDate) {
    const { data: latest } = await supabase
      .from('daily_vcp_screen')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return { date: null, rows: [] }

  const { data, error } = await supabase
    .from('daily_vcp_screen')
    .select(VCP_COLUMNS)
    .eq('date', targetDate)
    .order('vcs_score', { ascending: false })

  if (error) {
    console.error('today vcp fetch error:', error)
    return { date: targetDate, rows: [] }
  }
  return { date: targetDate, rows: (data ?? []) as DailyVcpScreen[] }
}

async function fetchSignals(date: string | null): Promise<{ date: string | null; rows: DailySignal[] }> {
  let targetDate = date
  if (!targetDate) {
    const { data: latest } = await supabase
      .from('daily_signals')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return { date: null, rows: [] }

  const { data, error } = await supabase
    .from('daily_signals')
    .select(SIGNAL_COLUMNS)
    .eq('date', targetDate)
    .order('hit_count', { ascending: false })

  if (error) {
    console.error('today signals fetch error:', error)
    return { date: targetDate, rows: [] }
  }
  return { date: targetDate, rows: (data ?? []) as DailySignal[] }
}

async function fetchMarket(date: string | null, isLatest: boolean): Promise<TodayMarket | null> {
  let query = supabase
    .from('market_conditions')
    .select('date, market_regime, breadth_regime, scorecard_regime, mc_v4, mc_regime_v4, mc_divergence_flag_v4')

  if (isLatest || !date) {
    query = query.not('mc_v4', 'is', null).order('date', { ascending: false }).limit(1)
  } else {
    query = query.eq('date', date).limit(1)
  }

  const { data } = await query.maybeSingle()
  return (data as TodayMarket | null) ?? null
}

// "Hot" sectors = component_flow >= 70 (top ~30% by institutional net buy rank).
const HOT_FLOW_THRESHOLD = 70

async function fetchHotSectors(date: string | null): Promise<string[]> {
  let targetDate = date
  if (!targetDate) {
    const { data: latest } = await supabase
      .from('sector_selection_s33')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return []

  const { data, error } = await supabase
    .from('sector_selection_s33')
    .select('sector_name_s33, component_flow')
    .eq('date', targetDate)
    .gte('component_flow', HOT_FLOW_THRESHOLD)

  if (error || !data) return []
  return data.map(r => r.sector_name_s33 as string)
}

export async function fetchToday(opts: { date?: string }): Promise<TodayResponse> {
  const requested = opts.date ?? null
  const isLatest = !requested

  const [vcpRes, pivotRes, signalsRes, market, hotSectors] = await Promise.all([
    fetchVcp(requested),
    fetchStructurePivot({ date: requested ?? undefined, limit: 500 }),
    fetchSignals(requested),
    fetchMarket(requested, isLatest),
    fetchHotSectors(requested),
  ])

  return {
    vcpDate: vcpRes.date,
    pivotDate: pivotRes.date,
    signalsDate: signalsRes.date,
    vcp: vcpRes.rows,
    pivot: pivotRes.rows,
    signals: signalsRes.rows,
    market,
    hotSectors,
  }
}
