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

type AggregatableTrade = {
  result?: TradeResult | string | null
  pnl?: number | null
}

// wins / (wins + losses) * 100. Breakeven trades are excluded from the
// denominator: a flat outcome is not evidence for or against the edge.
// Returns null when no decided trades exist.
export function winRate(trades: AggregatableTrade[]): number | null {
  let wins = 0
  let losses = 0
  for (const t of trades) {
    if (isWin(t)) wins++
    else if (isLoss(t)) losses++
  }
  const decided = wins + losses
  return decided > 0 ? (wins / decided) * 100 : null
}

// grossProfit / |grossLoss|. Returns Infinity when there are wins but no
// losses, and null when both grossProfit and grossLoss are zero.
export function profitFactor(trades: AggregatableTrade[]): number | null {
  let grossProfit = 0
  let grossLoss = 0
  for (const t of trades) {
    const pnl = t.pnl ?? 0
    if (isWin(t)) grossProfit += pnl
    else if (isLoss(t)) grossLoss += Math.abs(pnl)
  }
  if (grossLoss > 0) return grossProfit / grossLoss
  if (grossProfit > 0) return Infinity
  return null
}
