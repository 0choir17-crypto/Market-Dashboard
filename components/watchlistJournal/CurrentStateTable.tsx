'use client'

// §3.1 現在の状態 — 旧 /watchlist（手入力テーブル）の置き換え先。
//
// watchlist_current を状態でグループ化して表示する。既定ソートは days 降順で、
// 「READY で何日止まっているか」が一目で分かることを最優先にしている。
// 読み取り専用: 追加・編集・削除の導線は無い（編集は TradingView 側）。

import { useMemo, useState } from 'react'
import type { WatchlistCurrentRow } from '@/types/watchlistJournal'
import { STATE_ORDER, stateOrderIndex } from '@/types/watchlistJournal'
import { NumCell, PctCell, ScannerTags, StateBadge, TickerCell } from './atoms'

type SortKey =
  | 'days'
  | 'code'
  | 'since'
  | 'ret_since_pct'
  | 'adr_pct_20'
  | 'turnover_oku'
  | 'rs_vs_topix_avg'
  | 'dist_from_high_pct'
  | 'ext_r'
  | 'mcap_oku'

type Props = {
  rows: WatchlistCurrentRow[]
}

export default function CurrentStateTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('days')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // 状態ごとにグループ化。行が存在するグループだけ描画する
  // （watchlist_current に SOLD / INBOX が載るかは日によって変わる）。
  const groups = useMemo(() => {
    const byState = new Map<string, WatchlistCurrentRow[]>()
    for (const r of rows) {
      const key = r.state ?? '（不明）'
      const list = byState.get(key)
      if (list) list.push(r)
      else byState.set(key, [r])
    }

    const cmp = (a: WatchlistCurrentRow, b: WatchlistCurrentRow) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      // NULL は常に末尾（昇順・降順どちらでも）。欠損を「最小値」として
      // 先頭に並べると、まだ測れていない銘柄が上位に居座って読めなくなる。
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      // code は英字混じり（278A）なので文字列比較。数値としてパースしない。
      const c = typeof av === 'string' || typeof bv === 'string'
        ? String(av).localeCompare(String(bv))
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? c : -c
    }

    return [...byState.entries()]
      .sort((a, b) => stateOrderIndex(a[0]) - stateOrderIndex(b[0]))
      .map(([state, list]) => ({ state, rows: [...list].sort(cmp) }))
  }, [rows, sortKey, sortDir])

  const thSortable = (key: SortKey, label: string, title?: string) => (
    <th
      onClick={() => handleSort(key)}
      title={title}
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-[var(--bg-card-hover)] transition-colors ${
        sortKey === key ? 'text-[var(--accent)]' : 'text-gray-500'
      }`}
    >
      {label}
      {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  )

  if (rows.length === 0) {
    return (
      <div
        className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <p className="text-lg font-medium mb-2">現在のリストが空です</p>
        <p className="text-sm">
          Supabase の <code className="font-mono">watchlist_current</code> は毎晩 23:30 に作り直されます。
        </p>
      </div>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">現在の状態</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {rows.length} 銘柄 — 指標は今日の値。{' '}
          <span className="text-gray-400">
            並び順は列見出しをクリック（既定: 滞在日数の長い順）
          </span>
        </p>
      </div>

      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-[var(--bg-card-hover)] border-b border-[var(--border)]">
            <tr>
              {thSortable('code', '銘柄')}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                業種
              </th>
              {thSortable('since', 'since', 'そのセクションに入った日')}
              {thSortable('days', '滞在', 'since からの暦日数')}
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                入時 → 現在
              </th>
              {thSortable('ret_since_pct', '入ってから')}
              {thSortable('adr_pct_20', 'ADR%', 'ADR% 20日 — 銘柄の速さ')}
              {thSortable('turnover_oku', '代金', '20日平均売買代金（億円）')}
              {thSortable('rs_vs_topix_avg', 'RS', 'RS vs TOPIX（0-100）')}
              {thSortable('dist_from_high_pct', '高値乖離', '52週高値からの乖離%')}
              {thSortable('ext_r', 'Ext R', '50MA からの ATR 伸長（R）')}
              {thSortable('mcap_oku', '時価総額', '億円')}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                スキャナー
              </th>
            </tr>
          </thead>

          {groups.map(group => (
            <tbody key={group.state} className="border-b border-[var(--border)] last:border-b-0">
              <tr className="bg-[var(--bg-primary)]">
                <td colSpan={13} className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <StateBadge state={group.state} />
                    <span className="text-xs text-[var(--text-muted)]">{group.rows.length} 銘柄</span>
                    {group.state === 'READY' && (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        — エントリー可と判断した銘柄。滞在が伸びているものは判断を見直す
                      </span>
                    )}
                    {group.state === 'SOLD' && (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        — アーカイブ。リストを動かした日であって約定日ではない（損益は Trading）
                      </span>
                    )}
                  </span>
                </td>
              </tr>

              {group.rows.map(r => (
                <tr
                  key={r.code}
                  className="border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <td className="px-3 py-2">
                    <TickerCell code={r.code} name={r.co_name} />
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {r.sector_s33 ?? '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {r.since ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.days} digits={0} suffix="日" />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {r.close_at_since != null && r.close_adj != null
                      ? `${r.close_at_since.toLocaleString('ja-JP')} → ${r.close_adj.toLocaleString('ja-JP')}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <PctCell value={r.ret_since_pct} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.adr_pct_20} suffix="%" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.turnover_oku} suffix="億" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.rs_vs_topix_avg} digits={0} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.dist_from_high_pct} suffix="%" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.ext_r} suffix="R" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <NumCell value={r.mcap_oku} digits={0} suffix="億" />
                  </td>
                  <td className="px-3 py-2">
                    <ScannerTags names={r.scanner_names} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* STATE_ORDER に載っていない状態が来たら（TradingView 側で新しい
          セクションを作ったとき）末尾に「（不明）」で出る。気付けるよう明示。 */}
      {groups.some(g => !STATE_ORDER.includes(g.state as never)) && (
        <p className="text-[11px] text-amber-700 mt-2">
          未知の状態が含まれています。TradingView 側でセクションを追加した場合は
          <code className="font-mono mx-1">types/watchlistJournal.ts</code>
          の STATE_ORDER も更新してください。
        </p>
      )}
    </section>
  )
}
