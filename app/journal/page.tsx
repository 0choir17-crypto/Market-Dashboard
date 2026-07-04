'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import { Trade } from '@/types/trades'
import { RiskSettings } from '@/types/portfolio'
import JournalStats from '@/components/journal/JournalStats'
import EquityCurveChart from '@/components/journal/EquityCurveChart'
import PeriodPerformance from '@/components/journal/PeriodPerformance'
import ReasonPerformance from '@/components/journal/ReasonPerformance'
import TagPerformance from '@/components/journal/TagPerformance'
import TradeList, { ExpandedReview } from '@/components/journal/TradeList'
import CloseTradeModal from '@/components/journal/CloseTradeModal'
import EditTradeModal from '@/components/journal/EditTradeModal'
import PositionModal from '@/components/portfolio/PositionModal'
import PositionsTab from '@/components/portfolio/PositionsTab'
import RiskTab from '@/components/portfolio/RiskTab'
import ErrorBanner from '@/components/shared/ErrorBanner'

type Tab = 'positions' | 'journal' | 'risk'

const TABS: { key: Tab; label: string }[] = [
  { key: 'positions', label: 'Positions' },
  { key: 'journal',   label: 'Journal' },
  { key: 'risk',      label: 'Risk' },
]

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<Tab>('positions')
  const [trades, setTrades] = useState<Trade[]>([])
  const [riskSettings, setRiskSettings] = useState<RiskSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewTrade, setShowNewTrade] = useState(false)
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null)
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)
  const [expandedReview, setExpandedReview] = useState<ExpandedReview>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    // trades は全件取得（旧 .limit(500) はアクティブなトレーダーの統計を黙って切り捨てる）
    const [tradesRes, riskRes] = await Promise.all([
      fetchAllPaged<Trade>((from, to) =>
        supabase
          .from('trades')
          .select('*')
          .order('entry_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      supabase
        .from('risk_settings')
        .select('*')
        .limit(1)
        .maybeSingle(),
    ])
    const errors: string[] = []
    if (tradesRes.error) errors.push(`trades: ${tradesRes.error}`)
    else setTrades(tradesRes.rows)
    if (riskRes.error) errors.push(`risk_settings: ${riskRes.error.message}`)
    else setRiskSettings((riskRes.data ?? null) as RiskSettings | null)
    // 取得失敗時は直前の表示内容を保持し、バナーで不完全さを明示する
    setError(errors.length > 0 ? errors.join(' / ') : null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggleReview = useCallback((tradeId: number) => {
    setExpandedReview(prev => prev === tradeId ? null : tradeId)
  }, [])

  const handleSectionSaved = useCallback(async () => {
    await fetchAll()
    setExpandedReview(null)
  }, [fetchAll])

  const openPositions = trades.filter(t => t.status === 'open')
  const closedTrades = trades.filter(t => t.status === 'closed')

  return (
    <main className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Trading
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            21 Cloud — ポジション・トレード記録・分析・リスク管理
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-white hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowNewTrade(true)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            + New Trade
          </button>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="overflow-x-auto whitespace-nowrap mb-6 -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="inline-flex gap-1 bg-white rounded-xl border border-[#e8eaed] shadow-sm p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 min-w-fit text-sm font-semibold rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner detail={error} onRetry={fetchAll} />}

      {/* Loading (初回のみ全面表示。再取得中は既存表示を維持し、ヘッダーの Refresh が回る) */}
      {loading && trades.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      )}

      {/* Tab content */}
      {!(loading && trades.length === 0) && (
        <>
          {activeTab === 'positions' && (
            <PositionsTab positions={openPositions} onRefresh={fetchAll} />
          )}

          {activeTab === 'journal' && (
            <>
              <JournalStats trades={trades} />
              <EquityCurveChart trades={trades} />
              <PeriodPerformance trades={trades} />
              <ReasonPerformance trades={trades} />
              <TagPerformance trades={trades} />
              <TradeList
                trades={closedTrades}
                onClose={(trade) => setClosingTrade(trade)}
                onEdit={(trade) => setEditingTrade(trade)}
                expandedReview={expandedReview}
                onToggleReview={toggleReview}
                onSectionSaved={handleSectionSaved}
                onSectionCancel={() => setExpandedReview(null)}
                sections={['closed']}
              />
            </>
          )}

          {activeTab === 'risk' && (
            <RiskTab
              riskSettings={riskSettings}
              history={closedTrades}
              onRefresh={fetchAll}
            />
          )}
        </>
      )}

      {/* New trade modal (統合: エントリー + 任意のリスク/イグジット) */}
      <PositionModal
        open={showNewTrade}
        onClose={() => setShowNewTrade(false)}
        onSaved={fetchAll}
      />

      {/* Close trade modal */}
      <CloseTradeModal
        open={closingTrade !== null}
        onClose={() => setClosingTrade(null)}
        onSaved={fetchAll}
        trade={closingTrade}
      />

      {/* Edit trade modal */}
      <EditTradeModal
        open={editingTrade !== null}
        onClose={() => setEditingTrade(null)}
        onSaved={fetchAll}
        trade={editingTrade}
      />
    </main>
  )
}
