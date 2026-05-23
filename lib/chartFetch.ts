import { supabase } from '@/lib/supabase'
import type {
  ChartApiResponse,
  CounterTrendBar,
  OhlcvBar,
  StructurePivotPhase,
} from '@/types/chart'

const CODE_RE = /^[A-Z0-9]{4}$/i

export interface FetchChartOptions {
  /** Limit to the most recent N trading days (server-side via DB ORDER + LIMIT, then re-sorted ASC). Omit/null = full history. */
  lookbackDays?: number | null
}

const OHLCV_COLUMNS = 'date, open, high, low, close, volume'

// Per-bar columns we still need for the continuous Counter Trend line and to
// sniff phase boundaries.
const PER_BAR_OVERLAY_COLUMNS = [
  'date',
  'struct_long_phase_start_date',
  'struct_long_curr_pivot',
  'struct_long_prev_pivot',
  'struct_long_break_val',
  'struct_long_curr_pivot_date',
  'struct_long_prev_pivot_date',
  'sp_long_winning_length',
  'struct_long_just_broke',
  'struct_long_counter_trend_val',
].join(', ')

// One-shot warnings keep the console quiet when the new schema isn't live yet.
let warnedAboutMissingOverlay = false

/**
 * Client-side chart fetcher.
 *
 * The project is built with `output: "export"` (static hosting), so server-
 * side API routes can't run. We query Supabase directly from the browser
 * using the existing anon-key client.
 *
 * Three independent queries:
 *   1. Base OHLCV (always works)
 *   2. Per-bar Structure Pivot overlay (best-effort) — used to derive the
 *      phase list client-side and to feed the Counter Trend continuous line.
 *      We could push the GROUP BY to PostgREST, but the per-bar pull also
 *      gives us counter trend in the same round-trip.
 */
export async function fetchChart(
  code: string,
  opts: FetchChartOptions = {},
): Promise<ChartApiResponse> {
  if (!CODE_RE.test(code)) {
    throw new Error('invalid code (must be 4 alphanumeric)')
  }

  const lookback = opts.lookbackDays ?? null

  // ---- OHLCV (base) ----------------------------------------------------
  let ohlcvQ = supabase
    .from('chart_ohlcv_cache')
    .select(OHLCV_COLUMNS)
    .eq('code', code)

  ohlcvQ = lookback != null
    ? ohlcvQ.order('date', { ascending: false }).limit(lookback)
    : ohlcvQ.order('date', { ascending: true })

  const { data: ohlcvData, error: ohlcvErr } = await ohlcvQ
  if (ohlcvErr) throw new Error(ohlcvErr.message)

  const ohlcvRows = (ohlcvData ?? []) as unknown as Array<Record<string, unknown>>
  const ohlcvSorted = lookback != null ? [...ohlcvRows].reverse() : ohlcvRows

  const ohlcv: OhlcvBar[] = ohlcvSorted
    .filter(
      r =>
        r.date &&
        r.open != null &&
        r.high != null &&
        r.low != null &&
        r.close != null,
    )
    .map(r => ({
      date: r.date as string,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: r.volume != null ? Number(r.volume) : 0,
    }))

  // ---- Structure Pivot overlay (best-effort) ---------------------------
  let structurePivotPhases: StructurePivotPhase[] = []
  let counterTrend: CounterTrendBar[] = []
  try {
    let overlayQ = supabase
      .from('chart_ohlcv_cache')
      .select(PER_BAR_OVERLAY_COLUMNS)
      .eq('code', code)

    overlayQ = lookback != null
      ? overlayQ.order('date', { ascending: false }).limit(lookback)
      : overlayQ.order('date', { ascending: true })

    const { data: overlayData, error: overlayErr } = await overlayQ
    if (overlayErr) {
      if (!warnedAboutMissingOverlay) {
        warnedAboutMissingOverlay = true
        console.warn(
          '[structure-pivot] overlay columns unavailable in chart_ohlcv_cache:',
          overlayErr.message,
          '— chart will render without overlay until backend (21-Cloudl-Database) ships the new schema.',
        )
      }
    } else {
      const overlayRows =
        (overlayData ?? []) as unknown as Array<Record<string, unknown>>
      const overlaySorted = lookback != null ? [...overlayRows].reverse() : overlayRows

      counterTrend = overlaySorted
        .filter(r => r.date)
        .map(r => ({
          date: r.date as string,
          value:
            r.struct_long_counter_trend_val != null
              ? Number(r.struct_long_counter_trend_val)
              : null,
        }))

      structurePivotPhases = aggregatePhases(overlaySorted)
    }
  } catch (e) {
    if (!warnedAboutMissingOverlay) {
      warnedAboutMissingOverlay = true
      console.warn('[structure-pivot] overlay fetch failed:', e)
    }
  }

  return {
    code,
    ohlcv,
    structurePivotPhases,
    counterTrend,
    cockpit_rs: null,
    mc_v4: null,
  }
}

/**
 * Group the per-bar overlay rows by struct_long_phase_start_date — same
 * shape as the GROUP BY query in the spec, just folded client-side so we
 * only pay for one PostgREST round-trip.
 */
function aggregatePhases(
  rows: Array<Record<string, unknown>>,
): StructurePivotPhase[] {
  const byPhaseStart = new Map<string, Record<string, unknown>[]>()
  for (const r of rows) {
    const ps = r.struct_long_phase_start_date
    if (ps == null) continue
    const key = ps as string
    const bucket = byPhaseStart.get(key)
    if (bucket) bucket.push(r)
    else byPhaseStart.set(key, [r])
  }

  const phases: StructurePivotPhase[] = []
  for (const [phase_start_date, bucket] of byPhaseStart.entries()) {
    let phase_end_date = phase_start_date
    let curr_pivot_price: number | null = null
    let prev_pivot_price: number | null = null
    let curr_pivot_date: string | null = null
    let prev_pivot_date: string | null = null
    let break_val: number | null = null
    let length: number | null = null
    let broke_at: string | null = null

    for (const r of bucket) {
      const d = r.date as string | null
      if (d != null && d > phase_end_date) phase_end_date = d
      if (curr_pivot_price == null && r.struct_long_curr_pivot != null) {
        curr_pivot_price = Number(r.struct_long_curr_pivot)
      }
      if (prev_pivot_price == null && r.struct_long_prev_pivot != null) {
        prev_pivot_price = Number(r.struct_long_prev_pivot)
      }
      if (curr_pivot_date == null && r.struct_long_curr_pivot_date != null) {
        curr_pivot_date = r.struct_long_curr_pivot_date as string
      }
      if (prev_pivot_date == null && r.struct_long_prev_pivot_date != null) {
        prev_pivot_date = r.struct_long_prev_pivot_date as string
      }
      if (break_val == null && r.struct_long_break_val != null) {
        break_val = Number(r.struct_long_break_val)
      }
      if (length == null && r.sp_long_winning_length != null) {
        length = Number(r.sp_long_winning_length)
      }
      if (Boolean(r.struct_long_just_broke) && d != null) {
        broke_at = d
      }
    }

    if (curr_pivot_price == null || break_val == null || length == null) continue

    phases.push({
      phase_start_date,
      phase_end_date,
      curr_pivot_price,
      prev_pivot_price,
      curr_pivot_date,
      prev_pivot_date,
      break_val,
      length,
      broke_at,
    })
  }

  phases.sort((a, b) =>
    a.phase_start_date < b.phase_start_date ? -1 : 1,
  )
  return phases
}
