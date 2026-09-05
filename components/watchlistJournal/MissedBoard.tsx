'use client'

// §3.3 見逃しボード — この画面の主役。
//
// 「見逃し」= Watch list に入れたが HOLD に至らないまま落とした銘柄。
// HOLD 判定はその exit より前に限る（後から買い直した銘柄も、その時点では
// 確かに落としているので行として残す。lib/watchlistJournalFetch.ts#buildMissed）。
//
// from_state 別にグループ化し、READY からの離脱を最も重く扱う
// （エントリー可と判断しておいて買わなかった）。並びは max_ret_pct 降順 =
// 「落とした後に伸びた順」。
//
// §3.4: 勝率・PF・期待値のタイルは置かない。2026-08-13 開始で HOLD/SOLD は
// まだ 5 件ずつしかなく、この家では素の勝率が繰り返し ADR%20 の影武者になる
// ことが確認されている。集計は中央値までに留め、件数の少なさを明記する。

import { useMemo, useState } from 'react'
import type { WatchlistEvent } from '@/types/watchlistJournal'
import { formatPct } from '@/lib/format'
import { NumCell, PctCell, SampleSizeNote, ScannerTags, StateBadge, TickerCell, median } from './atoms'

// READY からの離脱が最も重い。この順で並べ、READY だけ枠を強調する。
const FROM_STATE_ORDER = ['READY', 'FOCUS', 'SECOND', 'SHORT', 'OTHERS', 'INBOX']

function fromStateIndex(state: string | null): number {
  const i = FROM_STATE_ORDER.indexOf(state ?? '')
  return i < 0 ? FROM_STATE_ORDER.length : i
}

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

  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">見逃しボード</h2>
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-6 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-sm">Watch list から落とした銘柄はまだありません</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">見逃しボード</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Watch list に入れたのに、買わないまま落とした銘柄がその後どうなったか（落とした後に伸びた順）
        </p>
      </div>

      {/* from_state 別サマリ。クリックで絞り込み。中央値だけを出す（§3.4）。 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <button
          onClick={() => setFilter(null)}
          className={`text-left px-3 py-2 rounded-lg border transition-colors ${
            filter === null
              ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
              : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">全部</p>
          <p className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {rows.length}
          </p>
        </button>

        {groups.map(g => {
          const isReady = g.state === 'READY'
          const active = filter === g.state
          return (
            <button
              key={g.state}
              onClick={() => setFilter(active ? null : g.state)}
              className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-bg)]'
                  : isReady
                    ? 'border-blue-300 bg-blue-50/60 hover:bg-blue-50'
                    : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
              }`}
              title={
                isReady
                  ? 'エントリー可と判断しておいて買わなかった — 最も重い見逃し'
                  : undefined
              }
            >
              <span className="flex items-center gap-1.5">
                <StateBadge state={g.state} />
                <span className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {g.count}
                </span>
              </span>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono tabular-nums">
                中央 現在 {formatPct(g.medRet, { digits: 2, sign: true })} / 最大{' '}
                {formatPct(g.medMax, { digits: 2, sign: true })}
              </p>
            </button>
          )
        })}
      </div>

      <SampleSizeNote n={rows.length}>
        。「現在」「最大」は落とした日の終値を基準にした変化率で、当日落とした銘柄は翌営業日まで
        <span className="font-mono mx-0.5">—</span>になります
      </SampleSizeNote>

      <div className="mt-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-[var(--bg-card-hover)] border-b border-[var(--border)]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                落とした日
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                銘柄
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                どこから
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                業種
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                滞在
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                経過
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                現在
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[var(--accent)] whitespace-nowrap">
                最大上昇 ↓
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                最大下落
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                ADR%
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                スキャナー
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr
                key={`${r.snapshot_id}-${r.code}`}
                className={`border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors ${
                  r.from_state === 'READY' ? 'bg-blue-50/40' : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                  {r.date}
                </td>
                <td className="px-3 py-2">
                  <TickerCell code={r.code} name={r.co_name} />
                </td>
                <td className="px-3 py-2">
                  <StateBadge state={r.from_state} />
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                  {r.sector_s33 ?? '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <NumCell value={r.dwell_days} digits={0} suffix="日" />
                </td>
                <td className="px-3 py-2 text-right">
                  <NumCell value={r.bars_since} digits={0} suffix="本" title="イベントからの経過営業日数" />
                </td>
                <td className="px-3 py-2 text-right">
                  <PctCell value={r.ret_since_pct} />
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  <PctCell value={r.max_ret_pct} title="期間中の最大上昇%（終値ベース）" />
                </td>
                <td className="px-3 py-2 text-right">
                  <PctCell value={r.min_ret_pct} title="期間中の最大下落%（安値ベース）" />
                </td>
                <td className="px-3 py-2 text-right">
                  <NumCell value={r.adr_pct_20} suffix="%" />
                </td>
                <td className="px-3 py-2">
                  <ScannerTags names={r.scanner_names} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
