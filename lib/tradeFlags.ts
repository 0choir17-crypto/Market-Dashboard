// 決済済みトレードの「自動判定」。レビューを手で入力しなくても、記録済みの数字から
// 振り返るべき点を拾う。保存はしない（表示のたびに計算）。
//
// 値幅の物差しは ATR（atr_at_entry）を優先し、無ければ ADR%（adr_at_entry）で代用する。

import { Trade } from '@/types/trades'
import { effectiveResult } from '@/lib/tradeResult'
import type { SemanticTone } from '@/types/semantic'

export type TradeFlag = { id: string; label: string; tone: SemanticTone; title: string }

/** 取り逃し率（%）。勝ちトレードで、MFE に対して実際の利益がどれだけ足りなかったか。
 *  負けトレードは分母（MFE）が小さいと値が暴れるので出さない（含み益からの負けは「吐き出し」で拾う） */
export function missedRate(t: Pick<Trade, 'mfe_pct' | 'pnl_pct'>): number | null {
  if (t.mfe_pct == null || t.mfe_pct <= 0 || t.pnl_pct == null || t.pnl_pct <= 0) return null
  return Math.max(0, (t.mfe_pct - t.pnl_pct) / t.mfe_pct * 100)
}

/** 値動きを「1 日平均値幅」の何倍かに直す（ATR 優先、無ければ ADR%） */
function inDailyRanges(t: Trade, pct: number | null | undefined): number | null {
  if (pct == null) return null
  if (t.atr_at_entry != null && t.atr_at_entry > 0 && t.entry_price > 0) {
    return (pct / 100 * t.entry_price) / t.atr_at_entry
  }
  if (t.adr_at_entry != null && t.adr_at_entry > 0) return pct / t.adr_at_entry
  return null
}

/** 取り逃し: 勝ったが MFE の 6 割以上を逃した */
export const MISSED_THRESHOLD = 60
/** 吐き出し: 2 日分以上の含み益を出してから負け */
export const GAVE_BACK_RANGES = 2
/** 大きな負け: 3 日分を超える負け */
export const BIG_LOSS_RANGES = -3
/** 大勝ち: 5 日分以上の勝ち */
export const BIG_WIN_RANGES = 5

export function tradeFlags(t: Trade): TradeFlag[] {
  const res = effectiveResult(t)
  const out: TradeFlag[] = []
  const pnlD = inDailyRanges(t, t.pnl_pct)
  const mfeD = inDailyRanges(t, t.mfe_pct)
  const missed = missedRate(t)

  if (res === 'WIN' && pnlD != null && pnlD >= BIG_WIN_RANGES) {
    out.push({ id: 'big_win', label: '大勝ち', tone: 'strong', title: `値幅 ${pnlD.toFixed(1)} 日分の勝ち` })
  }
  if (res === 'WIN' && missed != null && missed >= MISSED_THRESHOLD) {
    out.push({ id: 'missed', label: '取り逃し', tone: 'watch', title: `MFE の ${missed.toFixed(0)}% を逃した` })
  }
  if (res === 'LOSS' && mfeD != null && mfeD >= GAVE_BACK_RANGES) {
    out.push({ id: 'gave_back', label: '吐き出し', tone: 'weak', title: `値幅 ${mfeD.toFixed(1)} 日分の含み益から負け` })
  }
  if (res === 'LOSS' && pnlD != null && pnlD < BIG_LOSS_RANGES) {
    out.push({ id: 'big_loss', label: '大きな負け', tone: 'weak', title: `値幅 ${pnlD.toFixed(1)} 日分の負け` })
  }
  return out
}
