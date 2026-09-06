'use client'

import { Trade } from '@/types/trades'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import { getTagById } from '@/lib/reviewTags'
import { effectiveResult } from '@/lib/tradeResult'
import { formatYen, formatPct } from '@/lib/format'
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
  if (!rawScreenName) return 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
  const first = rawScreenName.split('|')[0].trim()
  // Phase 2.1 採用 (bear/neutral 限定)
  if (first === 'DIV_DY_Incr_EpsGr') {
    return 'bg-[var(--sem-weak-bg)] text-[var(--sem-weak-fg)]'
  }
  if (first === 'FCT_ValueQuality_CRS') {
    return 'bg-[var(--sem-focus-bg)] text-[var(--sem-focus-fg)]'
  }
  // Phase 2.1 で archive された旧 screens (過去 signal 互換用 grey)
  return 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
}

function SignalSnapshotLine({ t }: { t: Trade }) {
  if (t.rs_at_entry == null) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-[var(--text-muted)] mt-1">
      <span>RS: <strong className="text-[var(--text-secondary)]">{t.rs_at_entry.toFixed(1)}</strong></span>
      <span>RVOL: <strong className={(t.rvol_at_entry ?? 0) >= 2 ? 'text-[var(--positive)] font-medium' : 'text-[var(--text-secondary)]'}>{t.rvol_at_entry?.toFixed(2)}</strong></span>
      <span>ADR: <strong className="text-[var(--text-secondary)]">{t.adr_at_entry?.toFixed(2)}%</strong></span>
      <span>EMA21: <strong className="text-[var(--text-secondary)]">{t.dist_ema21_at_entry?.toFixed(2)}R</strong></span>
      {t.stop_pct_at_entry != null && <span>Stop: <strong className="text-[var(--text-secondary)]">{t.stop_pct_at_entry.toFixed(2)}%</strong></span>}
      {t.sector_s33 && <span>Sector: <strong className="text-[var(--text-secondary)]">{t.sector_s33}</strong></span>}
      {t.signal_price != null && <span>Price: <strong className="text-[var(--text-secondary)]">&yen;{t.signal_price.toLocaleString()}</strong></span>}
      {t.mc_condition_at_entry && (
        <span>MC: <strong className={t.mc_met_at_entry ? 'text-[var(--positive)]' : 'text-[var(--text-muted)]'}>{t.mc_condition_at_entry} {t.mc_met_at_entry ? '\u2705' : '\u274c'}</strong></span>
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
            className="text-caption bg-[var(--sem-focus-bg)] text-[var(--sem-focus-fg)] border border-[var(--sem-focus-bd)] px-1.5 py-0.5 rounded"
            title={tag.description}
          >
            {tag.label}
          </span>
        )
      })}
      {tagIds.length > 6 && (
        <span className="text-caption text-[var(--text-secondary)]">+{tagIds.length - 6}</span>
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
        <h3 className="text-small font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--positive)]" />
          OPEN ({openTrades.length})
        </h3>
        {openTrades.length === 0 ? (
          <p className="text-small text-[var(--text-muted)] pl-4">No open positions</p>
        ) : (
          <div className="space-y-3">
            {openTrades.map(t => (
              <div key={t.id} className="space-y-2">
                <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:shadow-sm transition-shadow">
                  <div className="space-y-1 min-w-0 flex-1">
                    {/* 1行目: 最重要 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://jp.tradingview.com/chart/?symbol=TSE:${t.ticker}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-medium text-[var(--sem-focus-fg)] text-lead hover:underline"
                      >
                        {t.ticker}
                      </a>
                      {t.company_name ? (
                        <a
                          href={`https://shikiho.toyokeizai.net/stocks/${t.ticker}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-small text-[var(--text-primary)] truncate hover:underline"
                        >
                          {t.company_name}
                        </a>
                      ) : (
                        <span className="text-small text-[var(--text-primary)] truncate" />
                      )}
                      <span className={`text-caption font-medium px-1.5 py-0.5 rounded ${screenBadgeClass(t.screen_name)}`}>
                        {t.screen_name ? (SCREEN_NAME_MAP[t.screen_name] ?? t.screen_name) : '—'}
                      </span>
                    </div>
                    {/* 2行目: エントリー情報 */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-[var(--text-secondary)]">
                      <span className="font-mono">{t.entry_date}</span>
                      <span className="num">&yen;{t.entry_price.toLocaleString()} &times; {t.shares}株</span>
                    </div>
                    {/* 3行目: シグナルスナップショット */}
                    <SignalSnapshotLine t={t} />
                  </div>
                  <div className="flex gap-2 self-end md:self-auto">
                    <button
                      onClick={() => onEdit(t)}
                      className="px-3 py-1.5 text-caption font-medium text-[var(--text-secondary)] border border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] rounded-lg transition-colors"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => onClose(t)}
                      className="px-3 py-1.5 text-caption font-medium text-white bg-[var(--sem-watch-fg)] hover:brightness-110 rounded-lg transition-colors"
                    >
                      決済
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
        <h3 className="text-small font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--sem-idle-bd)]" />
          CLOSED ({closedTrades.length})
        </h3>
        {closedTrades.length === 0 ? (
          <p className="text-small text-[var(--text-muted)] pl-4">No closed trades</p>
        ) : (
          <div className="space-y-6">
            {groupTradesByYear(closedTrades).map(group => {
              // Year header shows only the count — WR/PF/PnL belong to the
              // PeriodPerformance table above and don't need to repeat here.
              return (
                <div key={group.year}>
                  <div className="flex items-baseline gap-3 mb-3 pb-1.5 border-b border-[var(--border)]">
                    <h4 className="text-lead font-medium text-[var(--text-primary)] font-mono">
                      {group.year}
                    </h4>
                    <span className="text-caption text-[var(--text-secondary)]">
                      {group.trades.length}件
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                    {group.trades.map(t => {
                      const cls = effectiveResult(t)
                      const tone = cls === 'WIN' ? 'win' : cls === 'LOSS' ? 'loss' : 'be'
                      const badgeClass =
                        tone === 'win' ? 'bg-[var(--sem-strong-bg)] text-[var(--sem-strong-fg)]'
                        : tone === 'loss' ? 'bg-[var(--sem-weak-bg)] text-[var(--sem-weak-fg)]'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                      const valueClass =
                        tone === 'win' ? 'text-[var(--positive)]'
                        : tone === 'loss' ? 'text-[var(--negative)]'
                        : 'text-[var(--text-secondary)]'
                      const tags = t.review_tags ?? []
                      const hasReview = !!t.reviewed_at
                      const days = holdDays(t.entry_date, t.exit_date)
                      const expanded = isReviewExpanded(t)
                      const showScreenRow = !!t.screen_name
                      const badgeLabel = cls === 'BREAKEVEN' ? 'BE' : (cls ?? '—')
                      return (
                        <div
                          key={t.id}
                          className={`bg-[var(--bg-card)] rounded-lg border border-[var(--border)] hover:shadow-sm transition-shadow ${
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
                                  className="font-mono font-medium text-small text-[var(--sem-focus-fg)] hover:underline flex-shrink-0"
                                >
                                  {t.ticker}
                                </a>
                                {t.company_name && (
                                  <a
                                    href={`https://shikiho.toyokeizai.net/stocks/${t.ticker}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-caption text-[var(--text-primary)] truncate hover:underline"
                                    title={t.company_name}
                                  >
                                    {t.company_name}
                                  </a>
                                )}
                              </div>
                              <span
                                className={`text-caption font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${badgeClass}`}
                                title={cls ?? ''}
                              >
                                {badgeLabel}
                              </span>
                            </div>

                            {/* 2行目: PnL %・¥・保有日数 */}
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`text-title font-medium num leading-none ${valueClass}`}>
                                {formatPct(t.pnl_pct ?? 0, { sign: true })}
                              </span>
                              <div className="flex items-baseline gap-2 text-caption">
                                {t.pnl != null && (
                                  <span className={`num font-medium ${valueClass}`}>
                                    {formatYen(t.pnl, { sign: true })}
                                  </span>
                                )}
                                {days != null && (
                                  <span className="text-caption text-[var(--text-secondary)] num">{days}日</span>
                                )}
                              </div>
                            </div>

                            {/* 3行目: 日付・価格 */}
                            <div className="text-caption text-[var(--text-secondary)] font-mono leading-tight">
                              {t.entry_date} → {t.exit_date}
                              <br />
                              &yen;{t.entry_price.toLocaleString()} → &yen;{t.exit_price?.toLocaleString()}
                            </div>

                            {/* 4行目: スクリーン (欠損時は省略) */}
                            {showScreenRow && (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
                                {t.screen_name && (
                                  <span className={`text-caption font-medium px-1.5 py-0.5 rounded ${screenBadgeClass(t.screen_name)}`}>
                                    {SCREEN_NAME_MAP[t.screen_name] ?? t.screen_name}
                                  </span>
                                )}
                              </div>
                            )}

                            {hasReview && <ReviewTagPills tagIds={tags} />}
                          </div>

                          <div className="px-3 py-1.5 border-t border-[var(--border)] flex items-center justify-end gap-2">
                            {/* Edit = ghost (secondary), Review = filled (primary action) */}
                            <button
                              onClick={() => onEdit(t)}
                              className="px-2.5 py-1 text-caption font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded transition-colors"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => onToggleReview(t.id)}
                              className={`px-2.5 py-1 text-caption font-medium rounded border transition-colors ${
                                expanded
                                  ? 'bg-[var(--sem-focus-bg)] border-[var(--sem-focus-bd)] text-[var(--sem-focus-fg)]'
                                  : hasReview
                                    ? 'bg-[var(--sem-focus-fg)] border-[var(--sem-focus-bd)] text-white hover:brightness-110'
                                    : 'bg-[var(--sem-watch-fg)] border-[var(--sem-watch-bd)] text-white hover:brightness-110'
                              }`}
                            >
                              {hasReview ? '🔍 再編集' : '🔍 レビュー'}
                            </button>
                          </div>

                          {expanded && (
                            <div className="border-t border-[var(--border)] p-3">
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
