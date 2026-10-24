import { supabase } from './supabase'
import { fetchAllPaged } from './pagedFetch'
import { barsToCalendarDays, emaWarmupBars } from './indicators'
import { SLOPE_LOOKBACK, computeTrendState, type ClosePoint, type TrendState } from './trendState'
import type { OhlcvBar, VolumeBar } from '@/types/chart'

// 33 業種の地合い判定。指数カードと同じ EMA9 / EMA21 の判定を業種指数の終値に掛け、
// 業種の自力 (self_t63 / self_t21) を最終日の値で添える。
//
// 業種指数の四本値は 2008-05-07 以降すべて埋まっている（2026-10 に全期間を入れ直した）。
// 取る本数は EMA が TradingView と同じ値になる助走から決める（lib/indicators.ts の emaWarmupBars）。

const TABLE = 'sector_selection_s33'

const COLUMNS = 'date, sector_name_s33, sector_index_close_s33, self_t63, self_t21'

/** 詳細チャートで初期表示する足数 */
export const SECTOR_CHART_VISIBLE_BARS = 150

/**
 * 詳細チャートで取る足数。表示ぶんの手前に、モーダルで引く最長の EMA50 の助走（223 本）を足す。
 * 降順 limit 1 回で取るので Supabase の 1,000 行上限に収まること。
 */
const SECTOR_CHART_BARS = SECTOR_CHART_VISIBLE_BARS + emaWarmupBars(50)

/**
 * 判定に取る暦日数。EMA50 が向き（SLOPE_LOOKBACK 本前）まで TradingView の値に収束する本数
 * （約 230 本 ≈ 370 暦日。週足 EMA9 の 40 週もこれに収まる）。指数カードと同じ。
 * 33 業種 × 約 250 日 ≈ 8,000 行なのでページングする。
 */
const LOOKBACK_DAYS = barsToCalendarDays(emaWarmupBars(50) + SLOPE_LOOKBACK)

export type SectorTrend = {
  sector: string
  state: TrendState | null
  /** 最終日の業種の自力。無ければ null */
  selfT63: number | null
  selfT21: number | null
}

export type SectorTrendResult = {
  sectors: SectorTrend[]
  /** 判定に使った最終日（全業種の最大 date） */
  latestDate: string | null
  error: string | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function shiftDays(base: string | undefined, days: number): string {
  const d = base ? new Date(`${base}T00:00:00Z`) : new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** @param endDate 過去スナップショット表示時の終端日（省略時は最新まで） */
export async function fetchSectorTrends(endDate?: string): Promise<SectorTrendResult> {
  const start = shiftDays(endDate, LOOKBACK_DAYS)
  const { rows, error } = await fetchAllPaged<Record<string, unknown>>((from, to) => {
    let q = supabase
      .from(TABLE)
      .select(COLUMNS)
      .gte('date', start)
      .order('date', { ascending: true })
      .order('sector_name_s33', { ascending: true })
    if (endDate) q = q.lte('date', endDate)
    return q.range(from, to) as unknown as PromiseLike<{
      data: Record<string, unknown>[] | null
      error: { message: string } | null
    }>
  })

  if (error) {
    console.error('[sector_selection_s33 trend]', error)
    return { sectors: [], latestDate: null, error }
  }

  const bySector = new Map<string, { points: ClosePoint[]; last: Record<string, unknown> }>()
  let latestDate: string | null = null
  for (const r of rows) {
    const sector = r.sector_name_s33 as string | null
    const date = r.date as string | null
    if (!sector || !date) continue
    if (!latestDate || date > latestDate) latestDate = date
    let entry = bySector.get(sector)
    if (!entry) {
      entry = { points: [], last: r }
      bySector.set(sector, entry)
    }
    entry.last = r // 昇順なので最後に来た行が最終日
    const close = num(r.sector_index_close_s33)
    if (close != null) entry.points.push({ date, close })
  }

  const sectors: SectorTrend[] = []
  for (const [sector, { points, last }] of bySector) {
    // 最終日に行が無い業種（上場廃止などで途切れた）は自力を出さない
    const isLatest = last.date === latestDate
    sectors.push({
      sector,
      state: computeTrendState(points),
      selfT63: isLatest ? num(last.self_t63) : null,
      selfT21: isLatest ? num(last.self_t21) : null,
    })
  }
  return { sectors, latestDate, error: null }
}

/**
 * 1 業種ぶんの OHLC + 出来高（詳細モーダルのチャート用）。
 * EMA の助走ぶんを含むので、チャートには SECTOR_CHART_VISIBLE_BARS を渡して右端だけ表示する。
 */
export async function fetchSectorChart(
  sector: string,
  endDate?: string,
): Promise<{ bars: OhlcvBar[]; volumes: VolumeBar[]; error: string | null }> {
  let q = supabase
    .from(TABLE)
    .select(
      'date, sector_index_open_s33, sector_index_high_s33, sector_index_low_s33, sector_index_close_s33, sector_volume_s33, sector_volume_ma20_s33',
    )
    .eq('sector_name_s33', sector)
    .order('date', { ascending: false })
    .limit(SECTOR_CHART_BARS)
  if (endDate) q = q.lte('date', endDate)

  const { data, error } = await q
  if (error) {
    console.error('[sector_selection_s33 chart]', error)
    return { bars: [], volumes: [], error: error.message }
  }
  const bars: OhlcvBar[] = []
  const volumes: VolumeBar[] = []
  for (const r of ((data ?? []) as Record<string, unknown>[]).reverse()) {
    const date = r.date as string
    const o = num(r.sector_index_open_s33)
    const h = num(r.sector_index_high_s33)
    const l = num(r.sector_index_low_s33)
    const c = num(r.sector_index_close_s33)
    if (o == null || h == null || l == null || c == null) continue
    const vol = num(r.sector_volume_s33)
    bars.push({ date, open: o, high: h, low: l, close: c, volume: vol ?? 0 })
    if (vol != null) {
      const ma20 = num(r.sector_volume_ma20_s33)
      volumes.push({ date, volume: vol, ratio: ma20 != null && ma20 > 0 ? vol / ma20 : null })
    }
  }
  return { bars, volumes, error: null }
}
