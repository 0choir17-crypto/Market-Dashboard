import { supabase } from '@/lib/supabase'
import type { MomentumLeader, Horizon } from '@/types/momentumLeaders'
import { HORIZONS } from '@/types/momentumLeaders'

// 生の上昇率ランキング（全窓・無フィルタ）の日次スナップショット取得。
// 最新 date（= max(date)）のみを表示すればよい（過去日はバックフィル/履歴用）。
// select('*') で供給側 (jquants-scanner) のスキーマ増減に耐性を持たせる（market_leaders と同方針）。

const TABLE = 'momentum_leaders'

export type MomentumSnapshot = {
  latestDate: string | null
  // horizon (21 / 63 / 126) 別に rank 昇順で束ねた行。列描画側はそのまま並べるだけ。
  byHorizon: Record<Horizon, MomentumLeader[]>
  error: string | null
}

function emptyByHorizon(): Record<Horizon, MomentumLeader[]> {
  return { 21: [], 63: [], 126: [] }
}

// ── 最新日付の取得 ─────────────────────────────────────────────────────────
async function fetchLatestDate(): Promise<{ date: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[momentum_leaders latest date]', error)
    return { date: null, error: `${TABLE}: ${error.message}` }
  }
  return { date: (data?.date as string | undefined) ?? null, error: null }
}

// ── メインスナップショット ─────────────────────────────────────────────────
// 最新日（省略時は max(date)）の全窓の行を一括取得し、horizon 別に rank 昇順で束ねる。
// 件数感 ~180行/日（21d~29 / 63d~50 / 126d~99）で Supabase の 1000 行上限に余裕があるため
// 単発クエリで足りる。念のため rank 昇順で取得し、窓ごとに振り分ける。
export async function fetchMomentumSnapshot(date?: string): Promise<MomentumSnapshot> {
  let targetDate = date ?? null
  if (!targetDate) {
    const latest = await fetchLatestDate()
    if (latest.error) return { latestDate: null, byHorizon: emptyByHorizon(), error: latest.error }
    targetDate = latest.date
  }

  if (!targetDate) {
    return { latestDate: null, byHorizon: emptyByHorizon(), error: null }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('date', targetDate)
    .order('horizon', { ascending: true })
    .order('rank', { ascending: true })

  if (error) {
    console.error('[momentum_leaders snapshot]', error)
    return { latestDate: targetDate, byHorizon: emptyByHorizon(), error: `${TABLE}: ${error.message}` }
  }

  const byHorizon = emptyByHorizon()
  for (const raw of (data ?? []) as unknown as MomentumLeader[]) {
    const h = Number(raw.horizon) as Horizon
    if (HORIZONS.includes(h)) byHorizon[h].push(raw)
  }

  return { latestDate: targetDate, byHorizon, error: null }
}
