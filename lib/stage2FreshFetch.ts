import { supabase } from '@/lib/supabase'
import type { Stage2FreshRow } from '@/types/stage2Fresh'

// stage2_fresh は週次 (金曜引け後) に jquants-scanner が delete→upsert で push する
// 押し目買い候補テーブル。ダッシュボードは読み取り専用でブラウザから直接クエリする
// (structure_pivot / market_leaders と同方針。`output: export` のため API ルートは無い)。

const TABLE = 'stage2_fresh'

export type Stage2FreshSnapshot = {
  latestDate: string | null   // 表示対象日 (= 選択日 or 最新日)
  rows: Stage2FreshRow[]
  availableDates: string[]    // 日付ピッカー用 (降順)
}

// ── 利用可能な date 一覧 (週次なので件数は少ない) ─────────────────────────
async function fetchDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('date')
    .order('date', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[stage2_fresh dates]', error)
    return []
  }
  const unique = [...new Set((data ?? []).map(r => r.date as string))]
  unique.sort((a, b) => (a > b ? -1 : 1))
  return unique
}

// ── 指定日 (省略時は最新) の候補一覧 ─────────────────────────────────────
// 並び: weeks_in_s2 昇順 (新しい) → rs_topix_63 降順 (強い)。
// select('*') で供給側 (jquants-scanner) のスキーマ増減に耐性を持たせる
// (market_leaders と同方針)。
export async function fetchStage2Fresh(date?: string): Promise<Stage2FreshSnapshot> {
  const availableDates = await fetchDates()
  const targetDate = date ?? availableDates[0] ?? null

  if (!targetDate) {
    return { latestDate: null, rows: [], availableDates }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('date', targetDate)
    .order('weeks_in_s2', { ascending: true })
    .order('rs_topix_63', { ascending: false })

  if (error) {
    console.error('[stage2_fresh snapshot]', error)
    return { latestDate: targetDate, rows: [], availableDates }
  }

  return {
    latestDate: targetDate,
    rows: (data ?? []) as unknown as Stage2FreshRow[],
    availableDates,
  }
}
