import { supabase } from './supabase'
import { fetchAllPaged } from './pagedFetch'
import type { OhlcvBar, VolumeBar } from '@/types/chart'
import type { IndexKey } from './indexTrendFetch'

// 3 指数（TOPIX / 日経225 / グロース250）のチャート + 市場出来高。
// すべて market_conditions（1行 = 営業日）から取る。
//
// ⚠️ 終値の列名は *_close ではなく *_price（既存カード用の名前を互換のため維持）。
// ⚠️ OHLC が揃っているのは TOPIX だけ。日経・グロースは終値しか無いので、
//    始値・高値・安値に終値を入れた足を返し（lineOnly = true）、チャートは終値の線で描く。
// ⚠️ market_volume はどの指数の出来高でもない。個別株（ETF/ETN/JDR/REIT を除く）の
//    出来高を全銘柄合算した値なので、ラベルは「市場出来高」とすること。
const TABLE = 'market_conditions'

const OHLC_COLUMNS: Record<IndexKey, { o?: string; h?: string; l?: string; c: string }> = {
  topix: { o: 'topix_open', h: 'topix_high', l: 'topix_low', c: 'topix_price' },
  nikkei: { c: 'nikkei_price' },
  growth: { c: 'growth_price' },
}

export type IndexRangeKey = '3m' | '6m' | '1y' | '3y' | 'all'

/** 表示レンジ。days=null は全期間（2008-05-08 〜）。 */
export const INDEX_RANGES: { key: IndexRangeKey; label: string; days: number | null }[] = [
  { key: '3m', label: '3M', days: 92 },
  { key: '6m', label: '6M', days: 183 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 1095 },
  { key: 'all', label: '全期間', days: null },
]

export const DEFAULT_INDEX_RANGE: IndexRangeKey = '6m'

/**
 * EMA150 の助走ぶん。EMA は先頭 length 本を seed に使うため、表示したい期間の
 * 手前に余分な足が要る。150営業日 ≈ 220暦日 なので余裕を見て 260日。
 */
const WARMUP_DAYS = 260

export type IndexChartData = {
  /** 助走ぶんを含む全足（EMA 計算用） */
  bars: OhlcvBar[]
  /** bars と同じ日付の市場出来高（株） */
  volumes: VolumeBar[]
  /** 選択レンジに入る足数。チャートはこの本数だけを初期表示する */
  visibleBars: number
  /** true = 終値しか無い（線で描く） */
  lineOnly: boolean
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

/**
 * 指数の OHLC（または終値）+ 市場出来高を取得する。
 *
 * @param range 表示レンジ。'all' は 2008-05-08 以降の全 4,469 行（要ページング）。
 * @param endDate 過去スナップショット表示時の終端日（省略時は最新まで）。
 */
export async function fetchIndexChartData(
  index: IndexKey,
  range: IndexRangeKey = DEFAULT_INDEX_RANGE,
  endDate?: string,
): Promise<IndexChartData> {
  const cols = OHLC_COLUMNS[index]
  const lineOnly = !cols.o
  const columns = ['date', cols.o, cols.h, cols.l, cols.c, 'market_volume', 'market_volume_ma20']
    .filter(Boolean)
    .join(', ')
  const rangeDays = INDEX_RANGES.find((r) => r.key === range)?.days ?? null
  // レンジの開始日（表示したい左端）と、その手前の助走ぶんの開始日
  const windowStart = rangeDays == null ? null : shiftDays(endDate, rangeDays)
  const fetchStart = rangeDays == null ? null : shiftDays(endDate, rangeDays + WARMUP_DAYS)

  const { rows, error } = await fetchAllPaged<Record<string, unknown>>((from, to) => {
    let q = supabase.from(TABLE).select(columns).order('date', { ascending: true })
    if (fetchStart) q = q.gte('date', fetchStart)
    if (endDate) q = q.lte('date', endDate)
    return q.range(from, to) as unknown as PromiseLike<{
      data: Record<string, unknown>[] | null
      error: { message: string } | null
    }>
  })

  if (error) {
    console.error('[market_conditions index chart]', error)
    return { bars: [], volumes: [], visibleBars: 0, lineOnly, error }
  }

  const bars: OhlcvBar[] = []
  const volumes: VolumeBar[] = []

  for (const r of rows) {
    const date = r.date as string | null
    if (!date) continue
    const c = num(r[cols.c]) // ← *_close ではない
    const o = cols.o ? num(r[cols.o]) : c
    const h = cols.h ? num(r[cols.h]) : c
    const l = cols.l ? num(r[cols.l]) : c
    const vol = num(r.market_volume)
    // OHLC が 1 本でも欠ける日は足を描けない（TOPIX は 2008-05-08 以降全行揃っている）
    if (o == null || h == null || l == null || c == null) continue

    bars.push({ date, open: o, high: h, low: l, close: c, volume: vol ?? 0 })

    // 売買不成立日など出来高が NULL の日はバーを描かない（0 として描かない）
    if (vol != null) {
      const ma20 = num(r.market_volume_ma20)
      volumes.push({
        date,
        volume: vol,
        ratio: ma20 != null && ma20 > 0 ? vol / ma20 : null,
      })
    }
  }

  const visibleBars = windowStart
    ? bars.filter((b) => b.date >= windowStart).length
    : bars.length

  return { bars, volumes, visibleBars, lineOnly, error: null }
}
