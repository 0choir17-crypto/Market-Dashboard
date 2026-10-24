import { supabase } from './supabase'
import { computeTrendState, type ClosePoint, type TrendState } from './trendState'

// 3 指数（TOPIX / 日経225 / グロース250）の地合い判定。終値は market_conditions から取る。
// 日経・グロースは終値しか無いが、EMA の計算には終値だけあれば足りる。
//
// ⚠️ TOPIX の終値の列名は topix_close ではなく topix_price。

export type IndexKey = 'topix' | 'nikkei' | 'growth'

export const INDEXES: { key: IndexKey; label: string; column: string }[] = [
  { key: 'topix', label: 'TOPIX', column: 'topix_price' },
  { key: 'nikkei', label: '日経225', column: 'nikkei_price' },
  { key: 'growth', label: 'グロース250', column: 'growth_price' },
]

/**
 * 取得する暦日数。EMA50 の助走と週足 EMA9 の seed（9 週）に余裕を見て約 1 年強。
 * 営業日で 270 本前後なので Supabase の 1,000 行上限には掛からない。
 */
const LOOKBACK_DAYS = 400

export type IndexTrendResult = {
  states: Record<IndexKey, TrendState | null>
  error: string | null
}

function shiftDays(base: string | undefined, days: number): string {
  const d = base ? new Date(`${base}T00:00:00Z`) : new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** @param endDate 過去スナップショット表示時の終端日（省略時は最新まで） */
export async function fetchIndexTrends(endDate?: string): Promise<IndexTrendResult> {
  let q = supabase
    .from('market_conditions')
    .select(['date', ...INDEXES.map((i) => i.column)].join(', '))
    .gte('date', shiftDays(endDate, LOOKBACK_DAYS))
    .order('date', { ascending: true })
  if (endDate) q = q.lte('date', endDate)

  const { data, error } = await q
  const empty = { topix: null, nikkei: null, growth: null }
  if (error || !data) {
    if (error) console.error('[market_conditions index trend]', error)
    return { states: empty, error: error?.message ?? null }
  }

  const rows = data as unknown as Record<string, unknown>[]
  const states: Record<IndexKey, TrendState | null> = { ...empty }
  for (const idx of INDEXES) {
    const points: ClosePoint[] = []
    for (const r of rows) {
      // Number(null) === 0 になる罠を避けるため null は事前に除外
      const v = r[idx.column]
      if (v == null) continue
      const close = Number(v)
      if (Number.isFinite(close)) points.push({ date: r.date as string, close })
    }
    states[idx.key] = computeTrendState(points)
  }
  return { states, error: null }
}
