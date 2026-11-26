'use client'

// Theme Lines — テーマグループごとの小さな折れ線 (21d = 濃い線、63d = 同じ色の薄い線、126d = 同じ色の点線)。
// 縦軸 = n_stocks。「共通」= 全グラフで 0〜最大を揃え、テーマ間で量を比べる。
// 「個別」= グラフごとに自分の最小〜最大に合わせ、件数の少ないテーマでも増減の形が見えるようにする
// (1〜2 銘柄の揺れを大げさにしないよう、幅は最低 INDIV_MIN_SPAN 銘柄)。
// 並び = 今日の 21d の多い順 (同数は 63d → 126d の多い順)。表示期間に 21d / 63d / 126d のどれも一度も
// MINOR_THEME_MAX 以上にならなかったテーマは Minor themes に畳む。「その他」はその最後。
// 右上の切り替えで Heatmap 表示にもできる (初期は Lines)。

import { useMemo, useRef, useState } from 'react'
import { Segmented, monthTicks } from '@/components/leaders/heatmapUi'
import ChartTip, { spaceTicks } from './ChartTip'
import ThemeHeatmap from './ThemeHeatmap'
import { MINOR_THEME_MAX, OTHER_GROUP, themeColor, type RsPeriod, type ThemeGrid } from '@/types/rsThemes'

type View = 'lines' | 'heatmap'
type Scale = 'shared' | 'each'

type Series = {
  group: string
  order: number
  v21: number[]
  v63: number[]
  v126: number[]
  t21: number[]
  t63: number[]
  t126: number[]
  minor: boolean
}

const VB_W = 300
const VB_H = 100
const INDIV_MIN_SPAN = 4

type YRange = { lo: number; hi: number }

/** 個別の縦軸: そのテーマの最小〜最大。幅が INDIV_MIN_SPAN 未満なら上下に広げる (下限は 0 未満にしない)。 */
function ownRange(s: Series): YRange {
  const vals = [...s.v21, ...s.v63, ...s.v126]
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (!Number.isFinite(lo)) return { lo: 0, hi: 1 }
  const lack = INDIV_MIN_SPAN - (hi - lo)
  if (lack > 0) {
    lo = Math.max(0, lo - Math.ceil(lack / 2))
    hi = lo + INDIV_MIN_SPAN
  }
  return { lo, hi }
}

export default function ThemeLines({ grids }: { grids: Record<RsPeriod, ThemeGrid> }) {
  const [view, setView] = useState<View>('lines')
  const [scale, setScale] = useState<Scale>('shared')
  const [hoverI, setHoverI] = useState<number | null>(null)
  const [hoverGroup, setHoverGroup] = useState<string | null>(null)
  const [minorOpen, setMinorOpen] = useState(false)

  const g21 = grids[21]
  const g63 = grids[63]
  const g126 = grids[126]
  const dates = g21.dates
  const ticks = useMemo(() => spaceTicks(monthTicks(dates)), [dates])

  const { major, minor, yMax } = useMemo(() => {
    const t21 = dates.map(d => g21.totals.get(d) ?? 0)
    const t63 = dates.map(d => g63.totals.get(d) ?? 0)
    const t126 = dates.map(d => g126.totals.get(d) ?? 0)
    const all: Series[] = g21.groups.map(g => {
      const v21 = dates.map(d => g21.cells.get(`${g.name}|${d}`) ?? 0)
      const v63 = dates.map(d => g63.cells.get(`${g.name}|${d}`) ?? 0)
      const v126 = dates.map(d => g126.cells.get(`${g.name}|${d}`) ?? 0)
      const peak = Math.max(0, ...v21, ...v63, ...v126)
      return { group: g.name, order: g.order, v21, v63, v126, t21, t63, t126, minor: g.name === OTHER_GROUP || peak < MINOR_THEME_MAX }
    })
    const last = dates.length - 1
    const byToday = (a: Series, b: Series) =>
      (b.v21[last] ?? 0) - (a.v21[last] ?? 0) || (b.v63[last] ?? 0) - (a.v63[last] ?? 0) || (b.v126[last] ?? 0) - (a.v126[last] ?? 0) || a.order - b.order
    const major = all.filter(s => !s.minor).sort(byToday)
    const minor = all
      .filter(s => s.minor)
      .sort((a, b) => (a.group === OTHER_GROUP ? 1 : 0) - (b.group === OTHER_GROUP ? 1 : 0) || byToday(a, b))
    const peak = Math.max(1, ...all.flatMap(s => [...s.v21, ...s.v63, ...s.v126]))
    const yMax = Math.ceil(peak / 5) * 5
    return { major, minor, yMax }
  }, [g21, g63, g126, dates])

  const common = { dates, ticks, yMax, scale, hoverI, hoverGroup, onHover: (i: number | null, g: string | null) => { setHoverI(i); setHoverGroup(g) } }

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-small font-medium text-[var(--text-primary)]">{view === 'lines' ? 'Theme Lines' : 'Theme Heatmap'}</h2>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">
            {view === 'lines'
              ? `濃い線 = 21 日、薄い線 = 63 日、点線 = 126 日。21 日が先に上がればテーマの出始め、先に落ちれば勢いの落ち始め。${
                  scale === 'shared' ? '縦軸は全グラフ共通 (量を比べる)。' : '縦軸はグラフごと (形を見る。高さはテーマ間で比べられません)。'
                }1 銘柄が複数のテーマに入ることがあります。`
              : '色の濃さ = そのテーマに入る強い銘柄の数。上の灰色の棒はその日の対象銘柄数。1 銘柄が複数のテーマに入ることがあります。'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view === 'lines' && (
            <span className="flex items-center gap-3 text-caption text-[var(--text-secondary)]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-[2px] bg-[var(--text-secondary)]" />21d
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-[2px] bg-[var(--text-secondary)] opacity-40" />63d
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 border-t-2 border-dotted border-[var(--text-secondary)]" />126d
              </span>
            </span>
          )}
          {view === 'lines' && (
            <Segmented
              label="縦軸"
              value={scale}
              onChange={setScale}
              options={[
                { key: 'shared', label: '共通' },
                { key: 'each', label: '個別' },
              ]}
            />
          )}
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { key: 'lines', label: 'Lines' },
              { key: 'heatmap', label: 'Heatmap' },
            ]}
          />
        </div>
      </div>

      {view === 'heatmap' ? (
        <ThemeHeatmap grids={grids} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {major.map(s => (
              <SmallChart key={s.group} s={s} {...common} />
            ))}
          </div>

          {minor.length > 0 && (
            <div className="mt-4 border-t-[0.5px] border-[var(--border)] pt-3">
              <button
                onClick={() => setMinorOpen(o => !o)}
                aria-expanded={minorOpen}
                className="text-caption font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {minorOpen ? '▾' : '▸'} Minor themes ({minor.length})
                <span className="ml-2 font-normal text-[var(--text-muted)]">
                  直近 {dates.length} 営業日で 21d・63d・126d のどれも一度も {MINOR_THEME_MAX} 銘柄に届かなかったテーマ
                </span>
              </button>
              {minorOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
                  {minor.map(s => (
                    <SmallChart key={s.group} s={s} {...common} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function path(vals: number[], { lo, hi }: YRange): string {
  const n = vals.length
  if (n === 0) return ''
  const dx = n > 1 ? VB_W / (n - 1) : 0
  const span = hi - lo || 1
  return vals.map((v, i) => `${i ? 'L' : 'M'}${(i * dx).toFixed(2)},${(VB_H - ((v - lo) / span) * VB_H).toFixed(2)}`).join('')
}

function SmallChart({
  s,
  dates,
  ticks,
  yMax,
  scale,
  hoverI,
  hoverGroup,
  onHover,
}: {
  s: Series
  dates: string[]
  ticks: (string | null)[]
  yMax: number
  scale: Scale
  hoverI: number | null
  hoverGroup: string | null
  onHover: (i: number | null, g: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const color = themeColor(s.group)
  const n = dates.length
  const last = n - 1
  const xOf = (i: number) => (n > 1 ? i / (n - 1) : 0)
  const range = useMemo<YRange>(() => (scale === 'each' ? ownRange(s) : { lo: 0, hi: yMax }), [scale, s, yMax])

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || n === 0) return
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
    onHover(Math.round(f * (n - 1)), s.group)
  }

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="inline-block w-2.5 h-2.5 rounded-sm self-center" style={{ backgroundColor: color }} />
        <span className={`text-small font-medium truncate ${s.group === OTHER_GROUP ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
          {s.group}
        </span>
        <span className="ml-auto text-caption text-[var(--text-muted)] num whitespace-nowrap">
          21d <span className="text-[var(--text-primary)]">{s.v21[last] ?? 0}</span> / 63d{' '}
          <span className="text-[var(--text-primary)]">{s.v63[last] ?? 0}</span> / 126d{' '}
          <span className="text-[var(--text-primary)]">{s.v126[last] ?? 0}</span>
        </span>
      </div>

      <div className="relative" ref={ref} onMouseMove={onMove} onMouseLeave={() => onHover(null, null)}>
        <span className="absolute left-0.5 top-0 text-[10px] leading-none text-[var(--text-muted)] num">{range.hi}</span>
        {range.lo > 0 && (
          <span className="absolute left-0.5 bottom-0.5 text-[10px] leading-none text-[var(--text-muted)] num">{range.lo}</span>
        )}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="block w-full h-[84px] overflow-visible">
          {/* 目盛り: 上端 (最大) と底 */}
          <line x1={0} x2={VB_W} y1={0} y2={0} stroke="var(--border-subtle)" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={VB_W} y1={VB_H / 2} y2={VB_H / 2} stroke="var(--border-subtle)" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={VB_W} y1={VB_H} y2={VB_H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          <path d={path(s.v126, range)} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="1.5 3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path(s.v63, range)} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path(s.v21, range)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* 同じ日に縦線を全グラフで揃える */}
        {hoverI !== null && (
          <span className="absolute top-0 bottom-0 w-px bg-[var(--text-muted)] opacity-50 pointer-events-none" style={{ left: `${xOf(hoverI) * 100}%` }} />
        )}
        {hoverI !== null && hoverGroup === s.group && (
          <ChartTip x={xOf(hoverI)} top={0}>
            <div className="text-[var(--text-primary)] font-medium mb-0.5">{dates[hoverI]}</div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-[2px]" style={{ backgroundColor: color }} />
              21d <span className="ml-auto pl-3 text-[var(--text-primary)]">{s.v21[hoverI]} / {s.t21[hoverI]}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-[2px] opacity-40" style={{ backgroundColor: color }} />
              63d <span className="ml-auto pl-3 text-[var(--text-primary)]">{s.v63[hoverI]} / {s.t63[hoverI]}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t-2 border-dotted" style={{ borderColor: color }} />
              126d <span className="ml-auto pl-3 text-[var(--text-primary)]">{s.v126[hoverI]} / {s.t126[hoverI]}</span>
            </div>
          </ChartTip>
        )}
      </div>

      <div className="relative h-4 mt-0.5">
        {ticks.map((t, i) =>
          t ? (
            <span key={i} className="absolute text-[10px] text-[var(--text-muted)] whitespace-nowrap" style={{ left: `${xOf(i) * 100}%` }}>
              {t}
            </span>
          ) : null,
        )}
      </div>
    </div>
  )
}
