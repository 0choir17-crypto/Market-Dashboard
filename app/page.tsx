'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MarketConditions } from '@/types/market'
import { useDate } from '@/contexts/DateContext'
import BreadthPanel from '@/components/market/BreadthPanel'
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
        <div className="mb-6 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      {/* ローディング */}
      {loading && !market && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      )}

      {/* データなし */}
      {!loading && !market && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">
            {isLatest
              ? 'Supabase の market_conditions テーブルにデータを挿入してください。'
              : `${selectedDate} のマーケットデータはありません。`}
          </p>
          {error && (
            <p className="text-xs mt-3 text-red-600 break-all">
              Supabase error: {error}
            </p>
          )}
        </div>
      )}

      {market && (
        /* Market Breadth をダッシュボードのメインとして大きく表示 */
        <BreadthPanel market={market} />
      )}

      {/* Sectors-33 タブを統合: Market Breadth の下にセクターチャートを配置。
          市況 (Breadth) → どのセクターか、の順で 1 ページで読めるようにする。 */}
      <div className="mt-10">
        <SectorSection />
      </div>

    </main>
  )
}
