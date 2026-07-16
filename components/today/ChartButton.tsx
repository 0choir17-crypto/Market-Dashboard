'use client'

import { useChartModal } from '@/contexts/ChartModalContext'

type Props = {
  code: string
  name?: string | null
}

// カード内から TradingView チャートモーダルを開く小ボタン。
// ChartModalProvider 配下（Daily Watch ページ）でのみ使用する。
export default function ChartButton({ code, name }: Props) {
  const { openChart } = useChartModal()
  return (
    <button
      type="button"
      onClick={() => openChart(code, name)}
      className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-card-hover)] transition-colors"
      title={`${code} のチャートを開く`}
      aria-label={`${code} のチャートを開く`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M7 14l3-4 3 3 4-6" />
      </svg>
    </button>
  )
}
