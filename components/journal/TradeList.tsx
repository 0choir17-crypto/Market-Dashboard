'use client'

import { Trade } from '@/types/trades'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import { getTagById } from '@/lib/reviewTags'
import { effectiveResult } from '@/lib/tradeResult'
import ReviewSection from './ReviewSection'

export type ExpandedReview = number | null

type Props = {
  trades: Trade[]
  onClose: (trade: Trade) => void
  onEdit: (trade: Trade) => void
  expandedReview: ExpandedReview
  onToggleReview: (tradeId: number) => void
  onSectionSaved: () => void
  onSectionCancel: () => void
  /** 描画するセクション。省略時は ['open', 'closed'] (両方)。 */
  sections?: Array<'open' | 'closed'>
}

function holdDays(entry: string | null, exit: string | null): number | null {
  if (!entry || !exit) return null
  const ms = new Date(exit).getTime() - new Date(entry).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round(ms / 86400000))
}

// スクリーン種別 → バッジ色 (Phase 2.1 採用 2 + legacy グレー)
function screenBadgeClass(rawScreenName: string | null): string {
  if (!rawScreenName) return 'bg-gray-100 text-gray-600'
  const first = rawScreenName.split('|')[0].trim()
  // Phase 2.1 採用 (bear/neutral 限定)
  if (first === 'DIV_DY_Incr_EpsGr') {
    return 'bg-red-50 text-red-700'
  }
  if (first === 'FCT_ValueQuality_CRS') {
    return 'bg-purple-50 text-purple-700'
  }
  // Phase 2.1 で archive された旧 screens (過去 signal 互換用 grey)
  return 'bg-gray-100 text-gray-500'
}

function SignalSnapshotLine({ t }: { t: Trade }) {
  if (t.rs_at_entry == null) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400 mt-1">
      <span>RS: <strong className="text-gray-600">{t.rs_at_entry.toFixed(1)}</strong></span>
      <span>RVOL: <strong className={(t.rvol_at_entry ?? 0) >= 2 ? 'text-emerald-600 font-bold' : 'text-gray-600'}>{t.rvol_at_entry?.toFixed(2)}</strong></span>
      <span>ADR: <strong className="text-gray-600">{t.adr_at_entry?.toFixed(2)}%</strong></span>
      <span>EMA21: <strong className="text-gray-600">{t.dist_ema21_at_entry?.toFixed(2)}R</strong></span>
      {t.stop_pct_at_entry != null && <span>Stop: <strong className="text-gray-600">{t.stop_pct_at_entry.toFixed(2)}%</strong></span>}
      {t.sector_s33 && <span>Sector: <strong className="text-gray-600">{t.sector_s33}</strong></span>}
      {t.signal_price != null && <span>Price: <strong className="text-gray-600">&yen;{t.signal_price.toLocaleString()}</strong></span>}
      {t.mc_condition_at_entry && (
        <span>MC: <strong className={t.mc_met_at_entry ? 'text-emerald-600' : 'text-gray-400'}>{t.mc_condition_at_entry} {t.mc_met_at_entry ? '\u2705' : '\u274c'}</strong></span>
      )}
    </div>
  )
}

function ReviewTagPills({ tagIds }: { tagIds: string[] }) {
  if (tagIds.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tagIds.slice(0, 6).map(id => {
        const tag = getTagById(id)
        if (!tag) return null
        return (
          <span
            key={id}
            className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded"
            title={tag.description}
          >
            {tag.label}
          </span>
        )
      })}
      {tagIds.length > 6 && (
        <span className="text-[10px] text-gray-500">+{tagIds.length - 6}</span>
      )}
    </div>
  )
}

export default function TradeList({
  trades,
  onClose,
  onEdit,
  expandedReview,
  onToggleReview,
  onSectionSaved,
  onSectionCancel,
  sections = ['open', 'closed'],
}: Props) {
  const showOpen = sections.includes('open')
  const showClosed = sections.includes('closed')
  const openTrades = trades.filter(t => t.status === 'open')
  const closedTrades = trades
    .filter(t => t.status === 'closed')
    .sort((a, b) => (b.exit_date ?? '').localeCompare(a.exit_date ?? ''))

  function isReviewExpanded(trade: Trade): boolean {
    return expandedReview === trade.id
  }

  return (
    <div className="space-y-6">
      {/* OPEN trades */}
      {showOpen && (
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          OPEN ({openTrades.length})
        </h3>
        {openTrades.length === 0 ? (
          <p className="text-sm text-gray-400 pl-4">No open positions</p>
        ) : (
          <div className="space-y-3">
            {openTrades.map(t => (
              <div key={t.id} className="space-y-2">
                <div className="bg-white rounded-lg border border-gray-200 px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:shadow-sm transition-shadow">
                  <div className="space-y-1 min-w-0 flex-1">
                    {/* 1行目: 最重要 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://jp.tradingview.com/chart/?symbol=TSE:${t.ticker}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-bold text-blue-600 text-base hover:underline"
                      >
                        {t.ticker}
                      </a>
                      {t.company_name ? (
                        <a
                          href={`https://shikiho.toyokeizai.net/stocks/${t.ticker}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-gray-700 truncate hover:underline"
                        >
                          {t.company_name}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-700 truncate" />
                      )}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${screenBadgeClass(t.screen_name)}`}>
                        {t.screen_name ? (SCREEN_NAME_MAP[t.screen_name] ?? t.screen_name) : '—'}
                      </span>
                    </div>
                    {/* 2行目: エントリー情報 */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      <span>{t.entry_date}</span>
                      <span>&yen;{t.entry_price.toLocaleString()} &times; {t.shares}株</span>
                    </div>
                    {/* 3行目: シグナルスナップショット */}
                    <SignalSnapshotLine t={t} />
                  </div>
                  <div className="flex gap-2 self-end md:self-auto">
                    <button
                      onClick={() => onEdit(t)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onClose(t)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* CLOSED trades — grouped by exit-date year, descending */}
      {showClosed && (
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
          CLOSED ({closedTrades.length})
        </h3>
        {closedTrades.length === 0 ? (
          <p className="text-sm text-gray-400 pl-4">No closed trades</p>
        ) : (
          <div className="space-y-6">
            {groupTradesByYear(closedTrades).map(group => {
              // Year header shows only the count — WR/PF/PnL belong to the
              // PeriodPerformance table above and don't need to repeat here.
              return (
                <div key={group.year}>
                  <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-gray-200">
                    <h4 className="text-base font-bold text-gray-800 font-mono">
                      {group.year}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {group.trades.length}件
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                    {group.trades.map(t => {
                      const cls = effectiveResult(t)
                      const tone = cls === 'WIN' ? 'win' : cls === 'LOSS' ? 'loss' : 'be'
                      const badgeClass =
                        tone === 'win' ? 'bg-emerald-100 text-emerald-700'
                        : tone === 'loss' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                      const valueClass =
                        tone === 'win' ? 'text-emerald-600'
                        : tone === 'loss' ? 'text-red-600'
                        : 'text-gray-600'
                      const tags = t.review_tags ?? []
                      const hasReview = !!t.reviewed_at
                      const days = holdDays(t.entry_date, t.exit_date)
                      const expanded = isReviewExpanded(t)
                      const showScreenRow = !!t.screen_name
                      const badgeLabel = cls === 'BREAKEVEN' ? 'BE' : (cls ?? '—')
                      return (
                        <div
                          key={t.id}
                          className={`bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow ${
                            expanded ? 'lg:col-span-3 md:col-span-2' : ''
                          }`}
                        >
                          <div className="px-3 py-2 flex flex-col gap-1.5">
                            {/* 1行目: ticker・名前・結果バッジ */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <a
                                  href={`https://jp.tradingview.com/chart/?symbol=TSE:${t.ticker}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono font-bold text-sm text-blue-600 hover:underline flex-shrink-0"
                                >
                                  {t.ticker}
                                </a>
                                {t.company_name && (
                                  <a
                                    href={`https://shikiho.toyokeizai.net/stocks/${t.ticker}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-gray-700 truncate hover:underline"
                                    title={t.company_name}
                                  >
                                    {t.company_name}
                                  </a>
                                )}
                              </div>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeClass}`}
                                title={cls ?? ''}
                              >
                                {badgeLabel}
                              </span>
                            </div>

                            {/* 2行目: PnL %・¥・保有日数 */}
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`text-lg font-bold leading-none ${valueClass}`}>
                                {(t.pnl_pct ?? 0) >= 0 ? '+' : ''}{(t.pnl_pct ?? 0).toFixed(2)}%
                              </span>
                              <div className="flex items-baseline gap-2 text-xs">
                                {t.pnl != null && (
                                  <span className={`font-mono font-semibold ${valueClass}`}>
                                    {t.pnl >= 0 ? '+' : '-'}&yen;{Math.abs(Math.round(t.pnl)).toLocaleString()}
                                  </span>
                                )}
                                {days != null && (
                                  <span className="text-[11px] text-gray-500">{days}日</span>
                                )}
                              </div>
                            </div>

                            {/* 3行目: 日付・価格 */}
                            <div className="text-[11px] text-gray-500 font-mono leading-tight">
                              {t.entry_date} → {t.exit_date}
                              <br />
                              &yen;{t.entry_price.toLocaleString()} → &yen;{t.exit_price?.toLocaleString()}
                            </div>

                            {/* 4行目: スクリーン (欠損時は省略) */}
                            {showScreenRow && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                {t.screen_name && (
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${screenBadgeClass(t.screen_name)}`}>
                                    {SCREEN_NAME_MAP[t.screen_name] ?? t.screen_name}
                                  </span>
                                )}
                              </div>
                            )}

                            {hasReview && <ReviewTagPills tagIds={tags} />}
                          </div>

                          <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-end gap-2">
                            {/* Edit = ghost (secondary), Review = filled (primary action) */}
                            <button
                              onClick={() => onEdit(t)}
                              className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => onToggleReview(t.id)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                                expanded
                                  ? 'bg-blue-100 border-blue-400 text-blue-800'
                                  : hasReview
                                    ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                              }`}
                            >
                              {hasReview ? '🔍 Re-edit' : '🔍 Review'}
                            </button>
                          </div>

                          {expanded && (
                            <div className="border-t border-gray-100 p-3">
                              <ReviewSection trade={t} onSaved={onSectionSaved} onCancel={onSectionCancel} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      )}
    </div>
  )
}

type YearGroup = { year: string; trades: Trade[] }

function groupTradesByYear(trades: Trade[]): YearGroup[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const year = (t.exit_date ?? '').slice(0, 4) || '—'
    const arr = map.get(year) ?? []
    arr.push(t)
    map.set(year, arr)
  }
  return [...map.entries()]
    .map(([year, ts]) => ({ year, trades: ts }))
    .sort((a, b) => (a.year > b.year ? -1 : 1))
}
