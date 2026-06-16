import { supabase } from '@/lib/supabase'
import type { MarketLeader } from '@/types/marketLeaders'

const TABLE = 'market_leaders'

// select('*') で供給側 (jquants-scanner) のスキーマ増減に耐性を持たせる。
// 退役された列が DROP されても select 全体が落ちない (sectors33 と同方針)。

// streak (連続日数) の算出ウィンドウ。
// ヒット数は「通算 Top50 入り日数」の実数 (キャップ無し) で別計算する → fetchTotalHits。
const STREAK_WINDOW = 30

export type LeaderHits = {
  hits: number                       // 通算で Top50 入りした営業日数 (targetDate まで, キャップ無し)
  streak: number                     // targetDate から遡って連続で Top50 入りしている日数
  lastBeforeStreak: string | null    // 現在の連続区間より前で、ウィンドウ内で直近に Top50 入りした日
}

export type LeadersSnapshot = {
  latestDate: string | null          // 表示対象の日付 (= 選択日 or 最新日)
  prevDate: string | null            // latestDate の前営業日 (テーブル上で存在する直前の日付)
  rows: MarketLeader[]
  hitsMap: Map<string, LeaderHits>
  availableDates: string[]           // 日付ピッカー用 (降順、ウィンドウ範囲のみ)
}

// ── 最新日付の取得 ─────────────────────────────────────────────────────────
async function fetchLatestDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[market_leaders latest date]', error)
    return null
  }
  return (data?.date as string | undefined) ?? null
}

// ── 通算ヒット数 (targetDate まで、キャップ無しの実数) ──────────────────────
// PK = code + date なので 1 行 = その銘柄の 1 営業日の Top50 入り。code 列だけを
// 全履歴ぶん取得して銘柄ごとに数え上げる。Supabase のデフォルト行上限 (1000) を
// 超えても取りこぼさないようページングする (Top50 × 多数日で 1000 行を容易に超える)。
async function fetchTotalHits(targetDate: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('code')
      .lte('date', targetDate)
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[market_leaders total hits]', error)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data as { code: string }[]) {
      counts.set(r.code, (counts.get(r.code) ?? 0) + 1)
    }
    if (data.length < PAGE) break
  }
  return counts
}

// ── メインスナップショット (View A + B + ヒット数 + 日付ピッカー) ─────
// 指定日 (省略時は最新) の Top50 を取得し、同時に直近 90 暦日 (~63 営業日) の
// 履歴をまとめて取得して以下を派生する:
//   - rows           : targetDate の Top50 行
//   - prevDate       : テーブル上で targetDate 直前の営業日
//   - hitsMap        : 銘柄コード毎の hits / streak / lastBeforeStreak
//   - availableDates : 日付ピッカー用の利用可能日リスト (降順)
// 1 クエリで完結することで往復を減らす。
export async function fetchLeadersSnapshot(date?: string): Promise<LeadersSnapshot> {
  const targetDate = date ?? (await fetchLatestDate())

  if (!targetDate) {
    return {
      latestDate: null,
      prevDate: null,
      rows: [],
      hitsMap: new Map(),
      availableDates: [],
    }
  }

  // 90 暦日 = 約 63 営業日 ぶんを一括取得 (streak / 日付ピッカー用)。
  const since = new Date(targetDate)
  since.setDate(since.getDate() - 90)
  const sinceStr = since.toISOString().slice(0, 10)

  // スナップショット (直近ウィンドウ) と通算ヒット数 (全履歴) を並行取得。
  const [snapRes, totalHits] = await Promise.all([
    supabase
      .from(TABLE)
      .select('*')
      .gte('date', sinceStr)
      .lte('date', targetDate)
      .order('date', { ascending: false }),
    fetchTotalHits(targetDate),
  ])
  const { data, error } = snapRes

  if (error || !data || data.length === 0) {
    if (error) console.error('[market_leaders snapshot]', error)
    return {
      latestDate: targetDate,
      prevDate: null,
      rows: [],
      hitsMap: new Map(),
      availableDates: [],
    }
  }

  const allRows = data as unknown as MarketLeader[]
  const availableDates = [...new Set(allRows.map(r => r.date))].sort((a, b) => (a > b ? -1 : 1))

  const targetIdx = availableDates.indexOf(targetDate)
  const prevDate = targetIdx >= 0 && targetIdx + 1 < availableDates.length
    ? availableDates[targetIdx + 1]
    : null

  // streak 算出ウィンドウ: targetDate から遡って STREAK_WINDOW 営業日
  const startIdx = targetIdx >= 0 ? targetIdx : 0
  const windowDates = availableDates.slice(startIdx, startIdx + STREAK_WINDOW)

  // 銘柄毎の出現日セットを構築 (ウィンドウ外の行は除外)
  const windowSet = new Set(windowDates)
  const codeDates = new Map<string, Set<string>>()
  for (const r of allRows) {
    if (!windowSet.has(r.date)) continue
    let s = codeDates.get(r.code)
    if (!s) {
      s = new Set<string>()
      codeDates.set(r.code, s)
    }
    s.add(r.date)
  }

  // streak: windowDates[0] (= targetDate) から連続で出現している日数
  // lastBeforeStreak: streak の直後 (連続が切れた地点) 以降で、最も近い出現日
  const hitsMap = new Map<string, LeaderHits>()
  for (const [code, dates] of codeDates) {
    let streak = 0
    while (streak < windowDates.length && dates.has(windowDates[streak])) streak++

    let lastBeforeStreak: string | null = null
    for (let i = streak; i < windowDates.length; i++) {
      if (dates.has(windowDates[i])) {
        lastBeforeStreak = windowDates[i]
        break
      }
    }

    hitsMap.set(code, { hits: totalHits.get(code) ?? dates.size, streak, lastBeforeStreak })
  }

  const rows = allRows.filter(r => r.date === targetDate)

  return { latestDate: targetDate, prevDate, rows, hitsMap, availableDates }
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
