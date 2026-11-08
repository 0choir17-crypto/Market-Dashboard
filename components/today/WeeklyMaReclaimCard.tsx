'use client'

import type { WeeklyMaReclaimRow } from '@/types/weeklyMaReclaim'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import CopyTickerButton from '@/components/shared/CopyTickerButton'

type Props = {
  row: WeeklyMaReclaimRow
  multiHit?: boolean
  onAddPosition?: (row: WeeklyMaReclaimRow) => void
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  return formatPct(v, { digits: decimals, sign: true })
}

function fmtSigned(v: number | null | undefined, decimals = 2): string {
  if (!isNum(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}`
}

function fmtPrice(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
}

// YYYY-MM-DD → M/D（基準日と年が違えば「M/D (YYYY)」）
function shortDate(d: string | null, refYear?: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  const md = `${Number(m)}/${Number(day)}`
  return refYear && y !== refYear ? `${md} (${y})` : md
}

// バッジは種類の表示だけ（灰色で統一。色で良し悪しを示さない）。
function Badge({ label, title }: { label: string; title: string }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium tabular-nums border border-[var(--border-strong)] text-[var(--text-primary)]"
      title={title}
    >
      {label}
    </span>
  )
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] px-2 py-1.5" title={title}>
      <p className="text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight">{label}</p>
      <p className="mt-0.5 font-mono text-small font-medium leading-tight tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  )
}

export default function WeeklyMaReclaimCard({ row, multiHit = false, onAddPosition }: Props) {
  const refYear = row.date?.slice(0, 4)
  const n = row.n_crossed
  const lines = [
    { label: '9EMA', week: row.x_ema9_week },
    { label: '21EMA', week: row.x_ema21_week },
    { label: '30SMA', week: row.x_sma30_week },
    { label: '40SMA', week: row.x_sma40_week },
  ]
  const daily = [
    { label: '9', v: row.d_ema9 },
    { label: '21', v: row.d_ema21 },
    { label: '50', v: row.d_ema50 },
    { label: '150', v: row.d_ema150 },
  ]
  const sub = [row.market, row.sector_s33].filter(Boolean).join('・')

  return (
    <div
      className="bg-[var(--bg-card)] rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{
        borderColor: multiHit ? 'var(--sem-watch-bd)' : 'var(--border)',
        backgroundColor: multiHit ? 'var(--sem-watch-bg)' : 'var(--bg-card)',
      }}
    >
      {/* 最後に抜けた線 / 本数 */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 flex-wrap">
        <Badge
          label={row.last_line ? `${row.last_line} を抜けた` : '—'}
          title="この週に終値で最後に抜けた線（同じ週に複数なら並ぶ）"
        />
        {isNum(n) && n >= 2 && (
          <Badge label={`${n} 本まとめて`} title={`この週に ${n} 本の線をまとめて抜けた（前週は ${n} 本の下にいた）`} />
        )}
        {isNum(n) && n === 1 && (
          <span className="text-caption text-[var(--text-muted)]" title="この週に抜けた本数（前週は 1 本だけ下にいた）">
            1 本
          </span>
        )}
        <span
          className="ml-auto text-caption text-[var(--text-muted)]"
          title="40SMA の向き（前週の 40SMA より上か）"
        >
          40SMA {row.sma40_up === true ? '上向き' : row.sma40_up === false ? '下向き' : '—'}
        </span>
      </div>

      {/* 銘柄 */}
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <a
              href={shikihoUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-small font-medium text-[var(--text-primary)] hover:underline truncate min-w-0 flex-1"
              title={`${row.co_name ?? '—'}（四季報を開く）`}
            >
              {row.co_name ?? '—'}
            </a>
            <a
              href={tradingViewUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-small font-medium text-[var(--accent)] hover:underline flex-shrink-0"
              title={`${row.code}（TradingView を開く）`}
            >
              {row.code}
            </a>
          </div>
          <div className="mt-0.5 text-caption truncate text-[var(--text-secondary)]" title={sub}>
            {sub || '—'}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)] leading-tight">週 Close</p>
          <p className="font-mono text-small font-medium text-[var(--text-primary)] tabular-nums leading-tight">
            {fmtPrice(row.close)}
          </p>
          <p
            className="font-mono text-caption tabular-nums leading-tight text-[var(--text-secondary)]"
            title="週足 40SMA からの乖離 = 100 × (終値 / 40SMA − 1)"
          >
            40SMA {fmtSignedPct(row.d_w_sma40_pct)}
          </p>
        </div>
      </div>

      {/* 4 本の線それぞれの上抜け週。この週に抜けた線を強調 */}
      <div className="px-3 grid grid-cols-4 gap-1 text-caption tabular-nums">
        {lines.map(l => {
          const thisWeek = !!l.week && l.week === row.date
          return (
            <div
              key={l.label}
              className="rounded px-1 py-1 text-center border"
              style={{
                borderColor: thisWeek ? 'var(--sem-strong-bd)' : 'var(--border-subtle)',
                backgroundColor: thisWeek ? 'var(--sem-ok-bg)' : 'transparent',
                color: thisWeek ? 'var(--sem-strong-fg)' : 'var(--text-secondary)',
              }}
              title={`終値で ${l.label} を上抜けた直近の週（その週の最後の取引日）${thisWeek ? '。この週に抜けた' : ''}`}
            >
              <div className="font-mono leading-tight">{l.label}</div>
              <div className={`font-mono leading-tight ${thisWeek ? 'font-medium' : ''}`}>{shortDate(l.week, refYear)}</div>
            </div>
          )
        })}
      </div>

      {/* 指標 */}
      <div className="px-3 pt-2 grid grid-cols-3 gap-2">
        <Metric
          label="252日高"
          value={fmtSignedPct(row.dist_high_pct)}
          title="252 営業日の最高値からの距離 %（マイナス = 高値より下）"
        />
        <Metric
          label="出来高"
          value={fmtSignedPct(row.vol_vs_ma10_pct, 0)}
          title="週の出来高の 10 週平均比 %（平均はその週を含む）"
        />
        <Metric label="ADR%" value={fmt(row.adr_pct, 2)} title="ADR%（20日）" />
        <Metric
          label="代金"
          value={isNum(row.turnover10_pre_oku) ? `${row.turnover10_pre_oku.toFixed(2)}億` : '—'}
          title="前週の最終営業日までの 10 日平均売買代金（億円/日）"
        />
        <Metric
          label="時価総額"
          value={isNum(row.mcap_oku) ? `${Math.round(row.mcap_oku).toLocaleString('ja-JP')}億` : '—'}
          title="前週の最終営業日の時価総額（億円）"
        />
        <Metric
          label="日足"
          value={row.daily_stage ?? '—'}
          title="日足の段階（終値が上にいる最初の線。どれも下なら Below 150EMA）"
        />
      </div>

      {/* 日足: (終値 − EMA) ÷ ATR14 */}
      <div className="px-3 pt-2">
        <p
          className="text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight mb-1"
          title="日足: (終値 − EMA) ÷ ATR14（単位 ATR）。rs_leaders と同じ計算"
        >
          日足 EMA 乖離（ATR）
        </p>
        <div className="grid grid-cols-4 gap-1 text-caption tabular-nums text-center">
          {daily.map(d => (
            <div key={d.label} title={`(終値 − EMA${d.label}) ÷ ATR14`}>
              <div className="font-mono leading-tight text-[var(--text-muted)]">{d.label}</div>
              <div className="font-mono leading-tight text-[var(--text-primary)]">{fmtSigned(d.v)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* アクション */}
      <div className="px-3 pt-2 pb-2 mt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-1.5">
        <CopyTickerButton code={row.code} />
        {onAddPosition && (
          <button
            onClick={() => onAddPosition(row)}
            className="px-2 py-1 text-caption font-medium text-[var(--sem-strong-fg)] bg-[var(--sem-ok-bg)] hover:brightness-95 border border-[var(--sem-strong-bd)] rounded transition-colors"
            title="Position として保存"
          >
            ＋ Position
          </button>
        )}
      </div>
    </div>
  )
}
