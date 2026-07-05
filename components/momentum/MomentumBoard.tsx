'use client'

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
  return (
    <div className="flex flex-col lg:flex-row gap-4 items-stretch">
      {HORIZONS.map(h => (
        <MomentumColumn
          key={h}
          horizon={h}
          rows={snapshot.byHorizon[h]}
          query={query}
          newOnly={newOnly}
        />
      ))}
    </div>
  )
}
