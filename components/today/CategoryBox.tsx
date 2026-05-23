'use client'

import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

export type TickerItem = {
  code: string
  name: string | null
  sector: string | null
}

type Props = {
  title: string
  description?: string
  items: TickerItem[]
  accent?: 'vcp' | 'pivot' | 'signals' | 'cross'
  hotSectors?: Set<string>
  expanded?: boolean
  onToggleExpand?: () => void
}

const ACCENT_COLORS: Record<NonNullable<Props['accent']>, string> = {
  vcp: '#3b82f6',
  pivot: '#8b5cf6',
  signals: '#10b981',
  cross: '#f59e0b',
}

export default function CategoryBox({
  title,
  description,
  items,
  accent = 'vcp',
  hotSectors,
  expanded = false,
  onToggleExpand,
}: Props) {
  const color = ACCENT_COLORS[accent]
  const isHot = (sector: string | null): boolean =>
    sector != null && hotSectors != null && hotSectors.has(sector)

  return (
    <div className="bg-white rounded-lg border border-[#e8eaed] shadow-sm flex flex-col">
      <button
        type="button"
        onClick={onToggleExpand}
        disabled={!onToggleExpand || items.length === 0}
        className="flex items-center justify-between px-3 py-2 border-l-4 border-b border-[#e8eaed] text-left w-full hover:bg-gray-50 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
        style={{ borderLeftColor: color }}
        title={
          items.length === 0
            ? undefined
            : expanded
              ? 'チャート一覧を閉じる'
              : 'クリックでチャート一覧を表示'
        }
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate flex items-center gap-1">
            {title}
            {onToggleExpand && items.length > 0 && (
              <span className="text-[10px] text-gray-400">
                {expanded ? '▼' : '▶'}
              </span>
            )}
          </h3>
          {description && (
            <p className="text-[10px] text-gray-500 truncate">{description}</p>
          )}
        </div>
        <span className="text-xs font-mono text-gray-500 flex-shrink-0 ml-2">
          {items.length} tickers
        </span>
      </button>

      <div className="p-2 flex-1 min-h-[80px]">
        {items.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">—</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {items.map(item => {
              const hot = isHot(item.sector)
              return (
                <div
                  key={item.code}
                  className="px-2 py-1.5 rounded transition-colors"
                  style={{
                    backgroundColor: hot ? '#dcfce7' : '#f9fafb',
                    border: hot ? '1px solid #86efac' : '1px solid transparent',
                  }}
                  title={
                    hot
                      ? `${item.sector}（資金集中セクター: component_flow >= 70）`
                      : undefined
                  }
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <a
                      href={shikihoUrl(item.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${item.name ?? '—'}（四季報を開く）`}
                      className="text-xs font-semibold hover:underline truncate"
                      style={{ color: hot ? '#15803d' : 'var(--text-primary)' }}
                    >
                      {item.name ?? item.code}
                    </a>
                    <a
                      href={tradingViewUrl(item.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${item.code}（TradingView を開く）`}
                      className="text-[11px] font-mono font-semibold hover:underline flex-shrink-0"
                      style={{ color: hot ? '#15803d' : '#2563eb' }}
                    >
                      {item.code}
                    </a>
                  </div>
                  <div
                    className="text-[9px] truncate"
                    style={{ color: hot ? '#16a34a' : '#6b7280' }}
                  >
                    {hot ? '🟢 ' : ''}
                    {item.sector ?? '—'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
