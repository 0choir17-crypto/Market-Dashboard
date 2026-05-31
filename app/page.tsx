'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { MarketConditions } from '@/types/market'
import { useDate } from '@/contexts/DateContext'
import EntryGateCard from '@/components/market/EntryGateCard'
import IndexCard from '@/components/market/IndexCard'
import BreadthPanel from '@/components/market/BreadthPanel'

export default function Page() {
  const { selectedDate, isLatest } = useDate()
  const [market, setMarket] = useState<MarketConditions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
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
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            Market Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            日本株マーケットコンディション
          </p>
        </div>
        <div className="flex items-center gap-4">
          {(market?.date || selectedDate) && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isLatest ? 'Updated' : 'Snapshot'}: {market?.date ?? selectedDate}
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

      {/* 過去日バナー */}
      {!isLatest && selectedDate && (
        <div className="mb-6 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      {/* ローディング */}
      {loading && !market && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="text-lg font-medium">Loading...</p>
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
        <>
          {/* ② Entry Gate カード（左） / 指数カード（右） */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-6 mb-8 items-stretch">
            {/* 左: Entry Gate（旧 MC v4 スコアカードの位置） */}
            <EntryGateCard market={market} />
            {/* 右: 指数カード縦3枚 */}
            <div className="flex flex-col gap-4 h-full">
              <IndexCard label="Nikkei 225"  prefix="nikkei" data={market} className="flex-1" />
              <IndexCard label="TOPIX"       prefix="topix"  data={market} className="flex-1" />
              <IndexCard label="Growth 250"  prefix="growth" data={market} className="flex-1" />
            </div>
          </div>

          {/* ③ Market Breadth */}
          <BreadthPanel market={market} />
        </>
      )}

    </main>
  )
}
