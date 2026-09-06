'use client'

// 銘柄セル — プロジェクト共通のティッカークリック規約（lib/tickerLinks.ts）:
// コード → TradingView、銘柄名 → 四季報。
//
// コードは `278A` のように英字を含むので文字列のまま扱う
// （数値としてパース・ソートしない）。

import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'

export default function TickerCell({
  code,
  name,
}: {
  code: string
  name: string | null | undefined
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <a
        href={tradingViewUrl(code)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline flex-shrink-0"
        title={`${code}（TradingView を開く）`}
      >
        {code}
      </a>
      <a
        href={shikihoUrl(code)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-small text-[var(--text-secondary)] hover:text-[var(--sem-focus-fg)] hover:underline truncate min-w-0"
        title={`${name ?? '—'}（四季報を開く）`}
      >
        {name ?? '—'}
      </a>
    </div>
  )
}
