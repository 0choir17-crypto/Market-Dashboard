import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
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

// 日付ピッカー用。テーブルは 1 日あたり最大 ~200 行入るので、行数 limit だと
// 数日分しかカバーできない。distinct な日付が maxDates 件集まるまで安定順序
// (date desc, code asc) で .range() ページングし、集まり次第打ち切る。
export async function fetchStructurePivotDates(maxDates = 60): Promise<string[]> {
  const PAGE = 1000
  const seen = new Set<string>()
  const dates: string[] = [] // date desc で走査するので降順のまま溜まる
  for (let from = 0; dates.length < maxDates; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('date')
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('structure_pivot dates fetch error:', error)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data) {
      const d = r.date as string
      if (!seen.has(d)) {
        seen.add(d)
        dates.push(d)
        if (dates.length >= maxDates) break
      }
    }
    if (data.length < PAGE) break
  }
  return dates
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

  // PostgREST は enum の任意順 (tier S→A→B, signal HL_BREAK→SETUP_LONG) を表現
  // できない (アルファベット順だと A→B→S になり、limit 到達時に最重要の S/HL_BREAK
  // 行から落ちる)。そこでサーバー側は安定順序 (code asc; PK = date + code) で
  // 全件ページング取得し、クライアント側で意図した優先度に並べ替えてから表示上限
  // に切り詰める。summary は切り詰め前の全件で数える。
  const buildQuery = (from: number, to: number) => {
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

    return query.order('code', { ascending: true }).range(from, to)
  }

  const { rows: fetched, error } = await fetchAllPaged<Record<string, unknown>>(
    buildQuery,
    10_000,
  )
  if (error) {
    console.error('structure_pivot fetch error:', error)
    return { date: targetDate, rows: [], summary: emptySummary() }
  }

  const allRows = fetched as unknown as StructurePivotRow[]

  // Intended priority: tier S → A → B, signal HL_BREAK → SETUP_LONG, longer base first.
  const tierRank: Record<string, number> = { S: 0, A: 1, B: 2 }
  const signalRank: Record<string, number> = { HL_BREAK: 0, SETUP_LONG: 1 }
  allRows.sort((a, b) => {
    const t = (tierRank[a.quality_tier] ?? 9) - (tierRank[b.quality_tier] ?? 9)
    if (t !== 0) return t
    const s = (signalRank[a.signal_type] ?? 9) - (signalRank[b.signal_type] ?? 9)
    if (s !== 0) return s
    const d = (b.days_in_setup ?? -1) - (a.days_in_setup ?? -1)
    if (d !== 0) return d
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
  })

  return {
    date: targetDate,
    rows: allRows.slice(0, limit),
    summary: buildSummary(allRows),
  }
}
