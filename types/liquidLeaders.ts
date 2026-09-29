// リキッド・リーダー — 機関投資家が大量に売買できる銘柄のうち、市場平均を
// 上回る買いが入り続けている銘柄の日次一覧。
// Source table: public.liquid_leaders  (PK: date + code)
// Pipeline: scripts/daily/scan_liquid_leaders.py (別リポ) が毎平日の引け後に
//           直近 5 営業日を upsert。2025-09 以降の履歴を投入済み。
//
// 1 行 = その日、t21 か t63 のどちらかの一覧に入っている銘柄。
// 一覧の出入り: t が 2 以上で入り、入った後の t の最高値から 1 下がったら外れる。
// 「市場の状況の確認」用で、売買のタイミングを示すものではない。

import type { SemanticTone } from '@/types/semantic'

/** 流動性の段。large = 60 日売買代金の上位 200 位 / mid = 201〜1,000 位 */
export type LiquidTier = 'large' | 'mid'

export type LiquidLeader = {
  date: string
  code: string
  tier: LiquidTier | string
  co_name: string | null
  sector_s33: string | null
  /** 自力の t 値（直近 21 日）。TOPIX につられた分を除いた強さの安定度。2 以上で強い */
  t21: number | null
  /** 同・直近 63 日 */
  t63: number | null
  in_t21: boolean | null
  in_t63: boolean | null
  /** t21 の一覧に今回入った日（入っていなければ null） */
  t21_since: string | null
  /** t63 の一覧に今回入った日 */
  t63_since: string | null
}

export const TIERS: { key: LiquidTier; label: string; hint: string }[] = [
  { key: 'large', label: '大型', hint: '60 日売買代金 上位 200 位' },
  { key: 'mid', label: '中小', hint: '60 日売買代金 201〜1,000 位' },
]

/** 状態 — 1 行に 1 つだけ付ける印。 */
export type LeaderState = 'start' | 'fade' | 'continue'

export const STATE_META: Record<
  LeaderState,
  { label: string; icon: string; tone: SemanticTone; hint: string }
> = {
  start: {
    label: '始まり',
    icon: '▲',
    tone: 'focus',
    hint: 't21 のみ — 新しい先導',
  },
  continue: {
    label: '継続',
    icon: '●',
    tone: 'strong',
    hint: 't21・t63 とも — 先導が続いている',
  },
  fade: {
    label: '失速',
    icon: '▼',
    tone: 'watch',
    hint: 't63 のみ — 3 か月は強かったが直近は失速',
  },
}

export function leaderState(r: Pick<LiquidLeader, 'in_t21' | 'in_t63'>): LeaderState | null {
  const a = r.in_t21 === true
  const b = r.in_t63 === true
  if (a && b) return 'continue'
  if (a) return 'start'
  if (b) return 'fade'
  return null
}

export type LiquidPeriod = 't21' | 't63'

/** 新しく入った順: その期間の since の新しい順、同じ日に入った銘柄どうしは t の高い順。 */
export function byNewestEntry(period: LiquidPeriod) {
  const since = (r: LiquidLeader) => (period === 't21' ? r.t21_since : r.t63_since) ?? ''
  const t = (r: LiquidLeader) => {
    const v = period === 't21' ? r.t21 : r.t63
    return v !== null && Number.isFinite(v) ? v : -Infinity
  }
  return (a: LiquidLeader, b: LiquidLeader) => {
    const as = since(a)
    const bs = since(b)
    if (as !== bs) return as < bs ? 1 : -1
    return t(b) - t(a)
  }
}
