'use client'

import { memo, useEffect, useRef } from 'react'

type Props = {
  // TradingView シンボル。日本株は "TSE:8624" 形式（lib/tickerLinks と同じ規約）。
  symbol: string
  interval?: string
  // compact: カード内インライン用の軽量表示（サイドツールバー等を隠す）。
  // 既定 false = モーダル用のフル機能表示。
  compact?: boolean
}

// TradingView 公式の Advanced Real-Time Chart ウィジェットを埋め込む。
// 画像（四季報オンライン）と同系統のフル機能チャート。データ・銘柄は TradingView 側。
// 描画は各ユーザーのブラウザで s3.tradingview.com のスクリプトが行う（静的 export でも動作）。
function TradingViewWidget({ symbol, interval = 'D', compact = false }: Props) {
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
      // compact（カード内）はツールバー類を隠して軽く・小さく。
      allow_symbol_change: !compact,
      hide_side_toolbar: compact,
      hide_top_toolbar: compact,
      hide_legend: compact,
      withdateranges: !compact,
      support_host: 'https://www.tradingview.com',
    })
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [symbol, interval, compact])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height: '100%', width: '100%' }}
    />
  )
}

export default memo(TradingViewWidget)
