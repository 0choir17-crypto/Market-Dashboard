import { supabase } from './supabase'
import { barsToCalendarDays, emaWarmupBars } from './indicators'
import type { ExtValues } from '@/types/market'
import { EXT_DIFF_DAYS, EXT_HIST_DAYS, type ExtPoint } from '@/types/sectorSelection'
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

const NULL_EXT: ExtValues = { v9: null, v21: null, v50: null }

/** EMA9 / 21 / 50 それぞれの推移 */
export type ExtHist = { h9: ExtPoint[]; h21: ExtPoint[]; h50: ExtPoint[] }

const EMPTY_HIST: ExtHist = { h9: [], h21: [], h50: [] }

export type IndexExtRecent = {
  /** EMA9 / 21 / 50 距離（R）の 5 営業日前からの変化（最終日 − 5 行前） */
  diffs: Record<IndexKey, ExtValues>
  /** EMA9 / 21 / 50 距離（R）の直近 20 営業日の推移（古い順） */
  hist: Record<IndexKey, ExtHist>
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 3 指数の EMA 距離（R）の直近の動き: 5 営業日前からの変化と、EMA9 / 21 / 50 の 20 営業日の推移。
 * 判定とは別の問い合わせにする（取れなくても判定・R は出し、変化と推移だけ空にする）。
 * @param endDate 過去スナップショット表示時の終端日（省略時は最新）
 */
export async function fetchIndexExtRecent(endDate?: string): Promise<IndexExtRecent> {
  const empty: IndexExtRecent = {
    diffs: { topix: NULL_EXT, nikkei: NULL_EXT, growth: NULL_EXT },
    hist: { topix: EMPTY_HIST, nikkei: EMPTY_HIST, growth: EMPTY_HIST },
  }
  const cols = INDEXES.flatMap((i) => [9, 21, 50].map((n) => `${i.key}_ext_ema${n}`))
  let q = supabase
    .from('market_conditions')
    .select(['date', ...cols].join(', '))
    .order('date', { ascending: false })
    .limit(Math.max(EXT_DIFF_DAYS + 1, EXT_HIST_DAYS))
  if (endDate) q = q.lte('date', endDate)
  const { data, error } = await q
  if (error || !data || data.length === 0) {
    if (error) console.error('[market_conditions index ext recent]', error)
    return empty
  }
  const rows = data as unknown as Record<string, unknown>[] // 新しい順
  const cur = rows[0]
  const prev = rows.length > EXT_DIFF_DAYS ? rows[EXT_DIFF_DAYS] : null
  const diff = (col: string): number | null => {
    if (!prev) return null
    const a = num(cur[col])
    const b = num(prev[col])
    return a != null && b != null ? a - b : null
  }
  const out: IndexExtRecent = { diffs: { ...empty.diffs }, hist: { ...empty.hist } }
  for (const idx of INDEXES) {
    out.diffs[idx.key] = {
      v9: diff(`${idx.key}_ext_ema9`),
      v21: diff(`${idx.key}_ext_ema21`),
      v50: diff(`${idx.key}_ext_ema50`),
    }
    const recent = rows.slice(0, EXT_HIST_DAYS).reverse()
    const h = (n: number): ExtPoint[] => recent.map((r) => ({ date: r.date as string, v: num(r[`${idx.key}_ext_ema${n}`]) }))
    out.hist[idx.key] = { h9: h(9), h21: h(21), h50: h(50) }
  }
  return out
}
