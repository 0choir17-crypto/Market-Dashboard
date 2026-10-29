'use client'

// Sector Board — 行 = 33 業種。今どの業種に資金が向いているかと、業種の中で強い銘柄を一目で見る。
//   左: 順位・業種名・RS≥80 の割合 (3 週前 / 3 か月前) と折れ線 (直近 63 営業日)
//   右: 全体RS が RS_MIN 以上の銘柄の札 (業種RS の降順)
//
// 割合 (pct_rs80) の母集団 (売買代金 1 億円以上の全銘柄) は rs_leaders の行 (ADR などで
// 絞った銘柄) より広い。そのため割合と、その業種に並ぶ札の数は一致しない。

import { useMemo, useState } from 'react'
import { Segmented } from '@/components/leaders/heatmapUi'
import {
  NEAR_ATR,
  RS_MIN,
  SECTOR_3W,
  nearestBelow,
  type RsLeader,
  type RsLeaderSector,
} from '@/types/rsLeaders'
import { ChipTooltip, RsChip, TierLegend, useChipTip } from './chipUi'

type Sort = 'rank' | 'pct'

type SectorRow = {
  code: string
  name: string
  rank: number | null
  pct: number | null
  pct3w: number | null
  pct3m: number | null
  series: (number | null)[]
}

function buildSectorRows(days: RsLeaderSector[]): SectorRow[] {
  const dates = [...new Set(days.map(r => r.date))].sort()
  if (dates.length === 0) return []
  const idx = new Map(dates.map((d, i) => [d, i]))
  const latest = dates[dates.length - 1]
  const bySector = new Map<string, SectorRow>()
  for (const r of days) {
    let s = bySector.get(r.sector_code)
    if (!s) {
      s = { code: r.sector_code, name: r.sector_s33, rank: null, pct: null, pct3w: null, pct3m: null, series: dates.map(() => null) }
      bySector.set(r.sector_code, s)
    }
    s.series[idx.get(r.date)!] = r.pct_rs80
    if (r.date === latest) {
      s.name = r.sector_s33
      s.rank = r.sector_rank
      s.pct = r.pct_rs80
    }
  }
  const i3w = dates.length - 1 - SECTOR_3W
  const rows = [...bySector.values()].filter(s => s.rank !== null || s.pct !== null) // 最新日に行のある業種
  for (const s of rows) {
    s.pct3w = i3w >= 0 ? s.series[i3w] : null
    s.pct3m = s.series.find(v => v !== null) ?? null
  }
  return rows
}

export default function SectorBoard({
  rows,
  sectorDays,
  sectorRank,
}: {
  rows: RsLeader[]
  sectorDays: RsLeaderSector[]
  sectorRank: Map<string, number>
}) {
  const [sort, setSort] = useState<Sort>('rank')
  const [nearOnly, setNearOnly] = useState(false)
  const { tip, onMove, onLeave } = useChipTip()

  const sectors = useMemo(() => buildSectorRows(sectorDays), [sectorDays])
  const sorted = useMemo(() => {
    const rk = (s: SectorRow) => s.rank ?? 99
    return [...sectors].sort(
      sort === 'rank'
        ? (a, b) => rk(a) - rk(b)
        : (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || rk(a) - rk(b),
    )
  }, [sectors, sort])

  const chipsBySector = useMemo(() => {
    const m = new Map<string, RsLeader[]>()
    for (const r of rows) {
      if ((r.rs_rating ?? 0) < RS_MIN || !r.sector_code) continue
      const a = m.get(r.sector_code) ?? []
      a.push(r)
      m.set(r.sector_code, a)
    }
    for (const a of m.values()) {
      a.sort((x, y) => (y.sector_rs ?? -1) - (x.sector_rs ?? -1) || (y.rs_rating ?? 0) - (x.rs_rating ?? 0))
    }
    return m
  }, [rows])

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-caption text-[var(--text-muted)]">Sort:</span>
        <Segmented
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { key: 'rank', label: 'Sector strength' },
            { key: 'pct', label: '% RS≥80' },
          ]}
        />
        <button
          onClick={() => setNearOnly(v => !v)}
          aria-pressed={nearOnly}
          className={`text-caption px-2 py-0.5 rounded-md border-[0.5px] transition-colors ${
            nearOnly
              ? 'border-[var(--sem-focus-bd)] bg-[var(--sem-focus-bg)] text-[var(--sem-focus-fg)] font-medium'
              : 'border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          Within {NEAR_ATR} ATR of MA
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-caption text-[var(--text-secondary)]">
        <TierLegend />
        <span>▾0.4 = すぐ下の移動平均線 (9/21/50EMA) まで 0.4ATR ({NEAR_ATR}ATR以内のみ)</span>
        <span>折れ線 = 同業のうちRS{RS_MIN}以上の割合 (直近3か月・目盛りは業種ごと)</span>
        <span className="text-[var(--text-muted)]">札をクリックで TradingView を開く</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">業種のデータがありません</p>
      ) : (
        <div>
          {sorted.map(s => {
            const chips = chipsBySector.get(s.code) ?? []
            return (
              <div
                key={s.code}
                className="grid grid-cols-1 sm:grid-cols-[290px_1fr] gap-x-3 gap-y-1.5 py-2 border-t-[0.5px] border-[var(--border)] items-start"
              >
                <div className="grid grid-cols-[22px_1fr] gap-x-1.5">
                  <span className="text-small text-right text-[var(--text-muted)] num">{s.rank ?? '—'}</span>
                  <span className="text-small font-medium text-[var(--text-primary)]">{s.name}</span>
                  <div className="col-start-2 flex flex-col items-start gap-0.5 text-caption text-[var(--text-secondary)]">
                    <span className="num">
                      RS≥{RS_MIN} <b className="text-[var(--text-primary)] font-medium">{fmtPct(s.pct)}</b>{' '}
                      <span className="text-[var(--text-muted)]">
                        (vs 3W ago {fmtPtDiff(s.pct, s.pct3w)} · vs 3M ago {fmtPtDiff(s.pct, s.pct3m)})
                      </span>
                    </span>
                    <Sparkline series={s.series} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 content-start">
                  {chips.length === 0 ? (
                    <span className="text-small text-[var(--text-muted)]">—</span>
                  ) : (
                    chips.map(r => {
                      const nb = nearestBelow(r)
                      const near = nb?.near === true
                      const dim = nearOnly && !near
                      return (
                        <RsChip
                          key={r.code}
                          row={r}
                          onMove={onMove}
                          onLeave={onLeave}
                          style={{ opacity: dim ? 0.18 : r.sector_ref_only ? 0.6 : undefined }}
                        >
                          {r.co_name ?? r.code}
                          <b className="ml-1 font-medium num opacity-85">{r.sector_rs ?? '—'}</b>
                          {near && <span className="ml-1 text-caption num opacity-90">▾{nb!.dist.toFixed(1)}</span>}
                        </RsChip>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ChipTooltip tip={tip} sectorRank={sectorRank} />
    </section>
  )
}

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(0)}%`
}

// 今の割合 − その日の割合 (ポイント差)。増えていれば +、減っていれば −
function fmtPtDiff(now: number | null, past: number | null): string {
  if (now === null || past === null) return '—'
  const d = Math.round(now) - Math.round(past)
  return d === 0 ? '±0pt' : `${d > 0 ? '+' : '−'}${Math.abs(d)}pt`
}

// pct_rs80 の折れ線。目盛りは業種ごと (その業種の最小〜最大。ただし最低 10pt 幅)。
function Sparkline({ series }: { series: (number | null)[] }) {
  const W = 150
  const H = 34
  const pts = series.map((v, i) => (v === null ? null : ([i, v] as const))).filter(p => p !== null)
  if (pts.length < 2) return <svg width={W} height={H} aria-hidden="true" />
  const vals = pts.map(p => p[1])
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi - lo < 10) {
    const m = (hi + lo) / 2
    lo = Math.max(0, m - 5)
    hi = lo + 10
  }
  const n = series.length
  const X = (i: number) => 26 + (i / (n - 1)) * (W - 32)
  const Y = (v: number) => H - 3 - ((v - lo) / (hi - lo)) * (H - 8)
  const line = pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const [li, lv] = pts[pts.length - 1]
  const area = `${X(pts[0][0]).toFixed(1)},${H - 3} ${line} ${X(li).toFixed(1)},${H - 3}`
  return (
    <svg width={W} height={H} aria-hidden="true" className="block">
      <polygon points={area} fill="var(--rs-line)" opacity={0.15} />
      <polyline points={line} fill="none" stroke="var(--rs-line)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={X(li)} cy={Y(lv)} r={2.5} fill="var(--rs-line)" />
      <text x={0} y={9} fontSize={9} fill="var(--text-muted)">{hi.toFixed(0)}%</text>
      <text x={0} y={H - 3} fontSize={9} fill="var(--text-muted)">{lo.toFixed(0)}%</text>
    </svg>
  )
}
