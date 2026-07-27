import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import type { OhlcvBar } from '@/types/chart'
import type { SeriesPoint } from '@/lib/indicators'

const TABLE = 'sector_selection_s33'

// チャートに重ねられる 0-100 のスコア系指標。N(銘柄数) はスケールが違うため除外。
export const OVERLAY_METRICS = {
  composite_score: { label: 'Score', color: '#0ea5e9' },
  component_rs: { label: 'RS', color: '#6366f1' },
  component_acc: { label: 'Acc', color: '#ec4899' },
  component_breadth: { label: 'Brd', color: '#14b8a6' },
  component_short: { label: 'Sht', color: '#f97316' },
} as const

export type OverlayMetricKey = keyof typeof OVERLAY_METRICS

const METRIC_KEYS = Object.keys(OVERLAY_METRICS) as OverlayMetricKey[]

export type SectorChartEntry = {
  sector: string
  bars: OhlcvBar[]
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
 * 最長 EMA(150) の助走ぶん。EMA は先頭 length 本を seed に使うため、
 * 150本しか無いと EMA150 は最終足の 1 点しか描けない。表示したい本数に
 * 加えてこの本数を余分に取得する。
 */
const WARMUP_BARS = 150
const DEFAULT_LOOKBACK = VISIBLE_BARS + WARMUP_BARS

/**
 * 全業種ぶんの指数 OHLC + スコア系指標をまとめて取得する。
 *
 * 33業種 × 300日 ≈ 9,900 行で Supabase の 1000 行上限を超えるため、
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
        metrics: {
          composite_score: [],
          component_rs: [],
          component_acc: [],
          component_breadth: [],
          component_short: [],
        },
      }
    }
    const entry = bySector[sector]

    const o = num(r.sector_index_open_s33)
    const h = num(r.sector_index_high_s33)
    const l = num(r.sector_index_low_s33)
    const c = num(r.sector_index_close_s33)
    // 指数の生カラムは直近150営業日のみ非null。欠損日はローソク足から除外する。
    if (o != null && h != null && l != null && c != null) {
      entry.bars.push({ date, open: o, high: h, low: l, close: c, volume: 0 })
    }

    for (const key of METRIC_KEYS) {
      const v = num(r[key])
      if (v != null) entry.metrics[key].push({ time: date, value: v })
    }
  }

  return { bySector, error: null }
}
