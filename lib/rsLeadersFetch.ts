import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import { CHG_DAYS, SECTOR_DAYS, type RsLeader, type RsLeaderSector } from '@/types/rsLeaders'

export type RsLeadersSnapshot = {
  date: string | null      // rs_leaders の最新日
  rows: RsLeader[]
  /** 業種 × 日。最新日から SECTOR_DAYS 営業日ぶん (日付の昇順) */
  sectorDays: RsLeaderSector[]
  /** 業種RS の CHG_DAYS 営業日前からの変化 (code → 変化)。その日に行の無い銘柄は入らない */
  sectorRsChg: Map<string, number>
  error?: string | null
}

async function fetchLatestDate(table: string): Promise<{ date: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(table)
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) console.error(`[${table} latest date]`, error)
  return { date: (data?.date as string | undefined) ?? null, error: error ? error.message : null }
}

// 最新日の rs_leaders 全行 (1 日 約 300〜450 行。1000 行上限に備えてページング) と、
// rs_leaders_sector の直近 SECTOR_DAYS 営業日ぶん (33 行 × 63 日 ≒ 2,100 行)。
export async function fetchRsLeadersSnapshot(): Promise<RsLeadersSnapshot> {
  const [latest, latestSector] = await Promise.all([
    fetchLatestDate('rs_leaders'),
    fetchLatestDate('rs_leaders_sector'),
  ])
  const date = latest.date
  if (!date) return { date: null, rows: [], sectorDays: [], sectorRsChg: new Map(), error: latest.error ?? latestSector.error }

  const sectorEnd = latestSector.date
  const [stocks, sectors] = await Promise.all([
    fetchAllPaged<RsLeader>((from, to) =>
      supabase
        .from('rs_leaders')
        .select('*')
        .eq('date', date)
        .order('code', { ascending: true })
        .range(from, to),
    ),
    sectorEnd
      ? fetchAllPaged<RsLeaderSector>(
          (from, to) =>
            supabase
              .from('rs_leaders_sector')
              .select('date, sector_code, sector_s33, sector_rank, members, n_rs80, pct_rs80, strength_bench')
              .lte('date', sectorEnd)
              .order('date', { ascending: false })
              .order('sector_code', { ascending: true })
              .range(from, to),
          SECTOR_DAYS * 33,
        )
      : Promise.resolve({ rows: [] as RsLeaderSector[], error: null }),
  ])
  if (stocks.error) console.error('[rs_leaders]', stocks.error)
  if (sectors.error) console.error('[rs_leaders_sector]', sectors.error)

  // 降順で取った行から直近 SECTOR_DAYS 日ぶんだけ残し、昇順に直す
  const keep = new Set<string>()
  for (const r of sectors.rows) {
    if (keep.size >= SECTOR_DAYS && !keep.has(r.date)) break
    keep.add(r.date)
  }
  const sectorDays = sectors.rows.filter(r => keep.has(r.date)).reverse()

  // 業種RS の 5 営業日前からの変化。rs_chg5 は全体RS の変化しか無いので、
  // CHG_DAYS 営業日前 (営業日 = rs_leaders_sector にある日付) の rs_leaders と比べて作る。
  const days = [...keep].sort()
  const i = days.indexOf(date)
  const prevDate = i >= CHG_DAYS ? days[i - CHG_DAYS] : null
  const sectorRsChg = new Map<string, number>()
  let prevError: string | null = null
  if (prevDate) {
    const prev = await fetchAllPaged<{ code: string; sector_rs: number | null }>((from, to) =>
      supabase
        .from('rs_leaders')
        .select('code, sector_rs')
        .eq('date', prevDate)
        .order('code', { ascending: true })
        .range(from, to),
    )
    if (prev.error) console.error('[rs_leaders prev]', prev.error)
    prevError = prev.error
    const before = new Map(prev.rows.map(r => [r.code, r.sector_rs]))
    for (const r of stocks.rows) {
      const b = before.get(r.code)
      if (r.sector_rs !== null && b !== null && b !== undefined) sectorRsChg.set(r.code, r.sector_rs - b)
    }
  }

  return {
    date,
    rows: stocks.rows,
    sectorDays,
    sectorRsChg,
    error: [latest.error, latestSector.error, stocks.error, sectors.error, prevError].filter(Boolean).join(' / ') || null,
  }
}
