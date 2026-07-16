'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import TradingViewWidget from '@/components/today/TradingViewWidget'
import { tradingViewUrl } from '@/lib/tickerLinks'

type ChartTarget = { code: string; name?: string | null }

type ChartModalValue = {
  // 銘柄コード（4桁 TSE）でチャートモーダルを開く。
  openChart: (code: string, name?: string | null) => void
}

const ChartModalContext = createContext<ChartModalValue | null>(null)

export function ChartModalProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ChartTarget | null>(null)

  const openChart = useCallback((code: string, name?: string | null) => {
    if (!code) return
    setTarget({ code, name })
  }, [])

  const close = useCallback(() => setTarget(null), [])

  useEffect(() => {
    if (!target) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [target, close])

  return (
    <ChartModalContext.Provider value={{ openChart }}>
      {children}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={close}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${target.name ?? ''} ${target.code} チャート`}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col"
            style={{ height: 'min(90vh, 720px)' }}
          >
            {/* ヘッダー: 銘柄名・コード + TradingView 外部リンク + 閉じる */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-base font-semibold text-gray-900 truncate">
                  {target.name ?? '—'}
                </span>
                <span className="font-mono text-sm font-bold text-[var(--accent)]">
                  {target.code}
                </span>
                <a
                  href={tradingViewUrl(target.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--text-secondary)] hover:underline"
                  title="TradingView で開く"
                >
                  ↗ TradingView
                </a>
              </div>
              <button
                onClick={close}
                className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none font-light w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-50 flex-shrink-0"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            {/* チャート本体 */}
            <div className="flex-1 min-h-0 p-2">
              <TradingViewWidget symbol={`TSE:${target.code}`} />
            </div>
          </div>
        </div>
      )}
    </ChartModalContext.Provider>
  )
}

export function useChartModal() {
  const ctx = useContext(ChartModalContext)
  if (!ctx) throw new Error('useChartModal must be used within ChartModalProvider')
  return ctx
}
