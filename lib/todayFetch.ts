import { supabase } from '@/lib/supabase'
import type { ScanResultRow } from '@/types/scanResults'

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
  scanDate: string | null
  scan: ScanResultRow[]
  market: TodayMarket | null
  hotSectors: string[]
}

const SCAN_COLUMNS = `
  date, code, signal, name, sector,
  rs_topix_21d, rs_sector_21d, atr_ext_sma50
`

async function fetchScan(date: string | null): Promise<{ date: string | null; rows: ScanResultRow[] }> {
  let targetDate = date
  if (!targetDate) {
    const { data: latest } = await supabase
      .from('scan_results')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return { date: null, rows: [] }

  const { data, error } = await supabase
    .from('scan_results')
    .select(SCAN_COLUMNS)
    .eq('date', targetDate)
    .order('rs_topix_21d', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('today scan_results fetch error:', error)
    return { date: targetDate, rows: [] }
  }
  return { date: targetDate, rows: (data ?? []) as ScanResultRow[] }
}

async function fetchMarket(date: string | null, isLatest: boolean): Promise<TodayMarket | null> {
  const baseSelect = 'date, market_regime, breadth_regime, scorecard_regime, mc_v4, mc_regime_v4, mc_divergence_flag_v4'

  if (isLatest || !date) {
    const primary = await supabase
      .from('market_conditions')
      .select(baseSelect)
      .not('mc_v4', 'is', null)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (primary.data) return primary.data as TodayMarket

    const fallback = await supabase
      .from('market_conditions')
      .select(baseSelect)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (fallback.data as TodayMarket | null) ?? null
  }

  const { data } = await supabase
    .from('market_conditions')
    .select(baseSelect)
    .eq('date', date)
    .limit(1)
    .maybeSingle()
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

  const [scanRes, market, hotSectors] = await Promise.all([
    fetchScan(requested),
    fetchMarket(requested, isLatest),
    fetchHotSectors(requested),
  ])

  return {
    scanDate: scanRes.date,
    scan: scanRes.rows,
    market,
    hotSectors,
  }
}
