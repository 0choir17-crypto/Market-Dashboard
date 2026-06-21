'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import PositionModal from './PositionModal'
import CloseModal from './CloseModal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

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
  const pos = value >= 0
  return (
    <span className={`font-mono text-xs font-semibold ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}¥{fmt(value)}
    </span>
  )
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400 font-mono text-xs">—</span>
  const pos = value >= 0
  return (
    <span className={`font-mono text-xs font-semibold ${pos ? 'text-green-600' : 'text-red-600'}`}>
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

// Fetch current prices from daily_signals (DISTINCT ON code, latest date first)
async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, number | null>> {
  if (tickers.length === 0) return {}
  try {
    const { data } = await supabase
      .from('daily_signals')
      .select('code, close, date')
      .in('code', tickers)
      .order('code', { ascending: true })
      .order('date', { ascending: false })
    const map: Record<string, number | null> = {}
    if (data) {
      for (const row of data as { code: string; close: number | null; date: string }[]) {
        // Keep only the first (latest) record per code
        if (!(row.code in map)) map[row.code] = row.close ?? null
      }
    }
    return map
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

  const loadPrices = useCallback(async () => {
    const tickers = [...new Set(openTrades.map(p => p.ticker))]
    const map = await fetchCurrentPrices(tickers)
    setPrices(map)
  }, [openTrades.map(p => p.ticker).join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

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
        <span className="text-xs text-gray-400">追加はヘッダーの「+ New Trade」から</span>
      </div>

      {/* Desktop table */}
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto hidden sm:block">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-t border-[#e8eaed]">
              {['Ticker','Name','Sector','Entry Date','Entry Price','Shares','Stop','Stop(21L)','InitRisk%','Current','Unrealized ¥','Unrealized %','TrailDist%','Target','Actions'].map(h => (
                <th key={h} className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${h === 'Actions' ? 'text-right' : h === 'Ticker' || h === 'Name' || h === 'Sector' ? 'text-left' : 'text-right'}`}>
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
              const trailDistPct = curPrice != null && pos.stop_21l != null
                ? (curPrice - pos.stop_21l) / curPrice * 100
                : null
              return (
                <tr
                  key={pos.id}
                  className={`border-b border-[#f0f2f4] hover:bg-gray-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}
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
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{pos.stop_21l != null ? `¥${fmt(pos.stop_21l)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {pos.init_risk_pct != null ? <span className="text-orange-600">{pos.init_risk_pct.toFixed(2)}%</span> : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {curPrice != null ? `¥${fmt(curPrice)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap"><PnlCell value={unrealizedPnl} /></td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap"><PctCell value={unrealizedPct} /></td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap"><PctCell value={trailDistPct} /></td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                    {pos.target_price != null ? (
                      <>
                        ¥{fmt(pos.target_price)}
                        {pos.entry_price > 0 && (
                          <span className="text-emerald-600">
                            {' '}({pos.target_price >= pos.entry_price ? '+' : ''}
                            {((pos.target_price - pos.entry_price) / pos.entry_price * 100).toFixed(1)}%)
                          </span>
                        )}
                      </>
                    ) : pos.target_r != null ? `${pos.target_r}R` : '—'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setClosePos(pos)}
                        className="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100">Close</button>
                      <button onClick={() => setEditPos(pos)}
                        className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">Edit</button>
                      <button onClick={() => setDeletePos(pos)}
                        className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100">Delete</button>
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
            <div key={pos.id} className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4">
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
                <div><span className="text-gray-400 block">Entry</span>¥{fmt(pos.entry_price)}</div>
                <div><span className="text-gray-400 block">Shares</span>{fmt(pos.shares)}</div>
                <div><span className="text-gray-400 block">Current</span>{curPrice != null ? `¥${fmt(curPrice)}` : '—'}</div>
                <div><span className="text-gray-400 block">Stop</span>{pos.stop_price != null ? `¥${fmt(pos.stop_price)}` : '—'}</div>
                <div><span className="text-gray-400 block">InitRisk</span>{pos.init_risk_pct != null ? `${pos.init_risk_pct.toFixed(1)}%` : '—'}</div>
                <div><span className="text-gray-400 block">Target</span>{pos.target_price != null ? `¥${fmt(pos.target_price)}` : pos.target_r != null ? `${pos.target_r}R` : '—'}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setClosePos(pos)}
                  className="flex-1 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg">Close</button>
                <button onClick={() => setEditPos(pos)}
                  className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">Edit</button>
                <button onClick={() => setDeletePos(pos)}
                  className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg">Delete</button>
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
