'use client'

import { useMemo } from 'react'
import {
  MarketLeader,
  volColor,
  csBarColor,
  emergingBarColor,
} from '@/types/marketLeaders'
import type { LeaderHits } from '@/lib/marketLeadersFetch'
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'
import type { SemanticTone } from '@/types/semantic'


const EMPTY_HITS: LeaderHits = { hits: 0, streak: 0, lastBeforeStreak: null }

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

// 'YYYY-MM-DD' → 'M/D'
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

function CsAvgCell({ value }: { value: number | null | undefined }) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = csBarColor(value)
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <span
        className="num w-9 text-right"
        style={{ color: isNum(value) ? 'var(--text-primary)' : 'var(--sem-idle-fg)' }}
      >
        {isNum(value) ? value.toFixed(1) : '—'}
      </span>
      <div className="flex-1 h-1.5 bg-[var(--sem-idle-bg)] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// 符号付き整形（mom 用）: +緑 / −赤、null は '—'
function fmtSigned(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}`
}

// 初動 (emerging_cs): cs_avg と同形式（数値+バー）。加速度で色分け。
// null（本更新前の過去日）は '—' / バー無し。mom_21d/5d は hover で補助表示。
function EmergingCell({
  value,
  mom21,
  mom5,
}: {
  value: number | null | undefined
  mom21: number | null | undefined
  mom5: number | null | undefined
}) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = emergingBarColor(value)
  const title = `RS加速度  21d: ${fmtSigned(mom21)}  /  5d: ${fmtSigned(mom5)}`
  return (
    <div className="flex items-center gap-2 min-w-[110px]" title={isNum(value) ? title : undefined}>
      <span
        className="num w-9 text-right"
        style={{ color: isNum(value) ? 'var(--text-primary)' : 'var(--sem-idle-fg)' }}
      >
        {isNum(value) ? value.toFixed(0) : '—'}
      </span>
      <div className="flex-1 h-1.5 bg-[var(--sem-idle-bg)] rounded-full overflow-hidden">
        {isNum(value) && (
          <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
        )}
      </div>
    </div>
  )
}

function VolCell({ value }: { value: number | null | undefined }) {
  const { bg, text, label } = volColor(value)
  return (
    <span
      title={`${label} (${isNum(value) ? value.toFixed(2) : '—'})`}
      className="inline-block min-w-[48px] text-center px-2 py-0.5 rounded-full text-caption num"
      style={{ backgroundColor: bg, color: text }}
    >
      {isNum(value) ? value.toFixed(2) : '—'}
    </span>
  )
}

function ReturnCell({ value }: { value: number | null | undefined }) {
  if (!isNum(value)) return <span className="text-[var(--sem-idle-fg)]">—</span>
  // 損益色は CSS 変数に統一（rule: --positive / --negative）
  const color = value > 0 ? 'var(--positive)' : value < 0 ? 'var(--negative)' : 'var(--text-secondary)'
  const sign = value > 0 ? '+' : ''
  return (
    <span className="num" style={{ color }}>
      {sign}{value.toFixed(1)}%
    </span>
  )
}

function PassRouteBadge({ route }: { route: string | null | undefined }) {
  if (route === 'ipo') {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-caption bg-[var(--sem-weak-bg)] text-[var(--sem-weak-fg)]">
        IPO
      </span>
    )
  }
  return null
}

// ヒット数バッジ: Top50 入りした通算営業日数 (実数, キャップ無し)
// 色 (しきい値は据え置き): 30+ 水色 / 20+ 濃緑 / 10+ 緑 / 5+ 黄 / それ未満 灰
function HitsCell({ hits }: { hits: number }) {
  if (hits <= 0) return <span className="text-[var(--sem-idle-fg)]">—</span>
  // 通算日数は多いほど「確立している」。段階は 3 つに減らし、意味語彙で塗る
  // （5 段階の色分けは分類であって強弱ではなかった）。
  const tone = hits >= 20 ? 'strong' : hits >= 5 ? 'ok' : 'idle'
  return (
    <span
      className="inline-block min-w-[36px] text-center px-2 py-0.5 rounded-full text-caption num"
      title={hits >= 20 ? '通算 20 日以上 Top50 入り' : undefined}
      style={{
        backgroundColor: `var(--sem-${tone}-bg)`,
        color: `var(--sem-${tone}-fg)`,
      }}
    >
      {hits}
    </span>
  )
}

// 連続/直近セル:
// - streak >= 2  → "N日連続" (緑系で持続性をハイライト)
// - streak == 1 && lastBeforeStreak → "前回 M/D" (一度切れた後の復帰)
// - streak == 1 && !lastBeforeStreak → "NEW" (ウィンドウ内で初登場 = 急浮上)
// - その他 → '--'
function StreakCell({ hits }: { hits: LeaderHits }) {
  if (hits.streak >= 2) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-caption num bg-[var(--sem-strong-bg)] text-[var(--sem-strong-fg)]"
        title={`${hits.streak} 営業日連続で Top50 入り`}
      >
        {hits.streak}日連続
      </span>
    )
  }
  if (hits.streak === 1) {
    if (hits.lastBeforeStreak) {
      return (
        <span
          className="inline-block px-2 py-0.5 rounded-full text-caption num bg-[var(--sem-idle-bg)] text-[var(--sem-idle-fg)]"
          title={`前回 Top50 入り: ${hits.lastBeforeStreak}`}
        >
          前回 {shortDate(hits.lastBeforeStreak)}
        </span>
      )
    }
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-caption bg-[var(--sem-focus-bg)] text-[var(--sem-focus-fg)]"
        title="全履歴で初の Top50 入り — 急浮上候補"
      >
        NEW
      </span>
    )
  }
  return <span className="text-[var(--sem-idle-fg)]">—</span>
}


type Props = {
  rows: MarketLeader[]
  hitsMap: Map<string, LeaderHits>
  query: string
}

export default function LeadersTable({ rows, hitsMap, query }: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r => r.code.toLowerCase().includes(q) || (r.coname ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  // hits / streak は行の外（hitsMap）にあるので、列定義は hitsMap に閉じる。
  const columns: Column<MarketLeader>[] = useMemo(
    () => [
      {
        key: 'market_rank',
        label: '#',
        tooltip: 'market_rank — 当日の市場ランク (1=トップ)',
        align: 'center',
        value: r => r.market_rank,
        defaultDir: 'asc',
        className: 'w-10',
        render: r => <span className="num text-[var(--text-secondary)]">{r.market_rank ?? '—'}</span>,
      },
      {
        key: 'code',
        label: 'Code / Name',
        tooltip: '銘柄コード → TradingView / 銘柄名 → 四季報',
        align: 'left',
        value: r => r.code,
        defaultDir: 'asc',
        render: r => <TickerCell code={r.code} name={r.coname} />,
      },
      {
        key: 's33nm',
        label: 'Sector',
        tooltip: 'S33 業種名（五十音順ソート）',
        align: 'left',
        value: r => r.s33nm,
        defaultDir: 'asc',
        render: r => (
          <span className="text-small text-[var(--text-secondary)]">{r.s33nm ?? '—'}</span>
        ),
      },
      {
        key: 'hits',
        label: 'ヒット数',
        tooltip: 'Top50 に入った通算営業日数（実数・表示日まで）',
        align: 'center',
        value: r => hitsMap.get(r.code)?.hits ?? 0,
        className: 'w-20',
        render: r => <HitsCell hits={hitsMap.get(r.code)?.hits ?? 0} />,
      },
      {
        key: 'cs_avg',
        label: 'cs_avg',
        tooltip:
          'クロスセクション RS 平均 0-100（主軸スコア = 確立度）。99.5 = Stage A 上位 0.5%。「どれだけ資金が向かっているか」。rs_topix_avg とは別物',
        align: 'left',
        value: r => r.cs_avg,
        className: 'w-32',
        render: r => <CsAvgCell value={r.cs_avg} />,
      },
      {
        key: 'emerging_cs',
        label: '初動',
        tooltip:
          'emerging_cs 0-100（初動スコア = 加速度）。高い = 今 RS が加速中（初動）/ 低い = 成熟・失速。hover で RS 加速度（21d / 5d）。過去日は — （本更新前）',
        align: 'left',
        value: r => r.emerging_cs,
        className: 'w-32',
        render: r => (
          <EmergingCell value={r.emerging_cs} mom21={r.rs_topix_mom_21d} mom5={r.rs_topix_mom_5d} />
        ),
      },
      {
        key: 'vol_5d',
        label: 'vol_5d',
        tooltip: '直近 5 営業日の出来高比。≥1.5 機関買い継続 / <0.7 出来高枯渇',
        align: 'center',
        value: r => r.vol_5d,
        className: 'w-20',
        render: r => <VolCell value={r.vol_5d} />,
      },

      // ── ここから下は詳細行だけ（50 行を横断比較する数値ではない）────────
      {
        key: 'streak',
        label: '連続/直近',
        tooltip:
          '現在の連続 Top50 日数（実数・全履歴）。連続 = 1 の銘柄は直近の前回ヒット日、全履歴で初登場は NEW',
        summary: false,
        align: 'center',
        value: r => hitsMap.get(r.code)?.streak ?? 0,
        render: r => <StreakCell hits={hitsMap.get(r.code) ?? EMPTY_HITS} />,
      },
      {
        key: 'close',
        label: 'Close',
        summary: false,
        value: r => r.close,
        render: r => (
          <span className="num text-[var(--text-secondary)]">
            {isNum(r.close) ? r.close.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'}
          </span>
        ),
      },
      {
        key: 'return_21d',
        label: '21d %',
        tooltip: 'return_21d — 21 営業日リターン',
        summary: false,
        value: r => r.return_21d,
        render: r => <ReturnCell value={r.return_21d} />,
      },
      {
        key: 'return_63d',
        label: '63d %',
        tooltip: 'return_63d — 63 営業日リターン',
        summary: false,
        value: r => r.return_63d,
        render: r => <ReturnCell value={r.return_63d} />,
      },
      {
        key: 'turnover_oku',
        label: '売買代金',
        tooltip: 'turnover_oku — 売買代金 20日平均（億円）',
        summary: false,
        value: r => r.turnover_oku,
        render: r => (
          <span className="num text-[var(--text-secondary)]">{fmt(r.turnover_oku, 0)}</span>
        ),
      },
      {
        key: 'mcap_oku',
        label: '時価総額',
        tooltip: 'mcap_oku — 時価総額（億円）',
        summary: false,
        value: r => r.mcap_oku,
        render: r => <span className="num text-[var(--text-secondary)]">{fmt(r.mcap_oku, 0)}</span>,
      },
      {
        key: 'pass_route',
        label: 'Route',
        summary: false,
        align: 'center',
        render: r => <PassRouteBadge route={r.pass_route} />,
      },
    ],
    [hitsMap],
  )

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <h2 className="text-caption tracking-wide text-[var(--text-muted)]">市場リーダー Top 50</h2>
        <span className="text-caption text-[var(--text-muted)]">
          cs_avg = 確立（資金が向かう度）／ 初動 = 加速（今 RS が伸びてるか）。観測テーブルで売買シグナルではない
        </span>
        <span className="ml-auto text-caption text-[var(--text-muted)]">
          <span className="num">{filtered.length}</span> 銘柄
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] py-10 text-center text-[var(--text-muted)] text-small">
          {query ? `「${query}」に一致する銘柄はありません` : 'データがありません'}
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.code}
          defaultSort={{ key: 'market_rank', dir: 'asc' }}
        />
      )}

      {/* 凡例 — 色は意味語彙から取るので、表の塗りと必ず一致する */}
      <div className="flex items-center justify-center gap-4 py-3 mt-2 text-caption flex-wrap text-[var(--text-secondary)]">
        <span>初動 (emerging):</span>
        <LegendSwatch tone="strong" label="≥80 加速中" />
        <LegendSwatch tone="ok" label="65–80 やや加速" />
        <LegendSwatch tone="watch" label="55–65 中間" />
        <LegendSwatch tone="idle" label="<55 成熟・失速" />
        <span className="text-[var(--sem-idle-bd)]">|</span>
        <span>vol_5d:</span>
        <LegendSwatch tone="strong" label="≥1.5 機関買い継続" />
        <LegendSwatch tone="ok" label="1.0–1.5 通常" />
        <LegendSwatch tone="watch" label="0.7–1.0 警戒" />
        <LegendSwatch tone="weak" label="<0.7 出来高枯渇" />
        <span className="text-[var(--sem-idle-bd)]">|</span>
        <span>ヒット数:</span>
        <LegendSwatch tone="strong" label="20+" />
        <LegendSwatch tone="ok" label="5+" />
        <LegendSwatch tone="idle" label="<5" />
      </div>
    </section>
  )
}

function LegendSwatch({ tone, label }: { tone: SemanticTone; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-2.5 h-2.5 rounded"
        style={{ backgroundColor: `var(--sem-${tone}-fg)` }}
      />
      <span>{label}</span>
    </span>
  )
}
