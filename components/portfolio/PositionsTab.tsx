'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import PositionModal from './PositionModal'
import CloseModal from './CloseModal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatYen, formatPct, pnlColorClass } from '@/lib/format'

type Props = {
  positions: Trade[]

  onRefresh: () => void
}

function fmt(v: number | null | undefined, decimals = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function PnlCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 font-mono text-xs">—</span>
  return (
    <span className={`font-mono text-xs font-semibold ${pnlColorClass(value)}`}>
      {formatYen(value, { sign: true })}
    </span>
  )
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 font-mono text-xs">—</span>
  return (
    <span className={`font-mono text-xs font-semibold ${pnlColorClass(value)}`}>
      {formatPct(value, { sign: true })}
    </span>
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
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">{openTrades.length} positions</span>
        <span className="text-xs text-gray-400">追加はヘッダーの「＋ 新規トレード」から</span>
      </div>

      {/* Desktop table */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto hidden sm:block">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="bg-[var(--bg-card-hover)] border-b border-t border-[var(--border)]">
              {['Ticker','Name','Sector','Entry Date','Entry Price','Shares','Stop Price','InitRisk%','Current','Unrealized ¥','Unrealized %','Target Price','Actions'].map(h => (
                <th key={h} className={`px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide whitespace-nowrap ${h === 'Actions' ? 'text-right' : h === 'Ticker' || h === 'Name' || h === 'Sector' ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openTrades.map((pos, i) => {
              const curPrice = prices[pos.ticker] ?? null
              const unrealizedPnl = curPrice != null ? (curPrice - pos.entry_price) * pos.shares : null
              const unrealizedPct = curPrice != null ? (curPrice - pos.entry_price) / pos.entry_price * 100 : null
              return (
                <tr
                  key={pos.id}
                  className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors ${i % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-card-hover)]'}`}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <a href={`https://jp.tradingview.com/chart/?symbol=TSE:${pos.ticker}`} target="_blank" rel="noreferrer"
                       className="font-mono font-bold text-blue-600 hover:underline text-xs">{pos.ticker}</a>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {pos.company_name ? (
                      <a href={`https://shikiho.toyokeizai.net/stocks/${pos.ticker}`} target="_blank" rel="noreferrer" className="hover:underline">{pos.company_name}</a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600">{pos.sector_s33 ?? '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs font-mono text-gray-600">{pos.entry_date}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">¥{fmt(pos.entry_price)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(pos.shares)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{pos.stop_price != null ? `¥${fmt(pos.stop_price)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {pos.init_risk_pct != null ? <span className="text-orange-600">{formatPct(pos.init_risk_pct)}</span> : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {curPrice != null ? `¥${fmt(curPrice)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap"><PnlCell value={unrealizedPnl} /></td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap"><PctCell value={unrealizedPct} /></td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {pos.target_price != null ? (
                      <>
                        ¥{fmt(pos.target_price)}
                        {pos.entry_price > 0 && (
                          <span className="text-[var(--positive)]">
                            {' '}({formatPct((pos.target_price - pos.entry_price) / pos.entry_price * 100, { digits: 1, sign: true })})
                          </span>
                        )}
                      </>
                    ) : pos.target_r != null ? `${pos.target_r}R` : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setClosePos(pos)}
                        className="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100">決済</button>
                      <button onClick={() => setEditPos(pos)}
                        className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">編集</button>
                      <button onClick={() => setDeletePos(pos)}
                        className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100">削除</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {openTrades.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">No open positions</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="block sm:hidden space-y-3">
        {openTrades.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">No open positions</p>
        )}
        {openTrades.map(pos => {
          const curPrice = prices[pos.ticker] ?? null
          const unrealizedPnl = curPrice != null ? (curPrice - pos.entry_price) * pos.shares : null
          const unrealizedPct = curPrice != null ? (curPrice - pos.entry_price) / pos.entry_price * 100 : null
          return (
            <div key={pos.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <a href={`https://jp.tradingview.com/chart/?symbol=TSE:${pos.ticker}`} target="_blank" rel="noreferrer"
                     className="font-mono font-bold text-blue-600 text-base">{pos.ticker}</a>
                  {pos.company_name && <span className="ml-2 text-xs text-gray-600">{pos.company_name}</span>}
                </div>
                <div className="text-right">
                  {unrealizedPnl != null && <PnlCell value={unrealizedPnl} />}
                  {unrealizedPct != null && <div><PctCell value={unrealizedPct} /></div>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-3">
                <div><span className="text-gray-400 block">Entry</span><span className="font-mono">¥{fmt(pos.entry_price)}</span></div>
                <div><span className="text-gray-400 block">Shares</span><span className="font-mono">{fmt(pos.shares)}</span></div>
                <div><span className="text-gray-400 block">Current</span><span className="font-mono">{curPrice != null ? `¥${fmt(curPrice)}` : '—'}</span></div>
                <div><span className="text-gray-400 block">Stop</span><span className="font-mono">{pos.stop_price != null ? `¥${fmt(pos.stop_price)}` : '—'}</span></div>
                <div><span className="text-gray-400 block">InitRisk</span><span className="font-mono">{pos.init_risk_pct != null ? formatPct(pos.init_risk_pct, { digits: 1 }) : '—'}</span></div>
                <div><span className="text-gray-400 block">Target</span><span className="font-mono">{pos.target_price != null ? `¥${fmt(pos.target_price)}` : pos.target_r != null ? `${pos.target_r}R` : '—'}</span></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setClosePos(pos)}
                  className="flex-1 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg">決済</button>
                <button onClick={() => setEditPos(pos)}
                  className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">編集</button>
                <button onClick={() => setDeletePos(pos)}
                  className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg">削除</button>
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
