import { supabase } from './supabase'
import { fetchAllPaged } from './pagedFetch'
import { effectiveResult, isLoss, isWin, nextLossStreak } from './tradeResult'
import type { Trade } from '@/types/trades'

// 自分の成績（My Trades カード）。色の判定は持たず、事実の数字だけを出す。
// 著者の「試し玉に含み益が乗るか」「エントリー直後から失敗し続けていないか」「資産曲線」を見る。
//
// - 成績は ATR 倍 = (決済値 − 建値) ÷ 建玉時の ATR14（trades.atr_at_entry）で測る。
//   本来は R（初期リスクの何倍か）で測りたいが、SBI の取り込み経由の行に初期ストップが無く、
//   損切りも柔軟に決めているので後から推定できない（2026-10 に決定）。ATR は裁量が入らず過去分も正確に出せる
// - atr_at_entry は別リポで埋めてもらう（docs/BACKFILL_REQUEST_ATR_AT_ENTRY.md）。直近 RECENT_TRADES 件が
//   すべて埋まるまでは損益率（pnl_pct、無ければ 決済値 ÷ 建値 − 1）で出す。単位を混ぜないため、
//   ATR 倍の表示では atr_at_entry の無いトレードを集計から外す
// - 資産曲線は単純な累計（複利にしない）
// - 保有中の現在値は daily_signals の直近の終値。スキャナーに出なくなった銘柄は値が古くなる

export const RECENT_TRADES = 10

export type ClosedTrade = Pick<
  Trade,
  'id' | 'ticker' | 'company_name' | 'entry_date' | 'exit_date' | 'pnl' | 'result'
> & { pct: number | null; atrX: number | null }

export type OpenPosition = Pick<Trade, 'id' | 'ticker' | 'company_name' | 'entry_date' | 'entry_price' | 'shares'> & {
  price: number | null
  priceDate: string | null
  pct: number | null
  atrX: number | null
}

/** 成績の単位。atr = ATR 倍 / pct = 損益率 % */
export type PerfUnit = 'atr' | 'pct'

export type EquityPoint = { date: string; cum: number; ma: number | null }

export type MyTradesState = {
  unit: PerfUnit
  open: OpenPosition[]
  /** 含み益の建玉数 / 現在値の分かる建玉数 */
  openInProfit: number
  openPriced: number
  /** 保有中の含み損益の平均（unit の単位） */
  openAvg: number | null
  /** 直近 RECENT_TRADES 件（決済日の新しい順） */
  recent: ClosedTrade[]
  recentWins: number
  recentLosses: number
  /** 直近 RECENT_TRADES 件の損益の平均（unit の単位） */
  recentAvg: number | null
  lossStreak: number
  /** 損益（unit の単位）の累計と、その直近 RECENT_TRADES 件の移動平均（決済順） */
  equity: EquityPoint[]
  error: string | null
}

// 列は名指しせず select('*') で取る（Trading 画面と同じ）。後から足した列が環境によって無いことがあり、
// 名指しすると PostgREST がクエリ全体をエラーにするため。

type Row = Record<string, unknown>
const n = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

function pctOf(entry: number | null, exit: number | null): number | null {
  return entry && exit != null ? (exit / entry - 1) * 100 : null
}

function atrXOf(entry: number | null, exit: number | null, atr: number | null): number | null {
  return entry != null && exit != null && atr != null && atr > 0 ? (exit - entry) / atr : null
}

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

export async function fetchMyTradesState(): Promise<MyTradesState> {
  const [closedRes, openRes] = await Promise.all([
    fetchAllPaged<Row>((from, to) =>
      supabase
        .from('trades')
        .select('*')
        .eq('status', 'closed')
        .not('exit_date', 'is', null)
        .order('exit_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    ),
    supabase.from('trades').select('*').eq('status', 'open').order('entry_date', { ascending: true }),
  ])
  const error = closedRes.error ?? openRes.error?.message ?? null
  if (error) console.error('[trades my state]', error)

  // ── 決済済み ──────────────────────────────────────────────
  const closed: ClosedTrade[] = closedRes.rows.map((t) => ({
    id: t.id as number,
    ticker: t.ticker as string,
    company_name: (t.company_name as string | null) ?? null,
    entry_date: t.entry_date as string,
    exit_date: t.exit_date as string,
    pnl: n(t.pnl),
    result: (t.result as Trade['result']) ?? null,
    pct: n(t.pnl_pct) ?? pctOf(n(t.entry_price), n(t.exit_price)),
    atrX: atrXOf(n(t.entry_price), n(t.exit_price), n(t.atr_at_entry)),
  }))

  const recent = closed.slice(-RECENT_TRADES).reverse()
  const unit: PerfUnit = recent.length > 0 && recent.every((t) => t.atrX != null) ? 'atr' : 'pct'
  const val = (t: { pct: number | null; atrX: number | null }) => (unit === 'atr' ? t.atrX : t.pct)
  let lossStreak = 0
  for (const t of closed) lossStreak = nextLossStreak(lossStreak, effectiveResult(t))

  const equity: EquityPoint[] = []
  let cum = 0
  for (const t of closed) {
    const v = val(t)
    if (v == null) continue
    cum += v
    equity.push({ date: t.exit_date as string, cum, ma: null })
  }
  for (let i = RECENT_TRADES - 1; i < equity.length; i++) {
    let s = 0
    for (let j = i - RECENT_TRADES + 1; j <= i; j++) s += equity[j].cum
    equity[i].ma = s / RECENT_TRADES
  }

  // ── 保有中 ────────────────────────────────────────────────
  const openRows = (openRes.data ?? []) as Row[]
  const tickers = [...new Set(openRows.map((r) => r.ticker as string))]
  const prices = new Map<string, { close: number | null; date: string | null }>()
  await Promise.all(
    tickers.map(async (code) => {
      const { data } = await supabase
        .from('daily_signals')
        .select('date, close')
        .eq('code', code)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      const d = data as { date: string; close: number | null } | null
      prices.set(code, { close: n(d?.close), date: d?.date ?? null })
    }),
  )
  const open: OpenPosition[] = openRows.map((t) => {
    const entry = n(t.entry_price)
    const p = prices.get(t.ticker as string)
    const price = p?.close ?? null
    return {
      id: t.id as number,
      ticker: t.ticker as string,
      company_name: (t.company_name as string | null) ?? null,
      entry_date: t.entry_date as string,
      entry_price: entry as number,
      shares: n(t.shares) as number,
      price,
      priceDate: p?.date ?? null,
      pct: pctOf(entry, price),
      atrX: atrXOf(entry, price, n(t.atr_at_entry)),
    }
  })
  const priced = open.filter((o) => o.price != null)

  return {
    unit,
    open,
    openInProfit: priced.filter((o) => (o.price as number) > o.entry_price).length,
    openPriced: priced.length,
    openAvg: avg(open.map(val)),
    recent,
    recentWins: recent.filter(isWin).length,
    recentLosses: recent.filter(isLoss).length,
    recentAvg: avg(recent.map(val)),
    lossStreak,
    equity,
    error,
  }
}
