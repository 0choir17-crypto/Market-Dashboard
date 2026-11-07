'use client'

// Liquid Leaders の Pullback Board — RS Leaders の Pullback Board と同じ並べ方。
//   大型・中小を上下に並べる。対象: 表示日の liquid_leaders の行のうち spread_21_50 ≥ SPREAD_MIN
//         (線が密集している銘柄は押しの段階が読めないので Sector Board で見る)
//   列 = 押しの段階 0〜4 (RS Leaders と同じ判定 pullbackStage)。列の中は基準の線までの距離 (絶対値) が小さい順。
//   距離の列 (d_ema*) は 2026-11 に liquid_leaders へ追加。定義は rs_leaders と同じ。
//   距離が無い行 (追加前の日付・EMA の足りない銘柄) は件数だけ出す。

import { useMemo, type MouseEvent } from 'react'
import { Dists } from '@/components/rsLeaders/PullbackBoard'
import { NEAR_ATR, SPREAD_MIN, STAGES, pullbackStage } from '@/types/rsLeaders'
import { TIERS, type LiquidLeader, type LiquidTier } from '@/types/liquidLeaders'
import { ChipHead, LiquidChip, LiquidLegend, LiquidTooltip, useLiquidTip, type Prev } from './liquidChipUi'

type Props = {
  rows: LiquidLeader[]
  prev: Prev
  query: string
}

function hasDists(r: LiquidLeader): boolean {
  return [r.d_ema9, r.d_ema21, r.d_ema50, r.d_ema9_weekly].every(v => v !== null && v !== undefined && Number.isFinite(v))
}

type TierData = { columns: LiquidLeader[][]; nTier: number; noDist: number; tight: number }

function buildTier(rows: LiquidLeader[], tier: LiquidTier): TierData {
  const columns: LiquidLeader[][] = STAGES.map(() => [])
  let nTier = 0
  let noDist = 0
  let tight = 0
  for (const r of rows) {
    if ((r.tier === 'large' ? 'large' : 'mid') !== tier) continue
    nTier++
    if (!hasDists(r)) {
      noDist++
      continue
    }
    if (r.spread_21_50 === null || r.spread_21_50 === undefined || r.spread_21_50 < SPREAD_MIN) {
      tight++
      continue
    }
    columns[pullbackStage(r)].push(r)
  }
  columns.forEach((c, k) => {
    const d = (r: LiquidLeader) => Math.abs(STAGES[k].dist(r) ?? Infinity)
    c.sort((a, b) => d(a) - d(b))
  })
  return { columns, nTier, noDist, tight }
}

// 大型・中小を上下に並べる (切り替えなしで両方見る)。札の濃さの基準 (入る線) は段ごと。
export default function LiquidPullbackBoard({ rows, prev, query }: Props) {
  const { tip, onMove, onLeave } = useLiquidTip()
  const data = useMemo(
    () => ({ large: buildTier(rows, 'large'), mid: buildTier(rows, 'mid') }),
    [rows],
  )
  const noDistAll = TIERS.every(t => data[t.key].nTier > 0 && data[t.key].noDist === data[t.key].nTier)

  const q = query.trim().toLowerCase()
  const matches = (r: LiquidLeader) =>
    !q || r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q)

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <p className="text-caption text-[var(--text-secondary)] mb-2 leading-relaxed">
        列 = 終値が上から順にどの移動平均線の上にいるか。列の中は基準の線に近い順。
        札の下段 = 終値が各線から何ATR上か (マイナスは線の下)。太字 = その列の基準の線。
        <span className="text-[var(--positive)] font-medium">緑</span> = すぐ下の線で、{NEAR_ATR}ATR以内。
        線が密集している銘柄 (線の開き {SPREAD_MIN} 未満) はここには出さない。
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-caption text-[var(--text-secondary)]">
        <LiquidLegend />
        <span className="text-[var(--text-muted)]">札をクリックで TradingView を開く</span>
      </div>

      {noDistAll ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">
          この日の行には移動平均線までの距離（d_ema9 など）がありません。liquid_leaders に距離の列が入った日から表示されます。
        </p>
      ) : (
        <div className="space-y-5">
          {TIERS.map(t => {
            const d = data[t.key]
            const total = d.columns.reduce((s, c) => s + c.length, 0)
            return (
              <div key={t.key}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                  <h3 className="text-small font-medium text-[var(--text-primary)]">{t.label}</h3>
                  <span className="text-caption text-[var(--text-muted)]">{t.hint}</span>
                  <span className="text-caption text-[var(--text-muted)] num">
                    {total} / {d.nTier} 銘柄
                    {d.tight > 0 && ` · 線が密集 ${d.tight}`}
                    {d.noDist > 0 && ` · 距離のデータなし ${d.noDist}`}
                  </span>
                </div>
                <StageColumns
                  columns={d.columns}
                  enter={t.enter}
                  prev={prev}
                  matches={matches}
                  onMove={onMove}
                  onLeave={onLeave}
                />
              </div>
            )
          })}
        </div>
      )}

      <LiquidTooltip tip={tip} prev={prev} />
    </section>
  )
}

// 列の幅は銘柄数に比例させ、列の中は札を幅 190px 前後で折り返す (RS Leaders と同じ)
function StageColumns({
  columns,
  enter,
  prev,
  matches,
  onMove,
  onLeave,
}: {
  columns: LiquidLeader[][]
  enter: number
  prev: Prev
  matches: (r: LiquidLeader) => boolean
  onMove: (row: LiquidLeader, e: MouseEvent) => void
  onLeave: () => void
}) {
  return (
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
                  <LiquidChip
                    key={r.code}
                    row={r}
                    enter={enter}
                    dim={!matches(r)}
                    onMove={onMove}
                    onLeave={onLeave}
                    className="block"
                  >
                    <span className="flex items-baseline justify-between gap-1.5 min-w-0">
                      <ChipHead row={r} prev={prev} />
                    </span>
                    <Dists row={r} bold={st.bold} />
                  </LiquidChip>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
