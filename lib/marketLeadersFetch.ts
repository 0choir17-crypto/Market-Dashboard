import { supabase } from '@/lib/supabase'
import type { MarketLeader } from '@/types/marketLeaders'

const TABLE = 'market_leaders'

// select('*') で供給側 (jquants-scanner) のスキーマ増減に耐性を持たせる。
// 退役された列が DROP されても select 全体が落ちない (sectors33 と同方針)。

export type LeadersSnapshot = {
  latestDate: string | null
  prevDate: string | null         // 前営業日 (View E 用)
  rows: MarketLeader[]
}

// ── View A: 最新日の Top50 (+ 新顔判定用に前営業日も取得) ──────────────
// テーブルは 直近 5 営業日 × 50 銘柄 = 250 行 を upsert する設計なので
// limit 300 で 5-6 営業日分を一括取得し、最新2日を抽出する。
export async function fetchLatestLeaders(): Promise<LeadersSnapshot> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('date', { ascending: false })
    .order('market_rank', { ascending: true })
    .limit(300)

  if (error || !data || data.length === 0) {
    if (error) console.error('[market_leaders latest]', error)
    return { latestDate: null, prevDate: null, rows: [] }
  }

  const rows = data as unknown as MarketLeader[]
  const uniqueDates = [...new Set(rows.map(r => r.date))].sort((a, b) => (a > b ? -1 : 1))
  const latestDate = uniqueDates[0] ?? null
  const prevDate = uniqueDates[1] ?? null

  return {
    latestDate,
    prevDate,
    rows: rows.filter(r => r.date === latestDate),
  }
}

// ── View C: 過去 30 日で top10 入賞日数ランキング ──────────────────────
export type ConsecutiveLeader = {
  code: string
  coname: string | null
  s33nm: string | null
  scalecat: string | null
  days_in_top10: number
  best_rank: number
  latest_rank: number | null
  latest_cs_avg: number | null
}

export async function fetchConsecutiveTop10(days = 30, limit = 30): Promise<ConsecutiveLeader[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .gte('date', sinceStr)
    .lte('market_rank', 10)
    .order('date', { ascending: false })

  if (error || !data) {
    if (error) console.error('[market_leaders consecutive]', error)
    return []
  }

  const rows = data as unknown as MarketLeader[]
  const latestDate = rows.reduce<string | null>((acc, r) => (acc === null || r.date > acc ? r.date : acc), null)

  const byCode = new Map<string, {
    code: string
    coname: string | null
    s33nm: string | null
    scalecat: string | null
    days: Set<string>
    best: number
    latest_rank: number | null
    latest_cs_avg: number | null
  }>()

  for (const r of rows) {
    const cur = byCode.get(r.code)
    const rank = r.market_rank ?? 999
    if (!cur) {
      byCode.set(r.code, {
        code: r.code,
        coname: r.coname,
        s33nm: r.s33nm,
        scalecat: r.scalecat,
        days: new Set([r.date]),
        best: rank,
        latest_rank: r.date === latestDate ? rank : null,
        latest_cs_avg: r.date === latestDate ? r.cs_avg : null,
      })
    } else {
      cur.days.add(r.date)
      if (rank < cur.best) cur.best = rank
      if (r.date === latestDate) {
        cur.latest_rank = rank
        cur.latest_cs_avg = r.cs_avg
      }
    }
  }

  const out: ConsecutiveLeader[] = Array.from(byCode.values()).map(v => ({
    code: v.code,
    coname: v.coname,
    s33nm: v.s33nm,
    scalecat: v.scalecat,
    days_in_top10: v.days.size,
    best_rank: v.best,
    latest_rank: v.latest_rank,
    latest_cs_avg: v.latest_cs_avg,
  }))
  out.sort((a, b) => b.days_in_top10 - a.days_in_top10 || a.best_rank - b.best_rank)
  return out.slice(0, limit)
}

// ── View D: セクターローテーション (週次 × 過去 6 ヶ月) ────────────────
export type SectorRotationCell = { week: string; sector: string; count: number }
export type SectorRotation = {
  weeks: string[]           // ISO Monday の文字列 (asc)
  sectors: string[]         // 期間内に1回でも出現したセクター (latest 週でのカウント降順)
  cells: Map<string, number> // key = `${week}|${sector}`
}

function isoMonday(dateStr: string): string {
  // 'YYYY-MM-DD' (Postgres DATE) を文字列のまま処理 → タイムゾーン非依存
  // JS Date は UTC で扱うとオフがブレるので、ローカル解釈に固定する。
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=Sun, 1=Mon, ...
  const diff = dow === 0 ? -6 : 1 - dow
  dt.setUTCDate(dt.getUTCDate() + diff)
  return dt.toISOString().slice(0, 10)
}

export async function fetchSectorRotation(months = 6): Promise<SectorRotation> {
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from(TABLE)
    .select('date, s33nm')
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (error || !data) {
    if (error) console.error('[market_leaders rotation]', error)
    return { weeks: [], sectors: [], cells: new Map() }
  }

  const cellMap = new Map<string, number>()
  const weekSet = new Set<string>()
  const sectorCounts = new Map<string, number>()

  for (const r of data as { date: string; s33nm: string | null }[]) {
    if (!r.s33nm) continue
    const week = isoMonday(r.date)
    weekSet.add(week)
    const key = `${week}|${r.s33nm}`
    cellMap.set(key, (cellMap.get(key) ?? 0) + 1)
    sectorCounts.set(r.s33nm, (sectorCounts.get(r.s33nm) ?? 0) + 1)
  }

  const weeks = [...weekSet].sort()
  const latestWeek = weeks[weeks.length - 1]
  const sectors = [...sectorCounts.keys()].sort((a, b) => {
    const av = cellMap.get(`${latestWeek}|${a}`) ?? 0
    const bv = cellMap.get(`${latestWeek}|${b}`) ?? 0
    if (bv !== av) return bv - av
    // tie-break: 全期間累計
    return (sectorCounts.get(b) ?? 0) - (sectorCounts.get(a) ?? 0)
  })

  return { weeks, sectors, cells: cellMap }
}

// ── View F: 個別銘柄の足跡 (直近 6 ヶ月) ──────────────────────────────
export type LeaderHistoryPoint = {
  date: string
  market_rank: number | null
  cs_avg: number | null
  vol_5d: number | null
  close: number | null
}

export async function fetchLeaderHistory(code: string, months = 6): Promise<LeaderHistoryPoint[]> {
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from(TABLE)
    .select('date, market_rank, cs_avg, vol_5d, close')
    .eq('code', code)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (error || !data) {
    if (error) console.error('[market_leaders history]', error)
    return []
  }
  return data as LeaderHistoryPoint[]
}

// ── View E: 新顔リスト (前営業日に居なかった銘柄) は ────────────────
// fetchLatestLeaders の結果から派生できる (prevDate との比較) ので
// 専用 fetcher は不要。コンポーネント側で派生する。
