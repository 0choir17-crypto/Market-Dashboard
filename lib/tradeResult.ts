// Single source of truth for trade WIN / LOSS / BREAKEVEN classification.
// Three rules across the app (SBI importer, Close/Edit modals, aggregation
// fallbacks) used to disagree on pnl=0, producing different bucket
// assignments for the same trade. This module is the canonical answer.
//
//   pnl  >  0 → WIN
//   pnl  <  0 → LOSS
//   pnl === 0 → BREAKEVEN
//   pnl null  → null (open / unknown)

export type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN'

export function classifyResult(pnl: number | null | undefined): TradeResult | null {
  if (pnl == null) return null
  if (pnl > 0) return 'WIN'
  if (pnl < 0) return 'LOSS'
  return 'BREAKEVEN'
}

// Prefer the persisted `result` column when valid; otherwise derive from pnl.
// Tolerates legacy rows that may have been imported with no `result` value.
export function effectiveResult(t: {
  result?: TradeResult | string | null
  pnl?: number | null
}): TradeResult | null {
  if (t.result === 'WIN' || t.result === 'LOSS' || t.result === 'BREAKEVEN') {
    return t.result
  }
  return classifyResult(t.pnl ?? null)
}

export function isWin(t: { result?: TradeResult | string | null; pnl?: number | null }): boolean {
  return effectiveResult(t) === 'WIN'
}

export function isLoss(t: { result?: TradeResult | string | null; pnl?: number | null }): boolean {
  return effectiveResult(t) === 'LOSS'
}

export function isBreakeven(t: { result?: TradeResult | string | null; pnl?: number | null }): boolean {
  return effectiveResult(t) === 'BREAKEVEN'
}
