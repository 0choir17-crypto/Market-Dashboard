'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MarketConditions } from '@/types/market'
import { useDate } from '@/contexts/DateContext'
import BreadthPanel from '@/components/market/BreadthPanel'
import TopixChart from '@/components/market/TopixChart'
import SectorSection from '@/components/sectors33/SectorSection'
import PageHeader from '@/components/shared/PageHeader'

export default function Page() {
  const { selectedDate, isLatest } = useDate()
  const [market, setMarket] = useState<MarketConditions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 日付の高速切替時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    const latestMode = isLatest || !selectedDate

    // MC v4 は廃止。最新行の選択は単純に直近 date の 1 行を使う。
    // 過去日モードは selectedDate の行をそのまま取得。
    const query = latestMode
      ? supabase
          .from('market_conditions')
          .select('*')
          .order('date', { ascending: false })
          .limit(1)
      : supabase
          .from('market_conditions')
          .select('*')
          .eq('date', selectedDate)
          .limit(1)

    const { data, error: err } = await query.maybeSingle()
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄

    if (err) {
      console.error('[market_conditions]', err)
      setError(err.message)
    }
    setMarket(data ?? null)
    setLoading(false)
  }, [selectedDate, isLatest])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* ヘッダー */}
      <PageHeader
        title="Market Dashboard"
        subtitle="日本株マーケットコンディション"
        date={market?.date ?? selectedDate}
        isLatest={isLatest}
        onRefresh={fetchData}
        refreshing={loading}
      />

      {/* 過去日バナー */}
      {!isLatest && selectedDate && (
        <div className="mb-6 px-4 py-2 rounded-lg bg-[var(--sem-watch-bg)] border border-[var(--sem-watch-bd)] text-[var(--sem-watch-fg)] text-small font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      {/* ローディング */}
      {loading && !market && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="text-title font-medium">読み込み中…</p>
        </div>
      )}

      {/* データなし */}
      {!loading && !market && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="text-title font-medium mb-2">データが見つかりません</p>
          <p className="text-small">
            {isLatest
              ? 'Supabase の market_conditions テーブルにデータを挿入してください。'
              : `${selectedDate} のマーケットデータはありません。`}
          </p>
          {error && (
            <p className="text-caption mt-3 text-[var(--negative)] break-all">
              Supabase error: {error}
            </p>
          )}
        </div>
      )}

      {market && (
        /* 指数そのもの (TOPIX ローソク足 + 市場出来高) を最初に置く */
        <div className="mb-6">
          <TopixChart market={market} />
        </div>
      )}

      {/* Sectors-33 タブを統合。まず「どのセクターか」を見せ、
          市場全体の内部状態 (Market Breadth) はその下で確認する。 */}
      <SectorSection />

      {market && (
        /* Market Breadth は Sector Selection の下に大きく表示 */
        <div className="mt-10">
          <BreadthPanel market={market} />
        </div>
      )}

    </main>
  )
}
