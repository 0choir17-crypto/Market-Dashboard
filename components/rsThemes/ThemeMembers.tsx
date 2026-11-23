'use client'

// Today's Members — 最新日の rs_themes_members をグループごとにまとめて、21d と 63d を横に並べる。
// 1 銘柄は最大 3 グループに入るので、同じ銘柄が複数のグループに出る。
// グループは銘柄数の多い順 (同数は group_order 順)、グループ内は Return % の大きい順。

import { useMemo } from 'react'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'
import { pnlColorClass } from '@/lib/format'
import { PERIODS, type RsPeriod, type RsThemeMember, type ThemeGrid } from '@/types/rsThemes'

export default function ThemeMembers({
  members,
  grids,
}: {
  members: RsThemeMember[]
  grids: Record<RsPeriod, ThemeGrid>
}) {
  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <h2 className="text-small font-medium text-[var(--text-primary)]">Today&apos;s Members</h2>
      <p className="text-caption text-[var(--text-secondary)] mt-0.5 mb-3">
        今日の対象銘柄をテーマ別に。1 銘柄が複数のグループに出ることがある。コード → TradingView / 銘柄名 → 四季報
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {PERIODS.map(p => (
          <MembersTable key={p.key} period={p.key} label={p.label} members={members} grid={grids[p.key]} />
        ))}
      </div>
    </section>
  )
}

function MembersTable({
  period,
  label,
  members,
  grid,
}: {
  period: RsPeriod
  label: string
  members: RsThemeMember[]
  grid: ThemeGrid
}) {
  const { sections, nStocks } = useMemo(() => {
    const order = new Map(grid.groups.map(g => [g.name, g.order]))
    const byGroup = new Map<string, RsThemeMember[]>()
    let nStocks = 0
    for (const m of members) {
      if (m.period !== period) continue
      nStocks++
      for (const g of m.theme_groups ?? []) {
        const list = byGroup.get(g) ?? []
        list.push(m)
        byGroup.set(g, list)
      }
    }
    const sections = [...byGroup]
      .map(([group, list]) => ({
        group,
        order: order.get(group) ?? 99,
        list: list.sort((a, b) => (b.ret_pct ?? -Infinity) - (a.ret_pct ?? -Infinity)),
      }))
      .sort((a, b) => b.list.length - a.list.length || a.order - b.order)
    return { sections, nStocks }
  }, [members, grid, period])

  return (
    <div className="min-w-0">
      <p className="text-small font-medium text-[var(--text-primary)] mb-1">
        {label}
        <span className="ml-2 text-caption font-normal text-[var(--text-muted)] num">{nStocks} stocks</span>
      </p>
      {sections.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-6 text-center">No members</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="border-b-[0.5px] border-[var(--border)] text-caption text-[var(--text-muted)]">
                <th className="px-2 py-2 text-left font-normal">Code</th>
                <th className="px-2 py-2 text-left font-normal">Name</th>
                <th className="px-2 py-2 text-right font-normal">RS</th>
                <th className="px-2 py-2 text-right font-normal whitespace-nowrap">Return %</th>
                <th className="px-2 py-2 text-left font-normal">Themes</th>
              </tr>
            </thead>
            {sections.map(s => (
              <tbody key={s.group}>
                <tr className="bg-[var(--bg-card-hover)] border-b-[0.5px] border-[var(--border)]">
                  <td colSpan={5} className="px-2 py-1.5 text-small font-medium text-[var(--text-primary)]">
                    {s.group}
                    <span className="ml-2 text-caption font-normal text-[var(--text-muted)] num">{s.list.length}</span>
                  </td>
                </tr>
                {s.list.map(m => (
                  <tr key={`${s.group}|${m.code}`} className="border-b-[0.5px] border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                    <td className="px-2 py-1.5">
                      <a
                        href={tradingViewUrl(m.code)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline"
                        title={`${m.code}（TradingView を開く）`}
                      >
                        {m.code}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 max-w-[11rem]">
                      <a
                        href={shikihoUrl(m.code)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[var(--text-secondary)] hover:text-[var(--sem-focus-fg)] hover:underline"
                        title={`${m.co_name ?? '—'}（四季報を開く）`}
                      >
                        {m.co_name ?? '—'}
                      </a>
                    </td>
                    <td className="px-2 py-1.5 text-right num text-[var(--text-primary)]">{m.rs ?? '—'}</td>
                    <td className={`px-2 py-1.5 text-right num ${pnlColorClass(m.ret_pct)}`}>
                      {m.ret_pct == null ? '—' : `${m.ret_pct > 0 ? '+' : ''}${m.ret_pct.toFixed(1)}`}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {[m.theme1, m.theme2, m.theme3].filter((t): t is string => !!t).map((t, i) => (
                          <span
                            key={`${t}-${i}`}
                            className={`text-caption px-1.5 py-px rounded border-[0.5px] border-[var(--sem-idle-bd)] bg-[var(--sem-idle-bg)] whitespace-nowrap ${
                              i === 0 ? 'text-[var(--text-primary)]' : 'text-[var(--sem-idle-fg)]'
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  )
}
