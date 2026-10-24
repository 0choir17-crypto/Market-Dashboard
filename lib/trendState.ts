import { aggregateWeekly, ema } from './indicators'

// 指数・業種の「地合い」判定。日足 EMA9 / EMA21 の位置と向きだけで決める。
//
// 同じ「EMA21 付近」でも線の向きで意味が逆になる:
// - 上向き EMA21 への押し … 直近の買い手はほぼ含み益。投げる理由が無く、
//   押したら買いたい待機資金が入るので線が支持になる
// - 下向き EMA21 への戻り … 直近の買い手の多くが含み損。平均取得単価付近まで
//   戻ると同値撤退の売りと、トレンドフォローの新規売りが重なり押し返されやすい
// なので判定は「EMA21 の上か下か」×「EMA21 が上向きか下向きか」を軸にする。

export type ClosePoint = { date: string; close: number }

export type TrendSignal = 'green' | 'yellow' | 'red'

export type TrendState = {
  date: string
  close: number
  ema9: number
  ema21: number
  /** EMA の向き。SLOPE_LOOKBACK 本前の値より上なら上向き */
  ema9Up: boolean
  ema21Up: boolean
  /** 終値の EMA からの乖離（%） */
  distEma9Pct: number
  distEma21Pct: number
  /** 週足 EMA9 の上か。週足の本数が足りなければ null */
  aboveWeeklyEma9: boolean | null
  /** 日足 EMA50 の上か。本数が足りなければ null */
  aboveEma50: boolean | null
  signal: TrendSignal
  /** 判定の言葉。色だけでは理由が分からないので必ず添える */
  label: string
}

/** EMA の向きを測る間隔（営業日）。今日の EMA と 5 本前の EMA を比べる */
export const SLOPE_LOOKBACK = 5

/**
 * 判定ルール:
 * - 緑 … 終値 > EMA21・EMA21↑・終値 > EMA9・EMA9↑・EMA9 > EMA21（全部そろう）
 * - 黄 … 上向き EMA21 の上だが EMA9 側が崩れている（押し）
 * - 黄 … 下向き EMA21 を上抜いた（戻り売りをこなせるか未確認）
 * - 黄 … 上向き EMA21 を割り込んだ（押しで線を守れなかった）
 * - 赤 … 終値 < EMA21・EMA21↓
 */
export function classifyTrend(s: {
  close: number
  ema9: number
  ema21: number
  ema9Up: boolean
  ema21Up: boolean
}): { signal: TrendSignal; label: string } {
  const above21 = s.close > s.ema21
  if (above21 && s.ema21Up) {
    if (s.close > s.ema9 && s.ema9Up && s.ema9 > s.ema21) {
      return { signal: 'green', label: '上向き EMA9・21 の上' }
    }
    return { signal: 'yellow', label: '押し（上向き EMA21 は維持）' }
  }
  if (above21) return { signal: 'yellow', label: '下向き EMA21 を上抜け（戻り売り待ち）' }
  if (s.ema21Up) return { signal: 'yellow', label: '上向き EMA21 を割り込み' }
  return { signal: 'red', label: '下向き EMA21 の下' }
}

/**
 * 終値の系列（日付昇順）から最終日の判定を出す。
 * EMA21 の向きを測るには 21 + SLOPE_LOOKBACK 本が要る。足りなければ null。
 */
export function computeTrendState(points: ClosePoint[]): TrendState | null {
  const n = points.length
  if (n < 21 + SLOPE_LOOKBACK) return null

  const closes = points.map((p) => p.close)
  const e9 = ema(closes, 9)
  const e21 = ema(closes, 21)
  const e50 = ema(closes, 50)

  const last = n - 1
  const prev = last - SLOPE_LOOKBACK
  const ema9 = e9[last]
  const ema21 = e21[last]
  const ema9Prev = e9[prev]
  const ema21Prev = e21[prev]
  if (ema9 == null || ema21 == null || ema9Prev == null || ema21Prev == null) return null

  const close = closes[last]
  const ema9Up = ema9 > ema9Prev
  const ema21Up = ema21 > ema21Prev
  const ema50 = e50[last]

  // 週足は日足から作る（最終週は途中でも最新の終値で締める）
  const weekly = aggregateWeekly(
    points.map((p) => ({
      date: p.date,
      open: p.close,
      high: p.close,
      low: p.close,
      close: p.close,
      volume: 0,
    })),
  )
  const w9 = ema(
    weekly.map((w) => w.close),
    9,
  )
  const weeklyEma9 = w9[w9.length - 1]

  return {
    date: points[last].date,
    close,
    ema9,
    ema21,
    ema9Up,
    ema21Up,
    distEma9Pct: (close / ema9 - 1) * 100,
    distEma21Pct: (close / ema21 - 1) * 100,
    aboveWeeklyEma9: weeklyEma9 == null ? null : close > weeklyEma9,
    aboveEma50: ema50 == null ? null : close > ema50,
    ...classifyTrend({ close, ema9, ema21, ema9Up, ema21Up }),
  }
}
