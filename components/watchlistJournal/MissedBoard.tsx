'use client'

// Missed Board — この画面の主役。
//
// 「見逃し」= Watch list に入れたが、その exit の date より前に HOLD に
// なっていない銘柄（lib/watchlistJournalFetch.ts#buildMissed）。
// 同一 code の exit は畳まず全件出す（1 回ごとが独立した判断）。
//
// from_state 別にグループ化し、READY からの離脱を最も重く扱う
// （エントリー可と判断しておいて買わなかった）。並びの既定は Max Gain 降順 =
// 「落とした後に伸びた順」。
//
// 勝率・PF・期待値のタイルは置かない。2026-08-13 開始でサンプルが少なく、
// この家では素の勝率が繰り返し ADR%20 の影武者になることが確認されている。
// 集計は中央値までに留め、件数の少なさを明記する。

import { useMemo, useState } from 'react'
import type { WatchlistEvent } from '@/types/watchlistJournal'
import { formatPct } from '@/lib/format'
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'
import { NumCell, PctCell, SampleSizeNote, YenCell, median } from './atoms'

// READY からの離脱が最も重い。この順で並べる。
const FROM_STATE_ORDER = ['READY', 'FOCUS', 'SECOND', 'SHORT', 'OTHERS', 'INBOX']

function fromStateIndex(state: string | null): number {
  const i = FROM_STATE_ORDER.indexOf(state ?? '')
  return i < 0 ? FROM_STATE_ORDER.length : i
}

const COLUMNS: Column<WatchlistEvent>[] = [
  {
    key: 'date',
    label: 'Date',
    tooltip: 'Watch list から落とした日',
    align: 'left',
    value: r => r.date,
    render: r => <span className="font-mono text-small text-[var(--text-secondary)]">{r.date}</span>,
  },
  {
    key: 'bars_since',
    label: 'Days',
    tooltip: '落とした日からの経過営業日数。右の 3 つの % を測った期間の長さ',
    value: r => r.bars_since,
    render: r => <NumCell value={r.bars_since} digits={0} />,
  },
  {
    key: 'code',
    label: 'Code / Name',
    tooltip: '銘柄コード → TradingView / 銘柄名 → 四季報',
    align: 'left',
    value: r => r.code,
    render: r => <TickerCell code={r.code} name={r.co_name} />,
  },
  {
    key: 'close_adj',
    label: 'Price',
    tooltip: '落とした日の終値。Return / Max Gain / Max Draw はこの値が基準',
    value: r => r.close_adj,
    render: r => <YenCell value={r.close_adj} />,
  },
  {
    key: 'from_state',
    label: 'From',
    tooltip: 'どの状態から落としたか（READY が最も重い順で並ぶ）',
    align: 'left',
    // 五十音ではなく見逃しの重み順で並べる
    value: r => fromStateIndex(r.from_state),
    render: r => (
      <span className="text-caption tracking-wide text-[var(--text-secondary)]">
        {r.from_state ?? '—'}
      </span>
    ),
  },
  {
    key: 'ret_since_pct',
    label: 'Return',
    tooltip: '落としてから現在までの変化%',
    value: r => r.ret_since_pct,
    render: r => <PctCell value={r.ret_since_pct} />,
  },
  {
    key: 'max_ret_pct',
    label: 'Max Gain',
    tooltip: '期間中の最大上昇%（終値ベース）',
    value: r => r.max_ret_pct,
    render: r => <PctCell value={r.max_ret_pct} />,
  },

  // ── 詳細行だけ ────────────────────────────────────────────────────────
  {
    key: 'sector_s33',
    label: 'Sector',
    summary: false,
    align: 'left',
    value: r => r.sector_s33,
    render: r => (
      <span className="text-small text-[var(--text-secondary)]">{r.sector_s33 ?? '—'}</span>
    ),
  },
  {
    key: 'dwell_days',
    label: 'Stay',
    tooltip: '落とす前にその状態に居た暦日数',
    summary: false,
    value: r => r.dwell_days,
    render: r => <NumCell value={r.dwell_days} digits={0} />,
  },
  {
    key: 'min_ret_pct',
    label: 'Max Draw',
    tooltip: '期間中の最大下落%（安値ベース）',
    summary: false,
    value: r => r.min_ret_pct,
    render: r => <PctCell value={r.min_ret_pct} />,
  },
  {
    key: 'adr_pct_20',
    label: 'ADR %',
    tooltip: '落とした日の ADR% 20日',
    summary: false,
    value: r => r.adr_pct_20,
    render: r => <NumCell value={r.adr_pct_20} suffix="%" />,
  },
]

type Props = {
  rows: WatchlistEvent[]
}

export default function MissedBoard({ rows }: Props) {
  // 既定は「全部」。from_state を選ぶと絞り込む。
  const [filter, setFilter] = useState<string | null>(null)

  const groups = useMemo(() => {
    const byState = new Map<string, WatchlistEvent[]>()
    for (const r of rows) {
      const key = r.from_state ?? '（不明）'
      const list = byState.get(key)
      if (list) list.push(r)
      else byState.set(key, [r])
    }
    return [...byState.entries()]
      .sort((a, b) => fromStateIndex(a[0]) - fromStateIndex(b[0]))
      .map(([state, list]) => ({
        state,
        count: list.length,
        medRet: median(list.map(r => r.ret_since_pct)),
        medMax: median(list.map(r => r.max_ret_pct)),
      }))
  }, [rows])

  const visible = useMemo(
    () => (filter ? rows.filter(r => (r.from_state ?? '（不明）') === filter) : rows),
    [rows, filter],
  )

  // 選択中の 1 組だけ中央値を大きく出す。タイルに 2 つ詰めると窮屈だった。
  const selected = filter ? groups.find(g => g.state === filter) : null
  const medRet = selected ? selected.medRet : median(rows.map(r => r.ret_since_pct))
  const medMax = selected ? selected.medMax : median(rows.map(r => r.max_ret_pct))

  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-caption tracking-wide text-[var(--text-muted)] mb-3">Missed Board</h2>
        <div
          className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] p-6 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-small">Watch list から落とした銘柄はまだありません</p>
        </div>
      </section>
    )
  }

  const chip = (key: string | null, label: string, count: number, heavy = false) => {
    const active = filter === key
    return (
      <button
        key={key ?? 'all'}
        onClick={() => setFilter(active ? null : key)}
        title={heavy ? 'エントリー可と判断しておいて買わなかった — 最も重い見逃し' : undefined}
        className={`inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg border-[0.5px] whitespace-nowrap ${
          active
            ? 'border-[var(--sem-focus-bd)] bg-[var(--sem-focus-bg)]'
            : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
        }`}
        style={heavy ? { borderLeft: '2px solid var(--sem-focus-fg)' } : undefined}
      >
        <span className="text-caption tracking-wide text-[var(--text-secondary)]">{label}</span>
        <span className="num text-body text-[var(--text-primary)]">{count}</span>
      </button>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-caption tracking-wide text-[var(--text-muted)]">Missed Board</h2>
        <p className="text-caption text-[var(--text-muted)]">
          Watch list に入れたのに、買わないまま落とした銘柄がその後どうなったか
        </p>
      </div>

      {/* from_state 別の絞り込み。件数だけを水平 1 行に並べ、中央値は
          選択中の 1 組を下に大きく出す（タイルに 2 つ詰めると窮屈だった）。 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chip(null, 'All', rows.length)}
        {groups.map(g => chip(g.state, g.state, g.count, g.state === 'READY'))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-3">
        <span className="text-caption text-[var(--text-muted)]">
          {filter ?? 'All'} の中央値
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-caption text-[var(--text-muted)]">現在</span>
          <span className="text-lead num text-[var(--text-primary)]">
            {formatPct(medRet, { digits: 2, sign: true })}
          </span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-caption text-[var(--text-muted)]">最大上昇</span>
          <span className="text-lead num text-[var(--text-primary)]">
            {formatPct(medMax, { digits: 2, sign: true })}
          </span>
        </span>
      </div>

      <SampleSizeNote n={visible.length}>
        。Return / Max Gain は落とした日の終値を基準にした変化率で、当日落とした銘柄は翌営業日まで
        <span className="font-mono mx-0.5">—</span>になります
      </SampleSizeNote>

      <div className="mt-3">
        <DataTable
          rows={visible}
          columns={COLUMNS}
          rowKey={r => `${r.snapshot_id}-${r.code}`}
          defaultSort={{ key: 'max_ret_pct', dir: 'desc' }}
          // 重みは塗りではなく左端のレールで示す
          rail={r => (r.from_state === 'READY' ? 'var(--sem-focus-fg)' : null)}
        />
      </div>
    </section>
  )
}
