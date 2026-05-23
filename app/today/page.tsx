'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import CardsView from '@/components/today/CardsView'
import VcpSection from '@/components/today/VcpSection'
import PivotSection from '@/components/today/PivotSection'
import SignalsSection from '@/components/today/SignalsSection'
import StockChartView from '@/components/chart/StockChartView'
import ViewToggle, { type ViewMode } from '@/components/chart/ViewToggle'

type TableSection = 'vcp' | 'pivot' | 'signals'

export default function TodayPage() {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TodayResponse>({
    vcpDate: null,
    pivotDate: null,
    signalsDate: null,
    vcp: [],
    pivot: [],
    signals: [],
    market: null,
    hotSectors: [],
  })
  const [loading, setLoading] = useState(true)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [tableSection, setTableSection] = useState<TableSection>('vcp')
  const detailRef = useRef<HTMLDivElement | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const result = await fetchToday({
      date: !isLatest && selectedDate ? selectedDate : undefined,
    })
    setData(result)
    setLoading(false)
  }, [selectedDate, isLatest])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (selectedCode && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedCode])

  const handleSelect = (code: string) => {
    setSelectedCode(prev => (prev === code ? null : code))
  }

  const selectedMeta = useMemo(() => {
    if (!selectedCode) return null
    const v = data.vcp.find(r => r.code === selectedCode)
    if (v) return { name: v.name, sector: v.sector_s33 }
    const p = data.pivot.find(r => r.code === selectedCode)
    if (p) return { name: p.name, sector: p.sector_s33 }
    const s = data.signals.find(r => r.code === selectedCode)
    if (s) return { name: s.company_name, sector: s.sector_s33 }
    return null
  }, [selectedCode, data])

  const totalTickers = useMemo(() => {
    const set = new Set<string>()
    data.vcp.forEach(r => set.add(r.code))
    data.pivot.forEach(r => set.add(r.code))
    data.signals.forEach(r => set.add(r.code))
    return set.size
  }, [data])

  const sectionCounts = {
    vcp: data.vcp.length,
    pivot: data.pivot.length,
    signals: data.signals.length,
  }

  const displayDate =
    data.vcpDate ?? data.pivotDate ?? data.signalsDate ?? selectedDate

  return (
    <main
      className="min-h-screen p-6"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans, sans-serif)',
            }}
          >
            <span aria-hidden className="mr-2">📋</span>Today&apos;s Watchlist
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            VCP / Structure Pivot / Daily Signals を 1 画面で確認（{totalTickers} unique tickers）
          </p>
        </div>
        <div className="flex items-center gap-4">
          {displayDate && (
            <span
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {isLatest ? '' : 'Snapshot: '}
              {displayDate}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-white hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        {viewMode === 'table' && (
          <div className="inline-flex gap-1 bg-white rounded-lg border border-[var(--border)] p-1">
            {(['vcp', 'pivot', 'signals'] as TableSection[]).map(s => {
              const active = s === tableSection
              const label =
                s === 'vcp' ? 'VCP' : s === 'pivot' ? 'Pivot' : 'Signals'
              return (
                <button
                  key={s}
                  onClick={() => setTableSection(s)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:bg-gray-50'
                  }`}
                >
                  {label}
                  <span className={`ml-1 text-[10px] ${active ? 'opacity-90' : 'text-gray-400'}`}>
                    {sectionCounts[s]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {loading && totalTickers === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">Loading...</p>
        </div>
      ) : !loading && totalTickers === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">本日の候補は 0 件です。</p>
        </div>
      ) : viewMode === 'cards' ? (
        <CardsView
          vcp={data.vcp}
          pivot={data.pivot}
          signals={data.signals}
          hotSectors={data.hotSectors}
        />
      ) : tableSection === 'vcp' ? (
        <VcpSection rows={data.vcp} />
      ) : tableSection === 'pivot' ? (
        <PivotSection
          rows={data.pivot}
          selectedCode={selectedCode}
          onSelect={handleSelect}
        />
      ) : (
        <SignalsSection signals={data.signals} market={data.market} />
      )}

      {selectedCode && (
        <div ref={detailRef} className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              Detail — {selectedCode}
            </h2>
            <button
              onClick={() => setSelectedCode(null)}
              className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-white hover:bg-gray-50 text-[var(--text-secondary)]"
            >
              閉じる ✕
            </button>
          </div>
          <StockChartView
            code={selectedCode}
            name={selectedMeta?.name ?? null}
            sector={selectedMeta?.sector ?? null}
          />
        </div>
      )}
    </main>
  )
}
