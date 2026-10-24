import { supabase } from './supabase'
import { fetchAllPaged } from './pagedFetch'
import { barsToCalendarDays } from './indicators'
import { computeTrendState, type ClosePoint, type TrendState } from './trendState'
import type { OhlcvBar, VolumeBar } from '@/types/chart'

// 33 業種の地合い判定。指数カードと同じ EMA9 / EMA21 の判定を業種指数の終値に掛け、
// 業種の自力 (self_t63 / self_t21) を最終日の値で添える。
//
// ⚠️ 業種指数の生カラムは直近 150 営業日ぶんしか非 null でない。それより古い日を
//    選ぶと終値が足りず判定できない（カードは「データが足りません」になる）。
// ⚠️ 150 本では TradingView と一致させるのに足りない線がある（lib/indicators.ts の emaWarmupBars）。
//    EMA9 / EMA21 は一致する。EMA50 は起点の影響が約 2%、週足 EMA9（約 30 週）は約 1% 残る。
//    完全に合わせるにはバッチ側で業種指数の履歴を延ばす必要がある。

const TABLE = 'sector_selection_s33'

const COLUMNS = 'date, sector_name_s33, sector_index_close_s33, self_t63, self_t21'

/** 詳細チャートで取る足数（生カラムが非 null の範囲） */
const SECTOR_CHART_BARS = 150

/**
 * 取得する暦日数。EMA を TradingView に近づけるため、あるだけ（150 営業日）すべて取り、
 * 詳細チャートと同じ足で判定する。33 業種 × 150 日 ≈ 5,000 行なのでページングする。
 */
const LOOKBACK_DAYS = barsToCalendarDays(SECTOR_CHART_BARS)

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
 * 業種指数の生カラムは直近 150 営業日しか非 null でないので、それ以上は取らない。
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
