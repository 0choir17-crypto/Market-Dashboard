'use client'

import { useEffect, useRef, useState } from 'react'
import type { OhlcvBar, StructurePivotPhase } from '@/types/chart'
import { fetchChart } from '@/lib/chartFetch'
import MiniChart from '@/components/chart/MiniChart'

type Props = {
  code: string
  height?: number
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; bars: OhlcvBar[]; phases: StructurePivotPhase[] }
  | { status: 'error' }

// カード内インライン・チャート。自前の OHLCV（Supabase: chart_ohlcv_cache）を
// 既存の MiniChart（lightweight-charts）で描画する。TradingView 埋め込みと違い、
// 多数タイル表示でのスロットリング（通知ポップアップ）やシンボル解決失敗
// （ゴースト表示）が起きない。Structure Pivot オーバーレイも自前描画できる。
//
// 描画はボタン操作なし。ただし画面（近傍）に入るまで fetch も描画もしない遅延読込で、
// ヒット銘柄が多い日に一度に大量取得しないようにする。
export default function LazyChart({ code, height = 208 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<State>({ status: 'idle' })

  // 画面近傍に入ったら visible に。
  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // visible になったら一度だけ OHLCV を取得。
  useEffect(() => {
    if (!visible || state.status !== 'idle') return
    let cancelled = false
    setState({ status: 'loading' })
    fetchChart(code, { lookbackDays: 126 })
      .then((res) => {
        if (cancelled) return
        setState({
          status: 'ready',
          bars: res.ohlcv,
          phases: res.structurePivotPhases ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [visible, state.status, code])

  return (
    <div
      ref={ref}
      className="rounded-md overflow-hidden border border-[#f0f2f4] bg-white"
      style={{ height }}
    >
      {state.status === 'ready' && state.bars.length > 0 ? (
        <MiniChart bars={state.bars} structurePivotPhases={state.phases} height={height} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[11px] text-[var(--text-muted)]">
          {state.status === 'error'
            ? 'チャートを読み込めませんでした'
            : state.status === 'ready'
              ? 'データがありません'
              : 'チャートを準備中…'}
        </div>
      )}
    </div>
  )
}
