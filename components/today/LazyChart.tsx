'use client'

import { useEffect, useRef, useState } from 'react'
import TradingViewWidget from '@/components/today/TradingViewWidget'

type Props = {
  code: string
  height?: number
}

// カード内インライン・チャート。ボタン操作なしで表示するが、画面（近傍）に
// 入るまでは TradingView ウィジェットを生成しない遅延読込。ヒット銘柄が多い日に
// 大量の iframe を同時ロードして重くならないようにするための最適化。
// 一度可視になったら再スクロールでも再ロードしないよう mount 済みを保持する。
export default function LazyChart({ code, height = 240 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el) return

    // IntersectionObserver 非対応環境では即表示にフォールバック。
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      // 画面手前 200px で先読みして、スクロール到達時には表示済みにする。
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown])

  return (
    <div
      ref={ref}
      className="rounded-md overflow-hidden border border-[#f0f2f4] bg-[var(--bg-card-hover)]"
      style={{ height }}
    >
      {shown ? (
        <TradingViewWidget symbol={`TSE:${code}`} compact />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[11px] text-[var(--text-muted)]">
          チャートを準備中…
        </div>
      )}
    </div>
  )
}
