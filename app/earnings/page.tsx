'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchEarningsQualitySnapshot,
  type EarningsQualitySnapshot,
} from '@/lib/earningsQualityFetch'
import EarningsQualitySection from '@/components/earnings/EarningsQualitySection'

export default function EarningsPage() {
  const [snapshot, setSnapshot] = useState<EarningsQualitySnapshot>({
    latestDate: null,
    rows: [],
    eventsInDay: 0,
    availableDates: [],
  })
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const fetchData = useCallback(async (date?: string) => {
    setLoading(true)
    const snap = await fetchEarningsQualitySnapshot(date)
    setSnapshot(snap)
    setSelectedDate(date ?? snap.latestDate)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])  // eslint-disable-line react-hooks/set-state-in-effect

  const isLatest =
    snapshot.availableDates.length === 0 ||
    selectedDate === snapshot.availableDates[0]

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans, sans-serif)',
            }}
          >
            <span aria-hidden className="mr-2">📊</span>決算品質 (Earnings Quality)
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            当日決算開示銘柄の品質スコア (0-7) — 翌営業日 (D+1) 寄り買い候補
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {snapshot.availableDates.length > 0 && (
            <select
              value={selectedDate ?? snapshot.latestDate ?? ''}
              onChange={e => fetchData(e.target.value)}
              className={`text-xs font-mono px-2 py-1 rounded border cursor-pointer ${
                isLatest
                  ? 'border-gray-200 bg-white text-gray-700'
                  : 'border-amber-400 bg-amber-100 text-amber-800 font-semibold'
              }`}
            >
              {snapshot.availableDates.map(d => (
                <option key={d} value={d}>
                  {d}{d === snapshot.availableDates[0] ? ' (Latest)' : ''}
                </option>
              ))}
            </select>
          )}
          {!isLatest && snapshot.availableDates[0] && (
            <button
              onClick={() => fetchData(snapshot.availableDates[0])}
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
            >
              Back to Latest
            </button>
          )}
          <button
            onClick={() => fetchData(selectedDate ?? undefined)}
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

      {loading && snapshot.rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">Loading...</p>
        </div>
      )}

      {!loading && snapshot.rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">
            Supabase の <code className="font-mono">earnings_quality</code> テーブルにデータがあるか確認してください。
            <br />
            毎営業日 18:23 JST に jquants-scanner から自動 push されます。
          </p>
        </div>
      )}

      {!loading && snapshot.rows.length > 0 && (
        <EarningsQualitySection snapshot={snapshot} />
      )}
    </main>
  )
}
