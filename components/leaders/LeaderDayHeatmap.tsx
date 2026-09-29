'use client'

// ヒートマップ B: 銘柄 × 日 — 今のリーダーがいつから・どれくらい強いか。
// 行 = 表示日に t21 の一覧に入っている銘柄 (始まり・継続)。失速 (t63 だけ) の銘柄は
//      t21 で見ると右端まで空白の行になるだけなので出さない。
//      並びは一覧と同じ (t63 の一覧にいる銘柄を t63 の高い順、その後ろに t21 の高い順)。
// 行の右端 = t21 の 5 日比 (一覧と同じ色: +0.1 以上 緑 / −0.1 以下 赤 / それ以外・新規 灰)。
// 列 = 表示日までの直近 60 営業日 (テーブルにある日付)
// マス = その日の t21。t21 の一覧に入っていた日だけ塗る (行が無い日・一覧外の日は空白)
// 切り替えを無くすため、左に大型・右に中小を並べる。

import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchLiquidLeaderCells, type LiquidLeaderCell } from '@/lib/liquidLeadersFetch'
import {
  TIERS,
  byListOrder,
  diffColor,
  fmtDiff,
  tDiff,
  type LiquidLeader,
  type LiquidTier,
} from '@/types/liquidLeaders'
import { HEAT, HoverReadout, Swatch, monthTicks } from './heatmapUi'

const DAYS = 60

// t 値の 3 段: 〜3 / 3〜4 / 4 以上。一覧に入った後は最高値から 1 下がるまで残るので、
// 塗るマスでも 2 を割っていることがある (最も薄い段に含める)。
const T_COLORS = [HEAT[1], HEAT[2], HEAT[4]]
function tColor(t: number): string {
  return t >= 4 ? T_COLORS[2] : t >= 3 ? T_COLORS[1] : T_COLORS[0]
}

function fmtT(v: number | null | undefined): string {
  return v !== null && v !== undefined && Number.isFinite(v) ? v.toFixed(2) : '—'
}

type Hover = { code: string; date: string }

type Props = {
  /** 表示日の一覧 (全段) */
  rows: LiquidLeader[]
  /** テーブルにある全営業日 (降順) */
  dates: string[]
  selectedDate: string
  /** 5 営業日前の行 (code → row)。null = 比べる日が無い / undefined = 読み込み中 */
  prev: Map<string, LiquidLeader> | null | undefined
}

export default function LeaderDayHeatmap({ rows, dates, selectedDate, prev }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)

  // 表示日までの直近 60 営業日 (昇順)
  const cols = useMemo(() => {
    const i = dates.indexOf(selectedDate)
    if (i < 0) return []
    return dates.slice(i, i + DAYS).reverse()
  }, [dates, selectedDate])
  const from = cols[0] ?? ''

  const reqKey = `${from}|${selectedDate}`
  const [data, setData] = useState<{ key: string; rows: LiquidLeaderCell[]; error: string | null } | null>(null)
  useEffect(() => {
    if (!from) return
    let alive = true
    fetchLiquidLeaderCells(from, selectedDate).then(res => {
      if (alive) setData({ key: `${from}|${selectedDate}`, ...res })
    })
    return () => {
      alive = false
    }
  }, [from, selectedDate])
  const loading = !from || data?.key !== reqKey

  const cellMap = useMemo(() => {
    const m = new Map<string, LiquidLeaderCell>()
    if (loading || !data) return m
    for (const c of data.rows) m.set(`${c.code}|${c.date}`, c)
    return m
  }, [loading, data])

  const byTier = useMemo(() => {
    const pick = (t: LiquidTier) =>
      rows
        .filter(r => r.in_t21 === true && (t === 'large' ? r.tier === 'large' : r.tier !== 'large'))
        .sort(byListOrder)
    return { large: pick('large'), mid: pick('mid') }
  }, [rows])

  const ticks = useMemo(() => monthTicks(cols), [cols])
  const hoverCell = hover ? cellMap.get(`${hover.code}|${hover.date}`) : undefined
  const hoverRow = hover ? rows.find(r => r.code === hover.code) : undefined

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="mb-3">
        <p className="text-small font-medium text-[var(--text-primary)]">銘柄 × 日（t21 の一覧）</p>
        <p className="text-caption text-[var(--text-secondary)] mt-0.5">
          右端が薄くなってきた = 強さが落ちている ／ 左側が空白 = 最近入った（直近 {DAYS} 営業日。t21 の一覧に入っていた日だけ塗る。右端は t21 の 5 日比）
        </p>
      </div>

      <HoverReadout placeholder="マスにマウスを乗せると、日付・t21・t63 を表示">
        {hover && (
          <>
            <span className="text-[var(--text-primary)] font-medium">
              {hover.code} {hoverRow?.co_name ?? ''}
            </span>
            {'　'}{hover.date}
            {hoverCell ? (
              <>
                {'　'}t21 {fmtT(hoverCell.t21)}{hoverCell.in_t21 ? '（一覧）' : ''}
                {'　'}t63 {fmtT(hoverCell.t63)}{hoverCell.in_t63 ? '（一覧）' : ''}
              </>
            ) : (
              <>{'　'}どちらの一覧にも入っていない</>
            )}
          </>
        )}
      </HoverReadout>

      {data?.error && !loading && (
        <p className="text-caption text-[var(--sem-weak-fg)] py-2">取得に失敗しました: {data.error}</p>
      )}

      {loading ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">読み込み中…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5" onMouseLeave={() => setHover(null)}>
          {TIERS.map(t => (
            <TierGrid
              key={t.key}
              label={t.label}
              rows={byTier[t.key]}
              cols={cols}
              ticks={ticks}
              cellMap={cellMap}
              prev={prev}
              hover={hover}
              onHover={setHover}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-caption text-[var(--text-secondary)]">
        <span className="text-[var(--text-muted)]">t21 の値:</span>
        <Swatch color={T_COLORS[0]} label="〜3" />
        <Swatch color={T_COLORS[1]} label="3〜4" />
        <Swatch color={T_COLORS[2]} label="4 以上" />
        <Swatch color="transparent" label="一覧外 / 行なし" />
      </div>
    </section>
  )
}

function TierGrid({
  label,
  rows,
  cols,
  ticks,
  cellMap,
  prev,
  hover,
  onHover,
}: {
  label: string
  rows: LiquidLeader[]
  cols: string[]
  ticks: (string | null)[]
  cellMap: Map<string, LiquidLeaderCell>
  prev: Map<string, LiquidLeader> | null | undefined
  hover: Hover | null
  onHover: (h: Hover) => void
}) {
  const gridCols = `9rem repeat(${Math.max(cols.length, 1)}, minmax(4px, 1fr)) 3rem`
  return (
    <div className="min-w-0">
      <p className="text-caption font-medium text-[var(--text-secondary)] mb-1">
        {label} <span className="num text-[var(--text-muted)] font-normal">{rows.length} 銘柄</span>
      </p>
      {rows.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-4">該当なし</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: gridCols, minWidth: `calc(12rem + ${cols.length * 6}px)` }}
          >
            <div />
            {cols.map((d, i) => (
              <div key={d} className="h-4 text-caption text-[var(--text-muted)] whitespace-nowrap overflow-visible">
                {ticks[i]}
              </div>
            ))}
            <div />

            {rows.map(r => {
              const d = prev ? tDiff(r.t21, prev.get(r.code), 't21') : null
              const activeRow = hover?.code === r.code
              return (
                <Fragment key={r.code}>
                  <div
                    className={`text-caption truncate pr-2 leading-[13px] ${
                      activeRow ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
                    }`}
                    title={`${r.code} ${r.co_name ?? ''}`}
                  >
                    <span className="font-mono">{r.code}</span> {r.co_name ?? ''}
                  </div>
                  {cols.map(d => {
                    const c = cellMap.get(`${r.code}|${d}`)
                    const t = c?.in_t21 ? c.t21 : null
                    const painted = t !== null && Number.isFinite(t)
                    const isHover = activeRow && hover?.date === d
                    return (
                      <div
                        key={d}
                        onMouseEnter={() => onHover({ code: r.code, date: d })}
                        className="h-[13px] rounded-[2px]"
                        style={{
                          backgroundColor: painted ? tColor(t as number) : 'transparent',
                          boxShadow: isHover
                            ? 'inset 0 0 0 1px var(--text-secondary)'
                            : painted
                              ? undefined
                              : 'inset 0 0 0 0.5px var(--heat-grid)',
                        }}
                      />
                    )
                  })}
                  <div
                    className="text-caption num pl-1.5 leading-[13px] whitespace-nowrap"
                    style={{ color: diffColor(d) }}
                    title="t21 の 5 営業日前からの増減"
                  >
                    {prev === undefined ? '…' : fmtDiff(d)}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
