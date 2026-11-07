'use client'

// Pullback Board の列 (RS Leaders / Liquid Leaders 共通)。
// 列 = 押しの段階 (STAGES)。その下に横いっぱいで「線が密集」(TIGHT_STAGE)。
// 列の幅は銘柄数に比例させ、列の中は札を幅 196px 前後で折り返す。
// 札の多い列だけが縦に長く伸びず、画面の幅を使い切って列の高さが揃う。

import type { ReactNode } from 'react'
import { STAGES, TIGHT_STAGE, type MaKey } from '@/types/rsLeaders'

export default function StageColumns<T extends { code: string }>({
  columns,
  renderChip,
}: {
  /** buildPullbackColumns の結果 */
  columns: T[][]
  /** bold = その列の基準の線 (札の下段で太字にする) */
  renderChip: (row: T, bold: MaKey | null) => ReactNode
}) {
  const tight = columns[STAGES.length] ?? []
  return (
    <div className="space-y-2.5">
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

      {/* 線が密集している銘柄は押しの段階を読まないので、段階の列とは分けて下に横いっぱいで置く */}
      <div className="rounded-lg p-2 bg-[var(--bg-primary)] border-[0.5px] border-dashed border-[var(--border-strong)]">
        <p className="text-small font-medium text-[var(--text-primary)]">
          {TIGHT_STAGE.title} <span className="num text-[var(--text-muted)] font-normal">({tight.length})</span>
          <span className="ml-2 text-caption font-normal text-[var(--text-secondary)]">{TIGHT_STAGE.desc}</span>
        </p>
        <div className={tight.length === 0 ? 'mt-1' : 'mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-1'}>
          {tight.length === 0 ? (
            <span className="text-small text-[var(--text-muted)]">—</span>
          ) : (
            tight.map(r => <div key={r.code}>{renderChip(r, null)}</div>)
          )}
        </div>
      </div>
    </div>
  )
}
