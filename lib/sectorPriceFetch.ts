import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import type { OhlcvBar, VolumeBar } from '@/types/chart'
import { emaWarmupBars, type SeriesPoint } from '@/lib/indicators'
import { OVERLAY_SERIES } from '@/lib/chartColors'

const TABLE = 'sector_selection_s33'

// チャートに重ねられる指標 = 業種の自力の t 値 2 本。
export const OVERLAY_METRICS = {
  self_t63: { label: 'Self t63', color: OVERLAY_SERIES.selfT63 },
  self_t21: { label: 'Self t21', color: OVERLAY_SERIES.selfT21 },
} as const

export type OverlayMetricKey = keyof typeof OVERLAY_METRICS

const METRIC_KEYS = Object.keys(OVERLAY_METRICS) as OverlayMetricKey[]

export type SectorChartEntry = {
  sector: string
  bars: OhlcvBar[]
  /** 出来高バー（株）。bars と同じ日付だけを持つ */
  volumes: VolumeBar[]
  /** 指標キー → 時系列（チャート重ね描き用） */
  metrics: Record<OverlayMetricKey, SeriesPoint[]>
}

export type AllSectorPriceResponse = {
  /** sector_name_s33 → チャートデータ */
  bySector: Record<string, SectorChartEntry>
  error: string | null
}

const COLUMNS = [
  'date',
  'sector_name_s33',
  'sector_index_open_s33',
  'sector_index_high_s33',
  'sector_index_low_s33',
  'sector_index_close_s33',
  'sector_volume_s33',
  'sector_volume_ma20_s33',
  ...METRIC_KEYS,
].join(', ')

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** チャートに出したい本数（この範囲を初期表示する） */
export const VISIBLE_BARS = 150
/**
 * 最長 EMA(150) の助走ぶん（669 本）。表示したい本数の手前にこの本数を余分に取り、
 * 表示範囲の左端から EMA150 を TradingView と同じ値にする（lib/indicators.ts の emaWarmupBars）。
 */
const WARMUP_BARS = emaWarmupBars(150)
const DEFAULT_LOOKBACK = VISIBLE_BARS + WARMUP_BARS

/**
 * 全業種ぶんの指数 OHLC + 業種の自力 (self_t63 / self_t21) をまとめて取得する。
 *
 * 33業種 × 約 820日 ≈ 2.7万行で Supabase の 1000 行上限を超えるため、
 * 安定順序 (date, sector) でページングする。1業種ずつ 33 回叩くより往復が少ない。
 *
 * @param referenceSector 境界日の算出に使う代表業種。渡すと Phase 1 が
 *   1 リクエストで済む（全業種を舐めると 33 倍の行を読むことになる）。
 */
export async function fetchAllSectorPriceHistory(
  lookbackDays = DEFAULT_LOOKBACK,
  referenceSector?: string,
): Promise<AllSectorPriceResponse> {
  // Phase 1: 直近 N 営業日の境界日を求める（日付だけを新しい順に読む）。
  // 代表業種が分かっていれば 1 日 1 行なので limit だけで足りる。
  let dateRows: { date: string }[]
  if (referenceSector) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('date')
      .eq('sector_name_s33', referenceSector)
      .order('date', { ascending: false })
      .limit(lookbackDays)
    if (error) {
      console.error('[sector_selection_s33 price/dates]', error)
      return { bySector: {}, error: error.message }
    }
    dateRows = (data ?? []) as { date: string }[]
  } else {
    const { rows, error: dateErr } = await fetchAllPaged<{ date: string }>(
      (from, to) =>
        supabase
          .from(TABLE)
          .select('date')
          .order('date', { ascending: false })
          .order('sector_name_s33', { ascending: true })
          .range(from, to),
      lookbackDays * 40, // 33業種 + 余裕
    )
    if (dateErr) {
      console.error('[sector_selection_s33 price/dates]', dateErr)
      return { bySector: {}, error: dateErr }
    }
    dateRows = rows
  }

  const uniqueDates = [...new Set(dateRows.map((r) => r.date))].sort((a, b) =>
    a > b ? -1 : 1,
  )
  if (uniqueDates.length === 0) return { bySector: {}, error: null }
  const minDate = uniqueDates.slice(0, lookbackDays).at(-1) as string

  // Phase 2: その範囲の全業種の行を昇順で取得
  const { rows, error } = await fetchAllPaged<Record<string, unknown>>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select(COLUMNS)
        .gte('date', minDate)
        .order('date', { ascending: true })
        .order('sector_name_s33', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: Record<string, unknown>[] | null
        error: { message: string } | null
      }>,
  )

  if (error) {
    console.error('[sector_selection_s33 price]', error)
    return { bySector: {}, error }
  }

  const bySector: Record<string, SectorChartEntry> = {}

  for (const r of rows) {
    const sector = r.sector_name_s33 as string | null
    const date = r.date as string | null
    if (!sector || !date) continue

    if (!bySector[sector]) {
      bySector[sector] = {
        sector,
        bars: [],
        volumes: [],
        metrics: { self_t63: [], self_t21: [] },
      }
    }
    const entry = bySector[sector]

    const o = num(r.sector_index_open_s33)
    const h = num(r.sector_index_high_s33)
    const l = num(r.sector_index_low_s33)
    const c = num(r.sector_index_close_s33)
    // 四本値は 2008-05-07 以降すべて埋まっている（2026-10 に全期間を入れ直した）。念のため欠損日は足から除く。
    const vol = num(r.sector_volume_s33)
    if (o != null && h != null && l != null && c != null) {
      entry.bars.push({ date, open: o, high: h, low: l, close: c, volume: vol ?? 0 })

      // 出来高（株）はローソク足より過去まで埋まっているが、同じ日付軸に重ねるので
      // 足がある日だけを持つ。売買不成立日（2020-10-01）などの NULL はバーを描かない。
      if (vol != null) {
        const ma20 = num(r.sector_volume_ma20_s33)
        entry.volumes.push({
          date,
          volume: vol,
          ratio: ma20 != null && ma20 > 0 ? vol / ma20 : null,
        })
      }
    }

    for (const key of METRIC_KEYS) {
      const v = num(r[key])
      if (v != null) entry.metrics[key].push({ time: date, value: v })
    }
  }

  return { bySector, error: null }
}
