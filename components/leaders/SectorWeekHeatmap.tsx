'use client'

// ヒートマップ A: 業種 × 週 — 資金がどの業種に向いているか / いつ始まり、いつ終わったか。
//
// 濃淡は件数そのものではなく「業種の大きさから見込む件数との差」で付ける。
// 銘柄数の多い業種 (電気機器など) が偶然で濃く見えるのを防ぐため。
//   日ごと・段ごとに  P      = Σ n_tX ÷ Σ n_universe   (Σ はその日その段の全業種)
//                    exp    = n_universe × P
//                    excess = n_tX − exp
//   週の値 = その週の日次 excess の平均 (n_universe > 0 の日だけ)
// 比 (n ÷ exp) は使わない。母数 1〜3 銘柄の業種で暴れるため。

import { useEffect, useMemo, useState } from 'react'
import { fetchLiquidSectorDays, type LiquidSectorDay } from '@/lib/liquidLeadersFetch'
import { TOPIX33_FALLBACK } from '@/lib/sectorNames'
import type { LiquidTier } from '@/types/liquidLeaders'
import { HEAT, HoverReadout, Segmented, Swatch, monthTicks } from './heatmapUi'

type Period = 't21' | 't63'
type Order = 'latest' | 'fixed'

const WEEKS = 52
// 差 (件) の段階。0 以下は塗らない。
const STEPS = [0.5, 1, 2, 4] as const

function level(excess: number): number {
  if (!(excess > 0)) return 0
  let i = 0
  while (i < STEPS.length && excess > STEPS[i]) i++
  return i + 1 // 1..5
}

function isoMonday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay()
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow))
  return dt.toISOString().slice(0, 10)
}

type Cell = {
  excess: number // 週平均
  n: number      // 一覧の件数 (週平均)
  exp: number    // 見込み件数 (週平均)
  u: number      // 母数 (週平均)
}

function buildMatrix(rows: LiquidSectorDay[], period: Period) {
  const key = period === 't21' ? 'n_t21' : 'n_t63'

  // 日ごとの段全体の割合 P
  const tot = new Map<string, { n: number; u: number }>()
  for (const r of rows) {
    const t = tot.get(r.date) ?? { n: 0, u: 0 }
    t.n += r[key] ?? 0
    t.u += r.n_universe ?? 0
    tot.set(r.date, t)
  }

  // (sector, week) ごとに日次値を積む
  type Acc = { ex: number; n: number; exp: number; u: number; days: number }
  const acc = new Map<string, Acc>()
  const weekSet = new Set<string>()
  const sectorSet = new Set<string>()
  for (const r of rows) {
    const w = isoMonday(r.date)
    weekSet.add(w)
    sectorSet.add(r.sector_s33)
    const u = r.n_universe ?? 0
    if (u <= 0) continue
    const t = tot.get(r.date)!
    const p = t.u > 0 ? t.n / t.u : 0
    const exp = u * p
    const n = r[key] ?? 0
    const k = `${r.sector_s33}|${w}`
    const a = acc.get(k) ?? { ex: 0, n: 0, exp: 0, u: 0, days: 0 }
    a.ex += n - exp
    a.n += n
    a.exp += exp
    a.u += u
    a.days += 1
    acc.set(k, a)
  }

  const weeks = [...weekSet].sort().slice(-WEEKS)
  const cells = new Map<string, Cell>()
  for (const [k, a] of acc) {
    cells.set(k, { excess: a.ex / a.days, n: a.n / a.days, exp: a.exp / a.days, u: a.u / a.days })
  }
  return { weeks, sectors: [...sectorSet], cells }
}

type Props = {
  /** ヒートマップの右端の日付 (= 表示中の日付) */
  endDate: string
}

export default function SectorWeekHeatmap({ endDate }: Props) {
  const [tier, setTier] = useState<LiquidTier>('mid')
  const [period, setPeriod] = useState<Period>('t63')
  const [order, setOrder] = useState<Order>('latest')
  const [hover, setHover] = useState<{ sector: string; week: string } | null>(null)

  // 取得結果は要求キー付きで持つ。キーが今の要求と違えば「読み込み中」。
  const reqKey = `${tier}|${endDate}`
  const [data, setData] = useState<{ key: string; rows: LiquidSectorDay[]; error: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    fetchLiquidSectorDays(tier, endDate, WEEKS).then(res => {
      if (alive) setData({ key: `${tier}|${endDate}`, ...res })
    })
    return () => {
      alive = false
    }
  }, [tier, endDate])
  const loading = data?.key !== reqKey
  const rows = useMemo(() => (loading ? [] : data?.rows ?? []), [loading, data])

  const { weeks, sectors, cells } = useMemo(() => buildMatrix(rows, period), [rows, period])

  const orderedSectors = useMemo(() => {
    if (order === 'fixed') {
      const idx = new Map(TOPIX33_FALLBACK.map((s, i) => [s, i]))
      return [...sectors].sort((a, b) => (idx.get(a) ?? 99) - (idx.get(b) ?? 99) || a.localeCompare(b, 'ja'))
    }
    const last = weeks[weeks.length - 1]
    const v = (s: string) => cells.get(`${s}|${last}`)?.excess ?? -Infinity
    return [...sectors].sort((a, b) => v(b) - v(a) || a.localeCompare(b, 'ja'))
  }, [order, sectors, weeks, cells])

  const ticks = useMemo(() => monthTicks(weeks), [weeks])
  const hoverCell = hover ? cells.get(`${hover.sector}|${hover.week}`) : undefined

  const gridCols = `9rem repeat(${Math.max(weeks.length, 1)}, minmax(9px, 1fr))`

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-small font-medium text-[var(--text-primary)]">業種 × 週</p>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">
            濃いほど、業種の大きさから見込むより多く一覧に入っている（直近 {WEEKS} 週・日次の差の週平均）
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
          <Segmented
            label="並び"
            value={order}
            onChange={setOrder}
            options={[
              { key: 'latest', label: '直近の差順' },
              { key: 'fixed', label: '業種順' },
            ]}
          />
        </div>
      </div>

      <HoverReadout placeholder="マスにマウスを乗せると、週・件数・見込み・母数を表示">
        {hover &&
          (hoverCell ? (
            <>
              <span className="text-[var(--text-primary)] font-medium">{hover.sector}</span>
              {'　'}週 {hover.week}〜{'　'}一覧 {hoverCell.n.toFixed(1)} 件（平均）{'　'}見込み{' '}
              {hoverCell.exp.toFixed(1)} 件{'　'}差 {hoverCell.excess >= 0 ? '+' : ''}
              {hoverCell.excess.toFixed(1)}{'　'}母数 {hoverCell.u.toFixed(0)}
            </>
          ) : (
            <>
              <span className="text-[var(--text-primary)] font-medium">{hover.sector}</span>
              {'　'}週 {hover.week}〜{'　'}母数 0（この段に銘柄なし）
            </>
          ))}
      </HoverReadout>

      {data?.error && !loading && (
        <p className="text-caption text-[var(--sem-weak-fg)] py-2">取得に失敗しました: {data.error}</p>
      )}

      {loading ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">読み込み中…</p>
      ) : weeks.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">データがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: gridCols, minWidth: `calc(9rem + ${weeks.length * 10}px)` }}
            onMouseLeave={() => setHover(null)}
          >
            {/* 月の見出し */}
            <div />
            {weeks.map((w, i) => (
              <div key={w} className="h-4 text-caption text-[var(--text-muted)] whitespace-nowrap overflow-visible">
                {ticks[i]}
              </div>
            ))}

            {orderedSectors.map(s => (
              <Row
                key={s}
                sector={s}
                weeks={weeks}
                cells={cells}
                hover={hover}
                onHover={setHover}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-caption text-[var(--text-secondary)]">
        <span className="text-[var(--text-muted)]">見込みとの差（件）:</span>
        <Swatch color="transparent" label="0 以下" />
        <Swatch color={HEAT[0]} label="〜0.5" />
        <Swatch color={HEAT[1]} label="〜1" />
        <Swatch color={HEAT[2]} label="〜2" />
        <Swatch color={HEAT[3]} label="〜4" />
        <Swatch color={HEAT[4]} label="4 超" />
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm heat-hatch" />
          <span>母数 0</span>
        </span>
      </div>
    </section>
  )
}

function Row({
  sector,
  weeks,
  cells,
  hover,
  onHover,
}: {
  sector: string
  weeks: string[]
  cells: Map<string, Cell>
  hover: { sector: string; week: string } | null
  onHover: (h: { sector: string; week: string }) => void
}) {
  const active = hover?.sector === sector
  return (
    <>
      <div
        className={`text-caption text-right pr-2 truncate leading-[14px] ${
          active ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
        }`}
        title={sector}
      >
        {sector}
      </div>
      {weeks.map(w => {
        const c = cells.get(`${sector}|${w}`)
        const lv = c ? level(c.excess) : 0
        return (
          <div
            key={w}
            onMouseEnter={() => onHover({ sector, week: w })}
            className={`h-[14px] rounded-[2px] ${c ? '' : 'heat-hatch'}`}
            style={
              c
                ? {
                    backgroundColor: lv > 0 ? HEAT[lv - 1] : 'transparent',
                    boxShadow:
                      hover?.sector === sector && hover.week === w
                        ? 'inset 0 0 0 1px var(--text-secondary)'
                        : lv === 0
                          ? 'inset 0 0 0 0.5px var(--heat-grid)'
                          : undefined,
                  }
                : undefined
            }
          />
        )
      })}
    </>
  )
}
