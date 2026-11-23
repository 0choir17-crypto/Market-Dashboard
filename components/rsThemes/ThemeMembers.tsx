'use client'

// Today's Members — 最新日の rs_themes_members を、テーマ 1 行 × 左右 (21d / 63d) のチップで並べる。
// 同じテーマが左右で同じ高さに来るので、「21d から抜けた」「21d に入ってきたばかり」が片側の空きで見える。
// 行の並び = 21d の銘柄数の多い順 (同数は 63d の多い順 → group_order)。チップは騰落率の大きい順。
// 1 銘柄は最大 3 グループに入るので、同じ銘柄が複数の行に出る。
// 細かいテーマ (theme1〜3) と RS はチップのツールチップに出す。

import { useMemo } from 'react'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'
import { pnlColorClass } from '@/lib/format'
import { OTHER_GROUP, PERIODS, type RsPeriod, type RsThemeMember, type ThemeGrid } from '@/types/rsThemes'

type Row = { group: string; order: number; byPeriod: Record<RsPeriod, RsThemeMember[]> }

export default function ThemeMembers({
  members,
  grids,
}: {
  members: RsThemeMember[]
  grids: Record<RsPeriod, ThemeGrid>
}) {
  const { rows, counts } = useMemo(() => {
    const order = new Map(grids[21].groups.map(g => [g.name, g.order]))
    const map = new Map<string, Row>()
    const counts: Record<RsPeriod, number> = { 21: 0, 63: 0 }
    for (const m of members) {
      counts[m.period]++
      for (const g of new Set(m.theme_groups ?? [])) {
        const r = map.get(g) ?? { group: g, order: order.get(g) ?? 99, byPeriod: { 21: [], 63: [] } }
        r.byPeriod[m.period].push(m)
        map.set(g, r)
      }
    }
    const byRet = (a: RsThemeMember, b: RsThemeMember) => (b.ret_pct ?? -Infinity) - (a.ret_pct ?? -Infinity)
    const rows = [...map.values()]
    for (const r of rows) for (const p of PERIODS) r.byPeriod[p.key].sort(byRet)
    rows.sort(
      (a, b) =>
        (a.group === OTHER_GROUP ? 1 : 0) - (b.group === OTHER_GROUP ? 1 : 0) ||
        b.byPeriod[21].length - a.byPeriod[21].length ||
        b.byPeriod[63].length - a.byPeriod[63].length ||
        a.order - b.order,
    )
    return { rows, counts }
  }, [members, grids])

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      <h2 className="text-small font-medium text-[var(--text-primary)]">Today&apos;s Members</h2>
      <p className="text-caption text-[var(--text-secondary)] mt-0.5 mb-3">
        今日の対象銘柄をテーマ別に、21 日と 63 日を左右に並べる。片側だけにあるテーマは出始め・落ち始めの候補。
        1 銘柄が複数のテーマに出ることがある。コード → TradingView / 銘柄名 → 四季報（チップにマウスを乗せると RS と細かいテーマ）
      </p>

      {rows.length === 0 ? (
        <p className="text-caption text-[var(--text-muted)] py-6 text-center">No members</p>
      ) : (
        <div className="text-small">
          {/* 見出し (md 以上) */}
          <div className="hidden md:grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 border-b-[0.5px] border-[var(--border)] pb-2 text-caption text-[var(--text-muted)]">
            <div>Theme</div>
            {PERIODS.map(p => (
              <div key={p.key}>
                <span className="font-medium text-[var(--text-secondary)]">{p.label}</span>
                <span className="ml-1.5 num">{counts[p.key]} stocks</span>
              </div>
            ))}
          </div>

          {rows.map(r => (
            <div
              key={r.group}
              className="grid grid-cols-1 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-1.5 py-2.5 border-b-[0.5px] border-[var(--border)] last:border-b-0"
            >
              <div className={`font-medium ${r.group === OTHER_GROUP ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                {r.group}
              </div>
              {PERIODS.map(p => {
                const list = r.byPeriod[p.key]
                return (
                  <div key={p.key} className="min-w-0 flex items-start gap-2">
                    {/* 件数は左の固定幅の列。チップが折り返しても件数の下に回り込まない */}
                    <span className="text-caption text-[var(--text-muted)] num shrink-0 w-6 leading-[22px] text-right">
                      <span className="md:hidden">{p.label} </span>
                      <span className={list.length ? 'text-[var(--text-primary)] font-medium' : ''}>{list.length}</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
                      {list.length === 0 ? (
                        <span className="text-caption text-[var(--sem-idle-fg)] leading-[22px]">—</span>
                      ) : (
                        list.map(m => <Chip key={m.code} m={m} />)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Chip({ m }: { m: RsThemeMember }) {
  const themes = [m.theme1, m.theme2, m.theme3].filter(Boolean).join(' / ')
  const tip = `RS ${m.rs ?? '—'}${themes ? ` · ${themes}` : ''}`
  return (
    <span
      title={tip}
      className="inline-flex items-baseline gap-1.5 max-w-full rounded-md border-[0.5px] border-[var(--border-strong)] px-1.5 py-0.5 hover:bg-[var(--bg-card-hover)]"
    >
      <a
        href={tradingViewUrl(m.code)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-caption font-medium text-[var(--sem-focus-fg)] hover:underline"
        title={`${m.code}（TradingView を開く）· ${tip}`}
      >
        {m.code}
      </a>
      <a
        href={shikihoUrl(m.code)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-caption text-[var(--text-secondary)] hover:text-[var(--sem-focus-fg)] hover:underline truncate max-w-[9rem]"
        title={`${m.co_name ?? '—'}（四季報を開く）· ${tip}`}
      >
        {m.co_name ?? '—'}
      </a>
      <span className={`text-caption num ${pnlColorClass(m.ret_pct)}`}>
        {m.ret_pct == null ? '—' : `${m.ret_pct > 0 ? '+' : ''}${m.ret_pct.toFixed(1)}`}
      </span>
    </span>
  )
}
