// R（初期リスク倍数）ベースの成績集計。
//
// 方針: 「勝率」ではなく「1 回あたり平均何 R 稼いだか（期待値）」を主役にする。
// 低勝率でも、損失を -1R に抑えて少数の大勝ちを伸ばせば期待値はプラスになる。
//
// 分割決済は CloseModal が「同じ ticker / entry_date / entry_price を持つ closed
// レコード」を複数作るため、そのまま数えると 1 ポジションが複数トレードに化ける。
// ここではそれらを 1 ポジションに束ね、株数加重で R を合成する。
// （同じ建玉は ATR も同じなので、ATR 基準では Σpnl ÷ (Σ株数 × ATR) と一致する）
//
// R は 2 種類あり、混ぜずに基準（RBasis）ごとに集計する:
//   stop … r_multiple = (決済 − 建値) ÷ (建値 − 初期ストップ)。損切りどおりなら -1R
//   atr  … r_atr      = (決済 − 建値) ÷ 買う前日の ATR14。損切り価格が無くても出せる代用値

import { Trade } from '@/types/trades'
import { effectiveResult, nextLossStreak, TradeResult } from '@/lib/tradeResult'

export type RBasis = 'stop' | 'atr'

export const R_BASIS_LABEL: Record<RBasis, string> = {
  stop: '損切り基準',
  atr: 'ATR 基準',
}

/** 単位表記。損切り基準は R、ATR 基準は ATR（値動きが 1 日平均値幅の何倍か） */
export const R_UNIT: Record<RBasis, string> = { stop: 'R', atr: 'ATR' }

export function rOf(t: Pick<Trade, 'r_multiple' | 'r_atr'>, basis: RBasis): number | null {
  const v = basis === 'stop' ? t.r_multiple : t.r_atr
  return v != null && Number.isFinite(v) ? v : null
}

/** 「大きすぎる負け」の線。損切り基準は損切り遅れ（-1.5R）、ATR 基準は -3ATR */
export const DEEP_LOSS: Record<RBasis, number> = { stop: -1.5, atr: -3 }

/** 件数が多いほうの基準（初期表示用） */
export function preferredBasis(trades: Trade[]): RBasis {
  const closed = trades.filter(t => t.status === 'closed')
  const nStop = closed.filter(t => rOf(t, 'stop') != null).length
  const nAtr = closed.filter(t => rOf(t, 'atr') != null).length
  return nAtr > nStop ? 'atr' : 'stop'
}

/** 決済時の ATR 基準 R（atr_at_entry が無ければ null） */
export function computeRAtr(entry: number, exit: number, atr: number | null | undefined): number | null {
  return atr != null && atr > 0 ? (exit - entry) / atr : null
}

export type ClosedPosition = {
  key: string
  ticker: string
  entryDate: string
  /** 最後の決済日（分割決済なら最終分） */
  exitDate: string | null
  shares: number
  pnl: number
  /** 株数加重 R。初期ストップ不明のレコードが混じれば null */
  r: number | null
  result: TradeResult | null
  /** 暦日での保有日数（同日決済 = 0） */
  holdDays: number | null
  /** 同じキーで建玉が残っている（分割決済の途中） */
  stillOpen: boolean
}

function positionKey(t: Pick<Trade, 'ticker' | 'entry_date' | 'entry_price'>): string {
  return `${t.ticker}|${t.entry_date}|${t.entry_price}`
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round(ms / 86400000))
}

export function groupClosedPositions(trades: Trade[], basis: RBasis = 'stop'): ClosedPosition[] {
  const openKeys = new Set(trades.filter(t => t.status === 'open').map(positionKey))
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    if (t.status !== 'closed') continue
    const k = positionKey(t)
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }

  const out: ClosedPosition[] = []
  for (const [key, rows] of groups) {
    const shares = rows.reduce((s, t) => s + (t.shares ?? 0), 0)
    const pnl = rows.reduce((s, t) => s + (t.pnl ?? 0), 0)
    const allHaveR = rows.every(t => rOf(t, basis) != null)
    const r = allHaveR && shares > 0
      ? rows.reduce((s, t) => s + (rOf(t, basis) as number) * (t.shares ?? 0), 0) / shares
      : null
    const exitDate = rows
      .map(t => t.exit_date)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null
    const first = rows[0]
    // 1 レコードなら保存済み result を尊重、複数なら合算 pnl から判定
    const result = rows.length === 1 ? effectiveResult(first) : effectiveResult({ pnl })
    out.push({
      key,
      ticker: first.ticker,
      entryDate: first.entry_date,
      exitDate,
      shares,
      pnl,
      r,
      result,
      holdDays: daysBetween(first.entry_date, exitDate),
      stillOpen: openKeys.has(key),
    })
  }
  // 決済順（古い → 新しい）。連敗計算はこの順序に依存する。
  out.sort((a, b) => (a.exitDate ?? '').localeCompare(b.exitDate ?? '') || a.key.localeCompare(b.key))
  return out
}

// ── R 分布のビン ─────────────────────────────────────────────
export type RBin = { label: string; min: number; max: number; tone: 'deep' | 'loss' | 'small' | 'win' | 'big' }

/** 損切り基準: -1.5R 未満は「損切り遅れ」。-1R ちょうどの損切りは "-1.5〜-0.5" に入る。 */
const STOP_BINS: RBin[] = [
  { label: '< -1.5',    min: -Infinity, max: -1.5, tone: 'deep' },
  { label: '-1.5〜-0.5', min: -1.5, max: -0.5, tone: 'loss' },
  { label: '-0.5〜0',    min: -0.5, max: 0,    tone: 'small' },
  { label: '0〜1',       min: 0,    max: 1,    tone: 'small' },
  { label: '1〜3',       min: 1,    max: 3,    tone: 'win' },
  { label: '3〜5',       min: 3,    max: 5,    tone: 'win' },
  { label: '5+',         min: 5,    max: Infinity, tone: 'big' },
]

/** ATR 基準: 損切り位置に依らないので負け側を広めに切る。-3ATR 未満を「大きな負け」 */
const ATR_BINS: RBin[] = [
  { label: '< -3',   min: -Infinity, max: -3, tone: 'deep' },
  { label: '-3〜-1', min: -3, max: -1, tone: 'loss' },
  { label: '-1〜0',  min: -1, max: 0,  tone: 'small' },
  { label: '0〜1',   min: 0,  max: 1,  tone: 'small' },
  { label: '1〜3',   min: 1,  max: 3,  tone: 'win' },
  { label: '3〜5',   min: 3,  max: 5,  tone: 'win' },
  { label: '5+',     min: 5,  max: Infinity, tone: 'big' },
]

export function rBins(basis: RBasis): RBin[] {
  return basis === 'stop' ? STOP_BINS : ATR_BINS
}

function binIndex(bins: RBin[], r: number): number {
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i]
    if (r >= b.min && r < b.max) return i
  }
  return bins.length - 1
}

// ── 減速ルール ───────────────────────────────────────────────
/** この連敗数に達したらリスク % を半分に */
export const SLOWDOWN_STREAK = 5
/** 当月の累計 R がこれ以下ならリスク % を半分に */
export const SLOWDOWN_MONTH_R = -5

export type RStats = {
  basis: RBasis
  positions: number
  /** R が算出できたポジション数（初期ストップ未設定は除外） */
  withR: number
  missingR: number
  wins: number
  losses: number
  winRate: number | null
  avgWinR: number | null
  avgLossR: number | null
  /** 期待値（1 ポジションあたり平均 R） */
  expectancy: number | null
  totalR: number
  /** 平均勝ち / 平均負けから逆算した損益分岐勝率（%） */
  breakevenWinRate: number | null
  /** 上位 10 ポジションの R 合計と、総 R に占める割合 */
  top10R: number | null
  top10Share: number | null
  /** DEEP_LOSS[basis] より深い負けの件数（損切り基準なら損切り遅れ） */
  deepLosses: number
  bins: number[]
  /** 損益合計（円）と PF（総利益 ÷ 総損失、ポジション単位） */
  totalPnl: number
  profitFactor: number | null
  avgHoldWin: number | null
  avgHoldLoss: number | null
  currentLossStreak: number
  maxLossStreak: number
  monthR: number
  slowdown: { active: boolean; reasons: string[] }
}

function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export function computeRStats(trades: Trade[], today: string, basis: RBasis = 'stop'): RStats {
  const ps = groupClosedPositions(trades, basis)
  const rs = ps.filter((p): p is ClosedPosition & { r: number } => p.r != null)

  const winsR = rs.filter(p => p.result === 'WIN').map(p => p.r)
  const lossesR = rs.filter(p => p.result === 'LOSS').map(p => p.r)
  const avgWinR = mean(winsR)
  const avgLossR = mean(lossesR)
  const totalR = rs.reduce((s, p) => s + p.r, 0)
  const expectancy = rs.length > 0 ? totalR / rs.length : null

  // 勝率 p で期待値 0 になる点: p·W = (1−p)·|L| → p = |L| / (W + |L|)
  const breakevenWinRate = avgWinR != null && avgLossR != null && avgWinR + Math.abs(avgLossR) > 0
    ? Math.abs(avgLossR) / (avgWinR + Math.abs(avgLossR)) * 100
    : null

  const sortedDesc = rs.map(p => p.r).sort((a, b) => b - a)
  const top10R = sortedDesc.length > 0 ? sortedDesc.slice(0, 10).reduce((a, b) => a + b, 0) : null
  const top10Share = top10R != null && totalR > 0 ? (top10R / totalR) * 100 : null

  const binDefs = rBins(basis)
  const bins = binDefs.map(() => 0)
  for (const p of rs) bins[binIndex(binDefs, p.r)]++

  // 勝率は R 有無に関係なく全ポジションで（JournalStats と同じ定義: BE は分母外）
  const wins = ps.filter(p => p.result === 'WIN').length
  const losses = ps.filter(p => p.result === 'LOSS').length
  const decided = wins + losses

  const holdOf = (res: TradeResult) =>
    mean(ps.filter(p => p.result === res && p.holdDays != null).map(p => p.holdDays as number))

  // 連敗: 分割決済の途中（建玉が残っている）ものは結果未確定なので数えない
  let streak = 0
  let maxStreak = 0
  for (const p of ps) {
    if (p.stillOpen) continue
    streak = nextLossStreak(streak, p.result)
    maxStreak = Math.max(maxStreak, streak)
  }

  const month = today.slice(0, 7)
  const monthR = rs
    .filter(p => (p.exitDate ?? '').slice(0, 7) === month)
    .reduce((s, p) => s + p.r, 0)

  const reasons: string[] = []
  if (streak >= SLOWDOWN_STREAK) reasons.push(`${streak} 連敗中（基準 ${SLOWDOWN_STREAK}）`)
  const u = R_UNIT[basis]
  if (monthR <= SLOWDOWN_MONTH_R) reasons.push(`当月 ${monthR.toFixed(1)}${u}（基準 ${SLOWDOWN_MONTH_R}${u}）`)

  return {
    basis,
    positions: ps.length,
    withR: rs.length,
    missingR: ps.length - rs.length,
    wins,
    losses,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    avgWinR,
    avgLossR,
    expectancy,
    totalR,
    breakevenWinRate,
    top10R,
    top10Share,
    deepLosses: rs.filter(p => p.r < DEEP_LOSS[basis]).length,
    bins,
    totalPnl: ps.reduce((a, p) => a + p.pnl, 0),
    profitFactor: (() => {
      const gp = ps.filter(p => p.pnl > 0).reduce((a, p) => a + p.pnl, 0)
      const gl = Math.abs(ps.filter(p => p.pnl < 0).reduce((a, p) => a + p.pnl, 0))
      return gl > 0 ? gp / gl : gp > 0 ? Infinity : null
    })(),
    avgHoldWin: holdOf('WIN'),
    avgHoldLoss: holdOf('LOSS'),
    currentLossStreak: streak,
    maxLossStreak: maxStreak,
    monthR,
    slowdown: { active: reasons.length > 0, reasons },
  }
}

/** 1R 当たりの許容損失額から株数を出す（100 株単位に切り捨て） */
export function suggestShares(opts: {
  capital: number
  riskPct: number
  entry: number
  stop: number
  lot?: number
}): { shares: number; riskYen: number; positionYen: number; positionPct: number } | null {
  const { capital, riskPct, entry, stop, lot = 100 } = opts
  const perShare = entry - stop
  if (!(capital > 0) || !(riskPct > 0) || !(entry > 0) || !(perShare > 0)) return null
  const riskBudget = capital * riskPct / 100
  const shares = Math.floor(riskBudget / perShare / lot) * lot
  return {
    shares,
    riskYen: shares * perShare,
    positionYen: shares * entry,
    positionPct: (shares * entry) / capital * 100,
  }
}
