'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAllPaged } from '@/lib/pagedFetch'
import { Trade } from '@/types/trades'
import { RiskSettings } from '@/types/portfolio'
import EquityCurveChart from '@/components/journal/EquityCurveChart'
import EditTradeModal from '@/components/journal/EditTradeModal'
import PositionModal from '@/components/portfolio/PositionModal'
import PositionsTab from '@/components/portfolio/PositionsTab'
import JournalSummary, { RBasisToggle, RDistribution } from '@/components/journal/JournalSummary'
import ExpectancyBreakdown from '@/components/journal/ExpectancyBreakdown'
import MfeCaptureChart from '@/components/journal/MfeCaptureChart'
import ClosedTradesTable from '@/components/journal/ClosedTradesTable'
import { computeRStats, preferredBasis, rOf, RBasis } from '@/lib/rStats'
import { todayJST } from '@/lib/dates'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

// Trading = 上から「保有中 → 成績（カード 1 行）→ 分析（タブで 1 つずつ）→ 決済済み一覧」。
// R は ATR 基準が標準。損切り基準は切り替えで残す（損切り価格を記録したトレードだけ）。
// risk_settings は口座資金などの既定値置き場（株数計算・総建玉 % 表示）。

type AnalysisTab = 'equity' | 'dist' | 'breakdown' | 'mfe'
const ANALYSIS_TABS: { key: AnalysisTab; label: string }[] = [
  { key: 'equity', label: '資産曲線' },
  { key: 'dist', label: '分布' },
  { key: 'breakdown', label: '切り口別' },
  { key: 'mfe', label: '取り逃し' },
]

function SectionHeading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 className="text-title font-medium text-[var(--text-primary)]">{children}</h2>
      {right}
    </div>
  )
}

export default function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [riskSettings, setRiskSettings] = useState<Pick<RiskSettings, 'account_capital' | 'max_positions'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewTrade, setShowNewTrade] = useState(false)
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)
  const [tab, setTab] = useState<AnalysisTab>('equity')
  const [focus, setFocus] = useState<{ id: number; n: number } | null>(null)

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

  // 散布図の点 → 一覧の該当行を開く
  const openTrade = useCallback((tradeId: number) => {
    setFocus(prev => ({ id: tradeId, n: (prev?.n ?? 0) + 1 }))
  }, [])

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
      <PageHeader
        title="Trading"
        subtitle="保有中・成績・振り返り"
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

      {loading && trades.length === 0 && (
        <div className="text-center py-16 text-[var(--text-muted)] text-small">読み込み中…</div>
      )}

      {!(loading && trades.length === 0) && (
        <div className="space-y-8">
          <section>
            <SectionHeading>保有中</SectionHeading>
            <PositionsTab
              positions={openPositions}
              allTrades={trades}
              capital={riskSettings?.account_capital ?? null}
              maxPositions={riskSettings?.max_positions ?? null}
              onRefresh={fetchAll}
            />
          </section>

          <section>
            <SectionHeading right={<RBasisToggle basis={basis} onChange={setBasisChoice} counts={basisCounts} />}>
              成績
            </SectionHeading>
            <JournalSummary stats={rStats} />

            <div className="flex gap-1 border-b border-[var(--border)] mb-3" role="tablist">
              {ANALYSIS_TABS.map(t => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-small -mb-px border-b-2 transition-colors ${
                    tab === t.key
                      ? 'border-[var(--sem-focus-fg)] text-[var(--text-primary)] font-medium'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'equity' && <EquityCurveChart trades={trades} />}
            {tab === 'dist' && <RDistribution stats={rStats} />}
            {tab === 'breakdown' && <ExpectancyBreakdown trades={trades} basis={basis} />}
            {tab === 'mfe' && <MfeCaptureChart trades={closedTrades} basis={basis} onSelect={openTrade} />}
          </section>

          <section>
            <ClosedTradesTable
              trades={closedTrades}
              basis={basis}
              onEdit={setEditingTrade}
              focus={focus}
            />
          </section>
        </div>
      )}

      <PositionModal
        open={showNewTrade}
        onClose={() => setShowNewTrade(false)}
        onSaved={fetchAll}
        slowdown={rStats.slowdown.active}
        onSettingsSaved={fetchAll}
      />

      <EditTradeModal
        open={editingTrade !== null}
        onClose={() => setEditingTrade(null)}
        onSaved={fetchAll}
        trade={editingTrade}
      />
    </main>
  )
}
