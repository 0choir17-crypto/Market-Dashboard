'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchLeadersSnapshot,
  fetchSectorRotation,
  type SectorRotation,
  type LeadersSnapshot,
} from '@/lib/marketLeadersFetch'
import LeadersTable from '@/components/leaders/LeadersTable'
import SectorConcentration from '@/components/leaders/SectorConcentration'
import SectorRotationHeatmap from '@/components/leaders/SectorRotationHeatmap'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

export default function LeadersPage() {
  const [snapshot, setSnapshot] = useState<LeadersSnapshot>({
    latestDate: null,
    prevDate: null,
    rows: [],
    hitsMap: new Map(),
    availableDates: [],
  })
  const [rotation, setRotation] = useState<SectorRotation>({ weeks: [], sectors: [], cells: new Map() })
  const [loading, setLoading] = useState(true)
  const [rotationLoading, setRotationLoading] = useState(true)

  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 日付の高速切替時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const loadSnapshot = useCallback(async (date?: string) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const snap = await fetchLeadersSnapshot(date)
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setSnapshot(snap)
    setSelectedDate(date ?? snap.latestDate)
    setLoading(false)
  }, [])

  useEffect(() => { loadSnapshot() }, [loadSnapshot])  // eslint-disable-line react-hooks/set-state-in-effect

  // セクターローテーション (D) は表示対象日に依存しない (常に直近 6 ヶ月)
  // 初期 rotationLoading は true で立ち上がるので、effect 本体での setState は不要
  useEffect(() => {
    fetchSectorRotation(6).then(r => {
      setRotation(r)
      setRotationLoading(false)
    })
  }, [])

  const latestAvailable = snapshot.availableDates[0] ?? snapshot.latestDate ?? null
  const isLatest =
    snapshot.availableDates.length === 0 || selectedDate === snapshot.availableDates[0]

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Market Leaders (Top 50)"
        subtitle="東証クロスセクション top 50 銘柄 — 資金フロー観測。cs_avg=確立度 / 初動(emerging_cs)=加速度の2軸"
        onRefresh={() => loadSnapshot(selectedDate ?? undefined)}
        refreshing={loading}
      >
        {snapshot.availableDates.length > 0 && (
          <select
            value={selectedDate ?? snapshot.latestDate ?? ''}
            onChange={e => loadSnapshot(e.target.value)}
            className={`text-xs font-mono px-2 py-1 rounded border cursor-pointer ${
              isLatest
                ? 'border-gray-200 bg-white text-gray-700'
                : 'border-amber-400 bg-amber-100 text-amber-800 font-semibold'
            }`}
          >
            {snapshot.availableDates.map(d => (
              <option key={d} value={d}>
                {d}{d === snapshot.availableDates[0] ? '（最新）' : ''}
              </option>
            ))}
          </select>
        )}
        {!isLatest && latestAvailable && (
          <button
            onClick={() => loadSnapshot(latestAvailable)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
          >
            最新に戻る
          </button>
        )}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="検索: 銘柄コード / 銘柄名"
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white w-56 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </PageHeader>

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      {(snapshot.error || rotation.error) && (
        <ErrorBanner detail={[snapshot.error, rotation.error].filter(Boolean).join(' / ')} />
      )}

      {loading && snapshot.rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      )}

      {!loading && snapshot.rows.length === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">
            Supabase の <code className="font-mono">market_leaders</code> テーブルにデータがあるか確認してください。
            <br />
            毎営業日 18:23 JST に jquants-scanner から自動 push されます。
          </p>
        </div>
      ) : snapshot.rows.length > 0 && (
        <>
          {/* View B: セクター集中度 */}
          <SectorConcentration rows={snapshot.rows} />

          {/* View A: Top 50 テーブル (ヒット数 / 連続列 込み) */}
          <div className="mt-6">
            <LeadersTable rows={snapshot.rows} hitsMap={snapshot.hitsMap} query={query} />
          </div>

          {/* View D: セクターローテーション (常時表示) */}
          <div className="mt-8">
            <SectorRotationHeatmap rotation={rotation} loading={rotationLoading} />
          </div>
        </>
      )}
    </main>
  )
}
