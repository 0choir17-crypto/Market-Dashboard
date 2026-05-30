'use client'

import { useMemo, useState } from 'react'
import type { ScanResultRow } from '@/types/scanResults'
import ScanResultCard from './ScanResultCard'

type Props = {
  rows: ScanResultRow[]
  hotSectors: string[]
}

type SignalFilter = string

export default function ScanResultsSection({ rows, hotSectors }: Props) {
  const [signal, setSignal] = useState<SignalFilter>('all')

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const signalOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const key = r.signal ?? '—'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count }))
  }, [rows])

  const filtered = useMemo(() => {
    if (signal === 'all') return rows
    return rows.filter(r => (r.signal ?? '—') === signal)
  }, [rows, signal])

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">本日のスキャン候補は 0 件です。</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Signal:</span>
        <FilterChip
          label="All"
          count={rows.length}
          active={signal === 'all'}
          onClick={() => setSignal('all')}
        />
        {signalOptions.map(opt => (
          <FilterChip
            key={opt.key}
            label={opt.key}
            count={opt.count}
            active={signal === opt.key}
            onClick={() => setSignal(opt.key)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((row, i) => (
          <ScanResultCard
            key={`${row.code}-${i}`}
            row={row}
            hot={row.sector != null && hotSet.has(row.sector)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-4 bg-white rounded-xl border border-[#e8eaed] p-8 text-center text-[var(--text-muted)]">
          <p className="text-sm">該当する候補がありません</p>
        </div>
      )}
    </>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'bg-white text-gray-700 border-[var(--border)] hover:bg-gray-50'
      }`}
    >
      <span className="uppercase tracking-wide">{label}</span>
      <span
        className={`ml-1.5 text-[10px] ${
          active ? 'opacity-90' : 'text-gray-400'
        }`}
      >
        {count}
      </span>
    </button>
  )
}
