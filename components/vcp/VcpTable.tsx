'use client'

import { useState, useMemo } from 'react'
import { DailyVcpScreen } from '@/types/vcp'
import Tooltip from '@/components/shared/Tooltip'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import { WatchlistItem } from '@/types/portfolio'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

type SortKey = keyof DailyVcpScreen
type SortDir = 'asc' | 'desc'

const COLUMN_TOOLTIPS: Record<string, string> = {
  vcs_score:
    'Volatility Contraction Score (0-100). ボラ収縮 + 出来高収縮を統合。Pine Script v6 と完全再現。',
  vcs_days_tight:
    'VCS ≥70 が連続している日数。長期収縮ほど VCP 教科書的だが、バックテストでは 10+ で勝率落ちるため上限 9 で除外済。',
  cockpit_rs:
    'Cockpit RS: TOPIX 比のパーセンタイル順位。weighted across 21d/63d/126d/252d.',
  adr_pct:
    'Average Daily Range (%): 直近20日の高低差平均。',
  turnover_50d_oku: '50日平均売買代金（B = billion JPY = 10億円）。',
  pct_from_20d_high:
    '過去 20 日 High pivot からの乖離 %. 負=ベース中 / 0付近=エントリ候補 / 正=ブレイク中. 5%超は chasing 警戒.',
  dist_sma50: '50日線からの乖離 (%).',
  dist_sma200:
    '200日線からの乖離 %. 負は Stage 2 から外れた要警戒銘柄.',
  ma_stack:
    'Close > EMA21 > SMA50 > SMA150 > SMA200 (Minervini Trend Template). 1=完全 Stage 2.',
  high_52w_pct: '52週高値からの乖離 (%). 0 に近いほど高値接近。',
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimals)
}

function fmtSignedPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function vcsColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  return 'var(--text-secondary)'
}

function PivotCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400">—</span>
  // negative: gray (in base) | [-2,2]: highlight | positive: green (gradient)
  if (v >= -2 && v <= 2) {
    return (
      <span
        className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
        style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
        title="Pivot 近接（エントリ候補）"
      >
        ★ {fmtSignedPct(v)}
      </span>
    )
  }
  if (v < -2) {
    return (
      <span className="font-mono text-xs text-gray-400">
        {fmtSignedPct(v)}
      </span>
    )
  }
  // > +2: positive, more saturated as it grows (cap at 8)
  const t = Math.min(Math.max((v - 2) / 6, 0), 1)
  // Light green to dark green
  const r = Math.round(220 - t * 130)
  const g = Math.round(252 - t * 90)
  const b = Math.round(231 - t * 120)
  return (
    <span
      className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `rgb(${r},${g},${b})`, color: '#166534' }}
    >
      {fmtSignedPct(v)}
    </span>
  )
}

function D50Cell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400">—</span>
  return (
    <span
      className="font-mono text-xs font-semibold"
      style={{ color: v < 0 ? 'var(--negative)' : 'var(--text-primary)' }}
    >
      {fmtSignedPct(v)}
    </span>
  )
}

function D200Cell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400">—</span>
  if (v < 0) {
    return (
      <span
        className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
        style={{ backgroundColor: 'var(--negative-bg)', color: 'var(--negative)' }}
        title="200日線割れ — Stage 2 から外れた要警戒銘柄"
      >
        {fmtSignedPct(v)}
      </span>
    )
  }
  return (
    <span
      className="font-mono text-xs font-semibold"
      style={{ color: 'var(--text-primary)' }}
    >
      {fmtSignedPct(v)}
    </span>
  )
}

function MaStackCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400">—</span>
  if (v === 1) {
    return (
      <span
        className="inline-block font-bold"
        style={{ color: 'var(--positive)' }}
        title="完全 Stage 2"
      >
        ●
      </span>
    )
  }
  return <span className="text-gray-400">—</span>
}

function High52wCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400">—</span>
  const near = v > -5
  return (
    <span
      className={`font-mono text-xs ${near ? 'font-bold' : ''}`}
      style={{ color: near ? '#a16207' : 'var(--text-secondary)' }}
      title={near ? '52週高値接近' : undefined}
    >
      {near ? '★ ' : ''}
      {fmtSignedPct(v)}
    </span>
  )
}

function SortTh({
  label,
  tooltip,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  width,
}: {
  label: string
  tooltip?: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
  width?: string
}) {
  const active = currentKey === key
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const labelEl = tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : <>{label}</>
  return (
    <th
      onClick={() => onSort(key)}
      style={width ? { width } : undefined}
      className={`px-2 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-[var(--accent)]' : 'text-gray-500'}`}
    >
      {labelEl}
      <span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

function vcpInitialFromRow(row: DailyVcpScreen): Partial<WatchlistItem> {
  return {
    ticker: row.code,
    company_name: row.name ?? undefined,
    screen_tag: 'VCP',
    rs_composite: row.cockpit_rs ?? undefined,
    rvol: row.rvol ?? undefined,
    adr_pct: row.adr_pct ?? undefined,
    sector_s33: row.sector_s33 ?? undefined,
    signal_price: row.close ?? undefined,
  }
}

export default function VcpTable({ rows }: { rows: DailyVcpScreen[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('vcs_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const diff = (av as number) - (bv as number)
      return sortDir === 'asc' ? diff : -diff
    })
  }, [rows, sortKey, sortDir])

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <>
      {/* Desktop / wide table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[#e8eaed]">
              <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                Code
              </th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                Name
              </th>
              <SortTh label="Sector" sortKey="sector_s33" {...sp} align="left" />
              <SortTh label="VCS" sortKey="vcs_score" tooltip={COLUMN_TOOLTIPS.vcs_score} {...sp} />
              <SortTh label="Tight(day)" sortKey="vcs_days_tight" tooltip={COLUMN_TOOLTIPS.vcs_days_tight} {...sp} />
              <SortTh label="RS" sortKey="cockpit_rs" tooltip={COLUMN_TOOLTIPS.cockpit_rs} {...sp} />
              <SortTh label="ADR%" sortKey="adr_pct" tooltip={COLUMN_TOOLTIPS.adr_pct} {...sp} />
              <SortTh label="Turnover(50d)" sortKey="turnover_50d_oku" tooltip={COLUMN_TOOLTIPS.turnover_50d_oku} {...sp} />
              <SortTh label="Pivot%" sortKey="pct_from_20d_high" tooltip={COLUMN_TOOLTIPS.pct_from_20d_high} {...sp} />
              <SortTh label="50sma%" sortKey="dist_sma50" tooltip={COLUMN_TOOLTIPS.dist_sma50} {...sp} />
              <SortTh label="200sma%" sortKey="dist_sma200" tooltip={COLUMN_TOOLTIPS.dist_sma200} {...sp} />
              <SortTh label="Stage2" sortKey="ma_stack" tooltip={COLUMN_TOOLTIPS.ma_stack} {...sp} />
              <SortTh label="52wH%" sortKey="high_52w_pct" tooltip={COLUMN_TOOLTIPS.high_52w_pct} {...sp} />
              <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                WL
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.code}-${i}`}
                className={`border-b border-[#f0f2f4] hover:bg-gray-50 transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                }`}
              >
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <a
                    href={tradingViewUrl(row.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-blue-600 hover:underline text-sm"
                  >
                    {row.code}
                  </a>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <a
                    href={shikihoUrl(row.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-gray-600 hover:underline max-w-[180px] truncate"
                    title={row.name ?? ''}
                  >
                    {row.name ?? '—'}
                  </a>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <span
                    className="text-xs text-gray-500 block max-w-[100px] truncate"
                    title={row.sector_s33 ?? ''}
                  >
                    {row.sector_s33 ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <span
                    className="font-mono text-xs font-semibold"
                    style={{ color: vcsColor(row.vcs_score) }}
                  >
                    {fmt(row.vcs_score, 1)}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <span
                    className={`font-mono text-xs ${
                      (row.vcs_days_tight ?? 0) >= 7 ? 'font-bold' : ''
                    }`}
                  >
                    {row.vcs_days_tight ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <span
                    className={`font-mono text-xs ${
                      (row.cockpit_rs ?? 0) >= 80 ? 'font-bold' : ''
                    }`}
                  >
                    {fmt(row.cockpit_rs, 1)}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {fmt(row.adr_pct, 2)}%
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {row.turnover_50d_oku != null
                    ? `${(row.turnover_50d_oku / 10).toFixed(2)}B`
                    : '—'}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <PivotCell v={row.pct_from_20d_high} />
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <D50Cell v={row.dist_sma50} />
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <D200Cell v={row.dist_sma200} />
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  <MaStackCell v={row.ma_stack} />
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <High52wCell v={row.high_52w_pct} />
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  <button
                    onClick={() => setWatchTarget(vcpInitialFromRow(row))}
                    className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 hover:underline leading-none"
                  >
                    + Watch
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">該当する候補がありません</p>
          </div>
        )}
      </div>

      {/* Mobile compact table */}
      <div className="card overflow-x-auto md:hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[#e8eaed]">
              <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase text-gray-500">
                Code / Name
              </th>
              <SortTh label="VCS" sortKey="vcs_score" tooltip={COLUMN_TOOLTIPS.vcs_score} {...sp} />
              <SortTh label="Tight(day)" sortKey="vcs_days_tight" tooltip={COLUMN_TOOLTIPS.vcs_days_tight} {...sp} />
              <SortTh label="Pivot%" sortKey="pct_from_20d_high" tooltip={COLUMN_TOOLTIPS.pct_from_20d_high} {...sp} />
              <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase text-gray-500">
                WL
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`m-${row.code}-${i}`}
                className={`border-b border-[#f0f2f4] ${
                  i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                }`}
              >
                <td className="px-2 py-2.5">
                  <a
                    href={tradingViewUrl(row.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-blue-600 hover:underline text-sm leading-tight block"
                  >
                    {row.code}
                  </a>
                  <span className="block text-xs text-gray-500 max-w-[140px] truncate">
                    {row.name ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <span
                    className="font-mono text-xs font-semibold"
                    style={{ color: vcsColor(row.vcs_score) }}
                  >
                    {fmt(row.vcs_score, 1)}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs">
                  {row.vcs_days_tight ?? '—'}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <PivotCell v={row.pct_from_20d_high} />
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  <button
                    onClick={() => setWatchTarget(vcpInitialFromRow(row))}
                    className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 hover:underline leading-none"
                  >
                    + Watch
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">該当する候補がありません</p>
          </div>
        )}
      </div>

      <WatchlistModal
        open={watchTarget !== null}
        onClose={() => setWatchTarget(null)}
        onSaved={() => setWatchTarget(null)}
        initial={watchTarget ?? undefined}
      />
    </>
  )
}
