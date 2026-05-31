import { supabase } from '@/lib/supabase'
import {
  normalizeScanRow,
  type RawScanResultRow,
  type ScanResultRow,
} from '@/types/scanResults'

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

async function fetchScan(date: string | null): Promise<{ date: string | null; rows: ScanResultRow[] }> {
  let targetDate = date

  if (!targetDate) {
    const { data: latest, error: latestErr } = await supabase
      .from('scan_results')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestErr) console.error('[scan_results] latest date error', latestErr)
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return { date: null, rows: [] }

  const initial = await supabase
    .from('scan_results')
    .select('*')
    .eq('date', targetDate)

  if (initial.error) {
    console.error('[scan_results] fetch error', initial.error)
    return { date: targetDate, rows: [] }
  }

  let data = initial.data

  // Fallback: snapshot date may not exist in scan_results (e.g. user picks
  // a date from market_conditions where scan didn't run). Fall back to the
  // most recent scan_results date <= requested.
  if (!data || data.length === 0) {
    const { data: nearest } = await supabase
      .from('scan_results')
      .select('date')
      .lte('date', targetDate)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nearestDate = (nearest?.date as string | undefined) ?? null
    if (nearestDate && nearestDate !== targetDate) {
      const fb = await supabase
        .from('scan_results')
        .select('*')
        .eq('date', nearestDate)
      if (fb.error) {
        console.error('[scan_results] fallback fetch error', fb.error)
        return { date: targetDate, rows: [] }
      }
      data = fb.data ?? []
      targetDate = nearestDate
    }
  }

  const rows = ((data ?? []) as RawScanResultRow[]).map(normalizeScanRow)
  rows.sort((a, b) => {
    const av = a.rs_topix_21d
    const bv = b.rs_topix_21d
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  })
  return { date: targetDate, rows }
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

// "Hot" sectors はかつて component_flow >= 70 (機関ネット買い上位) で判定していたが、
// jquants-scanner 移行で component_flow は廃止 (S33 業種別の機関フローデータが無いため)。
// 機能は供給停止 → 常に空。退役列へのクエリは行わない。
async function fetchHotSectors(): Promise<string[]> {
  return []
}

export async function fetchToday(opts: { date?: string }): Promise<TodayResponse> {
  const requested = opts.date ?? null
  const isLatest = !requested

  const [scanRes, market, hotSectors] = await Promise.all([
    fetchScan(requested),
    fetchMarket(requested, isLatest),
    fetchHotSectors(),
  ])

  return {
    scanDate: scanRes.date,
    scan: scanRes.rows,
    market,
    hotSectors,
  }
}
