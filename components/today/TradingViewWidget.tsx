'use client'

import { memo, useEffect, useRef } from 'react'

type Props = {
  // TradingView シンボル。日本株は "TSE:8624" 形式（lib/tickerLinks と同じ規約）。
  symbol: string
  interval?: string
}

// TradingView 公式の Advanced Real-Time Chart ウィジェットを埋め込む。
// 画像（四季報オンライン）と同系統のフル機能チャート。データ・銘柄は TradingView 側。
// 描画は各ユーザーのブラウザで s3.tradingview.com のスクリプトが行う（静的 export でも動作）。
// モーダル内で 1 枚ずつ表示する用途（カードへの多数タイル表示は TradingView 側の
// スロットリングで不可のため行わない）。
function TradingViewWidget({ symbol, interval = 'D' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // symbol 変更時に前回分を掃除してから再マウント。
    container.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = '100%'
    widgetDiv.style.width = '100%'
    container.appendChild(widgetDiv)

    const script = document.createElement('script')
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol,
      interval,
      locale: 'ja',
      timezone: 'Asia/Tokyo',
      theme: 'light',
      style: '1',
      autosize: true,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      support_host: 'https://www.tradingview.com',
    })
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [symbol, interval])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height: '100%', width: '100%' }}
    />
  )
}

export default memo(TradingViewWidget)
