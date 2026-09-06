'use client'

// Current State — 旧 /watchlist（手入力テーブル）の置き換え先。
//
// watchlist_current を状態でグループ化して表示する。既定ソートは Days 降順で、
// 「READY で何日止まっているか」が一目で分かることを最優先にしている。
// 読み取り専用: 追加・編集・削除の導線は無い（編集は TradingView 側）。
//
// 列は要約 7 列 + 詳細行 8 列に分けた（DESIGN_DIRECTION.md §5.1）。
// ATR14 / 1R / RR2 / RR2 % / Ext R / ADR % / Sector / Since は
// 「22 行を横断比較するための数値」ではなく「1 銘柄を決めるための数値」なので、
// 一覧から外して行を開いたときだけ見せる。要約ビューは min-w を持たず、
// 横スクロールを出さない。

import type { WatchlistCurrentRow } from '@/types/watchlistJournal'
import { riskPct, stateOrderIndex } from '@/types/watchlistJournal'
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'
import { NumCell, PctCell, YenCell } from './atoms'

type Props = {
  rows: WatchlistCurrentRow[]
}

const COLUMNS: Column<WatchlistCurrentRow>[] = [
  {
    key: 'code',
    label: 'Code / Name',
    tooltip: '銘柄コード → TradingView / 銘柄名 → 四季報',
    align: 'left',
    // code は英字混じり（278A）なので文字列のまま比較する
    value: r => r.code,
    render: r => <TickerCell code={r.code} name={r.co_name} />,
  },
  {
    key: 'days',
    label: 'Days',
    tooltip: 'since からの暦日数。READY で何日止まっているかを見る',
    value: r => r.days,
    render: r => <NumCell value={r.days} digits={0} />,
  },
  {
    key: 'price',
    label: 'Price',
    tooltip: '今日の終値（下の小さい値は入った日の終値）',
    value: r => r.close_adj,
    render: r => (
      <span className="whitespace-nowrap">
        <span className="num text-[var(--text-primary)]">
          {r.close_adj != null ? r.close_adj.toLocaleString('ja-JP') : '—'}
        </span>
        {r.close_at_since != null && (
          <span className="num text-caption text-[var(--text-muted)] ml-1.5">
            / {r.close_at_since.toLocaleString('ja-JP')}
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'ret_since_pct',
    label: 'Return',
    tooltip: '入ってから何 % 動いたか',
    value: r => r.ret_since_pct,
    render: r => <PctCell value={r.ret_since_pct} />,
  },
  {
    key: 'risk_pct',
    label: '1R %',
    tooltip:
      '安値 21EMA までの値幅 ÷ 終値。TradingView が括弧で併記している % と小数第 2 位まで一致する。8% 以上は RR2:1 が成立しないためエントリー対象外',
    value: r => riskPct(r.dist_ema21_low_yen, r.close_adj),
    render: r => <PctCell value={riskPct(r.dist_ema21_low_yen, r.close_adj)} digits={2} neutral />,
  },
  {
    key: 'rs_vs_topix_avg',
    label: 'RS',
    tooltip: 'RS vs TOPIX（0-100）',
    value: r => r.rs_vs_topix_avg,
    render: r => <NumCell value={r.rs_vs_topix_avg} digits={0} />,
  },
  {
    key: 'dist_from_high_pct',
    label: '52W High',
    tooltip: '52週高値からの乖離%',
    value: r => r.dist_from_high_pct,
    render: r => <NumCell value={r.dist_from_high_pct} suffix="%" />,
  },

  // ── ここから下は詳細行だけに出る（1 銘柄を決めるための数値）──────────────
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
    key: 'since',
    label: 'Since',
    tooltip: 'そのセクションに入った日',
    summary: false,
    align: 'left',
    value: r => r.since,
    render: r => <span className="font-mono text-small">{r.since ?? '—'}</span>,
  },
  {
    key: 'adr_pct_20',
    label: 'ADR %',
    tooltip: 'ADR% 20日 — 銘柄の速さ',
    summary: false,
    value: r => r.adr_pct_20,
    render: r => <NumCell value={r.adr_pct_20} suffix="%" />,
  },
  {
    key: 'atr_14',
    label: 'ATR14',
    tooltip: 'ta.atr(14)（Wilder RMA）。TradingView は整数表示、ここは生値',
    summary: false,
    value: r => r.atr_14,
    render: r => <NumCell value={r.atr_14} />,
  },
  {
    key: 'dist_ema21_low_yen',
    label: '1R（21EMA Low）',
    tooltip:
      '終値 − ema(low,21)。安値 21EMA にストップを置いたときの値幅。呼値に丸めていない生値なので TradingView 表示と数円ずれる',
    summary: false,
    value: r => r.dist_ema21_low_yen,
    render: r => <YenCell value={r.dist_ema21_low_yen} />,
  },
  {
    key: 'rr2_ema21_low_yen',
    label: 'RR2（21EMA Low）',
    tooltip: '1R × 2 — 利確目標までの値幅',
    summary: false,
    value: r => r.rr2_ema21_low_yen,
    render: r => <YenCell value={r.rr2_ema21_low_yen} />,
  },
  {
    key: 'rr2_pct',
    label: 'RR2 %（21EMA Low）',
    tooltip: 'RR2 ÷ 終値',
    summary: false,
    value: r => riskPct(r.rr2_ema21_low_yen, r.close_adj),
    render: r => <PctCell value={riskPct(r.rr2_ema21_low_yen, r.close_adj)} digits={2} neutral />,
  },
  {
    key: 'ext_r',
    label: 'Ext R (50MA)',
    tooltip: '50MA からの ATR 伸長（R）。21EMA 基準の 1R とは別物',
    summary: false,
    value: r => r.ext_r,
    render: r => <NumCell value={r.ext_r} suffix="R" />,
  },
]

/** グループ見出しの注記。READY と SOLD だけ性格を添える。 */
const GROUP_NOTE: Record<string, string> = {
  READY: 'エントリー可と判断した銘柄。滞在が伸びているものは判断を見直す',
  SOLD: '売却済アーカイブ。現在のウォッチ対象ではない（損益の正本は Trading）',
}

export default function CurrentStateTable({ rows }: Props) {
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
          {rows.length} 銘柄 — 指標は今日の値。行を開くと残りの列が出ます
        </p>
      </div>

      <DataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={r => r.code}
        defaultSort={{ key: 'days', dir: 'desc' }}
        groupBy={r => r.state ?? '（不明）'}
        groupRank={stateOrderIndex}
        // SOLD は売却済アーカイブで現在のウォッチ対象ではない。しかも記録開始前
        // からの建玉が混ざっているので、現在のリストと並べると紛らわしい。既定で畳む。
        defaultCollapsed={['SOLD']}
        // 重みは塗りではなく左端のレールで示す。READY だけ。
        rail={r => (r.state === 'READY' ? 'var(--sem-focus-fg)' : null)}
        renderGroupHeader={(state, count) => (
          <span className="inline-flex items-baseline gap-2">
            <span className="text-caption tracking-wide text-[var(--text-secondary)]">{state}</span>
            <span className="text-caption text-[var(--text-muted)]">{count} 銘柄</span>
            {GROUP_NOTE[state] && (
              <span className="text-caption text-[var(--text-muted)]">— {GROUP_NOTE[state]}</span>
            )}
          </span>
        )}
        fullMinWidth={1320}
      />
    </section>
  )
}
