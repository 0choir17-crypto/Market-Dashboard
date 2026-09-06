'use client'

import { useMemo } from 'react'
import type { MarketLeader } from '@/types/marketLeaders'

type Props = {
  rows: MarketLeader[]
}

type SectorBucket = {
  sector: string
  count: number
  codes: { code: string; coname: string | null; rank: number }[]
}

// 棒グラフは絶対値ではなく相対 (横幅最大セクター = 100%) で描画。
export default function SectorConcentration({ rows }: Props) {
  const buckets = useMemo(() => {
    const m = new Map<string, SectorBucket>()
    for (const r of rows) {
      const key = r.s33nm ?? '(unknown)'
      if (!m.has(key)) {
        m.set(key, { sector: key, count: 0, codes: [] })
      }
      const b = m.get(key)!
      b.count += 1
      b.codes.push({ code: r.code, coname: r.coname, rank: r.market_rank ?? 999 })
    }
    const arr = Array.from(m.values())
    for (const b of arr) b.codes.sort((a, b) => a.rank - b.rank)
    arr.sort((a, b) => b.count - a.count)
    return arr
  }, [rows])

  const max = buckets[0]?.count ?? 1
  const total = rows.length

  if (buckets.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">セクターデータなし</p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">セクター集中度 — 資金フロー観測</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Top 50 銘柄が S33 セクター別にどう分布しているか。最多セクター = 資金集中の中心。
          </p>
        </div>
        <span className="text-xs text-[var(--text-muted)]">{buckets.length} セクター / {total} 銘柄</span>
      </div>

      <div className="space-y-1.5">
        {buckets.map(b => {
          const pct = (b.count / max) * 100
          const sharePct = (b.count / total) * 100
          return (
            <div key={b.sector} className="flex items-center gap-3 text-xs">
              <span className="w-36 text-right text-[var(--text-primary)] truncate" title={b.sector}>
                {b.sector}
              </span>
              <div className="flex-1 h-5 bg-[var(--bg-card-hover)] rounded relative overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor:
                      b.count >= 10 ? '#16a34a' :
                      b.count >= 5 ? '#22c55e' :
                      b.count >= 3 ? '#eab308' : '#9ca3af',
                  }}
                />
                <span
                  className="absolute inset-0 flex items-center px-2 text-[11px] font-mono font-semibold tabular-nums"
                  style={{ color: pct > 30 ? '#fff' : '#374151' }}
                >
                  {b.count} 銘柄 ({sharePct.toFixed(0)}%)
                </span>
              </div>
              <span
                className="text-[10px] text-[var(--text-muted)] truncate w-44"
                title={b.codes.map(c => `${c.code} ${c.coname ?? ''}`).join(', ')}
              >
                {b.codes.slice(0, 3).map(c => c.code).join(', ')}
                {b.codes.length > 3 && ` +${b.codes.length - 3}`}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] mt-4 text-center">
        例: 電気機器が 19 銘柄 = 半導体クラスタへの資金集中
      </p>
    </div>
  )
}
