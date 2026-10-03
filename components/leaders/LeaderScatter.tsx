'use client'

// t63 × t21 の散布図 (段ごとに 1 枚)。
// 点 = 今日の位置 / 細い線 = 5 営業日前の位置からの動き / 点の大きさ = Turnover (va_trend)。
// Turnover は「大きい = 良い」ではない (高いほどその後 3 か月の伸びが小さい傾向) ので色は変えず、
// 面積だけで示す。大きい点を先に描き、小さい点が隠れないようにする。
// 斜線 t21 = t63 より上 = 直近 1 か月が 3 か月より強い、下 = 3 か月の先導に比べて直近が弱い。
// 塗りの点 = t63 の一覧にいる / 白抜き = t21 の一覧だけ。

import { useMemo, useState } from 'react'
import { TIERS, type LiquidLeader } from '@/types/liquidLeaders'
import { HoverReadout } from './heatmapUi'

const W = 520
const H = 340
const M = { l: 40, r: 16, t: 24, b: 34 }

type Pt = {
  r: LiquidLeader
  x: number
  y: number
  px: number | null
  py: number | null
}

// 面積 ∝ Turnover。1.0× (いつもどおり) で r 4.5、0.5×〜4× の外は端に寄せる。
const R1 = 4.5
function radius(va: number | null | undefined): number {
  const v = va !== null && va !== undefined && Number.isFinite(va) ? Math.min(4, Math.max(0.5, va)) : 1
  return R1 * Math.sqrt(v)
}

function fin(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number): string {
  const r = Math.round(v * 100) / 100
  return r === 0 ? '±0.00' : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}`
}

function Panel({
  rows,
  prev,
  label,
  enter,
}: {
  rows: LiquidLeader[]
  prev: Map<string, LiquidLeader> | null | undefined
  label: string
  enter: number
}) {
  const [hover, setHover] = useState<Pt | null>(null)

  const pts: Pt[] = useMemo(
    () =>
      rows
        .filter(r => fin(r.t21) && fin(r.t63))
        .map(r => {
          const p = prev?.get(r.code)
          const ok = p && fin(p.t21) && fin(p.t63)
          return { r, x: r.t63!, y: r.t21!, px: ok ? p.t63! : null, py: ok ? p.t21! : null }
        }),
    [rows, prev],
  )

  // 両軸とも同じ範囲 (斜線を 45° に保つ)
  const [lo, hi] = useMemo(() => {
    const vs = pts.flatMap(p => [p.x, p.y, p.px ?? p.x, p.py ?? p.y])
    const a = Math.min(0, ...vs)
    const b = Math.max(enter + 1, ...vs)
    return [Math.floor(a * 2) / 2, Math.ceil(b * 2) / 2]
  }, [pts, enter])

  const iw = W - M.l - M.r
  const ih = H - M.t - M.b
  const sx = (v: number) => M.l + ((v - lo) / (hi - lo)) * iw
  const sy = (v: number) => M.t + ih - ((v - lo) / (hi - lo)) * ih
  const ticks: number[] = []
  for (let v = Math.ceil(lo); v <= hi; v += 1) ticks.push(v)

  // 名前を出すのは斜線から最も離れた上下 2 銘柄ずつだけ (近すぎる 2 つ目は出さない)
  const labeled = useMemo(() => {
    const byGap = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
    const cand = [...byGap.slice(0, 2), ...byGap.slice(-2).reverse()]
    const out: Pt[] = []
    for (const p of cand) {
      if (out.every(q => Math.abs(q.y - p.y) > 0.25 || Math.abs(q.x - p.x) > 0.9)) out.push(p)
    }
    return new Set(out.map(p => p.r.code))
  }, [pts])

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const box = svg.getBoundingClientRect()
    const mx = ((e.clientX - box.left) / box.width) * W
    const my = ((e.clientY - box.top) / box.height) * H
    let best: Pt | null = null
    let bd = 18 * 18
    for (const p of pts) {
      const d = (sx(p.x) - mx) ** 2 + (sy(p.y) - my) ** 2
      if (d < bd) {
        bd = d
        best = p
      }
    }
    setHover(best)
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] p-4 min-w-0">
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-small font-medium text-[var(--text-primary)]">{label}</h3>
        <span className="text-caption text-[var(--text-muted)]">
          <span className="num">{pts.length}</span> 銘柄 · 入る線 {enter.toFixed(1)}
        </span>
      </div>
      <HoverReadout placeholder="点にマウスを乗せると、銘柄・t21・t63・5 日の動き・Turnover を表示">
        {hover && (
          <>
            <span className="font-mono">{hover.r.code}</span> {hover.r.co_name}
            {'　'}t21 <strong className="text-[var(--text-primary)]">{hover.y.toFixed(2)}</strong>
            {hover.py !== null && <span className="text-[var(--text-muted)]"> ({fmt(hover.y - hover.py)})</span>}
            {'　'}t63 <strong className="text-[var(--text-primary)]">{hover.x.toFixed(2)}</strong>
            {hover.px !== null && <span className="text-[var(--text-muted)]"> ({fmt(hover.x - hover.px)})</span>}
            {hover.px === null && <span className="text-[var(--text-muted)]">　新規</span>}
            {fin(hover.r.va_trend) && <>{'　'}Turnover {hover.r.va_trend.toFixed(2)}×</>}
          </>
        )}
      </HoverReadout>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${label}: t63 と t21 の散布図`}
      >
        {/* 目盛り */}
        {ticks.map(v => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={M.t} y2={M.t + ih} stroke="var(--heat-grid)" strokeWidth={1} />
            <line x1={M.l} x2={M.l + iw} y1={sy(v)} y2={sy(v)} stroke="var(--heat-grid)" strokeWidth={1} />
            <text x={sx(v)} y={H - M.b + 14} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{v}</text>
            <text x={M.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">{v}</text>
          </g>
        ))}
        <text x={M.l + iw} y={H - 4} textAnchor="end" fontSize={11} fill="var(--text-secondary)">t63 →</text>
        <text x={4} y={2} fontSize={11} fill="var(--text-secondary)" dominantBaseline="hanging">↑ t21</text>

        {/* 入る線 */}
        <line x1={sx(enter)} x2={sx(enter)} y1={M.t} y2={M.t + ih} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 3" />
        <line x1={M.l} x2={M.l + iw} y1={sy(enter)} y2={sy(enter)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 3" />

        {/* 斜線 t21 = t63 */}
        <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke="var(--text-muted)" strokeWidth={1} />
        <text x={sx(lo) + 8} y={sy(hi) + 18} fontSize={11} fill="var(--text-muted)">直近が強い（t21 &gt; t63）</text>
        <text x={sx(hi) - 8} y={sy(lo) - 8} textAnchor="end" fontSize={11} fill="var(--text-muted)">直近が弱い（t21 &lt; t63）</text>

        {/* 5 日の動き */}
        {pts.map(p =>
          p.px !== null && p.py !== null ? (
            <g key={`t${p.r.code}`} opacity={hover && hover.r.code !== p.r.code ? 0.25 : 1}>
              <line x1={sx(p.px)} y1={sy(p.py)} x2={sx(p.x)} y2={sy(p.y)} stroke="var(--text-muted)" strokeWidth={1.25} />
              <circle cx={sx(p.px)} cy={sy(p.py)} r={2} fill="var(--text-muted)" />
            </g>
          ) : null,
        )}

        {/* 今日の位置 */}
        {[...pts].sort((a, b) => radius(b.r.va_trend) - radius(a.r.va_trend)).map(p => {
          const on = p.r.in_t63 === true
          const dim = hover && hover.r.code !== p.r.code
          return (
            <circle
              key={p.r.code}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={radius(p.r.va_trend) + (hover?.r.code === p.r.code ? 1.5 : 0)}
              fill={on ? 'var(--sem-focus-fg)' : 'var(--bg-card)'}
              stroke={on ? 'var(--bg-card)' : 'var(--sem-focus-fg)'}
              strokeWidth={on ? 2 : 1.5}
              opacity={dim ? 0.35 : 1}
            />
          )
        })}

        {/* 選んだ数銘柄だけ名前 */}
        {pts.filter(p => labeled.has(p.r.code)).map(p => (
          <text key={`l${p.r.code}`} x={sx(p.x) + radius(p.r.va_trend) + 4} y={sy(p.y) + 4} fontSize={11} fill="var(--text-secondary)">
            {p.r.co_name ?? p.r.code}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-[var(--text-muted)] mt-1">
        <span className="flex items-center gap-1">
          <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--sem-focus-fg)" /></svg>t63 の一覧にいる
        </span>
        <span className="flex items-center gap-1">
          <svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--sem-focus-fg)" strokeWidth="1.5" /></svg>t21 の一覧だけ
        </span>
        <span className="flex items-center gap-1">
          大きさ = Turnover
          <svg width="58" height="20" aria-hidden>
            {[1, 2, 3].map((v, i) => (
              <circle key={v} cx={8 + i * 19} cy={10} r={radius(v)} fill="none" stroke="var(--text-muted)" strokeWidth={1} />
            ))}
          </svg>
          <span className="num">1× / 2× / 3×</span>
        </span>
        <span className="flex items-center gap-1">
          <svg width="22" height="10"><circle cx="3" cy="5" r="2" fill="var(--text-muted)" /><line x1="3" y1="5" x2="20" y2="5" stroke="var(--text-muted)" strokeWidth="1.25" /></svg>5 営業日前からの動き
        </span>
        <span className="flex items-center gap-1">
          <svg width="18" height="10"><line x1="0" y1="5" x2="18" y2="5" stroke="var(--text-muted)" strokeDasharray="2 3" /></svg>入る線
        </span>
      </div>
    </div>
  )
}

export default function LeaderScatter({
  rows,
  prev,
}: {
  rows: LiquidLeader[]
  prev: Map<string, LiquidLeader> | null | undefined
}) {
  return (
    <section>
      <h2 className="text-small font-medium text-[var(--text-primary)] mb-1">t63 × t21（直近の勢いと 3 か月の強さ）</h2>
      <p className="text-caption text-[var(--text-muted)] mb-2">
        斜線より上 = 直近 1 か月が 3 か月より強い ／ 下 = 3 か月の先導に比べて直近が弱い。線の根元が 5 営業日前の位置。点が大きい = Turnover が高い（商いが膨らんで入った。その後 3 か月の伸びは小さい傾向。大きい = 良い、ではない）。
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {TIERS.map(t => (
          <Panel
            key={t.key}
            rows={rows.filter(r => (r.tier === 'large' ? 'large' : 'mid') === t.key)}
            prev={prev}
            label={t.label}
            enter={t.enter}
          />
        ))}
      </div>
    </section>
  )
}
