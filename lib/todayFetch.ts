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

// date より前の直近営業日（当該テーブルに行が存在する日）を1つ返す。無ければ null。
async function prevBusinessDate(table: string, date: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select('date')
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error(`[${table}] prev date error`, error)
    return null
  }
  return (data?.date as string | undefined) ?? null
}

// 指定日に当該テーブルへ出ていた code 集合。取得失敗時は null。
async function codesOnDate(table: string, date: string): Promise<Set<string> | null> {
  const { data, error } = await supabase.from(table).select('code').eq('date', date)
  if (error) {
    console.error(`[${table}] codes on ${date} error`, error)
    return null
  }
  return new Set((data ?? []).map(r => (r as { code: string }).code))
}

// 「連続ヒットが上限日数を超えた銘柄は当日分に表記しない」除外用のコード集合を返す。
// resolved の直前 maxDisplayDays 営業日“すべて”に連続で出ていた code（＝当日を足すと
// maxDisplayDays+1 日以上連続になる銘柄）を積集合として返す。当日はこれらを落とすことで
// 「新規〜連続 maxDisplayDays 日目まで」だけを表示し、Daily Watch が同じ銘柄で毎日
// 埋まる混雑を解消する。
//   maxDisplayDays=1 → 初日だけ表示（2日目以降を隠す）… coil pullback
//   maxDisplayDays=2 → 2日連続まで表示（3日目以降を隠す）… ma / ignite / spring
// 履歴不足（直前 maxDisplayDays 営業日が揃わない）や取得失敗時は空集合を返し、除外せず
// 全件表示にフォールバックする（安全側）。
async function fetchConsecutiveHitCodes(
  table: string,
  resolvedDate: string,
  maxDisplayDays: number,
): Promise<Set<string>> {
  let cursor = resolvedDate
  let intersection: Set<string> | null = null

  for (let i = 0; i < maxDisplayDays; i++) {
    const prevDate = await prevBusinessDate(table, cursor)
    if (!prevDate) return new Set() // 履歴が上限日数に満たない → 除外しない
    const codes = await codesOnDate(table, prevDate)
    if (codes === null) return new Set() // 取得失敗 → 除外しない

    if (intersection === null) {
      intersection = codes
    } else {
      const prev: Set<string> = intersection
      intersection = new Set(Array.from(prev).filter(c => codes.has(c)))
    }
    if (intersection.size === 0) return new Set() // これ以上絞っても空
    cursor = prevDate
  }

  return intersection ?? new Set()
}

// 指定日（省略時は最新）の候補一覧。select('*') で供給側のスキーマ増減に耐性。
// スナップショット日が当該テーブルに無い場合は直近 ≤ requested の日へフォールバック。
// 連続ヒットが maxDisplayDays を超えた銘柄は除外し、新規〜連続上限日目までに絞る。
async function fetchSetups<T>(
  table: string,
  date: string | null,
  maxDisplayDays: number,
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

  // 連続ヒットの除外: 直前 maxDisplayDays 営業日すべてに出ていたコード（＝連続上限を
  // 超える銘柄）を落とす。新規〜連続 maxDisplayDays 日目までのみ表示。
  if (rows.length > 0) {
    const staleCodes = await fetchConsecutiveHitCodes(table, resolved, maxDisplayDays)
    if (staleCodes.size > 0) {
      rows = rows.filter(r => !staleCodes.has((r as unknown as { code: string }).code))
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

  // coil は初日のみ（maxDisplayDays=1）。それ以外は2日連続まで表示（maxDisplayDays=2）。
  const [coilRes, maRes, igniteRes, springRes, hotRes] = await Promise.all([
    fetchSetups<CoilPullbackRow>(COIL_TABLE, requested, 1),
    fetchSetups<MaPullbackRow>(MA_TABLE, requested, 2),
    fetchSetups<VolumeIgnitionRow>(VOLUME_IGNITION_TABLE, requested, 2),
    fetchSetups<SpringSetupRow>(SPRING_TABLE, requested, 2),
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
