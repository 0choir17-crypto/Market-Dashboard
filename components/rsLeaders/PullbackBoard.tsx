'use client'

// Pullback Board — 強い銘柄が移動平均線までどれだけ押しているかで並べる。
// TradingView でチャートを確認する銘柄を絞るための画面。
//   対象: rs_rating ≥ RS_MIN
//   列 = 押しの段階 0〜5 + その下に「線が密集」(spread_21_50 < SPREAD_MIN。押しの段階は読まない)。
//   列の中は基準の線までの距離 (絶対値) が小さい順。

import { useMemo } from 'react'
import {
  MA_LINES,
  NEAR_ATR,
  RS_MIN,
  SPREAD_MIN,
  buildPullbackColumns,
  fmtSigned1,
  nearestBelow,
  type MaDists,
  type MaKey,
  type RsLeader,
} from '@/types/rsLeaders'
import { ChipTooltip, RsChip, TierLegend, useChipTip } from './chipUi'
import StageColumns from './StageColumns'

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

  const columns = useMemo(
    () => buildPullbackColumns(rows.filter(r => (r.rs_rating ?? 0) >= RS_MIN)),
    [rows],
  )
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
        線が密集している銘柄 (21/50EMA の開き {SPREAD_MIN}ATR 未満 = もみ合い) は押しの段階を読まず、下の「MA Tight」に置く (最も近い線の順)。
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-caption text-[var(--text-secondary)]">
        <TierLegend />
        <span className="text-[var(--text-muted)]">札をクリックで TradingView を開く</span>
      </div>

      <StageColumns
        columns={columns}
        renderChip={(r, bold) => (
          <RsChip row={r} onMove={onMove} onLeave={onLeave} className="block">
            <span className="flex items-baseline justify-between gap-1.5 min-w-0">
              <span className="truncate min-w-0">{r.co_name ?? r.code}</span>
              <b className="flex-none font-medium num opacity-85">{r.rs_rating ?? '—'}</b>
            </span>
            <Dists row={r} bold={bold} />
          </RsChip>
        )}
      />

      <ChipTooltip tip={tip} sectorRank={sectorRank} sectorRsChg={sectorRsChg} />
    </section>
  )
}

// 札の下段: 9+0.1  21+0.3  50+1.4  150+4.2 (線の名前は薄く) (太字 = 列の基準の線 / 緑 = すぐ下の線で NEAR_ATR 以内)
// Liquid Leaders の Pullback Board でも使う
export function Dists({ row, bold }: { row: MaDists; bold: MaKey | null }) {
  const nb = nearestBelow(row)
  const green = nb?.near ? nb.key : null
  return (
    <span className="mt-0.5 flex justify-between gap-1 rounded-[3px] bg-[var(--bg-card)] px-1 text-caption num whitespace-nowrap overflow-hidden text-[var(--text-primary)]">
      {MA_LINES(row).map(([k, v]) => (
        <span
          key={k}
          className={k === bold || k === green ? 'font-bold' : undefined}
          style={k === green ? { color: 'var(--positive)' } : undefined}
        >
          <span className="opacity-60">{k}</span>{fmtSigned1(v ?? null)}
        </span>
      ))}
    </span>
  )
}
