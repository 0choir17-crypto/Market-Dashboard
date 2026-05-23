'use client'

import { useState, useMemo } from 'react'
import type { StructurePivotRow } from '@/types/structurePivot'
import RegimeBadge from './RegimeBadge'
import InstitutionalReasonTooltip from './InstitutionalReasonTooltip'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import { WatchlistItem } from '@/types/portfolio'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

type SortKey =
  | 'quality_tier'
  | 'signal_type'
  | 'days_in_setup'
  | 'vcp_days_since'
  | 'pivot_price'
  | 'break_dist_pct'
  | 'close'
  | 'rvol'
  | 'adr_pct'
  | 'cockpit_rs'
  | 'vcs_score'
  | 'sector_s33'
  | 'code'

type SortDir = 'asc' | 'desc'

// Tier sort: S < A < B (S最上位)
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2 }
// Signal sort: HL_BREAK > SETUP_LONG (HL_BREAK 最上位)
const SIGNAL_ORDER: Record<string, number> = { HL_BREAK: 0, SETUP_LONG: 1 }

type Props = {
  rows: StructurePivotRow[]
  onSelect: (code: string) => void
  selectedCode: string | null
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimals)
}

function fmtSignedPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

function TierBadge({ tier }: { tier: string }) {
  const meta =
    tier === 'S'
      ? {
          label: '⭐ S',
          bg: '#fef3c7',
          color: '#92400e',
          border: '#fcd34d',
        }
      : tier === 'A'
        ? {
            label: '🅰️ A',
            bg: '#e5e7eb',
            color: '#374151',
            border: '#9ca3af',
          }
        : {
            label: '⚪ B',
            bg: '#f9fafb',
            color: '#6b7280',
            border: '#e5e7eb',
          }
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] font-bold"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
      }}
    >
      {meta.label}
    </span>
  )
}

function SignalBadge({ kind }: { kind: string }) {
  const meta =
    kind === 'HL_BREAK'
      ? {
          label: '🔵 HL_BREAK',
          bg: '#dbeafe',
          color: '#1e40af',
          border: '#93c5fd',
        }
      : {
          label: '🟡 SETUP',
          bg: '#fef9c3',
          color: '#854d0e',
          border: '#fde68a',
        }
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] font-bold"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
      }}
    >
      {meta.label}
    </span>
  )
}

function VcpCell({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400 text-xs">—</span>
  const meta =
    days <= 21
      ? { bg: '#dcfce7', color: '#166534', border: '#86efac' }
      : days <= 63
        ? { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' }
        : { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' }
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
      }}
      title={`VCP hit ${days}d ago`}
    >
      📅 {days}d
    </span>
  )
}

function DaysCell({ d }: { d: number | null }) {
  if (d == null) return <span className="text-gray-400 text-xs">—</span>
  const long = d >= 30
  return (
    <span
      className={`font-mono text-xs ${long ? 'font-bold' : ''}`}
      style={{ color: long ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      title={long ? 'Long base (≥30d)' : undefined}
    >
      {d}
    </span>
  )
}

function DistCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400 text-xs">—</span>
  // 負値: 既に超えた → 緑
  // 正値: pivot_price まで距離あり → 赤
  const color = v < 0 ? 'var(--positive)' : 'var(--negative)'
  return (
    <span className="font-mono text-xs font-semibold" style={{ color }}>
      {fmtSignedPct(v)}
    </span>
  )
}

function RvolCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400 text-xs">—</span>
  const high = v >= 1.5
  return (
    <span
      className={`font-mono text-xs ${high ? 'font-bold' : ''}`}
      style={{ color: high ? 'var(--positive)' : 'inherit' }}
      title={high ? '出来高伴う (RVOL ≥1.5)' : undefined}
    >
      {fmt(v)}
    </span>
  )
}

function RsCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400 text-xs">—</span>
  // 80-90 緑, ≥90 赤 (過熱), <80 そのまま
  const color =
    v >= 90
      ? 'var(--negative)'
      : v >= 80
        ? 'var(--positive)'
        : 'var(--text-primary)'
  const bold = v >= 80
  return (
    <span
      className={`font-mono text-xs ${bold ? 'font-bold' : ''}`}
      style={{ color }}
      title={
        v >= 90
          ? '過熱 (RS ≥90)'
          : v >= 80
            ? '高 RS (80–90)'
            : undefined
      }
    >
      {fmt(v, 1)}
    </span>
  )
}

function VcsCell({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-400 text-xs">—</span>
  const sweet = v >= 70 && v < 80
  return (
    <span
      className={`font-mono text-xs ${sweet ? 'font-bold' : ''}`}
      style={{ color: sweet ? 'var(--positive)' : 'var(--text-primary)' }}
      title={sweet ? '最強帯 (VCS 70–80)' : undefined}
    >
      {fmt(v, 1)}
    </span>
  )
}

function InstitutionalCell({ row }: { row: StructurePivotRow }) {
  if (row.jq_institutional_pass == null) {
    return <span className="text-gray-300 text-xs">—</span>
  }
  const pass = row.jq_institutional_pass
  return (
    <span className="relative inline-block group/inst">
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] font-bold cursor-help"
        style={
          pass
            ? {
                backgroundColor: '#ede9fe',
                color: '#5b21b6',
                border: '1px solid #ddd6fe',
              }
            : {
                backgroundColor: '#f9fafb',
                color: '#9ca3af',
                border: '1px solid #e5e7eb',
              }
        }
        title={pass ? 'Institutional pass' : 'Institutional fail'}
      >
        {pass ? '🏛️' : '·'}
      </span>
      {row.jq_institutional_reason && (
        <span className="absolute z-20 hidden group-hover/inst:block right-0 top-full mt-1 whitespace-normal">
          <InstitutionalReasonTooltip
            reason={row.jq_institutional_reason}
            pass={pass}
          />
        </span>
      )}
    </span>
  )
}

function ScreensCell({ raw }: { raw: string | null }) {
  if (!raw) return <span className="text-gray-400 text-xs">—</span>
  const screens = raw.split('|').map(s => s.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1">
      {screens.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] font-medium"
          style={{
            backgroundColor: '#eef2ff',
            color: '#4338ca',
            border: '1px solid #c7d2fe',
          }}
        >
          {s}
        </span>
      ))}
    </div>
  )
}

function SortTh({
  label,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  title,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right' | 'center'
  title?: string
}) {
  const active = currentKey === key
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const alignCls =
    align === 'right'
      ? 'text-right'
      : align === 'center'
        ? 'text-center'
        : 'text-left'
  return (
    <th
      onClick={() => onSort(key)}
      title={title}
      className={`px-2 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignCls} ${
        active ? 'text-[var(--accent)]' : 'text-gray-500'
      }`}
    >
      {label}
      <span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

function pivotInitialFromRow(row: StructurePivotRow): Partial<WatchlistItem> {
  return {
    ticker: row.code,
    company_name: row.name ?? undefined,
    screen_tag: row.signal_type === 'HL_BREAK' ? 'Pivot HL_BREAK' : 'Pivot SETUP',
    rs_composite: row.cockpit_rs ?? undefined,
    rvol: row.rvol ?? undefined,
    adr_pct: row.adr_pct ?? undefined,
    sector_s33: row.sector_s33 ?? undefined,
    signal_price: row.close ?? undefined,
  }
}

export default function StructurePivotTable({
  rows,
  onSelect,
  selectedCode,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('quality_tier')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      // tier / signal は ASC が自然 (S→A→B / HL→SETUP)、それ以外は DESC
      setSortDir(k === 'quality_tier' || k === 'signal_type' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      // 多段デフォルト: tier → signal → days_in_setup
      if (sortKey === 'quality_tier') {
        const av = TIER_ORDER[a.quality_tier] ?? 9
        const bv = TIER_ORDER[b.quality_tier] ?? 9
        if (av !== bv) return (av - bv) * dir
        const sa = SIGNAL_ORDER[a.signal_type] ?? 9
        const sb = SIGNAL_ORDER[b.signal_type] ?? 9
        if (sa !== sb) return sa - sb
        return (b.days_in_setup ?? 0) - (a.days_in_setup ?? 0)
      }
      if (sortKey === 'signal_type') {
        const av = SIGNAL_ORDER[a.signal_type] ?? 9
        const bv = SIGNAL_ORDER[b.signal_type] ?? 9
        if (av !== bv) return (av - bv) * dir
        return (b.days_in_setup ?? 0) - (a.days_in_setup ?? 0)
      }
      if (sortKey === 'sector_s33' || sortKey === 'code') {
        const av = (a[sortKey] as string | null) ?? ''
        const bv = (b[sortKey] as string | null) ?? ''
        return av.localeCompare(bv, 'ja') * dir
      }
      const av = (a[sortKey] as number | null) ?? null
      const bv = (b[sortKey] as number | null) ?? null
      // null は常に末尾
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av === bv) return 0
      return (av - bv) * dir
    })
  }, [rows, sortKey, sortDir])

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  if (sorted.length === 0) {
    return (
      <div
        className="card p-8 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <p className="text-sm">該当する候補がありません</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-[#e8eaed]">
            <SortTh label="Code" sortKey="code" {...sp} align="left" />
            <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Name
            </th>
            <SortTh label="Sector" sortKey="sector_s33" {...sp} align="left" />
            <SortTh
              label="Signal"
              sortKey="signal_type"
              {...sp}
              align="center"
              title="HL_BREAK / SETUP_LONG"
            />
            <SortTh
              label="Tier"
              sortKey="quality_tier"
              {...sp}
              align="center"
              title="Quality tier (S/A/B)"
            />
            <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Regime
            </th>
            <SortTh
              label="VCP"
              sortKey="vcp_days_since"
              {...sp}
              align="center"
              title="vcp_days_since"
            />
            <SortTh
              label="Days"
              sortKey="days_in_setup"
              {...sp}
              title="days_in_setup (HL 連続日数)"
            />
            <SortTh
              label="Pivot"
              sortKey="pivot_price"
              {...sp}
              title="pivot_price (break target)"
            />
            <SortTh
              label="Dist"
              sortKey="break_dist_pct"
              {...sp}
              title="(pivot - close)/close. 負=既に超えた / 正=未到達"
            />
            <SortTh label="Close" sortKey="close" {...sp} />
            <SortTh
              label="RVOL"
              sortKey="rvol"
              {...sp}
              title="≥1.5 で出来高伴う"
            />
            <SortTh label="ADR%" sortKey="adr_pct" {...sp} />
            <SortTh
              label="RS"
              sortKey="cockpit_rs"
              {...sp}
              title="cockpit_rs. 80–90 緑 / ≥90 赤 (過熱)"
            />
            <SortTh
              label="VCS"
              sortKey="vcs_score"
              {...sp}
              title="vcs_score. 70–80 が最強帯"
            />
            <th className="px-2 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              Screens
            </th>
            <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
              WL
            </th>
            <th
              className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap"
              title="Phase 4 Screen B (Institutional accumulation)"
            >
              Inst
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const isSelected = selectedCode === r.code
            return (
              <tr
                key={`${r.code}-${i}`}
                onClick={() => onSelect(r.code)}
                className={`border-b border-[#f0f2f4] transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-50 hover:bg-amber-100'
                    : i % 2 === 0
                      ? 'bg-white hover:bg-gray-50'
                      : 'bg-[#fafafa] hover:bg-gray-100'
                } ${
                  r.signal_type === 'HL_BREAK'
                    ? 'border-l-2 border-l-blue-400'
                    : ''
                }`}
              >
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <a
                    href={tradingViewUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="font-mono font-bold text-blue-600 hover:underline text-sm"
                  >
                    {r.code}
                  </a>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <a
                    href={shikihoUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="block text-xs text-gray-600 hover:underline max-w-[160px] truncate"
                    title={r.name ?? ''}
                  >
                    {r.name ?? '—'}
                  </a>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <span
                    className="block text-xs text-gray-500 max-w-[100px] truncate"
                    title={r.sector_s33 ?? ''}
                  >
                    {r.sector_s33 ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  <SignalBadge kind={r.signal_type} />
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  <TierBadge tier={r.quality_tier} />
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  {r.regime ? (
                    <RegimeBadge regime={r.regime} />
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                  <VcpCell days={r.vcp_days_since} />
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <DaysCell d={r.days_in_setup} />
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {fmt(r.pivot_price)}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <DistCell v={r.break_dist_pct} />
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {fmt(r.close)}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <RvolCell v={r.rvol} />
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                  {fmt(r.adr_pct)}
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <RsCell v={r.cockpit_rs} />
                </td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  <VcsCell v={r.vcs_score} />
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <ScreensCell raw={r.daily_signals_screens} />
                </td>
                <td
                  className="px-2 py-2.5 text-center whitespace-nowrap"
                  onClick={e => e.stopPropagation()}
                >
                  {r.in_watchlist ? (
                    <button
                      onClick={() => setWatchTarget(pivotInitialFromRow(r))}
                      title="Watchlist 在席（クリックで再登録/編集）"
                      className="text-amber-500 hover:text-amber-600"
                    >
                      ⭐
                    </button>
                  ) : (
                    <button
                      onClick={() => setWatchTarget(pivotInitialFromRow(r))}
                      className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 hover:underline leading-none"
                    >
                      + Watch
                    </button>
                  )}
                </td>
                <td
                  className="px-2 py-2.5 text-center whitespace-nowrap"
                  onClick={e => e.stopPropagation()}
                >
                  <InstitutionalCell row={r} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <WatchlistModal
        open={watchTarget !== null}
        onClose={() => setWatchTarget(null)}
        onSaved={() => setWatchTarget(null)}
        initial={watchTarget ?? undefined}
      />
    </div>
  )
}
