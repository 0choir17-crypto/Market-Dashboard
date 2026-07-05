import { supabase } from '@/lib/supabase'
import type { CoilPullbackRow, MaPullbackRow } from '@/types/pullbackSetups'
import type { VolumeIgnitionRow } from '@/types/volumeIgnition'
import type { SpringSetupRow } from '@/types/springSetups'

// Daily Watch — 押し目"候補"ウォッチ。新テーブル群を最新 date 中心に読む。
// jquants-scanner が毎日・平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
// 旧 scan_results 依存は撤去済み（structure/thrust 系シグナルは本番ごと撤去）。

const COIL_TABLE = 'coil_pullback_setups'
const MA_TABLE = 'ma_pullback_setups'
const VOLUME_IGNITION_TABLE = 'volume_ignition'
const SPRING_TABLE = 'spring_setups'

export type TodayResponse = {
  coilDate: string | null
  coil: CoilPullbackRow[]
  maDate: string | null
  ma: MaPullbackRow[]
  igniteDate: string | null
  ignite: VolumeIgnitionRow[]
  springDate: string | null
  spring: SpringSetupRow[]
  hotSectors: string[]
  // 取得失敗の詳細（null なら全クエリ成功）。「0 件」と「取得失敗」を UI で区別するため。
  error: string | null
}

// 「2日以上連続してヒットする銘柄は当日分に表記しない」— resolved の直前営業日にも
// 同テーブルに出ていたコード集合を返す。当日〈新規/再登場〉のみに絞り、Daily Watch が
// 同じ銘柄で毎日埋まる混雑を解消する（走行中の銘柄は初日だけ出て、2日目以降は隠れる）。
// 取得失敗時は空集合を返し、除外せず全件表示にフォールバックする（安全側）。
async function fetchPrevDayCodes(table: string, resolvedDate: string): Promise<Set<string>> {
  const { data: prev, error: prevErr } = await supabase
    .from(table)
    .select('date')
    .lt('date', resolvedDate)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prevErr) {
    console.error(`[${table}] prev date error`, prevErr)
    return new Set()
  }
  const prevDate = (prev?.date as string | undefined) ?? null
  if (!prevDate) return new Set()

  const { data, error } = await supabase.from(table).select('code').eq('date', prevDate)
  if (error) {
    console.error(`[${table}] prev codes error`, error)
    return new Set()
  }
  return new Set((data ?? []).map(r => (r as { code: string }).code))
}

// 指定日（省略時は最新）の候補一覧。select('*') で供給側のスキーマ増減に耐性。
// スナップショット日が当該テーブルに無い場合は直近 ≤ requested の日へフォールバック。
// 直前営業日にも出ていた銘柄（=2日以上連続ヒット）は除外し、当日分だけに絞る。
async function fetchSetups<T>(
  table: string,
  date: string | null,
): Promise<{ date: string | null; rows: T[]; error: string | null }> {
  let targetDate = date

  if (!targetDate) {
    const { data: latest, error } = await supabase
      .from(table)
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error(`[${table}] latest date error`, error)
      return { date: null, rows: [], error: `${table}: ${error.message}` }
    }
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return { date: null, rows: [], error: null }

  const initial = await supabase.from(table).select('*').eq('date', targetDate)
  if (initial.error) {
    console.error(`[${table}] fetch error`, initial.error)
    return { date: targetDate, rows: [], error: `${table}: ${initial.error.message}` }
  }

  let data = initial.data
  let resolved = targetDate
  let fetchError: string | null = null

  if (!data || data.length === 0) {
    const { data: nearest, error: nearestErr } = await supabase
      .from(table)
      .select('date')
      .lte('date', targetDate)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (nearestErr) {
      console.error(`[${table}] nearest date error`, nearestErr)
      fetchError = `${table}: ${nearestErr.message}`
    }
    const nearestDate = (nearest?.date as string | undefined) ?? null
    if (nearestDate && nearestDate !== targetDate) {
      const fb = await supabase.from(table).select('*').eq('date', nearestDate)
      if (fb.error) {
        console.error(`[${table}] fallback fetch error`, fb.error)
        fetchError = `${table}: ${fb.error.message}`
      } else {
        data = fb.data ?? []
        resolved = nearestDate
      }
    }
  }

  let rows = (data ?? []) as unknown as T[]

  // 2日以上連続ヒットの除外: 直前営業日にも出ていたコードを落とす（当日分のみ表示）。
  if (rows.length > 0) {
    const prevCodes = await fetchPrevDayCodes(table, resolved)
    if (prevCodes.size > 0) {
      rows = rows.filter(r => !prevCodes.has((r as unknown as { code: string }).code))
    }
  }

  return { date: resolved, rows, error: fetchError }
}

// "Hot" sectors = sector_selection_s33.composite_score >= 60 の業種。
// Sectors-33 ページと同じ閾値を使い、該当業種に属する候補カードを緑ハイライト。
const HOT_SECTOR_MIN_SCORE = 60

// date 指定時はその日以前の直近セクター日を使う（過去スナップショット閲覧時に
// 「最新」の hot セクターでハイライトしてしまう時代錯誤を防ぐ）。省略時は最新日。
async function fetchHotSectors(
  date: string | null,
): Promise<{ sectors: string[]; error: string | null }> {
  let latestQuery = supabase.from('sector_selection_s33').select('date')
  if (date) latestQuery = latestQuery.lte('date', date)
  const { data: latest, error: latestErr } = await latestQuery
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) {
    console.error('[sector_selection_s33] hot sectors latest date error', latestErr)
    return { sectors: [], error: `sector_selection_s33: ${latestErr.message}` }
  }
  if (!latest?.date) return { sectors: [], error: null }

  const { data, error } = await supabase
    .from('sector_selection_s33')
    .select('sector_name_s33, composite_score')
    .eq('date', latest.date as string)
    .gte('composite_score', HOT_SECTOR_MIN_SCORE)

  if (error || !data) {
    if (error) console.error('[sector_selection_s33] hot sectors error', error)
    return { sectors: [], error: error ? `sector_selection_s33: ${error.message}` : null }
  }

  return {
    sectors: data
      .map(r => r.sector_name_s33 as string | null)
      .filter((s): s is string => !!s),
    error: null,
  }
}

export async function fetchToday(opts: { date?: string }): Promise<TodayResponse> {
  const requested = opts.date ?? null

  const [coilRes, maRes, igniteRes, springRes, hotRes] = await Promise.all([
    fetchSetups<CoilPullbackRow>(COIL_TABLE, requested),
    fetchSetups<MaPullbackRow>(MA_TABLE, requested),
    fetchSetups<VolumeIgnitionRow>(VOLUME_IGNITION_TABLE, requested),
    fetchSetups<SpringSetupRow>(SPRING_TABLE, requested),
    fetchHotSectors(requested),
  ])

  const errors = [coilRes.error, maRes.error, igniteRes.error, springRes.error, hotRes.error].filter(
    (e): e is string => !!e,
  )

  return {
    coilDate: coilRes.date,
    coil: coilRes.rows,
    maDate: maRes.date,
    ma: maRes.rows,
    igniteDate: igniteRes.date,
    ignite: igniteRes.rows,
    springDate: springRes.date,
    spring: springRes.rows,
    hotSectors: hotRes.sectors,
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
