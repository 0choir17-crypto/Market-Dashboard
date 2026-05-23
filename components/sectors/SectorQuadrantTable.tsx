'use client'

import { useState } from 'react'
import { SectorData, Quadrant, getQuadrant, QUADRANT_CONFIG } from '@/types/sectors'
import Tooltip from '@/components/shared/Tooltip'

// ── Sort key includes 'quadrant' as a virtual key ────────────────────────────
type SortKey = keyof SectorData | 'quadrant'
type SortDir = 'asc' | 'desc'
type ExtendedSector = SectorData & { _q: Quadrant }

// ── Quadrant order for sorting ────────────────────────────────────────────────
const QUADRANT_ORDER: Record<Quadrant, number> = {
  leader:    1,
  improving: 2,
  weakening: 3,
  lagging:   4,
}

// ── Column tooltips ───────────────────────────────────────────────────────────
const COLUMN_TOOLTIPS: Record<string, string> = {
  sector_name:     'TOPIX-17 sector index classification',
  quadrant:        'Phase based on 21D% × 5D% quadrant position',
  chg_1d_pct:      'Daily change (%)',
  chg_5d_pct:      '5-day change (%) — RRG Y-axis',
  chg_21d_pct:     '21-day change (%) — medium-term momentum',
  pct_from_52wh:   'Distance from 52-week high (%)',
  dist_sma25_pct:  'Distance from 25-day SMA (%)',
  dist_sma50_pct:  'Distance from 50-day SMA (%) — RRG X-axis',
  dist_ema21_pct:  'Distance from 21-day EMA (%)',
  rs_1d:           'Today\'s Relative Strength (percentile rank among all 17 sectors, 0–100)',
  rs_1w:           'RS value 5 business days ago',
  rs_1m:           'RS value 21 business days ago',
  rs_chg_1w:       '1-week RS change. Positive = strengthening, negative = weakening',
  rs_chg_1m:       '1-month RS change. Positive = strengthening, negative = weakening',
}

type QuadrantFilter = 'all' | Quadrant

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(decimals)
}

function ChangePill({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>
  const pos = value >= 0
  return (
    <span className="font-mono text-xs font-semibold" style={{ color: pos ? 'var(--positive)' : 'var(--negative)' }}>
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function RSCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400 font-mono text-xs">—</span>
  const v = value
  if (v >= 70) return <span className="font-mono text-xs font-bold text-green-600">{v.toFixed(0)}</span>
  if (v <= 30) return <span className="font-mono text-xs font-bold text-red-600">{v.toFixed(0)}</span>
  return <span className="font-mono text-xs text-gray-700">{v.toFixed(0)}</span>
}

function RSChangeCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400 font-mono text-xs">—</span>
  if (value > 0) return <span className="font-mono text-xs font-semibold text-green-600">+{value.toFixed(1)}</span>
  if (value < 0) return <span className="font-mono text-xs font-semibold text-red-600">{value.toFixed(1)}</span>
  return <span className="font-mono text-xs text-gray-400">0.0</span>
}

function QuadrantBadge({ q }: { q: Quadrant }) {
  const cfg = QUADRANT_CONFIG[q]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.emoji} {cfg.label}
    </span>
  )
}

// ── Sortable header ───────────────────────────────────────────────────────────
function SortTh({
  label,
  tooltip,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
}: {
  label: string
  tooltip?: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active    = currentKey === key
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const labelEl   = tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : <>{label}</>

  return (
    <th
      onClick={() => onSort(key)}
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-[var(--accent)]' : 'text-gray-500'}`}
    >
      {labelEl}<span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SectorQuadrantTable({ sectors }: { sectors: SectorData[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('chg_21d_pct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [qFilter, setQFilter] = useState<QuadrantFilter>('all')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const withQuadrant: ExtendedSector[] = sectors.map(s => ({ ...s, _q: getQuadrant(s) }))

  const filtered = qFilter === 'all'
    ? withQuadrant
    : withQuadrant.filter(s => s._q === qFilter)

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'sector_name') {
      const av = a.sector_name ?? ''
      const bv = b.sector_name ?? ''
      return sortDir === 'asc' ? av.localeCompare(bv, 'ja') : bv.localeCompare(av, 'ja')
    }
    if (sortKey === 'quadrant') {
      return sortDir === 'asc'
        ? QUADRANT_ORDER[a._q] - QUADRANT_ORDER[b._q]
        : QUADRANT_ORDER[b._q] - QUADRANT_ORDER[a._q]
    }
    const av = (a[sortKey as keyof SectorData] as number | null) ?? -Infinity
    const bv = (b[sortKey as keyof SectorData] as number | null) ?? -Infinity
    if (av === bv) return 0
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const FILTER_BUTTONS: { key: QuadrantFilter; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'leader',    label: '🟢 Leader' },
    { key: 'improving', label: '🔵 Improving' },
    { key: 'weakening', label: '🟡 Weakening' },
    { key: 'lagging',   label: '🔴 Lagging' },
  ]

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      {/* 象限フィルター */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 flex-wrap">
        {FILTER_BUTTONS.map(btn => (
          <button
            key={btn.key}
            onClick={() => setQFilter(btn.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              qFilter === btn.key
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {btn.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{sorted.length} sectors</span>
      </div>

      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-[#e8eaed] border-t border-t-[#e8eaed]">
            <SortTh label="Sector"      tooltip={COLUMN_TOOLTIPS.sector_name}    sortKey="sector_name"    {...sp} align="left" />
            <SortTh label="Phase"       tooltip={COLUMN_TOOLTIPS.quadrant}       sortKey="quadrant"       {...sp} align="left" />
            <SortTh label="RS"          tooltip={COLUMN_TOOLTIPS.rs_1d}          sortKey="rs_1d"          {...sp} />
            <SortTh label="RS(1W)"      tooltip={COLUMN_TOOLTIPS.rs_1w}          sortKey="rs_1w"          {...sp} />
            <SortTh label="RS(1M)"      tooltip={COLUMN_TOOLTIPS.rs_1m}          sortKey="rs_1m"          {...sp} />
            <SortTh label="RS Δ1W"     tooltip={COLUMN_TOOLTIPS.rs_chg_1w}      sortKey="rs_chg_1w"      {...sp} />
            <SortTh label="RS Δ1M"     tooltip={COLUMN_TOOLTIPS.rs_chg_1m}      sortKey="rs_chg_1m"      {...sp} />
            <SortTh label="5D%"         tooltip={COLUMN_TOOLTIPS.chg_5d_pct}     sortKey="chg_5d_pct"     {...sp} />
            <SortTh label="21D%"        tooltip={COLUMN_TOOLTIPS.chg_21d_pct}    sortKey="chg_21d_pct"    {...sp} />
            <SortTh label="52W High%"   tooltip={COLUMN_TOOLTIPS.pct_from_52wh}  sortKey="pct_from_52wh"  {...sp} />
            <SortTh label="SMA50%"      tooltip={COLUMN_TOOLTIPS.dist_sma50_pct} sortKey="dist_sma50_pct" {...sp} />
            <SortTh label="EMA21%"      tooltip={COLUMN_TOOLTIPS.dist_ema21_pct} sortKey="dist_ema21_pct" {...sp} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr
              key={s.sector_name}
              className={`border-b border-[#f0f2f4] hover:bg-gray-50 transition-colors ${
                i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
              }`}
            >
              <td className="px-3 py-2.5 whitespace-nowrap text-xs font-medium text-gray-800">{s.sector_name}</td>
              <td className="px-3 py-2.5 whitespace-nowrap"><QuadrantBadge q={s._q} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><RSCell value={s.rs_1d} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><RSCell value={s.rs_1w} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><RSCell value={s.rs_1m} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><RSChangeCell value={s.rs_chg_1w} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><RSChangeCell value={s.rs_chg_1m} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><ChangePill value={s.chg_5d_pct} /></td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap"><ChangePill value={s.chg_21d_pct} /></td>
              <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(s.pct_from_52wh)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(s.dist_sma50_pct)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(s.dist_ema21_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm">No data</div>
      )}
    </div>
  )
}
