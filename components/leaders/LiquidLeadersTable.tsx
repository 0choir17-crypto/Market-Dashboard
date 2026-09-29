'use client'

// 1 段 × 1 期間 (t21 か t63) の一覧。段ごとに左 t21 / 右 t63 で並べて使う。
// 並びは「新しく入った順」(その期間の入った日の新しい順、同日は t の高い順)。

import { useMemo } from 'react'
import {
  STATE_META,
  byNewestEntry,
  leaderState,
  type LiquidLeader,
  type LiquidPeriod,
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
// t21 側: t63 にも入っていれば継続、入っていなければ始まり / t63 側: t21 に無ければ失速。
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

type Props = {
  /** その期間の一覧に入っている行だけ */
  rows: LiquidLeader[]
  period: LiquidPeriod
  title: string
  query: string
}

export default function LiquidLeadersTable({ rows, period, title, query }: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r => r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const tieBreak = useMemo(() => byNewestEntry(period), [period])

  const columns: Column<LiquidLeader>[] = useMemo(() => {
    const t = (r: LiquidLeader) => (period === 't21' ? r.t21 : r.t63)
    const since = (r: LiquidLeader) => (period === 't21' ? r.t21_since : r.t63_since)
    return [
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
          <span className="text-small text-[var(--text-secondary)] whitespace-nowrap">{r.sector_s33 ?? '—'}</span>
        ),
      },
      {
        key: 't',
        label: period,
        tooltip:
          period === 't21'
            ? '自力の t 値（直近 21 日）。TOPIX につられた分を除いた強さが毎日どれだけ安定しているか。2 以上で強い'
            : '自力の t 値（直近 63 日）。2 以上で強い',
        align: 'right',
        value: t,
        className: 'w-16',
        render: r => {
          const v = t(r)
          return isNum(v) ? (
            <span className="num text-[var(--text-primary)]">{v.toFixed(2)}</span>
          ) : (
            <span className="text-[var(--sem-idle-fg)]">—</span>
          )
        },
      },
      {
        key: 'since',
        label: '入った日',
        tooltip: `今回 ${period} の一覧に入った日`,
        align: 'right',
        value: since,
        className: 'w-20',
        render: r => {
          const d = since(r)
          return <span className="text-caption num text-[var(--text-secondary)]">{d ? shortDate(d) : '—'}</span>
        },
      },
    ]
  }, [period])

  return (
    <section className="min-w-0">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-caption font-medium text-[var(--text-secondary)]">{title}</h3>
        <span className="ml-auto text-caption text-[var(--text-muted)]">
          <span className="num">{filtered.length}</span> 銘柄
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] py-8 text-center text-[var(--text-muted)] text-small">
          {query ? `「${query}」に一致する銘柄はありません` : '該当なし'}
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.code}
          defaultSort={{ key: 'since', dir: 'desc' }}
          tieBreak={tieBreak}
          summaryToggle={false}
        />
      )}
    </section>
  )
}
