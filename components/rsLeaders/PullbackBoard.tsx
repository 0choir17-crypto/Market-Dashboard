'use client'

// Pullback Board — 強い銘柄が移動平均線までどれだけ押しているかで並べる。
// TradingView でチャートを確認する銘柄を絞るための画面。
//   対象: rs_rating ≥ RS_MIN かつ spread_21_50 ≥ SPREAD_MIN (線が密集している銘柄は Sector Board で見る)
//   列 = 押しの段階 0〜4。列の中は基準の線までの距離 (絶対値) が小さい順。

import { useMemo } from 'react'
import {
  NEAR_ATR,
  RS_MIN,
  SPREAD_MIN,
  STAGES,
  fmtSigned1,
  nearestBelow,
  pullbackStage,
  type MaKey,
  type RsLeader,
} from '@/types/rsLeaders'
import { ChipTooltip, RsChip, TierLegend, useChipTip } from './chipUi'

export default function PullbackBoard({
  rows,
  sectorRank,
  sectorRsChg,
}: {
  rows: RsLeader[]
  sectorRank: Map<string, number>
  sectorRsChg: Map<string, number>
}) {
  const { tip, onMove, onLeave } = useChipTip()

  const columns = useMemo(() => {
    const cols: RsLeader[][] = STAGES.map(() => [])
    for (const r of rows) {
      if ((r.rs_rating ?? 0) < RS_MIN) continue
      if (r.spread_21_50 === null || r.spread_21_50 < SPREAD_MIN) continue
      cols[pullbackStage(r)].push(r)
    }
    cols.forEach((c, k) => {
      const d = (r: RsLeader) => Math.abs(STAGES[k].dist(r) ?? Infinity)
      c.sort((a, b) => d(a) - d(b))
    })
    return cols
  }, [rows])
  const total = columns.reduce((s, c) => s + c.length, 0)

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <p className="text-small font-medium text-[var(--text-primary)]">Pullback Board</p>
        <span className="text-caption text-[var(--text-muted)] num">{total} stocks</span>
      </div>
      <p className="text-caption text-[var(--text-secondary)] mb-2 leading-relaxed">
        列 = 終値が上から順にどの移動平均線の上にいるか。列の中は基準の線に近い順。札の右 = 全体RS。
        札の下段 = 終値が各線から何ATR上か (マイナスは線の下)。太字 = その列の基準の線。
        <span className="text-[var(--positive)] font-medium">緑</span> = すぐ下の線で、{NEAR_ATR}ATR以内。
        線が密集している銘柄 (線の開き {SPREAD_MIN} 未満) はここには出さない。
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-caption text-[var(--text-secondary)]">
        <TierLegend />
        <span className="text-[var(--text-muted)]">札をクリックで TradingView を開く</span>
      </div>

      {/* 列の幅は銘柄数に比例させ、列の中は札を幅 190px 前後で折り返す。
          札の多い列だけが縦に長く伸びず、画面の幅を使い切って列の高さが揃う。 */}
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {STAGES.map((st, k) => {
          const items = columns[k]
          const empty = items.length === 0
          return (
            <div
              key={st.title}
              className={`rounded-lg bg-[var(--bg-primary)] p-2 ${empty ? 'flex-[0_0_110px] opacity-60' : 'min-w-[206px]'}`}
              style={empty ? undefined : { flex: `${items.length} 1 0` }}
            >
              <p className="text-small font-medium text-[var(--text-primary)]">
                {st.title} <span className="num text-[var(--text-muted)] font-normal">({items.length})</span>
              </p>
              <p className="text-caption text-[var(--text-secondary)] mb-1.5">
                {st.desc}・基準 {st.line}
              </p>
              <div className={empty ? '' : 'grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-1'}>
                {empty ? (
                  <span className="text-small text-[var(--text-muted)]">—</span>
                ) : (
                  items.map(r => (
                    <RsChip key={r.code} row={r} onMove={onMove} onLeave={onLeave} className="block">
                      <span className="flex items-baseline justify-between gap-1.5 min-w-0">
                        <span className="truncate min-w-0">{r.co_name ?? r.code}</span>
                        <b className="flex-none font-medium num opacity-85">{r.rs_rating ?? '—'}</b>
                      </span>
                      <Dists row={r} bold={st.bold} />
                    </RsChip>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <ChipTooltip tip={tip} sectorRank={sectorRank} sectorRsChg={sectorRsChg} />
    </section>
  )
}

// 札の下段: 9: +0.1  21: +0.3  50: +1.4 (太字 = 列の基準の線 / 緑 = すぐ下の線で NEAR_ATR 以内)
function Dists({ row, bold }: { row: RsLeader; bold: MaKey | null }) {
  const nb = nearestBelow(row)
  const green = nb?.near ? nb.key : null
  return (
    <span className="mt-0.5 flex gap-2 rounded-[3px] bg-[var(--bg-card)] px-1 text-caption num whitespace-nowrap overflow-hidden text-[var(--text-primary)]">
      {([
        ['9', row.d_ema9],
        ['21', row.d_ema21],
        ['50', row.d_ema50],
      ] as const).map(([k, v]) => (
        <span
          key={k}
          className={k === bold || k === green ? 'font-bold' : undefined}
          style={k === green ? { color: 'var(--positive)' } : undefined}
        >
          {k}: {fmtSigned1(v)}
        </span>
      ))}
    </span>
  )
}
