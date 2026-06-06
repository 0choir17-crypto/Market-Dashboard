'use client'

import { useMemo, useState } from 'react'
import {
  MarketLeader,
  volColor,
  csBarColor,
  scaleCatColor,
} from '@/types/marketLeaders'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import Tooltip from '@/components/shared/Tooltip'

type SortKey =
  | 'market_rank'
  | 'code'
  | 'cs_avg'
  | 'vol_5d'
  | 'return_21d'
  | 'return_63d'
  | 'turnover_oku'
  | 'mcap_oku'
type SortDir = 'asc' | 'desc'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '--'
}

function CsAvgCell({ value }: { value: number | null | undefined }) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = csBarColor(value)
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <span
        className="font-mono text-xs tabular-nums w-9 text-right font-semibold"
        style={{ color: isNum(value) ? '#1f2937' : '#9ca3af' }}
      >
        {isNum(value) ? value.toFixed(1) : '--'}
      </span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function VolCell({ value }: { value: number | null | undefined }) {
  const { bg, text, label } = volColor(value)
  return (
    <span
      title={`${label} (${isNum(value) ? value.toFixed(2) : '--'})`}
      className="inline-block min-w-[48px] text-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {isNum(value) ? value.toFixed(2) : '--'}
    </span>
  )
}

function ReturnCell({ value }: { value: number | null | undefined }) {
  if (!isNum(value)) return <span className="text-gray-400 text-xs">--</span>
  const color = value > 0 ? '#16a34a' : value < 0 ? '#dc2626' : '#6b7280'
  const sign = value > 0 ? '+' : ''
  return (
    <span className="font-mono text-xs tabular-nums" style={{ color }}>
      {sign}{value.toFixed(1)}%
    </span>
  )
}

function ScaleCatBadge({ cat }: { cat: string | null | undefined }) {
  if (!cat || cat === '-') {
    return <span className="text-[10px] text-gray-300">--</span>
  }
  const { bg, text } = scaleCatColor(cat)
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: bg, color: text }}
    >
      {cat}
    </span>
  )
}

function PassRouteBadge({ route }: { route: string | null | undefined }) {
  if (route === 'ipo') {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
        IPO
      </span>
    )
  }
  return null
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

type Props = {
  rows: MarketLeader[]
  query: string
  onSelectCode?: (code: string) => void
}

export default function LeadersTable({ rows, query, onSelectCode }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('market_rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'market_rank' || key === 'code' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r =>
        r.code.toLowerCase().includes(q) ||
        (r.coname ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      if (sortKey === 'code') {
        const cmp = a.code.localeCompare(b.code)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const aRaw = a[sortKey]
      const bRaw = b[sortKey]
      const av = isNum(aRaw) ? aRaw : sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      const bv = isNum(bRaw) ? bRaw : sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      if (av === bv) return 0
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-500">市場リーダー Top 50</p>
        <span className="ml-auto text-xs text-gray-400">{sorted.length} 銘柄</span>
      </div>

      <table className="w-full min-w-[1200px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-[#e8eaed]">
            <SortTh label="#" tooltip="market_rank — 当日の市場ランク (1=トップ)" sortKey="market_rank" {...sp} align="center" className="w-10" />
            <SortTh label="Code" tooltip="銘柄コード (TradingView へリンク)" sortKey="code" {...sp} align="left" className="w-16" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-left text-gray-500">Name</th>
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-left text-gray-500">Sector (S33)</th>
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-center text-gray-500">Scale</th>
            <SortTh label="Close" sortKey="market_rank" {...sp} align="right" className="w-20" />
            <SortTh label="cs_avg" tooltip="クロスセクション RS 平均 0-100 (主軸スコア)。99.5=Stage A 上位 0.5%。rs_topix_avg とは別物。" sortKey="cs_avg" {...sp} align="left" className="w-32" />
            <SortTh label="vol_5d" tooltip="直近 5 営業日の出来高比。≥1.5 機関買い継続 / <0.7 出来高枯渇" sortKey="vol_5d" {...sp} align="center" className="w-20" />
            <SortTh label="21d %" tooltip="return_21d — 21 営業日リターン" sortKey="return_21d" {...sp} align="right" className="w-20" />
            <SortTh label="63d %" tooltip="return_63d — 63 営業日リターン" sortKey="return_63d" {...sp} align="right" className="w-20" />
            <SortTh label="売買代金" tooltip="turnover_oku — 売買代金 20日平均 (億円)" sortKey="turnover_oku" {...sp} align="right" className="w-20" />
            <SortTh label="時価総額" tooltip="mcap_oku — 時価総額 (億円)" sortKey="mcap_oku" {...sp} align="right" className="w-20" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-center text-gray-500">Route</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.code}
              className={`border-b border-[#f0f2f4] transition-colors ${
                i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
              } hover:bg-blue-50/40 cursor-pointer`}
              onClick={() => onSelectCode?.(r.code)}
            >
              <td className="px-2 py-1.5 text-center font-mono text-xs text-gray-700 tabular-nums font-semibold">
                {r.market_rank ?? '--'}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                <a
                  href={tradingViewUrl(r.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-[var(--accent)] hover:underline"
                >
                  {r.code}
                </a>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-xs" onClick={e => e.stopPropagation()}>
                <a
                  href={shikihoUrl(r.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-800 hover:text-[var(--accent)] hover:underline"
                >
                  {r.coname ?? '--'}
                </a>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                {r.s33nm ?? '--'}
              </td>
              <td className="px-2 py-1.5 text-center">
                <ScaleCatBadge cat={r.scalecat} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-700 tabular-nums">
                {isNum(r.close) ? r.close.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '--'}
              </td>
              <td className="px-2 py-1.5">
                <CsAvgCell value={r.cs_avg} />
              </td>
              <td className="px-2 py-1.5 text-center">
                <VolCell value={r.vol_5d} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <ReturnCell value={r.return_21d} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <ReturnCell value={r.return_63d} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                {fmt(r.turnover_oku, 0)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                {fmt(r.mcap_oku, 0)}
              </td>
              <td className="px-2 py-1.5 text-center">
                <PassRouteBadge route={r.pass_route} />
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

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 py-3 text-[11px] border-t border-[#f0f2f4] flex-wrap">
        <span className="text-gray-500">vol_5d:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#bbf7d0' }} />
          <span style={{ color: 'var(--text-secondary)' }}>≥1.5 機関買い継続</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#dcfce7' }} />
          <span style={{ color: 'var(--text-secondary)' }}>1.0–1.5 通常</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fef3c7' }} />
          <span style={{ color: 'var(--text-secondary)' }}>0.7–1.0 警戒</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fee2e2' }} />
          <span style={{ color: 'var(--text-secondary)' }}>&lt;0.7 出来高枯渇</span>
        </span>
      </div>
    </div>
  )
}
