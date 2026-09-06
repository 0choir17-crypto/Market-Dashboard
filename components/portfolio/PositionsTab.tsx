'use client'

// Positions（/journal のオープンポジション一覧）。
//
// 読み取り専用の 4 表（Watchlist / Leaders / Earnings / Sectors）と違い、行に
// 決済・編集・削除の導線を持つ入力 UI なので DataTable には載せていない。
// ただし見た目の語彙は共有する: 面と罫線は --bg-card / 0.5px --border、
// 文字サイズは text-body / text-small / text-caption、数値は .num（等幅数字）、
// 色は --sem-* と --positive / --negative だけを使う。
//
// 表に min-width は置かない。固定すると 13 列が収まる幅でも横スクロールが出る。

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import PositionModal from './PositionModal'
import CloseModal from './CloseModal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatYen, formatPct, pnlColorClass } from '@/lib/format'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'
import { toneStyle, type SemanticTone } from '@/types/semantic'

type Props = {
  positions: Trade[]

  onRefresh: () => void
}

function fmt(v: number | null | undefined, decimals = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** 欠損は 0 ではなく「—」。他の表（watchlistJournal/atoms）と同じ扱い。 */
function Missing() {
  return <span className="num text-[var(--sem-idle-fg)]">—</span>
}

function PnlCell({ value }: { value: number | null }) {
  if (value == null) return <Missing />
  return <span className={`num ${pnlColorClass(value)}`}>{formatYen(value, { sign: true })}</span>
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <Missing />
  return <span className={`num ${pnlColorClass(value)}`}>{formatPct(value, { sign: true })}</span>
}

/** 行内アクション。色は意味語彙から取る（決済=watch / 編集=focus / 削除=weak）。 */
function ActionButton({
  tone,
  onClick,
  children,
  className = '',
}: {
  tone: SemanticTone
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      style={toneStyle(tone)}
      className={`px-2 py-1 text-caption rounded-lg hover:brightness-95 ${className}`}
    >
      {children}
    </button>
  )
}

// Fetch current prices from daily_signals — 銘柄ごとに最新1行だけ取る。
// 旧実装は保有銘柄の全履歴を1クエリで引いており、PostgREST の1000行上限に
// かかると code 昇順で後ろの銘柄の価格が silently 欠落していた。
async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, number | null>> {
  if (tickers.length === 0) return {}
  try {
    const results = await Promise.all(
      tickers.map(async code => {
        const { data } = await supabase
          .from('daily_signals')
          .select('close')
          .eq('code', code)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()
        return [code, (data as { close: number | null } | null)?.close ?? null] as const
      }),
    )
    return Object.fromEntries(results)
  } catch {
    return {}
  }
}

const HEADERS = [
  'Ticker', 'Name', 'Sector', 'Entry Date', 'Entry Price', 'Shares', 'Stop Price',
  'InitRisk%', 'Current', 'Unrealized ¥', 'Unrealized %', 'Target Price', 'Actions',
]

const LEFT_ALIGNED = new Set(['Ticker', 'Name', 'Sector', 'Entry Date'])

export default function TradesTab({ positions, onRefresh }: Props) {
  const openTrades = positions.filter(p => p.status === 'open')
  const [prices, setPrices] = useState<Record<string, number | null>>({})
  const [editPos, setEditPos] = useState<Trade | null>(null)
  const [closePos, setClosePos] = useState<Trade | null>(null)
  const [deletePos, setDeletePos] = useState<Trade | null>(null)

  // 依存キーは事前に文字列へ畳む（式を deps に書くのは lint 違反かつ不安定）
  const tickerKey = [...new Set(openTrades.map(p => p.ticker))].sort().join(',')
  const loadPrices = useCallback(async () => {
    const map = await fetchCurrentPrices(tickerKey ? tickerKey.split(',') : [])
    setPrices(map)
  }, [tickerKey])

  useEffect(() => { loadPrices() }, [loadPrices])

  async function handleDelete() {
    if (!deletePos) return
    await supabase.from('trades').delete().eq('id', deletePos.id)
    setDeletePos(null)
    onRefresh()
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-small text-[var(--text-secondary)]">{openTrades.length} positions</span>
        <span className="text-caption text-[var(--text-muted)]">追加はヘッダーの「＋ 新規トレード」から</span>
      </div>

      {/* Desktop table */}
      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] overflow-x-auto hidden sm:block">
        <table className="w-full text-body">
          <thead className="border-b-[0.5px] border-[var(--border)]">
            <tr>
              {HEADERS.map(h => (
                <th
                  key={h}
                  className={`px-2.5 py-2 text-caption tracking-wide text-[var(--text-muted)] whitespace-nowrap ${
                    LEFT_ALIGNED.has(h) ? 'text-left' : 'text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openTrades.map(pos => {
              const curPrice = prices[pos.ticker] ?? null
              const unrealizedPnl = curPrice != null ? (curPrice - pos.entry_price) * pos.shares : null
              const unrealizedPct = curPrice != null ? (curPrice - pos.entry_price) / pos.entry_price * 100 : null
              return (
                <tr
                  key={pos.id}
                  className="border-t-[0.5px] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
                >
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <a href={tradingViewUrl(pos.ticker)} target="_blank" rel="noopener noreferrer"
                       title={`${pos.ticker}（TradingView を開く）`}
                       className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline">{pos.ticker}</a>
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-small text-[var(--text-secondary)]">
                    {pos.company_name ? (
                      <a href={shikihoUrl(pos.ticker)} target="_blank" rel="noopener noreferrer"
                         title={`${pos.company_name}（四季報を開く）`}
                         className="hover:text-[var(--sem-focus-fg)] hover:underline">{pos.company_name}</a>
                    ) : '—'}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-small text-[var(--text-secondary)]">{pos.sector_s33 ?? '—'}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap font-mono text-small text-[var(--text-secondary)]">{pos.entry_date}</td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    <span className="num text-[var(--text-secondary)]">¥{fmt(pos.entry_price)}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    <span className="num text-[var(--text-secondary)]">{fmt(pos.shares)}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {pos.stop_price != null
                      ? <span className="num text-[var(--text-secondary)]">¥{fmt(pos.stop_price)}</span>
                      : <Missing />}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {pos.init_risk_pct != null
                      ? <span className="num text-[var(--sem-watch-fg)]">{formatPct(pos.init_risk_pct)}</span>
                      : <Missing />}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {curPrice != null
                      ? <span className="num text-[var(--text-primary)]">¥{fmt(curPrice)}</span>
                      : <Missing />}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap"><PnlCell value={unrealizedPnl} /></td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap"><PctCell value={unrealizedPct} /></td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {pos.target_price != null ? (
                      <span className="num text-[var(--text-secondary)]">
                        ¥{fmt(pos.target_price)}
                        {pos.entry_price > 0 && (
                          <span className="text-[var(--positive)]">
                            {' '}({formatPct((pos.target_price - pos.entry_price) / pos.entry_price * 100, { digits: 1, sign: true })})
                          </span>
                        )}
                      </span>
                    ) : pos.target_r != null
                      ? <span className="num text-[var(--text-secondary)]">{pos.target_r}R</span>
                      : <Missing />}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <ActionButton tone="watch" onClick={() => setClosePos(pos)}>決済</ActionButton>
                      <ActionButton tone="focus" onClick={() => setEditPos(pos)}>編集</ActionButton>
                      <ActionButton tone="weak" onClick={() => setDeletePos(pos)}>削除</ActionButton>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {openTrades.length === 0 && (
          <div className="py-10 text-center text-small text-[var(--text-muted)]">No open positions</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="block sm:hidden space-y-3">
        {openTrades.length === 0 && (
          <p className="text-center text-small text-[var(--text-muted)] py-8">No open positions</p>
        )}
        {openTrades.map(pos => {
          const curPrice = prices[pos.ticker] ?? null
          const unrealizedPnl = curPrice != null ? (curPrice - pos.entry_price) * pos.shares : null
          const unrealizedPct = curPrice != null ? (curPrice - pos.entry_price) / pos.entry_price * 100 : null
          return (
            <div key={pos.id} className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <a href={tradingViewUrl(pos.ticker)} target="_blank" rel="noopener noreferrer"
                     className="font-mono font-medium text-[var(--sem-focus-fg)] text-lead">{pos.ticker}</a>
                  {pos.company_name && (
                    <a href={shikihoUrl(pos.ticker)} target="_blank" rel="noopener noreferrer"
                       className="ml-2 text-small text-[var(--text-muted)] hover:underline">{pos.company_name}</a>
                  )}
                </div>
                <div className="text-right">
                  {unrealizedPnl != null && <PnlCell value={unrealizedPnl} />}
                  {unrealizedPct != null && <div><PctCell value={unrealizedPct} /></div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-small text-[var(--text-secondary)] mb-3">
                <div><span className="text-caption text-[var(--text-muted)] block">Entry</span><span className="num">¥{fmt(pos.entry_price)}</span></div>
                <div><span className="text-caption text-[var(--text-muted)] block">Shares</span><span className="num">{fmt(pos.shares)}</span></div>
                <div><span className="text-caption text-[var(--text-muted)] block">Current</span><span className="num">{curPrice != null ? `¥${fmt(curPrice)}` : '—'}</span></div>
                <div><span className="text-caption text-[var(--text-muted)] block">Stop</span><span className="num">{pos.stop_price != null ? `¥${fmt(pos.stop_price)}` : '—'}</span></div>
                <div><span className="text-caption text-[var(--text-muted)] block">InitRisk</span><span className="num">{pos.init_risk_pct != null ? formatPct(pos.init_risk_pct, { digits: 1 }) : '—'}</span></div>
                <div><span className="text-caption text-[var(--text-muted)] block">Target</span><span className="num">{pos.target_price != null ? `¥${fmt(pos.target_price)}` : pos.target_r != null ? `${pos.target_r}R` : '—'}</span></div>
              </div>
              <div className="flex gap-2">
                <ActionButton tone="watch" onClick={() => setClosePos(pos)} className="flex-1 py-2">決済</ActionButton>
                <ActionButton tone="focus" onClick={() => setEditPos(pos)} className="px-3 py-2">編集</ActionButton>
                <ActionButton tone="weak" onClick={() => setDeletePos(pos)} className="px-3 py-2">削除</ActionButton>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modals */}
      <PositionModal
        open={!!editPos}
        onClose={() => setEditPos(null)}
        onSaved={() => { setEditPos(null); onRefresh() }}
        initial={editPos ?? undefined}
      />
      <CloseModal
        open={!!closePos}
        onClose={() => setClosePos(null)}
        onSaved={() => { setClosePos(null); onRefresh() }}
        position={closePos}
      />
      <ConfirmDialog
        open={!!deletePos}
        message={`「${deletePos?.ticker}」を削除しますか？この操作は取り消せません。`}
        onConfirm={handleDelete}
        onCancel={() => setDeletePos(null)}
      />
    </div>
  )
}
