import { supabase } from './supabase'
import { barsToCalendarDays, emaWarmupBars } from './indicators'
import { SLOPE_LOOKBACK, computeTrendState, type ClosePoint, type TrendState } from './trendState'

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
 * 取得する暦日数。EMA50 が向き（SLOPE_LOOKBACK 本前）まで TradingView の値に収束する本数
 * （約 230 本 ≈ 370 暦日。週足 EMA9 の 40 週もこれに収まる）。理由は lib/indicators.ts の emaWarmupBars。
 * Supabase の 1,000 行上限には掛からない。
 */
const LOOKBACK_DAYS = barsToCalendarDays(emaWarmupBars(50) + SLOPE_LOOKBACK)

/** 終値と EMA9 / 21 / 50 の距離（R）。market_conditions の {key}_ext_ema{9,21,50}。バッチ側で計算済み */
export type ExtR = { ema9: number | null; ema21: number | null; ema50: number | null }

export type IndexTrendResult = {
  states: Record<IndexKey, TrendState | null>
  /** 最終日（endDate 以前で最新の行）の EMA からの距離。取れなければ null */
  ext: Record<IndexKey, ExtR | null>
  error: string | null
}

const EXT_COLUMNS = INDEXES.flatMap((i) => [9, 21, 50].map((n) => `${i.key}_ext_ema${n}`))

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 最終日の EMA 距離（R）。判定とは別の問い合わせにする:
 * 列がまだ無い・取れないときも、判定のカードは出し続けるため（距離は「—」になる）。
 */
async function fetchIndexExt(endDate?: string): Promise<Record<IndexKey, ExtR | null>> {
  const empty = { topix: null, nikkei: null, growth: null }
  let q = supabase
    .from('market_conditions')
    .select(['date', ...EXT_COLUMNS].join(', '))
    .order('date', { ascending: false })
    .limit(1)
  if (endDate) q = q.lte('date', endDate)
  const { data, error } = await q
  if (error || !data || data.length === 0) {
    if (error) console.error('[market_conditions index ext]', error)
    return empty
  }
  const r = data[0] as unknown as Record<string, unknown>
  const out: Record<IndexKey, ExtR | null> = { ...empty }
  for (const idx of INDEXES) {
    out[idx.key] = {
      ema9: num(r[`${idx.key}_ext_ema9`]),
      ema21: num(r[`${idx.key}_ext_ema21`]),
      ema50: num(r[`${idx.key}_ext_ema50`]),
    }
  }
  return out
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

  const [{ data, error }, ext] = await Promise.all([q, fetchIndexExt(endDate)])
  const empty = { topix: null, nikkei: null, growth: null }
  if (error || !data) {
    if (error) console.error('[market_conditions index trend]', error)
    return { states: empty, ext, error: error?.message ?? null }
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
  return { states, ext, error: null }
}
