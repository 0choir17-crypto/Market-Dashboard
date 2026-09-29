'use client'

import { useMemo } from 'react'
import {
  STATE_META,
  leaderState,
  type LiquidLeader,
} from '@/types/liquidLeaders'
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 'YYYY-MM-DD' → 'YY/M/D'（1 年分の履歴があるので年も要る）
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y.slice(2)}/${parseInt(m, 10)}/${parseInt(d, 10)}`
}

// 状態の印（1 行に 1 つだけ）。列は増やさず、銘柄セルの頭に置く。
function StateMark({ row }: { row: LiquidLeader }) {
  const s = leaderState(row)
  if (!s) return <span className="inline-block w-3" />
  const m = STATE_META[s]
  return (
    <span
      className="inline-block w-3 text-center text-caption flex-shrink-0"
      style={{ color: `var(--sem-${m.tone}-fg)` }}
      title={`${m.label}: ${m.hint}`}
      aria-label={m.label}
    >
      {m.icon}
    </span>
  )
}

// t 値: 2 以上が「強い」。一覧に入っていない側の値は薄く出す。
function TCell({ value, inList }: { value: number | null; inList: boolean | null }) {
  if (!isNum(value)) return <span className="text-[var(--sem-idle-fg)]">—</span>
  return (
    <span
      className="num"
      style={{
        color: inList ? 'var(--text-primary)' : 'var(--text-muted)',
        fontWeight: inList ? 500 : 400,
      }}
    >
      {value.toFixed(2)}
    </span>
  )
}

// in_t21 / in_t63 の印: 入っている方だけ塗る。
function ListMarks({ row }: { row: LiquidLeader }) {
  const chip = (on: boolean | null, label: string) => (
    <span
      className="inline-block min-w-[26px] text-center px-1.5 py-0.5 rounded text-caption num"
      style={
        on
          ? { backgroundColor: 'var(--sem-ok-bg)', color: 'var(--sem-ok-fg)' }
          : { color: 'var(--sem-idle-bd)' }
      }
      title={on ? `t${label} の一覧に入っている` : `t${label} の一覧には入っていない`}
    >
      {label}
    </span>
  )
  return (
    <span className="inline-flex gap-1">
      {chip(row.in_t21, '21')}
      {chip(row.in_t63, '63')}
    </span>
  )
}

function SinceCell({ row }: { row: LiquidLeader }) {
  const items: [string, string | null][] = [
    ['21', row.in_t21 ? row.t21_since : null],
    ['63', row.in_t63 ? row.t63_since : null],
  ]
  return (
    <span className="inline-flex flex-col gap-0.5 text-caption num text-[var(--text-secondary)]">
      {items.map(([k, d]) =>
        d ? (
          <span key={k} title={`t${k} の一覧に入った日: ${d}`}>
            <span className="text-[var(--text-muted)]">{k}:</span> {shortDate(d)}
          </span>
        ) : null,
      )}
    </span>
  )
}

// t63 の高い順。t63 が無い行は末尾に回り (DataTable は NULL を末尾に置く)、
// そこでは t21 の高い順に並ぶ。
function byT21Desc(a: LiquidLeader, b: LiquidLeader): number {
  const av = isNum(a.t21) ? a.t21 : -Infinity
  const bv = isNum(b.t21) ? b.t21 : -Infinity
  return bv - av
}

type Props = {
  rows: LiquidLeader[]
  title: string
  hint: string
  query: string
}

export default function LiquidLeadersTable({ rows, title, hint, query }: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r => r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const columns: Column<LiquidLeader>[] = useMemo(
    () => [
      {
        key: 'code',
        label: 'Code / Name',
        tooltip: '頭の印 = 状態（▲始まり / ●継続 / ▼失速）。コード → TradingView / 銘柄名 → 四季報',
        align: 'left',
        value: r => r.code,
        defaultDir: 'asc',
        render: r => (
          <div className="flex items-baseline gap-1.5 min-w-0">
            <StateMark row={r} />
            <TickerCell code={r.code} name={r.co_name} />
          </div>
        ),
      },
      {
        key: 'sector_s33',
        label: '業種',
        tooltip: '東証 33 業種（五十音順ソート）',
        align: 'left',
        value: r => r.sector_s33,
        defaultDir: 'asc',
        render: r => (
          <span className="text-small text-[var(--text-secondary)]">{r.sector_s33 ?? '—'}</span>
        ),
      },
      {
        key: 't21',
        label: 't21',
        tooltip: '自力の t 値（直近 21 日）。TOPIX につられた分を除いた強さが毎日どれだけ安定しているか。2 以上で強い',
        align: 'right',
        value: r => r.t21,
        className: 'w-20',
        render: r => <TCell value={r.t21} inList={r.in_t21} />,
      },
      {
        key: 't63',
        label: 't63',
        tooltip: '同・直近 63 日',
        align: 'right',
        value: r => r.t63,
        className: 'w-20',
        render: r => <TCell value={r.t63} inList={r.in_t63} />,
      },
      {
        key: 'lists',
        label: '一覧',
        tooltip: 't21 / t63 のどちらの一覧に入っているか（塗り = 入っている）',
        align: 'center',
        sortable: false,
        className: 'w-24',
        render: r => <ListMarks row={r} />,
      },
      {
        key: 'since',
        label: '入った日',
        tooltip: '今回その一覧に入った日（t21_since / t63_since）。並べ替えは早い方の日付',
        align: 'left',
        value: r => {
          const ds = [r.in_t21 ? r.t21_since : null, r.in_t63 ? r.t63_since : null].filter(
            (d): d is string => !!d,
          )
          return ds.length ? ds.sort()[0] : null
        },
        className: 'w-28',
        render: r => <SinceCell row={r} />,
      },
    ],
    [],
  )

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <h2 className="text-small font-medium text-[var(--text-primary)]">{title}</h2>
        <span className="text-caption text-[var(--text-muted)]">{hint}</span>
        <span className="ml-auto text-caption text-[var(--text-muted)]">
          <span className="num">{filtered.length}</span> 銘柄
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] py-10 text-center text-[var(--text-muted)] text-small">
          {query ? `「${query}」に一致する銘柄はありません` : 'この日の該当銘柄はありません'}
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.code}
          defaultSort={{ key: 't63', dir: 'desc' }}
          tieBreak={byT21Desc}
          summaryToggle={false}
        />
      )}
    </section>
  )
}
