import { supabase } from '@/lib/supabase'
import type { EmaSetupCardRow, EmaSetupRow } from '@/types/emaSetups'
import { groupByCode } from '@/types/emaSetups'
import type {
  StructurePivotCardRow,
  StructurePivotEventRow,
} from '@/types/structurePivotEvents'

// Daily Watch — 「毎朝チャートを開く銘柄」を機械的に絞り込んだウォッチリスト。
// jquants-scanner が毎日・平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
//
// 2026-08-29 の配信側スキャナー刷新に追随:
//   撤去 — coil_pullback_setups / ma_pullback_setups / volume_ignition /
//          spring_setups / box_breakout_events（+ 別タブの momentum_leaders）。
//          テーブル自体は DROP されていないが更新が止まったため、参照を残すと
//          2026-08-28 の内容を現役のように表示し続けてしまう。よってクエリごと削除。
//   新設 — ema_setups（Step1d）。押し目系（旧 ma / coil pullback）の後継。
const EMA_SETUPS_TABLE = 'ema_setups'
const STRUCTURE_PIVOT_TABLE = 'structure_pivot_events'

// structure_pivot_events は「直近ヒット窓」モデル。upsert は直近10営業日ぶんなので
// それに合わせて窓を10営業日に取る。
const STRUCTURE_WINDOW_DAYS = 10

export type TodayResponse = {
  emaDate: string | null
  ema: EmaSetupCardRow[]
  // ema_setups の Supabase DDL が未実行（テーブル未配備）なら true。
  // 「0 件の日」と「まだテーブルが無い」を UI で区別するために必要。
  emaTableMissing: boolean
  structDate: string | null
  struct: StructurePivotCardRow[]
  hotSectors: string[]
  // 取得失敗の詳細（null なら全クエリ成功）。「0 件」と「取得失敗」を UI で区別するため。
  error: string | null
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

// テーブル未存在（PostgREST の schema cache に無い）エラーか判定する。ema_setups /
// structure_pivot_events は外部 jquants-scanner が作る配信テーブルで、DDL 未実行の環境では
// PGRST205 が返る。これを「取得失敗」ではなく「未配備」として穏当に扱い、他セクションや
// バナーを巻き込まない。
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  return /Could not find the table|schema cache/i.test(error.message ?? '')
}

// EMA タッチ候補（ema_setups）を単一 date で読む。
// PK は (date, code, ema) で 1タッチ=1行。同じ銘柄が同日に複数 EMA へタッチすれば
// 最大 3 行出るので、表示前に groupByCode() で銘柄単位へ畳む（案1）。
//
// 他スキャナーと違い「連続ヒットの除外」は掛けない。同じ銘柄が何日続けて出るかは
// fresh 列が情報として持っており、配信側もフィルタ条件にしていないため。
async function fetchEmaSetups(date: string | null): Promise<{
  date: string | null
  rows: EmaSetupCardRow[]
  tableMissing: boolean
  error: string | null
}> {
  // 上限日（過去スナップショット閲覧時はその日まで）を決める。省略時は全体の最新タッチ日。
  // = 指定日以前で行が存在する直近の date。指定日がテーブルに無くても直近日へ落ちる。
  let latestQuery = supabase.from(EMA_SETUPS_TABLE).select('date')
  if (date) latestQuery = latestQuery.lte('date', date)
  const { data: latest, error: latestErr } = await latestQuery
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) {
    if (isMissingTableError(latestErr)) {
      console.warn(`[${EMA_SETUPS_TABLE}] table not deployed yet — skipping`)
      return { date: null, rows: [], tableMissing: true, error: null }
    }
    console.error(`[${EMA_SETUPS_TABLE}] latest date error`, latestErr)
    return { date: null, rows: [], tableMissing: false, error: `${EMA_SETUPS_TABLE}: ${latestErr.message}` }
  }

  const targetDate = (latest?.date as string | undefined) ?? null
  if (!targetDate) return { date: null, rows: [], tableMissing: false, error: null }

  // select('*') で供給側のスキーマ増減に耐性を持たせる（他テーブルと同方針）。
  const { data, error } = await supabase.from(EMA_SETUPS_TABLE).select('*').eq('date', targetDate)
  if (error) {
    if (isMissingTableError(error)) {
      console.warn(`[${EMA_SETUPS_TABLE}] table not deployed yet — skipping`)
      return { date: null, rows: [], tableMissing: true, error: null }
    }
    console.error(`[${EMA_SETUPS_TABLE}] fetch error`, error)
    return { date: targetDate, rows: [], tableMissing: false, error: `${EMA_SETUPS_TABLE}: ${error.message}` }
  }

  const raw = (data ?? []) as unknown as EmaSetupRow[]
  return { date: targetDate, rows: groupByCode(raw), tableMissing: false, error: null }
}

// Advanced Structure Pivot（1st / 2nd ヒット）を「直近ヒット窓」で読む。
// date（ヒット日）は動かず status/各 hit_date が後日 後追い更新され、10営業日窓から外れた行は
// 凍結してテーブルに残り続ける。よって単一 date ではなく直近 STRUCTURE_WINDOW_DAYS 本の
// distinct なヒット日にウィンドウする。
//
// 表示方針（ダッシュ側裁量。0choir17 と確認済み）:
//   - 本日（anchor 日）にヒットした銘柄のみ表示。
//   - 銘柄ごとに1枚へ集約（代表行は同日 1st/2nd 両方なら 2nd を採用。本日の 1st/2nd 有無は別途保持）。
//   - 終了済み（is_active=false ＝ TP2 到達 or STOPPED）はライブなウォッチではないので除外。
//   - カードには 1st / 2nd それぞれの直近ヒット日（last_1st_date / last_2nd_date）を並べる。
//     本日ヒットしたシグナルの日付は anchor（本日）になる。
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

  // upper 以前の distinct なヒット日を新しい順に集め、N 本目を表示窓の下端にする。
  const { data: dateRows, error: dateErr } = await supabase
    .from(STRUCTURE_PIVOT_TABLE)
    .select('date')
    .lte('date', upper)
    .order('date', { ascending: false })
    .limit(2000)
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
    })
  }

  return { date: anchor, rows: [...byCode.values()], error: null }
}

export async function fetchToday(opts: { date?: string }): Promise<TodayResponse> {
  const requested = opts.date ?? null

  const [emaRes, structRes, hotRes] = await Promise.all([
    fetchEmaSetups(requested),
    fetchStructurePivotEvents(requested),
    fetchHotSectors(requested),
  ])

  const errors = [emaRes.error, structRes.error, hotRes.error].filter((e): e is string => !!e)

  return {
    emaDate: emaRes.date,
    ema: emaRes.rows,
    emaTableMissing: emaRes.tableMissing,
    structDate: structRes.date,
    struct: structRes.rows,
    hotSectors: hotRes.sectors,
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
