import { supabase } from '@/lib/supabase'
import type {
  StructurePivotQuery,
  StructurePivotResponse,
  StructurePivotRow,
  StructurePivotSignalType,
  StructurePivotSummary,
  StructurePivotTier,
} from '@/types/structurePivot'

// The dashboard is built with `output: "export"` (static hosting), so true
// server-side API routes can't run. We query Supabase directly from the
// browser. The return shape mirrors what `GET /api/structure-pivot` would
// emit, so a future server variant can be swapped in without touching call
// sites. (Same convention as `lib/chartFetch.ts`.)

const TABLE = 'daily_structure_pivot_screen'

const COLUMNS = `
  date, code, name, sector_s33,
  signal_type, pivot_price, pivot_curr, break_dist_pct, days_in_setup,
  vcp_days_since, vcp_hit_date, vcp_within_21d,
  daily_signals_screens, daily_signals_last_hit, daily_signals_days_since,
  in_watchlist,
  close, volume, rvol, adr_pct, cockpit_rs, vcs_score, mc_v4, regime,
  is_premium, is_standard, quality_tier,
  jq_institutional_pass, jq_institutional_reason
`

const DEFAULT_LIMIT = 200

function emptySummary(): StructurePivotSummary {
  return {
    total: 0,
    by_tier: { S: 0, A: 0, B: 0 },
    by_signal: { HL_BREAK: 0, SETUP_LONG: 0 },
  }
}

function buildSummary(rows: StructurePivotRow[]): StructurePivotSummary {
  const summary = emptySummary()
  summary.total = rows.length
  for (const r of rows) {
    const t = r.quality_tier as StructurePivotTier
    if (t === 'S' || t === 'A' || t === 'B') summary.by_tier[t] += 1
    const s = r.signal_type as StructurePivotSignalType
    if (s === 'HL_BREAK' || s === 'SETUP_LONG') summary.by_signal[s] += 1
  }
  return summary
}

export async function fetchStructurePivotDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('date')
    .order('date', { ascending: false })
    .limit(500)

  if (error) {
    console.error('structure_pivot dates fetch error:', error)
    return []
  }

  const unique = [...new Set((data ?? []).map(r => r.date as string))]
  unique.sort((a, b) => (a > b ? -1 : 1))
  return unique
}

export async function fetchStructurePivot(
  opts: StructurePivotQuery = {},
): Promise<StructurePivotResponse> {
  const limit = opts.limit ?? DEFAULT_LIMIT

  let targetDate = opts.date ?? null
  if (!targetDate) {
    const { data: latest } = await supabase
      .from(TABLE)
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetDate = (latest?.date as string | undefined) ?? null
  }

  if (!targetDate) {
    return { date: null, rows: [], summary: emptySummary() }
  }

  let query = supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('date', targetDate)

  if (opts.tier && opts.tier !== 'all') {
    query = query.eq('quality_tier', opts.tier)
  }
  if (opts.signal && opts.signal !== 'all') {
    query = query.eq('signal_type', opts.signal)
  }
  if (opts.institutionalOnly) {
    query = query.eq('jq_institutional_pass', true)
  }

  // Ordering: tier S → A → B, signal HL_BREAK → SETUP_LONG, longer base first.
  query = query
    .order('quality_tier', { ascending: true })
    .order('signal_type', { ascending: false })
    .order('days_in_setup', { ascending: false })
    .limit(limit)

  const { data, error } = await query
  if (error) {
    console.error('structure_pivot fetch error:', error)
    return { date: targetDate, rows: [], summary: emptySummary() }
  }

  const rows = (data ?? []) as unknown as StructurePivotRow[]
  return { date: targetDate, rows, summary: buildSummary(rows) }
}
