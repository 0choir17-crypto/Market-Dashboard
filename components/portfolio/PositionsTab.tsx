'use client'

// 保有中ポジション（Trading ページ上段）。
//
// 損切り価格は運用上ほぼ記録しないため、列は「建値・現在値・含み損益・含み ATR」が中心。
// 損切り価格が 1 件でも入っていれば、その列と「全ストップ時の損失」を出す。

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import PositionModal from './PositionModal'
import CloseModal from './CloseModal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatYen, formatPct, pnlColorClass } from '@/lib/format'
import { tradingViewUrl } from '@/lib/tickerLinks'
import { toneStyle, type SemanticTone } from '@/types/semantic'
import { todayJST } from '@/lib/dates'

type Props = {
  positions: Trade[]
  /** 互換用（未使用） */
  allTrades?: Trade[]
  /** risk_settings.account_capital（総建玉の % 表示用） */
  capital?: number | null
  /** risk_settings.max_positions */
  maxPositions?: number | null
  onRefresh: () => void
}

function Dash() {
  return <span className="num text-[var(--text-muted)]">—</span>
}

function days(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : 0
}

function Stat({ label, value, sub, valueClass, title }: {
  label: string; value: string; sub?: string; valueClass?: string; title?: string
}) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-small text-[var(--text-muted)]">{label}</div>
      <div className={`text-lead font-medium num leading-tight ${valueClass ?? 'text-[var(--text-primary)]'}`}>{value}</div>
      {sub && <div className="text-caption text-[var(--text-muted)] num">{sub}</div>}
    </div>
  )
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

export default function PositionsTab({ positions, capital = null, maxPositions = null, onRefresh }: Props) {
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

  const today = todayJST()
  const rows = openTrades.map(p => {
    const cur = prices[p.ticker] ?? null
    const pnl = cur != null ? (cur - p.entry_price) * p.shares : null
    const pct = cur != null && p.entry_price > 0 ? (cur - p.entry_price) / p.entry_price * 100 : null
    const atrNow = cur != null && p.atr_at_entry != null && p.atr_at_entry > 0 ? (cur - p.entry_price) / p.atr_at_entry : null
    return { p, cur, pnl, pct, atrNow, value: cur != null ? cur * p.shares : null, held: days(p.entry_date, today) }
  })

  const hasStops = openTrades.some(p => p.stop_price != null)
  const cap = capital != null && capital > 0 ? capital : null
  const allPriced = rows.every(r => r.value != null)
  const marketValue = rows.reduce((a, r) => a + (r.value ?? 0), 0)
  const unrealized = rows.reduce((a, r) => a + (r.pnl ?? 0), 0)
  const lossAtStop = openTrades.reduce((a, p) => a + (p.stop_price != null ? Math.min(0, (p.stop_price - p.entry_price) * p.shares) : 0), 0)

  if (openTrades.length === 0) {
    return <p className="text-small text-[var(--text-muted)]">保有中のポジションはありません（「＋ 新規トレード」から追加）</p>
  }

  return (
    <div>
      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)]">
        {/* 合計 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 py-3 border-b-[0.5px] border-[var(--border)]">
          <Stat
            label="含み損益"
            value={formatYen(unrealized, { sign: true })}
            sub={allPriced ? undefined : '現在値なしの銘柄あり'}
            valueClass={pnlColorClass(unrealized)}
          />
          <Stat
            label="総建玉"
            title="Σ 株数 × 現在値。口座資金を設定すると % で表示（100% 超は信用で借りている）"
            value={cap ? formatPct(marketValue / cap * 100, { digits: 0 }) : formatYen(marketValue)}
            sub={cap ? formatYen(marketValue) : undefined}
            valueClass={cap && marketValue > cap ? 'text-[var(--sem-watch-fg)]' : undefined}
          />
          <Stat
            label="保有数"
            value={maxPositions ? `${openTrades.length} / ${maxPositions}` : `${openTrades.length}`}
            valueClass={maxPositions && openTrades.length > maxPositions ? 'text-[var(--negative)]' : undefined}
          />
          {hasStops && (
            <Stat
              label="全ストップ時の損失"
              title="損切り価格が入っているポジションが、すべて損切りにかかった場合の損失"
              value={cap ? formatPct(lossAtStop / cap * 100, { digits: 2, sign: true }) : formatYen(lossAtStop, { sign: true })}
              sub={cap ? formatYen(lossAtStop, { sign: true }) : undefined}
              valueClass={lossAtStop < 0 ? 'text-[var(--negative)]' : undefined}
            />
          )}
        </div>

        {/* 表（スマホでは列を絞る） */}
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead className="border-b-[0.5px] border-[var(--border)] text-small text-[var(--text-muted)]">
              <tr>
                <th className="text-left font-medium px-2.5 py-2">銘柄</th>
                <th className="text-right font-medium px-2.5 py-2 hidden sm:table-cell">日数</th>
                <th className="text-right font-medium px-2.5 py-2 hidden sm:table-cell">建値 × 株数</th>
                <th className="text-right font-medium px-2.5 py-2">現在値</th>
                <th className="text-right font-medium px-2.5 py-2">含み損益</th>
                <th className="text-right font-medium px-2.5 py-2" title="(現在値 − 建値) ÷ 買う前日の ATR14">含み ATR</th>
                {hasStops && <th className="text-right font-medium px-2.5 py-2 hidden md:table-cell">損切り</th>}
                <th className="px-2.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, cur, pnl, pct, atrNow, held }) => (
                <tr key={p.id} className="border-t-[0.5px] border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <a href={tradingViewUrl(p.ticker)} target="_blank" rel="noopener noreferrer"
                       className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline">{p.ticker}</a>
                    <span className="ml-1.5 text-small text-[var(--text-secondary)]">{p.company_name}</span>
                    <div className="text-caption text-[var(--text-muted)] font-mono sm:hidden">{p.entry_date}</div>
                  </td>
                  <td className="px-2.5 py-2 text-right num text-[var(--text-secondary)] hidden sm:table-cell" title={p.entry_date}>{held}</td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap num text-[var(--text-secondary)] hidden sm:table-cell">
                    ¥{p.entry_price.toLocaleString('ja-JP')} × {p.shares.toLocaleString('ja-JP')}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap num">{cur != null ? `¥${cur.toLocaleString('ja-JP')}` : <Dash />}</td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {pnl != null ? (
                      <>
                        <span className={`num ${pnlColorClass(pnl)}`}>{formatYen(pnl, { sign: true })}</span>
                        <span className={`num text-small ml-1.5 ${pnlColorClass(pct ?? 0)}`}>{formatPct(pct ?? 0, { digits: 1, sign: true })}</span>
                      </>
                    ) : <Dash />}
                  </td>
                  <td className="px-2.5 py-2 text-right whitespace-nowrap">
                    {atrNow != null ? <span className={`num ${pnlColorClass(atrNow)}`}>{atrNow > 0 ? '+' : ''}{atrNow.toFixed(1)}</span> : <Dash />}
                  </td>
                  {hasStops && (
                    <td className="px-2.5 py-2 text-right whitespace-nowrap hidden md:table-cell">
                      {p.stop_price != null ? (
                        <span className="num text-[var(--text-secondary)]">
                          ¥{p.stop_price.toLocaleString('ja-JP')}
                          {p.stop_price >= p.entry_price && (
                            <span style={toneStyle('ok')} className="ml-1 px-1.5 py-0.5 rounded text-caption">建値以上</span>
                          )}
                        </span>
                      ) : <Dash />}
                    </td>
                  )}
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <ActionButton tone="watch" onClick={() => setClosePos(p)}>決済</ActionButton>
                      <ActionButton tone="focus" onClick={() => setEditPos(p)}>編集</ActionButton>
                      <ActionButton tone="weak" onClick={() => setDeletePos(p)}>削除</ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
