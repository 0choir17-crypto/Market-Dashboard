'use client'

// 地合い判定カード（指数 / 業種）で共通に使う表示部品。
// 色だけでは理由が読めないので、信号には必ず判定の言葉を添える。

import { SLOPE_LOOKBACK, type TrendSignal } from '@/lib/trendState'

export const SIGNAL_STYLE: Record<TrendSignal, { bg: string; fg: string; bd: string; name: string }> = {
  green: { bg: 'var(--sem-strong-bg)', fg: 'var(--sem-strong-fg)', bd: 'var(--sem-strong-bd)', name: '緑' },
  yellow: { bg: 'var(--sem-watch-bg)', fg: 'var(--sem-watch-fg)', bd: 'var(--sem-watch-bd)', name: '黄' },
  red: { bg: 'var(--sem-weak-bg)', fg: 'var(--sem-weak-fg)', bd: 'var(--sem-weak-bd)', name: '赤' },
}

/** 並べ替え用。緑 → 黄 → 赤 */
export const SIGNAL_ORDER: Record<TrendSignal, number> = { green: 0, yellow: 1, red: 2 }

export const SLOPE_NOTE = `今日の EMA と ${SLOPE_LOOKBACK} 営業日前の EMA を比べた向き`

export function Row({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-3" title={title}>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono tabular-nums font-medium">{children}</span>
    </div>
  )
}

export function Position({ above, dist }: { above: boolean; dist?: number }) {
  return (
    <span style={{ color: above ? 'var(--positive)' : 'var(--negative)' }}>
      {above ? '上' : '下'}
      {dist !== undefined && (
        <span className="ml-1.5">
          {dist >= 0 ? '+' : ''}
          {dist.toFixed(2)}%
        </span>
      )}
    </span>
  )
}

export function Slope({ up, short = false }: { up: boolean; short?: boolean }) {
  return (
    <span style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}>
      {up ? '↑' : '↓'}
      {!short && (up ? ' 上向き' : ' 下向き')}
    </span>
  )
}
