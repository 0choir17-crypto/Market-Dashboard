'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLatestSectorSelection } from '@/lib/sectorSelectionFetch'
import {
  fetchSectorSelectionHistory,
  type SectorHistoryResponse,
} from '@/lib/sectorSelectionHistoryFetch'
import { SectorSelectionRow } from '@/types/sectorSelection'
import SectorSelectionTable from '@/components/sectors33/SectorSelectionTable'
import SectorRRG33 from '@/components/sectors33/SectorRRG33'
import SectorBarChart33 from '@/components/sectors33/SectorBarChart33'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

type View = 'bar' | 'rrg'

export default function SectorSelectionPage() {
  const [rows, setRows] = useState<SectorSelectionRow[]>([])
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [history, setHistory] = useState<SectorHistoryResponse>({
    dates: [],
    bySector: {},
    sectorsRanked: [],
  })
  const [view, setView] = useState<View>('bar')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 再取得の高速連打時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const [latest, hist] = await Promise.all([
      fetchLatestSectorSelection(),
      fetchSectorSelectionHistory(63),
    ])
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setRows(latest.rows)
    setLatestDate(latest.latestDate)
    setHistory(hist)
    // ランキング本体と履歴、どちらの失敗も「0件」と区別して表示する
    setError([latest.error, hist.error].filter(Boolean).join(' / ') || null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>

      <PageHeader
        title="Sector Selection"
        subtitle="TOPIX-33 業種別 composite_score（今どこを買うか）"
        date={latestDate}
        onRefresh={fetchData}
        refreshing={loading}
      />

      {error && <ErrorBanner detail={error} onRetry={fetchData} />}

      {loading && rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
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
      ) : rows.length > 0 && (
        <>
          <SectorSelectionTable rows={rows} />

          {/* ── 21営業日推移ビジュアル ─────────────────────────────────── */}
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between mb-3 gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {history.dates.length}営業日の推移
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  どのセクターが強いか・どう動いているかを比較
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
                    { v: 'bar' as const, label: 'Bars' },
                    { v: 'rrg' as const, label: 'RRG' },
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
            ) : view === 'bar' ? (
              <SectorBarChart33 history={history} />
            ) : (
              <SectorRRG33 history={history} />
            )}
          </section>
        </>
      )}
    </main>
  )
}
