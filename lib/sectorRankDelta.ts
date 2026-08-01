import type { SectorHistoryResponse } from '@/lib/sectorSelectionHistoryFetch'

/**
 * composite_score_rank の順位変動。
 *
 * 履歴（sector_selection_s33 の直近 N 営業日）は Sector Selection 画面が
 * RRG / Bars 用にすでに読んでいるので、順位変動の算出に追加のフェッチは要らない。
 */

export const RANK_DELTA_PERIODS = [
  { key: '1d', label: '1D', tradingDays: 1 },
  { key: '1w', label: '1W', tradingDays: 5 },
  { key: '1m', label: '1M', tradingDays: 21 },
] as const

export type RankDeltaPeriodKey = (typeof RANK_DELTA_PERIODS)[number]['key']

/**
 * 既定は 1W。33業種の序数は構成銘柄の 1 日の値動きで数位動くため、
 * 1D だと「変動した業種」が毎日入れ替わってノイズになる。
 */
export const DEFAULT_RANK_DELTA_PERIOD: RankDeltaPeriodKey = '1w'

/** これ以上動いた業種を「大きく動いた」として強調・絞り込みの対象にする */
export const BIG_MOVE_THRESHOLD = 5

export type RankDelta = {
  /** 順位の変化幅。正 = 順位が上がった（数字が小さくなった）。比較不能なら null */
  delta: number | null
  /** 比較日の順位 */
  fromRank: number | null
  /** 基準日（最新）の順位 */
  toRank: number | null
  fromDate: string | null
  toDate: string | null
  /** 基準日には順位があるが、比較日には無い（新規計上） */
  isNew: boolean
}

export type RankDeltaMap = Record<string, RankDelta>

/**
 * 比較日の行が欠けていたときに代わりに見にいく近傍オフセット（営業日）。
 * 近い日を優先する。順位は日次で連続しているので広く探す必要はない。
 */
const NEIGHBOR_OFFSETS = [0, -1, 1, -2, 2]

const EMPTY: RankDelta = {
  delta: null,
  fromRank: null,
  toRank: null,
  fromDate: null,
  toDate: null,
  isNew: false,
}

function rankAt(
  byDate: Record<string, { composite_score_rank: number | null }>,
  date: string | undefined,
): number | null {
  if (!date) return null
  const r = byDate[date]?.composite_score_rank
  return typeof r === 'number' && Number.isFinite(r) ? r : null
}

/**
 * 全業種の順位変動を組み立てる。
 *
 * @param history fetchSectorSelectionHistory の戻り値（dates は昇順）
 * @param tradingDays 何営業日前と比較するか
 */
export function buildRankDeltas(
  history: SectorHistoryResponse,
  tradingDays: number,
): RankDeltaMap {
  const { dates, bySector } = history
  const out: RankDeltaMap = {}
  if (dates.length === 0) return out

  for (const [sector, byDate] of Object.entries(bySector)) {
    // 基準日: 最新の営業日から数日ぶんだけ遡って、順位が入っている最初の日
    let toIdx = -1
    const oldestBase = Math.max(0, dates.length - NEIGHBOR_OFFSETS.length)
    for (let i = dates.length - 1; i >= oldestBase; i--) {
      if (rankAt(byDate, dates[i]) !== null) {
        toIdx = i
        break
      }
    }
    if (toIdx < 0) {
      out[sector] = EMPTY
      continue
    }
    const toRank = rankAt(byDate, dates[toIdx])
    const toDate = dates[toIdx]

    // 比較日: 目標オフセットの近傍で、順位が入っている最初の日
    let fromIdx = -1
    for (const off of NEIGHBOR_OFFSETS) {
      const i = toIdx - tradingDays + off
      if (i < 0 || i >= toIdx) continue
      if (rankAt(byDate, dates[i]) !== null) {
        fromIdx = i
        break
      }
    }
    if (fromIdx < 0) {
      // 履歴が期間ぶん無い（＝計上されたばかり）のか、単に日付が足りないのかは
      // 呼び出し側では区別できないので、履歴の先頭に届いているかで判定する。
      const historyCoversPeriod = toIdx - tradingDays >= 0
      out[sector] = {
        ...EMPTY,
        toRank,
        toDate,
        isNew: historyCoversPeriod && toRank !== null,
      }
      continue
    }

    const fromRank = rankAt(byDate, dates[fromIdx])
    out[sector] = {
      // 順位は小さいほど上位なので、上昇を正にするため from - to
      delta: fromRank !== null && toRank !== null ? fromRank - toRank : null,
      fromRank,
      toRank,
      fromDate: dates[fromIdx],
      toDate,
      isNew: false,
    }
  }
  return out
}

/** 強調・絞り込みの対象か（|delta| が閾値以上、または新規計上） */
export function isBigMove(d: RankDelta | undefined): boolean {
  if (!d) return false
  if (d.isNew) return true
  return d.delta !== null && Math.abs(d.delta) >= BIG_MOVE_THRESHOLD
}
