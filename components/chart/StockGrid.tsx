'use client'

import { useEffect, useRef, useState } from 'react'
import type { OhlcvBar, StructurePivotPhase } from '@/types/chart'
import { fetchChart } from '@/lib/chartFetch'
import StockCard, { CardOverrides } from './StockCard'

type CacheEntry = {
  bars: OhlcvBar[]
  structurePivotPhases: StructurePivotPhase[]
}

export interface GridEntry {
  code: string
  name?: string | null
  sector?: string | null
  overrides?: CardOverrides
}

interface Props {
  entries: GridEntry[]
  /** Initial number of cards rendered. The user can expand via "もっと見る". */
  pageSize?: number
  /** Trading days of history to load per card (default ≈ 6 months). */
  lookbackDays?: number | null
  selectedCode?: string | null
  onSelect?: (code: string) => void
  /** When provided, each card renders a "+ Watch" button that calls this with the card's code. */
  onWatch?: (code: string) => void
}

type Cache = Map<string, CacheEntry>

export default function StockGrid({
  entries,
  pageSize = 12,
  lookbackDays = 126,
  selectedCode,
  onSelect,
  onWatch,
}: Props) {
  const [shown, setShown] = useState(pageSize)
  const [prevEntries, setPrevEntries] = useState(entries)
  const [cache, setCache] = useState<Cache>(new Map())

  // Reset visible window when the entries reference changes (filter / preset / data refresh)
  if (prevEntries !== entries) {
    setPrevEntries(entries)
    setShown(pageSize)
  }

  // Track in-flight fetches in a ref so the effect doesn't re-run on every change
  const inflightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const visible = entries.slice(0, shown).map(e => e.code)
    const missing = visible.filter(
      c => !cache.has(c) && !inflightRef.current.has(c),
    )
    if (missing.length === 0) return

    let cancelled = false
    missing.forEach(c => inflightRef.current.add(c))

    Promise.all(
      missing.map(code =>
        fetchChart(code, { lookbackDays })
          .then(res => ({
            code,
            bars: res.ohlcv,
            structurePivotPhases: res.structurePivotPhases ?? [],
          }))
          .catch(() => ({
            code,
            bars: [] as OhlcvBar[],
            structurePivotPhases: [] as StructurePivotPhase[],
          })),
      ),
    ).then(results => {
      results.forEach(r => inflightRef.current.delete(r.code))
      if (cancelled) return
      setCache(prev => {
        const next = new Map(prev)
        for (const r of results) {
          next.set(r.code, {
            bars: r.bars,
            structurePivotPhases: r.structurePivotPhases,
          })
        }
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [entries, shown, lookbackDays, cache])

  const visible = entries.slice(0, shown)
  const hasMore = entries.length > shown

  if (entries.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-[var(--text-muted)]">
        該当する銘柄がありません
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.map(entry => {
          const cached = cache.get(entry.code)
          if (cached == null) {
            return (
              <div
                key={entry.code}
                className="card p-3 flex flex-col gap-2"
                style={{ minHeight: 280 }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-[var(--text-muted)]">
                    {entry.code}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] truncate">
                    {entry.name ?? ''}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
                  Loading…
                </div>
              </div>
            )
          }
          return (
            <StockCard
              key={entry.code}
              code={entry.code}
              name={entry.name ?? undefined}
              sector={entry.sector ?? undefined}
              bars={cached.bars}
              structurePivotPhases={cached.structurePivotPhases}
              overrides={entry.overrides}
              selected={selectedCode === entry.code}
              onSelect={onSelect}
              onWatch={onWatch}
            />
          )
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-3">
          <button
            onClick={() => setShown(s => Math.min(entries.length, s + pageSize))}
            className="text-xs font-medium px-4 py-2 rounded-lg border bg-white border-[var(--border)] text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
          >
            もっと見る ({entries.length - shown} 件残り)
          </button>
        </div>
      )}
    </>
  )
}
