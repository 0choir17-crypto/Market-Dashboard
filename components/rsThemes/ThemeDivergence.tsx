'use client'

// 21d vs 63d — 今日の 21 日と 63 日の銘柄数を、対象銘柄数に対する割合で横に並べる。
// n_total は期間ごとに違うので、件数ではなく割合 (n_stocks ÷ n_total) の差で判定する。
//   差 ≥ +DIVERGENCE_PT → Emerging (21 日で増えたが 63 日にはまだ少ない = 出始め)
//   差 ≤ −DIVERGENCE_PT → Fading   (63 日にはあるが 21 日で減った = 落ち始め)
// 「その他」(テーマなし) は判定しない。

import { useMemo } from 'react'
import { DIVERGENCE_PT, OTHER_GROUP, type RsPeriod, type ThemeGrid } from '@/types/rsThemes'

type State = 'emerging' | 'fading' | 'neutral'

type Row = {
  group: string
  order: number
  n21: number
  n63: number
  p21: number
  p63: number
  diff: number
  state: State
}

const STATE_STYLE: Record<State, { label: string; cls: string } | null> = {
  emerging: {
    label: 'Emerging',
    cls: 'border-[var(--sem-strong-bd)] bg-[var(--sem-strong-bg)] text-[var(--sem-strong-fg)]',
  },
  fading: {
    label: 'Fading',
    cls: 'border-[var(--sem-weak-bd)] bg-[var(--sem-weak-bg)] text-[var(--sem-weak-fg)]',
  },
  neutral: null,
}

export default function ThemeDivergence({ grids }: { grids: Record<RsPeriod, ThemeGrid> }) {
  const g21 = grids[21]
  const g63 = grids[63]
  const d21 = g21.dates[g21.dates.length - 1] ?? ''
  const d63 = g63.dates[g63.dates.length - 1] ?? ''
  const t21 = g21.totals.get(d21) ?? 0
  const t63 = g63.totals.get(d63) ?? 0

  const rows = useMemo(() => {
    const out: Row[] = g21.groups.map(g => {
      const n21 = g21.cells.get(`${g.name}|${d21}`) ?? 0
      const n63 = g63.cells.get(`${g.name}|${d63}`) ?? 0
      const p21 = t21 > 0 ? (n21 / t21) * 100 : 0
      const p63 = t63 > 0 ? (n63 / t63) * 100 : 0
      const diff = p21 - p63
      const state: State =
        g.name === OTHER_GROUP ? 'neutral' : diff >= DIVERGENCE_PT ? 'emerging' : diff <= -DIVERGENCE_PT ? 'fading' : 'neutral'
      return { group: g.name, order: g.order, n21, n63, p21, p63, diff, state }
    })
    // 差の大きい順 (Emerging が上、Fading が下)。その他は一番下
    return out.sort((a, b) => {
      const ao = a.group === OTHER_GROUP
      const bo = b.group === OTHER_GROUP
      if (ao !== bo) return ao ? 1 : -1
      return b.diff - a.diff || a.order - b.order
    })
  }, [g21, g63, d21, d63, t21, t63])

  const maxP = Math.max(1, ...rows.map(r => Math.max(r.p21, r.p63)))

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <div className="mb-3">
        <h2 className="text-small font-medium text-[var(--text-primary)]">21d vs 63d</h2>
        <p className="text-caption text-[var(--text-secondary)] mt-0.5">
          対象銘柄数に対する割合で比べる（21d 対象 <span className="num">{t21}</span> / 63d 対象{' '}
          <span className="num">{t63}</span>）。差が +{DIVERGENCE_PT}pt 以上は出始め、−{DIVERGENCE_PT}pt 以下は落ち始め。
        </p>
        <p className="text-caption text-[var(--text-muted)] mt-0.5">
          1 銘柄が複数のテーマに入るため、割合の合計は 100% になりません。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-caption text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-[var(--rs-t2-bg)]" />
          21d
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded-sm bg-[var(--rs-t3-bg)]" />
          63d
        </span>
        <span className="text-[var(--text-muted)]">Label: % (stocks / total)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="border-b-[0.5px] border-[var(--border)] text-caption text-[var(--text-muted)]">
              <th className="px-2.5 py-2 text-left font-normal">Theme</th>
              <th className="px-2.5 py-2 text-left font-normal w-full">21d / 63d</th>
              <th className="px-2.5 py-2 text-right font-normal whitespace-nowrap">Diff (pt)</th>
              <th className="px-2.5 py-2 text-left font-normal">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const st = STATE_STYLE[r.state]
              return (
                <tr key={r.group} className="border-b-[0.5px] border-[var(--border)] last:border-b-0">
                  <td className={`px-2.5 py-1.5 whitespace-nowrap ${r.group === OTHER_GROUP ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                    {r.group}
                  </td>
                  <td className="px-2.5 py-1.5 min-w-[14rem]">
                    <Bar pct={r.p21} n={r.n21} total={t21} max={maxP} color="var(--rs-t2-bg)" />
                    <Bar pct={r.p63} n={r.n63} total={t63} max={maxP} color="var(--rs-t3-bg)" />
                  </td>
                  <td className="px-2.5 py-1.5 text-right num text-[var(--text-primary)]">
                    {r.diff > 0 ? '+' : ''}
                    {r.diff.toFixed(1)}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {st && (
                      <span className={`text-caption px-1.5 py-0.5 rounded border-[0.5px] font-medium ${st.cls}`}>{st.label}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Bar({ pct, n, total, max, color }: { pct: number; n: number; total: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 h-[13px]">
      <div className="flex-1 h-[9px]">
        <div className="h-full rounded-[2px]" style={{ width: `${(pct / max) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="text-caption num text-[var(--text-secondary)] whitespace-nowrap w-[6.5rem] text-right">
        {pct.toFixed(1)}% ({n} / {total})
      </span>
    </div>
  )
}
