'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchLatestLeaders,
  fetchConsecutiveTop10,
  fetchSectorRotation,
  type ConsecutiveLeader,
  type SectorRotation,
  type LeadersSnapshot,
} from '@/lib/marketLeadersFetch'
import { supabase } from '@/lib/supabase'
import LeadersTable from '@/components/leaders/LeadersTable'
import SectorConcentration from '@/components/leaders/SectorConcentration'
import ConsecutiveLeaders from '@/components/leaders/ConsecutiveLeaders'
import SectorRotationHeatmap from '@/components/leaders/SectorRotationHeatmap'
import NewEntries from '@/components/leaders/NewEntries'
import LeaderHistoryChart from '@/components/leaders/LeaderHistoryChart'

type Tab = 'consecutive' | 'rotation' | 'newcomer' | 'history'

const CONSECUTIVE_DAYS = 30

export default function LeadersPage() {
  const [snapshot, setSnapshot] = useState<LeadersSnapshot>({ latestDate: null, prevDate: null, rows: [] })
  const [prevCodes, setPrevCodes] = useState<Set<string>>(new Set())
  const [consecutive, setConsecutive] = useState<ConsecutiveLeader[]>([])
  const [rotation, setRotation] = useState<SectorRotation>({ weeks: [], sectors: [], cells: new Map() })

  const [loading, setLoading] = useState(true)
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null)

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('consecutive')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  // メインデータ (View A + 前営業日コード集合)
  const loadMain = useCallback(async () => {
    setLoading(true)
    const snap = await fetchLatestLeaders()
    setSnapshot(snap)

    // 前営業日に top50 に居た銘柄コードを取得 (View E)
    if (snap.prevDate) {
      const { data } = await supabase
        .from('market_leaders')
        .select('code')
        .eq('date', snap.prevDate)
      setPrevCodes(new Set((data ?? []).map(d => d.code as string)))
    } else {
      setPrevCodes(new Set())
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadMain() }, [loadMain])  // eslint-disable-line react-hooks/set-state-in-effect

  // タブ初回表示時に lazy load (setTimeout で setState を effect 本体直書きから外す)
  useEffect(() => {
    const needConsecutive = tab === 'consecutive' && consecutive.length === 0 && !loadingTab
    const needRotation = tab === 'rotation' && rotation.weeks.length === 0 && !loadingTab
    if (!needConsecutive && !needRotation) return
    const t = setTimeout(() => {
      if (needConsecutive) {
        setLoadingTab('consecutive')
        fetchConsecutiveTop10(CONSECUTIVE_DAYS, 30).then(r => {
          setConsecutive(r)
          setLoadingTab(null)
        })
      } else if (needRotation) {
        setLoadingTab('rotation')
        fetchSectorRotation(6).then(r => {
          setRotation(r)
          setLoadingTab(null)
        })
      }
    }, 0)
    return () => clearTimeout(t)
  }, [tab, consecutive.length, rotation.weeks.length, loadingTab])

  const selectedConame = useMemo(() => {
    const r = snapshot.rows.find(x => x.code === selectedCode)
    return r?.coname ?? null
  }, [snapshot.rows, selectedCode])

  const handleSelectCode = useCallback((code: string) => {
    setSelectedCode(code)
    setTab('history')
  }, [])

  function refreshAll() {
    setConsecutive([])
    setRotation({ weeks: [], sectors: [], cells: new Map() })
    loadMain()
  }

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            Market Leaders (Top 50)
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            東証クロスセクション top 50 銘柄 — 資金フロー観測 (cs_avg = 全銘柄横断パーセンタイル)
          </p>
        </div>
        <div className="flex items-center gap-4">
          {snapshot.latestDate && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Updated: {snapshot.latestDate}
            </span>
          )}
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="検索: 銘柄コード / 銘柄名"
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white w-56 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            onClick={refreshAll}
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
            Supabase の <code className="font-mono">market_leaders</code> テーブルにデータがあるか確認してください。
            <br />
            毎営業日 18:23 JST に jquants-scanner から自動 push されます。
          </p>
        </div>
      ) : !loading && (
        <>
          {/* View B: セクター集中度 (常時表示・テーブルの上) */}
          <SectorConcentration rows={snapshot.rows} />

          {/* View A: Top 50 テーブル */}
          <div className="mt-6">
            <LeadersTable rows={snapshot.rows} query={query} onSelectCode={handleSelectCode} />
          </div>

          {/* タブ切替: C / D / E / F */}
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between mb-3 gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">追加ビュー</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  連続入賞・ローテーション・新顔・個別銘柄の足跡を切替表示
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                {([
                  { v: 'consecutive' as const, label: 'C. 連続入賞' },
                  { v: 'rotation' as const,    label: 'D. ローテーション' },
                  { v: 'newcomer' as const,    label: 'E. 新顔' },
                  { v: 'history' as const,     label: 'F. 銘柄足跡' },
                ]).map((opt, i) => (
                  <button
                    key={opt.v}
                    onClick={() => setTab(opt.v)}
                    className={`px-3 py-1.5 font-medium ${
                      tab === opt.v
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-white text-[var(--text-secondary)] hover:bg-gray-50'
                    } ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'consecutive' && (
              <ConsecutiveLeaders
                rows={consecutive}
                windowDays={CONSECUTIVE_DAYS}
                loading={loadingTab === 'consecutive'}
                onSelectCode={handleSelectCode}
              />
            )}
            {tab === 'rotation' && (
              <SectorRotationHeatmap rotation={rotation} loading={loadingTab === 'rotation'} />
            )}
            {tab === 'newcomer' && (
              <NewEntries
                todayRows={snapshot.rows}
                prevCodes={prevCodes}
                prevDate={snapshot.prevDate}
                onSelectCode={handleSelectCode}
              />
            )}
            {tab === 'history' && (
              <LeaderHistoryChart
                code={selectedCode}
                coname={selectedConame}
                onClose={() => setSelectedCode(null)}
              />
            )}
          </section>
        </>
      )}
    </main>
  )
}
