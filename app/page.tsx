'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MarketConditions } from '@/types/market'
import { useDate } from '@/contexts/DateContext'
import IndexStateCards from '@/components/market/IndexStateCards'
import SectorStateCards from '@/components/market/SectorStateCards'
import SectorSection from '@/components/sectors33/SectorSection'
import PageHeader from '@/components/shared/PageHeader'

export default function Page() {
  const { selectedDate, isLatest } = useDate()
  const [market, setMarket] = useState<MarketConditions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 業種の詳細（チャート・表・RRG）は開いたときだけ描画・取得する
  const [sectorDetailOpen, setSectorDetailOpen] = useState(false)
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

      {/* 最初に Market Regime（3 指数の EMA9 / 21 判定 + Market Breadth）を置く。
          TOPIX チャートと従来の Breadth 4 枚は各カードの詳細（クリック）に移した */}
      <div className="mb-6">
        <IndexStateCards market={market} />
      </div>

      {/* 業種は 33 枚あるので一番下に置き、ごちゃつきを防ぐ */}
      <div className="mt-10">
        <SectorStateCards />
      </div>

      {/* 旧 Sector Selection（チャート一覧 / 表 / RRG）。普段は畳んでおく */}
      <details
        className="mt-6 group"
        onToggle={(e) => setSectorDetailOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 text-small font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <span className="text-caption text-[var(--text-muted)] group-open:rotate-90 transition-transform inline-block">
            ▶
          </span>
          Sector Details（チャート・表・RRG）
          <span className="text-caption font-normal text-[var(--text-muted)]">
            — 常に最新日を表示（日付ピッカーには連動しない）
          </span>
        </summary>
        {sectorDetailOpen && (
          <div className="mt-4">
            <SectorSection showHeading={false} />
          </div>
        )}
      </details>

    </main>
  )
}
