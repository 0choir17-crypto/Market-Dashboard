import { supabase } from './supabase'
import { fetchAllPaged } from './pagedFetch'
import { effectiveResult, isLoss, isWin, nextLossStreak } from './tradeResult'
import type { Trade } from '@/types/trades'

// 自分の成績（My Trades カード）。色の判定は持たず、事実の数字だけを出す。
// 著者の「試し玉に含み益が乗るか」「エントリー直後から失敗し続けていないか」「資産曲線」を見る。
//
// - R は (決済値 − 建値) ÷ (建値 − 初期ストップ)。初期ストップが無い行は保存済みの r_multiple を使う
//   （r_multiple はトレールで stop_price が動くと符号が崩れた過去があるので、計算できるならそちらを優先）
// - 資産曲線は金額ではなく R の累計（建玉サイズの変化に引っぱられないように）
// - 保有中の現在値は daily_signals の直近の終値。スキャナーに出なくなった銘柄は値が古くなる

export const RECENT_TRADES = 10

export type ClosedTrade = Pick<
  Trade,
  'id' | 'ticker' | 'company_name' | 'entry_date' | 'exit_date' | 'pnl' | 'result'
> & { r: number | null }

export type OpenPosition = Pick<Trade, 'id' | 'ticker' | 'company_name' | 'entry_date' | 'entry_price' | 'shares'> & {
  price: number | null
  priceDate: string | null
  /** 含み R。初期ストップ（無ければ現在のストップ）が無いと null */
  r: number | null
  pnlPct: number | null
}

export type EquityPoint = { date: string; cumR: number; ma: number | null }

export type MyTradesState = {
  open: OpenPosition[]
  /** 含み益の建玉数 / 現在値の分かる建玉数 */
  openInProfit: number
  openPriced: number
  openR: number | null
  /** 直近 RECENT_TRADES 件（決済日の新しい順） */
  recent: ClosedTrade[]
  recentWins: number
  recentLosses: number
  recentR: number | null
  lossStreak: number
  /** R の累計と、その直近 RECENT_TRADES 件の移動平均（決済順） */
  equity: EquityPoint[]
  error: string | null
}

// 列は名指しせず select('*') で取る（Trading 画面と同じ）。initial_stop など後から足した列が
// 環境によって無いことがあり、名指しすると PostgREST がクエリ全体をエラーにするため。
// 無い列は undefined になり、R は r_multiple にフォールバックする。

function rOf(entry: number | null, exit: number | null, stop: number | null): number | null {
  if (entry == null || exit == null || stop == null) return null
  const risk = entry - stop
  return risk > 0 ? (exit - entry) / risk : null
}

type Row = Record<string, unknown>
const n = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

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
    r: rOf(n(t.entry_price), n(t.exit_price), n(t.initial_stop)) ?? n(t.r_multiple),
  }))

  const recent = closed.slice(-RECENT_TRADES).reverse()
  const recentWithR = recent.filter((t) => t.r != null)
  let lossStreak = 0
  for (const t of closed) lossStreak = nextLossStreak(lossStreak, effectiveResult(t))

  const equity: EquityPoint[] = []
  let cum = 0
  for (const t of closed) {
    if (t.r == null) continue
    cum += t.r
    equity.push({ date: t.exit_date as string, cumR: cum, ma: null })
  }
  for (let i = RECENT_TRADES - 1; i < equity.length; i++) {
    let s = 0
    for (let j = i - RECENT_TRADES + 1; j <= i; j++) s += equity[j].cumR
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
      r: rOf(entry, price, n(t.initial_stop) ?? n(t.stop_price)),
      pnlPct: entry && price != null ? (price / entry - 1) * 100 : null,
    }
  })
  const priced = open.filter((o) => o.price != null)
  const openWithR = open.filter((o) => o.r != null)

  return {
    open,
    openInProfit: priced.filter((o) => (o.price as number) > o.entry_price).length,
    openPriced: priced.length,
    openR: openWithR.length ? openWithR.reduce((s, o) => s + (o.r as number), 0) : null,
    recent,
    recentWins: recent.filter(isWin).length,
    recentLosses: recent.filter(isLoss).length,
    recentR: recentWithR.length ? recentWithR.reduce((s, t) => s + (t.r as number), 0) : null,
    lossStreak,
    equity,
    error,
  }
}
