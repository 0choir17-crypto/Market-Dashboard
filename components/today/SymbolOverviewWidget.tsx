'use client'

import { memo, useEffect, useRef } from 'react'

type Props = {
  // TradingView シンボル。日本株は "TSE:8624" 形式（lib/tickerLinks と同じ規約）。
  symbol: string
}

// TradingView 公式の Symbol Overview ウィジェット（軽量）。
// Advanced Chart と違い「1ページに多数タイル表示」を想定した作りで、
// カードを大量に並べても TradingView 側のスロットリング（"このシンボルは
// 利用可能です" 通知ポップアップ）が出ない。表示はエリア/ライン系。
// ローソク足のフル機能版はカードのアイコン→モーダル（TradingViewWidget）で。
function SymbolOverviewWidget({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = '100%'
    widgetDiv.style.width = '100%'
    container.appendChild(widgetDiv)

    const script = document.createElement('script')
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbols: [[symbol, `${symbol}|6M`]],
      chartOnly: true, // ヘッダ/気配を隠してチャートだけ（カード向けにコンパクト）
      locale: 'ja',
      colorTheme: 'light',
      autosize: true,
      isTransparent: true,
      showVolume: false,
      showMA: false,
      dateRanges: ['3m|1D', '6m|1D', '12m|1D'],
      lineWidth: 2,
      lineType: 0,
      timezone: 'Asia/Tokyo',
      // 上昇/下降で色分け（緑/赤）。既存チャートの配色に合わせる。
      colorUp: '#16a34a',
      colorDown: '#dc2626',
      gridLineColor: 'rgba(148,163,184,0.10)',
      fontColor: '#475569',
      support_host: 'https://www.tradingview.com',
    })
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [symbol])

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height: '100%', width: '100%' }}
    />
  )
}

export default memo(SymbolOverviewWidget)
