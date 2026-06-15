'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchStage2Fresh, type Stage2FreshSnapshot } from '@/lib/stage2FreshFetch'
import Stage2FreshTable from '@/components/stage2/Stage2FreshTable'

export default function Stage2Page() {
  const [snapshot, setSnapshot] = useState<Stage2FreshSnapshot>({
    latestDate: null,
    rows: [],
    availableDates: [],
  })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const load = useCallback(async (date?: string) => {
    setLoading(true)
    const snap = await fetchStage2Fresh(date)
    setSnapshot(snap)
    setSelectedDate(date ?? snap.latestDate)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])  // eslint-disable-line react-hooks/set-state-in-effect

  const latestAvailable = snapshot.availableDates[0] ?? snapshot.latestDate ?? null
  const isLatest =
    snapshot.availableDates.length === 0 || selectedDate === snapshot.availableDates[0]

  const momentumCount = snapshot.rows.filter(r => r.momentum_flag).length

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            Stage 2 Fresh — 押し目買い候補
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            強い銘柄 (RS≥60 / ADR≥3%) が 150日線上向きトレンドに入って間もない (≤3週) 押し目・流動的 (代金≥5億) スクリーン — 週次・金曜引け後更新
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {snapshot.availableDates.length > 0 && (
            <select
              value={selectedDate ?? snapshot.latestDate ?? ''}
              onChange={e => load(e.target.value)}
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
          {!isLatest && latestAvailable && (
            <button
              onClick={() => load(latestAvailable)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
            >
              Back to Latest
            </button>
          )}
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="検索: 銘柄コード / 銘柄名"
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white w-56 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            onClick={() => load(selectedDate ?? undefined)}
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

      {/* 候補スクリーンであり売買シグナルではない旨を明示 */}
      <div className="mb-4 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs sm:text-sm flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <span>
          これは<strong>押し目買い候補スクリーン</strong>であり、売買シグナルではありません。実エントリー（押し安値→ピボットブレイク→3段階ストップ→利確）の判断は別途行ってください。
        </span>
      </div>

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

      {!loading && snapshot.rows.length === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">
            Supabase の <code className="font-mono">stage2_fresh</code> テーブルにデータがあるか確認してください。
            <br />
            jquants-scanner から週次 (金曜引け後) に自動 push されます。
          </p>
        </div>
      ) : !loading && (
        <>
          {snapshot.latestDate && (
            <div className="mb-3 flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>
                基準日 <span className="font-mono font-semibold">{snapshot.latestDate}</span>
              </span>
              <span className="text-gray-300">|</span>
              <span>{snapshot.rows.length} 候補</span>
              {momentumCount > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>瞬発 (momentum) {momentumCount} 件</span>
                </>
              )}
            </div>
          )}
          <Stage2FreshTable rows={snapshot.rows} query={query} />
        </>
      )}
    </main>
  )
}
