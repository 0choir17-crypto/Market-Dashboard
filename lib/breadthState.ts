import { supabase } from './supabase'

// Market Breadth の判定。主役は「50日線より上の銘柄の割合」(pct_above_sma50)。
//
// この割合は建玉の偏りそのもの:
// - 高い … 過去 50 日に買った人の大半が含み益 = 利食い予備軍が多く、新規の買い余力は小さい
// - 低い … 投げるべき人はかなり投げ終わった。ただし買い手が戻った証拠ではない
// なので水準だけでなく「増えているか減っているか」（5 営業日前との差）を添える。
//
// ⚠️ pct_above_sma20 はバッチ側への追加依頼中（docs/BATCH_REQUEST_PCT_ABOVE_SMA20.md）。
//    列が無い間に名指しで select すると PostgREST がエラーを返すので select('*') で取り、
//    届いていなければ null として扱う。

export type BreadthSignal = 'green' | 'yellow' | 'red'

export type BreadthLevel = 'hot' | 'healthy' | 'mixed' | 'weak'

/** 水準の境目（%）。著者の目安: 70〜80 超 = 広範な強さ / 約 50 = 中立 / 20〜30 未満 = 弱い */
export const BREADTH_HOT = 70
export const BREADTH_MID = 50
export const BREADTH_WEAK = 30

/** 向きを測る間隔（営業日）と、横ばいとみなす幅（ポイント） */
export const BREADTH_LOOKBACK = 5
export const BREADTH_FLAT = 2

export type BreadthMetric = {
  /** 最終日の値（%）。列が無い・値が無ければ null */
  value: number | null
  /** BREADTH_LOOKBACK 営業日前との差（ポイント） */
  delta: number | null
}

export type BreadthState = {
  date: string
  sma20: BreadthMetric
  sma50: BreadthMetric
  sma200: BreadthMetric
  level: BreadthLevel | null
  signal: BreadthSignal | null
  label: string
}

export const LEVEL_LABEL: Record<BreadthLevel, string> = {
  hot: '広範な強さ',
  healthy: '健全',
  mixed: 'まちまち',
  weak: '弱い・売られすぎ',
}

export function breadthLevel(v: number): BreadthLevel {
  if (v >= BREADTH_HOT) return 'hot'
  if (v >= BREADTH_MID) return 'healthy'
  if (v >= BREADTH_WEAK) return 'mixed'
  return 'weak'
}

/**
 * 判定ルール（SMA50 上の割合 = v、5 営業日前との差 = d）:
 * - v ≥ 70 … 黄「広範な強さ（伸び切り注意）」— 勢いは続きうるが楽な儲けは出尽くしがち
 * - 50 ≤ v < 70 … 緑「健全」/ d ≤ −2 なら 黄「健全だが低下中」
 * - 30 ≤ v < 50 … 黄「まちまち」— 単独では判断材料にならない。主導株を見る
 * - v < 30 … 赤「弱い・売られすぎ」/ d ≥ +2 なら 黄「売られすぎから回復中」
 */
export function classifyBreadth(
  v: number,
  d: number | null,
): { level: BreadthLevel; signal: BreadthSignal; label: string } {
  const level = breadthLevel(v)
  const rising = d != null && d >= BREADTH_FLAT
  const falling = d != null && d <= -BREADTH_FLAT
  switch (level) {
    case 'hot':
      return { level, signal: 'yellow', label: '広範な強さ（伸び切り注意）' }
    case 'healthy':
      return falling
        ? { level, signal: 'yellow', label: '健全だが低下中' }
        : { level, signal: 'green', label: '健全' }
    case 'mixed':
      return { level, signal: 'yellow', label: 'まちまち（主導株を見る）' }
    case 'weak':
      return rising
        ? { level, signal: 'yellow', label: '売られすぎから回復中' }
        : { level, signal: 'red', label: '弱い・売られすぎ' }
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function metric(rows: Record<string, unknown>[], column: string): BreadthMetric {
  const value = num(rows[0]?.[column])
  const prev = num(rows[BREADTH_LOOKBACK]?.[column])
  return { value, delta: value != null && prev != null ? value - prev : null }
}

/** @param endDate 過去スナップショット表示時の終端日（省略時は最新） */
export async function fetchBreadthState(
  endDate?: string,
): Promise<{ state: BreadthState | null; error: string | null }> {
  let q = supabase
    .from('market_conditions')
    .select('*')
    .order('date', { ascending: false })
    .limit(BREADTH_LOOKBACK + 1)
  if (endDate) q = q.lte('date', endDate)

  const { data, error } = await q
  if (error) {
    console.error('[market_conditions breadth]', error)
    return { state: null, error: error.message }
  }
  // 新しい順。rows[0] = 最終日、rows[BREADTH_LOOKBACK] = 5 営業日前
  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return { state: null, error: null }

  const sma50 = metric(rows, 'pct_above_sma50')
  const judged =
    sma50.value != null
      ? classifyBreadth(sma50.value, sma50.delta)
      : { level: null, signal: null, label: 'データなし' }
  return {
    state: {
      date: rows[0].date as string,
      sma20: metric(rows, 'pct_above_sma20'),
      sma50,
      sma200: metric(rows, 'pct_above_sma200'),
      ...judged,
    },
    error: null,
  }
}
