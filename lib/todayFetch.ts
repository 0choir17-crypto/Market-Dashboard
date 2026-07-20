import { supabase } from '@/lib/supabase'
import type { CoilPullbackRow, MaPullbackRow } from '@/types/pullbackSetups'
import type { VolumeIgnitionRow } from '@/types/volumeIgnition'
import type { SpringSetupRow } from '@/types/springSetups'
import type { BoxBreakoutRow } from '@/types/boxBreakout'
import type {
  StructurePivotCardRow,
  StructurePivotEventRow,
} from '@/types/structurePivotEvents'

// Daily Watch — 押し目"候補"ウォッチ。新テーブル群を最新 date 中心に読む。
// jquants-scanner が毎日・平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
// 旧 scan_results 依存は撤去済み（structure/thrust 系シグナルは本番ごと撤去）。

const COIL_TABLE = 'coil_pullback_setups'
const MA_TABLE = 'ma_pullback_setups'
const VOLUME_IGNITION_TABLE = 'volume_ignition'
const SPRING_TABLE = 'spring_setups'
const BOX_BREAKOUT_TABLE = 'box_breakout_events'
const STRUCTURE_PIVOT_TABLE = 'structure_pivot_events'

// box_breakout_events は単一 date ではなく「直近ブレイク窓」を読む。仮ブレイク日(date)は
// 動かず status が後日 CONFIRMED/FAILED に更新されるテーブルなので、直近 N 営業日ぶんの
// イベントをまとめて表示する（他スキャナーの「最新 date のみ」とはモデルが異なる）。
const BOX_WINDOW_DAYS = 10

// structure_pivot_events も同じ「直近ヒット窓」モデル。upsert は直近10営業日ぶんなので
// それに合わせて窓を10営業日に取る。
const STRUCTURE_WINDOW_DAYS = 10

export type TodayResponse = {
  coilDate: string | null
  coil: CoilPullbackRow[]
  maDate: string | null
  ma: MaPullbackRow[]
  igniteDate: string | null
  ignite: VolumeIgnitionRow[]
  springDate: string | null
  spring: SpringSetupRow[]
  boxDate: string | null
  box: BoxBreakoutRow[]
  structDate: string | null
  struct: StructurePivotCardRow[]
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

// テーブル未存在（PostgREST の schema cache に無い）エラーか判定する。box_breakout_events は
// 外部 jquants-scanner が作る配信テーブルで、未デプロイの環境では PGRST205 が返る。これを
// 「取得失敗」ではなく「未配備＝0件」として穏当に扱い、他スキャナーやバナーを巻き込まない。
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  return /Could not find the table|schema cache/i.test(error.message ?? '')
}

// ベース上抜けイベント（box_breakout_events）を「直近 BOX_WINDOW_DAYS 営業日ぶんの窓」で読む。
// 他スキャナーと違い date は仮ブレイク日で動かず、旧い CONFIRMED/FAILED 行が累積するため、
// 単一 date ではなく直近の distinct な仮ブレイク日 N 本にウィンドウする（＝「いま生きている
// ウォッチリスト」）。ダッシュボードでは PENDING（確認中の仮ブレイク）のみ配信する
// （CONFIRMED / FAILED は表示しない）。
async function fetchBoxBreakouts(
  date: string | null,
): Promise<{ date: string | null; rows: BoxBreakoutRow[]; error: string | null }> {
  // 上限日（過去スナップショット閲覧時はその日まで）を決める。省略時は全体の最新仮ブレイク日。
  let upper = date
  if (!upper) {
    const { data: latest, error } = await supabase
      .from(BOX_BREAKOUT_TABLE)
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      if (isMissingTableError(error)) {
        console.warn(`[${BOX_BREAKOUT_TABLE}] table not deployed yet — skipping`)
        return { date: null, rows: [], error: null }
      }
      console.error(`[${BOX_BREAKOUT_TABLE}] latest date error`, error)
      return { date: null, rows: [], error: `${BOX_BREAKOUT_TABLE}: ${error.message}` }
    }
    upper = (latest?.date as string | undefined) ?? null
  }
  if (!upper) return { date: null, rows: [], error: null }

  // upper 以前の distinct な仮ブレイク日を新しい順に集め、N 本目を窓の下端にする。
  const { data: dateRows, error: dateErr } = await supabase
    .from(BOX_BREAKOUT_TABLE)
    .select('date')
    .lte('date', upper)
    .order('date', { ascending: false })
    .limit(1000)
  if (dateErr) {
    if (isMissingTableError(dateErr)) {
      console.warn(`[${BOX_BREAKOUT_TABLE}] table not deployed yet — skipping`)
      return { date: null, rows: [], error: null }
    }
    console.error(`[${BOX_BREAKOUT_TABLE}] window dates error`, dateErr)
    return { date: upper, rows: [], error: `${BOX_BREAKOUT_TABLE}: ${dateErr.message}` }
  }
  const distinctDates: string[] = []
  const seen = new Set<string>()
  for (const r of dateRows ?? []) {
    const d = (r as { date: string }).date
    if (d && !seen.has(d)) {
      seen.add(d)
      distinctDates.push(d)
    }
  }
  if (distinctDates.length === 0) return { date: upper, rows: [], error: null }
  const anchor = distinctDates[0]
  const windowStart = distinctDates[Math.min(BOX_WINDOW_DAYS - 1, distinctDates.length - 1)]

  const { data, error } = await supabase
    .from(BOX_BREAKOUT_TABLE)
    .select('*')
    .gte('date', windowStart)
    .lte('date', upper)
    .eq('status', 'PENDING')
  if (error) {
    if (isMissingTableError(error)) {
      console.warn(`[${BOX_BREAKOUT_TABLE}] table not deployed yet — skipping`)
      return { date: null, rows: [], error: null }
    }
    console.error(`[${BOX_BREAKOUT_TABLE}] fetch error`, error)
    return { date: anchor, rows: [], error: `${BOX_BREAKOUT_TABLE}: ${error.message}` }
  }

  return { date: anchor, rows: (data ?? []) as unknown as BoxBreakoutRow[], error: null }
}

// Advanced Structure Pivot（1st / 2nd ヒット）を「直近ヒット窓」で読む。
// box_breakout_events と同型のモデル: date（ヒット日）は動かず status/各 hit_date が後日
// 後追い更新され、10営業日窓から外れた行は凍結してテーブルに残り続ける。よって単一 date では
// なく直近 STRUCTURE_WINDOW_DAYS 本の distinct なヒット日にウィンドウする。
//
// 表示方針（ダッシュ側裁量。0choir17 と確認済み）:
//   - 本日（anchor 日）にヒットした銘柄のみ表示。
//   - 銘柄ごとに1枚へ集約（代表行は同日 1st/2nd 両方なら 2nd を採用。本日の 1st/2nd 有無は別途保持）。
//   - 終了済み（is_active=false ＝ TP2 到達 or STOPPED）はライブなウォッチではないので除外。
//   - カードには 1st / 2nd それぞれの直近ヒットを「何営業日前か」で並べる。本日ヒットした
//     シグナルは 0 営業日前（=本日）になる。全て営業日ベース（テーブルに存在するヒット日＝
//     営業日カレンダーの index）で数え、日付とは混在させない。
async function fetchStructurePivotEvents(
  date: string | null,
): Promise<{ date: string | null; rows: StructurePivotCardRow[]; error: string | null }> {
  // 上限日（過去スナップショット閲覧時はその日まで）。省略時は全体の最新ヒット日。
  let upper = date
  if (!upper) {
    const { data: latest, error } = await supabase
      .from(STRUCTURE_PIVOT_TABLE)
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      if (isMissingTableError(error)) {
        console.warn(`[${STRUCTURE_PIVOT_TABLE}] table not deployed yet — skipping`)
        return { date: null, rows: [], error: null }
      }
      console.error(`[${STRUCTURE_PIVOT_TABLE}] latest date error`, error)
      return { date: null, rows: [], error: `${STRUCTURE_PIVOT_TABLE}: ${error.message}` }
    }
    upper = (latest?.date as string | undefined) ?? null
  }
  if (!upper) return { date: null, rows: [], error: null }

  // upper 以前の distinct なヒット日を新しい順に集める。表示窓の下端算出に使うほか、
  // 「前回ヒットが何営業日前か」を営業日ベースで数える index にも使う。前回ヒットは数ヶ月
  // 遡ることがあるので、営業日カレンダーを十分に確保する（~42行/日 × 8000行 ≈ 半年弱）。
  const { data: dateRows, error: dateErr } = await supabase
    .from(STRUCTURE_PIVOT_TABLE)
    .select('date')
    .lte('date', upper)
    .order('date', { ascending: false })
    .limit(8000)
  if (dateErr) {
    if (isMissingTableError(dateErr)) {
      console.warn(`[${STRUCTURE_PIVOT_TABLE}] table not deployed yet — skipping`)
      return { date: null, rows: [], error: null }
    }
    console.error(`[${STRUCTURE_PIVOT_TABLE}] window dates error`, dateErr)
    return { date: upper, rows: [], error: `${STRUCTURE_PIVOT_TABLE}: ${dateErr.message}` }
  }
  const distinctDatesDesc: string[] = []
  const seen = new Set<string>()
  for (const r of dateRows ?? []) {
    const d = (r as { date: string }).date
    if (d && !seen.has(d)) {
      seen.add(d)
      distinctDatesDesc.push(d)
    }
  }
  if (distinctDatesDesc.length === 0) return { date: upper, rows: [], error: null }
  const anchor = distinctDatesDesc[0]
  const windowStart =
    distinctDatesDesc[Math.min(STRUCTURE_WINDOW_DAYS - 1, distinctDatesDesc.length - 1)]

  const { data, error } = await supabase
    .from(STRUCTURE_PIVOT_TABLE)
    .select('*')
    .gte('date', windowStart)
    .lte('date', upper)
  if (error) {
    if (isMissingTableError(error)) {
      console.warn(`[${STRUCTURE_PIVOT_TABLE}] table not deployed yet — skipping`)
      return { date: null, rows: [], error: null }
    }
    console.error(`[${STRUCTURE_PIVOT_TABLE}] fetch error`, error)
    return { date: anchor, rows: [], error: `${STRUCTURE_PIVOT_TABLE}: ${error.message}` }
  }

  const raw = (data ?? []) as unknown as StructurePivotEventRow[]

  // 窓内の distinct ヒット日（降順）→「何営業日前か」を index で引く。anchor=0。
  // 窓外（>N営業日前で凍結）で index に無い日付は、正確な営業日数が不明なので null を返す
  //（カード側は日付表示にフォールバックし、誤った日数を出さない）。
  const dayIndex = new Map<string, number>()
  distinctDatesDesc.forEach((d, i) => dayIndex.set(d, i))
  const businessDaysAgo = (d: string | null): number | null => {
    if (!d) return null
    const hit = dayIndex.get(d)
    return hit === undefined ? null : hit
  }

  // ライブなウォッチのみ: 終了済み（is_active=false ＝ TP2 or STOPPED）を落とす。
  const live = raw.filter(r => r.is_active !== false)

  // 本日（anchor 日）にヒットした銘柄について、1st / 2nd それぞれ本日ヒットしたかを集計。
  const today1st = new Set<string>()
  const today2nd = new Set<string>()
  for (const r of live) {
    if (r.date !== anchor) continue
    if (r.signal === '1st') today1st.add(r.code)
    else if (r.signal === '2nd') today2nd.add(r.code)
  }

  // 本日ヒット行を集約: 同一銘柄で 1st/2nd 両方あるなら 2nd（進行が新しい）を代表行に採用。
  const signalRank: Record<string, number> = { '2nd': 0, '1st': 1 }
  const todayRows = live
    .filter(r => r.date === anchor)
    .sort((a, b) => (signalRank[a.signal] ?? 9) - (signalRank[b.signal] ?? 9))

  const byCode = new Map<string, StructurePivotCardRow>()
  for (const r of todayRows) {
    if (byCode.has(r.code)) continue // 既に代表シグナル（先頭）を採用済み
    byCode.set(r.code, {
      ...r,
      today_1st: today1st.has(r.code),
      today_2nd: today2nd.has(r.code),
      // 直近の 1st / 2nd ヒット（per-code の last_1st_date / last_2nd_date）を営業日前へ。
      // 本日ヒットしたシグナルは last_*_date=anchor なので 0 営業日前（=本日）になる。
      last_1st_ago: businessDaysAgo(r.last_1st_date),
      last_2nd_ago: businessDaysAgo(r.last_2nd_date),
    })
  }

  return { date: anchor, rows: [...byCode.values()], error: null }
}

export async function fetchToday(opts: { date?: string }): Promise<TodayResponse> {
  const requested = opts.date ?? null

  // coil は初日のみ（maxDisplayDays=1）。それ以外は2日連続まで表示（maxDisplayDays=2）。
  // box は直近ブレイク窓（専用フェッチ）。
  const [coilRes, maRes, igniteRes, springRes, boxRes, structRes, hotRes] = await Promise.all([
    fetchSetups<CoilPullbackRow>(COIL_TABLE, requested, 1),
    fetchSetups<MaPullbackRow>(MA_TABLE, requested, 2),
    fetchSetups<VolumeIgnitionRow>(VOLUME_IGNITION_TABLE, requested, 2),
    fetchSetups<SpringSetupRow>(SPRING_TABLE, requested, 2),
    fetchBoxBreakouts(requested),
    fetchStructurePivotEvents(requested),
    fetchHotSectors(requested),
  ])

  const errors = [
    coilRes.error,
    maRes.error,
    igniteRes.error,
    springRes.error,
    boxRes.error,
    structRes.error,
    hotRes.error,
  ].filter((e): e is string => !!e)

  return {
    coilDate: coilRes.date,
    coil: coilRes.rows,
    maDate: maRes.date,
    ma: maRes.rows,
    igniteDate: igniteRes.date,
    ignite: igniteRes.rows,
    springDate: springRes.date,
    spring: springRes.rows,
    boxDate: boxRes.date,
    box: boxRes.rows,
    structDate: structRes.date,
    struct: structRes.rows,
    hotSectors: hotRes.sectors,
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
