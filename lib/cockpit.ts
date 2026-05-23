import type { OhlcvBar } from '@/types/chart'
import { aggregateWeekly, atr, ema, sma, wma } from '@/lib/indicators'

export type CockpitColor = 'green' | 'red' | 'yellow' | 'orange' | 'gray'

export type CockpitMetric = {
  key: string
  label: string
  value: string
  raw: number | null
  color: CockpitColor
  hint?: string
}

export type CockpitSnapshot = {
  asOf: string | null
  metrics: CockpitMetric[]
}

const num = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits)

const pct = (v: number | null | undefined, digits = 2): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}%`

const last = <T,>(arr: T[]): T | null => (arr.length === 0 ? null : arr[arr.length - 1])

/** Compute the 9-item Cockpit snapshot from a single security's daily bars. */
export function computeCockpit(bars: OhlcvBar[]): CockpitSnapshot {
  if (bars.length === 0) return { asOf: null, metrics: [] }

  const closes = bars.map(b => b.close)
  const lows = bars.map(b => b.low)

  // ratios
  const hlRatio = bars.map(b => (b.low > 0 ? b.high / b.low : 1))
  const adrSeries = sma(hlRatio, 20).map(v => (v == null ? null : 100 * (v - 1)))

  // MAs
  const ema21 = ema(closes, 21)
  const ema21Low = ema(lows, 21)
  const sma50 = sma(closes, 50)

  // ATR14 (Wilder)
  const atr14 = atr(bars, 14)

  // Weekly bars + WMA10 (weekly)
  const weekly = aggregateWeekly(bars)
  const weeklyCloses = weekly.map(b => b.close)
  const wma10w = wma(weeklyCloses, 10)
  const lastWma10w = last(wma10w) ?? null

  const i = bars.length - 1
  const close = closes[i]
  const adrPct = adrSeries[i] ?? null
  const ema21v = ema21[i] ?? null
  const ema21Lv = ema21Low[i] ?? null
  const sma50v = sma50[i] ?? null
  const atr14v = atr14[i] ?? null

  // 1) ADR % — green if 3.5–8.0 inclusive
  const adrColor: CockpitColor =
    adrPct != null && adrPct >= 3.5 && adrPct <= 8.0 ? 'green' : 'red'

  // 2) ATR 21EMA — (close - EMA21) / ATR14
  const ratioEma21 =
    atr14v != null && atr14v > 0 && ema21v != null
      ? (close - ema21v) / atr14v
      : null
  const ratioEma21Color: CockpitColor =
    ratioEma21 != null && ratioEma21 >= -0.5 && ratioEma21 <= 1.0 ? 'green' : 'red'

  // 3) ATR 10WMA — (close - WMA10_weekly) / ATR14
  const ratioWma10 =
    atr14v != null && atr14v > 0 && lastWma10w != null
      ? (close - lastWma10w) / atr14v
      : null
  const ratioWma10Color: CockpitColor =
    ratioWma10 != null && ratioWma10 >= -0.5 && ratioWma10 <= 1.0 ? 'green' : 'red'

  // 4) ATR 50SMA — (close - SMA50) / ATR14
  const ratioSma50 =
    atr14v != null && atr14v > 0 && sma50v != null
      ? (close - sma50v) / atr14v
      : null
  const ratioSma50Color: CockpitColor =
    ratioSma50 != null && ratioSma50 > 0 && ratioSma50 <= 3.0 ? 'green' : 'red'

  // 5) 21EMA Low — close vs EMA21(low)
  const ema21LowColor: CockpitColor =
    ema21Lv != null && close < ema21Lv ? 'red' : ema21Lv != null ? 'green' : 'gray'

  // 6) 21EMA Low % — distance from EMA21(low)
  const ema21LowPct =
    ema21Lv != null && ema21Lv > 0 ? ((close - ema21Lv) / ema21Lv) * 100 : null
  const ema21LowPctColor: CockpitColor =
    ema21LowPct == null
      ? 'gray'
      : ema21LowPct < 0
        ? 'red'
        : ema21LowPct <= 5
          ? 'green'
          : ema21LowPct <= 8
            ? 'yellow'
            : 'red'

  // 7) 3-Weeks Tight — last 3 weekly closes within ±1.5% of each other
  let threeWk: { ok: boolean; spread: number | null } = { ok: false, spread: null }
  if (weeklyCloses.length >= 3) {
    const w = weeklyCloses.slice(-3)
    const mn = Math.min(...w)
    const mx = Math.max(...w)
    const spread = mn > 0 ? ((mx - mn) / mn) * 100 : null
    threeWk = { ok: spread != null && spread <= 1.5, spread }
  }
  const threeWkColor: CockpitColor = threeWk.ok ? 'green' : 'orange'

  // 8) ATR% 50SMA — ((close/SMA50) - 1) / (ATR/close), tiered 7..11
  const atrPctRaw =
    sma50v != null && sma50v > 0 && atr14v != null && atr14v > 0
      ? (close / sma50v - 1) / (atr14v / close)
      : null
  let atrPctColor: CockpitColor = 'gray'
  if (atrPctRaw != null) {
    if (atrPctRaw < 7) atrPctColor = 'red'
    else if (atrPctRaw < 8) atrPctColor = 'yellow'
    else if (atrPctRaw < 9) atrPctColor = 'orange'
    else if (atrPctRaw < 10) atrPctColor = 'green'
    else if (atrPctRaw < 11) atrPctColor = 'green'
    else atrPctColor = 'green'
  }

  // 9) IPO Timer — (bar_index + 1) / 252
  const ipoYears = (bars.length) / 252

  const metrics: CockpitMetric[] = [
    {
      key: 'adr',
      label: 'ADR %',
      value: pct(adrPct, 2),
      raw: adrPct,
      color: adrColor,
      hint: '3.5–8.0% sweet spot',
    },
    {
      key: 'atr_ema21',
      label: 'ATR 21EMA',
      value: num(ratioEma21, 2),
      raw: ratioEma21,
      color: ratioEma21Color,
      hint: '(close − EMA21) / ATR14, target −0.5..+1.0',
    },
    {
      key: 'atr_wma10',
      label: 'ATR 10WMA',
      value: num(ratioWma10, 2),
      raw: ratioWma10,
      color: ratioWma10Color,
      hint: '(close − WMA10ʷ) / ATR14, target −0.5..+1.0',
    },
    {
      key: 'atr_sma50',
      label: 'ATR 50SMA',
      value: num(ratioSma50, 2),
      raw: ratioSma50,
      color: ratioSma50Color,
      hint: '(close − SMA50) / ATR14, target 0..3.0',
    },
    {
      key: 'ema21_low',
      label: '21EMA Low',
      value: num(ema21Lv, 2),
      raw: ema21Lv,
      color: ema21LowColor,
      hint: 'close vs EMA21(low)',
    },
    {
      key: 'ema21_low_pct',
      label: '21EMA Low %',
      value: pct(ema21LowPct, 2),
      raw: ema21LowPct,
      color: ema21LowPctColor,
      hint: 'distance from EMA21(low)',
    },
    {
      key: '3wk_tight',
      label: '3-Weeks Tight',
      value:
        threeWk.spread == null ? '—' : threeWk.ok ? `YES (${threeWk.spread.toFixed(2)}%)` : `NO (${threeWk.spread.toFixed(2)}%)`,
      raw: threeWk.spread,
      color: threeWkColor,
      hint: '直近3週終値の高低レンジ ≤ 1.5% で YES',
    },
    {
      key: 'atr_pct_sma50',
      label: 'ATR% 50SMA',
      value: num(atrPctRaw, 2),
      raw: atrPctRaw,
      color: atrPctColor,
      hint: '((close/SMA50)−1) / (ATR/close)',
    },
    {
      key: 'ipo_timer',
      label: 'IPO Timer',
      value: `${ipoYears.toFixed(2)}y`,
      raw: ipoYears,
      color: 'gray',
      hint: 'bars / 252（≒ 取引年数）',
    },
  ]

  return { asOf: bars[i].date, metrics }
}
