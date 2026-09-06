'use client'

// History（/journal の決済済トレード一覧）。
//
// PositionsTab と同じ扱い: 見た目の語彙だけ共有し、表そのものは DataTable に
// 載せていない。min-width は置かない（固定すると収まる幅でも横スクロールが出る）。

import { Trade } from '@/types/trades'
import { formatYen, formatPct, formatR, pnlColorClass } from '@/lib/format'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'
import { toneStyle, type SemanticTone } from '@/types/semantic'

type Props = {
  history: Trade[]
}

function fmt(v: number | null | undefined, d = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** 欠損は 0 ではなく「—」。 */
function Missing() {
  return <span className="num text-[var(--sem-idle-fg)]">—</span>
}

function PnlCell({ value }: { value: number | null }) {
  if (value == null) return <Missing />
  return <span className={`num ${pnlColorClass(value)}`}>{formatYen(value, { sign: true })}</span>
}

function RCell({ value }: { value: number | null }) {
  if (value == null) return <Missing />
  return <span className={`num ${pnlColorClass(value)}`}>{formatR(value)}</span>
}

// 決済理由 → 意味語彙。分類のために色を増やさない（DESIGN_DIRECTION.md 原則 1）。
const EXIT_TONE: Record<string, SemanticTone> = {
  '利確': 'strong',
  '目標達成': 'ok',
  'トレール損切': 'watch',
  '損切': 'weak',
}

function ExitBadge({ reason }: { reason: string | null }) {
  if (!reason) return <Missing />
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-caption"
      style={toneStyle(EXIT_TONE[reason] ?? 'idle')}
    >
      {reason}
    </span>
  )
}

function holdDays(entry: string | null, exit: string | null): number | null {
  if (!entry || !exit) return null
  const d = (new Date(exit).getTime() - new Date(entry).getTime()) / 86400000
  return Math.round(d)
}

const HEADERS = ['Ticker', 'Name', 'Entry Date', 'Exit Date', 'Entry', 'Exit', 'Shares', 'PnL', 'R', 'Exit Reason', 'Memo']
const LEFT_ALIGNED = new Set(['Ticker', 'Name', 'Memo'])

export default function HistoryTab({ history }: Props) {
  // Statistics
  const trades = history.filter(h => h.pnl != null)
  const wins = trades.filter(h => (h.r_multiple ?? 0) >= 0)
  const losses = trades.filter(h => (h.r_multiple ?? 0) < 0)
  const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : null
  const totalPnl = trades.reduce((sum, h) => sum + (h.pnl ?? 0), 0)
  const avgR = trades.length > 0
    ? trades.reduce((sum, h) => sum + (h.r_multiple ?? 0), 0) / trades.length
    : null
  const grossWin = wins.reduce((sum, h) => sum + (h.pnl ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, h) => sum + (h.pnl ?? 0), 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null
  const holdDaysAll = trades.map(h => holdDays(h.entry_date, h.exit_date)).filter((d): d is number => d != null)
  const avgHoldDays = holdDaysAll.length > 0 ? holdDaysAll.reduce((a, b) => a + b, 0) / holdDaysAll.length : null
  const maxWin = wins.length > 0 ? Math.max(...wins.map(h => h.pnl ?? 0)) : null
  const maxLoss = losses.length > 0 ? Math.min(...losses.map(h => h.pnl ?? 0)) : null

  return (
    <div>
      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Win Rate', value: winRate != null ? formatPct(winRate, { digits: 1 }) : '—', color: winRate != null && winRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]' },
          { label: 'Avg R', value: formatR(avgR), color: avgR != null && avgR >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]' },
          { label: 'Profit Factor', value: profitFactor != null ? profitFactor.toFixed(2) : '—', color: profitFactor != null && profitFactor >= 1.5 ? 'text-[var(--positive)]' : 'text-[var(--text-primary)]' },
          { label: 'Total PnL', value: trades.length > 0 ? formatYen(totalPnl, { sign: true }) : '—', color: pnlColorClass(totalPnl) },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] px-4 py-3">
            <p className="text-caption tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
            <p className={`text-title num ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Trades', value: String(trades.length) },
          { label: 'Wins', value: String(wins.length) },
          { label: 'Losses', value: String(losses.length) },
          { label: 'Avg Hold', value: avgHoldDays != null ? `${avgHoldDays.toFixed(1)}d` : '—' },
          { label: 'Max Win', value: formatYen(maxWin, { sign: true }) },
          { label: 'Max Loss', value: formatYen(maxLoss, { sign: true }) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] px-4 py-3">
            <p className="text-caption tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
            <p className="text-body num text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
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
            {history.map(h => (
              <tr key={h.id} className="border-t-[0.5px] border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <a href={tradingViewUrl(h.ticker)} target="_blank" rel="noopener noreferrer"
                     title={`${h.ticker}（TradingView を開く）`}
                     className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline">{h.ticker}</a>
                </td>
                <td className="px-2.5 py-2 whitespace-nowrap text-small text-[var(--text-secondary)]">
                  {h.company_name ? (
                    <a href={shikihoUrl(h.ticker)} target="_blank" rel="noopener noreferrer"
                       title={`${h.company_name}（四季報を開く）`}
                       className="hover:text-[var(--sem-focus-fg)] hover:underline">{h.company_name}</a>
                  ) : '—'}
                </td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap font-mono text-small text-[var(--text-secondary)]">{h.entry_date ?? '—'}</td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap font-mono text-small text-[var(--text-secondary)]">{h.exit_date ?? '—'}</td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap">
                  {h.entry_price != null ? <span className="num text-[var(--text-secondary)]">¥{fmt(h.entry_price)}</span> : <Missing />}
                </td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap">
                  {h.exit_price != null ? <span className="num text-[var(--text-secondary)]">¥{fmt(h.exit_price)}</span> : <Missing />}
                </td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap">
                  <span className="num text-[var(--text-secondary)]">{fmt(h.shares)}</span>
                </td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap"><PnlCell value={h.pnl} /></td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap"><RCell value={h.r_multiple} /></td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap"><ExitBadge reason={h.exit_reason} /></td>
                <td className="px-2.5 py-2 text-small text-[var(--text-muted)] max-w-[120px]">
                  <span className="block truncate">{h.memo ?? '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {history.length === 0 && (
          <div className="py-10 text-center text-small text-[var(--text-muted)]">No trade history</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="block sm:hidden space-y-3">
        {history.length === 0 && <p className="text-center text-small text-[var(--text-muted)] py-8">No trade history</p>}
        {history.map(h => (
          <div key={h.id} className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <a href={tradingViewUrl(h.ticker)} target="_blank" rel="noopener noreferrer"
                   className="font-mono font-medium text-[var(--sem-focus-fg)] text-body">{h.ticker}</a>
                {h.company_name && (
                  <a href={shikihoUrl(h.ticker)} target="_blank" rel="noopener noreferrer"
                     className="ml-2 text-small text-[var(--text-muted)] hover:underline">{h.company_name}</a>
                )}
              </div>
              <ExitBadge reason={h.exit_reason} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-small text-[var(--text-secondary)] mb-2">
              <div><span className="text-caption text-[var(--text-muted)] block">Entry</span><span className="font-mono text-small">{h.entry_date ?? '—'}</span></div>
              <div><span className="text-caption text-[var(--text-muted)] block">Exit</span><span className="font-mono text-small">{h.exit_date ?? '—'}</span></div>
              <div><span className="text-caption text-[var(--text-muted)] block">Shares</span><span className="num">{fmt(h.shares)}</span></div>
              <div><span className="text-caption text-[var(--text-muted)] block">Buy</span><span className="num">{h.entry_price != null ? `¥${fmt(h.entry_price)}` : '—'}</span></div>
              <div><span className="text-caption text-[var(--text-muted)] block">Sell</span><span className="num">{h.exit_price != null ? `¥${fmt(h.exit_price)}` : '—'}</span></div>
              <div><span className="text-caption text-[var(--text-muted)] block">R</span><RCell value={h.r_multiple} /></div>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-caption text-[var(--text-muted)]">PnL</span>
              <PnlCell value={h.pnl} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
