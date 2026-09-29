'use client'

import { useMemo } from 'react'
import type { LiquidLeader } from '@/types/liquidLeaders'

type Props = {
  rows: LiquidLeader[]
}

type Bucket = {
  sector: string
  large: number
  mid: number
  total: number
  names: string[]
}

// 段ごと・業種ごとの件数（表示日）。件数そのものより「同じ業種が固まっているか」を
// 読むための図なので、棒は最多業種 = 100% の相対幅で、段 (大型 / 中小) を積み上げる。
// 段は規模の分類で良し悪しではないため、色は濃淡の 2 段だけにする。
export default function LiquidSectorCounts({ rows }: Props) {
  const { buckets, largeTotal, midTotal } = useMemo(() => {
    const m = new Map<string, Bucket>()
    let largeTotal = 0
    let midTotal = 0
    for (const r of rows) {
      const key = r.sector_s33 ?? '(不明)'
      let b = m.get(key)
      if (!b) {
        b = { sector: key, large: 0, mid: 0, total: 0, names: [] }
        m.set(key, b)
      }
      if (r.tier === 'large') {
        b.large += 1
        largeTotal += 1
      } else {
        b.mid += 1
        midTotal += 1
      }
      b.total += 1
      b.names.push(`${r.code} ${r.co_name ?? ''}`.trim())
    }
    const buckets = [...m.values()].sort(
      (a, b) => b.total - a.total || b.large - a.large || a.sector.localeCompare(b.sector, 'ja'),
    )
    return { buckets, largeTotal, midTotal }
  }, [rows])

  if (buckets.length === 0) return null

  const max = buckets[0].total
  const total = rows.length

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <p className="text-small font-medium text-[var(--text-primary)]">業種の偏り</p>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">
            どの業種に資金が向いているか。件数そのものより、同じ業種が固まっているかを見る。
          </p>
        </div>
        <div className="flex items-center gap-3 text-caption text-[var(--text-muted)]">
          <Legend color="var(--sem-focus-fg)" label={`大型 ${largeTotal}`} />
          <Legend color="var(--sem-focus-bd)" label={`中小 ${midTotal}`} />
          <span>
            {buckets.length} 業種 / {total} 銘柄
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {buckets.map(b => {
          const sharePct = (b.total / total) * 100
          return (
            <div key={b.sector} className="flex items-center gap-3 text-caption">
              <span className="w-28 sm:w-36 text-right text-[var(--text-primary)] truncate" title={b.sector}>
                {b.sector}
              </span>
              <div
                className="flex-1 h-5 bg-[var(--bg-card-hover)] rounded overflow-hidden flex"
                title={b.names.join(', ')}
              >
                <div
                  className="h-full"
                  style={{ width: `${(b.large / max) * 100}%`, backgroundColor: 'var(--sem-focus-fg)' }}
                />
                <div
                  className="h-full"
                  style={{ width: `${(b.mid / max) * 100}%`, backgroundColor: 'var(--sem-focus-bd)' }}
                />
              </div>
              <span className="w-32 text-[var(--text-secondary)] num whitespace-nowrap">
                {b.total}
                <span className="text-[var(--text-muted)]">
                  {' '}（大 {b.large} / 中小 {b.mid}）{sharePct.toFixed(0)}%
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
      <span className="num">{label}</span>
    </span>
  )
}
