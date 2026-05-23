'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import VcpSection from '@/components/today/VcpSection'

export default function TodayPage() {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TodayResponse>({
    vcpDate: null,
    vcp: [],
    market: null,
    hotSectors: [],
  })
  const [loading, setLoading] = useState(true)

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

  const displayDate = data.vcpDate ?? selectedDate

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
            VCP 候補一覧（{data.vcp.length} 件）
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

      {loading && data.vcp.length === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">Loading...</p>
        </div>
      ) : (
        <VcpSection rows={data.vcp} />
      )}
    </main>
  )
}
