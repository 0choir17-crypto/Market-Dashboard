import type { OhlcvBar } from '@/types/chart'

export type SeriesPoint = { time: string; value: number }

/* ------------------------------------------------------------------ */
/*  Moving averages                                                    */
/* ------------------------------------------------------------------ */

export function sma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (length <= 0) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= length) sum -= values[i - length]
    if (i >= length - 1) out[i] = sum / length
  }
  return out
}

export function ema(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (length <= 0 || values.length === 0) return out
  const k = 2 / (length + 1)
  // seed with SMA of the first `length` bars (Pine-style)
  let seed = 0
  for (let i = 0; i < values.length; i++) {
    seed += values[i]
    if (i === length - 1) {
      const init = seed / length
      out[i] = init
      let prev = init
      for (let j = i + 1; j < values.length; j++) {
        prev = values[j] * k + prev * (1 - k)
        out[j] = prev
      }
      return out
    }
  }
  return out
}

/** Pine's `ta.wma` — linearly weighted moving average. */
export function wma(values: number[], length: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (length <= 0) return out
  const denom = (length * (length + 1)) / 2
  for (let i = length - 1; i < values.length; i++) {
    let acc = 0
    for (let j = 0; j < length; j++) {
      acc += values[i - j] * (length - j)
    }
    out[i] = acc / denom
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  ATR (Wilder)                                                       */
/* ------------------------------------------------------------------ */

export function atr(bars: OhlcvBar[], length = 14): (number | null)[] {
  const n = bars.length
  const out: (number | null)[] = new Array(n).fill(null)
  if (n === 0) return out
  const tr: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const h = bars[i].high
    const l = bars[i].low
    if (i === 0) {
      tr[i] = h - l
    } else {
      const pc = bars[i - 1].close
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
    }
  }
  // Wilder's smoothing seeded with SMA of first `length` TRs
  if (n < length) return out
  let sum = 0
  for (let i = 0; i < length; i++) sum += tr[i]
  let prev = sum / length
  out[length - 1] = prev
  for (let i = length; i < n; i++) {
    prev = (prev * (length - 1) + tr[i]) / length
    out[i] = prev
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Series helpers                                                     */
/* ------------------------------------------------------------------ */

export function toSeries(
  bars: OhlcvBar[],
  values: (number | null)[],
): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (let i = 0; i < bars.length; i++) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) {
      out.push({ time: bars[i].date, value: v })
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Weekly aggregation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Aggregate daily bars into weekly bars. Each week ends on the last available
 * trading day for that ISO-week. Returns bars in chronological order.
 */
export function aggregateWeekly(bars: OhlcvBar[]): OhlcvBar[] {
  if (bars.length === 0) return []
  const weeks = new Map<string, OhlcvBar[]>()
  for (const b of bars) {
    const key = isoWeekKey(b.date)
    const list = weeks.get(key)
    if (list) list.push(b)
    else weeks.set(key, [b])
  }
  const out: OhlcvBar[] = []
  for (const [, list] of [...weeks.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1))
    const open = list[0].open
    const close = list[list.length - 1].close
    let high = -Infinity
    let low = Infinity
    let vol = 0
    for (const r of list) {
      if (r.high > high) high = r.high
      if (r.low < low) low = r.low
      vol += r.volume
    }
    out.push({
      date: list[list.length - 1].date,
      open,
      high,
      low,
      close,
      volume: vol,
    })
  }
  return out
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  // ISO 8601 week calculation
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
