'use client'

// ヒートマップ B: 銘柄 × 日 — 今のリーダーがいつから・どれくらい強いか。
// 行 = 表示日の一覧の銘柄 (段ごと。並びは一覧と同じ t63 の高い順、無ければ t21)
// 列 = 表示日までの直近 60 営業日 (テーブルにある日付)
// マス = その日の t 値。その期間の一覧に入っていた日だけ塗る (行が無い日・一覧外の日は空白)

import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchLiquidLeaderCells, type LiquidLeaderCell } from '@/lib/liquidLeadersFetch'
import { STATE_META, leaderState, type LiquidLeader, type LiquidTier } from '@/types/liquidLeaders'
import { HEAT, HoverReadout, Segmented, Swatch, monthTicks } from './heatmapUi'

type Period = 't21' | 't63'

const DAYS = 60

// t 値の 3 段: 〜3 / 3〜4 / 4 以上。一覧に入った後は最高値から 1 下がるまで残るので、
// 塗るマスでも 2 を割っていることがある (最も薄い段に含める)。
const T_COLORS = [HEAT[1], HEAT[2], HEAT[4]]
function tColor(t: number): string {
  return t >= 4 ? T_COLORS[2] : t >= 3 ? T_COLORS[1] : T_COLORS[0]
}

function num(v: number | null | undefined): number {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : -Infinity
}

function fmtT(v: number | null | undefined): string {
  return v !== null && v !== undefined && Number.isFinite(v) ? v.toFixed(2) : '—'
}

type Props = {
  /** 表示日の一覧 (全段) */
  rows: LiquidLeader[]
  /** テーブルにある全営業日 (降順) */
  dates: string[]
  selectedDate: string
}

export default function LeaderDayHeatmap({ rows, dates, selectedDate }: Props) {
  const [tier, setTier] = useState<LiquidTier>('mid')
  const [period, setPeriod] = useState<Period>('t21')
  const [hover, setHover] = useState<{ code: string; date: string } | null>(null)

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

  const tierRows = useMemo(
    () =>
      rows
        .filter(r => (tier === 'large' ? r.tier === 'large' : r.tier !== 'large'))
        .sort((a, b) => num(b.t63) - num(a.t63) || num(b.t21) - num(a.t21)),
    [rows, tier],
  )

  const ticks = useMemo(() => monthTicks(cols), [cols])
  const hoverCell = hover ? cellMap.get(`${hover.code}|${hover.date}`) : undefined
  const hoverRow = hover ? tierRows.find(r => r.code === hover.code) : undefined

  const gridCols = `11rem repeat(${Math.max(cols.length, 1)}, minmax(7px, 1fr)) 2.5rem`

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-small font-medium text-[var(--text-primary)]">銘柄 × 日</p>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">
            右端が薄くなってきた = 強さが落ちている ／ 左側が空白 = 最近入った（直近 {DAYS} 営業日。一覧に入っていた日だけ塗る）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="段"
            value={tier}
            onChange={setTier}
            options={[
              { key: 'large', label: '大型' },
              { key: 'mid', label: '中小' },
            ]}
          />
          <Segmented
            label="期間"
            value={period}
            onChange={setPeriod}
            options={[
              { key: 't21', label: 't21' },
              { key: 't63', label: 't63' },
            ]}
          />
        </div>
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
      ) : tierRows.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">この段の銘柄はありません</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: gridCols, minWidth: `calc(13.5rem + ${cols.length * 8}px)` }}
            onMouseLeave={() => setHover(null)}
          >
            <div />
            {cols.map((d, i) => (
              <div key={d} className="h-4 text-caption text-[var(--text-muted)] whitespace-nowrap overflow-visible">
                {ticks[i]}
              </div>
            ))}
            <div />

            {tierRows.map(r => {
              const s = leaderState(r)
              const activeRow = hover?.code === r.code
              return (
                <Fragment key={r.code}>
                  <div
                    className={`text-caption truncate pr-2 leading-[14px] ${
                      activeRow ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
                    }`}
                    title={`${r.code} ${r.co_name ?? ''}`}
                  >
                    <span className="font-mono">{r.code}</span> {r.co_name ?? ''}
                  </div>
                  {cols.map(d => {
                    const c = cellMap.get(`${r.code}|${d}`)
                    const inList = c ? (period === 't21' ? c.in_t21 : c.in_t63) === true : false
                    const t = c ? (period === 't21' ? c.t21 : c.t63) : null
                    const painted = inList && t !== null && Number.isFinite(t)
                    const isHover = activeRow && hover?.date === d
                    return (
                      <div
                        key={d}
                        onMouseEnter={() => setHover({ code: r.code, date: d })}
                        className="h-[14px] rounded-[2px]"
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
                  <div className="text-caption text-[var(--text-muted)] pl-1.5 leading-[14px] whitespace-nowrap">
                    {s ? STATE_META[s].label : ''}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-caption text-[var(--text-secondary)]">
        <span className="text-[var(--text-muted)]">{period} の値:</span>
        <Swatch color={T_COLORS[0]} label="〜3" />
        <Swatch color={T_COLORS[1]} label="3〜4" />
        <Swatch color={T_COLORS[2]} label="4 以上" />
        <Swatch color="transparent" label="一覧外 / 行なし" />
      </div>
    </section>
  )
}

