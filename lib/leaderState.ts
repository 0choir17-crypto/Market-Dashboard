import { supabase } from './supabase'
import { fetchAllPaged } from './pagedFetch'
import type { LiquidLeader, LiquidTier } from '@/types/liquidLeaders'

// 主導株（Liquid Leaders）の状態。段（大型 / 中小）ごとに出す。
//
// 色の判定は持たない。2026-10 の検証（docs/VALIDATION_REQUEST_REGIME_THRESHOLDS.md への回答）で、
// 失速は普段から 70〜85% あり、30 / 50 の線では毎日ほぼ赤になること、失速の高さとその後の値動きに
// 関係が無いこと、指数の崩れに先行もしないことが分かったため。数字は情報としてだけ出す。
//
// - 一覧の件数（t21 / t63）と 5 営業日前との差 … 主導株が増えているか減っているか
// - 5 日の出入り（t21 の一覧）… 入った数と外れた数
// - 失速 = t63 の一覧にいる（3 か月強い）のに t21 の一覧にはいない（直近 1 か月が弱い）割合。
//
// ⚠️ 価格（終値と EMA21 の位置）は liquid_leaders に無いので「崩れ」は自力の t 値で見ている。
// ⚠️ 営業日は liquid_leaders にある日付で数える（一覧の 5 日比と同じ）。

export const LEADER_LOOKBACK = 5

export type LeaderRow = Pick<LiquidLeader, 'date' | 'code' | 'tier' | 'co_name' | 'sector_s33' | 't21' | 't63' | 'in_t21' | 'in_t63'>

export type CountDelta = { now: number; prev: number | null }

export type TierLeaderState = {
  tier: LiquidTier
  t21: CountDelta
  t63: CountDelta
  /** 5 日の間に t21 の一覧に入った / 外れた銘柄 */
  entered: LeaderRow[]
  exited: LeaderRow[]
  /** t63 の一覧にいて t21 の一覧にいない銘柄（今日） */
  faded: LeaderRow[]
  /** 失速の割合（%）。t63 の一覧が空なら null */
  fadePct: number | null
  fadePctPrev: number | null
}

export type LeaderStateResult = {
  date: string | null
  prevDate: string | null
  tiers: Record<LiquidTier, TierLeaderState | null>
  error: string | null
}

function fadeOf(rows: LeaderRow[]): { faded: LeaderRow[]; pct: number | null } {
  const t63 = rows.filter((r) => r.in_t63 === true)
  const faded = t63.filter((r) => r.in_t21 !== true)
  return { faded, pct: t63.length > 0 ? (faded.length / t63.length) * 100 : null }
}

function tierState(tier: LiquidTier, now: LeaderRow[], prev: LeaderRow[] | null): TierLeaderState {
  const nowT21 = new Set(now.filter((r) => r.in_t21 === true).map((r) => r.code))
  const prevT21 = prev ? new Set(prev.filter((r) => r.in_t21 === true).map((r) => r.code)) : null
  const entered = prevT21 ? now.filter((r) => r.in_t21 === true && !prevT21.has(r.code)) : []
  // 外れた銘柄は今日の行が無いこともあるので 5 日前の行を出す
  const exited = prev ? prev.filter((r) => r.in_t21 === true && !nowT21.has(r.code)) : []
  const f = fadeOf(now)
  const fPrev = prev ? fadeOf(prev) : null
  const t21 = { now: nowT21.size, prev: prevT21 ? prevT21.size : null }
  const t63 = {
    now: now.filter((r) => r.in_t63 === true).length,
    prev: prev ? prev.filter((r) => r.in_t63 === true).length : null,
  }
  return {
    tier,
    t21,
    t63,
    entered,
    exited,
    faded: f.faded,
    fadePct: f.pct,
    fadePctPrev: fPrev?.pct ?? null,
  }
}

/** @param endDate 過去スナップショット表示時の終端日（省略時は最新） */
export async function fetchLeaderState(endDate?: string): Promise<LeaderStateResult> {
  const empty = { large: null, mid: null }
  // 5 営業日 + 祝日の余裕で 14 暦日ぶん（1 日最大 ~180 行なので 3,000 行未満）
  const base = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date()
  base.setUTCDate(base.getUTCDate() - 14)
  const start = base.toISOString().slice(0, 10)

  const { rows, error } = await fetchAllPaged<LeaderRow>((from, to) => {
    let q = supabase
      .from('liquid_leaders')
      .select('date, code, tier, co_name, sector_s33, t21, t63, in_t21, in_t63')
      .gte('date', start)
      .order('date', { ascending: false })
      .order('code', { ascending: true })
    if (endDate) q = q.lte('date', endDate)
    return q.range(from, to) as unknown as PromiseLike<{
      data: LeaderRow[] | null
      error: { message: string } | null
    }>
  })
  if (error) {
    console.error('[liquid_leaders state]', error)
    return { date: null, prevDate: null, tiers: empty, error }
  }

  const dates = [...new Set(rows.map((r) => r.date))].sort((a, b) => (a > b ? -1 : 1))
  const date = dates[0] ?? null
  const prevDate = dates[LEADER_LOOKBACK] ?? null
  if (!date) return { date: null, prevDate: null, tiers: empty, error: null }

  const pick = (d: string | null, tier: LiquidTier) =>
    d ? rows.filter((r) => r.date === d && r.tier === tier) : null
  return {
    date,
    prevDate,
    tiers: {
      large: tierState('large', pick(date, 'large')!, pick(prevDate, 'large')),
      mid: tierState('mid', pick(date, 'mid')!, pick(prevDate, 'mid')),
    },
    error: null,
  }
}

export type LeaderCountPoint = { date: string; t21: number; t63: number }

/** 段ごとの一覧の件数の推移（liquid_leaders_sector の業種別件数を日ごとに足す） */
export async function fetchLeaderCountHistory(
  tier: LiquidTier,
  lookbackDays: number,
  endDate?: string,
): Promise<{ points: LeaderCountPoint[]; error: string | null }> {
  const base = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date()
  base.setUTCDate(base.getUTCDate() - lookbackDays)
  const start = base.toISOString().slice(0, 10)
  const { rows, error } = await fetchAllPaged<{ date: string; n_t21: number; n_t63: number }>((from, to) => {
    let q = supabase
      .from('liquid_leaders_sector')
      .select('date, n_t21, n_t63')
      .eq('tier', tier)
      .gte('date', start)
      .order('date', { ascending: true })
      .order('sector_s33', { ascending: true })
    if (endDate) q = q.lte('date', endDate)
    return q.range(from, to) as unknown as PromiseLike<{
      data: { date: string; n_t21: number; n_t63: number }[] | null
      error: { message: string } | null
    }>
  })
  if (error) {
    console.error('[liquid_leaders_sector count]', error)
    return { points: [], error }
  }
  const byDate = new Map<string, LeaderCountPoint>()
  for (const r of rows) {
    const p = byDate.get(r.date) ?? { date: r.date, t21: 0, t63: 0 }
    p.t21 += Number(r.n_t21) || 0
    p.t63 += Number(r.n_t63) || 0
    byDate.set(r.date, p)
  }
  return { points: [...byDate.values()], error: null }
}
