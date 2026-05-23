'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchLatestSectorSelection } from '@/lib/sectorSelectionFetch'
import {
  fetchSectorSelectionHistory,
  type SectorHistoryResponse,
} from '@/lib/sectorSelectionHistoryFetch'
import { SectorSelectionRow } from '@/types/sectorSelection'
import SectorSelectionTable from '@/components/sectors33/SectorSelectionTable'
import SectorRRG33 from '@/components/sectors33/SectorRRG33'
import SectorHeatmap33 from '@/components/sectors33/SectorHeatmap33'
import SectorSparklineGrid33 from '@/components/sectors33/SectorSparklineGrid33'

type View = 'rrg' | 'heatmap' | 'sparkline'

export default function SectorSelectionPage() {
  const [rows, setRows] = useState<SectorSelectionRow[]>([])
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [history, setHistory] = useState<SectorHistoryResponse>({
    dates: [],
    bySector: {},
    sectorsRanked: [],
  })
  const [view, setView] = useState<View>('rrg')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [latest, hist] = await Promise.all([
      fetchLatestSectorSelection(),
      fetchSectorSelectionHistory(21),
    ])
    setRows(latest.rows)
    setLatestDate(latest.latestDate)
    setHistory(hist)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>

      <header className="flex justify-between items-center mb-6">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            Sector Selection
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            21 Cloud — TOPIX-33 業種別 composite_score (今どこを買うか)
          </p>
        </div>
        <div className="flex items-center gap-4">
          {latestDate && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Updated: {latestDate}
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

      {loading && rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">Loading...</p>
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">Supabase の sector_selection_s33 テーブルにデータを挿入してください。</p>
        </div>
      ) : !loading && (
        <>
          <SectorSelectionTable rows={rows} />

          {/* ── 21営業日推移ビジュアル ─────────────────────────────────── */}
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between mb-3 gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  21営業日の推移
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  どのセクターが強いか・どう動いているかを 3 つの視点で比較
                  {history.dates.length > 0 && (
                    <span className="ml-2 text-gray-400 font-mono">
                      ({history.dates[0]} → {history.dates[history.dates.length - 1]})
                    </span>
                  )}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                {(
                  [
                    { v: 'rrg' as const, label: 'RRG' },
                    { v: 'heatmap' as const, label: 'Heatmap' },
                    { v: 'sparkline' as const, label: 'Sparklines' },
                  ]
                ).map((opt, i) => (
                  <button
                    key={opt.v}
                    onClick={() => setView(opt.v)}
                    className={`px-3 py-1.5 font-medium ${
                      view === opt.v
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-white text-[var(--text-secondary)] hover:bg-gray-50'
                    } ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {history.dates.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400 text-sm">
                履歴データを読み込めませんでした
              </div>
            ) : view === 'rrg' ? (
              <SectorRRG33 history={history} />
            ) : view === 'heatmap' ? (
              <SectorHeatmap33 history={history} />
            ) : (
              <SectorSparklineGrid33 history={history} />
            )}
          </section>
        </>
      )}
    </main>
  )
}
