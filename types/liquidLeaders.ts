// リキッド・リーダー — 機関投資家が大量に売買できる銘柄のうち、市場平均を
// 上回る買いが入り続けている銘柄の日次一覧。
// Source table: public.liquid_leaders  (PK: date + code)
// Pipeline: scripts/daily/scan_liquid_leaders.py (別リポ) が毎平日の引け後に
//           直近 5 営業日を upsert。2025-09 以降の履歴を投入済み。
//
// 1 行 = その日、t21 か t63 のどちらかの一覧に入っている銘柄。
// 一覧の出入り: t が段ごとの「入る線」以上で入り、入った後の t の最高値から 1 下がったら外れる。
// 段に入れるのは ADR% (20 日) が段ごとの下限以上の日だけ (2026-10-03 修正 3)。値動きの
// ほとんど無い銘柄が「TOPIX が下げた日に下げなかっただけ」で t21 を 2 超えにするのを防ぐ。
// ADR はその日の値で判定し、下限を割った日は段の外 = 一覧からも sector の n_universe からも外れる。
// 「市場の状況の確認」用で、売買のタイミングを示すものではない。


/** 流動性の段。large = 60 日売買代金の上位 200 位 かつ ADR 2% 以上 / mid = 201〜1,000 位 かつ ADR 3% 以上 */
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

export type TierDef = {
  key: LiquidTier
  label: string
  hint: string
  /** 段に入れる ADR% (20 日) の下限 */
  adrMin: number
  /** 一覧に入る t の線 (出る線はどの段も「入った後の最高値 − 1」) */
  enter: number
}

export const TIERS: TierDef[] = [
  { key: 'large', label: '大型', hint: '60 日売買代金 上位 200 位 · ADR 2% 以上 · t 2.0 以上で入る', adrMin: 2, enter: 2 },
  { key: 'mid', label: '中小', hint: '60 日売買代金 201〜1,000 位 · ADR 3% 以上 · t 1.5 以上で入る', adrMin: 3, enter: 1.5 },
]

export type LiquidPeriod = 't21' | 't63'

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null
}

/**
 * 一覧の既定の並び: t63 の一覧にいる銘柄を t63 の高い順、その後ろに
 * t63 の一覧にいない銘柄を t21 の高い順。ヒートマップ B の行順も同じ。
 */
export function byListOrder(a: LiquidLeader, b: LiquidLeader): number {
  const ai = a.in_t63 === true
  const bi = b.in_t63 === true
  if (ai !== bi) return ai ? -1 : 1
  if (ai) {
    const d = (num(b.t63) ?? -Infinity) - (num(a.t63) ?? -Infinity)
    if (d !== 0) return d
  }
  return (num(b.t21) ?? -Infinity) - (num(a.t21) ?? -Infinity)
}

// ── 5 日比 ────────────────────────────────────────────────────────────
// 5 日比 = 今日の t − 5 営業日前の t (営業日 = liquid_leaders にある日付を数える)。
// liquid_leaders は一覧に入っている日の行しか無いので、5 営業日前にその銘柄の
// 行が無ければ比べられない → 「新規」(5 営業日以内に一覧に入った銘柄)。

export const DIFF_DAYS = 5

/** 5 日比の値。'new' = 5 営業日前に行が無い / null = どちらかの t が欠損 */
export type TDiff = number | 'new' | null

export function tDiff(
  now: number | null | undefined,
  prevRow: Pick<LiquidLeader, 't21' | 't63'> | undefined,
  period: LiquidPeriod,
): TDiff {
  if (!prevRow) return 'new'
  const a = num(now)
  const b = num(period === 't21' ? prevRow.t21 : prevRow.t63)
  return a === null || b === null ? null : a - b
}

// +0.1 以上 = 上昇 (緑) / −0.1 以下 = 下降 (赤) / それ以外・新規 = 横ばい (灰)
export function diffColor(d: TDiff): string {
  if (typeof d !== 'number') return 'var(--text-muted)'
  if (d >= 0.1) return 'var(--positive)'
  if (d <= -0.1) return 'var(--negative)'
  return 'var(--text-muted)'
}

export function fmtDiff(d: TDiff): string {
  if (d === 'new') return '新規'
  if (d === null) return '—'
  const r = Math.round(d * 100) / 100
  if (r === 0) return '±0.00'
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}`
}
