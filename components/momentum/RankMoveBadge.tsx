'use client'

import type { MomentumLeader } from '@/types/momentumLeaders'
import { rankMove } from '@/types/momentumLeaders'

// rank_change を ▲n（改善・緑）/ ▼n（下落・赤）/ →（変わらず）/ NEW（新規入り）で表示。
// rank_change = rank_prev − rank（正=順位が上がった）。null=前日圏外＝新規入り。
export default function RankMoveBadge({ row }: { row: MomentumLeader }) {
  const move = rankMove(row.rank_change)

  if (move.kind === 'new') {
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-100 text-rose-700"
        title="前日は圏外＝新規ランクイン"
      >
        NEW
      </span>
    )
  }
  if (move.kind === 'up') {
    return (
      <span
        className="inline-block px-1 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums text-[var(--positive)]"
        title={`前日より ${move.delta} 順位 上昇（前日 ${row.rank_prev ?? '—'} 位）`}
      >
        ▲{move.delta}
      </span>
    )
  }
  if (move.kind === 'down') {
    return (
      <span
        className="inline-block px-1 py-0.5 rounded text-[10px] font-mono font-semibold tabular-nums text-[var(--negative)]"
        title={`前日より ${move.delta} 順位 下落（前日 ${row.rank_prev ?? '—'} 位）`}
      >
        ▼{move.delta}
      </span>
    )
  }
  return (
    <span className="inline-block text-[10px] font-mono text-[var(--text-muted)]" title="前日と同順位">
      →
    </span>
  )
}
