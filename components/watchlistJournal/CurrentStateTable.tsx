'use client'

// Current State — 旧 /watchlist（手入力テーブル）の置き換え先。
//
// watchlist_current を状態でグループ化して表示する。既定ソートは days 降順で、
// 「READY で何日止まっているか」が一目で分かることを最優先にしている。
// 読み取り専用: 追加・編集・削除の導線は無い（編集は TradingView 側）。
//
// 列は ADR% のあとに ATR 系（ATR14 → 1R → 1R % → RR2 → RR2 %）をまとめ、
// 相場強弱の指標（RS / 52W High / Ext R）を右に回している。1R は TradingView で
// 常時表示しているインジケーターと同じ値で、安値 21EMA にストップを置いたときの
// 値幅。8% 以上はエントリー対象外だが、色や印は付けず数値だけを出す。

import { useMemo, useState } from 'react'
import type { WatchlistCurrentRow } from '@/types/watchlistJournal'
import { STATE_ORDER, riskPct, stateOrderIndex } from '@/types/watchlistJournal'
import { NumCell, PctCell, StateLabel, TickerCell, YenCell } from './atoms'

type SortKey =
  | 'code'
  | 'since'
  | 'days'
  | 'ret_since_pct'
  | 'adr_pct_20'
  | 'atr_14'
  | 'dist_ema21_low_yen'
  | 'risk_pct'
  | 'rr2_ema21_low_yen'
  | 'rr2_pct'
  | 'rs_vs_topix_avg'
  | 'dist_from_high_pct'
  | 'ext_r'

// 派生列（1R % / RR2 %）は行に無いのでソート時に計算する。
const SORT_VALUE: Record<SortKey, (r: WatchlistCurrentRow) => string | number | null> = {
  code: r => r.code,
  since: r => r.since,
  days: r => r.days,
  ret_since_pct: r => r.ret_since_pct,
  adr_pct_20: r => r.adr_pct_20,
  atr_14: r => r.atr_14,
  dist_ema21_low_yen: r => r.dist_ema21_low_yen,
  risk_pct: r => riskPct(r.dist_ema21_low_yen, r.close_adj),
  rr2_ema21_low_yen: r => r.rr2_ema21_low_yen,
  rr2_pct: r => riskPct(r.rr2_ema21_low_yen, r.close_adj),
  rs_vs_topix_avg: r => r.rs_vs_topix_avg,
  dist_from_high_pct: r => r.dist_from_high_pct,
  ext_r: r => r.ext_r,
}

/** td の数。グループ見出し行の colSpan に使う。 */
const COLUMN_COUNT = 15

type Props = {
  rows: WatchlistCurrentRow[]
}

export default function CurrentStateTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('days')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // SOLD は売却済アーカイブで、現在のウォッチ対象ではない。しかも記録開始前からの
  // 建玉が混ざっている（§6）ので、現在のリストと並べると紛らわしい。既定で畳む。
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['SOLD']))

  function toggleGroup(state: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(state)) next.delete(state)
      else next.add(state)
      return next
    })
  }

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

    const getValue = SORT_VALUE[sortKey]
    const cmp = (a: WatchlistCurrentRow, b: WatchlistCurrentRow) => {
      const av = getValue(a)
      const bv = getValue(b)
      // NULL は常に末尾（昇順・降順どちらでも）。欠損を「最小値」として
      // 先頭に並べると、まだ測れていない銘柄が上位に居座って読めなくなる。
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      // code は英字混じり（278A）なので文字列比較。数値としてパースしない。
      const c =
        typeof av === 'string' || typeof bv === 'string'
          ? String(av).localeCompare(String(bv))
          : av - bv
      return sortDir === 'asc' ? c : -c
    }

    return [...byState.entries()]
      .sort((a, b) => stateOrderIndex(a[0]) - stateOrderIndex(b[0]))
      .map(([state, list]) => ({ state, rows: [...list].sort(cmp) }))
  }, [rows, sortKey, sortDir])

  const th = (
    key: SortKey,
    label: string,
    title: string,
    align: 'left' | 'right' = 'right',
  ) => (
    <th
      onClick={() => handleSort(key)}
      title={title}
      className={`px-2.5 py-2 ${align === 'left' ? 'text-left' : 'text-right'} text-caption tracking-wide cursor-pointer select-none whitespace-nowrap ${
        sortKey === key ? 'text-[var(--sem-focus-fg)]' : 'text-[var(--text-muted)]'
      }`}
    >
      {label}
      {sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  )

  if (rows.length === 0) {
    return (
      <div
        className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] p-8 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <p className="text-lead mb-2">現在のリストが空です</p>
        <p className="text-small">
          Supabase の <code className="font-mono">watchlist_current</code> は毎晩 23:30 に作り直されます。
        </p>
      </div>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-caption tracking-wide text-[var(--text-muted)]">Current State</h2>
        <p className="text-caption text-[var(--text-muted)]">
          {rows.length} 銘柄 — 指標は今日の値。{' '}
          <span>
            並び順は列見出しをクリック（既定: 滞在日数の長い順）
          </span>
        </p>
      </div>

      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] overflow-x-auto">
        <table className="w-full min-w-[1320px] text-body">
          <thead className="border-b-[0.5px] border-[var(--border)]">
            <tr>
              {th('code', 'Code / Name', '銘柄コード → TradingView / 銘柄名 → 四季報', 'left')}
              <th className="px-2.5 py-2 text-left text-caption tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                Sector
              </th>
              {th('since', 'Since', 'そのセクションに入った日', 'left')}
              {th('days', 'Days', 'since からの暦日数')}
              <th className="px-2.5 py-2 text-right text-caption tracking-wide text-[var(--text-muted)] whitespace-nowrap">
                Entry → Now
              </th>
              {th('ret_since_pct', 'Return', '入ってから何 % 動いたか')}
              {th('adr_pct_20', 'ADR %', 'ADR% 20日 — 銘柄の速さ')}

              {/* ATR 系（TradingView の Cockpit BT10 / ADR×ATR と同じ値） */}
              {th('atr_14', 'ATR14', 'ta.atr(14)（Wilder RMA）。TV は整数表示、ここは生値')}
              {th(
                'dist_ema21_low_yen',
                '1R（21EMA Low）',
                '終値 − ema(low,21)。安値 21EMA にストップを置いたときの値幅。呼値に丸めていない生値なので TV 表示と数円ずれる',
              )}
              {th(
                'risk_pct',
                '1R %（21EMA Low）',
                '1R ÷ 終値。TV が括弧で併記している % と小数第 2 位まで一致する。8% 以上は RR2:1 が成立しないためエントリー対象外',
              )}
              {th('rr2_ema21_low_yen', 'RR2（21EMA Low）', '1R × 2 — 利確目標までの値幅')}
              {th('rr2_pct', 'RR2 %（21EMA Low）', 'RR2 ÷ 終値')}

              {th('rs_vs_topix_avg', 'RS', 'RS vs TOPIX（0-100）')}
              {th('dist_from_high_pct', '52W High', '52週高値からの乖離%')}
              {th('ext_r', 'Ext R (50MA)', '50MA からの ATR 伸長（R）。21EMA 基準の 1R とは別物')}
            </tr>
          </thead>

          {groups.map(group => (
            <tbody key={group.state} className="border-b-[0.5px] border-[var(--border)] last:border-b-0">
              <tr className="bg-[var(--bg-primary)]">
                <td colSpan={COLUMN_COUNT} className="px-2.5 py-1.5">
                  <button
                    onClick={() => toggleGroup(group.state)}
                    aria-expanded={!collapsed.has(group.state)}
                    className="inline-flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                  >
                    <span
                      className={`text-[10px] text-gray-400 inline-block transition-transform ${
                        collapsed.has(group.state) ? '' : 'rotate-90'
                      }`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <StateLabel state={group.state} />
                    <span className="text-caption text-[var(--text-muted)]">{group.rows.length} 銘柄</span>
                    {group.state === 'READY' && (
                      <span className="text-caption text-[var(--text-muted)]">
                        — エントリー可と判断した銘柄。滞在が伸びているものは判断を見直す
                      </span>
                    )}
                    {group.state === 'SOLD' && (
                      <span className="text-caption text-[var(--text-muted)]">
                        — 売却済アーカイブ。現在のウォッチ対象ではない（損益の正本は Trading）
                      </span>
                    )}
                  </button>
                </td>
              </tr>

              {!collapsed.has(group.state) &&
                group.rows.map(r => (
                  <tr
                    key={r.code}
                    className="border-t-[0.5px] border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
                  >
                    {/* READY だけ左端のレールで重みを表す。塗りのバッジは置かない */}
                    <td
                      className="px-2.5 py-2 border-l-2"
                      style={{
                        borderLeftColor:
                          group.state === 'READY' ? 'var(--sem-focus-fg)' : 'transparent',
                      }}
                    >
                      <TickerCell code={r.code} name={r.co_name} />
                    </td>
                    <td className="px-2.5 py-2 text-small text-[var(--text-secondary)] whitespace-nowrap">
                      {r.sector_s33 ?? '—'}
                    </td>
                    <td className="px-2.5 py-2 font-mono text-small text-[var(--text-secondary)] whitespace-nowrap">
                      {r.since ?? '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <NumCell value={r.days} digits={0} suffix="日" />
                    </td>
                    <td className="px-2.5 py-2 text-right num text-small text-[var(--text-secondary)] whitespace-nowrap">
                      {r.close_at_since != null && r.close_adj != null
                        ? `${r.close_at_since.toLocaleString('ja-JP')} → ${r.close_adj.toLocaleString('ja-JP')}`
                        : '—'}
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <PctCell value={r.ret_since_pct} />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <NumCell value={r.adr_pct_20} suffix="%" />
                    </td>

                    <td className="px-2.5 py-2 text-right">
                      <NumCell value={r.atr_14} />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <YenCell value={r.dist_ema21_low_yen} title="TV 表示は呼値に丸められるため数円ずれます" />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <PctCell value={riskPct(r.dist_ema21_low_yen, r.close_adj)} digits={2} neutral />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <YenCell value={r.rr2_ema21_low_yen} title="TV 表示は呼値に丸められるため数円ずれます" />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <PctCell value={riskPct(r.rr2_ema21_low_yen, r.close_adj)} digits={2} neutral />
                    </td>

                    <td className="px-2.5 py-2 text-right">
                      <NumCell value={r.rs_vs_topix_avg} digits={0} />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <NumCell value={r.dist_from_high_pct} suffix="%" />
                    </td>
                    <td className="px-2.5 py-2 text-right">
                      <NumCell value={r.ext_r} suffix="R" />
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
        <p className="text-caption text-[var(--sem-watch-fg)] mt-2">
          未知の状態が含まれています。TradingView 側でセクションを追加した場合は
          <code className="font-mono mx-1">types/watchlistJournal.ts</code>
          の STATE_ORDER も更新してください。
        </p>
      )}
    </section>
  )
}
