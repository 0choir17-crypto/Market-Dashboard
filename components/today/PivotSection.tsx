'use client'

import { useMemo, useState } from 'react'
import type {
  StructurePivotRow,
  StructurePivotSummary,
  StructurePivotSignalType,
  StructurePivotTier,
} from '@/types/structurePivot'
import StructurePivotHeader from '@/components/structurePivot/StructurePivotHeader'
import StructurePivotLegend from '@/components/structurePivot/StructurePivotLegend'
import StructurePivotFilter, {
  type SignalFilter,
  type StructurePivotFilters,
  type TierFilter,
} from '@/components/structurePivot/StructurePivotFilter'
import StructurePivotTable from '@/components/structurePivot/StructurePivotTable'

const INITIAL_FILTERS: StructurePivotFilters = {
  signal: 'all',
  tier: 'all',
  vcpOnly: false,
  watchlistOnly: false,
  institutionalOnly: false,
}

type Props = {
  rows: StructurePivotRow[]
  selectedCode: string | null
  onSelect: (code: string) => void
}

export default function PivotSection({ rows, selectedCode, onSelect }: Props) {
  const [filters, setFilters] = useState<StructurePivotFilters>(INITIAL_FILTERS)

  const summary: StructurePivotSummary = useMemo(() => {
    const s: StructurePivotSummary = {
      total: rows.length,
      by_tier: { S: 0, A: 0, B: 0 },
      by_signal: { HL_BREAK: 0, SETUP_LONG: 0 },
    }
    for (const r of rows) {
      const t = r.quality_tier as StructurePivotTier
      if (t === 'S' || t === 'A' || t === 'B') s.by_tier[t] += 1
      const sig = r.signal_type as StructurePivotSignalType
      if (sig === 'HL_BREAK' || sig === 'SETUP_LONG') s.by_signal[sig] += 1
    }
    return s
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filters.signal !== 'all' && r.signal_type !== filters.signal) return false
      if (filters.tier !== 'all' && r.quality_tier !== filters.tier) return false
      if (filters.vcpOnly && !r.vcp_within_21d) return false
      if (filters.watchlistOnly && !r.in_watchlist) return false
      if (filters.institutionalOnly && !r.jq_institutional_pass) return false
      return true
    })
  }, [rows, filters])

  const signalCounts: Record<SignalFilter, number> = useMemo(() => {
    const c: Record<SignalFilter, number> = {
      all: rows.length,
      HL_BREAK: 0,
      SETUP_LONG: 0,
    }
    for (const r of rows) {
      if (r.signal_type === 'HL_BREAK') c.HL_BREAK += 1
      else if (r.signal_type === 'SETUP_LONG') c.SETUP_LONG += 1
    }
    return c
  }, [rows])

  const tierCounts: Record<TierFilter, number> = useMemo(() => {
    const c: Record<TierFilter, number> = { all: rows.length, S: 0, A: 0, B: 0 }
    for (const r of rows) {
      if (r.quality_tier === 'S') c.S += 1
      else if (r.quality_tier === 'A') c.A += 1
      else if (r.quality_tier === 'B') c.B += 1
    }
    return c
  }, [rows])

  const regime = useMemo(
    () => rows.find(r => r.regime != null)?.regime ?? null,
    [rows],
  )
  const mcV4 = useMemo(
    () => rows.find(r => r.mc_v4 != null)?.mc_v4 ?? null,
    [rows],
  )

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">本日の Structure Pivot 候補は 0 件です。</p>
      </div>
    )
  }

  return (
    <>
      <StructurePivotHeader summary={summary} regime={regime} mcV4={mcV4} />
      <StructurePivotLegend />
      <StructurePivotFilter
        filters={filters}
        onChange={setFilters}
        signalCounts={signalCounts}
        tierCounts={tierCounts}
      />
      <div className="mb-2 text-xs text-gray-500">
        Showing {filtered.length} of {rows.length} rows
        {filtered.length < rows.length && ' (filtered)'}
      </div>
      <StructurePivotTable
        rows={filtered}
        onSelect={onSelect}
        selectedCode={selectedCode}
      />
    </>
  )
}
