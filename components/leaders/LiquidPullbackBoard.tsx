'use client'

// Liquid Leaders の Pullback Board — RS Leaders の Pullback Board と同じ並べ方。
//   対象: 表示日の liquid_leaders の行のうち、選んだ段 (大型 / 中小) かつ spread_21_50 ≥ SPREAD_MIN
//         (線が密集している銘柄は押しの段階が読めないので Sector Board で見る)
//   列 = 押しの段階 0〜4 (RS Leaders と同じ判定 pullbackStage)。列の中は基準の線までの距離 (絶対値) が小さい順。
//   距離の列 (d_ema*) は 2026-11 に liquid_leaders へ追加。定義は rs_leaders と同じ。
//   距離が無い行 (追加前の日付・EMA の足りない銘柄) は件数だけ出す。

import { useMemo, useState } from 'react'
import { Dists } from '@/components/rsLeaders/PullbackBoard'
import { NEAR_ATR, SPREAD_MIN, STAGES, pullbackStage } from '@/types/rsLeaders'
import { TIERS, type LiquidLeader, type LiquidTier } from '@/types/liquidLeaders'
import { Segmented } from './heatmapUi'
import { ChipHead, LiquidChip, LiquidLegend, LiquidTooltip, useLiquidTip, type Prev } from './liquidChipUi'

type Props = {
  rows: LiquidLeader[]
  prev: Prev
  query: string
}

function hasDists(r: LiquidLeader): boolean {
  return [r.d_ema9, r.d_ema21, r.d_ema50, r.d_ema9_weekly].every(v => v !== null && v !== undefined && Number.isFinite(v))
}

export default function LiquidPullbackBoard({ rows, prev, query }: Props) {
  const [tier, setTier] = useState<LiquidTier>('large')
  const { tip, onMove, onLeave } = useLiquidTip()
  const tierDef = TIERS.find(t => t.key === tier)!

  const { columns, nTier, noDist, tight } = useMemo(() => {
    const cols: LiquidLeader[][] = STAGES.map(() => [])
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
      cols[pullbackStage(r)].push(r)
    }
    cols.forEach((c, k) => {
      const d = (r: LiquidLeader) => Math.abs(STAGES[k].dist(r) ?? Infinity)
      c.sort((a, b) => d(a) - d(b))
    })
    return { columns: cols, nTier, noDist, tight }
  }, [rows, tier])
  const total = columns.reduce((s, c) => s + c.length, 0)

  const q = query.trim().toLowerCase()
  const matches = (r: LiquidLeader) =>
    !q || r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q)

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Segmented
          label="段"
          value={tier}
          onChange={setTier}
          options={TIERS.map(t => ({ key: t.key, label: t.label }))}
        />
        <span className="text-caption text-[var(--text-muted)]">{tierDef.hint}</span>
        <span className="text-caption text-[var(--text-muted)] num">
          {total} / {nTier} 銘柄
          {tight > 0 && ` · 線が密集 ${tight}`}
          {noDist > 0 && ` · 距離のデータなし ${noDist}`}
        </span>
      </div>
      <p className="text-caption text-[var(--text-secondary)] mb-2 leading-relaxed">
        列 = 終値が上から順にどの移動平均線の上にいるか。列の中は基準の線に近い順。
        札の下段 = 終値が各線から何ATR上か (マイナスは線の下)。太字 = その列の基準の線。
        <span className="text-[var(--positive)] font-medium">緑</span> = すぐ下の線で、{NEAR_ATR}ATR以内。
        線が密集している銘柄 (線の開き {SPREAD_MIN} 未満) はここには出さない。
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-caption text-[var(--text-secondary)]">
        <LiquidLegend enter={tierDef.enter} />
        <span className="text-[var(--text-muted)]">札をクリックで TradingView を開く</span>
      </div>

      {noDist > 0 && noDist === nTier ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">
          この日の行には移動平均線までの距離（d_ema9 など）がありません。liquid_leaders に距離の列が入った日から表示されます。
        </p>
      ) : (
        // 列の幅は銘柄数に比例させ、列の中は札を幅 190px 前後で折り返す (RS Leaders と同じ)
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
                        enter={tierDef.enter}
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
      )}

      <LiquidTooltip tip={tip} prev={prev} />
    </section>
  )
}
