'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
import RiskRewardPanel from '@/components/journal/RiskRewardPanel'
import ExpectancyBreakdown from '@/components/journal/ExpectancyBreakdown'
import MfeCaptureChart from '@/components/journal/MfeCaptureChart'
import { computeRStats, preferredBasis, rOf, RBasis } from '@/lib/rStats'
import { todayJST } from '@/lib/dates'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

// Positions と Journal は 1 画面に統合（タブなし）。上から「保有中 → 成績 → 確定トレード」。
// 旧 Risk タブは廃止。risk_settings は口座資金・リスク % の既定値置き場として使う
// （株数計算・総建玉 % 表示）。consec_losses は決済モーダルが引き続き更新する。

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-title font-medium mb-3 text-[var(--text-primary)]">{children}</h2>
  )
}

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [riskSettings, setRiskSettings] = useState<Pick<RiskSettings, 'account_capital' | 'max_positions'> | null>(null)
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
        .select('account_capital, max_positions')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    // risk_settings は表示補助なので失敗してもバナーは出さない（% 表示が円表示に落ちるだけ）
    if (!riskRes.error) setRiskSettings(riskRes.data ?? null)
    const errors: string[] = []
    if (tradesRes.error) errors.push(`trades: ${tradesRes.error}`)
    else setTrades(tradesRes.rows)
    // 取得失敗時は直前の表示内容を保持し、バナーで不完全さを明示する
    setError(errors.length > 0 ? errors.join(' / ') : null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggleReview = useCallback((tradeId: number) => {
    setExpandedReview(prev => prev === tradeId ? null : tradeId)
  }, [])

  // 散布図の点 → 該当トレードの振り返りを開いてスクロール
  const openReview = useCallback((tradeId: number) => {
    setExpandedReview(tradeId)
    requestAnimationFrame(() => {
      document.getElementById(`trade-${tradeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const handleSectionSaved = useCallback(async () => {
    await fetchAll()
    setExpandedReview(null)
  }, [fetchAll])

  const openPositions = trades.filter(t => t.status === 'open')
  const closedTrades = trades.filter(t => t.status === 'closed')
  // R の基準（損切り / ATR）。未選択なら件数の多いほうを表示
  const [basisChoice, setBasisChoice] = useState<RBasis | null>(null)
  const basis = basisChoice ?? preferredBasis(trades)
  const basisCounts = {
    stop: closedTrades.filter(t => rOf(t, 'stop') != null).length,
    atr: closedTrades.filter(t => rOf(t, 'atr') != null).length,
  }
  const rStats = useMemo(() => computeRStats(trades, todayJST(), basis), [trades, basis])

  return (
    <main className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <PageHeader
        title="Trading"
        subtitle="21 Cloud — ポジション・トレード記録・分析"
        onRefresh={fetchAll}
        refreshing={loading}
      >
        <button
          onClick={() => setShowNewTrade(true)}
          className="px-4 py-1.5 rounded-lg text-small font-medium text-white bg-[var(--sem-focus-fg)] hover:brightness-110 transition-colors min-h-[36px]"
        >
          ＋ 新規トレード
        </button>
      </PageHeader>

      {error && <ErrorBanner detail={error} onRetry={fetchAll} />}

      {/* Loading (初回のみ全面表示。再取得中は既存表示を維持し、ヘッダーの Refresh が回る) */}
      {loading && trades.length === 0 && (
        <div className="text-center py-16 text-[var(--text-muted)] text-small">読み込み中…</div>
      )}

      {/* Positions（保有中）→ Journal（成績・確定トレード） */}
      {!(loading && trades.length === 0) && (
        <>
          <section className="mb-8">
            <SectionHeading>Positions</SectionHeading>
            <PositionsTab
              positions={openPositions}
              allTrades={trades}
              capital={riskSettings?.account_capital ?? null}
              maxPositions={riskSettings?.max_positions ?? null}
              onRefresh={fetchAll}
            />
          </section>

          <section>
            <SectionHeading>Journal</SectionHeading>
            <RiskRewardPanel stats={rStats} onBasisChange={setBasisChoice} counts={basisCounts} />
            <ExpectancyBreakdown trades={trades} basis={basis} />
            <MfeCaptureChart trades={closedTrades} basis={basis} onSelect={openReview} />
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
          </section>
        </>
      )}

      {/* New trade modal (統合: エントリー + 任意のリスク/イグジット) */}
      <PositionModal
        open={showNewTrade}
        onClose={() => setShowNewTrade(false)}
        onSaved={fetchAll}
        slowdown={rStats.slowdown.active}
        onSettingsSaved={fetchAll}
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
