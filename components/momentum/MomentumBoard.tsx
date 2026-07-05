'use client'

import { useMemo } from 'react'
import type { MomentumSnapshot } from '@/lib/momentumLeadersFetch'
import { HORIZONS } from '@/types/momentumLeaders'
import MomentumColumn from './MomentumColumn'

type Props = {
  snapshot: MomentumSnapshot
  query: string
  newOnly: boolean
}

// 21 / 63 / 126 を横並び 3 列で表示し、縦（rank 昇順）に見比べる。
// 狭い画面では縦積みにフォールバック（各列は独立スクロール）。
export default function MomentumBoard({ snapshot, query, newOnly }: Props) {
  // code → 出現窓数（短期/中期/長期のいくつに登場したか）。名前の背景強調に使う。
  // PK が (date, code, horizon) なので窓ごとに最大1回 = カウント上限 3。
  const dupCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of HORIZONS) {
      for (const r of snapshot.byHorizon[h]) {
        m.set(r.code, (m.get(r.code) ?? 0) + 1)
      }
    }
    return m
  }, [snapshot])

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-stretch">
      {HORIZONS.map(h => (
        <MomentumColumn
          key={h}
          horizon={h}
          rows={snapshot.byHorizon[h]}
          query={query}
          newOnly={newOnly}
          dupCount={dupCount}
        />
      ))}
    </div>
  )
}
