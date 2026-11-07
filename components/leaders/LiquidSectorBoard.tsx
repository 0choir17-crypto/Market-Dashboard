'use client'

// Liquid Leaders の Sector Board — RS Leaders の Sector Board と同じ並べ方。
//   行 = 33 業種。左: 業種名・業種の判定 (Market タブと同じ)・一覧の件数と「見込みとの差」・差の折れ線
//                 右: その業種で一覧に入っている銘柄の札
//   段 (大型 / 中小) は切り替え。入る線が違う 2 つの段を同じ並びに混ぜないため。
//
// 見込みとの差 = 業種 × 週ヒートマップと同じ計算 (その日の段全体の割合 × 業種の母数 との差)。
// 銘柄数の多い業種が偶然で上に来るのを防ぐ。
//
// 札:
//   塗り   = t63 の一覧にいる。数字 = t63。濃さ = 入る線 +1 以上 / 入る線以上 / 入る線未満 (出る線までの猶予で残っている)
//   枠だけ = t21 の一覧だけ (3 か月の先導にはまだ入っていない)。数字 = t21
//   ↑↓ = 5 営業日前からの t の増減 (±0.1 以上)。「新」= 5 営業日前は一覧にいなかった
//   T2.3× = Turnover 2.0× 以上 (商いが膨らんで入った銘柄。その後 3 か月の伸びは小さい傾向)

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { fetchLiquidSectorDays, type LiquidSectorDay } from '@/lib/liquidLeadersFetch'
import type { SectorTrendResult } from '@/lib/sectorTrendFetch'
import type { TrendState } from '@/lib/trendState'
import { tradingViewUrl } from '@/lib/tickerLinks'
import { SIGNAL_ORDER, SIGNAL_STYLE, TrendTag } from '@/components/market/trendAtoms'
import { TIER_STYLE } from '@/components/rsLeaders/chipUi'
import { Segmented } from './heatmapUi'
import {
  TIERS,
  byListOrder,
  diffColor,
  fmtDiff,
  tDiff,
  type LiquidLeader,
  type LiquidPeriod,
  type LiquidTier,
  type TDiff,
} from '@/types/liquidLeaders'

type Sort = 'ex63' | 'ex21' | 'trend' | 'count'

/** 折れ線の日数 (直近 63 営業日) */
const SPARK_DAYS = 63
/** 札に Turnover を出す下限 */
const TURNOVER_MARK = 2.0

const normName = (s: string) => s.replace(/･/g, '・').trim()

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null
}

type SectorStat = {
  name: string
  u: number
  n21: number
  n63: number
  ex21: number | null
  ex63: number | null
  /** t63 の見込みとの差の日次 (古い → 新しい) */
  series: (number | null)[]
}

// 日ごとに P = Σn ÷ Σu、差 = n − u × P (SectorWeekHeatmap と同じ)
function buildSectorStats(days: LiquidSectorDay[]): Map<string, SectorStat> {
  const dates = [...new Set(days.map(r => r.date))].sort().slice(-SPARK_DAYS)
  const out = new Map<string, SectorStat>()
  if (dates.length === 0) return out
  const idx = new Map(dates.map((d, i) => [d, i]))
  const latest = dates[dates.length - 1]
  const tot = new Map<string, { u: number; n21: number; n63: number }>()
  for (const r of days) {
    if (!idx.has(r.date)) continue
    const t = tot.get(r.date) ?? { u: 0, n21: 0, n63: 0 }
    t.u += r.n_universe ?? 0
    t.n21 += r.n_t21 ?? 0
    t.n63 += r.n_t63 ?? 0
    tot.set(r.date, t)
  }
  for (const r of days) {
    const i = idx.get(r.date)
    if (i === undefined) continue
    const name = normName(r.sector_s33)
    let s = out.get(name)
    if (!s) {
      s = { name, u: 0, n21: 0, n63: 0, ex21: null, ex63: null, series: dates.map(() => null) }
      out.set(name, s)
    }
    const u = r.n_universe ?? 0
    const t = tot.get(r.date)!
    if (u > 0 && t.u > 0) {
      s.series[i] = (r.n_t63 ?? 0) - u * (t.n63 / t.u)
    }
    if (r.date === latest) {
      s.u = u
      s.n21 = r.n_t21 ?? 0
      s.n63 = r.n_t63 ?? 0
      if (u > 0 && t.u > 0) {
        s.ex21 = s.n21 - u * (t.n21 / t.u)
        s.ex63 = s.n63 - u * (t.n63 / t.u)
      }
    }
  }
  return out
}

type Props = {
  rows: LiquidLeader[]
  prev: Map<string, LiquidLeader> | null | undefined
  /** 表示中の日付 (業種の件数・判定の終端) */
  endDate: string
  /** Market タブと同じ業種の判定。読み込み中は null */
  trends: SectorTrendResult | null
  query: string
}

export default function LiquidSectorBoard({ rows, prev, endDate, trends, query }: Props) {
  const [tier, setTier] = useState<LiquidTier>('large')
  const [sort, setSort] = useState<Sort>('ex63')
  const [hideEmpty, setHideEmpty] = useState(true)
  const [tip, setTip] = useState<{ row: LiquidLeader; x: number; y: number } | null>(null)
  const tierDef = TIERS.find(t => t.key === tier)!

  // 業種の件数 (両段をまとめて取得。要求キー付きで持ち、キーが違えば読み込み中)
  const [days, setDays] = useState<{
    key: string
    rows: Record<LiquidTier, LiquidSectorDay[]>
    error: string | null
  } | null>(null)
  useEffect(() => {
    let alive = true
    // 63 営業日 ≒ 13 週
    Promise.all([fetchLiquidSectorDays('large', endDate, 13), fetchLiquidSectorDays('mid', endDate, 13)]).then(
      ([l, m]) => {
        if (alive) setDays({ key: endDate, rows: { large: l.rows, mid: m.rows }, error: l.error ?? m.error })
      },
    )
    return () => {
      alive = false
    }
  }, [endDate])
  const daysLoading = days?.key !== endDate

  const stats = useMemo(
    () => buildSectorStats(daysLoading ? [] : days?.rows[tier] ?? []),
    [days, daysLoading, tier],
  )

  const chipsBySector = useMemo(() => {
    const m = new Map<string, LiquidLeader[]>()
    for (const r of rows) {
      const t = r.tier === 'large' ? 'large' : 'mid'
      if (t !== tier || !r.sector_s33) continue
      const k = normName(r.sector_s33)
      const a = m.get(k) ?? []
      a.push(r)
      m.set(k, a)
    }
    for (const a of m.values()) a.sort(byListOrder)
    return m
  }, [rows, tier])

  const trendByName = useMemo(() => {
    const m = new Map<string, TrendState | null>()
    for (const t of trends?.sectors ?? []) m.set(normName(t.sector), t.state)
    return m
  }, [trends])

  const sectors = useMemo(() => {
    const names = new Set<string>([...stats.keys(), ...chipsBySector.keys()])
    const list = [...names].map(name => ({
      name,
      stat: stats.get(name) ?? null,
      chips: chipsBySector.get(name) ?? [],
      trend: trendByName.get(name) ?? null,
    }))
    const ex = (s: (typeof list)[number], k: 'ex21' | 'ex63') => s.stat?.[k] ?? -Infinity
    const so = (s: (typeof list)[number]) => (s.trend ? SIGNAL_ORDER[s.trend.signal] : 3)
    const cmp: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      ex63: (a, b) => ex(b, 'ex63') - ex(a, 'ex63') || ex(b, 'ex21') - ex(a, 'ex21'),
      ex21: (a, b) => ex(b, 'ex21') - ex(a, 'ex21') || ex(b, 'ex63') - ex(a, 'ex63'),
      trend: (a, b) => so(a) - so(b) || ex(b, 'ex63') - ex(a, 'ex63'),
      count: (a, b) => b.chips.length - a.chips.length || ex(b, 'ex63') - ex(a, 'ex63'),
    }
    return list
      .filter(s => !hideEmpty || s.chips.length > 0)
      .sort((a, b) => cmp[sort](a, b) || a.name.localeCompare(b.name, 'ja'))
  }, [stats, chipsBySector, trendByName, sort, hideEmpty])

  const q = query.trim().toLowerCase()
  const matches = (r: LiquidLeader) =>
    !q || r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q)
  const nTier = useMemo(() => [...chipsBySector.values()].reduce((s, a) => s + a.length, 0), [chipsBySector])
  const onMove = (row: LiquidLeader, e: MouseEvent) => setTip({ row, x: e.clientX, y: e.clientY })

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented
          label="段"
          value={tier}
          onChange={setTier}
          options={TIERS.map(t => ({ key: t.key, label: t.label }))}
        />
        <span className="text-caption text-[var(--text-muted)]">{tierDef.hint}</span>
        <span className="text-caption text-[var(--text-muted)] num">{nTier} 銘柄</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-caption text-[var(--text-muted)]">Sort:</span>
        <Segmented
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { key: 'ex63', label: '見込みとの差 t63' },
            { key: 'ex21', label: '見込みとの差 t21' },
            { key: 'trend', label: 'Trend' },
            { key: 'count', label: '銘柄数' },
          ]}
        />
        <button
          onClick={() => setHideEmpty(v => !v)}
          aria-pressed={hideEmpty}
          className={`text-caption px-2 py-0.5 rounded-md border-[0.5px] transition-colors ${
            hideEmpty
              ? 'border-[var(--sem-focus-bd)] bg-[var(--sem-focus-bg)] text-[var(--sem-focus-fg)] font-medium'
              : 'border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          銘柄のある業種だけ
        </button>
      </div>

      <Legend enter={tierDef.enter} trends={trends} endDate={endDate} />
      {days?.error && !daysLoading && (
        <p className="text-caption text-[var(--sem-weak-fg)] mb-2">業種の件数を取得できませんでした: {days.error}</p>
      )}
      {trends?.error && (
        <p className="text-caption text-[var(--sem-weak-fg)] mb-2">業種の判定を取得できませんでした: {trends.error}</p>
      )}

      {sectors.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-8 text-center">この段に銘柄はありません</p>
      ) : (
        <div>
          {sectors.map(s => (
            <div
              key={s.name}
              className="grid grid-cols-1 sm:grid-cols-[290px_1fr] gap-x-3 gap-y-1.5 py-2 pl-1.5 border-t-[0.5px] border-l-4 border-t-[var(--border)] items-start"
              style={{ borderLeftColor: s.trend ? SIGNAL_STYLE[s.trend.signal].fg : 'transparent' }}
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-small font-medium text-[var(--text-primary)]">{s.name}</span>
                {s.trend && <TrendTag state={s.trend} />}
                <span className="text-caption text-[var(--text-secondary)] num">
                  t63 <b className="text-[var(--text-primary)] font-medium">{s.stat?.n63 ?? 0}</b>{' '}
                  <span className="text-[var(--text-muted)]">({fmtEx(s.stat?.ex63)})</span> · t21{' '}
                  <b className="text-[var(--text-primary)] font-medium">{s.stat?.n21 ?? 0}</b>{' '}
                  <span className="text-[var(--text-muted)]">({fmtEx(s.stat?.ex21)})</span> · 母数 {s.stat?.u ?? '—'}
                </span>
                {s.stat && <Sparkline series={s.stat.series} />}
              </div>
              <div className="flex flex-wrap gap-1 content-start">
                {s.chips.length === 0 ? (
                  <span className="text-small text-[var(--text-muted)]">—</span>
                ) : (
                  s.chips.map(r => (
                    <Chip
                      key={r.code}
                      row={r}
                      prev={prev}
                      enter={tierDef.enter}
                      dim={!matches(r)}
                      onMove={onMove}
                      onLeave={() => setTip(null)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tip && <Tooltip tip={tip} prev={prev} />}
    </section>
  )
}

function Legend({ enter, trends, endDate }: { enter: number; trends: SectorTrendResult | null; endDate: string }) {
  const e = enter.toFixed(1)
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-caption text-[var(--text-secondary)]">
      {([
        [1, `t63 ${(enter + 1).toFixed(1)} 以上`],
        [2, `t63 ${e}〜${(enter + 1).toFixed(1)}`],
        [3, `t63 ${e} 未満（出る線までの猶予）`],
      ] as const).map(([t, label]) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={TIER_STYLE[t]} />
          <span className="num">{label}</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm" style={OUTLINE} />
        <span>t21 の一覧だけ（数字 = t21）</span>
      </span>
      <span>↑↓ = 5 営業日前からの t の増減（±0.1 以上）· 新 = 5 営業日前は一覧にいない</span>
      <span>T2.3× = Turnover {TURNOVER_MARK.toFixed(1)}× 以上（商いが膨らんで入った銘柄）</span>
      <span>( ) = 業種の大きさから見込む件数との差 · 折れ線 = t63 の差（直近 3 か月）</span>
      <span>
        緑・黄・赤 = 業種指数の 9/21EMA の位置と向き（Market タブと同じ判定）
        {trends?.latestDate && trends.latestDate !== endDate && (
          <span className="text-[var(--sem-watch-fg)] num"> · 判定は {trends.latestDate} 時点</span>
        )}
      </span>
      <span className="text-[var(--text-muted)]">札をクリックで TradingView を開く</span>
    </div>
  )
}

const OUTLINE: CSSProperties = {
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  boxShadow: 'inset 0 0 0 1px var(--rs-t2-bg)',
}

function chipStyle(r: LiquidLeader, enter: number): CSSProperties {
  if (r.in_t63 !== true) return OUTLINE
  const v = num(r.t63) ?? -Infinity
  return TIER_STYLE[v >= enter + 1 ? 1 : v >= enter ? 2 : 3]
}

// ↑0.3 / ↓0.2 / 新 (±0.1 未満は出さない)
function shortDiff(d: TDiff): string {
  if (d === 'new') return '新'
  if (typeof d !== 'number') return ''
  if (d >= 0.1) return `↑${d.toFixed(1)}`
  if (d <= -0.1) return `↓${Math.abs(d).toFixed(1)}`
  return ''
}

function Chip({
  row,
  prev,
  enter,
  dim,
  onMove,
  onLeave,
}: {
  row: LiquidLeader
  prev: Map<string, LiquidLeader> | null | undefined
  enter: number
  dim: boolean
  onMove: (row: LiquidLeader, e: MouseEvent) => void
  onLeave: () => void
}) {
  const period: LiquidPeriod = row.in_t63 === true ? 't63' : 't21'
  const v = num(period === 't63' ? row.t63 : row.t21)
  const d = prev ? shortDiff(tDiff(v, prev.get(row.code), period)) : ''
  const turnover = num(row.va_trend)
  return (
    <a
      href={tradingViewUrl(row.code)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${row.code} ${row.co_name ?? ''} を TradingView で開く`}
      onMouseMove={e => onMove(row, e)}
      onMouseLeave={onLeave}
      className="rounded px-1.5 py-0.5 text-small whitespace-nowrap hover:brightness-110 transition-[filter,opacity]"
      style={{ ...chipStyle(row, enter), opacity: dim ? 0.18 : undefined }}
    >
      {row.co_name ?? row.code}
      <b className="ml-1 font-medium num opacity-85">{v !== null ? v.toFixed(1) : '—'}</b>
      {d && <span className="ml-0.5 text-caption num opacity-85">{d}</span>}
      {turnover !== null && turnover >= TURNOVER_MARK && (
        <span className="ml-1 text-caption num opacity-75">T{turnover.toFixed(1)}×</span>
      )}
    </a>
  )
}

function md(iso: string | null): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

function Tooltip({
  tip,
  prev,
}: {
  tip: { row: LiquidLeader; x: number; y: number }
  prev: Map<string, LiquidLeader> | null | undefined
}) {
  const r = tip.row
  const W = 300
  const left = typeof window !== 'undefined' ? Math.min(tip.x + 14, window.innerWidth - W - 8) : tip.x + 14
  const top = typeof window !== 'undefined' ? Math.min(tip.y + 14, window.innerHeight - 90) : tip.y + 14
  const tv = (p: LiquidPeriod) => {
    const v = num(p === 't21' ? r.t21 : r.t63)
    const d = prev ? tDiff(v, prev.get(r.code), p) : null
    const inList = (p === 't21' ? r.in_t21 : r.in_t63) === true
    return (
      <>
        {p}{' '}
        <b className={inList ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] font-normal'}>
          {v !== null ? v.toFixed(2) : '—'}
        </b>{' '}
        <span style={{ color: diffColor(d) }}>({prev === undefined ? '…' : fmtDiff(d)})</span>
      </>
    )
  }
  const turnover = num(r.va_trend)
  return (
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none rounded-md border-[0.5px] border-[var(--border-strong)] bg-[var(--bg-card)] shadow-md px-2.5 py-2 text-caption leading-relaxed num"
      style={{ left, top, maxWidth: W }}
    >
      <div className="text-small font-medium text-[var(--text-primary)]">
        <span className="font-mono">{r.code}</span> {r.co_name ?? ''}
      </div>
      <div className="text-[var(--text-secondary)]">
        {tv('t21')} / {tv('t63')}
      </div>
      <div className="text-[var(--text-secondary)]">
        Turnover {turnover !== null ? `${turnover.toFixed(2)}×` : '—'} · Since t21 {md(r.in_t21 ? r.t21_since : null)} · t63{' '}
        {md(r.in_t63 ? r.t63_since : null)}
      </div>
    </div>
  )
}

function fmtEx(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '差 —'
  const r = Math.round(v * 10) / 10
  return `差 ${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(1)}`
}

// t63 の見込みとの差の折れ線。0 の線を点線で引く。目盛りは業種ごと (最低 ±1 件幅)。
function Sparkline({ series }: { series: (number | null)[] }) {
  const W = 150
  const H = 34
  const pts = series.map((v, i) => (v === null ? null : ([i, v] as const))).filter(p => p !== null)
  if (pts.length < 2) return <svg width={W} height={H} aria-hidden="true" />
  const vals = pts.map(p => p[1])
  let lo = Math.min(0, ...vals)
  let hi = Math.max(0, ...vals)
  if (hi - lo < 2) {
    const m = (hi + lo) / 2
    lo = m - 1
    hi = m + 1
  }
  const n = series.length
  const X = (i: number) => 26 + (i / (n - 1)) * (W - 32)
  const Y = (v: number) => H - 3 - ((v - lo) / (hi - lo)) * (H - 8)
  const line = pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const [li, lv] = pts[pts.length - 1]
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`
  return (
    <svg width={W} height={H} aria-hidden="true" className="block">
      <line x1={26} x2={W - 6} y1={Y(0)} y2={Y(0)} stroke="var(--text-muted)" strokeWidth={0.75} strokeDasharray="2 2" />
      <polyline points={line} fill="none" stroke="var(--rs-line)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={X(li)} cy={Y(lv)} r={2.5} fill="var(--rs-line)" />
      <text x={0} y={9} fontSize={9} fill="var(--text-muted)">{fmt(hi)}</text>
      <text x={0} y={H - 3} fontSize={9} fill="var(--text-muted)">{fmt(lo)}</text>
    </svg>
  )
}
