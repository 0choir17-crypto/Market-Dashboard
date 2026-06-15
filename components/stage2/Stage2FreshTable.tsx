'use client'

import { useMemo, useState } from 'react'
import type { Stage2FreshRow } from '@/types/stage2Fresh'
import { pathLabel } from '@/types/stage2Fresh'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import type { WatchlistItem } from '@/types/portfolio'
import Tooltip from '@/components/shared/Tooltip'

type SortKey =
  | 'weeks_in_s2'
  | 'code'
  | 'sector_s33'
  | 'path'
  | 'close'
  | 'rs_topix_63'
  | 'dist_sma50_pct'
  | 'dist_sma150_pct'
  | 'adr_pct'
  | 'vol_ratio'
  | 'dist_from_high_pct'
  | 'turnover_oku'

type SortDir = 'asc' | 'desc'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

// 経過週チップ: 1=最も新しい(緑) / 2(黄) / 3(灰)。s2_entry をツールチップに。
function WeeksCell({ weeks, entry }: { weeks: number | null; entry: string | null }) {
  if (!isNum(weeks)) return <span className="text-gray-400 text-xs">—</span>
  const meta =
    weeks <= 1
      ? { bg: '#dcfce7', color: '#166534', border: '#86efac' }
      : weeks === 2
        ? { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' }
        : { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' }
  return (
    <span
      className="inline-block min-w-[40px] text-center px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
      title={entry ? `Stage2 入り: ${entry}` : undefined}
    >
      {weeks}週
    </span>
  )
}

// rs_topix_63 (0–100, 高いほど強い)。本テーブルは原則 ≥60。
function RsCell({ v }: { v: number | null }) {
  if (!isNum(v)) return <span className="text-gray-400 text-xs">—</span>
  const color = v >= 80 ? 'var(--positive)' : v >= 70 ? '#15803d' : 'var(--text-primary)'
  const bold = v >= 70
  return (
    <span className={`font-mono text-xs tabular-nums ${bold ? 'font-bold' : ''}`} style={{ color }}>
      {Math.round(v)}
    </span>
  )
}

// vol_ratio (20日平均比)。≥2 で出来高伴う。
function RvolCell({ v }: { v: number | null }) {
  if (!isNum(v)) return <span className="text-gray-400 text-xs">—</span>
  const high = v >= 2
  return (
    <span
      className={`font-mono text-xs tabular-nums ${high ? 'font-bold' : ''}`}
      style={{ color: high ? 'var(--positive)' : 'inherit' }}
      title={high ? '出来高伴う (vol_ratio ≥2)' : undefined}
    >
      {fmt(v, 2)}
    </span>
  )
}

function SortTh({
  label,
  tooltip,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  className = '',
}: {
  label: string
  tooltip?: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const active = currentKey === sortKey
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const alignClass = align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'
  const inner = tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : <>{label}</>
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignClass} ${
        active ? 'text-[var(--accent)]' : 'text-gray-500'
      } ${className}`}
    >
      {inner}
      <span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

function watchInitialFromRow(r: Stage2FreshRow): Partial<WatchlistItem> {
  return {
    ticker: r.code,
    company_name: r.co_name ?? undefined,
    screen_tag: 'Stage2 Fresh',
    rs_composite: r.rs_topix_63 ?? undefined,
    rvol: r.vol_ratio ?? undefined,
    adr_pct: r.adr_pct ?? undefined,
    sector_s33: r.sector_s33 ?? undefined,
    signal_price: r.close ?? undefined,
  }
}

type Props = {
  rows: Stage2FreshRow[]
  query: string
}

export default function Stage2FreshTable({ rows, query }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('weeks_in_s2')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // weeks_in_s2 / code / sector / path は ASC が自然、数値指標は DESC
      setSortDir(
        key === 'weeks_in_s2' || key === 'code' || key === 'sector_s33' || key === 'path'
          ? 'asc'
          : 'desc',
      )
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r => r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (sortKey === 'code' || sortKey === 'sector_s33' || sortKey === 'path') {
        const av = (a[sortKey] as string | null) ?? ''
        const bv = (b[sortKey] as string | null) ?? ''
        return av.localeCompare(bv, 'ja') * dir
      }
      // 既定 (weeks_in_s2): 同週は rs_topix_63 降順でタイブレーク
      if (sortKey === 'weeks_in_s2') {
        const aw = isNum(a.weeks_in_s2) ? a.weeks_in_s2 : Number.POSITIVE_INFINITY
        const bw = isNum(b.weeks_in_s2) ? b.weeks_in_s2 : Number.POSITIVE_INFINITY
        if (aw !== bw) return (aw - bw) * dir
        const ar = isNum(a.rs_topix_63) ? a.rs_topix_63 : -Infinity
        const br = isNum(b.rs_topix_63) ? b.rs_topix_63 : -Infinity
        return br - ar
      }
      const av = a[sortKey] as number | null
      const bv = b[sortKey] as number | null
      // null は常に末尾
      if (!isNum(av) && !isNum(bv)) return 0
      if (!isNum(av)) return 1
      if (!isNum(bv)) return -1
      if (av === bv) return 0
      return (av - bv) * dir
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-500">押し目買い候補</p>
        <span className="ml-auto text-xs text-gray-400">{sorted.length} 銘柄</span>
      </div>

      <table className="w-full min-w-[1180px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-[#e8eaed]">
            <SortTh label="経過週" tooltip="weeks_in_s2 — Stage2 経過週 (1〜3)。小さいほど新しい。" sortKey="weeks_in_s2" {...sp} align="center" className="w-16" />
            <SortTh label="Code" tooltip="銘柄コード (TradingView へリンク)" sortKey="code" {...sp} align="left" className="w-16" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-left text-gray-500">Name</th>
            <SortTh label="Sector (S33)" tooltip="sector_s33 — 東証33業種" sortKey="sector_s33" {...sp} align="left" />
            <SortTh label="経路" tooltip="path — 到達経路。3top→2 押し目復帰 / 4down→2 V回復 / 1bottom→2 王道" sortKey="path" {...sp} align="left" className="w-28" />
            <SortTh label="Close" tooltip="close — 現値 (調整後)" sortKey="close" {...sp} align="right" className="w-20" />
            <SortTh label="RS" tooltip="rs_topix_63 — 対TOPIX 相対強度 (63日, 0–100)。高いほど強い (本テーブルは原則 ≥60)。" sortKey="rs_topix_63" {...sp} align="right" className="w-14" />
            <SortTh label="押し目" tooltip="dist_sma50_pct — 50日線乖離%＝押し目度。小さい(50MA近く)ほど押し目、大きいと伸びきり。" sortKey="dist_sma50_pct" {...sp} align="right" className="w-20" />
            <SortTh label="150乖離" tooltip="dist_sma150_pct — 150日線からの乖離%" sortKey="dist_sma150_pct" {...sp} align="right" className="w-20" />
            <SortTh label="ADR%" tooltip="adr_pct — 日中平均変動率% (ボラティリティ, ≥3)" sortKey="adr_pct" {...sp} align="right" className="w-16" />
            <SortTh label="vol比" tooltip="vol_ratio — 相対出来高 (20日平均比)。≥2 で出来高伴う。" sortKey="vol_ratio" {...sp} align="right" className="w-16" />
            <SortTh label="52w高" tooltip="dist_from_high_pct — 52週高値からの距離% (負値, 0付近=新高値接近, null あり)" sortKey="dist_from_high_pct" {...sp} align="right" className="w-20" />
            <SortTh label="売買代金" tooltip="turnover_oku — 直近20日平均 売買代金 (億円, ≥5)" sortKey="turnover_oku" {...sp} align="right" className="w-20" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-center text-gray-500 w-16">WL</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.code}
              className={`border-b border-[#f0f2f4] transition-colors ${
                i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
              } hover:bg-blue-50/40`}
            >
              <td className="px-2 py-1.5 text-center">
                <WeeksCell weeks={r.weeks_in_s2} entry={r.s2_entry} />
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                <a
                  href={tradingViewUrl(r.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-[var(--accent)] hover:underline"
                >
                  {r.code}
                </a>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-xs">
                <a
                  href={shikihoUrl(r.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-800 hover:text-[var(--accent)] hover:underline"
                  title={r.co_name ?? ''}
                >
                  {r.co_name ?? '—'}
                </a>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                {r.sector_s33 ?? '—'}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600" title={r.path ?? ''}>
                {pathLabel(r.path)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-700 tabular-nums">
                {isNum(r.close) ? r.close.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'}
              </td>
              <td className="px-2 py-1.5 text-right">
                <RsCell v={r.rs_topix_63} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-700 tabular-nums">
                {fmtSignedPct(r.dist_sma50_pct)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                {fmtSignedPct(r.dist_sma150_pct)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                {fmt(r.adr_pct, 1)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <RvolCell v={r.vol_ratio} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                {fmtSignedPct(r.dist_from_high_pct)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                {fmt(r.turnover_oku, 0)}
              </td>
              <td className="px-2 py-1.5 text-center whitespace-nowrap">
                <button
                  onClick={() => setWatchTarget(watchInitialFromRow(r))}
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
        <div className="py-10 text-center text-gray-400 text-sm">
          {query ? `"${query}" にマッチする銘柄なし` : 'データなし'}
        </div>
      )}

      {/* 経路凡例 */}
      <div className="flex items-center justify-center gap-4 py-3 text-[11px] border-t border-[#f0f2f4] flex-wrap text-gray-500">
        <span className="font-semibold">経路 (path):</span>
        <span>3top→2 = 押し目復帰（天井から）</span>
        <span className="text-gray-300">|</span>
        <span>4down→2 = V字回復（下落から）</span>
        <span className="text-gray-300">|</span>
        <span>1bottom→2 = 王道（底から）</span>
        <span className="text-gray-300">|</span>
        <span>経過週 1=最新 → 3</span>
      </div>

      <WatchlistModal
        open={watchTarget !== null}
        onClose={() => setWatchTarget(null)}
        onSaved={() => setWatchTarget(null)}
        initial={watchTarget ?? undefined}
      />
    </div>
  )
}
