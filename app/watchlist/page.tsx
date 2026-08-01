'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { WatchlistItem } from '@/types/portfolio'
import { Trade } from '@/types/trades'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PositionModal from '@/components/portfolio/PositionModal'
import PageHeader from '@/components/shared/PageHeader'
import { formatYen } from '@/lib/format'

type SortKey = 'watch_date' | 'ticker' | 'screen_tag'

function ScreenTagBadge({ tag }: { tag: string | null }) {
  if (!tag) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">
      {tag}
    </span>
  )
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('watch_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Modal states
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<WatchlistItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<WatchlistItem | null>(null)
  const [promoteItem, setPromoteItem] = useState<WatchlistItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('watchlist')
      .select('*')
      .order('watch_date', { ascending: false })
    if (err) {
      // 取得失敗時は直前の表示内容を保持し、バナーで明示（空リストと混同させない）
      console.error('[watchlist] fetch error', err)
      setError(`watchlist: ${err.message}`)
    } else {
      setItems((data ?? []) as WatchlistItem[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir])

  async function handleDelete() {
    if (!deleteItem) return
    const { error: err } = await supabase.from('watchlist').delete().eq('id', deleteItem.id)
    setDeleteItem(null)
    if (err) {
      // 削除失敗は黙って戻さない（リロードで行が復活して見えるだけ、を防ぐ）
      console.error('[watchlist] delete error', err)
      setError(`削除に失敗しました: ${err.message}`)
      return
    }
    setError(null)
    load()
  }

  // Build prefill for PositionModal from watchlist item
  const promotePrefill: Partial<Trade> | undefined = promoteItem ? {
    ticker: promoteItem.ticker,
    company_name: promoteItem.company_name,
    entry_price: promoteItem.entry_price ?? 0,
    stop_price: promoteItem.stop_price,
    target_r: promoteItem.target_r,
    memo: promoteItem.memo,
    // シグナルスナップショット引き継ぎ
    sector_s33: promoteItem.sector_s33,
    signal_price: promoteItem.signal_price,
    rs_at_entry: promoteItem.rs_composite,
    rvol_at_entry: promoteItem.rvol,
    adr_at_entry: promoteItem.adr_pct,
    dist_ema21_at_entry: promoteItem.dist_ema21_r,
    stop_pct_at_entry: promoteItem.stop_pct,
    mc_met_at_entry: promoteItem.mc_met,
    mc_condition_at_entry: promoteItem.mc_condition,
  } : undefined

  const thClass = (key: SortKey) =>
    `px-3 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 transition-colors ${sortKey === key ? 'text-blue-600' : 'text-gray-500'}`

  const indicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <PageHeader title="Watchlist" subtitle="21 Cloud — スクリーニング候補管理">
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          <span className="text-lg leading-none">＋</span> 追加
        </button>
      </PageHeader>

      {error && <ErrorBanner detail={error} onRetry={load} />}

      {/* Desktop Table */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto hidden sm:block">
        <div className="px-4 pt-4 pb-2 text-xs text-gray-400">{items.length} 件</div>
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="bg-[var(--bg-card-hover)] border-b border-t border-[var(--border)]">
              <th className={`${thClass('ticker')} text-left`} onClick={() => handleSort('ticker')}>
                Ticker{indicator('ticker')}
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left whitespace-nowrap">Name</th>
              <th className={`${thClass('watch_date')} text-left`} onClick={() => handleSort('watch_date')}>
                Added{indicator('watch_date')}
              </th>
              <th className={`${thClass('screen_tag')} text-left`} onClick={() => handleSort('screen_tag')}>
                Screen{indicator('screen_tag')}
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">Signal Price</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">Stop</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">R Target</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">RS</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">RVOL</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">ADR%</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">EMA21(R)</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left whitespace-nowrap">Sector</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left whitespace-nowrap">Memo</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => (
              <tr
                key={item.id}
                className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors ${i % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-card-hover)]'}`}
              >
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <a
                    href={`https://jp.tradingview.com/chart/?symbol=TSE:${item.ticker}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-bold text-blue-600 hover:underline text-xs"
                  >
                    {item.ticker}
                  </a>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-700">
                  {item.company_name ? (
                    <a
                      href={`https://shikiho.toyokeizai.net/stocks/${item.ticker}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {item.company_name}
                    </a>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-600 font-mono">{item.watch_date}</td>
                <td className="px-3 py-2.5 whitespace-nowrap"><ScreenTagBadge tag={item.screen_tag} /></td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{formatYen(item.entry_price)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{formatYen(item.stop_price)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {item.target_r != null ? `${item.target_r}R` : '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{item.rs_composite != null ? item.rs_composite.toFixed(1) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {item.rvol != null ? (
                    <span className={item.rvol >= 2 ? 'font-bold text-emerald-600' : ''}>{item.rvol.toFixed(2)}</span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{item.adr_pct != null ? item.adr_pct.toFixed(1) : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{item.dist_ema21_r != null ? item.dist_ema21_r.toFixed(2) : '—'}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{item.sector_s33 ?? '—'}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[160px]">
                  <span className="block truncate">{item.memo ?? '—'}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setPromoteItem(item)}
                      className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                      title="ポートフォリオに昇格"
                    >
                      → Portfolio
                    </button>
                    <button
                      onClick={() => setEditItem(item)}
                      className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => setDeleteItem(item)}
                      className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !loading && (
          <div className="py-12 text-center text-gray-400 text-sm">
            ウォッチリストは空です。「追加」から登録してください。
          </div>
        )}
        {loading && (
          <div className="py-12 text-center text-gray-400 text-sm">読み込み中…</div>
        )}
      </div>

      {/* Mobile Card Layout */}
      <div className="block sm:hidden space-y-3">
        {loading && <p className="text-center text-gray-400 text-sm py-8">読み込み中…</p>}
        {!loading && items.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">ウォッチリストは空です。</p>
        )}
        {sorted.map(item => (
          <div key={item.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <a
                  href={`https://jp.tradingview.com/chart/?symbol=TSE:${item.ticker}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-bold text-blue-600 text-base hover:underline"
                >
                  {item.ticker}
                </a>
                {item.company_name && (
                  <span className="ml-2 text-xs text-gray-600">{item.company_name}</span>
                )}
              </div>
              <ScreenTagBadge tag={item.screen_tag} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-2">
              <div><span className="text-gray-400 block">Added</span><span className="font-mono">{item.watch_date}</span></div>
              <div><span className="text-gray-400 block">Signal</span><span className="font-mono">{formatYen(item.entry_price)}</span></div>
              <div><span className="text-gray-400 block">Stop</span><span className="font-mono">{formatYen(item.stop_price)}</span></div>
              <div><span className="text-gray-400 block">R Target</span>{item.target_r != null ? `${item.target_r}R` : '—'}</div>
            </div>
            {item.rs_composite != null && (
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-3">
                <div><span className="text-gray-400 block">RS</span>{item.rs_composite.toFixed(1)}</div>
                <div><span className="text-gray-400 block">RVOL</span><span className={item.rvol != null && item.rvol >= 2 ? 'font-bold text-emerald-600' : ''}>{item.rvol?.toFixed(2) ?? '—'}</span></div>
                <div><span className="text-gray-400 block">Sector</span>{item.sector_s33 ?? '—'}</div>
              </div>
            )}
            {item.memo && <p className="text-xs text-gray-500 mb-3 truncate">{item.memo}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setPromoteItem(item)}
                className="flex-1 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
              >
                → Portfolio
              </button>
              <button
                onClick={() => setEditItem(item)}
                className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                編集
              </button>
              <button
                onClick={() => setDeleteItem(item)}
                className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      <WatchlistModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={load}
      />
      <WatchlistModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSaved={load}
        initial={editItem ?? undefined}
      />
      <ConfirmDialog
        open={!!deleteItem}
        message={`「${deleteItem?.ticker}」をウォッチリストから削除しますか？`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
      />
      {/* Promote to Portfolio modal */}
      <PositionModal
        open={!!promoteItem}
        onClose={() => setPromoteItem(null)}
        onSaved={() => { setPromoteItem(null) }}
        initial={promotePrefill}
      />
    </main>
  )
}
