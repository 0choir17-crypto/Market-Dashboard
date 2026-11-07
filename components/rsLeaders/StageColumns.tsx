'use client'

// Pullback Board の列 (RS Leaders / Liquid Leaders 共通)。
// 列 = 押しの段階 (STAGES)。線が密集している銘柄も同じ列に入れ、札の銘柄名の横の TightMark で見分ける。
// 列の幅は銘柄数に比例させ、列の中は札を幅 196px 前後で折り返す。
// 札の多い列だけが縦に長く伸びず、画面の幅を使い切って列の高さが揃う。

import type { ReactNode } from 'react'
import { SPREAD_MIN, STAGES, isTight, type MaKey } from '@/types/rsLeaders'

export default function StageColumns<T extends { code: string }>({
  columns,
  renderChip,
}: {
  /** buildPullbackColumns の結果 */
  columns: T[][]
  /** bold = その列の基準の線 (札の下段で太字にする) */
  renderChip: (row: T, bold: MaKey | null) => ReactNode
}) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1">
        {STAGES.map((st, k) => {
          const items = columns[k] ?? []
          const empty = items.length === 0
          return (
            <div
              key={st.title}
              className={`rounded-lg bg-[var(--bg-primary)] p-2 ${empty ? 'flex-[0_0_104px] opacity-60' : 'min-w-[212px]'}`}
              style={empty ? undefined : { flex: `${items.length} 1 0` }}
            >
              <p className="text-small font-medium text-[var(--text-primary)]">
                {st.title} <span className="num text-[var(--text-muted)] font-normal">({items.length})</span>
              </p>
              <p className="text-caption text-[var(--text-secondary)] mb-1.5">
                {st.desc}・基準 {st.line}
              </p>
              <div className={empty ? '' : 'grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-1'}>
                {empty ? (
                  <span className="text-small text-[var(--text-muted)]">—</span>
                ) : (
                  items.map(r => <div key={r.code}>{renderChip(r, st.bold)}</div>)
                )}
              </div>
            </div>
          )
        })}
    </div>
  )
}

/** 線が密集している銘柄 (21/50EMA の開き SPREAD_MIN ATR 未満 = もみ合い) の印。銘柄名の横に置く */
export function TightMark({ spread }: { spread: number | null | undefined }) {
  if (!isTight(spread)) return null
  return (
    <span
      className="flex-none ml-1 px-1 rounded-[3px] text-[10px] leading-[14px] font-medium bg-[var(--bg-card)] text-[var(--sem-watch-fg)] border-[0.5px] border-[var(--sem-watch-bd)]"
      title={`MA Tight: 21/50EMA の開き ${SPREAD_MIN} ATR 未満（線が密集・もみ合い）`}
    >
      Tight
    </span>
  )
}
