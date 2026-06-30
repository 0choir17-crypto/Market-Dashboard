import { supabase } from '@/lib/supabase'
import type { CoilPullbackRow, MaPullbackRow } from '@/types/pullbackSetups'
import type { VolumeIgnitionRow } from '@/types/volumeIgnition'

// Daily Watch — 押し目"候補"ウォッチ。新2テーブルを最新 date 中心に読む。
// jquants-scanner が毎日・平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
// 旧 scan_results 依存は撤去済み（structure/thrust 系シグナルは本番ごと撤去）。

const COIL_TABLE = 'coil_pullback_setups'
const MA_TABLE = 'ma_pullback_setups'
const VOLUME_IGNITION_TABLE = 'volume_ignition'

export type TodayResponse = {
  coilDate: string | null
  coil: CoilPullbackRow[]
  maDate: string | null
  ma: MaPullbackRow[]
  igniteDate: string | null
  ignite: VolumeIgnitionRow[]
  hotSectors: string[]
}

// 指定日（省略時は最新）の候補一覧。select('*') で供給側のスキーマ増減に耐性。
// スナップショット日が当該テーブルに無い場合は直近 ≤ requested の日へフォールバック。
async function fetchSetups<T>(
  table: string,
  date: string | null,
): Promise<{ date: string | null; rows: T[] }> {
  let targetDate = date

  if (!targetDate) {
    const { data: latest, error } = await supabase
      .from(table)
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) console.error(`[${table}] latest date error`, error)
    targetDate = (latest?.date as string | undefined) ?? null
  }
  if (!targetDate) return { date: null, rows: [] }

  const initial = await supabase.from(table).select('*').eq('date', targetDate)
  if (initial.error) {
    console.error(`[${table}] fetch error`, initial.error)
    return { date: targetDate, rows: [] }
  }

  let data = initial.data
  let resolved = targetDate

  if (!data || data.length === 0) {
    const { data: nearest } = await supabase
      .from(table)
      .select('date')
      .lte('date', targetDate)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nearestDate = (nearest?.date as string | undefined) ?? null
    if (nearestDate && nearestDate !== targetDate) {
      const fb = await supabase.from(table).select('*').eq('date', nearestDate)
      if (fb.error) {
        console.error(`[${table}] fallback fetch error`, fb.error)
      } else {
        data = fb.data ?? []
        resolved = nearestDate
      }
    }
  }

  return { date: resolved, rows: (data ?? []) as unknown as T[] }
}

// "Hot" sectors = sector_selection_s33.composite_score >= 60 の業種。
// Sectors-33 ページと同じ閾値を使い、該当業種に属する候補カードを緑ハイライト。
const HOT_SECTOR_MIN_SCORE = 60

async function fetchHotSectors(): Promise<string[]> {
  const { data: latest, error: latestErr } = await supabase
    .from('sector_selection_s33')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr || !latest?.date) {
    if (latestErr) console.error('[sector_selection_s33] hot sectors latest date error', latestErr)
    return []
  }

  const { data, error } = await supabase
    .from('sector_selection_s33')
    .select('sector_name_s33, composite_score')
    .eq('date', latest.date as string)
    .gte('composite_score', HOT_SECTOR_MIN_SCORE)

  if (error || !data) {
    if (error) console.error('[sector_selection_s33] hot sectors error', error)
    return []
  }

  return data
    .map(r => r.sector_name_s33 as string | null)
    .filter((s): s is string => !!s)
}

export async function fetchToday(opts: { date?: string }): Promise<TodayResponse> {
  const requested = opts.date ?? null

  const [coilRes, maRes, igniteRes, hotSectors] = await Promise.all([
    fetchSetups<CoilPullbackRow>(COIL_TABLE, requested),
    fetchSetups<MaPullbackRow>(MA_TABLE, requested),
    fetchSetups<VolumeIgnitionRow>(VOLUME_IGNITION_TABLE, requested),
    fetchHotSectors(),
  ])

  return {
    coilDate: coilRes.date,
    coil: coilRes.rows,
    maDate: maRes.date,
    ma: maRes.rows,
    igniteDate: igniteRes.date,
    ignite: igniteRes.rows,
    hotSectors,
  }
}
