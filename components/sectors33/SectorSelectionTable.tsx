'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  SectorSelectionRow,
  COMPONENT_META,
  COMPONENT_WEIGHTS,
  ComponentKey,
  MOMENTUM_CONFIG,
  compositeColor,
  componentColor,
  SectorMomentum,
} from '@/types/sectorSelection'
import Tooltip from '@/components/shared/Tooltip'

type SortKey = 'rank' | 'sector_name_s33' | 'composite_score' | ComponentKey | 'sector_stock_count_s33'
type SortDir = 'asc' | 'desc'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '--'
}

function MiniBar({ value }: { value: number | null | undefined }) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = componentColor(value)
  const label = isNum(value) ? value.toFixed(0) : '--'
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[24px]">
        <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
      </div>
      <span
        className="font-mono text-[10px] tabular-nums w-6 text-right"
        style={{ color: isNum(value) ? '#374151' : '#9ca3af' }}
      >
        {label}
      </span>
    </div>
  )
}

function MomentumBadge({ m }: { m: SectorMomentum | null }) {
  if (!m || !MOMENTUM_CONFIG[m]) {
    return <span className="text-xs text-gray-400">--</span>
  }
  const cfg = MOMENTUM_CONFIG[m]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.emoji} {cfg.label}
    </span>
  )
}

function CompositeCell({ score }: { score: number | null | undefined }) {
  const { bg, text } = compositeColor(score)
  const v = isNum(score) ? score.toFixed(1) : '--'
  return (
    <span
      className="inline-block min-w-[52px] text-center px-2 py-1 rounded-md font-mono text-sm font-bold tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {v}
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
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignClass} ${
        active ? 'text-[var(--accent)]' : 'text-gray-500'
      } ${className}`}
    >
      {inner}
      <span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

// ── Drilldown: 5 horizontal bars with weight annotation ─────────────────────
function DrilldownRow({ row, colSpan }: { row: SectorSelectionRow; colSpan: number }) {
  const total = isNum(row.composite_score) ? row.composite_score.toFixed(2) : '--'
  return (
    <tr className="bg-[#f8fafc] border-b border-[#e8eaed]">
      <td colSpan={colSpan} className="px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Left: 5 component bars */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600">
                スコア内訳 — {row.sector_name_s33}
                {row.sector_code_s33 && (
                  <span className="ml-2 text-gray-400 font-mono">[{row.sector_code_s33}]</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                合計 <span className="font-mono font-bold text-gray-700">{total}</span>
              </p>
            </div>
            <div className="space-y-2">
              {COMPONENT_META.map(meta => {
                const value = row[meta.key]
                const weight = COMPONENT_WEIGHTS[meta.key]
                const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
                const color = componentColor(value)
                return (
                  <div key={meta.key} className="flex items-center gap-3 text-xs">
                    <div className="w-32 flex items-center gap-1 shrink-0">
                      <Tooltip content={meta.tooltip}>
                        <span className="font-semibold text-gray-700">{meta.label}</span>
                      </Tooltip>
                      <span className="text-gray-400 font-mono">(×{weight.toFixed(2)})</span>
                    </div>
                    <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{ width: `${safe}%`, backgroundColor: color }}
                      />
                    </div>
                    <span
                      className="font-mono tabular-nums w-10 text-right text-gray-700"
                      style={{ color: isNum(value) ? '#374151' : '#9ca3af' }}
                    >
                      {isNum(value) ? value.toFixed(0) : '--'}
                    </span>
                    <span className="font-mono tabular-nums w-14 text-right text-gray-500">
                      {isNum(value) ? `→ ${(value * weight).toFixed(2)}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: contextual stats */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Stat label="RS 21d" value={fmt(row.sector_rs_21d_s33, 1)} />
            <Stat label="RS 63d" value={fmt(row.sector_rs_63d_s33, 1)} />
            <Stat label="RS加速" value={fmt(row.sector_rs_acc_s33, 2)} />
            <Stat label="ER 21d" value={fmt(row.sector_er_21d_s33, 4)} />
            <Stat label=">50MA %" value={fmt(row.sector_pct_above_50ma_s33, 1)} />
            <Stat label=">200MA %" value={fmt(row.sector_pct_above_200ma_s33, 1)} />
            <Stat label="52w高値圏 %" value={fmt(row.sector_pct_near_52w_high_s33, 1)} />
            <Stat label="MAスタック %" value={fmt(row.sector_pct_ma_stack_s33, 1)} />
            <Stat label="VCS≥80 %" value={fmt(row.sector_pct_vcs80_s33, 1)} />
            <Stat label="VCS中央" value={fmt(row.sector_vcs_median_s33, 1)} />
            <Stat label="空売り比率 5d" value={fmt(row.sector_short_va_ratio_5d_s33, 3)} />
            <Stat label="銘柄数" value={fmt(row.sector_stock_count_s33, 0)} />
          </div>
        </div>
      </td>
    </tr>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-gray-200 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono tabular-nums text-gray-800">{value}</span>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SectorSelectionTable({ rows }: { rows: SectorSelectionRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('composite_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hideLowConf, setHideLowConf] = useState(false)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // rank ascending feels natural; everything else descending
      setSortDir(key === 'rank' || key === 'sector_name_s33' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(
    () => (hideLowConf ? rows.filter(r => r.confidence_low !== 1) : rows),
    [rows, hideLowConf],
  )

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av: number | string
      let bv: number | string
      if (sortKey === 'rank') {
        av = a.composite_score_rank ?? Number.POSITIVE_INFINITY
        bv = b.composite_score_rank ?? Number.POSITIVE_INFINITY
      } else if (sortKey === 'sector_name_s33') {
        const cmp = (a.sector_name_s33 ?? '').localeCompare(b.sector_name_s33 ?? '', 'ja')
        return sortDir === 'asc' ? cmp : -cmp
      } else {
        const aRaw = a[sortKey]
        const bRaw = b[sortKey]
        av = isNum(aRaw) ? aRaw : Number.NEGATIVE_INFINITY
        bv = isNum(bRaw) ? bRaw : Number.NEGATIVE_INFINITY
      }
      if (av === bv) return 0
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const lowConfCount = rows.filter(r => r.confidence_low === 1).length
  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }
  const COL_COUNT = 5 + COMPONENT_META.length + 1 // rank, sector, score, momentum, ...5 comp, stock_count

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-500">セクター選別ランキング</p>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideLowConf}
            onChange={e => setHideLowConf(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          信頼度低 (銘柄数&lt;10) を除外
          {lowConfCount > 0 && (
            <span className="text-gray-400">({lowConfCount}件)</span>
          )}
        </label>
        <span className="text-xs text-gray-400">{sorted.length} sectors</span>
      </div>

      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-[#e8eaed]">
            <SortTh label="#"        tooltip="composite_score_rank — 当日ランク (1=トップ)" sortKey="rank"               {...sp} align="center" className="w-12" />
            <SortTh label="Sector"   tooltip="TOPIX-33 業種名"                              sortKey="sector_name_s33"    {...sp} align="left" />
            <SortTh label="Score"    tooltip="composite_score 0-100 (赤<30 / 黄30-60 / 緑≥60)" sortKey="composite_score"    {...sp} align="center" />
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-left text-gray-500">Trend</th>
            {COMPONENT_META.map(m => (
              <SortTh
                key={m.key}
                label={m.label}
                tooltip={`${m.tooltip} — 重み ×${COMPONENT_WEIGHTS[m.key].toFixed(2)}`}
                sortKey={m.key}
                {...sp}
                align="right"
                className="w-[110px]"
              />
            ))}
            <SortTh label="N" tooltip="セクター内銘柄数" sortKey="sector_stock_count_s33" {...sp} align="right" className="w-14" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isLow = row.confidence_low === 1
            const isOpen = expanded === row.sector_name_s33
            const rowKey = row.sector_name_s33
            return (
              <Fragment key={rowKey}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : rowKey)}
                  className={`border-b border-[#f0f2f4] cursor-pointer transition-colors ${
                    isOpen ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                  } hover:bg-gray-50 ${isLow ? 'opacity-60' : ''}`}
                  title={isLow ? '信頼度低: 銘柄数が少ないためノイズ大' : undefined}
                >
                  <td className="px-3 py-2 text-center font-mono text-xs text-gray-500 tabular-nums">
                    {row.composite_score_rank ?? '--'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-800">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-gray-400 text-[10px] w-3 inline-block">
                        {isOpen ? '▾' : '▸'}
                      </span>
                      {row.sector_name_s33}
                      {isLow && <span title="信頼度低">⚠️</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <CompositeCell score={row.composite_score} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <MomentumBadge m={row.sector_momentum_s33} />
                  </td>
                  {COMPONENT_META.map(m => (
                    <td key={m.key} className="px-3 py-2">
                      <MiniBar value={row[m.key]} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-600 tabular-nums">
                    {row.sector_stock_count_s33 ?? '--'}
                  </td>
                </tr>
                {isOpen && <DrilldownRow row={row} colSpan={COL_COUNT} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm">No data</div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 py-3 text-[11px] border-t border-[#f0f2f4] flex-wrap">
        <span className="text-gray-500">Score:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#dcfce7' }} />
          <span style={{ color: 'var(--text-secondary)' }}>強 ≥60</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fef3c7' }} />
          <span style={{ color: 'var(--text-secondary)' }}>中 30-60</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fee2e2' }} />
          <span style={{ color: 'var(--text-secondary)' }}>弱 &lt;30</span>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">⚠️ confidence_low = 銘柄数&lt;10</span>
      </div>
    </div>
  )
}
