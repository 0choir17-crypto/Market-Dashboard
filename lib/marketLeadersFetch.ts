import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import type { MarketLeader } from '@/types/marketLeaders'

const TABLE = 'market_leaders'

// 表示行は select('*') で供給側 (jquants-scanner) のスキーマ増減に耐性を持たせる。
// 退役された列が DROP されても select 全体が落ちない (sectors33 と同方針)。
// hits / streak / 日付ピッカーは (code, date) の全履歴ページングから実数で算出する。

export type LeaderHits = {
  hits: number                       // 通算で Top50 入りした営業日数 (targetDate まで, 実数)
  streak: number                     // targetDate から遡って連続で Top50 入りしている日数 (実数)
  lastBeforeStreak: string | null    // 現在の連続区間より前で、直近に Top50 入りした日 (全履歴)
}

export type LeadersSnapshot = {
  latestDate: string | null          // 表示対象の日付 (= 選択日 or 最新日)
  prevDate: string | null            // latestDate の前営業日 (テーブル上で存在する直前の日付)
  rows: MarketLeader[]
  hitsMap: Map<string, LeaderHits>
  availableDates: string[]           // 日付ピッカー用 (降順、全履歴)
  error?: string | null              // fetch失敗時のメッセージ（空データと区別する）
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

// ── 全履歴の出現データ (targetDate まで) ───────────────────────────────────
// PK = code + date なので 1 行 = その銘柄の 1 営業日の Top50 入り。(code, date) を
// 全履歴ぶんページング取得し、以下を実数 (キャップ無し) で導けるようにする:
//   - dates      : 全取引日 (降順) — 日付ピッカー / streak の連続判定に使う
//   - codeDates  : 銘柄コード毎の出現日セット — hits / streak / lastBeforeStreak
// Supabase の行上限 (1000) を取りこぼさないよう、安定した全順序 (date, code) で
// ページングする (range ページングは順序が一意でないと境界で重複/欠落し得るため)。
type LeaderHistory = { dates: string[]; codeDates: Map<string, Set<string>> }

async function fetchHistory(targetDate: string): Promise<LeaderHistory> {
  const codeDates = new Map<string, Set<string>>()
  const dateSet = new Set<string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('code, date')
      .lte('date', targetDate)
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[market_leaders history]', error)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data as { code: string; date: string }[]) {
      dateSet.add(r.date)
      let s = codeDates.get(r.code)
      if (!s) {
        s = new Set<string>()
        codeDates.set(r.code, s)
      }
      s.add(r.date)
    }
    if (data.length < PAGE) break
  }
  const dates = [...dateSet].sort((a, b) => (a > b ? -1 : 1))
  return { dates, codeDates }
}

// ── メインスナップショット (View A + B + ヒット数 + 日付ピッカー) ─────
// 指定日 (省略時は最新) の Top50 全列を取得しつつ、(code, date) の全履歴から
// hits / streak / availableDates を実数で導出する:
//   - rows           : targetDate の Top50 行 (全列)
//   - prevDate       : テーブル上で targetDate 直前の営業日
//   - hitsMap        : 銘柄コード毎の hits / streak / lastBeforeStreak (実数)
//   - availableDates : 日付ピッカー用の利用可能日リスト (降順, 全履歴)
export async function fetchLeadersSnapshot(date?: string): Promise<LeadersSnapshot> {
  const targetDate = date ?? (await fetchLatestDate())

  if (!targetDate) {
    return { latestDate: null, prevDate: null, rows: [], hitsMap: new Map(), availableDates: [], error: null }
  }

  // targetDate の Top50 全列 と、全履歴の出現データ (実数算出用) を並行取得。
  const [rowsRes, history] = await Promise.all([
    supabase.from(TABLE).select('*').eq('date', targetDate).order('market_rank', { ascending: true }),
    fetchHistory(targetDate),
  ])

  if (rowsRes.error) console.error('[market_leaders snapshot]', rowsRes.error)
  const rows = (rowsRes.data ?? []) as unknown as MarketLeader[]
  const snapshotError = rowsRes.error ? rowsRes.error.message : null

  // availableDates = 全取引日 (降順)。targetDate を起点に降順シーケンスで連続判定する。
  const availableDates = history.dates
  const targetIdx = availableDates.indexOf(targetDate)
  const prevDate = targetIdx >= 0 && targetIdx + 1 < availableDates.length
    ? availableDates[targetIdx + 1]
    : null

  // targetDate から遡る取引日シーケンス (全履歴) — streak / lastBeforeStreak 用
  const startIdx = targetIdx >= 0 ? targetIdx : 0
  const seq = availableDates.slice(startIdx)

  // 表示行 (= targetDate の Top50) のぶんだけ実数を算出する。
  const hitsMap = new Map<string, LeaderHits>()
  for (const r of rows) {
    const dates = history.codeDates.get(r.code)
    if (!dates) {
      hitsMap.set(r.code, { hits: 0, streak: 0, lastBeforeStreak: null })
      continue
    }
    // streak: seq[0] (= targetDate) から連続で出現している日数 (実数, 全履歴)
    let streak = 0
    while (streak < seq.length && dates.has(seq[streak])) streak++

    // lastBeforeStreak: 連続が切れた地点以降で最も近い出現日 (全履歴)
    let lastBeforeStreak: string | null = null
    for (let i = streak; i < seq.length; i++) {
      if (dates.has(seq[i])) {
        lastBeforeStreak = seq[i]
        break
      }
    }

    hitsMap.set(r.code, { hits: dates.size, streak, lastBeforeStreak })
  }

  return { latestDate: targetDate, prevDate, rows, hitsMap, availableDates, error: snapshotError }
}

// ── View D: セクターローテーション (週次 × 過去 6 ヶ月) ────────────────
export type SectorRotationCell = { week: string; sector: string; count: number }
export type SectorRotation = {
  weeks: string[]           // ISO Monday の文字列 (asc)
  sectors: string[]         // 期間内に1回でも出現したセクター (latest 週でのカウント降順)
  cells: Map<string, number> // key = `${week}|${sector}`
  // fetch 失敗時のメッセージ (成功時は null)。既存の呼び出し元の初期値リテラルを
  // 壊さないよう optional にしている (fetchSectorRotation は常にセットして返す)。
  error?: string | null
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

  // 6ヶ月 × ~21営業日 × 50銘柄 ≈ 6300 行 — Supabase の 1000 行上限を大きく超える
  // ため、(date, code) の安定順序で全件ページングする (fetchHistory と同方針)。
  const { rows, error } = await fetchAllPaged<{ date: string; s33nm: string | null }>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('date, s33nm')
        .gte('date', sinceStr)
        .order('date', { ascending: true })
        .order('code', { ascending: true })
        .range(from, to),
  )

  if (error) {
    console.error('[market_leaders rotation]', error)
    return { weeks: [], sectors: [], cells: new Map(), error }
  }

  const cellMap = new Map<string, number>()
  const weekSet = new Set<string>()
  const sectorCounts = new Map<string, number>()

  for (const r of rows) {
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

  return { weeks, sectors, cells: cellMap, error: null }
}
