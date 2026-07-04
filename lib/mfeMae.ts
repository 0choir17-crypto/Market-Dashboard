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
 *
 * 制約: daily_signals には終値しか無いため日中の高値/安値は拾えず、
 * 特にストップ執行日の下ヒゲが欠落して MAE が系統的に過小になる。
 * 実際の約定価格（exitPrice）は確実に「経験した価格」なので、渡された
 * 場合は候補に含める — これで「MAE が実現損より良い」矛盾は起きなくなる。
 */
export async function calculateMfeMae(
  ticker: string,
  entryDate: string,
  exitDate: string,
  entryPrice: number,
  exitPrice?: number | null,
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

  // 実際の約定価格を exitDate の候補として上書き（終値より優先）
  if (exitPrice != null && Number.isFinite(exitPrice)) {
    byDate.set(exitDate, exitPrice)
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
