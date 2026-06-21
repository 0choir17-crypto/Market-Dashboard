'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import PullbackSetupsSection from '@/components/today/PullbackSetupsSection'

export default function TodayPage() {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TodayResponse>({
    coilDate: null,
    coil: [],
    maDate: null,
    ma: [],
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

  const displayDate = data.coilDate ?? data.maDate ?? selectedDate
  const total = data.coil.length + data.ma.length

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            <span aria-hidden className="mr-2">📋</span>Daily Watch — 押し目ウォッチ
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            高値圏の押し目"候補"（収縮ベース + momentum 押し目）{total} 件 ／ 買いシグナルではありません
          </p>
        </div>
        <div className="flex items-center gap-4">
          {displayDate && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
          {displayDate && displayDate !== selectedDate && (
            <span className="ml-2 font-normal text-amber-700">
              （押し目テーブルは {displayDate} の最近値にフォールバック）
            </span>
          )}
        </div>
      )}

      {loading && total === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">Loading...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <PullbackSetupsSection
            kind="coil"
            rows={data.coil}
            hotSectors={data.hotSectors}
            title="Coil — 高値圏の静かなベース（収縮）"
            subtitle="高値圏で値幅が収縮（iqr5 小）した銘柄。ブレイク前の蓄積。小さいほどタイト。"
          />
          <PullbackSetupsSection
            kind="ma"
            rows={data.ma}
            hotSectors={data.hotSectors}
            title="MA — 高値圏 momentum の押し目"
            subtitle="走行中の強い銘柄が移動平均まで押した局面。バッジ＝深さ(MA)×位置(52週高値)。A(50)×A++ が最上位。"
          />
        </div>
      )}
    </main>
  )
}
