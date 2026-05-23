import { supabase } from './supabase'

export interface MfeMaeResult {
  mfe_price: number
  mfe_date: string
  mfe_pct: number
  mae_price: number
  mae_date: string
  mae_pct: number
}

/**
 * 保有期間中のMFE/MAEを daily_signals の終値から計算
 * daily_signals は (code, date, screen_name) で重複することがあるため、
 * (code, date) でユニーク化してから最高/最安を抽出する
 */
export async function calculateMfeMae(
  ticker: string,
  entryDate: string,
  exitDate: string,
  entryPrice: number,
): Promise<MfeMaeResult | null> {
  const { data, error } = await supabase
    .from('daily_signals')
    .select('date, close')
    .eq('code', ticker)
    .gte('date', entryDate)
    .lte('date', exitDate)
    .order('date', { ascending: true })

  if (error || !data || data.length === 0) {
    return null
  }

  // (code, date) ユニーク化: 同日複数行があっても close は同値のはずなので先勝ち
  const byDate = new Map<string, number>()
  for (const row of data as { date: string; close: number | null }[]) {
    if (row.close == null) continue
    if (!byDate.has(row.date)) byDate.set(row.date, row.close)
  }

  if (byDate.size === 0) return null

  let mfeDate = ''
  let mfePrice = -Infinity
  let maeDate = ''
  let maePrice = Infinity
  for (const [date, close] of byDate) {
    if (close > mfePrice) { mfePrice = close; mfeDate = date }
    if (close < maePrice) { maePrice = close; maeDate = date }
  }

  return {
    mfe_price: mfePrice,
    mfe_date:  mfeDate,
    mfe_pct:   ((mfePrice - entryPrice) / entryPrice) * 100,
    mae_price: maePrice,
    mae_date:  maeDate,
    mae_pct:   ((maePrice - entryPrice) / entryPrice) * 100,
  }
}

/**
 * 取り逃し率: MFE対比でどれだけ利益を逃したか (%)
 * MFE<=0 の場合は 0 を返す（取り逃しなし）
 */
export function calculateMissedRate(mfePct: number | null | undefined, pnlPct: number | null | undefined): number {
  if (mfePct == null || mfePct <= 0) return 0
  const pnl = pnlPct ?? 0
  return Math.max(0, ((mfePct - pnl) / mfePct) * 100)
}
